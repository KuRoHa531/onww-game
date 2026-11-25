/**
 * curse_wolf.js — 呪術の人狼（人狼陣営 / deck 132 / 発案: くろは / 元ネタ: オリジナル）
 *
 * マイクラ版（scripts/vote.js の applyCurseWolfExecution / isPiercingVoteKillReason、state.js の ROLE_INFO、
 * stats.js の実績）と Wiki（order 89）を正とする。作者（くろはさん）の依頼メモ（2026-11-25）:
 * 「投票の結果で、呪術が投票しているところが死んだとき、毒で侵されるような演出」。
 *
 * ・能力（投票連動・夜の行動なし）: 投票で、自分が投票した相手が最多得票になった場合、その相手は追放ではなく
 *   「呪殺」で死ぬ（死因は貫通扱い）。判定は vote.js の resolveElimination が、最多得票が決まったあと・
 *   騎士の護衛と身代わり（従者・少佐・マティアス）より前に ONW.curseWolf.applyVoteCurse を呼んで確定させる。
 *     - 投票先は「元の投票先」（game.votes。マイクラ版どおり。ペンギンの滑り・交換者の入れ替え・御乱心の
 *       書き換えは見ない。票数の集計と最多得票の判定は通常の tally）。
 *     - 発動する人: 実効役職（ONW.mimic.eff）が呪術の人狼の人。模倣の人狼が模倣していれば発動する。
 *       封印されている場合は発動しない。昼中に死亡している人は投票できないので発動しない。
 *     - 対象外: 実効役職がチキン / 豆腐の人狼の相手（マイクラ版どおり。チキンはショック死、豆腐は
 *       メンタル崩壊のまま死ぬ）。
 *     - タフガイのはじき返し・人狼王の守りで追放を免れた相手でも、最多得票なら呪殺で死ぬ
 *       （マイクラ版は applyCurseWolfExecution が executedIdsFromVotes のあとに最多得票を見て上書きする）。
 * ・貫通（マイクラ版 isPiercingVoteKillReason = curse_kill / poison と同じ扱い）: 呪殺で死んだ人には
 *     - 騎士の護衛・従者/少佐/マティアスの身代わりが働かない（vote.js・matthias.js 側で curseKillIds を除外）。
 *     - 追放で発動する能力が発動しない: 道連れ（猫又・黒猫・わら人形）・アサシンの暗殺・賞金稼ぎの指名・
 *       道化の爆弾魔の爆発・てるてる坊主/一目惚れしてるてるの勝利・道化の狂人の勝利・神の祝福（vote.js 側）。
 *     - 恋人の心中・キューピッドの後追い・背徳者の後追いも起きない（resolveChain の波と始めの心中の対象外）。
 *     - 呪われし者は人狼陣営にならない（vote.cursedWolfIds の対象外）。シュレディンガーの猫は参照先を持たない
 *       （resolveCats で catSources を消す。マイクラ版 assignSchrodingerSources の curse_kill 除外どおり）。
 *     - 処刑人は、ターゲットが呪殺で死んでも勝利する（マイクラ版 getSuccessfulExecutioners は実行集合だけを見る）。
 *     - 女王が呪殺で死んだ場合は王国滅亡が起きる（マイクラ版 applyQueenKingdomDeaths に除外が無い）。
 *     - 乞食は呪殺で死んだ人の役職を取れない（beggar.js の deathReason が "curse_kill" を返し、
 *       候補グループのどれにも入らない。マイクラ版 beggarDeathCandidateGroups どおり）。
 * ・勝利条件は通常の人狼陣営（追加勝利・単独勝利なし）。占い結果は「呪術の人狼」。
 * ・ハッキング: 対象外には入っていない（マイクラ版の除外はヴァニティ・ホタルのみ）。
 *   呪術の人狼と思い込んだ人には、銀狼の共通仕組みで人狼系の偽の夜情報（仲間の人狼）が出る
 *   （silver_wolf.js の WOLFVIEW に追加）。思い込んだ人の投票では呪殺は発動しない（実効役職で判定）。
 *   本物の呪術の人狼が思い込まされたときは、実効役職が呪術の人狼のままなので呪殺は発動する。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / NON_MIMICABLE_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   闇の化身 = 入る（人狼系）/ 光の使徒・銀色の影 = 入らない / 模倣 = できる（模倣した人は呪殺も発動する。
 *   マイクラ版 roleForMimicEffect どおり）/ コスプレ = 入らない（村人陣営のみ）/
 *   シャッフラー = 山札に入る（マイクラ版の除外に CURSE_WOLF は無い）/ ペルソナ = Web版未実装。
 * ・乞食: 本物の人狼系は構造的に取れない（beggar.js が WOLF_KIND を除外）ので変更なし。
 *   逆に、呪殺で死んだ人の役職は乞食が取れない（上の「貫通」参照）。
 * ・シナジー: 呪術の人狼がトリガーのルールはマイクラ版に無いので追加しない。封印シナジーの対象には sealTarget で自動で入る。
 * ・封印: 発動条件として「封印されている場合は発動しません」（Wiki / マイクラ版 applyCurseWolfExecution）。
 *   封印の対象役職（info.sealTarget）にもマイクラ版 YAMINABE_SEAL_TARGET_ROLES どおり入る。
 * ・見張り番・詩人・観測の人狼: 夜に行動しないので「行動した」扱いにならない。新聞にも載らない。
 * ・CPU: 夜の学習は人狼系共通（相方を知る）。投票は通常の人狼CPUと同じ（専用の投票スコアなし）。
 *   結果開示の専用文は付けない（マイクラ版 main.js に呪術の人狼のCO結果は無い。通常の人狼と同じ扱い）。
 * ・実績（マイクラ版 stats.js。Web版には保存が無いので判定関数だけ）:
 *   first_curse_wolf「禁断の呪術師」/ win_curse_wolf「狼の呪詛」/ lose_curse_wolf「呪いは変える」/
 *   curse_wolf_kill「その命、ここで終わりだ。」（呪殺を成功させた）。
 * ・結果発表の演出（作者指定）: 呪殺された人のカードは「呪殺」の札でめくれ、毒に侵される演出が出る
 *   （stageResult.flipped フック: カードが紫と緑の毒に下から侵されていき、毒色に染まったまま残る。
 *   CSS は css/style.css の gx-poison / gx-poisoned）。字幕は「呪殺」グループで 呪術の人狼 → 対象 を出す（stage.js）。
 */
