/**
 * 模倣の人狼（マイクラ版 MIMIC_WOLF を参考）: 人狼陣営の「人狼系」。夜は人狼と同じく仲間の人狼が分かり、占い・人狼判定・勝利条件は人狼陣営のまま。
 * それに加えて、配役された盤面と墓地にある「初期役職」（村人陣営・人狼陣営・狂人系）の中から1つをランダムに選び、その役職の能力を模倣して使う。
 *
 * 実装は9段階（依頼文テキストは _wip/依頼文_模倣の人狼_*of9.txt）:
 *   1of9: 骨格（このファイル・index.html・ルールコード ONW47・ロビー/ガイドの並び・模倣先の保持と抽選・夜の説明）【済】
 *   2of9: カード表示（めくれる所すべてで「模倣の人狼」＋模倣先の枠）
 *   3of9: 夜の能力 / 4of9: 朝のうち・酔い覚め・夜の情報系 / 5of9: 昼能力 / 6of9: 受動効果
 *   7of9: 判定が違う役・勝利優先度・実績 / 8of9: CPU・CO・デバッグ固定・ガイド / 9of9: 端のケース・総合テスト・制限解除【全9段階 済】
 *
 * 【状態】g.mimicRole[持ち主ID] = 模倣先の役職ID（カードについて動く: state.js の ROLE_BOUND_KEYS。墓地のカードは "g:番号" がキー）。試合ごとに net.startGame が {} に戻し、配役のあとで決める。
 *   ・「模倣する」とは、その持ち主が夜・朝・昼にその役職の能力を使えること。カードの役職そのものは変わらない（currentRoles は mimic_wolf のまま）。
 *   ・墓地にある模倣の人狼のカードは配役時には決めない。引いた時点（ONW.swapGrave → ONW.mimic.drawn）で、いまの墓地と初期役職から決める（怪盗・墓荒らし・パッチは候補から外す。マイクラ版 mimicWolfSwapChainBlock）。
 *   ・模倣先 = 配役直後（初期役職）の全プレイヤーと墓地の役職から、候補を満たす1枚を等確率で選ぶ（同じ役職が複数枚あればその分だけ当たりやすい。マイクラ版 mimicWolfCandidateRoles と同じ）。
 *   ・候補: 村人陣営・人狼陣営（狂人系を含む）で、下の NON_MIMICABLE に入っていない役職。候補が無いときは村人を模倣する（マイクラ版と同じ）。
 *   ・模倣の人狼が2人以上いるとき、2人目以降は1人目と同じ模倣先になる（マイクラ版 existingMimicWolfChoiceExcept）。
 *
 * 【段階的に有効化する仕組み】ONW.mimic.SUPPORTED に入っている役職だけが模倣先の候補になる。
 *   各段階で、能力の模倣がつながった役職をここに足していった。9of9 で全部の役職がつながったので制限は外してある（state.all = true が既定。disableAll() で SUPPORTED だけに戻せる＝テスト用）。
 *
 * 勝敗の優先度: 人狼系の基本勝敗のまま（docs/victory-priority.md に「模倣チキン」の行は 7of9 で扱う）。占われたときは「模倣の人狼」と出る（seerSees の既定）。
 */
