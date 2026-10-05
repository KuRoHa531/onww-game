/**
 * state.js
 * ------------------------------------------------------------
 * ゲーム全体の「状態（state）」と「役職の定義」だけを持つファイル。
 * ロジックはここには書かず、roles.js / night.js / vote.js 側に置く。
 *
 * 元ネタの Minecraft アドオン（アップロードされた scripts/state.js）には
 * 百種類以上の役職が定義されていた。まずは「箱」を組む段階として、その中の
 * 基本役職だけを、名称・陣営キー・効果説明ともに元データそのまま収録している。
 *   - 役職名: state.js の ROLE_NAME
 *   - 陣営キー: state.js の TEAM（village / wolf / third / none）
 *   - 効果説明: state.js の ROLE_DESC 相当のテキストを転記
 * 元データに存在しない役職（例: 汎用ワンナイト人狼にある「裏切り者/Minion」）は
 * 含めていない。追加役職（鈴の巫女など）は ROLE / ROLE_INFO に追記していけば
 * 拡張できるように設計してある。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  // 陣営（元データの TEAM キーに合わせる: village / wolf / third）
  ONW.TEAM = {
    VILLAGE: "village",
    WOLF: "wolf",
    THIRD: "third",
  };

  // 役職ID一覧（拡張はここに追記していく。値は元データの ROLE キーと同じ）
  ONW.ROLE = {
    WEREWOLF: "werewolf",
    VILLAGER: "villager",
    SEER: "seer",
    ROBBER: "robber",
    TROUBLEMAKER: "troublemaker",
    INSOMNIAC: "insomniac",
    TANNER: "tanner",
    MASON: "mason",
    MADMAN: "madman",
    LIGHT_APOSTLE: "light_apostle",
    DARK_AVATAR: "dark_avatar",
    SILVER_SHADOW: "silver_shadow",
    BIG_WOLF: "big_wolf",
    MAD_SEER: "mad_seer",
    CULTIST: "cultist",
    RELIC_ROBBER: "relic_robber",
    LOVE_TANNER: "love_tanner",
    GOD: "god",
    OPPORTUNIST: "opportunist",
    STRAW_DOLL: "straw_doll",
    CAT_SIDHE: "cat_sidhe",
    BLACK_CAT: "black_cat",
    AMANOJAKU: "amanojaku",
    LONE_WOLF: "lone_wolf",
    WHITE_WOLF: "white_wolf",
    TOFU_WOLF: "tofu_wolf",
    FORGETFUL_WOLF: "forgetful_wolf",
    MERLIN: "merlin",
    ASSASSIN: "assassin",
    WOLF_DREAMER: "wolf_dreamer",
    WOLF_MARKED: "wolf_marked",
    BAKER: "baker",
    STAR: "star",
    // TODO: 拡張役職をここに追加していく（例: BELL_MIKO: "bell_miko" など）
  };

  /** 人狼系（人狼判定になる役職）/ 狂人系（人狼陣営だが人狼判定ではない役職） */
  ONW.WOLF_KIND = [ONW.ROLE.WEREWOLF, ONW.ROLE.BIG_WOLF, ONW.ROLE.LONE_WOLF, ONW.ROLE.WHITE_WOLF, ONW.ROLE.TOFU_WOLF, ONW.ROLE.FORGETFUL_WOLF, ONW.ROLE.ASSASSIN];
  /** 夜に仲間から「人狼」として見える人狼系(一匹狼は誰からも見えない) */
  ONW.VISIBLE_WOLF = ONW.WOLF_KIND.filter((r) => r !== ONW.ROLE.LONE_WOLF);
  /** 占い師・狂った占い師がプレイヤーを占ったときに見える役職(白狼は村人、狼憑きは人狼と出る。それ以外は本当の役職) */
  ONW.seerSees = (role) => (role === ONW.ROLE.WHITE_WOLF ? ONW.ROLE.VILLAGER : role === ONW.ROLE.WOLF_MARKED ? ONW.ROLE.WEREWOLF : role);   // 白狼は村人・狼憑きは人狼と出る。それ以外は本当の役職
  /** 本人が見る自分の役職(忘却の人狼・狼憑きは村人、狼夢人は人狼だと思い込んでいる。怪盗・墓荒らし・後覚者で手にしたときも同じ) */
  /** 思い込み系: 本人は別の役職だと思い込んでいる役職。今後増やすときはここに足す(配布の演出で、変化前を本人の自認の陣営の変化役に見せる判定にも使われる) */
  ONW.SELF_AS_VILLAGER = [ONW.ROLE.FORGETFUL_WOLF, ONW.ROLE.WOLF_MARKED];   // 本人は村人だと思い込む
  ONW.SELF_AS_WOLF = [ONW.ROLE.WOLF_DREAMER];                                // 本人は人狼だと思い込む(相方のいない一人の人狼)
  ONW.shownRole = (role) => (ONW.SELF_AS_VILLAGER.includes(role) ? ONW.ROLE.VILLAGER : ONW.SELF_AS_WOLF.includes(role) ? ONW.ROLE.WEREWOLF : role);
  /** 占い師・狂った占い師が占える墓地の枚数（設定値と墓地の枚数の小さい方） */
  ONW.seerGraveMax = (g) => Math.max(0, Math.min(Number.isFinite(+g.seerGraveCount) ? +g.seerGraveCount : 2, g.graveCount || g.graveTotal || 0));
  /* =====================================================================================
   * 【必読・今後の役職追加で必ず守ること】役職の移動と「役職に紐づく状態」(role-bound state)
   *
   *  役職(カード)は 怪盗・いたずらっ子・墓荒らし などで人から人へ、人から墓地へ動きます。
   *  「その役職を持っている人の判定・選択」(例: 一目惚れしてるてるが選んだ相手) は、
   *  カードについていく(=役職が移動したら、移動した先の人の判定になる)のが正しい仕様です。
   *
   *  ルール
   *   1. 役職は必ず ONW.swapPlayers / ONW.swapGrave で動かす（currentRoles / center を直接書き換えない）。
   *   2. 「役職の持ち主ごと」に持たせる状態は、ゲームオブジェクトの上で { 持ち主のプレイヤーID: 値 } の形にし、
   *      そのキー名を下の ONW.ROLE_BOUND_KEYS に足す。これだけで、移動のたびに自動で値が新しい持ち主へ移る
   *      （墓地に入った役職の値は "g:墓地の番号" のキーに予約され、次にそのカードを取った人へ移る）。
   *   3. 状態を書く時は ONW.setRoleBound(g, キー名, 今の持ち主のID, 値) を使う。
   *      → 移動した「あと」で選んだ場合も、その時点の持ち主に書かれ、以降の移動にもついていく（予約される）。
   *   4. 読む時は「最終盤面の持ち主のID」で引く（例: vote.js の resolveChain / determineWinners）。
   *   5. 選ばれた「相手」(対象のプレイヤー)はプレイヤー単位のまま。対象の役職が動いても対象は変わらない。
   *   新しい役職で夜に誰かを選ぶ・何かを記録するものは、すべてこのルールで作ること。
   * ===================================================================================== */
  ONW.ROLE_BOUND_KEYS = ["loveTargets"];   // 例: 一目惚れしてるてる(loveTargets[持ち主ID] = 選んだ相手のID)。役職に紐づく状態を足すときはここへ。
  const holderKeyOfGrave = (i) => "g:" + i;
  ONW.setRoleBound = (g, key, holderId, value) => { (g[key] = g[key] || {})[holderId] = value; };
  ONW.getRoleBound = (g, key, holderId) => (g[key] || {})[holderId];
  /** 持ち主AとBの「役職に紐づく状態」を入れ替える（キーはプレイヤーID、または墓地の "g:番号"） */
  function swapBound(g, a, b) {
    ONW.ROLE_BOUND_KEYS.forEach((key) => {
      const m = (g[key] = g[key] || {}), va = m[a], vb = m[b];
      if (vb === undefined) delete m[a]; else m[a] = vb;
      if (va === undefined) delete m[b]; else m[b] = va;
    });
  }
  /** カードの個体追跡（結果画面で「昇格した狂人」の移動前側にも (+人狼) を付けるため）。最初の移動の直前に初期化する */
  function cards(g) {
    if (g.cards) return g.cards;
    const at = {}; g.players.forEach((p) => { at[p.id] = "P:" + p.id; }); (g.center || []).forEach((_, i) => { at[holderKeyOfGrave(i)] = "G:" + i; });
    return (g.cards = { at, trail: {} });   // trail[持ち主キー] = roleTrail / centerTrail と同じ並びのカードID
  }
  ONW.cardAt = (g, holderKey) => (g.cards ? g.cards.at[holderKey] : null) || (String(holderKey).startsWith("g:") ? "G:" + holderKey.slice(2) : "P:" + holderKey);
  /** 役職の入れ替え（履歴付き）。結果画面で「怪盗 → 狂った占い師 → 怪盗」のように、入れ替わるたびの役職を全部表示するため、変化のたびに記録する。
   *  役職に紐づく状態(ROLE_BOUND_KEYS)も一緒に移す。 */
  ONW.swapPlayers = (g, a, b) => {
    const cd = cards(g);
    [g.currentRoles[a], g.currentRoles[b]] = [g.currentRoles[b], g.currentRoles[a]];
    [cd.at[a], cd.at[b]] = [cd.at[b], cd.at[a]];
    swapBound(g, a, b);
    const t = (g.roleTrail = g.roleTrail || {});
    (t[a] = t[a] || []).push(g.currentRoles[a]); (t[b] = t[b] || []).push(g.currentRoles[b]);
    (cd.trail[a] = cd.trail[a] || []).push(cd.at[a]); (cd.trail[b] = cd.trail[b] || []).push(cd.at[b]);
  };
  ONW.swapGrave = (g, pid, i) => {   // プレイヤーと墓地の i 枚目の入れ替え
    const cd = cards(g), gk = holderKeyOfGrave(i);
    const mine = g.currentRoles[pid];
    g.currentRoles[pid] = g.center[i]; g.center[i] = mine;
    [cd.at[pid], cd.at[gk]] = [cd.at[gk], cd.at[pid]];
    swapBound(g, pid, gk);
    const t = (g.roleTrail = g.roleTrail || {}), c = (g.centerTrail = g.centerTrail || {});
    (t[pid] = t[pid] || []).push(g.currentRoles[pid]); (c[i] = c[i] || []).push(mine);
    (cd.trail[pid] = cd.trail[pid] || []).push(cd.at[pid]); (cd.trail[gk] = cd.trail[gk] || []).push(cd.at[gk]);
  };
  ONW.MAD_KIND = [ONW.ROLE.MADMAN, ONW.ROLE.MAD_SEER, ONW.ROLE.CULTIST, ONW.ROLE.BLACK_CAT];

  // 役職の詳細情報。夜の行動順（wakeOrder）が小さいほど先に起きる。
  // wakeOrder が null の役職は夜に何もしない。
  // name / desc は元データ（state.js の ROLE_NAME / 役職説明）からそのまま転記。
  /** 変化役 → 変化先の候補（このオンライン版で使える役職のうち、同じ陣営のもの） */
  ONW.TRANSFORM_GROUPS = {
    [ONW.ROLE.LIGHT_APOSTLE]: [ONW.ROLE.VILLAGER, ONW.ROLE.SEER, ONW.ROLE.ROBBER, ONW.ROLE.RELIC_ROBBER, ONW.ROLE.TROUBLEMAKER, ONW.ROLE.INSOMNIAC, ONW.ROLE.MASON, ONW.ROLE.STRAW_DOLL, ONW.ROLE.CAT_SIDHE, ONW.ROLE.MERLIN, ONW.ROLE.WOLF_DREAMER, ONW.ROLE.WOLF_MARKED, ONW.ROLE.BAKER, ONW.ROLE.STAR],
    [ONW.ROLE.DARK_AVATAR]: [ONW.ROLE.WEREWOLF, ONW.ROLE.BIG_WOLF, ONW.ROLE.LONE_WOLF, ONW.ROLE.WHITE_WOLF, ONW.ROLE.TOFU_WOLF, ONW.ROLE.FORGETFUL_WOLF, ONW.ROLE.ASSASSIN, ONW.ROLE.MADMAN, ONW.ROLE.MAD_SEER, ONW.ROLE.CULTIST, ONW.ROLE.BLACK_CAT],
    [ONW.ROLE.SILVER_SHADOW]: [ONW.ROLE.TANNER, ONW.ROLE.LOVE_TANNER, ONW.ROLE.GOD, ONW.ROLE.OPPORTUNIST, ONW.ROLE.AMANOJAKU],
  };

  /** 道連れ系(めくれたとき別の人を巻き込む役職)。vote.js の resolveChain が参照する */
  ONW.TOMO_ROLES = [ONW.ROLE.STRAW_DOLL, ONW.ROLE.CAT_SIDHE, ONW.ROLE.BLACK_CAT];

  ONW.ROLE_INFO = {
    [ONW.ROLE.WEREWOLF]:     { name: "人狼",         team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。他の人狼を確認できます。" },
    [ONW.ROLE.BIG_WOLF]:     { name: "大狼",         team: ONW.TEAM.WOLF,    wakeOrder: 11, desc: "人狼陣営。他の人狼系を確認できます。さらに墓地カードをすべて確認できます。" },
    [ONW.ROLE.LONE_WOLF]:    { name: "一匹狼",       team: ONW.TEAM.WOLF,    wakeOrder: 12, desc: "人狼陣営。相方が分からず、他の人狼からも見えません。" },
    [ONW.ROLE.WHITE_WOLF]:   { name: "白狼",         team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。占い結果が村人と出る人狼です。相方や狂信者からは人狼として見えます。" },
    [ONW.ROLE.TOFU_WOLF]:    { name: "豆腐の人狼",   team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。1票でも投票されると、処刑される人と同時にめくられ、メンタル崩壊で死亡します。" },
    [ONW.ROLE.FORGETFUL_WOLF]: { name: "忘却の人狼", team: ONW.TEAM.WOLF,    wakeOrder: null, desc: "人狼陣営。自分のことを村人だと思い込んでいる人狼です。占い結果は人狼です。本人視点では村人として夜を認識します。" },
    [ONW.ROLE.ASSASSIN]:     { name: "アサシン",     team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。他の人狼を確認できます。追放されてめくれたら、その場で自分以外の全員から1人を選びます。選んだ相手がマーリンなら、人狼陣営の逆転勝利です。" },
    [ONW.ROLE.WOLF_DREAMER]: { name: "狼夢人",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。自分のことを人狼だと思い込んでいる村人です。占い結果は狼夢人です。夜は相方のいない一人の人狼として認識します。" },
    [ONW.ROLE.WOLF_MARKED]:  { name: "狼憑き",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。自認はただの村人ですが、占われると人狼結果が出ます。" },
    [ONW.ROLE.MERLIN]:       { name: "マーリン",     team: ONW.TEAM.VILLAGE, wakeOrder: 25, desc: "村人陣営。墓地以外の人狼を知っています。狂人が人狼に昇格する場合も人狼として見えます。アサシンに選ばれると人狼陣営の逆転勝利になるので、マーリンCOはしてはいけません。" },
    [ONW.ROLE.BAKER]:        { name: "パン屋",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜の能力はありません。最終盤面にパン屋がいると、昼のタイマー開始時に「パンが焼けました」と全員に知らされます（誰がパン屋かは分かりません）。" },
    [ONW.ROLE.STAR]:         { name: "スター",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜の能力はありません。最終盤面でスターを持っている人のカードは、朝のあとの待機時間に全員の画面で表になり、誰がスターか公開されます。" },
    [ONW.ROLE.BLACK_CAT]:    { name: "黒猫",         team: ONW.TEAM.WOLF,    wakeOrder: null, desc: "人狼陣営。吊られると誰かを道連れにする狂人です。ご主人を道連れにする可能性もあります。" },
    [ONW.ROLE.CULTIST]:      { name: "狂信者",       team: ONW.TEAM.WOLF,    wakeOrder: 20, desc: "人狼陣営。墓地以外の人狼プレイヤーを知っている狂人です。" },
    [ONW.ROLE.MASON]:        { name: "共有者",       team: ONW.TEAM.VILLAGE, wakeOrder: 30, desc: "村人陣営。他の共有者がいれば確認できます。" },
    [ONW.ROLE.STRAW_DOLL]:   { name: "わら人形",     team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜行動はありません。死んだときに1人選んで道連れにします。" },
    [ONW.ROLE.CAT_SIDHE]:    { name: "猫又",         team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。自分が処刑されたらランダムな1人を道連れにします。" },
    [ONW.ROLE.SEER]:         { name: "占い師",       team: ONW.TEAM.VILLAGE, wakeOrder: 40, desc: "村人陣営。プレイヤー1人を見るか、墓地カードを確認できます。" },
    [ONW.ROLE.MAD_SEER]:     { name: "狂った占い師", team: ONW.TEAM.WOLF,    wakeOrder: 41, desc: "人狼陣営。占いの能力を持った狂人です。" },
    [ONW.ROLE.ROBBER]:       { name: "怪盗",         team: ONW.TEAM.VILLAGE, wakeOrder: 55, desc: "村人陣営。自分以外1人と役職を交換し、新しい自分の役職だけ確認できます。" },
    [ONW.ROLE.RELIC_ROBBER]: { name: "墓荒らし",     team: ONW.TEAM.VILLAGE, wakeOrder: 50, desc: "村人陣営。夜に墓地カード1枚と自分の役職を交換します。交換後の役職に夜行動があればその能力も使えます。" },
    [ONW.ROLE.TROUBLEMAKER]: { name: "いたずらっ子", team: ONW.TEAM.VILLAGE, wakeOrder: 60, desc: "村人陣営。自分以外2人の役職を入れ替えます。" },
    [ONW.ROLE.INSOMNIAC]:    { name: "後覚者",       team: ONW.TEAM.VILLAGE, wakeOrder: 70, desc: "村人陣営。夜行動がすべて終わったあと、自分の最終役職を確認できます。" },
    [ONW.ROLE.MADMAN]:       { name: "狂人",         team: ONW.TEAM.WOLF,    wakeOrder: null, desc: "人狼陣営。夜の能力はなく、人狼が誰かも分かりません。人狼を勝たせるのが目的です。" },
    [ONW.ROLE.LIGHT_APOSTLE]: { name: "光の使徒",     team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。試合開始時に村人陣営の役職へランダムに変化します。" },
    [ONW.ROLE.DARK_AVATAR]:  { name: "闇の化身",     team: ONW.TEAM.WOLF,    wakeOrder: null, desc: "人狼陣営。試合開始時に人狼陣営の役職へランダムに変化します。" },
    [ONW.ROLE.SILVER_SHADOW]: { name: "銀色の影",    team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。試合開始時に第三陣営の役職へランダムに変化します。" },
    [ONW.ROLE.VILLAGER]:     { name: "村人",         team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。能力はありません。" },
    [ONW.ROLE.TANNER]:       { name: "てるてる坊主", team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。自分が追放されると勝利です。" },
    [ONW.ROLE.LOVE_TANNER]:  { name: "一目惚れしてるてる", team: ONW.TEAM.THIRD, wakeOrder: 5, desc: "第三陣営。夜に1人選び、自分が追放されたらその相手も一緒に追放扱いになり、自分と相手が勝利します。" },
    [ONW.ROLE.GOD]:          { name: "神",           team: ONW.TEAM.THIRD,   wakeOrder: 1, desc: "第三陣営。全員の役職と墓地の役職を知っています。追放されなければ神の勝利です。追放された場合は神の祝福が発生し、神以外の全員が勝利します（オポチュニストは追放されていない場合のみ）。" },
    [ONW.ROLE.AMANOJAKU]:    { name: "天邪鬼",       team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。村人陣営が勝たなければ追加勝利です。" },
    [ONW.ROLE.OPPORTUNIST]:  { name: "オポチュニスト", team: ONW.TEAM.THIRD, wakeOrder: null, desc: "第三陣営。夜の能力はありません。最後まで追放されなければ、ほかの勝敗に追加で勝利します。" },
  };

  /**
   * ゲームフェーズ:
   *   "title"  … タイトル画面
   *   "setup"  … 人数・役職構成の設定
   *   "reveal" … 各プレイヤーへの配役・カード確認
   *   "night"  … 夜フェーズ（役職ごとの行動）
   *   "day"    … 昼フェーズ（議論タイム）
   *   "vote"   … 投票フェーズ
   *   "result" … 結果発表
   */
  ONW.PHASE = {
    TITLE: "title",
    LOBBY: "lobby",
    ONLINE_ROLE: "online_role",
    ONLINE_NIGHT: "online_night",
    ONLINE_MORNING: "online_morning",
    ONLINE_SPECTATE: "online_spectate",
    ONLINE_DAY: "online_day",
    ONLINE_VOTE: "online_vote",
    ONLINE_RESULT: "online_result",
    SETUP: "setup",
    REVEAL: "reveal",
    NIGHT: "night",
    DAY: "day",
    VOTE: "vote",
    RESULT: "result",
  };

  /**
   * 初期状態を生成する。
   * main.js から一度だけ呼ばれ、以後は ONW.game を直接書き換えていく。
   */
  ONW.createInitialState = function createInitialState() {
    return {
      phase: ONW.PHASE.TITLE,

      // --- セットアップ内容 ---
      roleCounts: { werewolf: 2, big_wolf: 0, dark_avatar: 0, madman: 0, mad_seer: 0, cultist: 0, villager: 2, seer: 1, robber: 1, relic_robber: 0, troublemaker: 0, insomniac: 0, mason: 0, light_apostle: 0, tanner: 0, silver_shadow: 0, love_tanner: 0, god: 0, opportunist: 0, straw_doll: 0, cat_sidhe: 0, black_cat: 0, amanojaku: 0, lone_wolf: 0, white_wolf: 0, tofu_wolf: 0, forgetful_wolf: 0, merlin: 0, assassin: 0, wolf_dreamer: 0, wolf_marked: 0, baker: 0, star: 0 },
      revealTransforms: true,         // 変化公開（昼開始時に「変化前 → 変化後」を公開）
      transformOff: [], cpuNames: [], specRoster: [], hostSpec: false,                // 変化先の有無設定: OFFにした「変化役:変化先」の一覧
      transformCandidates: true,      // 変化先の候補をCOの役職一覧に出す（変化公開OFFのとき）
      transformFrom: {}, centerTransformFrom: {}, winnerIds: null, // ルーム設定の配役枚数
      debugOn: false, dbg: null, dbgWarn: [], dbgVotes: {},   // デバッグモード（debug.js）
      inGame: false,                  // 試合中か（ホストがルームに戻るまで true）
      spectators: [], specNames: {},  // 途中参加の観戦者
      deadIds: [], ghostLog: [], chatTab: "main", isDead: false, specInfo: null, specInfoOpen: true, nightResolved: false,   // 死亡者 / 霊界チャット / 観戦者向けの全員情報
      codeText: "", importText: "", codeMsg: "", coBoard: [], boardView: [], tfView: null, tfLines: [], tfPairs: [], boardOpen: false, resultChatOpen: false, nightInfoClosed: false,
      lobbyPlayers: [], meIndex: 0, showSettings: false, roleOpen: {}, presetName: "", isSpectator: false,
      timers: { night: 45, morning: 10, day: 120, vote: 30 }, // 各フェーズの秒数（マイクラ版の初期値 / 朝のみ新規）
      graveCount: 2,                  // 墓地の枚数（マイクラ版の初期値）
      seerGraveCount: 2,              // 占い師・狂った占い師が一度に占える墓地の枚数（マイクラ版の初期値 seerCenterCount）
      villageSize: 4,                 // 何人村（参加者＋CPUの定員。超えて入った人は観戦側）
      cpuCount: 0,                    // CPU人数（定員に含む）
      fakeWolfWhenNoWolf: true,       // 狂人代用人狼（人狼不在時に狂人を1人人狼判定へ昇格）
      promotedWolfIds: [],            // 昇格した狂人のID
      playerCount: 3,                 // 実プレイヤー人数（墓地カードは自動で +3）
      selectedRoles: [                // 使用する役職（枚数 = playerCount + 3 になるよう選ぶ）
        ONW.ROLE.WEREWOLF,
        ONW.ROLE.WEREWOLF,
        ONW.ROLE.SEER,
        ONW.ROLE.ROBBER,
        ONW.ROLE.TROUBLEMAKER,
        ONW.ROLE.VILLAGER,
      ],

      // --- プレイヤー ---
      players: [],                    // [{ id, name, isCpu }]

      // --- 配役結果 ---
      initialRoles: {},               // { playerId: role }  配られた直後の役職
      currentRoles: {},               // { playerId: role }  夜の行動で変化した後の役職
      center: [],                     // 墓地に伏せた3枚の役職

      // --- 夜フェーズ ---
      nightStepIndex: 0,              // 現在の夜アクション手番
      nightOrderCache: [],            // その回で実際に行動する役職の並び

      // --- 昼・投票フェーズ ---
      votes: {},                      // { voterId: targetId }

      // --- 結果 ---
      eliminated: [],                 // 投票で追放されたプレイヤーID
      winners: [],                    // 勝利した陣営（複数もありうる）

      // --- ログ ---
      log: [],
    };
  };

  // アプリ全体で共有する唯一のゲーム状態
  ONW.game = ONW.createInitialState();

})(window.ONW);
