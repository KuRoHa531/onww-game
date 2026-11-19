/**
 * rolebook.js ── 役職確認ボタン(📕・役職ガイドの📖の左)
 * ------------------------------------------------------------
 * 自分が「知った」役職の、配布時の説明(ONW.roleDesc)を、夜・朝・待機時間・昼にいつでも見返せる重ね画面。
 *   ・自身の役職(自認): 配られた役職(変化前→変化後)→ 墓荒らし/怪盗/ドッペル等で手にした役職 → 酔い覚め・後覚者の最終役職 …の流れ
 *   ・能力結果: 占い・詩人・墓地の覗き見など、自分の能力で得た情報に「表示された」役職
 * 自認なので、あとからいたずらされて本当の役職が変わっていても載らない（忘却の占い師は「村人」と自認する）。
 * 役職の名前を押すまで説明は閉じている。画面はずれず、情報確認と同じ重ね画面で出す。
 * 開拓者を自認しているときは、開いた説明の下に「歩んでいる運命」とその運命の能力（保安官・騎士・カルメン・妖精さん・いたずらっ子の配布時の説明）も出す（開拓者 4of4-b）。
 * 仕様の詳細は docs/role-book.md。
 * ------------------------------------------------------------
 */
(function (ONW) {
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rb = {};

  /** 試合の開始(役職が配られたとき)に呼ぶ。自認の流れを「変化前 → 配られた役職」で作り直す */
  rb.init = function (g) {
    if (!g) return;
    g.rbSelf = [];
    g.rbSeen = [];
    g.rbSkip = [];
    g.rbOpen = {};
    if (g.myFrom) rb.addSelf(g, g.myFrom);   // 光の使徒などの変化役 → 変化先
    if (g.myRole) rb.addSelf(g, g.myRole);
  };

  /** 自認の流れに役職を足す(直前と同じ役職は足さない)。
   *  カードがめくれる演出の待ち(ui.logsHeld)の最中に届いたものは late 印を付け、待ちが終わる(=その役職が画面に表示される)まで載せない */
  rb.addSelf = function (g, role) {
    if (!g || !role || !(ONW.ROLE_INFO[role] || (ONW.COMMON_ROLE_INFO || {})[role])) return;
    g.rbSelf = g.rbSelf || [];
    const last = g.rbSelf[g.rbSelf.length - 1];
    if (last && last.id === role) return;
    const e = { id: role };
    if (role === "trailblazer") { const f = rb.myFate(g); if (f) e.fate = f; }   // 開拓者: 手にした時点で知らされた運命を覚えておく（あとで別の開拓者を手にしても、前のカードの運命は変わらない）
    if (ONW.ui && ONW.ui.logsHeld && ONW.ui.logsHeld(g)) e.late = true;
    g.rbSelf.push(e);
  };

  /** 自分が知らされている開拓者の運命（"fate:<運命>" の g.mimicView[自分の席] から。夜の「あなたは○○の運命を歩んでいます。」と同じもの）。知らなければ null。
   *  いたずらっ子などで本当のカードが替わっても本人には知らされないので、自認のまま変わらない */
  rb.myFate = function (g) {
    const T = ONW.trailblazer;
    if (!g || !T || !T.fateOfView) return null;
    let id = null;
    try { id = ONW.net && ONW.net.myId ? ONW.net.myId() : null; } catch (e) { id = null; }
    const v = (g.mimicView || {})["p:" + id] || g.myMimic || null;
    return T.fateOfView(v) || null;
  };

  /** 自認の流れの i 番目(開拓者)の運命: 流れのいちばん最後の開拓者は、いま知らされている運命（あとから届いても拾う）/ それより前の開拓者は、そのとき覚えた運命 */
  rb.fateAt = function (g, list, i) {
    const e = list[i];
    if (!e || e.id !== "trailblazer") return null;
    let lastTb = -1;
    list.forEach((x, k) => { if (x.id === "trailblazer") lastTb = k; });
    return (i === lastTb ? rb.myFate(g) : null) || e.fate || null;
  };

  /** 朝・昼の能力の演出(reveal)で、自分が新しく手にした役職: 怪盗の交換(swap)・墓荒らし(relic)・ドッペルゲンガー(doppel)・コスプレイヤー(cosplay)。
   *  ロックで失敗したとき・選び中(role が null)は役職がないので何もしない。受信の hold を決めたあとに呼ぶこと */
  rb.onReveal = function (g, reveal) {
    if (!reveal || !["swap", "relic", "doppel", "cosplay"].includes(reveal.kind)) return;
    rb.addSelf(g, reveal.role);
  };

  /** 全員向けの知らせ(イカロス・従者・弁護士・女王の知らせなど)の文章: 「自分の能力で得た情報」ではないので、能力結果の役職には数えない */
  rb.skip = function (g, texts) {
    if (!g) return;
    g.rbSkip = g.rbSkip || [];
    [].concat(texts || []).forEach((t) => { if (t && !g.rbSkip.includes(t)) g.rbSkip.push(t); });
  };

  /** 文章に出てきた役職IDを、出てきた順に返す。
   *  ・陣営の言葉(村人陣営・人狼陣営・第三陣営)と、参加者の名前は先に取り除く（名前が「占い師」でも役職に数えない）
   *  ・「占い師」と「感覚の占い師」のように名前が重なる役職は、長い名前から先に見つけて取り除く
   *  ・重複役職(酔っ払い・恋人)は役職ではないので数えない */
  rb._finder = function (g) {
    const names = [];
    Object.keys(ONW.ROLE_INFO).forEach((id) => { const n = (ONW.ROLE_INFO[id] || {}).name; if (n && id !== "drunk" && id !== "lover") names.push([n, id]); });
    names.sort((a, b) => b[0].length - a[0].length);
    return names;
  };
  rb._playerNames = function (g) {
    const out = [];
    const add = (x) => { const n = typeof x === "string" ? x : x && x.name; if (n && String(n).length) out.push(String(n)); };
    add(g.myName);
    [g.others, g.boardView, g.players].forEach((a) => { if (Array.isArray(a)) a.forEach(add); });
    return out.sort((a, b) => b.length - a.length);
  };
  rb.rolesIn = function (g, text, names, players) {
    let t = String(text == null ? "" : text).replace(/(?:村人|人狼|第三)陣営/g, " ");
    // 役職名と参加者の名前を、長いものから順に見つけて消す（同じ長さなら名前が先）。
    // 名前が「占い師」の人がいても「感覚の占い師」は役職として拾え、「占い師 を占って…」の占い師は名前として消える
    const cand = [...(players || []).map((n) => [n, null]), ...(names || [])].sort((a, b) => b[0].length - a[0].length || (a[1] === null ? -1 : 1) - (b[1] === null ? -1 : 1));
    const found = [];
    cand.forEach(([n, id]) => {
      const at = t.indexOf(n);
      if (at < 0) return;
      if (id) found.push([at, id]);
      t = t.split(n).join(" ".repeat(n.length));
    });
    return found.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  };

  /** 情報確認に表示されている文章（演出の待ちが終わったもの）から、能力結果の役職を拾って g.rbSeen に足す。文章が出てくる順に並ぶ */
  rb.scan = function (g) {
    if (!g || (ONW.ui && ONW.ui.logsHeld && ONW.ui.logsHeld(g))) return;   // 演出中は、情報確認にも文章を出さない（その間は拾わない）
    const skip = g.rbSkip || [], names = rb._finder(g), players = rb._playerNames(g);
    g.rbSeen = g.rbSeen || [];
    (g.nightLogs || []).forEach((t) => {
      if (skip.includes(t)) return;
      rb.rolesIn(g, t, names, players).forEach((id) => { if (!g.rbSeen.includes(id)) g.rbSeen.push(id); });
    });
  };

  /** 能力結果として載せる役職: 拾った役職から、自認の流れに載っている役職を除いたもの（自認の流れが優先） */
  rb.visibleSeen = function (g) {
    const mine = new Set(rb.visibleSelf(g).map((e) => e.id));
    return (g.rbSeen || []).filter((id) => !mine.has(id));
  };

  /** いま見えている自認の流れ(演出の待ちが終わったものだけ) */
  rb.visibleSelf = function (g) {
    const held = !!(ONW.ui && ONW.ui.logsHeld && ONW.ui.logsHeld(g));
    return (g.rbSelf || []).filter((e) => !e.late || !held);
  };

  /** ボタンを出してよいフェーズか: 夜・朝・待機時間(朝のうち)・昼。観戦者・配布中・投票以降は出さない */
  rb.canShow = function () {
    const g = ONW.game, P = ONW.PHASE;
    if (!g || !g.inGame || g.isSpectator || !g.rbSelf) return false;
    return [P.ONLINE_NIGHT, P.ONLINE_MORNING, P.ONLINE_DAY].includes(g.phase);
  };

  /** 開拓者の運命の欄（開いた説明の下）: 歩んでいる運命の文（夜の文と同じ）+ その運命で使う能力の役職の配布時の説明 */
  const fateBlock = (g, fate) => {
    const T = ONW.trailblazer;
    if (!T || !fate || !T.ROLE_OF || !T.ROLE_OF[fate]) return "";
    const ar = T.ROLE_OF[fate], ai = ONW.roles.getInfo(ar) || {};
    return `<div class="gd-desc rb-fate"><div class="rb-fate__h">${esc(T.fateName(fate))}の運命</div>${esc(T.text(fate))}\n<span class="gd-name t-${ai.team}">${esc(ai.name || "")}</span> の能力\n${esc(ONW.roleDesc(ar, g) || ai.desc || "")}</div>`;
  };

  /** 役職1つぶん: 名前を押すと説明が開く(閉じた状態から。開閉は g.rbOpen に覚えて、再描画しても保つ)。fate: 開拓者の運命（自認の流れの開拓者だけ） */
  const roleRow = (g, id, fate) => {
    const i = ONW.roles.getInfo(id);
    return `<details class="gd-role rb-role" ${g.rbOpen && g.rbOpen[id] ? "open" : ""} ontoggle="ONW.roleBook._tg('${id}',this.open)">
      <summary><span class="gd-name t-${i.team}">${esc(i.name)}</span></summary>
      <div class="gd-desc">${esc(ONW.roleDesc(id, g) || i.desc || "説明はありません。")}</div>${id === "trailblazer" ? fateBlock(g, fate) : ""}</details>`;
  };

  rb.bodyHtml = function () {
    const g = ONW.game;
    rb.scan(g);
    const self = rb.visibleSelf(g), seen = rb.visibleSeen(g);
    const selfHtml = self.length
      ? self.map((e, k) => `${k ? '<div class="rb-arrow" aria-hidden="true">↓</div>' : ""}${roleRow(g, e.id, rb.fateAt(g, self, k))}`).join("")
      : `<p class="night-step__hint">まだありません。</p>`;
    const seenHtml = seen.length ? seen.map((id) => roleRow(g, id)).join("") : `<p class="night-step__hint">まだありません。</p>`;
    return `<div class="rb-h">自身の役職（自認）</div>${selfHtml}<div class="rb-h">能力結果</div>${seenHtml}`;
  };

  rb._tg = function (id, open) { const g = ONW.game; if (!g) return; g.rbOpen = g.rbOpen || {}; if (open) g.rbOpen[id] = true; else delete g.rbOpen[id]; };

  rb.refresh = function () {
    const b = document.getElementById("rb-body");
    if (!b) return;
    const st = b.scrollTop;
    b.innerHTML = rb.bodyHtml();
    b.scrollTop = st;
  };

  rb.open = function () {
    if (document.getElementById("rb-overlay") || !rb.canShow()) return;
    const ui = ONW.ui;
    if (document.getElementById("info-overlay")) ui.closeInfo();   // 情報確認と同じ場所に出るので、開いていたら閉じる（スマホで重ならないように）
    const wrap = document.createElement("div");
    wrap.id = "rb-overlay";
    wrap.className = "info-overlay rb-overlay";   // 情報確認と同じ重ね画面（PC: 中央 / スマホ: 上側に出して下の操作はそのまま）
    wrap.onclick = (e) => { if (e.target === wrap) rb.close(); };
    wrap.innerHTML = `<div class="info-card">
      <div class="info-head"><span>📕 役職確認</span><button class="btn" onclick="ONW.roleBook.close()">閉じる</button></div>
      <div class="info-body" id="rb-body">${rb.bodyHtml()}</div></div>`;
    document.body.appendChild(wrap);
    rb._key = rb.key(ONW.game);
    rb._locked = ui.isPc() && !document.getElementById("chat-overlay") && !document.getElementById("info-overlay");
    if (rb._locked) ui.lockPage(true);   // 開いている間、ページ本体は動かさない
  };

  rb.close = function () {
    const w = document.getElementById("rb-overlay");
    if (!w) return;
    w.remove();
    if (rb._locked && !document.getElementById("chat-overlay") && !document.getElementById("info-overlay")) ONW.ui.lockPage(false);
    rb._locked = false;
  };

  /** ボタンの出し入れ(フェーズが変わっても拾えるよう、短い間隔で見る)。出せないフェーズになったら開いている画面も閉じる */
  rb.key = function (g) { const self = rb.visibleSelf(g); return self.map((e, k) => e.id + (rb.fateAt(g, self, k) || "")).join(",") + "|" + rb.visibleSeen(g).join(","); };   // 運命が（あとから）分かったときも描き直す
  rb.sync = function () {
    const btn = document.getElementById("rb-btn");
    const on = rb.canShow();
    if (btn) btn.hidden = !on;
    if (!on && document.getElementById("rb-overlay")) { rb.close(); return; }
    const g = ONW.game;
    if (!on || !g) return;
    rb.scan(g);   // 開いていなくても、表示された文章から役職を拾っておく（夜の文章が入れ替わっても取りこぼさない）
    if (document.getElementById("rb-overlay")) {   // 開いたまま、演出が終わって新しい役職が表示されたら中身だけ入れ替える
      const key = rb.key(g);
      if (key !== rb._key) { rb._key = key; rb.refresh(); }
    }
  };
  setInterval(rb.sync, 400);

  ONW.roleBook = rb;
})(window.ONW);
