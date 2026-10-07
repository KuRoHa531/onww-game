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

  // 役職ID一覧。役職ファイル(js/roles/<役職>.js)の defineRole("<ID>") で ONW.ROLE.<ID大文字> が自動で増える(roles/base.js)。
  // ここに書くのは、役職ファイルを作らない「重複役職」だけ。
  ONW.ROLE = {
    DRUNK: "drunk",   // 重複役職（配役の枚数には数えず、誰か1人に重なる。表示用の役職で、initialRoles/currentRoles には入らない）
    LOVER: "lover",   // 重複役職（恋人）: 配役の枚数には数えず、2人1組でランダムな参加者に重なる。g.loverOf[id] = 相方のid（役職の移動には関係なく、人についている）
  };

  /** 人狼系（人狼判定になる役職）/ 狂人系（人狼陣営だが人狼判定ではない役職） */
  // 役職グループ(人狼系・狂人系・道連れ系・思い込み系・変化先など)の入れ物。中身は各役職ファイル(js/roles/<役職>.js)の groups から
  // roles/base.js が同じ入れ物のまま集めて作る(新しい役職はファイルに groups を書くだけ。ここは触らない)。
  ONW.WOLF_KIND = [];       // 人狼系(人狼判定になる役職)。groups.wolf
  ONW.VISIBLE_WOLF = [];    // 夜に仲間から「人狼」として見える人狼系(一匹狼は誰からも見えない: hiddenWolf)
  // 占い師が占ったときに見える役職 ONW.seerSees は roles/base.js(役職ファイルの seerSees: "<見える役職>" から)
  /** 本人が見る自分の役職(忘却の人狼・狼憑きは村人、狼夢人は人狼だと思い込んでいる。怪盗・墓荒らし・後覚者で手にしたときも同じ) */
  /** 思い込み系: 本人は別の役職だと思い込んでいる役職。今後増やすときはここに足す(配布の演出で、変化前を本人の自認の陣営の変化役に見せる判定にも使われる) */
  ONW.SELF_AS_VILLAGER = [];   // 本人は村人だと思い込む(groups.selfAsVillager: 忘却の人狼・狼憑き)
  ONW.SELF_AS_WOLF = [];                                                     // 本人は人狼だと思い込む(相方のいない一人の人狼。groups.selfAsWolf: 狼夢人)
  ONW.shownRole = (role) => (ONW.SELF_AS_VILLAGER.includes(role) ? ONW.ROLE.VILLAGER : ONW.SELF_AS_WOLF.includes(role) ? ONW.ROLE.WEREWOLF : role);
  /** 酔っ払いが重なっていて、まだ酔いが覚めていない人か */
  ONW.hiddenDrunk = (g, id) => !!(g.drunkOverlay && g.drunkOverlay[id] && !(g.drunkRevealed && g.drunkRevealed[id]));
  /** 恋人の相方のid（恋人でなければ null）。恋人は「人」についている重複役職なので、役職が入れ替わっても相方は変わらない */
  ONW.loverMate = (g, id) => (g && g.loverOf && g.loverOf[id]) || null;
  /** 恋人の組 [[a, b], ...]（idの並び順で重複なし） */
  ONW.loverPairs = (g) => { const out = []; Object.keys((g && g.loverOf) || {}).forEach((a) => { const b = g.loverOf[a]; if (b && a < b && g.loverOf[b] === a) out.push([a, b]); }); return out; };
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
  ONW.ROLE_BOUND_KEYS = ["loveTargets", "freeterTargets", "visitorTargets", "servantMasters", "servantNotified", "execTargets", "gremlinPicks", "muzzleTargets"];   // 例: 一目惚れしてるてる(loveTargets[持ち主ID] = 選んだ相手のID)。役職に紐づく状態を足すときはここへ。
  const holderKeyOfGrave = (i) => "g:" + i;
  ONW.setRoleBound = (g, key, holderId, value) => { (g[key] = g[key] || {})[holderId] = value; };
  ONW.getRoleBound = (g, key, holderId) => (g[key] || {})[holderId];

  // 女王の通知文 ONW.queenNoticeText は js/roles/queen.js、従者通知の文言 ONW.SERVANT_NOTICE_TEXT は js/roles/servant.js へ移動
  /** グレムリンのコピー: コピー元(srcId)の「その時点の役職」を、コピー先(dstId)のカードの上に書き込む（コピー元は動かない）。
   *  ドッペルゲンガーをコピーしたら村人（すでに別の役職をコピー済みなら、その役職）。フリーターの就職先・訪問者の訪問先・従者のご主人・一目惚れ先・処刑人のターゲットも一緒にコピーする。
   *  履歴(roleTrail)には「コピーされた役職」を1回分として積む。戻り値: コピー先が手にした役職 */
  ONW.gremlinCopy = (g, srcId, dstId) => {
    const cd = cards(g);
    let role = g.currentRoles[srcId];
    if (role === ONW.ROLE.DOPPELGANGER) role = ONW.ROLE.VILLAGER;
    const carry = { [ONW.ROLE.FREETER]: "freeterTargets", [ONW.ROLE.VISITOR]: "visitorTargets", [ONW.ROLE.SERVANT]: "servantMasters", [ONW.ROLE.LOVE_TANNER]: "loveTargets", [ONW.ROLE.EXECUTIONER]: "execTargets" }[role];
    const val = carry ? (g[carry] || {})[srcId] : undefined;
    g.currentRoles[dstId] = role;
    if (carry && val !== undefined) (g[carry] = g[carry] || {})[dstId] = val;   // 就職先・ご主人・一目惚れ先・ターゲットごとコピー
    const t = (g.roleTrail = g.roleTrail || {});
    (t[dstId] = t[dstId] || []).push(role);
    (cd.trail[dstId] = cd.trail[dstId] || []).push(cd.at[dstId]);   // カードは同じ（役職だけが変わる）
    ONW.fixServants(g);
    return role;
  };
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
    ONW.fixServants(g);   // 従者: ご主人はカードについて動く（swapBound）。ご主人のいない従者には新しいご主人を決める
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
    ONW.fixServants(g);   // 従者: 墓地に入った従者はご主人を失い、墓地から引いた従者には新しいご主人がランダムで決まる
  };
  /** ドッペルゲンガーのコピー（コピー先の「その時点の役職」になる。選ばれた側は動かない）。
   *  役職はプレイヤー toId のカードの上で書き換わる（カードそのものは動かない）。ドッペルゲンガーをコピーしたら村人になる。
   *  履歴(roleTrail)には「コピーした役職」を1回分として積む。新しい役職が従者ならご主人がランダムで決まる（fixServants）。
   *  戻り値: コピーして手にした役職 */
  ONW.copyRole = (g, fromId, toId) => {
    const cd = cards(g);
    let role = g.currentRoles[fromId];   // コピーするのは「その時点」の役職（夜から朝への処理の中で、自分の番が来た時点）
    if (role === ONW.ROLE.DOPPELGANGER) role = ONW.ROLE.VILLAGER;
    g.currentRoles[toId] = role;
    const t = (g.roleTrail = g.roleTrail || {});
    (t[toId] = t[toId] || []).push(role);
    (cd.trail[toId] = cd.trail[toId] || []).push(cd.at[toId]);   // カードは同じ（役職だけが変わる）
    ONW.fixServants(g);
    return role;
  };
  ONW.MAD_KIND = [];   // 狂人系(人狼陣営だが人狼判定ではない役職。groups.mad)

  // 役職の詳細情報。夜の行動順（wakeOrder）が小さいほど先に起きる。
  // wakeOrder が null の役職は夜に何もしない。
  // name / desc は元データ（state.js の ROLE_NAME / 役職説明）からそのまま転記。
  /** 変化役 → 変化先の候補（このオンライン版で使える役職のうち、同じ陣営のもの） */
  ONW.TRANSFORM_GROUPS = {};   // { 変化役: [変化先...] }。groups["transform:<変化役>"] を持つ役職から集める


  /** 新聞配達員の新聞に載せない役職（変化役は試合開始時に別の役職になるので、そもそも夜に能力を使わない） */
  ONW.NEWS_HIDDEN = [];   // groups.newsHidden
  /** 夜に能力を実際に使った役職を新聞に記録する（同じ役職は1回だけ。使った人の名前は残さない） */
  ONW.newsNote = (g, role) => {
    if (!g || !role || ONW.NEWS_HIDDEN.includes(role)) return;
    g.newsRoles = g.newsRoles || [];
    if (!g.newsRoles.includes(role)) g.newsRoles.push(role);
  };
  /** 観測の人狼用: 夜（と朝のうち）に能力を使った記録。from = 能力を使った人のID、players = 対象のプレイヤーID、graves = 対象の墓地番号(0始まり)。
   *  新聞と同じく、昼に酔いが覚めてからの能力は記録しない（呼ぶ側で判断）。同じ内容は観測結果の文章を作るときにまとめる */
  ONW.observeNote = (g, from, players, graves) => {
    if (!g || !from) return;
    const pl = (players || []).filter(Boolean), gr = (graves || []).filter((x) => Number.isInteger(x));
    if (!pl.length && !gr.length) return;
    (g.observeLog = g.observeLog || []).push({ from, players: pl, graves: gr });
  };
  /** 観測結果の文章（本家の「〇〇は△△に能力を使っていました。」と同じ形。墓地は「墓地N」）。重複は1回にまとめ、誰が使ったか分かるよう並びはランダム */
  ONW.observerLines = (g) => {
    const nm = (id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";
    const out = [];
    const add = (s) => { if (!out.includes(s)) out.push(s); };
    (g.observeLog || []).forEach((e) => {
      e.players.forEach((t) => add(`${nm(e.from)}は${nm(t)}に能力を使っていました。`));
      if (e.graves.length) add(`${nm(e.from)}は${e.graves.slice().sort((a, b) => a - b).map((i) => `墓地${i + 1}`).join("、")}に能力を使っていました。`);
    });
    return ONW.utils && ONW.utils.shuffle ? ONW.utils.shuffle(out) : out;
  };
  /** 観測の人狼（最終盤面で、酔いが覚めている人）。観測結果は待機時間に1人1回だけ伝わる（g.observerSeen） */
  ONW.observerHolders = (g) => (g.players || []).filter((p) => g.currentRoles[p.id] === ONW.ROLE.OBSERVER_WOLF && !ONW.hiddenDrunk(g, p.id));

  /** 道連れ系(めくれたとき別の人を巻き込む役職)。vote.js の resolveChain が参照する */
  ONW.TOMO_ROLES = [];   // groups.tomo

  /** メイヤーの投票数（ルーム設定 g.mayorVoteCount。本家と同じ 2〜10票、初期値2票） */
  ONW.mayorVotes = (g) => Math.max(2, Math.min(10, Math.round(Number(g && g.mayorVoteCount) || 2)));
  /** 役職の説明文。メイヤーだけは、いまのルーム設定の票数を入れて返す（差し込みを持つ役職は roles/<役職>.js の descFor。それ以外は ROLE_INFO の desc そのまま） */
  ONW.roleDesc = (role, g) => {
    const d = (ONW.ROLE_INFO[role] || {}).desc || "";
    const f = g && ONW.roleHook ? ONW.roleHook(role, "descFor") : null;   // メイヤーの票数の差し込みは roles/mayor.js の descFor
    return f ? f(d, g) : d;
  };


  // 役職の名前・陣営・夜の順番・説明文は、各役職ファイル(js/roles/<役職>.js)の info に書く。
  // ONW.ROLE_INFO は入れ物だけをここで作り、roles/base.js が役職ファイルの読み込みのたびに(同じ入れ物のまま)作り直す。
  ONW.ROLE_INFO = {};
  // 役職ファイルを作らない「重複役職」(酔っ払い・恋人)の情報。ROLE_INFO の最後(sort が大きい順)に並ぶ。
  ONW.COMMON_ROLE_INFO = {
    [ONW.ROLE.DRUNK]:        { name: "酔っ払い",     team: ONW.TEAM.THIRD,   wakeOrder: null, sort: 9000, desc: "重複役職。議論時間の半分が過ぎるまで、自分の役職も夜の情報も分かりません。覚めると最終的な役職を知り、能力があれば1回使えます。" },
    [ONW.ROLE.LOVER]:        { name: "恋人",         team: ONW.TEAM.THIRD,   wakeOrder: null, sort: 9001, desc: "重複役職。配役の枚数には数えず、2人1組でランダムな参加者（CPU含む）に重なります。夜に相方のカードが❤️でめくれて、お互いが分かります。相方が死亡すると（追放・道連れ・無理心中・王国滅亡・昼中の死亡など、死因は問いません）、同時に自分も心中で死亡します。恋人の二人とも死ななければ恋人陣営の勝利で、恋人以外は敗北です（死亡した恋人は、元の陣営が勝っても敗北します）。投票結果でめくれるとき、恋人のカードの右上に丸いハートが付きます。" },
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
      roleCounts: ONW.defaultRoleCounts ? ONW.defaultRoleCounts() : {},   // 初期枚数・並びは各役職ファイルの info.deck / info.count(roles/base.js)
      revealTransforms: true,         // 変化公開（昼開始時に「変化前 → 変化後」を公開）
      transformOff: [], cpuNames: [], specRoster: [], hostSpec: false,                // 変化先の有無設定: OFFにした「変化役:変化先」の一覧
      transformCandidates: true,      // 変化先の候補をCOの役職一覧に出す（変化公開OFFのとき）
      transformFrom: {}, centerTransformFrom: {}, winnerIds: null, // ルーム設定の配役枚数
      debugOn: false, dbg: null, dbgWarn: [], dbgVotes: {},   // デバッグモード（debug.js）
      inGame: false,                  // 試合中か（ホストがルームに戻るまで true）
      spectators: [], specNames: {},  // 途中参加の観戦者
      deadIds: [], ghostLog: [], chatTab: "main", isDead: false, specInfo: null, specInfoOpen: true, nightResolved: false,   // 死亡者 / 霊界チャット / 観戦者向けの全員情報
      codeText: "", importText: "", codeMsg: "", coBoard: [], boardView: [], tfView: null, tfLines: [], tfPairs: [], boardOpen: false, resultChatOpen: false, nightInfoClosed: false,
      lobbyPlayers: [], meIndex: 0, showSettings: false, setPage: null, roleOpen: {}, presetName: "", isSpectator: false,
      timers: { night: 45, morning: 10, day: 120, vote: 30 }, // 各フェーズの秒数（マイクラ版の初期値 / 朝のみ新規）
      graveCount: 2,                  // 墓地の枚数（マイクラ版の初期値）
      mayorVoteCount: 2,              // メイヤーの投票数（2〜10票。本家の mayorVoteCount と同じ初期値）
      seerGraveCount: 2,              // 占い師・狂った占い師が一度に占える墓地の枚数（マイクラ版の初期値 seerCenterCount）
      drunkChance: 100,               // 酔っ払いの枠1つごとに、実際に酔う確率(%)
      drunkCount: 0,                  // 酔っ払い(重複役職)の人数。配役の枚数には数えない
      loverCount: 0,                  // 恋人(重複役職)の組数。配役の枚数には数えない
      loverChance: 100,               // 恋人1組ごとに、実際に恋人になる確率(%)
      loverOf: {},                    // 恋人の相方 id → 相方の id（試合中。2人とも入っている）
      drunkOverlay: {},               // 酔っ払いが重なっている人 id → true（試合中）
      drunkRevealed: {},              // 酔いが覚めた人 id → true
      drunkSober: false,              // 昼の酔い覚めの判定が済んだか
      soberLines: {},                 // 酔いが覚めた人 id → 覚めたあとに受け取った情報
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
