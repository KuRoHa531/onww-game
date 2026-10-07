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
    const ids = game.players.map((p) => p.id), kingMode = ONW.vote.kingPromotion(game, game.currentRoles);
    if (!game.fakeWolfWhenNoWolf && !kingMode) return;
    if (ids.some((id) => ONW.vote.isRealWolfKind(game.currentRoles[id], kingMode))) return;
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

  /**
   * 1人の投票が何票ぶんか。最終盤面でメイヤーを持っている人は、ルーム設定の票数（2〜10票）ぶん。それ以外は1票。
   * 酔いが覚めていない酔っ払いは、まだ自分の役職の能力を使えないので1票（新聞配達員・チキンの逆転と同じ扱い）。
   */
  vote.weightOf = function weightOf(game, voterId) {
    if (game.currentRoles && game.currentRoles[voterId] === ONW.ROLE.MAYOR && !ONW.hiddenDrunk(game, voterId)) return ONW.mayorVotes(game);
    // 麻婆の人狼（本家 MAPO_WOLF）が盤面にいる間、豆腐の人狼は2票持ち
    if (game.currentRoles && game.currentRoles[voterId] === ONW.ROLE.TOFU_WOLF && !ONW.hiddenDrunk(game, voterId) && vote.mapoOn(game)) return 2;
    return 1;
  };

  /**
   * 麻婆の人狼の効果が働いているか（最終盤面に麻婆の人狼がいて、酔いが覚めている）。
   * excl（Set）に入っている人は数えない（昼中に先に死亡した人・同じ投票で追放される人）。
   */
  vote.mapoOn = function mapoOn(game, excl) {
    return game.players.some((p) => game.currentRoles[p.id] === ONW.ROLE.MAPO_WOLF && !ONW.hiddenDrunk(game, p.id) && !(excl && excl.has(p.id)));
  };

  /**
   * 豆腐の人狼のメンタル崩壊（1票でも入ったら、つられる人と同時に追放）になる人。
   * 麻婆の人狼がいる間は、1票ではメンタル崩壊しない（最多得票のときだけ、通常の追放として死ぬ）。
   * ただし麻婆の人狼が昼中に先に死亡している / 同じ投票で追放される場合は、効果が消えているのでメンタル崩壊する（本家 applySpecialVoteDeaths と同じ）。
   * counts: 得票数 / eliminated: 追放が決まっている人 / gone: 昼中に先に死んだ人の Set
   */
  vote.mentalIds = function mentalIds(game, counts, eliminated, gone) {
    if (vote.mapoOn(game, new Set([...gone, ...(eliminated || [])]))) return [];
    return game.players.map((p) => p.id).filter((id) => game.currentRoles[id] === ONW.ROLE.TOFU_WOLF && (counts[id] || 0) > 0 && !gone.has(id));
  };

  /** 得票数を集計する（メイヤーの1票は、設定した票数ぶんとして数える） */
  vote.tally = function tally(game) {
    const counts = {};
    Object.entries(game.votes).forEach(([voterId, targetId]) => {
      counts[targetId] = (counts[targetId] || 0) + ONW.vote.weightOf(game, voterId);
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
    game.shockIds = game.players.map((p) => p.id).filter((id) => game.currentRoles[id] === ONW.ROLE.CHICKEN && counts[id] > 0 && !gone0.has(id));
    game.shockIds.forEach((id) => { if (!game.eliminated.includes(id)) game.eliminated.push(id); });
    ONW.vote.applyServantSubstitution(game);   // 本家の順序どおり: 豆腐の人狼のメンタル崩壊 → 従者の身代わり → 連鎖（resolveChain）
    return game.eliminated;
  };

  /**
   * 従者の身代わり（本家 applyServantSubstitution）。追放が決まった直後に1回だけ確定させる（resolveChain / strawNeed は何度も呼ばれるので、ここで決めた結果を使う）。
   * 最終盤面の従者の持ち主 S とそのご主人 M を順に見て、M が追放されていて S が追放されていなければ、M を外して S を入れる。変化がなくなるまで繰り返す。
   *   ・身代わりにならない: M の最終役職が 従者 / てるてる坊主 / 一目惚れしてるてる（本家 isServantSubstitutionBlockedRole のうちWeb版にあるぶん）
   *   ・S がすでに昼中に死亡している(game.deadIds)なら身代わりにならない（Web版の安全策。本家は見ていない）
   *   ・S 自身が恋人(重複役職)なら身代わりにならない
   *   ・S と M が同じ人（自分がご主人）なら何もしない
   *   ・豆腐の人狼のメンタル崩壊の対象だった M を守った場合は、game.mentalIds から M を外す（従者は通常の追放として死ぬ）
   * 記録: game.servantSubs = [{ servant: S, master: M }, ...]（身代わりが起きた順）
   */
  vote.applyServantSubstitution = function applyServantSubstitution(game) {
    const R = ONW.ROLE, gone = new Set(game.deadIds || []);
    const blocked = [R.SERVANT, R.TANNER, R.LOVE_TANNER];
    game.servantSubs = [];
    let changed = true;
    while (changed) {
      changed = false;
      ONW.servantPairs(game).forEach(([s, m]) => {
        if (s === m) return;                                        // 自分がご主人: 何も起きない
        if (!game.eliminated.includes(m) || game.eliminated.includes(s)) return;
        if (ONW.loverMate(game, s)) return;                         // 従者自身が恋人（恋人陣営）なら身代わりにならない
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
    const done = new Set(game.eliminated), gone = new Set(game.deadIds || []);
    let queue = [...game.eliminated];
    game.chainIds = []; game.chainBy = {}; game.chainKind = {}; game.chainSub = {}; game.strawPending = null; game.toughBlocks = [];
    game.kingGuards = (game.kingGuards || []).filter((b) => b.kind !== "tomo");   // 道連れのガードは、連鎖を解くたびに作り直す（追放のガードは resolveElimination で決まったまま）   // game.chainSub[身代わりになった従者] = 守られたご主人（道連れの身代わり）
    game.kingdomIds = []; game.queenFallen = [];   // 王国滅亡: 巻き込まれた村人陣営 / 倒れた女王
    game.catPicks = game.catPicks || {}; game.strawTargets = game.strawTargets || {};
    game.assassinTargets = game.assassinTargets || {}; game.assassinList = [];   // アサシン: めくれた順に { id, target }（選んだ相手）
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
    const immune = (t) => { const d = ONW.roleDef(game.currentRoles[t]); return !!(d && d.chainImmune) && !ONW.hiddenDrunk(game, t); };
    let tomoBuf = [], tomoSimul = new Set();   // 同じ時点でめくれた人たちの道連れは、まとめて決める（flushTomo）。tomoSimul: 同時に道連れにされる人
    const kill = (t, by, kind, chain = true) => {
      if (done.has(t) || gone.has(t) || !game.players.some((p) => p.id === t)) return false;
      if (kind === "tomo" && immune(t)) { if (!game.toughBlocks.some((b) => b.id === t && b.by === by)) game.toughBlocks.push({ id: t, by, kind }); return false; }   // 空振り
      // 従者の身代わり（道連れ）: ご主人が道連れ(tomo)で死ぬときは、従者が身代わりになる（ご主人は生き残る）。追放の身代わり(applyServantSubstitution)と同じ条件:
      //   従者がまだ死んでいない / 従者が恋人でない / ご主人の最終役職が 従者・てるてる坊主・一目惚れしてるてる でない。従者が複数いれば先に見つかった1人
      if (kind === "tomo") {
        const blocked = [R.SERVANT, R.TANNER, R.LOVE_TANNER];
        const sub = blocked.includes(game.currentRoles[t]) ? null : ONW.servantPairs(game).find(([s, m]) => m === t && s !== t && !done.has(s) && !gone.has(s) && !tomoSimul.has(s) && !ONW.loverMate(game, s));   // 従者が同時に（同じ波で）道連れにされるときも、先に死んでいるときも、身代わりにならない
        if (sub) { game.chainSub[sub[0]] = t; return kill(sub[0], by, "tomo", chain); }
      }
      done.add(t); if (chain) queue.push(t); game.chainIds.push(t); game.chainBy[t] = by; game.chainKind[t] = kind; if (late) game.chainLate[t] = true;
      const mate = (game.loverOf || {})[t];   // 恋人: 相方も同時に心中（相方の死でさらに相方の相方…と続くことはない。組は2人だけ）
      if (mate && mate !== t) kill(mate, t, "lovers", chain);
      // 従者の後追い: ご主人が 王国滅亡(queen) / 心中(lovers) / 無理心中(love) で死んだら、身代わりはできないので、従者も同時に「後追い」で死ぬ（kind: "follow"）。
      //   ご主人が従者の従者…と続く場合も後追いが連鎖する（follow も対象）。後追いで死んだ人は、ほかの人を巻き込まない（chain=false）
      if (["queen", "lovers", "love", "follow"].includes(kind)) {
        ONW.servantPairs(game).filter(([s, m]) => m === t && s !== t).forEach(([s]) => kill(s, t, "follow", false));
      }
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
    const loveDead = (id, role) => (game.chainKind[id] === "love" && (ONW.TOMO_ROLES.includes(role) || role === R.ASSASSIN)) || (game.chainKind[id] === "lovers" && (ONW.TOMO_ROLES.includes(role) || role === R.ASSASSIN || role === R.LOVE_TANNER));   // 無理心中で死んだ人は道連れ能力（わら人形・猫又・黒猫）・アサシンの暗殺が発動しない / 心中で死んだ人は、さらに一目惚れの連鎖も発動しない
    // 始めの心中: 追放・メンタル崩壊・ショック死・昼中の死亡など、resolveChain の前にすでに死んでいる人の相方も、ここで一緒に死ぬ
    [...game.eliminated, ...gone].forEach((id) => {
      const mate = (game.loverOf || {})[id];
      if (mate) kill(mate, id, "lovers");
    });
    // 「めくれた順」の波で処理する。同じ波（同時にめくれた人たち）のわら人形・アサシンは、同じ時点の候補から同時に選ぶ
    while (queue.length) {
      const wave = queue; queue = [];
      const snap = allIds.filter((id) => !done.has(id) && !gone.has(id));   // この波が始まった時点で、まだめくれていない人（わら人形の候補）
      // 1) 選ばなくていい連鎖（一目惚れ・猫又・黒猫）を先に確定させる。アサシンの画面に「？」で出す人に、同じ波のこの連鎖ぶんも含めるため
      wave.forEach((id) => {
        const role = game.currentRoles[id];
        if (loveDead(id, role)) return;
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
        const role = game.currentRoles[id];
        if (loveDead(id, role)) return;
        if (role === R.STRAW_DOLL) {
          const c = snap.filter((x) => x !== id);
          if (!c.length || c.every(immune)) return;                       // 道連れにできる人がいない（残りが全員タフガイなど）: 選ばずに終わり
          const t = game.strawTargets[id];
          if (t && c.includes(t)) return;
          delete game.strawTargets[id];
          asks.push({ id, cands: c, kind: "straw" });
        } else if (role === R.ASSASSIN) {
          // アサシン: めくれたその場で、自分を除く全プレイヤー（すでにめくれた人も含む）から1人を選ぶ。選んだ相手は死なない（マーリンかどうかだけが勝敗に関わる）
          const c = allIds.filter((x) => x !== id);
          if (!c.length) return;
          const t = game.assassinTargets[id];
          if (t && c.includes(t)) return;
          delete game.assassinTargets[id];
          asks.push({ id, cands: c, kind: "assassin" });
        }
      });
      if (asks.length) {
        if (!auto) { game.strawPending = asks; return null; }   // 選択待ち（この波の全員ぶんをまとめて返す）
        asks.forEach((a) => { const f = a.kind === "straw" && ONW.debug ? ONW.debug.randTarget(game, "straw", a.id) : null; (a.kind === "assassin" ? game.assassinTargets : game.strawTargets)[a.id] = f && a.cands.includes(f) ? f : pick(a.cands); });
      }
      // 3) 選んだ結果を反映
      wave.forEach((id) => {
        const role = game.currentRoles[id];
        if (loveDead(id, role)) return;
        if (role === R.STRAW_DOLL) {
          const t = game.strawTargets[id];
          if (t && !done.has(t) && !gone.has(t)) take(t, id, "tomo");   // 同じ波の誰かがすでに巻き込んでいたら、そのまま
        } else if (role === R.ASSASSIN) {
          const t = game.assassinTargets[id];
          if (t) game.assassinList.push({ id, target: t });
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
      const queensFell = allIds.filter((id) => game.currentRoles[id] === R.QUEEN && (done.has(id) || gone.has(id)));
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
   * 参照先は一度決めたら game.catSources[猫の持ち主ID] に覚え、勝敗判定を何度呼び直しても同じ人になる（その人がまだ投票者に入っているかぎり）。試合開始時に net.js 側で空に戻す。
   * 結果は game.catInfo[猫の持ち主ID] = { team, direct: 参照先, final: 最終的な参照先（猫をたどった先）, via: 猫を経由したか, votes: 得票数, voters: 投票した人たち } に入れる。
   * 戻り値: game.catInfo
   */
  vote.resolveCats = function resolveCats(game) {
    const R = ONW.ROLE, ids = game.players.map((p) => p.id), role = (id) => game.currentRoles[id];
    const cats = ids.filter((id) => role(id) === R.SCHRODINGER_CAT);
    game.catSources = game.catSources || {};
    Object.keys(game.catSources).forEach((k) => { if (!cats.includes(k)) delete game.catSources[k]; });   // 猫でなくなった人の記録は消す
    const votersOf = (id) => ids.filter((v) => (game.votes || {})[v] === id);
    cats.forEach((id) => {
      const vs = votersOf(id);
      if (!vs.length) { delete game.catSources[id]; return; }
      if (!vs.includes(game.catSources[id])) game.catSources[id] = ONW.utils.randomChoice(vs);   // 自分に投票した人からランダムに1人
    });
    const info = {}, done = {};
    const teamOfRole = (r) => ONW.roles.getInfo(r).team;
    const resolve = (id, trail) => {
      if (done[id]) return done[id];
      const src = game.catSources[id];
      let r;
      if (!src) r = { team: "none", direct: null, final: null, via: false };
      else if (trail.includes(id)) r = { team: "loop", direct: src, final: null, via: true };
      else if (role(src) === R.SCHRODINGER_CAT) { const nx = resolve(src, [...trail, id]); r = { team: nx.team, direct: src, final: nx.final, via: true }; }
      else r = { team: teamOfRole(role(src)), direct: src, final: src, via: false };
      return (done[id] = r);
    };
    cats.forEach((id) => {
      const r = resolve(id, []), vs = votersOf(id);
      info[id] = { ...r, team: ONW.loverMate(game, id) ? "lover" : r.team, votes: vs.length, voters: vs };
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
   *   1. 神が追放された        → 神の祝福: 神以外の全員が勝利（追放されたオポチュニストは除く）
   *   2. てるてる系が追放された → 追放されたてるてる系の勝利（一目惚れしてるてるは選んだ相手も勝利）
   *   3. 神が追放されていない   → 神降臨: 神の単独勝利
   *   4. それ以外              → 村人陣営 / 人狼陣営の基本勝敗
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

  vote.determineWinnersCore = function determineWinnersCore(game) {
    ONW.vote.updatePromotion(game);
    const R = ONW.ROLE, ids = game.players.map((p) => p.id);
    const role = (id) => game.currentRoles[id];
    const nm = (list) => list.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    const executed = ONW.vote.resolveChain(game, true);
    game.executed = executed;
    ONW.vote.resolveCats(game);   // シュレディンガーの猫: 自分に投票した人からランダムに1人選び、その人の陣営になる
    game.assassinResult = (game.assassinList || []).map((a) => ({ by: a.id, target: a.target, hit: game.currentRoles[a.target] === R.MERLIN }));   // 結果の演出用
    const dead = ONW.vote.deadSet(game);   // 死んだ人全員（死因を問わない。game.executed は上で更新済み）
    const gods = ids.filter((id) => role(id) === R.GOD);
    game.godMode = null; game.godIds = []; game.godBlown = [];   // 結果の演出用: "bless"（神の祝福）/ "descend"（神降臨）/ null
    // 無理心中で巻き込まれたてるてる系は、自分のてるてる勝利は発動しない（相手の一目惚れしてるてると「一緒に勝った」扱いになるだけ）
    const byLove = (id) => ["love", "lovers"].includes((game.chainKind || {})[id]);   // 無理心中・心中で死んだてるてる系も同じ扱い
    // 恋人(重複役職)は、恋人のてるてる系が追放されても、てるてるとしては勝利しない（恋人でないてるてる系が優先 / 恋人のてるてる系だけなら神が勝利）
    const isLover = (id) => !!ONW.loverMate(game, id);
    // タフガイのとばっちりで追放された人は、てるてる・一目惚れしてるてる・処刑人のターゲットとしての「追放」には数えない（追放されても、その勝利条件は満たさない）
    const bounced = new Set((game.toughBounces || []).flatMap((b) => b.to || []));
    const tanners = executed.filter((id) => role(id) === R.TANNER && !byLove(id) && !isLover(id) && !bounced.has(id));
    const loveTanners = executed.filter((id) => role(id) === R.LOVE_TANNER && !byLove(id) && !isLover(id) && !bounced.has(id));
    const opportunists = ids.filter((id) => role(id) === R.OPPORTUNIST && !dead.has(id));
    // 恋人: 二人とも死んでいない組が勝利（死因は問わない: dead = 追放・連鎖死(道連れ/心中等)・昼中の死亡。今後死因が増えたら、dead に足すだけでここは変わらない）。勝てなかった恋人は、元の陣営が勝っても敗北（マイクラ版の恋人陣営）
    const loverSurvive = ONW.loverPairs(game).filter(([a, b]) => !dead.has(a) && !dead.has(b));
    const loverWinSet = new Set(loverSurvive.flat());
    const lostLover = (id) => isLover(id) && !loverWinSet.has(id);
    // 勝ち組・負け組: 最終盤面でこの役職の人。恋人かどうか・神の祝福・どの陣営が勝っても、勝ち組は必ず勝ち、負け組は必ず負ける（途中で入れ替わって別の役職になっていれば、通常どおり）
    const winnerRoleIds = ids.filter((id) => role(id) === R.WINNER), loserRoleIds = ids.filter((id) => role(id) === R.LOSER);
    // 処刑人: ターゲットが「投票で追放」されたら勝利（単独勝利）。道連れ・心中・無理心中・昼中の死亡など、追放以外でターゲットが死んだら処刑人は敗北。ターゲットが生き残った場合は勝敗に関わらない
    const voted = new Set(game.eliminated || []);
    // 従者の身代わりで追放になった従者は「処刑人の手で処刑できた」ことにはならない（自ら死んだようなもの）。処刑人の勝敗の判定では、投票で追放された人から除く（追放以外で死んだ扱い）
    const subbed = new Set((game.servantSubs || []).map((x) => x.servant));
    const execAll = ONW.execPairs(game).filter(([e, tg]) => e !== tg);
    const execWinIds = execAll.filter(([e, tg]) => voted.has(tg) && !subbed.has(tg) && !bounced.has(tg) && !lostLover(e)).map(([e]) => e);
    const execLoseIds = execAll.filter(([, tg]) => (!voted.has(tg) || subbed.has(tg) || bounced.has(tg)) && dead.has(tg)).map(([e]) => e);
    // 神の祝福が起きるのは、神が「追放」か「道連れ」で死んだときだけ。心中・無理心中・処刑（処刑人のターゲットとして追放）で死んだ神は、祝福なし
    const godBless = gods.filter((id) => {
      if (!executed.includes(id)) return false;
      const ck = (game.chainKind || {})[id];
      if (ck === "lovers" || ck === "love") return false;                       // 心中・無理心中
      if (voted.has(id) && execAll.some(([, tg]) => tg === id)) return false;   // 処刑（処刑人のターゲットとして追放）
      return true;                                                              // 追放 / 道連れ
    });
    const godAlive = gods.filter((id) => !executed.includes(id));
    if (!godBless.length && godAlive.length) { game.godMode = "descend"; game.godIds = godAlive.slice(); }   // 生存している神は、結果発表でめくれるときに降臨の演出（どの勝敗でも）

    const set = (title, teams, winners, detail, winnerTeams) => {
      game.winTitle = title; game.winTeams = teams; game.winDetail = detail; game.winners = winnerTeams;
      const w = new Set(winners);
      [...(game.kingdomIds || []), ...(game.queenFallen || [])].forEach((id) => w.delete(id));   // 王国滅亡: 倒れた女王と、巻き込まれた村人陣営は勝利できない
      ids.forEach((id) => { if (lostLover(id) && role(id) !== R.WINNER) w.delete(id); });     // 勝てなかった恋人は、元の陣営が勝っても敗北（ただし勝ち組は恋人でも勝つ）
      winnerRoleIds.forEach((id) => w.add(id));                                                // 勝ち組: 追加勝利
      if (winnerRoleIds.length && !teams.includes("勝ち組")) teams.push("勝ち組");
      loserRoleIds.forEach((id) => w.delete(id));                                              // 負け組: 敗北（ご主人・就職先が負け組なら、従者・フリーターも勝てない）
      execLoseIds.forEach((id) => w.delete(id));                                               // 処刑人: ターゲットが追放以外で死んだら敗北
      opportunists.forEach((id) => { if (!lostLover(id)) w.add(id); });   // オポチュニスト: 追放されていなければ追加勝利
      if (opportunists.length && !teams.includes("オポチュニスト")) teams.push("オポチュニスト");
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
      if (freeters.length || servants.length || gremlins.length || cats.length) {
        let changed = true, added = false, addedServant = false, addedGremlin = false, addedCat = false;
        while (changed) {
          changed = false;
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
      }
      loserRoleIds.forEach((id) => w.delete(id));
      execLoseIds.forEach((id) => w.delete(id));
      // 勝者なし（王国滅亡で村人陣営・人狼陣営とも勝てない）でも、追加勝利者（勝ち組・オポチュニスト・天邪鬼・フリーター・従者など）が勝っているときは、「勝者なし」ではなく追加勝利者の勝利として扱う
      if (title === "勝者なし" && w.size) {
        const extra = teams.filter((t) => t !== "処刑人" || w.size);
        game.winTitle = `${extra.length ? extra.join("＆") : "追加勝利"}勝利`;
        game.winDetail = `${String(detail).replace("ため勝者なしです。", "ため、村人陣営にも人狼陣営にも勝者はいません。")} 追加勝利: ${[...w].map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、")}`;
      }
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
    // 1.5 恋人勝利: 二人とも死ななかった恋人の組が勝利（恋人以外は敗北）。てるてる系・神降臨・村人/人狼陣営の勝敗より優先（マイクラ版どおり）
    if (!game.chickenForce && loverSurvive.length) {
      return set("恋人陣営勝利", ["恋人陣営"], loverSurvive.flat(),
        `恋人 ${loverSurvive.map(([a, b]) => `${nm([a])} ❤ ${nm([b])}`).join("、")} が二人とも死亡しませんでした。恋人以外は敗北です。`, [ONW.TEAM.THIRD]);
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
    // 3. 神降臨（神が追放されなかった）
    if (!game.chickenForce && godAlive.length) {
      game.godMode = "descend"; game.godIds = godAlive.slice();
      return set("神降臨", ["神"], godAlive, "神が追放されませんでした。", [ONW.TEAM.THIRD]);
    }
    // 3.5 処刑人の単独勝利（ターゲットが追放された。神降臨より後。村人陣営・人狼陣営は勝てない）
    if (!game.chickenForce && execWinIds.length) {
      return set("処刑人勝利", ["処刑人"], execWinIds, `処刑人 ${nm(execWinIds)} のターゲット ${nm(execAll.filter(([e]) => execWinIds.includes(e)).map(([, tg]) => tg))} が追放されました。`, [ONW.TEAM.THIRD]);
    }
    // 3.8 王国滅亡（本家 buildQueenOverrideResult）: 女王が追放・道連れ（または昼中に死亡）したとき。神の祝福・恋人勝利・てるてる系・神降臨・処刑人より後ろ、基本勝敗より前
    //   ・女王と人狼判定の者が一緒に倒れた → 勝者なし / 人狼判定の者が倒れていない → 人狼陣営の勝利 / 人狼陣営がいない → 勝者なし
    //   ・生存したチキンがいれば、determineWinners が村人陣営の逆転勝利に作り直す（このときは chickenForce で、ここは通らない）
    const fallenQueens = ids.filter((id) => role(id) === R.QUEEN && dead.has(id));
    if (!game.chickenForce && fallenQueens.length) {
      const wq = ONW.vote.wolfJudgeIds(game), wqDead = wq.filter((id) => dead.has(id));
      if (wqDead.length) return set("勝者なし", [], [], `女王 ${nm(fallenQueens)} と人狼判定の者 ${nm(wqDead)} が同時に倒れました。村人陣営は勝利条件を失い、人狼陣営も勝てないため勝者なしです。`, []);
      const wolfTeam = ids.filter((id) => ONW.roles.getInfo(role(id)).team === ONW.TEAM.WOLF);
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
    const win = ids.filter((id) => ONW.roles.getInfo(role(id)).team === side);
    return set(side === ONW.TEAM.VILLAGE ? "村人陣営勝利" : "人狼陣営勝利", [side === ONW.TEAM.VILLAGE ? "村人陣営" : "人狼陣営"], win, detail, [side]);
  };

  /**
   * 勝敗を判定する（チキンの逆転つき）。
   * まず通常どおり判定し、村人陣営が勝っていない（他陣営・第三陣営・恋人・神などが勝った）のに、
   * 最終盤面でチキンが生存（追放・道連れ・昼中の死亡をしていない / 恋人でない / 酔っていない）していれば、
   * 村人陣営の逆転勝利に作り直す。逆転前の結果は game.chickenReverse に残して、結果発表の演出で先に見せる。
   */
  vote.determineWinners = function determineWinners(game) {
    game.chickenForce = false; game.chickenReverse = null;
    ONW.vote.determineWinnersCore(game);
    if ((game.winTeams || []).includes("村人陣営")) return game.winners;
    const dead = ONW.vote.deadSet(game);   // 死亡判定は deadSet に一本化（チキンも、どの死因で死んでも生存扱いにならない）
    const chickens = game.players.map((p) => p.id).filter((id) =>
      game.currentRoles[id] === ONW.ROLE.CHICKEN && !dead.has(id) && !ONW.loverMate(game, id) && !ONW.hiddenDrunk(game, id));
    if (!chickens.length) return game.winners;
    const from = { title: game.winTitle, teams: [...(game.winTeams || [])] };
    game.chickenForce = true;
    ONW.vote.determineWinnersCore(game);
    game.chickenForce = false;
    game.godMode = null; game.godIds = []; game.godBlown = [];   // 逆転後は神の演出は出さない
    const nm = (list) => list.map((id) => (ONW.utils.playerById(game, id) || {}).name).join("、");
    game.chickenReverse = { fromTitle: from.title, fromTeams: from.teams, ids: chickens, names: chickens.map((id) => (ONW.utils.playerById(game, id) || {}).name) };
    game.winDetail = `生存したチキン ${nm(chickens)} が村人陣営以外の勝利を逆転させました。（逆転前: ${from.title}）`;
    return game.winners;
  };

  ONW.vote = vote;

})(window.ONW);
