/**
 * 探偵の亡霊（マイクラ版 DETECTIVE_GHOST を正とする）: 第三陣営 / deck 181 / wiki order 182 / 発案: 狐餅（役職チェックリストで確認）/ 元ネタ: オリジナル。
 *
 * ・能力（マイクラ版 vote.js の resolveDetectiveGhostSelections / buildDetectiveGhostResultLines）:
 *   投票終了時に自身が死亡していた場合に発動する。プレイヤーを1人選び、その人の最終役職を
 *   テキスト入力で推理する。当たれば追加勝利（勝者に追加され、陣営名「探偵の亡霊」が付く。
 *   マイクラ版の追加勝利ループ＝賞金稼ぎ・キューピッドと同じ並び。Web版は vote.js の set() の
 *   テレパシストの直後に接続）。
 * ・発動する死: 追放・連鎖（道連れ・噛殺・爆殺・恨殺・身代わり・王国滅亡など）・昼の始めの呪殺・
 *   独裁処刑など、「死んでいた」こと全般。ただし次は発動しない（マイクラ版の除外）:
 *   - 後追いで死んだ場合（マイクラ版 followDeathIds: 心中・従者の後追い・背徳者の後追い・
 *     キューピッドの後追い・糸紡ぎの後追い・テレパシストの後追い。Web版は chainKind / deadKind で判定）
 *   - 保安官に撃たれて死んだ場合（マイクラ版の死因 "sheriff"。Web版は deadKind "shot"＝保安官・ヴァニティの執行）
 *   - 無理心中で死んだ場合（マイクラ版の死因 "love_tanner"。Web版は kind "love"）
 *   封印は関係しない（探偵の亡霊は封印対象ではない＝封印されることがない）。
 * ・入力の判定（作者メモ＋マイクラ版 normalizeDetectiveGhostGuess）:
 *   マイクラ版の正規化は「空白を除く＋小文字化」だけだが、作者メモで「カタカナ・ひらがな・漢字は問わない。
 *   漢字の誤字はミス」と明示されたため、Web版は読み仮名でも判定する: 入力を空白除去＋カタカナ→ひらがな化し、
 *   対象の最終役職の「役職名（そのまま）」か「読み仮名（wiki-data.js の kana）」のどちらかに一致すれば正解。
 *   違う単語（誤字）は一致しないのでミスになる（同音の別漢字は読みが同じため正解扱いになる＝解釈点）。
 * ・選ぶタイミング（Web版の解釈）: マイクラ版は勝敗判定の直前（連鎖の解決後）にフォームを出す。
 *   Web版も名探偵の推理フェーズと同じ作りで、連鎖と魔界公爵会議が終わったあと・勝敗判定の直前に
 *   本人だけに入力画面を出し、他の全員には待ち表示（「結果を待っています…」）を出す。複数いる場合は同時に聞く
 *   （マイクラ版も Promise.all で並行）。CPU・通信が切れた人は自動（対象ランダム＋推理は候補役職からランダム。
 *   マイクラ版のオフライン分岐と同じ）。デバッグで推理先を指定できる（debug.js の RAND_KINDS）。
 *   作者メモの「めくれるとき『はてな』で見えなくなる効果」は、入力が終わるまで結果発表自体が始まらず、
 *   探偵の亡霊のカードもまだめくれない（＝伏せたまま）ことで再現する（名探偵・賞金稼ぎの Web版の作りと同じ）。
 * ・演出（作者メモ）: 結果発表で全員のカードがめくれたあと・負けた人が吹っ飛ぶ前に、血文字の
 *   ダイニングメッセージ風の紙が出る（stageResult フック。勝負師の紙と同じ場所＝playLadder の直前）。
 *   紙には推理の文が血文字で1文字ずつ書かれ、正解なら血の「正解」判子が押される。
 * ・結果情報（情報確認。第6バッチ共通指示）: マイクラ版 buildDetectiveGhostResultLines の文をそのまま使う:
 *   「探偵の亡霊{名前}は{対象}の役職を「{入力}」と推理し、成功/失敗していました。」（net.js の res.detectiveGhostLines → ui.js）。
 * ・記録: game.detectiveGhostTarget[亡霊] = 対象 / game.detectiveGhostGuessText[亡霊] = 入力した文 /
 *   game.detectiveGhostSuccess[亡霊] = true|false（マイクラ版と同じ名前。試合ごとの結果なので役職には付随しない）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / shufflerEligibleRoles / cosplayerEligibleRoles /
 *   PERSONA の仮面候補の除外リストで確認）: 銀色の影 = 入る（groups "transform:silver_shadow": 41。コピリスト 40 の次）/
 *   光の使徒・闇の化身 = 入らない / 模倣 = できない（第三陣営）/ コスプレ = 入らない（村人陣営のみ）/
 *   シャッフラー = 山札に入る（マイクラ版の除外リストに無い）/ ペルソナ = 仮面候補に入る（除外リストに無い）。
 * ・封印対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に DETECTIVE_GHOST は無い。封印対象は 114 役のまま）。
 * ・ハッキング: 対象にも思い込み先にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。受動役職なので
 *   思い込んだ人は夜に何もしない（早とちり・多重人格の思い込みと同じ）。判定は最終役職で行うので、
 *   本物が別の役職と思い込まされていても通常どおり発動する。
 * ・乞食には取れない（マイクラ版 isBeggarSwapExcludedTarget。Web版 beggar.js の除外リストに事前登録済みで自動で効く）。
 *   テレパシストの「死なないと勝てない役職」リストにも事前登録済み（DEATH_REQUIRED_TO_WIN_ROLES）。
 * ・見張り番: マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES には入っていない（偶数人と同じ扱い。夜に行動記録が
 *   残らないので、見張られても「行動していませんでした」になる）。
 * ・実績（マイクラ版 stats.js / wiki-data.js）: first_detective_ghost「死んでも事件は終わらない」/
 *   win_detective_ghost「墓場に真実あり」/ detective_ghost_guess_detective「ベイカー街の亡霊」
 *   （名探偵と解答して勝利）。
 * ・CPU: 生存中は特別な行動はない（推理は死亡後に自動分岐）。騙りは結果なしのCOだけ（cpuLie）。
 */
