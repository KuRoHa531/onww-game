/**
 * 封印の狂人（マイクラ版 SEAL_MADMAN を参考）: 人狼陣営の「狂人系」（人狼が誰かは分からない）。
 * 夜の最初に自分以外の1人を選び、その人の能力（夜・昼の能力や通知）を封印する。封印された人は、夜の能力が失敗する（効果の側は 1of4b〜 で順に実装）。
 *
 * 【処理順】（docs/role-process-order.md）: エルフリンデ → 封印の狂人 → 役職変動系以外の役職 → …
 *   夜の段階 "seal" を NIGHT_STAGES の先頭に作り、封印の狂人は人間もCPUも、ここで最初に動く（人間→CPUの順で段階を進めるので、
 *   占い師の段階の先頭に置くだけだと、CPUの封印の狂人が人間の占い師より後になって封印をすり抜けてしまうため）。
 *   エルフリンデを入れるときは、同じ "seal" 段階の night.order 0 に置くこと（封印の狂人は order 1）。
 *
 * 【封印の決まり方】Web版は「選ぶ時間」と「処理時間」が分かれているので、同じ段階の中で誰が先に動いたかは関係ない（マイクラ版の「実際に行動した順」は使わない）。
 *   順番が関わるのは、墓荒らし・ドッペルゲンガー・酔っ払い経由で朝や昼に手にしたときだけ（その場で封印する。実際に使った順）。
 *   夜の封印は、段階の終わりにまとめて次の規則で決める（ONW.seal.settle）:
 *     ・封印の狂人を封印しようとしている人が優先（A→B(封印の狂人)→C占い師 は、Aの封印が先: Bは封印されて失敗し、Cは動ける）
 *     ・封印の狂人どうしが互いに封印しあう（A⇔B）ときは、ランダムな方が優先
 *     ・封印された封印の狂人は、封印に失敗する（その人の選んだ相手は封印されない）
 *   同じ人を複数の封印の狂人が選んだら、最初に封印した人が封印元になる（効果は1つ）。
 *
 * 【状態】
 *   g.sealIntent[持ち主ID]   = 夜に選んだ相手（段階の終わりに決着するまでの控え）
 *   g.sealedBy[封印された席]  = 封印した人の席（封印中の席の目印。席についている。役職カードが動いても封印は席に残る）
 *   g.sealTargets[持ち主ID]   = 封印に成功した相手（役職の持ち主ごとの記録。ONW.ROLE_BOUND_KEYS = カードについていく。「〇〇を封印しました」のCO用）
 *   g.sealFails[持ち主ID]     = 封印されていて失敗した封印の狂人
 * 実装の進み具合は _wip/依頼文_封印の狂人_*.txt を参照。
 *  1of4a: 登録・夜の選択・封印の決着(優先の規則)・CPUの夜の行動・朝の連鎖・ルールコード ONW54・ロビー/ガイド/デバッグ・闇鍋シナジー
 *  1of4b: 封印された人の夜の能力の失敗(人間・CPU・朝の連鎖。ONW.seal.failIfSealed を net.js resolveNight / mchain と cpu.js runNight が呼ぶ)・失敗の通知・封印の通知(settleMsg)
 *  2of4〜3of4: 昼の能力・自動効果の封印 / 演出・情報確認・観戦・COボタン
 *  4of4: CPUの発言(封印されたCPUは「封印されていました。」/ 騙りのCPUも言うことがある)・CPUの投票(封印の狂人CO・封印の申告の真偽・封印の狂人CPUの仲間読み)・ガイド・docs【済】
 */
