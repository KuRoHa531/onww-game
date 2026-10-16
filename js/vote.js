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
  /** 受動効果で見る役職: 最終盤面のカードを、模倣の人狼なら模倣先に読み替えた役職（マイクラ版 roleForMimicEffect。js/roles/wolf/wolf/mimic_wolf.js）。カードそのものを見る所（陣営・人狼判定）は game.currentRoles のまま */
  const E = (game, id) => (ONW.mimic ? ONW.mimic.eff(game, id) : game.currentRoles[id]);

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
    const ids = game.players.map((p) => p.id), kingMode = ONW.vote.kingPromotion(game, game.currentRoles);
    if (!game.fakeWolfWhenNoWolf && !kingMode) return;
    if (ids.some((id) => ONW.vote.isRealWolfKind(game.currentRoles[id], kingMode) && !(ONW.mimic && ONW.mimic.notWolfJudge(game, id)))) return;   // 人狼判定に数えない模倣の人狼しかいなければ、狂人の昇格が起きる（wolfJudgeIds と揃える）
    const mads = ids.filter((id) => ONW.MAD_KIND.includes(game.currentRoles[id]));
    if (!mads.length) return;
    const holder = game.masterCard ? ids.find((id) => ONW.cardAt(game, id) === game.masterCard) : null;
    game.promotedWolfIds = [holder && mads.includes(holder) ? holder : ONW.utils.randomChoice(mads)];
  };

  /** 人狼系か（人狼王が「他の人狼系」を探すときは、人狼王自身は数えない: kingMode のとき人狼王は除く） */
  vote.isRealWolfKind = function isRealWolfKind(role, kingMode) {
    return ONW.WOLF_KIND.includes(role) && !(kingMode && role === ONW.ROLE.WOLF_KING);
  };

  /**
   * 人狼王の昇格（マイクラ版 updatePromotedWolfId の forceForWolfKing と同じ考え方）。
   * 人狼王がいて、自分（人狼王）以外の人狼系が誰もいなくて、狂人系が1人以上いるときは、「狂人代用人狼」の設定がOFFでも、狂人を1人人狼判定に昇格させる。
   * roles = 役職の表（currentRoles または initialRoles）
   */
  vote.kingPromotion = function kingPromotion(game, roles) {
    const ids = game.players.map((p) => p.id);
    if (!ids.some((id) => roles[id] === ONW.ROLE.WOLF_KING)) return false;
    if (ids.some((id) => roles[id] !== ONW.ROLE.WOLF_KING && ONW.WOLF_KIND.includes(roles[id]))) return false;
    return ids.some((id) => ONW.MAD_KIND.includes(roles[id]));
  };

  /**
   * 配布時点で「どの狂人（のカード）が昇格するか」を決める（なければ null）。狂信者に「ご主人」として見せる人でもある。
   * 条件: 狂人代用人狼ON / 人狼系が誰にも配られていない / 狂人系が1人以上（2人以上なら配布時に1人を抽選して固定）。人狼王だけがいるときは、設定OFFでも昇格する(人狼王の昇格)。
   * 役職を動かす役職（怪盗・墓荒らし・いたずらっ子）がいても、昇格の判定はカードについていく。
   */
  vote.certainPromotion = function certainPromotion(game) {
    const ids = game.players.map((p) => p.id), ini = game.initialRoles, kingMode = ONW.vote.kingPromotion(game, ini);   // 人狼王だけがいる配役は、設定OFFでも昇格する
    if (!game.fakeWolfWhenNoWolf && !kingMode) return null;
    if (ids.some((id) => ONW.vote.isRealWolfKind(ini[id], kingMode))) return null;
    const mads = ids.filter((id) => ONW.MAD_KIND.includes(ini[id]));
    if (!mads.length) return null;
    if (!mads.includes(game.masterPick)) game.masterPick = mads.length === 1 ? mads[0] : ONW.utils.randomChoice(mads);
    game.masterCard = "P:" + game.masterPick;   // 昇格の判定はこのカードについていく
    return game.masterPick;
  };

  /**
   * 墓荒らしが狂人系（狂信者など）を墓地から取ったとき、自分自身の昇格が確定するか。
   * 条件: 狂人代用人狼ON / 配布時点でプレイヤーに人狼系も狂人系もいない（= 他に昇格が決まっている狂人がいない）。
   * 確定するなら、昇格の判定を「いま手にした狂人のカード」にひも付けて true を返す。
   */
  vote.claimSelfPromotion = function claimSelfPromotion(game, pid) {
    if (!game.fakeWolfWhenNoWolf || !ONW.MAD_KIND.includes(game.currentRoles[pid])) return false;
    const ini = game.initialRoles;
    if (game.players.some((q) => ONW.WOLF_KIND.includes(ini[q.id]) || ONW.MAD_KIND.includes(ini[q.id]))) return false;
    game.masterPick = pid;
    game.masterCard = ONW.cardAt(game, pid);   // 手にした狂人のカード（のちに入れ替わっても判定はカードについていく）
    return true;
  };

  /** 人狼判定のプレイヤーID（本物の人狼 + 昇格した狂人） */
  vote.wolfJudgeIds = function wolfJudgeIds(game) {
    return game.players.map((p) => p.id).filter((id) =>
      (ONW.WOLF_KIND.includes(game.currentRoles[id]) && !(ONW.mimic && ONW.mimic.notWolfJudge(game, id))) ||   // 白狼・忘却の人狼を模倣した模倣の人狼は人狼判定に数えない（7of9）
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

  /**
   * 1人の投票が何票ぶんか。最終盤面でメイヤーを持っている人は、ルーム設定の票数（2〜10票）ぶん。狂ったメイヤーは別の設定（狂ったメイヤーの投票数。2〜10票）ぶん。それ以外は1票。
   * 酔いが覚めていない酔っ払いは、まだ自分の役職の能力を使えないので1票（新聞配達員・チキンの逆転と同じ扱い）。
   */
  vote.weightOf = function weightOf(game, voterId) {
    if (ONW.fanatic && ONW.fanatic.lostBy(game, voterId) && !ONW.hiddenDrunk(game, voterId)) return 0;   // 鍵師のロックで狂人になれなかった背徳者: 投票権を失う
    // 盗賊（js/roles/village/thief.js）: 元の票数に、盗んだ分(+)と盗まれた分(−)を反映する（下限0）。マイクラ版 vote.js の盗賊と同じ
    const thief = (w) => (ONW.thief ? ONW.thief.adjust(game, voterId, w) : w);
    if (game.currentRoles && E(game, voterId) === ONW.ROLE.MAYOR && !ONW.hiddenDrunk(game, voterId) && !ONW.seal.is(game, voterId)) return thief(ONW.mayorVotes(game));
    if (game.currentRoles && E(game, voterId) === ONW.ROLE.MAD_MAYOR && !ONW.hiddenDrunk(game, voterId) && !ONW.seal.is(game, voterId)) return thief(ONW.madMayorVotes(game));   // 狂ったメイヤー: メイヤーと同じ作りで、票数は別の設定（madMayorVoteCount）
    // 麻婆の人狼（本家 MAPO_WOLF）が盤面にいる間、豆腐の人狼は2票持ち
    if (game.currentRoles && E(game, voterId) === ONW.ROLE.TOFU_WOLF && !ONW.hiddenDrunk(game, voterId) && vote.mapoOn(game)) return thief(2);
    return thief(1);
  };

  /** 結果発表などの「票数」の表示: 0票の人（盗賊に盗まれて0票になった人など）は「(無効)」、それ以外は「(N)」。投票先は0票でも出す */
  vote.wLabel = function wLabel(w) { return w === 0 ? "(無効)" : `(${w || 1})`; };

  /**
   * 麻婆の人狼の効果が働いているか（最終盤面に麻婆の人狼がいて、酔いが覚めている）。
   * excl（Set）に入っている人は数えない（昼中に先に死亡した人・同じ投票で追放される人）。
   */
  vote.mapoOn = function mapoOn(game, excl) {
    return game.players.some((p) => E(game, p.id) === ONW.ROLE.MAPO_WOLF && !ONW.hiddenDrunk(game, p.id) && !(excl && excl.has(p.id)));
  };

  /**
   * 豆腐の人狼のメンタル崩壊（1票でも入ったら、つられる人と同時に追放）になる人。
   * 麻婆の人狼がいる間は、1票ではメンタル崩壊しない（最多得票のときだけ、通常の追放として死ぬ）。
   * ただし麻婆の人狼が昼中に先に死亡している / 同じ投票で追放される場合は、効果が消えているのでメンタル崩壊する（本家 applySpecialVoteDeaths と同じ）。
   * counts: 得票数 / eliminated: 追放が決まっている人 / gone: 昼中に先に死んだ人の Set
   */
  vote.mentalIds = function mentalIds(game, counts, eliminated, gone) {
    if (vote.mapoOn(game, new Set([...gone, ...(eliminated || [])]))) return [];
    return game.players.map((p) => p.id).filter((id) => E(game, id) === ONW.ROLE.TOFU_WOLF && (counts[id] || 0) > 0 && !gone.has(id));
  };

  /**
   * ペンギン（マイクラ版 scripts/vote.js の「ペンギン」の処理と同じ。js/roles/village/penguin.js）。
   * 投票の集計の最初に、投票先を書き換える: ペンギンに投票した人の票は、ペンギンが投票した先へ「滑って移動」する（入れ替えではなく移動。票の重みはそのまま）。
   *   ・働くペンギン: 最終盤面でペンギンを持っている人（模倣の人狼が模倣していれば模倣先＝E）で、酔いが覚めていて、封印されていない人。投票していなければ何も起きない。
   *   ・ペンギンに投票した「ペンギンの人」の票も滑る（ペンギンが入れた票も、ほかの人の票と同じ。そのペンギンの働き・封印・酔いは見ない）。ただし1匹のペンギンが滑らせるのは1回まで（プレイヤーの並びの順に1匹ずつ、1回だけ処理する。同じペンギンが2回働くことはない）。
   *   ・ペンギンが投票した先が、ペンギンに投票した本人だったときは、その人の票は自分自身に残る（滑った先＝その人本人になるだけ。滑り方の規則は同じ）。
   *   ・ペンギンが複数いるときは、プレイヤーの並びの順に1人ずつ処理する（先のペンギンが書き換えた投票先を、あとのペンギンが見る。マイクラ版と同じ）。
   *   ・番犬の噛殺・シュレディンガーの猫・実績など「誰が誰に投票したか」の条件は、元の投票先（game.votes）のまま（マイクラ版も元の票を見る）。票数の集計・結果発表の表示だけが滑ったあとの票になる。
   *   ・処理の順番: ペンギン → 交換者（票数の入れ替え）→ 番犬（飼い主への票を無効）。
   * 戻り値: { slides: [{ penguinId, toId, moves: [{ voterId, toId, w }], w: 滑った票数の合計 }], votes: 滑ったあとの投票先 { 投票者ID: 投票先ID } }（game.votes は書き換えない）
   */
  vote.penguinOn = function penguinOn(game, id) {
    return !!game.currentRoles && E(game, id) === ONW.ROLE.PENGUIN && !ONW.hiddenDrunk(game, id) && !(ONW.seal && ONW.seal.is(game, id));
  };
  vote.penguinRun = function penguinRun(game) {
    const votes = { ...(game.votes || {}) }, slides = [];
    if (!game.currentRoles || !ONW.ROLE.PENGUIN) return { slides, votes };
    (game.players || []).forEach((p) => {
      if (!vote.penguinOn(game, p.id)) return;
      const to = votes[p.id];
      if (!to) return;   // ペンギンが投票していなければ何も起きない
      const moves = [];
      Object.keys(votes).forEach((vid) => {
        if (vid === p.id || votes[vid] !== p.id) return;
        // ペンギンが入れた票も、ペンギンに投票していれば滑る（ほかの人の票と同じ）
        votes[vid] = to;   // 滑った先（ペンギンの投票先が本人なら、その人は自分に投票した扱いになる）
        moves.push({ voterId: vid, toId: to, w: vote.weightOf(game, vid) });
      });
      if (moves.length) slides.push({ penguinId: p.id, toId: to, moves, w: moves.reduce((a, m) => a + m.w, 0) });
    });
    return { slides, votes };
  };
  /** ペンギンの滑りのあとの投票先 { 投票者ID: 投票先ID }（ペンギンがいなければ game.votes と同じ内容） */
  vote.effectiveVotes = function effectiveVotes(game) { return vote.penguinRun(game).votes; };
  /** ペンギンの滑り（処理した順）: [{ penguinId, toId, moves, w }] */
  vote.penguinSlides = function penguinSlides(game) { return vote.penguinRun(game).slides; };

  /**
   * 交換者(g.exchanges)の入れ替え1回ぶん: counts の a と b の得票数を入れ替える（「Aに入った票はBへ、Bに入った票はAへ」= マイクラ版 vote.js の voteSwapPairs と同じ結果）。
   * counts は書き換えず、新しいオブジェクトを返す。0票の側は 0 として扱う（0票になった人は counts から消える）。
   */
  /**
   * その交換が有効か: 入れ替える2人（a・b）がどちらも生きていれば有効。使ったあとに（昼中に）どちらかが死亡したら、その交換はキャンセル（票数は入れ替わらない）。
   * 使用済みのままは変わらない（g.exchanges の記録は残す＝ONW.exchanger の used は true のまま）。交換者・狂った交換者の共通。
   */
  vote.exchangeLive = function exchangeLive(game, e) {
    const dead = game.deadIds || [];
    return !dead.includes(e.a) && !dead.includes(e.b);
  };
  /** ペンギンの滑りと交換者の入れ替えを反映した、その人の票の最終的な投票先（ペンギンが先。そのあと使った順に、Aに入った票はBへ・Bに入った票はAへ）。変わっていなければ null（結果発表の「魔理沙 → 霊夢」表示用） */
  vote.swappedTarget = function swappedTarget(game, voterId) {
    const orig = game.votes && game.votes[voterId];
    if (!orig) return null;
    let t = vote.effectiveVotes(game)[voterId] || orig;   // ペンギンの滑りが先（ペンギン → 交換者の順）
    (game.exchanges || []).filter((e) => vote.exchangeLive(game, e)).forEach((e) => { if (t === e.a) t = e.b; else if (t === e.b) t = e.a; });
    return t !== orig ? t : null;
  };
  vote.swapCounts = function swapCounts(counts, a, b) {
    const out = { ...counts };
    const ca = counts[a] || 0, cb = counts[b] || 0;
    if (cb > 0) out[a] = cb; else delete out[a];
    if (ca > 0) out[b] = ca; else delete out[b];
    return out;
  };
  /** 得票数を集計する（メイヤーの1票は、設定した票数ぶんとして数える）。raw:true ならペンギンが滑ったあと・交換者の入れ替えをする前の得票数 / pre:true ならペンギンが滑らせる前の得票数 */
  vote.tally = function tally(game, opts) {
    let counts = {};
    const pen = vote.penguinRun(game);   // ペンギンの滑り（最初に働く。票の重みは投票者のまま）
    Object.entries((opts && opts.pre) ? game.votes : pen.votes).forEach(([voterId, targetId]) => {
      const w = ONW.vote.weightOf(game, voterId);   // 投票数0票（盗賊に盗まれて0票になった人など）の票は、得票数に何も足さない（0票の項目も作らない）
      if (w > 0) counts[targetId] = (counts[targetId] || 0) + w;
    });
    if (opts && opts.pre) return counts;   // ペンギンが滑らせる前の得票数（結果発表の最初に出す票数。ペンギンがいなければ raw と同じ）
    if (pen.slides.length) (game.deadIds || []).forEach((id) => { delete counts[id]; });   // 滑った先が昼中に死亡している人なら、その票は無効（交換者と同じ扱い）
    if (opts && opts.raw) return counts;   // ペンギンが滑ったあと・交換者の入れ替え前の得票数
    // 交換者: 使った順に1つずつ、2人の得票数を入れ替える。入れ替わった先が昼中に死亡している人なら、その票は無効（マイクラ版: 死亡した相手への票は無効）
    (game.exchanges || []).filter((e) => vote.exchangeLive(game, e)).forEach((e) => { counts = vote.swapCounts(counts, e.a, e.b); });   // 対象が死亡した交換はキャンセル（入れ替えない）
    if ((game.exchanges || []).length || pen.slides.length) (game.deadIds || []).forEach((id) => { delete counts[id]; });
    // 番犬: 飼い主への票は無効（最終盤面の番犬の飼い主は追放されない。入れ替え後の得票数で見る＝マイクラ版 protectedOwnerIds と同じ）
    if (opts && opts.unguarded) return counts;   // 無効になる前の得票数（結果発表の「無効票」表示用）
    vote.guardedIds(game).forEach((id) => { delete counts[id]; });
    return counts;
  };
  /** 番犬の飼い主として票が無効になる人（最終盤面で番犬を持っていて酔いが覚めている人の飼い主）。番犬の役職ファイルがない場合は空 */
  vote.guardedIds = function guardedIds(game) {
    return ONW.watchdog ? ONW.watchdog.protectedIds(game) : [];
  };
  /** 交換者の入れ替えの途中経過: [入れ替え前の得票数, 1つ目を入れ替えた後, 2つ目を入れ替えた後, ...]（結果発表の演出用。最後の要素は vote.tally と同じ） */
  vote.tallySteps = function tallySteps(game) {
    let counts = vote.tally(game, { raw: true });
    const guard = vote.guardedIds(game), shown = (c) => { const o = { ...c }; guard.forEach((id) => { delete o[id]; }); return o; };   // 番犬の飼い主への票は表示から外す（入れ替えは無効になる前の票で行う）
    const steps = [shown(counts)];
    (game.exchanges || []).filter((e) => vote.exchangeLive(game, e)).forEach((e) => {   // vote.tally と同じ（キャンセルされた交換は途中経過にも出さない）
      counts = vote.swapCounts(counts, e.a, e.b);
      counts = { ...counts }; (game.deadIds || []).forEach((id) => { delete counts[id]; });   // vote.tally と同じ（死亡した人への票は無効）
      steps.push(shown(counts));
    });
    return steps;
  };

  /**
   * ペンギンの滑りの途中経過（結果発表の演出用）: { slides: [{ penguinId, toId, w, n: 滑った人数 }], steps: [滑る前の得票数, 1つ目を滑らせた後, 2つ目を滑らせた後, ...] }
   * 最後の要素は vote.tally(game, { raw: true }) と同じ（＝交換者の tallySteps の最初の要素）。番犬の飼い主への票は表示から外す（tallySteps と同じ）。ペンギンがいない試合は slides が空で steps は1つだけ。
   */
  vote.penguinSteps = function penguinSteps(game) {
    const guard = vote.guardedIds(game), shown = (c) => { const o = { ...c }; guard.forEach((id) => { delete o[id]; }); return o; };
    let counts = vote.tally(game, { pre: true });
    const steps = [shown(counts)], slides = vote.penguinSlides(game);
    slides.forEach((sl) => {
      counts = { ...counts };
      const from = (counts[sl.penguinId] || 0) - sl.w;
      if (from > 0) counts[sl.penguinId] = from; else delete counts[sl.penguinId];
      if (sl.w > 0) counts[sl.toId] = (counts[sl.toId] || 0) + sl.w;   // 滑った票が全部0票ぶん（盗まれて0票の人の票）なら、0票の項目は作らない
      (game.deadIds || []).forEach((id) => { delete counts[id]; });   // vote.tally と同じ（死亡した人への票は無効）
      steps.push(shown(counts));
    });
    return { slides: slides.map((sl) => ({ penguinId: sl.penguinId, toId: sl.toId, w: sl.w, n: sl.moves.length })), steps };
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
    game.shockIds = [];
    game.servantSubs = [];
    game.toughBounces = [];
    game.kingGuards = [];
    if (maxVotes === 0) {
      game.eliminated = [];
      return game.eliminated;
    }
    game.eliminated = Object.keys(counts).filter((id) => counts[id] === maxVotes);
    // タフガイ: 最多得票でも追放されず、票をはじき返して次点の人にとばっちり（役職ファイルの elimination フック。game.toughBounces に記録）
    { const ctx = { counts, maxVotes, gone: new Set(game.deadIds || []), eliminated: game.eliminated };
      ONW.roleHooks("elimination").forEach((h) => h.fn(game, ctx));
      game.eliminated = ctx.eliminated; }
    // 豆腐の人狼: 1票でも入ったら、つられている人と同時にめくられてメンタル崩壊（道連れ能力などは発動しない）。麻婆の人狼がいる間は最多得票のときだけ追放
    const gone0 = new Set(game.deadIds || []);
    game.mentalIds = vote.mentalIds(game, counts, game.eliminated, gone0);   // 麻婆の人狼がいる間は、豆腐の人狼は1票ではメンタル崩壊しない
    game.mentalIds.forEach((id) => { if (!game.eliminated.includes(id)) game.eliminated.push(id); });
    // チキン: 1票でも入ったら、つられている人と同時にショック死（追放扱い）
    game.shockIds = game.players.map((p) => p.id).filter((id) => E(game, id) === ONW.ROLE.CHICKEN && counts[id] > 0 && !gone0.has(id) && !ONW.seal.is(game, id));   // 封印されているチキンはショック死しない（2of4b）
    game.shockIds.forEach((id) => { if (!game.eliminated.includes(id)) game.eliminated.push(id); });
    // 独裁処刑(game.dictator): 本家(applyServantSubstitution の先頭)どおり、従者は身代わりにならない。選ばれた人だけが処刑される（議論を打ち切って投票は行わない。票は独裁者→対象の1票だけ）
    if (game.dictator) game.servantSubs = [];
    else ONW.vote.applyServantSubstitution(game);   // 本家の順序どおり: 豆腐の人狼のメンタル崩壊 → 従者の身代わり → 連鎖（resolveChain）
    return game.eliminated;
  };

  /**
   * 従者の身代わり（本家 applyServantSubstitution）。追放が決まった直後に1回だけ確定させる（resolveChain / strawNeed は何度も呼ばれるので、ここで決めた結果を使う）。
   * 最終盤面の従者の持ち主 S とそのご主人 M を順に見て、M が追放されていて S が追放されていなければ、M を外して S を入れる。変化がなくなるまで繰り返す。
   *   ・身代わりにならない: M の最終役職が 従者 / てるてる坊主 / 一目惚れしてるてる / 賞金稼ぎ（本家 isServantSubstitutionBlockedRole のうちWeb版にあるぶん）
   *   ・S がすでに昼中に死亡している(game.deadIds)なら身代わりにならない（Web版の安全策。本家は見ていない）
   *   ・S 自身が恋人(重複役職)なら身代わりにならない
   *   ・S と M が同じ人（自分がご主人）なら何もしない
   *   ・豆腐の人狼のメンタル崩壊の対象だった M を守った場合は、game.mentalIds から M を外す（従者は通常の追放として死ぬ）
   * 記録: game.servantSubs = [{ servant: S, master: M }, ...]（身代わりが起きた順）
   */
  vote.applyServantSubstitution = function applyServantSubstitution(game) {
    const R = ONW.ROLE, gone = new Set(game.deadIds || []);
    const blocked = [R.SERVANT, R.TANNER, R.LOVE_TANNER, R.BOUNTY_HUNTER];
    game.servantSubs = [];
    let changed = true;
    while (changed) {
      changed = false;
      ONW.servantSubPairs(game).forEach(([s, m]) => {
        if (s === m) return;                                        // 自分がご主人: 何も起きない
        if (!game.eliminated.includes(m) || game.eliminated.includes(s)) return;
        if (ONW.isLover(game, s)) return;                         // 従者自身が恋人（恋人陣営）なら身代わりにならない
        if (gone.has(s)) return;                                    // すでに死んでいる従者は身代わりになれない
        if (blocked.includes(game.currentRoles[m])) return;         // 従者の連鎖・てるてる系は身代わりにしない
        game.eliminated = game.eliminated.filter((x) => x !== m);
        game.eliminated.push(s);
        game.mentalIds = (game.mentalIds || []).filter((x) => x !== m);
        game.shockIds = (game.shockIds || []).filter((x) => x !== m);
        game.servantSubs.push({ servant: s, master: m });
        changed = true;
      });
    }
    return game.servantSubs;
  };

  /**
   * 追放の連鎖を解決する。「めくれた順」に待ち行列で処理するので、連鎖の連鎖（猫又が黒猫をめくる等）も起きる。
   *   ・一目惚れしてるてる(最終役職)が追放されたら、夜に選んだ相手も一緒に追放扱いになる（kind: "love" / 死因: 無理心中）
   *   ・猫又・黒猫・ネコカボチャがめくれたら、まだめくれていない人からランダムに1人を道連れにする（kind: "tomo"）
   *   ・わら人形がめくれたら、わら人形本人がまだめくれていない人から1人を選んで道連れにする（kind: "tomo"）
   *   ・無理心中(一目惚れしてるてるの相手)で死んだわら人形・猫又・黒猫は、道連れ能力が発動しない（道連れで死んだ場合は発動する）
   *   ・恋人(重複役職): 誰かがめくれたら（追放・道連れ・無理心中のどれでも）、その相方もまだめくれていなければ一緒に「心中」でめくれる（kind: "lovers"）。
   *     心中で死んだ人は、無理心中と同じく道連れ能力(わら人形・猫又・黒猫)・アサシンの暗殺が発動せず、一目惚れの連鎖も起きない
   *   ・同時に追放された人（同数最多）は、全員が同時にめくれる扱い（道連れ候補に入らない）
   *   ・昼中にすでに死亡した人(game.deadIds)は道連れの候補に入らない
   *   ・従者のご主人が道連れ(tomo)で死ぬときは、従者が身代わりになってご主人は生き残る（game.chainSub[従者] = ご主人。kill() の中で処理）
   *   ・妖狐が死んだら（どんな死因でも）背徳者も同時に「後追い」で死ぬ（kind: "follow"。道連れ演出・従者の後追いと同じ）
   *   ・従者のご主人が 王国滅亡 / 心中 / 無理心中 で死んだら、従者は身代わりできず「後追い」で死ぬ（kind: "follow"。kill() の中で処理）
   * 一目惚れしてるてるの夜の選択は「役職の持ち主」単位で保存（game.loveTargets[持ち主ID] = 選んだ相手）。
   * 役職が移動したら選択も移動先の持ち主へ移る（ONW.swapPlayers / swapGrave が自動で移す）。選ばれた相手はプレイヤー単位のまま。
   * 【必読】役職に紐づく状態を増やす役職は state.js の「役職の移動と role-bound state」メモのルールに必ず従うこと。
   *   （猫又・黒猫・わら人形の選択は「めくれた瞬間に決まる試合ごとの結果」なので role-bound ではなく
   *    game.catPicks / game.strawTargets に持つ。試合開始時に net.js 側で空に戻す）
   * わら人形・アサシンの選択が必要になったら game.strawPending = [{ id, cands, kind }, ...] を立てて null を返す（net.js が本人たちに同時に選ばせて再実行）。
   *   同じ波（同時にめくれた人たち）の選択は、まとめて1回で返す。道連れにできる人がいないわら人形は、選ばずに終わる。
   * auto=true のときは選択待ちにせず、候補からランダムに選ぶ（determineWinners の保険）。
   * 戻り値: 追放されたプレイヤーID全員（投票で追放された人 + 巻き込まれた人）
   *   game.chainIds: 巻き込まれた順 / game.chainBy[巻き込まれた人] = めくれた人 / game.chainKind[巻き込まれた人] = "love" | "tomo"
   */
  vote.resolveChain = function resolveChain(game, auto) {
    const R = ONW.ROLE, pick = ONW.utils.randomChoice;
    if (ONW.pureLover) ONW.pureLover.sync(game);   // 純愛者: 恋人の組を、投票時点の最終盤面から確定し直す（昼のうちの役職の移動・酔い覚めを反映）
    const done = new Set(game.eliminated), gone = new Set(game.deadIds || []);
    let queue = [...game.eliminated];
    game.chainIds = []; game.chainBy = {}; game.chainKind = {}; game.chainSub = {}; game.strawPending = null; game.toughBlocks = [];
    game.kingGuards = (game.kingGuards || []).filter((b) => b.kind !== "tomo");   // 道連れのガードは、連鎖を解くたびに作り直す（追放のガードは resolveElimination で決まったまま）   // game.chainSub[身代わりになった従者] = 守られたご主人（道連れの身代わり）
    game.kingdomIds = []; game.queenFallen = [];   // 王国滅亡: 巻き込まれた村人陣営 / 倒れた女王
    game.catPicks = game.catPicks || {}; game.strawTargets = game.strawTargets || {};
    game.assassinTargets = game.assassinTargets || {}; game.assassinList = [];   // アサシン: めくれた順に { id, target }（選んだ相手）
    game.bountyTargets = game.bountyTargets || {}; game.bountyList = [];          // 賞金稼ぎ: めくれた順に { id, target }（人狼判定だと思って選んだ相手）
    const bouncedIds = new Set((game.toughBounces || []).flatMap((b) => b.to || []));   // タフガイのとばっちりで追放された人（賞金稼ぎは、てるてる系と同じく「追放」に数えず、能力も発動しない）
    const allIds = game.players.map((p) => p.id);
    const pool = (self) => allIds.filter((id) => id !== self && !done.has(id) && !gone.has(id) && !tomoBuf.some((x) => x.t === id));   // 同じ波の別の猫がもう選んだ人は選ばない
    game.chainLate = {};   // 王国滅亡のあとで死んだ人（心中など）: 結果の演出で王国滅亡のあとに出す
    let late = false;      // true の間に死んだ人は chainLate に記録される
    /**
     * 【死因の追加方法】この試合で「誰かが死ぬ」処理は、必ずこの kill() を通すこと（done に直接足さない）。
     *   kill(対象, 原因の人, 死因kind, 連鎖するか) … 対象が死ぬ。
     *   恋人(重複役職)は kill() の中で自動的に処理されるので、新しい死因側では恋人のことを考えなくてよい:
     *     対象に恋人の相方がいれば、その相方も「死因が発動した時点で」同時に死亡する（kind: "lovers" = 心中）。
     *   chain=false にすると、死んだ人は連鎖の待ち行列に入らない（道連れ・暗殺などの能力を発動させない死に方）。
     *   すでに死んでいる人には何も起きない（戻り値 false）。
     * 投票結果など、resolveChain が始まる前にすでに死んでいる人は、下の「始めの心中」でまとめて処理される。
     */
    // 道連れ(tomo)だけを受け付けない役職（タフガイ。心中・無理心中ははじき返さない）。酔いが覚めていない酔っ払いは効果なし。受けた攻撃は game.toughBlocks に記録（めくれる演出用）
    const immune = (t) => { const d = ONW.roleDef(E(game, t)); return !!(d && d.chainImmune) && !ONW.hiddenDrunk(game, t) && !ONW.seal.is(game, t); };
    let tomoBuf = [], tomoSimul = new Set();   // 同じ時点でめくれた人たちの道連れは、まとめて決める（flushTomo）。tomoSimul: 同時に道連れにされる人
    const cupidFollowers = (t) => (ONW.cupid ? ONW.cupid.pairs(game) : []).filter(([a, b, h]) => (a === t || b === t) && h !== t).map(([, , h]) => h).filter((h, i, arr) => arr.indexOf(h) === i);   // t が選ばれた2人の一方であるキューピッドの持ち主
    const kill = (t, by, kind, chain = true) => {
      if (done.has(t) || gone.has(t) || !game.players.some((p) => p.id === t)) return false;
      if (kind === "tomo" && immune(t)) { if (!game.toughBlocks.some((b) => b.id === t && b.by === by)) game.toughBlocks.push({ id: t, by, kind }); return false; }   // 空振り
      // 従者の身代わり（道連れ）: ご主人が道連れ(tomo)で死ぬときは、従者が身代わりになる（ご主人は生き残る）。追放の身代わり(applyServantSubstitution)と同じ条件:
      //   従者がまだ死んでいない / 従者が恋人でない / ご主人の最終役職が 従者・てるてる坊主・一目惚れしてるてる でない。従者が複数いれば先に見つかった1人
      if (kind === "tomo") {
        const blocked = [R.SERVANT, R.TANNER, R.LOVE_TANNER, R.BOUNTY_HUNTER];
        const sub = blocked.includes(game.currentRoles[t]) ? null : ONW.servantSubPairs(game).find(([s, m]) => m === t && s !== t && !done.has(s) && !gone.has(s) && !tomoSimul.has(s) && !ONW.isLover(game, s));   // 従者が同時に（同じ波で）道連れにされるときも、先に死んでいるときも、身代わりにならない
        if (sub) { game.chainSub[sub[0]] = t; return kill(sub[0], by, "tomo", chain); }
      }
      done.add(t); if (chain) queue.push(t); game.chainIds.push(t); game.chainBy[t] = by; game.chainKind[t] = kind; if (late) game.chainLate[t] = true;
      ONW.loverMates(game, t).forEach((mate) => { if (mate !== t) kill(mate, t, "lovers", chain); });   // 恋人: 相方も同時に心中（純愛者などで恋人が複数いれば全員。相方の相方も続けて心中する）
      // 従者の後追い: ご主人が 王国滅亡(queen) / 心中(lovers) / 無理心中(love) で死んだら、身代わりはできないので、従者も同時に「後追い」で死ぬ（kind: "follow"）。
      //   ご主人が従者の従者…と続く場合も後追いが連鎖する（follow も対象）。後追いで死んだ人は、ほかの人を巻き込まない（chain=false）
      if (["queen", "lovers", "love", "follow"].includes(kind)) {
        ONW.servantSubPairs(game).filter(([s, m]) => m === t && s !== t).forEach(([s]) => kill(s, t, "follow", false));
      }
      // キューピッドの後追い（マイクラ版 cupidFollowIdsForDeadSet）: 選んだ2人のどちらかが（死因を問わず）死んだら、キューピッドも「作った恋人の後を追い」死亡する（kind: "follow"。従者の後追いと同じ扱い）。
      //   後追いで死んだ人は、ほかの人を巻き込まない（chain=false）。酔いが覚めていないキューピッドの組は成立していないので対象外（ONW.cupid.pairs）
      cupidFollowers(t).forEach((h) => kill(h, t, "follow", false));
      // 背徳者の後追い: 妖狐が（追放・道連れ・心中・王国滅亡など、どんな死因でも）死んだら、背徳者も同時に「後追い」で死ぬ（kind: "follow"。従者の後追いと同じ扱い・ほかの人を巻き込まない）。
      //   背徳者が死んだことで、その従者・恋人・キューピッドも上の処理で続けて後追い・心中する
      if (game.currentRoles[t] === R.FOX && ONW.fanatic) ONW.fanatic.followersOf(game).forEach((f) => kill(f, t, "follow", false));
      return true;
    };
    const take = (t, by, kind) => { if (kind === "tomo") tomoBuf.push({ t, by }); else kill(t, by, kind, true); };
    /**
     * 道連れ(tomo)をまとめて実行する。人狼王は、道連れでは次の場合だけ死ぬ（心中・無理心中は kill() が無条件で殺す）:
     *   ・他に人狼判定の人がいない / 先に全員死亡している / 他の人狼判定が全員同時に死ぬ。ほかに生き残る人狼判定がいればガードされる
     * 従者の身代わりは、従者が同時に道連れにされる・先に死んでいるときは起きない（kill() の中）。
     */
    const flushTomo = () => {
      const buf = tomoBuf; tomoBuf = [];
      const vs = []; buf.forEach((x) => { if (!vs.some((y) => y.t === x.t)) vs.push(x); });
      if (!vs.length) return;
      const kingOf = (t) => ONW.kingActive && ONW.kingActive(game, t);
      tomoSimul = new Set(vs.map((x) => x.t));
      const before = new Set([...done, ...gone]);   // この時点より前にすでに死んでいた人（「先に死亡」）
      vs.filter((x) => !kingOf(x.t)).forEach((x) => kill(x.t, x.by, "tomo", true));
      const simul = new Set(vs.filter((x) => done.has(x.t) && !before.has(x.t)).map((x) => x.t));   // 同時に死んだ人（身代わりされた人・はじき返した人は含まない）
      const kings = vs.filter((x) => kingOf(x.t));
      const kingSet = new Set(kings.map((x) => x.t));
      kings.forEach((x) => {
        if (done.has(x.t) || gone.has(x.t)) return;
        if (immune(x.t)) { kill(x.t, x.by, "tomo", true); return; }   // タフガイが人狼王になっていることはないが、念のため通常の処理へ
        const protectedK = ONW.kingProtected(game, x.t, before, new Set([...simul, ...kingSet]));
        if (protectedK) { if (!(game.kingGuards || []).some((b) => b.kind === "tomo" && b.id === x.t && b.by === x.by)) (game.kingGuards = game.kingGuards || []).push({ id: x.t, votes: 0, kind: "tomo", by: x.by }); return; }
        kill(x.t, x.by, "tomo", true);
      });
      tomoSimul = new Set();
    };
    // 封印の狂人に封印されている人は、めくれても自動の効果（一目惚れの無理心中・猫又/黒猫/ネコカボチャ/わら人形の道連れ・アサシンの暗殺）が発動しない（2of4b。マイクラ版 resolveChainDeaths / triggeredAssassinIds）。賞金稼ぎはマイクラ版が封印を見ていないので対象外
    const sealedAct = (id, role) => role !== R.BOUNTY_HUNTER && ONW.seal.is(game, id);
    const loveDead = (id, role) => (game.chainKind[id] === "love" && (ONW.TOMO_ROLES.includes(role) || role === R.ASSASSIN || role === R.BOUNTY_HUNTER)) || (game.chainKind[id] === "lovers" && (ONW.TOMO_ROLES.includes(role) || role === R.ASSASSIN || role === R.BOUNTY_HUNTER || role === R.LOVE_TANNER));   // 無理心中で死んだ人は道連れ能力（わら人形・猫又・黒猫）・アサシンの暗殺・賞金稼ぎの指名が発動しない / 心中で死んだ人は、さらに一目惚れの連鎖も発動しない
    // 番犬の噛殺（マイクラ版 resolveChainDeaths）: 最終盤面の番犬（酔いが覚めている・昼中に死んでいない）が、自分の飼い主に投票していたら、飼い主を噛み殺す（kind: "bite"）。
    //   ・飼い主がすでに追放される / 昼中に死亡しているときは噛まない。噛み殺された人は道連れ・暗殺などの能力が発動しない（chain=false。恋人の心中・後追いは kill() が処理する）
    //   ・飼い主がネコカボチャなら、噛み返されて番犬も死ぬ（kind: "bite"・by = ネコカボチャ）。結果は game.dogBites = [{ by, target, back? }]（起きた順）
    //   ・【同時噛み】1人が複数の番犬（本物・模倣番犬・今後の犬の狂人）の飼い主になっていて、その犬たちが全員その人に投票していたら、犬たちは【同時に】噛み殺す。
    //     game.dogBites には噛んだ犬ごとに { by, target, simul?: 同時に噛んだ犬が2匹以上 } が入る（死因 kind "bite" の by は先頭の犬）。ネコカボチャが飼い主なら、噛んだ犬全員を噛み返す
    game.dogBites = [];
    if (ONW.watchdog) {
      const groups = [];   // [{ o: 飼い主, ws: 噛む犬たち }]（最初に見つかった順）
      ONW.watchdog.activePairs(game).forEach(([w, o]) => {
        if ((game.votes || {})[w] !== o || gone.has(w) || gone.has(o)) return;
        let gp = groups.find((x) => x.o === o); if (!gp) groups.push(gp = { o, ws: [] });
        gp.ws.push(w);
      });
      groups.forEach(({ o, ws }) => {
        if (done.has(o)) return;   // すでに追放されている飼い主は噛まない
        if (!kill(o, ws[0], "bite", false)) return;
        ws.forEach((w) => game.dogBites.push(ws.length > 1 ? { by: w, target: o, simul: true } : { by: w, target: o }));
        if (E(game, o) === R.CAT_PUMPKIN) ws.forEach((w) => { if (kill(w, o, "bite", false)) game.dogBites.push({ by: o, target: w, back: true }); });   // ネコカボチャ: 噛まれたら（噛んだ犬全員を）噛み返す
      });
    }
    // 始めの心中: 追放・メンタル崩壊・ショック死・昼中の死亡など、resolveChain の前にすでに死んでいる人の相方も、ここで一緒に死ぬ
    [...game.eliminated, ...gone].forEach((id) => {
      cupidFollowers(id).forEach((h) => kill(h, id, "follow", false));   // キューピッド: 選んだ2人の一方がすでに死んでいる（追放・昼中の死亡）なら、後を追う
      ONW.loverMates(game, id).forEach((mate) => kill(mate, id, "lovers"));
      if (game.currentRoles[id] === R.FOX && ONW.fanatic) ONW.fanatic.followersOf(game).forEach((f) => kill(f, id, "follow", false));   // すでに死んでいる妖狐（追放など）のあとを背徳者が追う
    });
    // 「めくれた順」の波で処理する。同じ波（同時にめくれた人たち）のわら人形・アサシンは、同じ時点の候補から同時に選ぶ
    while (queue.length) {
      const wave = queue; queue = [];
      const snap = allIds.filter((id) => !done.has(id) && !gone.has(id));   // この波が始まった時点で、まだめくれていない人（わら人形の候補）
      // 1) 選ばなくていい連鎖（一目惚れ・猫又・黒猫）を先に確定させる。アサシンの画面に「？」で出す人に、同じ波のこの連鎖ぶんも含めるため
      wave.forEach((id) => {
        const role = E(game, id);
        if (loveDead(id, role) || sealedAct(id, role)) return;
        if (role === R.LOVE_TANNER) {
          const t = (game.loveTargets || {})[id];
          if (t && !done.has(t) && game.players.some((p) => p.id === t)) take(t, id, "love");
        } else if (role === R.CAT_SIDHE || role === R.BLACK_CAT || role === R.CAT_PUMPKIN) {
          const c = pool(id);
          if (!c.length) return;
          let t = game.catPicks[id];
          if (!t || !c.includes(t)) { const f = ONW.debug ? ONW.debug.randTarget(game, "cat", id) : null; t = game.catPicks[id] = f && c.includes(f) ? f : pick(c); }   // デバッグ: 道連れ先の指定   // 再計算しても同じ相手になるよう、決めた相手は覚えておく
          take(t, id, "tomo");
        }
      });
      flushTomo();   // 猫又・黒猫の道連れをまとめて実行
      // （恋人の心中は kill() の中で、死んだ瞬間に処理される）
      // 2) わら人形・アサシンの選択（同じ波は同時に選ぶ）
      const asks = [];
      wave.forEach((id) => {
        const role = E(game, id);
        if (loveDead(id, role) || sealedAct(id, role)) return;
        if (role === R.STRAW_DOLL) {
          const c = snap.filter((x) => x !== id);
          if (!c.length || c.every(immune)) return;                       // 道連れにできる人がいない（残りが全員タフガイなど）: 選ばずに終わり
          const t = game.strawTargets[id];
          if (t && c.includes(t)) return;
          delete game.strawTargets[id];
          asks.push({ id, cands: c, kind: "straw" });
        } else if (role === R.ASSASSIN) {
          // アサシン: めくれたその場で、自分を除く全プレイヤー（すでにめくれた人も含む）から1人を選ぶ。選んだ相手は死なない（マーリンかどうかだけが勝敗に関わる）
          const c = allIds.filter((x) => x !== id && !gone.has(x));   // 昼中にすでに死んでいる人(game.deadIds)は選べない（この投票でめくれた人は、誰がめくれたか伏せるため候補に残す）
          if (!c.length) return;
          const t = game.assassinTargets[id];
          if (t && c.includes(t)) return;
          delete game.assassinTargets[id];
          asks.push({ id, cands: c, kind: "assassin" });
        } else if (role === R.BOUNTY_HUNTER) {
          // 賞金稼ぎ: めくれたその場で、自分を除く全プレイヤー（すでにめくれた人も含む）から人狼判定だと思う人を1人選ぶ（選んだ相手は死なない。人狼判定かどうかだけが勝敗に関わる）。心中・無理心中・タフガイのとばっちりでは選ばない
          if (bouncedIds.has(id)) return;
          const c = allIds.filter((x) => x !== id && !gone.has(x));   // 昼中にすでに死んでいる人は選べない
          if (!c.length) return;
          const t = game.bountyTargets[id];
          if (t && c.includes(t)) return;
          delete game.bountyTargets[id];
          asks.push({ id, cands: c, kind: "bounty" });
        }
      });
      if (asks.length) {
        if (!auto) { game.strawPending = asks; return null; }   // 選択待ち（この波の全員ぶんをまとめて返す）
        asks.forEach((a) => { const f = a.kind === "straw" && ONW.debug ? ONW.debug.randTarget(game, "straw", a.id) : null; (a.kind === "assassin" ? game.assassinTargets : a.kind === "bounty" ? game.bountyTargets : game.strawTargets)[a.id] = f && a.cands.includes(f) ? f : pick(a.cands); });
      }
      // 3) 選んだ結果を反映
      wave.forEach((id) => {
        const role = E(game, id);
        if (loveDead(id, role) || sealedAct(id, role)) return;
        if (role === R.STRAW_DOLL) {
          const t = game.strawTargets[id];
          if (t && !done.has(t) && !gone.has(t)) take(t, id, "tomo");   // 同じ波の誰かがすでに巻き込んでいたら、そのまま
        } else if (role === R.ASSASSIN) {
          const t = game.assassinTargets[id];
          if (t) game.assassinList.push({ id, target: t });
        } else if (role === R.BOUNTY_HUNTER) {
          const t = game.bountyTargets[id];
          if (t && !bouncedIds.has(id)) game.bountyList.push({ id, target: t });
        }
      });
      flushTomo();   // わら人形の道連れをまとめて実行
    }
    // 王国滅亡（本家 applyQueenKingdomDeaths）: 女王が追放・道連れ（めくれた）か昼中に死亡していたら、まだめくれていない他の村人陣営が一斉にめくれる。
    //   ・対象は最終役職が村人陣営の人（女王本人は除く。チキン・恋人になっている村人陣営の人も王国滅亡で倒れる）。同時に「王国滅亡」でめくれ、勝利条件を失う（結果は game.kingdomIds / chainKind = "queen"）
    //   ・めくれる順に連鎖する能力（道連れ・無理心中など）は、本家と同じく発動しない（連鎖が終わったあとにまとめて倒れる）
    //   ・女王が倒れる → 村人陣営が倒れる → その中の恋人の相方も心中で倒れる → その相方が女王なら…と続くので、変化がなくなるまで繰り返す
    late = true;
    for (;;) {
      const queensFell = allIds.filter((id) => game.currentRoles[id] === R.QUEEN && !ONW.seal.is(game, id) && (done.has(id) || gone.has(id)));   // 封印されている女王が倒れても王国滅亡は起きない（2of4b）
      if (!queensFell.length) break;
      game.queenFallen = queensFell.slice();
      let changed = false;
      allIds.forEach((id) => {
        if (done.has(id) || gone.has(id) || game.currentRoles[id] === R.QUEEN) return;   // チキン・恋人（最終役職が村人陣営）も王国滅亡で倒れる
        const info = ONW.ROLE_INFO[game.currentRoles[id]];
        if (!info || info.team !== ONW.TEAM.VILLAGE) return;
        kill(id, queensFell[0], "queen", false); game.kingdomIds.push(id); changed = true;
      });
      if (!changed) break;   // 新しく倒れた人がいなければ終わり（いれば、その心中で新しい女王が倒れていないか、もう一度見る）
    }
    late = false;
    return [...done];
  };

  /**
   * シュレディンガーの猫（本家 assignSchrodingerSources / resolveSchrodingerAffiliation と同じ考え方）。
   * 最終盤面でシュレディンガーの猫を持っている人それぞれについて、自分に投票した人の中からランダムに1人（= 参照先）を選び、その人の陣営になる。
   *   ・参照先の最終役職が村人陣営 → "village" / 人狼陣営（昇格した狂人も、役職の陣営どおり）→ "wolf" / 第三陣営 → "third"（参照先の役職名が final に入る）
   *   ・参照先が別のシュレディンガーの猫なら、その猫の陣営を引き継ぐ（猫同士の相互参照で堂々巡りになったら "loop" = どの陣営にもなれない）
   *   ・1票も入っていなければ "none"（どの陣営にもなれない）
   *   ・恋人（重複役職）になっている猫は恋人陣営として扱うので "lover"（この能力は働かない）
   * 保安官に撃たれた猫（game.sheriffCatFix[猫の持ち主] = 撃った保安官）は、参照先を保安官にして村人陣営に固定される（fixed: true）。
   * 番犬に噛まれた猫（game.dogBites の target。猫が飼い主で、番犬が猫に投票して噛み殺した）は、参照先を噛んだ番犬にして、番犬の陣営に固定される（fixed: true・bitten: true。今は番犬 = 村人陣営）。
   *   【確定メモ・今後の実装】模倣番犬・犬の狂人に噛まれた猫は人狼陣営に確定する（ONW.watchdog.biteTeam が噛んだ人の役職の陣営を返す）。【確定】一度陣営に入ることが決まった猫は、その後変わらない（保安官に撃たれて村人陣営に固定された猫は、あとで噛まれても村人陣営のまま）。
 * 参照先は一度決めたら game.catSources[猫の持ち主ID] に覚え、勝敗判定を何度呼び直しても同じ人になる（その人がまだ投票者に入っているかぎり）。試合開始時に net.js 側で空に戻す。
   * 結果は game.catInfo[猫の持ち主ID] = { team, direct: 参照先, final: 最終的な参照先（猫をたどった先）, via: 猫を経由したか, votes: 得票数, voters: 投票した人たち } に入れる。
   * 戻り値: game.catInfo
   */
  vote.resolveCats = function resolveCats(game) {
    const R = ONW.ROLE, ids = game.players.map((p) => p.id), role = (id) => game.currentRoles[id];
    const cats = ids.filter((id) => role(id) === R.SCHRODINGER_CAT);
    game.catSources = game.catSources || {};
    Object.keys(game.catSources).forEach((k) => { if (!cats.includes(k)) delete game.catSources[k]; });   // 猫でなくなった人の記録は消す
    const votersOf = (id) => ids.filter((v) => (game.votes || {})[v] === id && ONW.vote.weightOf(game, v) > 0);   // 投票数0票の人（盗賊に盗まれて0票になった人など）が入れた票は、猫の陣営候補にならない（0票を入れている人は参照先に選ばれない・票数にも数えない）
    cats.forEach((id) => {
      const vs = votersOf(id);
      if (!vs.length) { delete game.catSources[id]; return; }
      if (!vs.includes(game.catSources[id])) game.catSources[id] = ONW.utils.randomChoice(vs);   // 自分に投票した人からランダムに1人
    });
    const info = {}, done = {};
    const bitersOf = (id) => (game.dogBites || []).filter((x) => x.target === id && !x.back).map((x) => x.by);   // 番犬に噛み殺された猫（resolveChain が記録した game.dogBites。ネコカボチャの「噛み返し」は数えない）→ 噛んだ犬たちのID（同時に噛まれたら複数）
    //   【同時噛み】村人陣営の犬（番犬）と人狼陣営の犬（模倣番犬・犬の狂人）に同時に噛まれた猫は、村人陣営か人狼陣営かランダム（陣営を等確率で選び、その陣営の犬が参照先）。同じ陣営の犬だけなら、その陣営。
    //   決めた犬は game.catBitePick[猫の持ち主ID] に覚え、勝敗判定を何度呼び直しても同じにする（試合開始時に net.js 側で空に戻す）
    game.catBitePick = game.catBitePick || {};
    Object.keys(game.catBitePick).forEach((k) => { if (!cats.includes(k) || !bitersOf(k).includes(game.catBitePick[k])) delete game.catBitePick[k]; });
    const biteInfo = (id) => {
      const bs = bitersOf(id); if (!bs.length) return null;
      const tm = (b) => ONW.watchdog.biteTeam(game, b), teams = bs.map(tm).filter((x, i, a) => a.indexOf(x) === i);
      if (!game.catBitePick[id] || !bs.includes(game.catBitePick[id])) { const t = teams.length > 1 ? ONW.utils.randomChoice(teams) : teams[0]; game.catBitePick[id] = bs.find((b) => tm(b) === t); }
      const by = game.catBitePick[id];
      return { by, team: tm(by), random: teams.length > 1, biters: bs };
    };
    const teamOfRole = (r) => ONW.roles.getInfo(r).team;
    const resolve = (id, trail) => {
      if (done[id]) return done[id];
      const src = game.catSources[id];
      let r;
      const bite = biteInfo(id);
      if (game.sheriffCatFix && game.sheriffCatFix[id]) r = { team: (game.sheriffCatTeam && game.sheriffCatTeam[id]) || "village", direct: game.sheriffCatFix[id], final: game.sheriffCatFix[id], via: false, fixed: true };   // 保安官に撃たれた猫は村人陣営に固定（投票した人の陣営より優先。恋人の猫は下で恋人陣営）
      else if (bite) r = { team: bite.team, direct: bite.by, final: bite.by, via: false, fixed: true, bitten: true, bitRandom: bite.random, biters: bite.biters };   // 番犬に噛まれた猫は、噛んだ犬の陣営に固定（番犬 = 村人陣営 / 模倣番犬・犬の狂人 = 人狼陣営。村人陣営の犬と人狼陣営の犬に同時に噛まれたらランダム: docs/schrodinger-cat-team.md）。投票した人の陣営より優先
      else if (!src) r = { team: "none", direct: null, final: null, via: false };
      else if (trail.includes(id)) r = { team: "loop", direct: src, final: null, via: true };
      else if (role(src) === R.SCHRODINGER_CAT) { const nx = resolve(src, [...trail, id]); r = { team: nx.team, direct: src, final: nx.final, via: true }; }
      else r = { team: teamOfRole(role(src)), direct: src, final: src, via: false };
      return (done[id] = r);
    };
    cats.forEach((id) => {
      const r = resolve(id, []), vs = votersOf(id);
      info[id] = { ...r, team: ONW.isLover(game, id) ? "lover" : r.team, votes: vs.length, voters: vs };
    });
    game.catInfo = info;
    return info;
  };

  /** わら人形・アサシンの選択待ちがあれば [{ id, cands, kind }, ...] を返す（なければ null）。net.js が結果を出す前に、選び終えるまで繰り返し呼ぶ */
  vote.strawNeed = function strawNeed(game) {
    ONW.vote.resolveChain(game, false);
    return game.strawPending || null;
  };

  /**
   * 勝敗を判定する（マイクラ版の優先順位に準拠。このWeb版にある役職の範囲）。
   * 【勝利優先度（正本: docs/victory-priority.md。ここを変えるときは必ず合わせて直す）】
   *   チキン ＞ 神の祝福 ＞ シャッフラー ＞ 名探偵 ＞ 賞金稼ぎ ＞ バランサー ＞ てるてる坊主＝一目惚れしてるてる＝処刑人 ＞ 恋人 ＞ 神 ＞ 妖狐 ＞ アサシン(暗殺成功) ＞ 村人陣営＝人狼陣営
   *   ・チキン: 村人陣営以外が勝つ結果を、生存したチキンが村人陣営の勝利に逆転（determineWinners / chickenForce で下の分岐をすべて飛ばす）
   *   ・シャッフラー: 通常の結果が出たあと、対象が勝者に入っていれば乗っ取る（determineWinnersCore。神の祝福・恋人・チキンの逆転では乗っ取らない）
   *   ・妖狐: 村人陣営・人狼陣営（アサシンの逆転後の人狼陣営も）が勝つ結果だけを、全員生存の妖狐が乗っ取る（determineWinnersCore）
   *   1. 神が追放された        → 神の祝福: 神以外の全員が勝利（追放されたオポチュニストは除く）
   *   1.5 恋人 / 1.6 名探偵（全員の初期役職を当てた）/ 1.7 賞金稼ぎ / 1.8 バランサー（票が入った全員の票数が同じ）
   *   2. てるてる系が追放された / 2.5 処刑人のターゲットが追放された → 同じ順位（一緒に勝つ）
   *   3. 神が追放されていない   → 神降臨: 神の単独勝利
   *   3.8 王国滅亡（女王が倒れた。この優先度表には載っていない）
   *   4. それ以外              → 村人陣営 / 人狼陣営の基本勝敗（アサシンの逆転を含む）
   *   ・オポチュニストは、どの結果でも「追放されていなければ」追加で勝利
   * 道連れ(猫又・黒猫・わら人形)・無理心中で死んだ人も、マイクラ版どおり「追放された人」として数える。
   * 結果は game.winners（陣営キー）/ winnerIds / winTitle / winTeams / winDetail / executed に入れる。
   */
  /**
   * 【死亡者の唯一の定義】この試合で死んだ人全員の集合を返す。
   *   ・追放 / メンタル崩壊 / ショック死 / 道連れ / 無理心中 / 心中 / 暗殺 など resolveChain が返す人（game.executed）
   *   ・昼中の死亡（game.deadIds）
   * 勝敗判定（人狼判定の死亡・チキンの生存など）は、必ずこの関数の結果だけを見ること。
   * 今後、死因を追加するときは kill()（resolveChain 内）か game.deadIds に入れるだけで、ここに自動で含まれる。
   * 死因ごとに勝敗判定側を書き足す必要はない。
   */
  vote.deadSet = function deadSet(game) {
    return new Set([...(game.executed || []), ...(game.deadIds || [])]);
  };

  /**
   * 呪われし者（js/roles/village/cursed_one.js・docs/cursed-one.md）: 吊られると人狼陣営になる呪われし者のID（マイクラ版 isCursedOneWolfTeamAtEnd）。
   *   ・最終盤面で呪われし者を持っていて、追放（game.executed のうち、巻き込まれ方が無い直接の追放 と 道連れ）で死んだ人。
   *   ・心中・無理心中・後追い・王国滅亡・番犬の噛殺（追放ではない）・昼中の死亡（呪殺など。game.deadIds だけにいる人）は対象外。封印されている人も対象外（村人陣営のまま）。
   *   ・人狼判定（vote.wolfJudgeIds）には数えない。勝者の振り分け（基本勝敗の陣営）だけが人狼陣営になる。
   */
  vote.cursedWolfIds = function cursedWolfIds(game) {
    if (!game.currentRoles || !ONW.ROLE.CURSED_ONE) return [];
    const ex = new Set(game.executed || []), ck = game.chainKind || {};
    return game.players.map((p) => p.id).filter((id) => game.currentRoles[id] === ONW.ROLE.CURSED_ONE && ex.has(id) && (ck[id] === undefined || ck[id] === "tomo") && !(ONW.seal && ONW.seal.is(game, id)));
  };

  vote.determineWinnersCoreBase = function determineWinnersCoreBase(game) {
    ONW.vote.updatePromotion(game);
    const R = ONW.ROLE, ids = game.players.map((p) => p.id);
    const role = (id) => game.currentRoles[id];
    const nm = (list) => list.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    const executed = ONW.vote.resolveChain(game, true);
    game.executed = executed;
    ONW.vote.resolveCats(game);   // シュレディンガーの猫: 自分に投票した人からランダムに1人選び、その人の陣営になる
    game.cursedWolfIds = ONW.vote.cursedWolfIds(game);   // 呪われし者: 吊られて人狼陣営になった人（結果の演出・役職履歴・勝敗用。人狼判定には数えない）
    game.assassinResult = (game.assassinList || []).map((a) => ({ by: a.id, target: a.target, hit: E(game, a.target) === R.MERLIN }));   // 結果の演出用
    game.bountyResult = ONW.bountyResult(game);   // 賞金稼ぎ: 選んだ相手が最終盤面で人狼判定（本物の人狼系 + 昇格した狂人）か（結果の演出・勝敗用）
    const dead = ONW.vote.deadSet(game);   // 死んだ人全員（死因を問わない。game.executed は上で更新済み）
    const gods = ids.filter((id) => role(id) === R.GOD);
    game.godMode = null; game.godIds = []; game.godBlown = [];   // 結果の演出用: "bless"（神の祝福）/ "descend"（神降臨）/ null
    // 無理心中で巻き込まれたてるてる系は、自分のてるてる勝利は発動しない（相手の一目惚れしてるてると「一緒に勝った」扱いになるだけ）
    const byLove = (id) => ["love", "lovers"].includes((game.chainKind || {})[id]);   // 無理心中・心中で死んだてるてる系も同じ扱い
    // 恋人(重複役職)は、恋人のてるてる系が追放されても、てるてるとしては勝利しない（恋人でないてるてる系が優先 / 恋人のてるてる系だけなら神が勝利）
    const isLover = (id) => ONW.isLover(game, id);
    // タフガイのとばっちりで追放された人は、てるてる・一目惚れしてるてる・処刑人のターゲットとしての「追放」には数えない（追放されても、その勝利条件は満たさない）
    const bounced = new Set((game.toughBounces || []).flatMap((b) => b.to || []));
    const bitten = (id) => (game.chainKind || {})[id] === "bite";   // 番犬に噛み殺された人: 追放ではないので、てるてる系・賞金稼ぎ・神の祝福の「追放」条件を満たさない
    const tanners = executed.filter((id) => role(id) === R.TANNER && !byLove(id) && !isLover(id) && !bounced.has(id) && !bitten(id));
    const loveTanners = executed.filter((id) => role(id) === R.LOVE_TANNER && !byLove(id) && !isLover(id) && !bounced.has(id) && !bitten(id));
    // 賞金稼ぎ: 追放（道連れを含む）でめくれて、選んだ相手が人狼判定なら単独勝利。心中・無理心中・タフガイのとばっちりでは発動せず、恋人（重複役職）の賞金稼ぎは勝てない（マイクラ版 applyLimitedSingleWinners）
    const bountyWinIds = (game.bountyResult || []).filter((b) => b.hit && executed.includes(b.by) && !bitten(b.by) && role(b.by) === R.BOUNTY_HUNTER && !byLove(b.by) && !isLover(b.by) && !bounced.has(b.by)).map((b) => b.by);
    const opportunists = ids.filter((id) => role(id) === R.OPPORTUNIST && !dead.has(id));
    // 恋人: 二人とも死んでいない組が勝利（死因は問わない: dead = 追放・連鎖死(道連れ/心中等)・昼中の死亡。今後死因が増えたら、dead に足すだけでここは変わらない）。勝てなかった恋人は、元の陣営が勝っても敗北（マイクラ版の恋人陣営）
    const loverSurvive = ONW.loverPairs(game).filter(([a, b]) => !dead.has(a) && !dead.has(b)).map(([a, b]) => [a, b]);   // キューピッドの組は3つ目に持ち主が付く（番号付け用）。勝者に入れるのは恋人の2人だけ（キューピッド本人は下の追加勝利で判定）
    const loverWinSet = new Set(loverSurvive.flat());
    const lostLover = (id) => isLover(id) && !loverWinSet.has(id);
    // 勝ち組・負け組: 最終盤面でこの役職の人。恋人かどうか・神の祝福・どの陣営が勝っても、勝ち組は必ず勝ち、負け組は必ず負ける（途中で入れ替わって別の役職になっていれば、通常どおり）
    const winnerRoleIds = ids.filter((id) => role(id) === R.WINNER), loserRoleIds = ids.filter((id) => role(id) === R.LOSER);
    // 処刑人: ターゲットが「投票で追放」されたら勝利（単独勝利）。道連れ・心中・無理心中・昼中の死亡など、追放以外でターゲットが死んだら処刑人は敗北。ターゲットが生き残った場合は勝敗に関わらない
    const voted = new Set(game.eliminated || []);
    // 従者の身代わりで追放になった従者は「処刑人の手で処刑できた」ことにはならない（自ら死んだようなもの）。処刑人の勝敗の判定では、投票で追放された人から除く（追放以外で死んだ扱い）
    const subbed = new Set((game.servantSubs || []).map((x) => x.servant));
    // 賞金稼ぎがターゲットの処刑人: 賞金稼ぎが投票で追放され、人狼判定を当てられなかった（外れ）ときだけ有効（処刑人の勝利）。的中なら賞金稼ぎの単独勝利、追放されなかった・追放以外で死んだ・能力が発動しなかった場合は無効（勝ちも負けもない）
     const bountyMissHanged = (tg) => voted.has(tg) && !subbed.has(tg) && !bounced.has(tg) && (game.bountyResult || []).some((b) => b.by === tg && !b.hit);
     const execAll = ONW.execPairs(game).filter(([e, tg]) => e !== tg && (role(tg) !== R.BOUNTY_HUNTER || bountyMissHanged(tg)));
    // シャッフラーで処刑人になった人が、シャッフラーの失敗条件（変化させた人・変化後の本人が死亡など）に当たったときは、処刑人の勝利にしない（あとで勝者から外すと、勝者が空の「処刑人勝利」になってしまう）。本来勝てる陣営（村人・人狼など）の結果になる
    const shFailPre = ONW.shuffler && ONW.shuffler.failed ? new Set(ONW.shuffler.failed(game, new Set(ids), dead)) : new Set();
    const execWinIds = execAll.filter(([e, tg]) => voted.has(tg) && !subbed.has(tg) && !bounced.has(tg) && !lostLover(e) && !shFailPre.has(e)).map(([e]) => e);
    const execLoseIds = execAll.filter(([, tg]) => (!voted.has(tg) || subbed.has(tg) || bounced.has(tg)) && dead.has(tg)).map(([e]) => e);
    // 神の祝福が起きるのは、神が「追放」か「道連れ」で死んだときだけ。心中・無理心中・処刑（処刑人のターゲットとして追放）で死んだ神は、祝福なし
    const godBless = gods.filter((id) => {
      if (!executed.includes(id)) return false;
      const ck = (game.chainKind || {})[id];
      if (ck === "lovers" || ck === "love" || ck === "bite") return false;       // 心中・無理心中・番犬の噛殺
      if (voted.has(id) && execAll.some(([, tg]) => tg === id)) return false;   // 処刑（処刑人のターゲットとして追放）
      return true;                                                              // 追放 / 道連れ
    });
    const shotLostIds = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(game) : [];   // 保安官に撃たれて死に、勝利条件を失った人（身代わりで撃たれた従者は含まない）
    const godAlive = gods.filter((id) => !executed.includes(id) && !shotLostIds.includes(id));   // 撃たれて死んだ神は降臨しない（マイクラ版 teamVictoryBreaks.god）
    if (!godBless.length && godAlive.length) { game.godMode = "descend"; game.godIds = godAlive.slice(); }   // 生存している神は、結果発表でめくれるときに降臨の演出（どの勝敗でも）

    const set = (title, teams, winners, detail, winnerTeams) => {
      // シャッフラーの乗っ取り勝利（determineWinnersCore が、1回目の結果を見て成立したときだけ game.shufflerTake を付けてもう一度ここへ来る）: 勝者はシャッフラーと変化させた人だけ。追加勝利の役職などは下で通常どおり足す
      if (game.foxTake) { title = "妖狐陣営勝利"; teams = ["妖狐陣営"]; game.foxTake.fanatics = ONW.fanatic ? ONW.fanatic.partners(game, dead) : []; winners = [...game.foxTake.ids, ...game.foxTake.fanatics]; detail = ONW.fox.takeoverText(game, game.foxTake.ids); winnerTeams = [ONW.TEAM.THIRD]; }   // 妖狐の乗っ取り（determineWinnersCore が成立を確かめたときだけ game.foxTake を付けて、もう一度ここへ来る）
      if (game.shufflerTake) { title = "シャッフラー勝利"; teams = ["シャッフラー"]; winners = game.shufflerTake.ids.slice(); detail = ONW.shuffler.takeoverText(game, game.shufflerTake, game.shufflerBase); winnerTeams = [ONW.TEAM.THIRD]; }
      game.winTitle = title; game.winTeams = teams; game.winDetail = detail; game.winners = winnerTeams;
      const w = new Set(winners);
      // 王国滅亡で死んだ人（結果発表で倒れた game.kingdomIds・昼中に倒れた deadKind "queen"）と、倒れた女王は勝者から外す。
      //   メモ（docs/victory-priority.md「王国滅亡の判定メモ」）: 本来は 無理心中した / 反転(+反転が奇数個) / 神の祝福が発動 / 羅刹の愛する人として勝利 / (+コピリスト)つき のときだけ勝てる。ここは今、例外なしで外している（例外は未実装）
      [...(game.kingdomIds || []), ...Object.keys(game.deadKind || {}).filter((id) => game.deadKind[id] === "queen"), ...(game.queenFallen || [])].forEach((id) => w.delete(id));
      const shotCut = new Set(shotLostIds.filter((id) => w.has(id)));   // 保安官に撃たれて死んだ人は勝利条件を失う（4of6。勝利優先度の表に行は作らない）
      shotLostIds.forEach((id) => w.delete(id));
      ids.forEach((id) => { if ((role(id) === R.FOX || role(id) === R.FANATIC) && dead.has(id)) w.delete(id); });
    ids.forEach((id) => { if (ONW.fanatic && ONW.fanatic.lostBy(game, id) && !ONW.hiddenDrunk(game, id)) w.delete(id); });   // 鍵師のロックで狂人になれなかった背徳者は勝利条件を失う（2of4b）   // 背徳者: 後追いなどで死んだ背徳者も勝利条件を失う（5of5）
      //   // 妖狐: 呪殺・追放・昼中死亡などで死んだ妖狐は勝利条件を失う（神の祝福でも勝てない。生きている妖狐は祝福で勝つ）   // 王国滅亡: 倒れた女王と、巻き込まれた村人陣営は勝利できない
      // 背徳者（ご主人が狐憑きだけ = 最終盤面に妖狐がいない）: 妖狐陣営ではなく、村人陣営が勝利したら追加で勝利（生きている・ロックされていない背徳者。勝てなかった恋人は下で外れる）
      if (teams.includes("村人陣営") && ONW.fanatic && ONW.fanatic.villageWinners) { const fv = ONW.fanatic.villageWinners(game, dead); fv.forEach((id) => w.add(id)); if (fv.length && !teams.includes("背徳者")) teams.push("背徳者"); }
      ids.forEach((id) => { if (lostLover(id) && role(id) !== R.WINNER) w.delete(id); });     // 勝てなかった恋人は、元の陣営が勝っても敗北（ただし勝ち組は恋人でも勝つ）
      // シャッフラー（マイクラ版の失敗条件）: 追放・死亡しないと勝てない役職以外に変化させたのに対象が死亡 / 村人・人狼陣営の役職に変化させたのにシャッフラーが死亡 → シャッフラーと対象は勝てない（元の陣営が勝っていても敗北）
      const shBan = ONW.shuffler && ONW.shuffler.failed ? ONW.shuffler.failed(game, w, dead) : new Set();
      shBan.forEach((id) => { if (loverWinSet.has(id)) shBan.delete(id); });   // 恋人として勝つ人は、シャッフラーの失敗条件で敗北にしない（恋人 ＞ シャッフラー。(+恋人)と(+シャッフラー)の重複は恋人で判定）
      game.shufflerBan = [...shBan];
      shBan.forEach((id) => w.delete(id));
      winnerRoleIds.forEach((id) => w.add(id));                                                // 勝ち組: 追加勝利
      if (winnerRoleIds.length && !teams.includes("勝ち組")) teams.push("勝ち組");
      loserRoleIds.forEach((id) => w.delete(id));                                              // 負け組: 敗北（ご主人・就職先が負け組なら、従者・フリーターも勝てない）
      execLoseIds.forEach((id) => w.delete(id));                                               // 処刑人: ターゲットが追放以外で死んだら敗北
      opportunists.forEach((id) => { if (!lostLover(id)) w.add(id); });   // オポチュニスト: 追放されていなければ追加勝利
      if (opportunists.length && !teams.includes("オポチュニスト")) teams.push("オポチュニスト");
      // 破局師（マイクラ版の追加勝利）: 破局に成功した（恋人関係を1つでも壊した）カードを最終盤面で持っている人は、どの結果でも追加で勝利（死亡・追放は関係なし）。勝てなかった恋人（本人が恋人）は追加勝利しない
      const breakers = ids.filter((id) => role(id) === R.HEARTBREAKER && ONW.heartbreaker && ONW.heartbreaker.succeeded(game, id) && !lostLover(id));
      breakers.forEach((id) => w.add(id));
      if (breakers.length && !teams.includes("破局師")) teams.push("破局師");
      // 天邪鬼: 村人陣営が勝たなかった（神の祝福でもない）ときだけ、どの結果でも追加で勝利（死亡・追放は関係なし）
      if (!teams.includes("神の祝福") && !teams.includes("村人陣営")) {
        const am = ids.filter((id) => role(id) === R.AMANOJAKU && !lostLover(id));
        am.forEach((id) => w.add(id));
        if (am.length && !teams.includes("天邪鬼")) teams.push("天邪鬼");
      }
      // 処刑人: ターゲットが追放されたときの勝利は、各分岐（処刑人単独勝利 / てるてる系と同時 / 神の祝福）で勝者に入れてある。ここでは足さない
      // フリーター・従者: 就職先 / ご主人が勝利していれば追加で勝利（追加勝利した人でもよい。勝者が増えなくなるまで繰り返すので、従者→フリーター→従者の連鎖も同じループ）。
      //   就職先・ご主人は「役職の持ち主」に記録されている。従者は追放（身代わり）・死亡していても勝てる。勝てなかった恋人は追加勝利しない
      const freeters = ids.filter((id) => role(id) === R.FREETER);
      const servants = ONW.servantPairs(game).filter(([s, m]) => s !== m);
      const gremlins = ONW.gremlinPairs(game);   // グレムリン: 選んだ2人（コピー元・コピー先）のどちらかが勝利していれば追加で勝利
      // シュレディンガーの猫: 参照先の陣営が勝利していれば追加で勝利（村人陣営・人狼陣営は勝利陣営かどうか / 第三陣営の役職の人が参照先なら、その人が勝利しているか）。無所属・堂々巡り・恋人の猫は勝てない
      const cats = ids.filter((id) => role(id) === R.SCHRODINGER_CAT && !lostLover(id) && !isLover(id));
      const catWins = (id) => {
        const c = (game.catInfo || {})[id];
        if (!c) return false;
        if (c.team === "village") return teams.includes("村人陣営");
        if (c.team === "wolf") return teams.includes("人狼陣営");
        if (c.team === "third") return !!c.final && w.has(c.final);
        return false;
      };
      // キューピッド（マイクラ版の追加勝利）: 選んだ2人がどちらも死んでおらず（吊られておらず）、2人とも勝利していれば、キューピッド本人が吊られていても・後追いで死んでいても追加で勝利する。勝てなかった恋人（本人が恋人）は追加勝利しない
      const cupids = ONW.cupid ? ONW.cupid.pairs(game).filter(([a, b, h]) => a !== h && b !== h) : [];
      if (freeters.length || servants.length || gremlins.length || cats.length || cupids.length) {
        let changed = true, added = false, addedServant = false, addedGremlin = false, addedCat = false, addedCupid = false;
        while (changed) {
          changed = false;
          cupids.forEach(([a, b, h]) => { if (!w.has(h) && w.has(a) && w.has(b) && !dead.has(a) && !dead.has(b) && !lostLover(h)) { w.add(h); changed = true; addedCupid = true; } });
          cats.forEach((id) => { if (!w.has(id) && catWins(id)) { w.add(id); changed = true; addedCat = true; } });
          freeters.forEach((id) => {
            const t = ONW.getRoleBound(game, "freeterTargets", id);
            if (t && w.has(t) && !w.has(id) && !lostLover(id)) { w.add(id); changed = true; added = true; }
          });
          gremlins.forEach(([gid, [a, b]]) => {
            if ((w.has(a) || w.has(b)) && !w.has(gid) && !lostLover(gid)) { w.add(gid); changed = true; addedGremlin = true; }
          });
          servants.forEach(([s, m]) => {
            if (w.has(m) && !w.has(s) && !lostLover(s)) { w.add(s); changed = true; addedServant = true; }
          });
        }
        if (added && !teams.includes("フリーター")) teams.push("フリーター");
        if (addedServant && !teams.includes("従者")) teams.push("従者");
        if (addedGremlin && !teams.includes("グレムリン")) teams.push("グレムリン");
        if (addedCat && !teams.includes("シュレディンガーの猫")) teams.push("シュレディンガーの猫");
        if (addedCupid && !teams.includes("キューピッド")) teams.push("キューピッド");
      }
      // 復讐者（マイクラ版 vote.js の AVENGER。追加勝利）: 他の勝者がすべて決まったあと（上の追加勝利の連鎖まで）に、復讐対象が勝者に入っていなければ追加で勝利する（陣営名は「復讐者」）。
      //   敗北: ①対象が自分自身（役職交換・コピーの結果。補正しない）②復讐者どうしがお互いを対象にしている（最終役職が両方とも復讐者で互いを指す）③勝利できない扱い（勝てなかった恋人・シャッフラーの失敗・撃たれた人・王国滅亡で倒れた人）。
      //   チキンの逆転後も determineWinnersCore が set を通るので、逆転後の勝者で同じように判定し直す。player の並び順に判定し、勝った復讐者は w に入る（マイクラ版と同じ）
      if (ONW.avenger) {
        const noWin = (id) => lostLover(id) || shBan.has(id) || shotLostIds.includes(id) || (game.kingdomIds || []).includes(id) || (game.queenFallen || []).includes(id) || (game.deadKind || {})[id] === "queen";
        let addedAv = false;
        ONW.avenger.picks(game).forEach(([h, t]) => {
          if (t === h || noWin(h) || ONW.avenger.mutual(game, h) || w.has(t)) return;
          w.add(h); addedAv = true;
        });
        if (addedAv && !teams.includes("復讐者")) teams.push("復讐者");
      }
      loserRoleIds.forEach((id) => w.delete(id));
      execLoseIds.forEach((id) => w.delete(id));
      // 勝者なし（王国滅亡で村人陣営・人狼陣営とも勝てない）でも、追加勝利者（勝ち組・オポチュニスト・天邪鬼・フリーター・従者など）が勝っているときは、「勝者なし」ではなく追加勝利者の勝利として扱う
      if (title === "勝者なし" && w.size) {
        const extra = teams.filter((t) => t !== "処刑人" || w.size);
        game.winTitle = `${extra.length ? extra.join("＆") : "追加勝利"}勝利`;
        game.winDetail = `${String(detail).replace("ため勝者なしです。", "ため、村人陣営にも人狼陣営にも勝者はいません。")} 追加勝利: ${[...w].map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、")}`;
      }
      // シャッフラー: 失敗した人は追加勝利（天邪鬼・フリーターなど）でも勝てない / 勝ち組に変化させた組は、失敗していなければシャッフラーも追加で勝利
      shBan.forEach((id) => w.delete(id));
      if (ONW.shuffler && ONW.shuffler.addWinnerPairs && ONW.shuffler.addWinnerPairs(game, w).length && !teams.includes("シャッフラー")) teams.push("シャッフラー");
      if (shBan.size && ONW.shuffler) game.winDetail = `${game.winDetail}\n${ONW.shuffler.failText(game, [...shBan])}`;
      shotLostIds.forEach((id) => { if (w.has(id)) shotCut.add(id); w.delete(id); });   // 追加勝利（破局師・天邪鬼・勝ち組など）でも、撃たれて死んだ人は勝てない
      if (shotCut.size) game.winDetail = `${game.winDetail}\n${nm([...shotCut])} は保安官に撃たれたため、勝利条件を失いました。`;
      game.winnerIds = [...w];
      return game.winners;
    };

    // 1. 神の祝福
    if (!game.chickenForce && godBless.length) {
      game.godMode = "bless"; game.godIds = godBless.slice();
      game.godBlown = ids.filter((id) => (role(id) === R.OPPORTUNIST && dead.has(id)) || role(id) === R.AMANOJAKU || role(id) === R.LOSER);   // 結果演出: 祝福で吹き飛ばされるカード
      const win = ids.filter((id) => role(id) !== R.GOD && role(id) !== R.AMANOJAKU && role(id) !== R.LOSER && !(role(id) === R.OPPORTUNIST && dead.has(id)));   // 天邪鬼は祝福に逆らえず敗北
      return set("神の祝福を受けました", ["神の祝福"], win,
        `神 ${nm(godBless)} が追放されたため、神以外の全員が勝利です。追放されたオポチュニストと天邪鬼と負け組は勝利できません。`, [ONW.TEAM.THIRD]);
    }
    // 1.6 名探偵の勝利: 投票のあとの推理で、自分を除く全員の初期役職を当てた（js/roles/neutral/detective.js）。神の祝福のあと・賞金稼ぎ(1.7)・バランサー(1.8)より前（docs/victory-priority.md）。名探偵が2人以上いれば、推理に成功した全員が同時に勝つ。
    //   シャッフラーの乗っ取りは、この結果が出たあとに determineWinnersCore が行う（シャッフラー ＞ 名探偵）。アサシンの逆転より上なので、暗殺が成功していても名探偵の単独勝利（マイクラ版の「人狼陣営・名探偵勝利」の同時勝利はなし = ユーザー指定）
    //   シャッフラーの失敗条件に当たる人は、処刑人と同じく先に除く（あとで勝者から外すと、勝者が空の「名探偵勝利」になってしまう）
    const detWinIds = ONW.detective && !game.chickenForce ? ONW.detective.winIds(game).filter((id) => !shFailPre.has(id)) : [];
    if (!game.chickenForce && detWinIds.length) {
      return set("名探偵勝利", ["名探偵"], detWinIds, ONW.detective.winText(game, detWinIds, nm), [ONW.TEAM.THIRD]);
    }
    // 1.7 賞金稼ぎの勝利: 選んだ相手が人狼判定だった。恋人・てるてる坊主・一目惚れしてるてる・アサシンの逆転勝利より優先（神の祝福のあと）。ほかの陣営は勝てない
    if (!game.chickenForce && bountyWinIds.length) {
      const tg = (game.bountyResult || []).filter((b) => bountyWinIds.includes(b.by)).map((b) => b.target);
      return set("賞金稼ぎ勝利", ["賞金稼ぎ"], bountyWinIds, `賞金稼ぎ ${nm(bountyWinIds)} が選んだ ${nm(tg)} は人狼判定でした。賞金稼ぎの単独勝利です。`, [ONW.TEAM.THIRD]);
    }
    // 1.8 バランサーの勝利: 票が入った全員（2人以上）の票数が同じで、最終盤面のバランサーが投票していた（js/roles/neutral/balancer.js）。賞金稼ぎのあと・てるてる系・処刑人より前（docs/victory-priority.md）。バランサーが2人以上いれば、条件を満たした全員が同時に勝つ。
    //   シャッフラーの失敗条件に当たる人は、処刑人と同じく先に除く（あとで勝者から外すと、勝者が空の「バランサー勝利」になってしまう）
    const balWinIds = ONW.balancer && !game.chickenForce ? ONW.balancer.winIds(game).filter((id) => !shFailPre.has(id)) : [];
    if (!game.chickenForce && balWinIds.length) {
      return set("バランサー勝利", ["バランサー"], balWinIds, ONW.balancer.winText(game, balWinIds, nm), [ONW.TEAM.THIRD]);
    }
    // 2. てるてる系の勝利
    if (!game.chickenForce && (tanners.length || loveTanners.length)) {
      const win = [...tanners, ...loveTanners, ...execWinIds];   // ターゲットがてるてる系なら、処刑人もてるてる系も一緒に勝利
      loveTanners.forEach((id) => { const t = (game.loveTargets || {})[id]; if (t) win.push(t); });
      const teams = [], parts = [];
      if (execWinIds.length) { teams.push("処刑人"); parts.push(`処刑人 ${nm(execWinIds)} のターゲットが追放されました`); }
      if (tanners.length) { teams.push("てるてる坊主"); parts.push(`追放されたてるてる坊主: ${nm(tanners)}`); }
      if (loveTanners.length) { teams.push("一目惚れしてるてる"); parts.push(`追放された一目惚れしてるてる: ${nm(loveTanners)}`); }
      return set(`${teams.join("＆")}勝利`, teams, win, parts.join(" / "), [ONW.TEAM.THIRD]);
    }
    // 2.5 処刑人の単独勝利（ターゲットが追放された。てるてる系と同じ順位で、神降臨より前。村人陣営・人狼陣営は勝てない）
    if (!game.chickenForce && execWinIds.length) {
      return set("処刑人勝利", ["処刑人"], execWinIds, `処刑人 ${nm(execWinIds)} のターゲット ${nm(execAll.filter(([e]) => execWinIds.includes(e)).map(([, tg]) => tg))} が追放されました。`, [ONW.TEAM.THIRD]);
    }
    // 2.8 恋人勝利: 二人とも死ななかった恋人の組が勝利（恋人以外は敗北）。2026-10-12 から、賞金稼ぎ・てるてる系・処刑人より下、神降臨より上（docs/victory-priority.md）
    if (!game.chickenForce && loverSurvive.length) {
      return set("恋人陣営勝利", ["恋人陣営"], loverSurvive.flat(),
        `恋人 ${loverSurvive.map(([a, b]) => `${nm([a])} ❤ ${nm([b])}`).join("、")} が二人とも死亡しませんでした。恋人以外は敗北です。`, [ONW.TEAM.THIRD]);
    }
    // 3. 神降臨（処刑人より後）（神が追放されなかった）
    if (!game.chickenForce && godAlive.length) {
      game.godMode = "descend"; game.godIds = godAlive.slice();
      return set("神降臨", ["神"], godAlive, "神が追放されませんでした。", [ONW.TEAM.THIRD]);
    }
    // 3.8 王国滅亡（本家 buildQueenOverrideResult。判定が特殊なので勝利優先度の表には載せない。勝てる例外のメモは docs/victory-priority.md「王国滅亡の判定メモ」）: 女王が追放・道連れ（または昼中に死亡）したとき。神の祝福・恋人勝利・てるてる系・神降臨・処刑人より後ろ、基本勝敗より前
    //   ・女王と人狼判定の者が一緒に倒れた → 勝者なし / 人狼判定の者が倒れていない → 人狼陣営の勝利 / 人狼陣営がいない → 勝者なし
    //   ・生存したチキンがいれば、determineWinners が村人陣営の逆転勝利に作り直す（このときは chickenForce で、ここは通らない）
    const fallenQueens = ids.filter((id) => role(id) === R.QUEEN && dead.has(id));
    if (!game.chickenForce && fallenQueens.length) {
      const wq = ONW.vote.wolfJudgeIds(game), wqDead = wq.filter((id) => dead.has(id));
      if (wqDead.length) return set("勝者なし", [], [], `女王 ${nm(fallenQueens)} と人狼判定の者 ${nm(wqDead)} が同時に倒れました。村人陣営は勝利条件を失い、人狼陣営も勝てないため勝者なしです。`, []);
      const wolfTeam = ids.filter((id) => ONW.roles.getInfo(role(id)).team === ONW.TEAM.WOLF || (game.cursedWolfIds || []).includes(id));
      if (wolfTeam.length) return set("人狼陣営勝利", ["人狼陣営"], wolfTeam, `女王 ${nm(fallenQueens)} が倒れ、人狼判定の者は倒れていないため人狼陣営の勝利です。（村人陣営は勝利条件を失いました）`, [ONW.TEAM.WOLF]);
      return set("勝者なし", [], [], `女王 ${nm(fallenQueens)} が倒れ、村人陣営も人狼陣営も勝利条件を満たしませんでした。`, []);
    }
    // 4. 基本勝敗（マイクラ版準拠）
    //  ・「人狼判定」= 最終盤面の本物の人狼 + 昇格した狂人
    //  ・人狼判定の者が1人でも死亡している（死因は問わない） → 村人陣営の勝ち / 1人も死亡していない → 人狼陣営の勝ち
    //  ・人狼判定の者が最終盤面に1人もいない → 村人陣営の勝ち
    const wolves = ONW.vote.wolfJudgeIds(game);
    // 人狼判定の者が1人でも死んでいれば、死因（追放・道連れ・無理心中・暗殺・昼中の死亡・今後追加される死因すべて）を問わず、
    // 人狼陣営の勝利条件は消えて村人陣営の勝利条件を満たす。死因ごとの判定は書かない（dead に入っていれば自動で対象になる）
    const deadWolves = wolves.filter((id) => dead.has(id));
    let side = (game.chickenForce || wolves.length === 0 || deadWolves.length > 0) ? ONW.TEAM.VILLAGE : ONW.TEAM.WOLF;
    if (game.chickenForce === "wolf") side = ONW.TEAM.WOLF;   // 模倣チキンの逆転（人狼陣営が負ける結果を人狼陣営の勝ちに作り直す）
    // アサシンがマーリンを当てたら、村人陣営の勝ちは人狼陣営の逆転勝利になる
    const assHits = (game.assassinResult || []).filter((a) => a.hit);
    const reversed = !game.chickenForce && side === ONW.TEAM.VILLAGE && assHits.length > 0;
    if (reversed) side = ONW.TEAM.WOLF;
    const fake = !!game.fakeWolfWhenNoWolf;
    let detail;
    if (wolves.length === 0) detail = fake ? "最終盤面に本物の人狼も人狼判定の狂人もいませんでした。" : "最終盤面に本物の人狼がいませんでした。";
    else if (deadWolves.length) detail = `死亡した${fake ? "人狼判定" : "人狼"}: ${nm(deadWolves)}`;
    else detail = fake ? "人狼判定の者が誰も死亡しませんでした。" : "本物の人狼が誰も死亡しませんでした。";
    if (reversed) detail = `アサシン ${nm(assHits.map((a) => a.by))} が マーリン ${nm(assHits.map((a) => a.target))} を暗殺しました。人狼陣営の逆転勝利です。（${detail}）`;
    const cw = game.cursedWolfIds || [];   // 吊られた呪われし者は人狼陣営の側に入る（村人陣営の勝利には入らない）
    const win = ids.filter((id) => (cw.includes(id) ? ONW.TEAM.WOLF : ONW.roles.getInfo(role(id)).team) === side);
    if (cw.length) detail += `（呪われし者 ${nm(cw)} は吊られて人狼陣営になりました）`;
    return set(side === ONW.TEAM.VILLAGE ? "村人陣営勝利" : "人狼陣営勝利", [side === ONW.TEAM.VILLAGE ? "村人陣営" : "人狼陣営"], win, detail, [side]);
  };

  /** 勝敗の判定（シャッフラーの乗っ取り勝利つき）: まず通常どおり判定し、シャッフラーの組が成立していたら（失敗条件を除いた対象が勝者に入っているとき）、勝者をシャッフラーと対象だけにして判定し直す。
   *  神の祝福・チキンの逆転（chickenForce）・恋人が絡む組では乗っ取らない（ONW.shuffler.takeover）。 */
  vote.determineWinnersCore = function determineWinnersCore(game) {
    game.shufflerTake = null; game.shufflerBan = []; game.foxTake = null;
    ONW.vote.determineWinnersCoreBase(game);
    // 妖狐（マイクラ版 applyFoxOverride）: 村人陣営か人狼陣営が勝つ結果のとき、妖狐が全員生き残っていれば勝利を乗っ取る（シャッフラーより先・チキンの逆転より後）。チキンの逆転の再判定（chickenForce）では乗っ取らない
   
    if (!game.chickenForce && ONW.fox && ONW.fox.takeover && ((game.winTeams || []).includes("村人陣営") || (game.winTeams || []).includes("人狼陣営"))) {
      const fx = ONW.fox.takeover(game);
      if (fx.length) { game.foxTake = { ids: fx, from: game.winTitle }; ONW.vote.determineWinnersCoreBase(game); }
    }
    if (ONW.shuffler && ONW.shuffler.takeover && !game.chickenForce && !(game.winTeams || []).includes("神の祝福")) {
      const tk = ONW.shuffler.takeover(game);
      if (tk) { game.shufflerBase = game.winTitle; game.shufflerTake = tk; ONW.vote.determineWinnersCoreBase(game); game.shufflerTake = null; }
    }
    game.foxTake = null;
    return game.winners;
  };

  /**
   * 勝敗を判定する（チキンの逆転つき）。
   * まず通常どおり判定し、村人陣営が勝っていない（他陣営・第三陣営・恋人・神などが勝った）のに、
   * 最終盤面でチキンが生存（追放・道連れ・昼中の死亡をしていない / 恋人でない / 酔っていない）していれば、
   * 村人陣営の逆転勝利に作り直す。逆転前の結果は game.chickenReverse に残して、結果発表の演出で先に見せる。
   */
  const determineWinnersInner = function determineWinners(game) {
    game.chickenForce = false; game.chickenReverse = null; game.balancerFx = null;
    ONW.vote.determineWinnersCore(game);
    game.balancerFx = ONW.balancer ? ONW.balancer.fx(game) : null;   // バランサーの天秤の演出データ（結果発表の stageResult.balancer 用）。チキンの逆転で勝敗が作り直される前の結果（winTitle / winTeams）で決める: 逆転前の「バランサー勝利」を先に見せてから覆すため
    const teams0 = game.winTeams || [];
    const dead = ONW.vote.deadSet(game);   // 死亡判定は deadSet に一本化（チキンも、どの死因で死んでも生存扱いにならない）
    const alive = (id) => !dead.has(id) && !ONW.isLover(game, id) && !ONW.hiddenDrunk(game, id);
    const ids = game.players.map((p) => p.id);
    const nm = (list) => list.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    // 本物のチキン: 村人陣営以外が勝つ結果を村人陣営の勝ちに逆転（人狼陣営の勝ちも逆転する）
    const chickens = teams0.includes("村人陣営") ? [] : ids.filter((id) => game.currentRoles[id] === ONW.ROLE.CHICKEN && alive(id));
    // 模倣チキン（Web版独自）: 模倣の人狼が模倣したチキンが生存していて、人狼陣営が勝たない結果（村人陣営・第三陣営などの勝ち・勝者なし）を人狼陣営の勝ちに逆転。勝者なし（女王と人狼判定の者が同時に倒れた等）も、本物のチキンと同じく逆転する。
    //   本物のチキンも逆転できるときは本物が優先（模倣チキンは動かない）。ONW.mimic.flags.mimicChickenReversesWolfLoss で切替
    const M = ONW.mimic;
    const mimicChickens = (chickens.length || teams0.includes("人狼陣営") || !(M && M.flags.mimicChickenReversesWolfLoss)) ? []
      : ids.filter((id) => game.currentRoles[id] === ONW.ROLE.MIMIC_WOLF && E(game, id) === ONW.ROLE.CHICKEN && alive(id));
    const list = chickens.length ? chickens : mimicChickens;
    if (!list.length) return game.winners;
    const toWolf = !chickens.length;
    const from = { title: game.winTitle, teams: [...teams0] };
    game.chickenForce = toWolf ? "wolf" : true;
    ONW.vote.determineWinnersCore(game);
    game.chickenForce = false;
    game.godMode = null; game.godIds = []; game.godBlown = [];   // 逆転後は神の演出は出さない
    game.chickenReverse = { fromTitle: from.title, fromTeams: from.teams, ids: list, names: list.map((id) => (ONW.utils.playerById(game, id) || {}).name), toWolf };
    game.winDetail = toWolf
      ? `生存した模倣チキン ${nm(list)} が人狼陣営の敗北を逆転させました。（逆転前: ${from.title}）`
      : `生存したチキン ${nm(list)} が村人陣営以外の勝利を逆転させました。（逆転前: ${from.title}）`;
    return game.winners;
  };

  /**
   * 愉快犯（マイクラ版 vote.js の applyPranksterOutcomeToResult）: 通常の結果（追加勝利・チキンの逆転まで）が決まったあとに、愉快犯の条件で勝者を作り直す。
   *  勝利優先度の表には載せない（結果の上書きのため。docs/victory-priority.md「愉快犯の判定メモ」）。
   *  ・適用される愉快犯: 最終盤面で愉快犯のカードを持ち、対象を選んでいる人の中から1人をランダムに選ぶ（愉快犯が2人以上でも1人の条件を全員で共有）。
   *  ・成功: 「選んだ人が敗北したら」系は対象が勝者にいなければ成功 / 「勝利したら」系は対象が勝者にいれば成功。対象が別の愉快犯のときは、敗北系は必ず成功・勝利系は必ず失敗。
   *  ・成功すると条件どおりに勝者を作り直す。失敗すると、適用された愉快犯だけ勝者から外す。
   *  ・勝てない扱いの人（勝てなかった恋人・シャッフラーの失敗・撃たれた人・王国滅亡で倒れた人）は、全員勝利系・単独勝利・追加勝利でも勝者に入れない。
   *  ・愉快犯で村人陣営の勝者（恋人でない人）が減ったときだけ、生存したチキンがもう一度逆転する（マイクラ版 applyLateChickenSoloOverride。愉快犯は再適用しない）。 */
  vote.applyPrankster = function applyPrankster(game) {
    game.pranksterResult = null; game.pranksterFx = null;
    const P = ONW.prankster;
    if (!P || game.abandoned) { game.pranksterAppliedId = null; return; }
    const R = ONW.ROLE, T = ONW.TEAM, ids = game.players.map((p) => p.id);
    const cand = P.picks(game);
    if (!cand.length) { game.pranksterAppliedId = null; return; }
    let hid = game.pranksterAppliedId;
    if (!cand.some(([h]) => h === hid)) hid = ONW.utils.randomChoice(cand.map(([h]) => h));
    game.pranksterAppliedId = hid;
    const rec = cand.find(([h]) => h === hid)[1];
    const nm = (id) => (ONW.utils.playerById(game, id) || {}).name || "?";
    const dead = ONW.vote.deadSet(game);
    const loverWin = new Set(ONW.loverPairs(game).filter(([a, b]) => !dead.has(a) && !dead.has(b)).flat());
    const shot = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(game) : [];
    const noWin = new Set(ids.filter((id) => (ONW.isLover(game, id) && !loverWin.has(id) && game.currentRoles[id] !== R.WINNER) || (game.shufflerBan || []).includes(id) || shot.includes(id) || (game.kingdomIds || []).includes(id) || (game.queenFallen || []).includes(id) || (game.deadKind || {})[id] === "queen"));
    const before = new Set(game.winnerIds || []);
    const pIds = ids.filter((id) => game.currentRoles[id] === R.PRANKSTER);
    const targetIsPrankster = rec.t !== hid && game.currentRoles[rec.t] === R.PRANKSTER;
    const targetWon = before.has(rec.t);
    const success = rec.o.startsWith("target_lose_") ? (targetIsPrankster ? true : !targetWon) : rec.o.startsWith("target_win_") ? (targetIsPrankster ? false : targetWon) : false;
    let w = new Set(before), teams = [...(game.winTeams || [])], keys = [...(game.winners || [])];
    const chickenPre = !!game.chickenReverse;   // 愉快犯の前に（determineWinners で）もうチキンが逆転していたか
    const fxFrom = { title: game.winTitle, teams: [...teams] };   // 愉快犯が影響する前の勝敗（演出で先に見せる）
    const ok = (id) => !noWin.has(id);
    let detail = null;
    if (success) {
      const kind = rec.o.replace(/^target_(lose|win)_/, "");
      if (kind === "bonus") { pIds.filter(ok).forEach((id) => w.add(id)); const had = teams.includes("愉快犯"); if (!had) teams.push("愉快犯"); if (!keys.includes(T.THIRD)) keys.push(T.THIRD); if (!had && /勝利$/.test(game.winTitle || "") && game.winTitle !== "全員勝利") game.winTitle = game.winTitle.replace(/勝利$/, "＆愉快犯勝利"); }   // 追加勝利: 勝利タイトルも「村人陣営＆愉快犯勝利」にする（演出の字幕のあとに元のタイトルへ戻って見えないように）
      else if (kind === "solo") { w = new Set(pIds.filter(ok)); teams = ["愉快犯"]; keys = [T.THIRD]; game.winTitle = "愉快犯勝利"; detail = "愉快犯の条件が成立したため単独勝利しました。"; }
      else if (kind === "all_lose") { w = new Set(); teams = []; keys = []; game.winTitle = "勝者なし"; detail = "愉快犯の条件が成立したため全員敗北になりました。"; }
      else if (kind === "all_win") { w = new Set(ids.filter(ok)); teams = ["全員"]; keys = [T.VILLAGE, T.WOLF, T.THIRD]; game.winTitle = "全員勝利"; detail = "愉快犯の条件が成立したため全員勝利になりました。"; }
      else if (kind === "only_target") { w = new Set([rec.t]); teams = [nm(rec.t)]; keys = [T.THIRD]; game.winTitle = `${nm(rec.t)}勝利`; detail = `愉快犯の条件が成立したため${nm(rec.t)}のみ勝利になりました。`; }
      else if (kind === "others_win") { w = new Set(ids.filter((id) => id !== rec.t && ok(id))); teams = [`${nm(rec.t)}以外`]; keys = [T.VILLAGE, T.WOLF, T.THIRD]; game.winTitle = `${nm(rec.t)}以外全員勝利`; detail = `愉快犯の条件が成立したため${nm(rec.t)}以外全員勝利になりました。`; }
      else if (kind === "everyone_but_prankster") { w = new Set(ids.filter((id) => !pIds.includes(id) && ok(id))); teams = ["愉快犯以外"]; keys = [T.VILLAGE, T.WOLF, T.THIRD]; game.winTitle = "愉快犯以外全員勝利"; detail = "愉快犯の条件が成立したため愉快犯以外全員勝利になりました。"; }
      game.winDetail = `${game.winDetail || ""}${game.winDetail ? "\n" : ""}${detail ? detail + " " : ""}愉快犯が影響を及ぼしました。`;
    } else w.delete(hid);
    game.winnerIds = [...w]; game.winTeams = teams; game.winners = keys;
    if (success) game.pranksterFx = { kind: rec.o.replace(/^target_(lose|win)_/, ""), targetId: rec.t, target: nm(rec.t), fromTitle: fxFrom.title, fromTeams: fxFrom.teams, toTitle: game.winTitle, toTeams: [...teams] };   // 成立したときだけ（失敗は勝者から外れるだけ）
    // 愉快犯で村人陣営の勝者（恋人でない人）が減ったときだけ、生存したチキンがもう一度逆転する（愉快犯は再適用しない）
    const villageLost = success && ids.some((id) => !ONW.isLover(game, id) && ONW.roles.getInfo(game.currentRoles[id]).team === T.VILLAGE && ok(id) && before.has(id) && !w.has(id));
    const chickens = villageLost ? ids.filter((id) => game.currentRoles[id] === R.CHICKEN && !dead.has(id) && !ONW.isLover(game, id) && !ONW.hiddenDrunk(game, id)) : [];
    let saved = false;
    if (chickens.length) {
      const from = { title: game.winTitle, teams: [...teams] };
      game.chickenForce = true; ONW.vote.determineWinnersCore(game); game.chickenForce = false;
      game.godMode = null; game.godIds = []; game.godBlown = [];
      game.chickenReverse = { fromTitle: from.title, fromTeams: from.teams, ids: chickens, names: chickens.map(nm), toWolf: false };
      game.winDetail = `生存したチキン ${chickens.map(nm).join("、")} が愉快犯の影響を逆転させました。（逆転前: ${from.title}）`;
      saved = true;
    }
    // 模倣チキン（勝利優先度: チキン ＞ 模倣チキン ＞ 愉快犯）: 愉快犯の結果が人狼陣営の勝ちでなければ、生存した模倣チキンが人狼陣営の勝ちに逆転する（本物のチキンが逆転したときは、そちらが優先）
    if (!saved && success && ONW.mimic && ONW.mimic.flags.mimicChickenReversesWolfLoss && !(game.winTeams || []).includes("人狼陣営")) {
      const mc = ids.filter((id) => game.currentRoles[id] === R.MIMIC_WOLF && E(game, id) === R.CHICKEN && !dead.has(id) && !ONW.isLover(game, id) && !ONW.hiddenDrunk(game, id));
      if (mc.length) {
        const from = { title: game.winTitle, teams: [...(game.winTeams || [])] };
        game.chickenForce = "wolf"; ONW.vote.determineWinnersCore(game); game.chickenForce = false;
        game.godMode = null; game.godIds = []; game.godBlown = [];
        game.chickenReverse = { fromTitle: from.title, fromTeams: from.teams, ids: mc, names: mc.map(nm), toWolf: true };
        game.winDetail = `生存した模倣チキン ${mc.map(nm).join("、")} が愉快犯の影響を逆転させました。（逆転前: ${from.title}）`;
        saved = true;
      }
    }
    if (game.pranksterFx) game.pranksterFx.chickenFirst = chickenPre && !saved;   // 愉快犯の前にチキンが逆転していて、愉快犯のあとの逆転では上書きされなかった = 演出もチキンが先
    game.pranksterResult = { id: hid, name: nm(hid), targetId: rec.t, target: nm(rec.t), outcome: rec.o, label: P.LABELS[rec.o] || rec.o, success, chicken: saved };
  };

  /** 勝敗を判定する（チキンの逆転つき）→ そのあと愉快犯の条件を適用 */
  vote.determineWinners = function determineWinners(game) {
    determineWinnersInner(game);
    ONW.vote.applyPrankster(game);
    return game.winners;
  };

  ONW.vote = vote;

})(window.ONW);
