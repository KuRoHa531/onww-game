/**
 * snake_madman.js — 蛇の狂人（人狼陣営・狂人系 / deck 148 / wiki order 113 / 発案: くろは / 元ネタ: オリジナル）
 *
 * 作者（くろはさん）の依頼メモ（2026-11-25）: 「蛇は呪術と同じ」。仕組みは呪術の人狼（curse_wolf.js）と同一で、
 * マイクラ版（scripts/vote.js の applyCurseWolfExecution が CURSE_WOLF と SNAKE_MADMAN を同じ関数で処理し、
 * 死因だけ curse_kill / poison に分ける）どおり。演出は作者指定の「毒の侵食」（カードが毒に下から侵食される。
 * かつて呪術の人狼に誤って付け、作者訂正で外して蛇用に温存されていたもの。css の gx-poison / gx-poisoned）。
 *
 * ・能力（投票連動・夜の行動なし）: 投票で、自分が投票した相手が最多得票になった場合、その相手は追放ではなく
 *   「毒殺」で死ぬ（死因は貫通扱い）。判定は vote.js の resolveElimination が、呪術の人狼の applyVoteCurse の
 *   直後に ONW.snakeMadman.applyVotePoison を呼んで確定させる。
 *     - 投票先は「元の投票先」（game.votes。マイクラ版どおり。ペンギンの滑り・交換者の入れ替え・御乱心の
 *       書き換えは見ない。票数の集計と最多得票の判定は通常の tally）。
 *     - 発動する人: 実効役職（ONW.mimic.eff）が蛇の狂人の人。模倣の人狼が模倣していれば発動する
 *       （マイクラ版 roleForMimicEffect）。封印されている場合は発動しない。昼中に死亡している人は投票できない。
 *     - 対象外: 実効役職がチキン / 豆腐の人狼の相手（マイクラ版どおり。チキンはショック死、豆腐の人狼は
 *       メンタル崩壊のまま死ぬ）。奇数人・偶数人がパリティ判定で既に「拒絶」で死亡確定している相手も
 *       対象外（死因は拒絶のまま。呪術と同じ。odd_one.js の parityRejectIds）。
 * ・貫通（マイクラ版 isPiercingVoteKillReason = curse_kill / poison）: Web版では毒殺の対象も呪殺と同じ
 *   game.curseKillIds に載せる（傭兵 docs/mercenary.md の既存の約束「Web版の毒死は curseKillIds に乗る」）。
 *   そのため騎士・傭兵の護衛、従者/少佐/マティアスの身代わり、道連れ・心中・後追い、てるてる系の勝利、
 *   呪われし者の人狼化、神の祝福、猫の参照先、乞食の取得は、すべて呪殺と同じく読み飛ばされる。
 *   処刑人はターゲットが毒殺で死んでも勝利し、女王が毒殺で死んだ場合は王国滅亡が起きる（呪殺と同じ）。
 *   表示だけが分かれる: 毒殺された人は game.poisonKillIds にも入り、バッジ・状態・字幕は「毒殺」、
 *   演出は毒の侵食（gx-poison）になる。呪術と蛇が同じ相手を最多得票で狙った場合は、マイクラ版が
 *   参加者順に死因を上書きするのに合わせ、席順で後の行為者の死因が表示される（net.js buildResultObj）。
 * ・勝利条件は通常の人狼陣営（追加勝利・単独勝利なし）。占い結果は「蛇の狂人」。狂人系なので人狼が誰かは分からない。
 * ・ハッキング: マイクラ版の対象外（ヴァニティ・ホタルのみ）に入っていないので、対象にも思い込み先にもなる。
 *   受動役職で偽の夜情報は無い（龍の狂人と同じ扱い）。思い込んだ人の投票では毒殺は発動しない（実効役職で判定）。
 *   本物の蛇の狂人が思い込まされたときは、実効役職が蛇の狂人のままなので毒殺は発動する。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / NON_MIMICABLE_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   闇の化身 = 入る（干支狂人全役が入る）/ 光の使徒・銀色の影 = 入らない / 模倣 = できる（模倣した人の投票でも
 *   毒殺が発動する）/ コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入る（マイクラ版のブロック対象は
 *   兎・龍・犬のみ）/ ペルソナ = Web版未実装。
 * ・乞食: 狂人系は取れる（マイクラ版の除外リストに無い）。逆に、毒殺で死んだ人の役職は乞食が取れない
 *   （死因 poison はマイクラ版 beggarDeathCandidateGroups のどの候補グループにも入らない。Web版では
 *   curseKillIds に載るため deathReason が "curse_kill" になり、同じく取れない）。
 * ・封印: 発動条件として「封印されている場合は発動しません」。封印の対象役職にもマイクラ版
 *   YAMINABE_SEAL_TARGET_ROLES どおり入る（sealTarget: true。蛇は同リストに明示されている）。
 * ・シナジー: 蛇固有のトリガーはマイクラ版に無いので追加しない（干支シナジーの確率ルールも先行干支狂人と
 *   同様に未実装）。封印シナジーの対象には sealTarget で自動で入る。
 * ・見張り番・詩人・観測の人狼: 夜に行動しないので「行動した」扱いにならない。新聞にも載らない。
 * ・CPU: 夜の行動は無く、投票は通常の人狼陣営CPUと同じ（専用の投票スコアなし）。結果開示の専用文は
 *   マイクラ版 main.js に無いため付けない（呪術の人狼と同じ扱い）。
 * ・デバッグ: 対象を選ぶ能力が無い受動役職なので専用配線は無し（呪術の人狼・統率の人狼と同じ扱い）。
 * ・実績（判定だけ。wiki-data.js / マイクラ版 stats.js）: win_snake_madman「致命の一滴」/
 *   zodiac_snake_madman「巳年」（first_snake_madman「毒牙を隠す者」は履歴判定のため先行干支狂人どおり返さない。
 *   マイクラ版では game.curseWolfKills が呪術と共有で、蛇の毒殺でも curse_wolf_kill が付く作りだが、
 *   Web版は記録を分けたため付けない）。
 * ・結果発表の演出（作者指定）: 毒殺された人のカードは「毒殺」の札でめくれ、直後に毒の侵食演出
 *   （stageResult.flipped フック + CSS gx-poison / gx-poisoned）: 紫と緑の毒がカードの下から這い上がり、
 *   カード全体を侵食してそのまま残る。字幕は「毒殺」グループで 蛇の狂人 → 対象 を出す（stage.js）。
 *   結果の役職情報にも「蛇の狂人: X は Y を毒殺しました。」の行が出る。スキップ時は最初から侵食された状態で表示。
 */
