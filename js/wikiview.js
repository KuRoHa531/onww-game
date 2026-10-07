/**
 * wikiview.js
 * ------------------------------------------------------------
 * 「ワンナイト人狼ガイド」を「ゲーム画面に重ねて」表示するオーバーレイ。
 * 本家(マイクラ版)の「ワンナイト人狼ガイド」と同じく、ゲーム中でも見られる。
 *
 *   ルーム設定  … 今のルームの設定(人数・タイマー・詳細設定・変化先の有無)。見るだけ
 *   現在の配役  … 今のルームに入っている役職と枚数(本家の「配役役職の説明」と同じ考え方)
 *   全役職      … 全役職の一覧(同梱している wiki/index.html?embed=1 を iframe で表示)
 *
 * 画面(#app)は再描画されても、これは body 直下にあるので消えない。
 *
 *   ONW.wikiView.open(tab?)  … 開く(tab: "room" | "deck" | "all")
 *   ONW.wikiView.close()     … 閉じる(×ボタン / 外側タップ / Esc)
 *
 * 「全役職」側の「ウェブ版」絞り込みは、このゲームの ONW.ROLE_INFO を親フレームから
 * 直接読んで判定する(wiki/js/wiki.js 参照)。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const wikiView = {};
  const WIKI_URL = "wiki/index.html?embed=1";
  const TABS = [["room", "ルーム設定"], ["deck", "現在の配役"], ["all", "全役職"]];
  let root = null, frame = null, lastFocus = null, tab = null;
  const openRoles = new Set();   // 「現在の配役」で説明を開いている役職(再描画しても開いたままにする)

  const esc = (s) => ONW.utils.esc(s);
  const info = (r) => ONW.roles.getInfo(r);

  // ---------------------------------------------------------
  // 状態の判定
  // ---------------------------------------------------------
  const phase = () => ONW.game.phase;
  /** ルームの中(ロビー or オンラインの試合中)にいるか */
  const inRoom = () => { const p = phase(); return p === ONW.PHASE.LOBBY || String(p).indexOf("online_") === 0; };
  /** 昼の開始以降か(本家の canRevealTransformGuideDetails: 昼 or 終了後) */
  function afterDayStart() {
    const g = ONW.game, P = ONW.PHASE;
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(g.phase)) return true;
    return g.phase === P.ONLINE_SPECTATE && [P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(g.specPhase);
  }

  // ---------------------------------------------------------
  // ルーム設定(見るだけ)
  // ---------------------------------------------------------
  const onoff = (v) => `<span class="gd-v ${v ? "gd-on" : "gd-off"}">${v ? "ON" : "OFF"}</span>`;
  const line = (label, value) => `<div class="gd-row"><span class="gd-l">${label}</span><span class="gd-r">${value}</span></div>`;
  const sec = (title, inner) => `<section class="gd-sec"><h3 class="gd-h">${title}</h3>${inner}</section>`;

  /** 重複役職の設定表示: 「2人（確率100%）」/ 0なら「なし」 */
  const dupText = (n, unit, chance) => (n > 0 ? `${n}${unit}（${unit === "組" ? "恋人になる" : "酔っ払いになる"}確率 ${chance ?? 100}%）` : "なし");
  function roomHtml() {
    const g = ONW.game, P = ONW.PHASE;
    const cpu = g.cpuCount || 0;
    const humans = g.phase === P.LOBBY
      ? (g.lobbyPlayers || []).filter((p) => !p.spec).length
      : (g.players || []).filter((p) => !p.isCpu).length;
    const total = g.phase === P.LOBBY ? humans + cpu : (g.players || []).length;
    const t = g.timers || {};
    const off = g.transformOff || [];
    const TG = ONW.TRANSFORM_GROUPS;
    // 闇の化身の変化先は、人狼系と狂人系に分けて並べる（ルーム設定画面の「変化先の有無」と同じ）
    const MAD = ONW.MAD_KIND || [];
    const tfBlocks = [
      { b: "light_apostle", label: "", list: TG.light_apostle },
      { b: "dark_avatar", label: "（人狼系）", list: TG.dark_avatar.filter((r) => !MAD.includes(r)) },
      { b: "dark_avatar", label: "（狂人系）", list: TG.dark_avatar.filter((r) => MAD.includes(r)) },
      { b: "silver_shadow", label: "", list: TG.silver_shadow },
    ].filter((x) => x.list && x.list.length);
    const tf = tfBlocks.map(({ b, label, list }) => `
      <div class="gd-tf"><div class="gd-tf__name t-${info(b).team}">${esc(info(b).name)}の変化先${label}</div>
        <div class="gd-tf__chips">${list.map((r) => {
          const on = !off.includes(`${b}:${r}`);
          return `<span class="gd-chip ${on ? "gd-chip--on" : "gd-chip--off"}">${esc(info(r).name)} ${on ? "ON" : "OFF"}</span>`;
        }).join("")}</div></div>`).join("");
    const seerMax = g.seerGraveCount ?? 2;
    return `
      <p class="gd-note">${g.phase === P.LOBBY ? "設定の変更はホストが、ロビーの「ルーム設定」から行います。" : "試合中は設定を変更できません(確認のみ)。"}</p>
      ${sec("人数設定", line("参加人数", `${total}人${cpu ? `（CPU ${cpu}人を含む）` : ""}`) + line("墓地の枚数", `${g.graveCount ?? 0}枚`) + line("CPU人数", `${cpu}人`))}
      ${sec("タイマー設定", line("夜時間", `${t.night ?? "―"}秒`) + line("朝時間", `${t.morning ?? "―"}秒`) + line("昼・議論", `${t.day ?? "―"}秒`) + line("夕方・投票", `${t.vote ?? "―"}秒`))}
      ${sec("重複役職設定", line("酔っ払い", dupText(g.drunkCount, "人", g.drunkChance)) + line("恋人", dupText(g.loverCount, "組", g.loverChance)))}
      ${sec("詳細設定", line("狂人昇格", onoff(g.fakeWolfWhenNoWolf)) + line("占い師が占える墓地の枚数", `${seerMax}枚`) + line("変化公開", onoff(g.revealTransforms)) + line("デバッグモード", onoff(g.debugOn)))}
      ${sec("変化先の有無", tf)}`;
  }

  // ---------------------------------------------------------
  // 現在の配役(本家の「配役役職の説明」= getCurrentRoleDescriptionCounts と同じ考え方)
  //   ・配役設定の枚数を並べる
  //   ・変化公開ONで昼の開始以降なら、変化後の役職で数え直す
  //   ・変化公開OFFなら、光の使徒・闇の化身・銀色の影がいるとき「変化候補」も並べる
  // ---------------------------------------------------------
  const ORDER = {
    village: ["light_apostle", "villager", "seer", "robber", "relic_robber", "troublemaker", "insomniac", "mason", "merlin", "wolf_dreamer", "wolf_marked", "straw_doll", "cat_sidhe", "baker", "star", "newspaper", "chicken", "mayor", "visitor", "queen", "tough_guy"],
    wolf: ["dark_avatar", "werewolf", "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf", "forgetful_wolf", "assassin", "wolf_king", "mapo_wolf", "observer_wolf", "cat_pumpkin", "madman", "mad_seer", "cultist", "black_cat"],
    third: ["silver_shadow", "tanner", "love_tanner", "god", "opportunist", "amanojaku", "freeter", "servant", "winner", "loser", "doppelganger", "schrodinger_cat", "executioner", "gremlin"],
  };
  const TEAM_TITLE = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" };

  function deckCounts() {
    const g = ONW.game, counts = {};
    Object.entries(g.roleCounts || {}).forEach(([r, n]) => { if (n > 0) counts[r] = n; });
    const tf = g.tfView;
    if (g.revealTransforms && afterDayStart() && tf && tf.mode === "reveal" && Array.isArray(tf.pairs)) {
      tf.pairs.forEach(({ b, a }) => {
        if (counts[b] > 0) { counts[b] -= 1; if (counts[b] <= 0) delete counts[b]; }
        counts[a] = (counts[a] || 0) + 1;
      });
    }
    return counts;
  }

  function deckHtml() {
    const g = ONW.game, counts = deckCounts();
    const totalRoles = Object.values(counts).reduce((a, b) => a + b, 0);
    if (g.drunkCount > 0) counts.drunk = g.drunkCount;
    if (g.loverCount > 0) counts.lover = g.loverCount;   // 重複役職（配役の枚数には数えないが、構成には出す）
    const grave = Math.max(0, Number(g.graveCount) || 0);
    if (totalRoles <= 0) return `<p class="gd-empty">現在配役されている役職はありません。</p>`;

    // 変化候補(変化公開OFFのとき。すでに配役にいる役職は除く)
    const cands = [];
    if (!g.revealTransforms) {
      ["light_apostle", "dark_avatar", "silver_shadow"].forEach((b) => {
        if (!(counts[b] > 0)) return;
        ONW.roles.enabledTargets(g, b).forEach((r) => { if (!counts[r] && !cands.includes(r)) cands.push(r); });
      });
    }

    const rowOf = (r, tagHtml) => {
      const i = info(r);
      return `<details class="gd-role" ${openRoles.has(r) ? "open" : ""} ontoggle="ONW.wikiView._tg('${r}',this.open)">
        <summary><span class="gd-name t-${i.team}">${esc(i.name)}</span>${tagHtml}</summary>
        <div class="gd-desc">${esc(ONW.roleDesc(r, g) || i.desc || "説明はありません。")}</div></details>`;
    };
    const teamBlock = (team) => {
      const list = [...ORDER[team]];
      Object.keys(ONW.ROLE_INFO).forEach((r) => { if (info(r).team === team && r !== "drunk" && r !== "lover" && !list.includes(r)) list.push(r); });   // 酔っ払いは重複役職として別枠
      const have = list.filter((r) => counts[r] > 0);
      const cand = list.filter((r) => cands.includes(r));
      if (!have.length && !cand.length) return "";
      return `<section class="gd-team t-${team}"><h3 class="gd-h">${TEAM_TITLE[team]}</h3>
        ${have.map((r) => rowOf(r, `<span class="gd-n">×${counts[r]}</span>`)).join("")}
        ${cand.map((r) => rowOf(r, `<span class="gd-n gd-n--cand">変化候補</span>`)).join("")}</section>`;
    };
    // 重複役職（第三陣営の外に、独立したグループとして出す）
    const dupBlock = () => (counts.drunk > 0 || counts.lover > 0) ? `<section class="gd-team t-dup"><h3 class="gd-h">重複役職</h3>
        ${counts.drunk > 0 ? rowOf("drunk", `<span class="gd-n">×${counts.drunk}人</span><span class="gd-n gd-n--cand">確率${g.drunkChance ?? 100}%</span>`) : ""}${counts.lover > 0 ? rowOf("lover", `<span class="gd-n">×${counts.lover}組</span><span class="gd-n gd-n--cand">確率${g.loverChance ?? 100}%</span>`) : ""}</section>` : "";
    return `
      <p class="gd-summary">現在の配役設定 <b>${Math.max(0, totalRoles - grave)}人村 / 墓地${grave}枚 / 役職${totalRoles}枚</b></p>
      <p class="gd-note">現在の配役に含まれる役職です。役職名を押すと説明が開きます。${!g.revealTransforms && cands.length ? "「変化候補」は、変化役の変化先として出る可能性がある役職です。" : ""}${g.revealTransforms && !afterDayStart() ? "変化公開がONなので、変化後の役職は昼の開始時に反映されます。" : ""}</p>
      ${["village", "wolf", "third"].map(teamBlock).join("")}${dupBlock()}`;
  }

  // ---------------------------------------------------------
  // 画面の組み立て
  // ---------------------------------------------------------
  function build() {
    root = document.createElement("div");
    root.className = "wikiv";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "ワンナイト人狼ガイド");
    root.innerHTML = `
      <div class="wikiv__box">
        <div class="wikiv__bar">
          <span class="wikiv__title">📖 ワンナイト人狼ガイド</span>
          <button class="wikiv__close" type="button" aria-label="閉じる" title="閉じる">✕</button>
        </div>
        <div class="wikiv__tabs" role="tablist">
          ${TABS.map(([k, l]) => `<button class="wikiv__tab" type="button" role="tab" data-tab="${k}">${l}</button>`).join("")}
        </div>
        <div class="wikiv__body">
          <div class="wikiv__pane" data-pane="room"></div>
          <div class="wikiv__pane" data-pane="deck"></div>
          <iframe class="wikiv__frame" data-pane="all" title="全役職"></iframe>
        </div>
      </div>`;
    document.body.appendChild(root);
    frame = root.querySelector(".wikiv__frame");

    root.querySelector(".wikiv__close").addEventListener("click", wikiView.close);
    root.querySelectorAll(".wikiv__tab").forEach((b) => b.addEventListener("click", () => wikiView.setTab(b.getAttribute("data-tab"))));

    // 外側(暗い部分)をタップで閉じる。中で押してから外で離しただけでは閉じない
    let downOnBackdrop = false;
    root.addEventListener("pointerdown", (e) => { downOnBackdrop = e.target === root; });
    root.addEventListener("click", (e) => { if (e.target === root && downOnBackdrop) wikiView.close(); });

    // Esc(ゲーム側にフォーカスがある時 / iframe 内で押された時の通知)
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && wikiView.isOpen()) wikiView.close(); });
    window.addEventListener("message", (e) => {
      if (frame && e.source === frame.contentWindow && e.data && e.data.onwWiki === "close") wikiView.close();
    });
  }

  function paint() {
    if (!root) return;
    root.querySelectorAll(".wikiv__tab").forEach((b) => {
      const on = b.getAttribute("data-tab") === tab;
      b.classList.toggle("on", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    root.querySelectorAll("[data-pane]").forEach((p) => p.classList.toggle("on", p.getAttribute("data-pane") === tab));
    if (tab === "all") {
      if (!frame.getAttribute("src")) frame.setAttribute("src", WIKI_URL);   // 初回だけ読み込む
      return;
    }
    const pane = root.querySelector(`[data-pane="${tab}"]`);
    const html = inRoom()
      ? (tab === "room" ? roomHtml() : deckHtml())
      : `<p class="gd-empty">${tab === "room" ? "ルーム設定" : "現在の配役"}は、ルームに入ると見られます。<br>役職の一覧は「全役職」で確認できます。</p>`;
    if (pane.__html === html) return;   // 変わっていなければ触らない(スクロール位置を保つ)
    pane.__html = html;
    pane.innerHTML = html;
  }

  wikiView.setTab = function (t) {
    if (!TABS.some(([k]) => k === t)) return;
    tab = t;
    paint();
  };
  wikiView._tg = (r, open) => { if (open) openRoles.add(r); else openRoles.delete(r); };

  wikiView.isOpen = () => !!root && root.classList.contains("open");

  wikiView.open = function (t) {
    if (!root) build();
    if (t && TABS.some(([k]) => k === t)) tab = t;
    else if (!tab) tab = inRoom() ? "deck" : "all";
    if (!inRoom() && tab !== "all") tab = "all";   // ルームの外では「全役職」から
    paint();
    lastFocus = document.activeElement;
    root.classList.add("open");
    root.querySelector(".wikiv__close").focus({ preventScroll: true });
  };

  wikiView.close = function () {
    if (!root) return;
    root.classList.remove("open");
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* 無視 */ } }
    lastFocus = null;
  };

  // 開いている間に、設定・配役・変化公開が変わったら追従させる(ゲームの画面が更新されるたびに確認)
  if (ONW.ui && ONW.ui.render) {
    const baseRender = ONW.ui.render;
    ONW.ui.render = function () {
      const r = baseRender.apply(this, arguments);
      if (wikiView.isOpen()) paint();
      return r;
    };
  }
  // 変化公開や配役の更新(コボード等)は ui.render を通らないことがあるので、開いている間だけ軽く見張る
  setInterval(() => { if (wikiView.isOpen() && tab !== "all") paint(); }, 1000);

  ONW.wikiView = wikiView;

})(window.ONW);
