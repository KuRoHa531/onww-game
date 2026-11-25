/**
 * 黄泉（村人陣営・昼能力）: 妖精さん・保安官・交換者に続く「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている「自分を含む」1人を選ぶと、その人に付与されている「状態」を断ち切る（1日1回）。
 *   マイクラ版（minecraftver.mcpack の main.js yomiCutStates / game.js / night.js の「黄泉」YOMI）に合わせる。
 *
 * 【仕様（マイクラ版どおり・Web版にある状態だけ）】
 *   ・夜の能力はない。使えるのは、最終盤面で黄泉を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前は使えない。
 *   ・選べるのは、生きている人（自分を含む）。
 *   ・断ち切れる状態（Web版にあるもの。ここに無いマイクラ版の状態は、Web版に入ったら追う）:
 *       shuffler = (+シャッフラー) の印 / reversal = (+反転) / lover = (+恋人) の関係（破局と同じ扱い） / drunk = 未覚醒の酔っ払い（酔いが覚める）/
 *       exec = 処刑人の対象 / avenger = 復讐者の対象 / love_tanner = 一目惚れしてるてるの対象 / freeter = フリーターの就職先 / servant = 従者の主人 /
 *       gremlin = グレムリンの対象 / fairy = 妖精さんのバリアの対象 / seal = 封印の狂人の封印 / muzzle = 口封じ
 *   ・何も断ち切れなくても使ったことになる（マイクラ版 yomiCutStates は cuts が空でも yomiTarget に記録する）。
 *   ・【演出（依頼）】使った本人にだけ、カードを刀で切りつける演出が出る（2of4 以降）。断ち切られたことが相手に分かる状況（封印の解除の通知・酔いが覚める）のときだけ、
 *     使われた人の画面でも、自分のカードが切りつけられる演出が出る（entry.told）。ほかの人には出ない。酔っ払い・墓荒らし・ドッペル経由で黄泉になった人でも同じ。
 *   ・【記録は「だれが（by）だれに（target）」】g.yomiCuts = [{ by, target, cuts: [断ち切った状態のID], told, wake }]（使った順。試合ごとに net.startGame が [] に戻す）。
 *     演出・昼行動結果はこの記録だけを見るので、どの経由で黄泉になった人でも同じように動く。
 *   ・【経由パターン】判定は「最終盤面」の役職で行う: 墓荒らし・怪盗で黄泉のカードを手にした人、ドッペルゲンガーが黄泉をコピーした人、酔いが覚めた酔っ払い（酔い中は使えない）が使える。
 *     模倣の人狼が黄泉を模倣していても使える（ONW.mimic.actRole）。封印の狂人に封印されていると使えない（ONW.seal.dayBlocked）。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（状態が消えることで、既存の勝敗の経路が変わるだけ）。重複役職: 特別扱いなし（docs/overlay-role-priority.md に変更なし）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に yomi はすでに入っている（moses の次）。wiki の order も 49 で一致。末尾追加は不要。
 * 実装の進み具合は docs/yomi.md を参照。
 *
 * 呼び出し: net.js の hostYomi(2of4) → ONW.yomi.canUse / targets / apply。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  /** 封印を断ち切られた人に出す文（マイクラ版 main.js: 「黄泉通知」） */
  const SEAL_TEXT = "封印が断ち切られ解除されました。";
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** 断ち切った状態のID → 昼行動結果に書く名前（マイクラ版 yomiCutLog の detailText に合わせる） */
  const CUT_LABEL = {
    shuffler: "シャッフラー", reversal: "反転", lover: "恋人", drunk: "酔っぱらい状態", exec: "処刑人の対象", avenger: "復讐者の対象", love_tanner: "愛する人",
    freeter: "フリーターの就職先", servant: "従者の主人", gremlin: "グレムリンの対象", fairy: "妖精さんの対象", seal: "封印", muzzle: "口封じ",
    exchanger: "交換者の対象", goranshin: "御乱心の対象", icarus: "イカロスの対象", forget: "忘却の人狼状態", dream: "狼夢人状態", hack: "ハッキング状態",
    nanoka_love: "羅刹の愛する人", long_night: "長夜",
  };
  /** 使われた人に「断ち切られた」と分かる状態（マイクラ版 tellParticipantById の「黄泉通知」が出るもの）。Web版: 封印の解除・酔いが覚める */
  const TOLD = ["seal", "drunk", "forget", "dream", "hack"];

  /** この人が（もう）使ったか */
  const used = (g, id) => (g.yomiCuts || []).filter((e) => e.by === id).length >= (ONW.carmen ? ONW.carmen.dayUses(g, id) : 1);   // カルメンに囁かれた人は昼能力を2回使える（docs/carmen.md）
  /** 黄泉の昼能力を使える人か（最終盤面の役職が黄泉・酔いが覚めている・生きている・まだ使っていない・昼の議論中でタイマーが動いている） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R().YOMI) return false;   // 模倣の人狼が黄泉を模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** 状態を断ち切る相手として選べる人（生きている人。自分を含む） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => !isDead(g, x));
  }

  /** 席の記録（持ち主IDをキーにする map）から、値が target のものを消す。値が配列なら target だけ抜く。消したら true（反転など「値」だけを見る記録用） */
  function dropVals(map, target) {
    if (!map) return false;
    let hit = false;
    Object.keys(map).forEach((k) => {
      const v = map[k];
      if (Array.isArray(v)) {
        if (v.includes(target)) { map[k] = v.filter((x) => x !== target); if (!map[k].length) delete map[k]; hit = true; }
      } else if (v === target) { delete map[k]; hit = true; }
    });
    return hit;
  }
  /** 「持ち主 → 相手」の記録から、target が持ち主のものと、相手が target のものを両方消す（マイクラ版 yomiRemovePairTarget）。消したら true */
  function dropPair(map, target) {
    if (!map) return false;
    let hit = false;
    if (map[target] !== undefined && map[target] !== null && !(Array.isArray(map[target]) && !map[target].length)) { delete map[target]; hit = true; }
    if (dropVals(map, target)) hit = true;
    return hit;
  }

  /**
   * target の「状態」を断ち切る（マイクラ版 yomiCutStates）。戻り値: 断ち切った状態のID（重複なし・実際に何かが消えたものだけ）。
   * notes（配列）には、本人以外も含めて「だれに何を知らせるか」を { id, text } で足す（封印の解除・思い出した/目が覚めた）。送る処理は net.js hostYomi。
   * 酔っ払いは、ここでは「酔いが覚める対象」として cuts に入れるだけ（実際に覚ます処理と通知は net.js の soberUp）。
   */
  function cut(g, target, notes) {
    const cuts = [], note = (id, text) => { if (notes) notes.push({ id, text }); };
    // (+シャッフラー): そのカードの上に置かれた印を全部消す
    const card = ONW.cardAt(g, target);
    if (g.shufflerMarks && g.shufflerMarks[card] && [].concat(g.shufflerMarks[card]).length) { delete g.shufflerMarks[card]; cuts.push("shuffler"); }
    // (+反転): 反転者が target に付けた反転（持ち主ごとの記録 g.reverserTarget[持ち主] = 相手）
    if (dropVals(g.reverserTarget, target)) cuts.push("reversal");
    // (+恋人): target が入っている恋人関係をすべて破局扱い（破局師と同じ g.brokenKeys。配布時の組・純愛者・悪女・キューピッドの組）
    if (ONW.heartbreaker) {
      const rels = ONW.heartbreaker.plan(g, target);
      if (rels.length) { g.brokenKeys = g.brokenKeys || {}; rels.forEach((r) => { g.brokenKeys[r.key] = true; }); cuts.push("lover"); }
    }
    // 未覚醒の酔っ払い: 酔いを覚ます（実際の処理は net.js）
    if (ONW.hiddenDrunk(g, target)) cuts.push("drunk");
    // 役職についた「対象」の記録（持ち主・相手のどちらが target でも消す）
    if (dropPair(g.execTargets, target)) cuts.push("exec");
    if (dropPair(g.avengerTargets, target)) cuts.push("avenger");
    if (dropPair(g.loveTargets, target)) cuts.push("love_tanner");
    if (dropPair(g.freeterTargets, target)) cuts.push("freeter");
    if (dropPair(g.servantMasters, target)) cuts.push("servant");
    if (dropPair(g.gremlinPicks, target)) cuts.push("gremlin");
    if (dropPair(g.muzzleTargets, target)) cuts.push("muzzle");
    if (dropPair(g.nanokaLoveTarget, target)) cuts.push("nanoka_love");   // 羅刹の愛する人（マイクラ版 yomiCutStates の nanoka_love）
    if (dropPair(g.nanokaLongNightTarget, target)) cuts.push("long_night");   // 長夜月の長夜（マイクラ版 yomiCutStates の long_night）
    // 交換者・狂人の交換者: 使った人が target、または交換の2人のどちらかが target の交換を消す（マイクラ版 voteSwapPairs）
    if ((g.exchanges || []).some((e) => e.by === target || e.a === target || e.b === target)) { g.exchanges = g.exchanges.filter((e) => !(e.by === target || e.a === target || e.b === target)); cuts.push("exchanger"); }
    // 御乱心: 使った人が target、または選ばれた人が target の記録と、覚えていたランダムな先を消す
    if ((g.goranshins || []).some((e) => e.by === target || e.target === target)) { g.goranshins = g.goranshins.filter((e) => !(e.by === target || e.target === target)); cuts.push("goranshin"); }
    if (g.goranshinRandom && g.goranshinRandom[target] !== undefined) delete g.goranshinRandom[target];
    // イカロス: target に分け与えた票（記録ごと消えるので、その票は減る。同じ相手にもう一度使える）
    if ((g.icarusGrants || []).some((e) => e.target === target)) { g.icarusGrants = g.icarusGrants.filter((e) => e.target !== target); cuts.push("icarus"); }
    // 妖精さんのバリア: target に付与されたバリア、または target が付与したバリアを取り消す
    if ((g.fairyBarriers || []).some((e) => e.target === target || e.by === target)) { g.fairyBarriers = g.fairyBarriers.filter((e) => !(e.target === target || e.by === target)); cuts.push("fairy"); }
    // エルフリンデ: 本人・封印した相手のどちらを断ち切られても敗北する（マイクラ版 yomiCutStates）。封印の解除そのものは下の封印ブロックが共通で行うので、その前に敗北だけ記録する
    if (ONW.elfrinde) ONW.elfrinde.yomiCut(g, target);
    // 封印の狂人の封印: 封印された側でも封印した側でも解除する（封印の記録 g.sealedBy[封印された席] = 封印した人・g.sealTargets[封印した人] = 封印された席）
    {
      const free = [];
      if (g.sealedBy && g.sealedBy[target]) free.push(target);
      Object.keys(g.sealedBy || {}).forEach((x) => { if (g.sealedBy[x] === target && !free.includes(x)) free.push(x); });
      if (free.length) {
        free.forEach((x) => { delete g.sealedBy[x]; note(x, SEAL_TEXT); });
        dropPair(g.sealTargets, target);
        cuts.push("seal");
      }
    }
    // 銀狼のハッキング: 偽の役職の思い込みを解いて本来の役職を思い出す（マイクラ版 yomiCutStates）。銀狼側の記録（hackTarget）は結果画面のために残す
    if (g.hackRole && g.hackRole[target]) {
      (g.hackCutRole = g.hackCutRole || {})[target] = g.hackRole[target]; (g.hackCut = g.hackCut || {})[target] = true;
      { const fc = g.hackChain && g.hackChain[target]; if (fc && g.morningAct && g.morningAct[target] === fc && !(g.morningDone || {})[target]) delete g.morningAct[target]; }   // 使っていない偽の連鎖は消す
      ["hackRole", "hackSource", "hackView", "hackChain", "hackDayUsed", "hackPred", "hackIcarus"].forEach((k) => { if (g[k]) delete g[k][target]; });
      note(target, "あなたは本来の役職を思い出しました。"); cuts.push("hack");
    }
    // 思い込み: 忘却の人狼は人狼に、狼夢人は村人に戻る（マイクラ版 yomiCutStates: finalRoles を書き換える）
    if (g.currentRoles && g.currentRoles[target] === R().FORGETFUL_WOLF) { g.currentRoles[target] = R().WEREWOLF; note(target, "あなたは人狼であることを思い出しました。"); cuts.push("forget"); }
    else if (g.currentRoles && g.currentRoles[target] === R().WOLF_DREAMER) { g.currentRoles[target] = R().VILLAGER; note(target, "あなたは目が覚めました。村人だったようです。"); cuts.push("dream"); }
    return cuts;
  }

  /**
   * 黄泉の使用を記録する（通信・画面の処理は net.js 側）。戻り値: 記録した { by, target, cuts, told, wake, notes, badge, memory }。条件を満たさなければ null（何も起きない）
   *   cuts  : 断ち切った状態のID（空でも使ったことになる）
   *   told  : 使われた人に「断ち切られた」と分かるか（封印の解除・酔いが覚める・思い出した/目が覚めた）。true のときだけ、使われた人の画面にも切りつける演出を出す
   *   wake  : 酔いが覚める人のID（net.js が soberUp(wake) を呼ぶ）。なければ null
   *   notes : 知らせる文 [{ id, text }]（封印の解除は封印された本人へ。封印した人を断ち切ったときも、封印されていた人へ）
   *   badge / memory : 実績用（村人役についた反転・恋人・シャッフラーを解除 / 忘却・狼夢人・酔っ払いの状態を解除）
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const info = (ONW.ROLE_INFO || {})[g.currentRoles && g.currentRoles[target]], village = !!info && info.team === ONW.TEAM.VILLAGE;   // 断ち切る前の最終役職で「村人役」か（実績用）
    const notes = [], cuts = cut(g, target, notes);
    const e = { by: id, target, cuts, told: cuts.includes("drunk") || notes.some((n) => n.id === target), wake: cuts.includes("drunk") ? target : null, notes,
      badge: village && cuts.some((c) => c === "shuffler" || c === "reversal" || c === "lover"), memory: cuts.some((c) => c === "drunk" || c === "forget" || c === "dream" || c === "hack") };
    (g.yomiCuts = g.yomiCuts || []).push(e);
    return e;
  }

  /** 使った本人に出す文（情報確認）。「〇〇 を断ち切りました。」 */
  function doneText(name) { return `${name} を断ち切りました。`; }
  /** 結果発表の「昼行動結果」用（だれがだれの何を断ち切ったか）。何も断ち切れなかったときは「断ち切ろうとしましたが、何も起こりませんでした。」 */
  function actText(rn, by, target, cuts) {
    const detail = (cuts || []).map((c) => CUT_LABEL[c] || c).join("、");
    return detail ? `${rn("yomi")} ${by} は ${target} の${detail}を断ち切っていました。` : `${rn("yomi")} ${by} は ${target} を断ち切ろうとしましたが、何も起こりませんでした。`;
  }
  /** 結果発表用: 使った順の記録 [{ byId, by, targetId, target, cuts, told }]（nm = IDから名前を返す関数） */
  function view(g, nm) {
    return (g.yomiCuts || []).map((e) => ({ byId: e.by, by: nm(e.by), targetId: e.target, target: nm(e.target), cuts: e.cuts, told: e.told }));
  }
  /** この人に「断ち切られた」と分かる使用があったか（使われた人の画面に、切りつける演出を出す判定。2of4 の演出が使う） */
  const toldTo = (g, id) => (g.yomiCuts || []).filter((e) => e.target === id && e.told);


  /**
   * 実績（保存の仕組みが Web版に無いので、満たした実績IDを返すだけ。moses / fairy と同じ形）。マイクラ版 stats.js:
   *   yomi_loss「涙雨…」= 最終役職が黄泉で敗北 / yomi_cut_village_badge「残夢染める繚乱の一太刀」= 村人役についた反転・恋人・シャッフラーのいずれかを解除 /
   *   yomi_awaken_memory「私たちは、どこかで会ったことがあるか？」= 忘却の人狼・狼夢人・未覚醒の酔っ払いのいずれかの状態を解除（銀狼のハッキングは Web版に無い）。first_yomi は初回判定（保存側）。
   *   最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル・グレムリン経由で黄泉になった人も対象）。記録は g.yomiCuts（使った人 by）だけを見る。
   */
  function achievements(g, id, won) {
    const out = [];
    if (!g || !g.currentRoles || g.currentRoles[id] !== R().YOMI) return out;
    const mine = (g.yomiCuts || []).filter((e) => e.by === id);
    if (!won) out.push("yomi_loss");
    if (mine.some((e) => e.badge)) out.push("yomi_cut_village_badge");
    if (mine.some((e) => e.memory)) out.push("yomi_awaken_memory");
    return out;
  }
  /** 役職別の統計（マイクラ版 stats.js）。最終役職が黄泉の人だけ: 「状態を断ち切った回数」「恋人を断ち切った回数」「記憶や酔いを戻した回数」 */
  function stats(g, id) {
    if (!g || !g.currentRoles || g.currentRoles[id] !== R().YOMI) return {};
    const mine = (g.yomiCuts || []).filter((e) => e.by === id), o = {};
    if (mine.length) o["状態を断ち切った回数"] = mine.length;
    if (mine.some((e) => e.cuts.includes("lover"))) o["恋人を断ち切った回数"] = mine.filter((e) => e.cuts.includes("lover")).length;
    if (mine.some((e) => e.memory)) o["記憶や酔いを戻した回数"] = mine.filter((e) => e.memory).length;
    return o;
  }
  ONW.yomi = { achievements, stats, SEAL_TEXT, canUse, targets, used, cut, apply, view, toldTo, doneText, actText, CUT_LABEL, TOLD };

  // ================================================================
  //  刀で切りつける演出（3of4）: 対象のカードを刀が斜めに走り抜け、斬り筋が走ってカードが揺れる
  //   ・使った人（g.yomiFx.role = "user"）: 選んだ相手（自分を選んだときは自分）のカードが切りつけられる。使った人にしか出ない（net.js hostYomi が本人にだけ yomidone(fx) を送る）
  //   ・使われた人（g.yomiFx.role = "target"）: 黄泉にやられたと分かる状況（封印の解除・酔いが覚める。e.told）のときだけ、自分のカードが切りつけられる（使われた人にだけ yomitold(fx) が届く）
  //   ・ほかの人・観戦者には出ない。経由（酔っ払い・墓荒らし・ドッペル）に関係なく g.yomiCuts の記録だけで決まる。
  //   ★ 刀の絵は swordHtml() だけ（画像に差し替えるときはここだけ直す。例: return `<img src="img/sword.png" alt="">`）
  // ================================================================
  const swordHtml = () => "🗡️";
  const reducedMotion = () => !!(false /* OSのアニメ設定(prefers-reduced-motion)では演出を止めない */);
  const SW_MS = 520, HIT_MS = 430, SLASH_MS = 520, TOTAL_MS = 1500;   // 刀が走り抜ける / 斬った瞬間（カードが揺れる）/ 斬り筋が残る / 全体
  const removeSlashFx = () => { if (document.querySelectorAll) document.querySelectorAll(".yo-fx").forEach((e) => e.remove()); };
  const slashCard = (k) => { const t = document.getElementById("table"); return t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`); };
  /** 席 k のカードを刀で切りつける（見た目だけ）。カードが見つからなければ false */
  function slash(k, kind) {
    const c = slashCard(k), r = c && c.getBoundingClientRect();
    if (!r || !(r.width > 0)) return false;
    removeSlashFx();   // 二重に動かない
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2, th = Math.atan2(r.height, r.width), L = Math.hypot(r.width, r.height) * 1.3;
    const dx = Math.cos(th) * L / 2, dy = Math.sin(th) * L / 2, deg = (-th * 180 / Math.PI).toFixed(1);   // 右上 → 左下へ走る
    const root = document.createElement("div");
    root.className = "yo-fx yo-fx--" + (kind === "target" ? "target" : "user");
    root.innerHTML = `<div class="yo-line" style="left:${cx.toFixed(1)}px;top:${cy.toFixed(1)}px;width:${L.toFixed(1)}px;transform:translate(-50%,-50%) rotate(${deg}deg)"></div><div class="yo-sword">${swordHtml()}</div>`;
    document.body.appendChild(root);
    const sw = root.querySelector(".yo-sword"), ln = root.querySelector(".yo-line"), fast = reducedMotion();
    const S = { x: cx + dx, y: cy - dy }, E = { x: cx - dx, y: cy + dy };
    if (sw && sw.animate) {   // 刀: 右上から走り込み、左下へ抜ける
      const at = (p, sc, rot) => `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%) rotate(${rot}deg) scale(${sc})`;
      sw.animate([{ offset: 0, opacity: 0, transform: at(S, 1.1, 20) }, { offset: 0.1, opacity: 1, transform: at(S, 1.2, 20) }, { offset: 0.9, opacity: 1, transform: at(E, 1.2, 20) }, { offset: 1, opacity: 0, transform: at(E, 1, 20) }],
        { duration: fast ? 1 : SW_MS, delay: 150, easing: "cubic-bezier(.5,0,.9,.6)", fill: "both" });
    }
    if (ln && ln.animate) {   // 斬り筋: 刀が通ったあとに走って、にじんで消える
      const base = `translate(-50%,-50%) rotate(${deg}deg) `;
      ln.animate([{ offset: 0, opacity: 0, transform: base + "scaleX(0)" }, { offset: 0.18, opacity: 1, transform: base + "scaleX(1)" }, { offset: 0.6, opacity: 1, transform: base + "scaleX(1)" }, { offset: 1, opacity: 0, transform: base + "scaleX(1.04) scaleY(2.4)" }],
        { duration: SLASH_MS + 380, delay: fast ? 150 : HIT_MS - 120, easing: "ease-out", fill: "both" });
    }
    if (c.animate && !fast) {   // 斬られた瞬間にカードが揺れて赤く光る
      c.animate([{ transform: "translateX(0)", filter: "none" }, { transform: "translateX(-7px) rotate(-1.5deg)", filter: "brightness(1.5) drop-shadow(0 0 10px rgba(255,60,60,.95))", offset: 0.2 }, { transform: "translateX(6px) rotate(1.2deg)", offset: 0.45 }, { transform: "translateX(-3px)", offset: 0.7 }, { transform: "translateX(0)", filter: "none" }],
        { duration: 520, delay: HIT_MS, easing: "ease-out", composite: "add" });
    }
    setTimeout(() => root.remove(), TOTAL_MS + 300);
    return true;
  }
  /** stage.sync が呼ぶ: g.yomiFx = { role: "user" | "target", target } を受け取って演出する。使った人は選んだ相手のカード、使われた人は自分のカード。戻り値: 演出したか */
  function play(fx, myId) {
    if (!fx) return false;
    const k = fx.role === "target" ? "p:" + myId : "p:" + fx.target;
    return slash(k, fx.role);
  }
  ONW.yomi.play = play; ONW.yomi.slash = slash; ONW.yomi.clearFx = removeSlashFx; ONW.yomi.fxMs = () => TOTAL_MS;

  ONW.defineRole("yomi", {
    info: { sealTarget: true, deck: 113, name: "黄泉", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.95,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、自分を含む生きている1人を選ぶと、その人に付与されている状態（シャッフラー・反転・恋人・未覚醒の酔っ払い・処刑人や復讐者の対象・従者の主人・フリーターの就職先・グレムリンの対象・妖精さんの対象・封印・口封じなど）を断ち切ります。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に黄泉を持っている人が使えます。使った人にだけ、カードを刀で切りつける演出が出ます。" },
    groups: { "transform:light_apostle": 51 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 49）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
