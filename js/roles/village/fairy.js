/**
 * 妖精さん（村人陣営・昼能力）: 保安官・盗賊・交換者に続く「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選ぶと、その人に「バリア」を付与する（1日1回）。
 *   バリアがついた人は、投票の集計で、入った票が1票ぶん防がれる（得票数が1減る。0票の人はそのまま）。
 *   マイクラ版（minecraftver.mcpack の main.js / vote.js / game.js の「妖精さん」FAIRY）に合わせる。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・夜の能力はない。使えるのは、最終盤面で妖精さんを持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
 *   ・選べるのは、生きている自分以外の人。
 *   ・バリアは投票の集計（vote.tally）で働く: 「その人に入った得票数を1減らす」（下限0。0票の人には何も起きない＝防ぐ票がないので、バリアは使われなかったことになる）。
 *     減らすのは交換者の入れ替え・番犬の無効票を反映したあとの得票数（マイクラ版 vote.js countVotes と同じ順）。
 *   ・同じ人に複数の妖精さんがバリアを付与したら、付与した数だけ（得票数を上限に）減る。
 *   ・使ったことは、本人以外には結果発表まで分からない。結果発表で、本来の得票数が出たあとに🧚が来て票を1減らす演出（stage 3of4）と「昼行動結果」の文章（dayLogsAll）が出る。
 *   ・封印の狂人に封印されていると使えない（昼能力ボタンを押すと「使用できません」。ONW.seal.dayBlocked）。
 *   ・【バリアは役職ではなく「人」につく】バリアを付与した記録は「だれが（by）だれに（target）」で残り、集計のときに妖精さんの役職を持っているかどうかは見ない。
 *     付与したあとに妖精さんが死亡しても、バリアはそのまま（マイクラ版は取り消さない）。
 *   ・【経由パターン】判定は「最終盤面」の役職で行う: 墓荒らし・怪盗で妖精さんのカードを手にした人、ドッペルゲンガーが妖精さんをコピーした人、酔いが覚めた酔っ払い（酔い中は使えない）が使える。
 *     演出・集計は「だれがだれに付与したか」の記録だけを見るので、どの経由で妖精さんになった人でも同じように動く。模倣の人狼が妖精さんを模倣していても使える（ONW.mimic.actRole）。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（得票数が変わるだけ。追放者が変わる経路は通常の追放と同じ）。重複役職: 特別扱いなし（docs/overlay-role-priority.md に変更なし）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に fairy はすでに入っている（priest の次）。wiki の order も 42 で一致。末尾追加は不要。
 * 実装の進み具合は docs/fairy.md を参照（1of4=役職本体・集計 / 2of4=昼能力の操作・通信 / 3of4=結果発表の演出 / 4of4=CPU・実績・経由パターンの確認）。
 *
 * 状態: g.fairyBarriers = [{ by: 妖精さんのID, target: バリアを付与した相手のID }, ...]（使った順。試合ごとに net.startGame が [] に戻す）
 * 呼び出し: net.js の hostFairy(ホスト) → ONW.fairy.canUse / targets / apply。票を減らすのは vote.js の vote.tally が ONW.fairy.reduce を呼ぶ。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** この人が（もう）バリアを付与したか */
  const used = (g, id) => (g.fairyBarriers || []).filter((e) => e.by === id).length >= (ONW.carmen ? ONW.carmen.dayUses(g, id) : 1);   // カルメンに囁かれた人は昼能力を2回使える（docs/carmen.md）
  /** 妖精さんの昼能力を使える人か（最終盤面の役職が妖精さん・酔いが覚めている・生きている・まだ使っていない・昼の議論中でタイマーが動いている・選べる人がいる） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R().FAIRY) return false;   // 模倣の人狼が妖精さんを模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** バリアを付与できる相手として選べる人（生きている自分以外） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => x !== id && !isDead(g, x));
  }
  /**
   * バリアの付与を記録する（通信・画面の処理は net.js 側）。
   * 戻り値: 記録した { by, target }。条件を満たさなければ null（何も起きない）
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const e = { by: id, target };
    (g.fairyBarriers = g.fairyBarriers || []).push(e);
    return e;
  }

  /**
   * vote.tally から呼ばれる: 得票数 counts（交換者・番犬を反映したあと）に、妖精さんのバリアを反映する（マイクラ版 vote.js countVotes）。
   *   バリアを付与した順に1つずつ、その人の得票数を1減らす（0票の人は減らない＝そのバリアは使われなかった）。減って0になった人は counts から消える。counts は書き換えない。
   * 戻り値: { counts: 反映後の得票数, list: [{ by, target, ok: 票を防げたか, from: 防ぐ前の得票数, to: 防いだあとの得票数 }（付与した順）], steps: [反映前, 1つ目のバリア後, ...] }
   */
  function reduce(g, counts) {
    let cur = { ...(counts || {}) };
    const list = [], steps = [{ ...cur }];
    (g.fairyBarriers || []).forEach((e) => {
      const from = cur[e.target] || 0, ok = from > 0;
      cur = { ...cur };
      if (ok) { if (from - 1 > 0) cur[e.target] = from - 1; else delete cur[e.target]; }
      list.push({ by: e.by, target: e.target, ok, from, to: ok ? from - 1 : from });
      steps.push({ ...cur });
    });
    return { counts: cur, list, steps };
  }
  /** この試合で、バリアが実際に票を防いだ妖精さん（by）のID（マイクラ版 game.fairyBarrierUsed）。集計は vote.tally のバリア反映前の得票数を見る */
  function blockedIds(g) {
    if (!(g.fairyBarriers || []).length || !ONW.vote) return [];
    return reduce(g, ONW.vote.tally(g, { nofairy: true })).list.filter((x) => x.ok).map((x) => x.by);
  }
  /** この人が付与したバリアが票を防いだか */
  const blocked = (g, id) => blockedIds(g).includes(id);
  /** 結果発表用: 付与した順のバリア [{ byId, by, targetId, target, ok }]（ok = 票を防げたか。nm = IDから名前を返す関数） */
  function view(g, nm) {
    if (!(g.fairyBarriers || []).length || !ONW.vote) return [];
    return reduce(g, ONW.vote.tally(g, { nofairy: true })).list.map((x) => ({ byId: x.by, by: nm(x.by), targetId: x.target, target: nm(x.target), ok: x.ok, from: x.from, to: x.to }));
  }

  /**
   * 結果発表用のデータ（net.js が res.fairy として渡す）: { list: view と同じ（付与した順）, steps: [バリア前の得票数, 1つ目のバリア後, ...]（各 [{ id, c }]。最後は最終の得票数） }。バリアがなければ null。
   * stage.js は最初に steps[0]（本来の得票数）を出し、このファイルの stageResult.counts フックが 🧚 の演出で1票ずつ減らしていく。
   */
  function resultData(g, nm) {
    const list = view(g, nm);
    if (!list.length || !ONW.vote.fairySteps) return null;
    return { list, steps: ONW.vote.fairySteps(g).steps.map((st) => Object.entries(st).map(([id, c]) => ({ id, c }))) };
  }

  /** 使った本人に出す文（情報確認）。マイクラ版: 「〇〇にバリアを付与しました。」 */
  function doneText(name) { return `${name} にバリアを付与しました。`; }
  /** 結果発表の「昼行動結果」用（だれがだれにバリアを付与したか）。マイクラ版 vote.js の文に合わせる。票を防げたかどうかは書かない（得票数が透けないように） */
  function actText(rn, by, target) { return `${rn("fairy")} ${by} は ${target} にバリアを付与していました。`; }

  ONW.fairy = { canUse, targets, used, apply, reduce, blockedIds, blocked, view, resultData, doneText, actText, run: (R, F, cap) => runBarriers(R, F, cap), ms: (F) => barriersMs(F) };


  // ======================================================================
  // 【CPU（4of4-a）】マイクラ版 cpu.js の妖精さんに合わせる。
  //   ・本物の妖精さんCPUは、昼に必ず「妖精さんCO」（cpuClaim）。結果は言わない（バリアが票を防げたかは、結果発表まで誰にも確かめられない）。
  //   ・騙りはしない（cpuLie なし）: マイクラ版は昼能力の役職を騙りの候補から外している（_cpuCoOnlyFakeClaimRoles の dayRoles。盗賊だけ weight 3 で例外）。
  //   ・CPUは昼能力を勝手に使わない（ONW.CPU_AUTO_DAY。固定していない CPU が妖精さんを引いたら、roles.js avoidCpuDictator が人間と入れ替える）。デバッグの「昼能力」タブで付与させたときは、
  //     net.js hostFairy が cpuSpeak を呼び、「〇〇 にバリアを張っていました。」と言う（マイクラ版 cpu.js の妖精さんの発言と同じ文）。
  //   ・CPUの投票判断（cpuVoteSee）は足さない: 妖精さんの申告は、結果発表まで真偽が分からない（得票数が見えないので、防げたかどうかも分からない）ため、加点の根拠がない。
  //   ・COボタン・実績は 4of4-b（下の coText / achievements / coResult）。
  // ======================================================================
  const guardText = (name) => `${name} にバリアを張っていました。`;
  const guardShort = (name) => `${name} にバリアを張った`;
  /** バリアを付与したあとのCPUの発言（net.js hostFairy が、使ったのがCPUで生きているときに呼ぶ）。[{ p, text, short, result, claim, gap }] */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: guardText(nm), short: guardShort(nm), result: true, claim: { kind: "fairy", target: e.target }, gap: 3500 }];
  }
  /** COボタン（4of4-b）の結果開示の文。マイクラ版 main.js: 「〇〇にバリアを付与していました。」（Web版は名前のあとに空白を入れる） */
  const coText = (name) => `${name} にバリアを付与していました。`;
  /**
   * 実績（4of4-b。マイクラ版 stats.js と同じ条件。wiki の「妖精さん」に定義済みの3つ）:
   *   fairy_win「真我の力」 = 最終役職が妖精さんで勝利 / fairy_loss「可愛い妖精さん」 = 最終役職が妖精さんで敗北 /
   *   fairy_barrier_block「ハーイ♪あたしに会いたかった？」 = 最終役職が妖精さんで、その人のバリアが票を1票防いだ（ONW.fairy.blocked。0票の人へのバリアは数えない）。
   *   Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ。盗賊の achievements と同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], cur = g.currentRoles && g.currentRoles[id];
    if (cur !== R().FAIRY) return out;   // 最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル経由で妖精さんになった人も対象。模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    out.push(won ? "fairy_win" : "fairy_loss");
    if (blocked(g, id)) out.push("fairy_barrier_block");
    return out;
  }
  Object.assign(ONW.fairy, { guardText, guardShort, cpuSpeak, coText, achievements });

  ONW.defineRole("fairy", {
    info: { sealTarget: true, deck: 106, name: "妖精さん", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 15.95,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから生きている自分以外の1人を選ぶと、その人にバリアを付与します。バリアがついた人は、投票の集計で入った票が1票ぶん防がれます（得票数が1減ります。0票の人には何も起きません）。結果発表で、本来の得票数が出たあとに妖精が来て票を1減らします。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に妖精さんを持っている人が使えます。" },
    // CPU（4of4-a）: 本物は必ず「妖精さんCO」（結果なし）。騙りはしない。バリアを付与したCPUの発言は cpuSpeak
    cpuClaim(k, g, p, r, i, c) { c.co = "fairy"; },
    cpuSpeak,
    // 結果開示(COボタン・co.js が kind で引く): 「妖精さんCO」だけで終わらせられる(noChain)。結果開示でバリアを付与した相手を選ぶ → 「〇〇 にバリアを付与していました。」（盗賊と同じ形）
    coResult: {
      kind: "fairy", targetLabel: "バリアを付与した相手", noChain: true,
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "fairy", target: id }, null, "disclose", guardShort(K.nameOf(id))],
    },
    groups: { "transform:light_apostle": 44 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 42）で決まる（番号は所属を表すだけ）

    // 結果発表の演出（stage.js の startResult / skipResult が引く。使うデータは res.fairy（net.js が ONW.fairy.resultData で作る））
    //   counts : 「N票」が全員ぶん出たあと（カードをめくる前）に呼ばれる。ペンギン(order 5)・交換者(order 10)のあと（order 15）。バリアごとに付与した順に1回ずつ:
    //            字幕「妖精さん」→ バリアを付与された人のカードが持ち上がる → 票数バッジが1減る（0票だった人は何も起きない）。stage.js が最初に出す票数は、バリア前の本来の得票数（res.fairy.steps[0]）
    //   skip   : スキップ時の最終形（票数はバリアのあと） / clear: 演出の部品を片付ける
    stageResult: {
      counts: { order: 15, run(R) { runBarriers(R, R.res.fairy, true); } },
      skip: { order: 15, run(R) {   // スキップ: バリアのあとの票数を最終形として出す（交換者の skip が入れ替え後の票数（バリア前）を置くので、そのあとに最終の票数で作り直す）
        const F = R.res.fairy;
        if (!F || !F.list.length || F.steps.length < 2) return;
        const fin = F.steps[F.steps.length - 1] || [], ids = new Set();
        F.steps.forEach((st) => st.forEach((c) => ids.add(c.id)));
        ids.forEach((id) => {
          const k = `p:${id}`, cur = R.badge[k];
          if (cur !== undefined && !/^\d+票$/.test(cur)) return;   // 「追放」などの札はそのまま
          const c = (fin.find((x) => x.id === id) || { c: 0 }).c;
          if (c > 0) R.badge[k] = `${c}票`; else delete R.badge[k];
        });
      } },
      clear(R) { removeFx(); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "fairysel") delete R.gx[k]; }); },
    },
  });

  // ================================================================
  //  バリアの演出（3of4-b）: 🧚 が飛んできて、カードにバリアの膜を張り、票バッジがぱちんと1減る
  //  ★ 🧚 の絵は fairyHtml() だけ。あとで画像に差し替えるときはここだけ直す（例: return `<img src="img/fairy.png" alt="">`）
  // ================================================================
  const fairyHtml = () => "🧚";
  const reduced = () => !!(false /* OSのアニメ設定(prefers-reduced-motion)では演出を止めない */);
  const PREP_MS = 350, FLY_MS = 1100, SHIELD_MS = 280, POP_MS = 700, END_MS = 1100;   // カードが持ち上がる / 🧚が飛んでくる / 膜が張られて票が減る(or 何も起きない)までの間 / 膜がはじける・消える / 次のバリアまで
  const HOLD_MS = PREP_MS + FLY_MS + SHIELD_MS;   // 字幕・持ち上がりから、票が減る（0票なら何も起きない）瞬間まで
  const R_HOLD = 900, R_END = 1000;   // 動きを減らす設定のとき: 飛ばさずに、持ち上げて票を減らすだけ（3of4-a と同じ）
  const N = 22;   // 🧚の軌道の分割数
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const removeFx = () => { if (document.querySelectorAll) document.querySelectorAll(".fa-fx").forEach((e) => e.remove()); };
  /** 席 k のカードの位置（画面座標）。なければ null */
  function rectOf(R, k) {
    const t = R.$t && R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return r.width > 0 ? r : null;
  }
  /** 票数バッジが「ぱちん」と弾む（減ったあとに呼ぶ） */
  function popBadge(R, k) {
    const t = R.$t && R.$t(), b = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-badge`);
    if (b && b.animate && b.textContent) b.animate([{ transform: "scale(1.9)", offset: 0 }, { transform: "scale(.82)", offset: 0.45 }, { transform: "scale(1.12)", offset: 0.75 }, { transform: "scale(1)", offset: 1 }], { duration: 520, easing: "ease-out" });
  }
  /**
   * 1つのバリアの 🧚 の飛行・膜・光（見た目だけ。票数バッジの更新は呼び出し側）。ok = 票を防げたか（false = 0票で何も起きない）
   *   🧚 が画面の上の端（左右交互）から弧を描いて飛んできて、付与される人のカードの上で光る → 膜がふわっと張られる →
   *   ok: 膜が「ぱちん」とはじけて −1 が浮かぶ（票数バッジは呼び出し側が同じ瞬間に減らす） / 防ぐ票がない: 膜が静かにしぼんで消える（−1 は出ない）
   */
  function flyFairy(R, kt, i, ok) {
    const r = rectOf(R, kt);
    if (!r || reduced()) return false;
    removeFx();   // 二重に動かない
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const T = { x: cx, y: r.top + r.height * 0.18 };                        // 着く場所（カードの上のほう）
    const side = i % 2 === 0 ? -1 : 1;                                      // 1つ目は左から、2つ目は右から…
    const S = { x: cx + side * Math.max(180, window.innerWidth * 0.5), y: -50 };
    const C = { x: (S.x + T.x) / 2 - side * 60, y: Math.min(S.y, T.y) - 70 + (T.y - S.y) * 0.05 };   // 弧の制御点
    const bez = (u) => ({ x: (1 - u) * (1 - u) * S.x + 2 * (1 - u) * u * C.x + u * u * T.x, y: (1 - u) * (1 - u) * S.y + 2 * (1 - u) * u * C.y + u * u * T.y });
    const total = FLY_MS + SHIELD_MS + POP_MS, oFly = FLY_MS / total, oSh = (FLY_MS + SHIELD_MS) / total;
    const root = document.createElement("div");
    root.className = "fa-fx";
    let sparks = "";
    for (let j = 2; j < N; j += 2) {   // 軌道に沿って、🧚が通ったあとに光の粒が残る
      const p = bez(ease(j / N)), jx = (Math.random() - 0.5) * 16, jy = (Math.random() - 0.5) * 16;
      sparks += `<i class="fa-spark" style="left:${(p.x + jx).toFixed(1)}px;top:${(p.y + jy).toFixed(1)}px;animation-delay:${Math.round(FLY_MS * (j / N))}ms">${j % 4 === 0 ? "✦" : "✧"}</i>`;
    }
    const sw = Math.round(r.width * 1.5), sh = Math.round(r.height * 1.32);
    root.innerHTML = `${sparks}<div class="fa-shield${ok ? "" : " fa-shield--none"}" style="left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;width:${sw}px;height:${sh}px"></div><div class="fa-fairy">${fairyHtml()}</div>`;
    document.body.appendChild(root);
    const fa = root.querySelector(".fa-fairy"), sd = root.querySelector(".fa-shield");
    if (fa && fa.animate) {   // 🧚: 飛んでくる → カードの上で小さく舞って光る → 上へ去っていく
      const fr = [];
      for (let j = 0; j <= N; j++) {
        const p = bez(ease(j / N)), w = Math.sin(j * 1.1) * 4 * (1 - j / N);
        fr.push({ offset: oFly * (j / N), opacity: j === 0 ? 0 : 1, transform: `translate(${(p.x + w).toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%) rotate(${(side * -14 * (1 - j / N)).toFixed(1)}deg) scale(${(0.7 + 0.5 * (j / N)).toFixed(2)})` });
      }
      const hov = (dx, dy, sc, o) => `translate(${(T.x + dx).toFixed(1)}px,${(T.y + dy).toFixed(1)}px) translate(-50%,-50%) scale(${sc})`;
      fr.push({ offset: oFly + (oSh - oFly) * 0.5, opacity: 1, transform: hov(5, -8, 1.35) },
              { offset: oSh, opacity: 1, transform: hov(0, -4, 1.2) },
              { offset: 1, opacity: 0, transform: hov(-side * 30, -70, 0.7) });
      fa.animate(fr, { duration: total, easing: "linear", fill: "forwards" });
    }
    if (sd && sd.animate) {   // 膜: 🧚が着いたあとふわっと張られる → ok ははじけて消える / 0票は静かにしぼんで消える
      const base = "translate(-50%,-50%) ";
      const fr = [{ offset: 0, opacity: 0, transform: base + "scale(.3)" }, { offset: Math.max(0, oFly - 0.001), opacity: 0, transform: base + "scale(.3)" },
                  { offset: oFly + (oSh - oFly) * 0.7, opacity: 1, transform: base + "scale(1.06)" }, { offset: oSh, opacity: 1, transform: base + "scale(1)" }];
      if (ok) fr.push({ offset: oSh + (1 - oSh) * 0.28, opacity: 1, transform: base + "scale(1.5)" }, { offset: 1, opacity: 0, transform: base + "scale(1.9)" });   // ぱちん
      else fr.push({ offset: oSh + (1 - oSh) * 0.35, opacity: 0.8, transform: base + "scale(.96)" }, { offset: 1, opacity: 0, transform: base + "scale(.55)" });   // しぼんで消える
      sd.animate(fr, { duration: total, easing: "linear", fill: "forwards" });
    }
    if (ok) {   // −1: 票数バッジの場所から浮かび上がる（バッジが減る瞬間と同時）
      const m = document.createElement("div");
      m.className = "fa-minus"; m.textContent = "−1";
      m.style.cssText = `left:${(r.right - 6).toFixed(1)}px;top:${r.top.toFixed(1)}px;animation-delay:${HOLD_MS - PREP_MS}ms`;
      root.appendChild(m);
    }
    setTimeout(() => root.remove(), total + 300);   // 画面から消す（clear でも消える。二重に残らない）
    return true;
  }

  /**
   * バリアの時間割（結果発表の counts フックと、妖狐投票の演出が共有）。R = stage.kit を元にした道具箱 / F = res.fairy（{ list, steps }） / cap = 字幕を出すか
   * 付与した順に1つずつ: 字幕 → 付与された人のカードが持ち上がる → 🧚が飛んできて膜を張る → 票数バッジがぱちんと1減る（0票の人は膜がしぼんで消えるだけ）。
   * 動きを減らす設定のときは、🧚を飛ばさずに（3of4-a と同じ）持ち上げて票を減らすだけ。
   */
  function runBarriers(R, F, cap) {
    const list = (F && F.list) || [], steps = (F && F.steps) || [];
    if (!list.length || steps.length < list.length + 1) return;
    const { P, later, setCap, esc, paint, gx, badge } = R;
    const val = (st, id) => ((st || []).find((c) => c.id === id) || { c: 0 }).c;
    const txt = (c) => (c > 0 ? `${c}票` : "");
    const fast = reduced(), hold = fast ? R_HOLD : HOLD_MS, end = fast ? R_END : END_MS, prep = fast ? 0 : PREP_MS;
    list.forEach((e, i) => {
      const t0 = R.t, kt = P(e.targetId), after = val(steps[i + 1], e.targetId);
      later(() => {
        if (cap) setCap(`<div class="res-cap__t t-village">妖精さん${list.length > 1 ? ` (${i + 1}/${list.length})` : ""}</div><div>${esc(e.target)}は妖精のバリアによって守られました。</div>`);
        gx[kt] = "fairysel"; paint(R.G());
      }, t0);
      if (!fast) later(() => { flyFairy(R, kt, i, !!e.ok); }, t0 + prep);   // 🧚が飛んでくる（カードが持ち上がったあと）
      later(() => {   // 票が1減る（0票の人は変わらない）。減った瞬間にバッジが弾む
        if (e.ok) { if (txt(after)) badge[kt] = txt(after); else delete badge[kt]; }
        paint(R.G());
        if (e.ok && !fast) popBadge(R, kt);
      }, t0 + hold);
      later(() => { delete gx[kt]; paint(R.G()); }, t0 + hold + (fast ? 600 : POP_MS));
      R.t = t0 + hold + end;
    });
  }
  const barriersMs = (F) => ((F && F.list) || []).length * (reduced() ? R_HOLD + R_END : HOLD_MS + END_MS);   // 妖狐投票の演出用（3of4-c）: バリアにかかる時間(ms)
})(window.ONW);
