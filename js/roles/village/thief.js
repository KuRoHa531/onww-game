/**
 * 盗賊（村人陣営・昼能力）: 保安官・交換者に続く「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選ぶと、その人の投票数（票数）を1票ぶん盗む（1日1回）。
 *   マイクラ版（minecraftver.mcpack の main.js / vote.js / game.js の「盗賊」）に合わせる。
 *
 * 【仕様（マイクラ版どおり。ここで言う「票数」は「その人が投票するときの重み」＝ vote.weightOf。交換者のような「得票数」ではない）】
 *   ・夜の能力はない。使えるのは、最終盤面で盗賊を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
 *   ・選べるのは、生きている自分以外の人。
 *   ・盗まれた人の投票数は −1（下限0）、盗賊の投票数は +1。メイヤー(2票〜)から盗めば、メイヤーは1票減る。
 *   ・【0票の人からは盗めず失敗】選んだ相手の「いまの投票数」が0票だと、盗賊の能力は失敗する。失敗しても使用済みになる（もう一度は使えない）。
 *   ・封印の狂人に封印されていると使えない（昼能力ボタンを押すと「使用できません」。ONW.seal.dayBlocked）。
 *   ・使ったことは、本人以外には結果発表まで分からない。【演出は使った瞬間・本人の画面だけ】盗んだ（「盗む」を押してホストが受け付けた）その場で、盗賊本人の画面にだけ、盗賊のカードから棒人間が出てきて投票用紙を盗む演出が出る（2026-10-15 に「結果発表で全員に見せる」案から変更）。結果発表では盗賊の演出は出さない。「昼行動結果」には使ったことだけ書く（成否・0票だったかは書かない）。
 *   ・盗んだあとに盗賊・相手が死亡しても、盗んだ票数はそのまま（マイクラ版は取り消さない）。
 *   ・【増えた票は役職ではなく「人」につく】盗んだ時点で票は盗んだ人（プレイヤー）のものになる。あとから酔っ払いの夜能力などで別の役職になっても、盗んだ分の票は元のまま（盗賊の役職を持っているかどうかは、集計では見ない）。盗まれた分の−も同じく、その人につく。
 *
 * 【今回決めた表示ルール（2of4）】
 *   ・投票数が0票の人も、投票先は結果発表に出る。票数の欄は「(無効)」と出る。
 *   ・0票の人が投票した相手は、シュレディンガーの猫の陣営候補にならない。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（村人陣営の通常勝敗）。重複役職: 特別扱いなし（docs/overlay-role-priority.md に変更なし）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に thief はすでに入っている（cursed_one の次）。wiki の order も 30 で一致。末尾追加は不要。
 * 盗む演出: ONW.thief.play（下）。net.js が本人にだけ送る "thiefdone"（target / ok つき）を受け取った画面から呼ぶ。交換者の演出（exchanger.js の fly / anchorOf / WAAPI・動きを減らす設定）と同じ作り方。
 * 実装の進み具合は docs/thief.md を参照（1of4=役職本体 / 2of4=投票数・集計・(無効)表示・シュレ猫 / 3of4=盗む演出・昼行動結果 / 4of4=CPU・実績・wiki・デバッグ）。
 *
 * 状態: g.thiefSteals = [{ by: 盗賊のID, target: 盗んだ相手のID, ok: 盗めたか(false = 相手が0票で失敗) }, ...]（使った順。試合ごとに net.startGame が [] に戻す）
 * 呼び出し: net.js の hostThief(ホスト) → ONW.thief.canUse / targets / apply。投票数への反映は vote.js の vote.weightOf が ONW.thief.adjust を呼ぶ。
 *   通信: クライアント act "dictopen"(昼能力ボタン) → ホストが canUse なら "thiefok" → カード選択(stage.js mode "steal") → ui.stealConfirm → net.steal → act "steal" → hostThief。
 *         使ったら本人にだけ "thiefdone"（画面を閉じて「使用済み」と、何をしたかを情報確認に載せる）。再入室は resyncMsgs が used なら thiefdone を戻す。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** この人が（もう）使ったか（失敗した分も使用済み） */
  const used = (g, id) => (g.thiefSteals || []).some((e) => e.by === id);
  /** 盗賊の昼能力を使える人か（最終盤面の役職が盗賊・酔いが覚めている・生きている・まだ使っていない・昼の議論中でタイマーが動いている・選べる人がいる） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R().THIEF) return false;   // 模倣の人狼が盗賊を模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** 盗める相手として選べる人（生きている自分以外。0票の人も選べる＝選ぶと失敗して使用済みになる） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => x !== id && !isDead(g, x));
  }
  /** 成功した盗みで、この人が盗んだ票数 */
  const gained = (g, id) => (g.thiefSteals || []).filter((e) => e.ok && e.by === id).length;
  /** 成功した盗みで、この人から盗まれた票数 */
  const lost = (g, id) => (g.thiefSteals || []).filter((e) => e.ok && e.target === id).length;
  /**
   * vote.weightOf から呼ばれる: 元の投票数 w に、盗賊の盗みを反映する（マイクラ版 vote.js: 盗んだ数を足す / 盗まれた数を引く / 下限0）。
   * 【票は役職ではなく人につく】盗んだ分の＋は、盗んだ人（by）に付く。集計の時点でその人の役職が何であっても（酔っ払いの夜能力であとから別の役職になっても）変わらない。盗まれた分の−も、その人（target）に付く。
   */
  function adjust(g, id, w) {
    return Math.max(0, w + gained(g, id) - lost(g, id));
  }
  /**
   * 盗みを記録する（通信・画面の処理は net.js 側）。相手の「いまの投票数」が0なら失敗（ok:false）で、それでも使用済みになる。
   * 戻り値: 記録した { by, target, ok }。条件を満たさなければ null（何も起きない）
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const ok = ONW.vote.weightOf(g, target) > 0;   // 前に盗まれた分も引いた「いまの」投票数（盗賊が複数いて同じ相手を狙うと、1票ずつ減っていく）
    const e = { by: id, target, ok };
    (g.thiefSteals = g.thiefSteals || []).push(e);
    return e;
  }
  /** 使った本人に出す文（情報確認）。成功・失敗とも、本人にははっきり伝える（マイクラ版: 「盗みました」「票数が0票だったため失敗しました」） */
  function doneText(name, ok) {
    return ok ? `${name} の票数を1票分盗みました。` : `${name} の票数が0票だったため、盗賊の能力は失敗しました。`;
  }
  /** 結果発表の「昼行動結果」用（誰が誰から盗んだか）。失敗も、使ったことは書く（0票だったことは書かない = 投票数が透けないように） */
  function actText(rn, by, target) { return `${rn("thief")} ${by} は ${target} の票数を1票盗もうとしていました。`; }
  function okText(rn, by, target) { return `${rn("thief")} ${by} は ${target} の票数を1票盗んでいました。`; }
  function failText(rn, by, target) { return `${rn("thief")} ${by} は ${target} の票数を盗もうとしましたが、${target} は0票だったため失敗していました。`; }
  /** 結果発表用: 使った順の盗み [{ byId, by, targetId, target, ok }] */
  function view(g, nm) {
    return (g.thiefSteals || []).map((e) => ({ byId: e.by, by: nm(e.by), targetId: e.target, target: nm(e.target), ok: e.ok }));
  }

  ONW.thief = { canUse, targets, used, gained, lost, adjust, apply, doneText, actText, okText, failText, view };

  // ======================================================================
  // 【CPU・実績（4of4）】マイクラ版 cpu.js / main.js / stats.js の盗賊に合わせる。
  //   ・本物の盗賊CPUは、昼に必ず「盗賊CO」（cpuClaim）。騙りは低い確率で「盗賊CO」だけ（cpuLie。マイクラ版は weight 3）。結果は言わない（盗んだかどうかは誰にも確かめられない）
  //   ・CPUは昼能力を勝手に使わない（ONW.CPU_AUTO_DAY）。デバッグの「昼能力」タブで盗ませたときは、net.js hostThief が cpuSpeak を呼び、「〇〇 の票数を盗みました。」と言う（マイクラ版 cpu.js: 失敗しても同じ文）
  //   ・CPUの投票判断（cpuVoteSee）は足さない: 盗賊の申告は、結果発表まで誰にも真偽が分からない（盗まれた本人も、投票数が見えないので分からない）ため、加点の根拠がない
  //   ・COボタン（co.js）: 結果開示で「票を盗んだ相手」を選ぶ → 「〇〇 の票数を1票盗んでいました。」（マイクラ版 main.js と同じ文）
  //   ・実績: wiki の「盗賊」に定義済みの4つ。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ。狂った女王の achievements と同じ形）
  // ======================================================================
  const stoleText = (name) => `${name} の票数を盗みました。`;
  const stoleShort = (name) => `${name} の票数を盗んだ`;
  /** 撃ったあとの保安官と同じ形のCPUの発言（net.js hostThief が、使ったのがCPUで生きているときに呼ぶ）。[{ p, text, short, result, claim, gap }] */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: stoleText(nm), short: stoleShort(nm), result: true, claim: { kind: "thief", target: e.target }, gap: 3500 }];
  }
  /**
   * 実績（マイクラ版 stats.js と同じ条件）: 最終役職が盗賊で盗んだ（thief_steal_vote。失敗した盗みも「使った」ので数える）/ 盗賊に票を盗まれた（vote_stolen。盗賊の対象になれば、失敗でも）
   *   / 初期役職が盗賊（first_thief。初めてかどうかは保存側が数える）/ 最終役職が盗賊で勝利（win_thief）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], T = R().THIEF, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === T) out.push("first_thief");
    if (cur === T && used(g, id)) out.push("thief_steal_vote");
    if ((g.thiefSteals || []).some((e) => e.target === id)) out.push("vote_stolen");
    if (cur === T && won) out.push("win_thief");
    return out;
  }
  Object.assign(ONW.thief, { stoleText, stoleShort, cpuSpeak, achievements });

  ONW.defineRole("thief", {
    info: { deck: 80, name: "盗賊", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 18,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから生きている自分以外の1人を選ぶと、その人の投票数を1票ぶん盗みます（盗まれた人は1票減り、あなたは1票増えます）。投票数が0票の人からは盗めず、失敗します（失敗しても使用済みになります）。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に盗賊を持っている人が使えます。" },
    groups: { "transform:light_apostle": 30 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    // CPU（4of4）: 本物は必ず「盗賊CO」。騙りは低い確率で「盗賊CO」だけ（結果なし。claim を書かないと、村人が配役にいるとき「村人CO」に置き換わってしまう）
    cpuClaim(k, g, p, r, i, c) { c.co = "thief"; },
    cpuLie: { role: "thief", weight: 3, order: 13, claim: () => ({ co: "thief", result: null }) },
    cpuSpeak,
    // 結果開示(COボタン・co.js が kind で引く): 「盗賊CO」だけで終わらせられる(noChain)。結果開示で票を盗んだ相手を選ぶ → 「〇〇 の票数を1票盗んでいました。」
    coResult: {
      kind: "thief", targetLabel: "票を盗んだ相手", noChain: true,
      pickPlayer: (id, K) => [`${K.nameOf(id)} の票数を1票盗んでいました。`, { kind: "thief", target: id }, null, "disclose", stoleShort(K.nameOf(id))],
    },

    // 盗む演出は結果発表ではなく、盗んだ瞬間に本人の画面だけで出す（ONW.thief.play。net.js の "thiefdone" から呼ぶ）。結果発表の演出（stageResult）は持たない
  });

  // ================================================================
  //  盗む演出の部品（昼・盗んだ瞬間・盗賊本人の画面だけ。画面の上に重ねる）
  //  ペンギン（penguin.js）と同じ作り: 盗賊本人のカードから棒人間が出てきて、盗んだあとはそのカードへ戻る（画面の端から走ってはこない）
  // ================================================================
  const EMERGE = 700, RUN_IN = 900, PULL = 700, RUN2 = 1000, THROW = 700, BACK = 500, TURN = 140;   // 成功: カードから出てくる / 盗まれる人のカードへ走る / 抜く / 盗賊のカードへ戻る / 投げ込む / カードへ入る（ms）
  const SEARCH = 1100, SHRUG = 1000, RUN_BACK = 900;                                                  // 失敗: ポケットを探す / 肩をすくめる / 盗賊のカードへ戻る（出てくる・入るは成功と同じ）
  const OK_MS = EMERGE + RUN_IN + PULL + RUN2 + THROW + BACK, NG_MS = EMERGE + RUN_IN + SEARCH + SHRUG + RUN_BACK + BACK;
  const FIG_H = 60;                                                                                    // 棒人間の高さ(px)。足元が立つ位置
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function removeFx() { document.querySelectorAll(".th-fx").forEach((e) => e.remove()); }
  const $t = () => document.getElementById("table");
  /** 席 k のカードの位置（なければ null）。x = 中心 / r・t・b = 右・上・下の端 / w = 幅 */
  function rectOf(R, k) {
    const t = $t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    if (!r.width) return null;
    return { x: (r.left + r.right) / 2, w: r.width, r: r.right, t: r.top, b: r.bottom };
  }
  /**
   * 盗んだ瞬間の演出（盗賊本人の画面だけ。net.js が "thiefdone" を受け取ったら呼ぶ）。targetId = 盗む相手 / ok = 盗めたか（false = 相手が0票で失敗）。
   *   盗賊のカード（自分の席）が持ち上がり、そこから棒人間が出てくる → 相手のカードへ走って投票用紙を抜く → 戻って放り投げる → カードの中へ入る（成功 約4.5秒）。失敗は、ポケットを探して「？」→ 肩をすくめて戻る（約5.1秒）。
   *   動きを減らす設定・昼の画面でないとき・どちらかのカードが画面にないときは何も出さない（結果の文は情報確認に入っている）。再入室では呼ばない。
   */
  function play(targetId, ok) {
    if (!targetId || reduceMotion()) return;
    const K = ONW.stage && ONW.stage.kit, g = K && K.G();
    if (!g || g.phase !== ONW.PHASE.ONLINE_DAY) return;
    const kb = `p:${ONW.net.myId()}`, kt = `p:${targetId}`, dur = ok ? OK_MS : NG_MS;
    removeFx();
    if (K.gx) { K.gx[kb] = "thsel"; K.paint(g); }   // 盗賊のカードが持ち上がる（ペンギン・交換者と同じ）
    setTimeout(() => steal({}, kb, kt, ok), 500);
    setTimeout(() => { const k2 = ONW.stage && ONW.stage.kit; if (k2 && k2.gx && k2.gx[kb] === "thsel") { delete k2.gx[kb]; k2.paint(k2.G()); } }, 500 + dur + 100);
  }
  function clearFx() { removeFx(); }
  ONW.thief.play = play;
  ONW.thief.clearFx = clearFx;
  /** 盗まれる人のカードの横に立つ位置（足元。画面の中央寄り）と、そのカードのほうを向く向き（+1 = 右向き） */
  function standOf(E, W) {
    const side = E.x < W / 2 ? 1 : -1, x = Math.max(24, Math.min(W - 24, E.x + side * (E.w / 2 + 18)));
    return { x, y: Math.min(E.b, (window.innerHeight || 800) - 4), face: x < E.x ? 1 : -1 };
  }
  const FIG_SVG = `<svg class="th-fig" viewBox="0 0 40 60" width="40" height="60"><g class="th-body">
      <g class="th-armL"><line x1="20" y1="21" x2="9" y2="32"/></g><g class="th-legL"><line x1="20" y1="38" x2="12" y2="58"/></g>
      <line x1="20" y1="16" x2="20" y2="38"/>
      <circle class="th-head" cx="20" cy="9" r="7"/><rect class="th-mask" x="12.5" y="6.5" width="15" height="4" rx="1.6"/>
      <g class="th-legR"><line x1="20" y1="38" x2="28" y2="58"/></g><g class="th-armR"><line x1="20" y1="21" x2="31" y2="32"/></g>
    </g></svg>`;
  /** 1回ぶんの演出。kb = 盗賊のカード（ここから出てきて、ここへ戻る）/ kt = 盗まれる人のカード。カードが画面にないときは何もしない（字幕だけ） */
  function steal(R, kb, kt, ok) {
    const T = rectOf(R, kt), B = rectOf(R, kb);
    if (!T || !B) return;
    removeFx();
    const W = window.innerWidth || 400, S = standOf(T, W);
    const sgn = (v) => (v >= 0 ? 1 : -1);
    const AT = { x: T.r - 6, y: T.t }, BT = { x: B.r - 6, y: B.t };   // 票数バッジの位置（カードの右上）
    const H = { x: B.x, y: Math.min(B.b - 6, (window.innerHeight || 800) - 4) };   // 盗賊のカードの下寄りの真ん中: 棒人間が出てくる・戻る場所（足元）
    const hand = (x, y, dir) => ({ x: x + dir * 16, y: y - 40 });
    const dirTo = sgn(S.x - H.x), dirBack = sgn(H.x - S.x), FACE = 1;   // FACE = カードの右上へ投げるので右向き
    const pt = (t, x, y, dir, s, o) => ({ t, x, y, dir, s: s === undefined ? 1 : s, o: o === undefined ? 1 : o });   // 棒人間の点（s = 大きさ / o = 不透明度。向きは線形に変わる＝振り向くときに細くなる）
    const emerge = [pt(0, H.x, H.y + 4, dirTo, 0.2, 0), pt(EMERGE * 0.55, H.x, H.y - 10, dirTo, 1.15, 1), pt(EMERGE, H.x, H.y, dirTo)];   // カードからぽんと出てくる（ペンギンと同じ。小さく透明 → 跳ねて大きく → 落ち着く）
    const tE = EMERGE, t1 = tE + RUN_IN;
    let pts, total;
    if (ok) {
      const t2 = t1 + PULL, t3 = t2 + RUN2, t4 = t3 + THROW;
      total = OK_MS;
      pts = [...emerge, pt(t1, S.x, S.y, dirTo), pt(t1 + TURN, S.x, S.y, S.face), pt(t2 - TURN, S.x, S.y, S.face), pt(t2, S.x, S.y, dirBack),
        pt(t3, H.x, H.y, dirBack), pt(t3 + TURN, H.x, H.y, FACE), pt(t4, H.x, H.y, FACE), pt(total, H.x, H.y + 4, FACE, 0.2, 0)];   // 最後はカードの中へ入っていく
    } else {
      const tA = t1 + SEARCH + SHRUG, tB = tA + RUN_BACK;
      total = NG_MS;
      pts = [...emerge, pt(t1, S.x, S.y, dirTo), pt(t1 + TURN, S.x, S.y, S.face), pt(tA, S.x, S.y, S.face), pt(tA + TURN, S.x, S.y, dirBack),
        pt(tB, H.x, H.y, dirBack), pt(total, H.x, H.y + 4, dirBack, 0.2, 0)];
    }
    const kf = (f) => pts.map((p) => Object.assign({ offset: p.t / total }, f(p)));
    const figFrames = kf((p) => ({ opacity: p.o, transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-${FIG_H}px) scale(${p.s}) scaleX(${p.dir})` }));
    // --- 投票用紙・「−1」「+1」・輪・「？」---
    let extra = "", ballotFrames = null;
    const ring = (p, dl) => `<i class="ex-ring" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;animation-delay:${dl}ms"></i><i class="ex-ring ex-ring2" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;animation-delay:${dl + 120}ms"></i>`;
    const pop = (p, cls, text, dl) => `<b class="th-pop ${cls}" style="left:${p.x.toFixed(1)}px;top:${(p.y - 6).toFixed(1)}px;animation-delay:${dl}ms">${text}</b>`;
    const HC = { x: H.x, y: H.y - 26 };
    extra = ring(HC, 0) + ring(HC, total - BACK + 120);   // 出てくるとき・戻るときに、カードの上で輪が広がる
    const POP = t1 + TURN + 120;                                       // 投票用紙を抜く瞬間
    if (ok) {
      const t2 = t1 + PULL, t3 = t2 + RUN2, tt = t3 + TURN, tl = tt + 380;   // t3+TURN = 盗賊のカードの前で振り向いた（投げ始め）/ tl = 着地
      const hS = (d) => hand(S.x, S.y, d), hD = (d) => hand(H.x, H.y, d), mid = { x: (hD(FACE).x + BT.x) / 2, y: Math.max(24, Math.min(hD(FACE).y, BT.y) - 70) };
      const b = [
        { t: 0, ...AT, o: 0, s: 0.4 }, { t: t1 + TURN, ...AT, o: 0, s: 0.4 }, { t: POP, ...AT, o: 1, s: 1.25 },   // 盗まれる人のカードの右上から、ぽんと出る
        { t: t2 - TURN, ...hS(S.face), o: 1, s: 1 }, { t: t2, ...hS(dirBack), o: 1, s: 1 },                        // 手に持つ
        { t: t3, ...hD(dirBack), o: 1, s: 1 }, { t: tt, ...hD(FACE), o: 1, s: 1 },                                 // 盗賊のカードまで運ぶ
        { t: tt + 190, ...mid, o: 1, s: 1.15 }, { t: tl, ...BT, o: 1, s: 1.3 }, { t: tl + 140, ...BT, o: 0, s: 0.6 },     // 放り投げて、盗賊のカードの右上へ
      ];
      ballotFrames = b.map((p) => ({ offset: p.t / total, opacity: p.o, transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%) scale(${p.s}) rotate(${p.t > tt && p.t < tl ? -12 : -4}deg)` }));
      extra += ring(AT, POP) + pop(AT, "th-pop--minus", "−1", POP) + ring(BT, tl) + pop(BT, "th-pop--plus", "+1", tl);
    } else {
      for (let i = 0; i < 3; i++) extra += pop({ x: S.x + S.face * -8 + (i - 1) * 14, y: S.y - FIG_H - 14 - (i % 2) * 8 }, "th-pop--q", "？", t1 + 200 + i * 320);   // ポケットを探して「？」
    }
    const root = document.createElement("div");
    root.className = "th-fx";
    root.innerHTML = `${extra}<div class="th-fig-wrap">${FIG_SVG}</div>${ok ? `<div class="th-ballot">1票</div>` : ""}`;
    document.body.appendChild(root);
    const wrap = root.querySelector(".th-fig-wrap"), ballot = root.querySelector(".th-ballot");
    if (wrap && wrap.animate) wrap.animate(figFrames, { duration: total, easing: "linear", fill: "forwards" });
    if (ballot && ballot.animate && ballotFrames) ballot.animate(ballotFrames, { duration: total, easing: "linear", fill: "forwards" });
    // ポーズ: 走る / 腕を伸ばす / 持つ / 投げる / 探る / 肩をすくめる（クラスで切り替える）。出てくる間と、カードへ入る間は立ち姿
    const pose = (at, cls) => setTimeout(() => { if (wrap) wrap.className = `th-fig-wrap ${cls}`.trim(); }, at);
    if (ok) {
      const t2 = t1 + PULL, t3 = t2 + RUN2, tt = t3 + TURN;
      pose(tE, "th-run"); pose(t1, "th-grab"); pose(POP, "th-hold"); pose(t2, "th-run th-hold"); pose(t3, "th-hold"); pose(tt, "th-throw"); pose(tt + 520, "");
    } else {
      const tA = t1 + SEARCH + SHRUG;
      pose(tE, "th-run"); pose(t1, "th-search"); pose(t1 + SEARCH, "th-shrug"); pose(tA, "th-run"); pose(tA + RUN_BACK, "");
    }
    setTimeout(() => root.remove(), total + 400);
  }
})(window.ONW);
