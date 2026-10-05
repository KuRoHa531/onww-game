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
   * 設定ONで、最終盤面に本物の人狼が1人もおらず、狂人がいるとき、狂人のうち1人を人狼判定に昇格させる。
   * 昇格するのは「配布時に決めておいたカード」（certainPromotion が決める）で、役職が入れ替わっても
   * 昇格の判定ごとカードについていく。最終的にそのカードを持っている人が昇格する。
   * （カードが墓地にあるなど持ち主がいない場合や、将来の「上書き型」の能力で狂人でなくなった場合は、残った狂人からランダム）
   */
  vote.updatePromotion = function updatePromotion(game) {
    game.promotedWolfIds = [];
    if (!game.fakeWolfWhenNoWolf) return;
    const ids = game.players.map((p) => p.id);
    if (ids.some((id) => ONW.WOLF_KIND.includes(game.currentRoles[id]))) return;
    const mads = ids.filter((id) => ONW.MAD_KIND.includes(game.currentRoles[id]));
    if (!mads.length) return;
    const holder = game.masterCard ? ids.find((id) => ONW.cardAt(game, id) === game.masterCard) : null;
    game.promotedWolfIds = [holder && mads.includes(holder) ? holder : ONW.utils.randomChoice(mads)];
  };

  /**
   * 配布時点で「どの狂人（のカード）が昇格するか」を決める（なければ null）。狂信者に「ご主人」として見せる人でもある。
   * 条件: 狂人代用人狼ON / 人狼系が誰にも配られていない / 狂人系が1人以上（2人以上なら配布時に1人を抽選して固定）。
   * 役職を動かす役職（怪盗・墓荒らし・いたずらっ子）がいても、昇格の判定はカードについていく。
   */
  vote.certainPromotion = function certainPromotion(game) {
    if (!game.fakeWolfWhenNoWolf) return null;
    const ids = game.players.map((p) => p.id), ini = game.initialRoles;
    if (ids.some((id) => ONW.WOLF_KIND.includes(ini[id]))) return null;
    const mads = ids.filter((id) => ONW.MAD_KIND.includes(ini[id]));
    if (!mads.length) return null;
    if (!mads.includes(game.masterPick)) game.masterPick = mads.length === 1 ? mads[0] : ONW.utils.randomChoice(mads);
    game.masterCard = "P:" + game.masterPick;   // 昇格の判定はこのカードについていく
    return game.masterPick;
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
    game.mentalIds = [];
    if (maxVotes === 0) {
      game.eliminated = [];
      return game.eliminated;
    }
    game.eliminated = Object.keys(counts).filter((id) => counts[id] === maxVotes);
    // 豆腐の人狼: 1票でも入ったら、つられている人と同時にめくられてメンタル崩壊（道連れ能力などは発動しない）
    const gone0 = new Set(game.deadIds || []);
    game.mentalIds = game.players.map((p) => p.id).filter((id) => game.currentRoles[id] === ONW.ROLE.TOFU_WOLF && counts[id] > 0 && !gone0.has(id));
    game.mentalIds.forEach((id) => { if (!game.eliminated.includes(id)) game.eliminated.push(id); });
    return game.eliminated;
  };

  /**
   * 追放の連鎖を解決する。「めくれた順」に待ち行列で処理するので、連鎖の連鎖（猫又が黒猫をめくる等）も起きる。
   *   ・一目惚れしてるてる(最終役職)が追放されたら、夜に選んだ相手も一緒に追放扱いになる（kind: "love" / 死因: 無理心中）
   *   ・猫又・黒猫がめくれたら、まだめくれていない人からランダムに1人を道連れにする（kind: "tomo"）
   *   ・わら人形がめくれたら、わら人形本人がまだめくれていない人から1人を選んで道連れにする（kind: "tomo"）
   *   ・無理心中(一目惚れしてるてるの相手)で死んだわら人形・猫又・黒猫は、道連れ能力が発動しない（道連れで死んだ場合は発動する）
   *   ・同時に追放された人（同数最多）は、全員が同時にめくれる扱い（道連れ候補に入らない）
   *   ・昼中にすでに死亡した人(game.deadIds)は道連れの候補に入らない
   * 一目惚れしてるてるの夜の選択は「役職の持ち主」単位で保存（game.loveTargets[持ち主ID] = 選んだ相手）。
   * 役職が移動したら選択も移動先の持ち主へ移る（ONW.swapPlayers / swapGrave が自動で移す）。選ばれた相手はプレイヤー単位のまま。
   * 【必読】役職に紐づく状態を増やす役職は state.js の「役職の移動と role-bound state」メモのルールに必ず従うこと。
   *   （猫又・黒猫・わら人形の選択は「めくれた瞬間に決まる試合ごとの結果」なので role-bound ではなく
   *    game.catPicks / game.strawTargets に持つ。試合開始時に net.js 側で空に戻す）
   * わら人形の選択が必要になったら game.strawPending = { id, cands } を立てて null を返す（net.js が本人に選ばせて再実行）。
   * auto=true のときは選択待ちにせず、候補からランダムに選ぶ（determineWinners の保険）。
   * 戻り値: 追放されたプレイヤーID全員（投票で追放された人 + 巻き込まれた人）
   *   game.chainIds: 巻き込まれた順 / game.chainBy[巻き込まれた人] = めくれた人 / game.chainKind[巻き込まれた人] = "love" | "tomo"
   */
  vote.resolveChain = function resolveChain(game, auto) {
    const R = ONW.ROLE, pick = ONW.utils.randomChoice;
    const done = new Set(game.eliminated), queue = [...game.eliminated], gone = new Set(game.deadIds || []);
    game.chainIds = []; game.chainBy = {}; game.chainKind = {}; game.strawPending = null;
    game.catPicks = game.catPicks || {}; game.strawTargets = game.strawTargets || {};
    game.assassinTargets = game.assassinTargets || {}; game.assassinList = [];   // アサシン: めくれた順に { id, target }（選んだ相手）
    const pool = (self) => game.players.map((p) => p.id).filter((id) => id !== self && !done.has(id) && !gone.has(id));
    const take = (t, by, kind) => { done.add(t); queue.push(t); game.chainIds.push(t); game.chainBy[t] = by; game.chainKind[t] = kind; };
    while (queue.length) {
      const id = queue.shift(), role = game.currentRoles[id];
      if (game.chainKind[id] === "love" && (ONW.TOMO_ROLES.includes(role) || role === R.ASSASSIN)) continue;   // 無理心中で死んだ人は、道連れ能力（わら人形・猫又・黒猫）・アサシンの暗殺が発動しない
      if (role === R.LOVE_TANNER) {
        const t = (game.loveTargets || {})[id];
        if (t && !done.has(t) && game.players.some((p) => p.id === t)) take(t, id, "love");
      } else if (role === R.CAT_SIDHE || role === R.BLACK_CAT) {
        const c = pool(id);
        if (!c.length) continue;
        let t = game.catPicks[id];
        if (!t || !c.includes(t)) t = game.catPicks[id] = pick(c);   // 再計算しても同じ相手になるよう、決めた相手は覚えておく
        take(t, id, "tomo");
      } else if (role === R.STRAW_DOLL) {
        const c = pool(id);
        if (!c.length) continue;
        let t = game.strawTargets[id];
        if (!t || !c.includes(t)) {
          delete game.strawTargets[id];
          if (!auto) { game.strawPending = { id, cands: c, kind: "straw" }; return null; }
          t = game.strawTargets[id] = pick(c);
        }
        take(t, id, "tomo");
      } else if (role === R.ASSASSIN) {
        // アサシン: めくれたその場で、自分を除く全プレイヤー（すでにめくれた人も含む）から1人を選ぶ。選んだ相手は死なない（マーリンかどうかだけが勝敗に関わる）
        const c = game.players.map((p) => p.id).filter((x) => x !== id);
        if (!c.length) continue;
        let t = game.assassinTargets[id];
        if (!t || !c.includes(t)) {
          delete game.assassinTargets[id];
          if (!auto) { game.strawPending = { id, cands: c, kind: "assassin" }; return null; }
          t = game.assassinTargets[id] = pick(c);
        }
        game.assassinList.push({ id, target: t });
      }
    }
    return [...done];
  };

  /** わら人形の選択待ちがあれば { id, cands } を返す（なければ null）。net.js が結果を出す前に、選び終えるまで繰り返し呼ぶ */
  vote.strawNeed = function strawNeed(game) {
    ONW.vote.resolveChain(game, false);
    return game.strawPending || null;
  };

  /**
   * 勝敗を判定する（マイクラ版の優先順位に準拠。このWeb版にある役職の範囲）。
   *   1. 神が追放された        → 神の祝福: 神以外の全員が勝利（追放されたオポチュニストは除く）
   *   2. てるてる系が追放された → 追放されたてるてる系の勝利（一目惚れしてるてるは選んだ相手も勝利）
   *   3. 神が追放されていない   → 神降臨: 神の単独勝利
   *   4. それ以外              → 村人陣営 / 人狼陣営の基本勝敗
   *   ・オポチュニストは、どの結果でも「追放されていなければ」追加で勝利
   * 道連れ(猫又・黒猫・わら人形)・無理心中で死んだ人も、マイクラ版どおり「追放された人」として数える。
   * 結果は game.winners（陣営キー）/ winnerIds / winTitle / winTeams / winDetail / executed に入れる。
   */
  vote.determineWinners = function determineWinners(game) {
    ONW.vote.updatePromotion(game);
    const R = ONW.ROLE, ids = game.players.map((p) => p.id);
    const role = (id) => game.currentRoles[id];
    const nm = (list) => list.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    const executed = ONW.vote.resolveChain(game, true);
    game.executed = executed;
    game.assassinResult = (game.assassinList || []).map((a) => ({ by: a.id, target: a.target, hit: game.currentRoles[a.target] === R.MERLIN }));   // 結果の演出用
    const dead = new Set([...executed, ...(game.deadIds || [])]);   // 追放された人 + 昼中に死亡した人
    const gods = ids.filter((id) => role(id) === R.GOD);
    // 無理心中で巻き込まれたてるてる系は、自分のてるてる勝利は発動しない（相手の一目惚れしてるてると「一緒に勝った」扱いになるだけ）
    const byLove = (id) => (game.chainKind || {})[id] === "love";
    const tanners = executed.filter((id) => role(id) === R.TANNER && !byLove(id));
    const loveTanners = executed.filter((id) => role(id) === R.LOVE_TANNER && !byLove(id));
    const opportunists = ids.filter((id) => role(id) === R.OPPORTUNIST && !dead.has(id));

    const set = (title, teams, winners, detail, winnerTeams) => {
      game.winTitle = title; game.winTeams = teams; game.winDetail = detail; game.winners = winnerTeams;
      const w = new Set(winners);
      opportunists.forEach((id) => w.add(id));                       // オポチュニスト: 追放されていなければ追加勝利
      if (opportunists.length && !teams.includes("オポチュニスト")) teams.push("オポチュニスト");
      // 天邪鬼: 村人陣営が勝たなかった（神の祝福でもない）ときだけ、どの結果でも追加で勝利（死亡・追放は関係なし）
      if (!teams.includes("神の祝福") && !teams.includes("村人陣営")) {
        const am = ids.filter((id) => role(id) === R.AMANOJAKU);
        am.forEach((id) => w.add(id));
        if (am.length && !teams.includes("天邪鬼")) teams.push("天邪鬼");
      }
      game.winnerIds = [...w];
      return game.winners;
    };

    // 1. 神の祝福
    if (gods.some((id) => executed.includes(id))) {
      const win = ids.filter((id) => role(id) !== R.GOD && role(id) !== R.AMANOJAKU && !(role(id) === R.OPPORTUNIST && dead.has(id)));   // 天邪鬼は祝福に逆らえず敗北
      return set("神の祝福を受けました", ["神の祝福"], win,
        `神 ${nm(gods.filter((id) => executed.includes(id)))} が追放されたため、神以外の全員が勝利です。追放されたオポチュニストと天邪鬼は勝利できません。`, [ONW.TEAM.THIRD]);
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
    // 人狼判定の者が全員死亡していれば、死因（追放・道連れ・昼中の死亡など）を問わず村人陣営の勝ち
    const allWolvesDead = wolves.length > 0 && wolves.every((id) => dead.has(id));
    let side = (wolves.length === 0 || wolfDied || allWolvesDead) ? ONW.TEAM.VILLAGE : ONW.TEAM.WOLF;
    // アサシンがマーリンを当てたら、村人陣営の勝ちは人狼陣営の逆転勝利になる
    const assHits = (game.assassinResult || []).filter((a) => a.hit);
    const reversed = side === ONW.TEAM.VILLAGE && assHits.length > 0;
    if (reversed) side = ONW.TEAM.WOLF;
    const fake = !!game.fakeWolfWhenNoWolf;
    let detail;
    if (wolves.length === 0) detail = fake ? "最終盤面に本物の人狼も人狼判定の狂人もいませんでした。" : "最終盤面に本物の人狼がいませんでした。";
    else if (!wolfDied && allWolvesDead) detail = `${fake ? "人狼判定" : "人狼"}の者が全員死亡しました。`;
    else if (wolfDied) detail = `追放された${fake ? "人狼判定" : "人狼"}: ${nm(executed.filter((id) => wolves.includes(id)))}`;
    else detail = fake ? "人狼判定の者が追放されませんでした。" : "本物の人狼が追放されませんでした。";
    if (reversed) detail = `アサシン ${nm(assHits.map((a) => a.by))} が マーリン ${nm(assHits.map((a) => a.target))} を暗殺しました。人狼陣営の逆転勝利です。（${detail}）`;
    const win = ids.filter((id) => ONW.roles.getInfo(role(id)).team === side);
    return set(side === ONW.TEAM.VILLAGE ? "村人陣営勝利" : "人狼陣営勝利", [side === ONW.TEAM.VILLAGE ? "村人陣営" : "人狼陣営"], win, detail, [side]);
  };

  ONW.vote = vote;

})(window.ONW);
