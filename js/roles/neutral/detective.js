/**
 * 名探偵（第三陣営）: 投票が終わったあと・結果発表の前に、自分を除く全員の「初期役職」を推理する。全員当てれば単独勝利。
 *   マイクラ版: vote.js の runDetectiveGuessPhase / detectiveRoleOptions / buildDetectivePriorityResult / buildDetectiveResultLines を、
 *   Web版の進行（net.js の投票終了 → 推理 → 結果）と勝敗判定（vote.js determineWinnersCoreBase）に合わせたもの。
 *
 * 【勝利条件（マイクラ版と同じ）】
 *   ・最終盤面（現世。墓地ではなく、誰かの席）で名探偵を持っている人が、投票のあとに全員（自分を除く）の初期役職を推理する
 *   ・全員の初期役職（g.initialRoles。配役直後・変化役の変化後の役職）を当てたら成功 = 名探偵の単独勝利
 *   ・名探偵が2人以上いるときは、同時に推理する。成功した全員が同時に勝つ（推理に失敗した人は勝てない）
 *   ・恋人（重複役職）になっている名探偵は勝てない / 保安官に撃たれて勝利条件を失った人は勝てない（バランサー・賞金稼ぎと同じ扱い）
 *   ・追放・死亡していても勝てる（推理は生死に関係なく行う。マイクラ版も生死を見ない）
 *
 * 【勝利優先度（正本: docs/victory-priority.md）】
 *   チキン ＞ 模倣チキン ＞ 神の祝福 ＞ 勝負師 ＞ シャッフラー ＞ 静観者 ＞ 名探偵 ＞ 予想屋 ＞ 魔界公爵 ＞ 賞金稼ぎ ＞ バランサー ＞ …
 *   vote.js の determineWinnersCoreBase の分岐 1.6（神の祝福 1 のあと・賞金稼ぎ 1.7 の前）。チキンの逆転（chickenForce）の再判定では飛ばす。
 *
 * 【推理の画面（3of4）】推理するときの画面には、「自分を除く全員の席の点線」と「初期役職のカード」が並ぶ。
 *   ・カード（役職の山）= 配役直後の全員の初期役職 + 墓地の初期役職。同じ役職が複数あれば複数枚ある（D.pool）
 *   ・役職が変化して後から名探偵になった場合もあるので、名探偵のカードも置いてある（最終盤面の名探偵の人数に足りないぶんを足す）
 *   ・「自分が見えている役職」（忘れん坊の人狼 → 村人 など）のカードも足す（マイクラ版 detectiveRoleOptions と同じ。D.pool の最後の節）
 *   ・全員の席にカードを置いて「確定」を押すと推理が終わる。待ち表示は誰が名探偵かが分からない文言（既存の「結果を待っています…」）
 *
 * 記録: game.detectiveGuesses = { 名探偵のID: { 席のID: 推理した役職ID } } / game.detectiveSuccess = { 名探偵のID: true|false }
 *   game.detectiveDone = 推理フェーズを済ませた（1回の投票で1回だけ。finishVoting が false に戻す）
 *
 * 進み具合（docs/detective.md も参照）: 1of4 = 登録・勝敗 / 2of4 = 推理フェーズの進行（net.js）/ 3of4 = 推理の画面 / 4of4 = 結果発表のめくり演出・CPU・実績・総合
 */
