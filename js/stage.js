/**
 * stage.js — ゲーム中ずっと出ている「カードのテーブル」と、その演出
 * ------------------------------------------------------------
 * #table は #app の外にあるので、画面が再描画されてもカードは作り直されず、
 * 裏返しや入れ替えのアニメが途切れない。ここで扱うもの:
 *   ・山札 / 墓地 / 各プレイヤーのカード（夜〜結果までずっと表示）
 *   ・占い師・怪盗: カードの裏面を選ぶ → 表になる / 実際に入れ替わる
 *   ・投票: カードを押して選び、「投票する」で確定
 *   ・結果: 票数 → つられた人のカードが表に → 全員のカードが表に → 結果発表
 *   ・変化公開: 古びた紙に書かれ、下の固定欄へ移動する
 * 進行ロジックは持たない（表示と操作の受け口だけ）。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const stage = {};
  const G = () => ONW.game;
  const esc = (s) => ONW.utils.esc(s);
  const $t = () => document.getElementById("table");

  let key = null;                     // 試合が変わったらテーブルを作り直す目印
  let deathMarks = [];                 // 「死亡」の札を付けた席（結果では外す）
  let dayKeys = [];
  let peekUp = {};                     // 朝のうちにめくれた席 → その面（待機時間になったら裏に戻す）
  let up = {}, dead = {}, badge = {}, glow = {}; // 表向きの役職 / 追放された席 / 票数などの札 / 光らせる札(大狼の目)
  const pickOf = (role) => { const d = ONW.roleDef(role); return d && d.stagePick ? d.stagePick : null; };   // 夜にカードを押して行動する役職の「選び方」(各役職ファイルの stagePick。なければ押して行動しない役職)
  let starKeys = [];                   // スター公開で札を付けた席
  let flashKeys = [];                  // 昼に酔いが覚めたスターを一時的に表にしている席
  let queenKeys = [];                  // 女王公開（待機時間）で札を付けた席
  let kingKeys = [];                   // 人狼王公開で札を付けた席
  let released = {}, chainPend = {};   // 連鎖の段で遅れて死ぬ席: 時間差が過ぎて「死亡」を出してよくなった席 / 予約済みの席（保安官の連鎖化）
  let shot = {}, shotAnim = {}, shotBooted = false;   // 保安官に撃たれた席（カードに銃痕とひび。カードはめくらない）/ いま撃たれた席（撃たれた瞬間の演出。再入室・観戦では出さない）
  let curse = {};                      // 妖狐: 呪殺された席（カードが🦊のまま灰色。待機時間から結果発表の直前まで）
  let kingFlashKeys = [];              // 昼に新しく人狼王になった人を一時的に表にしている席
  let queenFlashKeys = [];             // 昼に新しく分かった女王を一時的に表にしている席
  let jobKeys = [];                    // 就職先の画面で、フリーターのカードに札を付けた席
  let mindKeys = [];                   // 心眼の人狼が見抜いた相手のカードに札を付けた席（昼の演出。数秒で裏に戻る）
  let senseKeys = {};                  // 感覚の占い師が感じ取った相手のカードに札を付けた席 → 気配の種類（village / wolf / mad / third / lover。昼の演出。数秒で裏に戻る）
  let asn = {};                        // アサシンの演出: by(暗殺者) / aim(狙う) / slash(斬る) / hit(マーリン) / miss(外れ)
  let bnt = {};                        // 賞金稼ぎの演出: by(賞金稼ぎ) / pick(選ばれたカードが手配書に) / hit(狼マーク) / miss(バツマーク)
  let veil = {};                       // 結果発表: アサシン・賞金稼ぎ本人の画面で、同時にめくれた別のアサシン・賞金稼ぎのカードを「？」のままにしておく席（その人の演出で出るまで本当の役職を見せない）。true = 「？」 / "down" = 裏返している最中
  let dkb = {};                        // 魔界公爵追放会議の票数バッジ(黒)にする席
  let alm = {};                        // 従者の身代わり: ご主人のカードが「めくれそうになる」席（絶対に表にならない）
  let shin = {};                       // 無理心中で道連れになった席（死因の演出用）
  let gx = {};                         // 神の演出: 席 → "descend"（神降臨）/ "spark"（祝福: 神のキラキラ）/ "blow"（吹き飛ばされる）/ "win"（祝福で勝つ人）
  let curv = {}, fqv = {}, tbv = {}, tbh = {};   // tbv: 開拓者の2回目の面（席 → true。めくれたあと、もう一度めくれて運命の名前の面）/ tbh: 結果発表で1回目にめくれたときは運命の枠を隠す席（js/roles/village/trailblazer.js の stageResult）
   // fqv: 先代女王の面（席 → true。女王のカードが「先代女王」の名前で見える。queen.js の stageResult）
  let _fq0 = 0;                       // 呪われし者: 2回目に裏返ったあとの面（席 → true）。あれば、カードが人狼陣営の色（赤）の文字になる
  let catv = {};                       // シュレディンガーの猫: 2回目に裏返ったあとの面（席 → { team: village / wolf / third / none / loop, sfx: "(+役職名)" }）。あれば、猫のカードがその陣営の色の文字になる
  const CAT = "schrodinger_cat";   // シュレディンガーの猫
  const TB = "trailblazer";   // 開拓者（めくれたあと、もう一度めくれて運命の面 "trailblazer@destruction" など）
const CUR = "cursed_one";   // 呪われし者（吊られてめくれたあと、もう一度めくれて赤色の名前＝人狼陣営の面 "cursed_one@wolf"。js/roles/village/cursed_one.js の stageResult）
  const WOLF_MARK = "__wolf";
  const CUPID_MARK = "__cupid";   // キューピッドの演出に出る「💘」の印（役職名は出さない）
  const LOVE_MARK = "__love";   // 恋人の相方に見える「❤️」の印（役職名は出さない）
  const BREAK_MARK = "__break";   // 破局師に見える「💔」の印（壊した恋人のペアのカード。役職名は出さない）
  const KEEP_MARK = "__keep";   // 悪女に見えるキープの「♡」の印（役職名は出さない。恋人ではない）
  const SELF_LOVE = "__selflove";   // 酔いが覚めた恋人本人のカードが「恋人」へめくれた面
  const DUO_MARK = "__duo";     // 人狼の🐺と恋人の❤️の両方が付く人（上に🐺、下に❤️）
  const TARGET_MARK = "__target";   // 処刑人に見えるターゲットの「🎯ターゲット」の印（役職名は出さない）
  const AVENGER_MARK = "__avenger";   // 復讐者に見える、復讐対象の「🔪復讐相手」の印（役職名は出さない。朝、復讐者本人の画面だけ）
  /** カードの役職名の改行（7文字以上の役職。改行の場所は指定。各行は中央に揃える＝長い行の真ん中に短い行が来る）。マイクラ版にある7文字以上の役職がすべて入っている */
  const NAME_BREAKS = {
    "見習いの占い師": ["見習いの", "占い師"], "コスプレイヤー": ["コスプ", "レイヤー"], "狂ったメイヤー": ["狂った", "メイヤー"], "ネクロマンサー": ["ネクロ", "マンサー"],
    "オポチュニスト": ["オポチュ", "ニスト"], "スクリューガム": ["スクリュー", "ガム"], "狂ったドーナツ屋": ["狂った", "ドーナツ屋"], "ドッペルゲンガー": ["ドッペル", "ゲンガー"],
    "一目惚れしてるてる": ["一目惚れ", "してるてる"], "シュレディンガーの猫": ["シュレ", "ディンガー", "の猫"],
  };
  const clen = (t) => Array.from(String(t || "")).length;
  /** 役職名を HTML に（改行の指定があれば <br> でつなぐ） */
  const breakHtml = (name) => (NAME_BREAKS[name] ? NAME_BREAKS[name].map((x) => esc(x)).join("<br>") : esc(name));
  /** カードの役職名の <b>: 4文字以下（改行指定の行が最長4文字以下も）は今までと同じ文字サイズ。最長行が5文字・6文字なら、改行せず1行に収まるよう文字サイズを小さくする（tb-n5 / tb-n6。css/style.css）。
   *  cls に tb-cat を渡すとシュレディンガーの猫用の小さめの文字（サイズ指定は tb-cat が優先）。inner: 名前のあとに同じ <b> の中へ足す HTML */
  const nameB = (name, cls, inner) => {
    const ls = NAME_BREAKS[name], n = ls ? Math.max(...ls.map(clen)) : clen(name), c = [];
    if (ls) c.push("tb-br");
    if (cls) c.push(cls); else if (n === 5) c.push("tb-n5"); else if (n === 6) c.push("tb-n6");
    return `<b${c.length ? ` class="${c.join(" ")}"` : ""}>${breakHtml(name)}${inner || ""}</b>`;
  };
  const FOXSEE_MARK = "__foxsee";   // 背徳者に見える「🦊」の印（役職名は出さない。妖狐の気配）
  const DEAD_PRE = "__dead:";   // 呪殺された妖狐の連鎖で死んだ人の面（役職名のところが「心中」「後追い」の文字）
  const deadMark = (label) => DEAD_PRE + label;
  const FOXX_MARK = "__foxx";   // 妖狐投票で追放された妖狐の「🦊 追放」の面
  const FOX_MARK = "__fox";   // 呪殺された妖狐の「🦊」の面（待機時間にカードが裏返る）
  const TANUKI_MARK = "__tanuki";   // 呪殺された妖狸の「たぬきマーク」の面（作者指定で🦊ではなく🦝＋「呪殺」。待機時間にカードが裏返る）
  const KEYOPEN_MARK = "__keyopen";   // 鍵師: 鍵のかかっていない「🔓」の面（役職名は出さない）
  const BLANK_MARK = "__blank";   // 抹消の人狼: 真っ白のカード（役職名も印も何も書かれていない面。抹消された相手のカードがめくれたとき）
  const BLANKX_MARK = "__blankx";   // 抹消の人狼: 抹消に失敗したとき（鍵のかかった対象）の面。🔒だけ出す
  const KEYLOCK_MARK = "__keylock";   // 鍵師: 鍵のかかった「🔒」の面
  const KEYTURN_MARK = "__keyturn";   // 🔓に🔑が差し込まれてまわる面（鍵をかける途中）
  const KEYTURNU_MARK = "__keyturnu"; // 🔒に🔑が差し込まれてまわる面（鍵をはずす途中）
  const SEAL_MARK = "__seal";   // 封印の狂人: 封印のお札が貼られた面（封印された人の失敗・封印された通知・封印の狂人が封印した相手のカード）
  const ELFRINDE_MARK = "__elfseal";   // エルフリンデ: 封印の鎖と魔法陣が貼られた面（御札ではなく鎖と魔法陣。封印された人の失敗・通知・エルフリンデが封印した相手のカード）
  const DARKFALL_MARK = "__darkfall";   // 魔法少女: 闇堕ちしたときに本人だけに見せる面（黒い背景に赤い「闇落ち」の文字。待機時間・酔い覚めの闇堕ちで使う）
  const DAUGHTER_MARK = "__daughter";   // マティアス／娘ちゃん: 娘ちゃんになったカードに出る「👧」の印（朝のめくり・待機時間の本人のめくりで使う。役職名は出さない）
  const SHIELD_MARK = "__shield";   // 傭兵: 護衛対象のカードに出る「🛡️」の印（朝に傭兵本人の画面でだけめくれる。役職名は出さない）
  const THREAD_MARK = "__thread";   // 糸紡ぎ: ペアのカードに出る「🧵」の印（朝に糸紡ぎ本人の画面でだけめくれ、白い糸でつながる。役職名は出さない）
  const FLAT_MARK = "__flat";   // なのか／長夜月: 長夜がついたカードに出る「♭」の印（作者指定。朝に長夜月本人の画面でだけめくれる。役職名は出さない）
  const COFFIN_MARK = "__coffin";   // なのか／羅刹: 愛する人のカードに出る「⚰️」の印（作者指定。朝に羅刹本人の画面でだけめくれる。役職名は出さない）
  const COFFEE_PRE = "__coffee@";   // ケセド: コーヒータイムの面（"__coffee@秒数"。☕ ＋ 酔っ払いの背景の茶色・白バージョン ＋ カウントダウン。待機時間にケセドと渡された人の目線だけで使う）
  const KEY_MARKS = [KEYOPEN_MARK, KEYLOCK_MARK, KEYTURN_MARK, KEYTURNU_MARK];
  const HACK_MARK = "__hack";   // 銀狼に見える、ハッキング対象の「⚠️」の印（役職名は出さない）
  const MUTE_MARK = "__mute";   // 口封じの狂人に見える、口封じされた人の「🤐」の印（役職名は出さない）
  const BONE_MARK = "__bone";   // 番犬に見える飼い主の「🦴」の印（役職名は出さない）
  const MASTER_MARK = "__master";   // 従者に見えるご主人の「👑ご主人」の印（役職名は出さない）
  let lov = {}, shuf = {}, kp = {}, wf = {}, bd = {}, bdCk = {};                       // 結果でめくれた恋人のカードに付ける、右上の丸いハート（夜は共有者・神のカードに付ける）。bdCk = カクテルで酔った人のバッジ（🍺ではなく🍸。バーテンダー）
  let loveMate = null;                // 夜: 自分の恋人の相方 { id, mode }
  const BNT = "__bnt";   // 賞金稼ぎに選ばれたカードの手配書（"__bnt@状態@役職" の形）
  const SENSE_PRE = "__sense@";   // 感覚の占い師: 感じ取った気配の面（"__sense@village" / wolf / mad / third / lover。役職名は出さない）
  const SENSE_FACE = { village: ["🌿", "村人"], wolf: ["🐺", "人狼"], mad: ["🌀", "狂気"], third: ["✨", "第三陣営"], lover: ["❤️", "恋人"] };   // 気配ごとの印と一言（札の「👁 気配」と合わせて「〇〇の気配」と読む）
  const UNK_MARK = "__unk";   // アサシンが選んでいる間、めくれた人のカードに出す「？」（役職は見せない）
  let nightKeys = [];                  // 夜の始まりに開いたカード（神・大狼）。夜時間が終わるまで裏に戻さない
  let held = {};                       // 呪殺の演出(妖狐・心中・後追い)で表にしているカード: 酔い覚め・昼の公開などの「あとで自動で伏せる」処理で裏返さない
  let busy = false;                   // 演出中は操作を受け付けない
  let seq = false;                    // 結果演出を開始済みか
  let specShown = {}, specBusy = false; // 観戦者: 各席に今見せている役職 / 入れ替え演出中
  let timers = [], paperTimers = [];
  const CHAIN_STEP_MS = 1700;   // 連鎖の1段ぶんの間（撃たれた瞬間の演出 約1秒 + 余韻）
  const later = (fn, ms) => { const h = setTimeout(fn, ms); timers.push(h); return h; };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; document.querySelectorAll(".gx-screen").forEach((n) => n.remove()); };
  // 神の祝福: 画面全体に、星形のキラキラが降りそそぐ（結果が終わるまで）
  function gxStars() {
    if (document.querySelector(".gx-screen")) return;
    const box = document.createElement("div"); box.className = "gx-screen";
    const GLY = ["✦", "✧", "✦", "★", "✧", "✶"], COL = ["#fff6c8", "#ffe28a", "#ffffff", "#ffd45e", "#fff0a8"];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("span"); s.className = "gx-star"; s.textContent = GLY[i % GLY.length];
      s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;font-size:${10 + Math.random() * 26}px;color:${COL[i % COL.length]};--d:${1.2 + Math.random() * 1.8}s;--r:${Math.random() * 120 - 60}deg;animation-delay:${(Math.random() * 2.4).toFixed(2)}s;`;
      box.appendChild(s);
    }
    document.body.appendChild(box);
  }

  const VISIBLE = () => [ONW.PHASE.ONLINE_NIGHT, ONW.PHASE.ONLINE_MORNING, ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE, ONW.PHASE.ONLINE_RESULT];
  const ph = (g) => (g.phase === ONW.PHASE.ONLINE_SPECTATE ? g.specPhase : g.phase);   // 観戦者は本当のフェーズで判断する
  const graveN = (g) => ((g.isSpectator || hostWatching(g)) && g.specInfo ? g.specInfo.center.length : g.graveCount || 0);
  const hostWatching = (g) => !!(g.hostSpec && ONW.net.isHost);

  /** 席の一覧。自分が先頭。観戦のホストは全員、観戦者はCO欄の名簿から */
  function roster(g) {
    if (hostWatching(g)) return (g.others || []).map((p) => ({ id: p.id, name: p.name }));
    if (g.others && !g.isSpectator) return [{ id: ONW.net.myId(), name: g.myName || "あなた", me: true }, ...g.others];
    return (g.boardView || []).map((p) => ({ id: p.id, name: p.name }));
  }
  stage.hasTable = (g) => VISIBLE().includes(ph(g)) && roster(g).length > 0;

  // ---------------------------------------------------------
  // 土台（一度だけ作る）
  // ---------------------------------------------------------
  const seatHtml = (k, label, cls) => `
    <div class="tb-seat ${cls || ""}" data-k="${k}">
      <div class="tb-card"><div class="tb-inner"><div class="tb-back"><div class="tb-shot"><svg viewBox="0 0 100 100" aria-hidden="true"><g class="tb-crack"><path d="M50 50 L44 41 L46 33 L38 24 L40 14 L33 4 L34 -8"/><path d="M50 50 L58 43 L57 34 L66 28 L65 17 L73 9"/><path d="M50 50 L61 52 L68 47 L79 51 L85 44 L98 46"/><path d="M50 50 L58 60 L56 69 L66 76 L64 88 L72 98 L71 108"/><path d="M50 50 L42 59 L44 68 L35 74 L36 86 L27 94"/><path d="M50 50 L39 52 L33 58 L22 56 L15 63 L3 61"/><path d="M50 50 L41 45 L31 46 L24 38 L12 40"/><path d="M38 24 L28 25 L21 18"/><path d="M66 28 L76 31 L83 26"/><path d="M66 76 L76 73 L82 80"/><path d="M35 74 L26 70 L19 74"/></g><polygon class="tb-burst" points="50,40 55,43 61,41 59,47 64,51 58,54 60,60 53,57 49,62 46,56 39,58 42,52 37,48 44,47 43,41"/><circle class="tb-ring" cx="50" cy="50" r="5.6"/><circle class="tb-hole" cx="50" cy="50" r="4"/></svg></div></div><div class="tb-front"></div></div><div class="tb-bullet"><i></i></div><div class="tb-drunk"><span class="tb-beer">🍺</span><span class="tb-drunk-n"></span></div><div class="tb-coffee"><span class="tb-coffee-ico">☕</span><span class="tb-coffee-n"></span></div><div class="tb-marks"><div class="tb-wf">🐺</div><div class="tb-lov">❤</div><div class="tb-kp">♡</div><div class="tb-shuf">🔀</div><div class="tb-bd">🍺</div></div></div>
      <div class="tb-name">${label}</div><div class="tb-badge"></div>
    </div>`;
  function build(g, list) {
    const av = (n) => (ONW.account.avatarMap[n] ? ONW.account.avatarHtml(n, null, "av--xs") : "");
    const graves = Array.from({ length: graveN(g) }, (_, i) => seatHtml(`g:${i}`, `墓地${i + 1}`, "tb-grave")).join("");
    const players = list.map((p) => seatHtml(`p:${p.id}`, `${av(p.name)}${esc(p.name)}`, p.me ? "me" : "")).join("");
    const el = $t();
    el.innerHTML = `<div class="tb-table">
      <div class="tb-row tb-center">
        <div class="tb-seat tb-pile"><div class="tb-card"><i></i><i></i><i></i></div><div class="tb-name">山札</div></div>
        ${graves}
      </div>
      <div class="tb-row tb-players">${players}</div>
    </div>`;
    let dtK = null, dtAt = 0;   // デバッグ: ホストが酔っ払い(未覚醒)のカードをダブルタップすると、その人の酔いが即座に覚める
    el.onclick = (e) => {
      const s = e.target.closest(".tb-seat[data-k]"); if (!s) return;
      const k = s.dataset.k, now = Date.now(), g = G();
      if (k.startsWith("p:") && ONW.net.isHost && g.debugOn && g.phase === ONW.PHASE.ONLINE_DAY) {
        if (dtK === k && now - dtAt < 450) { dtK = null; if (ONW.net.debugSober(k.slice(2))) return; } else { dtK = k; dtAt = now; }
      }
      stage.click(k);
    };
  }

  // ---------------------------------------------------------
  // 今の操作モード（夜に選ぶ / 投票で選ぶ / なし）
  // ---------------------------------------------------------
  function mode(g) {
    if (busy || g.isSpectator || g.isDead || hostWatching(g)) return null;
    if (g.phase === ONW.PHASE.ONLINE_NIGHT && !g.nightDone && !!pickOf(g.actRole)) return { type: "night", role: g.actRole };
    if (((g.phase === ONW.PHASE.ONLINE_MORNING && !g.settling) || (g.phase === ONW.PHASE.ONLINE_DAY && g.abilityOpen)) && g.morningChain && g.morningChainReady && !g.morningChainDone) return { type: "morning", role: g.morningChain };   // 墓荒らしが交換した後の役職の能力を朝に使う
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.dictOpen) return { type: "dictate" };   // 独裁者の昼能力: 独裁処刑にする相手のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.icarusOpen) return { type: "icarus" };   // イカロスの昼能力: 票を分け与える相手のカードを押して選ぶ（生きている自分以外の1人。もう分け与えた人は選べない）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.fairyOpen) return { type: "barrier" };   // 妖精さんの昼能力: バリアを付与する相手のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.yomiOpen) return { type: "yomi" }; // 黄泉の昼能力: 状態を断ち切る相手のカードを押して選ぶ（生きている人から1人。自分も選べる）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.goranshinOpen) return { type: "goranshin" };   // 御乱心の昼能力: 投票先を変える相手のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.agentOpen && g.agentPick) return { type: "agent" };   // 代行者（思い込み）の昼能力: 守る対象のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.thiefOpen) return { type: "steal" };   // 盗賊の昼能力: 票数を盗む相手のカードを押して選ぶ（生きている自分以外の1人。0票の人も選べる＝失敗して使用済み）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.sheriffOpen) return { type: "shoot" };   // 保安官の昼能力: 撃つ相手のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.exchOpen) return { type: "exchange" };   // 交換者の昼能力: 票数を入れ替える2人のカードを押して選ぶ（生きている人。自分も選べる）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.predOpen) return { type: "predict" };   // 予想屋の昼能力: 最終的に死亡すると思う人のカードを押して選ぶ（死亡した人も含めて何人でも。自分も。もう一度押すと解除。タップのたびに保存）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.libraOpen) return { type: "libra" };   // 天秤の昼能力: 投票対象にする2人のカードを押して選ぶ（生きている人。自分も選べる）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.mindOpen) return { type: "mind" };   // 心眼の人狼の昼能力: 最終役職を見抜く相手のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_DAY && g.rejobOpen) return { type: "rejob" };   // フリーターの昼能力: 再就職先のカードを押して選ぶ（生きている自分以外の1人）
    if (g.phase === ONW.PHASE.ONLINE_VOTE && g.strawPick) return { type: "straw" };   // わら人形: めくれた瞬間に、道連れにする相手を選ぶ
    if (g.phase === ONW.PHASE.ONLINE_VOTE && !g.voted) return { type: "vote" };
    return null;
  }
  /** イカロス: この人に分け与えた回数が上限（g.icarusMax。ふつう1・カルメンに囁かれたら2）に達しているか */
  function icarusUsedUp(g, id) { return (g.icarusGiven || []).filter((x) => x === id).length >= (g.icarusMax || 1); }
  function pickable(k, m, g) {
    if (!m) return false;
    if (k.startsWith("c:")) return (m.type === "night" || m.type === "morning") && (m.role === "cosplayer" || m.role === "nanoka");   // コスプレイヤー・なのか: 山札から出た3枚だけ押せる
    const me = ONW.net.myId(), isP = k.startsWith("p:");
    if (m.type === "straw") return isP && g.strawPick.some((c) => c.id === k.slice(2));   // 選べるのは、まだめくれていない人だけ
    if (m.type === "predict") return isP;   // 予想屋: 死亡した人も含めて誰でも選べる（自分も。2of4-b）
    if (isP && dead[k]) return false;   // 死亡した人には投票できない
    if (m.type === "yomi") return isP;   // 黄泉: 生きている人なら誰でも（自分も）
    if (m.type === "exchange" || m.type === "libra") return isP;   // 交換者・天秤: 生きている人なら誰でも（自分も）
    if (m.type === "vote" && isP && g.dukeIds) return g.dukeIds.includes(k.slice(2));   // 魔界公爵追放会議: 生存者のカードだけ押せる（自分のカードも押せる）
    if (m.type === "vote" && isP && g.libraIds && !g.libraIds.includes(k.slice(2))) return false;   // 天秤で制限された投票: 選ばれた2人のカードしか押せない（ホストも検査する）
    if (m.type === "icarus" && isP && icarusUsedUp(g, k.slice(2))) return false;   // イカロス: もう使い切った人（ふつう1回・カルメンに囁かれたら2回）のカードは光らせない・押せない（選べる相手だけが光る。ホストも targets で同じ検証をする）
    const pk = pickOf(m.role);
    if (isP) return (k.slice(2) !== me || !!(pk && pk.self)) && !(pk && pk.players === false);   // シャッフラーだけは自分のカードも選べる(stagePick.self)   // 墓荒らしが選べるのは墓地だけ(stagePick.players === false)
    if (m.type === "vote") return false;
    // 墓地: 占い師・狂った占い師(設定枚数まで) / 墓荒らし(1枚) = stagePick.graves
    return !!(pk && pk.graves);
  }

  // ---------------------------------------------------------
  // 描画の反映（再描画のたびに呼ばれる。DOMは作り直さずクラスだけ更新）
  // ---------------------------------------------------------
  function faceHtml(role, k) {
    if (String(role).startsWith(BNT + "@")) {   // 手配書: 顔写真の位置に ？(選ばれた) → 🐺(人狼判定だった) / ❌(違った)
      const [, st, base] = String(role).split("@");
      const mark = st === "hit" ? "🐺" : st === "miss" ? "❌" : "？";
      return `<div class="tb-bnt tb-bnt--${st}"><i class="tb-bnt-h">WANTED</i><div class="tb-bnt-face"><span>${mark}</span></div><b>${st === "pick" ? "&nbsp;" : esc(ONW.roles.getInfo(base).name)}</b></div>`;   // 役職名は、狼マーク/バツマークが出たあとに初めて出す（選ばれた直後の「？」の間は出さない）
    }
    if (String(role).startsWith(SENSE_PRE)) { const sk = String(role).slice(SENSE_PRE.length), sf = SENSE_FACE[sk] || SENSE_FACE.village; return `<div class="tb-wolfmark tb-sense tb-sense--${SENSE_FACE[sk] ? sk : "village"}"><span>${sf[0]}</span><small>${esc(sf[1])}</small></div>`; }
    if (role === SEAL_MARK) return `<div class="tb-wolfmark tb-seal"><span class="tb-ofuda"><i>封</i><i>印</i><s></s></span></div>`;
    if (role === ELFRINDE_MARK) return `<div class="tb-wolfmark tb-elfseal"><span class="tb-mcircle"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="35"/><polygon points="50,16 62,39 86,39 67,54 74,80 50,65 26,80 33,54 14,39 38,39"/><circle cx="50" cy="50" r="4"/></svg></span><span class="tb-mchain">⛓</span></div>`;   // エルフリンデの封印: 紫の魔法陣（ゆっくり回る）＋鎖
    if (role === DARKFALL_MARK) return `<div class="tb-wolfmark tb-darkfall"><span>闇落ち</span></div>`;   // 魔法少女の闇堕ち（黒い面に赤い文字。色は tb-team-darkfall）
    if (String(role).startsWith(COFFEE_PRE)) return `<div class="tb-wolfmark tb-coffee-face"><span class="tb-coffee-big">☕</span><span class="tb-coffee-sec">${esc(String(role).slice(COFFEE_PRE.length))}</span></div>`;   // ケセドのコーヒー（☕とカウントダウン。背景は tb-team-coffee の茶×白）
    if (role === BLANK_MARK) return `<div class="tb-wolfmark tb-blank"></div>`;
    if (role === BLANKX_MARK) return `<div class="tb-wolfmark tb-key tb-key--locked"><span>🔒</span></div>`;
    if (role === KEYOPEN_MARK) return `<div class="tb-wolfmark tb-key"><span>🔓</span></div>`;
    if (role === KEYLOCK_MARK) return `<div class="tb-wolfmark tb-key tb-key--locked"><span>🔒</span></div>`;
    if (role === KEYTURN_MARK) return `<div class="tb-wolfmark tb-key tb-key--turn"><span>🔓</span><i>🔑</i></div>`;
    if (role === KEYTURNU_MARK) return `<div class="tb-wolfmark tb-key tb-key--turn tb-key--turnu"><span>🔒</span><i>🔑</i></div>`;
    if (role === UNK_MARK) return `<div class="tb-wolfmark tb-unk">？</div>`;
    if (role === BREAK_MARK) return `<div class="tb-wolfmark tb-love tb-break">💔</div>`;
    if (role === LOVE_MARK) return `<div class="tb-wolfmark tb-love">❤️</div>`;
    if (role === CUPID_MARK) return `<div class="tb-wolfmark tb-love">💘</div>`;
    if (role === DAUGHTER_MARK) return `<div class="tb-wolfmark tb-love">👧</div>`;
    if (role === SHIELD_MARK) return `<div class="tb-wolfmark tb-shield"><span>🛡️</span><small>護衛対象</small></div>`;   // 傭兵の護衛対象（朝に傭兵本人の画面でだけ）
    if (role === THREAD_MARK) return `<div class="tb-wolfmark tb-thread"><span>🧵</span><small>ペア</small></div>`;   // 糸紡ぎのペア（朝に糸紡ぎ本人の画面でだけ。白い糸も一緒に出る）
    if (role === FLAT_MARK) return `<div class="tb-wolfmark tb-flat"><span>♭</span><small>長夜</small></div>`;
    if (role === COFFIN_MARK) return `<div class="tb-wolfmark tb-coffin"><span>⚰️</span><small>愛する人</small></div>`;
    if (role === KEEP_MARK) return `<div class="tb-wolfmark tb-love tb-keep">♡</div>`;
    if (role === SELF_LOVE) return `<div class="tb-wolfmark tb-master tb-love"><span>❤️</span><small>恋人</small></div>`;
    if (role === AVENGER_MARK) return `<div class="tb-wolfmark tb-avenger"><span>🔪</span><small>復讐相手</small></div>`;
    if (role === TARGET_MARK) return `<div class="tb-wolfmark tb-target"><span>🎯</span><small>ターゲット</small></div>`;
    if (role === FOXSEE_MARK) return `<div class="tb-wolfmark tb-foxsee">🦊</div>`;
    if (String(role).startsWith(DEAD_PRE)) { const lb = String(role).slice(DEAD_PRE.length); return `<div class="tb-wolfmark tb-follow${lb.length > 3 ? " tb-follow--long" : ""}"><span>${esc(lb)}</span></div>`; }
    if (role === FOX_MARK) return `<div class="tb-wolfmark tb-fox"><span>🦊</span><small>呪殺</small></div>`;
    if (role === TANUKI_MARK) return `<div class="tb-wolfmark tb-fox tb-tanuki"><span>🦝</span><small>呪殺</small></div>`;   // 妖狸の呪殺はたぬきマーク（作者指定）
    if (role === FOXX_MARK) return `<div class="tb-wolfmark tb-fox"><span>🦊</span><small>追放</small></div>`;
    if (role === MUTE_MARK) return `<div class="tb-wolfmark tb-mute"><span>🤐</span><small>口封じ</small></div>`;
    if (role === HACK_MARK) return `<div class="tb-wolfmark tb-hack"><span>⚠️</span><small>ハッキング</small></div>`;
    if (role === BONE_MARK) return `<div class="tb-wolfmark tb-bone"><span>🦴</span><small>飼い主</small></div>`;
    if (role === MASTER_MARK) return `<div class="tb-wolfmark tb-master"><span>👑</span><small>ご主人</small></div>`;
    if (role === DUO_MARK) return `<div class="tb-wolfmark tb-duo"><span>🐺</span><span>❤️</span></div>`;
    if (role === WOLF_MARK) return `<div class="tb-wolfmark">🐺</div>`;   // 狂信者に見える「人狼」の印（役職名は出さない）
    if (String(role).startsWith(CAT + "@")) {   // 2回目に裏返ったシュレディンガーの猫: 陣営の色の文字（第三陣営の役職が参照先なら、灰色のまま「(+役職名)」が付く）
      const [, team, sfx] = String(role).split("@");
      return `${ONW.ui.roleIcon(CAT, "role-icon--face")}${nameB(ONW.roles.getInfo(CAT).name, "tb-cat")}${sfx ? `<span class="tb-catframe">${breakHtml(String(sfx).replace(/^\(\+/, "").replace(/\)$/, ""))}</span>` : ""}`;   // 第三陣営の猫: 参照先の役職を、模倣の人狼の模倣先と同じ枠で出す（猫の名前も枠の中も本体の役職名より小さめ）
    }
    if (String(role).startsWith("queen@")) return `${ONW.ui.roleIcon("queen", "role-icon--face")}${nameB(String(role).slice(6) || "先代女王")}`;   // 先代女王 / 初代女王 / 二代目女王…（村人陣営の色）
    if (String(role).startsWith(TB + "@")) return `${ONW.ui.roleIcon(TB, "role-icon--face")}${nameB(ONW.trailblazer.fateName(String(role).slice(TB.length + 1)))}<span class="tb-mimic tb-fate">${breakHtml(ONW.roles.getInfo(TB).name)}</span>`;   // 2回目に裏返った開拓者: 運命の名前（壊滅など）＋「開拓者」の枠
    if (String(role).startsWith(CUR + "@")) return `${ONW.ui.roleIcon(CUR, "role-icon--face")}${nameB(ONW.roles.getInfo(CUR).name)}`;   // 2回目に裏返った呪われし者（赤色の名前。色は tb-team-wolf）
    const info = ONW.roles.getInfo(role);
    const mt = role === "mimic_wolf" || role === "trailblazer" ? mimicTarget(k) : role === "clone" ? cloneTarget(k) : null;   // 模倣の人狼: 役職名の下に、模倣先の役職を枠で出す / 開拓者: 運命を枠で出す / クローン: 思い込んでいる役職を枠で出す（作者メモ。枠の中の役職名は、その役職の通常の改行の仕方＝breakHtml で出す。余分な改行は足さない）
    return `${ONW.ui.roleIcon(role, "role-icon--face")}${nameB(info.name)}${mt ? `<span class="tb-mimic${role === "trailblazer" ? " tb-fate" : role === "clone" ? " tb-clone" : ""}">${breakHtml(mt)}</span>` : ""}`;
  }
  /** 席キー(p:ID / g:番号)のカードの、クローンが思い込んでいる役職名（無ければ null）。思い込み先は結果発表・観戦者の画面にだけ届く(g.cloneView) */
  function cloneTarget(k) {
    const g = G(), r = k && g && g.cloneView ? g.cloneView[k] : null;
    return r && ONW.ROLE_INFO[r] ? ONW.ROLE_INFO[r].name : null;
  }
  /** 席キー(p:ID / g:番号)のカードの模倣先の役職名（無ければ null）。模倣先は本人・結果発表・観戦者の画面にだけ届く(g.mimicView) */
  function mimicTarget(k) {
    const g = G(), r = k && g && g.mimicView ? g.mimicView[k] : null;
    if (ONW.trailblazer && ONW.trailblazer.isView(r)) return tbh[k] && !tbv[k] ? null : ONW.trailblazer.viewName(r) || null;   // 結果発表で1回目にめくれたあと（tbh）は運命の枠を出さない（2回目のめくれで運命が出る）   // 開拓者の運命（"fate:destruction" → 壊滅）
    return r && ONW.ROLE_INFO[r] ? ONW.ROLE_INFO[r].name : null;
  }
  /** 酔いが覚めるまでの残り秒数（本家の「酔いが覚めるまで: N秒」）。出さない状況なら null。
   *  覚めるのは昼タイマーが半分になった瞬間なので、残り - 半分 で数える。本人の画面だけ・昼の間だけ */
  function drunkLeft(g) {
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.myRole !== "drunk" || g.soberRole || g.isDead || g.isSpectator || hostWatching(g)) return null;
    const day = g.timers && g.timers.day;
    if (g.remain == null || !day) return null;
    const n = g.remain - Math.floor(day / 2);
    return n > 0 ? n : null;
  }
  /** 毎秒のタイマー更新で、自分のカードの数字だけを書き換える（全体の再描画はしない） */
  stage.drunkTick = function () {
    const g = G(), el = $t();
    if (!el) return;
    const s = el.querySelector(`.tb-seat[data-k="p:${ONW.net.myId()}"]`);
    if (!s) return;
    const n = drunkLeft(g);
    s.classList.toggle("drunk", n !== null);
    s.classList.toggle("cocktail", n !== null && !!g.myCocktail);   // バーテンダー: カクテルの酔いは🍸＋ライム色
    const beer = s.querySelector(".tb-beer");
    if (beer) beer.textContent = g.myCocktail ? "🍸" : "🍺";
    const t = s.querySelector(".tb-drunk-n");
    if (t) t.textContent = n === null ? "" : String(n);
  };
  /** コーヒータイムが終わるまでの残り秒数（ケセド）。出さない状況なら null。
   *  終わるのは g.remain が g.coffeeUntil（ホストが待機時間に届けた値）以下になった瞬間。本人の画面だけ・昼の間だけ */
  function coffeeLeft(g) {
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.coffeeUntil == null || g.isDead || g.isSpectator || hostWatching(g)) return null;
    if (g.remain == null) return null;
    const n = g.remain - g.coffeeUntil;
    return n > 0 ? n : null;
  }
  stage.coffeeLeft = coffeeLeft;   // net.js の送信ガード（コーヒータイム中は発言・COを送らない）が使う
  /** 毎秒のタイマー更新で、自分のカードのコーヒーの数字だけを書き換える（drunkTick と対） */
  stage.coffeeTick = function () {
    const g = G(), el = $t();
    if (!el) return;
    const s = el.querySelector(`.tb-seat[data-k="p:${ONW.net.myId()}"]`);
    if (!s) return;
    const n = coffeeLeft(g);
    s.classList.toggle("coffee", n !== null);
    const t = s.querySelector(".tb-coffee-n");
    if (t) t.textContent = n === null ? "" : String(n);
  };
  // ---------------------------------------------------------
  // 天秤（上皿天秤）: 投票が制限されているとき、選ばれた2人のカードを左右の皿に載せる。結果発表では票数バッジのあと、
  //   つられた（票数が多い）ほうの皿だけが下がる（同数なら両方下がる・誰も票がなければ水平のまま）。演出が終わるまでカードはめくれない（めくる時刻を後ろにずらす）。
  // ---------------------------------------------------------
  let libraTilt = null;   // 結果発表の天秤の傾き: "level"(水平) / "a" / "b"(その皿が下がる) / "both"(両方下がる) / "none"(誰も票がない=水平のまま)
  /** 結果の票数（最終）から、下がる皿を決める。a・b は res.libra.ids の順 */
  function libraTiltOf(res) {
    const L = res && res.libra; if (!L) return null;
    const c = (id) => ((res.counts || []).find((x) => x.id === id) || {}).c || 0;
    const a = c(L.ids[0]), b = c(L.ids[1]);
    return !a && !b ? "none" : a === b ? "both" : a > b ? "a" : "b";
  }
  /** いま皿に載せる2人のID（なければ null）と傾き */
  function libraWant(g) {
    if (g.phase === ONW.PHASE.ONLINE_VOTE && g.libraIds && g.libraIds.length === 2) return { ids: g.libraIds, tilt: "level" };
    if (g.phase === ONW.PHASE.ONLINE_RESULT && g.result && g.result.libra && g.resultStage !== "sheet") return { ids: g.result.libra.ids, tilt: libraTilt || "level" };
    return null;
  }
  /** 盤面に上皿天秤を出して、選ばれた2人のカードを皿に載せる（なければ元の席に戻す）。何度呼んでも同じ結果になる */
  function libraSync(g) {
    const el = $t(); if (!el) return;
    const want = libraWant(g), sc = el.querySelector(".libra-scale");
    if (!want) {
      if (sc) { sc.querySelectorAll(".tb-seat[data-k]").forEach((seat) => { const ph = el.querySelector(`.tb-seat-ph[data-ph="${seat.dataset.k}"]`); if (ph) ph.replaceWith(seat); else { const row = el.querySelector(".tb-players"); if (row) row.appendChild(seat); } }); sc.remove(); }
      return;
    }
    let box = sc;
    if (!box) {
      box = document.createElement("div"); box.className = "libra-scale";
      box.innerHTML = `<div class="libra-pans"><div class="libra-pan" data-i="0"><div class="libra-slot"></div><div class="libra-dish"></div></div><div class="libra-pan" data-i="1"><div class="libra-slot"></div><div class="libra-dish"></div></div></div><div class="libra-top"><div class="libra-beam"></div></div><div class="libra-post"></div><div class="libra-base"></div>`;
      const row = el.querySelector(".tb-players"); if (!row || !row.parentNode) return;
      row.parentNode.insertBefore(box, row);
    }
    want.ids.forEach((id, i) => {
      const k = `p:${id}`, seat = el.querySelector(`.tb-seat[data-k="${k}"]`), slot = box.querySelector(`.libra-pan[data-i="${i}"] .libra-slot`);
      if (!seat || !slot || seat.parentNode === slot) return;
      if (!seat.parentNode.classList.contains("libra-slot")) { const ph = document.createElement("div"); ph.className = "tb-seat-ph"; ph.dataset.ph = k; seat.parentNode.replaceChild(ph, seat); }
      slot.appendChild(seat);
    });
    const t = want.tilt;
    box.dataset.tilt = t;
    box.classList.toggle("dn-a", t === "a" || t === "both"); box.classList.toggle("dn-b", t === "b" || t === "both");
  }


  // ---------------------------------------------------------
  // コスプレイヤー: 山札から出た3枚をテーブルの中央（山札・墓地の下）に並べる。夜・朝の連鎖・昼能力（酔い覚め）で、押して選ぶ（c:0〜c:2）。
  //   朝の演出（cosplayer.js の stageMorning）: 選ばなかった2枚が裏返って山札へ戻り、選んだカードが自分の席へ飛んで置かれる。
  // ---------------------------------------------------------
  let cosKeep = false;   // 朝の演出中は、押せる状態でなくても3枚を残す
  function cosWant(g) {
    if (g.isSpectator || g.isDead || hostWatching(g) || !Array.isArray(g.cosplayCards) || !g.cosplayCards.length) return null;
    const P = ONW.PHASE;
    if (g.phase === P.ONLINE_NIGHT && !g.nightDone && (g.actRole === "cosplayer" || g.actRole === "nanoka")) return g.cosplayCards;
    if (((g.phase === P.ONLINE_MORNING && !g.settling) || (g.phase === P.ONLINE_DAY && g.abilityOpen)) && (g.morningChain === "cosplayer" || g.morningChain === "nanoka") && g.morningChainReady && !g.morningChainDone) return g.cosplayCards;
    return null;
  }
  function cosClear() {
    const el = $t(), row = el && el.querySelector(".tb-cosplay");
    if (row) row.remove();
    [0, 1, 2].forEach((i) => { delete up[`c:${i}`]; delete glow[`c:${i}`]; if (ONW.sound) ONW.sound.forgetFlip(`c:${i}`); });   // 席要素が消えるので、めくれ記録も消す（次に出たとき「裏戻り」と誤検出しない）
  }
  /** 3枚の席を作る（すでに同じ並びがあれば何もしない）。faceUp: すぐ表にする（朝の演出） / しない: 山札から飛び出してめくれる */
  function cosEnsure(cards, faceUp) {
    const el = $t(), tbl = el && el.querySelector(".tb-table"), center = tbl && tbl.querySelector(".tb-center");
    if (!center) return null;
    let row = tbl.querySelector(".tb-cosplay");
    const sig = cards.join(",");
    if (row && row.dataset.s === sig) { if (faceUp) cards.forEach((r, i) => { up[`c:${i}`] = r; }); return row; }
    if (row) row.remove();
    [0, 1, 2].forEach((i) => { if (ONW.sound) ONW.sound.forgetFlip(`c:${i}`); });   // 作り直した席は初見扱い（めくれ記録を消してから基準を覚え直す）
    row = document.createElement("div");
    row.className = "tb-row tb-cosplay"; row.dataset.s = sig;
    row.innerHTML = cards.map((r, i) => seatHtml(`c:${i}`, "&nbsp;", "tb-cos")).join("");
    center.insertAdjacentElement("afterend", row);
    const pile = center.querySelector(".tb-pile .tb-card");
    cards.forEach((r, i) => {
      const k = `c:${i}`;
      if (faceUp) { up[k] = r; return; }
      const card = row.querySelector(`[data-k="${k}"] .tb-card`);
      if (pile && card && card.animate) {   // 山札のいちばん上から1枚ずつ出てくる
        const a = pile.getBoundingClientRect(), b = card.getBoundingClientRect();
        card.animate([{ transform: `translate(${a.left - b.left}px,${a.top - b.top}px) scale(.8)`, opacity: 0.2 }, { transform: "translate(0,0) scale(1)", opacity: 1 }], { duration: 520, delay: i * 200, easing: "ease-out", fill: "backwards" });
      }
      later(() => { if (!row.isConnected) return; up[k] = r; paint(G()); }, 560 + i * 200);   // 出てきたあと、めくれて役職が見える
    });
    if (!faceUp) later(() => { if (row.isConnected && ONW.sound) ONW.sound.se("deal"); }, 520);   // SE: 山札から3枚が配られる（最初の1枚が着地する瞬間に1回だけ。3枚で1回の配布として集約し、直後のめくり音とずらす）
    return row;
  }
  function cosRow(g) {
    const want = cosWant(g);
    const hold = g.phase === ONW.PHASE.ONLINE_MORNING && g.morningReveal && g.morningReveal.kind === "cosplay" && g.cosAnim !== "done";   // 朝の演出が始まるまで（めくれた3枚をそのまま残す）
    if (!want && !cosKeep && !hold) { cosClear(); return; }
    if (want) cosEnsure(want, false);
    else if (g.morningReveal && g.morningReveal.cards) cosEnsure(g.morningReveal.cards, true);
  }
  stage.cosplay = { ensure: cosEnsure, clear: cosClear, keep(v) { cosKeep = !!v; } };

  // ---------------------------------------------------------
  // 選挙管理委員（js/roles/village/election_manager.js）: 投票の時間中、「だれがだれに投票したか」をカードからカードへの矢印で見せる。
  //   ホストが見える人にだけ送る { t: "emvotes", votes: { 投票者ID: 投票先ID } }（net.js emSync）を g.emVotes に入れ、ここで描く。
  //   矢印は状態そのもの: 投票先を変えれば付け替わり、未投票に戻せば消え、変えない限りそのまま残る。チャット・情報確認には何も残さない。
  //   投票の画面以外（g.phase が投票でない）・見えない人（g.emVotes なし）では何も描かない。席は data-k で引くので、煙幕の並び替え・天秤の皿でも正しい席を指す。
  //   カードが動いたとき（並び替え・皿・画面の大きさ）は、描いている間だけ requestAnimationFrame で位置を見て描き直す。
  // ---------------------------------------------------------
  const EM_NS = "http://www.w3.org/2000/svg";
  let emSig = "", emRaf = 0;
  const emHue = (id) => { let h = 7; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return (h * 47) % 360; };
  /** 矢印にする票（投票の画面で、見える人・観戦者にだけ届く g.emVotes。空でも「見える人」なので {} を返し、最後の1本が消えるアニメを描ける） */
  function emWant(g) {
    if (!g || g.phase !== ONW.PHASE.ONLINE_VOTE || !g.emVotes) return null;
    return g.emVotes;
  }
  const EM_OUT_MS = 650;   // 消えるアニメ（矢じりが縮む → 線が逆再生で縮む）の長さ
  /** 長方形(カード)の中心から向き (ux,uy) へ出たときの縁までの距離 */
  const emEdge = (a, ux, uy) => { const tx = ux ? (a.w / 2) / Math.abs(ux) : Infinity, ty = uy ? (a.h / 2) / Math.abs(uy) : Infinity; return Math.min(tx, ty); };
  /**
   * 矢印1本の形。重なりを減らすため、(1) 大きく弧を描く（右向きは上へ・左向きは下へ。行き来する2本は別の側）、(2) 同じカードに出入りする矢印は端点をずらす
   * （so / eo: 出発点・到着点を縁に沿ってずらす量 px）、(3) 弧は卓の高さの中に収める。
   */
  function emShape(a, b, self, so, eo, box) {
    let d, hx, hy, tx, ty;   // d: 線の path / (hx,hy): 矢じりの先 / (tx,ty): 矢じりの向き（単位ベクトル）
    if (self) {   // 自分への投票（魔界公爵追放会議）: カードの上に小さな輪
      const x = a.x + (so || 0), y = a.y - a.h / 2;
      d = `M ${x - 7} ${y} C ${x - 30} ${y - 34} ${x + 30} ${y - 34} ${x + 7} ${y - 3}`; hx = x + 7; hy = y - 3; tx = -0.2; ty = 1;
    } else {
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len;
      const bow = Math.min(84, 30 + len * 0.28);
      let cx = (a.x + b.x) / 2 + uy * bow, cy = (a.y + b.y) / 2 - ux * bow;   // 進行方向の左手側（右向き=上、左向き=下）へ膨らむ
      if (box) cy = Math.max(6, Math.min(box.height - 6, cy));
      const shift = (c, k, ox, oy) => (Math.abs(oy) > Math.abs(ox) ? { x: c.x + k, y: c.y } : { x: c.x, y: c.y + k });   // 縦に出入りするカードは横に、横に出入りするカードは縦にずらす
      const s0 = shift(a, so || 0, cx - a.x, cy - a.y), e0 = shift(b, eo || 0, cx - b.x, cy - b.y);
      let sx = cx - s0.x, sy = cy - s0.y, sl = Math.hypot(sx, sy) || 1; sx /= sl; sy /= sl;
      let qx = cx - e0.x, qy = cy - e0.y, ql = Math.hypot(qx, qy) || 1; qx /= ql; qy /= ql;
      const S = { x: s0.x + sx * (emEdge(a, sx, sy) + 2), y: s0.y + sy * (emEdge(a, sx, sy) + 2) }, E = { x: e0.x + qx * (emEdge(b, qx, qy) + 3), y: e0.y + qy * (emEdge(b, qx, qy) + 3) };
      d = `M ${S.x} ${S.y} Q ${cx} ${cy} ${E.x} ${E.y}`; hx = E.x; hy = E.y; tx = -qx; ty = -qy;
    }
    const L = 12, W = 7, px = hx - tx * L, py = hy - ty * L;
    return { d, head: `${hx},${hy} ${px - ty * W},${py + tx * W} ${px + ty * W},${py - tx * W}`, ox: hx, oy: hy };
  }
  /** 全矢印の形を決める。同じカードに出入りする矢印は、相手の位置の順に端点を 15px ずつ（多いときは縁に収まる幅で）ずらす */
  function emLayout(want, box) {
    const per = {};   // カードID → [{ k, role, other }]
    Object.entries(want).forEach(([k, w]) => {
      (per[w.v] = per[w.v] || []).push({ k, role: "s", o: w.b });
      (per[w.t] = per[w.t] || []).push({ k, role: "e", o: w.a });
    });
    const off = {};
    Object.values(per).forEach((list) => {
      list.sort((p, q) => (p.o.x - q.o.x) || (p.o.y - q.o.y) || (p.k < q.k ? -1 : 1));
      const step = list.length > 1 ? Math.min(15, 42 / (list.length - 1)) : 0;   // 矢じりの幅(14px)より離す。本数が多いときは縁に収まる幅に詰める
      list.forEach((it, i) => { (off[it.k] = off[it.k] || {})[it.role] = (i - (list.length - 1) / 2) * step; });
    });
    Object.entries(want).forEach(([k, w]) => { const o = off[k] || {}; w.sh = emShape(w.a, w.b, w.v === w.t, o.s, o.e, box); });
  }
  const emSet = (g, sh, col) => {   // 既にある矢印の形だけを更新する（アニメは触らない）
    g.querySelectorAll(".em-line").forEach((n) => n.setAttribute("d", sh.d));
    g.querySelectorAll(".em-head").forEach((n) => { n.setAttribute("points", sh.head); n.style.transformOrigin = `${sh.ox}px ${sh.oy}px`; });
  };
  /**
   * 描く。矢印は <g class="em-a" data-k="投票者>投票先"> を1本ずつ持ち、増えたものだけ「すっーと線が伸びて、最後に矢じりが生える」アニメで足し、
   * 無くなったもの（投票先を変えた・未投票に戻した）は「矢じりが縮んで、線が逆再生で縮む」アニメのあとで外す。残るものは位置だけ更新する。
   */
  function emDraw(g) {
    g = g || G();
    const el = $t(); if (!el) return;
    let svg = el.querySelector(":scope > .em-arrows");
    const votes = emWant(g);
    el.classList.toggle("em-room", !!votes);   // 矢印が出る人だけ、卓の下に弧を描く余白を足す
    if (!votes) { if (svg) svg.remove(); emSig = ""; return; }
    const box = el.getBoundingClientRect();
    const pos = (id) => {
      const c = el.querySelector(`.tb-seat[data-k="p:${id}"] .tb-card`); if (!c) return null;
      const r = c.getBoundingClientRect(); if (!r.width || !r.height) return null;
      return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2, w: r.width, h: r.height };
    };
    const want = {}, sig = [Math.round(box.width), Math.round(box.height)];
    for (const [v, t] of Object.entries(votes)) {
      const a = pos(v), b = pos(t); if (!a || !b) continue;
      want[`${v}>${t}`] = { v, t, a, b }; sig.push(v, t, Math.round(a.x), Math.round(a.y), Math.round(b.x), Math.round(b.y));
    }
    const key = sig.join(",");
    if (svg && key === emSig) return;
    emSig = key;
    emLayout(want, box);
    if (!svg) { svg = document.createElementNS(EM_NS, "svg"); svg.setAttribute("class", "em-arrows"); svg.setAttribute("aria-hidden", "true"); el.appendChild(svg); }
    svg.setAttribute("width", box.width); svg.setAttribute("height", box.height); svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const have = {};
    Array.from(svg.children).forEach((n) => { const k = n.getAttribute("data-k"); if (k) { if (n.classList.contains("em-out") && want[k]) n.remove(); else have[k] = n; } });   // 消えている途中の矢印と同じ票がまた入ったら、消えかけを捨てて描き直す
    for (const [k, n] of Object.entries(have)) {
      if (want[k]) { emSet(n, want[k].sh); continue; }
      if (!n.classList.contains("em-out")) {   // 取り消された・変えられた矢印 → 逆再生で消す
        n.classList.remove("em-in"); n.classList.add("em-out");
        setTimeout(() => { if (n.isConnected && n.classList.contains("em-out")) n.remove(); }, EM_OUT_MS);
      }
    }
    for (const [k, w] of Object.entries(want)) {
      if (have[k]) continue;
      const sh = w.sh, col = `hsl(${emHue(w.v)} 90% 62%)`, ge = document.createElementNS(EM_NS, "g");
      ge.setAttribute("class", "em-a em-in"); ge.setAttribute("data-k", k);
      ge.innerHTML = `<path d="${sh.d}" class="em-line em-line--bg" pathLength="1"/><polygon points="${sh.head}" class="em-head em-head--bg" style="transform-origin:${sh.ox}px ${sh.oy}px"/><path d="${sh.d}" class="em-line" pathLength="1" style="stroke:${col}"/><polygon points="${sh.head}" class="em-head" style="fill:${col};transform-origin:${sh.ox}px ${sh.oy}px"/>`;
      svg.appendChild(ge);
    }
  }
  /** 矢印を出している間だけ、カードの位置が動いたら描き直す */
  function emLoop() {
    emRaf = 0;
    const g = G(); if (!g || !emWant(g)) return;
    emDraw(g);
    emRaf = requestAnimationFrame(emLoop);
  }
  function emKick(g) { emDraw(g); if (!emRaf && emWant(g || G()) && typeof requestAnimationFrame === "function") emRaf = requestAnimationFrame(emLoop); }
  stage.emDraw = emKick;
  stage.emWant = emWant;

  // ---------------------------------------------------------
  // 糸紡ぎ（js/roles/neutral/thread_spinner.js）: ペアの2人を白い糸でつなぐ線（選挙管理委員の矢印と同じ、卓の上の SVG）。
  //   朝: 糸紡ぎ本人の画面で、ペアのカードが 🧵 でめくれたあとに2人を糸でつなぐ（しばらくして消える）。
  //   結果発表: 後追いが起きるときは全員の画面で、糸が見えて → 糸が切れて → 後追いする（startResult の flipChain / dayDead が呼ぶ。作者指定）。
  // ---------------------------------------------------------
  function threadClear() { document.querySelectorAll(".th-arrows").forEach((e) => e.remove()); }
  function threadShow(a, b) {
    const el = $t(); if (!el) return;
    threadClear();
    const box = el.getBoundingClientRect();
    const pos = (id) => { const c = el.querySelector(`.tb-seat[data-k="p:${id}"] .tb-card`); if (!c) return null; const r = c.getBoundingClientRect(); if (!r.width || !r.height) return null; return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 }; };
    const pa = pos(a), pb = pos(b); if (!pa || !pb) return;
    const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2 + Math.min(48, Math.hypot(pb.x - pa.x, pb.y - pa.y) * 0.16 + 14);   // 少し垂れる弧
    const svg = document.createElementNS(EM_NS, "svg");
    svg.setAttribute("class", "th-arrows"); svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", box.width); svg.setAttribute("height", box.height); svg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    svg.innerHTML = `<path class="th-line th-line--bg" pathLength="1" d="M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}"/><path class="th-line th-in" pathLength="1" d="M ${pa.x} ${pa.y} Q ${mx} ${my} ${pb.x} ${pb.y}"/>`;
    el.appendChild(svg);
  }
  /** 糸が切れる演出（ほどけて落ちて消える） */
  function threadCutFx() {
    const svg = document.querySelector(".th-arrows"); if (!svg) return;
    svg.classList.add("th-cut");
    setTimeout(() => svg.remove(), 1000);
  }
  stage.threadShow = threadShow; stage.threadCut = threadCutFx; stage.threadClear = threadClear;

  function paint(g) {
    cosRow(g);   // コスプレイヤーの3枚（あれば）を先に作る
    const el = $t(), m = mode(g), me = ONW.net.myId();
    const hideOthers = !!(g.strawPick && (g.strawKind === "assassin" || g.strawKind === "bounty"));   // アサシン・賞金稼ぎが選んでいる間は、他のめくれたカードを見せない
    const hideAll = !hideOthers && !!g.strawWait && !!g.strawHide;   // アサシンか賞金稼ぎが現世にいる試合では、選択待ちの間、選んでいない人の画面も、めくれたカードは全員同じ「？」（誰が死んだか・マーリンかどうかを見せない）
    const hideAny = hideOthers || hideAll;
    const hold = !hideOthers ? g.asnHold : null;   // アサシンが選び終わったあとも、結果の演出でめくれるまでは、選んでいる間の見た目のまま（裏に戻さない）
    const rec = {};   // アサシンが暗殺先を選ぶまで、自分以外のカード（死亡者を含む）は表にしない（マーリンと見えてしまわないように）
    el.querySelectorAll(".tb-seat[data-k]").forEach((s) => {
      const k = s.dataset.k, isP = k.startsWith("p:");
      // アサシンが選んでいる間: すでにめくれた人（自分を含む）は全員同じ「？」のカードで表に、まだの人は裏のまま（役職もマーリンも見せない）
      const flipped = hideAny && isP && (g.strawFlipped || []).includes(k.slice(2));
      const mine = hideOthers && isP && k.slice(2) === me;   // 選んでいるアサシン本人のカードだけは、自分の役職で表に見える
      const h = hold && isP ? hold[k] : null;
      let role = mine ? (g.strawKind === "bounty" ? ONW.ROLE.BOUNTY_HUNTER : ONW.ROLE.ASSASSIN) : hideAny && isP ? (flipped ? (hideAll && g.strawShow && g.strawShow[k.slice(2)]) || UNK_MARK : undefined) : (up[k] || (h && h.role));   // 選んでいない人の画面: めくれたカードは「？」。ただしアサシン・賞金稼ぎ以外の人には、めくれたアサシン・賞金稼ぎだけ本当の役職で見える
      if (!hideOthers && isP && role && veil[k]) role = veil[k] === "down" ? undefined : UNK_MARK;   // アサシン・賞金稼ぎ本人の画面: 同時にめくれた別のアサシン・賞金稼ぎは、その人の演出が始まる（または全部の演出が終わる）まで「？」のまま
      if (role === "queen" && fqv[k]) role = "queen@" + (fqv[k] === true ? "先代女王" : fqv[k]);   // 先代女王の面（queen.js）
      if (role === TB && tbv[k] && ONW.trailblazer.fateOfView((G().mimicView || {})[k])) role = `${TB}@${ONW.trailblazer.fateOfView(G().mimicView[k])}`;   // 開拓者の2回目の面（運命の名前）
      if (role === CUR && curv[k]) role = `${CUR}@wolf`;   // 呪われし者の2回目の面（赤色の名前）
      if (role === CAT && catv[k]) role = `${CAT}@${catv[k].team}${catv[k].sfx ? "@" + catv[k].sfx : ""}`;   // 2回目の面（陣営の色）
      if (!hideOthers && role && bnt[k] && bnt[k] !== "by") { const br = String(role).startsWith(CAT + "@") ? CAT : String(role).startsWith(CUR + "@") ? CUR : role; if (ONW.roles.getInfo(br)) role = `${BNT}@${bnt[k]}@${br}`; }   // 賞金稼ぎに選ばれたカードは手配書の面
      if (!hideOthers && isP && curse[k]) role = curse[k] === true ? FOX_MARK : curse[k] === FOXX_MARK ? FOXX_MARK : curse[k] === TANUKI_MARK ? TANUKI_MARK : deadMark(curse[k]);   // 呪殺された妖狐のカードは、待機時間から結果発表まで🦊の面のまま（妖狸はたぬきマークの面）
      if (hideOthers && isP && role) rec[k] = { role, dead: !!flipped };
      const mkey = role === "mimic_wolf" || role === "trailblazer" ? mimicTarget(k) || "" : role === "clone" ? cloneTarget(k) || "" : "";   // 模倣先・思い込み先があとから届いたときも描き直す
      if (role && (s.dataset.role !== role || (s.dataset.mimic || "") !== mkey)) {
        s.dataset.role = role; s.dataset.mimic = mkey;
        const f = s.querySelector(".tb-front");
        f.innerHTML = faceHtml(role, k);
        f.className = `tb-front tb-team-${String(role).startsWith(BNT + "@") ? "bounty" : String(role).startsWith(SENSE_PRE) ? ({ village: "village", wolf: "wolf", third: "third", lover: "love", mad: "sensemad" }[String(role).slice(SENSE_PRE.length)] || "village") : String(role).startsWith(CUR + "@") ? "wolf" : String(role).startsWith(TB + "@") ? "village" : String(role).startsWith("queen@") ? "village" : String(role).startsWith(CAT + "@") ? (["village", "wolf"].includes(String(role).split("@")[1]) ? String(role).split("@")[1] : "third") : role === UNK_MARK || role === FOXSEE_MARK ? "third" : role === WOLF_MARK || role === DUO_MARK ? "wolf" : role === FLAT_MARK || role === COFFIN_MARK || role === SHIELD_MARK || role === THREAD_MARK ? "third" : role === LOVE_MARK || role === CUPID_MARK || role === DAUGHTER_MARK || role === KEEP_MARK || role === BREAK_MARK ? "love" : role === BLANK_MARK ? "blank" : role === BLANKX_MARK ? "key" : role === SEAL_MARK ? "seal" : role === ELFRINDE_MARK ? "elfseal" : String(role).startsWith(COFFEE_PRE) ? "coffee" : role === DARKFALL_MARK ? "darkfall" : KEY_MARKS.includes(role) ? "key" : role === TARGET_MARK ? "target" : role === AVENGER_MARK ? "avenger" : role === MUTE_MARK ? "mute" : role === HACK_MARK ? "hack" : role === FOX_MARK || role === TANUKI_MARK ? "fox" : String(role).startsWith(DEAD_PRE) ? "third" : role === MASTER_MARK || role === SELF_LOVE || role === BONE_MARK ? "master" : role === "hotaru" ? "village" : ONW.roles.getInfo(role).team}`;
      }
      const sel = (k.startsWith("c:") && !!m && (m.type === "night" || m.type === "morning") && !!g.nightSel && g.nightSel.pick === +k.slice(2)) || (m && m.type === "vote" && g.voteSel === k.slice(2) && isP) || (m && (m.type === "night" || m.type === "morning" || m.type === "dictate" || m.type === "shoot" || m.type === "steal" || m.type === "barrier" || m.type === "yomi" || m.type === "icarus" || m.type === "goranshin" || m.type === "agent" || m.type === "rejob" || m.type === "mind" || m.type === "exchange" || m.type === "libra" || m.type === "predict") && (isP ? (g.nightSel && g.nightSel.players || []).includes(k.slice(2)) : (g.nightSel && g.nightSel.graves || []).includes(+k.slice(2)))) || (g.voted && g.myVote && k === `p:${g.myVote}`);
      s.classList.toggle("up", !!role);
      if (ONW.sound) ONW.sound.noteFlip(k, !!role);   // SE: カードのめくれ（裏→表／表→裏の変化を検出）
      { // 反転者: 反転された人のカードは裏面のまま180度回転（自分の席は待機時間から / 結果発表では、めくれるときに回った状態で公開）。反転N回なら 180×N 度（docs/reverser.md）
        const isMe = isP && k.slice(2) === me && !g.isSpectator;
        const rc = (isMe ? (g.revShown || 0) : 0) || (g.phase === ONW.PHASE.ONLINE_RESULT && role && g.revRes ? (g.revRes[k] || 0) : 0);
        s.classList.toggle("rev", rc > 0);
        s.classList.toggle("rev-odd", rc % 2 === 1);   // 奇数回の反転: カードは上下逆なので、マーク（恋人・酔っ払いなど）も右下に上下逆で出す。偶数回は正位置
        if (rc > 0) s.style.setProperty("--rot", (rc * 180) + "deg"); else s.style.removeProperty("--rot");
      }
      s.classList.toggle("pick", pickable(k, m, g));
      s.classList.toggle("sel", !!sel);
      s.classList.toggle("dead", !!dead[k] || flipped || !!(h && h.dead));
      s.classList.toggle("shot", !!(isP && shot[k]));   // 保安官に撃たれた: 銃痕とひび（めくれても残る。執行・誤爆・従者の身代わりで同じ見た目）
      s.classList.toggle("shot-fire", !!(isP && shotAnim[k]));
      if (isP && shot[k] && !s.dataset.shotv) {   // 撃たれた位置・ひびの向きは席ごとにばらす（同じ席は何度描いても同じ）
        let h = 7; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
        s.style.setProperty("--sx", ((h % 21) - 10) + "%"); s.style.setProperty("--sy", (((h >> 5) % 25) - 12) + "%"); s.style.setProperty("--sr", ((h >> 3) % 360) + "deg");
        s.dataset.shotv = "1";
      }
      s.classList.toggle("cursed", !!(isP && curse[k]));   // 呪殺された妖狐: 灰色のカード
      s.classList.toggle("gone", !!(m && m.type === "straw" && !hideOthers && isP && !g.strawPick.some((c) => c.id === k.slice(2))));   // わら人形の選択中: すでにめくれた人（選べない人）のカードは黒と灰色
      s.classList.toggle("dkgone", !!(isP && g.phase === ONW.PHASE.ONLINE_VOTE && g.dukeIds && !g.dukeIds.includes(k.slice(2))));   // 魔界公爵追放会議: 死んでいる人のカードは、すーっとグレーと黒の裏面になる
      s.classList.toggle("glow", !!glow[k]);
      s.classList.toggle("glow-master", role === MASTER_MARK);   // ご主人のカードは紫に光る
      // 道連れ・暗殺を選んでいる人のカードは、選び終わるまで揺れ続ける（選んでいるアサシン本人の画面では、同時に選んでいる他の人の「？」は揺らさない）
      s.classList.toggle("choosing", !!(isP && (g.strawShake || []).includes(k.slice(2)) && (!hideOthers || k.slice(2) === me)));
      s.classList.toggle("drunk", isP && k.slice(2) === me && drunkLeft(g) !== null);   // 酔っ払い（未覚醒）本人の画面だけ: 自分のカードが黄×白のしまになり、🍺と「酔いが覚めるまで」の秒数が出る
      s.classList.toggle("cocktail", isP && k.slice(2) === me && drunkLeft(g) !== null && !!g.myCocktail);   // バーテンダー: カクテルで酔った本人の画面だけ: ライム×白のしま＋🍸になる（CSS の .tb-seat.drunk.cocktail）
      s.classList.toggle("coffee", isP && k.slice(2) === me && coffeeLeft(g) !== null);   // ケセドのコーヒータイム本人の画面だけ: 自分のカードに☕と「コーヒータイム終了まで」の秒数が出る（酔っ払いと同時なら下段。CSS の .tb-coffee）
      s.classList.toggle("jobup", jobKeys.includes(k));   // 就職先の画面でめくれたフリーターの青い光と札
      s.classList.toggle("mindup", mindKeys.includes(k));
      s.classList.toggle("senseup", !!senseKeys[k]); Object.keys(SENSE_FACE).forEach((c) => s.classList.toggle("sense-" + c, senseKeys[k] === c));   // 感覚の占い師が感じ取った相手のカード: 気配の色の光と「👁 気配」の札   // 心眼の人狼が見抜いた相手のカードの紫の光と札
      s.classList.toggle("starup", starKeys.includes(k) || flashKeys.includes(k));   // スター公開中の金色の光と札
      s.classList.toggle("kingup", kingKeys.includes(k) || kingFlashKeys.includes(k));   // 人狼王公開中の赤い光と札
      s.classList.toggle("queenup", queenKeys.includes(k) || queenFlashKeys.includes(k));   // 女王公開中の紫の光と札
      s.classList.toggle("shinju", !!shin[k]);
      s.classList.toggle("lov", !!lov[k]); s.classList.toggle("shuf", !!shuf[k]); s.classList.toggle("kp", !!kp[k]); s.classList.toggle("wf", !!wf[k]); s.classList.toggle("bd", !!bd[k]);   // 結果発表: シャッフラーつきのカードの左上に🔀
      { const lv = s.querySelector(".tb-lov"); const nos = Array.isArray(lov[k]) ? lov[k] : [lov[k]]; const nLov = lov[k] ? nos.length : 0;   // 結果発表: 恋人の丸(❤と番号)。恋人が2組以上なら組ごとに1つずつ縦に並べる
        s.classList.toggle("mk2", nLov + (shuf[k] ? 1 : 0) + (kp[k] ? 1 : 0) + (wf[k] ? 1 : 0) + (bd[k] ? 1 : 0) >= 2);   // 丸が2つ以上同時に付くときは、全部を小さくして縦に並べる
        if (lv) { const t = nos.map((n) => `<span class="tb-lv">${typeof n === "number" ? `<span>❤</span><span>${n}</span>` : "<span>❤</span>"}</span>`).join(""); if (lv.dataset.t !== t) { lv.dataset.t = t; lv.innerHTML = t; } } }
      { const bde = s.querySelector(".tb-bd"); if (bde) { const bt = bdCk[k] ? "🍸" : "🍺"; if (bde.textContent !== bt) bde.textContent = bt; } }   // バーテンダー: カクテルで酔った人の結果バッジは🍸
      s.classList.toggle("almost", !!alm[k]);
      ["descend", "spark", "blow", "win", "extra", "chicken", "toughclang", "toughrecv", "kingguard", "knightguard", "exsel", "thsel", "bomb", "boom", "curse", "cursed"].forEach((c) => s.classList.toggle("gx-" + c, gx[k] === c));   // 神降臨・神の祝福の演出（curse / cursed = 呪術の人狼の呪殺で呪われていく演出）
      const baseRole = role && String(role).startsWith(BNT + "@") ? String(role).split("@")[2] : role && String(role).startsWith(CAT + "@") ? CAT : role && String(role).startsWith(CUR + "@") ? CUR : role && String(role).startsWith(TB + "@") ? TB : role && String(role).startsWith("queen@") ? "queen" : role;   // 手配書の面("__bnt@状態@役職")のときは、中の役職名を使う
      const ghostRole = baseRole && ONW.ROLE_INFO[baseRole] ? baseRole : (up[k] && ONW.ROLE_INFO[up[k]] ? up[k] : null);   // 呪殺・妖狐投票で追放された妖狐のカードは印(__fox / __foxx)の面なので、吹き飛んだあとの役職名は印ではなく本当の役職(up)から引く
      if (gx[k] === "blow" && ghostRole) { const gl = (NAME_BREAKS[ONW.roles.getInfo(ghostRole).name] || [ONW.roles.getInfo(ghostRole).name]); s.dataset.ghost = gl.join("\n"); s.dataset.gn = String(Math.max(...gl.map(clen))); } else { delete s.dataset.ghost; delete s.dataset.gn; }   // 吹き飛んだあとの点線のカードに書く役職名   // 従者の身代わり: ご主人のカードがめくれそうになって戻る
      ["by", "aim", "slash", "hit", "miss"].forEach((c) => s.classList.toggle("asn-" + c, asn[k] === c));   // アサシンの演出
      ["by", "pick", "hit", "miss"].forEach((c) => s.classList.toggle("bnt-" + c, bnt[k] === c));   // 賞金稼ぎの演出
      const b = s.querySelector(".tb-badge");
      const text = badge[k] || (g.voted && g.myVote && k === `p:${g.myVote}` && g.phase === ONW.PHASE.ONLINE_VOTE ? "投票" : "");
      if (b.textContent !== text) { b.textContent = text; b.classList.toggle("tb-badge--dead", !!dead[k]); }
      b.classList.toggle("tb-badge--lit", dkb[k] === "lit");   // 同数の抽選: 光っている票数バッジ
      b.classList.toggle("tb-badge--black", !!text && (!!dkb[k] || (!badge[k] && !!g.dukeIds && g.phase === ONW.PHASE.ONLINE_VOTE)));   // 魔界公爵追放会議: 票数・投票のバッジは黒
    });
    if (hideOthers) g.asnHold = rec;
    libraSync(g);   // 天秤: 皿に載せる（paint の後始末。席を動かすだけで、カードの見た目は変えない）
    emKick(g);      // 選挙管理委員: 投票の矢印（見える人だけ。投票の画面以外では消す）
    stage.drunkTick();
    stage.coffeeTick();
  }

  // ---------------------------------------------------------
  // 観戦者: 全員のカードを表にして見せる。夜が明けて役職が入れ替わったら、
  //   いったん伏せる → 空中で入れ替わる → 新しい役職で表になる（表のまま中身が切り替わる「点滅」はしない）
  // ---------------------------------------------------------
  function specWant(g) {
    const w = {};
    g.specInfo.players.forEach((p) => { w[`p:${p.id}`] = p.cur || p.ini; });
    g.specInfo.center.forEach((c, i) => { w[`g:${i}`] = c.cur || c.ini; });
    return w;
  }
  function arcPair(ka, kb) {
    const el = $t(), a = el.querySelector(`[data-k="${ka}"] .tb-card`), b = el.querySelector(`[data-k="${kb}"] .tb-card`);
    if (!a || !b || !a.animate) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), dx = rb.left - ra.left, dy = rb.top - ra.top;
    const path = (x, y, lift) => [
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${x / 2}px,${y / 2 + lift}px) scale(1.2)`, offset: 0.5 },
      { transform: `translate(${x}px,${y}px) scale(1)` },
    ];
    a.style.zIndex = 6; b.style.zIndex = 5;
    const opt = { duration: 1000, easing: "ease-in-out", fill: "forwards" };
    const A = a.animate(path(dx, dy, -22), opt), B = b.animate(path(-dx, -dy, 22), opt);
    later(() => { A.cancel(); B.cancel(); a.style.zIndex = b.style.zIndex = ""; }, 1050);   // 裏面は同じなので、元の席に戻すと入れ替わったまま見える
  }
  function hop(k) {   // 入れ替えが3枚以上にまたがるときの、その席のカードの小さな跳ね
    const c = $t().querySelector(`[data-k="${k}"] .tb-card`);
    if (!c || !c.animate) return;
    c.animate([{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-16px) scale(1.12)", offset: 0.5 }, { transform: "translateY(0) scale(1)" }], { duration: 800, easing: "ease-in-out" });
  }
  function specSync(g) {
    if (specBusy) return;                       // 演出中は触らない（終わってから最新を反映）
    const want = specWant(g);
    const changed = Object.keys(want).filter((k) => specShown[k] && specShown[k] !== want[k]);
    if (!changed.length) { Object.keys(want).forEach((k) => { specShown[k] = want[k]; up[k] = want[k]; }); return; }
    specBusy = true;
    const old = { ...specShown };
    changed.forEach((k) => { delete up[k]; });  // ① 全部伏せる
    const done = new Set(), pairs = [];
    changed.forEach((a) => {                    // 互いに役職を交換した2枚は組にする
      if (done.has(a)) return;
      const b = changed.find((x) => x !== a && !done.has(x) && old[a] === want[x] && old[x] === want[a]);
      if (b) { done.add(a); done.add(b); pairs.push([a, b]); }
    });
    const rest = changed.filter((k) => !done.has(k));
    later(() => { pairs.forEach(([a, b]) => arcPair(a, b)); rest.forEach(hop); }, 850);        // ② 空中で入れ替わる
    const flipAt = 850 + (pairs.length ? 1100 : 0) + (rest.length ? 850 : 0);
    changed.forEach((k, i) => later(() => { const w = G().specInfo ? specWant(G()) : want; up[k] = w[k] || want[k]; paint(G()); }, flipAt + i * 140));   // ③ 新しい役職で表に
    later(() => { specShown = G().specInfo ? specWant(G()) : want; specBusy = false; stage.sync(G()); }, flipAt + changed.length * 140 + 900);
  }

  stage.sync = function (g) {
    const el = $t();
    if (!el) return;
    smokeSync(g, false);
    const list = roster(g);
    if (!VISIBLE().includes(ph(g)) || !list.length) {
      smkN.group = null; smkN.perm = null; smkN.sig = "";
      if (key !== null) { clearAll(); key = null; specShown = {}; specBusy = false; g.asnHold = null; up = {}; dead = {}; curse = {}; shot = {}; shotAnim = {}; shotBooted = false; released = {}; chainPend = {}; peekUp = {}; deathMarks = []; badge = {}; dkb = {}; glow = {}; shin = {}; lov = {}; shuf = {}; kp = {}; wf = {}; bd = {}; bdCk = {}; loveMate = null; asn = {}; bnt = {}; veil = {}; alm = {}; gx = {}; catv = {}; curv = {}; fqv = {}; tbv = {}; tbh = {}; starKeys = []; flashKeys = []; queenKeys = []; queenFlashKeys = []; kingKeys = []; kingFlashKeys = []; jobKeys = []; mindKeys = []; senseKeys = {}; nightKeys = []; held = {}; busy = false; seq = false; el.innerHTML = ""; if (ONW.sound) ONW.sound.resetFlips(); }
      el.classList.remove("on");
      return;
    }
    const k = `${g.dealStart || 0}|${list.map((p) => p.id).join(",")}|${graveN(g)}`;
    if (k !== key) { clearAll(); key = k; specShown = {}; specBusy = false; g.asnHold = null; up = {}; dead = {}; curse = {}; shot = {}; shotAnim = {}; shotBooted = false; released = {}; chainPend = {}; peekUp = {}; deathMarks = []; badge = {}; dkb = {}; glow = {}; shin = {}; lov = {}; shuf = {}; kp = {}; wf = {}; bd = {}; bdCk = {}; loveMate = null; asn = {}; bnt = {}; veil = {}; alm = {}; gx = {}; catv = {}; curv = {}; fqv = {}; tbv = {}; tbh = {}; starKeys = []; flashKeys = []; queenKeys = []; queenFlashKeys = []; kingKeys = []; kingFlashKeys = []; jobKeys = []; mindKeys = []; senseKeys = {}; nightKeys = []; held = {}; busy = false; seq = false; build(g, list); if (ONW.sound) ONW.sound.resetFlips(); }
    el.classList.add("on");
    smkNamesSync(g);   // 煙幕の名前隠し: 名前が ？？？ になる・席の並びがシャッフルされる（詳細設定がONのときだけ）
    // 観戦者（観戦ONのホスト含む）: 全員のカードを表にして見せる（結果の演出中は除く）
    if ((g.isSpectator || hostWatching(g)) && g.specInfo && g.phase !== ONW.PHASE.ONLINE_RESULT) specSync(g);
    // 保安官に撃たれた席: カードに銃痕とひび（結果発表でめくれたあとも残る）。撃たれた瞬間に見ていた画面だけ演出つき（最初の同期＝再入室・観戦の途中参加は演出なし）
    (g.boardView || []).filter((p) => p.shot).forEach((p) => { const k = `p:${p.id}`; if (!shot[k]) { shot[k] = true; if (shotBooted) { shotAnim[k] = true; if (ONW.sound) ONW.sound.seKey("gunshot", (g.dealStart || 0) + ":shot:" + p.id, 60000); } } });   // SE: 発砲（保安官・ヴァニティ等。撃たれた席が初めて見えた瞬間に全員の画面で鳴る）
    const booted = shotBooted;   // 2回目以降の同期（最初の同期 = 再入室・観戦の途中参加は、連鎖の時間差なしですぐ出す）
    shotBooted = true;
    // スティーブの復活（昼）: 生き返った席は、灰色・「死亡」の札・銃痕を消す（トーテムのピークまでは残す = totemHold）
    (g.boardView || []).filter((p) => !p.dead).forEach((p) => {
      const k = `p:${p.id}`;
      if (totemHold[k] || !(deathMarks.includes(k) || shot[k])) return;
      delete dead[k]; delete shot[k]; delete shotAnim[k]; delete chainPend[k]; delete released[k];
      if (["死亡", "呪殺", "追放", "身代わり", "心中", "後追い", "王国滅亡", "発狂", "道連れ"].includes(badge[k])) delete badge[k];
      deathMarks = deathMarks.filter((x) => x !== k);
    });
    // 昼中に死亡した席には「死亡」の札（結果発表では外す）
    if (g.phase === ONW.PHASE.ONLINE_RESULT) {
      deathMarks.forEach((k) => { delete dead[k]; if (["死亡", "呪殺", "追放", "身代わり", "心中", "後追い", "王国滅亡", "発狂", "道連れ"].includes(badge[k])) delete badge[k]; });
      deathMarks = [];
    } else {
      (g.boardView || []).filter((p) => p.dead).filter((p) => {   // 連鎖の段（保安官の誤爆・執行・ネコカボチャ）: 撃たれた人（段0）のあとに、道連れ・心中・後追い・王国滅亡が段ごとに時間差で出る（同時には出さない）
        const k = `p:${p.id}`;
        if (!(p.step > 0) || !booted || dead[k] || released[k]) return true;
        if (!chainPend[k]) { chainPend[k] = true; later(() => { released[k] = true; stage.sync(G()); }, p.step * CHAIN_STEP_MS); }
        return false;
      }).forEach((p) => { const k = `p:${p.id}`; if (!dead[k]) { dead[k] = true; if (!(p.shot && !p.fox && !p.fx)) badge[k] = p.fox || p.tanuki ? "呪殺" : p.fx || p.mark || "死亡"; deathMarks.push(k); if (booted && ONW.sound && !p.shot) { const dk = (g.dealStart || 0) + ":death:" + p.id; if (p.fox || p.tanuki) ONW.sound.seKey("curse_kill", (g.dealStart || 0) + ":curse:" + p.id, 60000); else if (p.mark === "道連れ") ONW.sound.seKey("chain", dk, 60000); else if (p.mark === "後追い" || p.mark === "心中" || p.mark === "王国滅亡") ONW.sound.seKey("follow_death", dk, 60000); } } if (p.fox && !curse[k]) { curse[k] = true; badge[k] = "呪殺"; } if (p.tanuki && !curse[k]) { curse[k] = TANUKI_MARK; badge[k] = "呪殺"; } if (p.fx === "追放" && !curse[k]) { curse[k] = FOXX_MARK; badge[k] = "追放"; } if (p.mark && !curse[k]) { curse[k] = p.mark; badge[k] = p.mark; } });   // 呪殺された妖狐は、昼の議論中もずっと🦊の灰色（観戦・再入室でも同じ）
      if (g.settleFoxQuiet) (g.settleFox || []).forEach((id) => { const k = `p:${id}`; curse[k] = true; badge[k] = "呪殺"; }); if (g.settleFoxQuiet) (g.settleFoxChain || []).forEach((e) => { const k = `p:${e.id}`; curse[k] = e.label; badge[k] = e.label; }); if (g.settleTanukiQuiet) (g.settleTanuki || []).forEach((id) => { const k = `p:${id}`; curse[k] = TANUKI_MARK; badge[k] = "呪殺"; }); if (g.settleTanukiQuiet) (g.settleTanukiChain || []).forEach((e) => { const k = `p:${e.id}`; curse[k] = e.label; badge[k] = e.label; });   // 妖狸の呪殺も同じく、たぬきマークの灰色（再入室は演出なし） if (g.settleMadQuiet) (g.settleMad || []).forEach((e) => { const k = `p:${e.id}`; curse[k] = e.label; badge[k] = e.label; });   // 発狂も同じく（再入室は演出なしで灰色）   // 待機時間のうちに再入室: 演出なしで🦊の灰色
    }
    paint(g);
    // 朝になったら、夜の選択が実行される演出（占い=表に / 怪盗・墓荒らし=入れ替わって表に / いたずらっ子=入れ替わる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && (g.morningReveal || g.morningInsom) && !g.morningShown && !g.isSpectator) {
      g.morningShown = true; const r = g.morningReveal, ins = g.morningInsom;
      ONW.ui.releaseLogs(g); ONW.ui.holdLogs(g, morningTextDelay(r, ins));   // 演出が終わってから「あなたは〇〇になりました」などの文章を出す
      if (r) later(() => playMorning(r), 700);
      // 墓荒らしが交換した後の役職の能力は、朝の演出が終わってから使える
      if (g.morningChain) later(() => { g.morningChainReady = true; ONW.ui.render(G()); }, (r ? 700 + morningDur(r) : 300) + 300);
      // 後覚者（元々 / 後から）: 夜能力の演出があればその後に、なければ朝になってすぐ、自分のカードが最終役職で表になる
      if (ins) later(() => show(`p:${ONW.net.myId()}`, ins), r ? 700 + morningDur(r) : 300);
    }
    // 朝が終わった直後の待機時間: 後覚者の最終役職がここで表になる
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settleInsom && !g.settleShown && !g.isSpectator) { g.settleShown = true; show(`p:${ONW.net.myId()}`, g.settleInsom); }
    // 朝が終わった直後の待機時間の公開演出(スター・女王・フリーター・訪問者): 各役職ファイルの stageSettle(order 順)。g[field] が届いていたら、1回だけ run を呼ぶ
    //   スター: 最終盤面でスターを持っている人のカードが全員の画面で同時に表になる / 女王: 女王を知らされる人の画面で女王のカードが表になる
    //   フリーター: 就職先本人の画面で就職してきたフリーターのカードが表になる / 訪問者: 訪問された本人の画面で訪問者のカードが表になる（いずれも昼になったら札を外して伏せる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling && !g.isSpectator && !hostWatching(g)) {
      ONW.roleHooksIn("stageSettle", "run").forEach((h) => { const o = h.def.stageSettle; if (g[o.field] && g[o.field].length && !g[o.shown]) { g[o.shown] = true; h.fn(g[o.field], stage.kit); } });
    }
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && jobKeys.length) { jobKeys.forEach((k) => { delete badge[k]; }); jobKeys = []; paint(G()); }
    // 昼に酔いが覚めた本人: 自分のカードが、変化前の役職を経由せず、最終的な役職として直接めくれる（しばらくして裏に戻る）
    if (g.soberFlash) {
      const role = g.soberFlash; g.soberFlash = null;
      if (!g.isSpectator && !hostWatching(g)) {
        const k = `p:${ONW.net.myId()}`;
        const sl = !!(g.soberPeek && g.soberPeek.love);   // 酔い覚め＋恋人: 最終役職がめくれたあと、「恋人」にめくれる（相方のハートも同じタイミング）
        later(() => { up[k] = role; paint(G()); }, 300);
        if (sl) {
          later(() => { delete up[k]; paint(G()); }, 1900);              // 役職の面をいったん裏返してから…
          later(() => { up[k] = SELF_LOVE; paint(G()); }, 2700);         // …「恋人」の面でもう一度めくる（相方のハートも同じタイミング）
          later(() => { if (held[k]) return; delete up[k]; paint(G()); }, 5600);
        } else later(() => { if (held[k]) return; delete up[k]; paint(G()); }, 4300);
      }
    }
    // 昼の公開演出(フリーター・スター・女王): 各役職ファイルの stageFlash。g[field] が届いていたら、受け取って run を呼ぶ（観戦者には出さない）。when:"early" は酔い覚めの演出より先、それ以外はあと
    const flashes = (when) => ONW.roleHooksIn("stageFlash", "run").filter((h) => (h.def.stageFlash.when || "late") === when).forEach((h) => {
      const f = h.def.stageFlash.field;
      if (g[f] && g[f].length) { const ids = g[f]; g[f] = []; if (!g.isSpectator && !hostWatching(g)) h.fn(ids, stage.kit); } else if (g[f]) g[f] = [];
    });
    flashes("early");
    // 昼に酔いが覚めた本人: 夜と同じように、見える人のカード（人狼なら🐺・共有者・墓地・神は全員）がめくれ、しばらくして裏に戻る
    if (g.soberPeek && g.soberPeek.rev) { const rv = g.soberPeek.rev; delete g.soberPeek.rev; later(() => { g.revShown = rv; paint(G()); }, 1800); if (!Object.keys(g.soberPeek).length) g.soberPeek = null; }   // 反転者: 酔いが覚めたとき反転されていたら、自分のカードが回る
    if (g.soberPeek) {
      const sp = g.soberPeek; g.soberPeek = null;
      if (!g.isSpectator && !hostWatching(g)) {
        const list = [];
        const fx = [];   // めくれ方を足すフック { up(k, role), down(k) }（役職ファイルの stageSober が足す。女王の札など）
        (sp.wolves || []).forEach((id) => list.push([`p:${id}`, WOLF_MARK, true]));
        ONW.roleHooksIn("stageSober", "list").forEach((h) => h.fn(sp, list, stage.kit, fx));   // 共有者 / 処刑人のターゲット / 従者のご主人 / 女王 のカード（この順にめくれる）
        let mateK = null, mateWolf = false;
        if (sp.love) {   // 酔いが覚めた恋人: 自分が「恋人」にめくれるのと同時に、相方のカードがハートでめくれる（人狼の🐺と重なるときは🐺と❤️）
          mateK = `p:${sp.love}`; mateWolf = list.some((x) => x[0] === mateK && x[1] === WOLF_MARK);
        }
        (sp.graves || []).forEach((c, i) => list.push([`g:${i}`, c, true]));
        ONW.roleHooksIn("stageSober", "listLate").forEach((h) => h.fn(sp, list, stage.kit, fx));   // 神: 全員と墓地のカード
        const me = `p:${ONW.net.myId()}`;
        list.forEach(([k, role], i) => later(() => { if (k === me) return; up[k] = role; glow[k] = true; fx.forEach((f) => f.up && f.up(k, role)); paint(G()); }, 300 + i * 380));
        if (mateK && mateK !== me) {
          const inList = list.some((x) => x[0] === mateK);
          if (inList) later(() => { delete up[mateK]; paint(G()); }, 1900);   // すでに開いている相方（🐺など）もいったん裏返す
          later(() => { if (mateWolf) up[mateK] = DUO_MARK; else if (inList) { up[mateK] = list.find((x) => x[0] === mateK)[1]; lov[mateK] = true; } else up[mateK] = LOVE_MARK; glow[mateK] = true; paint(G()); }, 2700);
          later(() => { if (held[mateK]) return; delete up[mateK]; delete glow[mateK]; delete lov[mateK]; paint(G()); }, 5600);
        }
        later(() => { list.forEach(([k]) => { if (k === me || k === mateK || held[k]) return; delete up[k]; delete glow[k]; delete lov[k]; fx.forEach((f) => f.down && f.down(k)); }); paint(G()); }, 300 + list.length * 380 + 3500);
      }
    }
    if (g.yomiFx) {   // 黄泉: 刀で切りつける演出。使った人（選んだ相手のカード）と、黄泉にやられたと分かる使われた人（自分のカード）にだけ届く。観戦者・ホストの観戦には出さない
      const yf = g.yomiFx; g.yomiFx = null;
      if (!g.isSpectator && !hostWatching(g) && ONW.yomi && ONW.yomi.play) setTimeout(() => ONW.yomi.play(yf, ONW.net.myId()), 80);
    }
    if (g.foxVoteFlash || g.foxVoteFx) {   // 妖狐投票: ペンギン・交換者がいれば先に票数が出て滑る・入れ替わる → そのあと、追放された妖狐のカードだけがめくれる（観戦者・ホストの観戦には出さない。追放後の印で同じ）
      const f = g.foxVoteFlash, fx = g.foxVoteFx; g.foxVoteFlash = null; g.foxVoteFx = null;
      if (!g.isSpectator && !hostWatching(g)) {
        const d = fx ? ONW.foxVote.playCounts(fx, stage.kit) : 0;
        if (f) { if (d) later(() => ONW.foxVote.play(f, stage.kit), d); else ONW.foxVote.play(f, stage.kit); }
      }
    }
    flashes("late");   // 昼に酔いが覚めたスター / 昼に新しく女王が分かった村人陣営の人: カードがめくれ、しばらくして裏に戻る
    if (g.phase !== ONW.PHASE.ONLINE_MORNING) ONW.roleHooksIn("stageSettle", "end").forEach((h) => h.fn(stage.kit));   // 昼になったら、待機時間の札を外す（カードは下の行で伏せる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling) stage.morningEnd();   // 保険: 待機時間に入ってしまっていたら（ティックを受け取れなかった席）すぐ戻す
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && g.morningUp && g.morningUp.length) { g.morningUp.forEach((k) => { if (held[k]) return; delete up[k]; delete glow[k]; }); g.morningUp = []; paint(G()); }   // 占い結果などは朝時間の間ずっと表のまま。昼になったら伏せる
    if (g.phase !== ONW.PHASE.ONLINE_NIGHT && nightKeys.length) { nightKeys.forEach((k) => { if (held[k]) return; delete up[k]; delete glow[k]; delete lov[k]; }); nightKeys = []; loveMate = null; paint(G()); }   // 神・大狼のカードは夜時間が終わったら伏せる   // 昼になったら伏せる
    if (g.loveReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.loveReveal; g.loveReveal = null; loveMate = r; if (r.mode === "solo") later(() => lovePeek(r), 700); }   // 恋人: 夜の始まりに相方のカードが❤️でめくれる（人狼の🐺・共有者・神と重なるときは、それぞれの演出の中で出す）
    // 夜の始まりの演出(従者・神・狂信者・共有者・大狼): 各役職ファイルの stageNight(order 順)。g.<field> が届いていたら、受け取って 700ms 後に開く
    if (g.phase === ONW.PHASE.ONLINE_NIGHT) ONW.roleHooks("stageNight").forEach((h) => { const f = h.def.stageNight.field; if (g[f]) { const r = g[f]; g[f] = null; later(() => h.fn(r, stage.kit), 700); } });
    if (g.phase === ONW.PHASE.ONLINE_RESULT && g.result && g.resultStage !== "sheet" && !seq) startResult(g);
  };

  // ---------------------------------------------------------
  // カードを押したとき
  // ---------------------------------------------------------
  stage.click = function (k) {
    const g = G();
    if ((g.isSpectator || hostWatching(g)) && g.specInfo && ONW.ui.showRoleHistory) { ONW.ui.showRoleHistory(k); return; }   // 観戦: カードを押すと、その役職の変化がわかる
    const m = mode(g);
    if (!pickable(k, m, g)) return;
    const id = k.slice(2);
    if (k.startsWith("c:")) {   // コスプレイヤー: 山札から出た3枚から1枚選ぶ（同じカードをもう一度押すと解除。夜は朝まで何度でも選び直せる）
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] };
      sel.pick = sel.pick === +id ? null : +id; sel.players = []; sel.graves = [];
      if (m.type === "night") ONW.net.setSel(sel);
      ONW.ui.render(g); return;
    }
    if (m.type === "straw") { ONW.net.strawPick(id); ONW.stage.sync(g); ONW.ui.render(g); return; }
    if (m.type === "exchange" || m.type === "libra") {   // 交換者・天秤: 押したカードを2人まで選ぶ（もう一度押すと解除。3人目を押すと古い方が外れる）。確定は画面の「交換する」ボタン（ui.exchConfirm）
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] };
      const at = sel.players.indexOf(id);
      if (at >= 0) sel.players.splice(at, 1); else { if (sel.players.length >= 2) sel.players.shift(); sel.players.push(id); }
      sel.graves = [];
      ONW.ui.render(g); return;
    }
    if (m.type === "predict") {   // 予想屋: 押したカードを選ぶ・もう一度押すと解除（人数の上限なし。死亡した人のカードも押せる）。タップのたびにホストへ保存する（投票が始まるまで何度でも選び直せる）
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] };
      const at = sel.players.indexOf(id);
      if (at >= 0) sel.players.splice(at, 1); else sel.players.push(id);
      sel.graves = [];
      ONW.net.predict(sel.players, false);
      ONW.ui.render(g); return;
    }
    if (m.type === "dictate" || m.type === "shoot" || m.type === "steal" || m.type === "barrier" || m.type === "yomi" || m.type === "icarus" || m.type === "goranshin" || m.type === "agent" || m.type === "rejob" || m.type === "mind") {   // 独裁者: 押したカードを選ぶ（もう一度押すと解除）。確定は画面の「独裁を宣言する」ボタン（ui.dictConfirm）
      if (m.type === "icarus" && icarusUsedUp(g, id)) return;   // イカロス: もう分け与えた人は選べない（ホストも同じ検証をする）
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] };
      sel.players = sel.players[0] === id ? [] : [id]; sel.graves = [];
      ONW.ui.render(g); return;
    }
    if (m.type === "night" || m.type === "morning") {
      // 夜: 朝になるまで何度でも選び直せる（同じカードをもう一度押すと解除）。朝: 選んで「能力を使う」で確定
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] }, isP = k.startsWith("p:"), pk = pickOf(m.role);
      const toggle = (arr, v, max) => { const at = arr.indexOf(v); if (at >= 0) arr.splice(at, 1); else { if (arr.length >= max) arr.shift(); arr.push(v); } };
      if (isP) {
        const max = (pk && pk.players) || 1;     // いたずらっ子・グレムリンは2人(stagePick.players)
        toggle(sel.players, id, max);
        if (pk && pk.exclusive) sel.graves = [];     // 墓地とプレイヤーは同時に占えない(占い師・狂った占い師)
      } else {
        const max = pk && pk.graveMax ? pk.graveMax(g, m.role) : 1;
        if (max <= 0) return;
        toggle(sel.graves, +id, max);
        sel.players = [];
      }
      if (m.type === "night") ONW.net.setSel(sel);
      ONW.ui.render(g);
    } else {
      g.voteSel = g.voteSel === id ? null : id;     // 同じ人をもう一度押すと未投票に戻る
      ONW.net.vote(g.voteSel);                      // 変えるたびにホストへ送る（確定はタイマー終了時）
      ONW.ui.render(g);
    }
  };
  // ---------------------------------------------------------
  // 朝: 夜の選択が実行され、入れ替わる演出 → 自分のカードが表に（昼になるまで見える）
  // ---------------------------------------------------------
  /** 朝・昼に使った能力の演出(playMorning)が終わって、結果の文章を出してよくなるまでの時間(ms) */
  stage.ackDelay = function (r) { return r ? Math.max(0, morningTextDelay(r, null) - 700) : 0; };
  /** 朝が終わる直前(残り1秒): 朝のうちにめくれた面(占い・🦴・ハート・交換後の自分の役職・口封じ・共有者の相方など)を裏に戻す。
   *  めくり戻しの.75秒を待機時間の前に終わらせて、待機時間の演出(後覚者・スター・女王・破局師の💔など)と重ならないようにする */
  stage.morningEnd = function () {
    const g = G();
    if (g.phase !== ONW.PHASE.ONLINE_MORNING || !Object.keys(peekUp).length) return;
    Object.keys(peekUp).forEach((k) => { if (!held[k] && up[k] === peekUp[k]) { delete up[k]; delete glow[k]; } if (g.morningUp) g.morningUp = g.morningUp.filter((x) => x !== k); });
    peekUp = {}; paint(g);
  };
  stage.onAck = function (d) {      // 朝に使った能力は、結果が返った瞬間に演出する
    busy = false;
    if (d.chain && G().phase === ONW.PHASE.ONLINE_MORNING) {   // 朝: 取った役職の能力へ続く。交換・コピーの演出が終わってから使えるようにする
      later(() => { const g = G(); if (g.morningChain === d.chain && !g.morningChainDone) { g.morningChainReady = true; ONW.ui.render(g); } }, (d.reveal ? morningDur(d.reveal) : 0) + 500);
    }
    if (d.reveal) {
      playMorning(d.reveal);
      if (G().phase === ONW.PHASE.ONLINE_DAY) {
        const r = d.reveal;
        later(() => { dayKeys.forEach((k) => { if (held[k]) return; delete up[k]; delete glow[k]; }); dayKeys = []; paint(G()); }, morningDur(r) + (r.items ? 0 : 0) + 3500);
      }
    }
  };
  function show(k, role, lit) {
    const g = G();
    up[k] = role; if (lit) glow[k] = true;
    if (g.phase === ONW.PHASE.ONLINE_DAY) dayKeys.push(k); else { (g.morningUp = g.morningUp || []).push(k); if (g.phase === ONW.PHASE.ONLINE_MORNING && !g.settling) peekUp[k] = role; }   // 朝のうちにめくれた面は、待機時間になったら裏に戻す（待機時間に出す面は対象外）   // 昼に使った能力: 朝のように出しっぱなしにせず、数秒後に閉じる
    paint(g);
  }
  const morningHook = (kind) => { for (const id of ONW.roleIds()) { const d = ONW.roleDef(id); if (d && d.stageMorning && d.stageMorning.kind === kind) return d.stageMorning; } return null; };   // 朝の演出を持つ役職(各役職ファイルの stageMorning)
  function morningDur(r) {   // 朝の演出（playMorning）が終わるまでのおおよその時間(ms)
    if (r.kind === "peek") return (r.items.length - 1) * 450 + 1000;
    const h = morningHook(r.kind);
    return h ? h.dur(r) : 1000;
  }
  /** 朝の演出(playMorning と 後覚者の表)が終わって、結果の文章を出してよくなるまでの時間(ms) */
  function morningTextDelay(r, ins) {
    let end = 0;
    if (r) {
      const d = 700 + morningDur(r);
      end = d;
      if (r.muzzle) end = Math.max(end, d + 700 + 700);
      if (r.mates) end = Math.max(end, d + 200 + r.mates.ids.length * 380 + 500);
      if (r.peek) end = Math.max(end, d + 200 + r.peek.length * (r.gap || 340) + 500);
    }
    if (ins) end = Math.max(end, (r ? 700 + morningDur(r) : 300) + 700);
    return end + 500;   // めくれ終わって少し間をあけてから
  }
  function playMorning(r) {
    if (r.kind === "peek") r.items.forEach((it, i) => later(() => show(it.k, it.role), i * 450));
    if (r.thread) { later(() => threadShow(r.thread[0], r.thread[1]), r.items.length * 450 + 250); later(() => threadCutFx(), r.items.length * 450 + 250 + 3400); }   // 糸紡ぎ: ペアの2人が 🧵 でめくれたあと、白い糸でつなぐ（見えるのは選んだ人の画面だけ）
    else { const h = morningHook(r.kind); if (h) h.play(r, stage.kit); }
    // 墓荒らしで人狼系・狂信者・共有者を取ったとき: 交換の演出のあと、相方のカードが表になる（昼になるまで）
    // 墓荒らし・ドッペルゲンガーで口封じの狂人を手にしたとき: 交換・コピーの演出のあと（取ったと分かったあと）、ターゲットのカードが裏返ってミュートマークが出る（昼になるまで）
    if (r.muzzle) later(() => show(`p:${r.muzzle}`, MUTE_MARK, true), morningDur(r) + 700);
    if (r.mates) later(() => r.mates.ids.forEach((id, i) => later(() => show(`p:${id}`, r.mates.role), i * 380)), morningDur(r) + 200);
    // 墓荒らしで神・人狼系を取ったとき（見える系の共通形）: 交換のあと、夜の始まりに見えるはずの初期役職のカードが順に表になって光る（昼になるまで）
    if (r.peek) later(() => r.peek.forEach((it, i) => later(() => show(it.k, it.role, true), i * (r.gap || 340))), morningDur(r) + 200);
  }
  function swap(r, temp) {
    const mine = `p:${ONW.net.myId()}`, theirs = r.kind === "relic" ? `g:${r.target}` : `p:${r.target}`, el = $t();
    const a = el.querySelector(`[data-k="${mine}"] .tb-card`), b = el.querySelector(`[data-k="${theirs}"] .tb-card`);
    const reveal = () => {
      if (!temp) { show(mine, r.role); if (r.both) show(theirs, r.both.role); return; }   // 朝: 自分のカード（と、both のときは入れ替わった墓地のカードも同時に）表にする。temp は夜: 数秒だけ表にして伏せる
      up[mine] = r.role; paint(G());
      later(() => { delete up[mine]; paint(G()); }, 3000);
      later(() => { busy = false; paint(G()); }, 3700);
    };
    if (!a || !b || !a.animate) { reveal(); return; }
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dx = rb.left - ra.left, dy = rb.top - ra.top;
    const path = (x, y, lift) => [
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${x / 2}px,${y / 2 + lift}px) scale(1.2)`, offset: 0.5 },
      { transform: `translate(${x}px,${y}px) scale(1)` },
    ];
    a.style.zIndex = 6; b.style.zIndex = 5;
    const opt = { duration: 1000, easing: "ease-in-out", fill: "forwards" };
    const A = a.animate(path(dx, dy, -22), opt), B = b.animate(path(-dx, -dy, 22), opt);
    later(() => {                                   // 裏面は同じなので、元の席に戻すと入れ替わったまま見える
      A.cancel(); B.cancel(); a.style.zIndex = b.style.zIndex = "";
      if (ONW.sound) ONW.sound.se("deal");          // SE: 入れ替わった2枚が両方の席に着地する（2枚同時なので1回だけ）
      reveal();                                     // 新しい自分のカードが表に
    }, 1050);
  }

  // ---------------------------------------------------------
  // 役職ファイルの演出(stageNight / stageMorning)に渡す道具。up / glow などは試合ごとに作り直されるので、getter で「今の値」を返す
  // ---------------------------------------------------------
  stage.kit = {
    get up() { return up; }, get glow() { return glow; }, get lov() { return lov; }, get held() { return held; },
    get loveMate() { return loveMate; }, get nightKeys() { return nightKeys; },
    // 結果発表・昼の公開演出(stageResult / stageSettle / stageFlash / stageSober)用
    get dead() { return dead; }, get curse() { return curse; }, get badge() { return badge; }, get dkb() { return dkb; }, get shin() { return shin; }, get gx() { return gx; },
    get asn() { return asn; }, get bnt() { return bnt; }, get veil() { return veil; }, get alm() { return alm; }, get catv() { return catv; }, get curv() { return curv; }, get tbv() { return tbv; }, get tbh() { return tbh; }, get fqv() { return fqv; },
    get mindKeys() { return mindKeys; }, get senseKeys() { return senseKeys; }, senseMark: (key) => SENSE_PRE + key, get starKeys() { return starKeys; }, get queenKeys() { return queenKeys; }, get flashKeys() { return flashKeys; }, get queenFlashKeys() { return queenFlashKeys; }, get kingKeys() { return kingKeys; }, get kingFlashKeys() { return kingFlashKeys; },
    WOLF_MARK, FOX_MARK, TANUKI_MARK, FOXX_MARK, FOXSEE_MARK, deadMark, DUO_MARK, MASTER_MARK, BONE_MARK, TARGET_MARK, AVENGER_MARK, MUTE_MARK, HACK_MARK, LOVE_MARK, CUPID_MARK, DAUGHTER_MARK, SHIELD_MARK, THREAD_MARK, FLAT_MARK, COFFIN_MARK, BREAK_MARK, KEEP_MARK, KEYOPEN_MARK, KEYLOCK_MARK, KEYTURN_MARK, KEYTURNU_MARK, BLANK_MARK, BLANKX_MARK, SEAL_MARK, ELFRINDE_MARK, DARKFALL_MARK, COFFEE_PRE,
    /** 席 k のカードを左右に揺らす（失敗の演出。鍵師の「🔒に弾かれる」と同じ揺れ） */
    cosplay: { ensure: (c, f) => cosEnsure(c, f), clear: () => cosClear(), keep: (v) => { cosKeep = !!v; } },
    shake(k) { const el = $t(), card = el && el.querySelector(`[data-k="${k}"] .tb-card`); if (card && card.animate) card.animate([{ transform: "translateX(0)" }, { transform: "translateX(-9px) rotate(-4deg)" }, { transform: "translateX(9px) rotate(4deg)" }, { transform: "translateX(-6px) rotate(-2deg)" }, { transform: "translateX(0)" }], { duration: 520, easing: "ease-in-out" }); },
    /** 銀狼のハッキング演出: USBメモリがカード k に刺さり、ウイルスをインストールする。終わったら done を呼ぶ（そこで⚠️を出す） */
    hackUsb(k, done) {
      const t = $t(), card = t && t.querySelector(`[data-k="${k}"] .tb-card`);
      if (!card || !card.animate) { if (done) done(); return; }
      card.querySelectorAll(".tb-usb").forEach((e) => e.remove());
      const box = document.createElement("div"); box.className = "tb-usb"; box.setAttribute("aria-hidden", "true");
      box.innerHTML = `<i class="tb-usb__slot"></i><div class="tb-usb__stick"><i class="tb-usb__plug"></i><b class="tb-usb__body"><u></u></b></div><div class="tb-usb__term"><small class="tb-usb__msg">INSTALLING…</small><div class="tb-usb__bar"><i></i></div><small class="tb-usb__pct">0%</small></div>`;
      card.appendChild(box);
      const stick = box.querySelector(".tb-usb__stick"), term = box.querySelector(".tb-usb__term"), bar = box.querySelector(".tb-usb__bar i"), pct = box.querySelector(".tb-usb__pct"), msg = box.querySelector(".tb-usb__msg");
      const A = (el, kf, o) => el.animate(kf, Object.assign({ fill: "both", easing: "ease-out" }, o));
      A(stick, [{ transform: "translateX(125%)", opacity: 0 }, { transform: "translateX(6%)", opacity: 1, offset: .75 }, { transform: "translateX(0)", opacity: 1 }], { duration: 700 });       // ① 横から近づいて、カードの差し込み口に刺さる
      A(box.querySelector(".tb-usb__slot"), [{ opacity: 0 }, { opacity: 0, offset: .7 }, { opacity: 1 }], { duration: 700 });
      A(term, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: 820 });                                                                                                          // ② ターミナルが開く
      const T0 = 900, DUR = 1500;
      const t0 = performance.now();
      const tick = () => {   // ③ インストールの進行（0→100%）
        if (!box.isConnected) return;
        const p = Math.min(1, Math.max(0, (performance.now() - t0 - T0) / DUR)), v = Math.floor(p * p * (3 - 2 * p) * 100);
        bar.style.width = v + "%"; pct.textContent = v + "%";
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      later(() => { box.classList.add("is-done"); msg.textContent = "COMPLETE"; bar.style.width = "100%"; pct.textContent = "100%"; }, T0 + DUR + 40);
      later(() => {                                            // ④ USBメモリが抜けて、⚠️が出る
        A(stick, [{ transform: "translateX(0)", opacity: 1 }, { transform: "translateX(125%)", opacity: 0 }], { duration: 450, easing: "ease-in" });
        A(term, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
        A(box.querySelector(".tb-usb__slot"), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });   // 差し込み口の黒い印もUSBと一緒に消す
        later(() => { if (done) done(); }, 250);
      }, T0 + DUR + 520);
      setTimeout(() => box.remove(), T0 + DUR + 1100);        // 試合が切り替わってタイマーが止まっても、残らないように
    },
    later, paint, show, swap, G, $t, esc, setCap, gxStars, face: faceHtml, breakHtml,
    /** 札を付けた席の一覧(starKeys など)から、席 k を取り除く(その場で書き換える) */
    pull(arr, k) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] === k) arr.splice(i, 1); },
  };

  // ---- 恋人: 夜の始まりに相方のカードが❤️でめくれる → 夜時間の間ずっと開いたまま ----
  function lovePeek(r) {
    const k = `p:${r.id}`;
    if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
    up[k] = LOVE_MARK; glow[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G());
  }

  // ---------------------------------------------------------
  // 結果: 票数 → つられた人が表に → 全員が表に → 結果発表
  // ---------------------------------------------------------
  /** 勝利演出の字幕・追加勝利の札: 折り返さず、横にはみ出すときだけ文字サイズを縮めて収める */
  function fitResCap() {
    const c = document.getElementById("res-cap"); if (!c) return;
    const w = c.clientWidth; if (!w) return;
    c.querySelectorAll(".rs-win, .rs-extra__chip").forEach((el) => {
      el.style.fontSize = "";
      let fs = parseFloat(getComputedStyle(el).fontSize) || 16;
      for (let n = 0; n < 40 && el.scrollWidth > w && fs > 8; n++) { fs -= 1; el.style.fontSize = fs + "px"; }
    });
  }
  function setCap(html) {
    const g = G(); g.resultCap = html;
    const c = document.getElementById("res-cap");
    if (c) { c.innerHTML = html; c.classList.remove("res-pop"); void c.offsetWidth; c.classList.add("res-pop"); fitResCap(); }
  }
  const winTeamCls = (t) => (t.startsWith("村人") ? "village" : t.startsWith("人狼") ? "wolf" : t.startsWith("恋人") ? "lover" : "third");
  /** 勝利の貼り重ね（res.ladder。docs/win-ladder.md）: 乗っ取られた下の勝利を、小さく・薄く・取り消し線で上に残す。最終結果（梯子の最後の段）と今の結果が同じときだけ（チキンの逆転・愉快犯のあとは出さない） */
  const ladderUnder = (res) => { const lad = res.ladderOff ? [] : (res.ladder || []); return lad.length >= 2 && lad[lad.length - 1].title === res.title ? lad.slice(0, -1).map((st) => `<div class="rs-win rs-under t-${winTeamCls(st.title)}">${esc(st.title)}</div>`).join("") : ""; };
  function winHtml(res, fresh) {
    return `${ladderUnder(res)}<div class="rs-win t-${winTeamCls(res.title)}${fresh && !res.ladderOff && (res.ladder || []).length > 1 ? " rs-paste" : ""}">${esc(res.stageTitle || res.title)}</div>`;   // 勝利演出の字幕は stageTitle（追加勝利の「＆〇〇」なし）。ladderUnder の突き合わせ・結果シートは res.title のまま
  }
  /** 追加勝利の役職（res.extraWin。勝利陣営の字幕のあとに、1つずつ貼り足していく。docs/extra-win-fx.md）。n 個目までを字幕の下に並べる。g.resultCap にも足すので、再描画しても消えない */
  let winNoteHtml = "";   // 勝利字幕のあとに出す一言（神官の祈り）。addExtraWin が再描画のとき字幕と札のあいだに入れる
  function addExtraWin(res, n) {
    const g = G(), list = res.extraWin || [];
    const chip = (x) => `<span class="rs-extra__chip">＋ <b>${esc(x.role ? ONW.roles.getInfo(x.role).name : "")}</b></span>`;   // 役職名だけ（プレイヤー名は出さない。OJv26.11.15-10）
    g.resultCap = `${winHtml(res)}${winNoteHtml}<div class="rs-extra"><div class="rs-extra__h">追加勝利</div>${list.slice(0, n).map(chip).join("")}</div>`;   // winNoteHtml: 神官の「祈りにより〜」（勝利字幕と追加勝利の札のあいだ）
    if (list[n - 1] && !gx[`p:${list[n - 1].id}`]) { gx[`p:${list[n - 1].id}`] = "extra"; paint(G()); }   // 追加勝利で勝った人のカードは、陣営の色（村人の緑など）から追加勝利の色（橙）になる
    const c = document.getElementById("res-cap"); if (!c || !list[n - 1]) return;
    let w = c.querySelector(".rs-extra");
    if (!w) { c.insertAdjacentHTML("beforeend", `<div class="rs-extra"><div class="rs-extra__h">追加勝利</div></div>`); w = c.querySelector(".rs-extra"); }
    w.insertAdjacentHTML("beforeend", chip(list[n - 1]));
    fitResCap();
  }
  /** 勝利の貼り重ね（res.ladder。docs/win-ladder.md）: 下の勝利から順に、上へ貼り付けられていく。貼られた勝利は、次の勝利に重ねられて小さく・薄く・取り消し線になる（追加勝利は途中の段では出さない）。最後の段（最終結果）は従来の字幕が出す（winHtml が下の勝利を残す） */
  const ladderPasteHtml = (lad, i) => `${lad.slice(0, i).map((x) => `<div class="rs-win rs-under t-${winTeamCls(x.title)}">${esc(x.title)}</div>`).join("")}<div class="rs-win rs-paste t-${winTeamCls(lad[i].title)}">${esc(lad[i].title)}</div>`;
  function playLadder(res, R) {
    const lad = res.ladder || []; if (res.ladderOff || lad.length < 2) return;   // 設定でOFFのときは出さない
    for (let i = 0; i < lad.length - 1; i++) {
      later(() => { const html = ladderPasteHtml(lad, i), g = G(), c = document.getElementById("res-cap"); g.resultCap = html; if (c) { c.innerHTML = html; fitResCap(); } }, R.t); R.t += 1400;   // この段の勝利を貼る（コンテナのポップなし。前の勝利は重ねられて薄くなる）
    }
    R.t += 200;   // 最後の段（最終結果）は、このあとの従来の字幕が貼る
  }
  /** 結果発表の骨組み。役職ごとの演出は各役職ファイルの stageResult(下の hk(...) で呼ぶ)。R.t = 演出の現在時刻(ms)で、フックが進める */
  function startResult(g) {
    seq = true; winNoteHtml = "";
    libraTilt = "level";   // 天秤: 結果発表の最初は水平（票数バッジのあとに傾く）
    const res = g.result, P = (id) => `p:${id}`;
    g.revRes = {}; res.history.forEach((h) => { if (h.rev > 0) g.revRes[P(h.id)] = h.rev; });   // 反転者: 反転された人のカードは、めくれるとき180度回転した状態で公開
    const order = res.chainOrder || [];
    const HK = {}, hk = (key) => HK[key] || (HK[key] = ONW.roleHooksIn("stageResult", key));
    const skipIds = new Set(); hk("execExclude").forEach((h) => (h.fn(res) || []).forEach((id) => skipIds.add(id)));   // 通常の追放フリップから除く人（身代わりになった従者: 二重にめくらない）
    const exec = res.history.filter((h) => h.dead && h.cause !== "chain" && !skipIds.has(h.id) && !h.dukeDead);   // 魔界公爵追放会議で死んだ人(公爵・身代わりの従者)は、追放会議の場面(demon_duke.js)でめくれる
    const chain = res.history.filter((h) => h.cause === "chain" && h.kind !== "queen" && !h.late).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const lateDeaths = res.history.filter((h) => h.cause === "chain" && h.kind !== "queen" && h.late).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));   // 王国滅亡のあとで死んだ人（心中など）
    const kingdom = res.history.filter((h) => h.cause === "chain" && h.kind === "queen");   // 王国滅亡: 女王が倒れて、一斉にめくれる村人陣営
    const loverNo = {}; res.history.forEach((h) => { if (h.lover) loverNo[h.id] = h.loverNos && h.loverNos.length > 1 ? h.loverNos : h.loverNo || true; });
    const shufNo = {}; res.history.forEach((h) => { if (h.shuf) shufNo[h.id] = true; });
    const keepNo = {}; res.history.forEach((h) => { if (h.keep) keepNo[h.id] = true; });
    const drunkNo = {}; res.history.forEach((h) => { if (h.drunk) drunkNo[h.id] = true; });   // 酔っ払い: めくれたカードの丸い🍺
    const cocktailNo = {}; res.history.forEach((h) => { if (h.cocktail) cocktailNo[h.id] = true; });   // バーテンダー: カクテルで酔った人は🍺ではなく🍸のバッジ
    const promNo = {}; res.history.forEach((h) => { if (h.prom) promNo[h.id] = true; });   // 昇格した狂人(最終段階に (+人狼) が付いた人): めくれたカードの右上に丸い🐺   // 悪女のキープ: めくれたカードの右上に丸い♡
    const lovOn = (id) => { if (loverNo[id]) lov[P(id)] = loverNo[id]; if (shufNo[id]) shuf[P(id)] = true; if (keepNo[id]) kp[P(id)] = true; if (promNo[id]) wf[P(id)] = true; if (drunkNo[id]) bd[P(id)] = true; if (cocktailNo[id]) bdCk[P(id)] = true; };   // 結果でめくれる恋人のカードは、右上に丸いハート
    const dayDead = res.history.filter((h) => h.day && !h.dead).sort((a, b) => (a.dayN ?? 99) - (b.dayN ?? 99));   // 昼中に死んでいる人（呪殺・後追い・死亡）: 生存者が一斉にめくれる前に、1人ずつめくれる
    const rest = [...res.history.filter((h) => !h.dead && !h.day).map((h) => [P(h.id), h.role, h.id]), ...res.grave.map((c, i) => [`g:${i}`, c.role])];
    // 役職ファイルに渡す道具箱(stage.kit に、この結果の情報を足したもの)
    //   t = 演出の現在時刻 / subN = 身代わりの数 / noFlip = ほかの演出が重なるので2回目の裏返しをしない席(flipped フックが書く) / restEnd = 全員めくれ終わる時刻 / noBlow = 負けた人のカードを吹き飛ばさない
    const R = Object.create(stage.kit);
    Object.assign(R, { g, res, P, exec, chain, lateDeaths, kingdom, rest, lovOn, t: 600, subN: 0, guardN: 0, noFlip: new Set(), restEnd: 0, noBlow: false });
    // 同時にめくれた「別のアサシン・賞金稼ぎ」は、アサシン・賞金稼ぎ本人の画面で「？」のまま、その人の演出が始まるまで（または全部の演出が終わるまで）本当の役職を見せない（関係ない人の画面は選択待ちのときから本当の役職で見えているので、そのまま）
    //   （選んだ人の画面だけ「？」だと、反応でアサシン・賞金稼ぎ本人が分かり、マーリンや人狼に透けるため。観戦者は全員の役職が見えるので対象外）
    veil = {};
    { const me = ONW.net.myId(), SP = (r) => r === ONW.ROLE.ASSASSIN || r === ONW.ROLE.BOUNTY_HUNTER;
      const meH = res.history.find((h) => h.id === me), meSP = !!meH && SP(meH.role === "mimic_wolf" ? ((g.mimicView || {})[P(me)] || meH.role) : meH.role);   // 自分がアサシン・賞金稼ぎ（模倣含む）か。関係ない人の画面は、選択待ちのときと同じく、めくれたアサシン・賞金稼ぎを本当の役職のままにする（「アサシン」と出てから「？」に変わらない）
      if (meSP && !g.isSpectator && !hostWatching(g)) [...exec, ...chain, ...lateDeaths].forEach((h) => { if (h.id !== me && SP(h.role === "mimic_wolf" ? ((g.mimicView || {})[P(h.id)] || h.role) : h.role)) veil[P(h.id)] = true; }); }   // 模倣の人狼がアサシンを模倣していても、アサシンと同じ扱い（模倣先が分かっているときだけ。ホスト・観戦者は全員分見える）
    const flipped = (hs, at, kind) => { R.noFlip = new Set(); return hk("flipped").reduce((n, h) => n + (h.fn(R, hs, at, kind) || 0), 0); };
    R.flipped = flipped;   // 追放・道連れでめくれた人に重なる演出(処刑人のギロチン・猫の裏返し)。返り値 = 足す待ち時間
    const opened = hk("open").reduce((o, h) => h.fn(R) || o, false);   // 独裁処刑: 投票の結果の代わりに、独裁者のカードがめくれて独裁を宣言する演出（独裁者の役職ファイル）
    if (opened) { /* 投票の字幕・票数は出さない */ } else if (res.foxVote) {   // 妖狐投票の結果を先に見せる（マイクラ版と同じ順。カードは妖狐投票のときにめくれ済み）
      const fx = res.foxVote;
      setCap(`<div class="res-cap__t">妖狐投票</div><div>${fx.executed.length ? `追放: ${fx.executed.map((e) => esc(e.name)).join("、")}` : "妖狐は追放されませんでした"}</div>`);
      R.t += 2200;
      later(() => setCap(`<div class="res-cap__t">投票の結果</div>`), R.t - 300);
    } else setCap(`<div class="res-cap__t">投票の結果</div>`);
    if (!opened) {
      hk("preCounts").forEach((h) => h.fn(R));   // 票数が出る前のフック（盗賊の演出は昼の盗んだ瞬間に移したので、いまは使う役職なし。フックだけ残す）
      // 御乱心がいる試合は、最初に出す票数は「書き換え前（元の投票）」の票数（res.goranshin.steps[0]。票が動く演出は goranshin.js の counts フック。ペンギンの滑る前の票数は、御乱心のあとの票数）。
      // ペンギンがいる試合は、最初に出す票数は「滑る前」の票数（res.slideSteps[0]。滑る演出は penguin.js の counts フック）。交換者がいる試合は「入れ替え前」の票数（res.countSteps[0]）。妖精さんだけがいる試合は「バリア前」の票数（res.fairy.steps[0]。🧚が票を減らす演出は fairy.js の counts フック）。入れ替わる演出は下の counts フック（交換者の役職ファイル）
      const shown0 = res.goranshin && res.goranshin.steps && res.goranshin.steps[0] ? res.goranshin.steps[0].filter((c) => c.c > 0).sort((a, b) => b.c - a.c) : res.slides && res.slides.length && res.slideSteps && res.slideSteps[0] ? res.slideSteps[0].filter((c) => c.c > 0).sort((a, b) => b.c - a.c) : res.exchanges && res.exchanges.length && res.countSteps && res.countSteps[0] ? res.countSteps[0].filter((c) => c.c > 0).sort((a, b) => b.c - a.c) : res.fairy && res.fairy.steps && res.fairy.steps[0] ? res.fairy.steps[0].filter((c) => c.c > 0).sort((a, b) => b.c - a.c) : res.counts;
      const shown = [...shown0, ...hk("extraCounts").flatMap((h) => h.fn(R) || [])].sort((a, b) => b.c - a.c);   // 番犬の飼い主: 票は無効だが、ほかの人と同じように「N票」と出す
      shown.forEach((c, i) => later(() => { badge[P(c.id)] = `${c.c}票`; paint(G()); }, R.t + i * 350));
      R.t += shown.length * 350 + 1000;
      hk("counts").forEach((h) => h.fn(R));   // 交換者: 票数が出たあと（めくる前）に、交換する2人の票数が動いて入れ替わる（使った順に1回ずつ）
      if (res.libra) { const tl = libraTiltOf(res); later(() => { libraTilt = tl; paint(G()); }, R.t); R.t += 2600; }   // 天秤: 票数バッジ(と交換・ペンギン)のあと、つられた皿が下がる。この間はまだカードをめくらない（めくる演出は R.t のあと）
    }
    hk("intro").forEach((h) => h.fn(R));   // 従者の身代わり: ご主人のカードがめくれそうになる → 従者のカードが表になる
    // 番犬の噛殺: 票のあと、飼い主のカードが震えて噛み付く演出。そのあと、同時に追放される人がいればその人と【同時に】「噛殺」の札が出てめくれる（いなければ、噛み付いたあとすぐに）
    const byOf = (h) => h.kind === "bite" && (h.bys || []).length > 1 ? h.bys.map(esc).join("、") : esc(h.by);   // 同時噛み: 噛んだ犬全員の名前（番犬A、模倣番犬B → 飼い主）
    const bites = chain.filter((h) => h.kind === "bite" && !h.sub && !(res.watchdogs || []).some((x) => x.back && x.byId === h.id)), chainRest = chain.filter((h) => !bites.includes(h));   // ネコカボチャの噛み返しで死ぬ番犬(噛み付いた側が先に噛殺されている)は、道連れと同じ連鎖で、そのあとに1人だけでめくれる(chainRest → flipChain)
    if (bites.length) {
      const bt0 = R.t; let bEnd = 0;
      bites.forEach((h) => { const n = hk("biteFx").reduce((m, x) => m + (x.fn(R, h) || 0), 0); bEnd = Math.max(bEnd, n); });   // 同時に噛み殺された人たちは、いっせいに噛み付かれる
      R.t = bt0 + bEnd;
    }
    const stvRes = res.history.some((h) => h.steve === "result");   // 結果発表で復活するスティーブがいる（噛殺・爆殺・独裁処刑の本人は exec / chain から外れているので、下の「誰も追放されませんでした」は出さない。演出は下の steve の場面が出す）
    const bmbSet = new Set(((res.bomber || {}).bombers || []).map((x) => x.id)), bmbSelf = (id) => bmbSet.has(id), bmbArrow = (id, base) => (bmbSelf(id) ? `[${base}]→[自爆]` : base);   // 道化の爆弾魔: 吊られた爆弾魔は自爆する（死因は「爆殺」）
    const bombN = exec.filter((h) => bmbSelf(h.id));
    // 同じ爆弾魔の爆発で爆殺される人（連鎖の行 kind "bomb"）: 爆弾魔の自爆と【同時に】爆発してめくれる。そのあとで、心中・後追い（連鎖の続き）が出る
    const bmbVic = {};
    ((res.bomber || {}).bombers || []).forEach((x) => { bmbVic[x.id] = chain.filter((h) => h.kind === "bomb" && (x.ids.includes(h.id) || (x.subs || []).includes(h.id)) && !bmbSet.has(h.id)); });
    const bmbVicIds = new Set(Object.values(bmbVic).flat().map((h) => h.id)), bmbDone = new Set();
    const blastFlip = (hs, t) => {   // 爆殺される人たちを、時刻 t にいっせいにめくる（カードの爆発 gx は呼び出し側）
      hs.forEach((h) => bmbDone.add(h.id));
      if (!hs.length) return 0;
      later(() => { hs.forEach((h) => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); shin[P(h.id)] = true; dead[P(h.id)] = true; badge[P(h.id)] = h.sub ? "身代わり" : "爆殺"; }); paint(G()); }, t);
      return flipped(hs, t, "chain");
    };
    const bombVicExec = bombN.flatMap((h) => bmbVic[h.id] || []);
    const execLab = (h) => (h.duke ? "魔界断罪" : h.curseKill ? "呪殺" : h.mental ? "メンタル崩壊" : h.shock ? "ショック死" : h.execTg && !h.execLate ? "処刑" : h.bounce ? "とばっちり" : h.dict ? (h.coup ? "クーデター" : "独裁処刑") : "追放");
    // 自爆: 爆弾魔が普通にめくれたあと、カードが赤く震え → 爆発の瞬間にバッジが「追放」から「自爆」に切り替わる（字幕は「[追放]→[自爆]」）。投票していて生きていた人は、この爆発で同時に爆発してめくれる（先に死んでいた人は爆発しない）
    const selfBlast = (hs, vics, capHtml, labOf) => {
      const all = [...hs, ...vics], t0 = R.t;
      later(() => { setCap(capHtml); all.forEach((x) => { gx[P(x.id)] = "bomb"; }); paint(G()); }, t0);
      later(() => { all.forEach((x) => { gx[P(x.id)] = "boom"; }); if (ONW.sound) ONW.sound.se("bomb"); hs.forEach((x) => { badge[P(x.id)] = labOf(x); }); paint(G()); }, t0 + 1300);   // SE: 爆弾魔の爆発
      const vf = blastFlip(vics, t0 + 1300);
      later(() => { all.forEach((x) => { delete gx[P(x.id)]; }); paint(G()); }, t0 + 2900);
      R.t = t0 + 3300 + vf;
    };
    later(() => {
      if ((R.subN || R.guardN || stvRes) && !exec.length && !bites.length) return;   // 追放されたのが身代わりの従者だけなら、字幕はそのまま（「誰も追放されませんでした」にしない）
      exec.forEach((h) => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); dead[P(h.id)] = true; badge[P(h.id)] = execLab(h); });   // 吊られた爆弾魔も、まず普通に「追放」でめくれる（自爆はそのあと）
      bites.forEach((h) => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); shin[P(h.id)] = true; dead[P(h.id)] = true; badge[P(h.id)] = "噛殺"; });   // 噛殺される人も、追放される人と同時にめくれる
      const biteCap = bites.length ? `<div class="res-cap__t t-wolf">${bites.some((h) => (h.bys || []).length > 1) ? "同時に噛殺" : "噛殺"}</div><div>${bites.map((h) => `${byOf(h)} → ${esc(h.name)}`).join("、")}</div>` : "";   // 賞金稼ぎのターゲット(execLate)は、めくれたときは「追放」。賞金稼ぎの外れが出たあとのギロチンで「処刑」に変わる
      const coupN = exec.filter((h) => h.coup && !h.mental && !h.shock), dictN = exec.filter((h) => h.dict && !h.coup && !h.mental && !h.shock && !h.curseKill), execN = exec.filter((h) => !h.mental && !h.shock && !h.dict && !h.curseKill), mentalN = exec.filter((h) => h.mental), shockN = exec.filter((h) => h.shock), curseN = exec.filter((h) => h.curseKill);
      setCap(exec.length || bites.length ? `${coupN.length ? `<div class="res-cap__t t-wolf">クーデター</div><div>${coupN.map((h) => esc(h.name)).join("、")}</div>` : ""}${dictN.length ? `<div class="res-cap__t t-wolf">独裁処刑</div><div>${dictN.map((h) => esc(h.name)).join("、")}</div>` : ""}${execN.length ? `<div class="res-cap__t t-wolf">追放</div><div>${execN.map((h) => esc(h.name)).join("、")}</div>` : ""}${curseN.length ? `<div class="res-cap__t t-wolf">呪殺</div><div>${curseN.map((h) => `${h.curseBy ? `${esc(h.curseBy)} → ` : ""}${esc(h.name)}`).join("、")}</div>` : ""}${mentalN.length ? `<div class="res-cap__t t-wolf">メンタル崩壊</div><div>${mentalN.map((h) => esc(h.name)).join("、")}</div>` : ""}${shockN.length ? `<div class="res-cap__t t-wolf">ショック死</div><div>${shockN.map((h) => esc(h.name)).join("、")}</div>` : ""}${biteCap}` : `<div class="res-cap__t">誰も追放されませんでした</div>`);
      paint(G());
    }, R.t);
    const exFx = flipped(exec, R.t, "exec"), biteFxT = bites.length ? flipped(bites, R.t, "chain") : 0;
    R.t += (exec.length || bites.length ? 3200 : R.subN || R.guardN || stvRes ? 300 : 1500) + Math.max(exFx, biteFxT);
    if (bombN.length) selfBlast(bombN, bombVicExec, `<div class="res-cap__t t-wolf">${bmbArrow(bombN[0].id, execLab(bombN[0]))}</div><div>${bombN.map((h) => esc(h.name)).join("、")}</div>${bombVicExec.length ? `<div class="res-cap__t t-wolf">爆殺</div><div>${bombVicExec.map((h) => esc(h.name)).join("、")}</div>` : ""}`, (h) => "自爆");   // バッジは「追放」→ 爆発の瞬間に「自爆」へ切り替わる（「[追放]→[自爆]」だと長くて他のバッジと重なるため。字幕の矢印はそのまま）
    // 一目惚れしてるてるが先にめくれ、そのあとで道連れにされた人が1人ずつ無理心中でめくれる
    // わら人形・猫又・黒猫・ネコカボチャが追放された場合も同じ演出で、めくれた順(連鎖の順)に1人ずつ「道連れ」でめくれる
    const flipChain = (h) => {
      if (h.kind === "bite") R.t += hk("biteFx").reduce((n, x) => n + (x.fn(R, h) || 0), 0);   // 番犬の噛殺: 票のあと、カードの裏から番犬のカードが出て噛み付く（そのあとで字幕・めくれる）
      if (h.kind === "thread" && h.thread) {   // 糸紡ぎの後追い（作者指定）: 全員の画面で、ペアをつなぐ白い糸が見えて → 糸が切れて → 後追いする
        const th = h.thread, t0 = R.t;
        later(() => { setCap(`<div class="res-cap__t t-third">糸紡ぎ</div><div>${esc(th.deadName)} と ${esc(h.name)} をつなぐ白い糸が…</div>`); threadShow(th.a, th.b); }, t0);
        later(() => { threadCutFx(); }, t0 + 1800);
        R.t += 2600;
      }
      const lab0 = h.sub ? "身代わり" : h.kind === "tomo" ? "道連れ" : h.kind === "bite" ? "噛殺" : h.kind === "bomb" ? "爆殺" : h.kind === "lovers" ? "心中" : h.kind === "follow" || h.kind === "thread" ? "後追い" : "無理心中", lab = lab0;   // 爆弾魔も、まず元の死因（道連れ・心中など）で普通にめくれる
      later(() => {
        setCap(`<div class="res-cap__t t-wolf">${lab}</div><div>${h.sub ? `${esc(h.by)} → ${esc(h.sub)} の身代わり: ` : (h.kind === "tomo" || h.kind === "follow" || h.kind === "thread" || h.kind === "bite" || h.kind === "bomb") && h.by ? `${byOf(h)} → ` : h.kind === "lovers" && h.by ? `${esc(h.by)} ❤ ` : ""}${esc(h.name)}</div>`);
        if (ONW.sound) { if (h.kind === "tomo") ONW.sound.se("chain"); else if (h.kind === "lovers" || h.kind === "follow" || h.kind === "thread") ONW.sound.se("follow_death"); }   // SE: 道連れ / 心中・後追い
        shin[P(h.id)] = true; dead[P(h.id)] = true; badge[P(h.id)] = lab; paint(G());
      }, R.t);
      if (bmbSelf(h.id) || h.kind === "bomb") {   // 道化の爆弾魔: 爆殺されるカード。道連れ・心中で死んだ爆弾魔の自爆は、投票していた人と同時に爆発する（吊られた爆弾魔は上の自爆の演出）
        if (bmbSelf(h.id)) {   // 道連れ・心中で死んだ爆弾魔: 先に普通にめくれて、そのあと自爆（投票していて生きていた人が同時に爆発）
          later(() => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); paint(G()); }, R.t);
          const fx0 = flipped([h], R.t, "chain");
          R.t += 2200 + fx0;
          const vic = (bmbVic[h.id] || []).filter((x) => !bmbDone.has(x.id));
          selfBlast([h], vic, `<div class="res-cap__t t-wolf">${bmbArrow(h.id, lab0)}</div><div>${h.by && (h.kind === "tomo" || h.kind === "follow") ? `${byOf(h)} → ` : h.kind === "lovers" && h.by ? `${esc(h.by)} ❤ ` : ""}${esc(h.name)}</div>${vic.length ? `<div class="res-cap__t t-wolf">爆殺</div><div>${vic.map((x) => esc(x.name)).join("、")}</div>` : ""}`, (x) => "自爆");   // バッジは爆発の瞬間に「道連れ」などから「自爆」へ切り替わる
          return;
        }
        const all = [h];   // 爆殺されるカード（先に出る念のための経路）: 震えて爆発してめくれる
        later(() => { all.forEach((x) => { gx[P(x.id)] = "bomb"; }); paint(G()); }, R.t);
        later(() => { all.forEach((x) => { gx[P(x.id)] = "boom"; }); if (ONW.sound) ONW.sound.se("bomb"); paint(G()); }, R.t + 1300);   // SE: 爆弾魔の爆発
        later(() => { all.forEach((x) => { delete gx[P(x.id)]; }); paint(G()); }, R.t + 2900);
      }
      later(() => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); paint(G()); }, R.t + 1300);   // 演出のあとでカードが表に（神の祝福なら、めくれたときからキラキラ）
      const fx = flipped([h], R.t + 1300, "chain");   // 道連れ・心中で死んだターゲット(処刑人)・めくれた猫も、追放された人と同じ扱い
      R.t += 3400 + fx;
    };
    chainRest.filter((h) => !bmbVicIds.has(h.id)).forEach(flipChain);   // 噛殺は上で追放と同時にめくれた / 爆殺される人は爆弾魔の自爆と同時（blastFlip）
    if (kingdom.length && ONW.sound) later(() => ONW.sound.se("follow_death"), R.t);   // SE: 王国滅亡
    hk("kingdom").forEach((h) => h.fn(R));   // 王国滅亡: 女王が追放・道連れで倒れたあと、他の村人陣営のカードが全員同時にめくれる
    chain.filter((h) => bmbVicIds.has(h.id) && !bmbDone.has(h.id)).forEach(flipChain);   // 念のため: 爆弾魔の自爆の演出に入らなかった爆殺の人は、1人ずつ爆発してめくれる
    lateDeaths.forEach(flipChain);   // 王国滅亡で倒れた人の相方など、王国滅亡のあとで死んだ人（心中）
    hk("assassin").forEach((h) => h.fn(R));   // アサシン: 暗殺者のカードが光り、狙われた相手に照準 → 斬撃 → カードが表になってマーリンかどうかが分かる
    hk("bounty").forEach((h) => h.fn(R));   // 賞金稼ぎ: 選ばれたカードが手配書に変わり、顔写真の位置に 成功=狼マーク / 失敗=バツマーク
    if (Object.keys(veil).length) {   // 演出に出なかった（誰にも選ばれず、自分でも選ばなかった）アサシン・賞金稼ぎのカード: 全部の演出が終わったここで、いったん裏返ってから本当の役職でめくれる（表のまま中身が切り替わる「点滅」にしない）
      const ks = Object.keys(veil);
      later(() => { ks.forEach((k) => { if (veil[k]) veil[k] = "down"; }); paint(G()); }, R.t);
      later(() => { ks.forEach((k) => { delete veil[k]; }); paint(G()); }, R.t + 800);
      R.t += 1600;
    }
    hk("bountyAfter").forEach((h) => h.fn(R));   // 賞金稼ぎが外れたあと: 賞金稼ぎがターゲットの処刑人のギロチン（処刑人勝利）
    dayDead.forEach((h) => {   // 昼中に死んでいる人が先にめくれる（呪殺された妖狐は🦊の灰色から本来の役職へ）
      const lab = h.dayLabel || "死亡";
      if (h.thread) {   // 糸紡ぎの後追いで昼に死んだ人: めくれる前に、全員の画面で白い糸が見えて切れる（作者指定）
        const th = h.thread, t0 = R.t;
        later(() => { setCap(`<div class="res-cap__t t-third">糸紡ぎ</div><div>${esc(th.deadName)} と ${esc(h.name)} をつなぐ白い糸が…</div>`); threadShow(th.a, th.b); }, t0);
        later(() => { threadCutFx(); }, t0 + 1700);
        R.t += 2400;
      }
      const wasGray = !!curse[P(h.id)];   // 呪殺・後追いなどで、待機時間から🦊や灰色の面のまま残っているカード
      later(() => { setCap(`<div class="res-cap__t t-wolf">${lab}</div><div>${h.dayKind === "fox" ? "" : h.dayBy ? `${esc(h.dayBy)} → ` : ""}${esc(h.name)}</div>`); delete curse[P(h.id)]; dead[P(h.id)] = true; badge[P(h.id)] = lab; if (wasGray) delete up[P(h.id)]; else up[P(h.id)] = h.role; lovOn(h.id); paint(G()); }, R.t);   // 灰色の面は、いったん裏返ってから…
      if (wasGray) later(() => { up[P(h.id)] = h.role; paint(G()); }, R.t + 800);   // …役職名の面でもう一度めくれる（表のまま中身が切り替わる「点滅」にしない）
      R.t += 2200;
    });
    const stvDay = new Set(res.history.filter((h) => h.steve === "day").map((h) => h.id));   // 昼に復活したスティーブ（結果発表では、めくれたときに［復活］の札）
    res.history.filter((h) => h.steve === "result").forEach((h) => {   // スティーブ: 結果発表で死ぬはずだったのが、不死のトーテムで復活（死因でめくれる → トーテム → 復活の札）
      const k = P(h.id), lab = h.steveLabel || "死亡";
      if (h.steveReason === "bite") R.t += hk("biteFx").reduce((n, x) => n + (x.fn(R, { id: h.id, name: h.name }) || 0), 0);   // 噛殺で死ぬはずだった: 通常の噛殺と同じ、飼い主のカードが震えて番犬が噛み付く演出（そのあと死因でめくれる）
      const byTxt = (h.steveReason === "bite" || h.steveReason === "bomb") && (h.steveBys || []).length ? `${h.steveBys.map(esc).join("、")} → ` : "";
      if (h.steveReason === "bomb") {   // 爆殺で死ぬはずだった: 通常の爆殺と同じ、カードが赤く震え → 爆発してめくれる（爆弾魔の自爆はすでに終わっているので、この人は1人で爆発する）
        const bt = R.t;
        later(() => { setCap(`<div class="res-cap__t t-wolf">爆殺</div><div>${byTxt}${esc(h.name)}</div>`); gx[k] = "bomb"; paint(G()); }, bt);
        later(() => { gx[k] = "boom"; if (ONW.sound) ONW.sound.se("bomb"); paint(G()); }, bt + 1300);   // SE: 爆弾魔の爆発（スティーブが爆殺されかける場面）
        later(() => { delete gx[k]; paint(G()); }, bt + 2400);
        R.t = bt + 1300;   // めくれるのは爆発の瞬間
      }
      later(() => { setCap(`<div class="res-cap__t t-wolf">${esc(lab)}</div><div>${byTxt}${esc(h.name)}</div>`); dead[k] = true; badge[k] = lab; up[k] = h.role; lovOn(h.id); paint(G()); }, R.t);
      later(() => { stage.totem({ name: h.name }); }, R.t + 1300);
      later(() => { setCap(`<div class="res-cap__t">復活</div><div>${esc(h.name)}</div>`); delete dead[k]; delete up[k]; badge[k] = "復活"; paint(G()); }, R.t + 1300 + TOTEM_PEAK_MS);   // 復活したらカードはいったん裏面に戻る（生存者が一斉にめくれる rest で、他の生存者といっしょに表になる）
      R.t += 1300 + TOTEM_MS + 300;
    });
    hk("duke").forEach((h) => h.fn(R));   // 魔界公爵追放会議: 追放・連鎖・昼の死亡のあと、生存者が一斉にめくれる「結果発表」の前に。票数バッジ(黒) → 成功=カードがめくれて魔界公爵(魔界断罪) / 失敗=めくれそうになって、めくれない（res.duke）
    later(() => setCap(`<div class="res-cap__t">結果発表</div>`), R.t);
    rest.forEach(([k, r, hid], i) => later(() => {
      up[k] = r; if (hid) lovOn(hid);
      if (hid && stvDay.has(hid)) badge[k] = "復活";   // 昼に復活したスティーブ
      hk("restUp").forEach((x) => x.fn(R, k, hid));   // 生存している神がめくれると、ファーンと神が降臨する
      paint(G());
    }, R.t + 500 + i * 320));
    R.restEnd = R.t + 500 + rest.length * 320 + 700;
    hk("rest").forEach((h) => h.fn(R));   // めくられずに残っていた猫（追放されなかった猫）も、1票以上入っていれば、めくれたあとにもう一度裏返る
    R.t = R.restEnd;
    hk("afterRest").forEach((h) => h.fn(R));   // 神降臨の余韻 / 神の祝福（全員めくれたあと、負けた人が吹き飛ばされ、残りの人が祝福で勝つ）
    const sndDetT0 = R.t; hk("detective").forEach((h) => h.fn(R));   // 名探偵: 全員がめくれ終わったあと、名探偵の盤面（推理した役職名の裏面のカード）を全員に見せ、列ごとにめくって答え合わせ（⭕/✖）。バランサーより優先度が上なので先に出す
    const sndBalT0 = R.t; hk("balancer").forEach((h) => h.fn(R));   // バランサー: 全員がめくれ終わったあと・最終結果の前に、シーソーの天秤（チキン・模倣チキンの逆転があるときは、バランサー勝利を出してから逆転するので、逆転演出の前に出す）
    if (ONW.sound) {   // BGM: 名探偵の答え合わせ / バランサーの天秤の演出中は専用の曲に固定し、終わったら結果発表の曲へ戻す
      const detAdv = sndBalT0 > sndDetT0, balAdv = R.t > sndBalT0;
      if (detAdv) later(() => ONW.sound.hold("detective"), sndDetT0);
      if (balAdv) later(() => ONW.sound.hold("balancer"), sndBalT0);
      if (detAdv || balAdv) later(() => ONW.sound.release(), R.t);
    }
    playLadder(res, R);   // 勝利の貼り重ね: 成立した勝利を優先度の低い順に貼っていく（最後の段 = 最終結果は、下の字幕が出す。docs/win-ladder.md）
    // 愉快犯: 愉快犯が影響する前の勝敗を先に発表 → 🤗が飛び出して、影響した勝敗に変わる。チキンの逆転演出(逆転前の勝敗を先に発表 → チキンが飛び出して覆す)とは、起きた順に並べる:
    //   愉快犯のあとにチキンが逆転した（既定。愉快犯 → チキン） / 愉快犯の前にチキンがもう逆転していた（pranksterFx.chickenFirst。チキン → 愉快犯）
    if (res.pranksterFx && res.pranksterFx.chickenFirst) { hk("reverse").forEach((h) => h.fn(R)); hk("prankster").forEach((h) => h.fn(R)); }
    else { hk("prankster").forEach((h) => h.fn(R)); hk("reverse").forEach((h) => h.fn(R)); }
    later(() => { if (ladderUnder(res)) { const html = winHtml(res, true), g = G(), c = document.getElementById("res-cap"); g.resultCap = html; if (c) { c.innerHTML = html; fitResCap(); } } else setCap(winHtml(res)); }, R.t);
    const notes = hk("winNote").map((h) => h.fn(R)).filter(Boolean);   // 神官（村人陣営）・狂った神官（人狼陣営）の祈り。両方あれば1つにまとめて、字幕を続けて出す
    const note = notes.length ? { ids: notes.flatMap((x) => x.ids || []), html: notes.map((x) => x.html).join("") } : null;   // 神官: 最終結果の字幕のあと・追加勝利の札の前に「神官〇〇の祈りにより村人陣営も追加勝利しました。」/ 狂った神官: 「狂った神官〇〇の祈りにより人狼陣営も追加勝利しました。」（神降臨の貼り重ねのあと）
    if (note) {
      later(() => { winNoteHtml = note.html; const c = document.getElementById("res-cap"); G().resultCap = `${winHtml(res)}${winNoteHtml}`; if (c) { c.insertAdjacentHTML("beforeend", winNoteHtml); fitResCap(); } (note.ids || []).forEach((id) => { gx[P(id)] = "spark"; }); paint(G()); }, R.t + 1300);
      later(() => { (note.ids || []).forEach((id) => { if (gx[P(id)] === "spark") delete gx[P(id)]; }); paint(G()); }, R.t + 1300 + 2200);
      R.t += 1300 + 1600;
    }
    const exs = res.extraWin || [];   // 追加勝利: 勝利陣営の字幕のあと、追加で勝った人の役職を0.7秒おきに貼り足していく（そのあとで負けた人が吹き飛ぶ）
    exs.forEach((x, i) => later(() => addExtraWin(res, i + 1), R.t + 1200 + i * 700));
    if (exs.length) R.t += 1200 + exs.length * 700 + 400;
    const losersN = R.noBlow ? [] : res.history.filter((h) => !h.win);   // 神の祝福以外: 結果の字幕のあと、負けた人のカードが吹き飛ぶ
    if (losersN.length) later(() => { losersN.forEach((h) => { gx[P(h.id)] = "blow"; }); if (ONW.sound) ONW.sound.se("card_fly"); paint(G()); }, R.t + 1300);   // SE: 負けた人のカードが吹っ飛ぶ
    later(toSheet, R.t + (losersN.length ? 3800 : 2800));
  }
  function toSheet() {
    const g = G(); clearAll(); g.asnHold = null;
    if (ONW.sound) ONW.sound.release();   // BGM: 演出中の固定を解除（このあとの描画でリザルト画面の曲になる）
    g.resultStage = "sheet";
    libraSync(g);   // 天秤: 皿に載せたカードを元の席に戻す
    ONW.ui.render(g);
  }
  stage.skipResult = function () {
    const g = G(), res = g.result;
    if (!res) return;
    const hk = (key) => ONW.roleHooksIn("stageResult", key);
    g.revRes = {}; res.history.forEach((h) => { if (h.rev > 0) g.revRes[`p:${h.id}`] = h.rev; });
    clearAll(); Object.keys(gx).forEach((k) => { if (gx[k] === "bomb" || gx[k] === "boom") delete gx[k]; }); alm = {}; veil = {}; hk("clear").forEach((h) => h.fn(stage.kit));   // 身代わりの「めくれそう」演出・処刑人の演出も止める
    const skipIds = new Set(); hk("execExclude").forEach((h) => (h.fn(res) || []).forEach((id) => skipIds.add(id)));
    const skBmb = new Set(((res.bomber || {}).bombers || []).map((x) => x.id));   // 道化の爆弾魔: 演出なしの最終形でも、自爆した爆弾魔のバッジは「自爆」（結果シートの死因表示は変えていない）
    res.history.forEach((h) => { up[`p:${h.id}`] = h.role; if (h.lover) lov[`p:${h.id}`] = h.loverNos && h.loverNos.length > 1 ? h.loverNos : h.loverNo || true; if (h.shuf) shuf[`p:${h.id}`] = true; if (h.keep) kp[`p:${h.id}`] = true; if (h.prom) wf[`p:${h.id}`] = true; if (h.drunk) bd[`p:${h.id}`] = true; if (h.cocktail) bdCk[`p:${h.id}`] = true; if (h.day) { delete curse[`p:${h.id}`]; dead[`p:${h.id}`] = true; badge[`p:${h.id}`] = h.dayLabel || "死亡"; } if (h.dead) { dead[`p:${h.id}`] = true; badge[`p:${h.id}`] = h.duke ? "魔界断罪" : skipIds.has(h.id) || h.sub || h.dukeDead ? "身代わり" : h.cause === "chain" ? (h.kind === "tomo" ? "道連れ" : h.kind === "lovers" ? "心中" : h.kind === "queen" ? "王国滅亡" : h.kind === "follow" || h.kind === "thread" ? "後追い" : h.kind === "bite" ? "噛殺" : h.kind === "bomb" ? "爆殺" : "無理心中") : h.mental ? "メンタル崩壊" : h.shock ? "ショック死" : h.curseKill ? "呪殺" : h.execTg ? "処刑" : h.bounce ? "とばっちり" : h.dict ? (h.coup ? "クーデター" : "独裁処刑") : "追放"; if (skBmb.has(h.id) && !h.sub) badge[`p:${h.id}`] = "自爆"; if (h.cause === "chain") shin[`p:${h.id}`] = true; } });
    res.grave.forEach((c, i) => { up[`g:${i}`] = c.role; });
    const R = Object.create(stage.kit); R.res = res;
    libraTilt = libraTiltOf(res);   // 天秤: 演出なしの最終形（つられた皿が下がったまま）
    hk("skip").forEach((h) => h.fn(R));
    (res.extraWin || []).forEach((x) => { if (!gx[`p:${x.id}`]) gx[`p:${x.id}`] = "extra"; });   // 追加勝利の人のカードは追加勝利の色   // 猫(2回目の面)・神の祝福・処刑人のターゲット(割れた状態)・アサシンに選ばれた人 を、演出なしの最終形で見せる
    if (!res.dictator) res.counts.forEach((c) => { if (!badge[`p:${c.id}`]) badge[`p:${c.id}`] = `${c.c}票`; });   // 独裁処刑のときは票が無い（対象の表示は独裁者の skip フックが付ける）
    toSheet();
  };

  // ---------------------------------------------------------
  // 変化公開: 画面いっぱいの古びた紙に書かれ、下の固定欄へ移動する
  // ---------------------------------------------------------
  function finishPaper(wrap) {
    paperTimers.forEach(clearTimeout); paperTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
    const g = G(); g.tfIntro = false;
    if (ONW.sound) ONW.sound.release();   // BGM: 変化公開が終わったら、フェーズどおりの曲へ戻す
    ONW.ui.updateBoard();
    runNews();   // 新聞配達員がいれば、変化公開の紙のあとに新聞の紙が出る
    runMapo();   // 麻婆豆腐の演出は新聞のあと（新聞が出ているときはまだ待つ）
  }
  function fly(wrap) {
    if (wrap.dataset.flying) return;
    wrap.dataset.flying = "1";
    paperTimers.forEach(clearTimeout); paperTimers = [];
    const paper = wrap.querySelector(".tfp-paper"), tgt = document.querySelector("#co-board .cb-tf");
    if (!tgt) { finishPaper(wrap); return; }
    const pr = paper.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
    const s = Math.min(tr.width / pr.width, tr.height / pr.height, 1);
    const dx = tr.left + tr.width / 2 - (pr.left + pr.width / 2), dy = tr.top + tr.height / 2 - (pr.top + pr.height / 2);
    wrap.querySelector(".tfp-dim").style.opacity = "0";
    paper.style.transition = "transform .95s cubic-bezier(.55,0,.25,1), opacity .35s ease .65s";
    paper.style.transform = `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`;
    paper.style.opacity = "0";
    paperTimers.push(setTimeout(() => finishPaper(wrap), 1050));
  }
  /** 変化公開の文字を、改行されない範囲で一番大きくする（画面の幅が変わっても合わせ直す） */
  function fitPaper(wrap) {
    const paper = wrap.querySelector(".tfp-paper");
    if (!paper || !wrap.isConnected) return;
    const BASE = 26, MIN = 10;
    const cs = getComputedStyle(paper);
    // 紙のふちはギザギザに切り抜かれているので、その分(左右6pxずつ)も余白として引く
    const avail = paper.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 12;
    paper.style.setProperty("--tfp-fs", BASE + "px");
    let ratio = 1;
    wrap.querySelectorAll(".tfp-line span").forEach((sp) => { const w = sp.offsetWidth; if (w > avail && w > 0) ratio = Math.min(ratio, avail / w); });
    paper.style.setProperty("--tfp-fs", Math.max(MIN, Math.floor(BASE * ratio * 10 * 0.95) / 10) + "px");   // 全行で同じ大きさにそろえる（文字が途切れないよう少し余裕を持たせる）
    // 行が多いとき(配役した役職も変化公開に表示するONなど)は、紙が画面の縦に収まるまで文字を小さくする
    let fs = Math.max(MIN, Math.floor(BASE * ratio * 10 * 0.95) / 10);
    for (let k = 0; k < 24 && paper.offsetHeight > window.innerHeight * 0.88 && fs > 8; k++) { fs = Math.max(8, Math.floor(fs * 0.93 * 10) / 10); paper.style.setProperty("--tfp-fs", fs + "px"); }   // 縦に収まらないときは幅の下限(10px)より小さくしてでも収める（下限8px。余白・行間も文字の大きさに比例して縮む。css .tfp-paper）
  }
  /** ホストのスキップが届いた: 紙を今すぐ下の欄へ飛ばす（まだ紙が出ていなければ、これから出さない） */
  stage.skipPaper = function () {
    const g = G();
    g.newsSkip = true;   // ホストのスキップは、このあとに出る新聞の紙も飛ばす（新聞は情報確認から見られる）
    g.mapoSkip = true;   // 麻婆豆腐の演出も同じく飛ばす（完成は情報確認から見られる）
    g.hiyayakkoSkip = true;   // 冷奴の演出も同じく飛ばす（完成は情報確認から見られる）
    g.exposeSkip = true;   // 暴露の紙も同じく飛ばす（暴露された役職は情報確認から見られる）
    const ex = document.querySelector(".exp-wrap"); if (ex) finishExpose(ex);
    const mp = document.querySelector(".mpo-wrap"); if (mp) finishMapo(mp);
    const hy = document.querySelector(".hyk-wrap"); if (hy) finishHiyayakko(hy);
    const nw = document.querySelector(".nwp-wrap");
    if (nw) flyNews(nw);
    const w = document.querySelector(".tfp-wrap");
    if (w) { fly(w); return; }
    if (nw) return;
    if (!g.tfShown) { g.tfShown = true; g.tfIntro = false; ONW.ui.updateBoard(); }
    runNews();
  };
  /** 変化公開の紙が出始めてから下の欄に収まるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める */
  stage.paperMs = function (lines) {
    if (!lines || !lines.length) return 0;
    const dur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05)), last = lines[lines.length - 1];
    return Math.round((0.55 + (lines.length - 1) * 0.75 + dur(last) + 1.3 + 1.05 + 0.3) * 1000);
  };
  stage.paper = function (lines) {
    document.querySelectorAll(".tfp-wrap").forEach((w) => w.remove());
    if (ONW.sound && lines && lines.length) ONW.sound.hold("transform");   // BGM: 変化公開の間は専用の曲に固定（終わったら finishPaper で戻す）
    paperTimers.forEach(clearTimeout); paperTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "tfp-wrap";
    const dur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05));
    const start = (i) => 0.55 + i * 0.75;
    const canSkipPaper = !!(ONW.net && ONW.net.isHost);   // スキップできるのはホストだけ（表示も出さない）。ダブルタップで全員ぶん飛ばす
    wrap.style.cursor = "default";
    wrap.innerHTML = `<div class="tfp-dim"></div>
      <div class="tfp-paper">
        <div class="tfp-title"><span style="--n:4;--d:.1s;--dur:.35s">変化公開</span></div>
        ${lines.map((t, i) => `<div class="tfp-line"><span style="--n:${[...t].length};--d:${start(i).toFixed(2)}s;--dur:${dur(t).toFixed(2)}s">${esc(t)}</span></div>`).join("")}
        ${canSkipPaper ? `<div class="tfp-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    fitPaper(wrap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPaper(wrap));   // フォントの読み込み後にも合わせ直す
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => fitPaper(wrap));   // 書き出しの途中でフォントが入れ替わったときも合わせ直す
    [60, 300, 900].forEach((ms) => paperTimers.push(setTimeout(() => fitPaper(wrap), ms)));   // 描画が落ち着いたあとにも念のため
    const onResize = () => fitPaper(wrap);
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(() => { if (!wrap.isConnected) { window.removeEventListener("resize", onResize); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    if (canSkipPaper) {
      let last = 0, lx = 0, ly = 0;   // dblclick はスマホで不安定なので、自前でダブルタップを判定する
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    // SE: 変化公開の行が1行ずつ書き出されるタイミング（各行の --d = start(i) 秒）でアクセント音を鳴らす。
    // paperTimers に載せるため、スキップ（fly）や終了（finishPaper）でタイマーが消えれば予約も一緒に消える。
    // 紙は g.tfShown のガードで最初の1回だけ表示されるので、再入室・途中参加で復元された表示では鳴らない。
    if (ONW.sound && lines && lines.length) lines.forEach((t, i) => {
      paperTimers.push(setTimeout(() => { if (ONW.sound) ONW.sound.se("reveal_text"); }, Math.round(start(i) * 1000)));
    });
    const endAt = start(lines.length - 1) + dur(lines[lines.length - 1]) + 1.3;   // 書き終えて少し読ませてから下へ
    paperTimers.push(setTimeout(() => fly(wrap), endAt * 1000));
  };

  // ---------------------------------------------------------
  // 新聞配達員: 変化公開の紙が収まったあと、新聞紙のような紙に「昨夜、動きのあった役職」が書き出される。
  // 書き終えたら「情報確認」のボタンへ縮んで消える（新聞は情報確認からいつでも見返せる）。昼のタイマーは新聞が終わってから始まる
  // ---------------------------------------------------------
  let newsTimers = [];
  const newsDur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05));
  const newsStart = (i) => 1.0 + i * 0.75;   // 題字のあと、1行ずつ書き出す
  /** 新聞に書く行（動きがあった役職 / 動きがなかったときの2行） */
  const newsRows = (lines) => (lines && lines.length ? ["昨夜、動きのあった役職", ...lines] : ["昨夜、目立った能力行使は", "なかったようです。"]);
  /** 新聞の紙が出始めてから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める */
  stage.newsMs = function (lines) {
    const rows = newsRows(lines);
    return Math.round((newsStart(rows.length - 1) + newsDur(rows[rows.length - 1]) + 1.6 + 1.05 + 0.3) * 1000);
  };
  function finishNews(wrap) {
    newsTimers.forEach(clearTimeout); newsTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
    runMapo();   // 新聞が終わったら、麻婆豆腐の演出へ
  }
  function flyNews(wrap) {
    if (wrap.dataset.flying) return;
    wrap.dataset.flying = "1";
    newsTimers.forEach(clearTimeout); newsTimers = [];
    const paper = wrap.querySelector(".nwp-paper"), tgt = document.querySelector(".co-bar .btn");   // 先頭のボタン = 情報確認
    wrap.querySelector(".nwp-dim").style.opacity = "0";
    paper.style.animation = "none";   // 出現のアニメが残っていると、縮む動きを上書きしてしまう
    if (!tgt) { paper.style.transition = "opacity .5s ease"; paper.style.opacity = "0"; newsTimers.push(setTimeout(() => finishNews(wrap), 600)); return; }
    void paper.offsetWidth;
    const pr = paper.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
    const s = Math.min(tr.width / pr.width, tr.height / pr.height, 1);
    const dx = tr.left + tr.width / 2 - (pr.left + pr.width / 2), dy = tr.top + tr.height / 2 - (pr.top + pr.height / 2);
    paper.style.transition = "transform .95s cubic-bezier(.55,0,.25,1), opacity .35s ease .65s";
    paper.style.transform = `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`;
    paper.style.opacity = "0";
    newsTimers.push(setTimeout(() => finishNews(wrap), 1050));
  }
  /** 新聞の文字を、改行されない範囲で一番大きくする（画面の幅が変わっても合わせ直す） */
  function fitNews(wrap) {
    const paper = wrap.querySelector(".nwp-paper");
    if (!paper || !wrap.isConnected) return;
    const BASE = 24, MIN = 10, cs = getComputedStyle(paper);
    const avail = paper.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
    paper.style.setProperty("--nwp-fs", BASE + "px");
    let ratio = 1;
    wrap.querySelectorAll(".nwp-line span").forEach((sp) => { const w = sp.offsetWidth; if (w > avail && w > 0) ratio = Math.min(ratio, avail / w); });
    let fs = Math.max(MIN, Math.floor(BASE * ratio * 10 * 0.95) / 10);
    paper.style.setProperty("--nwp-fs", fs + "px");
    // 行が多い・画面が低い（小さい端末・横向き）とき: 紙が画面の縦に収まるまで文字を小さくする（下限8px。余白・行間・題字も文字の大きさに比例して縮む。css .nwp-paper）
    for (let k = 0; k < 24 && paper.offsetHeight > window.innerHeight * 0.88 && fs > 8; k++) { fs = Math.max(8, Math.floor(fs * 0.93 * 10) / 10); paper.style.setProperty("--nwp-fs", fs + "px"); }
  }
  function drawNews(lines) {
    if (ONW.sound) ONW.sound.se("newspaper");   // SE: 新聞が届いた
    document.querySelectorAll(".nwp-wrap").forEach((w) => w.remove());
    newsTimers.forEach(clearTimeout); newsTimers = [];
    const rows = newsRows(lines), hasInfo = !!(lines && lines.length);
    const wrap = document.createElement("div");
    wrap.className = "nwp-wrap";
    const canSkip = !!(ONW.net && ONW.net.isHost);   // スキップできるのはホストだけ。変化公開の紙と同じダブルタップで、全員ぶん飛ばす
    wrap.innerHTML = `<div class="nwp-dim"></div>
      <div class="nwp-paper">
        <div class="nwp-masthead"><span style="--n:4;--d:.1s;--dur:.4s">混沌新聞</span></div>
        <div class="nwp-edition">号外　昨夜の動き</div>
        ${rows.map((t, i) => `<div class="nwp-line ${hasInfo && i === 0 ? "nwp-line--head" : ""}"><span style="--n:${[...t].length};--d:${newsStart(i).toFixed(2)}s;--dur:${newsDur(t).toFixed(2)}s">${esc(t)}</span></div>`).join("")}
        ${canSkip ? `<div class="nwp-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    fitNews(wrap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitNews(wrap));
    [60, 300, 900].forEach((ms) => newsTimers.push(setTimeout(() => fitNews(wrap), ms)));
    const onResize = () => fitNews(wrap);
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(() => { if (!wrap.isConnected) { window.removeEventListener("resize", onResize); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    newsTimers.push(setTimeout(() => flyNews(wrap), (newsStart(rows.length - 1) + newsDur(rows[rows.length - 1]) + 1.6) * 1000));   // 書き終えて少し読ませてから「情報確認」へ
  }
  /** 変化公開の紙がこれから出る・出ている最中か（新聞はその後に出す） */
  function tfBusy(g) {
    const tv = g.tfView;
    return !!(g.tfIntro || document.querySelector(".tfp-wrap") || (tv && tv.mode === "reveal" && tv.lines && tv.lines.length && !g.tfShown));
  }
  /** 待っている新聞を、出せるなら出す（変化公開の紙が終わったとき・ホストのスキップのときにも呼ばれる） */
  function runNews() {
    const g = G();
    if (!g.newsPending) return;
    if (!g.newsForce && tfBusy(g)) return;
    g.newsPending = false;
    if (g.newsSkip || g.isSpectator) return;   // ホストがスキップした / 観戦中: 紙は出さない（情報確認には載る）
    drawNews(g.newsLines);
  }
  /** 新聞が届いた: 変化公開の紙が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼に新聞配達員の酔いが覚めたとき（すぐ出す） */
  stage.news = function (lines, late) {
    const g = G();
    g.newsLines = lines || [];
    g.newsPending = true; g.newsForce = !!late; if (late) g.newsSkip = false;
    newsTimers.push(setTimeout(() => { const gg = G(); if (gg.newsPending && !document.querySelector(".tfp-wrap")) { gg.newsForce = true; runNews(); } }, 3000));   // 変化公開の紙が何かの都合で出ないときの保険
    runNews();
  };

  // ---------------------------------------------------------
  // 暴露狂人: 昼の始まりに「暴露された人の最終役職」の紙が出る（誰が暴露されたかは出さない。カードはめくれない）
  // 順番: 変化公開の紙 → 新聞 → 暴露の紙 → 麻婆豆腐の演出 → 昼のタイマー開始(パン屋)。暴露の内容は「情報確認」からいつでも見返せる
  // ---------------------------------------------------------
  let exposeTimers = [], exposePoll = null;
  /** 暴露の紙が出始めてから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める（1件ごとに少し延びる） */
  stage.exposeMs = function (rows) { return 3200 + Math.max(0, ((rows && rows.length) || 1) - 1) * 1300; };
  const exposeText = (r) => (r.extras && r.extras.length ? `であり、${r.extras.join("であり、")}でした。` : "");
  function finishExpose(wrap) {
    exposeTimers.forEach(clearTimeout); exposeTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
  }
  function drawExpose(rows, late) {
    if (ONW.sound) ONW.sound.se("expose");   // SE: 暴露の紙が出た
    document.querySelectorAll(".exp-wrap").forEach((w) => w.remove());
    exposeTimers.forEach(clearTimeout); exposeTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "exp-wrap" + (late ? " exp-wrap--late" : "");   // late = 昼の途中に出た（操作は止めない）
    const canSkip = !!(ONW.net && ONW.net.isHost) && !late;   // スキップできるのはホストだけ。変化公開・新聞と同じダブルタップで、全員ぶん飛ばす
    const total = stage.exposeMs(rows);
    wrap.innerHTML = `<div class="exp-dim"></div>
      <div class="exp-paper">
        <div class="exp-title">🔎 暴露通知</div>
        ${rows.map((r, i) => `<div class="exp-item" style="--i:${i}">
          <div class="exp-lead">暴露狂人に暴露された人の最終役職は</div>
          <div class="exp-role">${esc(r.role)}</div>
          ${exposeText(r) ? `<div class="exp-extra">${esc(exposeText(r))}</div>` : `<div class="exp-extra">です。</div>`}
        </div>`).join("")}
        ${canSkip ? `<div class="exp-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    wrap.style.setProperty("--exp-total", (total - 150) / 1000 + "s");
    document.body.appendChild(wrap);
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    exposeTimers.push(setTimeout(() => { finishExpose(wrap); runMapo(); }, total - 150));
  }
  /** 待っている暴露の紙を、出せるなら出す（変化公開の紙・新聞が終わるのを待つ。最大15秒でやめる） */
  function runExpose() {
    const g = G();
    if (!g.exposePending) return;
    if (!g.exposeForce && !g.exposeSkip && (tfBusy(g) || g.newsPending || document.querySelector(".tfp-wrap, .nwp-wrap")) && Date.now() < (g.exposeWaitUntil || 0)) {
      if (!exposePoll) exposePoll = setTimeout(() => { exposePoll = null; runExpose(); }, 250);
      return;
    }
    g.exposePending = false;
    const rows = g.exposeShow || []; g.exposeShow = [];
    if (g.exposeSkip || g.isSpectator || !rows.length) { runMapo(); return; }   // ホストがスキップした / 観戦中: 紙は出さない（情報確認には載る）
    drawExpose(rows, !!g.exposeLate);
  }
  /** 暴露が届いた: 変化公開の紙・新聞が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼の途中に出たとき（すぐ出す） */
  stage.expose = function (rows, late) {
    const g = G();
    g.exposeShow = [...(g.exposePending ? g.exposeShow || [] : []), ...(rows || [])];
    g.exposePending = true; g.exposeForce = !!late; g.exposeLate = !!late; g.exposeWaitUntil = Date.now() + 15000;
    if (late) g.exposeSkip = false;
    runExpose();
  };

  // ---------------------------------------------------------
  // 愉快犯: 夜に対象を選んだ愉快犯がいると、昼の始まりに「愉快な笑い声が聞こえました。」のバナーが出る（誰が愉快犯かは出さない）
  // 順番: 変化公開の紙 → 新聞 → 暴露 → 愉快犯の笑い声 → 麻婆豆腐 → パン屋 → 昼のタイマー開始。「情報確認」からいつでも確認できる
  // 笑い声の見た目・音は未定（まずは文字だけのバナー）。差し替えるときは drawPrankster だけを直す（待ち時間は PRANK_MS）
  // ---------------------------------------------------------
  const PRANK_MS = 3400;   // バナーが出てから消えるまでの時間(ms)。次の演出・昼のタイマーはこの後に始める
  let prankPoll = null;
  stage.pranksterMs = function () { return PRANK_MS; };
  function drawPrankster() { if (ONW.ui && ONW.ui.showPrankster) ONW.ui.showPrankster(PRANK_MS); }
  /** 待っている笑い声を、出せるなら出す（変化公開の紙・新聞・暴露が終わったあと） */
  function runPrankster() {
    const g = G();
    if (!g.prankPending) return;
    if (!g.prankForce && (tfBusy(g) || g.newsPending || g.exposePending || !!document.querySelector(".tfp-wrap, .nwp-wrap, .exp-wrap")) && Date.now() < (g.prankWaitUntil || 0)) {   // 念のため最大15秒でやめる
      if (!prankPoll) prankPoll = setTimeout(() => { prankPoll = null; runPrankster(); }, 250);
      return;
    }
    g.prankPending = false;
    if (g.isSpectator) return;
    drawPrankster();
  }
  /** 笑い声が届いた: 紙・新聞・暴露が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼の途中（酔いが覚めたとき）はすぐ出す */
  stage.prankster = function (late) {
    const g = G();
    g.prankPending = true; g.prankForce = !!late; g.prankWaitUntil = Date.now() + 15000;
    runPrankster();
  };

  // ---------------------------------------------------------
  // 麻婆の人狼: 麻婆の人狼と豆腐の人狼が両方いるとき、昼の始まりに「麻婆豆腐 完成！」の演出が出る
  // 順番: 変化公開の紙 → 新聞 → 麻婆豆腐の演出 → 昼のタイマー開始(パン屋)。完成は「情報確認」からいつでも確認できる
  // ---------------------------------------------------------
  const MAPO_MS = 3800;   // 演出が出始めてから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める
  let mapoTimers = [], mapoPoll = null;
  stage.mapoMs = function () { return MAPO_MS; };
  function finishMapo(wrap) {
    mapoTimers.forEach(clearTimeout); mapoTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
  }
  function drawMapo(late) {
    document.querySelectorAll(".mpo-wrap").forEach((w) => w.remove());
    mapoTimers.forEach(clearTimeout); mapoTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "mpo-wrap" + (late ? " mpo-wrap--late" : "");   // late = 昼の途中に完成した（操作は止めない）
    const canSkip = !!(ONW.net && ONW.net.isHost) && !late;   // スキップできるのはホストだけ。変化公開・新聞と同じダブルタップで、全員ぶん飛ばす
    wrap.innerHTML = `<div class="mpo-dim"></div>
      <div class="mpo-stage">
        <div class="mpo-item mpo-chili"><em>🌶️</em><span>麻婆の人狼</span></div>
        <div class="mpo-item mpo-tofu"><i class="mpo-cube"></i><span>豆腐の人狼</span></div>
        <div class="mpo-flash"></div>
        <div class="mpo-pot">🍲</div>
        <div class="mpo-steam"><b></b><b></b><b></b></div>
        <div class="mpo-title">麻婆豆腐 完成！</div>
        ${canSkip ? `<div class="mpo-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    mapoTimers.push(setTimeout(() => finishMapo(wrap), MAPO_MS - 150));
  }
  /** 変化公開の紙・新聞が出ている(出る)最中か。麻婆豆腐の演出はその後に出す */
  function mapoBusy(g) { return tfBusy(g) || g.newsPending || g.exposePending || g.prankPending || !!document.querySelector(".tfp-wrap, .nwp-wrap, .exp-wrap, .prk-banner"); }   // 愉快犯の笑い声（暴露のあと・麻婆豆腐の前）が出終わるのも待つ
  /** パンのバナーは、変化公開・新聞・暴露・麻婆豆腐・冷奴がすべて終わってから */
  function breadBusy(g) { return mapoBusy(g) || g.mapoPending || !!document.querySelector(".mpo-wrap") || g.hiyayakkoPending || !!document.querySelector(".hyk-wrap"); }
  /** 待っている麻婆豆腐の演出を、出せるなら出す（変化公開の紙・新聞が終わったとき・ホストのスキップのときにも呼ばれる） */
  function runMapo() {
    const g = G();
    if (!g.mapoPending) return;
    if (!g.mapoForce && !g.mapoSkip && mapoBusy(g) && Date.now() < (g.mapoWaitUntil || 0)) {   // 紙と新聞が終わるのを待つ（念のため最大15秒でやめる）
      if (!mapoPoll) mapoPoll = setTimeout(() => { mapoPoll = null; runMapo(); }, 250);
      return;
    }
    g.mapoPending = false;
    if (g.mapoSkip || g.isSpectator) return;   // ホストがスキップした / 観戦中: 演出は出さない（情報確認には載る）
    drawMapo(!!g.mapoLate);
  }
  /** 麻婆豆腐の完成が届いた: 紙と新聞が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼の途中に完成したとき（すぐ出す） */
  stage.mapo = function (late) {
    const g = G();
    g.mapoPending = true; g.mapoForce = !!late; g.mapoLate = !!late; g.mapoWaitUntil = Date.now() + 15000;
    if (late) g.mapoSkip = false;
    runMapo();
  };

  // ---------------------------------------------------------
  // 葱の人狼: 葱の人狼と豆腐の人狼が両方いるとき、昼の始まりに「冷奴 完成！」の演出が出る（麻婆豆腐の作りと対）
  // 順番: 変化公開の紙 → 新聞 → 麻婆豆腐 → 冷奴の演出 → 昼のタイマー開始(パン屋)。完成は「情報確認」からいつでも確認できる
  // 図形（作者指定）: 普通の長ネギと豆腐が合わさったあと、豆腐の上に刻んだ長ネギがのった図形になる
  // ---------------------------------------------------------
  const HIYAYAKKO_MS = 3800;   // 演出が出始めてから消えるまでの時間(ms)。麻婆豆腐と同じ
  let hykTimers = [], hykPoll = null;
  stage.hiyayakkoMs = function () { return HIYAYAKKO_MS; };
  function finishHiyayakko(wrap) {
    hykTimers.forEach(clearTimeout); hykTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
  }
  // 長ネギの図形（SVG）: 白い茎に緑の葉が3枚
  const HYK_NEGI_SVG = `<svg viewBox="0 0 80 112" xmlns="http://www.w3.org/2000/svg"><g stroke-linecap="round"><path d="M40 46 Q26 24 16 6 Q34 16 40 42 Z" fill="#57b25e" stroke="#3d8b44" stroke-width="1.6"/><path d="M40 46 Q40 18 41 2 Q48 20 43 44 Z" fill="#3f9e4d" stroke="#2f7d3a" stroke-width="1.6"/><path d="M40 46 Q54 24 64 6 Q46 16 40 42 Z" fill="#57b25e" stroke="#3d8b44" stroke-width="1.6"/><path d="M35 110 L37 44 Q40 38 43 44 L45 110 Z" fill="#f6faee" stroke="#b9d18f" stroke-width="1.6"/><path d="M36.4 62 H43.6 M36.9 80 H43.1 M37.2 96 H42.8" stroke="#cfe0ae" stroke-width="1.6"/><path d="M37 110 Q34 114 31 112 M40 110 Q40 115 37 114 M43 110 Q46 114 49 112" stroke="#d9c9a8" stroke-width="1.4" fill="none"/></g></svg>`;
  // 冷奴の図形（SVG）: 皿の上の豆腐に、刻んだ長ネギがのっている
  const HYK_DISH_SVG = `<svg viewBox="0 0 200 132" xmlns="http://www.w3.org/2000/svg"><ellipse cx="100" cy="106" rx="88" ry="16" fill="#dfe9f2" stroke="#b9c9d6" stroke-width="2"/><ellipse cx="100" cy="103" rx="70" ry="11" fill="#eef4f9"/><rect x="52" y="36" width="96" height="64" rx="9" fill="#fdfdf8" stroke="#d8dcc8" stroke-width="2"/><path d="M52 84 H148 V91 a9 9 0 0 1 -9 9 H61 a9 9 0 0 1 -9 -9 Z" fill="#eef0e2"/><g fill="#57b25e" stroke="#3d8b44" stroke-width="1"><rect x="66" y="26" width="13" height="5" rx="2.5" transform="rotate(-14 72 28)"/><rect x="86" y="22" width="13" height="5" rx="2.5" transform="rotate(9 92 24)"/><rect x="106" y="26" width="13" height="5" rx="2.5" transform="rotate(-6 112 28)"/><rect x="122" y="22" width="12" height="5" rx="2.5" transform="rotate(16 128 24)"/><rect x="76" y="31" width="12" height="5" rx="2.5" transform="rotate(5 82 33)"/><rect x="97" y="32" width="12" height="5" rx="2.5" transform="rotate(-11 103 34)"/><rect x="116" y="33" width="11" height="5" rx="2.5" transform="rotate(7 121 35)"/><rect x="58" y="30" width="10" height="4.6" rx="2.3" transform="rotate(12 63 32)"/><rect x="134" y="31" width="10" height="4.6" rx="2.3" transform="rotate(-9 139 33)"/><rect x="30" y="98" width="11" height="4.6" rx="2.3" transform="rotate(-18 35 100)"/><rect x="160" y="97" width="11" height="4.6" rx="2.3" transform="rotate(13 165 99)"/></g></svg>`;
  function drawHiyayakko(late) {
    document.querySelectorAll(".hyk-wrap").forEach((w) => w.remove());
    hykTimers.forEach(clearTimeout); hykTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "hyk-wrap" + (late ? " hyk-wrap--late" : "");   // late = 昼の途中に完成した（操作は止めない）
    const canSkip = !!(ONW.net && ONW.net.isHost) && !late;   // スキップできるのはホストだけ。麻婆豆腐と同じダブルタップで、全員ぶん飛ばす
    wrap.innerHTML = `<div class="hyk-dim"></div>
      <div class="hyk-stage">
        <div class="hyk-item hyk-negi"><i class="hyk-negi__svg">${HYK_NEGI_SVG}</i><span>葱の人狼</span></div>
        <div class="hyk-item hyk-tofu"><i class="hyk-cube"></i><span>豆腐の人狼</span></div>
        <div class="hyk-flash"></div>
        <div class="hyk-dish">${HYK_DISH_SVG}</div>
        <div class="hyk-title">冷奴 完成！</div>
        ${canSkip ? `<div class="hyk-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    hykTimers.push(setTimeout(() => finishHiyayakko(wrap), HIYAYAKKO_MS - 150));
  }
  /** 変化公開の紙・新聞・麻婆豆腐が出ている(出る)最中か。冷奴の演出はその後に出す */
  function hykBusy(g) { return mapoBusy(g) || g.mapoPending || !!document.querySelector(".mpo-wrap"); }
  /** 待っている冷奴の演出を、出せるなら出す（紙・新聞・麻婆豆腐が終わったときにも、ポーリングで追いつく） */
  function runHiyayakko() {
    const g = G();
    if (!g.hiyayakkoPending) return;
    if (!g.hiyayakkoForce && !g.hiyayakkoSkip && hykBusy(g) && Date.now() < (g.hiyayakkoWaitUntil || 0)) {   // 紙と新聞と麻婆豆腐が終わるのを待つ（念のため最大15秒でやめる）
      if (!hykPoll) hykPoll = setTimeout(() => { hykPoll = null; runHiyayakko(); }, 250);
      return;
    }
    g.hiyayakkoPending = false;
    if (g.hiyayakkoSkip || g.isSpectator) return;   // ホストがスキップした / 観戦中: 演出は出さない（情報確認には載る）
    drawHiyayakko(!!g.hiyayakkoLate);
  }
  /** 冷奴の完成が届いた: 前の演出が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼の途中に完成したとき（すぐ出す） */
  stage.hiyayakko = function (late) {
    const g = G();
    g.hiyayakkoPending = true; g.hiyayakkoForce = !!late; g.hiyayakkoLate = !!late; g.hiyayakkoWaitUntil = Date.now() + 15000;
    if (late) g.hiyayakkoSkip = false;
    runHiyayakko();
  };

  // ---------------------------------------------------------
  // パン屋: 昼の始まりの最後（変化公開 → 新聞 → 暴露 → 麻婆豆腐 のあと）、昼のタイマーが始まる前に「パンが焼けました」のバナーが出る
  // ---------------------------------------------------------
  const BREAD_MS = 3600;   // バナーが出てから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める
  let breadPoll = null;
  stage.breadMs = function () { return BREAD_MS; };
  function runBread() {
    const g = G();
    if (!g.breadPending) return;
    if (breadBusy(g) && Date.now() < (g.breadWaitUntil || 0)) {   // 紙・暴露・麻婆豆腐が終わるのを待つ（念のため最大25秒でやめる）
      if (!breadPoll) breadPoll = setTimeout(() => { breadPoll = null; runBread(); }, 250);
      return;
    }
    g.breadPending = false;
    if (ONW.sound) ONW.sound.se("bakery");   // SE: パンが焼けた
    if (ONW.ui && ONW.ui.showBread) ONW.ui.showBread(g.breadShowN || 1);
  }
  stage.bread = function (n) {
    const g = G();
    g.breadPending = true; g.breadShowN = n || 1; g.breadWaitUntil = Date.now() + 25000;
    runBread();
  };

  // ---------------------------------------------------------
  // スティーブ: 不死のトーテム（マイクラの不死のトーテムが発動するときの演出）。DOM と CSS だけ（画像素材なし）
  //   画面いっぱいの黄色〜緑の閃光 → 金色のトーテムが中央にポンと出て震える → 緑と黄色の粒が飛び散る → 「〇〇 は不死のトーテムで復活！」の字幕 → 消える
  //   昼（保安官の執行）: net.js が全員（観戦者含む）に { t: "steverevive" } を送り、ONW.stage.steveRevive が出す。結果発表: startResult の中で、死因でめくれたあと・復活の札に変わる前に出す
  //   クリック・タップを邪魔しない（pointer-events: none）。画面の外（別タブ）で見ていなかった場合は出さない（積み上がらないように）
  // ---------------------------------------------------------
  const TOTEM_MS = 2400;        // 出てから消えるまで(ms)
  const TOTEM_DEATH_MS = 1300;  // 昼の復活: 死亡の演出（撃たれた演出 約1秒 + 余韻）を見せてから、トーテムを出すまで(ms)
  const TOTEM_PEAK_MS = 900;    // トーテムが一番大きくなる瞬間（ここで復活が確定して、死亡の見た目が消える）
  let totemHold = {};           // 昼の復活: 演出のピークまで、死亡の見た目（灰色・銃痕）を残す席 { "p:ID": true }
  stage.totemMs = () => TOTEM_MS;
  stage.totemDeathMs = () => TOTEM_DEATH_MS;
  const TOTEM_SVG = `<svg viewBox="0 0 16 20" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><g fill="#5a3d05"><rect x="4" y="0" width="8" height="7"/><rect x="0" y="5" width="16" height="5"/><rect x="4" y="5" width="8" height="10"/><rect x="4" y="14" width="3" height="6"/><rect x="9" y="14" width="3" height="6"/></g><g fill="#f2c230"><rect x="5" y="1" width="6" height="5"/><rect x="1" y="6" width="14" height="3"/><rect x="5" y="6" width="6" height="8"/><rect x="5" y="14" width="2" height="5"/><rect x="9" y="14" width="2" height="5"/></g><g fill="#c9971c"><rect x="5" y="5" width="6" height="1"/><rect x="1" y="8" width="14" height="1"/><rect x="5" y="13" width="6" height="1"/></g><g fill="#2fd24a"><rect x="6" y="3" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/><rect x="7" y="9" width="2" height="3"/></g><rect x="7" y="5" width="2" height="1" fill="#5a3d05"/></svg>`;
  // ---------------------------------------------------------
  // イカロス（js/roles/village/icarus.js）: 票を分け与えたとき、全員の画面に出る演出。太陽に翼が飛び上がる。
  //   だれが・だれに使ったかは出さない（字幕はマイクラ版 main.js の昼通知と同じ文）。ホスト（hostIcarus）が icarusfx を sendAll / sendSpec し、net.js が受けてここを呼ぶ。
  //   同時に何回も使われたら、前の演出が終わるのを待って順に出す（重ねない）。
  // ---------------------------------------------------------
  const ICARUS_MS = 3400;        // 出てから消えるまで(ms)
  let icarusUntil = 0;           // いま出している（予約済みの）演出が終わる時刻
  stage.icarusMs = () => ICARUS_MS;
  const ICARUS_WING = (side) => {   // 片方の翼（羽根を扇状に重ねる）。side: -1=左 / 1=右
    let f = "";
    for (let i = 0; i < 6; i++) {
      const a = 14 + i * 15, len = 74 - i * 6;
      f += `<ellipse cx="${len / 2 + 8}" cy="0" rx="${len / 2}" ry="${9 - i * 0.6}" transform="rotate(${-a})" fill="${i % 2 ? "#fff6d8" : "#ffffff"}" stroke="#e8b84a" stroke-width="1.4"/>`;
    }
    return `<g class="icarus-w icarus-w${side < 0 ? "l" : "r"}" transform="translate(${side < 0 ? 100 : 100} 74) scale(${side} 1)">${f}</g>`;
  };
  const ICARUS_SVG = `<svg viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">${ICARUS_WING(-1)}${ICARUS_WING(1)}<ellipse cx="100" cy="76" rx="9" ry="14" fill="#ffe9a8" stroke="#e8b84a" stroke-width="1.6"/></svg>`;
  stage.icarusFx = function () {
    if (typeof document === "undefined" || !document.body || document.hidden) return 0;
    const now = Date.now(), wait = Math.max(0, icarusUntil - now);
    icarusUntil = now + wait + ICARUS_MS;
    setTimeout(() => {
      if (!document.body) return;
      const wrap = document.createElement("div");
      wrap.className = "icarus-wrap";
      const cols = ["#ffffff", "#fff2b8", "#ffd860", "#ffe9a8"];
      let ps = "";
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 170;
        ps += `<i class="icarus-p" style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;--r:${Math.round(Math.random() * 360)}deg;--c:${cols[i % cols.length]}"></i>`;
      }
      const note = (ONW.icarus && ONW.icarus.NOTICE) || "イカロスが誰かに投票を分け与えたようです。";
      wrap.innerHTML = `<div class="icarus-sky"></div><div class="icarus-sun"><div class="icarus-rays"></div><div class="icarus-core"></div></div><div class="icarus-wings">${ICARUS_SVG}</div>${ps}<div class="icarus-cap">${esc(note)}</div>`;
      document.body.appendChild(wrap);
      // 字幕がプレイヤー欄（カードのテーブル #table）に重ならないよう、テーブルのすぐ下（入らなければすぐ上）に置く。テーブルが見つからないときは CSS の既定位置（画面の下のほう）
      try {
        const cap = wrap.querySelector(".icarus-cap"), tb = document.getElementById("table"), vh = window.innerHeight || 0;
        if (cap && tb && vh) {
          const r = tb.getBoundingClientRect();
          if (r.height > 0) {
            const h = cap.offsetHeight || 40;
            let top = null;
            if (r.bottom + 8 + h <= vh) top = r.bottom + 8;          // テーブルの下に入る
            else if (r.top - 8 - h >= 0) top = r.top - 8 - h;        // 下に入らなければ上
            if (top !== null) { cap.style.top = Math.round(top) + "px"; cap.style.bottom = "auto"; }
          }
        }
      } catch (e) {}
      setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, ICARUS_MS + 200);
    }, wait);
    return wait + ICARUS_MS;
  };
  stage.totem = function (opt) {
    if (typeof document === "undefined" || !document.body || document.hidden) return 0;
    if (ONW.sound) ONW.sound.se("steve_revive");   // SE: 不死のトーテムで復活
    const name = opt && opt.name ? String(opt.name) : "";
    const wrap = document.createElement("div");
    wrap.className = "totem-wrap";
    const cols = ["#2fd24a", "#7be35a", "#f2c230", "#ffe678", "#a6f07a"];
    let ps = "";
    for (let i = 0; i < 36; i++) {
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 190;
      ps += `<i class="totem-p" style="--dx:${Math.round(Math.cos(a) * d)}px;--dy:${Math.round(Math.sin(a) * d)}px;--r:${Math.round(Math.random() * 360)}deg;--c:${cols[i % cols.length]};--d:${(0.25 + Math.random() * 0.45).toFixed(2)}s"></i>`;
    }
    wrap.innerHTML = `<div class="totem-flash"></div><div class="totem-item">${TOTEM_SVG}</div>${ps}`;   // 文字（「〇〇 は不死のトーテムで復活！」）は出さない（OJv26_11_14-5。情報確認に載るので）
    document.body.appendChild(wrap);
    setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, TOTEM_MS + 200);
    return TOTEM_MS;
  };
  /** 昼の復活（net.js の { t: "steverevive", id, name, when: "day" } を受けたとき）: 全員の画面で「死亡の演出（撃たれた演出）→ 不死のトーテム → 通常のカード」の順に出す
   *   ホストは撃つ→復活を同じ瞬間に行うので、届く盤面はすでに生きている。そのため死亡の見た目（灰色・銃痕・撃たれた演出）はここで作り直す（すでに死亡の盤面が先に届いて演出中なら、そのまま続ける）。
   *   死亡の演出が終わったあと（TOTEM_DEATH_MS）にトーテムを出し、ピーク（TOTEM_PEAK_MS）で死亡の見た目を消して通常のカードに戻す */
  stage.steveRevive = function (d) {
    if (!d || d.when !== "day") return;
    const k = `p:${d.id}`;
    totemHold[k] = true;   // 死亡の見た目を、トーテムのピークまで sync で消さない
    if (!dead[k]) dead[k] = true;
    if (!shot[k]) { shot[k] = true; shotAnim[k] = true; }   // 撃たれた演出（銃弾 → 閃光 → 銃痕 → ひび）。死亡の盤面が先に届いて演出済みなら、やり直さない
    const g0 = G(); if (g0 && $t()) paint(g0);   // 盤面がまだ作られていない（観戦の途中参加・テスト）ときは何もしない
    setTimeout(() => { stage.totem({ name: d.name }); }, TOTEM_DEATH_MS);
    setTimeout(() => { delete totemHold[k]; const g = G(); if (g) stage.sync(g); }, TOTEM_DEATH_MS + TOTEM_PEAK_MS);
  };

  // ---------------------------------------------------------
  // 観測の人狼: 待機時間に、自分のカードが「観測の人狼」でめくれたあと、観測結果が飛び出す（本人の画面だけ）
  // 結果は「情報確認」の文章にも載るので、見逃してもあとから見返せる。待機時間(5秒)の中で収まる長さにしてある
  // ---------------------------------------------------------
  let obsTimers = [];
  const OBS_MS = 3000;   // 飛び出してから閉じ始めるまで(ms)
  function closeObserve(wrap) {
    obsTimers.forEach(clearTimeout); obsTimers = [];
    if (!wrap || !wrap.parentNode) return;
    wrap.classList.add("obs-out");
    setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, 450);
  }
  stage.observe = function (lines, opt) {   // opt.title: 見出し（既定は観測通知。詩人は「🪶 詩人通知」）
    const g = G();
    if (g.isSpectator || hostWatching(g)) return;
    document.querySelectorAll(".obs-wrap").forEach((w) => w.remove());
    obsTimers.forEach(clearTimeout); obsTimers = [];
    const title = (opt && opt.title) || "🔭 観測通知";
    const rows = (lines && lines.length ? lines : [opt && opt.title ? "対象を選ぶ夜能力は使われていませんでした。" : "観測できる夜能力はありませんでした。"]).slice(0, 8);
    const wrap = document.createElement("div");
    wrap.className = "obs-wrap";
    wrap.innerHTML = `<div class="obs-pop"><div class="obs-title">${esc(title)}</div>${rows.map((t, i) => `<div class="obs-line" style="--i:${i}">${esc(t)}</div>`).join("")}</div>`;
    wrap.addEventListener("pointerup", () => closeObserve(wrap));   // タップですぐ閉じる
    document.body.appendChild(wrap);
    obsTimers.push(setTimeout(() => closeObserve(wrap), OBS_MS + Math.min(rows.length, 5) * 150));
  };
  stage.observeMs = function () { return OBS_MS; };

  // ---------------------------------------------------------
  // 口封じされた人の画面: 待機時間に、でかいミュートマーク🤐と「あなたは口封じされました。」が出る（タップで閉じる。昼になったら消える）
  // ---------------------------------------------------------
  const MUTE_MS = 4200;
  let muteTimers = [];
  function closeMuzzle(wrap) {
    if (!wrap || !wrap.parentNode) return;
    wrap.classList.add("mute-out");
    setTimeout(() => wrap.remove(), 450);
  }
  stage.muzzled = function () {
    const g = G();
    if (g.isSpectator || hostWatching(g)) return;
    document.querySelectorAll(".mute-wrap").forEach((w) => w.remove());
    muteTimers.forEach(clearTimeout); muteTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "mute-wrap";
    wrap.innerHTML = `<div class="mute-dim"></div><div class="mute-body"><div class="mute-icon">🤐</div><div class="mute-text">あなたは口封じされました。</div><div class="mute-sub">昼のチャットとCOボタンは使えません</div></div>`;
    wrap.addEventListener("pointerup", () => closeMuzzle(wrap));
    document.body.appendChild(wrap);
    muteTimers.push(setTimeout(() => closeMuzzle(wrap), MUTE_MS));
  };
  stage.muzzledEnd = function () { muteTimers.forEach(clearTimeout); muteTimers = []; document.querySelectorAll(".mute-wrap").forEach((w) => w.remove()); };
  stage.muzzledMs = function () { return MUTE_MS; };


  // ---------------------------------------------------------
  // 煙幕の狂人: 画面がもくもくしはじめて、白い半透明の画面になる（カード・プレイヤー名の光る飾りは廃止。情報確認/COボタンと変化公開の欄は曇らない）。
  //   g.smokeOn のあいだ（待機時間・昼・投票）だけ。観戦者には出さない（全員の動きが見えるので）。結果発表・ロビー・次の朝で消える。
  //   stage.smoke(g, d): 煙幕が焚かれた瞬間（d.quiet でなければ、もくもくと広がる演出つき）。stage.sync からも毎回整える（再入室は演出なしで戻る）
  // ---------------------------------------------------------
  const SMK_PUFFS = [[8, 78, 46, 0], [30, 92, 52, .3], [58, 84, 48, .15], [86, 76, 44, .45], [4, 40, 40, .6], [92, 36, 42, .25], [20, 12, 44, .5], [50, 4, 50, .1], [80, 10, 42, .7], [48, 46, 56, .35]];
  function smokeWant(g) {
    if (!g.smokeOn || g.isSpectator || hostWatching(g)) return false;
    return [ONW.PHASE.ONLINE_MORNING, ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE].includes(ph(g));
  }
  function smokeSync(g, fresh) {
    const cur = document.querySelector(".smk-screen");
    if (!smokeWant(g)) { if (cur) cur.remove(); document.body.classList.remove("smoke-on"); return; }
    document.body.classList.add("smoke-on");
    if (cur) return;
    const box = document.createElement("div"); box.className = "smk-screen" + (fresh ? " smk-fresh" : "");
    box.setAttribute("aria-hidden", "true");
    box.innerHTML = `<div class="smk-fog"></div>` + SMK_PUFFS.map(([x, y, sz, dl], i) => `<i class="smk-puff" style="left:${x}%;top:${y}%;--sz:${sz}vmax;--dl:${dl}s;--dx:${i % 2 ? -1 : 1}"></i>`).join("");
    document.body.appendChild(box);
  }
  stage.smoke = function (g, d) { if (!(d && d.quiet)) smkN.freshAt = Date.now(); smokeSync(g || G(), !(d && d.quiet)); };

  // ---------------------------------------------------------
  // 煙幕の名前隠し（詳細設定: 煙幕の狂人 > 能力対象のプレイヤー名も隠す / 投票対象のプレイヤー名も隠す。どちらも初期値OFF。docs/smoke-madman.md）
  //   隠れている場合: 煙幕がもくもくと広がったあと、カードの名前が「？？？」になって、席の並びがシャッフルされる。
  //   席の並びは、この画面だけのランダム（CSS の order で入れ替えるので、カードの中身・押したときの対象は変わらない）。
  //   グループ "day"（待機時間・昼。能力対象の設定）: 能力（酔い覚め夜能力・昼能力）の対象を選ぶために開くたびにも、並びがランダムに入れ替わる。
  //   グループ "vote"（投票。投票対象の設定）: 投票が始まるとき（妖狐投票のあとの本投票も）に、昼のあいだとは別のランダムな並びに入れ替わる。投票のあいだは動かない。
  //   2つの設定は別々: 能力だけON → 投票が始まると名前と並びが元に戻る / 投票だけON → 昼は名前そのまま、投票が始まると ？？？ とシャッフル。
  //   自分のカードの名前だけは隠さない（自分の席が分かるように）。観戦者・観戦中のホストには出さない（煙幕自体が出ないため）。
  // ---------------------------------------------------------
  const NMASK = "？？？";
  const SMK_NAME_DELAY = 2400;   // 煙幕が焚かれてから名前が変わるまで（もくもくが広がりきるまで。.smk-fresh の広がりは約2.8秒）
  let smkN = { tk: null, group: null, perm: null, sig: "", ready: false, freshAt: 0, pending: false };
  /** いま名前を隠す場面か: null（隠さない）/ "day"（待機時間・昼）/ "vote"（投票） */
  function smkGroup(g) {
    if (!smokeWant(g)) return null;
    if (ph(g) === ONW.PHASE.ONLINE_VOTE) return g.smokeHideVote === true ? "vote" : null;   // 投票（妖狐投票・魔界公爵追放会議・わら人形などの選択も含む。投票のあいだはこの設定に従う）
    return g.smokeHideAbility === true ? "day" : null;
  }
  /** 昼の能力対象を選ぶために開いている操作の目印（開いていなければ ""。開くたびに変わる → 並びを入れ替える） */
  function smkAbilitySig(g) {
    if (g.phase !== ONW.PHASE.ONLINE_DAY) return "";
    for (const f of ["yomiOpen", "dictOpen", "thiefOpen", "fairyOpen", "icarusOpen", "goranshinOpen", "sheriffOpen", "exchOpen", "predOpen", "libraOpen", "mindOpen", "rejobOpen"]) if (g[f]) return f;
    if (g.abilityOpen && g.morningChain && g.morningChainReady && !g.morningChainDone) return "morning:" + g.morningChain;
    return "";
  }
  /** 投票の開始の目印（投票が始まるたびに変わる。妖狐投票のあとの本投票でも変わる → 並びを入れ替える）。net.js の vote_start が数える */
  const smkVoteSig = (g) => (g.phase === ONW.PHASE.ONLINE_VOTE ? `v${g.voteStartN || 0}` : "");
  /** keys をランダムに並べ替える（なるべく前と違う並びにする） */
  function smkShuffled(keys, prev) {
    const a = keys.slice();
    for (let t = 0; t < 6; t++) {
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.length < 2 || !prev || a.some((k, i) => k !== prev[i])) break;
    }
    return a;
  }
  /** 名前（？？？）と並び（order）を、いまの smkN に合わせる。
   *  animate: 席が中央に集まる → 名前が切り替わる → 新しい並びに広がる（演出）。animate でない（再入室・試合の始まり・動きを減らす設定）ときは、すぐに切り替える */
  const SMK_GATHER = 1250, SMK_SWAP = 0.42;   // 集まって広がる全体の長さ（ms）/ 名前が切り替わるタイミング（全体の割合。いちばん集まったとき）
  function smkSetName(x) {
    const nm = x.querySelector(".tb-name"); if (!nm) return;
    const mask = !!smkN.group && x.dataset.k !== `p:${ONW.net.myId()}`, was = x.classList.contains("smk-hid");
    if (mask && !was) { x.dataset.nm = nm.innerHTML; nm.textContent = NMASK; } else if (!mask && was) { nm.innerHTML = x.dataset.nm || ""; }
    x.classList.toggle("smk-hid", mask);
  }
  function smkApply(animate) {
    const el = $t(), row = el && el.querySelector(".tb-players"); if (!row) return;
    const seats = Array.from(el.querySelectorAll('.tb-seat[data-k^="p:"]'));
    const calm = !!(false /* OSのアニメ設定(prefers-reduced-motion)では演出を止めない */);
    const fx = animate && !calm && seats.length > 1;
    const before = fx ? new Map(seats.map((x) => [x, x.getBoundingClientRect()])) : null;
    seats.forEach((x) => {
      if (!fx) smkSetName(x);   // 演出なし: すぐ ？？？ / 元の名前
      const i = smkN.perm ? smkN.perm.indexOf(x.dataset.k) : -1;
      if (i >= 0) x.style.order = String(i); else x.style.removeProperty("order");
    });
    if (!fx) return;
    const rr = row.getBoundingClientRect(), cx = rr.left + rr.width / 2, cy = rr.top + rr.height / 2;
    seats.forEach((x, n) => {
      const b = before.get(x), a = x.getBoundingClientRect();
      const sx = b.left - a.left, sy = b.top - a.top;                                          // いまの席の位置（動く前）
      const mx = cx - (a.left + a.width / 2), my = cy - (a.top + a.height / 2);                // 中央へ（新しい席の位置から見た中央）
      const d = SMK_GATHER, dl = n * 25;
      if (x.animate) x.animate([
        { transform: `translate(${sx}px,${sy}px) scale(1)`, offset: 0, easing: "cubic-bezier(.5,0,.7,.4)" },
        { transform: `translate(${mx}px,${my}px) scale(.55)`, offset: SMK_SWAP, easing: "cubic-bezier(.2,.7,.3,1)" },
        { transform: "none", offset: 1 },
      ], { duration: d, delay: dl, easing: "linear", fill: "backwards" });
      setTimeout(() => { if (x.isConnected) smkSetName(x); }, dl + d * SMK_SWAP);   // stage の timers には入れない（途中で消えると名前が戻らなくなるため）
      //   // いちばん集まったところで名前を切り替える
    });
  }
  /** stage.sync から毎回呼ぶ（何度呼んでも同じ結果）。隠す場面が変わったとき / 能力対象を選ぶために開いたときだけ、名前と並びを変える */
  function smkNamesSync(g) {
    if (smkN.tk !== key) smkN = { tk: key, group: null, perm: null, sig: "", ready: false, freshAt: smkN.freshAt || 0, pending: false };   // 新しい試合（テーブルの作り直し）
    const grp = smkGroup(g), sig = grp === "day" ? smkAbilitySig(g) : grp === "vote" ? smkVoteSig(g) : "";
    if (grp && smkN.group !== grp && smkN.freshAt) {   // 煙幕が焚かれた直後: もくもくが広がってから名前を変える
      const wait = smkN.freshAt + SMK_NAME_DELAY - Date.now();
      if (wait > 0) { if (!smkN.pending) { smkN.pending = true; later(() => { smkN.pending = false; smkNamesSync(G()); }, wait + 30); } return; }
    }
    const regroup = grp !== smkN.group, reopen = !!grp && !!sig && sig !== smkN.sig;   // 隠す場面が変わった（昼→投票など）/ 能力対象を選ぶために開いた・投票が始まった
    if (regroup || reopen) {
      const el = $t(), keys = Array.from((el && el.querySelectorAll(".tb-players > .tb-seat[data-k^=\"p:\"]")) || []).map((x) => x.dataset.k);
      smkN.group = grp;
      smkN.perm = grp ? smkShuffled(keys, smkN.perm) : null;
      smkApply(smkN.ready);   // 最初の同期（再入室・試合の始まり）は演出なし
      if (ONW.ui && ONW.ui.render) setTimeout(() => { if (G() === g) ONW.ui.render(g); }, 0);   // 能力の操作欄の「選択中: 名前」も ？？？ に合わせて描き直す
    }
    smkN.sig = grp ? sig : "";   // 閉じたら "" に戻る（次に開いたとき・次の投票が始まったとき、また入れ替える）
    smkN.ready = true;
  }
  /** この席の名前がいま「？？？」で隠れているか（ui.js の「選択中: 〇〇」「現在の投票先: 〇〇」などの文章用。自分は隠さない） */
  stage.nameHidden = (id) => !!smkN.group && !!id && id !== ONW.net.myId();

  stage.breakHtml = breakHtml;   // ui.js の配布カード・js/roles/neutral/detective.js のカードが、役職名の改行表(NAME_BREAKS)を通すために引く
  stage.nameLines = (name) => (NAME_BREAKS[name] ? NAME_BREAKS[name].slice() : [String(name || "")]);
  ONW.stage = stage;
})(window.ONW);
