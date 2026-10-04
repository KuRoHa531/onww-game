/**
 * night.js
 * ------------------------------------------------------------
 * 夜フェーズの「進行」だけを扱うファイル。
 * 各役職の能力そのもの（誰を占う／交換する等）はまだ実装しておらず、
 * resolveNightAction() の中に TODO として空けてある。
 * まずは「役職の起きる順番どおりに画面が進んでいく」骨組みを作る。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const night = {};

  /** 夜フェーズを開始する */
  night.start = function start(game) {
    game.phase = ONW.PHASE.NIGHT;
    game.nightOrderCache = ONW.roles.buildNightOrder(game);
    game.nightStepIndex = 0;
  };

  /** 現在の手番の役職を返す（もう誰もいなければ null） */
  night.currentRole = function currentRole(game) {
    return game.nightOrderCache[game.nightStepIndex] ?? null;
  };

  /** 現在の手番で行動するプレイヤー一覧を返す */
  night.currentActors = function currentActors(game) {
    const role = night.currentRole(game);
    if (!role) return [];
    return game.players.filter((p) => game.initialRoles[p.id] === role);
  };

  /**
   * 役職の能力を実行する。
   * TODO: 占い師・怪盗・いたずらっ子・共有者・後覚者など、
   *       役職ごとの実際の処理をここに実装していく。
   *       現時点では「何もしない」プレースホルダーになっている。
   */
  night.resolveNightAction = function resolveNightAction(game, player, role, _payload) {
    game.log.push(`[夜] ${player.name}(${ONW.roles.getInfo(role).name}) の行動 — TODO: 未実装`);
    // 例: role === ONW.ROLE.SEER の場合、ここで対象を確認する処理を書く
  };

  /** 次の役職の手番へ進む。夜が終わったら true を返す */
  night.advance = function advance(game) {
    game.nightStepIndex += 1;
    const finished = game.nightStepIndex >= game.nightOrderCache.length;
    if (finished) {
      game.phase = ONW.PHASE.DAY;
      game.votePhaseStarted = false;
    }
    return finished;
  };

  ONW.night = night;

})(window.ONW);