(function (ONW) {
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const R_ = () => ONW.ROLE.SEAL_MADMAN;
  const has = (g, id) => !!id && g.players.some((q) => q.id === id);
  /** 夜ログの名乗り（模倣の人狼が封印の狂人を模倣しているときは「模倣の人狼」） */
  const cardOf = (g, h) => (g.currentRoles || g.initialRoles || {})[h];   // いまのカード（夜の最初の段階では配役直後と同じ。朝・昼は動いたあと）
  const labelOf = (g, h) => (ONW.mimic && ONW.mimic.isMimic(g, h, cardOf(g, h)) ? ONW.ROLE_INFO.mimic_wolf.name : ONW.ROLE_INFO.seal_madman.name);
  /** 夜ログ・新聞・観測に残す役職（模倣の人狼が使ったときは「模倣の人狼」） */
  const roleOfNews = (g, h) => (ONW.mimic && ONW.mimic.isMimic(g, h, cardOf(g, h)) ? ONW.ROLE.MIMIC_WOLF : R_());

  const FAIL_TEXT = "あなたは封印の狂人に能力を封印されていたため失敗しました。";
  const sealLine = (g, t) => `${nm(g, t)} を封印しました。`;

  // ---- 封印の状態（席ごと） ----
  /** 封印している人の席（封印されていなければ null） */
  const of = (g, id) => ((g && g.sealedBy) || {})[id] || null;
  /** その席がいま封印されているか */
  const is = (g, id) => !!of(g, id);
  /** 封印されている席すべて */
  const sealedIds = (g) => g.players.filter((p) => is(g, p.id)).map((p) => p.id);
  /** 夜に選んだ相手を控える（段階の終わりの settle で決着する） */
  function intend(g, holder, target) {
    (g.sealIntent = g.sealIntent || {})[holder] = target;
  }
  /** 封印を確定する（封印された席に目印を付ける）。すでに封印されている相手には、最初の封印元を残す。戻り値: 新しく封印された席なら true */
  function commit(g, holder, target) {
    g.sealedBy = g.sealedBy || {};
    ONW.setRoleBound(g, "sealTargets", holder, target);
    if (g.sealedBy[target]) return false;
    g.sealedBy[target] = holder;
    return true;
  }
  /** 朝・昼にその場で封印する（墓荒らし・ドッペルゲンガー・酔い覚めで手にした封印の狂人）。io = { hold(id, text) }。
   *  戻り値: "ok" | "failed"（自分が封印されていて失敗）。呼ぶ側は新聞・観測の記録を、成功のときだけ行う */
  function apply(g, holder, target, io) {
    const label = labelOf(g, holder), hold = (io && io.hold) || (() => {});
    if (is(g, holder)) {
      (g.sealFails = g.sealFails || {})[holder] = true;
      (g.nightLogsAll = g.nightLogsAll || []).push(`${label} ${nm(g, holder)} は 封印されていたため能力に失敗しました。`);
      hold(holder, FAIL_TEXT);
      return "failed";
    }
    commit(g, holder, target);
    (g.nightLogsAll = g.nightLogsAll || []).push(`${label} ${nm(g, holder)} は ${nm(g, target)} を封印した`);
    hold(holder, sealLine(g, target));
    return "ok";
  }
  /** 夜の封印の決着（"seal" 段階の終わりに1回）。人間もCPUも、夜に選んだ相手(g.sealIntent)をここでまとめて決める。
   *  優先の規則: 他の封印の狂人から封印されようとしていない人を先に処理する（A→B→C のAが先）。互いに封印しあう輪（A⇔B）しか残らないときはランダム。
   *  封印されている封印の狂人は失敗する。戻り値: 処理した順の [{ holder, target, ok }]（テスト用） */
  function settle(g, io) {
    const intent = g.sealIntent || {}, hold = (io && io.hold) || (() => {}), rnd = (io && io.rnd) || Math.random, rv = io && io.reveal;   // io.reveal(席, reveal): 朝の演出を本人に届ける
    let todo = Object.keys(intent).filter((h) => has(g, h) && has(g, intent[h]) && intent[h] !== h);
    const done = [];
    while (todo.length) {
      let cand = todo.filter((h) => !todo.some((o) => o !== h && intent[o] === h));   // 他の（まだ処理していない）封印の狂人から封印されようとしていない人
      if (!cand.length) cand = todo;                                                 // 輪になっている: ランダムな方が優先
      const h = cand[Math.floor(rnd() * cand.length)];
      todo = todo.filter((x) => x !== h);
      const t = intent[h], label = labelOf(g, h);
      if (is(g, h)) {   // 封印されていて失敗（選んだ相手は封印されない）
        (g.sealFails = g.sealFails || {})[h] = true;
        g.nightLogsAll.push(`${label} ${nm(g, h)} は 封印されていたため能力に失敗しました。`);
        hold(h, FAIL_TEXT);
        if (rv) rv(h, ONW.seal.revealFail(h));   // 3of4d: 封印されて失敗した封印の狂人は、自分のカードにお札が貼られて揺れる（成功した側・動けた側には何も出ない）
        done.push({ holder: h, target: t, ok: false });
        continue;
      }
      commit(g, h, t);
      g.nightLogsAll.push(`${label} ${nm(g, h)} は ${nm(g, t)} を封印した`);
      hold(h, sealLine(g, t));
      if (rv) rv(h, ONW.seal.revealPut(t));       // 3of4d: 封印に成功した封印の狂人は、封印した相手のカードにお札が貼られる
      ONW.newsNote(g, roleOfNews(g, h));          // 新聞・観測は、封印に成功した分だけ
      ONW.observeNote(g, h, [t]);
      done.push({ holder: h, target: t, ok: true });
    }
    return done;
  }
  /** 封印されている席が、夜(朝・昼の酔い覚めを含む)の能力を使おうとしたときの失敗。夜ログと、本人への結果文を残す。
   *  actRole: 使おうとした能力の役職ID（模倣の人狼が使うときは模倣先） / io = { hold(id, text), mimic: 模倣の人狼が使っているか }
   *  封印の狂人自身は、封印の決着(settle)と朝の連鎖(apply)が失敗を扱うので、ここでは false を返す。
   *  戻り値: true = 失敗した（呼ぶ側は、その能力を実行しない） */
  function failIfSealed(g, id, actRole, io) {
    if (!is(g, id) || actRole === R_()) return false;
    const o = io || {}, info = ONW.ROLE_INFO[actRole] || {};
    const label = o.mimic ? ONW.ROLE_INFO.mimic_wolf.name : (info.name || actRole);
    (g.nightLogsAll = g.nightLogsAll || []).push(`${label} ${nm(g, id)} は 封印されていたため能力に失敗しました。`);
    if (o.hold) o.hold(id, FAIL_TEXT);
    return true;
  }
  /** 夜の能力がない役職が封印されたとき、待機時間に出す通知（夜の能力がある役職は、夜の結果として「失敗しました」が出る） */
  const NOTICE_TEXT = "【封印通知】あなたは封印の狂人に能力を封印されました。";
  /** 昼の能力・昼の通知・自動で発動する効果が封印されているか（2of4）。夜の失敗(failIfSealed)と違い、能力の側が「使えない」と判断するための判定 */
  const DAY_TEXT = "あなたは封印の狂人に封印されているため昼能力を使用できません。";
  let dayOff = 0;
  const dayBlocked = (g, id) => !dayOff && is(g, id);
  /** 封印を無視した判定で fn を動かす（昼能力ボタンが「封印されていなければ使えたか」を調べるため） */
  const ignoringSeal = (fn) => { dayOff++; try { return fn(); } finally { dayOff--; } };
  /** 観戦者の「封印」欄（specInfo.seal）: { rows: [{ by, target, fail }], sealed: [封印されている人の名前] }。観戦者は全員の役職が見えるので事実をそのまま出す。
   *  夜ログ(nightLogsAll)の「封印の狂人 A は B を封印した」「…封印されていたため能力に失敗しました。」と同じ内容を、欄にまとめたもの */
  function specLines(g, nm) {
    const rows = [], seen = new Set();
    Object.entries(g.sealTargets || {}).forEach(([by, t]) => { seen.add(by); rows.push({ by: nm(by), target: nm(t), fail: false }); });
    Object.keys(g.sealFails || {}).forEach((by) => { const t = (g.sealIntent || {})[by]; rows.push({ by: nm(by), target: t ? nm(t) : null, fail: true }); });
    return { rows, sealed: (g.players || []).filter((p) => is(g, p.id)).map((p) => p.name) };
  }
  // ---- 演出（3of4）: 朝の演出データ(reveal)と、本人が封印に気づけるかの判定 ----
  /** 封印されたことを本人が知ってよいか（酔っ払い＝まだ覚めていない人は、能力を使って失敗するまで気づけない） */
  const noticeable = (g, id) => is(g, id) && !ONW.hiddenDrunk(g, id);
  /** 封印されて失敗した人の画面: 自分のカードにお札が貼られて揺れる（鍵師の「🔒に弾かれる」の封印版） */
  const revealFail = (id) => ({ kind: "seal", mode: "fail", ids: [id] });
  /** 封印の狂人の画面: 封印した相手のカードにお札が貼られる */
  const revealPut = (ids) => ({ kind: "seal", mode: "put", ids: [].concat(ids) });
  // ---- CPUの発言・投票（4of4。マイクラ版 _cpuCoOnlyMaybeSealResult を参考） ----
  const SEALED_CLAIM = () => ({ short: "封印されていた", text: "封印されていました。", claim: { kind: "sealed" } });
  const FAKE_SEALED_RATE = 0.35;   // 封印されていない人外が「封印されていました。」と騙る確率（封印の狂人が配役にいるときだけ）
  /** 封印されたと言えるCO（夜の能力か保安官・盗賊の昼の能力がある役職。封印されると能力が失敗して結果が出ない） */
  const sealTalkable = (co) => !!co && co !== R_() && (ONW.roleIsActive(co) || co === "sheriff" || co === "thief");
  /** CPUの発言（cpu.js plan から、COが決まったあと・結果の連鎖の前に呼ぶ）。
   *   本当に封印されているCPU（酔っ払いで未覚醒の人は気づけない）: 名乗った役職の結果のかわりに「封印されていました。」と必ず言う（人外の騙りでも同じ）。
   *   封印されていない人外（騙り）: 封印の狂人が配役にいるときだけ、35%で「封印されていました。」と騙る。
   *   結果を言うかわりに申告するので、c.result を置き換える（訪問された申告は本当の情報なので残す）。戻り値: 置き換えたら true */
  function cpuSealResult(k, g, p, r, i, c) {
    if (!sealTalkable(c.co)) return false;
    if (c.result && c.result.claim && c.result.claim.kind === "visited") return false;
    if (!noticeable(g, p.id)) {
      const lying = k.isWolfSide(r) || c.co !== r;
      if (!lying || !k.roleInSetup(g, R_()) || Math.random() >= FAKE_SEALED_RATE) return false;
    }
    c.result = SEALED_CLAIM(); c.extra = null;
    return true;
  }
  const RESULT_KINDS = ["seer", "robber", "relic", "doppel", "troublemaker", "watchdog", "keymaster", "mind"];   // 結果を言う申告（封印されていたら結果は出ないので、封印された人が言えば嘘）
  /** CPUの投票の加点（cpu.js scoreVote が全員の分を足す。p=投票するCPU / q=投票先の候補）。
   *   封印の狂人CO・「〇〇を封印しました」の申告は人狼陣営の申告。自分が本当に封印されていれば、自分を封印したと言う人は本物の封印の狂人、
   *   封印されていないのに自分を封印したと言う人は嘘つき。封印の狂人が配役にいないのに「封印されていました」と言う人も嘘 */
  function cpuVoteSee(k, g, p, q, i, me, wolfSide) {
    if (wolfSide || q.id === p.id) return 0;
    const claims = (g.cpuClaims || []).filter((c) => c.from === q.id);
    const co = (g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co) || null;
    const pSealed = noticeable(g, p.id), known = k.roleInSetup(g, R_());
    let s = 0;
    if (co === R_()) s += known ? 2.0 : 3.0;
    claims.forEach((c) => {
      if (c.kind === "seal_madman") {
        if (c.target === p.id) s += pSealed ? 6 : (ONW.hiddenDrunk(g, p.id) ? 2 : 3);   // 自分が封印されている → 本物 / 封印されていない → 嘘
        else s += known ? 2.0 : 3.0;
      } else if (c.kind === "sealed" && !pSealed && !known) s += 2.5;                    // 封印の狂人がいないのに封印されたと言う
    });
    return s;
  }
  /** 封印の狂人のCPUの投票の加点: 自分以外の封印の狂人CO・自分が封印していない人の「封印されていました」は嘘 = 人外の仲間の騙りなので避ける。
   *  自分が封印した相手が、封印されていないと出ない結果を言っていたら、その人も嘘（人外）なので避ける */
  function cpuVoteScore(k, g, p, q, i, me) {
    if (q.id === p.id) return 0;
    const claims = (g.cpuClaims || []).filter((c) => c.from === q.id);
    const mine = Object.entries(g.sealTargets || {}).some(([by, t]) => by === p.id && t === q.id) && is(g, q.id);
    let s = 0;
    if (claims.some((c) => c.kind === "seal_madman")) s -= 1.5;
    if (claims.some((c) => c.kind === "sealed") && !is(g, q.id)) s -= 1.5;
    if (mine && claims.some((c) => RESULT_KINDS.includes(c.kind))) s -= 2.0;
    return s;
  }
  ONW.seal = { cpuSealResult, cpuVoteSee, cpuVoteScore, SEALED_CLAIM, specLines, noticeable, revealFail, revealPut, of, is, sealedIds, dayBlocked, ignoringSeal, DAY_TEXT, intend, commit, apply, settle, failIfSealed, FAIL_TEXT, NOTICE_TEXT, sealLine, labelOf };

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ）。夜は選んだ相手を控えるだけ（決着は段階の終わり）。朝のうち(墓荒らし・ドッペル・酔い覚め)はその場で封印 ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    i.mode = "seal"; i.target = t.id;
    if (!cur) { ONW.seal.intend(g, p.id, t.id); return; }
    if (ONW.seal.apply(g, p.id, t.id, { hold: n.hold }) === "ok") { n.nn(rid); n.ob(p.id, [t.id]); }
  }

  const uiPick = {
    action(X) {
      const { later, nowSel } = X;
      return `<p class="night-step__hint">上のテーブルから、<strong>能力を封印したい人</strong>のカードを1人分押してください。（自分以外）<br>夜の最初に封印されるので、その人の夜の能力は失敗します。${later}</p>${nowSel("")}`;
    },
    chainReady: (np) => np === 1,
    chainHow: () => "<strong>能力を封印したい人</strong>のカードを押して（自分以外）",
  };

  ONW.defineRole("seal_madman", {
    info: { deck: 76, name: "封印の狂人", team: ONW.TEAM.WOLF, wakeOrder: 0, sort: 1.68,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の最初に自分以外の1人を選び、その人の能力を封印します。封印された人は夜の能力が失敗し、夜の能力のない役職でも能力や通知が封印されます。封印の狂人が封印の狂人を封印すると、封印された方の封印は失敗します（封印の狂人を封印しようとしている人が優先。互いに封印しあうときはランダムな方が優先）。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.95, "transform:dark_avatar": 19 },
    uiNight: uiPick,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 封印した相手を選ぶ →「〇〇を封印しました。」（本人に出る結果文 sealLine と同じ。ONW.ROLE_BOUND_KEYS の sealTargets と同じ内容）
    //   封印されて失敗したときの申告は、COボタンの情報開示「封印されていた」（co.js）で言う
    coResult: {
      kind: "seal_madman", targetLabel: "封印した相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を封印しました。`, { kind: "seal_madman", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    cpuNight: { order: 0, stage: "seal", chain: true, run: cpuRun },
    cpuVoteSee,     // CPUの投票判断（cpu.js scoreVote が全役職のフックを足す）: 封印の狂人CO・封印の申告の真偽
    cpuVoteScore,   // 封印の狂人のCPU本人の投票判断（4of4）   // 夜は "seal" 段階（最初）。chain: 墓荒らし・ドッペル・酔い覚めのあと、朝のうちに使える
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    night: {
      kind: "seal", order: 1,   // 夜の最初の段階（エルフリンデは同じ段階の order 0）。選んだ相手を控えるだけで、決着は段階の終わりの stageEnd
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const t = c.selOf(p).players[0];
        if (!t || t === p.id || !has(c.g, t)) return;
        ONW.seal.intend(c.g, p.id, t);
      },
    },
    // 朝の演出(stage.js の playMorning / morningDur が reveal.kind === "seal" のときに呼ぶ)
    //   mode "fail": 封印されて失敗した人の画面。自分のカードが、お札の面でめくれて左右に揺れる（鍵師のロックの失敗と同じ形のお札版）
    //   mode "put": 封印の狂人本人の画面。封印した相手のカードに、お札が貼られた面でめくれる
    stageMorning: {
      kind: "seal",
      dur: (r) => (r.mode === "fail" ? 1500 : 1400 + Math.max(0, (r.ids || []).length - 1) * 300),
      play(r, SK) {
        (r.ids || []).forEach((id, i) => SK.later(() => {
          const k = `p:${id}`;
          SK.show(k, SK.SEAL_MARK, true);
          if (r.mode === "fail") SK.later(() => SK.shake(k), 650);
        }, i * 300));
      },
    },
    /** 夜の最初の段階が終わったとき（人間もCPUも選び終えた時点）に、封印を決着する */
    stageEnd: { order: 0, run(c, kind) {
      if (kind !== "seal") return;
      const g = c.g;
      const humanOf = (id) => { const q = g.players.find((x) => x.id === id); return !!q && !q.isCpu; };
      ONW.seal.settle(g, { hold: c.hold, reveal: (id, r) => { if (humanOf(id) && (r.mode === "put" || ONW.seal.noticeable(g, id))) (g.morningReveals = g.morningReveals || {})[id] = r; } });   // 演出は人間の本人にだけ
    } },
    /** 待機時間: 封印されている本人にだけ出す。
     *   ・夜の能力がない役職（村人・スターなど）: 封印通知の文章 + 封印マークの演出（sealMark）
     *   ・夜の能力がある役職で、夜に能力を使わなかった人: 失敗の文は夜の結果に出ているので、封印マークの演出（sealMark）だけ（使った人は朝にお札の演出が出ている）
     *   酔っ払い（まだ覚めていない人）は気づけないので、何も出さない。再入室でも同じ内容を返す */
    settleMsg: { order: 5, run(c, p, mode) {
      const g = c.g;
      if (p.isCpu || !ONW.seal.is(g, p.id) || (g.drunkOverlay && g.drunkOverlay[p.id]) || !ONW.seal.noticeable(g, p.id)) return {};
      if (ONW.roleIsActive(ONW.mimic.actRole(g, p.id, g.initialRoles[p.id]))) {
        const rv = (g.morningReveals || {})[p.id];
        return rv && rv.kind === "seal" ? {} : { sealMark: [p.id] };
      }
      return { logs: [ONW.seal.NOTICE_TEXT], sealMark: [p.id] };
    } },
    /** 待機時間の演出: 自分のカードがお札のマークでめくれて揺れる。待機時間にほかの演出が自分のカードに出ているときは、それが終わるのを待ってから（最大2.4秒）。
     *  終わったら元の面に戻す（昼になったら札を外す既存の処理もある） */
    stageSettle: { field: "settleSeal", shown: "settleSealShown", run: { order: 95, run(ids, SK) {
      const k = `p:${ids[0]}`;
      let tries = 0;
      const go = () => {
        if (SK.up[k] !== undefined && tries++ < 8) { SK.later(go, 300); return; }   // ほかの演出がカードを表にしている間は待つ
        const prev = SK.up[k], prevGlow = SK.glow[k];
        SK.show(k, SK.SEAL_MARK, true);
        SK.later(() => SK.shake(k), 650);
        SK.later(() => { if (SK.up[k] !== SK.SEAL_MARK) return; if (prev === undefined) delete SK.up[k]; else SK.up[k] = prev; if (!prevGlow) delete SK.glow[k]; SK.paint(SK.G()); }, 2200);
      };
      SK.later(go, 600);
    } }, end: { order: 95, run(SK) { Object.keys(SK.up).forEach((k) => { if (SK.up[k] === SK.SEAL_MARK) { delete SK.up[k]; delete SK.glow[k]; } }); SK.paint(SK.G()); } } },   // 昼になったら、お札が残っていれば外す
    /** 墓荒らし・ドッペルゲンガーで封印の狂人を手にしたとき: 朝のうちに1人選んで、その場で封印できる（昼に酔いが覚めて手にしたときも同じ） */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        const r = ONW.seal.apply(g, id, t, { hold: () => {} });
        if (r === "failed") return { lines: [ONW.seal.FAIL_TEXT], reveal: ONW.seal.revealFail(id), nextChain: null, failed: true };   // 3of4e: 封印されていて失敗: 自分のカードにお札が貼られて揺れる
        return { lines: [sealLine(g, t)], reveal: ONW.seal.revealPut(t), nextChain: null };                                            // 3of4e: その場で封印: 封印した相手のカードにお札が貼られる
      },
    },
  });
})(window.ONW);