(function (ONW) {
  const K = ONW.wolfKit;
  const R_ = () => ONW.ROLE;

  /** マイクラ版 NON_MIMICABLE_ROLES: 模倣の人狼が模倣できない役職（陣営が村人・人狼でも除外する） */
  const NON_MIMICABLE = new Set([
    "mimic_wolf", "light_apostle", "dark_avatar", "silver_shadow", "villager", "werewolf", "madman", "cultist", "jester_madman", "spy",
    "princess", "fox_marked", "black_wolf_madman", "wolf_marked", "cursed_one", "carmen", "knight", "priest", "mad_priest", "clone",
    "magician", "hayatochiri", "screw_gum",
  ]);   // 抹消の人狼は模倣できる（マイクラ版 NON_MIMICABLE_ROLES に無い。抹消の人狼 5of5 で解禁）
  /** 模倣先として有効になっている役職（段階ごとに足す。ALL=true で制限なし） */
  const SUPPORTED = new Set(["seer", "robber", "troublemaker", "mason", "merlin", "dictator", "exchanger", "mind_wolf",
    "straw_doll", "cat_sidhe", "black_cat", "cat_pumpkin", "tough_guy", "chicken", "wolf_king", "tofu_wolf", "mapo_wolf", "assassin", "baker", "star", "mayor", "queen", "visitor", "newspaper",
    "sheriff", "white_wolf", "forgetful_wolf", "wolf_dreamer",
    "big_wolf", "lone_wolf", "observer_wolf", "mad_seer", "exposed_madman", "muzzle_madman", "watchdog", "keymaster", "relic_robber", "insomniac", "eraser_wolf", "mirage_wolf", "mad_queen"]);   // 狂った女王: 模倣先に入る（模倣した人は、村人陣営には「女王」・人狼陣営には「狂った女王」として通知される。王国滅亡は起きない。mad_queen.js） / 蜃気狼: 模倣先に入る（占われると蜃気狼と同じランダムな役職に見える。mirage_wolf.js） / 9of9: 残りの10役職 / 抹消の人狼 5of5: 抹消の人狼（模倣の人狼が夜に選んだ相手の役職を、昼になる前に抹消する）   // 7of9: 保安官（模倣保安官は村人陣営を執行）/ 判定が違う役（白狼・忘却の人狼・狼夢人）   // 3of9: 夜にカードを選ぶ能力（占い師・怪盗・いたずらっ子）/ 4of9: 夜の情報（共有者・マーリン）/ 5of9: 昼能力（独裁者・交換者・心眼の人狼。保安官は判定が違うので 7of9）/ 6of9: 受動効果（わら人形・猫又・黒猫・ネコカボチャ・タフガイ・チキン・人狼王・豆腐/麻婆・アサシン・パン屋・スター・メイヤー・女王・訪問者・新聞配達員）。段階ごとに足す
  const state = { all: true };   // 9of9: 全部の役職がつながったので、模倣先の制限（SUPPORTED）は外した。disableAll() で段階的な制限に戻せる（テスト用）

  const isSupported = (role) => state.all || SUPPORTED.has(role);
  const teamOk = (role) => { const i = ONW.ROLE_INFO[role]; return !!i && (i.team === ONW.TEAM.VILLAGE || i.team === ONW.TEAM.WOLF); };

  /** 墓地から引いた模倣の人狼が模倣できない役職（マイクラ版 mimicWolfSwapChainBlock: 怪盗・墓荒らし・パッチ。墓地を引く連鎖が続かないようにする） */
  const CHAIN_BLOCK = new Set(["robber", "relic_robber", "patch"]);
  /** 模倣先の候補（重複あり。配役直後の全プレイヤーと墓地の役職から）。opts.draw: 墓地から引いた時点の決定（墓地は「いま」の墓地、怪盗・墓荒らし・パッチは候補から外す。マイクラ版 mimicWolfCandidateRoles） */
  function candidates(g, opts) {
    const draw = !!(opts && opts.draw);
    const pool = [...Object.values(g.initialRoles || {}), ...(draw ? (g.center || []) : ((g.center0 || g.center) || []))];
    return pool.filter((r) => r && !NON_MIMICABLE.has(r) && teamOk(r) && isSupported(r) && !(draw && CHAIN_BLOCK.has(r)));
  }
  /** 持ち主が模倣している役職（なければ null） */
  const roleOf = (g, id) => (g && g.mimicRole && g.mimicRole[id]) || null;
  /** 「そのカードを持つ人が能力として使う役職」: 模倣の人狼なら模倣先、それ以外はカードの役職そのまま */
  const actRole = (g, id, role) => (role === R_().MIMIC_WOLF && roleOf(g, id) ? roleOf(g, id) : role);
  /** 受動効果（追放・道連れ・投票数・王国滅亡・公開・パンなど）で見る役職 = 最終盤面で id が持つカードを、模倣先に読み替えた役職（マイクラ版 roleForMimicEffect と同じ）。
   *  模倣の人狼でなければカードの役職そのまま。判定が「人狼陣営か」「村人陣営か」などカードそのものを見る所は、これを使わず g.currentRoles のまま */
  const eff = (g, id) => actRole(g, id, g && g.currentRoles ? g.currentRoles[id] : undefined);
  /** 最終盤面で id が role の受動効果を持っているか（模倣の人狼が role を模倣していてもよい） */
  const isAs = (g, id, role) => eff(g, id) === role;
  /** 昼のうちに役職が動く前の盤面の控え。g.currentRoles と同じ形で、さらに「模倣先に読み替えた役職」を非列挙の eff に持つ（beforeEff で読む）。
   *  mimicRole はカードについて動くので、動く前の時点で控えておかないと、動いたあとでは前の持ち主の模倣先が分からなくなる */
  function snap(g) {
    const b = { ...g.currentRoles }, e = {};
    Object.keys(b).forEach((id) => { e[id] = actRole(g, id, b[id]); });
    Object.defineProperty(b, "eff", { value: e, enumerable: false });
    return b;
  }
  /** snap で控えた before から、動く前の id の「受動効果の役職」を読む（snap でない普通の控えならカードの役職そのまま） */
  const beforeEff = (before, id) => (before && before.eff ? before.eff[id] : before ? before[id] : undefined);
  // ======================================================================
  // 【7of9】判定が違う役（マイクラ版）。カードの陣営は人狼陣営のまま、模倣先によって「人狼判定」「占いの見え方」が変わる。
  //   ・白狼・忘却の人狼を模倣 → 人狼判定に数えない（vote.wolfJudgeIds / updatePromotion が見る）。占いは模倣先の見え方（白狼=村人 / 忘却の人狼=忘却の人狼）。
  //   ・狼夢人を模倣 → 占いは「人狼」。（人狼判定には、模倣の人狼自身が人狼系なので今までどおり数える）
  //   ・狐憑き・呪われし者・お姫様・狼憑きを模倣 → 本家では判定が違うが、NON_MIMICABLE なので模倣先にならない（何もしない）。騎士・ネクロマンサーはWeb版に無い。
  //   ・保安官を模倣 → 模倣保安官は「人狼陣営でない人」を執行し、人狼陣営（白狼・模倣の人狼・狼憑き・狂人系）を撃つと誤爆する（sheriff.js judge の rev / isHitMimic。マイクラ版 main.js で確認済み）。
  // ======================================================================
  const NOT_WOLF_JUDGE = new Set(["white_wolf", "forgetful_wolf"]);
  /** 模倣の人狼で、模倣先のせいで人狼判定に数えないか（最終盤面） */
  const notWolfJudge = (g, id) => !!(g && g.currentRoles && g.currentRoles[id] === R_().MIMIC_WOLF && NOT_WOLF_JUDGE.has(roleOf(g, id)));
  /** 占い師に占われたとき、カード role（席キー key = p の持ち主ID / "g:墓地番号"）が見える役職。模倣の人狼でなければ ONW.seerSees(role) と同じ */
  function seerSeen(g, role, key) {
    if (ONW.mirage && ONW.mirage.isMirageCard(g, role, key)) { ONW.mirage.noteInspect(g, key, "seer"); return ONW.mirage.seerRole(g); }   // 蜃気狼（模倣先が蜃気狼の模倣の人狼も）: 盤面にあり得るランダムな役職（1回の占いで1回だけ呼ぶこと）
    if (role !== R_().MIMIC_WOLF) return ONW.seerSees(role);
    const mr = roleOf(g, key);
    if (mr === "wolf_dreamer") return "werewolf";                          // 狼夢人を模倣 → 占いは人狼
    if (mr && NOT_WOLF_JUDGE.has(mr)) return ONW.seerSees(mr);             // 白狼・忘却の人狼を模倣 → 模倣先の見え方
    return ONW.seerSees(role);                                             // 占われたら「模倣の人狼」（模倣先は見えない）
  }
  /** 模倣保安官か（カードは模倣の人狼で、模倣先が保安官）。人狼陣営でない人を執行する */
  const isMimicSheriff = (g, id) => !!(g && g.currentRoles && g.currentRoles[id] === R_().MIMIC_WOLF && roleOf(g, id) === "sheriff");
  /** 判定の切り替え（マイクラ版との差が出そうな所を1か所にまとめた）。
   *  mimicChickenReversesWolfLoss: Web版独自。模倣チキン（生存）は「人狼陣営が負ける結果」を人狼陣営の勝ちに逆転する（vote.determineWinners が見る）。
   *  本物のチキンが逆転できるときは本物が優先。マイクラ版の模倣チキンは「人狼陣営以外の勝ちを村人陣営に逆転」だが、Web版は指示で上の動きに変えた */
  const flags = { mimicChickenReversesWolfLoss: true };
  /** 実績（wiki の「模倣の人狼」に定義済みの7種）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ）。
   *  won: その人が勝ったか / res: 省略可 */
  function achievements(g, id, won) {
    const out = [], M = R_().MIMIC_WOLF, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === M) {
      out.push("first_mimic_wolf");                                          // 初めて模倣の人狼になる（初回かどうかは保存側が数える）
      const mr = roleOf(g, id), tm = mr && ONW.ROLE_INFO[mr] && ONW.ROLE_INFO[mr].team;
      if (tm === ONW.TEAM.VILLAGE) out.push("mimic_copy_village");
      if (tm === ONW.TEAM.WOLF) out.push("mimic_copy_wolf");
    }
    if (cur === M && won) out.push("win_mimic_wolf");
    (g.sheriffShots || []).filter((e) => e.by === id && e.rev && e.mode === "execute").forEach((e) => {
      const t = ONW.ROLE_INFO[g.currentRoles[e.target]];
      if (t && t.team === ONW.TEAM.VILLAGE) out.push("mimic_sheriff_execute_village");
      if (eff(g, e.target) === R_().QUEEN) out.push("mimic_sheriff_execute_queen");
    });
    if (cur === M && g.chickenReverse && g.chickenReverse.toWolf && (g.chickenReverse.ids || []).includes(id) && eff(g, id) === R_().CHICKEN)   // 模倣チキンが人狼陣営の敗北を逆転した
    out.push("mimic_chicken_reverse");
    return out.filter((x, i) => out.indexOf(x) === i);
  }
  /** 模倣の人狼のカードを持っていて、模倣先が決まっているか */
  const isMimic = (g, id, role) => role === R_().MIMIC_WOLF && !!roleOf(g, id);

  /** 持ち主 holder の模倣先を決める（すでに決まっていればそのまま）。別の模倣の人狼が先に決めていれば同じ役職（マイクラ版と同じ）。デバッグの指定があればそれ（8of9）。戻り値: 模倣先 */
  function choose(g, holder, opts) {
    g.mimicRole = g.mimicRole || {};
    if (g.mimicRole[holder]) return g.mimicRole[holder];
    // 同じ試合に別の模倣の人狼（いま模倣の人狼のカードを持つ人）が模倣先を決めていれば同じ役職（マイクラ版 existingMimicWolfChoiceExcept。墓地のカードに残った古い記録は見ない）
    const other = Object.keys(g.mimicRole).find((k) => k !== holder && g.mimicRole[k] && !String(k).startsWith("g:") && (g.currentRoles || g.initialRoles || {})[k] === R_().MIMIC_WOLF);
    let forced = ONW.debug && ONW.debug.mimicRole ? ONW.debug.mimicRole(g, holder) : null;
    if (forced && !(ONW.ROLE_INFO[forced] && !NON_MIMICABLE.has(forced) && teamOk(forced))) forced = null;   // 8of9: デバッグの固定は絶対（盤面・墓地に無い役職でも、模倣できる役職ならそれにする）
    const cand = candidates(g, opts);
    let pick = forced ? forced : other ? g.mimicRole[other] : cand.length ? cand[Math.floor(Math.random() * cand.length)] : R_().VILLAGER;
    g.mimicRole[holder] = pick;
    return pick;
  }
  /** 配役のあと(net.startGame)に、配られた模倣の人狼すべての模倣先を決める。g.mimicInfo（結果発表の「役職情報」）に「模倣情報」を積む */
  function assignAll(g) {
    g.mimicRole = {}; g.mimicInfo = [];
    (g.players || []).forEach((p) => {
      if (g.initialRoles[p.id] !== R_().MIMIC_WOLF) return;
      const r = choose(g, p.id);
      g.mimicInfo.push({ by: p.name, role: r });   // 何を模倣したかは夜行動結果ではなく「役職情報」に出す（結果発表・PNG）
    });
    // 墓地にある模倣の人狼のカードは、ここでは決めない。マイクラ版は引いた時点（墓荒らしなどで手にしたとき）に決めるので、ONW.swapGrave が ONW.mimic.drawn を呼ぶ（引かれなかった墓地のカードには模倣先がない）
  }
  /** 9of9: いま模倣の人狼のカードを持っているのに模倣先が決まっていない人（シャッフラー・グレムリン・ドッペルなど、カードが動かずに役職だけ書き換わる経路で手にした／想定外の経路）に、模倣先を決める。決めた [{ id, role }] を返す。決まっていれば何もしない（安全網。夜から昼への切り替わりで呼ぶ） */
  function ensureAll(g) {
    const out = [];
    (g.players || []).forEach((p) => {
      if (!g.currentRoles || g.currentRoles[p.id] !== R_().MIMIC_WOLF || roleOf(g, p.id)) return;
      out.push({ id: p.id, role: choose(g, p.id) });
    });
    return out;
  }
  /** 墓地から模倣の人狼のカードを引いた人 holder の模倣先を、引いた時点で決める（マイクラ版: 夜の能力として模倣先を選ぶのは引いたとき。墓地のカードの古い模倣先は引き継がない）。g.mimicInfo（役職情報）に「模倣情報」を積む。戻り値: 模倣先 */
  function drawn(g, holder) {
    if (g.mimicRole) delete g.mimicRole[holder];
    const r = choose(g, holder, { draw: true });
    const pl = (g.players || []).find((p) => p.id === holder);
    (g.mimicInfo = g.mimicInfo || []).push({ by: pl ? pl.name : holder, role: r, grave: true });   // 役職情報に出す（夜行動結果には積まない）
    return r;
  }
  /** 模倣先が決まっていないカード（墓荒らし・シャッフラーなどで手にした）に、いま決める。決まっていれば何もしない。戻り値: 模倣先 / 持ち主が模倣の人狼でなければ null */
  function ensure(g, holder, role) {
    if (role !== R_().MIMIC_WOLF) return null;
    return choose(g, holder);
  }

  /** カードの席キー(p:持ち主ID / g:墓地番号)→模倣先。表示用（2of9）。final=true: 現在のカード（結果発表） / false: 配役直後のカード（観戦者の配役表示）
   *  模倣の人狼のカードで、模倣先が決まっているものだけ入る */
  function pubMap(g, final) {
    const out = {}, M = R_().MIMIC_WOLF, mr = (g && g.mimicRole) || {};
    const cur = final ? g.currentRoles : g.initialRoles;
    (g.players || []).forEach((p) => { if (cur && cur[p.id] === M && mr[p.id]) out[`p:${p.id}`] = mr[p.id]; });
    const cen = final ? g.center : (g.center0 || g.center);
    (cen || []).forEach((r, i) => { if (r === M && mr[`g:${i}`]) out[`g:${i}`] = mr[`g:${i}`]; });
    return out;
  }
  /** 模倣した能力の夜ログ（夜行動結果）の名乗りを、模倣先の役職名ではなく「模倣の人狼」にする。nl 以降に増えた行だけ。
   *  何を模倣したかは役職情報(g.mimicInfo)に出るので、夜行動結果には「模倣の人狼 A は B を占い、…」の形で残す */
  function relabel(g, nl, who) {
    const logs = g.nightLogsAll; if (!logs || !who) return;
    const pl = (g.players || []).find((p) => p.id === who); if (!pl) return;
    const mine = ONW.ROLE_INFO.mimic_wolf.name, names = new Set(Object.values(ONW.ROLE_INFO).map((i) => i.name));
    for (let k = nl; k < logs.length; k++) {
      const t = logs[k], at = t.indexOf(` ${pl.name} `);
      if (at > 0 && !t.slice(0, at).includes(" ") && names.has(t.slice(0, at)) && t.slice(0, at) !== mine) logs[k] = mine + t.slice(at);
    }
  }
  /** 模倣した能力を使う間（夜・朝・酔い覚め）に呼ぶ。模倣した能力の夜ログは「夜行動結果」に残す（名乗りは模倣の人狼。who=持ち主のID）。新聞には「模倣の人狼」が載る。
   *  fn の間に増えた新聞(g.newsRoles)は元に戻し、新聞には模倣の人狼を記録する */
  function quiet(g, fn, who) {
    const nl = (g.nightLogsAll || []).length, nr = (g.newsRoles || []).slice();
    try { return fn(); } finally {
      relabel(g, nl, who);
      g.newsRoles = nr; ONW.newsNote(g, R_().MIMIC_WOLF);
    }
  }
  // ======================================================================
  // 【手にしたとき】怪盗・墓荒らし・ドッペルゲンガー（など）で、あとから模倣の人狼のカードを手にしたとき。
  //   ・本人に模倣先を届ける（演出データ rev.mimic。クライアントが g.mimicView の自分の席に入れて、カードに「模倣の人狼 ／ 模倣先」の枠が付く）
  //   ・本人に「あなたは〇〇の能力を模倣しました。」の文を出す
  //   ・墓荒らし・ドッペルで手にしたときは、模倣先の夜の能力を朝のうちに使える（actRole を朝の連鎖の役職にする）
  // ======================================================================
  /** role のカードを id が手にしたときの模倣先（模倣の人狼でなければ null）。決まっていなければここで決める */
  const takenMimic = (g, id, role) => (role === R_().MIMIC_WOLF ? (roleOf(g, id) || choose(g, id)) : null);
  /** 手にした role のカードで id が使う能力の役職（模倣の人狼なら模倣先、それ以外は role そのまま） */
  const gotAct = (g, id, role) => { takenMimic(g, id, role); return actRole(g, id, role); };
  /** 手にした演出データ rv に模倣先を足す（模倣の人狼でなければ何もしない）。rv を返す */
  function tag(g, id, role, rv) { const mr = takenMimic(g, id, role); if (mr && rv) rv.mimic = mr; return rv; }
  /** 手にした役職の下に出す文（模倣の人狼でなければ null） */
  const takenLine = (g, id, role, rn) => { const mr = takenMimic(g, id, role); return mr ? ONW.mimic.text(rn, mr) : null; };
  /** 模倣した能力を使う前後の道具（新聞の記録は呼び出し側で「模倣の人狼」にする）。夜ログは夜行動結果に残し、名乗りだけ「模倣の人狼」にする（who=持ち主のID）。fn() の戻り値を返す */
  function quietLogs(g, fn, who) { const nl = (g.nightLogsAll || []).length; try { return fn(); } finally { relabel(g, nl, who); } }

  ONW.mimic = {
    takenMimic, gotAct, tag, takenLine, quietLogs,
    quiet, ensureAll, drawn, pubMap, NON_MIMICABLE, SUPPORTED, candidates, roleOf, actRole, eff, isAs, snap, beforeEff, isMimic, choose, assignAll, ensure, isSupported,
    notWolfJudge, seerSeen, isMimicSheriff, flags, achievements, NOT_WOLF_JUDGE,
    /** 段階の最後に「全部つながった」として制限を外す（9of9） */
    enableAll() { state.all = true; },
    /** テスト・デバッグ用: SUPPORTED の役職だけを候補にする古い挙動に戻す */
    disableAll() { state.all = false; },
    isAllEnabled: () => state.all,
    /** 模倣先の役職名（本人への文・結果用） */
    nameOf: (g, id) => { const r = roleOf(g, id); return r && ONW.ROLE_INFO[r] ? ONW.ROLE_INFO[r].name : null; },
    /** 本人に出す文（夜の始まり・酔い覚め・情報確認で完全に一致させる） */
    text: (rn, role) => `あなたは ${rn(role)} の能力を模倣しました。`,
    textNow: (rn, role) => `あなたは ${rn(role)} の能力を模倣しています。`,
  };

  /** 模倣先の夜・酔い覚めの文を合流させない役職: 人狼系共通の文（模倣の人狼自身が出すので二重になる）・「村人だと思い込む／人狼だと思い込む」系（模倣の人狼は自分の正体を知っている） */
  /** 人狼系共通の夜の文(K.nightMsg)を使うが、その中に模倣しても意味のある情報（大狼の墓地・観測の人狼の説明）がある役職 */
  const WOLFKIT_EXTRA = new Set(["big_wolf", "observer_wolf"]);
  /** 酔い覚めの文を合流させない役職（人狼系共通の文・思い込み系。一匹狼の「誰も見えず」の文はマイクラ版どおり合流させる）。観測の人狼は夜の文は共通だが、酔い覚めには観測通知があるので合流させる（9of9） */
  const skipSober = (td, mr) => td.soberLines === K.soberLines || (ONW.SELF_AS_WOLF || []).includes(mr) || (ONW.SELF_AS_VILLAGER || []).includes(mr);
  const skipMerge = (td, mr) => td.nightMsg === K.nightMsg || td.soberLines === K.soberLines || (ONW.SELF_AS_WOLF || []).includes(mr) || (ONW.SELF_AS_VILLAGER || []).includes(mr);

  ONW.defineRole("mimic_wolf", {
    info: { deck: 69, name: "模倣の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.57,
      desc: "人狼陣営。他の人狼を確認できます。試合の開始時に（墓地から引いたときは引いた時点で）、配役された盤面と墓地にある村人陣営・人狼陣営・狂人系の役職から1つをランダムに選び、その役職の能力を模倣して使えます（模倣先はカードの下に出ます）。占い・判定・勝利条件は常に人狼として扱われます（占われると「模倣の人狼」と出ます）。人狼・村人・狂人など一部の役職は模倣できません。例外: 白狼・忘却の人狼を模倣すると人狼判定に数えられず、狼夢人を模倣すると占い結果が人狼になります。保安官を模倣したときは、人狼陣営でない人を撃つと執行され、人狼陣営（白狼・模倣の人狼を含む）を撃つと誤爆して自分が死にます。チキンを模倣して最後まで生き残ると、人狼陣営が負けるはずの結果（村人陣営などの勝ち）を人狼陣営の逆転勝利に変えます（本物のチキンも逆転できるときは本物が優先。恋人になっていると逆転できません）。" },
    groups: { wolf: 8.8, "transform:dark_avatar": 9.3 },
    // 夜の始まり: 仲間の人狼（人狼系共通）＋ 模倣した役職（3of9 以降、模倣先の夜の画面・情報がここに合流する）
    nightMsg(c, p, r) {
      const m = K.nightMsg(c, p, r), mr = roleOf(c.g, p.id);
      if (!mr) return m;
      m.text2 = ONW.mimic.text(c.rn, mr);
      // 4of9: 模倣先の夜の情報（共有者の相方・マーリンの人狼など）を、模倣の人狼の夜の画面に合流させる。文は「模倣した」の文のあとに並べる
      const td = ONW.roleDef(mr);
      let tm = td && td.nightMsg && !skipMerge(td, mr) ? td.nightMsg(c, p, mr) || {} : {};   // 7of9: 人狼系共通の文（仲間の人狼）・思い込み系（狼夢人の「仲間はいません」）は合流させない
      if (WOLFKIT_EXTRA.has(mr)) { const kt = K.nightMsg(c, p, mr); tm = { text2: kt.text2, bigGraves: kt.bigGraves }; }   // 9of9: 大狼の墓地・観測の人狼の説明だけ合流（仲間の人狼の文は二重にしない）
      const extra = [tm.text, tm.text2, ...(tm.lines || [])].filter(Boolean);
      if (extra.length) m.lines = [...(m.lines || []), ...extra];
      Object.keys(tm).forEach((k) => { if (!["t", "text", "text2", "lines", "act", "actRole"].includes(k) && tm[k] != null && m[k] == null) m[k] = tm[k]; });   // masonMates・cultWolves など、夜の始まりにカードが表になる指示
      return m;
    },
    // 墓荒らし・ドッペルで模倣の人狼を手にしたとき: 仲間の人狼（人狼系共通）＋ 模倣先の情報（共有者の相方・マーリンの人狼・口封じの対象・大狼の墓地・一匹狼の文）。
    // 模倣先が決まっていなければここで決める。演出（朝にめくれるカード・🐺など）は仲間の人狼の分と模倣先の分を合わせて出す
    got(c, p, got, rev, opts) {
      const g = c.g, rn = c.rn;
      K.got(c, p, got, rev, opts);   // 仲間の人狼（一匹狼を模倣しても仲間は見えたまま。マイクラ版と同じ）
      const mr = takenMimic(g, p.id, got); if (!mr) return;
      c.hold(p.id, ONW.mimic.text(rn, mr));
      const r = rev && rev[p.id], td = ONW.roleDef(mr);
      const merge = (before) => { if (!r || !before.length) return; const seen = new Set(), all = [...before, ...(r.peek || [])]; r.peek = all.filter((x) => (seen.has(x.k) ? false : (seen.add(x.k), true))); r.gap = r.gap || 380; };
      const before = r && r.peek ? r.peek.slice() : [], gap0 = r && r.gap;
      if (r) delete r.peek;
      if (mr === "big_wolf") {   // 大狼を模倣: 墓地がすべて見える（交換した墓地は見えない）
        const t = ONW.roleKit.gotTools(c, p, rev, opts), graves = t.seeGraves(t.i);
        c.hold(p.id, `墓地: ${graves.map(([j, cr]) => `${j + 1}枚目「${rn(cr)}」`).join(" ")}`);
        if (r) r.peek = graves.map(([j, cr]) => ({ k: `g:${j}`, role: cr }));
      } else if (mr === "lone_wolf") {   // 一匹狼を模倣: 仲間は見えたまま、文だけ出る
        c.hold(p.id, "あなたは一匹狼です。誰も見えず、誰からも見えません。");
      } else if (td && td.got && td.got !== K.got && !(ONW.SELF_AS_WOLF || []).includes(mr) && !(ONW.SELF_AS_VILLAGER || []).includes(mr)) {
        quietLogs(g, () => td.got(c, p, mr, rev, opts), p.id);   // 共有者・マーリン・口封じの狂人など（模倣した能力の夜ログは夜行動結果に残す）
      }
      merge(before);
      if (r && r.peek && r.peek.length && !r.gap) r.gap = gap0 || 380;
    },
    // 酔い覚めの演出: 仲間の人狼の🐺（大狼を模倣していれば墓地も）＋ 観測の人狼・口封じの狂人を模倣していればその演出（観測結果・口封じのミュートマーク）。9of9
    soberPeek(c, id, fin) {
      const mr = roleOf(c.g, id), pk = K.soberPeek(c, id, mr === "big_wolf" ? "big_wolf" : fin), td = mr && ONW.roleDef(mr);
      if (td && td.soberPeek && (mr === "observer_wolf" || mr === "muzzle_madman")) Object.assign(pk, td.soberPeek(c, id, mr) || {});
      return pk;
    },
    // 酔い覚め: 仲間の人狼（人狼系共通）＋ 模倣している役職
    soberLines(c, id, fin) {
      const mr = roleOf(c.g, id);
      const td = mr && ONW.roleDef(mr), tl = td && td.soberLines && !skipSober(td, mr) ? td.soberLines(c, id, mr) || [] : [];   // 模倣先の酔い覚めの情報（共有者の相方など）も
      const base = K.soberLines(c, id, mr === "big_wolf" ? "big_wolf" : fin);   // 9of9: 大狼を模倣していれば墓地も
      return [...base, ...(mr ? [ONW.mimic.textNow(c.rn, mr), ...tl] : [])].filter((x, i, a) => a.indexOf(x) === i);   // 観測の人狼の酔い覚めの文は仲間の人狼の文を含むので、重なりは1つにする
    },
  });
})(window.ONW);
