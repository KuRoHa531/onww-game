/**
 * ui.js
 * ------------------------------------------------------------
 * #app の中身を描画する層。
 * 「今の状態(ONW.game)を見て、画面のHTMLを作る」ことだけをする。
 * ボタンなどのイベントは ONW.main 側のハンドラを呼び出すだけにして、
 * ゲーム進行のロジックはこのファイルに書かないようにしている。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const ui = {};
  const esc = (s) => ONW.utils.esc(s);
  /** 煙幕の名前隠し（詳細設定がON）: 隠れている席の名前は「？？？」にする（「選択中: 〇〇」などの文章用。js/stage.js の nameHidden） */
  const nmv = (id, name) => (ONW.stage && ONW.stage.nameHidden && ONW.stage.nameHidden(id) ? "？？？" : name);
  const $app = () => document.getElementById("app");

  const PHASE_LABEL = {
    title: "",
    lobby: "ルーム待機",
    online_role: "配役確認",
    online_night: "夜時間",
    online_morning: "朝時間",
    online_spectate: "観戦中",
    online_day: "昼時間（議論）",
    online_vote: "夕方（投票時間）",
    online_result: "結果発表",
    setup: "設定",
    reveal: "配役確認",
    night: "夜時間",
    day: "昼時間",
    vote: "投票時間",
    result: "結果発表",
  };

  /** 朝と昼の間（朝の能力のあとの待機）は「待機時間」と表示する */
  const phaseName = (g) => (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling ? "待機時間" : PHASE_LABEL[g.phase] ?? "―");

  ui.render = function render(game) {
    if (game.phase !== ONW.PHASE.ONLINE_DAY) ui.closeChat();   // 投票が始まったらチャットは強制的に閉じる（作者要望 2026-11-26）
    if (game.phase !== ONW.PHASE.ONLINE_DAY) ui.closeInfo();   // 昼以外では情報確認を閉じる   // 昼・投票以外ではチャットの拡大を閉じる
    if (game.phase !== ONW.PHASE.LOBBY) game.viewResult = false;   // ルームに戻ったあとの「前回の結果を見る」は、ロビーにいる間だけ
    const reviewing = ui.isResultReview(game);
    if (game.phase !== ONW.PHASE.ONLINE_RESULT && !reviewing) { ui.closeResultChat(); ui.closeResultInfo(); }
    if (game.phase !== ONW.PHASE.LOBBY) { ui.closePlayerMenu(); ui.closeRoleMenu(); } else { ui.refreshPlayerMenu(); ui.refreshRoleMenu(); ui.refreshRoleSet(); ui.refreshRoleGroup(); }   // ロビーの名前メニュー / 役職設定の詳細設定メニュー
    document.body.classList.toggle("is-title", game.phase === ONW.PHASE.TITLE);
    { const dk = game.phase === ONW.PHASE.ONLINE_VOTE && !!game.dukeIds;   // 魔界公爵追放会議: 全員の画面の背景が暗い赤紫になり、開始の帯が出る
      document.body.classList.toggle("duke-meeting", dk);
      if (dk && !ui._dukeShown) { ui._dukeShown = true; const b = document.createElement("div"); b.className = "dk-banner"; b.innerHTML = "<span>魔界公爵追放会議</span><small>魔界公爵だと思う人に投票してください</small>"; document.body.appendChild(b); setTimeout(() => b.remove(), 2600); }
      if (!dk) ui._dukeShown = false; }
    document.getElementById("phase-label").textContent = phaseName(game);
    document.getElementById("day-clock").classList.remove("ph-off");
    document.getElementById("day-clock").textContent =
      game.phase === "day" && !game.votePhaseStarted
        ? ONW.utils.formatClock(game.discussionSecondsLeft ?? 0)
        : "――";

    const renderer = {
      [ONW.PHASE.TITLE]: ui.renderTitle,
      [ONW.PHASE.LOBBY]: reviewing ? ui.renderResultReview : ui.renderLobby,
      [ONW.PHASE.ONLINE_ROLE]: ui.renderOnlineRole,
      [ONW.PHASE.ONLINE_NIGHT]: ui.renderOnlineNight,
      [ONW.PHASE.ONLINE_MORNING]: ui.renderOnlineMorning,
      [ONW.PHASE.ONLINE_SPECTATE]: ui.renderSpectate,
      [ONW.PHASE.ONLINE_DAY]: ui.renderOnlineDay,
      [ONW.PHASE.ONLINE_VOTE]: ui.renderOnlineVote,
      [ONW.PHASE.ONLINE_RESULT]: ui.renderOnlineResult,
      [ONW.PHASE.SETUP]: ui.renderSetup,
      [ONW.PHASE.REVEAL]: ui.renderReveal,
      [ONW.PHASE.NIGHT]: ui.renderNight,
      [ONW.PHASE.DAY]: game.votePhaseStarted ? ui.renderVote : ui.renderDay,
      [ONW.PHASE.RESULT]: ui.renderResult,
    }[game.phase];

    const P = ONW.PHASE;
    const hostWatching = game.hostSpec && game.inGame && ONW.net.isHost && [P.ONLINE_ROLE, P.ONLINE_NIGHT, P.ONLINE_MORNING, P.ONLINE_DAY, P.ONLINE_VOTE].includes(game.phase);
    const specDeal = ui.isSpecDeal(game);   // 観戦者・観戦ホストにも配布の演出を見せる
    let html = specDeal ? ui.renderSpecDeal(game) : hostWatching ? ui.renderHostSpectate(game) : renderer ? renderer(game) : "<p>未知のフェーズです。</p>";
    if (!specDeal && (hostWatching || [P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_SPECTATE].includes(game.phase))) {
      const coBtn = (!hostWatching && game.phase === P.ONLINE_DAY)
        ? `<div id="co-panel"></div><div class="co-bar"><button class="btn" onclick="ONW.ui.openInfo()">情報確認</button> <button class="btn" onclick="ONW.co.open()"${game.muzzled ? " disabled" : ""}>${game.muzzled ? "🤐 COボタン" : "COボタン"}</button> <button id="ab-day-btn" class="btn${ui.abilityHl(game).day ? ' btn--hl' : ''}" onclick="ONW.ui.useAbility('day')">昼能力</button> <button id="ab-night-btn" class="btn${ui.abilityHl(game).night ? ' btn--hl' : ''}" onclick="ONW.ui.useAbility('night')">夜能力</button></div>` : "";
      html += `<div class="co-dock">${coBtn}<div id="co-board" class="co-board"></div></div>`;
    }
    // 議論・投票・観戦中は画面を縦に固定し、チャット本文だけをスクロールさせる
    document.body.classList.toggle("chat-mode", !specDeal && !!(hostWatching || [P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_SPECTATE].includes(game.phase)));
    // 役職配布の演出のあいだは、画面にぴったり収める（高さを固定・フッターを隠す。大きさは ui.fitDeal が測って縮める）
    document.body.classList.toggle("deal-fit", game.phase === ONW.PHASE.ONLINE_ROLE || specDeal);
    // タイトル・ロビーも画面にぴったり収める（高さを固定。収まらないときは ui.fitMenu が、小さくする → それでも足りなければ縮める）
    document.body.classList.toggle("menu-fit", !specDeal && (game.phase === ONW.PHASE.TITLE || (game.phase === ONW.PHASE.LOBBY && !reviewing)));
    // 設定の＋／−などで再描画しても、画面のスクロール位置がずれないようにする（同じ画面の再描画のときだけ）
    const keepY = ui._lastPhase === game.phase ? (window.scrollY || 0) : 0;
    const mp = document.querySelector(".settings-panel--modal"), keepM = mp ? mp.scrollTop : 0;   // 設定ウィンドウの中のスクロール位置も保つ
    // 結果発表: 中身が前回と全く同じなら作り直さない（通信などで再描画が走っても、画面・カードがちらつかない）
    const sameResult = game.phase === P.ONLINE_RESULT && !specDeal && ui._lastPhase === game.phase && ui._lastHtml === html && !!$app().firstElementChild;
    document.body.classList.toggle("res-compact", game.phase === P.ONLINE_RESULT || reviewing);   // 結果発表のあいだもヘッダーを小さいまま（ヘッダーの高さが変わってカードがジャンプしない）
    // ロビーチャットの入力途中は、再描画で消えないように下書きとフォーカスを保つ
    const lcIn = game.phase === ONW.PHASE.LOBBY ? document.getElementById("lobby-chat-in") : null;
    const lcDraft = lcIn ? lcIn.value : null, lcFocus = !!lcIn && document.activeElement === lcIn;
    if (!sameResult) $app().innerHTML = html;
    ui._lastHtml = html;
    if (lcDraft !== null) { const ni = document.getElementById("lobby-chat-in"); if (ni) { ni.value = lcDraft; if (lcFocus) ni.focus(); } }
    if (game.phase === ONW.PHASE.LOBBY) { ui.syncLobbyChatOverlay(); ui.updateLobbyChat(); ui.updateLobbyTyping(); }
    else ui.closeLobbyChatOverlay();
    if (keepY && !sameResult) window.scrollTo(0, keepY);
    if (keepM) { const np = document.querySelector(".settings-panel--modal"); if (np) np.scrollTop = keepM; }
    ui._lastPhase = game.phase;
    if (game.phase === ONW.PHASE.ONLINE_ROLE || ui.isSpecDeal(game)) ui.setupDeal();
    ui.fitMenu();
    if (ONW.accountUi && ONW.accountUi.updateFixed) ONW.accountUi.updateFixed();
    ui.updateBoard();
    ui.updateSpecInfo();
    ui.updateTimer();
    ui.updateSkip(game);
    ui.updateChat();
    if (ONW.co) ONW.co.render();
    if (ONW.stage) ONW.stage.sync(game);   // 山札・墓地・各自のカード（再描画しても作り直さない）
    ui.fitTable();   // 縦向きの小さい画面: カードのテーブルを、操作パネルがスクロールなしで収まる大きさに縮める
    if (ONW.sound) ONW.sound.syncBgm(game);   // BGM: フェーズ・状態に合わせて切り替える（音が出なくても進行には影響しない）
  };

  // ---------------------------------------------------------
  // タイトル画面
  // ---------------------------------------------------------
  ui.renderTitle = function renderTitle(game) {
    const d = game.draft || {};
    const esc = (v) => String(v || "").replace(/"/g, "&quot;");
    const err = game.error ? `<p class="lede" style="color:var(--blood);text-align:center;">${game.error}</p>` : "";
    const step = game.titleStep || "menu";
    let saved = ""; try { saved = localStorage.getItem("onw.playerName.v1") || ""; } catch (e) {}   // 前回入力した名前
    const nm = d.name || saved || (ONW.account && ONW.account.displayName) || "";   // ログイン中は表示名を初期値にする
    if (ONW.accountUi && ONW.accountUi.STEPS.includes(step)) return ONW.accountUi.render(step);
    if (step === "create") return `
      <section class="panel title-menu">
        ${err}
        <div class="field-row"><label>あなたの名前</label>
          <input id="in-name" class="onw-input" maxlength="12" value="${esc(nm)}" onkeydown="if(event.key==='Enter')ONW.main.createRoom()"></div>
        <div class="title-btns">
          <button class="btn btn--primary btn--wide" onclick="ONW.main.createRoom()">ルーム作成</button>
          <button class="btn btn--wide" onclick="ONW.main.titleBack()">戻る</button>
        </div>
      </section>`;
    if (step === "join") return `
      <section class="panel title-menu">
        ${err}
        <div class="field-row"><label>あなたの名前</label>
          <input id="in-name" class="onw-input" maxlength="12" value="${esc(nm)}"></div>
        <div class="field-row"><label>部屋コード</label>
          <input id="in-code" class="onw-input" maxlength="4" style="text-transform:uppercase;" value="${esc(d.code)}" onkeydown="if(event.key==='Enter')ONW.main.joinRoom()"></div>
        <div class="title-btns">
          <button class="btn btn--primary btn--wide" onclick="ONW.main.joinRoom()">ルーム参加</button>
          <button class="btn btn--wide" onclick="ONW.main.titleBack()">戻る</button>
        </div>
      </section>`;
    const ri = ONW.net && ONW.net.rejoinInfo;
    const rejoinBox = ri ? `<div class="rejoin-box"><p class="lede">参加中のルームがあります（コード ＊＊＊＊）</p><button class="btn btn--primary btn--wide" onclick="ONW.main.rejoin()">ルームに戻る</button></div>` : "";
    const hr = ONW.net && ONW.net.hostResume;
    const hostBox = hr && !ri ? `<div class="rejoin-box"><p class="lede">前回のルームを再開できます（コード ＊＊＊＊）。CPU・固定役・進行を引き継ぎます。</p><button class="btn btn--primary btn--wide" onclick="ONW.main.resumeHost()">前回のルームを再開</button></div>` : "";
    return `
      ${ONW.accountUi ? ONW.accountUi.bar() : ""}
      <section class="panel title-menu">
        ${err}
        ${rejoinBox}${hostBox}
        <div class="title-btns">
          <button class="btn btn--primary btn--wide" onclick="ONW.main.titleStep('create')">ルーム作成</button>
          <button class="btn btn--primary btn--wide" onclick="ONW.main.titleStep('join')">ルーム参加</button>
        </div>
      </section>`;
  };

  /** スタートゲートの「ゲームを始める」: ゲートを閉じてタイトル画面へ進む。
   *  このタップ自体がサウンドの自動再生ロック解除も兼ねる（js/sound.js が window の pointerdown/click で unlock し、
   *  保留していたタイトルBGMを流し始める）。ゲートは #app の外の静的要素なので、閉じたら二度と出ない */
  ui.enterGame = function enterGame() {
    const g = document.getElementById("start-gate");
    if (!g || g.classList.contains("gate-done")) return;
    g.classList.add("gate-done");
    setTimeout(() => { if (g.parentNode) g.parentNode.removeChild(g); }, 450);
  };

  /** クレジット（タイトル画面のフッター、「オンライン対応」の上にある「クレジット」から開く。背景タップでも閉じる） */
  ui.openCredits = function openCredits() {
    if (document.getElementById("credits-overlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "credits-overlay";
    wrap.className = "credits-overlay";
    wrap.innerHTML = `
      <div class="credits-box">
        <div class="credits-head"><span>クレジット</span><button type="button" class="btn" onclick="ONW.ui.closeCredits()">閉じる</button></div>
        <h3>制作</h3>
        <p>KuRoHa</p>
        <p>AI:Codex(ChatGPT) ClaudeCode Muse</p>
        <h3>役職提案</h3>
        <p>KuRoHa グレ ダイ しらす 狐餅</p>
        <h3>参考</h3>
        <p>人狼ゲーム役職 など</p>
        <p class="credits-music">音楽：魔王魂 <a href="https://maou.audio/" target="_blank" rel="noopener">https://maou.audio/</a></p>
      </div>`;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) ui.closeCredits(); });
    document.body.appendChild(wrap);
  };
  ui.closeCredits = function closeCredits() {
    const w = document.getElementById("credits-overlay");
    if (w && w.parentNode) w.parentNode.removeChild(w);
  };

  /** 画面左上の□: 全画面の切り替え（非対応ブラウザではヘッダー等を隠す擬似全画面） */
  ui.toggleFullscreen = function () {
    const de = document.documentElement;
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    try {
      if (!isFs && (de.requestFullscreen || de.webkitRequestFullscreen)) {
        const r = (de.requestFullscreen || de.webkitRequestFullscreen).call(de);
        if (r && r.catch) r.catch(() => document.body.classList.toggle("pseudo-fs"));
        return;
      }
      if (isFs) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
    } catch (e) { /* 擬似全画面へ */ }
    document.body.classList.toggle("pseudo-fs");
  };

  /** 模倣の人狼のカードの下に出す、模倣先の枠（2of9）。role が模倣の人狼で、模倣先が決まっているときだけ */
  /** 配役発表などのカード(.dl-face)の役職名: 7文字以上の役職は、指定の場所で改行する（stage.js の NAME_BREAKS。各行は中央揃え）。それ以外は今までどおり */
  /** 配布カードの役職名（改行表を通す。最長行が5文字以上の改行名は、カードの幅に収まるよう小さくする: nb-s5 / nb-s6） */
  ui.nameBr = (name) => {
    const h = ONW.stage && ONW.stage.breakHtml ? ONW.stage.breakHtml(name) : esc(name);
    const n = Math.max(...h.split("<br>").map((x) => Array.from(x).length));
    // 改行表にない名前でも、5文字以上は折り返さず1行に収める（5文字=nb-s5 / 6文字以上=nb-s6。4文字以下は今までどおり）
    return h.includes("<br>") || n >= 5 ? `<span class="nb${n >= 5 ? ` nb-s${n > 5 ? 6 : 5}` : ""}">${h}</span>` : h;
  };
  ui.mimicTag = (role, target) => {   // 模倣の人狼: 模倣先の役職名 / 開拓者: 運命の名前（"fate:destruction" → 壊滅）を、カードの名前の下に枠で出す
    const fate = role === "trailblazer" && ONW.trailblazer.isView(target), nm = fate ? ONW.trailblazer.viewName(target) : role === "mimic_wolf" && target && ONW.ROLE_INFO[target] ? ONW.ROLE_INFO[target].name : "";
    return nm ? `<span class="tb-mimic dl-mimic${fate ? " tb-fate" : ""}">${ONW.stage && ONW.stage.breakHtml ? ONW.stage.breakHtml(nm) : esc(nm)}</span>` : "";
  };
  ui.personaMask = (role, mask, style) => {   // ペルソナ: 仮面をかぶる役職名が書かれた仮面が、ペルソナの役職名のところに被る（作者メモ）。style は animation-delay の指定（配布演出のタイミング）
    if (role !== "persona" || !mask || !ONW.ROLE_INFO[mask]) return "";
    return `<span class="dl-mask" style="${style || ""}"><span class="dl-mask-ic">🎭</span><b>${ui.nameBr(ONW.ROLE_INFO[mask].name)}</b></span>`;
  };
  ui.toggleGroup = function (key) { const g = ONW.game; g.roleOpen = { ...(g.roleOpen || {}), [key]: !(g.roleOpen || {})[key] }; ONW.ui.render(g); };
  ui.toggleInvite = function () {
    const g = ONW.game;
    g.invOpen = !g.invOpen;
    ONW.ui.render(g);
    if (g.invOpen && ONW.friends) ONW.friends.reload();
  };
  ui.toggleSettings = function () { ui.closeRoleMenu(); ONW.game.showSettings = !ONW.game.showSettings; ONW.game.setPage = null; ONW.game.roleSetPage = null; ONW.ui.render(ONW.game); };
  /** ルーム設定: タブ一覧 → そのページだけ表示 → 左上の戻るで一覧へ（page=null で一覧） */
  ui.setPage = function (page) {
    ONW.game.setPage = page || null; ONW.game.roleSetPage = null; ONW.ui.render(ONW.game);
    const mp = document.querySelector(".settings-panel--modal"); if (mp) mp.scrollTop = 0;
  };
  /** 役職設定の中: 配役設定 / 詳細設定 / アサイン設定（sub=null で役職設定の入口へ） */
  ui.setRolePage = function (sub) {
    ONW.game.roleSetPage = sub || null; ONW.ui.render(ONW.game);
    const mp = document.querySelector(".settings-panel--modal"); if (mp) mp.scrollTop = 0;
  };
  /** 左上の「戻る」: 役職設定の中の配役設定・詳細設定・アサイン設定からは役職設定の入口へ、それ以外は設定の一覧へ */
  ui.setBack = function () {
    const g = ONW.game;
    if (g.setPage === "secRoles" && g.roleSetPage) ui.setRolePage(null); else ui.setPage(null);
  };

  /** 役職の一覧（配役設定・役職設定の詳細設定で共通）。並びは wiki 順（ONW.sortByRoleOrder = ONW.ROLE_ORDER） */
  function roleLists() {
    const village = ONW.sortByRoleOrder(["light_apostle", "villager", "seer", "robber", "relic_robber", "troublemaker", "insomniac", "mason", "merlin", "wolf_dreamer", "spy", "cosplayer", "wolf_marked", "fox_marked", "keymaster", "straw_doll", "cat_sidhe", "baker", "star", "newspaper", "chicken", "mayor", "visitor", "queen", "tough_guy", "dictator", "exchanger", "penguin", "watchdog", "sheriff", "cursed_one", "thief", "sense_seer", "princess", "libra", "fake_seer", "poet", "major", "finger_reader", "gambler", "priest", "fairy", "aa", "goranshin", "steve", "icarus", "election_manager", "moses", "yomi", "carmen", "knight", "trailblazer", "hokma", "bartender", "psychologist", "clone", "whimsical_seer", "medium", "apprentice_seer", "lookout", "agitator", "bell_miko", "donut_shop", "hayatochiri", "screw_gum", "hunter", "necromancer", "counselor", "ren", "trap_master"]);
    const wolfLike = ONW.sortByRoleOrder(["werewolf", "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf", "forgetful_wolf", "assassin", "wolf_king", "mapo_wolf", "cat_pumpkin", "observer_wolf", "mind_wolf", "mimic_wolf", "eraser_wolf", "mirage_wolf", "silver_wolf", "command_wolf", "curse_wolf", "negi_wolf", "patch"]), madLike = ONW.sortByRoleOrder(["madman", "mad_seer", "cultist", "black_cat", "exposed_madman", "muzzle_madman", "rebel_madman", "mad_queen", "black_wolf_madman", "mad_mayor", "seal_madman", "mad_exchanger", "tenacious_madman", "jester_madman", "smoke_madman", "mad_priest", "rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman", "mad_agitator", "crazy_donut_shop"]), dark = ["dark_avatar"];
    const third = ONW.sortByRoleOrder(["silver_shadow", "tanner", "love_tanner", "god", "opportunist", "amanojaku", "freeter", "servant", "winner", "loser", "doppelganger", "schrodinger_cat", "executioner", "gremlin", "pure_lover", "evil_woman", "cupid", "heartbreaker", "shuffler", "bounty_hunter", "fox", "fanatic", "balancer", "avenger", "prankster", "jester_bomber", "detective", "demon_duke", "martyr", "predictor", "reverser", "lawyer", "watcher", "vanity", "beggar", "magical_girl", "matthias", "chesed", "yokai_tanuki", "nanoka", "agent", "elfrinde", "hotaru", "mercenary", "thread_spinner", "magician", "wagerer", "persona", "multi_personality", "odd_one", "even_one", "jester_ghost", "telepathist", "copylist", "detective_ghost"]);   // 娘ちゃん(daughter)と なのかの形態3種・サム(sam)は内部専用役職なので配役設定の一覧には出さない
    return { village, wolfLike, madLike, dark, third };
  }

  // ---- 役職設定 > 詳細設定: 役職ごとの設定 ----
  // 役職を押すと、画面をずらさず上に重なるメニュー（#rs-overlay。ロビーの名前メニュー #pm-overlay と同じ方式）で、その役職の設定が出る。
  // 設定のある役職は下の ROLE_SETTINGS に足す（関数が (game, isHost) を受け取って中身のHTMLを返す）。
  const stepRow = (isHost, label, value, minus, plus) => `
      <div class="field-row"><label>${label}</label>
        ${isHost ? `<div class="stepper"><button onclick="${minus}">−</button><span>${value}</span><button onclick="${plus}">＋</button></div>` : `<span>${value}</span>`}
      </div>`;
  const setRow = (isHost, game, label, key, dflt) => stepRow(isHost, label, game[key] ?? dflt, `ONW.net.changeSetting('${key}',-1)`, `ONW.net.changeSetting('${key}',1)`);
  /** 変化先のON/OFFのチップ（変化役 b が変化できる役職 list） */
  const tfChipsHtml = (game, isHost, b, list) => {
    const offList = game.transformOff || [];
    return `<div class="tf-set__chips">${list.map((t) => {
      const on = !offList.includes(`${b}:${t}`);
      const label = `${esc(ONW.roles.getInfo(t).name)} ${on ? "ON" : "OFF"}`;
      return isHost ? `<button class="btn tf-chip ${on ? "tf-on" : "tf-off"}" onclick="ONW.net.toggleTarget('${b}','${t}')">${label}</button>` : `<span class="tf-chip ${on ? "tf-on" : "tf-off"}">${label}</span>`;
    }).join("")}</div>`;
  };
  const TF_HINT = `<p class="night-step__hint">押すと、変化先にする役職をON/OFFできます。OFFの役職には変化せず、COの候補にも出ません。全部OFFだとこの変化役は変化しません。</p>`;
  const hint = (t) => `<p class="night-step__hint">${t}</p>`;
  /** ON/OFFを切り替える1行（ホストはボタン・ほかの人は表示のみ）。key は net.toggleOpt が受け付ける設定名 */
  const onoffRow = (isHost, game, label, key, dflt) => { const on = dflt ? game[key] !== false : game[key] === true; return `<div class="field-row"><label>${label}</label>${isHost ? `<button class="btn" onclick="ONW.net.toggleOpt('${key}')">${on ? "ON" : "OFF"}</button>` : `<span>${on ? "ON" : "OFF"}</span>`}</div>`; };
  const SEER_GRAVE = (game, isHost, who, key) => setRow(isHost, game, "墓地を占える枚数", key, 2) + hint(`${who}が夜に確認できる墓地のカードの枚数です（墓地の枚数が上限。ほかの占い系の役職とは別の設定）。`);
  const ROLE_SETTINGS = {
    seer: (g, h) => SEER_GRAVE(g, h, "占い師", "seerGraveCount"),
    fake_seer: (g, h) => SEER_GRAVE(g, h, "偽占い師", "fakeSeerGraveCount"),
    mad_seer: (g, h) => SEER_GRAVE(g, h, "狂った占い師", "madSeerGraveCount"),
    mayor: (g, h) => setRow(h, g, "投票数", "mayorVoteCount", 2) + hint("メイヤーが昼の投票で持つ票数です（2〜10票）。最終盤面でメイヤーを持っている人の1票が、この票数ぶんとして数えられます。"),
    mad_mayor: (g, h) => setRow(h, g, "投票数", "madMayorVoteCount", 2) + hint("狂ったメイヤーが昼の投票で持つ票数です（2〜10票。メイヤーとは別の設定）。最終盤面で狂ったメイヤーを持っている人の1票が、この票数ぶんとして数えられます。"),
    smoke_madman: (g, h) => onoffRow(h, g, "能力対象のプレイヤー名も隠す", "smokeHideAbility") + hint("ON: 煙幕のあいだ、昼の能力対象（酔いが覚めたあとの夜能力・昼能力）のプレイヤー名が「？？？」になります。煙幕がもくもくしたあと、名前が「？？？」に変わって席がシャッフルされ、能力を選ぶたびにも席がランダムに入れ替わります。OFF（初期値）: 名前はそのまま見えます。") + onoffRow(h, g, "投票対象のプレイヤー名も隠す", "smokeHideVote") + hint("ON: 煙幕のあいだ、投票対象のプレイヤー名が「？？？」になります。投票の開始時にも席がシャッフルされ、昼のあいだとは別の並びになります。OFF（初期値）: 名前はそのまま見えます。能力対象とは別々に設定できます。"),
    light_apostle: (g, h) => `<h3 class="set-sub">変化先の有無</h3>${TF_HINT}${tfChipsHtml(g, h, "light_apostle", ONW.TRANSFORM_GROUPS.light_apostle)}`,
    dark_avatar: (g, h) => { const L = roleLists(); return `<h3 class="set-sub">変化先の有無（人狼系）</h3>${TF_HINT}${tfChipsHtml(g, h, "dark_avatar", L.wolfLike)}<h3 class="set-sub">変化先の有無（狂人系）</h3>${tfChipsHtml(g, h, "dark_avatar", L.madLike)}`; },
    silver_shadow: (g, h) => `<h3 class="set-sub">変化先の有無</h3>${TF_HINT}${tfChipsHtml(g, h, "silver_shadow", ONW.TRANSFORM_GROUPS.silver_shadow)}`,
  };
  // ---- 役職設定 > アサイン設定（js/assign.js / docs/assign.md）----
  // OFF（初期値）: 従来どおり。ON: 配役設定の枚数が「候補」になり、陣営ごとの最少〜最大人数と、役職ごとの出る確率で、試合の開始のときに配役数ぴったりを抽選する。
  const CIRC = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
  function assignPage(game, isHost) {
    const A = ONW.assign, c = A.check(game), on = !!game.assignOn;
    const sw = `<div class="field-row"><label>アサイン設定</label>${isHost ? `<button class="btn" onclick="ONW.net.toggleAssign()">${on ? "ON" : "OFF"}</button>` : `<span>${on ? "ON" : "OFF"}</span>`}</div>`;
    const intro = hint("OFF: 従来どおり、配役設定の枚数がそのまま配役になります。ON: 配役設定の枚数は「候補」になり、ゲーム開始のときに、下の人数と確率で配役数（何人村＋墓地）ぴったりを抽選します。選ばれなかった役職は、結果の役職履歴の下に「欠け」として出ます。");
    if (!on) return sw + intro;
    const R = A.ranges(game), minSum = A.TEAMS.reduce((n, t) => n + R[t][0], 0), maxSum = A.TEAMS.reduce((n, t) => n + R[t][1], 0);
    const teams = A.TEAMS.map((t) => `
      <div class="role-group t-${t}"><div class="role-group__title">${A.TEAM_NAME[t]}<span class="rg-count"> 候補 ${c.cap[t]}枚</span></div>
        ${stepRow(isHost, "最少人数", `${R[t][0]}人`, `ONW.net.changeAssign('${t}',0,-1)`, `ONW.net.changeAssign('${t}',0,1)`)}
        ${stepRow(isHost, "最大人数", `${R[t][1]}人`, `ONW.net.changeAssign('${t}',1,-1)`, `ONW.net.changeAssign('${t}',1,1)`)}
      </div>`).join("");
    const warn = !c.ok ? hint(`候補が足りません。配役設定の枚数を増やしてください（配役${c.need}枚 / 候補${c.have}枚）。`)
      : !c.fit ? hint(minSum > c.need || maxSum < c.need ? `各陣営の最少・最大の合計が、配役${c.need}枚に合いません（最少の合計${minSum}人・最大の合計${maxSum}人）。開始はできますが、範囲を少しはみ出して配役します。`
        : `いまの候補（村人${c.cap.village}枚・人狼${c.cap.wolf}枚・第三${c.cap.third}枚）では、この範囲で配役${c.need}枚ぴったりになる組み合わせがありません。開始はできますが、範囲を少しはみ出して配役します。候補を増やすか、範囲を広げてください。`) : "";
    // 役職ごとの出る確率: 配役設定で1枚以上の役職だけ。陣営ごとに、wiki順
    const have = ONW.sortByRoleOrder(Object.keys(game.roleCounts || {}).filter((r) => (game.roleCounts[r] || 0) > 0 && rmHit(r)));   // 検索中は、ヒットした役職だけ
    const roleBox = (r) => {
      const n = game.roleCounts[r];
      return `<div class="asg-role"><div class="asg-role__name"><span>${esc(ONW.roles.getInfo(r).name)}</span><span class="rg-count">${n}枚</span></div>
        ${Array.from({ length: n }, (_, k) => stepRow(isHost, `${CIRC[k] || k + 1} 出る確率`, `${A.chance(game, r, k)}%`, `ONW.net.changeAssignChance('${r}',${k},-5)`, `ONW.net.changeAssignChance('${r}',${k},5)`)).join("")}
      </div>`;
    };
    const chances = A.TEAMS.map((t) => {
      const list = have.filter((r) => A.teamOf(r) === t);
      return list.length ? `<div class="role-group t-${t}"><div class="role-group__title">${A.TEAM_NAME[t]}</div>${list.map(roleBox).join("")}</div>` : "";
    }).join("");
    return `${sw}${intro}
      <p class="night-step__hint">配役数 ${c.need}枚（${game.villageSize}人村＋墓地${game.graveCount}枚） / 候補 ${c.have}枚</p>
      <h3 class="set-sub">陣営ごとの人数</h3>
      ${hint("各陣営の人数を、最少〜最大の範囲でランダムに決めます。配役される役職数は必ずプレイヤー数＋墓地の枚数と同じになります（例: 6枚で全陣営が最少1・最大2なら、2・2・2枚になります）。")}
      ${teams}${warn}
      <h3 class="set-sub">役職ごとの出る確率</h3>
      ${hint("配役設定で入れた役職は、①②…の札ごとに確率を決められます（配役設定で役職を押しても同じ確率を変えられます）。100%は必ず候補に入り、0%は出ません。確率に当たった札の中から、陣営の人数ぶんが選ばれます（例: 光の使徒 ①100% ②50% と 闇の化身 ①100% ②50% なら、光2・闇1 や 光1・闇2 になります）。")}
      ${chances || (rmQ() ? rmNone() : hint("配役設定で役職の枚数を入れると、ここに出ます。"))}`;
  }
  /** 詳細設定のページ本体: 村人陣営 / 人狼陣営（人狼系・狂人系）/ 第三陣営 に分けて、wiki順に役職を並べる。設定のある役職だけ押せる */
  function roleDetailPage(game) {
    const q = rmQ(), L0 = roleLists();
    const has = (r) => !!ROLE_SETTINGS[r];
    const F = (l) => l.filter((r) => has(r) && rmHit(r)), L = { village: F(L0.village), dark: F(L0.dark), wolfLike: F(L0.wolfLike), madLike: F(L0.madLike), third: F(L0.third) };   // 設定のある役職だけ（検索中は、さらにヒットした役職だけ）。設定のない役職・役職のいない陣営は出さない
    const cnt = (list) => list.filter(has).length;
    // 陣営を押すと、画面をずらさず、さらに上に重なるメニュー（#rg-overlay）で設定のある役職が並ぶ。役職を押すと、その上にさらに重なって設定が出る（検索中だけ、ヒットした役職をそのまま並べる）
    const head = (key, title, list) => `
      <button class="rg-head" onclick="ONW.ui.openRoleGroup('${key}')">
        <span>${title}</span><span class="rg-count"><b class="set-tab__go">›</b></span>
      </button>`;
    const item = (r) => `<button class="rs-role" onclick="ONW.ui.openRoleSet('${r}')"><span>${esc(ONW.roles.getInfo(r).name)}</span><span class="rg-count">設定 <b class="set-tab__go">›</b></span></button>`;
    const list = (arr) => arr.map(item).join("");
    const sub = (title, arr) => (arr.length ? `<div class="rg-sub"><div class="rg-label">${title}</div>${list(arr)}</div>` : "");
    const wolfAll = [...L.dark, ...L.wolfLike, ...L.madLike];
    const total = L.village.length + wolfAll.length + L.third.length;
    return `
      <p class="night-step__hint">陣営を押すと、設定のある役職が上に重なって出ます。役職を押すと、その役職の設定がさらに上に重なります。</p>
      ${total ? "" : q ? rmNone() : hint("設定のある役職がありません。")}
      ${L.village.length ? `<div class="role-group t-village">${head("village", "村人陣営", L.village)}${q ? list(L.village) : ""}</div>` : ""}
      ${wolfAll.length ? `<div class="role-group t-wolf">${head("wolf", "人狼陣営", wolfAll)}${q ? `${list(L.dark)}${sub("人狼系", L.wolfLike)}${sub("狂人系", L.madLike)}` : ""}</div>` : ""}
      ${L.third.length ? `<div class="role-group t-third">${head("third", "第三陣営", L.third)}${q ? list(L.third) : ""}</div>` : ""}`;
  }
  let rmKind = null;   // 役職設定の重なるメニュー（deck / detail / assign）
  let rsRole = null;   // 設定メニューを開いている役職
  let rsKind = null;   // null = 詳細設定の役職ごとの設定 / "chance" = 配役設定の役職ごとの「出る確率」（アサイン設定。枚数も同じ画面で変えられる）
  ui.openRoleSet = function (role) { if (!ROLE_SETTINGS[role]) return; rsRole = role; rsKind = null; ui.refreshRoleSet(); };
  /** 配役設定の役職を押したとき: 役職ごとの出る確率（枚数・①②…の確率）が、画面をずらさず上に重なるメニュー（#rs-overlay）で出る */
  ui.openRoleChance = function (role) { if (!(role in (ONW.game.roleCounts || {}))) return; rsRole = role; rsKind = "chance"; ui.refreshRoleSet(); const c = document.querySelector("#rs-overlay .rs-card"); if (c) c.scrollTop = 0; };
  ui.closeRoleSet = function () { rsRole = null; rsKind = null; const w = document.getElementById("rs-overlay"); if (w) w.remove(); };
  /** 開いているメニューを最新の設定で描き直す（設定を変えるたび・ロビーが描き直されるたびに呼ばれる。詳細設定のページを離れたら閉じる） */
  ui.refreshRoleSet = function () {
    if (rsRole === null) return;
    const g = ONW.game;
    if (g.phase !== ONW.PHASE.LOBBY || !g.showSettings || g.setPage !== "secRoles" || rmKind !== (rsKind === "chance" ? "deck" : "detail")) { ui.closeRoleSet(); return; }
    let w = document.getElementById("rs-overlay");
    if (!w) {
      w = document.createElement("div");
      w.id = "rs-overlay";
      w.onclick = (e) => { if (e.target === w) ui.closeRoleSet(); };
      document.body.appendChild(w);
    }
    const old = w.querySelector(".rs-card"), top = old ? old.scrollTop : 0, info = ONW.roles.getInfo(rsRole);
    w.innerHTML = `<div class="pm-card rs-card" role="dialog" aria-modal="true">
      <div class="pm-title t-${info.team}">${esc(info.name)}</div><button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.ui.closeRoleSet()">✕</button>
      ${rsKind === "chance" ? roleChanceBody(rsRole, g, ONW.net.isHost) : ROLE_SETTINGS[rsRole](g, ONW.net.isHost)}
    </div>`;
    const card = w.querySelector(".rs-card"); if (card) card.scrollTop = top;
  };

  // ---- 役職設定の重なるメニュー共通: 役職の検索（ヒットの仕方はwikiの「役職名」検索と同じ = 大文字小文字を区別しない部分一致）----
  let rmQuery = "";   // 検索ボックスの文字（メニューを開き直すと空に戻る）
  const rmQ = () => rmQuery.trim().toLowerCase();
  const rmHit = (r) => { const q = rmQ(); return !q || ONW.roles.getInfo(r).name.toLowerCase().includes(q); };
  const rmNone = () => `<p class="night-step__hint">「${esc(rmQuery.trim())}」に当てはまる役職がありません。</p>`;

  /** 配役設定の役職ごとのメニュー（#rs-overlay）の中身: 枚数と、札（①②…）ごとの出る確率（アサイン設定。js/assign.js） */
  function roleChanceBody(role, game, isHost) {
    const A = ONW.assign, n = game.roleCounts[role] || 0, on = !!game.assignOn;
    const note = hint(on ? "アサイン設定がONなので、配役設定の枚数は「候補」です。①②…の札ごとの確率で、出る札が決まります（100%は必ず候補に入り、0%は出ません）。" : "確率が使われるのは、アサイン設定がONのときです（OFFのあいだは、枚数どおりに配役されます）。");
    const cnt = stepRow(isHost, "枚数", `${n}枚`, `ONW.net.changeRole('${role}',-1)`, `ONW.net.changeRole('${role}',1)`);
    const rows = n > 0 ? Array.from({ length: n }, (_, k) => stepRow(isHost, `${CIRC[k] || k + 1} 出る確率`, `${A.chance(game, role, k)}%`, `ONW.net.changeAssignChance('${role}',${k},-5)`, `ONW.net.changeAssignChance('${role}',${k},5)`)).join("") : hint("枚数を1枚以上にすると、①②…の札ごとの確率を決められます。");
    return `${note}${cnt}${rows}`;
  }
  /** 配役設定の役職の行: 役職名を押すとその役職の確率メニューが重なって出る / 右は枚数の＋− */
  function deckRoleRow(game, isHost, r) {
    const n = game.roleCounts[r] ?? 0, nm = esc(ONW.roles.getInfo(r).name);
    return `<div class="field-row"><button class="rs-role" onclick="ONW.ui.openRoleChance('${r}')"><span>${nm}</span><span class="rg-count">確率 <b class="set-tab__go">›</b></span></button>
        ${isHost ? `<div class="stepper"><button onclick="ONW.net.changeRole('${r}',-1)">−</button><span>${n}</span><button onclick="ONW.net.changeRole('${r}',1)">＋</button></div>` : `<span>${n}</span>`}
      </div>`;
  }
  // ---- 役職設定 > 配役設定（重なるメニューの中身）----
  // 陣営（村人・人狼・第三・重複役職）を押すと、画面をずらさず、さらに上に重なるメニュー（#rg-overlay）で中の役職の枚数を変える（検索中は、ヒットした役職だけ配役設定の中にそのまま出す）
  const RG_TITLE = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営", dup: "重複役職" };
  let rgKey = null;   // 陣営のメニューを開いている陣営（village / wolf / third / dup）
  /** 陣営のメニューの中身（配役設定の枚数の行）。wolf は 闇の化身 → 人狼系 → 狂人系 の順 */
  function deckGroupRows(key, game, isHost) {
    if (rmKind === "detail") return detailGroupRows(key);
    const c = game.roleCounts, L0 = roleLists();
    const row = (label, value, minus, plus) => stepRow(isHost, label, value, minus, plus);
    const roleRow = (r) => deckRoleRow(game, isHost, r);
    if (key === "village") return L0.village.map(roleRow).join("");
    if (key === "third") return L0.third.map(roleRow).join("");
    if (key === "wolf") return `${L0.dark.map(roleRow).join("")}
      <div class="rg-sub"><div class="rg-label">人狼系</div>${L0.wolfLike.map(roleRow).join("")}</div>
      <div class="rg-sub"><div class="rg-label">狂人系</div>${L0.madLike.map(roleRow).join("")}</div>`;
    if (key === "dup") return `${row("酔っ払い(人)", game.drunkCount || 0, "ONW.net.changeSetting('drunkCount',-1)", "ONW.net.changeSetting('drunkCount',1)")}
        ${dupChanceRows("drunk", game.drunkCount || 0, "酔う確率", row)}
        <p class="night-step__hint" style="margin:4px 8px 8px;">配役の枚数には数えません。ランダムな参加者（CPU含む）に重なり、議論時間の半分が過ぎるまで自分の役職が分かりません。人数ぶんの枠（①②…）が、それぞれの「酔う確率」で当たります（アサイン設定のON/OFFに関係なく、1枠ごとに決められます。初期値100%）。</p>
        ${row("恋人(組)", game.loverCount || 0, "ONW.net.changeSetting('loverCount',-1)", "ONW.net.changeSetting('loverCount',1)")}
        ${dupChanceRows("lover", game.loverCount || 0, "恋人になる確率", row)}
        <p class="night-step__hint" style="margin:4px 8px 8px;">恋人は2人1組で、ランダムな参加者（CPU含む）に重なります（酔っ払いと同じ人に重なることもあります）。組（①②…）ごとの「恋人になる確率」を、アサイン設定のON/OFFに関係なく決められます（初期値100%）。夜に相方のカードが❤️でめくれ、相方が死亡すると、死因を問わず同時に心中します。二人とも死ななければ恋人陣営の勝利で、恋人以外は敗北です。組数は村の人数の半分までです。</p>`;
    return "";
  }
  /** 重複役職（酔っ払い・恋人）の、枠(①②…)ごとの確率の行。枠の数（人数・組数）が0なら出さない。値は g.drunkChances / g.loverChances（js/assign.js A.dupChance） */
  function dupChanceRows(kind, n, label, row) {
    const A = ONW.assign, g = ONW.game;
    return Array.from({ length: n }, (_, k) => row(`${CIRC[k] || k + 1} ${label}`, `${A.dupChance(g, kind, k)}%`, `ONW.net.changeDupChance('${kind}',${k},-5)`, `ONW.net.changeDupChance('${kind}',${k},5)`)).join("");
  }
  /** 詳細設定の陣営のメニューの中身（設定のある役職の行。押すとその役職の設定がさらに上に重なる）。wolf は 闇の化身 → 人狼系 → 狂人系 */
  function detailGroupRows(key) {
    const L0 = roleLists(), has = (r) => !!ROLE_SETTINGS[r];
    const item = (r) => `<button class="rs-role" onclick="ONW.ui.openRoleSet('${r}')"><span>${esc(ONW.roles.getInfo(r).name)}</span><span class="rg-count">設定 <b class="set-tab__go">›</b></span></button>`;
    const list = (arr) => arr.filter(has).map(item).join("");
    const sub = (title, arr) => (arr.some(has) ? `<div class="rg-sub"><div class="rg-label">${title}</div>${list(arr)}</div>` : "");
    if (key === "village") return list(L0.village);
    if (key === "third") return list(L0.third);
    if (key === "wolf") return `${list(L0.dark)}${sub("人狼系", L0.wolfLike)}${sub("狂人系", L0.madLike)}`;
    return "";
  }
  ui.openRoleGroup = function (key) { if (!RG_TITLE[key]) return; rgKey = key; ui.refreshRoleGroup(); const c = document.querySelector("#rg-overlay .rg-card"); if (c) c.scrollTop = 0; };
  ui.closeRoleGroup = function () { rgKey = null; ui.closeRoleSet(); const w = document.getElementById("rg-overlay"); if (w) w.remove(); };
  /** 開いている陣営のメニューを最新の設定で描き直す（枚数を変えるたび・ロビーが描き直されるたびに呼ばれる。配役設定を離れたら閉じる） */
  ui.refreshRoleGroup = function () {
    if (rgKey === null) return;
    const g = ONW.game, isHost = ONW.net.isHost;
    if (g.phase !== ONW.PHASE.LOBBY || !g.showSettings || g.setPage !== "secRoles" || (rmKind !== "deck" && rmKind !== "detail")) { ui.closeRoleGroup(); return; }
    let w = document.getElementById("rg-overlay");
    if (!w) {
      w = document.createElement("div");
      w.id = "rg-overlay";
      w.onclick = (e) => { if (e.target === w) ui.closeRoleGroup(); };
      document.body.appendChild(w);
    }
    const old = w.querySelector(".rg-card"), top = old ? old.scrollTop : 0;
    const need = g.villageSize + g.graveCount, have = Object.values(g.roleCounts).reduce((a, b) => a + b, 0);
    const L0 = roleLists(), list = rgKey === "village" ? L0.village : rgKey === "third" ? L0.third : rgKey === "wolf" ? [...L0.dark, ...L0.wolfLike, ...L0.madLike] : [];
    const sum = list.reduce((n, r) => n + (g.roleCounts[r] ?? 0), 0);
    const hintTxt = rmKind === "detail" || rgKey === "dup" ? "" : `${RG_TITLE[rgKey]} ${sum}枚 / ${g.assignOn ? `候補 ${have}枚（配役${need}枚を抽選）` : `現在 ${have}枚 / 必要 ${need}枚`}`;
    w.innerHTML = `<div class="pm-card rg-card" role="dialog" aria-modal="true">
      <div class="pm-title t-${rgKey}">${RG_TITLE[rgKey]}</div><button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.ui.closeRoleGroup()">✕</button>
      ${hintTxt ? `<p class="night-step__hint" style="text-align:center;">${hintTxt}</p>` : ""}
      ${deckGroupRows(rgKey, g, isHost)}
    </div>`;
    const card = w.querySelector(".rg-card"); if (card) card.scrollTop = top;
  };
  function deckPage(game, isHost) {
    const c = game.roleCounts, need = game.villageSize + game.graveCount, have = Object.values(c).reduce((a, b) => a + b, 0);
    const row = (label, value, minus, plus) => stepRow(isHost, label, value, minus, plus);
    const roleRow = (r) => deckRoleRow(game, isHost, r);
    // 陣営だけを並べ、押すと中の役職が上に重なるメニューで開く（検索中だけ、ヒットした役職をそのまま並べる）
    const q = rmQ();
    const sum = (list) => list.reduce((n, r) => n + (c[r] ?? 0), 0);
    const head = (key, title, list, sub) => `
      <button class="rg-head ${sub ? "rg-head--sub" : ""}" onclick="ONW.ui.openRoleGroup('${key}')">
        <span>${title}</span><span class="rg-count">${sum(list)}枚 <b class="set-tab__go">›</b></span>
      </button>`;
    const L0 = roleLists(), F = (l) => l.filter(rmHit);   // 配役設定・詳細設定とも、wiki順（ONW.ROLE_ORDER）の同じ並び
    const village = F(L0.village), wolfLike = F(L0.wolfLike), madLike = F(L0.madLike), dark = F(L0.dark), third = F(L0.third);
    const hasHit = !q || village.length + wolfLike.length + madLike.length + dark.length + third.length > 0;
    const hits = (title, list) => `<div class="rg-sub"><div class="rg-label">${title}</div>${list.map(roleRow).join("")}</div>`;
    const roles = q ? `
      ${hasHit ? "" : rmNone()}
      ${village.length ? `<div class="role-group t-village">${head("village", "村人陣営", village)}${village.map(roleRow).join("")}</div>` : ""}
      ${dark.length + wolfLike.length + madLike.length ? `<div class="role-group t-wolf">${head("wolf", "人狼陣営", [...dark, ...wolfLike, ...madLike])}
          ${dark.map(roleRow).join("")}${wolfLike.length ? hits("人狼系", wolfLike) : ""}${madLike.length ? hits("狂人系", madLike) : ""}
      </div>` : ""}
      ${third.length ? `<div class="role-group t-third">${head("third", "第三陣営", third)}${third.map(roleRow).join("")}</div>` : ""}` : `
      <div class="role-group t-village">${head("village", "村人陣営", L0.village)}</div>
      <div class="role-group t-wolf">${head("wolf", "人狼陣営", [...L0.dark, ...L0.wolfLike, ...L0.madLike])}</div>
      <div class="role-group t-third">${head("third", "第三陣営", L0.third)}</div>
      <div class="role-group t-dup"><button class="rg-head" onclick="ONW.ui.openRoleGroup('dup')"><span>重複役職</span><span class="rg-count">酔${game.drunkCount || 0}人・恋${game.loverCount || 0}組 <b class="set-tab__go">›</b></span></button></div>`;
    return `<p class="night-step__hint">${game.assignOn ? `アサイン設定ON: ここで入れた枚数は候補です。配役${need}枚（${game.villageSize}人村+墓地${game.graveCount}枚）を、ゲーム開始のときに抽選します / 現在の候補 ${have}枚` : `必要枚数: ${need}枚（${game.villageSize}人村+墓地${game.graveCount}枚） / 現在 ${have}枚`}</p>${roles}`;
  }
  // ---- 役職設定: 配役設定 / 詳細設定 / アサイン設定は、画面をずらさず上に重なるメニュー（#rm-overlay）で開く ----
  const RM_TITLE = { deck: "配役設定", detail: "詳細設定", assign: "アサイン設定" };
  ui.openRoleMenu = function (kind) { if (!RM_TITLE[kind]) return; const prev = rmKind; if (prev !== kind) rmQuery = ""; rmKind = kind; if (prev !== kind) { ui.closeRoleSet(); ui.closeRoleGroup(); } ui.refreshRoleMenu(); const c = document.querySelector("#rm-overlay .rm-card"); if (c) c.scrollTop = 0; };
  ui.closeRoleMenu = function () { rmKind = null; rmQuery = ""; ui.closeRoleSet(); ui.closeRoleGroup(); const w = document.getElementById("rm-overlay"); if (w) w.remove(); };
  /** 検索ボックスの入力: 中身（役職の一覧）だけを描き直す（入力ボックスは作り直さないので、日本語入力の途中でも切れない） */
  ui.setRoleSearch = function (v) { rmQuery = String(v || ""); ui.refreshRoleMenu(); };
  /** 開いているメニューを最新の設定で描き直す（設定を変えるたび・ロビーが描き直されるたびに呼ばれる。役職設定のページを離れたら閉じる） */
  ui.refreshRoleMenu = function () {
    if (rmKind === null) return;
    const g = ONW.game, isHost = ONW.net.isHost;
    if (g.phase !== ONW.PHASE.LOBBY || !g.showSettings || g.setPage !== "secRoles") { ui.closeRoleMenu(); return; }
    let w = document.getElementById("rm-overlay");
    if (!w) {
      w = document.createElement("div");
      w.id = "rm-overlay";
      w.onclick = (e) => { if (e.target === w) ui.closeRoleMenu(); };
      document.body.appendChild(w);
    }
    const inner = rmKind === "deck" ? deckPage(g, isHost) : rmKind === "detail" ? roleDetailPage(g) : assignPage(g, isHost);
    let card = w.querySelector(".rm-card");
    if (!card || card.dataset.kind !== rmKind) {   // 開いたとき・別のメニューに切り替えたとき: 枠と検索ボックスを作る
      w.innerHTML = `<div class="pm-card rm-card" role="dialog" aria-modal="true" data-kind="${rmKind}">
        <div class="pm-title">${RM_TITLE[rmKind]}</div><button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.ui.closeRoleMenu()">✕</button>
        <input class="onw-input rm-search" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="役職名で検索" value="${esc(rmQuery)}" oninput="ONW.ui.setRoleSearch(this.value)" aria-label="役職名で検索">
        <div class="rm-body"></div>
      </div>`;
      card = w.querySelector(".rm-card");
    }
    const body = card.querySelector(".rm-body"), top = card.scrollTop;
    body.innerHTML = inner;
    card.scrollTop = top;
    ui.refreshRoleGroup();
  };

  // ---- ルーム設定パネル（「ルーム設定」を押すと出る）----
  function settingsPanel(game, isHost, total) {
    const c = game.roleCounts, need = game.villageSize + game.graveCount, have = Object.values(c).reduce((a, b) => a + b, 0);
    const row = (label, value, minus, plus) => `
      <div class="field-row"><label>${label}</label>
        ${isHost ? `<div class="stepper"><button onclick="${minus}">−</button><span>${value}</span><button onclick="${plus}">＋</button></div>` : `<span>${value}</span>`}
      </div>`;
    // 起こる順: 役職配布 → 夜 → 朝 → 待機時間 → 昼・議論 → 夕方・投票（待機時間は1秒刻み。ほかは5秒刻み）
    const TM_DEF = { deal: 5, settle: 5 };   // 古い版のホストの設定には役職配布・待機時間が無いので、初期値を見せる
    const timers = [["deal", "役職配布(演出のあとの待ち・秒)", 5], ["night", "夜時間(秒)", 5], ["morning", "朝時間(秒)", 5], ["settle", "待機時間(秒)", 1], ["day", "昼・議論(秒)", 5], ["vote", "夕方・投票(秒)", 5]].map(([k, l, st]) =>
      row(l, game.timers[k] ?? TM_DEF[k], `ONW.net.changeTimer('${k}',-${st})`, `ONW.net.changeTimer('${k}',${st})`)).join("") +
      `<p class="night-step__hint" style="margin:4px 8px 8px;">役職配布は、配る演出が終わってから夜になるまでの余裕です（0秒なら演出が終わってすぐ夜）。待機時間は、朝が終わってから昼になるまでで、短くすると待機時間の演出が間に合わず途切れることがあります。</p>`;
    const presets = isHost ? ONW.settings.listPresets() : [];
    const presetUi = isHost ? `
      <h3 class="set-sub">マイルール</h3>
      <div class="chat-input">
        <input class="onw-input" maxlength="20" placeholder="ルール名" value="${esc(game.presetName)}" oninput="ONW.game.presetName=this.value">
        <button class="btn" onclick="ONW.net.savePreset()">今のルールを保存</button>
      </div>
      ${presets.length ? presets.map((p, i) => game.renameIdx === i ? `
        <div class="result-role"><span style="flex:1;"><input class="onw-input" maxlength="20" placeholder="新しいルール名" value="${esc(game.renameText)}" oninput="ONW.game.renameText=this.value" onkeydown="if(event.key==='Enter')ONW.net.commitRename()"></span>
          <span><button class="btn" onclick="ONW.net.commitRename()">決定</button> <button class="btn" onclick="ONW.net.cancelRename()">やめる</button></span>
        </div>` : `
        <div class="result-role"><span>${esc(p.name)}</span>
          <span><button class="btn" onclick="ONW.net.loadPreset(${i})">読み込む</button> <button class="btn" onclick="ONW.net.updatePreset(${i})">更新</button> <button class="btn" onclick="ONW.net.startRename(${i})">名前変更</button> <button class="btn" onclick="ONW.net.copyPresetCode(${i})">コードコピー</button> <button class="btn" onclick="ONW.net.showCode(${i})">コード表示</button> <button class="btn" onclick="ONW.net.deletePreset(${i})">削除</button></span>
        </div>`).join("") : `<p class="night-step__hint">保存したルールはまだありません。</p>`}
      <h3 class="set-sub">ルールコード</h3>
      <p class="night-step__hint">コードを友達に送ると、同じルールを読み込めます。</p>
      <div class="btn-row"><button class="btn" onclick="ONW.net.showCode(null)">今のルールのコードを出す</button></div>
      ${game.codeText ? `<div class="chat-input"><input class="onw-input" readonly value="${esc(game.codeText)}" onclick="this.select()"><button class="btn" onclick="ONW.net.copyCode()">コピー</button></div>` : ""}
      <div class="chat-input">
        <input class="onw-input" placeholder="ルールコードを貼り付け" value="${esc(game.importText)}" oninput="ONW.game.importText=this.value">
        <button class="btn" onclick="ONW.net.importCode()">読み込む</button>
      </div>
      ${game.codeMsg ? `<p class="night-step__hint">${esc(game.codeMsg)}</p>` : ""}` : "";
    // 設定は「人数 / 役職 / タイマー / システム / ルール」に分け、見出しを押すと開く（役職設定の中の 配役設定 / 詳細設定 / アサイン設定 は、上に重なるメニューで開く）
    const page = game.setPage || null, sub = game.roleSetPage || null, PT = { secPeople: "人数設定", secRoles: "役職設定", secTimer: "タイマー設定", secSys: "システム設定", secRule: "ルール設定" };
    const pageTitle = PT[page] || "";
    const sec = (key, title, summary, inner) => {
      if (!page) return `<button class="set-tab" onclick="ONW.ui.setPage('${key}')"><span>${title}</span><span class="rg-count">${summary}</span><span class="set-tab__go">›</span></button>`;
      return page === key ? `<div class="set-sec__body">${inner}</div>` : "";
    };
    return `
      <div class="settings-modal" onclick="if(event.target===this)ONW.ui.toggleSettings()">
      <div class="settings-panel settings-panel--modal"><div class="x-bar">${page ? `<button class="x-back" type="button" onclick="ONW.ui.setBack()">‹ 戻る</button>` : "<span></span>"}<button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.ui.toggleSettings()">✕</button></div>
        <h2>${page ? pageTitle : "ルーム設定"}</h2>
        ${page ? "" : `<p class="night-step__hint">${isHost ? "変更したルールは自動で保存され、次回のルーム作成時に復元されます。" : "ホストが設定を変更できます。"}</p>`}
        ${sec("secPeople", "人数設定", `${game.villageSize}人村 / 墓地${game.graveCount}枚 / CPU${game.cpuCount}人`, `
          ${row("何人村", game.villageSize, "ONW.net.changeSetting('villageSize',-1)", "ONW.net.changeSetting('villageSize',1)")}
          <p class="night-step__hint">参加者（CPUも含む）が${game.villageSize}人まで入れます。定員を超えて入った人は観戦側になります。</p>
          ${row("墓地の枚数", game.graveCount, "ONW.net.changeSetting('graveCount',-1)", "ONW.net.changeSetting('graveCount',1)")}
          ${row("CPU人数", game.cpuCount, "ONW.net.changeSetting('cpuCount',-1)", "ONW.net.changeSetting('cpuCount',1)")}`)}
        ${sec("secRoles", "役職設定", game.assignOn ? `アサインON ${have}→${need}枚` : `${have}/${need}枚`, `
          <p class="night-step__hint">押すと、画面の上に重なってメニューが出ます。</p>
          <button class="set-tab" onclick="ONW.ui.openRoleMenu('deck')"><span>配役設定</span><span class="rg-count">${have}/${need}枚</span><span class="set-tab__go">›</span></button>
          <button class="set-tab" onclick="ONW.ui.openRoleMenu('detail')"><span>詳細設定</span><span class="rg-count">役職ごとの設定</span><span class="set-tab__go">›</span></button>
          <button class="set-tab" onclick="ONW.ui.openRoleMenu('assign')"><span>アサイン設定</span><span class="rg-count">${game.assignOn ? "ON" : "OFF"}</span><span class="set-tab__go">›</span></button>`)}
        ${sec("secTimer", "タイマー設定", `夜${game.timers.night}秒・昼${game.timers.day}秒`, timers)}
        ${sec("secSys", "システム設定", "", `
          <div class="field-row"><label>狂人昇格</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleFake()">${game.fakeWolfWhenNoWolf ? "ON" : "OFF"}</button>` : `<span>${game.fakeWolfWhenNoWolf ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: 最終盤面に人狼がいないとき、狂人1人が人狼判定に昇格します。</p>
          <div class="field-row"><label>変化公開</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleOpt('revealTransforms')">${game.revealTransforms ? "ON" : "OFF"}</button>` : `<span>${game.revealTransforms ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: 昼の開始時に「変化前 → 変化後」の役職名を公開します（誰が変化したかは分かりません）。</p>
          <div class="field-row"><label>手動配役を変化公開に表示</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleOpt('revealManualRoles')">${game.revealManualRoles ? "ON" : "OFF"}</button>` : `<span>${game.revealManualRoles ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: 配役した役職（変化していないカード）も、変化公開に「光の使徒 → 占い師」のように変化先として並べます（人狼陣営は闇の化身、第三陣営は銀色の影から）。どれが本当に変化したのか分からなくなります。ガイドの「現在の配役」も、昼の開始までは変化役にまとめて表示されます。変化公開がONのときだけ働きます。</p>
          <div class="field-row"><label>勝利の乗っ取り演出</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleOpt('winLadderFx')">${game.winLadderFx !== false ? "ON" : "OFF"}</button>` : `<span>${game.winLadderFx !== false ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: 結果発表で、成立した勝利が陣営の乗っ取りごとに低い順（人狼陣営勝利 → 妖狐陣営勝利 …）に貼り重ねられて出ます。OFF: 最終的な勝利だけをすぐに出します。</p>
          <div class="field-row"><label>吹き出しチャット</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleOpt('bubbleChat')">${game.bubbleChat === true ? "ON" : "OFF"}</button>` : `<span>${game.bubbleChat === true ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: チャットの発言を、アイコンと名前つきの吹き出しで表示します（自分の発言は右側）。OFF: 今までの「名前: 発言」の表示です。</p>
          ${ONW.sound ? `<div class="field-row"><label>サウンド</label>
            <button class="btn" onclick="ONW.sound.toggleMute()">${ONW.sound.muted() ? "ミュート中" : "ON"}</button>
          </div>
          <div class="field-row"><label>BGM音量</label>
            <input type="range" min="0" max="100" step="1" value="${ONW.sound.bgmVol()}" oninput="ONW.sound.setBgmVol(this.value)" style="flex:1">
          </div>
          <div class="field-row"><label>SE音量</label>
            <input type="range" min="0" max="100" step="1" value="${ONW.sound.seVol()}" oninput="ONW.sound.setSeVol(this.value)" style="flex:1">
            <button class="btn" onclick="ONW.sound.se('card_flip')">試聴</button>
          </div>
          <p class="night-step__hint">BGM・効果音の設定は、この端末だけのものです（ブラウザに保存されます。ルーム設定とは別）。左上の🔊ボタンから開く音量パネルでも、同じ設定を変えられます（連動します）。</p>` : ""}
          ${isHost && (game.debugOn || (ONW.debug && ONW.debug.allowed())) ? `<div class="field-row"><label>デバッグモード</label>
            <button class="btn" onclick="ONW.debug.toggle()">${game.debugOn ? "ON" : "OFF"}</button>
          </div>
          <p class="night-step__hint">ON: ホストが役職の固定・CPUの能力先・投票先の指定などを行えます。ONの間は参加者全員の画面に「デバッグモード中」と表示されます。</p>` : ""}`)}
        ${isHost ? sec("secRule", "ルール設定", "マイルール・コード", presetUi) : ""}
      </div>
      </div>`;
  }

  // ---- ルーム（ロビー）----
  const STATUS = { host: ["ホスト", "st-host"], waiting: ["準備中", "st-wait"], ready: ["準備完了", "st-ready"], result: ["結果確認中", "st-result"], playing: ["試合中", "st-wait"], offline: ["接続切れ", "st-wait"] };
  ui.renderLobby = function renderLobby(game) {
    const all = game.lobbyPlayers || [], isHost = ONW.net.isHost;
    const players = all.filter((p) => !p.spec), specs = all.filter((p) => p.spec);   // 観戦ONの人は参加者の下へ
    const total = players.length + (game.cpuCount || 0);
    const size = game.villageSize || 4, need = size + game.graveCount, have = Object.values(game.roleCounts).reduce((a, b) => a + b, 0);
    const guests = players.filter((p) => p.status !== "host");
    const allReady = guests.every((p) => p.status === "ready");
    const asg = ONW.assign.check(game), ok = total === size && asg.ok && allReady;   // アサイン設定ON: 配役設定の枚数は候補なので、配役数以上あればよい
    const me = all[game.meIndex] || {};
    const badge = (st) => { const [t, cls] = STATUS[st] || STATUS.waiting; return `<span class="st ${cls}">${t}</span>`; };
    // 名前の左にアイコン（画像があれば画像、無ければ頭文字の丸）
    const A = ONW.account;
    const plName = (p) => `<span class="pl">${ONW.profile.link(p.uid, p.name, `${A.avatarHtml(p.name, { uid: p.uid, v: p.av }, "av--sm")}<span>${esc(p.name)}</span>`)}</span>`;
    // ロビーの名前: （自分以外の）人間の名前を押すとメニューが重なって出る。ホストは操作メニュー + プロフィール、ホスト以外は「プロフィールを見る」だけ（見られる相手のときのみ）
    const lobbyName = (p) => {
      const idx = all.indexOf(p), inner = `${A.avatarHtml(p.name, { uid: p.uid, v: p.av }, "av--sm")}${ONW.achievements && ONW.achievements.lobbyNameHtml ? ONW.achievements.lobbyNameHtml(esc(p.name), p.achv) : `<span>${esc(p.name)}</span>`}`;
      const menu = idx !== game.meIndex && (isHost || !!(p.uid && A && A.user));
      return `<span class="pl">${menu ? `<span class="pf-link" role="button" tabindex="0" onclick="ONW.ui.openPlayerMenu(${idx})">${inner}</span>` : inner}</span>`;
    };
    const canInvite = isHost && !!(A && A.user);
    let hint = "";
    if (isHost) hint = total < size ? `あと${size - total}人必要です（CPUを増やして補えます）。` : !asg.ok ? (game.assignOn ? `アサイン設定がONですが、候補の枚数が足りません（配役${need}枚 / 候補${have}枚）。` : `配役の枚数が合っていません（必要${need}枚 / 現在${have}枚）。`) : !allReady ? "全員が「準備完了」になると開始できます。" : "開始できます。";
    else if (me.spec) hint = total >= size ? "満員のため観戦で入りました。空きが出たら「観戦 OFF」で参加できます。" : "観戦で参加します。ホストの開始を待っています…";
    else hint = me.status === "ready" ? "準備完了です。ホストの開始を待っています…" : "準備ができたら「準備完了」を押してください。";
    const summary = `${size}人村 / 墓地${game.graveCount}枚${game.assignOn ? " / アサインON" : ""} / 夜${game.timers.night}秒・議論${game.timers.day}秒・投票${game.timers.vote}秒`;
    return `
      <section class="panel night-step">
        <p class="lede">部屋コード（友達に教えてください）</p>
        <div class="room-code-row"><span class="night-step__role room-code-mask">＊＊＊＊</span><button class="btn tf-chip room-code-copy" onclick="ONW.ui.copyRoomCode(this)">コピー</button></div>
        <h2>参加者 ${total}/${size}</h2>
        <div class="lobby-list">${players.map((p) => `<div class="result-role">${lobbyName(p)}<span>${badge(p.status)}</span></div>`).join("")}
        ${Array.from({ length: game.cpuCount || 0 }, (_, i) => { const cn = (game.cpuNames && game.cpuNames[i]) || `CPU${i + 1}`; return `<div class="result-role"><span class="pl">${A.avatarHtml(cn, {}, "av--sm")}${ONW.achievements && ONW.achievements.lobbyNameHtml ? ONW.achievements.lobbyNameHtml(esc(cn), ONW.achievements.cpuDisplayAchv(cn)) : esc(cn)}</span><span>${isHost ? `<button class="btn tf-chip" onclick="ONW.net.renameCpu(${i})">名前変更</button> ` : ""}<span class="st st-cpu">CPU</span></span></div>`; }).join("")}</div>
        ${specs.length ? `<h2>観戦者 ${specs.length}</h2><div class="lobby-list">${specs.map((p) => `<div class="result-role">${lobbyName(p)}<span class="st st-spec">観戦</span></div>`).join("")}</div>` : ""}
        <p class="night-step__hint">ルール: ${summary}</p>
        <p class="night-step__hint lobby-hint">${hint}</p>
        ${canInvite && game.invOpen ? `<div class="invite-panel"><button class="pf-x" aria-label="閉じる" onclick="ONW.ui.toggleInvite()">×</button><h2>フレンドを招待</h2><div id="inv-list">${ONW.friends.inviteListHtml()}</div><p id="inv-msg" class="acct-msg"></p></div>` : ""}
        <div class="btn-row lobby-actions" style="justify-content:center;">
          ${ONW.net.code ? `<button class="btn" onclick="ONW.ui.toggleLobbyChat()">💬 チャット</button>` : ""}
          ${isHost ? `<button class="btn" onclick="ONW.ui.toggleSettings()">ルーム設定</button>` : ""}
          ${ui.hasLastResult(game) ? `<button class="btn" onclick="ONW.ui.openResultReview()">前回の結果を見る</button>` : ""}
          ${canInvite ? `<button class="btn" onclick="ONW.ui.toggleInvite()">フレンドを招待</button>` : ""}
          ${isHost
            ? `<button class="btn btn--primary" ${ok ? "" : "disabled"} onclick="ONW.net.startGame()">ゲーム開始</button>`
            : me.spec ? "" : `<button class="btn btn--primary" onclick="ONW.net.setReady(${me.status === "ready" ? "false" : "true"})">${me.status === "ready" ? "準備を取り消す" : "準備完了"}</button>`}
          <button class="btn btn--spec ${me.spec ? "on" : ""}" onclick="ONW.net.setSpectate(${me.spec ? "false" : "true"})">観戦 ${me.spec ? "ON" : "OFF"}</button>
          <button class="btn" onclick="ONW.main.goToTitle()">退出</button>
        </div>
        ${game.showSettings ? settingsPanel(game, isHost, total) : ""}
      </section>`;
  };

  // ---- ロビー: 名前を押したときの操作メニュー（ホストだけ。#app の外に重ねるので、ロビーが再描画されても閉じない）----
  let pmName = null;   // メニューを開いている人の名前（人数や並びが変わっても同じ人を指すため、番号ではなく名前で覚える）
  const pmIndex = () => (ONW.game.lobbyPlayers || []).findIndex((p) => p.name === pmName);
  ui.openPlayerMenu = function (idx) {
    const g = ONW.game, p = (g.lobbyPlayers || [])[idx];
    if (g.phase !== ONW.PHASE.LOBBY || !p || idx === g.meIndex) return;
    if (!ONW.net.isHost && !(p.uid && ONW.account && ONW.account.user)) return;   // ホスト以外は、プロフィールを見られる相手のときだけ
    pmName = p.name;
    ui.refreshPlayerMenu();
  };
  ui.closePlayerMenu = function () { pmName = null; const w = document.getElementById("pm-overlay"); if (w) w.remove(); };
  /** 開いているメニューを最新のロビーの状態で描き直す（相手が抜けた / 試合が始まったら閉じる） */
  ui.refreshPlayerMenu = function () {
    if (pmName === null) return;
    const g = ONW.game, idx = pmIndex(), p = (g.lobbyPlayers || [])[idx];
    const host = ONW.net.isHost, canProf = !!(p && p.uid && ONW.account && ONW.account.user);
    if (g.phase !== ONW.PHASE.LOBBY || !p || idx === g.meIndex || (!host && !canProf)) { ui.closePlayerMenu(); return; }
    let w = document.getElementById("pm-overlay");
    if (!w) {
      w = document.createElement("div");
      w.id = "pm-overlay";
      w.onclick = (e) => { if (e.target === w) ui.closePlayerMenu(); };
      document.body.appendChild(w);
    }
    const offline = p.status === "offline", prof = canProf;
    w.innerHTML = `<div class="pm-card" role="dialog" aria-modal="true">
      <div class="pm-title">${esc(p.name)}</div><button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.ui.closePlayerMenu()">✕</button>
      ${host ? `<button class="btn pm-btn" ${offline ? "disabled" : ""} onclick="ONW.ui.pmTransfer()">ホスト譲渡</button>
      <button class="btn pm-btn" onclick="ONW.ui.pmSpectate()">${p.spec ? "観戦 OFF にする（参加に戻す）" : "観戦 ON にする"}</button>
      <button class="btn pm-btn pm-btn--danger" onclick="ONW.ui.pmKick()">キック</button>` : ""}
      ${prof ? `<button class="btn pm-btn" onclick="ONW.ui.pmProfile()">プロフィールを見る</button>` : ""}
    </div>`;
  };
  ui.pmTransfer = function () {
    const i = pmIndex(); if (i < 0) return;
    ui.closePlayerMenu();
    ui.confirmTransfer(i);
  };
  ui.pmSpectate = function () {
    const g = ONW.game, i = pmIndex(), p = (g.lobbyPlayers || [])[i];
    if (!p || !ONW.net.isHost) return;
    const total = (g.lobbyPlayers || []).filter((q) => !q.spec).length + (g.cpuCount || 0);
    if (p.spec && total >= (g.villageSize || 4)) { window.alert("定員に達しているため、参加に戻せません。"); return; }
    ONW.net.setSpectateOf(i, !p.spec);
    ui.closePlayerMenu();
  };
  ui.pmKick = function () {
    const i = pmIndex(), p = (ONW.game.lobbyPlayers || [])[i];
    if (!p || !ONW.net.isHost) return;
    if (!window.confirm(`「${p.name}」さんをルームからキックしますか？`)) return;
    ui.closePlayerMenu();
    ONW.net.kickPlayer(i);
  };
  ui.pmProfile = function () {
    const p = (ONW.game.lobbyPlayers || [])[pmIndex()];
    if (!p) return;
    ui.closePlayerMenu();
    ONW.profile.open(p.uid, p.name);
  };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") ui.closePlayerMenu(); });

  /** 霊界チャット（観戦者・昼中に死亡した人）: 「議論」「霊界」の切り替えと入力欄 */
  /** ロビー: ホスト譲渡（確認ダイアログ → 部屋設定ごと相手へ引き継ぐ） */
  ui.confirmTransfer = function (idx) {
    const p = (ONW.game.lobbyPlayers || [])[idx];
    if (!p || !ONW.net.isHost) return;
    if (confirm(`ホストを「${p.name}」さんに譲渡しますか？\n部屋の設定はそのまま引き継がれます。`)) ONW.net.transferHost(idx);
  };

  ui.canGhost = () => !!(ONW.net && ONW.net.canGhost && ONW.net.canGhost());
  /** マイクラ版と同じく、議論と霊界のタブ分けはしない（霊界の発言は見える人にだけ同じ欄に流れる） */
  ui.chatTabs = function () { return ""; };
  /** テレパシーの送信先切り替え（人狼ジャッジメント式）。接続の成分に入っている生存者だけに出る。送信先は g.tpMode（false=全体チャット / true=テレパシー） */
  ui.tpToggle = function (game) {
    if (!game.myTelepathy || game.myTelepathy.length < 2 || game.isDead || game.isSpectator) return "";
    return `<div class="chat-tabs"><button class="btn${game.tpMode ? "" : " btn--on"}" onclick="ONW.ui.setTpMode(false)">全体チャット</button><button class="btn${game.tpMode ? " btn--on" : ""}" onclick="ONW.ui.setTpMode(true)">テレパシー</button></div>`;
  };
  ui.setTpMode = function (on) { const g = ONW.game; g.tpMode = !!on; ui.render(g); ui.updateChat(); };
  /** 観戦者・死亡者向けの入力欄（送信すると自動で霊界チャットになる） */
  ui.ghostInput = function (game) {
    if (!ui.canGhost()) return "";
    return `<div class="chat-input"><input id="chat-in" class="onw-input" maxlength="100" placeholder="発言（霊界チャット: 観戦者と死亡者にだけ届きます）" ${ui.isPc() ? "" : "readonly"} onclick="ONW.ui.openChat()" onkeydown="if(event.key==='Enter')ONW.co.sendChat()"><button class="btn" onclick="ONW.co.sendChat()">送信</button></div>`;
  };
  ui.renderSpectate = function renderSpectate(game) {
    return `
      <section class="panel">
        <h2>観戦中</h2>
        <p class="lede">全員の役職と行動が見えます。発言は霊界チャットになり、観戦者と死亡した人にだけ届きます。</p>
        <div id="spec-info" class="spec-info"></div>
        ${ui.chatTabs(game)}
        <div id="chat-log" class="chat-log" onclick="ONW.ui.openChat()"></div>
        ${ui.ghostInput(game)}
        <div class="btn-row"><button class="btn" onclick="ONW.main.goToTitle()">退出</button></div>
      </section>`;
  };

  /** 観戦ONのホストの試合中の画面（進行はホストが握るのでスキップボタンを出す） */
  ui.renderHostSpectate = function renderHostSpectate(game) {
    return `
      <section class="panel">
        <h2>観戦中（ホスト）</h2>
        <p class="lede">観戦ONで開始したため、試合には参加せず見ています。全員の役職と行動が見えます。</p>
        <div id="spec-info" class="spec-info"></div>
        ${ui.chatTabs(game)}
        <div id="chat-log" class="chat-log" onclick="ONW.ui.openChat()"></div>
        ${ui.ghostInput(game)}
      </section>`;
  };

  // ---- 観戦者向け: 全員の役職・夜の行動・投票 ----
  ui.toggleSpecInfo = function () { const g = ONW.game; g.specInfoOpen = g.specInfoOpen === false; const el = document.getElementById("spec-info"); if (el) el.__html = null; ui.updateSpecInfo(); };
  /**
   * 観戦者の「夜ログ」: ヘッダーの1行だけが場所を取り、中身は背景半透明で上に重ねる（チャットの位置が動かない）。
   * 役職の一覧はここには出さない（役職の変化は、テーブルのカードを押すと見られる → ui.showRoleHistory）
   */
  ui.updateSpecInfo = function () {
    const el = document.getElementById("spec-info");
    if (!el) return;
    const g = ONW.game, info = g.specInfo, open = g.specInfoOpen !== false;
    const row = (l, r) => `<div class="si-row"><span class="si-l">${l}</span><span class="si-r">${r}</span></div>`;
    let body = "";
    if (info) {
      const live = info.night && info.sels.length ? `<div class="si-h">夜の選択（朝に実行）</div>${info.sels.map((x) => row(`${esc(x.name)} <small class="rs-dim">${esc(ONW.roles.getInfo(x.role).name)}</small>`, esc(x.text))).join("")}` : "";
      const votes = info.dict ? `<div class="si-h">独裁処刑</div>${row(esc(info.dict.by), `→ <strong>${esc(info.dict.target)}</strong>${info.dict.coup ? ` <span class="rs-dim">（反逆の狂人 ${(info.dict.rebels || []).map(esc).join("、")} のクーデター: 独裁者が処刑されます）</span>` : ""}`)}` : info.vote ? `<div class="si-h">投票状況（変更あり）</div>${info.votes.map((v) => row(esc(v.from), v.to ? `→ <strong>${esc(v.to)}</strong>${v.w > 1 ? ` <span class="rs-dim">(${v.w}票)</span>` : ""}` : v.x ? '<span class="rs-dead">投票無効</span>' : '<span class="rs-dim">未投票</span>')).join("")}` : "";
      const log = info.log.length ? `<div class="si-h">夜の行動ログ</div>${info.log.map((t) => `<div class="si-log">${esc(t)}</div>`).join("")}` : "";
      const mimicInfo = (info.mimicInfo || []).length ? `<div class="si-h">役職情報</div>${info.mimicInfo.map((x) => `<div class="si-log">模倣の人狼 ${esc(x.by)} は ${x.grave ? "墓地から引いたあと " : ""}${esc(x.role)} の能力を模倣していました。</div>`).join("")}` : "";
      const cloneInfo = (info.cloneInfo || []).length ? `<div class="si-h">役職情報</div>${info.cloneInfo.map((x) => `<div class="si-log">クローン ${esc(x.by)} は ${x.grave ? "墓地から引いたあと " : ""}${esc(x.role)} を思い込んでいました。</div>`).join("")}` : "";
      const personaInfo = (info.personaInfo || []).length ? `<div class="si-h">役職情報</div>${info.personaInfo.map((x) => `<div class="si-log">ペルソナ ${esc(x.by)} は ${x.role ? `${esc(x.role)} の仮面を被っていました。` : "仮面を被っていませんでした。"}</div>`).join("")}` : "";
      const trailInfo = (info.trailInfo || []).length ? `<div class="si-h">役職情報</div>${info.trailInfo.map((x) => `<div class="si-log">開拓者 ${esc(x.by)} は ${esc(x.name)}の運命を歩んでいました。</div>`).join("")}` : "";
      const mind = (info.mind || []).length ? `<div class="si-h">昼の行動（心眼の人狼）</div>${info.mind.map((x) => row(`${esc(x.by)} → ${esc(x.target)}`, x.role ? `最終役職: <strong>${esc(ONW.roles.getInfo(x.role).name)}</strong>` : "")).join("")}` : "";
      const libra = info.libra ? `<div class="si-h">昼の行動（天秤）</div>${row(esc(info.libra.by), `→ <strong>${esc(info.libra.a)}</strong> と <strong>${esc(info.libra.b)}</strong> に投票対象を制限`)}` : "";   // 観戦者には、使った人と選ばれた2人を出す
      const predict = (info.predict || []).length ? `<div class="si-h">昼の行動（予想屋）</div>${info.predict.map((x) => row(esc(x.by), `→ <strong>${esc(x.text)}</strong> と予想`)).join("")}` : "";   // 観戦者には、予想屋が決めた予想を出す（投票が始まるまで選び直せるので、そのときの最新）
      const wagerer = (info.wagerer || []).length ? `<div class="si-h">昼の行動（勝負師）</div>${info.wagerer.map((x) => row(esc(x.by), `→ <strong>${esc(x.text)}</strong>`)).join("")}` : "";   // 観戦者には、勝負師が決めた予想を出す（昼時間中なら選び直せるので、そのときの最新）
      const sense = (info.sense || []).length ? `<div class="si-h">昼の行動（感覚の占い師）</div>${info.sense.map((x) => row(`${esc(x.by)} → ${esc(x.target)}`, x.key ? `気配: <strong>${esc(ONW.senseSeer.feelLabel(x.key))}</strong>` : "")).join("")}` : "";   // 観戦者には、使った事実と感じた気配を出す（観戦者は全員の役職が見える）
      const photo = (info.photo || []).length ? `<div class="si-h">昼の行動（三月なのか）</div>${info.photo.map((x) => row(`${esc(x.by)} → ${esc(x.target)}`, x.key ? `写真の気配: <strong>${esc(({ village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" })[x.key] || "")}</strong>` : "")).join("")}` : "";   // 観戦者には、撮影した事実と写った気配を出す
      const rnm = (r) => esc(ONW.roles.getInfo(r).name), FAIL = { target_locked: "ロックされて失敗", aa_blocked: "ロックされて失敗", dead: "対象が先に死亡" };
      const eraser = (info.eraser || []).length ? `<div class="si-h">抹消（抹消の人狼）</div>${info.eraser.map((x) => row(`${esc(x.by)} → ${esc(x.target)}`, x.before ? (x.before === x.after ? `<span class=\"rs-dim\">変化なし</span>` : `<strong>${rnm(x.before)}</strong> → <strong>${rnm(x.after)}</strong>`) : `<span class="rs-dim">${esc(FAIL[x.fail] || "まだ抹消されていません")}</span>`)).join("")}` : "";
      const sl = info.seal || { rows: [], sealed: [] };
      const seal = sl.rows.length || sl.sealed.length ? `<div class="si-h">封印（封印の狂人）</div>${sl.rows.map((x) => row(`${esc(x.by)}${x.target ? ` → ${esc(x.target)}` : ""}`, x.fail ? `<span class="rs-dim">封印されていたため失敗</span>` : "封印しました")).join("")}${sl.sealed.length ? row("封印されている人", `<strong>${sl.sealed.map(esc).join("、")}</strong>`) : ""}` : "";
      const major = (info.major || []).length ? `<div class="si-h">救済（少佐）</div>${info.major.map((x) => row(`${esc(x.by)} → ${esc(x.target)}`, x.before ? (x.before === x.after ? `<span class="rs-dim">変化なし</span>` : `<strong>${rnm(x.before)}</strong> → <strong>${rnm(x.after)}</strong>`) : `<span class="rs-dim">${esc(x.fail === "target_locked" ? "ロックされていて失敗" : x.fail === "aa_blocked" ? "特殊な力で失敗" : x.fail === "dead" ? "昼になる前に死亡" : x.fail === "sealed" ? "封印されていて失敗" : "まだ救済されていません")}</span>`)).join("")}` : "";
      const finger = (info.finger || []).length ? `<div class="si-h">初期役職の確認（指読み）</div>${info.finger.map((x) => row(esc(x.by), (x.targets || []).map((y) => `${esc(y.name)}: <strong>${rnm(y.role)}</strong>`).join("、") || `<span class="rs-dim">まだ確認していません</span>`)).join("")}` : "";   // 観戦者には、確認した人と見えた役職を出す（蜃気狼はランダムに見えた役職）
      body = live + votes + mind + sense + photo + libra + predict + wagerer + eraser + major + finger + seal + log + mimicInfo + cloneInfo + personaInfo + trailInfo || `<div class="si-log">まだ記録はありません。</div>`;
    }
    const html = `<div class="night-info__head"><span>夜ログ</span><button class="cb-toggle" onclick="ONW.ui.toggleSpecInfo()">${open ? "▾ 閉じる" : "▸ 開く"}</button></div>` +
      (open && info ? `<div class="si-body">${body}</div>` : "");
    if (el.__html === html) return;
    const old = el.querySelector(".si-body"), top = old ? old.scrollTop : 0;
    el.__html = html; el.innerHTML = html;
    const nb = el.querySelector(".si-body"); if (nb) nb.scrollTop = top;
  };

  /** 観戦者がテーブルのカードを押したとき: そのカードの役職が どう変わってきたか を重ねて表示する */
  ui.closeRoleHistory = function () { const w = document.getElementById("rh-overlay"); if (w) w.remove(); };
  ui.showRoleHistory = function (k) {
    const g = ONW.game, info = g.specInfo;
    if (!info) return;
    const isP = k.startsWith("p:"), id = k.slice(2);
    const o = isP ? info.players.find((p) => String(p.id) === id) : info.center[+id];
    if (!o) return;
    const name = isP ? o.name : `墓地${+id + 1}`;
    const rl = (r) => `<span class="t-${ONW.roles.getInfo(r).team}">${esc(ONW.roles.getInfo(r).name)}</span>`;
    const step = (label, html) => `<div class="rh-step"><span class="rh-l">${label}</span><span class="rh-r">${html}</span></div>`;
    const steps = [];
    if (o.from) steps.push(step("変化前", rl(o.from)));
    steps.push(step(o.from ? "変化後（配られた役職）" : "配られた役職", rl(o.ini)));
    if (!o.cur) steps.push(step("夜の後", '<span class="rs-dim">夜はまだ明けていません</span>'));
    else if (o.cur === o.ini) steps.push(step("夜の後", `${rl(o.cur)} <span class="rs-dim">（変化なし）</span>`));
    else steps.push(step("夜の後", rl(o.cur)));
    ui.closeRoleHistory();
    const w = document.createElement("div");
    w.id = "rh-overlay";
    w.onclick = (e) => { if (e.target === w) ui.closeRoleHistory(); };
    w.innerHTML = `<div class="rh-box" role="dialog" aria-modal="true">
      <div class="rh-head"><span class="${isP ? "rs-pl" : ""}">${esc(name)}${isP && o.cpu ? '<small class="cb-cpu">CPU</small>' : ""}${isP && o.dead ? " 💀" : ""}</span><button class="btn" onclick="ONW.ui.closeRoleHistory()">閉じる</button></div>
      <div class="rh-sub">役職の変化</div>${steps.join("")}</div>`;
    document.body.appendChild(w);
  };

  /**
   * スキップ（ホストのみ）: タイマーをダブルタップ → 画面の上に「このターンスキップしますか？ はい/いいえ」を重ねる。
   * position:fixed の重ねだけなので、画面（レイアウト）はずれない。
   */
  const SKIP_PHASES = ["online_role", "online_night", "online_morning", "online_day", "online_vote"];
  const canSkip = (game) => ONW.net.isHost && game.inGame !== false && SKIP_PHASES.includes(game.phase);
  ui.closeSkip = function () { const el = document.getElementById("skip-confirm"); if (el) el.remove(); ui._skipPhase = null; };
  ui.openSkip = function () {
    const g = ONW.game;
    if (!canSkip(g) || document.getElementById("skip-confirm")) return;
    const wrap = document.createElement("div");
    wrap.id = "skip-confirm";
    wrap.innerHTML = `<div class="sc-box" role="dialog" aria-modal="true"><p class="sc-q">このターンスキップしますか？</p>
      <div class="sc-btns"><button class="btn btn--primary" onclick="ONW.ui.confirmSkip()">はい</button><button class="btn" onclick="ONW.ui.closeSkip()">いいえ</button></div>
      <div class="sc-jump">${[["morning", "朝に"], ["settle", "昼前に"], ["day", "昼に"], ["vote", "夕に"]].map(([k, l]) => `<button class="btn" ${ONW.net.stageIdx() >= ONW.net.JUMP_TARGET[k] ? "disabled" : ""} onclick="ONW.ui.jumpSkip('${k}')">${l}</button>`).join("")}</div>
      <button class="btn sc-abandon" onclick="ONW.ui.confirmAbandon()">廃村</button>
      <button class="btn sc-abandon sc-tolobby" onclick="ONW.ui.confirmToLobby()">ロビーに戻る</button></div>`;
    // 外側タップでは閉じない（ダブルタップ直後のクリックが背景に当たって即消えるため）。「いいえ」を押すまで残る
    document.body.appendChild(wrap);
    ui._skipPhase = g.phase;
  };
  /** 廃村: 試合を打ち切って全員をルームへ戻す（押し間違い防止に、もう一度確認する） */
  ui.confirmAbandon = function () {
    const g = ONW.game, same = ui._skipPhase === g.phase;
    if (!window.confirm("廃村にしますか？\nこの試合は勝者も敗者もなしで終わり、最終結果（廃村）が表示されます。")) return;
    ui.closeSkip();
    if (same && canSkip(g)) ONW.net.abandonGame();
  };
  /** ロビーに戻る: 試合を打ち切って、結果発表を出さずに全員をすぐロビーへ戻す（押し間違い防止に、もう一度確認する） */
  ui.confirmToLobby = function () {
    const g = ONW.game, same = ui._skipPhase === g.phase;
    if (!window.confirm("ロビーに戻りますか？\nこの試合は結果発表なしで終わり、全員がロビーに戻ります。")) return;
    ui.closeSkip();
    if (same && canSkip(g)) ONW.net.abandonToLobby();
  };
  /** 朝に / 昼前に / 昼に / 夕に: その時点まで一気に進める（先へ進むだけ） */
  ui.jumpSkip = function (key) {
    const g = ONW.game, same = ui._skipPhase === g.phase;
    ui.closeSkip();
    if (same && canSkip(g)) ONW.net.jumpTo(key);
  };
  ui.confirmSkip = function () {
    const g = ONW.game, same = ui._skipPhase === g.phase;
    ui.closeSkip();
    if (same && canSkip(g)) ONW.net.hostNext();   // 確認中にフェーズが変わっていたら何もしない（二重スキップ防止）
  };
  /** 画面が切り替わった / ホストでなくなったら確認を閉じる（render のたびに呼ぶ） */
  ui.updateSkip = function (game) {
    if (document.getElementById("skip-confirm") && (!canSkip(game) || ui._skipPhase !== game.phase)) ui.closeSkip();
  };
  // タイマー（ヘッダーの残り時間 / PC版の大きなタイマー）のダブルタップを拾う。dblclick はスマホで不安定なので自前で判定
  (function () {
    let last = 0, lx = 0, ly = 0;
    document.addEventListener("pointerup", (e) => {
      if (e.button > 0 || !e.target.closest || !e.target.closest("#phase-label, #big-timer")) { last = 0; return; }
      const now = Date.now();
      if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ui.openSkip(); }
      else { last = now; lx = e.clientX; ly = e.clientY; }
    });
  })();

  const hostBtn = (label, extra = "") => ONW.net.isHost
    ? `<button class="btn btn--primary" ${extra} onclick="ONW.net.hostNext()">${label}</button>`
    : `<p class="night-step__hint">ホストの進行を待っています…</p>`;

  /**
   * 配役の演出: 山札 → 墓地のカード → 各プレイヤーのアイコンへ配る → 自分のカードが裏返る
   * （裏面 → 変化前の役職 → 変化後の役職）。全部CSSアニメ。再描画されても
   * 経過時間ぶん負のdelayで続きから再生するので、途中で再描画が入っても最初からにならない。
   */
  /** 役職アイコン: img/roles/<役職ID>.png（背景透過）を陣営色の地に載せる。画像が無ければ何も出さない */
  ui.roleIcon = function (role, cls = "") {
    const team = ONW.roles.getInfo(role).team;
    return `<span class="role-icon role-icon--${team} ${cls}"><img src="img/roles/${role}.png" alt="" onerror="this.parentNode.classList.add('role-icon--none');this.remove()"></span>`;
  };
  /** 配役演出の長さ(秒)。ホストの自動進行（演出が終わって5秒後に夜へ）にも使う */
  ui.dealDuration = function (graveCount, playerCount, hasLover) {
    return 0.4 + 0.3 * graveCount + 0.2 + 0.28 * playerCount + 0.5 + 0.4 + 1.6 + (hasLover ? 1.6 : 0) + 0.9;
  };
  /** 配役演出の「めくれる瞬間」にカードめくり SE を合わせる。
   *  配布画面は CSS アニメーションだけで描かれ、stage.paint のめくれ検出（sound.noteFlip）が効かないため、ここで予約して鳴らす。
   *  times は dealStart 基準のめくり時刻（秒）。まだ来ていないものだけ予約し、過ぎたもの（途中参加・再入室で途中から見た場合）は鳴らさない
   *  （stage 側の「初回同期では鳴らさない」方針に合わせる）。再描画で何度呼ばれても、同じ配布（dealStart）では1回だけ予約する */
  ui.dealFlipSe = function (game, times) {
    try {
      if (!ONW.sound || !game || !game.dealStart) return;
      if (ui._dealSeFor === game.dealStart) return;
      ui._dealSeFor = game.dealStart;
      const ds = game.dealStart, elapsed = (Date.now() - ds) / 1000;
      (times || []).forEach((t) => {
        const d = t - elapsed;
        if (d < -0.15) return;   // すでにめくれたあとは鳴らさない
        setTimeout(() => { if (ONW.sound && ONW.game && ONW.game.dealStart === ds) ONW.sound.se("card_flip"); }, Math.max(0, d * 1000));
      });
    } catch (e) { /* 音でゲームを止めない */ }
  };
  /** 配役演出の「カードが席に着地する瞬間」にカードを配る・置く SE（se_deal）を合わせる。
   *  dealFlipSe と同じ考え方の予約方式（配布画面は CSS アニメのみで stage.paint を通らない）。
   *  times は dealStart 基準の着地時刻（秒）= 各カードの飛び始め（animation-delay）＋飛行時間（通常 0.55s / 自分の大きなカードは 0.75s）。
   *  めくり SE（flip1 以降）とは時間帯が重ならない。過ぎた時刻（途中参加・再入室）は鳴らさず、同じ配布では1回だけ予約する */
  ui.dealPlaceSe = function (game, times) {
    try {
      if (!ONW.sound || !game || !game.dealStart) return;
      if (ui._dealPlaceSeFor === game.dealStart) return;
      ui._dealPlaceSeFor = game.dealStart;
      const ds = game.dealStart, elapsed = (Date.now() - ds) / 1000;
      (times || []).forEach((t) => {
        const d = t - elapsed;
        if (d < -0.15) return;   // すでに着地したあとは鳴らさない
        setTimeout(() => { if (ONW.sound && ONW.game && ONW.game.dealStart === ds) ONW.sound.se("deal"); }, Math.max(0, d * 1000));
      });
    } catch (e) { /* 音でゲームを止めない */ }
  };
  ui.renderOnlineRole = function renderOnlineRole(game) {
    const info = ONW.roles.getInfo(game.myRole);
    const from = game.myFrom ? ONW.roles.getInfo(game.myFrom) : null;
    const G = game.graveCount || 0, others = game.others || [];
    const N = others.length + 1;
    const elapsed = game.dealStart ? (Date.now() - game.dealStart) / 1000 : 99;
    const D = (t) => `animation-delay:${(t - elapsed).toFixed(2)}s;`;           // 経過ぶん進める
    const t0 = 0.4, gStep = 0.3, pStep = 0.28;
    const gEnd = t0 + gStep * G;
    const pStart = gEnd + 0.2;
    const dealEnd = pStart + pStep * N + 0.5;
    const flip1 = dealEnd + 0.4;                      // 裏面 → 最初の表
    const flip2 = flip1 + 1.6;                        // 変化前 → 変化後（変化がなければ 役職 → 恋人 がここ）
    const lover = !!game.myLover;                     // 恋人（重複役職）: 役職のカードのあとに「恋人」へめくれる
    const mpP = game.myRole === "multi_personality" && game.myMp ? game.myMp : null;   // 多重人格: 役職の面のあとに初期人格（村人/狂人）の面でめくれる（作者メモ: 夜に初期人格として自分のカードがめくれている）
    const flipM = (from ? flip2 : flip1) + 1.6;       // 人格の面にめくれる時刻
    const flipL = (mpP ? flipM + 1.6 : from ? flip2 + 1.6 : flip2);       // 恋人にめくれる時刻
    const doneAt = (lover ? flipL : mpP ? flipM : from ? flip2 : flip1) + 0.9;
    const mpInfo = mpP ? ONW.roles.getInfo(mpP) : null;
    const loverInfo = ONW.roles.getInfo("lover");
    const graves = Array.from({ length: G }, (_, i) =>
      `<div class="dl-slot"><div class="dl-card dl-fly" data-fly style="${D(t0 + gStep * i)}"></div><span class="dl-name">墓地${i + 1}</span></div>`).join("");
    const mkPlayer = (name, idx, me) => `
      <div class="dl-player ${me ? "dl-me" : ""}">
        <div class="dl-icon">${ONW.account.avatarHtml(name, null, "av--fill")}</div>
        <div class="dl-slot">
          ${me
            ? `<div class="dl-card dl-fly dl-big dl-hasflip" data-fly style="${D(pStart + pStep * idx)}">
                 <div class="dl-flipper" style="${D(flip1)}">
                   <div class="dl-face dl-face--a dl-team-${(from || info).team}${(from ? game.myFrom : game.myRole) === "drunk" ? " dl-face--drunk" : ""}${(from ? game.myFrom : game.myRole) === "drunk" && game.myCocktail ? " dl-face--cocktail" : ""}" style="${from ? D(flip2 - 0.2) : mpP ? D(flipM - 0.2) : lover ? D(flipL - 0.2) : ""}">${ui.roleIcon(from ? game.myFrom : game.myRole, "role-icon--face")}<b>${ui.nameBr(from ? from.name : info.name)}</b>${from ? "" : ui.mimicTag(game.myRole, game.myMimic)}${from ? "" : ui.personaMask(game.myRole, game.myPersona, D(flip1 + 1.0))}</div>
                   ${from ? `<div class="dl-face dl-face--b dl-team-${info.team}${game.myRole === "drunk" ? " dl-face--drunk" : ""}${game.myRole === "drunk" && game.myCocktail ? " dl-face--cocktail" : ""}" style="${mpP || lover ? `animation:dl-in .25s ease-out both,dl-out .25s ease-in forwards;animation-delay:${(flip2 - elapsed).toFixed(2)}s,${((mpP ? flipM : flipL) - 0.2 - elapsed).toFixed(2)}s;` : D(flip2)}">${ui.roleIcon(game.myRole, "role-icon--face")}<b>${ui.nameBr(info.name)}</b>${ui.mimicTag(game.myRole, game.myMimic)}${ui.personaMask(game.myRole, game.myPersona, D(flip2 + 1.0))}</div>` : ""}
                   ${mpP ? `<div class="dl-face dl-face--b dl-team-${mpInfo.team}" style="${lover ? `animation:dl-in .25s ease-out both,dl-out .25s ease-in forwards;animation-delay:${(flipM - elapsed).toFixed(2)}s,${(flipL - 0.2 - elapsed).toFixed(2)}s;` : D(flipM)}">${ui.roleIcon(mpP, "role-icon--face")}<b>${ui.nameBr(mpInfo.name)}</b></div>` : ""}
                   ${lover ? `<div class="dl-face dl-face--b dl-face--love dl-team-third" style="${D(flipL)}"><span class="dl-love-mark">❤</span><b>恋人</b></div>` : ""}
                 </div>
               </div>`
            : `<div class="dl-card dl-fly" data-fly style="${D(pStart + pStep * idx)}"></div>`}
        </div>
        <span class="dl-name">${esc(name || "あなた")}${me ? "（あなた）" : ""}</span>
      </div>`;
    const players = [mkPlayer(game.myName, 0, true), ...others.map((p, i) => mkPlayer(p.name, i + 1, false))].join("");
    // SE: 自分のカードがめくれる瞬間（裏→役職 / 変化前→変化後 / →恋人）に合わせる
    const flipTimes = [flip1]; if (from) flipTimes.push(flip2); if (mpP) flipTimes.push(flipM); if (lover) flipTimes.push(flipL);
    ui.dealFlipSe(game, flipTimes);
    // SE: カードが各席・墓地に配られて着地する瞬間（飛び始め＋飛行時間。自分の大きなカードだけ 0.75s）
    const placeTimes = [];
    for (let i = 0; i < G; i++) placeTimes.push(t0 + gStep * i + 0.55);
    for (let i = 0; i < N; i++) placeTimes.push(pStart + pStep * i + (i === 0 ? 0.75 : 0.55));
    ui.dealPlaceSe(game, placeTimes);
    return `
      <section class="panel night-step deal-stage" data-deal>
        <p class="lede">役職を配っています…</p>
        <div class="dl-deck"><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div></div>
        ${G ? `<div class="dl-row dl-graves">${graves}</div>` : ""}
        <div class="dl-row dl-players">${players}</div>
        <div class="dl-result" style="${D(doneAt)}">
          ${ui.roleIcon(game.myRole, "role-icon--big")}
          <div class="night-step__role t-${info.team}">${info.name}</div>
          ${from ? `<p class="night-step__hint">${esc(from.name)} → ${esc(info.name)}${game.myRole === "persona" && game.myPersona && ONW.ROLE_INFO[game.myPersona] ? `（+${esc(ONW.ROLE_INFO[game.myPersona].name)}）` : ""} に変化しました。</p>` : ""}
          ${game.myRole === "persona" && game.myPersona && ONW.ROLE_INFO[game.myPersona] ? `<p class="night-step__hint">${esc(ONW.ROLE_INFO[game.myPersona].name)}の仮面を被りました。</p>` : ""}
          ${mpP ? `<p class="night-step__hint">初期人格は<strong>${mpP === "madman" ? "狂人" : "村人"}</strong>です。</p>` : ""}
          ${lover ? `<p class="night-step__hint"><strong>${esc(info.name)}</strong> に加えて <strong>恋人</strong> になっています。相方は夜に分かります。</p>` : ""}
          <p class="night-step__hint" style="white-space:pre-line;">${esc(ONW.roleDesc(game.myRole, game))}</p>
        </div>
      </section>`;
  };
  /** 観戦者（観戦ONのホスト含む）が配布の演出を見る時間か */
  ui.isSpecDeal = function (game) {
    const P = ONW.PHASE;
    if (game.phase === P.ONLINE_SPECTATE && game.isSpectator) return game.specPhase === P.ONLINE_ROLE;
    return !!(game.hostSpec && game.inGame && ONW.net.isHost && game.phase === P.ONLINE_ROLE);
  };
  /** 観戦者向けの配布演出: 全員と墓地のカードが山札から配られ、順に表になる（役職は全部見える） */
  ui.renderSpecDeal = function (game) {
    const info = game.specInfo;
    const list = info ? info.players : ((game.isSpectator ? game.boardView : game.players) || []);
    const graves = info ? info.center : [];
    const N = list.length, G = graves.length;
    const elapsed = game.dealStart ? (Date.now() - game.dealStart) / 1000 : 99;
    const D = (t) => `animation-delay:${(t - elapsed).toFixed(2)}s;`;
    const t0 = 0.4, gStep = 0.3, pStep = 0.28;
    const pStart = t0 + gStep * G + 0.2;
    const flip1 = pStart + pStep * N + 0.5 + 0.4, flip2 = flip1 + 1.6;
    const card = (o, fly) => {
      if (!o || !o.ini) return `<div class="dl-card dl-fly" data-fly style="${D(fly)}"></div>`;
      const a = o.from || o.ini, ia = ONW.roles.getInfo(a), ib = ONW.roles.getInfo(o.ini);
      const flipL = o.from ? flip2 + 1.6 : flip2;   // 恋人にめくれる時刻（役職のカードのあと）
      return `<div class="dl-card dl-fly dl-hasflip" data-fly style="${D(fly)}"><div class="dl-flipper" style="${D(flip1)}">
        <div class="dl-face dl-face--a dl-team-${ia.team}${a === "drunk" ? " dl-face--drunk" : ""}" style="${o.from ? D(flip2 - 0.2) : o.lover ? D(flipL - 0.2) : ""}"><b>${ui.nameBr(ia.name)}</b>${o.from ? "" : ui.mimicTag(o.ini, ((game.specInfo || {}).mimicMap || {})["p:" + o.id])}${o.from ? "" : ui.personaMask(o.ini, ((game.specInfo || {}).personaMap || {})["p:" + o.id], D(flip1 + 1.0))}</div>
        ${o.from ? `<div class="dl-face dl-face--b dl-team-${ib.team}${o.ini === "drunk" ? " dl-face--drunk" : ""}" style="${o.lover ? `animation:dl-in .25s ease-out both,dl-out .25s ease-in forwards;animation-delay:${(flip2 - elapsed).toFixed(2)}s,${(flipL - 0.2 - elapsed).toFixed(2)}s;` : D(flip2)}"><b>${ui.nameBr(ib.name)}</b>${ui.mimicTag(o.ini, ((game.specInfo || {}).mimicMap || {})["p:" + o.id])}${ui.personaMask(o.ini, ((game.specInfo || {}).personaMap || {})["p:" + o.id], D(flip2 + 1.0))}</div>` : ""}
        ${o.lover ? `<div class="dl-face dl-face--b dl-face--love dl-team-third" style="${D(flipL)}"><b>❤恋人</b></div>` : ""}
      </div></div>`;
    };
    const gHtml = Array.from({ length: G }, (_, i) => `<div class="dl-slot">${card(graves[i], t0 + gStep * i)}<span class="dl-name">墓地${i + 1}</span></div>`).join("");
    const pHtml = list.map((p, i) => `
      <div class="dl-player">
        <div class="dl-icon">${ONW.account.avatarHtml(p.name, null, "av--fill")}</div>
        <div class="dl-slot">${card(p, pStart + pStep * i)}</div>
        <span class="dl-name">${esc(p.name)}</span>
      </div>`).join("");
    // SE: 観戦の配布でも、全員のカードがめくれる瞬間（flip1 / 変化は flip2 / 恋人は flipL）に合わせる。同時にめくれるので時刻ごとに1回だけ
    const specFlipTimes = new Set([flip1]);
    [...list, ...graves].forEach((o) => { if (!o) return; if (o.from) specFlipTimes.add(flip2); if (o.lover) specFlipTimes.add(o.from ? flip2 + 1.6 : flip2); });
    ui.dealFlipSe(game, [...specFlipTimes]);
    // SE: 観戦の配布でも、カードが各席・墓地に着地する瞬間に配る・置く音を合わせる（全カード通常サイズ＝飛行 0.55s）
    const specPlaceTimes = [];
    for (let i = 0; i < G; i++) specPlaceTimes.push(t0 + gStep * i + 0.55);
    for (let i = 0; i < N; i++) specPlaceTimes.push(pStart + pStep * i + 0.55);
    ui.dealPlaceSe(game, specPlaceTimes);
    return `
      <section class="panel night-step deal-stage dl-spec" data-deal>
        <p class="lede">役職を配っています…（観戦中は全員の役職が見えます）</p>
        <div class="dl-deck"><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div></div>
        ${G ? `<div class="dl-row dl-graves">${gHtml}</div>` : ""}
        <div class="dl-row dl-players">${pHtml}</div>
        <div class="btn-row">${game.isSpectator ? `<button class="btn" onclick="ONW.main.goToTitle()">退出</button>` : ""}</div>
      </section>`;
  };

  /** 配役の演出を始める: 画面に収まる大きさに縮め（fitDeal）→ 山札から各スロットへの軌道を測り（placeDeal）→ 演出を開始（go） */
  ui.setupDeal = function () {
    const root = document.querySelector("[data-deal]");
    if (!root) return;
    ui.fitDeal(root);
    ui.placeDeal(root);
    root.classList.add("go");
  };

  /** 配役の演出を、画面からはみ出さない最大の大きさにする（スクロールさせない）。
   *  css の --dk（0.3〜1）を下げて、カード・余白・文字をまとめて縮める。1 のままで収まるなら何もしない（今までと同じ大きさ） */
  ui.fitDeal = function (root) {
    root = root || document.querySelector("[data-deal]");
    const app = document.getElementById("app");
    if (!root || !app) return;
    const cs = getComputedStyle(app);
    const avail = app.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (!(avail > 0)) return;
    const fits = (k) => { root.style.setProperty("--dk", k.toFixed(3)); return root.offsetHeight <= avail && root.scrollWidth <= root.clientWidth + 1; };
    if (fits(1)) return;   // そのままで収まる（今までと同じ大きさ）
    // 収まる最大の大きさを二分探索する（人数が多いと、小さくした途端に折り返しが減って高さがガクンと変わるので、比例計算ではなく実測で探す）
    let lo = 0.3, hi = 1;
    for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    root.style.setProperty("--dk", lo.toFixed(3));
  };

  /** 山札から各スロットへ飛ぶ軌道（--dx/--dy）を実測して入れる。（画面の大きさが変わったときも、これだけやり直す）
   *  ・出発点は山札の「いちばん上のカード」（手前に見えている1枚）
   *  ・配る順が早いカードほど手前（z-index が大きい）にして、山札の上から順に1枚ずつ取って配っているように見せる */
  ui.placeDeal = function (root) {
    root = root || document.querySelector("[data-deal]");
    if (!root) return;
    const stack = root.querySelectorAll(".dl-deck-card");
    const top = stack[stack.length - 1];
    const deck = top.getBoundingClientRect(), cs = getComputedStyle(top);
    const fly = Array.from(root.querySelectorAll("[data-fly]"));
    fly.forEach((el) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--dx", `${deck.left + deck.width / 2 - (r.left + r.width / 2)}px`);
      el.style.setProperty("--dy", `${deck.top + deck.height / 2 - (r.top + r.height / 2)}px`);
      el.style.setProperty("--dw", `${top.offsetWidth}px`);
      el.style.setProperty("--dh", `${top.offsetHeight}px`);
      el.style.setProperty("--df", cs.fontSize);
    });
    fly.map((el, i) => ({ el, i, t: parseFloat(el.style.animationDelay) || 0 }))
      .sort((a, b) => (a.t - b.t) || (a.i - b.i))
      .forEach((x, rank) => { x.el.style.zIndex = String(500 - rank); });
  };
  // 画面の大きさが変わったとき（全画面にした・戻した・端末を回した）も、配役の演出を収め直す
  if (!ui._dealResizeBound) {
    ui._dealResizeBound = true;
    const refit = () => { const root = document.querySelector("[data-deal]"); if (root) { ui.fitDeal(root); ui.placeDeal(root); } };
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", () => setTimeout(refit, 250));
    document.addEventListener("fullscreenchange", () => setTimeout(refit, 150));
  }

  /** タイトル・ロビーを、スクロールなしで画面に収める（body.menu-fit のあいだだけ）。
   *  1) そのまま（今までと同じ大きさ）で収まるならそのまま
   *  2) 収まらなければ body.menu-tight: ヘッダー・余白・文字を小さくし、フッターを隠す
   *  3) それでも収まらなければ、#app の中身を --mk(0.45〜1) で縮める（zoom。収まる最大値を二分探索）
   *  ルーム設定のウィンドウ(.settings-modal)は画面に固定で重なるので、縮めない（ウィンドウの中だけがスクロールする） */
  ui.fitMenu = function () {
    const b = document.body, app = document.getElementById("app");
    if (!app) return;
    const kids = Array.from(app.children);
    const setK = (k) => kids.forEach((el) => { if (k < 1) el.style.setProperty("--mk", k.toFixed(3)); else el.style.removeProperty("--mk"); });
    if (!b.classList.contains("menu-fit")) { b.classList.remove("menu-tight"); setK(1); return; }
    const over = () => app.scrollHeight > app.clientHeight + 1 || app.scrollWidth > app.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1;
    b.classList.remove("menu-tight"); setK(1);
    if (!over()) return;                       // 1) そのままで収まる
    b.classList.add("menu-tight");
    if (!over() || app.querySelector(".settings-modal")) return;   // 2) 小さくすれば収まる（設定ウィンドウが出ているときは縮めない）
    let lo = 0.45, hi = 1;                     // 3) 収まる最大の縮め方を測る
    setK(lo); if (over()) return;              // 最小でも収まらないときは最小のまま
    for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; setK(mid); if (over()) hi = mid; else lo = mid; }
    setK(lo);
  };
  if (!ui._menuResizeBound) {
    ui._menuResizeBound = true;
    const refit = () => { if (ONW.game && document.body.classList.contains("menu-fit")) ui.fitMenu(); };
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", () => setTimeout(refit, 250));
    document.addEventListener("fullscreenchange", () => setTimeout(refit, 150));
  }

  /** 縦向きの小さい画面（スマホ）の夜・朝・待機時間・結果発表の演出: 上のテーブル + 下の操作パネルが、スクロールなしで収まるように、カードの大きさ(--cw/--ch)だけを縮める。
   *  収まるなら何もしない（今までと同じ大きさ）。横向き・PC幅は CSS の2カラムなのでここでは触らない。議論・投票(chat-mode)はチャット欄が伸び縮みするので対象外 */
  ui.fitTable = function () {
    const b = document.body, tb = document.getElementById("table"), app = document.getElementById("app");
    if (!tb || !app) return;
    if (!ui._tableMo && window.MutationObserver) {   // 画面の文字があとから増えたとき（演出の途中で説明が出るなど）も収め直す
      let raf = 0;
      ui._tableMo = new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; ui.fitTable(); }); });
      ui._tableMo.observe(app, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class", "style", "hidden"] });
      app.addEventListener("animationend", () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; ui.fitTable(); }); });
    }
    b.classList.remove("tbl-tight");
    tb.style.transition = "none"; tb.style.removeProperty("--cw"); tb.style.removeProperty("--ch");   // 大きさのなめらかな変化(transition)は測るあいだだけ止める
    const done = () => { void tb.offsetHeight; tb.style.transition = ""; };
    const portrait = window.matchMedia("(max-width: 999px) and (orientation: portrait)").matches;
    if (!portrait || !tb.classList.contains("on") || b.classList.contains("chat-mode") || app.querySelector(".result-sheet")) return done();
    const over = () => app.scrollHeight > app.clientHeight + 1 || b.scrollHeight > b.clientHeight + 1;
    if (!over()) return done();
    const def = parseFloat(getComputedStyle(tb).getPropertyValue("--cw")) || 52;
    const set = (w) => { tb.style.setProperty("--cw", w.toFixed(1) + "px"); tb.style.setProperty("--ch", (w * 1.42).toFixed(1) + "px"); };
    const search = () => { let lo = 20, hi = def; set(lo); if (over()) return false; for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; set(mid); if (over()) hi = mid; else lo = mid; } set(lo); return true; };
    if (!search()) {   // カードを最小にしても収まらない（320x568 で10人など）: 操作パネルの余白・文字も小さくして、もう一度
      b.classList.add("tbl-tight");
      if (!search()) set(20);
    }
    done();
  };
  if (!ui._tableResizeBound) {
    ui._tableResizeBound = true;
    const refit = () => { if (ONW.game && ui.fitTable) ui.fitTable(); };
    window.addEventListener("resize", refit);
    window.addEventListener("orientationchange", () => setTimeout(refit, 250));
    document.addEventListener("fullscreenchange", () => setTimeout(refit, 150));
  }

  ui.renderOnlineNight = function renderOnlineNight(game) {
    const info = ONW.roles.getInfo(game.myRole);
    const held = ui.logsHeld(game);   // 夜の始まりのカードがめくれ終わるまで、文章は出さない
    const logs = (held ? [] : [...(game.nightLogs || []), ...(game.nightNotes || []), ...(game.nightAck || [])]).map((t) => `<p class="night-step__hint"><strong>${esc(t)}</strong></p>`).join("");
    let action = "";
    const ar = game.actRole, canAct = !game.nightDone && ar;
    const nm = (id) => nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name || "?");
    const sel = game.nightSel || { players: [], graves: [] };
    const chosen = [...sel.players.map((id) => esc(nm(id))), ...sel.graves.map((i) => `墓地${i + 1}`)];
    const nowSel = (sep, need) => `<p class="night-step__hint">選択中: <strong>${chosen.length ? chosen.join(sep) : "まだ選んでいません"}</strong>${need && chosen.length < need ? `（あと${need - chosen.length}つ）` : ""}</p>`;
    const later = `<br>朝になるまで何度でも変更できます（選んだカードをもう一度押すと解除）。結果は朝に分かります。`;
    const gmax = ONW.seerGraveMax(game, ar);
    // 役職ごとの夜の説明文は、各役職ファイルの uiNight.action(行動できる役職)/ uiNight.idle(行動がない役職)
    const nightUi = (id) => { const d = id && ONW.roleDef(id); return d && d.uiNight ? d.uiNight : null; };
    const X = { later, nowSel, gmax, sel, nm, esc, logs };
    const nu = canAct ? nightUi(ar) : null, idleUi = nightUi(game.myRole);
    const idleText = !(nu && nu.action) && idleUi && idleUi.idle ? idleUi.idle(X) : null;
    if (nu && nu.action) {
      action = nu.action(X);
    } else if (idleText != null) {
      action = idleText;
    } else if (held) {
      action = "";
    } else if (!logs) {
      action = `<p class="night-step__hint">あなたに夜の行動はありません。朝を待ちましょう。</p>`;
    } else {
      action = `<p class="night-step__hint">夜の行動は完了しました。朝を待ちましょう。</p>`;
    }
    return `
      <section class="panel night-step">
        <p class="lede">${game.myRole === "drunk" ? "夜 — あなたは <strong>酔っ払い</strong>です" : `夜 — あなたは <strong>${info.name}</strong>（配られた役職）`}</p>
        ${logs}${action}
      </section>`;
  };

  /** 昼能力・夜能力の説明文だけ閉じ開きできるようにする（説明は長く、スマホだとチャットを押し出して見えなくなるため）。開閉は再描画しても保つ */
  ui.abHelpStart = (game) => `<details class="ab-help"${game.abHelpOpen ? " open" : ""} ontoggle="ONW.game.abHelpOpen=this.open"><summary>説明（タップで開閉）</summary>`;
  /** 昼能力・夜能力ボタンのハイライト（docs/ability-highlight.md）。昼: ホストの判定（abhl）/ 夜: ホストの判定 + 酔い覚めの能力が手元で使える状態のとき。死亡・観戦中は光らない */
  ui.abilityHl = (game) => {
    if (!game || game.isDead || game.isSpectator || game.phase !== ONW.PHASE.ONLINE_DAY) return { day: false, night: false };
    const chain = !!(game.morningChain && game.morningChainReady && !game.morningChainDone && game.soberRole);
    return { day: !!game.hlDay, night: !!game.hlNight || chain };
  };
  /** 画面を作り直さずに、ボタンの光だけ付け外しする（チャット入力中でも邪魔しない） */
  ui.applyAbilityHl = (game) => {
    const h = ui.abilityHl(game);
    [["ab-day-btn", h.day], ["ab-night-btn", h.night]].forEach(([id, on]) => { const e = document.getElementById(id); if (e) e.classList.toggle("btn--hl", !!on); });
  };
  /** 昼能力・夜能力ボタンの受け口（今は押しても何も起きない。能力の実装時にここへ処理を足す） */
  ui.useAbility = function (kind) {   // kind: "day" | "night"。夜能力: 酔いが覚めたあとの最終役職の夜能力（押すとカードを選べて、確定/キャンセルが出る。もう一度押すと閉じる）
    const g = ONW.game, flash = (t) => { g.abilityMsg = t; ui.render(g); setTimeout(() => { if (g.abilityMsg === t) { g.abilityMsg = ""; ui.render(g); } }, 4000); };
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.isDead || g.isSpectator) return;
    if (kind === "day") {   // 昼能力: 独裁者だけが使える。押すとホストに確認し、使える人にだけカード選択が開く（使えない人は押しても何も起きない = 誰が独裁者か透けない）。もう一度押すと閉じる
      if (g.dictOpen || g.rejobOpen || g.mindOpen || g.exchOpen || g.sheriffOpen || g.yomiOpen || g.thiefOpen || g.fairyOpen || g.ratOpen || g.sheepOpen || g.mediumOpen || g.counselOpen || g.psyOpen || g.icarusOpen || g.goranshinOpen || g.libraOpen || g.predOpen || g.hokmaOpen || g.agentOpen || g.wagererOpen) { g.yomiOpen = false; g.dictOpen = false; g.rejobOpen = false; g.mindOpen = false; g.exchOpen = false; g.sheriffOpen = false; g.thiefOpen = false; g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.psyOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.libraOpen = false; g.predOpen = false; g.hokmaOpen = false; g.agentOpen = false; g.wagererOpen = false; g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); ui.render(g); return; }
      ONW.net.dictOpen();
      return;
    }
    if (kind !== "night") return;   // 使えない人は押しても何も出ない
    if (g.morningChainDone) return;
    if (!g.morningChain || !g.morningChainReady || !g.soberRole) return;
    g.abilityOpen = !g.abilityOpen;
    if (!g.abilityOpen) g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  ui.abilityConfirm = function () {
    const g = ONW.game;
    g.abilityOpen = false;
    ONW.net.morningUse();
    ONW.stage.sync(g); ui.render(g);
  };
  /** 独裁者: 選んだ相手を独裁処刑にする（確定）。確定するとすぐ議論が終わって結果発表へ */
  ui.dictConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.dictOpen || !id) return;
    g.dictOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.dictate(id);
    ONW.stage.sync(g); ui.render(g);
  };
  /** フリーター: 選んだ相手に再就職する（確定） */
  ui.rejobConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.rejobOpen || !id) return;
    g.rejobOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.rejob(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.rejobCancel = function () {
    const g = ONW.game;
    g.rejobOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** フリーターの昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから再就職先を1人選んで「再就職する」 */
  ui.rejobBlock = function (game) {
    if (!game.rejobOpen || game.isDead || game.isSpectator) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>フリーターの昼能力（再就職）</strong>: 就職先が死亡しました。上のテーブルから、<strong>新しい就職先のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「再就職する」を押すと、新しい就職先の<strong>最終役職</strong>がわかります。新しい就職先が死亡するまで、再就職はできません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.rejobConfirm()">再就職する</button><button class="btn" onclick="ONW.ui.rejobCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 心眼の人狼: 選んだ相手の最終役職を見抜く（確定） */
  ui.mindConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.mindOpen || !id) return;
    g.mindOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.mind(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.mindCancel = function () {
    const g = ONW.game;
    g.mindOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 心眼の人狼の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「見抜く」。見抜いたあとは何も出さない（結果は情報確認に載る） */
  ui.mindBlock = function (game) {
    if (!game.mindOpen || game.isDead || game.isSpectator) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    const sense = game.mindRole === "sense_seer";   // 感覚の占い師も同じ操作欄を使う（昼能力ボタン → カードを選ぶ → 確定）
    const photo = game.mindRole === "mitsuki_nanoka";   // 三月なのかの写真撮影も同じ操作欄を使う
    const head = photo
      ? `<p class="night-step__hint"><strong>三月なのかの昼能力「写真撮影」</strong>: 上のテーブルから、<strong>写真を撮る相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「撮影する」を押すと、選んだ相手の<strong>最終役職</strong>（そのときのカード）から、<strong>村人陣営・人狼陣営・第三陣営</strong>のどの気配かが写真に写ります。使えるのは1回だけで、取り消せません。写真は情報確認で見返せます。</p>`
      : sense
      ? `<p class="night-step__hint"><strong>感覚の占い師の昼能力</strong>: 上のテーブルから、<strong>気配を感じ取る相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「感じ取る」を押すと、選んだ相手の<strong>最終役職</strong>（そのときのカード）から、<strong>村人・人狼・狂っている・第三陣営・恋人陣営</strong>のどの気配かがわかります。使えるのは1回だけで、取り消せません。妖狐を感じ取っても呪殺しません。</p>`
      : `<p class="night-step__hint"><strong>心眼の人狼の昼能力</strong>: 上のテーブルから、<strong>最終役職を見抜く相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「見抜く」を押すと、選んだ相手の<strong>最終役職</strong>（そのときのカード）がわかります。使えるのは1回だけで、取り消せません。妖狐を見抜いても呪殺しません。</p>`;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      ${head}
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.mindConfirm()">${photo ? "撮影する" : sense ? "感じ取る" : "見抜く"}</button><button class="btn" onclick="ONW.ui.mindCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 交換者: 選んだ2人の票数を入れ替える（確定）。確定すると取り消せない。議論は続く */
  ui.exchConfirm = function () {
    const g = ONW.game, ids = (g.nightSel && g.nightSel.players) || [];
    if (!g.exchOpen || ids.length !== 2) return;
    g.exchOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.exchange(ids[0], ids[1]);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.exchCancel = function () {
    const g = ONW.game;
    g.exchOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 交換者の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから2人選んで「交換する」。使ったあとは「交換しました」を出す */
  ui.exchBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.exchDone && !game.exchOpen) return "";   // 何をしたかは情報確認に載る（議論タイムの画面には出さない）
    if (!game.exchOpen) return "";
    const ids = (game.nightSel && game.nightSel.players) || [];
    const nm = (id) => id === ONW.net.myId() ? (game.myName || "自分") : nmv(id, (((game.others || []).find((p) => p.id === id) || {}).name || "?"));
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>${esc((ONW.roles.getInfo(game.exchRole || "exchanger") || {}).name || "交換者")}の昼能力</strong>: 上のテーブルから、<strong>票数を入れ替える2人のカード</strong>を押してください（生きている人。自分も選べます）。</p>
      <p class="night-step__hint">「交換する」を押すと、その2人の票数を入れ替えます（投票の集計のときに入れ替わります）。議論は続きます。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${ids.length ? ids.map((x) => esc(nm(x))).join(" ⇔ ") : "まだ選んでいません"}</strong>${ids.length === 1 ? "（あと1人）" : ""}</p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${ids.length === 2 ? "" : "disabled"} onclick="ONW.ui.exchConfirm()">交換する</button><button class="btn" onclick="ONW.ui.exchCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 天秤: 選んだ2人に投票対象を制限する（確定）。確定すると取り消せない。議論はそこで打ち切られて、すぐ投票に移る */
  ui.libraConfirm = function () {
    const g = ONW.game, ids = (g.nightSel && g.nightSel.players) || [];
    if (!g.libraOpen || ids.length !== 2) return;
    g.libraOpen = false; g.predOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.libra(ids[0], ids[1]);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.libraCancel = function () {
    const g = ONW.game;
    g.libraOpen = false; g.predOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 予想屋: 「確定して閉じる」。いま選んでいる人（0人でも）で予想を保存して画面を閉じる。0人で確定すると「誰も死亡しない」予想になる。昼が終わるまでは、昼能力ボタンからまた開いて何度でも選び直せる */
  ui.predConfirm = function () {
    const g = ONW.game, ids = (g.nightSel && g.nightSel.players) || [];
    if (!g.predOpen) return;
    g.predOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.predict(ids, true);
    ONW.stage.sync(g); ui.render(g);
  };
  /** 予想屋: 閉じる（選んだ人はタップのたびにもう保存されている。「誰も死亡しない」予想にしたいときは「確定して閉じる」を使う） */
  ui.predClose = function () {
    const g = ONW.game;
    g.predOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 予想屋の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから、最終的に死亡すると思う人のカードを何人でも押す（タップのたびに保存される） */
  ui.predBlock = function (game) {
    if (game.isDead || game.isSpectator || !game.predOpen) return "";
    const ids = (game.nightSel && game.nightSel.players) || [];
    const nm = (id) => id === ONW.net.myId() ? (game.myName || "自分") : nmv(id, (((game.others || []).find((p) => p.id === id) || {}).name || "?"));
    const all = ids;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>${esc((ONW.roles.getInfo("predictor") || {}).name || "予想屋")}の昼能力</strong>: 上のテーブルから、<strong>最終的に死亡すると思う人のカード</strong>を押してください（死亡した人も含めて何人でも。自分も選べます。もう一度押すと解除）。</p>
      <p class="night-step__hint">選んだ人は押すたびに保存されます。投票が始まるまで何度でも選び直せます。最終的な死亡者（追放・道連れ・昼の死亡など）と<strong>完全に一致</strong>すれば単独勝利です（1人でも多くても少なくてもだめ。誰も死亡しないと思うなら、誰も選ばずに「確定して閉じる」）。昼のうちに死亡した人も選べます。</p>
      </details>
      <p class="night-step__hint">死亡すると予想: <strong>${all.length ? all.map((x) => esc(nm(x))).join("、") : "誰も選んでいません（確定すると「誰も死亡しない」予想）"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" onclick="ONW.ui.predConfirm()">確定して閉じる</button><button class="btn" onclick="ONW.ui.predClose()">閉じる</button></div>
    </div>`;
  };
  /** 天秤の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから2人選んで「投票対象を制限する」。使うとすぐ投票に移る（何をしたかは情報確認に載る） */
  // ---- 天秤（libra）発動演出の上皿天秤の部品（SVG。css の .lp-*） ----
  const DW = 600, DH = 410, PIVOT_Y = 250, ARM = 210, TILT_MAX = 18, HEAVY = -16;   // 天秤の設計寸法（px。画面が狭いときは全体を縮める）/ 負の角度 = 左が下がる
  /** 上皿天秤の部品（SVG）。真鍮 = 台座・皿・つまみ / 緑青 = 棒 */
  const SVG_DEFS = `<defs>
    <linearGradient id="lpBrass" x1="0" x2="1"><stop offset="0" stop-color="#6e5120"/><stop offset=".3" stop-color="#d9b96a"/><stop offset=".5" stop-color="#f2e2a8"/><stop offset=".75" stop-color="#b08a3e"/><stop offset="1" stop-color="#5f4519"/></linearGradient>
    <linearGradient id="lpBrassV" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9d390"/><stop offset=".5" stop-color="#b58f45"/><stop offset="1" stop-color="#6c4f1d"/></linearGradient>
    <linearGradient id="lpGreen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa844"/><stop offset=".45" stop-color="#456a2c"/><stop offset="1" stop-color="#233a18"/></linearGradient>
  </defs>`;
  const BASE_SVG = `<svg class="lp-base" viewBox="0 0 ${DW} ${DH}" width="${DW}" height="${DH}">${SVG_DEFS}
    <ellipse cx="300" cy="398" rx="120" ry="9" fill="rgba(0,0,0,.4)"/>
    <path d="M226 374 L374 374 L388 394 Q300 406 212 394 Z" fill="url(#lpBrass)"/>
    <path d="M263 320 L337 320 L364 376 L236 376 Z" fill="url(#lpBrass)"/>
    <path d="M250 350 q6 -11 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" fill="none" stroke="#6a4d1a" stroke-width="2" opacity=".8"/>
    <path d="M246 362 q6 -9 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" fill="none" stroke="#6a4d1a" stroke-width="1.5" opacity=".6"/>
    <ellipse cx="300" cy="320" rx="36" ry="8" fill="url(#lpBrass)"/>
    <rect x="284" y="290" width="32" height="32" fill="url(#lpBrass)"/>
    <ellipse cx="300" cy="290" rx="22" ry="6" fill="url(#lpBrassV)"/>
    <path d="M288 288 L292 256 Q300 246 308 256 L312 288 Z" fill="url(#lpBrass)"/>
    <g stroke="#cbbd8f" stroke-linecap="round" opacity=".85">${[-TILT_MAX, 0, TILT_MAX].map((d) => { const r = d * Math.PI / 180, l = d === 0 ? 14 : 8; return `<path d="M${(300 + 112 * Math.sin(r)).toFixed(1)} ${(PIVOT_Y - 112 * Math.cos(r)).toFixed(1)} L${(300 + (112 + l) * Math.sin(r)).toFixed(1)} ${(PIVOT_Y - (112 + l) * Math.cos(r)).toFixed(1)}" stroke-width="${d === 0 ? 3 : 2}"/>`; }).join("")}</g>
  </svg>`;
  const BEAM_SVG = `<svg class="lp-beamsvg" viewBox="-280 -110 560 150" width="560" height="150">
    <path d="M-258 -8 L-66 -10 C-52 -12 -44 -20 -34 -26 L-24 -16 L-12 -30 L0 -20 L12 -30 L24 -16 L34 -26 C44 -20 52 -12 66 -10 L258 -8 L258 9 L72 12 C54 14 38 24 18 30 L-18 30 C-38 24 -54 14 -72 12 L-258 9 Z" fill="url(#lpGreen)" stroke="#1b2a12" stroke-width="1.2"/>
    <path d="M-4 -28 L0 -104 L4 -28 Z" fill="url(#lpBrass)"/>
    <rect x="-270" y="-12" width="54" height="26" rx="4" fill="url(#lpGreen)" stroke="#1b2a12"/>
    <rect x="216" y="-12" width="54" height="26" rx="4" fill="url(#lpGreen)" stroke="#1b2a12"/>
    <circle cx="-243" cy="1" r="4.5" fill="url(#lpBrassV)"/><circle cx="243" cy="1" r="4.5" fill="url(#lpBrassV)"/>
    <circle cx="0" cy="0" r="13" fill="url(#lpBrassV)" stroke="#4a3512"/><circle cx="0" cy="0" r="4" fill="#3b2a0e"/>
  </svg>`;
  const PAN_BACK = `<svg class="lp-pan lp-pan--back" viewBox="0 0 200 60" width="200" height="60"><ellipse cx="100" cy="14" rx="100" ry="13" fill="url(#lpBrass)"/><ellipse cx="100" cy="15" rx="84" ry="8" fill="#4d3010"/></svg>`;
  const PAN_FRONT = `<svg class="lp-pan lp-pan--front" viewBox="0 0 200 60" width="200" height="60"><path d="M0 14 Q100 40 200 14 Q192 54 132 56 L68 56 Q8 54 0 14 Z" fill="url(#lpBrass)" stroke="#4a3512" stroke-width=".8"/><path d="M92 52 h16 v12 q-8 6 -16 0 z" fill="#5a5a5f"/></svg>`;

  const lpHtml = function () {
    const k = Math.min(1, ((window.innerWidth || 400) - 16) / DW);
    const end = (x) => `<div class="lp-end" style="left:${x}px">${PAN_BACK}${PAN_FRONT}</div>`;
    return `<div class="lp-wrap" style="width:${DW * k}px;height:${DH * k}px"><div class="lp-scale" style="transform:scale(${k})">${BASE_SVG}<div class="lp-beam" style="left:300px;top:${PIVOT_Y}px">${BEAM_SVG}${end(-ARM)}${end(ARM)}</div></div></div>`;
  };

  /** 天秤が発動したときの演出: 画面いっぱいに大きな⚖️が出て、消えたあとに投票が始まる（net.js の hostLibra が ONW.LIBRA_FLASH_MS 後に投票へ移す） */
  ONW.LIBRA_FLASH_MS = 2300;
  ui.libraFlash = function () {
    try {
      const old = document.getElementById("libraFlash"); if (old) old.remove();
      const el = document.createElement("div"); el.id = "libraFlash"; el.className = "libra-flash"; el.innerHTML = `<div class="libra-flash__pan">${lpHtml()}</div>` + "<small>天秤が発動しました</small>";
      document.body.appendChild(el);
      setTimeout(() => { if (el.parentNode) el.remove(); }, ONW.LIBRA_FLASH_MS - 100);
    } catch (e) { /* 表示できなくても投票は始まる */ }
  };
  ui.libraBlock = function (game) {
    if (game.isDead || game.isSpectator || !game.libraOpen) return "";
    const ids = (game.nightSel && game.nightSel.players) || [];
    const nm = (id) => id === ONW.net.myId() ? (game.myName || "自分") : nmv(id, (((game.others || []).find((p) => p.id === id) || {}).name || "?"));
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>${esc((ONW.roles.getInfo(game.libraRole || "libra") || {}).name || "天秤")}の昼能力</strong>: 上のテーブルから、<strong>投票対象にする2人のカード</strong>を押してください（生きている人。自分も選べます）。</p>
      <p class="night-step__hint">「投票対象を制限する」を押すと、議論をそこで打ち切ってすぐ投票に移り、その投票では選んだ2人のどちらかにしか投票できなくなります。選んだ2人は投票が始まるときに全員に知らされますが、誰が使ったかは結果発表までわかりません。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${ids.length ? ids.map((x) => esc(nm(x))).join(" ⚖ ") : "まだ選んでいません"}</strong>${ids.length === 1 ? "（あと1人）" : ""}</p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${ids.length === 2 ? "" : "disabled"} onclick="ONW.ui.libraConfirm()">投票対象を制限する</button><button class="btn" onclick="ONW.ui.libraCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 保安官: 選んだ相手を撃つ（確定）。取り消せない。議論は続く */
  ui.shootConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.sheriffOpen || !id) return;
    g.sheriffOpen = false; g.thiefOpen = false; g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.shoot(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.shootCancel = function () {
    const g = ONW.game;
    g.sheriffOpen = false; g.thiefOpen = false; g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 保安官の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「撃つ」。撃ったあとは「使用済み」だけ出す（執行か誤爆かは本人にも出さない） */
  ui.sheriffBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.sheriffDone && !game.sheriffOpen) return "";   // 何を撃ったかは情報確認に載る（議論タイムの画面には出さない）
    if (!game.sheriffOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>保安官の昼能力</strong>: 上のテーブルから、<strong>撃つ相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「撃つ」を押すと、選んだ相手を撃ちます。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.shootConfirm()">撃つ</button><button class="btn" onclick="ONW.ui.shootCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 盗賊: 選んだ相手の票数を1票盗む（確定）。取り消せない。議論は続く（相手が0票だと失敗して使用済みになる） */
  ui.stealConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.thiefOpen || !id) return;
    g.thiefOpen = false; g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.steal(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.stealCancel = function () {
    const g = ONW.game;
    g.thiefOpen = false; g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 盗賊の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「盗む」。盗んだあとは何も出さない（何をしたかは情報確認に載る） */
  ui.thiefBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.thiefDone && !game.thiefOpen) return "";   // 何を盗んだか（盗めたか・失敗か）は情報確認に載る（議論タイムの画面には出さない）
    if (!game.thiefOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>盗賊の昼能力</strong>: 上のテーブルから、<strong>票数を盗む相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「盗む」を押すと、選んだ相手の投票数を1票ぶん盗みます（相手は1票減り、あなたは1票増えます）。相手の投票数が0票のときは失敗します。使えるのは1回だけで、失敗しても使用済みになり、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.stealConfirm()">盗む</button><button class="btn" onclick="ONW.ui.stealCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 妖精さん: 選んだ相手にバリアを付与する（確定）。取り消せない。議論は続く */
  ui.barrierConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.fairyOpen || !id) return;
    g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.barrier(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.barrierCancel = function () {
    const g = ONW.game;
    g.fairyOpen = false; g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 妖精さんの昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「バリアを付与する」。付与したあとは何も出さない（何をしたかは情報確認に載る） */
  ui.fairyBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.fairyDone && !game.fairyOpen) return "";
    if (!game.fairyOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>妖精さんの昼能力</strong>: 上のテーブルから、<strong>バリアを付与する相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「バリアを付与する」を押すと、選んだ相手に入る票が1票ぶん防がれます（結果発表で、本来の得票数が出たあとに妖精が来て票を1減らします）。相手に票が入らなかったときは何も起きません。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.barrierConfirm()">バリアを付与する</button><button class="btn" onclick="ONW.ui.barrierCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 鼠の狂人: 選んだ相手のカードの裏に逃げ込む（確定）。取り消せない。議論は続く */
  ui.ratConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.ratOpen || !id) return;
    g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.fairyOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.hide(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.ratCancel = function () {
    const g = ONW.game;
    g.ratOpen = false; g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.fairyOpen = false; g.icarusOpen = false; g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 鼠の狂人の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「逃げ込む」。逃げたあとは何も出さない（何をしたかは情報確認に載る） */
  ui.ratBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.ratDone && !game.ratOpen) return "";
    if (!game.ratOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>鼠の狂人の昼能力</strong>: 上のテーブルから、<strong>逃げ込む相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「逃げ込む」を押すと、その人のカードの裏に逃げ込みます。逃げ込んだ先が死亡しない限り、投票の追放などでは死亡しません（保安官やヴァニティの執行・呪術の人狼の呪殺は防げません）。逃げ込んだ先が死亡した場合は後追いし、第三陣営の人の裏に逃げ込んでいた場合は投票の終了時に後追いします。使えるのは1回だけで、取り消せません。逃げたことは結果発表まで誰にも分かりません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.ratConfirm()">逃げ込む</button><button class="btn" onclick="ONW.ui.ratCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 黄泉: 選んだ相手(自分も可)の状態を断ち切る（確定）。取り消せない。議論は続く */
  ui.yomiConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.yomiOpen || !id) return;
    g.yomiOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.yomi(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.yomiCancel = function () {
    const g = ONW.game;
    g.yomiOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 黄泉の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「状態を断ち切る」（自分も選べる）。使ったあとは何も出さない（何をしたかは情報確認に載る） */
  ui.yomiBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (!game.yomiOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>黄泉の昼能力</strong>: 上のテーブルから、<strong>状態を断ち切る相手のカード</strong>を押してください（生きている人から1人。自分も選べます）。</p>
      <p class="night-step__hint">「状態を断ち切る」を押すと、選んだ相手に付与されている状態（シャッフラー・反転・恋人・未覚醒の酔っ払い・各役職の対象・封印など）を断ち切ります。何も付与されていなくても使ったことになります。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.yomiConfirm()">状態を断ち切る</button><button class="btn" onclick="ONW.ui.yomiCancel()">キャンセル</button></div>
    </div>`;
  };
  /** イカロス: 選んだ相手に票を分け与える（確定）。取り消せない。議論は続く。昼能力ボタンからまた別の人に使える（使い切るまで） */
  ui.icarusConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.icarusOpen || !id || (g.icarusGiven || []).filter((x) => x === id).length >= (g.icarusMax || 1)) return;
    g.icarusOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.icarus(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.icarusCancel = function () {
    const g = ONW.game;
    g.icarusOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** イカロスの昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「票を分け与える」。分け与えたあとは何も出さない（何をしたかは情報確認に載る。増えた票数は出さない） */
  ui.icarusBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (!game.icarusOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>イカロスの昼能力</strong>: 上のテーブルから、<strong>票を分け与える相手のカード</strong>を押してください（生きている自分以外の1人。もう使い切った人は選べません）。</p>
      <p class="night-step__hint">「票を分け与える」を押すと、選んだ相手の投票数が増えます（村人陣営の人には1票、それ以外の人には2票。増えた票数は誰にも公開されません）。使うと全員の画面に、太陽へ翼が飛び上がる演出が出ます（だれが・だれに使ったかは分かりません）。同じ人には1回だけ（カルメンに囁かれたときは各プレイヤーに2回ずつ）で、取り消せません。昼のうちなら、昼能力ボタンからまた別の人にも使えます。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.icarusConfirm()">票を分け与える</button><button class="btn" onclick="ONW.ui.icarusCancel()">キャンセル</button></div>
    </div>`;
  };
  /** ホクマー: 議論時間を10秒短縮する（確定）。対象は選ばない。何度でも使える。議論は続く */
  ui.hokmaUse = function () {
    const g = ONW.game;
    if (!g.hokmaOpen) return;
    g.hokmaOpen = false;
    ONW.net.hokma();
    ONW.stage.sync(g); ui.render(g);
  };
  ui.hokmaCancel = function () {
    const g = ONW.game;
    g.hokmaOpen = false;
    ONW.stage.sync(g); ui.render(g);
  };
  /** 代行者: 指令対象を確認する（確定）。対象は選ばない。「対象を守れ」の指令のときだけ、1日1回 */
  ui.agentUse = function () {
    const g = ONW.game;
    if (!g.agentOpen) return;
    g.agentOpen = false;
    ONW.net.agent();
    ONW.stage.sync(g); ui.render(g);
  };
  ui.agentCancel = function () {
    const g = ONW.game;
    g.agentOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 代行者（思い込み）: 守る対象を選んで使う（偽の昼能力） */
  ui.agentFakeConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.agentOpen || !id) return;
    g.agentOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.agentFake(id);
    ONW.stage.sync(g); ui.render(g);
  };
  /** 代行者の昼能力の操作欄（昼能力ボタンで開いたとき）。本物は「指令対象を確認する」を押すだけ。思い込み（agentPick）のときは対象を1人選ぶ */
  ui.agentBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (!game.agentOpen) return "";
    if (game.agentPick) {
      const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
      const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
      return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>代行者の昼能力</strong>: 上のテーブルから、<strong>守る対象のカード</strong>を押してください（自分以外の1人）。</p>
      <p class="night-step__hint">「守る対象にする」を押すと、その人を守る対象にします。取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.agentFakeConfirm()">守る対象にする</button><button class="btn" onclick="ONW.ui.agentCancel()">キャンセル</button></div>
    </div>`;
    }
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>代行者の昼能力</strong>: 「指令対象を確認する」を押すと、あなたの指令対象が分かります。</p>
      <p class="night-step__hint">指令対象が生存していれば追加勝利します。確認できるのは1日1回だけです。取り消せません。</p>
      </details>
      <div class="btn-row" style="justify-content:center;"><button class="btn" onclick="ONW.ui.agentUse()">指令対象を確認する</button><button class="btn" onclick="ONW.ui.agentCancel()">キャンセル</button></div>
    </div>`;
  };
  /** ホクマーの昼能力の操作欄（昼能力ボタンで開いたとき）。対象は選ばず、「昼時間を10秒短縮する」を押すだけ。使ったあとも、昼能力ボタンからまた開いて使える */
  ui.hokmaBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (!game.hokmaOpen) return "";
    const n = game.hokmaCount || 0;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>ホクマーの昼能力</strong>: 「昼時間を10秒短縮する」を押すと、議論時間が<strong>10秒短く</strong>なります。</p>
      <p class="night-step__hint">何度でも使えます（使うたびに10秒ずつ短くなります）。使うと全員の画面に時計が薄く浮き出て針が進む演出が出ます（だれが使ったかは分かりません）。取り消せません。${n ? `（これまでに${n}回使いました）` : ""}</p>
      </details>
      <div class="btn-row" style="justify-content:center;"><button class="btn" onclick="ONW.ui.hokmaUse()">昼時間を10秒短縮する</button><button class="btn" onclick="ONW.ui.hokmaCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 勝負師: 勝利すると思う陣営を選ぶ（確定。選ぶたびに上書き。昼時間中なら何度でも選び直せる） */
  ui.wagererPick = function (key) {
    const g = ONW.game;
    if (!g.wagererOpen) return;
    g.wagererOpen = false;
    ONW.net.wagerer(key);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.wagererCancel = function () {
    const g = ONW.game;
    g.wagererOpen = false;
    ONW.stage.sync(g); ui.render(g);
  };
  /** 勝負師の昼能力の操作欄（昼能力ボタンで開いたとき）。選べる陣営は試合の配役で決まる（ホストから届いた game.wagererOptions）。選んだ予想は自分にだけ通知され、他の人には分からない */
  ui.wagererBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (!game.wagererOpen) return "";
    const opts = game.wagererOptions || [], cur = game.wagererCur || null;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>勝負師の昼能力</strong>: 勝利すると思う陣営を1つ選んでください。</p>
      <p class="night-step__hint">村人陣営か人狼陣営を当てると<strong>追加勝利</strong>、単独の第三陣営を当てると<strong>乗っ取り単独勝利</strong>します。昼時間中なら何度でも選び直せます。予想は自分にだけ通知され、他の人には分かりません。</p>
      </details>
      <div class="btn-row" style="justify-content:center;flex-wrap:wrap;">${opts.map((o) => `<button class="btn${cur === o.key ? " btn--on" : ""}" onclick="ONW.ui.wagererPick('${esc(o.key)}')">${esc(o.label)}の勝利${cur === o.key ? " ✓" : ""}</button>`).join("")}</div>
      <div class="btn-row" style="justify-content:center;"><button class="btn" onclick="ONW.ui.wagererCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 御乱心: 選んだ相手の投票先をランダムに変える（確定）。取り消せない。議論は続く */
  ui.goranshinConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.goranshinOpen || !id) return;
    g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.goranshin(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.goranshinCancel = function () {
    const g = ONW.game;
    g.goranshinOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 御乱心の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「投票先を変える」。使ったあとは何も出さない（何をしたかは情報確認に載る） */
  ui.goranshinBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.goranshinDone && !game.goranshinOpen) return "";
    if (!game.goranshinOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>御乱心の昼能力</strong>: 上のテーブルから、<strong>投票先を変える相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「投票先を変える」を押すと、選んだ相手の投票先が、生きている全員の中からランダムな1人に変わります（自分自身になることもあります）。相手が投票しなかったときは何も起きません。誰になったかは結果発表まで分かりません。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.goranshinConfirm()">投票先を変える</button><button class="btn" onclick="ONW.ui.goranshinCancel()">キャンセル</button></div>
    </div>`;
  };
  /** 羊の狂人: 選んだ相手を迷える子羊状態にする（確定）。取り消せない。議論は続く */
  ui.sheepConfirm = function () {
    const g = ONW.game, id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.sheepOpen || !id) return;
    g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.sheep(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.sheepCancel = function () {
    const g = ONW.game;
    g.sheepOpen = false; g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 羊の狂人の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「迷える子羊にする」。使ったあとは何も出さない（何をしたかは情報確認に載る） */
  ui.sheepBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.sheepDone && !game.sheepOpen) return "";
    if (!game.sheepOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>羊の狂人の昼能力</strong>: 上のテーブルから、<strong>迷える子羊にする相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「迷える子羊にする」を押すと、選んだ相手の投票先が、生きている全員の中からランダムな1人に変わります（自分自身や羊の狂人本人になることもあります）。人狼陣営の人に使うと、自分の投票先もランダムになります。相手が投票しなかったときは何も起きません。誰になったかは結果発表まで分かりません。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.sheepConfirm()">迷える子羊にする</button><button class="btn" onclick="ONW.ui.sheepCancel()">キャンセル</button></div>
    </div>`;
  };
  ui.mediumConfirm = function () {
    const g = ONW.game;
    const id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.mediumOpen || !id) return;
    g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.medium(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.mediumCancel = function () {
    const g = ONW.game;
    g.mediumOpen = false; g.counselOpen = false; g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 霊媒師の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから、昼議論中に死亡した1人のカードを選んで「霊媒する」。結果は自分だけに届く（情報確認に載る）。使ったあとは何も出さない */
  ui.mediumBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.mediumDone && !game.mediumOpen) return "";
    if (!game.mediumOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    const none = !(game.mediumTargets || []).length;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>霊媒師の昼能力</strong>: 上のテーブルから、<strong>霊媒する死亡者のカード</strong>を押してください（昼議論中に死亡した自分以外の1人）。</p>
      <p class="night-step__hint">「霊媒する」を押すと、選んだ人の<strong>最終役職</strong>が分かります。結果はあなただけに伝わり、情報確認で見返せます。呪殺で死亡した人は対象にできません。使えるのは1回だけで、取り消せません。</p>
      </details>
      ${none ? `<p class="night-step__hint"><strong>霊媒できる死亡者がいません。</strong></p>` : `<p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>`}
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.mediumConfirm()">霊媒する</button><button class="btn" onclick="ONW.ui.mediumCancel()">キャンセル</button></div>
    </div>`;
  };
  ui.counselConfirm = function () {
    const g = ONW.game;
    const id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.counselOpen || !id) return;
    g.counselOpen = false; g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.counsel(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.counselCancel = function () {
    const g = ONW.game;
    g.counselOpen = false; g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** カウンセラーの昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「更生させる」。成功/失敗は情報確認に載り、対象のカードが「更生」/「失敗」の面でめくれる（本人の画面だけ） */
  ui.counselBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.counselDone && !game.counselOpen) return "";
    if (!game.counselOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>カウンセラーの昼能力</strong>: 上のテーブルから、<strong>更生させる相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「更生させる」を押すと、選んだ相手の最終役職が<strong>狂人系なら村人に更生</strong>します（昇格した狂人も更生でき、昇格は解けます）。狂人系でない相手の場合は失敗します。対象が鍵師にロックされていると、成功したかどうかも分からないまま終わります。使えるのは1回だけで、取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.counselConfirm()">更生させる</button><button class="btn" onclick="ONW.ui.counselCancel()">キャンセル</button></div>
    </div>`;
  };
  ui.renConfirm = function () {
    const g = ONW.game;
    const id = g.nightSel && g.nightSel.players && g.nightSel.players[0];
    if (!g.renOpen || !id) return;
    g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.net.ren(id);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.renCancel = function () {
    const g = ONW.game;
    g.renOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** レンの昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「調べる」。合計3回（カルメンに囁かれると4回）まで使え、同じ相手を何度も調べられる。結果は情報確認に載り、対象のカードが「⭕」/「❌」の面でめくれる（本人の画面だけ。モーゼスのときは印の下に「モーゼス」） */
  ui.renBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.renDone && !game.renOpen) return "";
    if (!game.renOpen) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    const rem = typeof game.renRemain === "number" ? game.renRemain : null;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>レンの昼能力</strong>: 上のテーブルから、<strong>役職の変化を調べる相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「調べる」を押すと、選んだ相手の<strong>最終役職が初期役職から変化しているかどうか</strong>が分かります。対象の最終役職が<strong>モーゼス</strong>の場合は、そのことも分かります。${rem !== null ? `あと<strong>${rem}回</strong>使えます（同じ相手を何度も調べられます）。` : "合計3回まで使えます（同じ相手を何度も調べられます）。"}取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.renConfirm()">調べる</button><button class="btn" onclick="ONW.ui.renCancel()">キャンセル</button></div>
    </div>`;
  };
  ui.psyConfirm = function () {
    const g = ONW.game;
    const sel = (g.nightSel && g.nightSel.players) || [];
    if (!g.psyOpen || sel.length !== 2) return;
    g.psyOpen = false; const a = sel[0], b = sel[1]; g.nightSel = { players: [], graves: [] };
    ONW.net.psy(a, b);
    ONW.stage.sync(g); ui.render(g);
  };
  ui.psyCancel = function () {
    const g = ONW.game;
    g.psyOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 心理士の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから2人選んで「検査する」。1日に1回（カルメンに村人陣営として囁かれると2回）まで。結果は情報確認に載り、選んだ2人のカードが「適合」/「未適合」の面でめくれる（本人の画面だけ） */
  ui.psyBlock = function (game) {
    if (game.isDead || game.isSpectator) return "";
    if (game.psyDone && !game.psyOpen) return "";
    if (!game.psyOpen) return "";
    const sel = (game.nightSel && game.nightSel.players) || [];
    const names = sel.map((id) => nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name));
    const rem = typeof game.psyRemain === "number" ? game.psyRemain : null;
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>心理士の昼能力</strong>: 上のテーブルから、<strong>検査する2人のカード</strong>を押してください（生きている自分以外の2人）。</p>
      <p class="night-step__hint">「検査する」を押すと、選んだ2人の<strong>最終役職が同じ陣営扱いかどうか</strong>が分かります（同じなら適合、別なら不適合。第三陣営は基本的に役職ごとに別陣営扱いですが、同じ役職同士は同じ扱いです）。結果はあなたにだけ分かり、情報確認に残ります。${rem !== null ? `あと<strong>${rem}回</strong>使えます。` : "1日に1回だけ使えます（カルメンに村人陣営として囁かれると2回まで）。"}取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${sel.length ? sel.map((id, i) => esc(names[i] || "?")).join(" と ") : "まだ選んでいません"}（${sel.length}/2人）</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${sel.length === 2 ? "" : "disabled"} onclick="ONW.ui.psyConfirm()">検査する</button><button class="btn" onclick="ONW.ui.psyCancel()">キャンセル</button></div>
    </div>`;
  };
  ui.dictCancel = function () {
    const g = ONW.game;
    g.dictOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };
  /** 独裁者の昼能力の操作欄（昼能力ボタンで開いたとき）。上のテーブルから1人選んで「独裁を宣言する」 */
  ui.dictBlock = function (game) {
    if (!game.dictOpen || game.isDead || game.isSpectator) return "";
    const id = game.nightSel && game.nightSel.players && game.nightSel.players[0];
    const nm = id ? nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name) : "";
    return `<div class="sober-box dict-box">
      ${ui.abHelpStart(game)}
      <p class="night-step__hint"><strong>独裁者の昼能力</strong>: 上のテーブルから、<strong>独裁で処刑する相手のカード</strong>を押してください（生きている自分以外の1人）。</p>
      <p class="night-step__hint">「独裁を宣言する」を押すと、すぐに議論を打ち切って、選んだ相手だけを処刑します（投票はしません）。取り消せません。</p>
      </details>
      <p class="night-step__hint">選択中: <strong>${id ? esc(nm || "?") : "まだ選んでいません"}</strong></p>
      <div class="btn-row" style="justify-content:center;"><button class="btn" ${id ? "" : "disabled"} onclick="ONW.ui.dictConfirm()">独裁を宣言する</button><button class="btn" onclick="ONW.ui.dictCancel()">キャンセル</button></div>
    </div>`;
  };
  ui.abilityCancel = function () {
    const g = ONW.game;
    g.abilityOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };

  // ---- チャット ----
  function chatHtml(game) {
    // 観戦者・死亡者には、議論と霊界の発言が時刻順に1本で流れる。生存者には議論だけ（霊界の発言は届かない）
    const src = [...(ui.canGhost() ? mergedChat(game) : (game.chatLog || [])), ...(game.tpLogView || []).map((c) => ({ ...c, tp: true }))].sort((a, b) => (a.at || 0) - (b.at || 0));   // テレパシー: 届いた人（成分のメンバー・観戦者）にだけ、時刻順に混ざって流れる
    const names = ONW.utils.playerNames();   // COの文章の中のプレイヤー名をオレンジにする
    const bub = game.bubbleChat === true;   // 吹き出しチャット（ルーム設定）。ON のとき、発言をアイコン+名前つきの吹き出しにする
    const meP = (game.lobbyPlayers || [])[game.meIndex], myName = meP ? meP.name : null;
    const achvByName = {};   // 実績: 発言者の装備中実績（吹き出しチャットONのとき、自分の発言は名前の左・他者は名前の右に実績名を出す。作者決定 2026-11-26）
    if (ONW.achievements) { (game.lobbyPlayers || []).forEach((p) => { if (p.achv) achvByName[p.name] = p.achv; }); src.forEach((c) => { if (c.name && c.achv) achvByName[c.name] = c.achv; }); }
    const nameRow = (nameHtml, achvId, mine, tagHtml) => (ONW.achievements && ONW.achievements.bubbleNameHtml ? ONW.achievements.bubbleNameHtml(nameHtml, achvId, mine, tagHtml) : `<div class="bub__name">${tagHtml || ""}${nameHtml}</div>`);
    const bubble = (c, extra) => { const mine = c.name === myName; return `<div class="bub${mine ? " bub--me" : ""}${extra || ""}">${ONW.account && ONW.account.avatarHtml ? ONW.account.avatarHtml(c.name, null, "av--bub") : ""}<div class="bub__body">${nameRow(esc(c.name), c.achv || achvByName[c.name], mine, extra ? `<span class="chat-ghost__tag">【霊界】</span>` : "")}<div class="bub__text">${esc(c.text)}</div></div></div>`; };
    // COボタンの発言（「名前: 占い師CO」。name は無く text の先頭が発言者）も、吹き出しのとき発言者つきの吹き出しにする。発言者が取れない行（口封じの通知など）は今までの1行
    const coBubble = (c) => {
      const m = String(c.text == null ? "" : c.text).match(/^([^:：\s][^:：]{0,30}?)\s*[:：]\s*([\s\S]*)$/);
      if (!m) return null;
      const mine = m[1] === myName;
      return `<div class="bub bub--co${mine ? " bub--me" : ""}">${ONW.account && ONW.account.avatarHtml ? ONW.account.avatarHtml(m[1], null, "av--bub") : ""}<div class="bub__body">${nameRow(esc(m[1]), achvByName[m[1]], mine, "")}<div class="bub__text">${ONW.utils.tintCo(m[2], names, false)}</div></div></div>`;
    };
    const lines = src.map((c) => c.tp
      ? `<div class="chat-line chat-tp"><span class="chat-ghost__tag">【テレパシー】</span><strong class="rs-pl rs-me">${esc(c.name)}</strong>: ${esc(c.text)}</div>`
      : bub && c.ghost ? bubble(c, " bub--ghost") : bub && c.kind === "co" && coBubble(c) ? coBubble(c) : c.ghost
      ? `<div class="chat-line chat-ghost"><span class="chat-ghost__tag">【霊界】</span><strong class="rs-pl rs-me">${esc(c.name)}</strong>: ${esc(c.text)}</div>`
      : c.kind === "death"
      ? `<div class="chat-line chat-death">${esc(c.text)}</div>`
      : c.kind === "sys"
      ? `<div class="chat-line chat-sys">${esc(c.text)}</div>`
      : c.kind === "co"
      ? `<div class="chat-line chat-co">${ONW.utils.tintCo(c.text, names, true)}</div>`
      : bub ? bubble(c)
      : `<div class="chat-line"><strong class="rs-pl rs-me">${esc(c.name)}</strong>: ${esc(c.text)}</div>`).join("");
    return lines || `<div class="chat-line chat-empty">まだ発言はありません。</div>`;
  }
  /** ヘッダーのフェーズ名に残り時間を出す */
  /** 鈴の巫女の鈴（パン屋のバナーの仕組み）: 🔔 のバナーが回数ぶん出て、SE「bell」も回数ぶん鳴る（作者メモ）。
   *  1回ぶんのバナーは約0.85秒。連続するときは少し間を空けて順に出す。SEはバナーの出るたびに鳴らす */
  let bellQueue = 0, bellBusy = false;
  function bellStep() {
    if (bellQueue <= 0) { bellBusy = false; return; }
    bellBusy = true; bellQueue--;
    document.querySelectorAll(".bell-banner").forEach((e) => e.remove());
    const b = document.createElement("div"); b.className = "bell-banner";
    b.innerHTML = `<span class="bell-banner__ic">🔔</span><span class="bell-banner__tx">鈴の音が聞こえました</span>`;
    document.body.appendChild(b);
    if (ONW.sound) ONW.sound.se("bell");
    setTimeout(() => { b.remove(); setTimeout(bellStep, 120); }, 850);
  }
  ui.showBell = (n) => {
    bellQueue += Math.max(1, Math.min(20, n | 0));   // 回数ぶん（安全のため最大20回まで）
    if (!bellBusy) bellStep();
  };
  ui.clearBell = () => { bellQueue = 0; document.querySelectorAll(".bell-banner").forEach((e) => e.remove()); };   // 画面遷移の保険

  /** ドーナツ屋: 届いた本人の画面にだけ「ドーナツが届きました」のバナーを出す（パン屋のバナーと同じ仕組み。粗悪なドーナツのときは文面が変わる） */
  ui.showDonut = function (kind) {
    document.querySelectorAll(".donut-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "donut-banner";
    el.innerHTML = `<span class="donut-banner__icon">🍩</span><span class="donut-banner__text">${kind === "defective" ? "粗悪なドーナツが届きました" : "ドーナツが届きました"}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  /** スクリューガム: 銀狼の気配の通知バナーを出す（スクリューガム本人の画面だけ。パン屋のバナーと同じ位置・同じ長さ） */
  ui.showScrewSilver = function (has) {
    document.querySelectorAll(".screw-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "screw-banner";
    el.innerHTML = `<span class="screw-banner__icon">🐺</span><span class="screw-banner__text">${has ? "銀狼の気配があります" : "銀狼の気配はありません"}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  /** パン屋: 昼のタイマーが動き出す瞬間に「パンが焼けました」のバナーを出す（誰がパン屋かは出さない） */
  ui.showBread = function (n) {
    document.querySelectorAll(".bread-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "bread-banner";
    el.innerHTML = `<span class="bread-banner__icon">🍞</span><span class="bread-banner__text">${n > 1 ? `パンが${n}個焼けました` : "パンが焼けました"}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  /** 愉快犯: 「愉快な笑い声が聞こえました。」のバナー（誰が愉快犯かは出さない。見た目は仮。stage.js の PRANK_MS と同じ長さで消える） */
  ui.showPrankster = function (ms) {
    document.querySelectorAll(".prk-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "prk-banner";
    el.innerHTML = `<span class="prk-banner__text">愉快な笑い声が聞こえました。</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms || 3400);
  };
  /** 従者: ご主人に「あなたの従者がいるようです」のバナーを出す（パン屋のバナーと同じ位置・同じ長さ。カードには重ならない。誰が従者かは出さない） */
  ui.showServant = function () {
    document.querySelectorAll(".servant-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "servant-banner";
    el.innerHTML = `<span class="servant-banner__text">あなたの従者がいるようです</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  /** カルメン: 村人陣営として囁かれた人に「あなたはカルメンに囁かれました」のバナーを出す（従者通知と同じ作り・同じ長さ。誰が囁いたかは出さない。ほかのバナーと重ならない位置） */
  ui.showCarmen = function (text) {   // text: 「あなたは調和開拓者に囁かれました」など（なければカルメン）
    document.querySelectorAll(".carmen-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "servant-banner carmen-banner";
    el.innerHTML = `<span class="servant-banner__text">${esc(String(typeof text === "string" && text ? text : "あなたはカルメンに囁かれました。").replace(/。$/, ""))}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  /** 弁護士: 依頼人に「あなたに弁護士がついています」のバナーを出す（従者通知と同じ作り・同じ長さ。誰が弁護士かは出さない。従者バナーと重ならないよう少し下） */
  ui.showLawyer = function () {
    document.querySelectorAll(".lawyer-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "servant-banner lawyer-banner";
    el.innerHTML = `<span class="servant-banner__text">あなたに弁護士がついています</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  ui.updateTimer = function () {
    if (ONW.stage && ONW.stage.drunkTick) ONW.stage.drunkTick();   // 酔っ払い: 自分のカードの「酔いが覚めるまで」を毎秒更新
    if (ONW.stage && ONW.stage.coffeeTick) ONW.stage.coffeeTick();   // ケセド: 自分のカードの「コーヒータイム終了まで」を毎秒更新
    const g = ONW.game, el = document.getElementById("phase-label");
    if (!el) return;
    const base = g.phase === ONW.PHASE.ONLINE_SPECTATE ? `観戦中（${PHASE_LABEL[g.specPhase] ?? "―"}）` : phaseName(g);
    const t = g.phase === ONW.PHASE.ONLINE_RESULT ? null : g.remain;   // 結果発表ではタイマーを出さない
    document.body.classList.toggle("res-phase", g.phase === ONW.PHASE.ONLINE_RESULT);
    // スマホ: 残り時間を大きく見せるため、フェーズ名・「残り」・時間を別の span にする（textContent は従来と同じ「フェーズ名 残り mm:ss」。css .ph-time）。残り10秒以下は赤くして脈打たせる（PC版の大きなタイマーと同じ）
    const has0 = !(t == null || t < 0), clock = has0 ? ONW.utils.formatClock(t) : "";
    if (!has0) { if (el.textContent !== base || el.querySelector(".ph-time")) el.textContent = base; }
    else {
      let nm = el.querySelector(".ph-name"), tm = el.querySelector(".ph-time");
      if (!nm || !tm) { el.innerHTML = `<span class="ph-name"></span> <span class="ph-rem">残り</span> <span class="ph-time"></span>`; nm = el.querySelector(".ph-name"); tm = el.querySelector(".ph-time"); }
      if (nm.textContent !== base) nm.textContent = base;
      if (tm.textContent !== clock) tm.textContent = clock;
    }
    el.classList.toggle("low", has0 && t <= 10);
    const dc = document.getElementById("day-clock"); if (dc) dc.classList.add("ph-off");   // オンラインでは「――」しか出ない2つ目の枠は出さない（小さい画面の縦を食うため）
    // PC版: 左の大きなタイマー（残り10秒以下で赤くする）
    const bt = document.getElementById("big-timer");
    if (bt) {
      const has = !(t == null || t < 0);
      bt.querySelector(".big-timer__phase").textContent = base;
      bt.querySelector(".big-timer__time").textContent = has ? ONW.utils.formatClock(t) : "――";
      bt.classList.toggle("low", has && t <= 10);
      bt.classList.toggle("idle", !has);
    }
    // 全画面チャットを開いているときも、上の空きスペースで残り時間が分かるようにする（作者要望 2026-11-26: チャット中は本画面のタイマーが隠れて投票時間に気づけない）
    const ct = document.getElementById("chat-timer");
    if (ct) {   // 議論画面の #phase-label と同じ形（フェーズ名・「残り」・大きな時間の3分割。作者要望 2026-11-26）
      if (!has0) { if (ct.textContent !== base || ct.querySelector(".ph-time")) ct.textContent = base; }
      else {
        let nm = ct.querySelector(".ph-name"), tm = ct.querySelector(".ph-time");
        if (!nm || !tm) { ct.innerHTML = `<span class="ph-name"></span> <span class="ph-rem">残り</span> <span class="ph-time"></span>`; nm = ct.querySelector(".ph-name"); tm = ct.querySelector(".ph-time"); }
        if (nm.textContent !== base) nm.textContent = base;
        if (tm.textContent !== clock) tm.textContent = clock;
      }
      ct.classList.toggle("low", has0 && t <= 10);
    }
  };

  // ---- 下に固定: プレイヤー一覧と「何をCOしているか」----
  function coLabel(co) {
    if (!co) return ["未CO", "co-none"];
    if (String(co).startsWith("team:")) {
      const t = co.slice(5);
      return [{ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[t] || "陣営CO", "t-" + t];
    }
    const info = ONW.roles.getInfo(co);
    return [`${info.name}CO`, "t-" + info.team];
  }
  /** COボタンの「CO履歴」用の表: 左 = アイコン（名前つき）/ 右 = 上段 CO、下段 結果（「対象 → 結果」） */
  ui.coTable = function () {
    const g = ONW.game, me = ONW.net.myId();
    return `<div class="cb-table">` + (g.boardView || []).map((p) => {
      const [label, cls] = p.dead ? [p.fox ? "呪殺" : p.fx || p.mark || "死亡", "co-dead"] : coLabel(p.co);
      const names = ONW.utils.playerNames();
      const res = (p.results || []).map((t) => `<div class="cb-r">${ONW.utils.tintCo(t, names)}</div>`).join("");
      return `<div class="cb-row ${p.id === me ? "cb-me" : ""} ${p.dead ? "cb-dead" : ""}">
        <div class="cb-who">${ONW.account.avatarHtml(p.name, null, "av--sm")}<span class="cb-name rs-pl rs-me">${esc(p.name)}${p.cpu ? '<small class="cb-cpu">CPU</small>' : ""}</span></div>
        <div class="cb-what"><div class="cb-co ${cls}">${label}</div>${res ? `<div class="cb-results">${res}</div>` : ""}</div></div>`;
    }).join("") + `</div>`;
  };
  ui.updateBoard = function () {
    const el = document.getElementById("co-board");
    if (!el) return;
    const g = ONW.game, me = ONW.net.myId();
    const chips = (g.boardView || []).map((p) => {
      const [label, cls] = p.dead ? [p.fox ? "呪殺" : p.fx || p.mark || "死亡", "co-dead"] : coLabel(p.co);
      return `<div class="cb-chip ${p.id === me ? "cb-me" : ""} ${p.dead ? "cb-dead" : ""}">
        <div class="cb-line"><span class="cb-name rs-pl rs-me">${ONW.account.avatarMap[p.name] ? ONW.account.avatarHtml(p.name, null, "av--xs") : ""}${esc(p.name)}${p.cpu ? '<small class="cb-cpu">CPU</small>' : ""}</span><span class="cb-co ${cls}">${label}</span></div></div>`;
    }).join("");
    const tf = g.tfView;
    if (tf && tf.mode === "reveal" && tf.lines.length && !g.tfShown) {   // 最初の1回だけ、画面に大きく書き出す
      g.tfShown = true; g.tfIntro = true;
      ONW.stage.paper(tf.lines);
    }
    let appear = "";
    if (tf && tf.lines.length && !g.tfIntro && !g.tfAppeared) { g.tfAppeared = true; appear = "cb-tf--appear"; }   // 出現のフェードは最初の1回だけ（CPUの発言で更新されても点滅させない）
    const tfBlock = tf && tf.lines.length
      ? `<div class="cb-tf ${tf.mode === "reveal" ? "cb-tf--paper" : ""} ${appear} ${g.tfIntro ? "tf-hide" : ""}"><div class="cb-tf-title">${tf.mode === "reveal" ? "変化公開" : "変化先の候補"}</div>${tf.lines.map((t) => `<span class="cb-tf-item">${esc(t)}</span>`).join("")}</div>` : "";
    const html = `<div class="cb-title"><span>プレイヤー一覧 / CO状況</span></div><div class="cb-chips">${chips}</div>${tfBlock}`;
    if (el.__html === html) return;      // 内容が変わっていなければ触らない（スクロール位置も保つ）
    el.__html = html;
    el.innerHTML = html;
    ui.fitBoard();
  };
  /** プレイヤー一覧・変化公開の欄を、スクロールしなくても見える範囲で一番大きく表示する（足りなければ文字を縮める） */
  ui.fitBoard = function () {
    const el = document.getElementById("co-board");
    if (!el) return;
    let k = 1;
    el.style.setProperty("--cb-s", "1");
    while (el.scrollHeight > el.clientHeight + 1 && k > 0.6) { k = Math.round((k - 0.05) * 100) / 100; el.style.setProperty("--cb-s", String(k)); }
  };
  window.addEventListener("resize", () => ONW.ui.fitBoard());

  // ---- ロビーチャット（アモアス式） ----
  function lobbyChatHtml(game) {
    const log = game.lobbyChat || [];
    const me = (game.lobbyPlayers || [])[game.meIndex] || {};
    if (!log.length) return `<div class="chat-line chat-empty">まだメッセージはありません。</div>`;
    const nameRow = (nameHtml, achvId, mine) => (ONW.achievements && ONW.achievements.bubbleNameHtml ? ONW.achievements.bubbleNameHtml(nameHtml, achvId, mine) : `<div class="bub__name">${nameHtml}</div>`);
    return log.map((c) => {
      const mine = c.name === me.name;
      return `<div class="bub${mine ? " bub--me" : ""}">${ONW.account && ONW.account.avatarHtml ? ONW.account.avatarHtml(c.name, null, "av--bub") : ""}<div class="bub__body">${nameRow(esc(c.name), c.achv || null, mine)}<div class="bub__text">${esc(c.text)}</div></div></div>`;
    }).join("");
  }
  // ロビーチャットは常時表示ではなく、💬ボタンで背景透過のオーバーレイとして重ねて出す（作者指定 2026-11-26）
  let lobbyChatOpen = false;
  let lobbyDraft = "";   // ロビーチャットの下書き: 閉じても消えず、開き直すと途中から書ける（作者要望 2026-11-26）
  ui.toggleLobbyChat = function (force) {
    lobbyChatOpen = typeof force === "boolean" ? force : !lobbyChatOpen;
    ui.syncLobbyChatOverlay();
    if (lobbyChatOpen) { ui.updateLobbyChat(); ui.updateLobbyTyping(); const el = document.getElementById("lobby-chat-in"); if (el) el.focus(); }
  };
  ui.closeLobbyChatOverlay = function () {
    lobbyChatOpen = false;
    const el = document.getElementById("lobby-chat-in");
    if (el) lobbyDraft = el.value;   // 閉じる前に下書きを残す
    const w = document.getElementById("lobby-chat-overlay");
    if (w) w.remove();
  };
  /** 開いている間だけオーバーレイを body 直下に保つ（ロビーの再描画で消えたり入力が飛んだりしない） */
  ui.syncLobbyChatOverlay = function () {
    if (!lobbyChatOpen || !ONW.game || ONW.game.phase !== ONW.PHASE.LOBBY) { if (!lobbyChatOpen) ui.closeLobbyChatOverlay(); return; }
    if (document.getElementById("lobby-chat-overlay")) return;
    const w = document.createElement("div");
    w.id = "lobby-chat-overlay";
    w.onclick = (e) => { if (e.target === w) ui.toggleLobbyChat(false); };
    w.innerHTML = `<div class="lobby-chat-card" role="dialog" aria-modal="true">
      <div class="lobby-chat-head"><span>チャット</span><button class="pf-x" aria-label="閉じる" onclick="ONW.ui.toggleLobbyChat(false)">×</button></div>
      <div id="lobby-chat-log" class="chat-log lobby-chat-log"></div>
      <div id="lobby-typing" class="lobby-typing"></div>
      <div id="lobby-chat-err" class="lobby-chat-err"></div>
      <div class="chat-input">
        <input id="lobby-chat-in" class="onw-input" maxlength="100" placeholder="メッセージを入力" oninput="ONW.ui.lobbyChatInput()" onkeydown="if(event.key==='Enter')ONW.ui.sendLobbyChat()">
        <button class="btn" onclick="ONW.ui.sendLobbyChat()">送信</button>
      </div>
      <p class="night-step__hint">試合が始まるとチャットの履歴は消えます。</p>
    </div>`;
    document.body.appendChild(w);
    const li = document.getElementById("lobby-chat-in");
    if (li && lobbyDraft) li.value = lobbyDraft;   // 下書きを復元する
    ui.fitLobbyChat();
  };
  /** ロビーチャットを「見えている範囲」（キーボードを除いた部分）に合わせる。全画面チャットの fitChat と同じ理由: スマホでキーボードが開くと、固定配置のカードがキーボードの裏に隠れて入力欄も「入力中」表示も見えなくなる（作者報告 2026-11-26） */
  ui.fitLobbyChat = function () {
    const w = document.getElementById("lobby-chat-overlay"), vv = window.visualViewport;
    if (!w || !vv) return;
    w.style.top = vv.offsetTop + "px"; w.style.height = vv.height + "px"; w.style.bottom = "auto";
  };
  /** ロビーチャットのログだけ描き直す（入力欄には触らない） */
  ui.updateLobbyChat = function () {
    const el = document.getElementById("lobby-chat-log");
    if (!el || !ONW.game) return;
    el.innerHTML = lobbyChatHtml(ONW.game);
    el.scrollTop = el.scrollHeight;
  };
  let lobbyChatErrTimer = null;
  ui.sendLobbyChat = function () {
    const el = document.getElementById("lobby-chat-in");
    if (!el) return;
    const v = el.value;
    if (!String(v || "").trim()) return;
    const ok = !!(ONW.net && ONW.net.sendLobbyChat && ONW.net.sendLobbyChat(v));
    if (!ok) {   // たまに送れない問題対策: 無言で消さず、文章を残して理由を知らせる（接続が戻ればそのまま再送できる）
      const err = document.getElementById("lobby-chat-err");
      if (err) { err.textContent = "接続が不安定で送れませんでした。文章は残してあるので、少し待ってもう一度「送信」を押してください。"; clearTimeout(lobbyChatErrTimer); lobbyChatErrTimer = setTimeout(() => { err.textContent = ""; }, 5000); }
      el.focus();
      return;
    }
    el.value = "";
    lobbyDraft = "";
    ui.lobbyTypingOff();
    const err = document.getElementById("lobby-chat-err");
    if (err) err.textContent = "";
    el.focus();
  };
  // 「〇〇が入力中…」（Discord式・ロビーだけ）: 打っている間だけホストへ申告する（送りすぎないよう間引く）
  let typingOn = false, typingSentAt = 0, typingIdle = null;
  ui.lobbyTypingOff = function () {
    if (typingIdle) { clearTimeout(typingIdle); typingIdle = null; }
    if (typingOn) { typingOn = false; if (ONW.net && ONW.net.sendLobbyTyping) ONW.net.sendLobbyTyping(false); }
  };
  ui.lobbyChatInput = function () {
    const el = document.getElementById("lobby-chat-in");
    if (!el) return;
    lobbyDraft = el.value;
    if (!ONW.net || !ONW.net.sendLobbyTyping) return;
    if (!el.value.trim()) { ui.lobbyTypingOff(); return; }
    const now = Date.now();
    if (!typingOn || now - typingSentAt > 2000) { typingOn = true; typingSentAt = now; ONW.net.sendLobbyTyping(true); }
    if (typingIdle) clearTimeout(typingIdle);
    typingIdle = setTimeout(() => ui.lobbyTypingOff(), 3000);   // 打つのをやめたら消す
  };
  /** 入力中表示の描き直し（自分の入力中も自分に見える仕様。古い表示は5秒で自然に消える） */
  let typingClearTimer = null;
  ui.updateLobbyTyping = function () {
    const el = document.getElementById("lobby-typing");
    if (!el || !ONW.game) return;
    const names = (ONW.game.lobbyTypingNames || []).slice();
    el.textContent = names.length ? `${names.join("、")}が入力中…` : "";
    if (typingClearTimer) clearTimeout(typingClearTimer);
    if (names.length) {
      const at = ONW.game.lobbyTypingAt || 0;
      typingClearTimer = setTimeout(() => { if ((ONW.game.lobbyTypingAt || 0) === at) { ONW.game.lobbyTypingNames = []; ui.updateLobbyTyping(); } }, 5000);
    }
  };
  // 最新メッセージを画面上部に吹き出しでポップ表示する（アモアス式）。同じ発言を二度出さないよう時刻で dedupe する
  let popTimer = null, popSeenAt = 0;
  ui.popChat = function (entry) {
    if (!entry || !entry.name || !entry.at || entry.at <= popSeenAt) return;
    popSeenAt = entry.at;
    if (document.getElementById("lobby-chat-overlay")) return;   // ロビーチャットを開いているときは上のポップも着信音も出さない（作者要望 2026-11-26）
    if (!ONW.game || ONW.game.phase !== ONW.PHASE.LOBBY) return;
    let el = document.getElementById("chat-pop");
    if (!el) { el = document.createElement("div"); el.id = "chat-pop"; document.body.appendChild(el); }
    const me = (ONW.game.lobbyPlayers || [])[ONW.game.meIndex] || {};
    const mine = entry.name === me.name;
    if (!mine && ONW.sound && ONW.sound.se) ONW.sound.se("chatpop");   // ロビーチャット着信音（LINE風のポッ。自分の発言では鳴らさない）
    const nm = ONW.achievements && ONW.achievements.bubbleNameHtml ? ONW.achievements.bubbleNameHtml(esc(entry.name), entry.achv || null, mine) : `<div class="bub__name">${esc(entry.name)}</div>`;
    el.innerHTML = `<div class="bub chat-pop__bub${mine ? " bub--me" : ""}">${ONW.account && ONW.account.avatarHtml ? ONW.account.avatarHtml(entry.name, null, "av--bub") : ""}<div class="bub__body">${nm}<div class="bub__text">${esc(entry.text)}</div></div></div>`;
    el.classList.remove("on"); void el.offsetWidth; el.classList.add("on");
    clearTimeout(popTimer);
    popTimer = setTimeout(() => { el.classList.remove("on"); }, 3600);
  };
  /** ロビー再同期で既存の履歴を受け取ったとき用: 既存分はポップ済みとして扱う */
  ui.lobbyChatSeen = function () {
    const log = (ONW.game && ONW.game.lobbyChat) || [];
    if (log.length) popSeenAt = Math.max(popSeenAt, log[log.length - 1].at || 0);
  };

  ui.updateChat = function () {
    const big = document.getElementById("chat-log-big");
    if (big) { big.classList.toggle("chat-log--bub", ONW.game.bubbleChat === true); big.innerHTML = chatHtml(ONW.game); big.scrollTop = big.scrollHeight; }
    const el = document.getElementById("chat-log");
    if (!el) return !!big;
    el.classList.toggle("chat-log--bub", ONW.game.bubbleChat === true);
    el.innerHTML = chatHtml(ONW.game);
    el.scrollTop = el.scrollHeight;
    return true;
  };
  /** チャット欄を押すと、画面いっぱいの大きなチャットを開く（昼は入力欄つき・投票中は閲覧のみ） */
  ui.isPc = () => !!(window.matchMedia && window.matchMedia("(min-width: 1000px)").matches);
  ui.openChat = function () {
    if (document.getElementById("chat-overlay")) return;
    if (ui.isPc()) return;   // PC版はチャット欄が最初から大きいので、全画面にしない
    const g = ONW.game, day = g.phase === ONW.PHASE.ONLINE_DAY, canGhost = ui.canGhost(), canSend = canGhost || (day && !g.isSpectator && !g.muzzled);   // 観戦者・死亡者はいつでも書ける（霊界チャットになる）
    const wrap = document.createElement("div");
    wrap.id = "chat-overlay";
    wrap.innerHTML = `<div class="co-head"><span>チャット</span><span id="chat-timer" class="chat-timer"></span><button class="btn" onclick="ONW.ui.closeChat()">閉じる</button></div>
      <div id="chat-log-big" class="chat-log chat-log--big"></div>
      ${canSend ? `${ui.tpToggle(g)}<div class="chat-input"><input id="chat-in-big" class="onw-input" maxlength="100" onkeydown="if(event.key==='Enter')ONW.co.sendChat()"><button class="btn" onpointerdown="event.preventDefault()" onmousedown="event.preventDefault()" ontouchend="event.preventDefault();ONW.co.sendChat()" onclick="ONW.co.sendChat()">送信</button></div>` : ""}`;
    document.body.appendChild(wrap);
    ui.lockPage(true);                 // 開いている間、ページ本体は動かさない
    ui.fitChat();
    ui.updateTimer();                  // 開いた直後からタイマーを出す（次の毎秒更新を待たない）
    ui.updateChat();
    const inp = document.getElementById("chat-in-big");
    if (inp) { if (chatDraft) inp.value = chatDraft; if (document.activeElement && document.activeElement !== inp) document.activeElement.blur(); inp.focus({ preventScroll: true }); }
  };
  /** 大きいチャットを開いている間、ページ本体のスクロール・ずれを止める */
  ui.lockPage = function (on) {
    const h = document.documentElement, b = document.body;
    h.style.overflow = on ? "hidden" : ""; b.style.overflow = on ? "hidden" : ""; h.style.overscrollBehavior = on ? "none" : "";
    window.scrollTo(0, 0);
  };
  /** 大きいチャットを「見えている範囲」（キーボードを除いた部分）にぴったり合わせる。ページ本体は動かさない */
  ui.fitChat = function () {
    const w = document.getElementById("chat-overlay"), vv = window.visualViewport;
    if (!w) return;
    if (vv) { w.style.top = vv.offsetTop + "px"; w.style.height = vv.height + "px"; w.style.bottom = "auto"; }
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);       // iOSがページを持ち上げた分を戻す
    const log = document.getElementById("chat-log-big");
    if (log) log.scrollTop = log.scrollHeight;
  };
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", () => { ONW.ui.fitChat(); ONW.ui.fitLobbyChat(); }); window.visualViewport.addEventListener("scroll", () => { ONW.ui.fitChat(); ONW.ui.fitLobbyChat(); }); }
  let chatDraft = "";   // 大きいチャットの下書き: 閉じても消えず、開き直すと途中から書ける（作者要望 2026-11-26）
  ui.closeChat = function () { const bi = document.getElementById("chat-in-big"); if (bi) chatDraft = bi.value; const w = document.getElementById("chat-overlay"); if (w) w.remove(); ui.lockPage(false); };

  /** 朝（墓荒らしの交換後）と、昼（酔いが覚めたあと）に使う能力の操作欄。late=昼 */
  ui.chainBlock = function (game, late) {
    let chain = "";
    const ar = game.morningChain;
    if (ar && !game.isSpectator) {
      const sel = game.nightSel || { players: [], graves: [] }, np = sel.players.length, ng = sel.graves.length;
      const nm = (id) => nmv(id, ((game.others || []).find((p) => p.id === id) || {}).name || "?");
      const chosen = [...sel.players.map((id) => esc(nm(id))), ...sel.graves.map((i) => `墓地${i + 1}`), ...(Number.isInteger(sel.pick) && game.cosplayCards && game.cosplayCards[sel.pick] ? [esc(ONW.roles.getInfo(game.cosplayCards[sel.pick]).name)] : [])];
      const gmax = ONW.seerGraveMax(game, ar);
      const uc = (ONW.roleDef(ar) || {}).uiNight;   // 確定できる条件と「押して」の文言は、各役職ファイルの uiNight.chainReady / chainHow(ない役職は いたずらっ子と同じ形)
      const ready = uc && uc.chainReady ? uc.chainReady(np, ng, sel) : np === 1;
      const how = uc && uc.chainHow ? uc.chainHow(gmax) : ONW.roleDef("troublemaker").uiNight.chainHow(gmax);
      if (game.morningChainDone) chain = late ? "" : `<p class="night-step__hint">朝の能力は使用済みです。</p>`;
      else if (!late && game.settling) chain = `<p class="night-step__hint">待機時間になったので、新しい役職（${esc(ONW.roles.getInfo(ar).name)}）の能力は、昼の議論中に使えます。</p>`;   // 待機時間は選んでも受け付けられない（ホストが朝の連鎖として処理しない）ので、押せるように見せない
      else if (!game.morningChainReady) chain = late ? "" : `<p class="night-step__hint">新しい役職（${esc(ONW.roles.getInfo(ar).name)}）の能力を、このあと朝のうちに使えます…</p>`;
      else if (late && !game.abilityOpen) chain = "";
      else if (late) chain = `${ui.abHelpStart(game)}<p class="night-step__hint">上のテーブルから、${how}ください。選んだら「確定」で能力が発動します。</p></details>
        <p class="night-step__hint">選択中: <strong>${chosen.length ? chosen.join("、") : "まだ選んでいません"}</strong></p>
        <div class="btn-row" style="justify-content:center;"><button class="btn" ${ready ? "" : "disabled"} onclick="ONW.ui.abilityConfirm()">確定</button><button class="btn" onclick="ONW.ui.abilityCancel()">キャンセル</button></div>`;
      else chain = `<p class="night-step__hint">${late ? "最終的な役職" : "新しい役職"}（<strong>${esc(ONW.roles.getInfo(ar).name)}</strong>）の能力を使えます。上のテーブルから、${how}、「能力を使う」を押してください。<br>押すとその場で結果が分かります（${late ? "議論中に" : "朝の間に"}1回だけ）。</p>
        <p class="night-step__hint">選択中: <strong>${chosen.length ? chosen.join("、") : "まだ選んでいません"}</strong></p>
        <div class="btn-row" style="justify-content:center;"><button class="btn" ${ready ? "" : "disabled"} onclick="ONW.net.morningUse()">能力を使う</button></div>`;
    }
    return chain;
  };

  /** 結果の文章の出し待ち: カードがめくれ終わるまで「あなたは〇〇になりました」などの文章を出さない。
   *  g.logHold = 文章を出してよい時刻(ms)。ui.holdLogs で延ばし、時刻が来たら自動で再描画する（観戦者は演出を見ないので待たない）。 */
  ui.logsHeld = function (g) { return !!g && !g.isSpectator && Date.now() < (g.logHold || 0); };
  ui.holdLogs = function (g, ms) {
    if (!g || g.isSpectator) return;
    const until = Math.max(Date.now() + ms, g.logHold || 0);   // すでにもっと長い待ちがあればそちらを優先
    g.logHold = until;
    clearTimeout(ui._holdT);
    ui._holdT = setTimeout(() => { const cur = ONW.game; if (cur && Date.now() >= (cur.logHold || 0) - 30) { cur.logHold = 0; ui.render(cur); } }, until - Date.now() + 40);
  };
  ui.releaseLogs = function (g) { if (!g) return; g.logHold = 0; clearTimeout(ui._holdT); };

  ui.renderOnlineMorning = function renderOnlineMorning(game) {
    const held = ui.logsHeld(game);   // カードがめくれ終わるまで、結果の文章は出さない
    const logs = (held ? [] : game.nightLogs || []).map((t) => `<p class="night-step__hint"><strong>${esc(t)}</strong></p>`).join("");
    // 墓荒らしが交換した後の役職の能力（朝に選んで、その場で結果が分かる）
    const ar = game.morningChain, chain = ui.chainBlock(game, false);
    return `
      <section class="panel night-step">
        <h2>朝になりました</h2>
        <p class="lede">夜の結果</p>
        ${held ? `<p class="night-step__hint">…</p>` : logs || `<p class="night-step__hint">あなたに夜の情報はありません。</p>`}
        ${chain}
        <p class="night-step__hint">${ar && !game.morningChainDone && !game.settleShown ? "能力を使い終えると、昼の議論が始まります。" : "まもなく昼の議論が始まります。"}</p>
      </section>`;
  };

  /** 夜の情報はチャット欄とは別の枠に出す（高さは固定でチャットを押し下げない。開閉できる） */
  /** 「情報確認」: 夜や朝・昼に得た情報を、画面の上に重ねて表示する（下の画面は動かさない） */
  ui.infoBodyHtml = function () {
    const g = ONW.game, logs = ui.logsHeld(g) ? [] : g.nightLogs || [];   // 演出中は文章を出さない
    const role = g.myRole ? ONW.roles.getInfo(g.myRole) : null;
    // 全員に公開された情報: スターがいるときだけ誰か、パンが焼けたときだけ「パンが焼けました」を出す（いないとき・焼けていないときは何も出さない）
    const pubLines = [];
    const smkHide = !!(g.smokeOn && !g.isSpectator && !(g.hostSpec && ONW.net.isHost));   // 煙幕中（煙幕が見える人）: 基本情報(スター・人狼王・暴露・愉快犯・麻婆豆腐・パン・混沌新聞)は情報確認にも載せない。観戦者・観戦中のホストは煙幕自体が出ないので今までどおり
    if (g.smokeOn) pubLines.push(`煙幕通知: ${(ONW.smoke && ONW.smoke.TEXT) || "煙幕の狂人に煙幕を投げられたため、変化公開以外の昼の通知や演出が見えなくなりました。"}`);   // 煙幕の狂人: 隠された通知は、ここ(情報確認)で確認できる
    if (!smkHide) {
    if ((g.starNames || []).length) pubLines.push(`スター: ${(g.starNames || []).map((n) => `<strong>${esc(n)}</strong>`).join("、")}`);
    if ((g.kingNames || []).length) pubLines.push(`人狼王: ${(g.kingNames || []).map((n) => `<strong>${esc(n)}</strong>`).join("、")}`);
    (g.exposeRows || []).forEach((r) => pubLines.push(`暴露通知: 暴露された人の最終役職は <strong>${esc(r.role)}</strong>${r.extras && r.extras.length ? `（${r.extras.map(esc).join("・")}）` : ""} です`));   // 暴露狂人: 誰かは載らない
    if (g.pranksterDone) pubLines.push("愉快な笑い声が聞こえました。");   // 愉快犯: 暴露のあと・麻婆豆腐の前
    if (g.mapoDone) pubLines.push("麻婆豆腐が完成しました");
    if (g.hiyayakkoDone) pubLines.push("冷奴が完成しました");
    if (g.breadN > 0) pubLines.push(g.breadN > 1 ? `パンが${g.breadN}個焼けました` : "パンが焼けました");
    }
    (g.deathNotes || []).forEach((t) => pubLines.push(esc(t)));   // 昼中の死亡の知らせ（呪殺・後追い・心中・王国滅亡・撃たれた）。チャットには出さない。妖狐か狐憑きか・執行か誤爆かは載せない
    const pub = pubLines.length ? `<hr class="info-sep"><div class="info-h">公開された情報</div>${pubLines.map((t) => `<p class="night-step__hint info-log">${t}</p>`).join("")}` : "";
    // 新聞配達員の新聞: 変化公開のあとに出た紙を、いつでも見返せる（動きがなかったときもそのまま載る）
    const news = !smkHide && Array.isArray(g.newsLines)
      ? `<div class="info-news"><div class="info-news__title">混沌新聞</div>${g.newsLines.length ? `<p class="info-news__head">昨夜、動きのあった役職</p>${g.newsLines.map((t) => `<p class="info-news__item">${esc(t)}</p>`).join("")}` : `<p class="info-news__head">昨夜、目立った能力行使はなかったようです。</p>`}</div>`
      : "";
    return `${role ? `<div class="info-rolebox"><p class="night-step__hint">配られた役職: <span class="rs-chip rs-chip--${role.team || "third"}">${esc(role.name)}</span>${g.myRole === "drunk" ? (g.soberRole ? `（酔いが覚めたあとの役職: <strong>${esc(ONW.roles.getInfo(g.soberRole).name)}</strong>）` : "（酔いが覚めるまで自分の役職は分かりません）") : ""}</p></div>` : ""}
        <div class="info-h">得た情報</div>
        ${logs.length ? logs.map((t) => `<p class="night-step__hint info-log">${esc(t)}</p>`).join("") : `<p class="night-step__hint">まだ得た情報はありません。</p>`}
        ${pub}
        ${news ? `<hr class="info-sep">${news}` : ""}`;
  };
  /** 情報確認を開いたまま内容が増えたとき（死亡の知らせなど）、枠はそのままで中身だけ入れ替える */
  ui.refreshInfo = function () {
    const b = document.getElementById("info-body");
    if (b) b.innerHTML = ui.infoBodyHtml();
  };
  /** 部屋コードのコピー: ロビーの部屋コードは「＊＊＊＊」と伏せ字にして、その右の「コピー」ボタンだけでクリップボードに入れる（配信などで見えないように）。
   *  押したボタンの文字が一瞬「コピーしました」に変わる（再描画で戻っても問題なし）。navigator.clipboard が使えないときは execCommand("copy") で試す */
  ui.copyRoomCode = function (btn) {
    const code = String((ONW.net && ONW.net.code) || ""), label = "コピー";
    const done = (ok) => {
      if (!btn) return;
      btn.textContent = ok ? "コピーしました" : "コピーできませんでした";
      clearTimeout(btn._rcT); btn._rcT = setTimeout(() => { if (btn.isConnected) btn.textContent = label; }, 1800);
    };
    if (!code) return done(false);
    const legacy = () => {
      try {
        const ta = document.createElement("textarea");
        ta.value = code; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;";
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, code.length);
        const ok = document.execCommand && document.execCommand("copy");
        ta.remove(); return !!ok;
      } catch (e) { return false; }
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(() => done(true), () => done(legacy()));
      else done(legacy());
    } catch (e) { done(legacy()); }
  };
  ui.openInfo = function () {
    if (document.getElementById("info-overlay")) return;
    if (ONW.roleBook) ONW.roleBook.close();   // 役職確認(📖)と情報確認は、同じ場所に出るので同時には開かない（スマホで重ならないように）
    const wrap = document.createElement("div");
    wrap.id = "info-overlay";
    wrap.className = "info-overlay";
    wrap.onclick = (e) => { if (e.target === wrap) ui.closeInfo(); };
    wrap.innerHTML = `<div class="info-card">
      <div class="info-head"><span>情報確認</span><button class="btn" onclick="ONW.ui.closeInfo()">閉じる</button></div>
      <div class="info-body" id="info-body">${ui.infoBodyHtml()}</div></div>`;
    document.body.appendChild(wrap);
    document.body.classList.add("info-open");   // スマホ: 情報確認は上側に出し、下側の CO ボタンはそのまま押せる
    ui._infoLocked = ui.isPc() && !document.getElementById("chat-overlay");   // スマホは画面を固定しない（下の CO ボタン・CO パネルを操作できるように）
    if (ui._infoLocked) ui.lockPage(true);   // 開いている間、ページ本体は動かさない
  };
  ui.closeInfo = function () {
    const w = document.getElementById("info-overlay");
    if (!w) return;
    w.remove();
    document.body.classList.remove("info-open");
    if (ui._infoLocked && !document.getElementById("chat-overlay")) ui.lockPage(false);
    ui._infoLocked = false;
  };

  ui.toggleNightInfo = function (btn) {
    const g = ONW.game, body = document.getElementById("night-info-body");
    g.nightInfoClosed = !g.nightInfoClosed;
    if (body) body.style.display = g.nightInfoClosed ? "none" : "";
    if (btn) btn.textContent = g.nightInfoClosed ? "▸ 夜の情報を開く" : "▾ 夜の情報を閉じる";
  };
  ui.renderOnlineDay = function renderOnlineDay(game) {
    // 酔いが覚めた人: 最終的な役職と、受け取った情報（能力があれば、ここから1回使える）
    const sober = game.soberRole && !game.isDead && !game.isSpectator ? `
        <div class="sober-box">
        ${ui.chainBlock(game, true)}</div>` : "";   // 結果・使用済み・最終的な役職の案内は出さない（情報確認に載る）。能力を選んでいる間の操作欄だけ出す
    return `
      <section class="panel">
        <h2>議論タイム</h2>
        <p class="lede">${game.isDead ? "あなたは死亡しました。発言は霊界チャットになり、死亡者と観戦者にだけ届きます。" : "誰が人狼か話し合いましょう。"}</p>
        ${sober}
        ${ui.dictBlock(game)}
        ${ui.exchBlock(game)}
        ${ui.libraBlock(game)}
        ${ui.predBlock(game)}
        ${ui.sheriffBlock(game)}
        ${ui.thiefBlock(game)}
        ${ui.fairyBlock(game)}
        ${ui.ratBlock(game)}
        ${ui.yomiBlock(game)}
        ${ui.icarusBlock(game)}
        ${ui.goranshinBlock(game)}
        ${ui.sheepBlock(game)}
        ${ui.mediumBlock(game)}
        ${ui.counselBlock(game)}
        ${ui.renBlock(game)}
        ${ui.psyBlock(game)}
        ${ui.hokmaBlock(game)}
        ${ui.agentBlock(game)}
        ${ui.wagererBlock(game)}
        ${ui.rejobBlock(game)}
        ${ui.mindBlock(game)}
        ${game.abilityMsg ? `<p class="night-step__hint"><strong>${esc(game.abilityMsg)}</strong></p>` : ""}
        ${(ui.logsHeld(game) ? [] : game.dayLines || []).map((t) => `<p class="night-step__hint"><strong>${esc(t)}</strong></p>`).join("")}
        ${ui.chatTabs(game)}
        <div id="chat-log" class="chat-log" onclick="ONW.ui.openChat()"></div>
        ${game.isDead ? ui.ghostInput(game) : `${ui.tpToggle(game)}<div class="chat-input">
          <input id="chat-in" class="onw-input" maxlength="100" ${game.muzzled && !game.tpMode ? `disabled placeholder="🤐 あなたは口封じされています"` : `${ui.isPc() ? "" : "readonly"} onclick="ONW.ui.openChat()"`} onkeydown="if(event.key==='Enter')ONW.co.sendChat()">
          <button class="btn" onclick="ONW.co.sendChat()"${game.muzzled && !game.tpMode ? " disabled" : ""}>送信</button>
        </div>`}
      </section>`;
  };

  /** 妖狐投票の結果（得票数と追放された人）。妖狐投票のあとの本投票の画面にも残す */
  const foxVoteBlock = (game) => {
    const v = game.foxVoteView;
    if (!v || game.foxVoteOn) return "";
    const rows = (v.counts || []).length ? v.counts.map((c) => `${esc(c.name)} ${c.n}票`).join("、") : "得票なし";
    const out = (v.executed || []).length ? `追放: <strong>${v.executed.map((e) => esc(e.name) + (e.sub ? "（従者の身代わり）" : "")).join("、")}</strong>` : "妖狐は追放されませんでした";
    return `<div class="foxvote-box"><div class="foxvote-box__t">妖狐投票の結果</div><div>得票数: ${rows}</div><div>${out}</div></div>`;
  };
  ui.renderOnlineVote = function renderOnlineVote(game) {
    const fvb = foxVoteBlock(game);
    if (game.foxVoteWait && !game.strawPick) return `<section class="panel night-step"><p class="lede">妖狐投票の結果を発表しています…</p>${fvb}</section>`;
    const log = `${fvb}${ui.chatTabs(game)}<div id="chat-log" class="chat-log" onclick="ONW.ui.openChat()"></div>${game.isDead ? ui.ghostInput(game) : ""}`;
    if (game.detWait) return `<section class="panel night-step"><p class="lede">結果を待っています…</p>${log}</section>`;   // 名探偵の推理中（全員同じ表示。誰が名探偵かは出さない）
    if (game.ghostWait) return `<section class="panel night-step"><p class="lede">結果を待っています…</p>${log}</section>`;   // 探偵の亡霊の推理中（全員同じ表示。誰が探偵の亡霊かは出さない）
    if (game.strawPick && game.strawKind === "bounty") return `<section class="panel"><h2>賞金稼ぎ</h2><p class="lede">あなたがめくれました。上のテーブルで、<strong>人狼だと思う相手のカード</strong>を押してください。自分以外の全員から選べます。</p><p class="night-step__hint">選んだ相手が人狼判定（人狼系・昇格した狂人）なら、賞金稼ぎの勝利です。選び終わるまでタイマーは止まっています。</p></section>`;
    if (game.strawPick && game.strawKind === "hunter") return `<section class="panel"><h2>ハンター</h2><p class="lede">あなたがめくれました。上のテーブルで、<strong>道連れにする相手のカード</strong>を押してください。</p><p class="night-step__hint">選び終わるまでタイマーは止まっています。</p></section>`;
    if (game.strawPick && game.strawKind === "assassin") return `<section class="panel"><h2>アサシン</h2><p class="lede">あなたがめくれました。上のテーブルで、<strong>暗殺する相手のカード</strong>を押してください。自分以外の全員から選べます。</p><p class="night-step__hint">選んだ相手がマーリンなら、人狼陣営の逆転勝利です。選び終わるまでタイマーは止まっています。</p></section>`;
    if (game.strawPick) return `<section class="panel"><h2>わら人形</h2><p class="lede">あなたがめくれました。上のテーブルで、<strong>道連れにする相手のカード</strong>を押してください。</p><p class="night-step__hint">選び終わるまでタイマーは止まっています。</p></section>`;
    if (game.strawWait) return `<section class="panel night-step"><p class="lede">結果を待っています…</p>${log}</section>`;   // 誰が選んでいるかは出さない
    if (game.dictDeclared) return `<section class="panel night-step"><p class="lede">独裁者が独裁を宣言しました。議論を打ち切って、結果を待っています…</p>${log}</section>`;
    if (game.dukeIds && !game.dukeIds.includes(ONW.net.myId())) return `<section class="panel night-step"><p class="lede">魔界公爵追放会議です。あなたは参加できません（生存者のみ）。結果を待っています…</p>${log}</section>`;
    if (game.isDead) return `<section class="panel night-step"><p class="lede">あなたは死亡しているため、投票できません。結果を待っています…</p>${log}</section>`;
    if (game.voted) return `<section class="panel night-step"><p class="lede">あなたの投票先は固定されています。結果を待っています…</p>${log}</section>`;
    const sel = (game.others || []).find((p) => p.id === game.voteSel);
    return `
      <section class="panel">
        <h2>${game.dukeIds ? "魔界公爵追放会議" : game.foxVoteOn ? "妖狐投票" : "投票"}</h2>
        <p class="lede">上のテーブルで、追放したい人の<strong>カードを押して</strong>ください。もう一度押すと未投票に戻ります。タイマーが終わった時に、選んでいる人に投票されます。</p>
        ${game.dukeIds ? `<p class="night-step__hint">魔界公爵追放会議です。<strong>魔界公爵だと思う人</strong>のカードを押してください（生存者のみ・1人1票。自分にも投票できます。投票しなくてもかまいません）。最多得票の人が魔界公爵なら処刑され、そうでなければ魔界公爵の勝利です。</p>` : ""}${game.foxVoteOn ? `<p class="night-step__hint">妖狐投票です。最多得票の人（同数最多も）が<strong>妖狐か狐憑き</strong>のときだけ追放されます（そうでなければ誰も追放されず、票数だけ発表されます）。このあとに通常の投票があります。</p>` : ""}
        <p class="night-step__hint vote-now">${sel ? `現在の投票先: <strong>${esc(nmv(sel.id, sel.name))}</strong>` : "現在: 未投票"}</p>
        ${log}
      </section>`;
  };

  // ---- 最終結果（マイクラ版の並び）----
  /** 最終結果の「チャットを見る」: 画面の上に重ねて表示（position:fixed なので結果画面はずれない）。保存ボタンはここを開いている間だけ出る */
  ui.closeResultChat = function () { const w = document.getElementById("rchat-overlay"); if (w) w.remove(); };
  /** 最終結果の「情報確認を見る」: CPUを含む全員ぶんの情報確認を、画面の上に重ねて表示する（結果画面はずれない） */
  ui.closeResultInfo = function () { const w = document.getElementById("rinfo-overlay"); if (w) w.remove(); };
  ui.resultInfoHtml = function (res) {
    const L = (t) => `<p class="night-step__hint">${t}</p>`;
    const tint = (t) => ONW.utils.tintHtml(esc(t), res);   // プレイヤー名はオレンジ・役職名は陣営の色
    const roleSpan = (key) => { const r = key ? ONW.roles.getInfo(key) : null; return r ? `<strong class="t-${r.team}">${esc(r.name)}</strong>` : ""; };
    const cards = (res.info || []).map((q) => {
      const rInfo = q.role ? ONW.roles.getInfo(q.role) : null;   // 見出しの横に最終役職のチップ（陣営色）: 誰の・何の情報か一目で分かるように
      const head = `<div class="rinfo-name">${ONW.utils.nameHtml(q.name, "rs-pl")}${q.cpu ? `<span class="rinfo-cpu">CPU</span>` : ""}${rInfo ? `<span class="rs-chip rs-chip--${rInfo.team || "third"}">${esc(rInfo.name)}</span>` : ""}</div>`;
      const roleLine = q.role
        ? L(`配られた役職: ${q.from ? `${roleSpan(q.from)} → ` : ""}${roleSpan(q.role)}${q.role === "drunk" ? (q.soberRole ? `（酔いが覚めたあとの役職: ${roleSpan(q.soberRole)}）` : "（酔いが覚める前に試合が終わりました）") : ""}`)
        : L(`<span class="rs-dim">役職の記録がありません。</span>`);
      const logs = (q.logs || []).length ? q.logs.map((t) => `<p class="night-step__hint rinfo-log">${tint(t)}</p>`).join("") : L(`<span class="rs-dim">得た情報はありませんでした。</span>`);
      return `<div class="rinfo-card">${head}${roleLine}${logs}</div>`;
    }).join("");
    // 全員に公開された情報（試合中の「情報確認」の下半分と同じ内容）
    const pp = res.infoPub || {}, pub = [];
    const names = (a) => a.map((n) => `<strong class="rs-pl">${esc(n)}</strong>`).join("、");
    if (pp.smoke) pub.push(`煙幕通知: ${(ONW.smoke && ONW.smoke.TEXT) || "煙幕の狂人に煙幕を投げられたため、変化公開以外の昼の通知や演出が見えなくなりました。"}`);
    if ((pp.stars || []).length) pub.push(`スター: ${names(pp.stars)}`);
    if ((pp.kings || []).length) pub.push(`人狼王: ${names(pp.kings)}`);
    (pp.expose || []).forEach((r) => pub.push(`暴露通知: 暴露された人の最終役職は <strong>${esc(r.role)}</strong>${r.extras && r.extras.length ? `（${r.extras.map(esc).join("・")}）` : ""} です`));
    if (pp.prankster) pub.push("愉快な笑い声が聞こえました。");
    if (pp.mapo) pub.push("麻婆豆腐が完成しました");
    if (pp.hiyayakko) pub.push("冷奴が完成しました");
    if (pp.bread > 0) pub.push(pp.bread > 1 ? `パンが${pp.bread}個焼けました` : "パンが焼けました");
    (pp.deaths || []).forEach((t) => pub.push(tint(t)));
    if ((pp.duke || []).length) { pub.push("<strong>魔界公爵追放会議</strong>"); pp.duke.forEach((t) => pub.push(tint(t))); }   // 魔界公爵追放会議の結果（全員に公開）
    const pubHtml = pub.length ? `<div class="rinfo-card"><div class="rinfo-name">公開された情報</div>${pub.map((t) => `<p class="night-step__hint rinfo-log">${t}</p>`).join("")}</div>` : "";
    const news = Array.isArray(pp.news)
      ? `<div class="info-news"><div class="info-news__title">混沌新聞</div>${pp.news.length ? `<p class="info-news__head">昨夜、動きのあった役職</p>${pp.news.map((t) => `<p class="info-news__item">${esc(t)}</p>`).join("")}` : `<p class="info-news__head">昨夜、目立った能力行使はなかったようです。</p>`}</div>`
      : "";
    return `${cards}${pubHtml}${news}`;
  };
  ui.openResultInfo = function () {
    const g = ONW.game, res = g && g.result;
    if (!res || !(res.info || []).length || document.getElementById("rinfo-overlay")) return;
    const wrap = document.createElement("div");
    wrap.id = "rinfo-overlay";
    wrap.onclick = (e) => { if (e.target === wrap) ui.closeResultInfo(); };
    wrap.innerHTML = `<div class="rinfo-box" role="dialog" aria-modal="true">
      <div class="rchat-head"><span>情報確認（全員）</span><span class="rchat-btns"><button class="btn" onclick="ONW.png.saveInfo(ONW.game.result)">PNGで保存</button><button class="btn" onclick="ONW.ui.closeResultInfo()">閉じる</button></span></div>
      <div class="rinfo-body">${ui.resultInfoHtml(res)}</div></div>`;
    document.body.appendChild(wrap);
  };
  /** 議論と霊界チャットを発言の時刻順に1本へまとめる（霊界の発言には ghost: true が付く） */
  const mergedChat = (g) => {
    const a = (g.chatLog || []).map((c, n) => ({ ...c, _o: n })), b = (g.ghostLog || []).map((c, n) => ({ ...c, ghost: true, _o: n }));
    return [...a, ...b].sort((x, y) => ((x.at || 0) - (y.at || 0)) || (x.ghost ? 1 : 0) - (y.ghost ? 1 : 0) || x._o - y._o);
  };
  ui.openResultChat = function () {
    if (document.getElementById("rchat-overlay")) return;
    // 結果画面では、霊界チャットも含めて全員が読める。場所は分けず、発言順に並べる（霊界の発言は 👻 付き）
    const names = ONW.utils.playerNames();
    const lines = mergedChat(ONW.game).map((c) => c.ghost
      ? `<div class="chat-line chat-ghost"><span class="chat-ghost__tag">👻</span><strong class="rs-pl rs-me">${esc(c.name)}</strong>: ${esc(c.text)}</div>`
      : c.kind === "death" ? `<div class="chat-line chat-death">${esc(c.text)}</div>`
      : c.kind === "sys" ? `<div class="chat-line chat-sys">${esc(c.text)}</div>`
      : c.kind === "co" ? `<div class="chat-line chat-co">${ONW.utils.tintCo(c.text, names, true)}</div>`
      : `<div class="chat-line"><strong class="rs-pl rs-me">${esc(c.name)}</strong>: ${esc(c.text)}</div>`).join("");
    const wrap = document.createElement("div");
    wrap.id = "rchat-overlay";
    wrap.innerHTML = `<div class="rchat-box" role="dialog" aria-modal="true">
      <div class="rchat-head"><span>試合のチャット</span><span class="rchat-btns"><button class="btn" onclick="ONW.ui.saveResultChat()">PNGで保存</button><button class="btn" onclick="ONW.ui.closeResultChat()">閉じる</button></span></div>
      <div class="chat-log result-chat rchat-log">${lines || '<div class="chat-line chat-empty">まだ発言はありません。</div>'}</div></div>`;
    document.body.appendChild(wrap);
    const log = wrap.querySelector(".rchat-log"); if (log) log.scrollTop = log.scrollHeight;
  };
  /** チャット履歴をPNG画像で保存する（以前はtxt）。色は画面のチャットと同じ */
  ui.saveResultChat = function () {
    const g = ONW.game;
    ONW.png.saveChat(mergedChat(g), g.result);
  };
  /** ルームに戻ったあとでも、最後の試合の最終結果を見直せる（ロビーの「前回の結果を見る」）。ロビーにいる間だけ有効 */
  ui.hasLastResult = (game) => !!(game && game.result && game.result.history);
  ui.isResultReview = (game) => !!(game && game.phase === ONW.PHASE.LOBBY && game.viewResult && ui.hasLastResult(game));
  ui.openResultReview = function () { const g = ONW.game; if (!ui.hasLastResult(g)) return; g.viewResult = true; window.scrollTo(0, 0); ui.render(g); };
  ui.closeResultReview = function () { const g = ONW.game; g.viewResult = false; ui.closeResultChat(); ui.closeResultInfo(); ui.render(g); };
  ui.renderResultReview = function renderResultReview(game) { return ui.renderOnlineResult(game, true); };
  /** 最終結果のシート（投票結果・勝敗・役職履歴・夜行動結果・昼行動結果・役職情報）。opts.preview: デバッグの「結果確認」用（投票結果・「〇〇勝利」〜勝者/敗者・チャットの欄は出さない） */
  ui.resultSheetHtml = function resultSheetHtml(game, res, opts) {
    opts = opts || {};
    const L = (h) => `<div class="rs-line">${h}</div>`;
    const LH = (h) => `<div class="rs-line rs-hist">${h}</div>`;   // 役職履歴・墓地: 同じ人の行は途中で改行しない（はみ出すときは行ごと横にスクロール）
    const H = (t) => `<div class="rs-head">${t}</div>`;
    const sep = `<hr class="rs-sep">`;
    const seg = (s) => `<span class="t-${s.team}">${esc(s.name)}</span>${s.sfx ? `<span class="t-wolf">${esc(s.sfx)}</span>` : ""}${(s.tags || []).map((t) => `<span class="rs-tag-${t.k}">${esc(t.t)}</span>`).join("")}`;
    const chain = (segs) => segs.map(seg).join(' <span class="rs-dim">→</span> ');
    const winTeam = res.abandoned ? "none" : res.title.startsWith("村人") ? "village" : res.title.startsWith("人狼") ? "wolf" : "third";
    const none = (t) => L(`<span class="rs-dim">${t}</span>`);
    const chainRows = ONW.chainRows(res);
    const chainSec = chainRows.length ? `${sep}${H("道連れ・後追い")}${chainRows.map((r) => r.k === "sub" ? L(`<span class="rs-info">${r.major ? "少佐" : "従者"}:</span> ${esc(r.name)} が ${esc(r.master)} の身代わりになりました。`) : r.k === "msub" ? L(`<span class="rs-info">娘ちゃん:</span> ${esc(r.name)} が ${esc(r.master)} の身代わりになりました。`) : r.k === "chainSub" ? L(`<span class="rs-info">従者:</span> ${esc(r.name)} が ${esc(r.master)} の道連れの身代わりになりました。`) : L(`${r.by ? `${esc(r.by)} <span class="rs-dim">→</span> ` : ""}${esc(r.name)} <span class="rs-dead">${r.label}</span>`)).join("")}` : "";
    return `
      <section class="panel result-sheet">
        ${opts.preview ? "" : `${res.foxVote ? `${H("妖狐投票結果")}
        ${res.foxVote.votes.map((v) => L(`${esc(v.from)} <span class="rs-dim">→</span> ${v.x ? `<span class="rs-dead">投票無効</span>` : v.to ? `<span class="rs-vote">${esc(v.to)}</span><span class="${v.w === 0 ? "rs-dead" : "rs-dim"}">${ONW.vote.wLabel(v.w)}</span>` : `<span class="rs-dim">未投票</span>`}`)).join("")}
        ${sep}${H("妖狐投票 得票数")}
        ${res.foxVote.counts.length ? res.foxVote.counts.map((c) => L(`${esc(c.name)} <span class="rs-dim">:</span> <span class="rs-vote">${c.c}票</span>`)).join("") : none("得票はありません。")}
        ${L(res.foxVote.executed.length ? `<span class="rs-dead">妖狐投票で追放:</span> ${res.foxVote.executed.map((e) => esc(e.name) + (e.sub ? '<span class="rs-dim">(従者の身代わり)</span>' : "")).join("、")}` : `<span class="rs-dim">妖狐投票では妖狐は追放されませんでした。</span>`)}
        ${sep}` : ""}
        ${res.dictator ? `${H(res.dictator.coup ? "クーデター" : "独裁処刑")}
        ${L(`${esc(res.dictator.by)} <span class="rs-dim">→</span> <span class="rs-vote">${esc(res.dictator.chosen || res.dictator.target)}</span> <span class="rs-dim">（議論を打ち切り、投票は行いませんでした）</span>`)}${res.dictator.coup ? L(`<span class="rs-dim">反逆の狂人</span> ${(res.dictator.rebels || []).map(esc).join("、")} <span class="rs-dim">がいたため独裁が反転し、</span><span class="rs-vote">${esc(res.dictator.by)}</span> <span class="rs-dim">が処刑されました</span>`) : ""}` : `${H("投票結果")}
        ${res.votes.map((v) => L(`${esc(v.from)} <span class="rs-dim">→</span> ${v.x ? `<span class="rs-dead">投票無効</span>` : v.to ? `${v.sw ? `<span class="rs-dim">${esc(v.to)}${ONW.vote.wLabel(v.w)}</span> <span class="rs-info" title="交換者で票が移動">⇒</span> ` : ""}<span class="rs-vote">${esc(v.sw || v.to)}</span><span class="${v.w === 0 ? "rs-dead" : "rs-dim"}">${ONW.vote.wLabel(v.w)}</span>` : `<span class="rs-dim">未投票</span>`}`)).join("")}
        ${sep}${H("得票数")}
        ${res.counts.length ? res.counts.map((c) => L(`${esc(c.name)} <span class="rs-dim">:</span> <span class="rs-vote">${c.c}票</span>`)).join("") : none("得票はありません。")}`}`}
        ${/* 【道連れ・後追い】投票結果のすぐ下（本家と同じ）。従者の身代わり・道連れ・心中・後追いなど、連鎖で起きたことを順に並べる。何も無ければ欄ごと出さない */ ""}
        ${chainSec}
        ${res.duke ? `${sep}${H("魔界公爵追放会議")}${ONW.demonDuke.lines(res.duke).map((t) => L(ONW.utils.tintHtml(esc(t), res))).join("")}` : ""}
        ${opts.preview ? "" : sep}
        ${opts.preview ? "" : `<div class="rs-win t-${winTeam}">${esc(res.title)}</div>
        ${res.abandoned ? none("ホストが廃村にしました。勝者も敗者もいません。") : `${L(`<span class="rs-info">勝利陣営:</span> ${esc(res.teams.join("＆") || "なし")}`)}
        ${L(`<span class="rs-good">勝者:</span> ${res.winners.map((n) => ((res.extraWin || []).some((x) => x.name === n) ? `<span class="rs-extra-name">${esc(n)}</span>` : `<span class="rs-wname">${esc(n)}</span>`)).join("、") || "なし"}`)}
        ${L(`<span class="rs-dead">敗者:</span> ${res.losers.map((n) => `<span class="rs-lname">${esc(n)}</span>`).join("、") || "なし"}`)}`}`}
        ${sep}${H("役職履歴")}
        <div class="rs-hist-box">${res.history.map((h) => LH(`${esc(h.name)} ${chain(h.segs)} ${h.statusParts ? `<span class="rs-dead">${esc(h.statusParts.death)}</span> <span class="rs-dim">→</span> <span class="rs-alive">${esc(h.statusParts.revive)}</span>${h.statusParts.tail ? `<span class="rs-dead">${esc(h.statusParts.tail)}</span>` : ""}` : `<span class="${h.dead || h.day ? "rs-dead" : "rs-alive"}">${h.status}</span>`}`)).join("")}</div>
        ${sep}
        <div class="rs-hist-box">${res.grave.map((c) => LH(`<span class="rs-gv">${c.label}</span> ${chain(c.segs)}`)).join("")}</div>
        ${res.missing && res.missing.length ? L(`<span class="rs-dim">欠け:</span> ${res.missing.map((m) => `<span class="t-${m.team}">${esc(m.name)}</span>`).join("、")}`) : none("欠け: なし")}
        ${sep}${H("夜行動結果")}
        ${res.nightLogs.length ? `<div class="rs-logbox">${ONW.utils.tintHtml(res.nightLogs.map((t) => L(esc(t))).join(""), res)}</div>` : none("夜行動ログはありません。")}
        ${/* 【昼行動結果】夜行動結果の下。昼能力（独裁者など）の結果はここに1行ずつ並べる */ ""}
        ${ONW.utils.tintHtml(res.dictator || (res.dayLogs || []).length ? `${sep}${H("昼行動結果")}<div class="rs-logbox">${res.dictator ? L(res.dictator.coup ? `独裁者 ${esc(res.dictator.by)} は ${esc(res.dictator.chosen || res.dictator.target)} を独裁処刑対象にしましたが、反逆の狂人 ${(res.dictator.rebels || []).map(esc).join("、")} のクーデターで、${esc(res.dictator.by)} が処刑されました。` : `独裁者 ${esc(res.dictator.by)} は ${esc(res.dictator.target)} を独裁処刑対象にしていました。`) : ""}${(res.dayLogs || []).map((t) => L(esc(t))).join("")}</div>` : "", res)}
        ${/* 【昇格情報】昼行動結果と役職情報の間。今後「姫君 → 女王」などの昇格を足すときも、ここ（昇格情報）に1行ずつ並べる */ ""}
        ${res.promoted.length ? `${sep}${H("昇格情報")}${L(`<span class="rs-dim">[狂人昇格] 今回は</span> ${res.promoted.map((n) => ONW.utils.nameHtml(n)).join("、")} <span class="rs-dim">が人狼判定になっていました。</span>`)}` : ""}
        ${/* 【役職情報】夜行動結果・昼行動結果・昇格情報の下。結果で分かる役職の情報（賞金稼ぎ・処刑人・従者・口封じの狂人）を1つの欄にまとめて1行ずつ並べる（本家は役職ごとに分かれているが、Web版は一括）。1行も無い試合は欄ごと出さない。役職を足すときもここへ */ ""}
        ${(() => {
          const groups = [   // 役職ごとの組（同じ役職で別の人の行は同じ組。組と組のあいだに薄い区切りを入れる）
            [...(res.bounty || []).map((x) => L(`<span class="rs-info">賞金稼ぎ:</span> ${esc(x.by)} は ${esc(x.target)} を人狼判定の人として選びました。${x.hit ? "人狼判定だったので成功です。" : "人狼判定ではなかったので失敗です。"}`))],
            [...(res.execs || []).map((x) => L(`<span class="rs-info">処刑人:</span> ${esc(x.exec)} のターゲットは ${esc(x.target)} でした。${x.win ? (x.late ? "ターゲットの賞金稼ぎが追放され、人狼判定を外したので処刑人の勝利です。" : "ターゲットが追放（処刑）されたので処刑人の勝利です。") : x.dead ? "ターゲットが追放以外で死亡したので処刑人は敗北です。" : "ターゲットは追放されませんでした。"}`))],
            [...((res.foxVote && res.foxVote.slides) || []).map((x) => L(`<span class="rs-info">ペンギン（妖狐投票）:</span> ${esc(x.by)} に投票した ${(x.voters || []).map(esc).join("・")} の${x.w}票は、${esc(x.to)} へ滑りました。`)),   // 妖狐投票でも票は滑る
            ...(res.slides || []).map((x) => L(`<span class="rs-info">ペンギン:</span> ${esc(x.by)} に投票した ${(x.voters || []).map(esc).join("・")} の${x.w}票は、${esc(x.to)} へ滑りました。`))],   // ペンギンは昼能力ではないので、昼行動結果ではなく役職情報に出す（滑らせた順。処理の順番はペンギン → 交換者 → 番犬）
            [...(res.watchdogs || []).map((x) => x.role === "dog_madman"
              ? L(`<span class="rs-info">犬の狂人:</span> ${esc(x.by)} の飼い主は ${esc(x.owner)} です。${x.bite ? `${esc(x.by)} が ${esc(x.owner)} を${x.simul ? "同時に" : ""}噛み殺しました。` : x.hang ? `${esc(x.owner)} は守られました。` : ""}${x.back ? `ネコカボチャに噛み返されました。` : ""}`)
              : L(`<span class="rs-info">番犬:</span> ${esc(x.by)} の飼い主は ${esc(x.owner)} です。${x.bite ? `${esc(x.by)} が ${esc(x.owner)} を${x.simul ? "同時に" : ""}噛み殺しました。` : x.votes ? `${esc(x.owner)} への ${x.votes}票は無効でした。` : ""}${x.back ? `ネコカボチャに噛み返されました。` : ""}`))],
            [...(res.sheriffs || []).filter((x) => x.info).map((x) => L(`<span class="rs-info">保安官:</span> ${esc(x.by)} が ${esc(x.target)} を撃った結果: ${esc(x.info)}`))],
            [...(res.vanities || []).filter((x) => x.info).map((x) => L(`<span class="rs-info">ヴァニティ:</span> ${esc(x.by)} が ${esc(x.target)} を撃った結果: ${esc(x.info)}`))],
            [...(res.beggars || []).filter((x) => x.info).map((x) => L(`<span class="rs-info">乞食:</span> ${esc(x.info)}`))],
            [...(res.curseKills || []).map((x) => L(`<span class="rs-info">呪術の人狼:</span> ${esc(x.by)} は ${esc(x.target)} を呪殺しました。`))],
            [...(res.poisonKills || []).map((x) => L(`<span class="rs-info">蛇の狂人:</span> ${esc(x.by)} は ${esc(x.target)} を毒殺しました。`))],
            [...(res.knightInfo || []).map((x) => L(`<span class="rs-info">${x.tb ? "存護" : "騎士"}:</span> ${esc(x.text)}`))],
            [...(res.prankster ? [L(`<span class="rs-info">愉快犯:</span> ${esc(res.prankster.name)} が適用されました。対象は ${esc(res.prankster.target)} です。`), L(`<span class="rs-info">[条件]</span> ${esc(res.prankster.label)}（${res.prankster.success ? "成立" : "不成立"}）`)] : []),
      ...((res.bomber && res.bomber.bombers) || []).map((x) => L(`<span class="rs-info">道化の爆弾魔:</span> ${esc(x.name)} が吊られて自爆しました。${x.names.length ? `${(x.loseNames || x.names).length ? `${(x.loseNames || x.names).map(esc).join("、")} が爆発して敗北しました。` : ""}${(x.keepNames || []).length ? `殉職者 ${x.keepNames.map(esc).join("、")} は爆発しても勝利条件を失いません。` : ""}` : "爆発する人はいませんでした。"}`))],
            [...(res.lawyers || []).map((p) => L(`<span class="rs-info">弁護士:</span> ${esc(p[0])} は ${esc(p[1])} を弁護していました。`)), ...(res.servants || []).map((p) => L(`<span class="rs-info">従者:</span> ${esc(p[0])} のご主人は ${esc(p[1])} です。`)), ...(res.matthiasPairs || []).map((p) => L(`<span class="rs-info">マティアス:</span> ${esc(p[0])} は ${esc(p[1])} を娘ちゃんにしていました。`)), ...(res.cheseds || []).map((p) => L(`<span class="rs-info">ケセド:</span> ${esc(p.by)} は ${esc(p.target)} を占い（${esc(p.result)}）、結果とコーヒーを ${esc(p.recipient)} に渡していました。`)), ...(res.agents || []).map((p) => L(`<span class="rs-info">代行者:</span> ${esc(p.text)}`)), ...(res.elfrindes || []).map((p) => L(`<span class="rs-info">エルフリンデ:</span> ${esc(p.text)}`)), ...(res.mercenaries || []).map((p) => L(`<span class="rs-info">傭兵:</span> ${esc(p.text)}`)), ...(res.bartenders || []).map((p) => L(`<span class="rs-info">バーテンダー:</span> ${esc(p.text)}`)), ...(res.threadSpinners || []).map((p) => L(`<span class="rs-info">糸紡ぎ:</span> ${esc(p.text)}`)), ...(res.ratMadmen || []).map((p) => L(`<span class="rs-info">鼠の狂人:</span> ${esc(p)}`)), ...(res.sheepMadmen || []).map((p) => L(`<span class="rs-info">羊の狂人:</span> ${esc(p)}`)), ...(res.boarMadmen || []).map((p) => L(`<span class="rs-info">猪の狂人:</span> ${esc(p)}`)), ...(res.lookouts || []).map((p) => L(`<span class="rs-info">見張り番:</span> ${esc(p)}`)), ...(res.hunters || []).map((p) => L(`<span class="rs-info">ハンター:</span> ${esc(p)}`)), ...(res.jesterGhosts || []).map((p) => L(`<span class="rs-info">道化の怨霊:</span> ${esc(p)}`)), ...(res.telepathists || []).map((p) => L(`<span class="rs-info">テレパシスト:</span> ${esc(p)}`)), ...(res.copylists || []).map((p) => L(`<span class="rs-info">コピリスト:</span> ${esc(p)}`)), ...(res.detectiveGhosts || []).map((p) => L(`<span class="rs-info">探偵の亡霊:</span> ${esc(p)}`)), ...(res.necromancers || []).map((p) => L(`<span class="rs-info">ネクロマンサー:</span> ${esc(p)}`)), ...(res.counselors || []).map((p) => L(`<span class="rs-info">カウンセラー:</span> ${esc(p)}`)), ...(res.psychologists || []).map((p) => L(`<span class="rs-info">心理士:</span> ${esc(p)}`)),
      ...(res.rens || []).map((p) => L(`<span class="rs-info">レン:</span> ${esc(p)}`)), ...(res.traps || []).map((p) => L(`<span class="rs-info">罠師:</span> ${esc(p)}`)), ...(res.patches || []).map((p) => L(`<span class="rs-info">パッチ:</span> ${esc(p)}`)), ...(res.agitators || []).map((p) => L(`<span class="rs-info">煽動者:</span> ${esc(p)}`)), ...(res.multiPersonas || []).map((p) => L(`<span class="rs-info">多重人格:</span> ${esc(p)}`)), ...(res.oddOnes || []).map((p) => L(`<span class="rs-info">奇数人:</span> ${esc(p)}`)), ...(res.evenOnes || []).map((p) => L(`<span class="rs-info">偶数人:</span> ${esc(p)}`)), ...(res.bellMikos || []).map((p) => L(`<span class="rs-info">鈴の巫女:</span> ${esc(p)}`)), ...(res.donuts || []).map((p) => L(`<span class="rs-info">ドーナツ屋:</span> ${esc(p)}`)), ...(res.hayatochiris || []).map((p) => L(`<span class="rs-info">早とちり:</span> ${esc(p)}`)), ...(res.screwGums || []).map((p) => L(`<span class="rs-info">スクリューガム:</span> ${esc(p)}`)), ...(res.rabbitMadmen || []).map((p) => L(`<span class="rs-info">兎の狂人:</span> ${esc(p.text)}`)), ...(res.dragonMadmen || []).map((p) => L(`<span class="rs-info">龍の狂人:</span> ${esc(p.text)}`)), ...(res.wagerers || []).map((p) => L(`<span class="rs-info">勝負師:</span> ${esc(p)}`)), ...(res.monkeyMadmen || []).map((p) => L(`<span class="rs-info">猿の狂人:</span> ${esc(p)}`)), ...(res.magicians || []).filter((x) => x.info).map((x) => L(`<span class="rs-info">魔法使い:</span> ${esc(x.info)}`)), ...(res.clones || []).map((p) => L(`<span class="rs-info">クローン:</span> ${esc(p.by)} は ${p.grave ? "墓地から引いたあと " : ""}${esc(p.role)} を思い込んでいました。`)), ...(res.nanokaLong || []).map((p) => L(`<span class="rs-info">長夜月:</span> ${esc(p.by)} は ${esc(p.target)} に長夜をつけていました。`)), ...(res.nanokaLove || []).map((p) => L(`<span class="rs-info">羅刹:</span> ${esc(p.by)} の愛する人は ${esc(p.target)} でした。`))],
            [...(res.muzzles || []).map((x) => L(`<span class="rs-info">口封じの狂人:</span> ${esc(x.by)} は ${esc(x.target)} を口封じしました。`)), ...(res.hacks || []).map((x) => L(`<span class="rs-info">銀狼:</span> ${esc(x.by)} は ${esc(x.target)} をハッキングしていました。${x.fake ? `（${esc(x.target)} は ${esc(x.fake)} と思い込んでいました${x.cut ? "が、黄泉に断ち切られました" : ""}）` : ""}`))],
            [...(res.mimics || []).map((x) => L(`<span class="rs-info">模倣の人狼:</span> ${esc(x.by)} は ${x.grave ? "墓地から引いたあと " : ""}${esc(x.role)} の能力を模倣していました。`)), ...(res.trails || []).map((x) => L(`<span class="rs-info">開拓者:</span> ${esc(x.by)} は ${esc(x.name)}の運命を歩んでいました。`))],   // 何を模倣したかは夜行動結果ではなく役職情報
            ...((res.detective && res.detective.boards) || []).map((b) => {   // 名探偵情報（マイクラ版 buildDetectiveResultLines と同じ。名探偵ごとに1組）
              const nmOf = (id) => ((res.detective.seats || []).find((q) => q.id === id) || {}).name || "?", rn = (r) => (ONW.roles.getInfo(r) || {}).name || r;
              return [L(`<span class="rs-info">名探偵:</span> ${esc(b.name)} は初期役職について`), ...b.cells.filter(Boolean).map((c) => L(`${esc(nmOf(c.id))} を ${esc(rn(c.guess))}`)), L(`と推測し、${b.success ? "成功" : "失敗"}していました。`)];
            }),
            ...((res.watcher || []).length ? [(res.watcher || []).flatMap((x) => [...(x.touched.length ? [L(`<span class="rs-info">静観者:</span> ${esc(x.name)} は ${x.touched.map(esc).join("、")} に能力を使われていました。`)] : []), ...(x.voted.length ? [L(`<span class="rs-info">静観者:</span> ${esc(x.name)} は ${x.voted.map(esc).join("、")} に投票を入れられていました。`)] : [])])] : []),   // 静観者情報（マイクラ版の静観者情報と同じ。静観者全員で1組。js/roles/neutral/watcher.js の view）
            ...((res.predictor || []).map((x) => [L(`<span class="rs-info">予想屋:</span> ${esc(x.name)} は${esc(x.text)}と予想していました。`)])),   // 予想屋情報（マイクラ版の予想屋情報と同じ。予想屋ごとに1組。js/roles/neutral/predictor.js の view）
          ];
          // 役職ごとに枠で囲み、先頭に役職名のチップ（陣営色）を付ける: どの役職の情報か一目で分かるように（行の中身・文言は今までどおり）。
          // 大きな組（弁護士〜羅刹など複数役職が1つの配列に入っているもの）は、行のラベルが変わるたびに小組へ分ける。ラベルの無い行（名探偵の続きなど）と役職名でないラベル（[条件]）は前の小組に続ける
          const teamOfName = {}; Object.keys(ONW.ROLE_INFO || {}).forEach((id) => { const inf = ONW.ROLE_INFO[id]; if (inf && inf.name && !teamOfName[inf.name]) teamOfName[inf.name] = inf.team; });
          const teamOfLab = (lab) => teamOfName[lab] || teamOfName[lab.replace(/（[^）]*）$/, "")];   // 「ペンギン（妖狐投票）」のような注記つきは注記を外して引く
          const splitRuns = (lines) => {
            const runs = []; let curLab = null;
            lines.forEach((ln) => {
              const m = ln.match(/<span class="rs-info">([^<]+):<\/span>/);
              const lab = m ? m[1] : "";
              if (!runs.length || (lab && teamOfLab(lab) && lab !== curLab)) { runs.push([ln]); curLab = lab || curLab; }
              else runs[runs.length - 1].push(ln);
            });
            return runs;
          };
          const groupHtml = (lines) => {
            const m = lines[0].match(/<span class="rs-info">([^<]+):<\/span>/);
            const lab = m ? m[1] : "";
            const team = teamOfLab(lab);
            const chip = lab ? `<div class="rs-group__head"><span class="rs-chip${team ? ` rs-chip--${team}` : ""}">${esc(lab)}</span></div>` : "";
            return `<div class="rs-group">${chip}${lines.join("")}</div>`;
          };
          const gs = groups.filter((x) => x.length).flatMap(splitRuns);
          return gs.length ? `${sep}${H("役職情報")}${ONW.utils.tintHtml(gs.map(groupHtml).join(""), res)}` : "";
        })()}
        ${/* 【シナジー情報】デバッグモードのときだけ。役職情報の下（役職情報が無い試合は、その上の欄＝昇格情報・昼行動結果…の下）。どの役職のシナジーで何が出たか / 出るはずなのに出せなかったものも載せる */ ""}
        ${(() => {
          if (!game.debugOn || !res.synergy || !res.synergy.length) return "";
          // 役職名（トリガー）→ 必要な役職を ✔(出ている) / ✘(出せなかった) で1行に。シナジーで足した役職は色つき、元から出ていたものは薄く
          const mark = (name, ok, added) => `<span class="${ok ? (added ? "rs-info" : "") : "rs-dead"}" style="margin-right:.9em;display:inline-block">${esc(name)}${ok ? "✔" : "✘"}</span>`;   // 区切りは余白（&nbsp; は tintHtml で文字に戻ってしまう）
          const blocks = res.synergy.map((r) => {
            const head = `<div class="rs-line" style="margin-top:.7em"><b>${esc(r.trigger)}</b></div>`;
            if (r.count) {
              const c = r.count, few = c.n <= 6, lab = c.label || c.anyOf.slice(0, 6).join("・");
              const what = `${lab}${few ? "のいずれか" : `${c.n}のうち`}`;
              const cond = c.min && c.max ? (c.min === c.max ? `${c.min}つ` : `${c.min}〜${c.max}`) : c.min ? (few && c.min === 1 ? "1つ" : `${c.min}以上`) : `${c.max}以下`;
              const addedRoles = (c.adds || []).map((x) => x.role);
              const rem = addedRoles.slice();
              const found = c.found.map((n) => { const i = rem.indexOf(n); if (i >= 0) rem.splice(i, 1); return mark(n, true, i >= 0); });
              const lack = c.state === "fail" ? ` <span class="rs-dead">✘ あと${c.min - c.have}</span>` : "";
              // 2026-11-07: 「＋〇〇」の行は、上の色つきの「〇〇✔」と同じ情報なので出さない（足した役職は ✔ の色で分かる）
              const capLines = (c.caps || []).map((x) => L(`<span class="rs-dead">－${esc(x.from)}</span>`)).join("");
              const none = !(c.adds || []).length && !(c.caps || []).length && c.state !== "fail" ? L(`<span class="rs-dim">（足した役職なし＝元から条件を満たしていた）</span>`) : "";
              return head + L(`<span class="rs-dim">${esc(what)}${esc(cond)}</span>`) + L(`${found.join("")}${lack}`) + capLines + none;
            }
            const line = r.items.map((it) => mark(`${it.role}${it.need > 1 ? `×${it.need}` : ""}`, it.state !== "fail", it.state === "added")).join("");
            return head + L(line);
          });
          return `${sep}${H("シナジー情報")}${ONW.utils.tintHtml(blocks.join(""), res)}`;
        })()}
        ${opts.preview ? "" : `${sep}${H("試合のチャット")}
<div class="btn-row">${res.info && res.info.length ? `<button class="btn" onclick="ONW.ui.openResultInfo()">情報確認を見る</button>` : ""}<button class="btn" onclick="ONW.ui.openResultChat()">チャットを見る</button></div>`}
        ${opts.preview ? "" : (ONW.achievements ? ONW.achievements.resultSectionHtml(game) : "")}
      </section>`;
  };
  ui.renderOnlineResult = function renderOnlineResult(game, review) {
    const res = game.result;
    if (!review && game.resultStage !== "sheet" && ONW.stage && ONW.stage.hasTable(game)) {
      return `<section class="panel night-step res-intro"><div id="res-cap" class="res-cap">${game.resultCap || ""}</div>
        <div class="btn-row" style="justify-content:center;"><button class="btn" onclick="ONW.stage.skipResult()">スキップ</button></div></section>`;
    }
    return ui.resultSheetHtml(game, res) + `
      <div class="res-dock">
        <div class="btn-row">
          <button class="btn" onclick="ONW.png.save(ONW.game.result)">PNGで保存</button>
          <button class="btn" onclick="ONW.main.goToTitle()">退出</button>
          ${review ? `<button class="btn btn--primary" onclick="ONW.ui.closeResultReview()">ルームに戻る</button>`
            : `<button class="btn btn--primary" onclick="ONW.net.returnToRoom()">${game.isSpectator ? "ルームに入る" : "ルームに戻る"}</button>`}
        </div>
      </div>`;
  };

  // ---------------------------------------------------------
  // セットアップ画面（人数・役職構成）
  // ---------------------------------------------------------
  ui.renderSetup = function renderSetup(game) {
    const roleChips = ONW.sortByRoleOrder(Object.keys(ONW.ROLE_INFO)).filter((r) => r !== "drunk" && r !== "lover").map((role) => {
      const info = ONW.roles.getInfo(role);
      const countSelected = game.selectedRoles.filter((r) => r === role).length;
      return `
        <div class="role-chip ${countSelected > 0 ? "selected" : ""}" data-team="${info.team}"
             onclick="ONW.main.toggleRole('${role}')">
          <span class="role-chip__name">${info.name}${countSelected > 1 ? ` ×${countSelected}` : ""}</span>
          <span class="role-chip__team">${teamLabel(info.team)}</span>
        </div>
      `;
    }).join("");

    const needed = game.playerCount + 3;
    const have = game.selectedRoles.length;
    const balanced = needed === have;

    return `
      <section class="panel">
        <h2>参加人数</h2>
        <p class="lede">実際にプレイする人数。墓地の伏せ札3枚は自動で追加されます。</p>
        <div class="field-row">
          <label>プレイヤー人数</label>
          <div class="stepper">
            <button onclick="ONW.main.changePlayerCount(-1)">−</button>
            <span>${game.playerCount}</span>
            <button onclick="ONW.main.changePlayerCount(1)">＋</button>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>役職構成</h2>
        <p class="lede">
          クリックで役職を1枚追加、右クリック（長押し）で1枚減らせます。
          必要枚数: <strong>${needed}枚</strong>（現在 ${have}枚）
        </p>
        <div class="role-grid" oncontextmenu="ONW.main.handleRoleRightClick(event)">
          ${roleChips}
        </div>
      </section>

      <div class="btn-row">
        <button class="btn" onclick="ONW.main.goToTitle()">戻る</button>
        <button class="btn btn--primary" ${balanced ? "" : "disabled"} onclick="ONW.main.startGame()">
          配役してゲーム開始
        </button>
      </div>
    `;
  };

  // ---------------------------------------------------------
  // 配役確認画面（パス&プレイ想定：1人ずつ端末を回す）
  // ---------------------------------------------------------
  ui.renderReveal = function renderReveal(game) {
    const player = game.players[game.revealIndex ?? 0];
    if (!player) {
      return `<section class="panel"><p>配役確認が完了しました。</p>
        <div class="btn-row"><button class="btn btn--primary" onclick="ONW.main.beginNight()">夜を始める</button></div>
      </section>`;
    }
    const revealed = !!game.revealShown;
    const role = game.initialRoles[player.id];
    const info = ONW.roles.getInfo(role);

    return `
      <section class="panel night-step">
        <p class="lede">端末を <strong>${player.name}</strong> さんに渡してください。</p>
        ${revealed ? `
          <div class="night-step__role">${info.name}</div>
          <p class="night-step__hint">${info.desc}</p>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn btn--primary" onclick="ONW.main.nextReveal()">確認した（次の人へ）</button>
          </div>
        ` : `
          <div class="btn-row" style="justify-content:center;">
            <button class="btn btn--primary" onclick="ONW.main.showReveal()">自分の役職を見る</button>
          </div>
        `}
      </section>
    `;
  };

  // ---------------------------------------------------------
  // 夜フェーズ
  // ---------------------------------------------------------
  ui.renderNight = function renderNight(game) {
    const role = ONW.night.currentRole(game);

    if (!role) {
      return `
        <section class="panel night-step">
          <p class="lede">夜が明けます…</p>
          <div class="btn-row" style="justify-content:center;">
            <button class="btn btn--primary" onclick="ONW.main.beginDay()">昼を始める</button>
          </div>
        </section>
      `;
    }

    const info = ONW.roles.getInfo(role);
    const actors = ONW.night.currentActors(game);
    const names = actors.map((p) => p.name).join("、") || "（このゲームには含まれていません）";

    return `
      <section class="panel night-step">
        <p class="night-step__hint">目を閉じてください。次に起きるのは…</p>
        <div class="night-step__role">${info.name}</div>
        <p class="night-step__hint">${info.desc}</p>
        <p class="night-step__hint">対象プレイヤー: ${names}</p>
        <p class="night-step__hint" style="color:var(--gold-dim);">
          TODO: ここに ${info.name} の能力操作UIを実装する
        </p>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn btn--primary" onclick="ONW.main.advanceNight()">次の役職へ</button>
        </div>
      </section>
    `;
  };

  // ---------------------------------------------------------
  // 昼フェーズ（議論タイム）
  // ---------------------------------------------------------
  ui.renderDay = function renderDay(game) {
    return `
      <section class="panel">
        <h2>議論タイム</h2>
        <p class="lede">誰が人狼か、話し合って推理しましょう。</p>
        <div class="timer-display">${ONW.utils.formatClock(game.discussionSecondsLeft ?? 0)}</div>
        <div class="btn-row" style="justify-content:center;">
          <button class="btn btn--primary" onclick="ONW.main.goToVote()">投票に進む</button>
        </div>
      </section>
    `;
  };

  // ---------------------------------------------------------
  // 投票フェーズ
  // ---------------------------------------------------------
  ui.renderVote = function renderVote(game) {
    const targets = game.players.map((p) => `
      <div class="vote-target ${game.votes[game.activeVoterId] === p.id ? "selected" : ""}"
           onclick="ONW.main.selectVoteTarget('${p.id}')">
        ${p.name}
      </div>
    `).join("");

    const voter = ONW.utils.playerById(game, game.activeVoterId);

    return `
      <section class="panel">
        <h2>投票</h2>
        <p class="lede">${voter ? `${voter.name} さんは誰に投票しますか？` : "全員の投票が完了しました。"}</p>
        ${voter ? `<div class="vote-grid">${targets}</div>` : ""}
        <div class="btn-row">
          ${voter
            ? `<button class="btn btn--primary" ${game.votes[voter.id] ? "" : "disabled"} onclick="ONW.main.confirmVote()">投票する</button>`
            : `<button class="btn btn--primary" onclick="ONW.main.finishVoting()">結果を見る</button>`
          }
        </div>
      </section>
    `;
  };

  // ---------------------------------------------------------
  // 結果画面
  // ---------------------------------------------------------
  ui.renderResult = function renderResult(game) {
    const rows = game.players.map((p) => {
      const initial = ONW.roles.getInfo(game.initialRoles[p.id]);
      const final = ONW.roles.getInfo(game.currentRoles[p.id]);
      const changed = game.initialRoles[p.id] !== game.currentRoles[p.id];
      const eliminated = game.eliminated.includes(p.id);
      return `
        <div class="result-role">
          <span>${p.name}${eliminated ? "（追放）" : ""}</span>
          <span>
            ${changed ? `${initial.name} → ` : ""}${final.name}
            <span class="tag-team tag-team--${final.team}">${teamLabel(final.team)}</span>
          </span>
        </div>
      `;
    }).join("");

    const winnerLabel = game.winners.map(teamLabel).join(" / ") || "なし";

    return `
      <section class="panel">
        <h2>結果発表</h2>
        <p class="lede">勝利陣営: <strong>${winnerLabel}</strong></p>
        ${rows}
        <div class="btn-row">
          <button class="btn btn--primary" onclick="ONW.main.goToTitle()">タイトルへ戻る</button>
        </div>
      </section>
    `;
  };

  // 元データ(state.js の TEAM_NAME)に合わせた陣営表示名
  function teamLabel(team) {
    return { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" }[team] ?? team;
  }

  ONW.ui = ui;

})(window.ONW);