(function (ONW) {
  const ID = "snake_madman";
  const eff = (g, id) => (ONW.mimic ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"]; // 蛇以外の干支狂人

  /**
   * 毒殺の確定（マイクラ版 applyCurseWolfExecution の SNAKE_MADMAN 分）。vote.js の resolveElimination が、
   * 呪術の人狼の applyVoteCurse の直後（騎士の護衛・身代わりより前）に呼ぶ。
   * counts / maxVotes は resolveElimination が集計したもの（通常の tally）。
   * 記録: game.snakeMadmanKills = { 蛇の狂人のID: 対象のID } / game.poisonKillIds = [対象のID...]（席順）。
   * 対象は貫通用に game.curseKillIds にも入れ、game.eliminated にも入れる（はじき返し・守りで外れていたら戻す）。
   * 戻り値: game.poisonKillIds。
   */
  function applyVotePoison(g, counts, maxVotes) {
    g.snakeMadmanKills = {}; g.poisonKillIds = [];
    if (!g || !g.players || !g.currentRoles || !counts || !maxVotes) return g.poisonKillIds;
    const top = new Set(Object.keys(counts).filter((id) => counts[id] === maxVotes));
    if (!top.size) return g.poisonKillIds;
    const gone = new Set(g.deadIds || []);
    (g.players || []).forEach((p) => {
      if (gone.has(p.id)) return;                                   // 昼中に死亡している人は投票できない
      if (eff(g, p.id) !== ID) return;                               // 実効役職（模倣の人狼が模倣していれば発動する）
      if (ONW.seal && ONW.seal.is(g, p.id)) return;                  // 封印されている場合は発動しない
      const t = (g.votes || {})[p.id];                               // 元の投票先（マイクラ版 game.votes。票の書き換え系は見ない）
      if (!t || !top.has(t) || gone.has(t)) return;
      const tr = eff(g, t);
      if (tr === ONW.ROLE.CHICKEN || tr === ONW.ROLE.TOFU_WOLF) return;   // チキン・豆腐の人狼は対象外（マイクラ版どおり）
      if ((g.parityRejectIds || []).includes(t)) return;   // 奇数人・偶数人がパリティ判定で既に「拒絶」で死亡確定している相手は対象外（死因は拒絶のまま。マイクラ版 applyCurseWolfExecution）
      g.snakeMadmanKills[p.id] = t;
      if (!g.poisonKillIds.includes(t)) g.poisonKillIds.push(t);
      if (!(g.curseKillIds || []).includes(t)) (g.curseKillIds = g.curseKillIds || []).push(t);   // 貫通する死として呪殺と同じ集合に載せる（Web版の約束）
      if (!(g.eliminated || []).includes(t)) (g.eliminated = g.eliminated || []).push(t);   // 追放を免れていても毒殺で死ぬ
    });
    return g.poisonKillIds;
  }

  /** 実績（wiki-data.js の「蛇の狂人」に定義済み。履歴判定の first_snake_madman は返さない=先行干支狂人と同じ） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;   // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    if (won) out.push("win_snake_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_snake_madman");
    return out;
  }

  ONW.snakeMadman = { holders, applyVotePoison, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 148, name: "蛇の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.7000,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。自分が投票した相手が最多得票になった場合、その相手は追放ではなく毒殺で死にます。毒殺は追放時に発動する能力や身代わり、護衛を貫通します。封印されている場合は発動しません。" },
    groups: { mad: 3.001, "transform:dark_avatar": 30 },   // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER = wiki の order 113
    // 結果発表の演出: 毒殺されたカードが毒に侵食される（めくれた直後、紫と緑の毒が下から這い上がってカード全体を侵食し、そのまま残る）
    stageResult: {
      flipped: { order: 30, run(R, hs, at) {
        const hit = (hs || []).filter((h) => h.poisonKill);
        if (!hit.length) return 0;
        const { later, paint, G, gx, P } = R;
        hit.forEach((h) => {
          later(() => { gx[P(h.id)] = "poison"; if (ONW.sound) ONW.sound.se("curse_kill"); paint(G()); }, at + 450);   // SE: 呪殺と同じ（投票の貫通死）
          later(() => { if (gx[P(h.id)] === "poison") { gx[P(h.id)] = "poisoned"; paint(G()); } }, at + 2150);          // 侵食されたまま残る
        });
        return 1750;
      } },
      skip(R) { (R.res.history || []).forEach((h) => { if (h.poisonKill) R.gx[`p:${h.id}`] = "poisoned"; }); },   // スキップ時: 最初から侵食された状態で見せる
    },
  });
})(window.ONW);
