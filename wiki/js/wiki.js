/**
 * wiki.js
 * ------------------------------------------------------------
 * ワンナイト人狼ガイド「全役職」ページ(wiki/index.html)の表示ロジック。
 * データは js/wiki-data.js の window.ONW_WIKI_ROLES を使う。
 * 元データ(アドオンの state.js)から機械的に転記したものなので、
 * ここでは表示・検索・絞り込み・並び替えだけを行い、内容の書き換えはしない。
 * ------------------------------------------------------------
 */
(function () {
  const roles = window.ONW_WIKI_ROLES || [];

  const TEAM_LABEL = {
    village: "村人陣営",
    wolf: "人狼陣営",
    third: "第三陣営",
  };

  const SORT_LABEL = {
    kana: "五十音順",
    impl: "ゲーム内順",
  };

  const SEARCH_SCOPE_DEFS = [
    { id: "name", label: "役職名" },
    { id: "desc", label: "役職説明" },
    { id: "achievement", label: "実績名" },
  ];

  // ゲーム内順での大分類: 村人 → 人狼 → 狂人 → 第三陣営。
  // (「陣営なし」は廃止。ドッペルゲンガーは第三陣営として扱う)
  // team="wolf" の中で「人狼」と「狂人」をさらに分けるための一覧
  // (アドオン utils.js の isRealWolfRole / isMadRole と同じ内訳)。
  const REAL_WOLF_KEYS = new Set([
    "WEREWOLF", "BIG_WOLF", "LONE_WOLF", "WHITE_WOLF", "TOFU_WOLF", "NEGI_WOLF", "FORGETFUL_WOLF",
    "ASSASSIN", "WOLF_KING", "MAPO_WOLF", "CAT_PUMPKIN", "OBSERVER_WOLF", "MIND_WOLF", "MIMIC_WOLF",
    "ERASER_WOLF", "MIRAGE_WOLF", "SILVER_WOLF", "COMMAND_WOLF", "CURSE_WOLF", "SAM", "PATCH",
  ]);
  const MAD_KEYS = new Set([
    "MADMAN", "MAD_SEER", "CULTIST", "BLACK_CAT", "CRAZY_DONUT_SHOP", "EXPOSED_MADMAN", "MUZZLE_MADMAN",
    "REBEL_MADMAN", "MAD_QUEEN", "BLACK_WOLF_MADMAN", "MAD_MAYOR", "SEAL_MADMAN", "RAT_MADMAN", "OX_MADMAN",
    "TIGER_MADMAN", "RABBIT_MADMAN", "DRAGON_MADMAN", "SNAKE_MADMAN", "HORSE_MADMAN", "SHEEP_MADMAN",
    "MONKEY_MADMAN", "ROOSTER_MADMAN", "DOG_MADMAN", "BOAR_MADMAN", "MAD_EXCHANGER", "TENACIOUS_MADMAN",
    "JESTER_MADMAN", "SMOKE_MADMAN", "MAD_PRIEST", "MAD_AGITATOR",
  ]);

  function implCategoryOf(role) {
    if (role.team === "village") return 0;
    if (role.key === "SAM") return 3; // サムは人狼陣営だが特殊: 実装順ではホタルの直後(第三と同じ並びに入れる)
    if (role.team === "wolf") return MAD_KEYS.has(role.key) ? 2 : 1; // 1:人狼 2:狂人
    return 3; // third（ドッペルゲンガーもここに含まれる）
  }

  // --- 絞り込み方（team とは別軸の「候補」系フィルター）------------------
  // 元アドオン(scripts/night.js, scripts/state.js)のロジックから機械的に転記した
  // 候補一覧。ここでの判定は本文の推測ではなく、実際のコードが参照している
  // 一覧そのもの（shufflerEligibleRoles / mimicWolfCandidateRoles+NON_MIMICABLE_ROLES
  // / cosplayerEligibleRoles）に基づく。
  const SHUFFLE_CANDIDATE_KEYS = new Set([
    "WEREWOLF", "BIG_WOLF", "LONE_WOLF", "WHITE_WOLF", "TOFU_WOLF", "NEGI_WOLF", "FORGETFUL_WOLF",
    "MADMAN", "BLACK_CAT", "VILLAGER", "HAYATOCHIRI", "BELL_MIKO", "WHIMSICAL_SEER", "INSOMNIAC",
    "TANNER", "STRAW_DOLL", "CAT_SIDHE", "WOLF_DREAMER", "WOLF_MARKED", "GOD", "OPPORTUNIST",
    "AMANOJAKU", "BAKER", "DONUT_SHOP", "CRAZY_DONUT_SHOP", "STAR", "SERVANT", "CHICKEN",
    "NEWSPAPER", "NECROMANCER", "WRAITH", "WINNER", "LOSER", "SCHRODINGER_CAT", "MAYOR",
    "EXECUTIONER", "WOLF_KING", "QUEEN", "TOUGH_GUY", "BOUNTY_HUNTER", "FOX", "FANATIC",
    "FOX_MARKED", "KEYMASTER", "MUZZLE_MADMAN", "DICTATOR", "REBEL_MADMAN", "EXCHANGER",
    "MAD_EXCHANGER", "MAD_QUEEN", "BLACK_WOLF_MADMAN", "MAD_MAYOR", "SEAL_MADMAN", "RAT_MADMAN",
    "OX_MADMAN", "TIGER_MADMAN", "SNAKE_MADMAN", "HORSE_MADMAN", "SHEEP_MADMAN", "MONKEY_MADMAN",
    "ROOSTER_MADMAN", "BOAR_MADMAN", "MAPO_WOLF", "PENGUIN", "WATCHDOG", "SHERIFF", "BALANCER",
    "CURSED_ONE", "THIEF", "CAT_PUMPKIN", "OBSERVER_WOLF", "JESTER_BOMBER", "DETECTIVE",
    "SENSE_SEER", "PRINCESS", "FINGER_READER", "GAMBLER", "FAIRY", "AA", "GORANSHIN", "STEVE",
    "DEMON_DUKE", "MARTYR", "ODD_ONE", "EVEN_ONE", "DETECTIVE_GHOST", "LIBRA", "PREDICTOR",
    "LAWYER", "TENACIOUS_MADMAN", "JESTER_MADMAN", "MIND_WOLF", "POET", "SERIAL_KILLER",
    "PROFILER", "VANITY", "MULTI_PERSONALITY", "BEGGAR", "MAGICAL_GIRL", "YOKAI_TANUKI",
    "SMOKE_MADMAN", "SILVER_WOLF", "CURSE_WOLF", "ICARUS", "ELECTION_MANAGER", "MOSES", "REN",
    "LONG_NIGHT_MOON", "MITSUKI_NANOKA", "RASETSU", "YOMI", "KNIGHT", "HOKMA", "PSYCHOLOGIST",
    "MEDIUM", "AGENT", "HOTARU", "THREAD_SPINNER", "PERSONA", "HUNTER", "COUNSELOR",
  ]);

  const MIMIC_CANDIDATE_KEYS = new Set([
    "BIG_WOLF", "LONE_WOLF", "WHITE_WOLF", "TOFU_WOLF", "NEGI_WOLF", "FORGETFUL_WOLF", "ASSASSIN",
    "MAD_SEER", "BLACK_CAT", "SEER", "APPRENTICE_SEER", "LOOKOUT", "BELL_MIKO", "WHIMSICAL_SEER",
    "ROBBER", "RELIC_ROBBER", "TROUBLEMAKER", "INSOMNIAC", "MASON", "STRAW_DOLL", "CAT_SIDHE",
    "MERLIN", "WOLF_DREAMER", "BAKER", "DONUT_SHOP", "CRAZY_DONUT_SHOP", "STAR", "CHICKEN",
    "NEWSPAPER", "NECROMANCER", "MAYOR", "VISITOR", "WOLF_KING", "EXPOSED_MADMAN", "QUEEN",
    "TOUGH_GUY", "KEYMASTER", "MUZZLE_MADMAN", "DICTATOR", "REBEL_MADMAN", "EXCHANGER",
    "MAD_EXCHANGER", "MAD_QUEEN", "MAD_MAYOR", "SEAL_MADMAN", "RAT_MADMAN", "OX_MADMAN",
    "TIGER_MADMAN", "RABBIT_MADMAN", "DRAGON_MADMAN", "SNAKE_MADMAN", "HORSE_MADMAN",
    "SHEEP_MADMAN", "MONKEY_MADMAN", "ROOSTER_MADMAN", "DOG_MADMAN", "BOAR_MADMAN", "MAPO_WOLF",
    "PENGUIN", "WATCHDOG", "SHERIFF", "THIEF", "CAT_PUMPKIN", "OBSERVER_WOLF", "SENSE_SEER",
    "MAJOR", "FINGER_READER", "GAMBLER", "FAIRY", "AA", "GORANSHIN", "STEVE", "LIBRA", "FAKE_SEER",
    "TENACIOUS_MADMAN", "MIND_WOLF", "POET", "PROFILER", "COSPLAYER", "SMOKE_MADMAN",
    "ERASER_WOLF", "MIRAGE_WOLF", "SILVER_WOLF", "COMMAND_WOLF", "CURSE_WOLF", "ICARUS",
    "ELECTION_MANAGER", "MOSES", "REN", "AGITATOR", "MAD_AGITATOR", "YOMI", "TRAILBLAZER",
    "HOKMA", "BARTENDER", "PSYCHOLOGIST", "MEDIUM", "SAM", "PATCH", "HUNTER", "COUNSELOR",
    "TRAP_MASTER",
  ]);

  const COSPLAY_CANDIDATE_KEYS = new Set([
    "SEER", "APPRENTICE_SEER", "LOOKOUT", "BELL_MIKO", "WHIMSICAL_SEER", "ROBBER", "RELIC_ROBBER",
    "TROUBLEMAKER", "INSOMNIAC", "BAKER", "DONUT_SHOP", "AGITATOR", "STAR", "NEWSPAPER", "MAYOR",
    "VISITOR", "QUEEN", "TOUGH_GUY", "DICTATOR", "EXCHANGER", "PENGUIN", "WATCHDOG", "SHERIFF",
    "THIEF", "SENSE_SEER", "PRINCESS", "MAJOR", "FINGER_READER", "GAMBLER", "FAIRY", "LIBRA",
    "FAKE_SEER", "POET", "AA", "GORANSHIN", "STEVE", "ICARUS", "ELECTION_MANAGER", "MOSES", "YOMI",
    "CARMEN", "KNIGHT", "TRAILBLAZER", "HOKMA", "PSYCHOLOGIST", "MEDIUM", "HAYATOCHIRI",
    "NECROMANCER", "COUNSELOR", "REN", "TRAP_MASTER",
  ]);

  function isShuffleCandidate(role) { return SHUFFLE_CANDIDATE_KEYS.has(role.key); }
  function isMimicCandidate(role) { return MIMIC_CANDIDATE_KEYS.has(role.key); }
  function isCosplayCandidate(role) { return COSPLAY_CANDIDATE_KEYS.has(role.key); }

  const FILTER_DEFS = [
    { id: "all", label: "すべて", test: () => true },
    { id: "village", label: TEAM_LABEL.village, test: (r) => r.team === "village" },
    { id: "wolf", label: TEAM_LABEL.wolf, test: (r) => r.team === "wolf" },
    { id: "third", label: TEAM_LABEL.third, test: (r) => r.team === "third" },
    { id: "shuffle", label: "シャッフル候補", test: isShuffleCandidate },
    { id: "mimic", label: "模倣候補", test: isMimicCandidate },
    { id: "cosplay", label: "コスプレ候補", test: isCosplayCandidate },
  ];
  const FILTER_BY_ID = Object.fromEntries(FILTER_DEFS.map((f) => [f.id, f]));

  // --- ウェブ版に実装されている役職 ----------------------------------------
  // ゲーム内(iframe)で開かれている時は、ゲーム本体の ONW.ROLE_INFO から直接取る
  // (= ゲームに役職を足せば、辞典側の「ウェブ版」にも自動で反映される)。
  // 単体公開など親が見えない時は js/web-roles.js の一覧を使う。
  function loadWebKeys() {
    try {
      const parentOnw = window.parent && window.parent !== window ? window.parent.ONW : null;
      if (parentOnw && parentOnw.ROLE_INFO) {
        const keys = Object.keys(parentOnw.ROLE_INFO).map((k) => k.toUpperCase());
        if (keys.length > 0) return new Set(keys);
      }
    } catch (e) { /* 別オリジンなどで親に触れない → 予備の一覧へ */ }
    return new Set(window.ONW_WEB_ROLE_KEYS || []);
  }
  const WEB_KEYS = loadWebKeys();
  function isWebRole(role) { return WEB_KEYS.has(role.key); }

  // ゲーム内オーバーレイ(?embed=1)として開かれている時の見た目調整 + Escで閉じる合図
  const isEmbed = /[?&]embed=1(&|$)/.test(location.search);
  if (isEmbed) {
    document.body.classList.add("is-embed");
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && window.parent !== window) window.parent.postMessage({ onwWiki: "close" }, "*");
    });
  }

  const state = {
    query: "",
    filter: "all",
    webOnly: true,   // 「ウェブ版」絞り込み(初期状態でON = ウェブ版にある役職だけ表示)
    sort: "impl",
    sortPanelOpen: false,
    filterPanelOpen: false,
    openKeys: new Set(),
    openAchievements: new Set(),
    searchScopes: new Set(["name"]),
  };

  // 「五十音順」= wiki-data.js の元々の並び順(配列インデックス)。
  // 「ゲーム内順」= アドオンのROLE_ORDER(役職選択画面の並び)を示すorderフィールド。
  const kanaIndexByKey = {};
  roles.forEach((r, i) => { kanaIndexByKey[r.key] = i; });

  const $list = document.getElementById("wiki-list");
  const $empty = document.getElementById("empty-state");
  const $count = document.getElementById("role-count");
  const $filters = document.getElementById("team-filters");
  const $webFilter = document.getElementById("web-filter");
  const $webFilterNote = document.getElementById("web-filter-note");
  const $sortToggle = document.getElementById("sort-toggle");
  const $search = document.getElementById("search-input");
  const $searchScope = document.getElementById("search-scope");
  const $sortPanelToggle = document.getElementById("sort-panel-toggle");
  const $sortPanel = document.getElementById("sort-panel");
  const $filterPanelToggle = document.getElementById("filter-panel-toggle");
  const $filterPanel = document.getElementById("filter-panel");

  function buildWebFilter() {
    $webFilter.innerHTML = `<button class="wiki-filter ${state.webOnly ? "active" : ""}" type="button" aria-pressed="${state.webOnly}" data-web-toggle>ウェブ版</button>`;
    $webFilterNote.textContent = state.webOnly
      ? "ウェブ版に実装されている役職だけを表示中(タップでオフ)"
      : "ウェブ版にない役職も含めて、すべての役職を表示中";
    $webFilter.querySelector("[data-web-toggle]").addEventListener("click", () => {
      state.webOnly = !state.webOnly;
      buildWebFilter();
      buildFilters();
      buildControlsToggle();
      render();
    });
  }

  function buildFilters() {
    const scope = state.webOnly ? roles.filter(isWebRole) : roles;
    // ウェブ版ONで該当役職が無くなる絞り込み(例: ウェブ版に無い候補系)は出さない
    const visible = FILTER_DEFS.filter((f) => f.id === "all" || scope.some((r) => f.test(r)));
    if (!visible.some((f) => f.id === state.filter)) state.filter = "all";
    $filters.innerHTML = visible
      .map((f) => `<button class="wiki-filter ${f.id === state.filter ? "active" : ""}" data-filter="${f.id}">${f.label}</button>`)
      .join("");

    $filters.querySelectorAll(".wiki-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.filter = btn.dataset.filter;
        buildFilters();
        render();
      });
    });
  }

  function buildControlsToggle() {
    if ($sortPanelToggle && $sortPanel) {
      $sortPanelToggle.setAttribute("aria-expanded", String(state.sortPanelOpen));
      $sortPanelToggle.textContent = `並び替え ${state.sortPanelOpen ? "▲" : "▼"}`;
      $sortPanel.hidden = !state.sortPanelOpen;
    }
    if ($filterPanelToggle && $filterPanel) {
      $filterPanelToggle.setAttribute("aria-expanded", String(state.filterPanelOpen));
      const webMark = state.webOnly ? "(ウェブ版)" : "";
      $filterPanelToggle.textContent = `絞り込み${webMark} ${state.filterPanelOpen ? "▲" : "▼"}`;
      $filterPanel.hidden = !state.filterPanelOpen;
    }
  }

  function buildSearchScope() {
    $searchScope.innerHTML = SEARCH_SCOPE_DEFS
      .map((s) => `<button class="wiki-filter ${state.searchScopes.has(s.id) ? "active" : ""}" data-scope="${s.id}">${s.label}</button>`)
      .join("");

    $searchScope.querySelectorAll("[data-scope]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.dataset.scope;
        if (state.searchScopes.has(id)) {
          if (state.searchScopes.size > 1) state.searchScopes.delete(id);
        } else {
          state.searchScopes.add(id);
        }
        buildSearchScope();
        render();
      });
    });
  }

  function buildSortToggle() {
    const modes = ["kana", "impl"];
    $sortToggle.innerHTML = modes
      .map((m) => `<button class="wiki-filter ${m === state.sort ? "active" : ""}" data-sort="${m}">${SORT_LABEL[m]}</button>`)
      .join("");

    $sortToggle.querySelectorAll(".wiki-filter").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.sort = btn.dataset.sort;
        buildSortToggle();
        render();
      });
    });
  }

  function matches(role) {
    if (state.webOnly && !isWebRole(role)) return false;
    const def = FILTER_BY_ID[state.filter] ?? FILTER_BY_ID.all;
    if (!def.test(role)) return false;
    if (!state.query) return true;
    const q = state.query.toLowerCase();
    const scopes = state.searchScopes;
    if (scopes.has("name") && role.name.toLowerCase().includes(q)) return true;
    if (scopes.has("desc") && role.desc.toLowerCase().includes(q)) return true;
    if (scopes.has("achievement") && (role.achievements || []).some((a) => a.name.toLowerCase().includes(q))) return true;
    return false;
  }

  function sortRoles(list) {
    const sorted = [...list];
    if (state.query) {
      // 検索中は「名前が一致する役職」を優先度順に先頭へ。
      // 0:名前完全一致 1:名前前方一致 2:名前部分一致
      const q = state.query.toLowerCase();
      const relevanceOf = (role) => {
        const name = role.name.toLowerCase();
        if (name === q) return 0;
        if (name.startsWith(q)) return 1;
        return 2;
      };
      sorted.sort((a, b) => {
        const diff = relevanceOf(a) - relevanceOf(b);
        if (diff !== 0) return diff;
        return sortComparator(a, b);
      });
      return sorted;
    }
    sorted.sort(sortComparator);
    return sorted;
  }

  function sortComparator(a, b) {
    if (state.sort === "impl") {
      const diff = implCategoryOf(a) - implCategoryOf(b);
      if (diff !== 0) return diff;
      return (a.order ?? 9999) - (b.order ?? 9999);
    }
    return kanaIndexByKey[a.key] - kanaIndexByKey[b.key];
  }

  function render() {
    const filtered = sortRoles(roles.filter(matches));
    $count.textContent = `${filtered.length}件`;
    $empty.hidden = filtered.length !== 0;
    $empty.textContent = state.webOnly
      ? "該当する役職が見つかりませんでした。(「絞り込み」のウェブ版がオンです)"
      : "該当する役職が見つかりませんでした。";

    $list.innerHTML = filtered
      .map((role) => {
        const open = state.openKeys.has(role.key);
        return `
        <article class="wiki-card" data-team="${role.team}">
          <button class="wiki-card__head" type="button" data-toggle="${role.key}" aria-expanded="${open}">
            <span class="wiki-card__name">${escapeHtml(role.name)}</span>
            <span class="wiki-card__head-right">
              <span class="tag-team tag-team--${role.team}">${TEAM_LABEL[role.team] ?? role.team}</span>
              <span class="wiki-card__arrow">${open ? "▲" : "▼"}</span>
            </span>
          </button>
          ${renderMatchHits(role)}
          ${open ? `
          <div class="wiki-card__body">
            <p class="wiki-card__desc">${escapeHtml(role.desc)}</p>
            ${renderAchievements(role)}
          </div>` : ""}
        </article>
      `;
      })
      .join("");

    $list.querySelectorAll("[data-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const key = btn.dataset.toggle;
        if (state.openKeys.has(key)) {
          state.openKeys.delete(key);
        } else {
          state.openKeys.add(key);
        }
        render();
      });
    });

    $list.querySelectorAll("[data-ach-toggle]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const achKey = btn.dataset.achToggle;
        if (state.openAchievements.has(achKey)) {
          state.openAchievements.delete(achKey);
        } else {
          state.openAchievements.add(achKey);
        }
        render();
      });
    });
  }

  function renderMatchHits(role) {
    if (!state.query) return "";
    const q = state.query.toLowerCase();
    const scopes = state.searchScopes;
    const parts = [];

    if (scopes.has("achievement")) {
      const achHits = (role.achievements || []).filter((a) => a.name.toLowerCase().includes(q));
      if (achHits.length > 0) {
        parts.push(`
          <div class="wiki-card__hit">
            <span class="wiki-card__hit-label">ヒットした実績:</span>
            <ul class="wiki-card__hit-list">
              ${achHits.map((a) => `<li>${escapeHtml(a.name)}</li>`).join("")}
            </ul>
          </div>
        `);
      }
    }

    if (scopes.has("desc")) {
      const lines = role.desc.split("\n");
      const descHits = lines.filter((line) => line.toLowerCase().includes(q));
      if (descHits.length > 0) {
        parts.push(`
          <div class="wiki-card__hit">
            <span class="wiki-card__hit-label">ヒットした説明:</span>
            <ul class="wiki-card__hit-list">
              ${descHits.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
            </ul>
          </div>
        `);
      }
    }

    return parts.join("");
  }

  function renderAchievements(role) {
    const achievements = role.achievements || [];
    if (achievements.length === 0) {
      return "";
    }
    return `
      <div class="wiki-card__achievements">
        <p class="wiki-card__ach-heading">実績</p>
        <ul class="wiki-ach-list">
          ${achievements
            .map((ach) => {
              const achKey = `${role.key}::${ach.id}`;
              const achOpen = state.openAchievements.has(achKey);
              return `
              <li class="wiki-ach">
                <button class="wiki-ach__head" type="button" data-ach-toggle="${achKey}" aria-expanded="${achOpen}">
                  <span class="wiki-ach__name">${escapeHtml(ach.name)}</span>
                  <span class="wiki-ach__arrow">${achOpen ? "▲" : "▼"}</span>
                </button>
                ${achOpen ? `<p class="wiki-ach__desc">${escapeHtml(ach.desc)}</p>` : ""}
              </li>
            `;
            })
            .join("")}
        </ul>
      </div>
    `;
  }

  function escapeHtml(str) {
    return str.replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  $search.addEventListener("input", () => {
    state.query = $search.value.trim();
    render();
  });

  if ($sortPanelToggle) {
    $sortPanelToggle.addEventListener("click", () => {
      state.sortPanelOpen = !state.sortPanelOpen;
      buildControlsToggle();
    });
  }

  if ($filterPanelToggle) {
    $filterPanelToggle.addEventListener("click", () => {
      state.filterPanelOpen = !state.filterPanelOpen;
      buildControlsToggle();
    });
  }

  buildWebFilter();
  buildFilters();
  buildSearchScope();
  buildSortToggle();
  buildControlsToggle();
  render();
})();
