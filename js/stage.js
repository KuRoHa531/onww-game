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
  let up = {}, dead = {}, badge = {}, glow = {}; // 表向きの役職 / 追放された席 / 票数などの札 / 光らせる札(大狼の目)
  const NIGHT_ACT = ["seer", "mad_seer", "robber", "relic_robber", "troublemaker"];   // 夜にカードを押して行動する役職
  let busy = false;                   // 演出中は操作を受け付けない
  let seq = false;                    // 結果演出を開始済みか
  let timers = [], paperTimers = [];
  const later = (fn, ms) => { const h = setTimeout(fn, ms); timers.push(h); return h; };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; };

  const VISIBLE = () => [ONW.PHASE.ONLINE_NIGHT, ONW.PHASE.ONLINE_MORNING, ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE, ONW.PHASE.ONLINE_RESULT];
  const hostWatching = (g) => !!(g.hostSpec && ONW.net.isHost);

  /** 席の一覧。自分が先頭。観戦のホストは全員、観戦者はCO欄の名簿から */
  function roster(g) {
    if (hostWatching(g)) return (g.others || []).map((p) => ({ id: p.id, name: p.name }));
    if (g.others && !g.isSpectator) return [{ id: ONW.net.myId(), name: g.myName || "あなた", me: true }, ...g.others];
    return (g.boardView || []).map((p) => ({ id: p.id, name: p.name }));
  }
  stage.hasTable = (g) => VISIBLE().includes(g.phase) && roster(g).length > 0;

  // ---------------------------------------------------------
  // 土台（一度だけ作る）
  // ---------------------------------------------------------
  const seatHtml = (k, label, cls) => `
    <div class="tb-seat ${cls || ""}" data-k="${k}">
      <div class="tb-card"><div class="tb-inner"><div class="tb-back"></div><div class="tb-front"></div></div></div>
      <div class="tb-name">${label}</div><div class="tb-badge"></div>
    </div>`;
  function build(g, list) {
    const av = (n) => (ONW.account.avatarMap[n] ? ONW.account.avatarHtml(n, null, "av--xs") : "");
    const graves = Array.from({ length: g.graveCount || 0 }, (_, i) => seatHtml(`g:${i}`, `墓地${i + 1}`, "tb-grave")).join("");
    const players = list.map((p) => seatHtml(`p:${p.id}`, `${av(p.name)}${esc(p.name)}`, p.me ? "me" : "")).join("");
    const el = $t();
    el.innerHTML = `<div class="tb-table">
      <div class="tb-row tb-center">
        <div class="tb-seat tb-pile"><div class="tb-card"><i></i><i></i><i></i></div><div class="tb-name">山札</div></div>
        ${graves}
      </div>
      <div class="tb-row tb-players">${players}</div>
    </div>`;
    el.onclick = (e) => { const s = e.target.closest(".tb-seat[data-k]"); if (s) stage.click(s.dataset.k); };
  }

  // ---------------------------------------------------------
  // 今の操作モード（夜に選ぶ / 投票で選ぶ / なし）
  // ---------------------------------------------------------
  function mode(g) {
    if (busy || g.isSpectator || hostWatching(g)) return null;
    if (g.phase === ONW.PHASE.ONLINE_NIGHT && !g.nightDone && NIGHT_ACT.includes(g.actRole)) return { type: "night", role: g.actRole };   // actRole: 墓荒らしが交換した後は新しい役職
    if (g.phase === ONW.PHASE.ONLINE_VOTE && !g.voted) return { type: "vote" };
    return null;
  }
  function pickable(k, m, g) {
    if (!m) return false;
    const me = ONW.net.myId(), isP = k.startsWith("p:");
    if (isP) return k.slice(2) !== me && m.role !== "relic_robber";   // 墓荒らしが選べるのは墓地だけ
    if (m.type !== "night") return false;
    // 墓地: 占い師・狂った占い師(設定枚数まで) / 墓荒らし(1枚)
    return m.role === "seer" || m.role === "mad_seer" || m.role === "relic_robber";
  }

  // ---------------------------------------------------------
  // 描画の反映（再描画のたびに呼ばれる。DOMは作り直さずクラスだけ更新）
  // ---------------------------------------------------------
  function faceHtml(role) {
    const info = ONW.roles.getInfo(role);
    return `${ONW.ui.roleIcon(role, "role-icon--face")}<b>${esc(info.name)}</b>`;
  }
  function paint(g) {
    const el = $t(), m = mode(g), me = ONW.net.myId();
    el.querySelectorAll(".tb-seat[data-k]").forEach((s) => {
      const k = s.dataset.k, role = up[k], isP = k.startsWith("p:");
      if (role && s.dataset.role !== role) {
        s.dataset.role = role;
        const f = s.querySelector(".tb-front");
        f.innerHTML = faceHtml(role);
        f.className = `tb-front tb-team-${ONW.roles.getInfo(role).team}`;
      }
      const sel = (m && m.type === "vote" && g.voteSel === k.slice(2) && isP) || (m && m.type === "night" && (isP ? (g.nightSel && g.nightSel.players || []).includes(k.slice(2)) : (g.nightSel && g.nightSel.graves || []).includes(+k.slice(2)))) || (g.voted && g.myVote && k === `p:${g.myVote}`);
      s.classList.toggle("up", !!role);
      s.classList.toggle("pick", pickable(k, m, g));
      s.classList.toggle("sel", !!sel);
      s.classList.toggle("dead", !!dead[k]);
      s.classList.toggle("glow", !!glow[k]);
      const b = s.querySelector(".tb-badge");
      const text = badge[k] || (g.voted && g.myVote && k === `p:${g.myVote}` && g.phase === ONW.PHASE.ONLINE_VOTE ? "投票" : "");
      if (b.textContent !== text) { b.textContent = text; b.classList.toggle("tb-badge--dead", !!dead[k]); }
    });
  }

  stage.sync = function (g) {
    const el = $t();
    if (!el) return;
    const list = roster(g);
    if (!VISIBLE().includes(g.phase) || !list.length) {
      if (key !== null) { clearAll(); key = null; up = {}; dead = {}; badge = {}; glow = {}; busy = false; seq = false; el.innerHTML = ""; }
      el.classList.remove("on");
      return;
    }
    const k = `${g.dealStart || 0}|${list.map((p) => p.id).join(",")}|${g.graveCount || 0}`;
    if (k !== key) { clearAll(); key = k; up = {}; dead = {}; badge = {}; glow = {}; busy = false; seq = false; build(g, list); }
    el.classList.add("on");
    paint(g);
    // 朝になったら、夜の選択が実行される演出（占い=表に / 怪盗・墓荒らし=入れ替わって表に / いたずらっ子=入れ替わる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.morningReveal && !g.morningShown && !g.isSpectator) {
      g.morningShown = true; const r = g.morningReveal;
      later(() => playMorning(r), 700);
    }
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && g.morningUp && g.morningUp.length) { g.morningUp.forEach((k) => delete up[k]); g.morningUp = []; paint(G()); }   // 昼になったら伏せる
    if (g.bigReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.bigReveal; g.bigReveal = null; later(() => bigPeek(r), 700); }   // 大狼: 夜の始まりに墓地が全部開く
    if (g.phase === ONW.PHASE.ONLINE_RESULT && g.result && g.resultStage !== "sheet" && !seq) startResult(g);
  };

  // ---------------------------------------------------------
  // カードを押したとき
  // ---------------------------------------------------------
  stage.click = function (k) {
    const g = G(), m = mode(g);
    if (!pickable(k, m, g)) return;
    const id = k.slice(2);
    if (m.type === "night") {
      // 朝になるまで何度でも選び直せる。同じカードをもう一度押すと選択解除
      if (m.role === "relic_robber") {              // 墓荒らし: 押した墓地とその場で交換（やり直しなし）
        busy = true;
        ONW.net.relic(+id);
        return;
      }
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] }, isP = k.startsWith("p:");
      const toggle = (arr, v, max) => { const at = arr.indexOf(v); if (at >= 0) arr.splice(at, 1); else { if (arr.length >= max) arr.shift(); arr.push(v); } };
      if (isP) {
        const max = m.role === "troublemaker" ? 2 : 1;
        toggle(sel.players, id, max);
        if (m.role === "seer" || m.role === "mad_seer") sel.graves = [];     // 墓地とプレイヤーは同時に占えない
      } else {
        const max = Math.min(2, g.graveCount || 0);
        toggle(sel.graves, +id, max);
        sel.players = [];
      }
      ONW.net.setSel(sel);
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
  stage.onAck = function (d) {      // 夜のうちに演出するのは墓荒らしの交換だけ（他は朝にまとめて再生）
    if (!d.reveal) { busy = false; return; }
    busy = true;
    relic(d.reveal, true);
  };
  function show(k, role) {
    const g = G();
    up[k] = role; (g.morningUp = g.morningUp || []).push(k); paint(g);
  }
  function playMorning(r) {
    if (r.kind === "peek") r.items.forEach((it, i) => later(() => show(it.k, it.role), i * 450));
    else if (r.kind === "swap") swap(r);
    else if (r.kind === "relic") relic(r);
    else if (r.kind === "tm") tmSwap(r);
  }
  function swap(r, temp) {
    const mine = `p:${ONW.net.myId()}`, theirs = r.kind === "relic" ? `g:${r.target}` : `p:${r.target}`, el = $t();
    const a = el.querySelector(`[data-k="${mine}"] .tb-card`), b = el.querySelector(`[data-k="${theirs}"] .tb-card`);
    const reveal = () => {
      if (!temp) { show(mine, r.role); return; }          // 夜: 数秒だけ表にして伏せる
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
      reveal();                                     // 新しい自分のカードが表に
    }, 1050);
  }

  // ---- 墓荒らし: 墓地のカードがガタッと掘り起こされ、自分のカードと入れ替わる → 新しい自分のカードが表に ----
  function relic(r, temp) {
    const el = $t(), grave = el.querySelector(`[data-k="g:${r.target}"] .tb-card`);
    if (!grave || !grave.animate) { swap(r, temp); return; }
    const w = grave.animate(
      [{ transform: "translate(0,0) rotate(0)" }, { transform: "translate(-3px,-12px) rotate(-7deg)" }, { transform: "translate(3px,-8px) rotate(6deg)" }, { transform: "translate(-2px,-14px) rotate(-4deg)" }, { transform: "translate(0,-6px) rotate(0)" }],
      { duration: 520, easing: "ease-in-out" });
    later(() => { w.cancel(); swap(r, temp); }, 540);     // 揺れ終わったら、自分のカードと弧を描いて入れ替わる
  }

  // ---- いたずらっ子: 選んだ2人のカードが（裏向きのまま）空中で交差して入れ替わる ----
  function tmSwap(r) {
    const el = $t(), a = el.querySelector(`[data-k="p:${r.a}"] .tb-card`), b = el.querySelector(`[data-k="p:${r.b}"] .tb-card`);
    if (!a || !b || !a.animate) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dx = rb.left - ra.left, dy = rb.top - ra.top;
    const path = (x, y, lift, tilt) => [
      { transform: "translate(0,0) scale(1) rotate(0deg)" },
      { transform: `translate(${x * 0.3}px,${y * 0.3 + lift}px) scale(1.18) rotate(${tilt}deg)`, offset: 0.3 },
      { transform: `translate(${x * 0.7}px,${y * 0.7 + lift}px) scale(1.18) rotate(${-tilt}deg)`, offset: 0.7 },
      { transform: `translate(${x}px,${y}px) scale(1) rotate(0deg)` },
    ];
    a.style.zIndex = 6; b.style.zIndex = 5;
    const opt = { duration: 1200, easing: "ease-in-out", fill: "forwards" };
    const A = a.animate(path(dx, dy, -26, -8), opt), B = b.animate(path(-dx, -dy, 26, 8), opt);
    later(() => { A.cancel(); B.cancel(); a.style.zIndex = b.style.zIndex = ""; }, 1250);   // 裏面は同じなので、元の席に戻すと入れ替わったまま見える
  }

  // ---- 大狼: 夜の始まりに墓地のカードが順に全部開き、赤く光る → 閉じる ----
  function bigPeek(roles) {
    roles.forEach((role, i) => later(() => { up[`g:${i}`] = role; glow[`g:${i}`] = true; paint(G()); }, i * 380));
    later(() => { roles.forEach((_, i) => { delete up[`g:${i}`]; delete glow[`g:${i}`]; }); paint(G()); }, roles.length * 380 + 4200);
  }

  // ---------------------------------------------------------
  // 結果: 票数 → つられた人が表に → 全員が表に → 結果発表
  // ---------------------------------------------------------
  function setCap(html) {
    const g = G(); g.resultCap = html;
    const c = document.getElementById("res-cap");
    if (c) { c.innerHTML = html; c.classList.remove("res-pop"); void c.offsetWidth; c.classList.add("res-pop"); }
  }
  function winHtml(res) {
    const team = res.title.startsWith("村人") ? "village" : res.title.startsWith("人狼") ? "wolf" : "third";
    return `<div class="rs-win t-${team}">${esc(res.title)}</div><div class="rs-dim">${esc(res.detail || "")}</div>`;
  }
  function startResult(g) {
    seq = true;
    const res = g.result, P = (id) => `p:${id}`;
    const exec = res.history.filter((h) => h.dead);
    const rest = [...res.history.filter((h) => !h.dead).map((h) => [P(h.id), h.role]), ...res.grave.map((c, i) => [`g:${i}`, c.role])];
    let t = 600;
    setCap(`<div class="res-cap__t">投票の結果</div>`);
    res.counts.forEach((c, i) => later(() => { badge[P(c.id)] = `${c.c}票`; paint(G()); }, t + i * 350));
    t += res.counts.length * 350 + 1000;
    later(() => {
      exec.forEach((h) => { up[P(h.id)] = h.role; dead[P(h.id)] = true; badge[P(h.id)] = "追放"; });
      setCap(exec.length ? `<div class="res-cap__t t-wolf">追放</div><div>${exec.map((h) => esc(h.name)).join("、")}</div>` : `<div class="res-cap__t">誰も追放されませんでした</div>`);
      paint(G());
    }, t);
    t += exec.length ? 3200 : 1500;
    later(() => setCap(`<div class="res-cap__t">結果発表</div>`), t);
    rest.forEach(([k, r], i) => later(() => { up[k] = r; paint(G()); }, t + 500 + i * 320));
    t += 500 + rest.length * 320 + 700;
    later(() => setCap(winHtml(res)), t);
    later(toSheet, t + 2800);
  }
  function toSheet() {
    const g = G(); clearAll();
    g.resultStage = "sheet";
    ONW.ui.render(g);
  }
  stage.skipResult = function () {
    const g = G(), res = g.result;
    if (!res) return;
    clearAll();
    res.history.forEach((h) => { up[`p:${h.id}`] = h.role; if (h.dead) { dead[`p:${h.id}`] = true; badge[`p:${h.id}`] = "追放"; } });
    res.grave.forEach((c, i) => { up[`g:${i}`] = c.role; });
    res.counts.forEach((c) => { if (!badge[`p:${c.id}`]) badge[`p:${c.id}`] = `${c.c}票`; });
    toSheet();
  };

  // ---------------------------------------------------------
  // 変化公開: 画面いっぱいの古びた紙に書かれ、下の固定欄へ移動する
  // ---------------------------------------------------------
  function finishPaper(wrap) {
    paperTimers.forEach(clearTimeout); paperTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
    const g = G(); g.tfIntro = false;
    ONW.ui.updateBoard();
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
  stage.paper = function (lines) {
    document.querySelectorAll(".tfp-wrap").forEach((w) => w.remove());
    paperTimers.forEach(clearTimeout); paperTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "tfp-wrap";
    const dur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05));
    const start = (i) => 0.55 + i * 0.75;
    wrap.innerHTML = `<div class="tfp-dim"></div>
      <div class="tfp-paper">
        <div class="tfp-title"><span style="--n:4;--d:.1s;--dur:.35s">変化公開</span></div>
        ${lines.map((t, i) => `<div class="tfp-line"><span style="--n:${[...t].length};--d:${start(i).toFixed(2)}s;--dur:${dur(t).toFixed(2)}s">${esc(t)}</span></div>`).join("")}
        <div class="tfp-hint">タップでスキップ</div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.onclick = () => fly(wrap);
    const endAt = start(lines.length - 1) + dur(lines[lines.length - 1]) + 1.3;   // 書き終えて少し読ませてから下へ
    paperTimers.push(setTimeout(() => fly(wrap), endAt * 1000));
  };

  ONW.stage = stage;
})(window.ONW);
