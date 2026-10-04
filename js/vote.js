/**
 * vote.js
 * ------------------------------------------------------------
 * 昼フェーズ（議論タイム→投票→結果判定）の進行を扱うファイル。
 * 勝敗判定は ONE NIGHT WEREWOLF の基本ルールに沿った簡易版で、
 * 役職追加にともなう特殊勝利条件（エセ人狼以外の特殊勝利など）は
 * TODO として今後詰めていく。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const vote = {};

  /** 議論タイムを開始する（タイマーは任意） */
  vote.startDiscussion = function startDiscussion(game) {
    game.phase = ONW.PHASE.DAY;
    game.votePhaseStarted = false;
    game.discussionSecondsLeft = game.timers?.day ?? 0;
  };

  /**
   * 狂人の人狼判定昇格（狂人代用人狼）。
   * 設定ONで、最終盤面に本物の人狼が1人もおらず、狂人がいるとき、
   * 狂人のうち1人をランダムで人狼判定に昇格させる。
   */
  vote.updatePromotion = function updatePromotion(game) {
    game.promotedWolfIds = [];
    if (!game.fakeWolfWhenNoWolf) return;
    const ids = game.players.map((p) => p.id);
    if (ids.some((id) => ONW.WOLF_KIND.includes(game.currentRoles[id]))) return;
    const mads = ids.filter((id) => ONW.MAD_KIND.includes(game.currentRoles[id]));
    if (mads.length) game.promotedWolfIds = [ONW.utils.randomChoice(mads)];
  };

  /** 人狼判定のプレイヤーID（本物の人狼 + 昇格した狂人） */
  vote.wolfJudgeIds = function wolfJudgeIds(game) {
    return game.players.map((p) => p.id).filter((id) =>
      ONW.WOLF_KIND.includes(game.currentRoles[id]) ||
      ((game.promotedWolfIds || []).includes(id) && ONW.MAD_KIND.includes(game.currentRoles[id])));
  };

  /** 投票フェーズへ切り替える */
  vote.startVoting = function startVoting(game) {
    game.votePhaseStarted = true;
    game.votes = {};
  };

  /** 1票を記録する */
  vote.castVote = function castVote(game, voterId, targetId) {
    game.votes[voterId] = targetId;
  };

  /** 全員分の投票が揃っているか */
  vote.isVotingComplete = function isVotingComplete(game) {
    return game.players.every((p) => game.votes[p.id] != null);
  };

  /** 得票数を集計する */
  vote.tally = function tally(game) {
    const counts = {};
    Object.values(game.votes).forEach((targetId) => {
      counts[targetId] = (counts[targetId] || 0) + 1;
    });
    return counts;
  };

  /**
   * 投票結果から追放者を決める。
   * 基本ルール: 最多得票者が追放（複数いれば全員追放）。
   * TODO: 「得票なしなら誰も死なない」以外の特殊ルール(村長等)を追加する。
   */
  vote.resolveElimination = function resolveElimination(game) {
    const counts = vote.tally(game);
    const maxVotes = Math.max(0, ...Object.values(counts));
    if (maxVotes === 0) {
      game.eliminated = [];
      return game.eliminated;
    }
    game.eliminated = Object.keys(counts).filter((id) => counts[id] === maxVotes);
    return game.eliminated;
  };

  /**
   * 勝敗を判定する。
   * TODO: 役職追加後の特殊勝利条件（エセ人狼以外のサブ陣営など）に対応する。
   * 現状は基本ルールの簡易版:
   *   - エセ人狼が追放された → エセ人狼の勝ち
   *   - 人狼が1体でも追放された → 村人陣営の勝ち
   *   - 人狼が追放されず、誰も死ななかった／人狼以外だけ死んだ → 人狼陣営の勝ち
   */
  vote.determineWinners = function determineWinners(game) {
    ONW.vote.updatePromotion(game);
    const finalRoleOf = (id) => game.currentRoles[id];
    const eliminatedRoles = game.eliminated.map(finalRoleOf);

    // マイクラ版準拠の基本勝敗。
    //  ・「人狼判定」= 最終盤面の本物の人狼 + 昇格した狂人
    //  ・人狼判定の者が追放された → 村人陣営の勝ち
    //  ・人狼判定の者が誰も追放されなかった → 人狼陣営の勝ち
    //    （他に人狼判定がいれば、狂人だけが追放されても人狼陣営は負けない）
    //  ・人狼判定の者が最終盤面に1人もいない → 村人陣営の勝ち
    game.winnerIds = null;
    const tanners = game.eliminated.filter((id) => game.currentRoles[id] === ONW.ROLE.TANNER);
    if (tanners.length) {                  // てるてる坊主が追放されたら、その人の単独勝利（第三陣営）
      game.winners = [ONW.TEAM.THIRD];
      game.winnerIds = tanners;
      game.winDetail = "てるてる坊主が追放されました。";
      return game.winners;
    }
    const wolves = ONW.vote.wolfJudgeIds(game);
    const wolfDied = game.eliminated.some((id) => wolves.includes(id));
    game.winners = (wolves.length === 0 || wolfDied) ? [ONW.TEAM.VILLAGE] : [ONW.TEAM.WOLF];
    const fake = !!game.fakeWolfWhenNoWolf;
    const nm = (ids) => ids.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    if (wolves.length === 0) game.winDetail = fake ? "最終盤面に本物の人狼も人狼判定の狂人もいませんでした。" : "最終盤面に本物の人狼がいませんでした。";
    else if (wolfDied) game.winDetail = `追放された${fake ? "人狼判定" : "人狼"}: ${nm(game.eliminated.filter((id) => wolves.includes(id)))}`;
    else game.winDetail = fake ? "人狼判定の者が追放されませんでした。" : "本物の人狼が追放されませんでした。";
    return game.winners;
  };

  ONW.vote = vote;

})(window.ONW);
