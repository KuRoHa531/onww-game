/**
 * カルメン（マイクラ版 CARMEN を参考）: 村人陣営。
 *   ・夜に自分以外のプレイヤー1人を選んで「囁く」。囁く相手は、囁いた「時点」の相手のカード（陣営）で決まる。
 *       - 村人陣営の人に囁くと: その人は待機時間に「カルメンに囁かれた」ことだけが分かる（従者がいる演出と同じ作り。2of4）。
 *         その人が夜能力の役職なら夜能力を昼に1回使える／昼能力の役職なら昼能力を昼に2回使える（3of4）。
 *         酔っ払いのときは、酔いが覚めてから「囁かれた」演出が入る。夜能力があれば昼に2回使える（3of4・4of4）。
 *       - 村人陣営以外（人狼陣営・第三陣営）の人に囁くと: 待機時間に、その人の画面でカルメンの人のカードが「カルメン」としてめくれる（2of4）。
 *       - 同じ人に複数の演出があるときは、ほかの演出のカードが裏に戻ってから、スターなどと同じタイミングでめくれる（2of4）。
 *   ・カルメン自身が酔っ払っていて、酔いが覚めてから使った（昼）ときは、その時点で相手に囁きの演出が出る（2of4）。
 *   ・墓荒らし・ドッペルゲンガー・酔い覚めで手にしたカルメンは、朝のうち／昼の議論中に1回使える（morning.run）。
 *   ・マイクラ版との違いはない（囁く相手の判定は「使われた時点」）。ただしWeb版は夜の能力を段階（NIGHT_STAGES）ごとに処理するので、
 *     相手が怪盗・墓荒らし・ドッペルゲンガー（自分の能力で役職が変わる役職）のときは、その相手の段階が終わってから判定する
 *     （マイクラ版 shouldDelayCarmenWhisper / resolvePendingCarmenWhispersFor と同じ。stageEnd フック）。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_カルメン_*of4.txt、詳細は docs/carmen.md）:
 *   1of4: 登録・夜の選択・囁きの記録と判定（村人陣営か／それ以外か）・怪盗/墓荒らし/ドッペルが相手のときの保留・CPUの夜・朝のうち/酔い覚めの連鎖【済】
 *   2of4: 待機時間の演出（村人陣営＝「囁かれた」バナー／それ以外＝カルメンのカードがめくれる／演出の重なり／昼に使ったときの即時演出／酔っ払い）
 *   3of4: 昼に使える能力（夜能力を昼に1回・昼能力を昼に2回・酔っ払いは夜能力が昼に2回）
 *   4of4: CPU(本物は正直にCO・人外は騙り)・COボタン(coResult)・実績(achievements)・wiki/docs・総合確認【済】
 *
 * 【状態】（試合ごとに net.startGame が空に戻す・ホスト引き継ぎ AUTH_KEYS に含む）
 *   g.carmenTarget[カルメンを持つ人のID] = 囁いた相手のID … 役職についていく（ROLE_BOUND_KEYS。state.js の【必読】メモ）
 *   g.carmenVillage[囁かれた人のID]  = 囁いた人のID … 村人陣営として囁かれた人（同じ人は1回だけ。マイクラ版 carmenVillageWhisperedTargets）
 *   g.carmenOutsider[囁かれた人のID] = 囁いた人のID … 村人陣営以外として囁かれた人（同じ人は1回だけ。マイクラ版 carmenOutsiderWhisperedTargets）
 *   g.carmenFx = [{ target, by, kind: "village"|"outsider", when: "night"|"morning"|"day", told }] … 演出の予定（使った順。2of4が使う）
 *   g.carmenSettle[囁かれた人のID] = { logs, banner, cards } … 待機時間に送る内容（2of4。再入室でも消えない）
 *   g.carmenNight[人のID] = 夜能力を昼に使える追加回数の残り（3of4）/ g.carmenNightOpen[人のID] = 昼のはじめに連鎖を開けた（再入室で戻す）
 *   g.carmenPending[カルメンを使った人のID] = { target, stage } … 相手が自分の能力で役職が変わる役職のとき、その段階が終わるまで保留
 * 【夜の段階】night.kind "seer"・night.order 12（占い師=10・指読み=11 のあと。役職変動系ではない「役職変動系以外の役職」。docs/role-process-order.md）。
 * 【勝敗の優先度】村人陣営のまま（docs/victory-priority.md の行の追加は不要）。重複役職の優先度（docs/overlay-role-priority.md）も特別扱いなし。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.CARMEN;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 相手が自分の能力で役職が変わる役職 → その段階（NIGHT_STAGES の名前）。マイクラ版 shouldDelayCarmenWhisper の ROBBER / RELIC_ROBBER / DOPPELGANGER */
  const PENDING_STAGE = () => ({ [ONW.ROLE.RELIC_ROBBER]: "relic", [ONW.ROLE.DOPPELGANGER]: "doppel", [ONW.ROLE.ROBBER]: "robber" });
  /** 囁く時点の相手のカード（最終盤面の途中経過 g.currentRoles）の陣営。村人陣営なら true */
  function isVillageNow(g, id) {
    const info = ONW.roles.getInfo((g.currentRoles || {})[id]) || {};
    return info.team === ONW.TEAM.VILLAGE;
  }
  /** 囁きを記録する（相手の陣営は「この呼び出しの時点」で決める）。
   *  when: "night"（夜の段階）/ "morning"（墓荒らし・ドッペルが朝のうちに使った）/ "day"（酔いが覚めて昼に使った）
   *  戻り値: { kind: "village"|"outsider", dup } （dup = 同じ人にもう囁いていて、新しい演出・効果は付かない） */
  function apply(g, holder, target, when) {
    if (!holder || !target || holder === target) return null;
    if (!g.players.some((q) => q.id === holder) || !g.players.some((q) => q.id === target)) return null;
    ONW.setRoleBound(g, "carmenTarget", holder, target);
    const village = isVillageNow(g, target), kind = village ? "village" : "outsider";
    const book = village ? (g.carmenVillage = g.carmenVillage || {}) : (g.carmenOutsider = g.carmenOutsider || {});
    if (book[target]) return { kind, dup: true };   // 同じ人に2回目: 新しい演出も効果も付かない（マイクラ版と同じ）
    book[target] = holder;
    (g.carmenFx = g.carmenFx || []).push({ target, by: holder, kind, src: srcOf(g, holder), when: when || "night", told: false });   // src = 囁いた時点の名乗り（carmen / harmony=調和開拓者）。役職が動いたあとでも演出の名乗りは変わらない
    return { kind, dup: false };
  }
  /** 夜に使った囁き: 相手が自分の能力で役職が変わる役職なら、その段階が終わるまで保留して、終わったときの役職で判定する */
  function whisperNight(g, holder, target) {
    if (!holder || !target || holder === target) return null;
    const stage = PENDING_STAGE()[(g.currentRoles || {})[target]];
    ONW.setRoleBound(g, "carmenTarget", holder, target);   // 「誰に囁いたか」は保留中も記録しておく（CPUの発言・夜ログ用）
    if (stage) { (g.carmenPending = g.carmenPending || {})[holder] = { target, stage }; return { pending: true }; }
    return apply(g, holder, target, "night");
  }
  /** 段階が終わったとき、その段階の相手に保留していた囁きを判定する（stageEnd）。kind = NIGHT_STAGES の名前。stage を省略すると保留中のものを全部判定する（待機時間の安全網） */
  function resolvePending(g, kind) {
    const P = g.carmenPending || {};
    Object.keys(P).forEach((h) => {
      if (kind && P[h].stage !== kind) return;
      const t = P[h].target; delete P[h];
      apply(g, h, t, "night");
    });
  }
  /** 本人への文（夜の結果・朝のうち・情報確認）。マイクラ版 openCarmenAction の「あなたは〇〇へ囁きました。」 */
  const lineOf = (name) => `${name} へ囁きました。`;
  /** この人が囁いた相手（使った人についている記録。役職が動いても、使った本人の記録として残す必要はないので役職についていく側を読む） */
  const targetOf = (g, holderId) => ONW.getRoleBound(g, "carmenTarget", holderId) || null;
  /** 囁かれた人（村人陣営として／それ以外として）か */
  const whisperedBy = (g, id) => ({ village: (g.carmenVillage || {})[id] || null, outsider: (g.carmenOutsider || {})[id] || null });

  // ---- 演出（2of4）----
  /** 村人陣営として囁かれた人への文（誰が囁いたかは出さない。従者通知と同じ作り） */
  const NOTICE_TEXT = "あなたはカルメンに囁かれました。";
  /** 囁いた人の「名乗り」: カルメンのカードの人は「カルメン」、運命が調和の開拓者は「調和開拓者」（マイクラ版 night.js carmenWhisperSourceName）。囁いた時点で決めて g.carmenFx[].src に持つ */
  const srcName = (src) => (src === "harmony" ? "調和開拓者" : "カルメン");
  const srcOf = (g, holder) => ((g.currentRoles || {})[holder] === ONW.ROLE.TRAILBLAZER ? "harmony" : "carmen");
  /** 村人陣営として囁かれた人への文 */
  const noticeText = (src) => `あなたは${srcName(src)}に囁かれました。`;
  /** 村人陣営以外として囁かれた人への文（囁いた人のカードがめくれる。調和開拓者のときは開拓者のカードが運命「調和」の枠付きでめくれる） */
  const outsiderText = (g, by, src) => `${srcName(src)}の ${nm(g, by)} に囁かれました。`;
  /** 囁いた人のカードの演出用: 調和開拓者なら 開拓者のカード＋運命の枠("fate:harmony")、カルメンなら カルメンのカード */
  const cardOf = (src) => (src === "harmony" ? { role: "trailblazer", fate: "fate:harmony" } : { role: R_(), fate: null });
  const playerOf = (g, id) => g.players.find((q) => q.id === id);
  /** 配る相手: 酔いが覚めていて、まだ知らされていない（told でない）人。CPUは知らされた扱いにして（発言は4of4）送らない */
  function pendingFx(g, when) {
    return (g.carmenFx || []).filter((f) => !f.told && (when === "day" ? true : f.when !== "day") && !ONW.hiddenDrunk(g, f.target) && playerOf(g, f.target));
  }
  /** 待機時間に出す内容を作る（朝のうち／夜に使った分。酔っ払いの相手は酔いが覚めてから＝昼に出す）。何度呼んでも同じ（知らせた記録 told で重複を防ぐ） */
  function buildSettle(c) {
    const g = c.g, set = (g.carmenSettle = g.carmenSettle || {});
    pendingFx(g, "settle").forEach((f) => {
      f.told = true;
      const tp = playerOf(g, f.target);
      if (tp.isCpu) return;
      const e = (set[f.target] = set[f.target] || { logs: [], banner: false, cards: [] });
      if (f.kind === "village") { e.logs.push(noticeText(f.src)); e.banner = f.src === "harmony" ? noticeText(f.src) : (e.banner || true); }   // 通常のカルメンは true（従来どおり）/ 調和開拓者のときだけ文を渡す
      else { e.logs.push(outsiderText(g, f.by, f.src)); if (!e.cards.some((x) => x.id === f.by)) e.cards.push({ id: f.by, ...(f.src === "harmony" ? { role: "trailblazer", mimic: "fate:harmony" } : {}) }); }
      c.hold(f.target, e.logs[e.logs.length - 1]);   // 再入室したときは、朝のログとして同じ内容が戻る
    });
  }
  /** 昼に新しく出る囁き（昼に酔いが覚めたカルメンが使った・酔いが覚めた相手・昼に役職が動いた）: その場で相手に知らせる。 */
  function deliverDay(c) {
    const g = c.g;
    if (g.phase !== ONW.PHASE.ONLINE_DAY) return;
    pendingFx(g, "day").forEach((f) => {
      if (c.isDead(f.target)) return;
      f.told = true;
      const tp = playerOf(g, f.target);
      if (tp.isCpu) return;
      if (f.kind === "village") { const nt = noticeText(f.src); c.hold(f.target, nt); c.send(f.target, { t: "carmenday", text: nt }); }
      else { const text = outsiderText(g, f.by, f.src), cd = cardOf(f.src); c.hold(f.target, text); c.send(f.target, { t: "jobday", id: f.by, text, role: cd.role, ...(cd.fate ? { mimic: cd.fate } : {}) }); }   // カルメンの人のカードが「カルメン」でめくれる（jobday = 就職先に届く演出と同じ作り）
    });
  }
  // ---- 昼に使える能力（3of4）----
  /** 昼能力を昼に使える回数: ふつう1回。村人陣営としてカルメンに囁かれた人は2回（人ごとの記録なので、役職が動いても、墓荒らし・ドッペル・酔い覚め経由でも同じ） */
  const dayUses = (g, id) => 1 + ((g && g.carmenVillage && g.carmenVillage[id]) ? 1 : 0);
  /** 夜能力の役職（昼に酔い覚め・墓荒らしと同じ「朝の連鎖」で使える役職）なら、その役職。そうでなければ null */
  function nightRole(g, id) {
    const fa = ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
    return fa && ONW.roleIsActive(fa) && !(ONW.roleDef(fa) || {}).noDayChain ? fa : null;
  }
  /** 村人陣営として囁かれた夜能力の人に、夜能力を昼にもう1回使えるようにする（g.carmenNight[id] = 残りの追加回数）。付けるのは1人1回だけ。
   *  酔っ払い中は付けない（酔いが覚めたとき daySober で付く。酔い覚めの1回＋この1回で、昼に合計2回）。CPUは昼に夜能力を使わないので付けない。
   *  まだ使える「朝の連鎖」が残っていないときは、ここで新しく開けて本人へ知らせる（carmenact） */
  function grantNight(c, id) {
    const g = c.g;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || !g.carmenVillage || !g.carmenVillage[id]) return;
    g.carmenNight = g.carmenNight || {};
    if (g.carmenNight[id] !== undefined) return;
    const p = playerOf(g, id), ar = nightRole(g, id);
    if (!p || p.isCpu || !ar || ONW.hiddenDrunk(g, id) || c.isDead(id)) return;
    g.carmenNight[id] = 1;
    g.morningAct = g.morningAct || {}; g.morningDone = g.morningDone || {};
    if (g.morningAct[id] && !g.morningDone[id]) return;   // 酔い覚めなどの使える連鎖がすでに開いている: その後に1回ぶん追加（nextNight）
    g.carmenNight[id] = 0; g.morningAct[id] = ar; g.morningDone[id] = false;
    c.send(id, { t: "carmenact", role: ONW.shownRole(g.currentRoles[id]), chain: ar, draw: ONW.roleDef(ar) && ONW.roleDef(ar).chainDraw ? ONW.roleDef(ar).chainDraw(c, id) : null });
    g.carmenNightOpen = g.carmenNightOpen || {}; g.carmenNightOpen[id] = true;
  }
  /** 昼に夜能力を1回使い終えたとき、追加の1回が残っていれば、もう一度開けてその役職を返す（なければ null）。net.js の mchain が呼ぶ */
  function nextNight(g, id) {
    if (!g.carmenNight || !(g.carmenNight[id] > 0) || !(g.morningDone || {})[id]) return null;
    const ar = nightRole(g, id);
    if (!ar) return null;
    g.carmenNight[id]--; g.morningAct[id] = ar; g.morningDone[id] = false;
    return ar;
  }
  // ---- CPU・COボタン・実績（4of4）----
  const coText = (name) => `${name} に囁いていました。`;
  const claimOf = (k, g, t) => ({ short: `${nm(g, t)} に囁いた`, text: coText(nm(g, t)), claim: { kind: "carmen", target: t } });
  function cpuClaim(k, g, p, r, i, c) {
    if (!i || !i.carmenTarget) return false;
    c.co = "carmen"; c.result = claimOf(k, g, i.carmenTarget);
  }
  function lieClaim(k, g, p, others, selfRole, co) {
    const t = k.fakeSeerTarget(g, p);
    return { co, result: claimOf(k, g, t.id) };
  }
  /** 実績（マイクラ版 stats.js・wiki のカルメンの4つのうち、この試合の結果だけで決まる3つ。Web版にはまだ実績を保存する仕組みが無いので「この試合で id が満たした実績ID」を返すだけ）:
   *  win_carmen = 最終役職がカルメンで勝利 / carmen_loss = 最終役職がカルメンで敗北 / carmen_outsider_whisper_loss = 最終役職がカルメンで、村人陣営以外に囁いて敗北。
   *  first_carmen（初めてカルメンになる）は履歴の判定（保存側）なのでここでは返さない。 */
  function achievements(g, id, won) {
    const out = [];
    // carmen_outsider_whisper_loss は初期/最終のどちらかがカルメンなら対象（マイクラ版準拠）
    const mine = Object.keys(g.carmenOutsider || {}).some((t) => g.carmenOutsider[t] === id);
    if (!won && mine && ((g.initialRoles || {})[id] === R_() || (g.currentRoles || {})[id] === R_())) out.push("carmen_outsider_whisper_loss");
    if ((g.currentRoles || {})[id] !== R_()) return out;
    out.push(won ? "win_carmen" : "carmen_loss");
    return out;
  }
  ONW.carmen = { coText, claimOf, achievements, dayUses, nightRole, grantNight, nextNight, NOTICE_TEXT, noticeText, srcName, srcOf, outsiderText, buildSettle, deliverDay, apply, whisperNight, resolvePending, isVillageNow, lineOf, targetOf, whisperedBy, PENDING_STAGE };

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選んで囁く（デバッグの能力先指定があればその人） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id), others = g.players.filter((q) => q.id !== p.id);
    if (!others.length) return;
    const t = (f.players || []).find((id) => n.validPlayer(p, id)) || (f.player && n.validPlayer(p, f.player) ? f.player : null) || ONW.utils.shuffle(others)[0].id;
    whisperNight(g, p.id, t);
    if (!cur) { i.mode = "carmen"; i.target = t; }
    i.carmenTarget = t;   // 4of4: 発言（「〇〇に囁いていました」）が使う
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, t)} へ囁きました。`);
    n.hold(p.id, lineOf(nm(g, t)));
    n.ob(p.id, [t]);
    n.nn(rid);
  }

  ONW.defineRole("carmen", {
    info: { observe: "player", sealTarget: true, deck: 114, name: "カルメン", team: ONW.TEAM.VILLAGE, wakeOrder: 74, sort: 16.97,
      desc: "村人陣営。夜にプレイヤー1人へ囁きます。囁いた時点で対象が村人陣営なら、対象は待機時間に「カルメンに囁かれた」ことだけが分かり、夜能力の役職なら夜能力を昼にもう1回、昼能力の役職なら昼能力を昼にもう1回使えるようになります（誰が囁いたかは分かりません）。対象が村人陣営以外なら、待機時間にカルメンの人のカードが「カルメン」としてめくれ、対象にカルメンが誰か知られてしまいます。" },
    groups: { "transform:light_apostle": 52 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 50）で決まる（番号は所属を表すだけ）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>囁きたい人</strong>のカードを1人分押してください。（自分以外）<br>囁いた時点で相手が村人陣営なら、相手は「囁かれた」ことが分かり、もう1回能力を使えます。村人陣営以外なら、相手にあなたがカルメンだと知られてしまいます。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>囁きたい人</strong>のカードを押して（自分以外）",
    },
    stagePick: { players: 1 },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分以外）
    cpuNight: { order: 12, stage: "seer", chain: true, run: cpuRun },   // 占い師(10)・指読み(11)のあと。chain: 墓荒らし・ドッペル・酔い覚めで手にしたCPUは朝のうちに使う
    // ---- CPU・COボタン・実績（4of4。マイクラ版 cpu.js: 「〇〇に囁いていました。」） ----
    /** 本当のカルメンのCPU: 夜（朝のうち）に囁いた相手を正直にCOする。囁いていなければ通常の扱い */
    cpuClaim: cpuClaim,
    /** 騙り: カルメンを名乗る人外は、適当な相手に「囁いていました」と言う */
    cpuLie: { role: "carmen", weight: 6, order: 20, claim: lieClaim },
    /** 墓荒らし・ドッペルゲンガーでカルメンを手にしたCPUが、続けて言う結果: 朝のうちに囁いた相手 */
    cpuChainResult(k, g, p, i) { return i.carmenTarget ? claimOf(k, g, i.carmenTarget) : null; },
    /** 結果開示(COボタン・co.js が kind で引く): 囁いた相手を選ぶ → 「〇〇 に囁いていました。」 */
    coResult: {
      kind: "carmen", targetLabel: "囁いた相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "carmen", target: id }, null, "disclose", `${K.nameOf(id)} に囁いた`],
    },
    night: {
      kind: "seer", order: 12,   // 占い師(10)・指読み(11)のあと（役職変動系以外の役職。docs/role-process-order.md）。相手の役職は「いまのカード」で判定する
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, t = c.selOf(p).players.find((x) => x && x !== p.id);
        if (!t) return;
        whisperNight(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${c.nameOf(t)} へ囁きました。`);
        c.hold(p.id, lineOf(c.nameOf(t)));
        ONW.observeNote(g, p.id, [t], null, c.eff(p));
        ONW.newsNote(g, c.eff(p));
      },
    },
    /** 段階が終わったとき: 相手が怪盗・墓荒らし・ドッペルゲンガーで保留していた囁きを、その段階が終わったあとのカードで判定する */
    stageEnd: { order: 5, run(c, kind) { resolvePending(c.g, kind); } },
    /** 待機時間のはじめの安全網: 保留が残っていたら（相手の段階が実行されなかったときなど）いまのカードで判定する */
    settlePre: { order: 0.5, run(c) { resolvePending(c.g, null); } },
    /** 待機時間の演出（2of4）。村人陣営として囁かれた人 → 「あなたはカルメンに囁かれました」のバナー（従者がいる演出と同じ作り・誰が囁いたかは出さない）。
     *  村人陣営以外として囁かれた人 → その人の画面で、カルメンの人のカードが「カルメン」としてめくれる。
     *  酔っ払いの相手は酔いが覚めてから（daySober）。最終盤面ではなく「囁いた時点」で決まった記録（g.carmenFx）で出すので、どの経由でも同じ。 */
    settleMsg: { order: 28, run(c, p, mode) {
      if (mode !== "settle") return {};   // 再入室(resync)のときは、朝のログ(hold)として戻るのでここでは出さない
      buildSettle(c);
      const e = (c.g.carmenSettle || {})[p.id];
      return e ? { logs: e.logs.slice(), ...(e.banner ? { carmenBanner: e.banner } : {}), ...(e.cards.length ? { carmen: e.cards.map((x) => ({ id: x.id, ...(x.role ? { role: x.role, mimic: x.mimic } : {}) })) } : {}) } : {};
    } },
    stageSettle: {
      field: "settleCarmen", shown: "settleCarmenShown",
      run: { order: 39, run(items, SK) {
        // ほかの演出（スター・訪問者など）で自分の画面のカードが表になっている間は、裏に戻るまで待ってから、カルメンの人のカードをめくる
        let tries = 0;
        const go = () => {
          if (items.some((it) => SK.up[`p:${it.id}`] !== undefined) && tries++ < 25) { SK.later(go, 300); return; }
          items.forEach((it, i) => SK.later(() => { if (it.mimic) { const gg = SK.G(); gg.mimicView = gg.mimicView || {}; gg.mimicView[`p:${it.id}`] = it.mimic; } SK.show(`p:${it.id}`, it.role || "carmen", true); SK.paint(SK.G()); }, i * 380));   // 調和開拓者: 開拓者のカードが運命「調和」の枠付きでめくれる
        };
        SK.later(go, 900);
      } },
    },
    /** 昼のうちに新しく出る囁き（昼に使った・酔いが覚めた・役職が動いた）を、その場で相手に知らせる */
    dayCheck(c) { deliverDay(c); Object.keys(c.g.carmenVillage || {}).forEach((id) => grantNight(c, id)); },
    daySober(c) { deliverDay(c); Object.keys(c.g.carmenVillage || {}).forEach((id) => grantNight(c, id)); },
    /** 昼のはじめ: 村人陣営として囁かれた夜能力の人（酔っ払いでない人）に、夜能力を昼に使えるようにする（3of4） */
    dayStart(c) { Object.keys(c.g.carmenVillage || {}).forEach((id) => grantNight(c, id)); },
    /** 墓荒らし・ドッペルゲンガーでカルメンを手にしたとき（朝のうち）・酔いが覚めたとき（昼の議論中）の能力（net.js の mchain が呼ぶ）。
     *  その時点のカードで相手の陣営を判定する（朝のうち＝夜の判定が終わったあとの最終盤面・昼＝いまのカード） */
    morning: {
      run(c) {
        const g = c.g, id = c.id, t = (c.players || []).find((x) => x && x !== id);
        if (!t) return null;   // 選び直し（足りない間は確定しない）
        const day = g.phase === ONW.PHASE.ONLINE_DAY;
        apply(g, id, t, day ? "day" : "morning");
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} へ囁きました。`);
        return { lines: [lineOf(c.nameOf(t))], reveal: null, nextChain: null };
      },
    },
  });
})(window.ONW);