(function (ONW) {
  const D = {};
  const R = () => ONW.ROLE;

  /** 最終盤面で名探偵を持っている人のID（席順）。生死・恋人・撃たれたかは問わない（推理は全員が行う） */
  D.holders = function holders(g) {
    return (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === R().DETECTIVE);
  };

  /** 推理する相手（自分を除く全員。席順） */
  D.targets = function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => x !== id);
  };

  /** 正解（その席の初期役職。マイクラ版は initialRoles → なければ finalRoles） */
  D.answerOf = function answerOf(g, targetId) {
    return (g.initialRoles && g.initialRoles[targetId]) || (g.currentRoles && g.currentRoles[targetId]) || null;
  };

  /**
   * 推理に使うカードの山（役職IDの配列。同じ役職が複数あれば複数回出る。ONW.ROLE_ORDER の順）。
   *   配役直後の全員の初期役職 + 配役直後の墓地 + 足りない名探偵のカード + 「自分が見えている役職」（マイクラ版 detectiveRoleOptions）
   */
  D.pool = function pool(g) {
    const list = [];
    (g.players || []).forEach((p) => { const r = g.initialRoles && g.initialRoles[p.id]; if (r) list.push(r); });
    (g.center0 || g.center || []).forEach((r) => { if (r) list.push(r); });
    // 役職変化系で後から名探偵になった人のぶん（最終盤面の名探偵の人数に、初期役職の名探偵が足りないとき）
    const need = D.holders(g).length;
    for (let have = list.filter((r) => r === R().DETECTIVE).length; have < need; have++) list.push(R().DETECTIVE);
    // 自分が見えている役職（忘れん坊の人狼・狼憑き・狐憑き・呪われし者 → 村人 / 狼の夢を見る者 → 人狼）が山に無ければ1枚足す
    const have = new Set(list);
    list.slice().forEach((r) => { const s = ONW.shownRole(r); if (s && !have.has(s)) { have.add(s); list.push(s); } });
    return ONW.sortByRoleOrder(list);
  };

  /** 山の枚数: { 役職ID: 枚数 } */
  D.poolCounts = function poolCounts(g) {
    const c = {};
    D.pool(g).forEach((r) => { c[r] = (c[r] || 0) + 1; });
    return c;
  };

  /**
   * 送られてきた推理を整える。picks = { 席のID: 役職ID }。
   *   ・自分を除く全員ぶんがそろっていること / 山にある役職で、山の枚数を超えないこと。満たさなければ null
   */
  D.normalize = function normalize(g, id, picks) {
    if (!picks || typeof picks !== "object") return null;
    const targets = D.targets(g, id), left = D.poolCounts(g), out = {};
    for (const t of targets) {
      const r = picks[t];
      if (typeof r !== "string" || !(left[r] > 0)) return null;
      left[r] -= 1;
      out[t] = r;
    }
    return out;
  };

  /** 全員の初期役職を当てたか */
  D.isSuccess = function isSuccess(g, id, picks) {
    const t = D.targets(g, id);
    return !!picks && t.length > 0 && t.every((x) => picks[x] && picks[x] === D.answerOf(g, x));
  };

  /** 推理を記録する（成功・失敗もここで決める）。norm 済みの picks を渡す */
  D.record = function record(g, id, picks) {
    g.detectiveGuesses = g.detectiveGuesses || {}; g.detectiveSuccess = g.detectiveSuccess || {};
    g.detectiveGuesses[id] = { ...picks };
    g.detectiveSuccess[id] = D.isSuccess(g, id, picks);
  };

  /** まだ推理していない名探偵（推理フェーズで待つ人） */
  D.pending = function pending(g) {
    return D.holders(g).filter((id) => !(g.detectiveGuesses && g.detectiveGuesses[id]));
  };

  /** 当てた人数（実績 detective_partial_loss / detective_no_hit 用） */
  D.correctCount = function correctCount(g, id) {
    const p = (g.detectiveGuesses || {})[id] || {};
    return D.targets(g, id).filter((x) => p[x] && p[x] === D.answerOf(g, x)).length;
  };

  /** 勝てる名探偵のID（推理に成功した人。恋人・撃たれて勝利条件を失った人は除く）。空なら勝利なし */
  D.winIds = function winIds(g) {
    const shot = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(g) : [];
    return D.holders(g).filter((id) => (g.detectiveSuccess || {})[id] === true && !ONW.isLover(g, id) && !shot.includes(id));
  };

  /** 勝利の説明文 */
  D.winText = function winText(g, ids, nm) {
    return `名探偵 ${nm(ids)} が、全員の初期役職を言い当てました。名探偵の単独勝利です。`;
  };

  /**
   * 実績（マイクラ版 stats.js と同じ条件。wiki-data.js の「名探偵」に定義済み）。Web版にはまだ実績を保存する仕組みが無いので、
   *   「この試合で id が満たした実績ID」を返すだけ（バランサーと同じ。保存側ができたら呼ぶ）。won: その人が勝ったか
   *   first_detective = 初期役職が名探偵 / win_detective = 最終役職が名探偵で勝利 / detective_partial_loss = 1人以上当てたが敗北 / detective_no_hit = 誰も当たらなかった
   */
  D.achievements = function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === R().DETECTIVE) out.push("first_detective");
    if (cur === R().DETECTIVE) {
      if (won) out.push("win_detective");
      if (g.detectiveGuesses && g.detectiveGuesses[id]) {
        if (!won && D.correctCount(g, id) > 0) out.push("detective_partial_loss");
        if (D.correctCount(g, id) <= 0) out.push("detective_no_hit");
      }
    }
    return out;
  };

  /** 自動の推理（CPU・通信が切れた人・ホストのスキップ。いまは山からランダムに置く仮の動き。CPUの賢い推理は 4of4） */
  D.autoPicks = function autoPicks(g, id) {
    const pool = ONW.utils.shuffle(D.pool(g).slice()), out = {};
    D.targets(g, id).forEach((t, i) => { out[t] = pool[i]; });
    return out;
  };

  // ======================================================================
  //  推理の画面（クライアント側）。net.js が t:"detask" で呼ぶ。 d = { pool: [役職ID...（同じ役職は複数）], slots: [{ id, name, me }]（席順） }
  //   上: 自分を除く全員の席（点線の枠）。自分の席は空白 / 下: 初期役職のカード（同じ役職は複数枚）
  //   操作: カードをタップして選び、置きたい席をタップ（置いてあるカードをタップすると持ち上げて、別の席に動かせる）/ ドラッグでも動かせる
  //         席に置いたカードを別のカードで置き換えると、元のカードは下に戻る。全員ぶん置くと「確定」が押せる
  //   確定すると ONW.net.detGuess(picks) で送る。画面はホストからの t:"detask"(close) で閉じる。待つあいだの文言は断定しない（誰が名探偵かが分からない）
  // ======================================================================
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const roleName = (r) => (ONW.roles && ONW.roles.getInfo(r) || {}).name || r;
  const breakName = (n) => (ONW.stage && ONW.stage.breakHtml ? ONW.stage.breakHtml(n) : esc(n));
  /** 役職カード1枚（顔・役職名）。w = 幅(px) */
  const clen = (t) => Array.from(String(t || "")).length;
  /** 役職名の最長行の文字数（7文字以上は stage.js の改行表で分けた行の最長。それ以外は名前の長さ） */
  const longest = (name) => { const h = breakName(name).split("<br>"); return Math.max(...h.map((x) => clen(x.replace(/&[a-z]+;/g, "x")))); };
  D.cardHtml = function cardHtml(role, w, extra) {
    const info = (ONW.roles && ONW.roles.getInfo(role)) || {}, icon = ONW.ui && ONW.ui.roleIcon ? ONW.ui.roleIcon(role, "role-icon--face") : "";
    const nm = roleName(role), base = Math.max(8, Math.round(w * 0.17)), n = longest(nm);
    // 4文字以下は今までと同じ大きさ。5文字以上は、最長行がカードの幅（左右の余白ぶんを引いたもの）に収まる大きさまで小さくする
    const fs = n <= 4 ? base : Math.max(5, Math.min(base, Math.floor(((w - 8) / n) * 10) / 10));
    return `<div class="dt-card dt-team-${info.team || "third"}${extra || ""}" style="width:${w}px;height:${Math.round(w * 1.45)}px;font-size:${fs}px"><div class="dt-face">${icon}</div><b>${breakName(nm)}</b></div>`;
  };
  D.closeAsk = function closeAsk() { document.querySelectorAll(".dt-ask").forEach((e) => e.remove()); };
  D.openAsk = function openAsk(d) {
    D.closeAsk();
    const pool = (d.pool || []).slice(), slots = d.slots || [], others = slots.filter((x) => !x.me);
    const put = {};            // 席のID → 山の番号（pool の添字）
    let hold = null, sent = false;   // hold = { from: "pool" | 席のID, idx }
    const used = () => new Set(Object.values(put));
    const root = document.createElement("div");
    root.className = "dt-ask";
    document.body.appendChild(root);
    const W = () => Math.max(34, Math.min(66, Math.floor(((window.innerWidth || 360) - 28) / Math.max(slots.length, 4)) - 6));
    const holdOf = () => (hold ? (hold.from === "pool" ? hold.idx : put[hold.from]) : null);

    function render() {
      const w = W(), u = used(), hid = holdOf();
      const board = slots.map((x) => {
        if (x.me) return `<div class="dt-col dt-col--me"><div class="dt-slot dt-slot--blank" style="width:${w}px;height:${Math.round(w * 1.45)}px"></div><span class="dt-name">${esc(x.name)}<small>あなた</small></span></div>`;
        const k = put[x.id], filled = k !== undefined;
        return `<div class="dt-col"><div class="dt-slot${filled ? " dt-slot--on" : ""}${hold && !filled ? " dt-slot--ready" : ""}" data-slot="${esc(x.id)}" style="width:${w}px;height:${Math.round(w * 1.45)}px">${filled ? `<div class="dt-grab${hid === k ? " dt-hold" : ""}" data-slotcard="${esc(x.id)}">${D.cardHtml(pool[k], w - 4)}</div>` : ""}</div><span class="dt-name">${esc(x.name)}</span></div>`;
      }).join("");
      const rest = pool.map((r, i) => (u.has(i) ? "" : `<div class="dt-grab${hid === i ? " dt-hold" : ""}" data-pool="${i}">${D.cardHtml(r, w)}</div>`)).join("");
      const done = others.every((x) => put[x.id] !== undefined);
      root.innerHTML = `<div class="dt-ask__box"><h2>推理</h2><p class="dt-hint">自分を除く全員の<strong>初期役職</strong>を推理してください。<br>カードをタップして選び、置きたい席をタップ（ドラッグでも動かせます）。</p>
        <div class="dt-board">${board}</div><div class="dt-pool" data-poolarea="1">${rest}</div>
        <button class="btn dt-ask__ok" type="button"${done && !sent ? "" : " disabled"}>${sent ? "確定しました" : done ? "確定" : `あと ${others.filter((x) => put[x.id] === undefined).length} 人`}</button></div>`;
    }

    /** 持っているカード(hold)を席 t に置く（t が null なら山に戻す） */
    function dropTo(t) {
      if (!hold) return;
      const h = hold; hold = null;
      if (t === null) { if (h.from !== "pool") delete put[h.from]; return; }
      if (h.from === "pool") { put[t] = h.idx; return; }           // 山から置く（置き換えられたカードは山に戻る）
      if (h.from === t) return;
      const a = put[h.from], b = put[t];                           // 席から席へ（入れ替え）
      if (b === undefined) delete put[h.from]; else put[h.from] = b;
      put[t] = a;
    }
    function pick(el) {
      if (el.dataset.pool !== undefined) return { from: "pool", idx: +el.dataset.pool };
      if (el.dataset.slotcard !== undefined) return { from: el.dataset.slotcard, idx: put[el.dataset.slotcard] };
      return null;
    }

    // ---- 操作（タップ / ドラッグ）----
    let drag = null;
    root.addEventListener("pointerdown", (e) => {
      if (sent) return;
      const el = e.target.closest("[data-pool],[data-slotcard]");
      if (!el) return;
      drag = { el, x: e.clientX, y: e.clientY, ghost: null, h: pick(el) };
      e.preventDefault();
    });
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    function onMove(e) {
      if (!drag) return;
      if (!drag.ghost && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) {
        const r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
        g.className = "dt-ghost"; g.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px`;
        drag.dx = e.clientX - r.left; drag.dy = e.clientY - r.top;
        document.body.appendChild(g); drag.ghost = g; drag.el.classList.add("dt-lift");
      }
      if (drag.ghost) { drag.ghost.style.left = `${e.clientX - drag.dx}px`; drag.ghost.style.top = `${e.clientY - drag.dy}px`; }
    }
    function onUp(e) {
      if (!drag) return;
      const dr = drag; drag = null;
      if (dr.ghost) {
        dr.ghost.remove();
        const under = document.elementFromPoint(e.clientX, e.clientY), slot = under && under.closest("[data-slot]");
        hold = dr.h;
        if (slot) dropTo(slot.dataset.slot); else if (under && under.closest("[data-poolarea]")) dropTo(null); else hold = null;
        render(); return;
      }
      // タップ: 選ぶ / 選び直す / 外す
      if (hold && hold.from === dr.h.from && hold.idx === dr.h.idx) hold = null;
      else if (hold && dr.h.from !== "pool") dropTo(dr.h.from);   // 持っているカードで、置いてあるカードを置き換える / 席どうしを入れ替える
      else hold = dr.h;
      render();
    }
    root.addEventListener("click", (e) => {
      if (sent) return;
      const slot = e.target.closest("[data-slot]");
      if (slot && hold && !e.target.closest("[data-slotcard]")) { dropTo(slot.dataset.slot); render(); return; }   // 空の席 / 置いてあるカード以外の部分をタップ
      if (e.target.closest("[data-poolarea]") && !e.target.closest("[data-pool]") && hold) { dropTo(null); render(); return; }
      const ok = e.target.closest(".dt-ask__ok");
      if (ok && !ok.disabled) {
        sent = true;
        const picks = {}; others.forEach((x) => { picks[x.id] = pool[put[x.id]]; });
        render();
        ONW.net.detGuess(picks);
      }
    });
    const cleanup = new MutationObserver(() => { if (!document.body.contains(root)) { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("pointercancel", onUp); cleanup.disconnect(); } });
    cleanup.observe(document.body, { childList: true });
    window.addEventListener("resize", () => { if (document.body.contains(root)) render(); });
    render();
  };

  /**
   * 結果発表の盤面データ（net.js が res.detective に入れる）。名探偵ごとに1枚の盤面（席順の列。自分の列は null = 空白）。
   *   cell = { id: 席のID, guess: 推理した役職ID, answer: 正解（初期役職）, ok: 当たったか }
   */
  D.view = function view(g, nm) {
    const guesses = g.detectiveGuesses || {}, boards = D.holders(g).filter((id) => guesses[id]);
    if (!boards.length) return null;
    return {
      seats: (g.players || []).map((p) => ({ id: p.id, name: p.name })),
      boards: boards.map((id) => ({
        id, name: nm(id), success: !!(g.detectiveSuccess || {})[id],
        cells: (g.players || []).map((p) => (p.id === id ? null : { id: p.id, guess: guesses[id][p.id], answer: D.answerOf(g, p.id), ok: guesses[id][p.id] === D.answerOf(g, p.id) })),
      })),
    };
  };

  // ======================================================================
  //  結果発表の盤面（全員の画面）。全員のカードがめくれ終わったあと・チキンの逆転の前（バランサーの天秤の前）に出す。
  //   各名探偵の盤面（席順の列。自分の列は空白）を、カードの裏面（共通のカード裏面。推理した役職は見せない）のまま全員に見せる。複数いれば並べる。
  //   めくる順: 席の列ごと（左の列から）。同じ列にカードがある盤面は、同時にめくれる（Bの推理のAの列 → Aの推理のBの列 → AとBの推理のCの列 …）。
  //   めくれると、名探偵が推理した役職の面になり（正解ではなく推理の内容を見せる）、当たっていれば ⭕、外れていれば ✖。
  // ======================================================================
  const FX = { SHOW: 1500, GAP: 1300, FLIP: 650, MARK: 700, HOLD: 1900, FADE: 450, STILL: 3600 };
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function removeFx() { document.querySelectorAll(".dtr-fx").forEach((e) => e.remove()); }
  function runBoards(R, v) {
    const { later, setCap } = R, t0 = R.t, n = v.seats.length, reduce = reduceMotion();
    const w = Math.max(30, Math.min(60, Math.floor(((window.innerWidth || 360) - 40) / Math.max(n, 4)) - 6));
    const cellHtml = (c, ci) => (c
      ? `<div class="dtr-cell" data-col="${ci}" style="width:${w}px;height:${Math.round(w * 1.45)}px"><div class="dtr-in"><div class="dtr-back" style="font-size:${Math.max(10, Math.round(w * 0.4))}px">☾</div><div class="dtr-front">${D.cardHtml(c.guess, w)}</div></div><i class="dtr-mark ${c.ok ? "dtr-ok" : "dtr-ng"}">${c.ok ? "⭕" : "❌"}</i></div>`
      : `<div class="dtr-cell dtr-cell--blank" style="width:${w}px;height:${Math.round(w * 1.45)}px"></div>`);
    later(() => setCap(""), t0);
    later(() => {
      removeFx();
      const root = document.createElement("div");
      root.className = "dtr-fx";
      root.innerHTML = `<div class="dtr-stage"><h2>名探偵の推理</h2>${v.boards.map((b) => `<div class="dtr-board" data-det="${esc(b.id)}"><div class="dtr-title">${esc(b.name)} の推理</div><div class="dtr-row">${b.cells.map((c, ci) => `<div class="dtr-colwrap">${cellHtml(c, ci)}<span class="dtr-name">${esc(v.seats[ci].name)}</span></div>`).join("")}</div></div>`).join("")}</div>`;
      document.body.appendChild(root);
      if (reduce) root.querySelectorAll(".dtr-cell:not(.dtr-cell--blank)").forEach((e) => { e.classList.add("dtr-flipped", "dtr-marked"); });
    }, t0 + 80);
    if (reduce) { R.t = t0 + FX.STILL; later(removeFx, R.t); return; }
    // 列ごとに、同時にめくる（カードのある盤面すべて）
    for (let ci = 0; ci < n; ci++) {
      if (!v.boards.some((b) => b.cells[ci])) continue;
      const at = t0 + FX.SHOW + ci * FX.GAP;
      later(() => { document.querySelectorAll(`.dtr-fx .dtr-cell[data-col="${ci}"]`).forEach((e) => e.classList.add("dtr-flipped")); }, at);
      later(() => { document.querySelectorAll(`.dtr-fx .dtr-cell[data-col="${ci}"]`).forEach((e) => e.classList.add("dtr-marked")); }, at + FX.MARK);
    }
    const tFlip = t0 + FX.SHOW + (n - 1) * FX.GAP + FX.MARK + 500;
    later(() => { document.querySelectorAll(".dtr-fx .dtr-board").forEach((el) => { const b = v.boards.find((x) => x.id === el.dataset.det); if (b && b.success) el.classList.add("dtr-win"); }); }, tFlip);   // 全員当てた盤面は金色に光る
    R.t = tFlip + FX.HOLD;
    later(() => { const r = document.querySelector(".dtr-fx"); if (r) r.classList.add("dtr-out"); }, R.t);
    R.t += FX.FADE;
    later(removeFx, R.t);
  }

  ONW.detective = D;

  ONW.defineRole("detective", {
    // 結果発表の演出(stage.js の startResult が引く): res.detective がある試合だけ。スキップ(skipResult)されたときは clear で片付けるだけ
    stageResult: {
      detective: { order: 5, run(R) { const v = R.res.detective; if (v && (v.boards || []).length) runBoards(R, v); } },
      clear() { removeFx(); },
    },

    info: { deck: 84, name: "名探偵", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.9,
      desc: "第三陣営。夜の能力はありません。投票が終わったあと、自分を除く全員の初期役職（最初に配られた役職）を推理します。全員の役職を当てることができれば単独勝利します。名探偵が2人以上いるときは同時に推理し、推理に成功した全員が同時に勝利します（追放・死亡していても勝てます。恋人になっている名探偵は勝てません）。" },
    groups: { "transform:silver_shadow": 24 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる）
  });
})(window.ONW);
