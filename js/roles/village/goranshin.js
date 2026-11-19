/**
 * 御乱心（村人陣営・昼能力）: 妖精さん・交換者に続く「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選ぶと、その人の「投票先」をランダムに変更する（1日1回）。
 *   マイクラ版（minecraftver.mcpack の main.js / vote.js / game.js の「御乱心」GORANSHIN）に合わせる。依頼文: 「とくにいうことなし」＝マイクラ版どおり。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・夜の能力はない。使えるのは、最終盤面で御乱心を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
 *   ・選べるのは、生きている自分以外の人（マイクラ版 participantOptionsForDay(myId, false)）。
 *   ・効果は投票の集計で働く: 選ばれた人（投票者）が投票していれば、その人の投票先が「生きている全員（自分自身も含む）」の中からランダムに1人に書き換わる（マイクラ版 vote.js effectiveVoteRecords）。
 *       投票していない人・昼中に死亡した人には何も起きない。
 *       ランダムに決まった先は、その投票者について1回だけ決めて覚えておく（g.goranshinRandom。何度集計しても同じ）。覚えた先が死亡して候補から外れたら、引き直す（マイクラ版 game.goranshinRandomVote）。
 *       使った瞬間に、その投票者の覚えた先は消す（マイクラ版: delete game.goranshinRandomVote[target.id]）。
 *   ・処理の順番: 御乱心（投票先の書き換え）→ ペンギン（票の移動）→ 交換者（票数の入れ替え）→ 番犬（飼い主への票を無効）→ 妖精さん（バリア）。マイクラ版 effectiveVoteRecords と同じ順（御乱心が一番先）。
 *   ・番犬の噛殺・シュレディンガーの猫・実績など「誰が誰に投票したか」の条件は、元の投票先（game.votes）のまま（ペンギンと同じ扱い）。票数の集計・結果発表の表示だけが書き換わったあとの票になる。
 *   ・同じ人に複数の御乱心が使っても、ランダムに決まる先はその人について1つだけ（同じ先になる）。
 *   ・使ったことは、本人以外には結果発表まで分からない。結果発表の「昼行動結果」に「御乱心 〇〇 は △△ の投票先を □□ に変えていました。」が出る（マイクラ版の文）。
 *   ・封印の狂人に封印されていると使えない（昼能力ボタンを押すと「使用できません」。ONW.seal.dayBlocked）。
 *   ・【効果は役職ではなく「人」につく】使った記録は「だれが（by）だれの（target）」で残り、集計のときに御乱心の役職を持っているかどうかは見ない。使ったあとに御乱心が死亡しても・役職が動いても（酔っ払い等）、そのまま働く。
 *   ・【経由パターン】判定は「最終盤面」の役職で行う: 墓荒らし・怪盗で御乱心のカードを手にした人、ドッペルゲンガーが御乱心をコピーした人、酔いが覚めた酔っ払い（酔い中は使えない）が使える。
 *     集計・演出は「だれがだれに使ったか」の記録だけを見るので、どの経由で御乱心になった人でも同じように動く。模倣の人狼が御乱心を模倣していても使える（ONW.mimic.actRole）。
 *   ・独裁者が宣言したあと（投票は行われず、独裁者の1票だけが入った扱い）は、御乱心の効果は働かない（マイクラ版は独裁処刑が投票と別経路のため、票を書き換えない）。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（投票先が変わるだけ。追放者が変わる経路は通常の追放と同じ）。重複役職: 特別扱いなし（docs/overlay-role-priority.md に変更なし）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に goranshin はすでに入っている（aa の次）。wiki の order も 44 で一致。末尾追加は不要。
 * 実装の進み具合は docs/goranshin.md を参照（1of4=役職本体・投票の書き換え / 2of4=昼能力の操作・通信 / 3of4=結果発表の演出・昼行動結果 / 4of4=CPU・COボタン・実績・経由パターンの確認）。
 *
 * 状態: g.goranshins = [{ by: 御乱心のID, target: 投票先を変える相手（投票者）のID }, ...]（使った順。試合ごとに net.startGame が [] に戻す）
 *       g.goranshinRandom = { 投票者ID: ランダムに決まった投票先ID }（ホストだけが持つ。試合ごとに {} に戻す）
 * 呼び出し: net.js の hostGoranshin(ホスト) → ONW.goranshin.canUse / targets / apply。投票先の書き換えは vote.js の vote.goranshinRun（vote.penguinRun の最初）が ONW.goranshin.run を呼ぶ。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** この人が（もう）使ったか */
  const used = (g, id) => (g.goranshins || []).filter((e) => e.by === id).length >= (ONW.carmen ? ONW.carmen.dayUses(g, id) : 1);   // カルメンに囁かれた人は昼能力を2回使える（docs/carmen.md）
  /** 御乱心の昼能力を使える人か（最終盤面の役職が御乱心・酔いが覚めている・生きている・まだ使っていない・昼の議論中でタイマーが動いている・選べる人がいる） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R().GORANSHIN) return false;   // 模倣の人狼が御乱心を模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** 投票先を変える相手として選べる人（生きている自分以外） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => x !== id && !isDead(g, x));
  }
  /**
   * 御乱心の使用を記録する（通信・画面の処理は net.js 側）。
   * その投票者について覚えていたランダムな先は消す（マイクラ版: delete game.goranshinRandomVote[target.id]）。
   * 戻り値: 記録した { by, target }。条件を満たさなければ null（何も起きない）
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const e = { by: id, target };
    (g.goranshins = g.goranshins || []).push(e);
    if (g.goranshinRandom) delete g.goranshinRandom[target];
    return e;
  }

  /** ランダムの元（テストで差し替える）。0以上1未満 */
  const rand = { next: () => Math.random() };
  /**
   * vote.goranshinRun から呼ばれる: votes（{ 投票者ID: 投票先ID }。書き換えない）に御乱心の効果を反映する（マイクラ版 vote.js effectiveVoteRecords の御乱心の部分）。
   *   使った順に1つずつ、選ばれた人が投票していて生きていれば、その人の投票先を「生きている全員」からランダムに1人に書き換える。
   *   ランダムの先は投票者ごとに g.goranshinRandom に覚える（生きている間は同じ先。死亡して候補から外れたら引き直す）。
   * 戻り値: { votes: 書き換えたあとの投票先, list: [{ by, voterId, fromId, toId, w }（使った順）] }
   *   fromId = その時点の投票先（同じ投票者に2回目以降は、1回目で書き換わったあとの先）/ toId = ランダムに決まった先 / w = その投票者の票数
   */
  function run(g, votes) {
    const out = { ...(votes || {}) }, list = [];
    if (!g || g.dictator || !(g.goranshins || []).length) return { votes: out, list };
    const dead = new Set(g.deadIds || []);
    const alive = (g.players || []).map((p) => p.id).filter((x) => !dead.has(x));
    if (!alive.length) return { votes: out, list };
    const memo = (g.goranshinRandom = g.goranshinRandom || {});
    g.goranshins.forEach((e) => {
      const v = e.target;
      if (!v || !out[v] || dead.has(v)) return;   // 投票していない人・昼中に死亡した人には何も起きない
      let to = memo[v];
      if (!alive.includes(to)) { to = alive[Math.floor(rand.next() * alive.length) % alive.length]; memo[v] = to; }
      const from = out[v];
      out[v] = to;
      list.push({ by: e.by, voterId: v, fromId: from, toId: to, w: ONW.vote.weightOf(g, v) });
    });
    return { votes: out, list };
  }
  /** この投票者の投票先が、御乱心でランダムに変えられたか（最終の先 / 元の先は game.votes） */
  const changed = (g, voterId) => run(g, g.votes).list.some((x) => x.voterId === voterId);

  /** 使った本人に出す文（情報確認）。マイクラ版 main.js: 「〇〇の投票先をランダムにしました。」 */
  function doneText(name) { return `${name} の投票先をランダムにしました。`; }

  /**
   * 結果発表用のデータ（net.js が res.goranshin として渡す）: { list: [{ by, voter, voterId, from, to, fromId, toId, w, ok }（使った順。名前つき。ok = 投票先が実際に変わったか）], steps: [書き換える前の得票数, 1つ目を書き換えた後, ...]（各 [{ id, c }]。最後はペンギンが滑らせる前の得票数） }。使われていなければ（または効果がなければ）null。
   * stage.js は最初に steps[0]（元の得票数）を出し、このファイルの stageResult.counts フックが、御乱心ごとに票が動く演出を流す。
   */
  function resultData(g, nm) {
    if (!g || !(g.goranshins || []).length || !ONW.vote || !ONW.vote.goranshinSteps) return null;
    const gs = ONW.vote.goranshinSteps(g);
    if (!gs.list.length) return null;
    return {
      list: gs.list.map((x) => ({ byId: x.by, by: nm(x.by), voterId: x.voterId, voter: nm(x.voterId), fromId: x.fromId, from: nm(x.fromId), toId: x.toId, to: nm(x.toId), w: x.w, ok: x.fromId !== x.toId && x.w > 0 })),
      steps: gs.steps.map((st) => Object.entries(st).map(([id, c]) => ({ id, c }))),
    };
  }
  /** 結果発表の「昼行動結果」用（マイクラ版の文）: 〇〇（御乱心）は △△ の投票先を □□ に変えていました。同じ投票者への2回目以降は書かない */
  function actLines(g, nm, rn) {
    const seen = new Set(), out = [];
    ((resultData(g, nm) || {}).list || []).forEach((x) => {
      const k = x.voterId + ">" + x.byId; if (seen.has(k)) return; seen.add(k);
      out.push(`${rn("goranshin")} ${x.by} は ${x.voter} の投票先を ${x.to} に変えていました。`);
    });
    return out;
  }

  // ---- 結果発表の演出 ----
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // 時間割（1回の御乱心）: カードが持ち上がる → 🍄が票数のところに出る → 数字が元の先から新しい先へ飛ぶ → 新しい先の票数が増える → 🍄が消える
  const PREP_MS = 450, SHROOM_MS = 600, FLY_MS = 800, LAND_MS = 500, END_MS = 500;
  const R_HOLD = 800, R_END = 900;   // 動きを減らす設定: 飛ばさず、🍄のあと票数だけ切り替える
  const ONE_MS = () => (reduced() ? R_HOLD + R_END : PREP_MS + SHROOM_MS + FLY_MS + LAND_MS + END_MS);
  const popBadge = (R, k) => {
    const t = R.$t && R.$t(), b = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-badge`);
    if (b && b.animate && b.textContent) b.animate([{ transform: "scale(1.9)", offset: 0 }, { transform: "scale(.82)", offset: 0.45 }, { transform: "scale(1.12)", offset: 0.75 }, { transform: "scale(1)", offset: 1 }], { duration: 520, easing: "ease-out" });
  };
  const badgeEl = (R, k) => { const t = R.$t && R.$t(); return t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-badge`); };
  /** 票数の数字が、k1 の札から k2 の札へ飛ぶ（動きを減らす設定のときは呼ばない） */
  function flyNumber(R, k1, k2, text) {
    const a = badgeEl(R, k1), b = badgeEl(R, k2);
    if (!a || !b || !document.body.animate) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const el = document.createElement("div");
    el.className = "gr-fly";
    el.textContent = text;
    el.style.left = ra.left + ra.width / 2 + "px"; el.style.top = ra.top + ra.height / 2 + "px";
    document.body.appendChild(el);
    const dx = rb.left + rb.width / 2 - (ra.left + ra.width / 2), dy = rb.top + rb.height / 2 - (ra.top + ra.height / 2);
    const an = el.animate([{ transform: "translate(-50%,-50%) scale(1.3)", opacity: 1 }, { transform: `translate(calc(-50% + ${dx / 2}px), calc(-50% + ${dy / 2 - 26}px)) scale(1.7)`, opacity: 1, offset: 0.5 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1)`, opacity: 1 }], { duration: FLY_MS, easing: "ease-in-out", fill: "forwards" });
    an.onfinish = () => el.remove();
    setTimeout(() => el.remove(), FLY_MS + 400);
  }
  /** 御乱心の時間割（結果発表の counts フックと妖狐投票の演出が共有）。R = stage.kit ベースの道具箱 / F = res.goranshin / cap = 使わない（文章は出さない。互換のため残している）。
   *  使った順に1つずつ: 投票者のカードが持ち上がる → 変わる2か所の票数に🍄が出る → 数字が元の先から新しい先へ飛ぶ → 票数が変わる → 🍄が消える（変わらなければ🍄だけ出て消える） */
  function runGoranshin(R, F, cap) {
    const list = (F && F.list) || [], steps = (F && F.steps) || [];
    if (!list.length || steps.length < list.length + 1) return;
    const { P, later, paint, gx, badge } = R;
    const val = (st, id) => ((st || []).find((c) => c.id === id) || { c: 0 }).c;
    const txt = (c) => (c > 0 ? `${c}票` : "");
    const mush = (c) => `🍄${txt(c)}`;
    const fast = reduced();
    list.forEach((e, i) => {
      const t0 = R.t, kv = P(e.voterId), kf = P(e.fromId), kt = P(e.toId);
      const oldF = val(steps[i], e.fromId), oldT = val(steps[i], e.toId), newF = val(steps[i + 1], e.fromId), newT = val(steps[i + 1], e.toId);
      const tM = t0 + (fast ? 0 : PREP_MS), tF = tM + (fast ? R_HOLD : SHROOM_MS), tL = tF + (fast ? 0 : FLY_MS);
      later(() => { gx[kv] = "goransel"; paint(R.G()); }, t0);
      later(() => {   // 🍄が、変わる票数のところに出る（変わらないときは、投票先の票数に出るだけ）
        badge[kf] = mush(oldF);
        if (e.ok) badge[kt] = mush(oldT);
        paint(R.G());
        if (!fast) { popBadge(R, kf); if (e.ok) popBadge(R, kt); }
      }, tM);
      if (e.ok) {
        later(() => { badge[kf] = mush(newF); paint(R.G()); if (!fast) flyNumber(R, kf, kt, String(e.w || 1)); }, tF);   // 元の先の票数が減り、数字が新しい先へ飛ぶ
        later(() => { badge[kt] = mush(newT); paint(R.G()); if (!fast) popBadge(R, kt); }, tL);
      }
      later(() => {   // 🍄が消えて、票数だけが残る
        const a = txt(e.ok ? newF : oldF), b = txt(e.ok ? newT : oldT);
        if (a) badge[kf] = a; else delete badge[kf];
        if (e.ok) { if (b) badge[kt] = b; else delete badge[kt]; }
        delete gx[kv]; paint(R.G());
      }, tL + (fast ? R_END - 300 : LAND_MS));
      R.t = t0 + ONE_MS();
    });
  }
  const goranshinMs = (F) => ((F && F.list) || []).length * ONE_MS();   // 妖狐投票の演出用: 御乱心にかかる時間(ms)

  ONW.goranshin = { canUse, targets, used, apply, run, changed, rand, doneText, resultData, actLines, runGoranshin, run2: (R, F, cap) => runGoranshin(R, F, cap), ms: (F) => goranshinMs(F) };

  // ======================================================================
  // 【CPU・COボタン・実績（4of4）】マイクラ版 cpu.js / main.js / stats.js の御乱心に合わせる（fairy と同じ形）
  //   ・本物の御乱心CPUは、昼に必ず「御乱心CO」（cpuClaim）。結果は言わない（ランダムに決まった先は結果発表まで誰にも分からない）。
  //   ・騙りはしない（cpuLie なし）: マイクラ版は昼能力の役職を騙りの候補から外している（dayRoles に GORANSHIN が入っている）。
  //   ・CPUは昼能力を勝手に使わない（ONW.CPU_AUTO_DAY / roles.js の avoidCpuDictator）。デバッグの「昼能力」タブで使わせたときだけ、
  //     net.js hostGoranshin が cpuSpeak を呼び、「〇〇 の投票先をランダムにしていました。」と言う（マイクラ版 cpu.js の御乱心の発言と同じ文）。
  //   ・CPUの投票判断（cpuVoteSee）は足さない: 申告は結果発表まで真偽が分からないため、加点の根拠がない（妖精さんと同じ）。
  // ======================================================================
  const randText = (name) => `${name} の投票先をランダムにしていました。`;
  const randShort = (name) => `${name} の投票先をランダムにした`;
  /** 投票先を変えたあとのCPUの発言（net.js hostGoranshin が、使ったのがCPUで生きているときに呼ぶ）。[{ p, text, short, result, claim, gap }] */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: randText(nm), short: randShort(nm), result: true, claim: { kind: "goranshin", target: e.target }, gap: 3500 }];
  }
  /** COボタンの結果開示の文。マイクラ版 main.js: 「〇〇の投票先をランダムにしていました。」（Web版は名前のあとに空白を入れる） */
  const coText = randText;
  /**
   * 実績（マイクラ版 stats.js と同じ条件。wiki の「御乱心」に定義済みの3つのうち、この試合の結果だけで決まる2つ）:
   *   goranshin_win「キノコの力」 = 最終役職が御乱心で勝利 / goranshin_loss「ぴ〜〜ぶ〜〜」 = 最終役職が御乱心で敗北。
   *   first_goranshin「運命の紐」は「いままでに御乱心になった」履歴の判定（保存側）なのでここでは返さない（A.A. の first_aa と同じ）。
   *   Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（fairy の achievements と同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const cur = g.currentRoles && g.currentRoles[id];
    if (cur !== R().GORANSHIN) return [];   // 最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル経由で御乱心になった人も対象。模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    return [won ? "goranshin_win" : "goranshin_loss"];
  }
  Object.assign(ONW.goranshin, { randText, randShort, cpuSpeak, coText, achievements });

  ONW.defineRole("goranshin", {
    info: { sealTarget: true, deck: 108, name: "御乱心", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 15.98,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから生きている自分以外の1人を選ぶと、その人の投票先をランダムに変更します（生きている全員の中から1人。自分自身になることもあります）。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に御乱心を持っている人が使えます。使ったことは結果発表まで分かりません。" },
    // CPU: 本物は必ず「御乱心CO」（結果なし）。騙りはしない。使ったCPUの発言は cpuSpeak
    cpuClaim(k, g, p, r, i, c) { c.co = "goranshin"; },
    cpuSpeak,
    // 結果開示(COボタン・co.js が kind で引く): 「御乱心CO」だけで終わらせられる(noChain)。結果開示で投票先を変えた相手を選ぶ → 「〇〇 の投票先をランダムにしていました。」（妖精さんと同じ形）
    coResult: {
      kind: "goranshin", targetLabel: "投票先をランダムにした相手", noChain: true,
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "goranshin", target: id }, null, "disclose", randShort(K.nameOf(id))],
    },
    // 結果発表の演出（stage.js の startResult が引く。使うデータは res.goranshin（net.js が ONW.goranshin.resultData で作る））
    //   counts : 「N票」が全員ぶん出たあと（カードをめくる前）に呼ばれる。ペンギン(order 5)より前（order 2。処理順は御乱心→ペンギン→交換者→妖精さん）。stage.js が最初に出す票数は書き換え前の元の得票数（res.goranshin.steps[0]）
    //   skip   : なし（スキップ時の最終形は stage.js が res.counts（御乱心のあとの票数）で出す） / clear: 演出の部品を片付ける
    stageResult: {
      counts: { order: 2, run(R) { runGoranshin(R, R.res.goranshin, true); } },
      clear(R) { if (typeof document !== "undefined" && document.querySelectorAll) document.querySelectorAll(".gr-fly").forEach((e) => e.remove()); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "goransel") delete R.gx[k]; }); },
    },
    groups: { "transform:light_apostle": 46 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 44）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
