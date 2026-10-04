/**
 * net.js — オンライン通信とゲーム進行（PeerJS / WebRTC）
 * ルーム作成者のブラウザが「親(ホスト)」として全ての判定を行い、
 * 参加者には本人に見せてよい情報だけを送る。
 * ルールはマイクラ版本編に準拠（占い師=プレイヤー1人 or 墓地2枚 / 怪盗=他人と交換 /
 * 人狼=仲間を確認 / 狂人=能力なし）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const net = { peer: null, conns: {}, hostConn: null, isHost: false, code: "", meta: {}, hostMeta: null };   // meta: 参加者のアイコン情報 { peerId: {uid, av} }（表示専用）
  const CH = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const genCode = () => Array.from({ length: 4 }, () => CH[Math.floor(Math.random() * CH.length)]).join("");
  const PREFIX = "onww-";
  const ACTIVE = ["seer", "mad_seer", "robber", "relic_robber", "troublemaker", "love_tanner"];   // 夜に自分で操作する役職
  const CHAIN = ["seer", "mad_seer", "robber", "troublemaker", "love_tanner"];                    // 墓荒らしが交換後にそのまま使える能力
  const G = () => ONW.game;
  const PH = () => ONW.PHASE;
  const rerender = () => ONW.ui.render(G());
  const rn = (r) => ONW.roles.getInfo(r).name;
  const TEAM = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" };

  net.myId = () => (net.isHost ? "host" : net.peer && net.peer.id);
  /** 夜の行動をまだ選んでいない（またはまだ足りない）人の数 */
  const selComplete = (role, sel) => {
    sel = sel || {}; const np = (sel.players || []).length, ng = (sel.graves || []).length;
    if (role === "seer" || role === "mad_seer") return np === 1 || ng >= 1;
    if (role === "robber" || role === "love_tanner") return np === 1;
    if (role === "relic_robber") return ng === 1;
    if (role === "troublemaker") return np === 2;
    return true;
  };
  const effRole = (g, id) => g.initialRoles[id];   // 夜に選べるのは配られた役職の能力だけ（墓荒らしの交換後の能力は朝に使う）
  const actDone = (g, id) => selComplete(effRole(g, id), (g.nightSels || {})[id]);
  net.pendingCount = () => { const g = G(); return (g.players || []).filter((p) => !p.isCpu && ACTIVE.includes(g.initialRoles[p.id]) && !actDone(g, p.id)).length; };

  // ---- タイマー（ホストの端末が時計）----
  function stopTimer() { const g = G(); if (g.tickId) clearInterval(g.tickId); g.tickId = null; }
  function startTimer(sec, onEnd, onTick) {
    const g = G();
    stopTimer();
    g.remain = sec;
    sendAll({ t: "tick", sec }); sendSpec({ t: "tick", sec });
    g.tickId = setInterval(() => {
      g.remain -= 1;
      sendAll({ t: "tick", sec: g.remain }); sendSpec({ t: "tick", sec: g.remain });
      if (onTick) onTick(g.remain);
      if (g.remain <= 0) { stopTimer(); onEnd(); }
    }, 1000);
  }
  function clearTimers() {
    const g = G();
    stopTimer();
    if (g.pumpId) clearTimeout(g.pumpId);
    if (g.dayStartId) clearTimeout(g.dayStartId);
    g.pumpId = null; g.dayStartId = null; g.cpuQueue = [];
  }
  function pushChat(name, text, kind) {
    const g = G();
    g.chatLog.push({ name, text, kind });
    sendAll({ t: "chatlog", log: g.chatLog }); sendSpec({ t: "chatlog", log: g.chatLog });
  }
  /** CPUの発言キュー。1人ずつ順番に話し、人間がCO→結果開示の途中なら待つ */
  function pump() {
    const g = G();
    g.pumpId = null;
    if (g.phase !== PH().ONLINE_DAY || !g.cpuQueue.length) return;
    if (Date.now() < (g.holdUntil || 0)) { g.pumpId = setTimeout(pump, 500); return; }
    const it = g.cpuQueue.shift();
    if (isDead(it.p.id)) { g.pumpId = setTimeout(pump, 50); return; }   // 死亡したCPUは発言しない
    if (it.co || it.result) pushChat(null, `${it.p.name} ${it.text}`, "co");   // 人間のCOボタンと同じ表示（「名前 占い師CO」「名前 〇〇を占って…」）
    else pushChat(it.p.name, it.text, "chat");
    if (it.claim) g.cpuClaims.push({ from: it.p.id, ...it.claim });
    if (it.co) { boardEntry(it.p.id).co = it.co; sendBoard(); }
    if (it.result) { boardEntry(it.p.id).results.push(it.short || it.text); sendBoard(); }
    if (it.after) it.after();
    g.pumpId = setTimeout(pump, it.gap || 2000);
  }
  function enqueue(items) {
    const g = G();
    if (g.dbg && g.dbg.cpuTalkOff) return;   // デバッグ: CPU議論発言OFF
    g.cpuQueue.push(...items);
    if (!g.pumpId) pump();                     // 最初の発言はラグなしで即座に
  }
  function announceVotes() {
    const g = G();
    if (g.announced) return;
    g.announced = true;
    enqueue(g.players.filter((p) => p.isCpu).map((p) => {
      const a = ONW.cpu.announceVote(g, p);
      return { p, text: a.text, gap: 1500 };
    }));
  }

  net.leave = function () {
    try { clearTimers(); } catch (e) {}
    try { net.peer && net.peer.destroy(); } catch (e) {}
    Object.assign(net, { peer: null, conns: {}, hostConn: null, isHost: false, code: "", meta: {}, hostMeta: null });
  };

  // ---- 送信 ----
  function send(id, msg) {
    if (id === "host") return onMsg(msg);
    const c = net.conns[id];
    if (c && c.open) c.send(msg);
  }
  function sendAll(fn) {
    const g = G(), list = g.hostSpec && g.inGame ? [...g.players, { id: "host", name: "", isCpu: false }] : g.players;   // 観戦中のホストにも進行を流す
    list.forEach((p) => send(p.id, typeof fn === "function" ? fn(p) : fn));
  }

  // ---- 受信（ホスト・参加者共通：自分の画面を更新する）----
  function onMsg(d) {
    const g = G();
    if (d.t === "spectate") { Object.assign(g, { tfShown: true, tfIntro: false, isSpectator: true, isDead: false, specInfo: null, ghostLog: d.ghost || [], chatTab: "main", debugOn: !!d.dbg, specPhase: d.phase, chatLog: d.log || [], boardView: d.board || [], tfView: d.tf || null, remain: d.remain, phase: PH().ONLINE_SPECTATE }); }
    if (d.t === "specphase") { if (g.phase === PH().ONLINE_RESULT) return; g.specPhase = d.phase; g.remain = null; g.phase = PH().ONLINE_SPECTATE; }
    if (d.t === "lobby") { g.isSpectator = false; g.isDead = false; g.specInfo = null; g.chatTab = "main"; g.lobbyPlayers = ONW.account.sanitizePlayers(d.players); ONW.account.setAvatarMap(g.lobbyPlayers); g.meIndex = d.me; g.roleCounts = d.counts; g.fakeWolfWhenNoWolf = d.fake; g.cpuCount = d.cpu; g.graveCount = d.grave; g.seerGraveCount = d.sgrave; g.timers = d.timers; g.revealTransforms = d.reveal; g.transformCandidates = d.cand; g.transformOff = d.off || []; g.cpuNames = d.cpuNames || []; g.debugOn = !!d.dbg; g.phase = PH().LOBBY; g.remain = null; }
    if (d.t === "tick") { g.remain = d.sec; ONW.ui.updateTimer(); return; }
    if (d.t === "coboard") { g.boardView = d.board || []; g.tfView = d.tf || null; ONW.ui.updateBoard(); if (g.co && g.co.step === "history" && ONW.co) ONW.co.render(); ONW.stage.sync(g); return; }
    if (d.t === "specinfo") { g.specInfo = d.info || null; ONW.ui.updateSpecInfo(); ONW.stage.sync(g); return; }   // 観戦者: 全員の役職・夜の行動・投票
    if (d.t === "ghostlog") { g.ghostLog = d.log || []; ONW.ui.updateChat(); return; }                              // 霊界チャット
    if (d.t === "dead") { g.isDead = !!d.v; if (d.v) { g.chatTab = "ghost"; g.ghostLog = d.log || g.ghostLog || []; } }   // 昼中に死亡した（霊界チャットに入る）
    if (d.t === "chatlog") { g.chatLog = d.log; ONW.ui.updateChat(); return; }
    if (d.t === "role") {
      Object.assign(g, { isDead: false, specInfo: null, ghostLog: [], chatTab: "main", tfShown: false, tfIntro: false, tfAppeared: false, voteSel: null, myVote: null, resultStage: null, resultCap: "", debugOn: !!d.dbg, deck: d.deck, myFrom: d.from, myName: d.me || "", dealStart: Date.now(), myCo: null, co: null, boardView: [], tfView: null, resultChatOpen: false, nightInfoClosed: false, chatLog: [], myRole: d.role, others: d.others, graveCount: d.graveCount, seerGraveCount: d.seerGraveCount, nightLogs: [], nightDone: false, morningChain: null, morningChainDone: false, morningChainReady: false, settleInsom: null, settleShown: false, morningReveal: null, morningShown: false, phase: PH().ONLINE_ROLE });
    }
    if (d.t === "night") { g.nightLogs = [d.text, d.text2, ...(d.lines || [])].filter(Boolean); g.godReveal = d.godPeek || null; g.nightAck = []; g.nightDone = !d.act; g.actRole = d.act ? g.myRole : null; g.nightSel = { players: [], graves: [] }; g.bigReveal = d.bigGraves || null; g.cultReveal = d.cultWolves || null; g.masonReveal = d.masonMates || null; g.phase = PH().ONLINE_NIGHT; }
    if (d.t === "ack") {   // 朝に使った能力の結果（即座に返る）
      if (g.phase === PH().ONLINE_MORNING) { g.nightLogs = [...(g.nightLogs || []), ...(d.lines || [])]; g.morningChainDone = true; }
      ONW.stage.onAck(d);
    }
    if (d.t === "morning") { g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.morningReveal = d.reveal || null; g.morningInsom = d.insom || null; g.morningShown = false; g.morningChain = d.chain || null; g.settleInsom = null; g.settleShown = false; g.morningChainDone = false; g.morningChainReady = false; g.nightSel = { players: [], graves: [] }; g.remain = null; g.settling = false; g.phase = PH().ONLINE_MORNING; }
    if (d.t === "settle") { g.settling = true; g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.settleInsom = d.insom || null; g.settleShown = false; g.morningChainReady = false; }
    if (d.t === "day") { g.chatLog = []; g.co = null; g.phase = PH().ONLINE_DAY; }
    if (d.t === "vote_start") { g.voted = false; g.voteSel = null; g.myVote = null; g.phase = PH().ONLINE_VOTE; }
    if (d.t === "forcevote") { g.voted = !!d.v; }   // デバッグ: ホストが投票先を指定した/解除した
    if (d.t === "result") {
      g.result = d.result; g.resultStage = "exec"; g.resultCap = ""; g.phase = PH().ONLINE_RESULT;
      if (ONW.stats && !g.isSpectator && !g.debugOn) ONW.stats.record(d.result, `${net.code || ""}:${g.dealStart || 0}`);   // 自分の戦績を保存（ログイン中のみ・デバッグモード中は保存しない）
    }
    rerender();
  }

  // ---- COボード（プレイヤー一覧 + 誰が何をCOしたか）----
  function boardView() {
    const g = G();
    return g.players.map((p) => ({ id: p.id, name: p.name, cpu: !!p.isCpu, dead: isDead(p.id), co: (g.coBoard[p.id] || {}).co || null, results: (g.coBoard[p.id] || {}).results || [] }));
  }
  /** プレイヤー一覧の下に出す「変化公開」: 公開ON→変化前→変化後 / OFFで候補あり→変化先の候補 / それ以外→なし */
  function tfView() {
    const g = G();
    if (g.revealTransforms) return g.tfLines && g.tfLines.length ? { mode: "reveal", lines: g.tfLines } : null;
    const lines = (g.coDeck || []).filter((x) => x.cand).map((x) => rn(x.r));
    return lines.length ? { mode: "cand", lines } : null;
  }
  function sendBoard() { const m = { t: "coboard", board: boardView(), tf: tfView() }; sendAll(m); sendSpec(m); }
  function boardEntry(id) { const g = G(); return (g.coBoard[id] = g.coBoard[id] || { co: null, results: [] }); }

  /** 観戦者へも流す（個人の役職などは送らない） */
  function sendSpec(msg) { G().spectators.forEach((id) => send(id, msg)); }


  // ---- 死亡者 / 霊界チャット / 観戦者向けの全員情報 ----
  const isDead = (id) => (G().deadIds || []).includes(id);
  /** 霊界チャットに参加できる人: 観戦者・観戦中のホスト・昼中に死亡した人 */
  net.canGhost = function () { const g = G(); return !!(g.isSpectator || g.isDead || (g.hostSpec && net.isHost && g.inGame)); };
  function ghostRecipients() {
    const g = G(), ids = [...g.spectators, ...(g.deadIds || []).filter((id) => { const p = g.players.find((q) => q.id === id); return p && !p.isCpu; })];
    if (g.hostSpec && g.inGame) ids.push("host");
    return [...new Set(ids)];
  }
  function sendGhost() { const g = G(), m = { t: "ghostlog", log: g.ghostLog }; ghostRecipients().forEach((id) => send(id, m)); }
  function ghostNameOf(id) {
    const g = G(), p = g.players.find((q) => q.id === id);
    if (p) return p.name;
    if (id === "host") return ((g.specRoster || []).find((x) => x.id === "host") || {}).name || "ホスト";
    return g.specNames[id] || "観戦者";
  }
  /** 観戦者に見せる「全員の役職・夜の行動・投票」。参加者には送らない */
  function specInfoMsg() {
    const g = G();
    if (!g.inGame || !g.initialRoles || !g.players.length || !Object.keys(g.initialRoles).length) return { t: "specinfo", info: null };
    const res = !!g.nightResolved, nm = (id) => (g.players.find((q) => q.id === id) || {}).name || "?";
    const players = g.players.map((p) => ({ id: p.id, name: p.name, cpu: !!p.isCpu, dead: isDead(p.id), from: g.transformFrom[p.id] || null, ini: g.initialRoles[p.id], cur: res ? g.currentRoles[p.id] : null }));
    const center = (g.center0 || g.center || []).map((r, i) => ({ ini: r, from: (g.centerTransformFrom || {})[i] || null, cur: res ? g.center[i] : null }));
    let sels = [];
    if (g.phase === PH().ONLINE_NIGHT) {
      sels = g.players.filter((p) => !p.isCpu && ACTIVE.includes(g.initialRoles[p.id])).map((p) => {
        const er = effRole(g, p.id), sel = (g.nightSels || {})[p.id] || { players: [], graves: [] };
        const picks = [...(sel.players || []).map(nm), ...(sel.graves || []).map((i) => `墓地${i + 1}`)];
        const text = picks.length ? `選択中: ${picks.join("、")}` : "未選択";
        return { name: p.name, role: er, text };
      });
    }
    const votes = g.phase === PH().ONLINE_VOTE ? g.players.map((p) => ({ from: p.name, to: g.votes[p.id] ? nm(g.votes[p.id]) : null })) : [];
    return { t: "specinfo", info: { players, center, log: g.nightLogsAll || [], sels, votes, night: g.phase === PH().ONLINE_NIGHT, vote: g.phase === PH().ONLINE_VOTE } };
  }
  function sendSpecInfo() {
    const g = G(), m = specInfoMsg();
    sendSpec(m);
    if (g.hostSpec && g.inGame && net.isHost) send("host", m);
  }

  /** 昼中に死亡させる（ホストのみ）。死亡した人は投票・発言ができなくなり、霊界チャットに入る */
  net.killPlayer = function (id) {
    const g = G(), p = g.players.find((q) => q.id === id);
    if (!net.isHost || !g.inGame || !p || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return;
    g.deadIds = g.deadIds || [];
    if (g.deadIds.includes(id)) return;
    g.deadIds.push(id);
    delete g.votes[id];
    Object.keys(g.votes).forEach((v) => { if (g.votes[v] === id) delete g.votes[v]; });
    pushChat(null, `${p.name} が死亡しました。`, "sys");
    if (!p.isCpu) send(id, { t: "dead", v: true, log: g.ghostLog });
    sendBoard(); sendSpecInfo(); sendGhost();
    rerender();
  };

  function lobbyMsg(forId) {
    const g = G(), humans = g.players.filter((p) => !p.isCpu);
    return {
      t: "lobby", code: net.code, me: humans.findIndex((p) => p.id === forId),
      players: humans.map((p) => { const m = (p.id === "host" ? net.hostMeta : net.meta[p.id]) || {}; return { name: p.name, status: p.id === "host" ? "host" : p.status, spec: !!p.spectate, uid: m.uid || null, av: m.av || 0 }; }),
      counts: g.roleCounts, fake: g.fakeWolfWhenNoWolf, cpu: g.cpuCount, grave: g.graveCount, sgrave: g.seerGraveCount, timers: g.timers, reveal: g.revealTransforms, cand: g.transformCandidates, off: g.transformOff || [], cpuNames: g.cpuNames || [], dbg: !!g.debugOn,
    };
  }
  /** ロビーを見ている人（結果確認中の人を除く）へ送る */
  function broadcastLobby() {
    G().players.filter((p) => !p.isCpu && p.status !== "result").forEach((p) => send(p.id, lobbyMsg(p.id)));
  }
  const persist = () => ONW.settings.save(G());

  net.createRoom = function (name, onError) {
    net.leave();
    const code = genCode();
    const peer = new Peer(PREFIX + code);
    peer.on("open", () => {
      net.peer = peer; net.isHost = true; net.code = code; net.hostMeta = ONW.account.me();
      const g = G(), saved = ONW.settings.load();
      if (saved) ONW.settings.apply(g, saved);            // 前回のルールを復元
      try { g.debugOn = localStorage.getItem("onw.debugOn.v1") === "1"; } catch (e) {}   // デバッグモードのON/OFFも前回のまま
      Object.assign(g, { players: [{ id: "host", name, isCpu: false, status: "host" }], inGame: false, spectators: [], specNames: {}, phase: PH().LOBBY });
      broadcastLobby();
    });
    peer.on("error", (e) => {
      if (e.type === "unavailable-id") { peer.destroy(); net.createRoom(name, onError); }
      else onError("接続に失敗しました: " + e.type);
    });
    peer.on("connection", (conn) => {
      conn.on("data", (d) => {
        if (d.t !== "join") return hostRecv(conn.peer, d);
        const g = G(), pname = (d.name || "名無し").slice(0, 12);
        net.meta[conn.peer] = ONW.account.cleanMeta(d);               // アイコン情報（表示専用。UUID/数値の形だけ確認）
        if (g.inGame) {                                   // 試合中の途中参加 → 観戦
          net.conns[conn.peer] = conn;
          g.spectators.push(conn.peer); g.specNames[conn.peer] = pname;
          conn.send({ t: "spectate", phase: g.phase, log: g.chatLog, ghost: g.ghostLog || [], remain: g.remain, board: boardView(), tf: tfView(), dbg: !!g.debugOn });
          conn.send(specInfoMsg());
          return;
        }
        const humansNow = g.players.filter((p) => !p.isCpu);
        if (humansNow.length >= 20) { conn.send({ t: "full" }); return; }
        net.conns[conn.peer] = conn;
        g.players.push({ id: conn.peer, name: pname, isCpu: false, status: "waiting", spectate: humansNow.filter((p) => !p.spectate).length >= 10 });   // 参加者が10人なら観戦で入る
        broadcastLobby();
      });
      conn.on("close", () => {
        const g = G();
        delete net.conns[conn.peer]; delete net.meta[conn.peer];
        g.spectators = g.spectators.filter((id) => id !== conn.peer);
        if (g.inGame) return;                             // 試合中は残し、戻る時に整理する
        g.players = g.players.filter((p) => p.id !== conn.peer);
        broadcastLobby();
      });
    });
  };
  net.joinRoom = function (code, name, onError) {
    net.leave();
    code = code.trim().toUpperCase();
    const peer = new Peer();
    net.peer = peer;
    peer.on("error", (e) => onError(e.type === "peer-unavailable" ? "ルームが見つかりません。コードを確認してください。" : "接続に失敗しました: " + e.type));
    peer.on("open", () => {
      const conn = peer.connect(PREFIX + code, { reliable: true });
      net.hostConn = conn; net.code = code;
      conn.on("open", () => conn.send({ t: "join", name, ...ONW.account.me() }));
      conn.on("close", () => { if (net.peer) { net.leave(); onError("ルームとの接続が切れました。"); } });
      conn.on("data", (d) => {
        if (d.t === "full") { net.leave(); onError("このルームには参加できません（満員または開始済み）。"); }
        else onMsg(d);
      });
    });
  };


  net.changeRole = function (role, delta) {
    if (!net.isHost) return;
    const c = G().roleCounts;
    c[role] = Math.max(0, Math.min(10, (c[role] || 0) + delta));
    persist(); broadcastLobby();
  };

  /** 墓地枚数・CPU人数の増減（ホストのみ） */
  net.changeSetting = function (key, delta) {
    if (!net.isHost || !["graveCount", "seerGraveCount", "cpuCount"].includes(key)) return;
    G()[key] = Math.max(0, Math.min(10, (G()[key] ?? 2) + delta));
    persist(); broadcastLobby();
  };

  net.changeTimer = function (key, delta) {
    if (!net.isHost || G().timers[key] === undefined) return;
    const t = G().timers;
    t[key] = Math.max(5, Math.min(600, t[key] + delta));
    persist(); broadcastLobby();
  };

  // ---- マイルール（プリセット）----
  net.savePreset = function () {
    const g = G();
    if (!net.isHost) return;
    const name = (g.presetName || "").trim().slice(0, 20) || `マイルール${ONW.settings.listPresets().length + 1}`;
    ONW.settings.addPreset(name, g);
    g.presetName = "";
    rerender();
  };
  net.loadPreset = function (i) {
    const p = ONW.settings.listPresets()[i];
    if (!net.isHost || !p) return;
    ONW.settings.apply(G(), p.rules);
    persist(); broadcastLobby();
  };
  // ---- ルールコード ----
  net.showCode = function (i) {
    const g = G();
    const rules = i == null ? ONW.settings.snapshot(g) : (ONW.settings.listPresets()[i] || {}).rules;
    if (!rules) return;
    g.codeText = ONW.settings.encode(rules); g.codeMsg = "";
    rerender();
  };
  net.copyCode = function () {
    const g = G();
    const done = (m) => { g.codeMsg = m; rerender(); };
    try { navigator.clipboard.writeText(g.codeText).then(() => done("コピーしました。"), () => done("コピーできませんでした。入力欄を長押ししてコピーしてください。")); }
    catch (e) { done("コピーできませんでした。入力欄を長押ししてコピーしてください。"); }
  };
  net.importCode = function () {
    const g = G();
    if (!net.isHost) return;
    const rules = ONW.settings.decode(g.importText);
    if (!rules) { g.codeMsg = "ルールコードが正しくありません。"; rerender(); return; }
    ONW.settings.apply(g, rules);
    persist();
    g.importText = ""; g.codeMsg = "ルールコードを読み込みました。";
    broadcastLobby();
  };
  net.deletePreset = function (i) { if (net.isHost) { ONW.settings.removePreset(i); rerender(); } };

  // ---- 準備完了 / ルームに戻る ----
  net.setReady = function (v) { if (!net.isHost && net.hostConn) net.hostConn.send({ t: "ready", v }); };
  net.returnToRoom = function () {
    const g = G();
    if (!net.isHost) { net.hostConn && net.hostConn.send({ t: "return" }); return; }
    clearTimers();
    g.inGame = false;
    g.players = g.players.filter((p) => !p.isCpu && (p.id === "host" || (net.conns[p.id] && net.conns[p.id].open)));
    g.players.forEach((p) => { if (p.id === "host") p.status = "host"; });
    const hs = (g.specRoster || []).find((x) => x.id === "host");
    if (hs && !g.players.some((p) => p.id === "host")) g.players.unshift({ id: "host", name: hs.name, isCpu: false, status: "host", spectate: true });   // 観戦していたホストをルームへ戻す
    // ロビーで観戦ONだった人は、試合が終わっても観戦のまま戻す（結果を見終わるまでは「結果確認中」）
    (g.specRoster || []).filter((x) => x.id !== "host" && g.spectators.includes(x.id) && net.conns[x.id] && net.conns[x.id].open).forEach((x) => {
      g.spectators = g.spectators.filter((id) => id !== x.id);
      g.players.push({ id: x.id, name: x.name, isCpu: false, status: "result", spectate: true });
    });
    g.hostSpec = false;
    g.phase = PH().LOBBY; g.remain = null;
    broadcastLobby();
  };

  /** 変化公開の ON・OFF */
  net.toggleOpt = function (key) {
    if (!net.isHost || !["revealTransforms"].includes(key)) return;
    G()[key] = !G()[key];
    persist(); broadcastLobby();
  };

  /** 変化先の有無設定: 「変化役:変化先」ごとの ON・OFF */
  net.toggleTarget = function (base, target) {
    if (!net.isHost || !(ONW.TRANSFORM_GROUPS[base] || []).includes(target)) return;
    const g = G(), key = `${base}:${target}`, off = g.transformOff || [];
    g.transformOff = off.includes(key) ? off.filter((k) => k !== key) : [...off, key];
    persist(); broadcastLobby();
  };

  /** 観戦ON/OFF（ロビー中のみ）。ONだと参加者から外れて観戦者の欄に移る */
  net.setSpectate = function (v) {
    const g = G();
    if (net.isHost) { spectateOf("host", v); return; }
    if (net.hostConn) net.hostConn.send({ t: "spec", v: !!v });
  };
  function spectateOf(id, v) {
    const g = G(), p = g.players.find((q) => q.id === id && !q.isCpu);
    if (!p || g.inGame || g.phase !== PH().LOBBY) return;
    v = !!v;
    if (!v && g.players.filter((q) => !q.isCpu && !q.spectate).length >= 10) return;   // 参加者は10人まで
    p.spectate = v;
    if (id !== "host") p.status = "waiting";
    broadcastLobby();
  }

  /** CPUの名前をホストが自由に変更（空にすると初期名に戻る） */
  net.renameCpu = function (i) {
    const g = G();
    if (!net.isHost || g.inGame) return;
    const cur = cpuName(g, i);
    const input = window.prompt(`CPU${i + 1} の名前（12文字まで。空にすると初期名に戻ります）`, cur);
    if (input === null) return;
    const name = input.trim().slice(0, 12);
    const used = [...g.players.filter((p) => !p.isCpu).map((p) => p.name), ...Array.from({ length: g.cpuCount }, (_, k) => k).filter((k) => k !== i).map((k) => cpuName(g, k))];
    if (name && used.includes(name)) { window.alert("その名前は他の参加者が使っています。"); return; }
    const arr = [...(g.cpuNames || [])];
    arr[i] = name;
    g.cpuNames = arr;
    persist(); broadcastLobby();
  };
  const cpuName = (g, i) => (g.cpuNames && g.cpuNames[i]) || `CPU${i + 1}`;

  net.toggleFake = function () {
    if (!net.isHost) return;
    G().fakeWolfWhenNoWolf = !G().fakeWolfWhenNoWolf;
    persist(); broadcastLobby();
  };

  // ---- ホストの進行 ----
  net.startGame = function () {
    const g = G();
    const lobbyHumans = g.players.filter((p) => !p.isCpu);
    const humans = lobbyHumans.filter((p) => !p.spectate);
    const specs = lobbyHumans.filter((p) => p.spectate);                 // 観戦ONの人は参加者に入れない
    const cpus = Array.from({ length: g.cpuCount }, (_, i) => ({ id: `cpu_${i + 1}`, name: cpuName(g, i), isCpu: true }));
    const n = humans.length + cpus.length;
    const roles = Object.entries(g.roleCounts).flatMap(([role, c]) => Array(c).fill(role));
    if (n < 3 || roles.length !== n + g.graveCount) return;
    if (humans.some((p) => p.id !== "host" && p.status !== "ready")) return;   // 全員の準備完了が必要
    g.players = [...humans, ...cpus];
    g.inGame = true; g.spectators = []; g.specNames = {};
    g.specRoster = specs.map((p) => ({ id: p.id, name: p.name }));
    g.hostSpec = specs.some((p) => p.id === "host");
    specs.filter((p) => p.id !== "host").forEach((p) => { g.spectators.push(p.id); g.specNames[p.id] = p.name; });
    humans.forEach((p) => { p.status = p.id === "host" ? "host" : "playing"; });
    g.playerCount = n;
    g.selectedRoles = roles;
    ONW.roles.dealRoles(g);
    g.center0 = [...g.center];   // 配役直後の墓地（占い・大狼が見るのはこちら。墓荒らしの交換は g.center に反映）
    // COの役職一覧: 配役に入っている役職 + 変化公開ONなら変化後の役職 / OFFで候補ONなら変化先の候補
    const deck = [...new Set(g.selectedRoles)].map((r) => ({ r }));
    const addDeck = (r, cand) => { if (!deck.some((d) => d.r === r)) deck.push({ r, cand }); };
    if (g.revealTransforms) {
      Object.keys(g.transformFrom).forEach((id) => addDeck(g.initialRoles[id]));
      Object.keys(g.centerTransformFrom).forEach((i) => addDeck(g.center[i]));
    } else {
      [...new Set(g.selectedRoles)].forEach((b) => ONW.roles.enabledTargets(g, b).forEach((t) => addDeck(t, true)));
    }
    g.coDeck = deck;
    g.votes = {};
    g.nightSels = {}; g.morningReveals = {};
    Object.assign(g, { deadIds: [], ghostLog: [], nightResolved: false, dbgVotes: {}, nightResults: {}, coBoard: {}, tfLines: [], chatLog: [], coState: {}, nightLogsAll: [], cpuClaims: [], tmQueue: [], roleTrail: {}, centerTrail: {}, cards: null, morningAct: {}, morningDone: {}, loveTargets: {}, executed: [], chainIds: [], masterPick: null, cpuQueue: [], cpuVotePlan: {}, announced: false, holdUntil: 0, remain: null });
    clearTimers();
    g.spectators.forEach((id) => send(id, { t: "spectate", phase: PH().ONLINE_ROLE, log: [], ghost: [], remain: null, board: boardView(), tf: tfView(), dbg: !!g.debugOn }));
    startTimer(ONW.ui.dealDuration(g.center.length, g.players.length) + 5, toNight);   // 演出が終わって5秒後に自動で夜へ
    sendAll((p) => ({
      t: "role", me: p.name, dbg: !!g.debugOn, role: g.initialRoles[p.id], graveCount: g.center.length, seerGraveCount: g.seerGraveCount, deck: g.coDeck, from: g.transformFrom[p.id] || null,
      others: g.players.filter((q) => q.id !== p.id).map((q) => ({ id: q.id, name: q.name })),
    }));
    sendSpecInfo();   // 観戦者・観戦ホストへ全員の役職を送る（roleメッセージのあとに送る）
  };

  // ---- フェーズ進行（タイマーで自動。ホストの「スキップ」でも進める）----
  function toNight() {
    const g = G();
    const wolfNames = (self) => g.players.filter((q) => q.id !== self && ONW.WOLF_KIND.includes(g.initialRoles[q.id])).map((q) => q.name);
    sendAll((p) => {
      const r = g.initialRoles[p.id];
      let text = "", text2 = "", bigGraves = null, cultWolves = null, masonMates = null;
      if (r === "werewolf" || r === "big_wolf") {
        const mates = wolfNames(p.id);
        text = mates.length ? `仲間の人狼: ${mates.join("、")}` : "仲間の人狼はいません。";
        const mateIds = g.players.filter((q) => q.id !== p.id && ONW.WOLF_KIND.includes(g.initialRoles[q.id])).map((q) => q.id);
        if (mateIds.length) cultWolves = mateIds;   // 夜の始まりに、仲間の人狼のカードが表になって🐺が出る（狂信者と同じ演出）
        if (r === "big_wolf") {   // 大狼: 墓地カードをすべて確認（配役直後の墓地）
          bigGraves = g.center0.slice();
          text2 = `墓地: ${bigGraves.map((c, i) => `${i + 1}枚目「${rn(c)}」`).join(" ")}`;
        }
      } else if (r === "cultist") {   // 狂信者: 人狼プレイヤーを知っている（墓地は見えない）
        const seenP = g.players.filter((q) => ONW.WOLF_KIND.includes(g.initialRoles[q.id])), seen = seenP.map((q) => q.name);
        if (seenP.length) cultWolves = seenP.map((q) => q.id);   // 夜の始まりに、そのカードが表になって🐺が出る
        const mid = seen.length ? null : ONW.vote.certainPromotion(g);   // 人狼が不在で昇格が確定している狂人 = ご主人（役職まではわからない）
        const master = mid ? g.players.find((q) => q.id === mid) : null;
        if (!seenP.length && master && master.id === p.id) cultWolves = [p.id];   // 狂信者自身がご主人のときは、自分のカードが🐺にめくれる
        text = seen.length ? `人狼の気配: ${seen.join("、")}` : master ? `ご主人: ${master.name}${master.id === p.id ? "（あなた）" : ""}` : "見える人狼はいません。";
      }
      else if (r === "mason") {   // 共有者: 他の共有者（配役直後の役職）を確認する
        const mates = g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason").map((q) => q.name);
        text = mates.length ? `もう一人の共有者: ${mates.join("、")}` : "他の共有者はいません。";
        const mateIds = g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason").map((q) => q.id);
        if (mateIds.length) masonMates = mateIds;   // 夜の始まりに、仲間の共有者のカードが表になる（夜が終わるまで出続ける）
      }
      let lines = null, godPeek = null;
      if (r === "god") {   // 神: 全員の初期役職（変化後）と墓地の役職を知っている
        lines = g.players.map((q) => `${q.name}${q.id === p.id ? "（あなた）" : ""} = ${rn(g.initialRoles[q.id])}`);
        text = "あなたは全員の役職と墓地を知っています。";
        text2 = `墓地: ${g.center0.map((c, i) => `${i + 1}枚目「${rn(c)}」`).join(" ")}`;
        godPeek = { players: Object.fromEntries(g.players.map((q) => [q.id, g.initialRoles[q.id]])), graves: g.center0.slice() };
      }
      return { t: "night", text, text2, lines, godPeek, bigGraves, cultWolves, masonMates, act: ACTIVE.includes(r) };
    });
    sendSpec({ t: "specphase", phase: PH().ONLINE_NIGHT });
    sendSpecInfo();
    startTimer(g.timers.night, toMorning);
  }

  /** 夜の終わり: いたずらっ子の入れ替えを起床順(怪盗・墓荒らしのあと)に反映し、後覚者に最終役職を伝える */
  function applyTroublemakers(g) {
    (g.tmQueue || []).forEach((q) => ONW.swapPlayers(g, q.a, q.b));
    g.tmQueue = [];
  }
  function insomniacResults(g) {   // 朝が終わった直後に、後覚者へ最終的な役職を伝える（id → 通知文）
    const out = {};
    g.players.filter((p) => !p.isCpu && (g.initialRoles[p.id] === "insomniac" || g.currentRoles[p.id] === "insomniac")).forEach((p) => {
      // 元々の後覚者 / 後から後覚者になった人（怪盗・いたずらっ子などで最終役職が後覚者）の両方に、そのときの最終的な役職を伝える
      out[p.id] = `夜の行動がすべて終わりました。あなたの最終的な役職は「${rn(g.currentRoles[p.id])}」です。`;
    });
    return out;
  }
  /** 夜の終わり: 人間の選択を起床順に実行し、朝に見せる演出データ(morningReveals)を作る */
  function resolveNight(g, kind) {   // kind: "seer" | "relic" | "robber" | "tm"（起床順に1段階ずつ呼ぶ）
    const humans = g.players.filter((p) => !p.isCpu && ACTIVE.includes(g.initialRoles[p.id])), eff = (p) => effRole(g, p.id);
    const selOf = (p) => g.nightSels[p.id] || { players: [], graves: [] };
    const nameOf = (id) => (g.players.find((q) => q.id === id) || {}).name || "?";
    const rev = g.morningReveals = g.morningReveals || {};
    if (kind === "seer") humans.forEach((p) => { if (!actDone(g, p.id)) hold(p.id, "夜の行動をしませんでした。"); });
    // 占い師 / 狂った占い師（初期役職・配役直後の墓地を見る。順序の影響を受けない）
    if (kind === "seer") humans.filter((p) => ["seer", "mad_seer"].includes(eff(p))).forEach((p) => {
      const sel = selOf(p), label = rn(eff(p));
      if (sel.players.length === 1) {
        const t = sel.players[0], r = g.initialRoles[t];
        g.nightLogsAll.push(`${label} ${p.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
        hold(p.id, `${nameOf(t)} の役職は「${rn(r)}」でした。`);
        rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
      } else if (sel.graves.length) {
        const items = sel.graves.slice().sort((x, y) => x - y).map((i) => ({ k: `g:${i}`, role: g.center0[i] }));
        items.forEach((it) => { const i = +it.k.slice(2); g.nightLogsAll.push(`${label} ${p.name} は 墓地${i + 1} を確認し、${rn(it.role)} でした。`); hold(p.id, `墓地${i + 1}枚目は「${rn(it.role)}」でした。`); });
        rev[p.id] = { kind: "peek", items };
      }
    });
    // 一目惚れしてるてる: 選んだ相手を「役職の持ち主」に記録（役職が動いたら移動先の人の選択になる。state.js の【必読】メモ参照）
    if (kind === "seer") humans.filter((p) => eff(p) === "love_tanner").forEach((p) => {
      const t = selOf(p).players[0]; if (!t) return;
      ONW.setRoleBound(g, "loveTargets", p.id, t);   // 役職についていく（以降に役職が動いたら、移動先の人の選択になる）
      g.nightLogsAll.push(`${rn(eff(p))} ${p.name} は ${nameOf(t)} を選んでいました。`);
      hold(p.id, `${nameOf(t)} に一目惚れしました。あなたが追放されると、${nameOf(t)} も一緒に追放扱いになります。`);
    });
    // 墓荒らし: 選んだ墓地と役職を交換（起床順。交換後の役職の能力は朝に使う）
    if (kind === "relic") humans.filter((p) => eff(p) === "relic_robber").forEach((p) => {
      const i = selOf(p).graves[0]; if (i === undefined || i < 0 || i >= g.center.length) return;
      const got = g.center[i];
      ONW.swapGrave(g, p.id, i);
      g.nightLogsAll.push(`${rn(eff(p))} ${p.name} は 墓地${i + 1} と役職を交換し、${rn(got)} になりました。`);
      hold(p.id, `墓地${i + 1}枚目と役職を交換しました。あなたの新しい役職は「${rn(got)}」です。`);
      if (CHAIN.includes(got)) { g.morningAct[p.id] = got; hold(p.id, `新しい役職（${rn(got)}）の能力を、朝のうちに使えます。`); }
      rev[p.id] = { kind: "relic", target: i, role: got };
      // 人狼系・狂信者・共有者を取ったら、夜の始まりに見えるはずの相方のカードを朝に表にする（狼は🐺 / 共有者は役職カード）
      const wolfIds = (self) => g.players.filter((q) => q.id !== self && ONW.WOLF_KIND.includes(g.initialRoles[q.id])).map((q) => q.id);
      const names = (ids) => ids.map(nameOf).join("、");
      if (ONW.WOLF_KIND.includes(got)) {
        const ids = wolfIds(p.id);
        hold(p.id, ids.length ? `仲間の人狼: ${names(ids)}` : "仲間の人狼はいません。");
        if (ids.length) rev[p.id].mates = { ids, role: "__wolf" };
      } else if (got === "cultist") {
        const ids = wolfIds(p.id);
        hold(p.id, ids.length ? `人狼の気配: ${names(ids)}` : "見える人狼はいません。");
        if (ids.length) rev[p.id].mates = { ids, role: "__wolf" };
      } else if (got === "mason") {
        const ids = g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason").map((q) => q.id);
        hold(p.id, ids.length ? `もう一人の共有者: ${names(ids)}` : "他の共有者はいません。");
        if (ids.length) rev[p.id].mates = { ids, role: "mason" };
      }
    });
    // 怪盗 → いたずらっ子（起床順）。いたずらっ子の入れ替えは最後にまとめて反映
    if (kind === "robber") humans.filter((p) => eff(p) === "robber").forEach((p) => {
      const t = selOf(p).players[0]; if (!t) return;
      ONW.swapPlayers(g, p.id, t);
      const got = g.currentRoles[p.id];
      g.nightLogsAll.push(`${rn(eff(p))} ${p.name} は ${nameOf(t)} と役職を交換し、${rn(got)} になりました。`);
      hold(p.id, `${nameOf(t)} と役職を交換しました。あなたの新しい役職は「${rn(got)}」です。`);
      rev[p.id] = { kind: "swap", target: t, role: got };
    });
    if (kind === "tm") humans.filter((p) => eff(p) === "troublemaker").forEach((p) => {
      const [a, b] = selOf(p).players; if (!a || !b) return;
      g.tmQueue.push({ id: p.id, a, b });
      g.nightLogsAll.push(`${rn(eff(p))} ${p.name} は ${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`);
      hold(p.id, `${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`);
      rev[p.id] = { kind: "tm", a, b };
    });
  }

  function toMorning() {
    const g = G();
    // 夜の選択を起床順（占い → 墓荒らし → 怪盗 → いたずらっ子）に実行。各段階で人間 → CPU の順
    g.morningReveals = {}; g.morningAct = {}; g.morningDone = {}; g.settling = false;
    ONW.cpu.runNight(g, "init");
    ["seer", "relic", "robber", "tm"].forEach((kind) => { resolveNight(g, kind); ONW.cpu.runNight(g, kind); });
    applyTroublemakers(g);
    // 墓荒らしが交換した後の役職の能力は、朝に使う。CPUはここで即座に使い、人間は朝の画面で選ぶ
    ONW.cpu.runNight(g, "morning");
    applyTroublemakers(g);
    sendAll((p) => ({ t: "morning", logs: g.nightResults[p.id] || [], reveal: (g.morningReveals && g.morningReveals[p.id]) || null, insom: null, chain: g.morningAct[p.id] || null }));
    g.nightResolved = true;
    sendSpec({ t: "specphase", phase: PH().ONLINE_MORNING });
    sendSpecInfo();
    // 朝に能力を使う人がいる間は、夜と同じ長さの時間を取る
    startTimer(chainPending(g) ? Math.max(g.timers.morning, g.timers.night) : g.timers.morning, toSettle);
  }
  /** 朝が終わってから昼になるまでの待機時間（秒）。この間に後覚者が最終的な役職を知る */
  const SETTLE_SEC = 5;
  function toSettle() {
    const g = G();
    if (g.settling) return;
    g.settling = true;
    ONW.cpu.afterNight(g);                  // CPUの後覚者もここで最終役職を知る
    const texts = insomniacResults(g);
    sendAll((p) => ({ t: "settle", logs: texts[p.id] ? [texts[p.id]] : [], insom: texts[p.id] ? g.currentRoles[p.id] : null }));
    sendSpecInfo();
    startTimer(SETTLE_SEC, toDay);
  }
  const chainPending = (g) => Object.keys(g.morningAct || {}).some((id) => !g.morningDone[id]);

  /** 変化公開: 昼の開始時に「変化前 → 変化後」を（プレイヤー名なしで）公開する */
  function announceTransforms() {
    const g = G();
    if (!g.revealTransforms) return;
    const order = { light_apostle: 0, dark_avatar: 1, silver_shadow: 2 };
    const list = [
      ...Object.keys(g.transformFrom).map((id) => ({ b: g.transformFrom[id], a: g.initialRoles[id] })),
      ...Object.keys(g.centerTransformFrom).map((i) => ({ b: g.centerTransformFrom[i], a: g.center[i] })),
    ].filter((e) => e.b !== e.a);
    if (!list.length) return;
    list.sort((x, y) => (order[x.b] ?? 9) - (order[y.b] ?? 9) || Math.random() - 0.5);
    g.tfLines = list.map((e) => `${rn(e.b)} → ${rn(e.a)}`);
    // 変化公開はチャットには流さず、プレイヤー一覧の下の欄(tfLines)にだけ出す
  }

  function toDay() {
    const g = G();
    g.announced = false; g.holdUntil = 0; g.cpuQueue = [];
    sendAll({ t: "day" });
    sendSpec({ t: "specphase", phase: PH().ONLINE_DAY });
    sendSpecInfo();
    announceTransforms();
    sendBoard();
    // 変化公開が出終わってから、昼のタイマーとCPUの発言を始める（その間、タイマーは満タンのまま止まる）
    const wait = g.revealTransforms && ONW.stage && ONW.stage.paperMs ? ONW.stage.paperMs(g.tfLines) : 0;
    const begin = () => {
      g.dayStartId = null;
      if (g.phase !== PH().ONLINE_DAY) return;
      enqueue(ONW.cpu.plan(g));
      startTimer(g.timers.day, toVote, (remain) => { if (remain <= 20) announceVotes(); });
      if (g.timers.day <= 20) announceVotes();
    };
    if (wait > 0) {
      g.remain = g.timers.day; sendAll({ t: "tick", sec: g.remain }); sendSpec({ t: "tick", sec: g.remain });
      g.dayStartId = setTimeout(begin, wait);
    } else begin();
  }

  function toVote() {
    const g = G();
    clearTimers();
    g.votes = {};
    g.players.filter((p) => p.isCpu && !isDead(p.id)).forEach((p) => { const t = ONW.cpu.announceVote(g, p).target; if (!isDead(t)) g.votes[p.id] = t; });
    const forced = applyDebugVotes();
    sendAll({ t: "vote_start" });
    sendSpec({ t: "specphase", phase: PH().ONLINE_VOTE });
    sendSpecInfo();
    forced.forEach((id) => send(id, { t: "forcevote", v: true }));
    startTimer(g.timers.vote, finishVoting);
    if (forced.length && Object.keys(g.votes).length === g.players.length) finishVoting();
  }

  // ---- デバッグ: 投票先の指定（ホストのみ・debug.js から呼ぶ）----
  /** 投票開始時に、指定済みの票を入れる。戻り値: 指定された人間のID */
  function applyDebugVotes() {
    const g = G(), ids = [];
    if (!g.debugOn) return ids;
    Object.entries(g.dbgVotes || {}).forEach(([vid, tid]) => {
      const v = g.players.find((p) => p.id === vid);
      if (!v || vid === tid || !g.players.some((p) => p.id === tid)) return;
      g.votes[vid] = tid;
      if (!v.isCpu) ids.push(vid);
    });
    return ids;
  }
  net.debugVote = function (vid, tid) {
    const g = G();
    if (!net.isHost || !g.debugOn || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return;
    const v = g.players.find((p) => p.id === vid);
    if (!v) return;
    g.dbgVotes = g.dbgVotes || {};
    const voting = g.phase === PH().ONLINE_VOTE, was = !!g.dbgVotes[vid];
    if (tid && tid !== vid && g.players.some((p) => p.id === tid)) {
      g.dbgVotes[vid] = tid;
      if (v.isCpu) { g.cpuVotePlan = g.cpuVotePlan || {}; g.cpuVotePlan[vid] = tid; }
      if (voting) { g.votes[vid] = tid; if (!v.isCpu) send(vid, { t: "forcevote", v: true }); }
    } else {
      delete g.dbgVotes[vid];
      if (v.isCpu) { if (g.cpuVotePlan) delete g.cpuVotePlan[vid]; if (voting) g.votes[vid] = ONW.cpu.announceVote(g, v).target; }
      else if (voting && was) { delete g.votes[vid]; send(vid, { t: "forcevote", v: false }); }
    }
    if (voting && Object.keys(g.votes).length === g.players.length) finishVoting(); else rerender();
  };
  net.debugVoteAll = function (tid) { G().players.forEach((p) => { if (p.id !== tid) net.debugVote(p.id, tid); }); };
  net.debugVoteClearAll = function () { Object.keys(G().dbgVotes || {}).forEach((id) => net.debugVote(id, null)); };
  /** デバッグモードのON/OFFなど、ロビーの表示を全員に反映する */
  net.syncLobby = function () { if (net.isHost) { broadcastLobby(); rerender(); } };

  /** 画面ごとの「次へ」（ホストのみ。タイマーを待たずに進めるスキップ） */
  net.hostNext = function () {
    const g = G();
    if (!net.isHost) return;
    if (g.phase === PH().ONLINE_ROLE) toNight();
    else if (g.phase === PH().ONLINE_NIGHT) toMorning();
    else if (g.phase === PH().ONLINE_MORNING) { if (g.settling) toDay(); else toSettle(); }
    else if (g.phase === PH().ONLINE_DAY) toVote();
    else if (g.phase === PH().ONLINE_VOTE) finishVoting();
    else if (g.phase === PH().ONLINE_RESULT) net.returnToRoom();
  };

  // ---- 本人の操作 ----
  /** 朝に能力を使う（墓荒らしが交換した後の役職）。選んだ内容を送ると、その場で結果が返る */
  net.morningUse = function () {
    const g = G(), sel = g.nightSel || { players: [], graves: [] };
    if (!g.morningChain || g.morningChainDone || !selComplete(g.morningChain, sel)) return;
    const msg = { t: "act", kind: "mchain", sel: { players: [...sel.players], graves: [...sel.graves] } };
    if (net.isHost) hostRecv("host", msg); else net.hostConn.send(msg);
  };
  /** 夜の選択を送る（朝まで何度でも変更できる）。sel: { players: [id...], graves: [index...] } */
  net.setSel = function (sel) {
    const msg = { t: "act", kind: "sel", sel: { players: [...(sel.players || [])], graves: [...(sel.graves || [])] } };
    if (net.isHost) hostRecv("host", msg); else net.hostConn.send(msg);
  };

  net.sendChat = function (text) {
    text = String(text || "").trim();
    if (!text) return;
    const msg = { t: net.canGhost() ? "ghost" : "chat", text };   // 観戦者・死亡者の発言は霊界チャットへ
    if (net.isHost) hostRecv("host", msg); else net.hostConn.send(msg);
  };

  net.sendCo = function (text, claim, setRole, flag, short) {
    const msg = { t: "co", text, short: short ? String(short).slice(0, 80) : "", claim, setRole, hold: flag === "hold", disclose: flag === "disclose" };
    if (setRole) G().myCo = setRole;
    if (net.isHost) hostRecv("host", msg); else net.hostConn.send(msg);
  };

  net.vote = function (target) {   // target: 投票先のID / null（未投票に戻す）。最終的な票はタイマー終了時に数える
    const g = G();
    if (g.voted) return;           // デバッグでホストが固定した票は変えられない
    const msg = { t: "vote", target: target || null };
    if (net.isHost) hostRecv("host", msg); else net.hostConn.send(msg);
    rerender();
  };

  // ---- ホストが操作を判定 ----
  /** 夜の結果は朝まで預かる */
  function hold(id, text) { const g = G(); (g.nightResults[id] = g.nightResults[id] || []).push(text); }

  function hostRecv(id, d) {
    const g = G();
    const byId = (x) => g.players.find((p) => p.id === x);
    const role = g.initialRoles[id];

    if (d.t === "act" && d.kind === "mchain" && g.phase === PH().ONLINE_MORNING && !g.settling && g.morningAct[id] && !g.morningDone[id] && byId(id)) {
      // 朝に使う能力（墓荒らしが交換した後の役職）: 選んだ瞬間に実行して結果を返す。朝の時点の実際のカードを見る・動かす
      const me = byId(id), ar = g.morningAct[id], sel = d.sel || {}, label = rn(ar);
      const okP = (x) => typeof x === "string" && x !== id && !!byId(x);
      const okG = (x) => Number.isInteger(x) && x >= 0 && x < g.center.length;
      const nameOf = (x) => (byId(x) || {}).name || "?";
      let players = [...new Set((sel.players || []).filter(okP))], graves = [...new Set((sel.graves || []).filter(okG))];
      let lines = null, reveal = null;
      if (ar === "seer" || ar === "mad_seer") {
        if (graves.length) {
          graves = graves.slice(0, ONW.seerGraveMax(g)).sort((x, y) => x - y);
          lines = graves.map((i) => `墓地${i + 1}枚目は「${rn(g.center[i])}」でした。`);
          graves.forEach((i) => g.nightLogsAll.push(`${label} ${me.name} は 朝に墓地${i + 1} を確認し、${rn(g.center[i])} でした。`));
          reveal = { kind: "peek", items: graves.map((i) => ({ k: `g:${i}`, role: g.center[i] })) };
        } else if (players.length) {
          const t = players[0], r = g.currentRoles[t];
          lines = [`${nameOf(t)} の役職は「${rn(r)}」でした。`];
          g.nightLogsAll.push(`${label} ${me.name} は 朝に${nameOf(t)} を占い、${rn(r)} でした。`);
          reveal = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
        }
      } else if (ar === "robber" && players.length) {
        const t = players[0];
        ONW.swapPlayers(g, id, t);
        const got = g.currentRoles[id];
        lines = [`${nameOf(t)} と役職を交換しました。あなたの新しい役職は「${rn(got)}」です。`];
        g.nightLogsAll.push(`${label} ${me.name} は 朝に${nameOf(t)} と役職を交換し、${rn(got)} になりました。`);
        reveal = { kind: "swap", target: t, role: got };
      } else if (ar === "troublemaker" && players.length >= 2) {
        const [a, b] = players;
        ONW.swapPlayers(g, a, b);
        lines = [`${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`];
        g.nightLogsAll.push(`${label} ${me.name} は 朝に${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`);
        reveal = { kind: "tm", a, b };
      } else if (ar === "love_tanner" && players.length) {
        const t = players[0];
        ONW.setRoleBound(g, "loveTargets", id, t);   // 移動「あと」の選択も、その時点の持ち主に予約され、以降の移動にもついていく
        lines = [`${nameOf(t)} に一目惚れしました。あなたが追放されると、${nameOf(t)} も一緒に追放扱いになります。`];
        g.nightLogsAll.push(`${label} ${me.name} は 朝に${nameOf(t)} を選んでいました。`);
      }
      if (!lines) return;
      g.morningDone[id] = true;
      send(id, { t: "ack", done: true, lines, text: lines.join(" "), reveal });
      sendSpecInfo();
      if (!chainPending(g)) startTimer(g.timers.morning, toSettle);   // 全員が使い終わったら、通常の朝の長さに戻す
      rerender();
    }
    if (d.t === "act" && d.kind === "sel" && g.phase === PH().ONLINE_NIGHT && ACTIVE.includes(role) && byId(id)) {
      // 夜の選択: 朝になるまで何度でも変更できる。確定・演出は夜の終わり(resolveNight)
      const sel = d.sel || {}, ar = effRole(g, id);
      const okP = (x) => typeof x === "string" && x !== id && !!byId(x);
      const okG = (x) => Number.isInteger(x) && x >= 0 && x < g.center.length;
      let players = [...new Set((sel.players || []).filter(okP))], graves = [...new Set((sel.graves || []).filter(okG))];
      if (ar === "seer" || ar === "mad_seer") {            // プレイヤー1人 か 墓地(設定枚数まで)。同時には選べない
        if (graves.length) { players = []; graves = graves.slice(0, ONW.seerGraveMax(g)); if (!graves.length) players = []; }
        else players = players.slice(0, 1);
      } else if (ar === "robber" || ar === "love_tanner") { players = players.slice(0, 1); graves = []; }
      else if (ar === "relic_robber") { players = []; graves = graves.slice(0, 1); }
      else if (ar === "troublemaker") { players = players.slice(0, 2); graves = []; }
      g.nightSels[id] = { players, graves };
      sendSpecInfo();
      rerender();
    }

    if (d.t === "ready") {
      const p = byId(id);
      if (p && !p.spectate && (p.status === "waiting" || p.status === "ready")) { p.status = d.v ? "ready" : "waiting"; broadcastLobby(); }
    }
    if (d.t === "spec") spectateOf(id, d.v);
    if (d.t === "return") {
      const p = byId(id);
      if (p && p.status === "result") { p.status = "waiting"; broadcastLobby(); }
      else if (g.spectators.includes(id) && g.players.filter((q) => !q.isCpu).length < 20) {   // 観戦者がルームに入る
        g.spectators = g.spectators.filter((x) => x !== id);
        const wasSpec = (g.specRoster || []).some((x) => x.id === id);   // ロビーで観戦ONだった人は観戦のまま戻る
        const full = g.players.filter((q) => !q.isCpu && !q.spectate).length >= 10;
        g.players.push({ id, name: g.specNames[id] || "名無し", isCpu: false, status: "waiting", spectate: wasSpec || full });
        broadcastLobby();
      }
    }
    if (d.t === "chat" && g.phase === PH().ONLINE_DAY) {
      const text = String(d.text || "").trim().slice(0, 100);
      if (text && byId(id) && !isDead(id)) pushChat(byId(id).name, text, "chat");   // 死亡者・観戦者は議論に書き込めない
    }
    if (d.t === "ghost" && g.inGame && g.phase !== PH().ONLINE_RESULT) {   // 霊界チャット: 観戦者と昼中に死亡した人だけが読み書きできる
      const spec = g.spectators.includes(id) || (id === "host" && g.hostSpec);
      if (!spec && !isDead(id)) return;
      const text = String(d.text || "").trim().slice(0, 100);
      if (!text) return;
      g.ghostLog.push({ name: ghostNameOf(id), text, kind: "chat" });
      sendGhost();
    }
    if (d.t === "co" && g.phase === PH().ONLINE_DAY && byId(id) && !isDead(id)) {
      const text = String(d.text || "").trim().slice(0, 120);
      if (!text) return;
      if (d.hold) g.holdUntil = Date.now() + 25000;      // CO→結果開示の途中はCPUの発言を待たせる
      if (d.disclose) g.holdUntil = 0;
      if (d.setRole && (g.coDeck.some((x) => x.r === d.setRole) || String(d.setRole).startsWith("team:"))) { g.coState[id] = d.setRole; boardEntry(id).co = d.setRole; }
      if (d.disclose) boardEntry(id).results.push(String(d.short || text).slice(0, 80));
      const c = d.claim;
      if (c && ["seer", "robber"].includes(c.kind) && byId(c.target) && g.initialRoles[id] !== undefined) g.cpuClaims.push({ from: id, kind: c.kind, target: c.target, role: c.role });
      pushChat(null, `${byId(id).name} ${text}`, "co");
      sendBoard();
    }

    if (d.t === "vote" && g.phase === PH().ONLINE_VOTE) {
      if (isDead(id) || isDead(d.target)) return;           // 死亡者は投票できず、投票先にもできない
      if ((g.dbgVotes || {})[id]) return;                   // デバッグ固定票は変えない
      if (d.target == null) delete g.votes[id];             // 同じ人をもう一度押した = 未投票
      else if (id !== d.target && byId(d.target)) g.votes[id] = d.target;
      else return;
      sendSpecInfo();
      rerender();                                           // 数えるのはタイマー終了時（finishVoting）
    }
  }

  function finishVoting() {
    const g = G();
    if (g.phase !== PH().ONLINE_VOTE) return;
    clearTimers();
    ONW.vote.resolveElimination(g);
    ONW.vote.determineWinners(g);
    const tally = ONW.vote.tally(g);
    const nm = (id) => (g.players.find((p) => p.id === id) || {}).name || "?";
    const teamOf = (role) => ONW.roles.getInfo(role).team;
    const winIds = g.winnerIds || g.players.filter((p) => g.winners.includes(teamOf(g.currentRoles[p.id]))).map((p) => p.id);
    const gone = g.executed || g.eliminated;   // 追放された人（一目惚れしてるてるに巻き込まれた人を含む）
    const darkName = rn("dark_avatar");
    const noDarkSfx = (segs) => { segs.forEach((x) => { if (x.name === darkName) x.sfx = ""; }); return segs; };   // 闇の化身の表示には (+人狼) を付けない
    const history = g.players.map((p) => {
      const ini = g.initialRoles[p.id], fin = g.currentRoles[p.id];
      // 昇格した狂人のカード: 最終的に持っていた人のカードを追跡し、移動前に持っていた人の欄にも (+人狼) を付ける
      const promCards = new Set(g.promotedWolfIds.map((id) => ONW.cardAt(g, id)));
      const cardTrail = (g.cards && g.cards.trail[p.id]) || [];
      const sfxOf = (card) => (card && promCards.has(card) ? "(+人狼)" : "");
      const sfx = g.promotedWolfIds.includes(p.id) ? "(+人狼)" : "";
      const from = g.transformFrom[p.id];
      // 変化した人は「闇の化身 → 人狼」のように矢印でつなぐ（カッコは使わない）
      const segs = [];
      if (from) segs.push({ name: rn(from), team: teamOf(from) });
      segs.push({ name: rn(ini), team: teamOf(ini), sfx: sfxOf("P:" + p.id) });
      // 入れ替わるたびの役職を全部つなぐ（怪盗 → 怪盗 のように同じ役職に入れ替わった場合も出す）
      const trail = (g.roleTrail || {})[p.id] || [];
      trail.forEach((r, k) => segs.push({ name: rn(r), team: teamOf(r), sfx: sfxOf(cardTrail[k]) }));
      if ((trail.length ? trail[trail.length - 1] : ini) !== fin) segs.push({ name: rn(fin), team: teamOf(fin) });
      segs[segs.length - 1].sfx = sfx;
      noDarkSfx(segs);   // 闇の化身には (+人狼) を付けない
      const isChain = (g.chainIds || []).includes(p.id);   // 一目惚れしてるてるに道連れにされた人（死因: 無理心中）
      const by = isChain ? nm((g.chainBy || {})[p.id]) : null;
      return { id: p.id, role: fin, ini, win: winIds.includes(p.id), dead: gone.includes(p.id), name: p.name, segs, cause: isChain ? "chain" : gone.includes(p.id) ? "exec" : null, by, status: isChain ? "［無理心中］" : gone.includes(p.id) ? "［追放］" : "［生存］" };
    });
    const result = {
      title: g.winTitle,
      detail: g.winDetail,
      teams: g.winTeams,
      winners: winIds.map(nm),
      losers: g.players.filter((p) => !winIds.includes(p.id)).map((p) => p.name),
      votes: g.players.map((p) => ({ from: p.name, to: g.votes[p.id] ? nm(g.votes[p.id]) : null })),
      counts: Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ id, name: nm(id), c })),
      promoted: g.promotedWolfIds.map(nm),
      nightLogs: g.nightLogsAll,
      history,
      chainOrder: [...(g.chainIds || [])],
      grave: g.center.map((r, i) => {
        const gSfx = (card) => (card && g.promotedWolfIds.some((id) => ONW.cardAt(g, id) === card) ? "(+人狼)" : "");
        const f = g.centerTransformFrom[i], o = (g.center0 || g.center)[i];   // o: 配役直後 / r: 墓荒らしの交換後
        return { label: `墓地${i + 1}`, role: r, segs: noDarkSfx([...(f ? [{ name: rn(f), team: teamOf(f) }] : []), { name: rn(o), team: teamOf(o), sfx: gSfx("G:" + i) }, ...((g.centerTrail || {})[i] || []).map((x, k) => ({ name: rn(x), team: teamOf(x), sfx: gSfx(((g.cards && g.cards.trail["g:" + i]) || [])[k]) })), ...((((g.centerTrail || {})[i] || []).slice(-1)[0] ?? o) !== r ? [{ name: rn(r), team: teamOf(r) }] : [])]) };
      }),
    };
    g.players.forEach((p) => { if (!p.isCpu) p.status = "result"; });   // 戻るまで「結果確認中」
    sendAll({ t: "result", result });
    sendSpec({ t: "result", result });
  }

  ONW.net = net;
})(window.ONW);
