/**
 * debug.js — 本家(マイクラ版)の「デバッグ」メニュー相当（ホスト専用）
 *   役職確認 / 投票先指定 / 固定役(参加者・墓地・変化後) / CPUの能力先指定 / CPU議論発言ON/OFF / 夜ログ
 * ルーム設定の「デバッグモード」をONにすると有効。ONの間は全員に「デバッグモード中」と表示する。
 * 固定役とCPU能力先は「次の試合」に反映され、「一斉解除」するまで残る（本家と同じ）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const debug = {};
  const G = () => ONW.game;
  const PH = () => ONW.PHASE;
  const esc = (s) => ONW.utils.esc(s);
  const rn = (r) => ONW.roles.getInfo(r).name;
  const teamCls = (r) => "t-" + ONW.roles.getInfo(r).team;
  const ui = { open: false, tab: "roles", pick: null };

  /** 設定データ（固定役 / 変化後 / CPU能力先 / CPU発言OFF） */
  const data = () => { const g = G(); return (g.dbg = g.dbg || { roles: {}, tf: {}, cpu: {}, cpuTalkOff: false }); };

  // ---------------------------------------------------------
  // ゲーム側から呼ばれるフック
  // ---------------------------------------------------------
  /** 配役(シャッフル済みのdeck)に固定役を反映する。deckの並び = プレイヤー順 → 墓地 */
  debug.applyLocks = function (game, deck) {
    game.dbgWarn = [];
    if (!game.debugOn || !game.dbg) return;
    const n = game.players.length;
    const keys = [...game.players.map((p) => p.id), ...Array.from({ length: Math.max(0, deck.length - n) }, (_, i) => `center:${i}`)];
    const nameOfKey = (k) => (k.startsWith("center:") ? `墓地${Number(k.slice(7)) + 1}` : (game.players.find((p) => p.id === k) || {}).name || k);
    const locked = new Set();
    Object.entries(game.dbg.roles || {}).forEach(([key, role]) => {
      const idx = keys.indexOf(key);
      if (idx < 0) return;                                    // 参加していない人の固定は無視
      if (deck[idx] === role) { locked.add(idx); return; }
      const j = deck.findIndex((r, k) => r === role && k !== idx && !locked.has(k));
      if (j < 0) { game.dbgWarn.push(`${nameOfKey(key)} の「${rn(role)}」固定は、配役に枚数が足りないため無効でした。`); return; }
      [deck[idx], deck[j]] = [deck[j], deck[idx]];            // 枚数は変えず、入れ替えて固定する
      locked.add(idx);
    });
  };
  /** 変化役の「変化後」固定。固定役が変化役のときだけ有効 */
  debug.forcedTransform = function (game, key, before) {
    if (!game.debugOn || !game.dbg) return null;
    const t = (game.dbg.tf || {})[key];
    if (!t || (game.dbg.roles || {})[key] !== before) return null;
    return (ONW.TRANSFORM_GROUPS[before] || []).includes(t) ? t : null;
  };
  /** CPUの夜の能力先指定 { player?, graves? } */
  debug.cpuTarget = function (game, id) {
    if (!game.debugOn || !game.dbg) return null;
    return (game.dbg.cpu || {})[id] || null;
  };

  // ---------------------------------------------------------
  // ON/OFF
  // ---------------------------------------------------------
  debug.toggle = function () {
    const g = G();
    if (!ONW.net.isHost || g.inGame) return;
    if (!g.debugOn && !window.confirm("デバッグモードをONにします。\n参加者全員の画面に「デバッグモード中」と表示されます。")) return;
    g.debugOn = !g.debugOn;
    try { localStorage.setItem("onw.debugOn.v1", g.debugOn ? "1" : "0"); } catch (e) {}   // ブラウザを開き直してもON/OFFを維持（ルーム作成時に復元）
    if (!g.debugOn) { ui.open = false; ui.pick = null; }
    ONW.net.syncLobby();
  };

  // ---------------------------------------------------------
  // 画面（#debug-root に描く。通常の画面の再描画には巻き込まれない）
  // ---------------------------------------------------------
  const attr = (s) => JSON.stringify(String(s)).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const b = (label, fn, args = [], cls = "", dis = false) =>
    `<button class="btn dbg-b ${cls}" ${dis ? "disabled" : ""} onclick="ONW.debug.${fn}(${args.map(attr).join(",")})">${label}</button>`;
  const hint = (t) => `<p class="night-step__hint">${t}</p>`;
  const cpuBadge = ' <small class="cb-cpu">CPU</small>';
  const row = (left, right) => `<div class="dbg-row"><span class="dbg-l">${left}</span><span class="dbg-r">${right}</span></div>`;

  function el(id, cls) {
    let e = document.getElementById(id);
    if (!e) { e = document.createElement("div"); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); }
    return e;
  }
  const inGame = () => { const g = G(); return !!g.inGame && g.players.length > 0; };
  const inLobby = () => { const g = G(); return !g.inGame && g.phase === PH().LOBBY; };

  /** ロビーでの固定対象（参加者 + CPU / 墓地） */
  function slots() {
    const g = G();
    const humans = (g.players || []).filter((p) => !p.isCpu && !p.spectate).map((p) => ({ key: p.id, name: p.name }));
    const cpus = Array.from({ length: g.cpuCount || 0 }, (_, i) => ({ key: `cpu_${i + 1}`, name: (g.cpuNames && g.cpuNames[i]) || `CPU${i + 1}`, cpu: true }));
    const graves = Array.from({ length: g.graveCount || 0 }, (_, i) => ({ key: `center:${i}`, name: `墓地${i + 1}` }));
    return { players: [...humans, ...cpus], graves };
  }

  // ---- 役職確認 ----
  function tabRoles() {
    const g = G();
    if (!inGame() || !Object.keys(g.initialRoles || {}).length) return hint("試合中に、全員の役職と墓地が表示されます。");
    const label = (ini, fin, from) => {
      const a = from ? `${rn(from)}(${rn(ini)})` : rn(ini);
      return `<span class="${teamCls(ini)}">${esc(a)}</span>` + (ini !== fin ? ` → <span class="${teamCls(fin)}">${esc(rn(fin))}</span>` : "");
    };
    const ps = g.players.map((p) => row(esc(p.name) + (p.isCpu ? cpuBadge : ""), label(g.initialRoles[p.id], g.currentRoles[p.id], g.transformFrom[p.id]))).join("");
    const cs = (g.center || []).map((r, i) => row(`墓地${i + 1}`, label(r, r, g.centerTransformFrom[i]))).join("");
    return hint("配られた役職 → 現在の役職（夜の行動で変わった場合）") + ps + cs;
  }

  // ---- 投票先指定 ----
  function tabVotes() {
    const g = G();
    if (!inGame() || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return hint("昼の議論〜投票の間に使えます。指定した票は通常の投票として扱われます。");
    const nm = (id) => (g.players.find((p) => p.id === id) || {}).name || "?";
    const forced = g.dbgVotes || {};
    const targets = (self) => g.players.filter((p) => p.id !== self);
    const rows = g.players.map((p) => {
      const cur = forced[p.id] ? `指定: ${esc(nm(forced[p.id]))}` : (g.phase === PH().ONLINE_VOTE && g.votes[p.id]) ? `投票済: ${esc(nm(g.votes[p.id]))}` : "未指定";
      let h = row(esc(p.name) + (p.isCpu ? cpuBadge : ""), `<span class="dbg-val">${cur}</span> ${b("変更", "pick", ["v:" + p.id])}`);
      if (ui.pick === "v:" + p.id) h += `<div class="dbg-pick">${targets(p.id).map((t) => b(esc(t.name), "voteSet", [p.id, t.id])).join("")}${b("指定を解除", "voteSet", [p.id, ""], "dbg-clear")}</div>`;
      return h;
    }).join("");
    const all = ui.pick === "vall" ? `<div class="dbg-pick">${g.players.map((t) => b(esc(t.name), "voteAll", [t.id])).join("")}</div>` : "";
    return rows + `<div class="dbg-actions">${b("全員の投票先を一括指定", "pick", ["vall"])}${b("全員の指定を解除", "voteClear")}</div>${all}`;
  }

  // ---- 固定役 ----
  function tabLocks() {
    const g = G(), d = data();
    if (!inLobby()) return hint("固定役はルーム（ロビー）で設定します。次の試合に反映されます。");
    const { players, graves } = slots();
    const valid = new Set([...players, ...graves].map((s) => s.key));
    const deckRoles = Object.keys(ONW.ROLE_INFO).filter((r) => (g.roleCounts[r] || 0) > 0);
    const slotRow = (s) => {
      const role = d.roles[s.key];
      const lab = role ? esc(rn(role)) + (d.tf[s.key] ? ` → ${esc(rn(d.tf[s.key]))}` : "") : "固定なし";
      let h = row(esc(s.name) + (s.cpu ? cpuBadge : ""), `<span class="dbg-val">${lab}</span> ${b("変更", "pick", ["l:" + s.key])}`);
      if (ui.pick === "l:" + s.key) {
        const used = (r) => Object.entries(d.roles).filter(([k, v]) => v === r && k !== s.key && valid.has(k)).length;
        const rb = deckRoles.map((r) => b(esc(rn(r)), "lockSet", [s.key, r], role === r ? "dbg-on" : "", used(r) >= (g.roleCounts[r] || 0))).join("");
        const tg = role && ONW.TRANSFORM_GROUPS[role]
          ? `<div class="dbg-sub">変化後</div>${b("ランダム", "tfSet", [s.key, ""], !d.tf[s.key] ? "dbg-on" : "")}${ONW.TRANSFORM_GROUPS[role].map((t) => b(esc(rn(t)), "tfSet", [s.key, t], d.tf[s.key] === t ? "dbg-on" : "")).join("")}` : "";
        h += `<div class="dbg-pick">${rb}${b("固定なし", "lockSet", [s.key, ""], "dbg-clear")}${tg}${b("閉じる", "pick", ["l:" + s.key])}</div>`;
      }
      return h;
    };
    const warn = (g.dbgWarn || []).length ? `<div class="dbg-warn">前回の開始時の警告:${g.dbgWarn.map((w) => `<div>・${esc(w)}</div>`).join("")}</div>` : "";
    return hint("選んだ役職を、次の試合のその人・その墓地に配ります（配役に入っている役職から選べます）。固定は「一斉解除」するまで残ります。") + warn +
      `<div class="dbg-h">参加者</div>${players.map(slotRow).join("") || hint("参加者がいません。")}` +
      `<div class="dbg-h">墓地</div>${graves.map(slotRow).join("") || hint("墓地がありません。")}` +
      `<div class="dbg-actions">${b("一斉解除（固定役・CPU能力先）", "lockClear", [], "dbg-clear")}</div>`;
  }

  // ---- CPUの能力先指定 ----
  /** そのCPUに固定した役職から、夜の能力で使える指定の種類を判断する（光の使徒などは「変化後」の指定まで見る） */
  const ABILITY = { seer: "seer", mad_seer: "seer", robber: "rob", love_tanner: "rob", troublemaker: "tm", relic_robber: "rel" };
  function cpuRoles(key) {   // 固定役 → 変化後の指定があればその役職 / 変化後がランダムなら候補すべて / 固定なしなら null
    const d = data(), r = d.roles[key];
    if (!r) return null;
    const grp = ONW.TRANSFORM_GROUPS[r];
    if (grp) return d.tf[key] ? [d.tf[key]] : grp.slice();
    return [r];
  }
  function cpuKinds(key) {
    const rs = cpuRoles(key), k = { seer: false, rob: false, tm: false, rel: false };
    if (!rs) { k.seer = k.rob = k.tm = k.rel = true; return k; }   // 固定なし: どの役職になるか分からないので全部出す
    rs.forEach((r) => { if (ABILITY[r]) k[ABILITY[r]] = true; });
    return k;
  }
  function tabCpu() {
    const g = G(), d = data();
    if (!inLobby()) return hint("CPUの能力先はルーム（ロビー）で設定します。次の試合に反映されます。");
    const { players } = slots(), cpus = players.filter((s) => s.cpu);
    if (!cpus.length) return hint("CPU人数を1人以上にすると設定できます。");
    const nameOfKey = (k) => (players.find((s) => s.key === k) || {}).name || "?";
    const rows = cpus.map((s) => {
      const t = d.cpu[s.key] || {}, role = d.roles[s.key], k = cpuKinds(s.key), rs = cpuRoles(s.key);
      const parts = [];
      if (t.player) parts.push(esc(nameOfKey(t.player)));
      if ((t.players || []).length) parts.push(t.players.map((id) => esc(nameOfKey(id))).join(" と "));
      if ((t.graves || []).length) parts.push(t.graves.map((i) => `墓地${i + 1}`).join("・"));
      const lab = parts.length ? parts.join(" / ") : "指定なし";
      const fixed = role ? ` <small class="dbg-dim">(${esc(rn(role))}${d.tf[s.key] ? " → " + esc(rn(d.tf[s.key])) : ""}固定)</small>` : "";
      let h = row(esc(s.name) + cpuBadge + fixed, `<span class="dbg-val">${lab}</span> ${b("変更", "pick", ["c:" + s.key])}`);
      if (ui.pick === "c:" + s.key) {
        const others = players.filter((o) => o.key !== s.key);
        const maxG = k.seer ? ONW.seerGraveMax(g) : 1;
        const sec = (title, inner) => `<div class="dbg-sub">${title}</div>${inner}`;
        const pb = (fn, sel) => others.map((o) => b(esc(o.name), fn, [s.key, o.key], sel(o.key) ? "dbg-on" : "")).join("");
        const gb = Array.from({ length: g.graveCount || 0 }, (_, i) => b(`墓地${i + 1}`, "cpuGrave", [s.key, String(i)], (t.graves || []).includes(i) ? "dbg-on" : "")).join("");
        let body = "";
        if (rs && !Object.values(k).some(Boolean)) body = hint(`この役職（${esc(rs.map(rn).join("・"))}）には、指定できる能力先がありません。`);
        else {
          if (k.seer || k.rob) body += sec(k.seer && k.rob ? "プレイヤー（占う相手 / 交換・一目惚れの相手）" : k.seer ? "プレイヤー（占う相手）" : "プレイヤー（交換・一目惚れの相手）", pb("cpuPlayer", (id) => t.player === id));
          if (k.tm) body += sec("プレイヤー2人（入れ替える2人）", pb("cpuPlayers", (id) => (t.players || []).includes(id)));
          if (k.seer || k.rel) body += sec(k.seer ? `墓地（${ONW.seerGraveMax(g)}枚まで）` : "墓地（交換する1枚）", gb);
        }
        h += `<div class="dbg-pick">${rs && rs.length > 1 ? hint(`変化後がランダムなので、候補（${esc(rs.map(rn).join("・"))}）の指定がすべて出ています。`) : ""}${body}${b("指定なし", "cpuClear", [s.key], "dbg-clear")}${b("閉じる", "pick", ["c:" + s.key])}</div>`;
      }
      return h;
    }).join("");
    return hint("固定した役職（光の使徒などは変化後の指定まで）から、そのCPUが使える能力先だけを出します。占い師=プレイヤーか墓地(設定した枚数まで)、怪盗・一目惚れしてるてる=プレイヤー1人、いたずらっ子=プレイヤー2人、墓荒らし=墓地1枚。固定なしのときは全部出ます。一部だけ指定すると、残りはランダムです。") + rows;
  }

  // ---- その他（CPU議論発言 / 夜ログ）----
  function tabMisc() {
    const g = G(), d = data();
    const logs = inGame() ? ((g.nightLogsAll || []).length ? g.nightLogsAll.map((t) => `<div class="dbg-log">${esc(t)}</div>`).join("") : hint("まだ夜のログはありません。")) : hint("試合中に表示されます。");
    const canKill = inGame() && [PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase);
    const kill = canKill
      ? g.players.map((p) => row(esc(p.name) + (p.isCpu ? cpuBadge : ""), (g.deadIds || []).includes(p.id) ? `<span class="dbg-val">死亡済み</span>` : b("死亡させる", "kill", [p.id]))).join("")
      : hint("昼の議論〜投票の間に使えます。死亡した人は投票・発言ができず、霊界チャットに入ります。");
    return row("CPU議論発言", `<span class="dbg-val">${d.cpuTalkOff ? "OFF" : "ON"}</span> ${b("切り替え", "talkToggle")}`) +
      hint("OFFにすると、昼のCPUのCO・結果開示・投票表明の発言をしません。") + `<div class="dbg-h">昼中に死亡させる（霊界チャットの確認用）</div>${kill}<div class="dbg-h">夜ログ（GM用）</div>${logs}`;
  }

  const TABS = [["roles", "役職確認", tabRoles], ["votes", "投票先", tabVotes], ["locks", "固定役", tabLocks], ["cpu", "CPU能力先", tabCpu], ["misc", "その他", tabMisc]];

  debug.render = function () {
    const g = G(), badge = el("debug-badge", "dbg-badge"), root = el("debug-root");
    const warn = (g.dbgWarn || []).length;
    badge.style.display = g.debugOn ? "" : "none";
    badge.textContent = "🛠 デバッグモード中" + (warn ? " ⚠" : "");
    if (!g.debugOn || !ONW.net.isHost) { root.innerHTML = ""; return; }
    const tab = TABS.find((t) => t[0] === ui.tab) || TABS[0];
    const sheet = ui.open ? `
      <div class="dbg-sheet">
        <div class="dbg-head"><strong>デバッグ</strong>${b("閉じる", "toggleOpen")}</div>
        <div class="dbg-tabs">${TABS.map((t) => b(t[1], "tab", [t[0]], t[0] === tab[0] ? "dbg-on" : "")).join("")}</div>
        <div class="dbg-body">${tab[2]()}</div>
      </div>` : "";
    root.innerHTML = `<button class="dbg-fab" onclick="ONW.debug.toggleOpen()">🛠</button>${sheet}`;
  };

  // ---- 操作 ----
  const refresh = () => debug.render();
  debug.toggleOpen = () => { ui.open = !ui.open; ui.pick = null; refresh(); };
  debug.tab = (t) => { ui.tab = t; ui.pick = null; refresh(); };
  debug.pick = (k) => { ui.pick = ui.pick === k ? null : k; refresh(); };
  debug.talkToggle = () => { const d = data(); d.cpuTalkOff = !d.cpuTalkOff; refresh(); };

  debug.kill = (id) => { ONW.net.killPlayer(id); refresh(); };
  debug.voteSet = (vid, tid) => { ui.pick = null; ONW.net.debugVote(vid, tid || null); refresh(); };
  debug.voteAll = (tid) => { ui.pick = null; ONW.net.debugVoteAll(tid); refresh(); };
  debug.voteClear = () => { ui.pick = null; ONW.net.debugVoteClearAll(); refresh(); };

  debug.lockSet = (key, role) => {
    const d = data();
    if (!role) { delete d.roles[key]; delete d.tf[key]; ui.pick = null; }
    else {
      d.roles[key] = role;
      if (d.tf[key] && !(ONW.TRANSFORM_GROUPS[role] || []).includes(d.tf[key])) delete d.tf[key];
      if (!ONW.TRANSFORM_GROUPS[role]) ui.pick = null;       // 変化役なら続けて「変化後」を選べるよう開いたまま
    }
    refresh();
  };
  debug.tfSet = (key, t) => { const d = data(); if (t) d.tf[key] = t; else delete d.tf[key]; refresh(); };
  debug.lockClear = () => { const d = data(); d.roles = {}; d.tf = {}; d.cpu = {}; G().dbgWarn = []; ui.pick = null; refresh(); };

  // 指定を書き換える（空になったら項目ごと消す）
  const setCpu = (id, f) => { const d = data(), c = { ...(d.cpu[id] || {}), ...f }; Object.keys(c).forEach((k) => { if (c[k] == null || (Array.isArray(c[k]) && !c[k].length)) delete c[k]; }); if (Object.keys(c).length) d.cpu[id] = c; else delete d.cpu[id]; };
  debug.cpuPlayer = (id, target) => {
    const k = cpuKinds(id), cur = data().cpu[id] || {};
    setCpu(id, { player: cur.player === target ? null : target, ...(k.seer && !k.rel ? { graves: null } : {}) });   // 占い師だけならプレイヤーと墓地は同時に指定できない
    refresh();
  };
  debug.cpuPlayers = (id, target) => {   // いたずらっ子: 入れ替える2人（押し直しで解除。3人目を押すと古い方が外れる）
    const cur = (data().cpu[id] || {}).players || [];
    setCpu(id, { players: cur.includes(target) ? cur.filter((x) => x !== target) : [...cur, target].slice(-2) });
    refresh();
  };
  debug.cpuGrave = (id, i) => {
    const k = cpuKinds(id), cur = data().cpu[id] || {}, n = Number(i), max = k.seer ? ONW.seerGraveMax(G()) : 1;
    const gs = (cur.graves || []).includes(n) ? cur.graves.filter((x) => x !== n) : [...(cur.graves || []), n].slice(-max);
    setCpu(id, { graves: gs, ...(k.seer && !k.rob ? { player: null } : {}) });
    refresh();
  };
  debug.cpuClear = (id) => { delete data().cpu[id]; ui.pick = null; refresh(); };

  // 通常の再描画のあとに、デバッグ用の表示も追従させる
  const baseRender = ONW.ui.render;
  ONW.ui.render = function () { const r = baseRender.apply(this, arguments); debug.render(); return r; };

  ONW.debug = debug;
})(window.ONW);
