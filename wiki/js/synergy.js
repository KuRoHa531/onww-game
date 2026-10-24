/**
 * synergy.js
 * ------------------------------------------------------------
 * ワンナイト人狼ガイド「闇鍋シナジー」ページ(wiki/synergy.html)の表示ロジック。
 *  - ゲーム内(iframe, ?embed=1)で開かれている時は、ゲーム本体の最新のルール(ONW.roles.synergyRules() / ONW.SYNERGY_COUNT_RULES)を直接読む
 *    （= シナジーを足せば、この一覧にも自動で反映される）
 *  - 単体公開など親が見えない時は js/synergy-data.js(控え)を使う
 *  役職名・陣営は js/wiki-data.js(window.ONW_WIKI_ROLES)の id から引く。説明文(notes)は synergy-data.js にある。
 * ------------------------------------------------------------
 */
(function () {
  const roles = window.ONW_WIKI_ROLES || [];
  const byId = Object.fromEntries(roles.map((r) => [r.id, r]));
  const SNAP = window.ONW_WIKI_SYNERGY || { rules: [], counts: [], notes: {}, countNotes: {} };

  const isEmbed = /[?&]embed=1(&|$)/.test(location.search);
  if (isEmbed) {
    document.body.classList.add("is-embed");
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && window.parent !== window) window.parent.postMessage({ onwWiki: "close" }, "*");
    });
  }

  /** 親(ゲーム本体)のルールを読む。読めなければ null */
  function liveRules() {
    try {
      const O = window.parent && window.parent !== window ? window.parent.ONW : null;
      if (!O || !O.roles || !O.roles.synergyRules || !O.SYNERGY_COUNT_RULES) return null;
      return {
        rules: O.roles.synergyRules().map((r) => ({ trigger: r.trigger, required: r.required.slice(), priority: (r.priority || []).slice() })),
        counts: O.SYNERGY_COUNT_RULES.map((c) => ({ trigger: c.trigger || null, always: !!c.always, label: c.label, anyOf: (c.anyOf || []).slice(), min: c.min, max: c.max == null ? null : c.max, force: !!c.force, early: !!c.early, unlessLover: !!c.unlessLover })),
      };
    } catch (e) { return null; }
  }
  const live = liveRules();
  const data = live || SNAP;
  const rules = data.rules, counts = data.counts;

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nameOf = (id) => (byId[id] ? byId[id].name : id);
  const orderOf = (id) => (byId[id] && byId[id].order != null ? byId[id].order : 9999);   // wiki順（ゲーム内順＝wiki-data の order）
  const teamOf = (id) => (byId[id] ? byId[id].team : "third");
  const chip = (id, extra) => `<span class="syn-chip syn-chip--${teamOf(id)}">${esc(nameOf(id))}${extra || ""}</span>`;

  /** required の並びを「役職 ×枚数」にまとめる（共有者 ×2 など） */
  function groupReq(list) {
    const m = new Map();
    list.forEach((id) => m.set(id, (m.get(id) || 0) + 1));
    return [...m.entries()].sort((x, y) => orderOf(x[0]) - orderOf(y[0]));   // 役職はwiki順
  }

  function ruleCard(r) {
    const req = groupReq(r.required).map(([id, n]) => chip(id, (n > 1 ? ` ×${n}` : ""))).join("");
    const note = (SNAP.notes || {})[r.trigger];
    return `<article class="wiki-card syn-card" data-team="${teamOf(r.trigger)}" data-q="${esc([r.trigger, ...r.required].map(nameOf).join(" "))}">
      <div class="syn-row"><div class="syn-col"><span class="syn-label">出たら</span>${chip(r.trigger)}</div><span class="syn-arrow">→</span><div class="syn-col syn-col--grow"><span class="syn-label">一緒に出る</span><div class="syn-chips">${req}</div></div></div>
      ${note ? `<p class="syn-note">${esc(note)}</p>` : ""}
    </article>`;
  }

  function countText(c) {
    const p = [];
    if (c.min > 0) p.push(`合計 ${c.min} 枚以上`);
    if (c.max != null) p.push(`${c.max} 枚まで`);
    return p.join("・");
  }
  function countCard(c) {
    const chips = c.anyOf.slice().sort((x, y) => orderOf(x) - orderOf(y)).map((id) => chip(id)).join("");   // 役職はwiki順
    const long = c.anyOf.length > 8;
    const note = (SNAP.countNotes || {})[c.label];
    const flags = [c.unlessLover ? "恋人が配られているときは足さない" : "", c.force ? "必ず出す" : "", c.early ? "他のシナジーより先に適用" : ""].filter(Boolean);
    const when = c.always ? `<span class="syn-label">常に</span><span class="syn-always">いつでも適用</span>` : `<span class="syn-label">出たら</span>${chip(c.trigger)}`;
    return `<article class="wiki-card syn-card" data-team="${c.always ? "third" : teamOf(c.trigger)}" data-q="${esc([c.label, c.trigger ? nameOf(c.trigger) : "", ...c.anyOf.map(nameOf)].join(" "))}">
      <div class="syn-row"><div class="syn-col">${when}</div><span class="syn-arrow">→</span><div class="syn-col syn-col--grow"><span class="syn-label">${esc(c.label)}（${esc(countText(c))}）</span>
        ${long ? `<details class="syn-more"><summary>対象の役職を見る（${c.anyOf.length}役職）</summary><div class="syn-chips">${chips}</div></details>` : `<div class="syn-chips">${chips}</div>`}</div></div>
      ${flags.length ? `<p class="syn-flags">${flags.map((f) => `<span class="syn-flag">${esc(f)}</span>`).join("")}</p>` : ""}
      ${note ? `<p class="syn-note">${esc(note)}</p>` : ""}
    </article>`;
  }

  const $list = document.getElementById("syn-list");
  const $empty = document.getElementById("syn-empty");
  const $count = document.getElementById("syn-count");
  const $search = document.getElementById("syn-search");
  document.getElementById("syn-source").textContent = live ? "ゲーム本体の最新のルールを表示中" : "単体表示（ゲームから切り離した控えのデータ）";

  // 陣営ごと(村人 → 人狼 → 第三)に、役職はwiki順(ゲーム内順＝wiki-data の order)で並べる。トリガーのない「常に適用」は、対象の先頭の役職で並べる
  const TEAM_TITLE = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" };
  const items = [
    ...rules.map((r, i) => ({ html: ruleCard(r), team: teamOf(r.trigger), ord: orderOf(r.trigger), i })),
    ...counts.map((c, i) => { const k = c.trigger || c.anyOf[0]; return { html: countCard(c), team: teamOf(k), ord: orderOf(k), i: 1000 + i }; }),
  ].sort((x, y) => x.ord - y.ord || x.i - y.i);

  const teamOpen = {};   // 陣営ごとの開閉の状態（既定は閉じている。true のときだけ開く）
  function render() {
    const q = $search.value.trim().toLowerCase();
    const ok = (html) => !q || (html.match(/data-q="([^"]*)"/) || [, ""])[1].toLowerCase().includes(q);
    const shown = items.filter((x) => ok(x.html));
    // 陣営ごとに開閉できる（<details>）。検索中は全部開く。開閉の状態は覚えておく
    $list.innerHTML = ["village", "wolf", "third"].map((t) => {
      const list = shown.filter((x) => x.team === t);
      return list.length ? `<details class="syn-team" data-team-open="${t}" ${q || teamOpen[t] === true ? "open" : ""}><summary class="syn-h syn-h--sec">${TEAM_TITLE[t]}（${list.length}件）</summary>${list.map((x) => x.html).join("")}</details>` : "";
    }).join("");
    $list.querySelectorAll("details.syn-team").forEach((d) => d.addEventListener("toggle", () => { if (!$search.value.trim()) teamOpen[d.dataset.teamOpen] = d.open; }));
    $empty.hidden = shown.length > 0;
    $count.textContent = `${shown.length}件`;
  }
  $search.addEventListener("input", render);
  render();
})();
