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
    // 配布時にすでに決めてある昇格者（certainPromotion が決めたもの）が、まだ狂人系ならその人を優先する
    if (mads.length) game.promotedWolfIds = [mads.includes(game.masterPick) ? game.masterPick : ONW.utils.randomChoice(mads)];
  };

  /**
   * 配布時点で「この狂人が昇格する」と確定しているときだけ、そのプレイヤーIDを返す（なければ null）。
   * 確定する条件: 狂人代用人狼ON / 人狼系が誰にも配られていない / 狂人系が1人以上（2人以上なら配布時に1人を抽選して固定） /
   *              役職を動かす役職（怪盗・墓荒らし・いたずらっ子）が配られていない（動くと昇格先が変わるため）
   * 墓地は、墓荒らしがいなければ誰にも届かないので条件に含めない。
   */
  vote.certainPromotion = function certainPromotion(game) {
    if (!game.fakeWolfWhenNoWolf) return null;
    const R = ONW.ROLE, ids = game.players.map((p) => p.id), ini = game.initialRoles;
    if (ids.some((id) => [R.ROBBER, R.RELIC_ROBBER, R.TROUBLEMAKER].includes(ini[id]))) return null;
    if (ids.some((id) => ONW.WOLF_KIND.includes(ini[id]))) return null;
    const mads = ids.filter((id) => ONW.MAD_KIND.includes(ini[id]));
    if (mads.length === 1) return mads[0];
    if (mads.length >= 2) {   // 狂人系が複数いても、配布の時点で昇格する1人を決めておく（狂信者に見せるため。最後の昇格もこの人になる）
      if (!mads.includes(game.masterPick)) game.masterPick = ONW.utils.randomChoice(mads);
      return game.masterPick;
    }
    return null;
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
   * 追放の連鎖を解決する。
   * 一目惚れしてるてる(最終役職)が追放されたら、夜に選んだ相手も一緒に追放扱いになる（連鎖もする）。
   * 夜の選択は「役職の持ち主」単位で保存（game.loveTargets[持ち主ID] = 選んだ相手）。
   * 役職が移動したら選択も移動先の持ち主へ移る（ONW.swapPlayers / swapGrave が自動で移す）。選ばれた相手はプレイヤー単位のまま。
   * 【必読】役職に紐づく状態を増やす役職は state.js の「役職の移動と role-bound state」メモのルールに必ず従うこと。
   * 戻り値: 追放されたプレイヤーID全員（投票で追放された人 + 巻き込まれた人）
   */
  vote.resolveChain = function resolveChain(game) {
    const done = new Set(game.eliminated), queue = [...game.eliminated];
    game.chainIds = []; game.chainBy = {};
    while (queue.length) {
      const id = queue.shift();
      if (game.currentRoles[id] !== ONW.ROLE.LOVE_TANNER) continue;
      const t = (game.loveTargets || {})[id];
      if (t && !done.has(t) && game.players.some((p) => p.id === t)) { done.add(t); queue.push(t); game.chainIds.push(t); game.chainBy[t] = id; }
    }
    return [...done];
  };

  /**
   * 勝敗を判定する（マイクラ版の優先順位に準拠。このWeb版にある役職の範囲）。
   *   1. 神が追放された        → 神の祝福: 神以外の全員が勝利（追放されたオポチュニストは除く）
   *   2. てるてる系が追放された → 追放されたてるてる系の勝利（一目惚れしてるてるは選んだ相手も勝利）
   *   3. 神が追放されていない   → 神降臨: 神の単独勝利
   *   4. それ以外              → 村人陣営 / 人狼陣営の基本勝敗
   *   ・オポチュニストは、どの結果でも「追放されていなければ」追加で勝利
   * 結果は game.winners（陣営キー）/ winnerIds / winTitle / winTeams / winDetail / executed に入れる。
   */
  vote.determineWinners = function determineWinners(game) {
    ONW.vote.updatePromotion(game);
    const R = ONW.ROLE, ids = game.players.map((p) => p.id);
    const role = (id) => game.currentRoles[id];
    const nm = (list) => list.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    const executed = ONW.vote.resolveChain(game);
    game.executed = executed;
    const dead = new Set([...executed, ...(game.deadIds || [])]);   // 追放された人 + 昼中に死亡した人
    const gods = ids.filter((id) => role(id) === R.GOD);
    const tanners = executed.filter((id) => role(id) === R.TANNER);
    const loveTanners = executed.filter((id) => role(id) === R.LOVE_TANNER);
    const opportunists = ids.filter((id) => role(id) === R.OPPORTUNIST && !dead.has(id));

    const set = (title, teams, winners, detail, winnerTeams) => {
      game.winTitle = title; game.winTeams = teams; game.winDetail = detail; game.winners = winnerTeams;
      const w = new Set(winners);
      opportunists.forEach((id) => w.add(id));                       // オポチュニスト: 追放されていなければ追加勝利
      if (opportunists.length && !teams.includes("オポチュニスト")) teams.push("オポチュニスト");
      game.winnerIds = [...w];
      return game.winners;
    };

    // 1. 神の祝福
    if (gods.some((id) => executed.includes(id))) {
      const win = ids.filter((id) => role(id) !== R.GOD && !(role(id) === R.OPPORTUNIST && dead.has(id)));
      return set("神の祝福を受けました", ["神の祝福"], win,
        `神 ${nm(gods.filter((id) => executed.includes(id)))} が追放されたため、神以外の全員が勝利です。追放されたオポチュニストは勝利できません。`, [ONW.TEAM.THIRD]);
    }
    // 2. てるてる系の勝利
    if (tanners.length || loveTanners.length) {
      const win = [...tanners, ...loveTanners];
      loveTanners.forEach((id) => { const t = (game.loveTargets || {})[id]; if (t) win.push(t); });
      const teams = [], parts = [];
      if (tanners.length) { teams.push("てるてる坊主"); parts.push(`追放されたてるてる坊主: ${nm(tanners)}`); }
      if (loveTanners.length) { teams.push("一目惚れしてるてる"); parts.push(`追放された一目惚れしてるてる: ${nm(loveTanners)}`); }
      return set(`${teams.join("＆")}勝利`, teams, win, parts.join(" / "), [ONW.TEAM.THIRD]);
    }
    // 3. 神降臨（神が追放されなかった）
    if (gods.length) {
      return set("神降臨", ["神"], gods, "神が追放されませんでした。", [ONW.TEAM.THIRD]);
    }
    // 4. 基本勝敗（マイクラ版準拠）
    //  ・「人狼判定」= 最終盤面の本物の人狼 + 昇格した狂人
    //  ・人狼判定の者が追放された → 村人陣営の勝ち / 誰も追放されなかった → 人狼陣営の勝ち
    //    （他に人狼判定がいれば、狂人だけが追放されても人狼陣営は負けない）
    //  ・人狼判定の者が最終盤面に1人もいない → 村人陣営の勝ち
    const wolves = ONW.vote.wolfJudgeIds(game);
    const wolfDied = executed.some((id) => wolves.includes(id));
    const side = (wolves.length === 0 || wolfDied) ? ONW.TEAM.VILLAGE : ONW.TEAM.WOLF;
    const fake = !!game.fakeWolfWhenNoWolf;
    let detail;
    if (wolves.length === 0) detail = fake ? "最終盤面に本物の人狼も人狼判定の狂人もいませんでした。" : "最終盤面に本物の人狼がいませんでした。";
    else if (wolfDied) detail = `追放された${fake ? "人狼判定" : "人狼"}: ${nm(executed.filter((id) => wolves.includes(id)))}`;
    else detail = fake ? "人狼判定の者が追放されませんでした。" : "本物の人狼が追放されませんでした。";
    const win = ids.filter((id) => ONW.roles.getInfo(role(id)).team === side);
    return set(side === ONW.TEAM.VILLAGE ? "村人陣営勝利" : "人狼陣営勝利", [side === ONW.TEAM.VILLAGE ? "村人陣営" : "人狼陣営"], win, detail, [side]);
  };

  ONW.vote = vote;

})(window.ONW);