(function (ONW) {
  const ID = "curse_wolf";
  const K = ONW.wolfKit;
  const eff = (g, id) => (ONW.mimic ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);

  /**
   * 呪殺の確定（マイクラ版 applyCurseWolfExecution）。vote.js の resolveElimination が、最多得票と
   * 追放フック（タフガイ・人狼王）・メンタル崩壊・ショック死まで決まったあと、騎士の護衛・身代わりより前に呼ぶ。
   * counts / maxVotes は resolveElimination が集計したもの（通常の tally）。
   * 記録: game.curseWolfKills = { 呪術の人狼のID: 対象のID } / game.curseKillIds = [対象のID...]（席順）。
   * 対象は game.eliminated に入れる（はじき返し・守りで外れていたら戻す）。戻り値: game.curseKillIds。
   */
  function applyVoteCurse(g, counts, maxVotes) {
    g.curseWolfKills = {}; g.curseKillIds = [];
    if (!g || !g.players || !g.currentRoles || !counts || !maxVotes) return g.curseKillIds;
    const top = new Set(Object.keys(counts).filter((id) => counts[id] === maxVotes));
    if (!top.size) return g.curseKillIds;
    const gone = new Set(g.deadIds || []);
    (g.players || []).forEach((p) => {
      if (gone.has(p.id)) return;                                   // 昼中に死亡している人は投票できない
      if (eff(g, p.id) !== ID) return;                               // 実効役職（模倣の人狼が模倣していれば発動する）
      if (ONW.seal && ONW.seal.is(g, p.id)) return;                  // 封印されている場合は発動しない
      const t = (g.votes || {})[p.id];                               // 元の投票先（マイクラ版 game.votes。票の書き換え系は見ない）
      if (!t || !top.has(t) || gone.has(t)) return;
      const tr = eff(g, t);
      if (tr === ONW.ROLE.CHICKEN || tr === ONW.ROLE.TOFU_WOLF) return;   // チキン・豆腐の人狼は対象外（マイクラ版どおり）
      g.curseWolfKills[p.id] = t;
      if (!g.curseKillIds.includes(t)) g.curseKillIds.push(t);
      if (!(g.eliminated || []).includes(t)) (g.eliminated = g.eliminated || []).push(t);   // 追放を免れていても呪殺で死ぬ
    });
    return g.curseKillIds;
  }

  /** 実績（マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_curse_wolf");
    if (cur === ID && won) out.push("win_curse_wolf");
    if (cur === ID && !won) out.push("lose_curse_wolf");
    if ((g.curseWolfKills || {})[id]) out.push("curse_wolf_kill");
    return out;
  }

  ONW.curseWolf = { holders, applyVoteCurse, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 132, name: "呪術の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.597,
      desc: "人狼陣営。自分が投票した相手が最多得票になった場合、その相手を追放ではなく呪殺します。呪殺は追放時に発動する能力や身代わり、護衛を貫通します。封印されている場合は発動しません。" },
    groups: { wolf: 8.98, "transform:dark_avatar": 9.48 },   // 人狼系（闇の化身の変化先。並びは ROLE_ORDER = wiki の order 89）
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,   // 人狼系共通の夜情報（仲間の人狼）
    // 結果発表の演出: 呪殺されたカードが毒に侵される（めくれた直後、紫と緑の毒が下から這い上がり、カードが毒色に染まる）
    stageResult: {
      flipped: { order: 30, run(R, hs, at) {
        const hit = (hs || []).filter((h) => h.curseKill);
        if (!hit.length) return 0;
        const { later, paint, G, gx, P } = R;
        hit.forEach((h) => {
          later(() => { gx[P(h.id)] = "poison"; if (ONW.sound) ONW.sound.se("curse_kill"); paint(G()); }, at + 450);   // SE: 呪殺（妖狐の呪殺と同じ音）
          later(() => { if (gx[P(h.id)] === "poison") { gx[P(h.id)] = "poisoned"; paint(G()); } }, at + 2150);          // 毒に染まったまま残る
        });
        return 1750;
      } },
      skip(R) { (R.res.history || []).forEach((h) => { if (h.curseKill) R.gx[`p:${h.id}`] = "poisoned"; }); },   // スキップ時: 最初から毒に染まった状態で見せる
    },
  });
})(window.ONW);
