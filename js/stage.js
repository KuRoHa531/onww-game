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
  let up = {}, dead = {}, badge = {}, glow = {}; // 表向きの役職 / 追放された席 / 票数などの札 / 光らせる札(大狼の目)
  const NIGHT_ACT = ["seer", "mad_seer", "robber", "relic_robber", "doppelganger", "gremlin", "troublemaker", "love_tanner", "freeter", "visitor"];   // 夜にカードを押して行動する役職
  let starKeys = [];                   // スター公開で札を付けた席
  let flashKeys = [];                  // 昼に酔いが覚めたスターを一時的に表にしている席
  let jobKeys = [];                    // 就職先の画面で、フリーターのカードに札を付けた席
  let asn = {};                        // アサシンの演出: by(暗殺者) / aim(狙う) / slash(斬る) / hit(マーリン) / miss(外れ)
  let alm = {};                        // 従者の身代わり: ご主人のカードが「めくれそうになる」席（絶対に表にならない）
  let shin = {};                       // 無理心中で道連れになった席（死因の演出用）
  let gx = {};                         // 神の演出: 席 → "descend"（神降臨）/ "spark"（祝福: 神のキラキラ）/ "blow"（吹き飛ばされる）/ "win"（祝福で勝つ人）
  const WOLF_MARK = "__wolf";
  const LOVE_MARK = "__love";   // 恋人の相方に見える「❤️」の印（役職名は出さない）
  const SELF_LOVE = "__selflove";   // 酔いが覚めた恋人本人のカードが「恋人」へめくれた面
  const DUO_MARK = "__duo";     // 人狼の🐺と恋人の❤️の両方が付く人（上に🐺、下に❤️）
  const TARGET_MARK = "__target";   // 処刑人に見えるターゲットの「🎯ターゲット」の印（役職名は出さない）
  const MASTER_MARK = "__master";   // 従者に見えるご主人の「👑ご主人」の印（役職名は出さない）
  let lov = {};                       // 結果でめくれた恋人のカードに付ける、右上の丸いハート（夜は共有者・神のカードに付ける）
  let loveMate = null;                // 夜: 自分の恋人の相方 { id, mode }
  const UNK_MARK = "__unk";   // アサシンが選んでいる間、めくれた人のカードに出す「？」（役職は見せない）
  let nightKeys = [];                  // 夜の始まりに開いたカード（神・大狼）。夜時間が終わるまで裏に戻さない
  let busy = false;                   // 演出中は操作を受け付けない
  let seq = false;                    // 結果演出を開始済みか
  let specShown = {}, specBusy = false; // 観戦者: 各席に今見せている役職 / 入れ替え演出中
  let timers = [], paperTimers = [];
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
      <div class="tb-card"><div class="tb-inner"><div class="tb-back"></div><div class="tb-front"></div></div><div class="tb-drunk"><span class="tb-beer">🍺</span><span class="tb-drunk-n"></span></div><div class="tb-lov">❤</div></div>
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
    el.onclick = (e) => { const s = e.target.closest(".tb-seat[data-k]"); if (s) stage.click(s.dataset.k); };
  }

  // ---------------------------------------------------------
  // 今の操作モード（夜に選ぶ / 投票で選ぶ / なし）
  // ---------------------------------------------------------
  function mode(g) {
    if (busy || g.isSpectator || g.isDead || hostWatching(g)) return null;
    if (g.phase === ONW.PHASE.ONLINE_NIGHT && !g.nightDone && NIGHT_ACT.includes(g.actRole)) return { type: "night", role: g.actRole };
    if ((g.phase === ONW.PHASE.ONLINE_MORNING || (g.phase === ONW.PHASE.ONLINE_DAY && g.abilityOpen)) && g.morningChain && g.morningChainReady && !g.morningChainDone) return { type: "morning", role: g.morningChain };   // 墓荒らしが交換した後の役職の能力を朝に使う
    if (g.phase === ONW.PHASE.ONLINE_VOTE && g.strawPick) return { type: "straw" };   // わら人形: めくれた瞬間に、道連れにする相手を選ぶ
    if (g.phase === ONW.PHASE.ONLINE_VOTE && !g.voted) return { type: "vote" };
    return null;
  }
  function pickable(k, m, g) {
    if (!m) return false;
    const me = ONW.net.myId(), isP = k.startsWith("p:");
    if (m.type === "straw") return isP && g.strawPick.some((c) => c.id === k.slice(2));   // 選べるのは、まだめくれていない人だけ
    if (isP && dead[k]) return false;   // 死亡した人には投票できない
    if (isP) return k.slice(2) !== me && m.role !== "relic_robber";   // 墓荒らしが選べるのは墓地だけ
    if (m.type === "vote") return false;
    // 墓地: 占い師・狂った占い師(設定枚数まで) / 墓荒らし(1枚)
    return m.role === "seer" || m.role === "mad_seer" || m.role === "relic_robber";
  }

  // ---------------------------------------------------------
  // 描画の反映（再描画のたびに呼ばれる。DOMは作り直さずクラスだけ更新）
  // ---------------------------------------------------------
  function faceHtml(role) {
    if (role === UNK_MARK) return `<div class="tb-wolfmark tb-unk">？</div>`;
    if (role === LOVE_MARK) return `<div class="tb-wolfmark tb-love">❤️</div>`;
    if (role === SELF_LOVE) return `<div class="tb-wolfmark tb-master tb-love"><span>❤️</span><small>恋人</small></div>`;
    if (role === TARGET_MARK) return `<div class="tb-wolfmark tb-target"><span>🎯</span><small>ターゲット</small></div>`;
    if (role === MASTER_MARK) return `<div class="tb-wolfmark tb-master"><span>👑</span><small>ご主人</small></div>`;
    if (role === DUO_MARK) return `<div class="tb-wolfmark tb-duo"><span>🐺</span><span>❤️</span></div>`;
    if (role === WOLF_MARK) return `<div class="tb-wolfmark">🐺</div>`;   // 狂信者に見える「人狼」の印（役職名は出さない）
    const info = ONW.roles.getInfo(role);
    return `${ONW.ui.roleIcon(role, "role-icon--face")}<b>${esc(info.name)}</b>`;
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
    const t = s.querySelector(".tb-drunk-n");
    if (t) t.textContent = n === null ? "" : String(n);
  };
  function paint(g) {
    const el = $t(), m = mode(g), me = ONW.net.myId();
    const hideOthers = !!(g.strawPick && g.strawKind === "assassin");
    const hold = !hideOthers ? g.asnHold : null;   // アサシンが選び終わったあとも、結果の演出でめくれるまでは、選んでいる間の見た目のまま（裏に戻さない）
    const rec = {};   // アサシンが暗殺先を選ぶまで、自分以外のカード（死亡者を含む）は表にしない（マーリンと見えてしまわないように）
    el.querySelectorAll(".tb-seat[data-k]").forEach((s) => {
      const k = s.dataset.k, isP = k.startsWith("p:");
      // アサシンが選んでいる間: すでにめくれた人（自分を含む）は全員同じ「？」のカードで表に、まだの人は裏のまま（役職もマーリンも見せない）
      const flipped = hideOthers && isP && (g.strawFlipped || []).includes(k.slice(2));
      const mine = hideOthers && isP && k.slice(2) === me;   // 選んでいるアサシン本人のカードだけは、自分の役職で表に見える
      const h = hold && isP ? hold[k] : null;
      const role = mine ? ONW.ROLE.ASSASSIN : hideOthers && isP ? (flipped ? UNK_MARK : undefined) : (up[k] || (h && h.role));
      if (hideOthers && isP && role) rec[k] = { role, dead: !!flipped };
      if (role && s.dataset.role !== role) {
        s.dataset.role = role;
        const f = s.querySelector(".tb-front");
        f.innerHTML = faceHtml(role);
        f.className = `tb-front tb-team-${role === UNK_MARK ? "third" : role === WOLF_MARK || role === DUO_MARK ? "wolf" : role === LOVE_MARK ? "love" : role === TARGET_MARK ? "target" : role === MASTER_MARK || role === SELF_LOVE ? "master" : ONW.roles.getInfo(role).team}`;
      }
      const sel = (m && m.type === "vote" && g.voteSel === k.slice(2) && isP) || (m && (m.type === "night" || m.type === "morning") && (isP ? (g.nightSel && g.nightSel.players || []).includes(k.slice(2)) : (g.nightSel && g.nightSel.graves || []).includes(+k.slice(2)))) || (g.voted && g.myVote && k === `p:${g.myVote}`);
      s.classList.toggle("up", !!role);
      s.classList.toggle("pick", pickable(k, m, g));
      s.classList.toggle("sel", !!sel);
      s.classList.toggle("dead", !!dead[k] || flipped || !!(h && h.dead));
      s.classList.toggle("gone", !!(m && m.type === "straw" && g.strawKind !== "assassin" && isP && !g.strawPick.some((c) => c.id === k.slice(2))));   // わら人形の選択中: すでにめくれた人（選べない人）のカードは黒と灰色
      s.classList.toggle("glow", !!glow[k]);
      s.classList.toggle("glow-master", role === MASTER_MARK);   // ご主人のカードは紫に光る
      // 道連れ・暗殺を選んでいる人のカードは、選び終わるまで揺れ続ける（選んでいるアサシン本人の画面では、同時に選んでいる他の人の「？」は揺らさない）
      s.classList.toggle("choosing", !!(isP && (g.strawShake || []).includes(k.slice(2)) && (!hideOthers || k.slice(2) === me)));
      s.classList.toggle("drunk", isP && k.slice(2) === me && drunkLeft(g) !== null);   // 酔っ払い（未覚醒）本人の画面だけ: 自分のカードが黄×白のしまになり、🍺と「酔いが覚めるまで」の秒数が出る
      s.classList.toggle("jobup", jobKeys.includes(k));   // 就職先の画面でめくれたフリーターの青い光と札
      s.classList.toggle("starup", starKeys.includes(k) || flashKeys.includes(k));   // スター公開中の金色の光と札
      s.classList.toggle("shinju", !!shin[k]);
      s.classList.toggle("lov", !!lov[k]);
      { const lv = s.querySelector(".tb-lov"); if (lv) { const t = typeof lov[k] === "number" ? `<span>❤</span><span>${lov[k]}</span>` : "<span>❤</span>"; if (lv.dataset.t !== t) { lv.dataset.t = t; lv.innerHTML = t; } } }   // 結果発表: 丸の中にハートと恋人番号
      s.classList.toggle("almost", !!alm[k]);
      ["descend", "spark", "blow", "win", "chicken"].forEach((c) => s.classList.toggle("gx-" + c, gx[k] === c));   // 神降臨・神の祝福の演出
      if (gx[k] === "blow" && role && ONW.roles.getInfo(role)) s.dataset.ghost = ONW.roles.getInfo(role).name; else delete s.dataset.ghost;   // 吹き飛んだあとの点線のカードに書く役職名   // 従者の身代わり: ご主人のカードがめくれそうになって戻る
      ["by", "aim", "slash", "hit", "miss"].forEach((c) => s.classList.toggle("asn-" + c, asn[k] === c));   // アサシンの演出
      const b = s.querySelector(".tb-badge");
      const text = badge[k] || (g.voted && g.myVote && k === `p:${g.myVote}` && g.phase === ONW.PHASE.ONLINE_VOTE ? "投票" : "");
      if (b.textContent !== text) { b.textContent = text; b.classList.toggle("tb-badge--dead", !!dead[k]); }
    });
    if (hideOthers) g.asnHold = rec;
    stage.drunkTick();
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
    const list = roster(g);
    if (!VISIBLE().includes(ph(g)) || !list.length) {
      if (key !== null) { clearAll(); key = null; specShown = {}; specBusy = false; g.asnHold = null; up = {}; dead = {}; deathMarks = []; badge = {}; glow = {}; shin = {}; lov = {}; loveMate = null; asn = {}; alm = {}; gx = {}; starKeys = []; flashKeys = []; jobKeys = []; nightKeys = []; busy = false; seq = false; el.innerHTML = ""; }
      el.classList.remove("on");
      return;
    }
    const k = `${g.dealStart || 0}|${list.map((p) => p.id).join(",")}|${graveN(g)}`;
    if (k !== key) { clearAll(); key = k; specShown = {}; specBusy = false; g.asnHold = null; up = {}; dead = {}; deathMarks = []; badge = {}; glow = {}; shin = {}; lov = {}; loveMate = null; asn = {}; alm = {}; gx = {}; starKeys = []; flashKeys = []; jobKeys = []; nightKeys = []; busy = false; seq = false; build(g, list); }
    el.classList.add("on");
    // 観戦者（観戦ONのホスト含む）: 全員のカードを表にして見せる（結果の演出中は除く）
    if ((g.isSpectator || hostWatching(g)) && g.specInfo && g.phase !== ONW.PHASE.ONLINE_RESULT) specSync(g);
    // 昼中に死亡した席には「死亡」の札（結果発表では外す）
    if (g.phase === ONW.PHASE.ONLINE_RESULT) {
      deathMarks.forEach((k) => { delete dead[k]; if (badge[k] === "死亡") delete badge[k]; });
      deathMarks = [];
    } else {
      (g.boardView || []).filter((p) => p.dead).forEach((p) => { const k = `p:${p.id}`; if (!dead[k]) { dead[k] = true; badge[k] = "死亡"; deathMarks.push(k); } });
    }
    paint(g);
    // 朝になったら、夜の選択が実行される演出（占い=表に / 怪盗・墓荒らし=入れ替わって表に / いたずらっ子=入れ替わる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && (g.morningReveal || g.morningInsom) && !g.morningShown && !g.isSpectator) {
      g.morningShown = true; const r = g.morningReveal, ins = g.morningInsom;
      if (r) later(() => playMorning(r), 700);
      // 墓荒らしが交換した後の役職の能力は、朝の演出が終わってから使える
      if (g.morningChain) later(() => { g.morningChainReady = true; ONW.ui.render(G()); }, (r ? 700 + morningDur(r) : 300) + 300);
      // 後覚者（元々 / 後から）: 夜能力の演出があればその後に、なければ朝になってすぐ、自分のカードが最終役職で表になる
      if (ins) later(() => show(`p:${ONW.net.myId()}`, ins), r ? 700 + morningDur(r) : 300);
    }
    // 朝が終わった直後の待機時間: 後覚者の最終役職がここで表になる
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settleInsom && !g.settleShown && !g.isSpectator) { g.settleShown = true; show(`p:${ONW.net.myId()}`, g.settleInsom); }
    // スター公開: 待機時間に、最終盤面でスターを持っている人のカードが全員の画面で同時に表になる（後覚者の確認とは別に「スター」の札が付く）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling && g.settleStars && g.settleStars.length && !g.settleStarShown && !g.isSpectator && !hostWatching(g)) {
      g.settleStarShown = true;
      later(() => { g.settleStars.forEach((id, i) => later(() => { const k = `p:${id}`; show(k, "star"); badge[k] = "★スター"; starKeys.push(k); paint(G()); }, i * 380)); }, 300);
    }
    // フリーター: 待機時間に、就職先になった人の画面で、就職してきたフリーターのカードが表になる（就職先本人だけ。昼になったら札を外して伏せる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling && g.settleFreeters && g.settleFreeters.length && !g.settleFreeterShown && !g.isSpectator && !hostWatching(g)) {
      g.settleFreeterShown = true;
      later(() => { g.settleFreeters.forEach((id) => { show(`p:${id}`, "freeter"); }); paint(G()); }, 900);
    }
    // 訪問者: 待機時間に、訪問された人の画面で、訪問してきた訪問者のカードが表になる（訪問された本人だけ。昼になったら伏せる）。入れ替わりで訪問者のカードが動いていれば、いまの持ち主のカードが表になる
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling && g.settleVisitors && g.settleVisitors.length && !g.settleVisitorShown && !g.isSpectator && !hostWatching(g)) {
      g.settleVisitorShown = true;
      later(() => { g.settleVisitors.forEach((id) => { show(`p:${id}`, "visitor"); }); paint(G()); }, 900);
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
          later(() => { delete up[k]; paint(G()); }, 5600);
        } else later(() => { delete up[k]; paint(G()); }, 4300);
      }
    }
    // 昼にフリーターが就職してきた就職先: そのときのフリーターのカードが表になり、数秒後に閉じる
    if (g.jobFlash && g.jobFlash.length) {
      const list = g.jobFlash; g.jobFlash = [];
      if (!g.isSpectator && !hostWatching(g)) {
        later(() => { list.forEach((x) => { up[`p:${x.id}`] = x.role; }); paint(G()); }, 200);
        later(() => { list.forEach((x) => { delete up[`p:${x.id}`]; }); paint(G()); }, 3700);
      }
    } else if (g.jobFlash) g.jobFlash = [];
    // 昼に酔いが覚めた本人: 夜と同じように、見える人のカード（人狼なら🐺・共有者・墓地・神は全員）がめくれ、しばらくして裏に戻る
    if (g.soberPeek) {
      const sp = g.soberPeek; g.soberPeek = null;
      if (!g.isSpectator && !hostWatching(g)) {
        const list = [];
        (sp.wolves || []).forEach((id) => list.push([`p:${id}`, WOLF_MARK, true]));
        (sp.masons || []).forEach((id) => list.push([`p:${id}`, "mason", true]));
        if (sp.target) list.push([`p:${sp.target}`, TARGET_MARK, true]);   // 酔いが覚めた処刑人: ターゲットのカードがめくれる
        if (sp.master) list.push([`p:${sp.master}`, MASTER_MARK, true]);   // 酔いが覚めた従者: ご主人のカードがめくれる
        let mateK = null, mateWolf = false;
        if (sp.love) {   // 酔いが覚めた恋人: 自分が「恋人」にめくれるのと同時に、相方のカードがハートでめくれる（人狼の🐺と重なるときは🐺と❤️）
          mateK = `p:${sp.love}`; mateWolf = list.some((x) => x[0] === mateK && x[1] === WOLF_MARK);
        }
        (sp.graves || []).forEach((c, i) => list.push([`g:${i}`, c, true]));
        if (sp.god) { Object.keys(sp.god.players).forEach((id) => list.push([`p:${id}`, sp.god.players[id], true])); sp.god.graves.forEach((c, i) => list.push([`g:${i}`, c, true])); }
        const me = `p:${ONW.net.myId()}`;
        list.forEach(([k, role], i) => later(() => { if (k === me) return; up[k] = role; glow[k] = true; paint(G()); }, 300 + i * 380));
        if (mateK && mateK !== me) {
          const inList = list.some((x) => x[0] === mateK);
          if (inList) later(() => { delete up[mateK]; paint(G()); }, 1900);   // すでに開いている相方（🐺など）もいったん裏返す
          later(() => { if (mateWolf) up[mateK] = DUO_MARK; else if (inList) { up[mateK] = list.find((x) => x[0] === mateK)[1]; lov[mateK] = true; } else up[mateK] = LOVE_MARK; glow[mateK] = true; paint(G()); }, 2700);
          later(() => { delete up[mateK]; delete glow[mateK]; delete lov[mateK]; paint(G()); }, 5600);
        }
        later(() => { list.forEach(([k]) => { if (k === me || k === mateK) return; delete up[k]; delete glow[k]; delete lov[k]; }); paint(G()); }, 300 + list.length * 380 + 3500);
      }
    }
    // 昼に酔いが覚めたスター: 全員の画面でカードがめくれ、しばらくして裏に戻る
    if (g.starFlash && g.starFlash.length && !g.isSpectator && !hostWatching(g)) {
      const ids = g.starFlash; g.starFlash = [];
      ids.forEach((id, i) => later(() => { const k = `p:${id}`; up[k] = "star"; badge[k] = "★スター"; flashKeys.push(k); paint(G()); }, 200 + i * 380));
      later(() => { ids.forEach((id) => { const k = `p:${id}`; delete up[k]; delete badge[k]; flashKeys = flashKeys.filter((x) => x !== k); }); paint(G()); }, 200 + ids.length * 380 + 3000);
    } else if (g.starFlash) g.starFlash = [];
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && starKeys.length) { starKeys.forEach((k) => { delete badge[k]; }); starKeys = []; paint(G()); }   // 昼になったら札を外す（カードは下の行で伏せる）
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && g.morningUp && g.morningUp.length) { g.morningUp.forEach((k) => { delete up[k]; delete glow[k]; }); g.morningUp = []; paint(G()); }   // 占い結果などは朝時間の間ずっと表のまま。昼になったら伏せる
    if (g.phase !== ONW.PHASE.ONLINE_NIGHT && nightKeys.length) { nightKeys.forEach((k) => { delete up[k]; delete glow[k]; delete lov[k]; }); nightKeys = []; loveMate = null; paint(G()); }   // 神・大狼のカードは夜時間が終わったら伏せる   // 昼になったら伏せる
    if (g.loveReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.loveReveal; g.loveReveal = null; loveMate = r; if (r.mode === "solo") later(() => lovePeek(r), 700); }   // 恋人: 夜の始まりに相方のカードが❤️でめくれる（人狼の🐺・共有者・神と重なるときは、それぞれの演出の中で出す）
    if (g.masterReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.masterReveal; g.masterReveal = null; later(() => masterPeek(r), 700); }   // 従者: 夜の始まりにご主人のカードが「ご主人」の印でめくれる
    if (g.godReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.godReveal; g.godReveal = null; later(() => godPeek(r), 700); }   // 神: 夜の始まりに全員と墓地のカードが開く
    if (g.cultReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.cultReveal; g.cultReveal = null; later(() => cultPeek(r), 700); }   // 狂信者: 夜の始まりに人狼のカードが表になって🐺が出る
    if (g.masonReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.masonReveal; g.masonReveal = null; later(() => masonPeek(r), 700); }   // 共有者: 夜の始まりに仲間の共有者のカードが表になる
    if (g.bigReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.bigReveal; g.bigReveal = null; later(() => bigPeek(r), 700); }   // 大狼: 夜の始まりに墓地が全部開く
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
    if (m.type === "straw") { ONW.net.strawPick(id); ONW.stage.sync(g); ONW.ui.render(g); return; }
    if (m.type === "night" || m.type === "morning") {
      // 夜: 朝になるまで何度でも選び直せる（同じカードをもう一度押すと解除）。朝: 選んで「能力を使う」で確定
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] }, isP = k.startsWith("p:");
      const toggle = (arr, v, max) => { const at = arr.indexOf(v); if (at >= 0) arr.splice(at, 1); else { if (arr.length >= max) arr.shift(); arr.push(v); } };
      if (isP) {
        const max = m.role === "troublemaker" || m.role === "gremlin" ? 2 : 1;
        toggle(sel.players, id, max);
        if (m.role === "seer" || m.role === "mad_seer") sel.graves = [];     // 墓地とプレイヤーは同時に占えない
      } else {
        const max = (m.role === "seer" || m.role === "mad_seer") ? ONW.seerGraveMax(g) : 1;
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
  stage.onAck = function (d) {      // 朝に使った能力は、結果が返った瞬間に演出する
    busy = false;
    if (d.reveal) {
      playMorning(d.reveal);
      if (G().phase === ONW.PHASE.ONLINE_DAY) {
        const r = d.reveal;
        later(() => { dayKeys.forEach((k) => { delete up[k]; delete glow[k]; }); dayKeys = []; paint(G()); }, morningDur(r) + (r.items ? 0 : 0) + 3500);
      }
    }
  };
  function show(k, role, lit) {
    const g = G();
    up[k] = role; if (lit) glow[k] = true;
    if (g.phase === ONW.PHASE.ONLINE_DAY) dayKeys.push(k); else (g.morningUp = g.morningUp || []).push(k);   // 昼に使った能力: 朝のように出しっぱなしにせず、数秒後に閉じる
    paint(g);
  }
  function morningDur(r) {   // 朝の演出（playMorning）が終わるまでのおおよその時間(ms)
    if (r.kind === "peek") return (r.items.length - 1) * 450 + 1000;
    if (r.kind === "swap") return 1050 + 700;
    if (r.kind === "relic") return 540 + 1050 + 700;
    if (r.kind === "tm") return 1250 + 500;
    if (r.kind === "doppel") return 900 + 950 + 200 + 750;
    if (r.kind === "gremlin") return 900 + 950 + 200 + 750;
    return 1000;
  }
  function playMorning(r) {
    if (r.kind === "peek") r.items.forEach((it, i) => later(() => show(it.k, it.role), i * 450));
    else if (r.kind === "swap") swap(r);
    else if (r.kind === "relic") relic(r);
    else if (r.kind === "tm") tmSwap(r);
    else if (r.kind === "doppel") doppel(r);
    else if (r.kind === "gremlin") gremlin(r);
    // 墓荒らしで人狼系・狂信者・共有者を取ったとき: 交換の演出のあと、相方のカードが表になる（昼になるまで）
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

  // ---- ドッペルゲンガー: 選んだ人のカードがめくれる → そのコピーが自分の席へ飛ぶ → 自分のカードが新しい役職で表になる（選んだ人のカードは動かない） ----
  function doppel(r) {
    const mine = `p:${ONW.net.myId()}`, theirs = `p:${r.target}`, el = $t();
    const a = el.querySelector(`[data-k="${theirs}"] .tb-card`), b = el.querySelector(`[data-k="${mine}"] .tb-card`);
    if (!a || !b || !a.animate) { show(mine, r.role); return; }
    show(theirs, r.seen);                                    // 選ばれた人のカードがめくれる
    later(() => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ghost = document.createElement("div");           // めくれたカードのコピー（表向き）
      ghost.className = "tb-seat up";
      ghost.style.cssText = `position:fixed;left:${ra.left}px;top:${ra.top}px;width:${ra.width}px;height:${ra.height}px;margin:0;padding:0;pointer-events:none;z-index:60;`;
      const c = a.cloneNode(true);
      c.style.cssText = `width:${ra.width}px;height:${ra.height}px;`;
      c.classList.remove("pick", "sel");
      ghost.appendChild(c);
      document.body.appendChild(ghost);
      const dx = rb.left - ra.left, dy = rb.top - ra.top;
      const A = ghost.animate([
        { transform: "translate(0,0) scale(1)", opacity: 0.55 },
        { transform: `translate(${dx / 2}px,${dy / 2 - 26}px) scale(1.22)`, opacity: 0.9, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 0.8 },
      ], { duration: 900, easing: "ease-in-out", fill: "forwards" });
      later(() => {
        A.cancel(); ghost.remove();
        delete up[theirs]; delete glow[theirs];              // 選ばれた人のカードは伏せて元のまま
        show(mine, r.role);                                  // 自分のカードが、コピーした役職で表になる
      }, 950);
    }, 900);
  }

  // ---- グレムリン: コピー元のカードが表になる → そのコピーがコピー先へ飛んでいく → コピー先のカードが表になる（コピー元は動かない。どちらも朝のあいだ表のまま） ----
  function gremlin(r) {
    const from = `p:${r.from}`, to = `p:${r.to}`, el = $t();
    const a = el.querySelector(`[data-k="${from}"] .tb-card`), b = el.querySelector(`[data-k="${to}"] .tb-card`);
    const landed = () => { show(to, r.copied || r.role); };   // コピー先が、コピーされた役職で表になる
    if (!a || !b || !a.animate) { show(from, r.role); landed(); return; }
    show(from, r.role);                                      // コピー元のカードがめくれる
    later(() => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ghost = document.createElement("div");           // めくれたカードのコピー（表向き）
      ghost.className = "tb-seat up";
      ghost.style.cssText = `position:fixed;left:${ra.left}px;top:${ra.top}px;width:${ra.width}px;height:${ra.height}px;margin:0;padding:0;pointer-events:none;z-index:60;`;
      const c = a.cloneNode(true);
      c.style.cssText = `width:${ra.width}px;height:${ra.height}px;`;
      c.classList.remove("pick", "sel");
      ghost.appendChild(c);
      document.body.appendChild(ghost);
      const dx = rb.left - ra.left, dy = rb.top - ra.top;
      const A = ghost.animate([
        { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 0.6 },
        { transform: `translate(${dx / 2}px,${dy / 2 - 30}px) scale(1.25) rotate(-6deg)`, opacity: 0.95, offset: 0.5 },
        { transform: `translate(${dx}px,${dy}px) scale(1) rotate(0deg)`, opacity: 0.85 },
      ], { duration: 900, easing: "ease-in-out", fill: "forwards" });
      later(() => { A.cancel(); ghost.remove(); landed(); }, 950);
    }, 900);
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

  // ---- 神: 夜の始まりに全員と墓地のカードが順に開き、金色に光る → 夜時間の間ずっと開いたまま ----
  function godPeek(r) {
    const keys = [...Object.keys(r.players).map((id) => [`p:${id}`, r.players[id]]), ...r.graves.map((c, i) => [`g:${i}`, c])];
    keys.forEach(([k, role], i) => later(() => { if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; up[k] = role; glow[k] = true; if (loveMate && k === `p:${loveMate.id}`) lov[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G()); }, i * 300));
  }   // 閉じるのは夜時間が終わったとき（sync）

  // ---- 狂信者: 夜の始まりに人狼プレイヤーのカードが順に表になり、🐺が出る → 夜時間の間ずっと開いたまま ----
  function cultPeek(ids) {
    ids.forEach((id, i) => later(() => { const k = `p:${id}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; up[k] = loveMate && loveMate.id === id ? DUO_MARK : WOLF_MARK; glow[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G()); }, i * 380));
  }
  // ---- 恋人: 夜の始まりに相方のカードが❤️でめくれる → 夜時間の間ずっと開いたまま ----
  function lovePeek(r) {
    const k = `p:${r.id}`;
    if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
    up[k] = LOVE_MARK; glow[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G());
  }

  // ---- 従者: 夜の始まりにご主人のカードが「👑ご主人」でめくれる → 夜時間の間ずっと開いたまま（ご主人が恋人の相方でもあるときは、右上に丸いハート） ----
  function masterPeek(r) {
    const k = `p:${r.id}`;
    if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
    up[k] = r.mark || MASTER_MARK; glow[k] = true; if (loveMate && loveMate.id === r.id) lov[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G());
  }

  // ---- 共有者: 夜の始まりに仲間の共有者のカードが順に表になる → 夜時間の間ずっと開いたまま ----
  function masonPeek(ids) {
    ids.forEach((id, i) => later(() => { const k = `p:${id}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; up[k] = "mason"; glow[k] = true; if (loveMate && id === loveMate.id) lov[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G()); }, i * 380));
  }

  // ---- 大狼: 夜の始まりに墓地のカードが順に全部開き、赤く光る → 夜時間の間ずっと開いたまま ----
  function bigPeek(roles) {
    roles.forEach((role, i) => later(() => { const k = `g:${i}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; up[k] = role; glow[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G()); }, i * 380));
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
    const team = res.title.startsWith("村人") ? "village" : res.title.startsWith("人狼") ? "wolf" : res.title.startsWith("恋人") ? "lover" : "third";
    return `<div class="rs-win t-${team}">${esc(res.title)}</div><div class="rs-dim">${esc(res.detail || "")}</div>`;
  }
  function startResult(g) {
    seq = true;
    const res = g.result, P = (id) => `p:${id}`;
    const order = res.chainOrder || [];
    const subs = res.servantSubs || [];                       // 従者の身代わり（起きた順）
    const subIds = new Set(subs.map((x) => x.servantId));     // 身代わりになった従者は、通常の追放フリップから除く（二重にめくらない）
    const exec = res.history.filter((h) => h.dead && h.cause !== "chain" && !subIds.has(h.id));
    const chain = res.history.filter((h) => h.cause === "chain").sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const loverNo = {}; res.history.forEach((h) => { if (h.lover) loverNo[h.id] = h.loverNo || true; });
    const lovOn = (id) => { if (loverNo[id]) lov[P(id)] = loverNo[id]; };   // 結果でめくれる恋人のカードは、右上に丸いハート
    const rest = [...res.history.filter((h) => !h.dead).map((h) => [P(h.id), h.role, h.id]), ...res.grave.map((c, i) => [`g:${i}`, c.role])];
    const god = res.god || {}, godSpark = (id) => god.mode === "bless" && (god.ids || []).includes(id);   // 神の祝福: 追放・道連れで死んだ神だけ、めくれたときにキラキラ
    let t = 600;
    setCap(`<div class="res-cap__t">投票の結果</div>`);
    res.counts.forEach((c, i) => later(() => { badge[P(c.id)] = `${c.c}票`; paint(G()); }, t + i * 350));
    t += res.counts.length * 350 + 1000;
    // 従者の身代わり: ご主人のカードがめくれそうになる（途中まで回って揺れ、また裏のまま戻る）→ 従者のカードが表になる。複数あれば1組ずつ順に
    subs.forEach((x) => {
      const mk = P(x.masterId), sk = P(x.servantId), sh = res.history.find((h) => h.id === x.servantId);
      later(() => { setCap(`<div class="res-cap__t t-wolf">従者の身代わり</div><div>${esc(x.master)} が追放されそうになりました…</div>`); alm[mk] = true; paint(G()); }, t);
      later(() => {
        delete alm[mk];
        up[sk] = (sh && sh.role) || "servant"; lovOn(x.servantId); dead[sk] = true; badge[sk] = "身代わり";
        setCap(`<div class="res-cap__t t-wolf">従者の身代わり</div><div>${esc(x.servant)} が ${esc(x.master)} の身代わりになりました</div>`);
        paint(G());
      }, t + 1900);
      t += 4300;
    });
    if (subs.length && !exec.length) t -= 600;   // 通常の追放がなければ、すぐ次へ
    later(() => {
      if (subs.length && !exec.length) return;   // 追放されたのが身代わりの従者だけなら、字幕はそのまま（「誰も追放されませんでした」にしない）
      exec.forEach((h) => { if (godSpark(h.id)) { gx[P(h.id)] = "spark"; gxStars(); } up[P(h.id)] = h.role; lovOn(h.id); dead[P(h.id)] = true; badge[P(h.id)] = h.mental ? "メンタル崩壊" : h.shock ? "ショック死" : h.execTg ? "処刑" : "追放"; });
      const execN = exec.filter((h) => !h.mental && !h.shock), mentalN = exec.filter((h) => h.mental), shockN = exec.filter((h) => h.shock);
      setCap(exec.length ? `${execN.length ? `<div class="res-cap__t t-wolf">追放</div><div>${execN.map((h) => esc(h.name)).join("、")}</div>` : ""}${mentalN.length ? `<div class="res-cap__t t-wolf">メンタル崩壊</div><div>${mentalN.map((h) => esc(h.name)).join("、")}</div>` : ""}${shockN.length ? `<div class="res-cap__t t-wolf">ショック死</div><div>${shockN.map((h) => esc(h.name)).join("、")}</div>` : ""}` : `<div class="res-cap__t">誰も追放されませんでした</div>`);
      paint(G());
    }, t);
    const glWin = (res.execs || []).filter((x) => x.win && x.execId !== x.targetId);   // ターゲットが追放された処刑人
    const glExec = glWin.filter((x) => exec.some((h) => h.id === x.targetId));
    glExec.forEach((x) => glSeq(x, t));
    t += exec.length ? 3200 + (glExec.length ? GL_DUR : 0) : subs.length ? 300 : 1500;
    // 一目惚れしてるてるが先にめくれ、そのあとで道連れにされた人が1人ずつ無理心中でめくれる
    // わら人形・猫又・黒猫が追放された場合も同じ演出で、めくれた順(連鎖の順)に1人ずつ「道連れ」でめくれる
    chain.forEach((h) => {
      const lab = h.kind === "tomo" ? "道連れ" : h.kind === "lovers" ? "心中" : "無理心中";
      later(() => {
        setCap(`<div class="res-cap__t t-wolf">${lab}</div><div>${h.kind === "tomo" && h.by ? `${esc(h.by)} → ` : h.kind === "lovers" && h.by ? `${esc(h.by)} ❤ ` : ""}${esc(h.name)}</div>`);
        shin[P(h.id)] = true; dead[P(h.id)] = true; badge[P(h.id)] = lab; paint(G());
      }, t);
      later(() => { if (godSpark(h.id)) { gx[P(h.id)] = "spark"; gxStars(); } up[P(h.id)] = h.role; lovOn(h.id); paint(G()); }, t + 1300);   // 演出のあとでカードが表に（神の祝福なら、めくれたときからキラキラ）
      const glC = glWin.filter((x) => x.targetId === h.id);   // 道連れ・心中で死んだターゲットも、追放された人として数える
      glC.forEach((x) => glSeq(x, t + 1300));
      t += 3400 + (glC.length ? GL_DUR : 0);
    });
    // アサシン: 暗殺者のカードが光り、狙われた相手に照準 → 斬撃 → カードが表になってマーリンかどうかが分かる
    // （選ばれた相手は死なない。当たりは赤い閃光で「暗殺」、外れは静かに「無事」）
    (res.assassin || []).forEach((a) => {
      const head = `<div class="res-cap__t t-wolf">アサシン</div><div>${esc(a.by)} → ${esc(a.target)}</div>`;
      const tk = P(a.targetId), bk = P(a.byId);
      later(() => { setCap(`<div class="res-cap__t t-wolf">アサシン</div><div>${esc(a.by)} が暗殺する相手を選びました…</div>`); asn[bk] = "by"; paint(G()); }, t);
      later(() => { setCap(head); asn[tk] = "aim"; paint(G()); }, t + 1300);                    // 照準
      later(() => { asn[tk] = "slash"; paint(G()); }, t + 2400);                                // 斬撃
      later(() => {                                                                            // カードが表に → 結果
        up[tk] = a.role; asn[tk] = a.hit ? "hit" : "miss"; delete asn[bk];
        badge[tk] = a.hit ? "暗殺" : "無事";
        setCap(`${head}<div class="${a.hit ? "t-wolf" : "rs-dim"}">${a.hit ? "マーリンでした！ 暗殺成功" : "マーリンではありませんでした（暗殺失敗）"}</div>`);
        paint(G());
      }, t + 3200);
      t += 5200;
    });
    later(() => setCap(`<div class="res-cap__t">結果発表</div>`), t);
    rest.forEach(([k, r, hid], i) => later(() => {
      up[k] = r; if (hid) lovOn(hid);
      if (god.mode === "descend" && hid && (god.ids || []).includes(hid)) {   // 生存している神がめくれると、ファーンと神が降臨する
        gx[k] = "descend"; setCap(`<div class="res-cap__t t-third">神降臨</div><div>${esc((res.history.find((h) => h.id === hid) || {}).name || "")}</div>`);
        later(() => { if (gx[k] === "descend") { delete gx[k]; paint(G()); } }, 2400);
      }
      paint(G());
    }, t + 500 + i * 320));
    t += 500 + rest.length * 320 + 700;
    if (god.mode === "descend") t += 1800;
    if (god.mode === "bless") {   // 全員のカードがめくれたあと: 死んだオポ・天邪鬼・負け組が吹き飛ばされ、残りの人が祝福で勝つ
      const gods = new Set(god.ids || []), blown = new Set(res.history.filter((h) => !h.win).map((h) => h.id));   // 負けた人（神も含む）のカードが吹き飛ぶ
      later(() => {
        setCap(`<div class="res-cap__t t-third">神の祝福</div><div>神の光が降りそそぎます…</div>`);
        blown.forEach((id) => { gx[P(id)] = "blow"; });
        paint(G());
      }, t);
      later(() => {
        res.history.forEach((h) => { if (!blown.has(h.id) && !gods.has(h.id) && h.win) gx[P(h.id)] = "win"; });
        setCap(`<div class="res-cap__t t-third">神の祝福</div><div>${blown.size ? "負けた人のカードは吹き飛ばされ、" : ""}ほかの全員が勝利します</div>`);
        paint(G());
      }, t + 1500);
      t += 3600;
    }
    const rv = res.reverse;   // チキンの逆転演出: 逆転前の勝敗を先に発表 → チキンが飛び出して覆す
    if (rv && (rv.ids || []).length) {
      later(() => setCap(`<div class="rs-win t-${rv.fromTitle.startsWith("村人") ? "village" : rv.fromTitle.startsWith("人狼") ? "wolf" : "third"}">${esc(rv.fromTitle)}</div>`), t);
      t += 1000;
      later(() => setCap(`<svg class="rv-burst" viewBox="0 0 100 100" width="150" height="150"><polygon points="50.0,2.0 56.7,20.8 70.8,6.8 68.7,26.5 87.5,20.1 77.0,37.0 96.8,39.3 80.0,50.0 96.8,60.7 77.0,63.0 87.5,79.9 68.7,73.5 70.8,93.2 56.7,79.2 50.0,98.0 43.3,79.2 29.2,93.2 31.3,73.5 12.5,79.9 23.0,63.0 3.2,60.7 20.0,50.0 3.2,39.3 23.0,37.0 12.5,20.1 31.3,26.5 29.2,6.8 43.3,20.8" fill="#ffe14d" stroke="#222" stroke-width="3" stroke-linejoin="miter"/><text x="50" y="68" text-anchor="middle" font-size="58" font-weight="900" fill="#e02020" stroke="#222" stroke-width="1.5">!</text></svg>`), t);
      t += 1500;
      later(() => {
        rv.ids.forEach((id) => { gx[P(id)] = "chicken"; });
        setCap("");
        paint(G());
      }, t);
      t += 2800;
      later(() => { rv.ids.forEach((id) => { delete gx[P(id)]; }); setCap(`<div class="res-cap__t t-village">チキンが勝利を逆転させた！</div>`); paint(G()); }, t);
      t += 1800;
    }
    later(() => setCap(winHtml(res)), t);
    const losersN = god.mode === "bless" ? [] : res.history.filter((h) => !h.win);   // 神の祝福以外: 結果の字幕のあと、負けた人のカードが吹き飛ぶ
    if (losersN.length) later(() => { losersN.forEach((h) => { gx[P(h.id)] = "blow"; }); paint(G()); }, t + 1300);
    later(toSheet, t + (losersN.length ? 3800 : 2800));
  }
  // ---- 処刑人: ターゲットが追放されたとき、めくれたカードが揺れ始め → ギロチンの刃が落ちて → カードが真っ二つに割れる ----
  function glHalves(k) {
    const seat = $t().querySelector(`[data-k="${k}"]`), card = seat && seat.querySelector(".tb-card"), front = seat && seat.querySelector(".tb-front");
    if (!card || !front) return null;
    let hs = card.querySelectorAll(".gl-half");
    if (hs.length) return [...hs];
    hs = ["gl-top", "gl-bot"].map((c) => {
      const h = document.createElement("div"); h.className = `gl-half ${c}`;
      const f = front.cloneNode(true); f.classList.add("gl-face"); h.appendChild(f); card.appendChild(h); return h;
    });
    const inner = card.querySelector(".tb-inner"); if (inner) inner.style.visibility = "hidden";   // 元のカードは隠し、同じ見た目の2枚(上下)に置き換える
    return hs;
  }
  function glFinal(k) { const hs = glHalves(k); if (hs) hs.forEach((h) => h.classList.add("split")); }   // スキップ時: 最初から割れた状態
  function glClear() {
    const el = $t(); if (!el) return;
    el.querySelectorAll(".gl-half,.gl-blade").forEach((n) => n.remove());
    el.querySelectorAll(".tb-inner").forEach((n) => { n.style.visibility = ""; });
    el.querySelectorAll(".gl-shake").forEach((n) => n.classList.remove("gl-shake"));
  }
  const GL_DUR = 3300;   // めくれてから処刑人勝利の字幕まで
  function glSeq(x, at) {   // x: res.execs の1件（ターゲットが追放された処刑人）。at: ターゲットのカードがめくれる時刻
    const k = `p:${x.targetId}`;
    later(() => { const s = $t().querySelector(`[data-k="${k}"]`); if (s) s.classList.add("gl-shake"); }, at + 800);   // めくれ終わったら揺れ始める
    later(() => {                                                                                                   // 刃が落ちる
      const card = $t().querySelector(`[data-k="${k}"] .tb-card`); if (!card) return;
      const b = document.createElement("div"); b.className = "gl-blade"; card.appendChild(b);
      later(() => b.remove(), 600);
    }, at + 1900);
    later(() => { const s = $t().querySelector(`[data-k="${k}"]`); if (s) s.classList.remove("gl-shake"); const hs = glHalves(k); if (hs) requestAnimationFrame(() => hs.forEach((h) => h.classList.add("split"))); }, at + 2150);   // 刃が通り抜けた瞬間に真っ二つ
    later(() => setCap(`<div class="res-cap__t t-third">処刑人勝利</div><div>${esc(x.exec)} のターゲット ${esc(x.target)} が追放されました</div>`), at + 3000);
  }
  function toSheet() {
    const g = G(); clearAll(); g.asnHold = null;
    g.resultStage = "sheet";
    ONW.ui.render(g);
  }
  stage.skipResult = function () {
    const g = G(), res = g.result;
    if (!res) return;
    clearAll(); alm = {}; glClear();   // 身代わりの「めくれそう」演出・処刑人の演出も止める
    res.history.forEach((h) => { up[`p:${h.id}`] = h.role; if (h.lover) lov[`p:${h.id}`] = h.loverNo || true; if (h.dead) { dead[`p:${h.id}`] = true; badge[`p:${h.id}`] = (res.servantSubs || []).some((x) => x.servantId === h.id) ? "身代わり" : h.cause === "chain" ? (h.kind === "tomo" ? "道連れ" : h.kind === "lovers" ? "心中" : "無理心中") : h.mental ? "メンタル崩壊" : h.shock ? "ショック死" : h.execTg ? "処刑" : "追放"; if (h.cause === "chain") shin[`p:${h.id}`] = true; } });
    res.grave.forEach((c, i) => { up[`g:${i}`] = c.role; });
    if (res.god && res.god.mode === "bless") {   // 神の祝福: 神はキラキラ・吹き飛ばされた人は消え・勝つ人は金色
      const gd = new Set(res.god.ids || []);
      res.history.forEach((h) => { gx[`p:${h.id}`] = gd.has(h.id) ? "spark" : h.win ? "win" : undefined; });
    }
    (res.execs || []).forEach((x) => { if (x.win && x.execId !== x.targetId) glFinal(`p:${x.targetId}`); });   // 処刑人のターゲット: 割れた状態で見せる
    (res.assassin || []).forEach((x) => { badge[`p:${x.targetId}`] = x.hit ? "暗殺" : "無事"; });   // アサシンに選ばれた人（死なない）
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
    runNews();   // 新聞配達員がいれば、変化公開の紙のあとに新聞の紙が出る
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
  }
  /** ホストのスキップが届いた: 紙を今すぐ下の欄へ飛ばす（まだ紙が出ていなければ、これから出さない） */
  stage.skipPaper = function () {
    const g = G();
    g.newsSkip = true;   // ホストのスキップは、このあとに出る新聞の紙も飛ばす（新聞は情報確認から見られる）
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
    paper.style.setProperty("--nwp-fs", Math.max(MIN, Math.floor(BASE * ratio * 10 * 0.95) / 10) + "px");
  }
  function drawNews(lines) {
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

  ONW.stage = stage;
})(window.ONW);
