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
    if (![ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE].includes(game.phase)) ui.closeChat();
    if (game.phase !== ONW.PHASE.ONLINE_DAY) ui.closeInfo();   // 昼以外では情報確認を閉じる   // 昼・投票以外ではチャットの拡大を閉じる
    if (game.phase !== ONW.PHASE.ONLINE_RESULT) ui.closeResultChat();
    if (game.phase !== ONW.PHASE.LOBBY) ui.closePlayerMenu(); else ui.refreshPlayerMenu();   // ロビーの名前メニュー
    document.body.classList.toggle("is-title", game.phase === ONW.PHASE.TITLE);
    document.getElementById("phase-label").textContent = phaseName(game);
    document.getElementById("day-clock").textContent =
      game.phase === "day" && !game.votePhaseStarted
        ? ONW.utils.formatClock(game.discussionSecondsLeft ?? 0)
        : "――";

    const renderer = {
      [ONW.PHASE.TITLE]: ui.renderTitle,
      [ONW.PHASE.LOBBY]: ui.renderLobby,
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
        ? `<div id="co-panel"></div><div class="co-bar"><button class="btn" onclick="ONW.ui.openInfo()">情報確認</button> <button class="btn" onclick="ONW.co.open()"${game.muzzled ? " disabled" : ""}>${game.muzzled ? "🤐 COボタン" : "COボタン"}</button> <button class="btn" onclick="ONW.ui.useAbility('day')">昼能力</button> <button class="btn" onclick="ONW.ui.useAbility('night')">夜能力</button></div>` : "";
      html += `<div class="co-dock">${coBtn}<div id="co-board" class="co-board"></div></div>`;
    }
    // 議論・投票・観戦中は画面を縦に固定し、チャット本文だけをスクロールさせる
    document.body.classList.toggle("chat-mode", !specDeal && !!(hostWatching || [P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_SPECTATE].includes(game.phase)));
    // 設定の＋／−などで再描画しても、画面のスクロール位置がずれないようにする（同じ画面の再描画のときだけ）
    const keepY = ui._lastPhase === game.phase ? (window.scrollY || 0) : 0;
    const mp = document.querySelector(".settings-panel--modal"), keepM = mp ? mp.scrollTop : 0;   // 設定ウィンドウの中のスクロール位置も保つ
    // 結果発表: 中身が前回と全く同じなら作り直さない（通信などで再描画が走っても、画面・カードがちらつかない）
    const sameResult = game.phase === P.ONLINE_RESULT && !specDeal && ui._lastPhase === game.phase && ui._lastHtml === html && !!$app().firstElementChild;
    document.body.classList.toggle("res-compact", game.phase === P.ONLINE_RESULT);   // 結果発表のあいだもヘッダーを小さいまま（ヘッダーの高さが変わってカードがジャンプしない）
    if (!sameResult) $app().innerHTML = html;
    ui._lastHtml = html;
    if (keepY && !sameResult) window.scrollTo(0, keepY);
    if (keepM) { const np = document.querySelector(".settings-panel--modal"); if (np) np.scrollTop = keepM; }
    ui._lastPhase = game.phase;
    if (game.phase === ONW.PHASE.ONLINE_ROLE || ui.isSpecDeal(game)) ui.setupDeal();
    if (ONW.accountUi && ONW.accountUi.updateFixed) ONW.accountUi.updateFixed();
    ui.updateBoard();
    ui.updateSpecInfo();
    ui.updateTimer();
    ui.updateSkip(game);
    ui.updateChat();
    if (ONW.co) ONW.co.render();
    if (ONW.stage) ONW.stage.sync(game);   // 山札・墓地・各自のカード（再描画しても作り直さない）
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
    const rejoinBox = ri ? `<div class="rejoin-box"><p class="lede">参加中のルームがあります（コード ${esc(ri.code)}）</p><button class="btn btn--primary btn--wide" onclick="ONW.main.rejoin()">ルームに戻る</button></div>` : "";
    const hr = ONW.net && ONW.net.hostResume;
    const hostBox = hr && !ri && ONW.account && ONW.account.user ? `<div class="rejoin-box"><p class="lede">前回のルームを再開できます（コード ${esc(hr.code)}）。CPU・固定役・進行を引き継ぎます。</p><button class="btn btn--primary btn--wide" onclick="ONW.main.resumeHost()">前回のルームを再開</button></div>` : "";
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

  ui.toggleGroup = function (key) { const g = ONW.game; g.roleOpen = { ...(g.roleOpen || {}), [key]: !(g.roleOpen || {})[key] }; ONW.ui.render(g); };
  ui.toggleInvite = function () {
    const g = ONW.game;
    g.invOpen = !g.invOpen;
    ONW.ui.render(g);
    if (g.invOpen && ONW.friends) ONW.friends.reload();
  };
  ui.toggleSettings = function () { ONW.game.showSettings = !ONW.game.showSettings; ONW.game.setPage = null; ONW.ui.render(ONW.game); };
  /** ルーム設定: タブ一覧 → そのページだけ表示 → 左上の戻るで一覧へ（page=null で一覧） */
  ui.setPage = function (page) {
    ONW.game.setPage = page || null; ONW.ui.render(ONW.game);
    const mp = document.querySelector(".settings-panel--modal"); if (mp) mp.scrollTop = 0;
  };

  // ---- ルーム設定パネル（「ルーム設定」を押すと出る）----
  function settingsPanel(game, isHost, total) {
    const c = game.roleCounts, need = game.villageSize + game.graveCount, have = Object.values(c).reduce((a, b) => a + b, 0);
    const row = (label, value, minus, plus) => `
      <div class="field-row"><label>${label}</label>
        ${isHost ? `<div class="stepper"><button onclick="${minus}">−</button><span>${value}</span><button onclick="${plus}">＋</button></div>` : `<span>${value}</span>`}
      </div>`;
    const roleRow = (r) => row(ONW.roles.getInfo(r).name, c[r] ?? 0, `ONW.net.changeRole('${r}',-1)`, `ONW.net.changeRole('${r}',1)`);
    // 陣営だけを並べ、押すと中の役職が開く（開閉は game.roleOpen に保持）
    const open = game.roleOpen || {};
    const sum = (list) => list.reduce((n, r) => n + (c[r] ?? 0), 0);
    const head = (key, title, list, sub) => `
      <button class="rg-head ${sub ? "rg-head--sub" : ""}" onclick="ONW.ui.toggleGroup('${key}')">
        <span>${open[key] ? "▾" : "▸"} ${title}</span><span class="rg-count">${sum(list)}枚</span>
      </button>`;
    const village = ["light_apostle", "villager", "seer", "robber", "relic_robber", "troublemaker", "insomniac", "mason", "merlin", "wolf_dreamer", "wolf_marked", "straw_doll", "cat_sidhe", "baker", "star", "newspaper", "chicken", "mayor", "visitor", "queen", "tough_guy"];
    const wolfLike = ["werewolf", "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf", "forgetful_wolf", "assassin", "wolf_king", "mapo_wolf", "cat_pumpkin", "observer_wolf"], madLike = ["madman", "mad_seer", "cultist", "black_cat", "exposed_madman", "muzzle_madman"], dark = ["dark_avatar"];
    const third = ["silver_shadow", "tanner", "love_tanner", "god", "opportunist", "amanojaku", "freeter", "servant", "winner", "loser", "doppelganger", "schrodinger_cat", "executioner", "gremlin", "pure_lover", "evil_woman", "cupid", "heartbreaker", "shuffler"];
    const roles = `
      <div class="role-group t-village">${head("village", "村人陣営", village)}${open.village ? village.map(roleRow).join("") : ""}</div>
      <div class="role-group t-wolf">${head("wolf", "人狼陣営", [...dark, ...wolfLike, ...madLike])}
        ${open.wolf ? `
          ${dark.map(roleRow).join("")}
          <div class="rg-sub">${head("wolfLike", "人狼系", wolfLike, true)}${open.wolfLike ? wolfLike.map(roleRow).join("") : ""}</div>
          <div class="rg-sub">${head("madLike", "狂人系", madLike, true)}${open.madLike ? madLike.map(roleRow).join("") : ""}</div>` : ""}
      </div>
      <div class="role-group t-third">${head("third", "第三陣営", third)}${open.third ? third.map(roleRow).join("") : ""}</div>
      <div class="role-group t-dup"><button class="rg-head" onclick="ONW.ui.toggleGroup('dup')"><span>${open.dup ? "▾" : "▸"} 重複役職</span><span class="rg-count">酔${game.drunkCount || 0}人・恋${game.loverCount || 0}組</span></button>
        ${open.dup ? `${row("酔っ払い(人)", game.drunkCount || 0, "ONW.net.changeSetting('drunkCount',-1)", "ONW.net.changeSetting('drunkCount',1)")}
        ${row("酔う確率(1人ごと)", `${game.drunkChance ?? 100}%`, "ONW.net.changeSetting('drunkChance',-5)", "ONW.net.changeSetting('drunkChance',5)")}
        <p class="night-step__hint" style="margin:4px 8px 8px;">配役の枚数には数えません。ランダムな参加者（CPU含む）に重なり、議論時間の半分が過ぎるまで自分の役職が分かりません。人数ぶんの枠が、それぞれ「酔う確率」で当たります。</p>
        ${row("恋人(組)", game.loverCount || 0, "ONW.net.changeSetting('loverCount',-1)", "ONW.net.changeSetting('loverCount',1)")}
        ${row("恋人になる確率(1組ごと)", `${game.loverChance ?? 100}%`, "ONW.net.changeSetting('loverChance',-5)", "ONW.net.changeSetting('loverChance',5)")}
        <p class="night-step__hint" style="margin:4px 8px 8px;">恋人は2人1組で、ランダムな参加者（CPU含む）に重なります（酔っ払いと同じ人に重なることもあります）。夜に相方のカードが❤️でめくれ、相方が死亡すると、死因を問わず同時に心中します。二人とも死ななければ恋人陣営の勝利で、恋人以外は敗北です。組数は村の人数の半分までです。</p>` : ""}</div>`;
    const timers = [["night", "夜時間(秒)"], ["morning", "朝時間(秒)"], ["day", "昼・議論(秒)"], ["vote", "夕方・投票(秒)"]].map(([k, l]) =>
      row(l, game.timers[k], `ONW.net.changeTimer('${k}',-5)`, `ONW.net.changeTimer('${k}',5)`)).join("");
    const offList = game.transformOff || [];
    // 変化先の有無: 陣営だけを並べ、押すと変化役ごとの変化先（役職のON/OFF）が開く
    const tfChips = (b, list) => `<div class="tf-set"><div class="tf-set__name">${esc(ONW.roles.getInfo(b).name)}の変化先</div>
        <div class="tf-set__chips">${list.map((t) => {
          const on = !offList.includes(`${b}:${t}`);
          const label = `${esc(ONW.roles.getInfo(t).name)} ${on ? "ON" : "OFF"}`;
          return isHost ? `<button class="btn tf-chip ${on ? "tf-on" : "tf-off"}" onclick="ONW.net.toggleTarget('${b}','${t}')">${label}</button>` : `<span class="tf-chip ${on ? "tf-on" : "tf-off"}">${label}</span>`;
        }).join("")}</div></div>`;
    const tfHead = (key, title, b, list, sub) => `
      <button class="rg-head ${sub ? "rg-head--sub" : ""}" onclick="ONW.ui.toggleGroup('${key}')">
        <span>${open[key] ? "▾" : "▸"} ${title}</span><span class="rg-count">ON ${list.filter((t) => !offList.includes(`${b}:${t}`)).length}/${list.length}</span>
      </button>`;
    const TG = ONW.TRANSFORM_GROUPS;
    const tfRows = `
      <div class="role-group t-village">${tfHead("tfVillage", "村人陣営", "light_apostle", TG.light_apostle)}${open.tfVillage ? tfChips("light_apostle", TG.light_apostle) : ""}</div>
      <div class="role-group t-wolf">${tfHead("tfWolf", "人狼陣営", "dark_avatar", [...wolfLike, ...madLike])}
        ${open.tfWolf ? `
          <div class="rg-sub">${tfHead("tfWolfLike", "人狼系", "dark_avatar", wolfLike, true)}${open.tfWolfLike ? tfChips("dark_avatar", wolfLike) : ""}</div>
          <div class="rg-sub">${tfHead("tfMadLike", "狂人系", "dark_avatar", madLike, true)}${open.tfMadLike ? tfChips("dark_avatar", madLike) : ""}</div>` : ""}
      </div>
      <div class="role-group t-third">${tfHead("tfThird", "第三陣営", "silver_shadow", TG.silver_shadow)}${open.tfThird ? tfChips("silver_shadow", TG.silver_shadow) : ""}</div>`;
    const presets = isHost ? ONW.settings.listPresets() : [];
    const presetUi = isHost ? `
      <h3 class="set-sub">マイルール</h3>
      <div class="chat-input">
        <input class="onw-input" maxlength="20" placeholder="ルール名" value="${esc(game.presetName)}" oninput="ONW.game.presetName=this.value">
        <button class="btn" onclick="ONW.net.savePreset()">今のルールを保存</button>
      </div>
      ${presets.length ? presets.map((p, i) => `
        <div class="result-role"><span>${esc(p.name)}</span>
          <span><button class="btn" onclick="ONW.net.loadPreset(${i})">読み込む</button> <button class="btn" onclick="ONW.net.showCode(${i})">コード</button> <button class="btn" onclick="ONW.net.deletePreset(${i})">削除</button></span>
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
    // 設定は「人数 / 配役 / タイマー / 詳細」の4つに分け、見出しを押すと開く
    const page = game.setPage || null, PT = { secPeople: "人数設定", secRoles: "配役設定", secTimer: "タイマー設定", secAdv: "詳細設定", secRule: "ルール設定" };
    const sec = (key, title, summary, inner) => {
      if (!page) return `<button class="set-tab" onclick="ONW.ui.setPage('${key}')"><span>${title}</span><span class="rg-count">${summary}</span><span class="set-tab__go">›</span></button>`;
      return page === key ? `<div class="set-sec__body">${inner}</div>` : "";
    };
    return `
      <div class="settings-modal" onclick="if(event.target===this)ONW.ui.toggleSettings()">
      <div class="settings-panel settings-panel--modal"><div class="x-bar">${page ? `<button class="x-back" type="button" onclick="ONW.ui.setPage(null)">‹ 戻る</button>` : "<span></span>"}<button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.ui.toggleSettings()">✕</button></div>
        <h2>${page ? PT[page] || "" : "ルーム設定"}</h2>
        ${page ? "" : `<p class="night-step__hint">${isHost ? "変更したルールは自動で保存され、次回のルーム作成時に復元されます。" : "ホストが設定を変更できます。"}</p>`}
        ${sec("secPeople", "人数設定", `${game.villageSize}人村 / 墓地${game.graveCount}枚 / CPU${game.cpuCount}人`, `
          ${row("何人村", game.villageSize, "ONW.net.changeSetting('villageSize',-1)", "ONW.net.changeSetting('villageSize',1)")}
          <p class="night-step__hint">参加者（CPUも含む）が${game.villageSize}人まで入れます。定員を超えて入った人は観戦側になります。</p>
          ${row("墓地の枚数", game.graveCount, "ONW.net.changeSetting('graveCount',-1)", "ONW.net.changeSetting('graveCount',1)")}
          ${row("CPU人数", game.cpuCount, "ONW.net.changeSetting('cpuCount',-1)", "ONW.net.changeSetting('cpuCount',1)")}`)}
        ${sec("secRoles", "配役設定", `${have}/${need}枚`, `
          <p class="night-step__hint">必要枚数: ${need}枚（${game.villageSize}人村+墓地${game.graveCount}枚） / 現在 ${have}枚</p>
          ${roles}`)}
        ${sec("secTimer", "タイマー設定", `夜${game.timers.night}秒・昼${game.timers.day}秒`, timers)}
        ${sec("secAdv", "詳細設定", "", `
          <div class="field-row"><label>狂人昇格</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleFake()">${game.fakeWolfWhenNoWolf ? "ON" : "OFF"}</button>` : `<span>${game.fakeWolfWhenNoWolf ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: 最終盤面に人狼がいないとき、狂人1人が人狼判定に昇格します。</p>
          ${row("占い師が占える墓地の枚数", game.seerGraveCount ?? 2, "ONW.net.changeSetting('seerGraveCount',-1)", "ONW.net.changeSetting('seerGraveCount',1)")}
          <p class="night-step__hint">占い師・狂った占い師が夜に確認できる墓地のカードの枚数です（墓地の枚数が上限）。</p>
          ${row("メイヤーの投票数", game.mayorVoteCount ?? 2, "ONW.net.changeSetting('mayorVoteCount',-1)", "ONW.net.changeSetting('mayorVoteCount',1)")}
          <p class="night-step__hint">メイヤーが昼の投票で持つ票数です（2〜10票）。最終盤面でメイヤーを持っている人の1票が、この票数ぶんとして数えられます。</p>
          <div class="field-row"><label>変化公開</label>
            ${isHost ? `<button class="btn" onclick="ONW.net.toggleOpt('revealTransforms')">${game.revealTransforms ? "ON" : "OFF"}</button>` : `<span>${game.revealTransforms ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: 昼の開始時に「変化前 → 変化後」の役職名を公開します（誰が変化したかは分かりません）。</p>
          <h3 class="set-sub">変化先の有無</h3>
          <p class="night-step__hint">陣営を押すと、変化先にする役職をON/OFFできます。OFFの役職には変化せず、COの候補にも出ません。全部OFFだとその変化役は変化しません。</p>
          ${tfRows}
          <div class="field-row"><label>デバッグモード</label>
            ${isHost ? `<button class="btn" onclick="ONW.debug.toggle()">${game.debugOn ? "ON" : "OFF"}</button>` : `<span>${game.debugOn ? "ON" : "OFF"}</span>`}
          </div>
          <p class="night-step__hint">ON: ホストが役職の固定・CPUの能力先・投票先の指定などを行えます。ONの間は参加者全員の画面に「デバッグモード中」と表示されます。</p>`)}
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
    const ok = total === size && have === need && allReady;
    const me = all[game.meIndex] || {};
    const badge = (st) => { const [t, cls] = STATUS[st] || STATUS.waiting; return `<span class="st ${cls}">${t}</span>`; };
    // 名前の左にアイコン（画像があれば画像、無ければ頭文字の丸）。画像のある他人には小さな通報ボタン
    const A = ONW.account, myUid = A && A.user ? A.user.id : null;
    const plName = (p) => `<span class="pl">${ONW.profile.link(p.uid, p.name, `${A.avatarHtml(p.name, { uid: p.uid, v: p.av }, "av--sm")}<span>${esc(p.name)}</span>`)}${myUid && p.uid && p.av && p.uid !== myUid ? `<button class="rep-btn" title="アイコンを通報" onclick="ONW.friends.report('${esc(p.uid)}')">⚑</button>` : ""}</span>`;
    // ロビーの名前: （自分以外の）人間の名前を押すとメニューが重なって出る。ホストは操作メニュー + プロフィール、ホスト以外は「プロフィールを見る」だけ（見られる相手のときのみ）
    const lobbyName = (p) => {
      const idx = all.indexOf(p), inner = `${A.avatarHtml(p.name, { uid: p.uid, v: p.av }, "av--sm")}<span>${esc(p.name)}</span>`;
      const rep = myUid && p.uid && p.av && p.uid !== myUid ? `<button class="rep-btn" title="アイコンを通報" onclick="ONW.friends.report('${esc(p.uid)}')">⚑</button>` : "";
      const menu = idx !== game.meIndex && (isHost || !!(p.uid && A && A.user));
      return `<span class="pl">${menu ? `<span class="pf-link" role="button" tabindex="0" onclick="ONW.ui.openPlayerMenu(${idx})">${inner}</span>` : inner}${rep}</span>`;
    };
    const canInvite = isHost && !!(A && A.user);
    let hint = "";
    if (isHost) hint = total < size ? `あと${size - total}人必要です（CPUを増やして補えます）。` : have !== need ? `配役の枚数が合っていません（必要${need}枚 / 現在${have}枚）。` : !allReady ? "全員が「準備完了」になると開始できます。" : "開始できます。";
    else if (me.spec) hint = total >= size ? "満員のため観戦で入りました。空きが出たら「観戦 OFF」で参加できます。" : "観戦で参加します。ホストの開始を待っています…";
    else hint = me.status === "ready" ? "準備完了です。ホストの開始を待っています…" : "準備ができたら「準備完了」を押してください。";
    const summary = `${size}人村 / 墓地${game.graveCount}枚 / 夜${game.timers.night}秒・議論${game.timers.day}秒・投票${game.timers.vote}秒`;
    return `
      <section class="panel night-step">
        <p class="lede">部屋コード（友達に教えてください）</p>
        <div class="night-step__role" style="letter-spacing:.3em;">${ONW.net.code}</div>
        <h2>参加者 ${total}/${size}</h2>
        ${players.map((p) => `<div class="result-role">${lobbyName(p)}<span>${badge(p.status)}</span></div>`).join("")}
        ${Array.from({ length: game.cpuCount || 0 }, (_, i) => `<div class="result-role"><span>${esc((game.cpuNames && game.cpuNames[i]) || `CPU${i + 1}`)}</span><span>${isHost ? `<button class="btn tf-chip" onclick="ONW.net.renameCpu(${i})">名前変更</button> ` : ""}<span class="st st-cpu">CPU</span></span></div>`).join("")}
        ${specs.length ? `<h2>観戦者 ${specs.length}</h2>${specs.map((p) => `<div class="result-role">${lobbyName(p)}<span class="st st-spec">観戦</span></div>`).join("")}` : ""}
        <p class="night-step__hint">ルール: ${summary}</p>
        <p class="night-step__hint">${hint}</p>
        ${canInvite && game.invOpen ? `<div class="invite-panel"><h2>フレンドを招待</h2><div id="inv-list">${ONW.friends.inviteListHtml()}</div><p id="inv-msg" class="acct-msg"></p></div>` : ""}
        <div class="btn-row" style="justify-content:center;">
          <button class="btn" onclick="ONW.ui.toggleSettings()">ルーム設定</button>
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
      const votes = info.vote ? `<div class="si-h">投票状況（変更あり）</div>${info.votes.map((v) => row(esc(v.from), v.to ? `→ <strong>${esc(v.to)}</strong>${v.w > 1 ? ` <span class="rs-dim">(${v.w}票)</span>` : ""}` : '<span class="rs-dim">未投票</span>')).join("")}` : "";
      const log = info.log.length ? `<div class="si-h">夜の行動ログ</div>${info.log.map((t) => `<div class="si-log">${esc(t)}</div>`).join("")}` : "";
      body = live + votes + log || `<div class="si-log">まだ記録はありません。</div>`;
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
      <div class="rh-head"><span>${esc(name)}${isP && o.cpu ? '<small class="cb-cpu">CPU</small>' : ""}${isP && o.dead ? " 💀" : ""}</span><button class="btn" onclick="ONW.ui.closeRoleHistory()">閉じる</button></div>
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
      <button class="btn sc-abandon" onclick="ONW.ui.confirmAbandon()">廃村</button></div>`;
    // 外側タップでは閉じない（ダブルタップ直後のクリックが背景に当たって即消えるため）。「いいえ」を押すまで残る
    document.body.appendChild(wrap);
    ui._skipPhase = g.phase;
  };
  /** 廃村: 試合を打ち切って全員をルームへ戻す（押し間違い防止に、もう一度確認する） */
  ui.confirmAbandon = function () {
    const g = ONW.game, same = ui._skipPhase === g.phase;
    if (!window.confirm("廃村にしますか？\nこの試合は結果なしで終わり、全員がルームに戻ります。")) return;
    ui.closeSkip();
    if (same && canSkip(g)) ONW.net.abandonGame();
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
    const flipL = (from ? flip2 + 1.6 : flip2);       // 恋人にめくれる時刻
    const doneAt = (lover ? flipL : from ? flip2 : flip1) + 0.9;
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
                   <div class="dl-face dl-face--a dl-team-${(from || info).team}${(from ? game.myFrom : game.myRole) === "drunk" ? " dl-face--drunk" : ""}" style="${from ? D(flip2 - 0.2) : lover ? D(flipL - 0.2) : ""}">${ui.roleIcon(from ? game.myFrom : game.myRole, "role-icon--face")}<b>${esc(from ? from.name : info.name)}</b></div>
                   ${from ? `<div class="dl-face dl-face--b dl-team-${info.team}${game.myRole === "drunk" ? " dl-face--drunk" : ""}" style="${lover ? `animation:dl-in .25s ease-out both,dl-out .25s ease-in forwards;animation-delay:${(flip2 - elapsed).toFixed(2)}s,${(flipL - 0.2 - elapsed).toFixed(2)}s;` : D(flip2)}">${ui.roleIcon(game.myRole, "role-icon--face")}<b>${esc(info.name)}</b></div>` : ""}
                   ${lover ? `<div class="dl-face dl-face--b dl-face--love dl-team-third" style="${D(flipL)}"><span class="dl-love-mark">❤</span><b>恋人</b></div>` : ""}
                 </div>
               </div>`
            : `<div class="dl-card dl-fly" data-fly style="${D(pStart + pStep * idx)}"></div>`}
        </div>
        <span class="dl-name">${esc(name || "あなた")}${me ? "（あなた）" : ""}</span>
      </div>`;
    const players = [mkPlayer(game.myName, 0, true), ...others.map((p, i) => mkPlayer(p.name, i + 1, false))].join("");
    return `
      <section class="panel night-step deal-stage" data-deal>
        <p class="lede">役職を配っています…</p>
        <div class="dl-deck"><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div></div>
        ${G ? `<div class="dl-row dl-graves">${graves}</div>` : ""}
        <div class="dl-row dl-players">${players}</div>
        <div class="dl-result" style="${D(doneAt)}">
          ${ui.roleIcon(game.myRole, "role-icon--big")}
          <div class="night-step__role t-${info.team}">${info.name}</div>
          ${from ? `<p class="night-step__hint">${esc(from.name)} → ${esc(info.name)} に変化しました。</p>` : ""}
          ${lover ? `<p class="night-step__hint"><strong>${esc(info.name)}</strong> に加えて <strong>恋人</strong> になっています。相方は夜に分かります。</p>` : ""}
          <p class="night-step__hint">${ONW.roleDesc(game.myRole, game)}</p>
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
        <div class="dl-face dl-face--a dl-team-${ia.team}${a === "drunk" ? " dl-face--drunk" : ""}" style="${o.from ? D(flip2 - 0.2) : o.lover ? D(flipL - 0.2) : ""}"><b>${esc(ia.name)}</b></div>
        ${o.from ? `<div class="dl-face dl-face--b dl-team-${ib.team}${o.ini === "drunk" ? " dl-face--drunk" : ""}" style="${o.lover ? `animation:dl-in .25s ease-out both,dl-out .25s ease-in forwards;animation-delay:${(flip2 - elapsed).toFixed(2)}s,${(flipL - 0.2 - elapsed).toFixed(2)}s;` : D(flip2)}"><b>${esc(ib.name)}</b></div>` : ""}
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
    return `
      <section class="panel night-step deal-stage dl-spec" data-deal>
        <p class="lede">役職を配っています…（観戦中は全員の役職が見えます）</p>
        <div class="dl-deck"><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div><div class="dl-card dl-deck-card"></div></div>
        ${G ? `<div class="dl-row dl-graves">${gHtml}</div>` : ""}
        <div class="dl-row dl-players">${pHtml}</div>
        <div class="btn-row">${game.isSpectator ? `<button class="btn" onclick="ONW.main.goToTitle()">退出</button>` : ""}</div>
      </section>`;
  };

  /** 山札から各スロットへ飛ぶ軌道（--dx/--dy）を実測して入れる。
   *  ・出発点は山札の「いちばん上のカード」（手前に見えている1枚）
   *  ・配る順が早いカードほど手前（z-index が大きい）にして、山札の上から順に1枚ずつ取って配っているように見せる */
  ui.setupDeal = function () {
    const root = document.querySelector("[data-deal]");
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
    root.classList.add("go");
  };

  ui.renderOnlineNight = function renderOnlineNight(game) {
    const info = ONW.roles.getInfo(game.myRole);
    const held = ui.logsHeld(game);   // 夜の始まりのカードがめくれ終わるまで、文章は出さない
    const logs = (held ? [] : [...(game.nightLogs || []), ...(game.nightAck || [])]).map((t) => `<p class="night-step__hint"><strong>${esc(t)}</strong></p>`).join("");
    let action = "";
    const ar = game.actRole, canAct = !game.nightDone && ar;
    const nm = (id) => ((game.others || []).find((p) => p.id === id) || {}).name || "?";
    const sel = game.nightSel || { players: [], graves: [] };
    const chosen = [...sel.players.map((id) => esc(nm(id))), ...sel.graves.map((i) => `墓地${i + 1}`)];
    const nowSel = (sep, need) => `<p class="night-step__hint">選択中: <strong>${chosen.length ? chosen.join(sep) : "まだ選んでいません"}</strong>${need && chosen.length < need ? `（あと${need - chosen.length}つ）` : ""}</p>`;
    const later = `<br>朝になるまで何度でも変更できます（選んだカードをもう一度押すと解除）。結果は朝に分かります。`;
    const gmax = ONW.seerGraveMax(game);
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

  /** 昼能力・夜能力ボタンの受け口（今は押しても何も起きない。能力の実装時にここへ処理を足す） */
  ui.useAbility = function (kind) {   // kind: "day" | "night"。夜能力: 酔いが覚めたあとの最終役職の夜能力（押すとカードを選べて、確定/キャンセルが出る。もう一度押すと閉じる）
    const g = ONW.game, flash = (t) => { g.abilityMsg = t; ui.render(g); setTimeout(() => { if (g.abilityMsg === t) { g.abilityMsg = ""; ui.render(g); } }, 4000); };
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.isDead || g.isSpectator) return;
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
  ui.abilityCancel = function () {
    const g = ONW.game;
    g.abilityOpen = false; g.nightSel = { players: [], graves: [] };
    ONW.stage.sync(g); ui.render(g);
  };

  // ---- チャット ----
  function chatHtml(game) {
    // 観戦者・死亡者には、議論と霊界の発言が時刻順に1本で流れる。生存者には議論だけ（霊界の発言は届かない）
    const src = ui.canGhost() ? mergedChat(game) : (game.chatLog || []);
    const lines = src.map((c) => c.ghost
      ? `<div class="chat-line chat-ghost"><span class="chat-ghost__tag">【霊界】</span><strong>${esc(c.name)}</strong>: ${esc(c.text)}</div>`
      : c.kind === "sys"
      ? `<div class="chat-line chat-sys">${esc(c.text)}</div>`
      : c.kind === "co"
      ? `<div class="chat-line chat-co">${esc(c.text)}</div>`
      : `<div class="chat-line"><strong>${esc(c.name)}</strong>: ${esc(c.text)}</div>`).join("");
    return lines || `<div class="chat-line chat-empty">まだ発言はありません。</div>`;
  }
  /** ヘッダーのフェーズ名に残り時間を出す */
  /** パン屋: 昼のタイマーが動き出す瞬間に「パンが焼けました」のバナーを出す（誰がパン屋かは出さない） */
  ui.showBread = function (n) {
    document.querySelectorAll(".bread-banner").forEach((e) => e.remove());
    const el = document.createElement("div");
    el.className = "bread-banner";
    el.innerHTML = `<span class="bread-banner__icon">🍞</span><span class="bread-banner__text">${n > 1 ? `パンが${n}個焼けました` : "パンが焼けました"}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3600);
  };
  ui.updateTimer = function () {
    if (ONW.stage && ONW.stage.drunkTick) ONW.stage.drunkTick();   // 酔っ払い: 自分のカードの「酔いが覚めるまで」を毎秒更新
    const g = ONW.game, el = document.getElementById("phase-label");
    if (!el) return;
    const base = g.phase === ONW.PHASE.ONLINE_SPECTATE ? `観戦中（${PHASE_LABEL[g.specPhase] ?? "―"}）` : phaseName(g);
    const t = g.phase === ONW.PHASE.ONLINE_RESULT ? null : g.remain;   // 結果発表ではタイマーを出さない
    document.body.classList.toggle("res-phase", g.phase === ONW.PHASE.ONLINE_RESULT);
    el.textContent = (t == null || t < 0) ? base : `${base} 残り ${ONW.utils.formatClock(t)}`;
    // PC版: 左の大きなタイマー（残り10秒以下で赤くする）
    const bt = document.getElementById("big-timer");
    if (bt) {
      const has = !(t == null || t < 0);
      bt.querySelector(".big-timer__phase").textContent = base;
      bt.querySelector(".big-timer__time").textContent = has ? ONW.utils.formatClock(t) : "――";
      bt.classList.toggle("low", has && t <= 10);
      bt.classList.toggle("idle", !has);
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
      const [label, cls] = p.dead ? ["死亡", "co-none"] : coLabel(p.co);
      const res = (p.results || []).map((t) => `<div class="cb-r">${esc(t)}</div>`).join("");
      return `<div class="cb-row ${p.id === me ? "cb-me" : ""} ${p.dead ? "cb-dead" : ""}">
        <div class="cb-who">${ONW.account.avatarHtml(p.name, null, "av--sm")}<span class="cb-name">${esc(p.name)}${p.cpu ? '<small class="cb-cpu">CPU</small>' : ""}</span></div>
        <div class="cb-what"><div class="cb-co ${cls}">${label}</div>${res ? `<div class="cb-results">${res}</div>` : ""}</div></div>`;
    }).join("") + `</div>`;
  };
  ui.updateBoard = function () {
    const el = document.getElementById("co-board");
    if (!el) return;
    const g = ONW.game, me = ONW.net.myId();
    const chips = (g.boardView || []).map((p) => {
      const [label, cls] = p.dead ? ["死亡", "co-none"] : coLabel(p.co);
      return `<div class="cb-chip ${p.id === me ? "cb-me" : ""} ${p.dead ? "cb-dead" : ""}">
        <div class="cb-line"><span class="cb-name">${ONW.account.avatarMap[p.name] ? ONW.account.avatarHtml(p.name, null, "av--xs") : ""}${esc(p.name)}${p.cpu ? '<small class="cb-cpu">CPU</small>' : ""}</span><span class="cb-co ${cls}">${label}</span></div></div>`;
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

  ui.updateChat = function () {
    const big = document.getElementById("chat-log-big");
    if (big) { big.innerHTML = chatHtml(ONW.game); big.scrollTop = big.scrollHeight; }
    const el = document.getElementById("chat-log");
    if (!el) return !!big;
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
    wrap.innerHTML = `<div class="co-head"><span>チャット</span><button class="btn" onclick="ONW.ui.closeChat()">閉じる</button></div>
      <div id="chat-log-big" class="chat-log chat-log--big"></div>
      ${canSend ? `<div class="chat-input"><input id="chat-in-big" class="onw-input" maxlength="100" onkeydown="if(event.key==='Enter')ONW.co.sendChat()"><button class="btn" onpointerdown="event.preventDefault()" onmousedown="event.preventDefault()" ontouchend="event.preventDefault();ONW.co.sendChat()" onclick="ONW.co.sendChat()">送信</button></div>` : ""}`;
    document.body.appendChild(wrap);
    ui.lockPage(true);                 // 開いている間、ページ本体は動かさない
    ui.fitChat();
    ui.updateChat();
    const inp = document.getElementById("chat-in-big");
    if (inp) { if (document.activeElement && document.activeElement !== inp) document.activeElement.blur(); inp.focus({ preventScroll: true }); }
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
  if (window.visualViewport) { window.visualViewport.addEventListener("resize", () => ONW.ui.fitChat()); window.visualViewport.addEventListener("scroll", () => ONW.ui.fitChat()); }
  ui.closeChat = function () { const w = document.getElementById("chat-overlay"); if (w) w.remove(); ui.lockPage(false); };

  /** 朝（墓荒らしの交換後）と、昼（酔いが覚めたあと）に使う能力の操作欄。late=昼 */
  ui.chainBlock = function (game, late) {
    let chain = "";
    const ar = game.morningChain;
    if (ar && !game.isSpectator) {
      const sel = game.nightSel || { players: [], graves: [] }, np = sel.players.length, ng = sel.graves.length;
      const nm = (id) => ((game.others || []).find((p) => p.id === id) || {}).name || "?";
      const chosen = [...sel.players.map((id) => esc(nm(id))), ...sel.graves.map((i) => `墓地${i + 1}`)];
      const gmax = ONW.seerGraveMax(game);
      const uc = (ONW.roleDef(ar) || {}).uiNight;   // 確定できる条件と「押して」の文言は、各役職ファイルの uiNight.chainReady / chainHow(ない役職は いたずらっ子と同じ形)
      const ready = uc && uc.chainReady ? uc.chainReady(np, ng) : np === 1;
      const how = uc && uc.chainHow ? uc.chainHow(gmax) : ONW.roleDef("troublemaker").uiNight.chainHow(gmax);
      if (game.morningChainDone) chain = late ? "" : `<p class="night-step__hint">朝の能力は使用済みです。</p>`;
      else if (!game.morningChainReady) chain = late ? "" : `<p class="night-step__hint">新しい役職（${esc(ONW.roles.getInfo(ar).name)}）の能力を、このあと朝のうちに使えます…</p>`;
      else if (late && !game.abilityOpen) chain = "";
      else if (late) chain = `<p class="night-step__hint">上のテーブルから、${how}ください。選んだら「確定」で能力が発動します。</p>
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
  ui.openInfo = function () {
    if (document.getElementById("info-overlay")) return;
    const g = ONW.game, logs = ui.logsHeld(g) ? [] : g.nightLogs || [];   // 演出中は文章を出さない
    const role = g.myRole ? ONW.roles.getInfo(g.myRole) : null;
    // 全員に公開された情報: スターがいるときだけ誰か、パンが焼けたときだけ「パンが焼けました」を出す（いないとき・焼けていないときは何も出さない）
    const pubLines = [];
    if ((g.starNames || []).length) pubLines.push(`スター: ${(g.starNames || []).map((n) => `<strong>${esc(n)}</strong>`).join("、")}`);
    if ((g.kingNames || []).length) pubLines.push(`人狼王: ${(g.kingNames || []).map((n) => `<strong>${esc(n)}</strong>`).join("、")}`);
    (g.exposeRows || []).forEach((r) => pubLines.push(`暴露通知: 暴露された人の最終役職は <strong>${esc(r.role)}</strong>${r.extras && r.extras.length ? `（${r.extras.map(esc).join("・")}）` : ""} です`));   // 暴露狂人: 誰かは載らない
    if (g.mapoDone) pubLines.push("麻婆豆腐が完成しました");
    if (g.breadN > 0) pubLines.push(g.breadN > 1 ? `パンが${g.breadN}個焼けました` : "パンが焼けました");
    const pub = pubLines.length ? `<hr class="info-sep"><p class="night-step__hint">公開された情報</p>${pubLines.map((t) => `<p class="night-step__hint">${t}</p>`).join("")}` : "";
    // 新聞配達員の新聞: 変化公開のあとに出た紙を、いつでも見返せる（動きがなかったときもそのまま載る）
    const news = Array.isArray(g.newsLines)
      ? `<div class="info-news"><div class="info-news__title">混沌新聞</div>${g.newsLines.length ? `<p class="info-news__head">昨夜、動きのあった役職</p>${g.newsLines.map((t) => `<p class="info-news__item">${esc(t)}</p>`).join("")}` : `<p class="info-news__head">昨夜、目立った能力行使はなかったようです。</p>`}</div>`
      : "";
    const wrap = document.createElement("div");
    wrap.id = "info-overlay";
    wrap.className = "info-overlay";
    wrap.onclick = (e) => { if (e.target === wrap) ui.closeInfo(); };
    wrap.innerHTML = `<div class="info-card">
      <div class="info-head"><span>情報確認</span><button class="btn" onclick="ONW.ui.closeInfo()">閉じる</button></div>
      <div class="info-body">
        ${role ? `<p class="night-step__hint">配られた役職: <strong>${esc(role.name)}</strong>${g.myRole === "drunk" ? (g.soberRole ? `（酔いが覚めたあとの役職: <strong>${esc(ONW.roles.getInfo(g.soberRole).name)}</strong>）` : "（酔いが覚めるまで自分の役職は分かりません）") : ""}</p>` : ""}
        ${logs.length ? logs.map((t) => `<p class="night-step__hint">${esc(t)}</p>`).join("") : `<p class="night-step__hint">まだ得た情報はありません。</p>`}
        ${pub}
        ${news ? `<hr class="info-sep">${news}` : ""}
      </div></div>`;
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
        ${game.abilityMsg ? `<p class="night-step__hint"><strong>${esc(game.abilityMsg)}</strong></p>` : ""}
        ${(ui.logsHeld(game) ? [] : game.dayLines || []).map((t) => `<p class="night-step__hint"><strong>${esc(t)}</strong></p>`).join("")}
        ${ui.chatTabs(game)}
        <div id="chat-log" class="chat-log" onclick="ONW.ui.openChat()"></div>
        ${game.isDead ? ui.ghostInput(game) : `<div class="chat-input">
          <input id="chat-in" class="onw-input" maxlength="100" ${game.muzzled ? `disabled placeholder="🤐 あなたは口封じされています"` : `${ui.isPc() ? "" : "readonly"} onclick="ONW.ui.openChat()"`} onkeydown="if(event.key==='Enter')ONW.co.sendChat()">
          <button class="btn" onclick="ONW.co.sendChat()"${game.muzzled ? " disabled" : ""}>送信</button>
        </div>`}
      </section>`;
  };

  ui.renderOnlineVote = function renderOnlineVote(game) {
    const log = `${ui.chatTabs(game)}<div id="chat-log" class="chat-log" onclick="ONW.ui.openChat()"></div>${game.isDead ? ui.ghostInput(game) : ""}`;
    if (game.strawPick && game.strawKind === "assassin") return `<section class="panel"><h2>アサシン</h2><p class="lede">あなたがめくれました。上のテーブルで、<strong>暗殺する相手のカード</strong>を押してください。自分以外の全員から選べます。</p><p class="night-step__hint">選んだ相手がマーリンなら、人狼陣営の逆転勝利です。選び終わるまでタイマーは止まっています。</p></section>`;
    if (game.strawPick) return `<section class="panel"><h2>わら人形</h2><p class="lede">あなたがめくれました。上のテーブルで、<strong>道連れにする相手のカード</strong>を押してください。</p><p class="night-step__hint">選び終わるまでタイマーは止まっています。</p></section>`;
    if (game.strawWait) return `<section class="panel night-step"><p class="lede">結果を待っています…</p>${log}</section>`;   // 誰が選んでいるかは出さない
    if (game.isDead) return `<section class="panel night-step"><p class="lede">あなたは死亡しているため、投票できません。結果を待っています…</p>${log}</section>`;
    if (game.voted) return `<section class="panel night-step"><p class="lede">あなたの投票先は固定されています。結果を待っています…</p>${log}</section>`;
    const sel = (game.others || []).find((p) => p.id === game.voteSel);
    return `
      <section class="panel">
        <h2>投票</h2>
        <p class="lede">上のテーブルで、追放したい人の<strong>カードを押して</strong>ください。もう一度押すと未投票に戻ります。タイマーが終わった時に、選んでいる人に投票されます。</p>
        <p class="night-step__hint vote-now">${sel ? `現在の投票先: <strong>${esc(sel.name)}</strong>` : "現在: 未投票"}</p>
        ${log}
      </section>`;
  };

  // ---- 最終結果（マイクラ版の並び）----
  /** 最終結果の「チャットを見る」: 画面の上に重ねて表示（position:fixed なので結果画面はずれない）。保存ボタンはここを開いている間だけ出る */
  ui.closeResultChat = function () { const w = document.getElementById("rchat-overlay"); if (w) w.remove(); };
  /** 議論と霊界チャットを発言の時刻順に1本へまとめる（霊界の発言には ghost: true が付く） */
  const mergedChat = (g) => {
    const a = (g.chatLog || []).map((c, n) => ({ ...c, _o: n })), b = (g.ghostLog || []).map((c, n) => ({ ...c, ghost: true, _o: n }));
    return [...a, ...b].sort((x, y) => ((x.at || 0) - (y.at || 0)) || (x.ghost ? 1 : 0) - (y.ghost ? 1 : 0) || x._o - y._o);
  };
  ui.openResultChat = function () {
    if (document.getElementById("rchat-overlay")) return;
    // 結果画面では、霊界チャットも含めて全員が読める。場所は分けず、発言順に並べる（霊界の発言は 👻 付き）
    const lines = mergedChat(ONW.game).map((c) => c.ghost
      ? `<div class="chat-line chat-ghost"><span class="chat-ghost__tag">👻</span><strong>${esc(c.name)}</strong>: ${esc(c.text)}</div>`
      : c.kind === "sys" ? `<div class="chat-line chat-sys">${esc(c.text)}</div>`
      : c.kind === "co" ? `<div class="chat-line chat-co">${esc(c.text)}</div>`
      : `<div class="chat-line"><strong>${esc(c.name)}</strong>: ${esc(c.text)}</div>`).join("");
    const wrap = document.createElement("div");
    wrap.id = "rchat-overlay";
    wrap.innerHTML = `<div class="rchat-box" role="dialog" aria-modal="true">
      <div class="rchat-head"><span>試合のチャット</span><span class="rchat-btns"><button class="btn" onclick="ONW.ui.saveResultChat()">保存</button><button class="btn" onclick="ONW.ui.closeResultChat()">閉じる</button></span></div>
      <div class="chat-log result-chat rchat-log">${lines || '<div class="chat-line chat-empty">まだ発言はありません。</div>'}</div></div>`;
    document.body.appendChild(wrap);
    const log = wrap.querySelector(".rchat-log"); if (log) log.scrollTop = log.scrollHeight;
  };
  /** チャット履歴をtxtで保存する */
  ui.saveResultChat = function () {
    const g = ONW.game, d = new Date(), z = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}`;
    const lines = mergedChat(g).map((c) => (c.ghost ? `[霊界] ${c.name}: ${c.text}` : c.kind === "sys" || c.kind === "co" ? c.text : `${c.name}: ${c.text}`));
    const head = [`ワンナイト人狼 チャット履歴`, `保存日時: ${d.getFullYear()}/${z(d.getMonth() + 1)}/${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}`, g.result && g.result.title ? `結果: ${g.result.title}` : "", "----------------------------------------"].filter((x, i) => x || i !== 2);
    const blob = new Blob(["\uFEFF" + head.concat(lines.length ? lines : ["（発言はありませんでした）"]).join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `onw-chat-${stamp}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };
  ui.renderOnlineResult = function renderOnlineResult(game) {
    const res = game.result;
    if (game.resultStage !== "sheet" && ONW.stage && ONW.stage.hasTable(game)) {
      return `<section class="panel night-step res-intro"><div id="res-cap" class="res-cap">${game.resultCap || ""}</div>
        <div class="btn-row" style="justify-content:center;"><button class="btn" onclick="ONW.stage.skipResult()">スキップ</button></div></section>`;
    }
    const L = (h) => `<div class="rs-line">${h}</div>`;
    const H = (t) => `<div class="rs-head">${t}</div>`;
    const sep = `<hr class="rs-sep">`;
    const seg = (s) => `<span class="t-${s.team}">${esc(s.name)}</span>${s.sfx ? `<span class="t-wolf">${esc(s.sfx)}</span>` : ""}${(s.tags || []).map((t) => `<span class="rs-tag-${t.k}">${esc(t.t)}</span>`).join("")}`;
    const chain = (segs) => segs.map(seg).join(' <span class="rs-dim">→</span> ');
    const winTeam = res.title.startsWith("村人") ? "village" : res.title.startsWith("人狼") ? "wolf" : "third";
    const none = (t) => L(`<span class="rs-dim">${t}</span>`);
    return `
      <section class="panel result-sheet">
        ${H("投票結果")}
        ${res.votes.map((v) => L(`${esc(v.from)} <span class="rs-dim">→</span> ${v.to ? `<span class="rs-vote">${esc(v.to)}</span><span class="rs-dim">(${v.w || 1})</span>` : `<span class="rs-dim">未投票</span>`}`)).join("")}
        ${sep}${H("得票数")}
        ${res.counts.length ? res.counts.map((c) => L(`${esc(c.name)} <span class="rs-dim">:</span> <span class="rs-vote">${c.c}票</span>`)).join("") : none("得票はありません。")}
        ${sep}
        <div class="rs-win t-${winTeam}">${esc(res.title)}</div>
        ${L(`<span class="rs-info">勝利陣営:</span> ${esc(res.teams.join("＆") || "なし")}`)}
        ${L(`<span class="rs-good">勝者:</span> ${res.winners.map(esc).join("、") || "なし"}`)}
        ${L(`<span class="rs-dead">敗者:</span> ${res.losers.map(esc).join("、") || "なし"}`)}
        ${sep}${H("役職履歴")}
        ${(res.gremlins || []).map((x) => L(`<span class="rs-info">グレムリン:</span> ${esc(x.gremlin)} は ${esc(x.from)} → ${esc(x.to)} を選んでいました。`)).join("")}
        ${(res.execs || []).map((x) => L(`<span class="rs-info">処刑人:</span> ${esc(x.exec)} のターゲットは ${esc(x.target)} でした。${x.win ? "ターゲットが追放（処刑）されたので処刑人の勝利です。" : x.dead ? "ターゲットが追放以外で死亡したので処刑人は敗北です。" : "ターゲットは追放されませんでした。"}`)).join("")}
        ${(res.servantSubs || []).map((x) => L(`<span class="rs-info">従者:</span> ${esc(x.servant)} が ${esc(x.master)} の身代わりになりました。`)).join("")}
        ${(res.chainSubs || []).map((x) => L(`<span class="rs-info">従者:</span> ${esc(x.servant)} が ${esc(x.master)} の道連れの身代わりになりました。`)).join("")}
        ${res.history.map((h) => L(`${esc(h.name)} ${chain(h.segs)} <span class="${h.dead ? "rs-dead" : "rs-alive"}">${h.status}</span>`)).join("")}
        ${sep}
        ${res.grave.map((c) => L(`${c.label} ${chain(c.segs)}`)).join("")}
        ${none("欠け: なし")}
        ${sep}${H("夜行動結果")}
        ${res.nightLogs.length ? res.nightLogs.map((t) => L(esc(t))).join("") : none("夜行動ログはありません。")}
        ${/* 【昇格情報】結果画面の一番下。今後「姫君 → 女王」などの昇格を足すときも、ここ（昇格情報）に1行ずつ並べる */ ""}
        ${res.promoted.length ? `${sep}${H("昇格情報")}${L(`<span class="rs-dim">[狂人昇格] 今回は</span> ${res.promoted.map(esc).join("、")} <span class="rs-dim">が人狼判定になっていました。</span>`)}` : ""}
        ${sep}${H("試合のチャット")}
        <div class="btn-row"><button class="btn" onclick="ONW.ui.openResultChat()">チャットを見る</button></div>
      </section>
      <div class="res-dock">
        <div class="btn-row">
          <button class="btn" onclick="ONW.png.save(ONW.game.result)">PNGで保存</button>
          <button class="btn" onclick="ONW.main.goToTitle()">退出</button>
          <button class="btn btn--primary" onclick="ONW.net.returnToRoom()">${game.isSpectator ? "ルームに入る" : "ルームに戻る"}</button>
        </div>
      </div>`;
  };

  // ---------------------------------------------------------
  // セットアップ画面（人数・役職構成）
  // ---------------------------------------------------------
  ui.renderSetup = function renderSetup(game) {
    const roleChips = Object.keys(ONW.ROLE_INFO).filter((r) => r !== "drunk" && r !== "lover").map((role) => {
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