(function (ONW) {
  const T = "detective_ghost";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const R_ = () => ONW.ROLE.DETECTIVE_GHOST;

  /** 役職名の読み仮名（wiki/js/wiki-data.js の kana から転記。入力判定で「ひらがな・カタカナでもよい」を実現するため） */
  const KANA = { light_apostle:"ひかりのしと",villager:"むらびと",seer:"うらないし",robber:"かいとう",relic_robber:"はかあらし",troublemaker:"いたずらっこ",insomniac:"こうかくしゃ",mason:"きょうゆうしゃ",straw_doll:"わらにんぎょう",cat_sidhe:"ねこまた",merlin:"マーリン",wolf_dreamer:"おおかみゆめびと",wolf_marked:"おおかみつき",baker:"ぱんや",star:"スター",chicken:"チキン",newspaper:"しんぶんはいたついん",mayor:"メイヤー",visitor:"ほうもんしゃ",queen:"じょおう",tough_guy:"タフガイ",fox_marked:"きつねつき",keymaster:"かぎし",dictator:"どくさいしゃ",exchanger:"こうかんしゃ",penguin:"ペンギン",watchdog:"ばんけん",sheriff:"ほあんかん",cursed_one:"のろわれしもの",thief:"とうぞく",sense_seer:"かんかくのうらないし",princess:"ひめぎみ",libra:"てんびん",fake_seer:"にせうらないし",poet:"しじん",spy:"スパイ",cosplayer:"コスプレイヤー",major:"しょうさ",finger_reader:"ゆびよみ",gambler:"ギャンブラー",priest:"しんかん",fairy:"ようせいさん",aa:"えーえー",goranshin:"ごらんしん",steve:"スティーブ",icarus:"イカロス",election_manager:"せんきょかんりいいん",moses:"モーゼス",yomi:"よみ",carmen:"カルメン",knight:"きし",trailblazer:"かいたくしゃ",hokma:"ホクマー",bartender:"バーテンダー",psychologist:"しんりし",clone:"クローン",whimsical_seer:"きまぐれなうらないし",medium:"れいばいし",apprentice_seer:"みならいのうらないし",lookout:"みはりばん",agitator:"せんどうしゃ",bell_miko:"すずのみこ",donut_shop:"どーなつや",hayatochiri:"はやとちり",screw_gum:"スクリューガム",hunter:"ハンター",necromancer:"ネクロマンサー",counselor:"カウンセラー",ren:"レン",trap_master:"わなし",dark_avatar:"やみのけしん",werewolf:"じんろう",big_wolf:"たいろう",lone_wolf:"いっぴきおおかみ",white_wolf:"はくろう",tofu_wolf:"とうふのじんろう",forgetful_wolf:"ぼうきゃくのじんろう",assassin:"アサシン",wolf_king:"じんろうおう",mapo_wolf:"まーぼーのじんろう",cat_pumpkin:"ネコカボチャ",observer_wolf:"かんそくのじんろう",mind_wolf:"しんがんのじんろう",mimic_wolf:"もほうのじんろう",eraser_wolf:"まっしょうのじんろう",mirage_wolf:"しんきろう",silver_wolf:"ぎんろう",command_wolf:"とうそつのじんろう",curse_wolf:"じゅじゅつのじんろう",negi_wolf:"ねぎのじんろう",patch:"パッチ",madman:"きょうじん",mad_seer:"くるったうらないし",cultist:"きょうしんしゃ",black_cat:"くろねこ",exposed_madman:"ばくろきょうじん",muzzle_madman:"くちふうじのきょうじん",rebel_madman:"はんぎゃくのきょうじん",mad_queen:"くるったじょおう",black_wolf_madman:"くろこのきょうじん",mad_mayor:"くるっためいやー",seal_madman:"ふういんのきょうじん",mad_exchanger:"くるったこうかんしゃ",tenacious_madman:"しゅうねんのきょうじん",jester_madman:"どうけのきょうじん",smoke_madman:"えんまくのきょうじん",mad_priest:"くるったしんかん",rat_madman:"ねずみのきょうじん",ox_madman:"うしのきょうじん",tiger_madman:"とらのきょうじん",rabbit_madman:"うさぎのきょうじん",dragon_madman:"りゅうのきょうじん",snake_madman:"へびのきょうじん",horse_madman:"うまのきょうじん",sheep_madman:"ひつじのきょうじん",monkey_madman:"さるのきょうじん",rooster_madman:"にわとりのきょうじん",dog_madman:"いぬのきょうじん",boar_madman:"いのししのきょうじん",mad_agitator:"くるったせんどうしゃ",crazy_donut_shop:"くるったどーなつや",silver_shadow:"ぎんいろのかげ",tanner:"てるてるぼうず",love_tanner:"ひとめぼれしてるてる",god:"かみ",opportunist:"オポチュニスト",amanojaku:"あまのじゃく",freeter:"フリーター",servant:"じゅうしゃ",winner:"かちぐみ",loser:"まけぐみ",wraith:"しりょう",doppelganger:"ドッペルゲンガー",schrodinger_cat:"しゅれでぃんがーのねこ",executioner:"しょけいにん",gremlin:"グレムリン",pure_lover:"じゅんあいしゃ",evil_woman:"あくじょ",cupid:"キューピッド",heartbreaker:"はきょくし",shuffler:"シャッフラー",bounty_hunter:"しょうきんかせぎ",fox:"ようこ",fanatic:"はいとくしゃ",balancer:"バランサー",avenger:"ふくしゅうしゃ",prankster:"ゆかいはん",jester_bomber:"どうけのばくだんま",detective:"めいたんてい",demon_duke:"まかいこうしゃく",martyr:"じゅんしょくしゃ",predictor:"よそうや",reverser:"はんてんしゃ",lawyer:"べんごし",watcher:"せいかんしゃ",vanity:"ヴァニティ",beggar:"こじき",magical_girl:"まほうしょうじょ",matthias:"マティアス",daughter:"むすめちゃん",yokai_tanuki:"ようり",chesed:"ケセド",nanoka:"なのか",mitsuki_nanoka:"みつきなのか",long_night_moon:"ながよづき",rasetsu:"らせつ",agent:"だいこうしゃ",elfrinde:"エルフリンデ",hotaru:"ホタル",sam:"サム",mercenary:"ようへい",thread_spinner:"いとつむぎ",magician:"まほうつかい",wagerer:"しょうぶし",persona:"ペルソナ",multi_personality:"たじゅうじんかく",odd_one:"きすうびと",even_one:"ぐうすうびと",jester_ghost:"どうけのおんりょう",telepathist:"テレパシスト",detective_ghost:"たんていのぼうれい",copylist:"コピリスト" };

  const DG = {};
  /** 入力の正規化: 空白（全角含む）を除き、カタカナをひらがなに寄せ、小文字化する（マイクラ版 normalizeDetectiveGhostGuess の空白除去＋小文字化に、作者メモの表記ゆれ吸収を足したもの） */
  DG.normalize = function normalize(text) {
    return String(text ?? "").replace(/[\s\u3000]/g, "").replace(/[\u30A1-\u30F6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();
  };
  /** 読み仮名（無ければ null） */
  DG.kanaOf = function kanaOf(roleId) { return KANA[roleId] || null; };
  /** 入力 text が役職 roleId の名前か読み仮名に一致するか（正解判定） */
  DG.matches = function matches(text, roleId) {
    const n = DG.normalize(text);
    if (!n || !roleId) return false;
    const info = ONW.roles && ONW.roles.getInfo(roleId);
    if (info && info.name && n === DG.normalize(info.name)) return true;
    const k = DG.kanaOf(roleId);
    return !!k && n === DG.normalize(k);
  };
  /** 推理の候補役職（CPUの自動推理用。マイクラ版 detectiveRoleOptions: 初期役職＋墓地＋最終役職の集合。忘却の人狼・狼憑き・狐憑き・呪われし者がいれば村人、狼夢人がいれば人狼を足す） */
  DG.roleOptions = function roleOptions(g) {
    const set = new Set();
    (g.players || []).forEach((p) => { const r = g.initialRoles && g.initialRoles[p.id]; if (r) set.add(r); });
    (g.center0 || g.center || []).forEach((r) => { if (r) set.add(r); });
    Object.values(g.currentRoles || {}).forEach((r) => { if (r) set.add(r); });
    if (set.has("forgetful_wolf") || set.has("wolf_marked") || set.has("fox_marked") || set.has("cursed_one")) set.add("villager");
    if (set.has("wolf_dreamer")) set.add("werewolf");
    return ONW.sortByRoleOrder([...set]);
  };
  /** その人が死んでいるか（追放・連鎖・昼中死亡・公爵会議の死亡すべて） */
  DG.isDead = function isDead(g, id) {
    return (g.eliminated || []).includes(id) || (g.deadIds || []).includes(id) || (g.dukeDead || []).includes(id);
  };
  /**
   * 発動できる死か（マイクラ版 resolveDetectiveGhostSelections の deadGhosts の条件）:
   * 最終役職が探偵の亡霊で、死んでいて、後追い（followDeathIds）・保安官の執行（死因 "sheriff"）・
   * 無理心中（死因 "love_tanner"）のどれでもないこと
   */
  DG.qualifies = function qualifies(g, id) {
    if (!g.currentRoles || g.currentRoles[id] !== T) return false;
    if (!DG.isDead(g, id)) return false;
    const ck = (g.chainKind || {})[id], dk = (g.deadKind || {})[id];
    if (["follow", "lovers", "thread"].includes(ck)) return false;          // 連鎖の後追い・心中・糸紡ぎ後追い
    if (["follow", "lovers", "cupid", "fanatic", "thread"].includes(dk)) return false;   // 昼中の後追い・心中
    if (dk === "shot") return false;                                          // 保安官・ヴァニティの執行（マイクラ版 "sheriff"）
    if (ck === "love" || dk === "love") return false;                         // 無理心中（マイクラ版 "love_tanner"）
    return true;
  };
  /** まだ推理していない、発動できる探偵の亡霊（席順） */
  DG.pending = function pending(g) {
    return (g.players || []).map((p) => p.id).filter((id) => DG.qualifies(g, id) && !(g.detectiveGhostTarget || {})[id]);
  };
  /** 人間の入力を記録する（成功・失敗もここで決める。判定は対象の最終役職） */
  DG.record = function record(g, id, targetId, guessText) {
    g.detectiveGhostTarget = g.detectiveGhostTarget || {};
    g.detectiveGhostGuessText = g.detectiveGhostGuessText || {};
    g.detectiveGhostSuccess = g.detectiveGhostSuccess || {};
    g.detectiveGhostTarget[id] = targetId;
    g.detectiveGhostGuessText[id] = String(guessText ?? "");
    const actual = g.currentRoles && g.currentRoles[targetId];
    g.detectiveGhostSuccess[id] = DG.matches(guessText, actual);
  };
  /** 自動の推理を記録する（CPU・通信が切れた人。マイクラ版のオフライン分岐: 推理は役職そのもので判定） */
  DG.recordAuto = function recordAuto(g, id, targetId, guessedRoleId) {
    g.detectiveGhostTarget = g.detectiveGhostTarget || {};
    g.detectiveGhostGuessText = g.detectiveGhostGuessText || {};
    g.detectiveGhostSuccess = g.detectiveGhostSuccess || {};
    const info = ONW.roles && ONW.roles.getInfo(guessedRoleId);
    g.detectiveGhostTarget[id] = targetId;
    g.detectiveGhostGuessText[id] = info ? info.name : String(guessedRoleId || "");
    g.detectiveGhostSuccess[id] = !!guessedRoleId && guessedRoleId === (g.currentRoles && g.currentRoles[targetId]);
  };
  /** 自動で決める（CPU・通信が切れた人・ホストのスキップ）: 対象は自分以外からランダム（デバッグ指定があればそれ）、推理は候補役職からランダム（マイクラ版のオフライン分岐） */
  DG.autoPick = function autoPick(g, id) {
    const cands = (g.players || []).map((p) => p.id).filter((x) => x !== id);
    if (!cands.length) return;
    const pick = ONW.utils.randomChoice;
    let t = ONW.debug && ONW.debug.randTarget ? ONW.debug.randTarget(g, "detective_ghost", id) : null;
    if (!t || !cands.includes(t)) t = pick(cands);
    const opts = DG.roleOptions(g);
    DG.recordAuto(g, id, t, opts.length ? pick(opts) : null);
  };
  /** 追加勝利する探偵の亡霊（最終役職が探偵の亡霊で、推理が成功した人。マイクラ版の追加勝利ループ） */
  DG.extraWins = function extraWins(g) {
    return (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === T && (g.detectiveGhostSuccess || {})[id] === true);
  };
  /** 結果情報（情報確認）の行（マイクラ版 buildDetectiveGhostResultLines の文そのまま） */
  DG.lines = function lines(g, nmf) {
    const n = nmf || ((id) => nm(g, id));
    const out = [];
    (g.players || []).forEach((p) => {
      if (!g.currentRoles || g.currentRoles[p.id] !== T) return;
      const t = (g.detectiveGhostTarget || {})[p.id];
      if (!t) return;
      const guess = (g.detectiveGhostGuessText || {})[p.id] ?? "";
      out.push(`探偵の亡霊${n(p.id)}は${n(t)}の役職を「${guess}」と推理し、${(g.detectiveGhostSuccess || {})[p.id] ? "成功" : "失敗"}していました。`);
    });
    return out;
  };
  /** 結果発表の血文字の紙のデータ（net.js が res.detectiveGhostPapers に入れる） */
  DG.view = function view(g, nmf) {
    const n = nmf || ((id) => nm(g, id));
    return DG.lines(g, nmf).length ? (g.players || []).filter((p) => g.currentRoles && g.currentRoles[p.id] === T && (g.detectiveGhostTarget || {})[p.id]).map((p) => ({
      id: p.id, name: n(p.id), targetId: (g.detectiveGhostTarget || {})[p.id], target: n((g.detectiveGhostTarget || {})[p.id]),
      guess: (g.detectiveGhostGuessText || {})[p.id] ?? "", success: !!(g.detectiveGhostSuccess || {})[p.id],
    })) : [];
  };
  /** 実績（マイクラ版 stats.js と同じ条件） */
  DG.achievements = function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === T || cur === T) out.push("first_detective_ghost");
    if (cur === T && won) out.push("win_detective_ghost");
    if (cur === T && won && (g.detectiveGhostSuccess || {})[id] === true) {
      const t = (g.detectiveGhostTarget || {})[id];
      if (t && g.currentRoles && g.currentRoles[t] === "detective") out.push("detective_ghost_guess_detective");
    }
    return out;
  };
  ONW.detectiveGhost = DG;

  // ======================================================================
  //  推理の画面（クライアント側）。net.js が t:"ghostask" で呼ぶ。 d = { cands: [{ id, name }]（自分以外・席順） }
  //   上: 推理する相手を選ぶ（名前のボタン）/ 下: 役職名の入力欄（キーボード入力）＋「推理する」
  //   相手を選ぶと入力できる。空の推理でも送れる（マイクラ版のフォームはキャンセル＝空文字で失敗になる）
  //   送信すると ONW.net.ghostGuess({ target, text }) で送る。画面はホストからの t:"ghostask"(close) で閉じる
  // ======================================================================
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  DG.closeAsk = function closeAsk() { document.querySelectorAll(".dg-ask").forEach((e) => e.remove()); };
  DG.openAsk = function openAsk(d) {
    DG.closeAsk();
    const cands = d.cands || [];
    let target = null, sent = false;
    const root = document.createElement("div");
    root.className = "dg-ask";
    document.body.appendChild(root);
    function render() {
      root.innerHTML = `<div class="dg-ask__box"><h2>探偵の亡霊</h2>
        <p class="dg-hint">あなたは死亡しました。役職を推理する相手を1人選び、その人の<strong>最終役職</strong>を入力してください。<br>カタカナ・ひらがな・漢字のどれでも構いません（漢字の誤字はミスになります）。当たれば追加勝利です。</p>
        <div class="dg-cands">${cands.map((c) => `<button type="button" class="dg-cand${target === c.id ? " dg-cand--on" : ""}" data-t="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div>
        <input class="dg-input" type="text" placeholder="役職名を入力" value="${esc(root.querySelector(".dg-input") ? root.querySelector(".dg-input").value : "")}" ${target ? "" : "disabled"}>
        <button class="btn dg-ask__ok" type="button"${target && !sent ? "" : " disabled"}>${sent ? "推理しました" : "推理する"}</button></div>`;
      const inp = root.querySelector(".dg-input");
      if (inp && target) inp.focus();
    }
    root.addEventListener("click", (e) => {
      if (sent) return;
      const b = e.target.closest("[data-t]");
      if (b) { target = b.dataset.t; const v = root.querySelector(".dg-input"); const keep = v ? v.value : ""; render(); const inp = root.querySelector(".dg-input"); if (inp) inp.value = keep; return; }
      const ok = e.target.closest(".dg-ask__ok");
      if (ok && !ok.disabled && target) {
        sent = true;
        const inp = root.querySelector(".dg-input");
        const text = inp ? inp.value : "";
        render();
        ONW.net.ghostGuess({ target, text });
      }
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && target && !sent) { const ok = root.querySelector(".dg-ask__ok"); if (ok && !ok.disabled) ok.click(); }
    });
    render();
  };

  // ======================================================================
  //  結果発表の血文字の紙（全員の画面）。全員のカードがめくれ終わったあと・負けた人が吹っ飛ぶ前
  //  （stage.js の startResult が playLadder の直前に呼ぶ。勝負師の紙と同じ位置）。
  //   推理した探偵の亡霊ごとに1枚、ダイニングメッセージ風の紙が出て、推理の文が血文字で
  //   1画ずつ描くように少しゆっくり書かれる（書いた文字だけが見えてくる。se_reveal_text が3文字ごとに鳴る）。
  //   書き終わると、正解の紙には血の「正解」判子、外れの紙には血のにじんだ「外れ」が付く
  // ======================================================================
  function removePapers() { document.querySelectorAll(".dgp-wrap").forEach((e) => e.remove()); }
  function runPapers(R) {
    const res = R.res, papers = res.detectiveGhostPapers || [];
    if (!papers.length || res.abandoned) return;
    // 改行は文節の切れ目だけ（「役/職」みたいな単語の途中で割らない）。文節ごとにまとめて、間でのみ折り返す
    const segsOf = (x) => [`探偵の亡霊${x.name}は `, `${x.target}の役職を`, `「${x.guess}」と`, `推理しました。`];
    const texts = papers.map((x) => segsOf(x).join(""));
    const maxLen = Math.max(...texts.map((t) => [...t].length));
    const STEP = 150, HOLD = 1500, t0 = R.t;   // 1画ずつ血で描くように、少しゆっくり（従来は45msでポンと出ていた）
    const escC = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    R.later(() => {
      removePapers();
      const wrap = document.createElement("div"); wrap.className = "dgp-wrap";
      wrap.innerHTML = `<div class="dgp-dim"></div><div class="dgp-papers">${papers.map((x, i) => `<div class="tfp-paper dgp-paper"><div class="dgp-paper__h">ダイニングメッセージ</div><div class="dgp-paper__t" data-dgp="${i}">${segsOf(x).map((seg) => `<span class="dgp-seg">${[...seg].map((c) => `<span class="dgp-ch">${escC(c)}</span>`).join("")}</span>`).join("")}</div><div class="dgp-stamp${x.success ? " dgp-stamp--hit" : " dgp-stamp--miss"}" data-dgp-stamp="${i}">${x.success ? "正解" : "外れ"}</div></div>`).join("")}</div>`;
      document.body.appendChild(wrap);
    }, t0);
    for (let s = 0; s < maxLen; s++) {
      R.later(() => {
        document.querySelectorAll("[data-dgp]").forEach((el) => { const ch = el.querySelectorAll(".dgp-ch")[s]; if (ch) ch.classList.add("on"); });   // 書いた文字だけが、描かれて見えてくる
        if (ONW.sound && s % 3 === 0) ONW.sound.se("reveal_text");
      }, t0 + 350 + s * STEP);
    }
    const stamped = t0 + 350 + maxLen * STEP + 250;
    R.later(() => { document.querySelectorAll(".dgp-stamp").forEach((el) => el.classList.add("dgp-stamp--on")); if (ONW.sound) ONW.sound.se("dictator"); }, stamped);   // 判子の音は独裁処刑の打撃音で代用（奇数人の「拒絶」と同じ）
    const end = stamped + HOLD;
    R.later(() => { const w = document.querySelector(".dgp-wrap"); if (w) w.classList.add("dgp-out"); }, end);
    R.later(removePapers, end + 650);
    R.t = end + 650;
  }

  /** CPUの騙り（人狼・狂人などが探偵の亡霊を名乗る）: 結果は言えないので、名乗るだけ */
  function lieClaim(k, g, p, others, selfRole, co) { return { co, result: null }; }

  ONW.defineRole(T, {
    info: { deck: 181, name: "探偵の亡霊", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 66,
      desc: "第三陣営。夜の能力はありません。投票が終わった時点で自分が死亡していた場合、能力が発動し、プレイヤーを1人選んで、その人の最終役職をキーボードで入力して推理します。役職名を当てることができれば追加勝利します（カタカナ・ひらがな・漢字のどれで入力してもよく、漢字の誤字はミスになります）。後追い・心中・無理心中で死んだ場合と、保安官やヴァニティに撃たれて死んだ場合は発動しません。" },
    groups: { "transform:silver_shadow": 41 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる。コピリスト 40 の次）。光の使徒・闇の化身からは変化しない
    cpuLie: { role: T, weight: 3, order: 17, claim: lieClaim },
    stageResult: {
      detectiveGhost: { order: 1, run(R) { runPapers(R); } },
      clear() { removePapers(); },
    },
    achievements(g, id, won) { return DG.achievements(g, id, won); },
  });
})(window.ONW);
