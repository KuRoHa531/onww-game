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
    // TODO: 拡張役職をここに追加していく（例: BELL_MIKO: "bell_miko" など）
  };

  /** 人狼系（人狼判定になる役職）/ 狂人系（人狼陣営だが人狼判定ではない役職） */
  ONW.WOLF_KIND = [ONW.ROLE.WEREWOLF, ONW.ROLE.BIG_WOLF];
  ONW.MAD_KIND = [ONW.ROLE.MADMAN, ONW.ROLE.MAD_SEER, ONW.ROLE.CULTIST];

  // 役職の詳細情報。夜の行動順（wakeOrder）が小さいほど先に起きる。
  // wakeOrder が null の役職は夜に何もしない。
  // name / desc は元データ（state.js の ROLE_NAME / 役職説明）からそのまま転記。
  /** 変化役 → 変化先の候補（このオンライン版で使える役職のうち、同じ陣営のもの） */
  ONW.TRANSFORM_GROUPS = {
    [ONW.ROLE.LIGHT_APOSTLE]: [ONW.ROLE.VILLAGER, ONW.ROLE.SEER, ONW.ROLE.ROBBER, ONW.ROLE.RELIC_ROBBER, ONW.ROLE.TROUBLEMAKER, ONW.ROLE.INSOMNIAC, ONW.ROLE.MASON],
    [ONW.ROLE.DARK_AVATAR]: [ONW.ROLE.WEREWOLF, ONW.ROLE.BIG_WOLF, ONW.ROLE.MADMAN, ONW.ROLE.MAD_SEER, ONW.ROLE.CULTIST],
    [ONW.ROLE.SILVER_SHADOW]: [ONW.ROLE.TANNER],
  };

  ONW.ROLE_INFO = {
    [ONW.ROLE.WEREWOLF]:     { name: "人狼",         team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。他の人狼を確認できます。" },
    [ONW.ROLE.BIG_WOLF]:     { name: "大狼",         team: ONW.TEAM.WOLF,    wakeOrder: 11, desc: "人狼陣営。他の人狼系を確認できます。さらに墓地カードをすべて確認できます。" },
    [ONW.ROLE.CULTIST]:      { name: "狂信者",       team: ONW.TEAM.WOLF,    wakeOrder: 20, desc: "人狼陣営。墓地以外の人狼プレイヤーを知っている狂人です。" },
    [ONW.ROLE.MASON]:        { name: "共有者",       team: ONW.TEAM.VILLAGE, wakeOrder: 30, desc: "村人陣営。他の共有者がいれば確認できます。" },
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
      roleCounts: { werewolf: 2, big_wolf: 0, dark_avatar: 0, madman: 0, mad_seer: 0, cultist: 0, villager: 2, seer: 1, robber: 1, relic_robber: 0, troublemaker: 0, insomniac: 0, mason: 0, light_apostle: 0, tanner: 0, silver_shadow: 0 },
      revealTransforms: true,         // 変化公開（昼開始時に「変化前 → 変化後」を公開）
      transformOff: [], cpuNames: [], specRoster: [], hostSpec: false,                // 変化先の有無設定: OFFにした「変化役:変化先」の一覧
      transformCandidates: true,      // 変化先の候補をCOの役職一覧に出す（変化公開OFFのとき）
      transformFrom: {}, centerTransformFrom: {}, winnerIds: null, // ルーム設定の配役枚数
      debugOn: false, dbg: null, dbgWarn: [], dbgVotes: {},   // デバッグモード（debug.js）
      inGame: false,                  // 試合中か（ホストがルームに戻るまで true）
      spectators: [], specNames: {},  // 途中参加の観戦者
      codeText: "", importText: "", codeMsg: "", coBoard: [], boardView: [], tfView: null, tfLines: [], boardOpen: false, resultChatOpen: false, nightInfoClosed: false,
      lobbyPlayers: [], meIndex: 0, showSettings: false, roleOpen: {}, presetName: "", isSpectator: false,
      timers: { night: 45, morning: 10, day: 120, vote: 30 }, // 各フェーズの秒数（マイクラ版の初期値 / 朝のみ新規）
      graveCount: 2,                  // 墓地の枚数（マイクラ版の初期値）
      cpuCount: 0,                    // CPU人数
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
