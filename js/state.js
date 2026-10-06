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
    NEWSPAPER: "newspaper",   // 新聞配達員: 夜に能力を使った役職の名前が、変化公開のあと新聞として全員に知らされる（誰が使ったかは分からない）
    STAR: "star",
    FREETER: "freeter",
    SERVANT: "servant",   // 従者: 試合開始時にランダムなご主人(他の参加者)に仕える。ご主人はカードについていく(役職に紐づく状態 servantMasters)
    WINNER: "winner",   // 勝ち組: 最終的にこの役職なら、ほかの勝敗に関係なく追加勝利（恋人になっていても勝ち）
    LOSER: "loser",     // 負け組: 最終的にこの役職なら、ほかの勝敗に関係なく敗北（恋人が勝っても・神の祝福でも敗北）
    DRUNK: "drunk",   // 重複役職（配役の枚数には数えず、誰か1人に重なる。表示用の役職で、initialRoles/currentRoles には入らない）
    CHICKEN: "chicken",   // チキン: 1票でも入るとショック死する村人陣営。生き残れば、村人陣営以外の勝利を村人陣営の逆転勝利にする
    GREMLIN: "gremlin",   // グレムリン: 夜に2人（コピー元 → コピー先）を選び、その時点のコピー元の役職をコピー先にコピーする（コピー元は変化しない）。選んだ2人のどちらかが勝利すれば追加勝利（選択は役職の持ち主に記録: gremlinPicks）
    EXECUTIONER: "executioner",   // 処刑人: 試合開始時にランダムなターゲット(他の参加者)が決まる。ターゲットが追放されたら勝利（ターゲットはカードについていく: 役職に紐づく状態 execTargets）
    DOPPELGANGER: "doppelganger",   // ドッペルゲンガー: 夜に1人選び、その人の初期役職をコピーする（選ばれた側の役職は動かない）
    VISITOR: "visitor",   // 訪問者: 村人陣営。夜に1人を訪問する（相手の役職は分からない）。訪問先は役職の持ち主に紐づく(visitorTargets)ので、入れ替わると「誰が訪問してきたか」も入れ替わる。朝のあとの待機時間に、訪問された人の画面で訪問者のカードが表になる
    MAYOR: "mayor",   // メイヤー: 村人陣営。夜の能力はなく、昼の投票で「メイヤーの投票数」（ルーム設定・2〜10票）ぶんの票を持つ。最終盤面でメイヤーを持っている人の投票が重くなる
    LOVER: "lover",   // 重複役職（恋人）: 配役の枚数には数えず、2人1組でランダムな参加者に重なる。g.loverOf[id] = 相方のid（役職の移動には関係なく、人についている）
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
  ONW.ROLE_BOUND_KEYS = ["loveTargets", "freeterTargets", "visitorTargets", "servantMasters", "servantNotified", "execTargets", "gremlinPicks"];   // 例: 一目惚れしてるてる(loveTargets[持ち主ID] = 選んだ相手のID)。役職に紐づく状態を足すときはここへ。
  const holderKeyOfGrave = (i) => "g:" + i;
  ONW.setRoleBound = (g, key, holderId, value) => { (g[key] = g[key] || {})[holderId] = value; };
  ONW.getRoleBound = (g, key, holderId) => (g[key] || {})[holderId];
  /** 訪問者の訪問先(プレイヤーID)。最終盤面でその人が訪問者を持っていて、訪問先が決まっているときだけ。なければ null。
   *  訪問先は「役職の持ち主」に記録されている(g.visitorTargets[持ち主ID] = 訪問先のID)ので、訪問者のカードが動けば、訪問先もカードについて動く */
  ONW.visitorTarget = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.VISITOR && (g.visitorTargets || {})[id]) || null;
  /** 最終盤面で訪問者を持っていて、訪問先が id の人たち（持ち主IDの配列）。訪問先が自分自身になった訪問者（入れ替わりの結果）は数えない。
   *  訪問された人の待機時間の演出・通知に使う。酔いが覚めていない人には届けない */
  ONW.visitorsOf = (g, id) => (!g || !g.players || ONW.hiddenDrunk(g, id)) ? [] : g.players.filter((q) => q.id !== id && g.currentRoles[q.id] === ONW.ROLE.VISITOR && (g.visitorTargets || {})[q.id] === id).map((q) => q.id);
  /** 従者のご主人(プレイヤーID)。最終盤面でその人が従者を持っていて、ご主人が決まっているときだけ。なければ null
   *  ご主人は「役職の持ち主」に記録されている(g.servantMasters[持ち主ID] = ご主人のID)ので、従者のカードが動けば、ご主人もカードについて動く（本家と同じ） */
  ONW.servantMaster = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.SERVANT && (g.servantMasters || {})[id]) || null;
  /** 従者を持っている人(持ち主ID)とご主人の組 [[従者の持ち主, ご主人], ...]（ご主人が決まっているものだけ） */
  ONW.servantPairs = (g) => (g.players || []).map((p) => [p.id, ONW.servantMaster(g, p.id)]).filter(([, m]) => m);
  /** 従者のCO・結果開示の文言（人間のCOボタンとCPUの発言で完全に一致させるため、ここ1か所だけで作る。本家: 「ご主人は〇〇です」） */
  ONW.servantCoText = (name) => `ご主人は${name}です。`;
  ONW.servantCoShort = (name) => `ご主人: ${name}`;
  /** ご主人への従者通知の文言（本家 game.js の「従者通知」と同じ。誰が従者かは教えない） */
  ONW.SERVANT_NOTICE_TEXT = "あなたの従者がいるようです。";
  /** 役職が動いたあとの従者の整合を取る（本家の clearServantData / syncSingleRoleLinkedData / assignNewServantMaster 相当）
   *   ・墓地に入った従者はご主人を失う（墓地の役職に主従関係は残らない）
   *   ・従者でない人についたご主人の記録は消す
   *   ・ご主人が決まっていない従者（墓地から引いた従者など）には、自分以外の参加者からランダムで新しいご主人を決める
   *  新しくご主人が決まった人のIDの配列を返す */
  ONW.fixServants = (g) => {
    const m = (g.servantMasters = g.servantMasters || {}), fresh = [], ids = (g.players || []).map((p) => p.id);
    const nt = (g.servantNotified = g.servantNotified || {});   // 従者通知を出し済みか（従者のカードについていく。ご主人が新しく決まったら出し直す）
    Object.keys(m).forEach((k) => { if (String(k).startsWith("g:")) delete m[k]; });
    Object.keys(nt).forEach((k) => { if (String(k).startsWith("g:")) delete nt[k]; });
    ids.forEach((id) => {
      if (g.currentRoles[id] !== ONW.ROLE.SERVANT) { delete m[id]; delete nt[id]; return; }
      if (m[id] && ids.includes(m[id])) return;
      const c = ids.filter((x) => x !== id);
      if (!c.length) { delete m[id]; delete nt[id]; return; }
      m[id] = c[Math.floor(Math.random() * c.length)];
      delete nt[id];
      fresh.push(id);
    });
    ONW.fixExecutioners(g);   // 処刑人のターゲットも、カードについて動く / 新しい処刑人には新しいターゲットを決める
    return fresh;
  };
  /** 処刑人のターゲット(プレイヤーID)。最終盤面でその人が処刑人を持っていて、ターゲットが決まっているときだけ。なければ null（ターゲットは役職の持ち主に記録され、カードについて動く） */
  ONW.execTarget = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.EXECUTIONER && (g.execTargets || {})[id]) || null;
  /** 処刑人を持っている人(持ち主ID)とターゲットの組 [[処刑人の持ち主, ターゲット], ...] */
  ONW.execPairs = (g) => (g.players || []).map((p) => [p.id, ONW.execTarget(g, p.id)]).filter(([, t]) => t);
  ONW.EXEC_CO_TEXT = (name) => `ターゲットは${name}です。`;
  /** 役職が動いたあとの処刑人の整合を取る（fixServants と同じ考え方）。墓地に入った処刑人はターゲットを失い、墓地から引いた/コピーした処刑人には、自分以外からランダムで新しいターゲットが決まる。新しく決まった人のIDの配列を返す */
  ONW.fixExecutioners = (g) => {
    const m = (g.execTargets = g.execTargets || {}), fresh = [], ids = (g.players || []).map((p) => p.id);
    Object.keys(m).forEach((k) => { if (String(k).startsWith("g:")) delete m[k]; });
    ids.forEach((id) => {
      if (g.currentRoles[id] !== ONW.ROLE.EXECUTIONER) { delete m[id]; return; }
      if (m[id] && ids.includes(m[id]) && m[id] !== id) return;
      const c = ids.filter((x) => x !== id);
      if (!c.length) { delete m[id]; return; }
      m[id] = c[Math.floor(Math.random() * c.length)];
      fresh.push(id);
    });
    return fresh;
  };
  /** グレムリンの選択 [コピー元, コピー先]。最終盤面でその人がグレムリンを持っていて、選択が記録されているときだけ（選択は役職の持ち主に記録され、カードについて動く） */
  ONW.gremlinPick = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.GREMLIN && (g.gremlinPicks || {})[id]) || null;
  ONW.gremlinPairs = (g) => (g.players || []).map((p) => [p.id, ONW.gremlinPick(g, p.id)]).filter(([, pk]) => pk && pk.length === 2);
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
  ONW.MAD_KIND = [ONW.ROLE.MADMAN, ONW.ROLE.MAD_SEER, ONW.ROLE.CULTIST, ONW.ROLE.BLACK_CAT];

  // 役職の詳細情報。夜の行動順（wakeOrder）が小さいほど先に起きる。
  // wakeOrder が null の役職は夜に何もしない。
  // name / desc は元データ（state.js の ROLE_NAME / 役職説明）からそのまま転記。
  /** 変化役 → 変化先の候補（このオンライン版で使える役職のうち、同じ陣営のもの） */
  ONW.TRANSFORM_GROUPS = {
    [ONW.ROLE.LIGHT_APOSTLE]: [ONW.ROLE.VILLAGER, ONW.ROLE.SEER, ONW.ROLE.ROBBER, ONW.ROLE.RELIC_ROBBER, ONW.ROLE.TROUBLEMAKER, ONW.ROLE.INSOMNIAC, ONW.ROLE.MASON, ONW.ROLE.STRAW_DOLL, ONW.ROLE.CAT_SIDHE, ONW.ROLE.MERLIN, ONW.ROLE.WOLF_DREAMER, ONW.ROLE.WOLF_MARKED, ONW.ROLE.BAKER, ONW.ROLE.STAR, ONW.ROLE.CHICKEN, ONW.ROLE.NEWSPAPER, ONW.ROLE.MAYOR, ONW.ROLE.VISITOR],
    [ONW.ROLE.DARK_AVATAR]: [ONW.ROLE.WEREWOLF, ONW.ROLE.BIG_WOLF, ONW.ROLE.LONE_WOLF, ONW.ROLE.WHITE_WOLF, ONW.ROLE.TOFU_WOLF, ONW.ROLE.FORGETFUL_WOLF, ONW.ROLE.ASSASSIN, ONW.ROLE.MADMAN, ONW.ROLE.MAD_SEER, ONW.ROLE.CULTIST, ONW.ROLE.BLACK_CAT],
    [ONW.ROLE.SILVER_SHADOW]: [ONW.ROLE.TANNER, ONW.ROLE.LOVE_TANNER, ONW.ROLE.GOD, ONW.ROLE.OPPORTUNIST, ONW.ROLE.AMANOJAKU, ONW.ROLE.FREETER, ONW.ROLE.SERVANT, ONW.ROLE.WINNER, ONW.ROLE.LOSER, ONW.ROLE.DOPPELGANGER, ONW.ROLE.EXECUTIONER, ONW.ROLE.GREMLIN],
  };

  /** 新聞配達員の新聞に載せない役職（変化役は試合開始時に別の役職になるので、そもそも夜に能力を使わない） */
  ONW.NEWS_HIDDEN = [ONW.ROLE.LIGHT_APOSTLE, ONW.ROLE.DARK_AVATAR, ONW.ROLE.SILVER_SHADOW];
  /** 夜に能力を実際に使った役職を新聞に記録する（同じ役職は1回だけ。使った人の名前は残さない） */
  ONW.newsNote = (g, role) => {
    if (!g || !role || ONW.NEWS_HIDDEN.includes(role)) return;
    g.newsRoles = g.newsRoles || [];
    if (!g.newsRoles.includes(role)) g.newsRoles.push(role);
  };

  /** 道連れ系(めくれたとき別の人を巻き込む役職)。vote.js の resolveChain が参照する */
  ONW.TOMO_ROLES = [ONW.ROLE.STRAW_DOLL, ONW.ROLE.CAT_SIDHE, ONW.ROLE.BLACK_CAT];

  /** メイヤーの投票数（ルーム設定 g.mayorVoteCount。本家と同じ 2〜10票、初期値2票） */
  ONW.mayorVotes = (g) => Math.max(2, Math.min(10, Math.round(Number(g && g.mayorVoteCount) || 2)));
  /** 役職の説明文。メイヤーだけは、いまのルーム設定の票数を入れて返す（それ以外は ROLE_INFO の desc そのまま） */
  ONW.roleDesc = (role, g) => {
    const d = (ONW.ROLE_INFO[role] || {}).desc || "";
    return role === ONW.ROLE.MAYOR && g ? d.replace("ルーム設定の票数", `ルーム設定の票数（このルームでは${ONW.mayorVotes(g)}票）`) : d;
  };

  ONW.ROLE_INFO = {
    [ONW.ROLE.WEREWOLF]:     { name: "人狼",         team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。他の人狼を確認できます。" },
    [ONW.ROLE.BIG_WOLF]:     { name: "大狼",         team: ONW.TEAM.WOLF,    wakeOrder: 11, desc: "人狼陣営。他の人狼系を確認できます。さらに墓地カードをすべて確認できます。" },
    [ONW.ROLE.LONE_WOLF]:    { name: "一匹狼",       team: ONW.TEAM.WOLF,    wakeOrder: 12, desc: "人狼陣営。相方が分からず、他の人狼からも見えません。" },
    [ONW.ROLE.WHITE_WOLF]:   { name: "白狼",         team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。占い結果が村人と出る人狼です。相方や狂信者からは人狼として見えます。" },
    [ONW.ROLE.TOFU_WOLF]:    { name: "豆腐の人狼",   team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。1票でも投票されると、処刑される人と同時にめくられ、メンタル崩壊で死亡します。" },
    [ONW.ROLE.FORGETFUL_WOLF]: { name: "忘却の人狼", team: ONW.TEAM.WOLF,    wakeOrder: null, desc: "人狼陣営。自分のことを村人だと思い込んでいる人狼です。占い結果は人狼です。本人視点では村人として夜を認識します。" },
    [ONW.ROLE.ASSASSIN]:     { name: "アサシン",     team: ONW.TEAM.WOLF,    wakeOrder: 10, desc: "人狼陣営。他の人狼を確認できます。追放されたら、その場で自分以外の全員から1人を選びます。選んだ相手がマーリンなら、人狼陣営の逆転勝利です。" },
    [ONW.ROLE.WOLF_DREAMER]: { name: "狼夢人",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。自分のことを人狼だと思い込んでいる村人です。占い結果は狼夢人です。夜は相方のいない一人の人狼として認識します。" },
    [ONW.ROLE.WOLF_MARKED]:  { name: "狼憑き",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。自認はただの村人ですが、占われると人狼結果が出ます。" },
    [ONW.ROLE.MERLIN]:       { name: "マーリン",     team: ONW.TEAM.VILLAGE, wakeOrder: 25, desc: "村人陣営。墓地以外の人狼を知っています。狂人が人狼に昇格する場合も人狼として見えます。アサシンに選ばれると人狼陣営の逆転勝利になるので、マーリンCOはしてはいけません。" },
    [ONW.ROLE.CHICKEN]:      { name: "チキン",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜の能力はありません。1票でも入るとショック死（追放扱い）します。最後まで生き残っていると、村人陣営以外が勝つはずの結果を、村人陣営の逆転勝利に変えます（恋人になっている場合は逆転できません）。" },
    [ONW.ROLE.BAKER]:        { name: "パン屋",       team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜の能力はありません。最終盤面にパン屋がいると、昼のタイマー開始時に「パンが焼けました」と全員に知らされます（誰がパン屋かは分かりません）。" },
    [ONW.ROLE.NEWSPAPER]:    { name: "新聞配達員",   team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜の能力はありません。最終盤面に新聞配達員がいると、昼になって変化公開のあと、昨夜能力を使った役職の名前が新聞として全員に知らされます（プレイヤー名は分かりません）。闇の化身・光の使徒・銀色の影は載りません。新聞は「情報確認」からいつでも見返せます。" },
    [ONW.ROLE.MAYOR]:        { name: "メイヤー",     team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "村人陣営。夜の能力はありません。昼の投票で、ルーム設定の票数ぶん投票できます（最終盤面でメイヤーを持っている人の1票が、その票数ぶんとして数えられます）。票数はルーム設定で全員が見られます。" },
    [ONW.ROLE.VISITOR]:      { name: "訪問者",       team: ONW.TEAM.VILLAGE, wakeOrder: 7, desc: "村人陣営。夜に自分以外の1人を訪問します。訪問した相手の役職は分かりません。相手には、朝のあとの待機時間に「訪問してきた人」のカードが表になって知らされます（訪問先は役職のカードについていくので、役職が入れ替わると、訪問してきた人も入れ替わります）。" },
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
    [ONW.ROLE.FREETER]:      { name: "フリーター",   team: ONW.TEAM.THIRD,   wakeOrder: 6, desc: "第三陣営。夜に1人を選んで就職し、その人の初期役職がわかります。就職先が勝利したら自分も追加で勝利します（役職が入れ替わっても、就職先はカードについていきます）。朝のあとの待機時間に、あなたに就職したフリーターのカードが表になります。" },
    [ONW.ROLE.SERVANT]:      { name: "従者",         team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。試合開始時にランダムなご主人（他の参加者）に仕えます。夜のはじめにご主人のカードがめくれて、誰がご主人か分かります。ご主人が追放されそうになったら、ご主人の代わりに追放されます（ご主人が従者・てるてる坊主・一目惚れしてるてるのとき、従者が昼のうちに死亡しているとき、従者自身がご主人のときは身代わりになりません）。ご主人が勝利したら自分も追加で勝利します（追放されていても勝てます）。役職が入れ替わっても、ご主人はカードについていきます。墓地に入ると主従関係は消え、墓荒らしで引いた人には新しいご主人がランダムで決まり、朝に分かります（怪盗で奪った場合は役職名だけ分かり、ご主人は分かりません）。ご主人には昼のはじめに「あなたの従者がいるようです。」と伝わります（誰が従者かは分かりません）。" },
    [ONW.ROLE.EXECUTIONER]:  { name: "処刑人", team: ONW.TEAM.THIRD, wakeOrder: null, desc: "第三陣営。試合開始時にランダムなターゲット（他の参加者）が決まり、夜のはじめにターゲットのカードがめくれて🎯の印が出ます。ターゲットが追放されたら、あなたの勝利です（他の陣営の勝敗とは別に、追加で勝利します）。ターゲットは役職のカードについてきて、墓地に入った処刑人はターゲットを失い、墓地から引いた人・コピーした人には新しいターゲットが決まります。" },
    [ONW.ROLE.GREMLIN]:      { name: "グレムリン", team: ONW.TEAM.THIRD, wakeOrder: 54, desc: "第三陣営。夜に2人を「コピー元 → コピー先」の順に選びます。朝の処理（墓荒らし → ドッペルゲンガー → 怪盗 → グレムリン → いたずらっ子の順）で、その時点のコピー元の役職がコピー先にコピーされます（コピー元は変化しません）。コピー元の役職は朝に分かります。フリーター・従者などは就職先・ご主人ごとコピーされ、ドッペルゲンガーをコピーすると村人になります。選んだ2人のどちらかが最終的に勝利すれば、あなたも追加で勝利します。" },
    [ONW.ROLE.WINNER]:       { name: "勝ち組",       team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。夜の能力はありません。最終的にこの役職であれば、ほかの勝敗に関係なく追加で勝利します（死亡・追放されていても勝てます）。恋人になっていても、最終的に勝ち組なら、恋人が敗北しても勝ち組のみ勝利します。" },
    [ONW.ROLE.LOSER]:        { name: "負け組",       team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。夜の能力はありません。最終的にこの役職であれば、ほかの勝敗に関係なく敗北します（神の祝福でも敗北）。恋人になっていても、最終的に負け組なら、恋人が勝利しても負け組のみ敗北します。" },
    [ONW.ROLE.AMANOJAKU]:    { name: "天邪鬼",       team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "第三陣営。村人陣営が勝たなければ追加勝利です。" },
    [ONW.ROLE.OPPORTUNIST]:  { name: "オポチュニスト", team: ONW.TEAM.THIRD, wakeOrder: null, desc: "第三陣営。夜の能力はありません。最後まで追放されなければ、ほかの勝敗に追加で勝利します。" },
    [ONW.ROLE.DOPPELGANGER]: { name: "ドッペルゲンガー", team: ONW.TEAM.THIRD, wakeOrder: 52, desc: "第三陣営（コピーするまでは無陣営）。夜に1人を選び、朝の処理でその人の「その時点の役職」をコピーして、その役職になります（選ばれた人の役職は変わりません）。ドッペルゲンガーをコピーした場合は村人になります。コピーした役職に夜の能力があれば朝のうちに使え、マーリン・共有者などの夜の情報も朝に分かります。コピーした後の陣営・勝利条件はコピーした役職に従い、誰もコピーできなかったときは勝利できません。" },
    [ONW.ROLE.DRUNK]:        { name: "酔っ払い",     team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "重複役職。議論時間の半分が過ぎるまで、自分の役職も夜の情報も分かりません。覚めると最終的な役職を知り、能力があれば1回使えます。" },
    [ONW.ROLE.LOVER]:        { name: "恋人",         team: ONW.TEAM.THIRD,   wakeOrder: null, desc: "重複役職。配役の枚数には数えず、2人1組でランダムな参加者（CPU含む）に重なります。夜に相方のカードが❤️でめくれて、お互いが分かります。相方が追放・道連れ・無理心中になると、自分も心中で死亡します。恋人の二人とも死ななければ恋人陣営の勝利で、恋人以外は敗北です（死亡した恋人は、元の陣営が勝っても敗北します）。投票結果でめくれるとき、恋人のカードの右上に丸いハートが付きます。" },
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
      roleCounts: { werewolf: 2, big_wolf: 0, dark_avatar: 0, madman: 0, mad_seer: 0, cultist: 0, villager: 2, seer: 1, robber: 1, relic_robber: 0, troublemaker: 0, insomniac: 0, mason: 0, light_apostle: 0, tanner: 0, silver_shadow: 0, love_tanner: 0, god: 0, opportunist: 0, straw_doll: 0, cat_sidhe: 0, black_cat: 0, amanojaku: 0, lone_wolf: 0, white_wolf: 0, tofu_wolf: 0, forgetful_wolf: 0, merlin: 0, assassin: 0, wolf_dreamer: 0, wolf_marked: 0, baker: 0, star: 0, freeter: 0, servant: 0, winner: 0, loser: 0, doppelganger: 0, executioner: 0, gremlin: 0, chicken: 0, newspaper: 0, mayor: 0, visitor: 0 },
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
