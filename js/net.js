/**
 * net.js — オンライン通信とゲーム進行（PeerJS / WebRTC）
 * ルーム作成者のブラウザが「親(ホスト)」として全ての判定を行い、
 * 参加者には本人に見せてよい情報だけを送る。
 * ルールはマイクラ版本編に準拠（占い師=プレイヤー1人 or 墓地2枚 / 怪盗=他人と交換 /
 * 人狼=仲間を確認 / 狂人=能力なし）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  // meta: 参加者のアイコン情報 { 席ID: {uid, av} }（表示専用）
  // 席ID(seat): 参加者の「席」を表す変わらないID。最初に入ったときの peer.id（ルーム作成者だけ "host"）。再接続や、ホストが別の人に代わっても同じ席IDを使い続ける。
  // hostSeat: いまホスト権限を持っている席ID / selfSeat: この端末の席ID / keys: 席ごとの再入室キー（ホスト側だけが持つ）
  const net = { peer: null, conns: {}, hostConn: null, isHost: false, code: "", meta: {}, hostSeat: "host", selfSeat: "", keys: {}, origHost: null, order: [], gen: 0, myKey: "", myName: "", rec: null, xfer: null, frozen: false, snapStr: "", snapPlanned: false, rejoinInfo: null };
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

  net.myId = () => net.selfSeat || (net.peer && net.peer.id) || "";
  const HS = () => net.hostSeat;   // いまホスト権限を持っている席ID
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
    g.dayBegin = null;
    g.pumpId = null; g.dayStartId = null; g.cpuQueue = [];
  }
  function pushChat(name, text, kind) {
    const g = G();
    g.chatLog.push({ name, text, kind, at: Date.now() });
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

  // ---- 送信 ----
  function send(id, msg) {
    if (net.isHost && id === net.selfSeat) return onMsg(msg);   // 自分（ホスト）の席は通信せずに直接届ける
    const c = net.conns[id];
    if (c && c.open) c.send(msg);
  }
  function sendAll(fn) {
    const g = G(), list = g.hostSpec && g.inGame ? [...g.players, { id: net.selfSeat, name: "", isCpu: false }] : g.players;   // 観戦中のホストにも進行を流す
    list.forEach((p) => send(p.id, typeof fn === "function" ? fn(p) : fn));
    if (typeof fn !== "function" && fn && fn.t === "tick") return;
    scheduleSnap();   // 後継者へ進行状態を送る（まとめて少し後に）
  }

  // ---- 受信（ホスト・参加者共通：自分の画面を更新する）----
  function onMsg(d, quiet) {
    const g = G();
    if (d.t === "batch") { (d.msgs || []).forEach((m) => onMsg(m, true)); rerender(); return; }   // 再入室: 複数のメッセージをまとめて反映（途中の画面を出さない）
    if (d.t === "spectate") { if (d.phase === PH().ONLINE_ROLE) g.dealStart = Date.now(); Object.assign(g, { tfShown: true, tfIntro: false, isSpectator: true, isDead: false, specInfo: null, ghostLog: d.ghost || [], chatTab: "main", debugOn: !!d.dbg, specPhase: d.phase, chatLog: d.log || [], boardView: d.board || [], tfView: d.tf || null, remain: d.remain, phase: PH().ONLINE_SPECTATE }); }
    if (d.t === "specphase") { if (g.phase === PH().ONLINE_RESULT) return; g.specPhase = d.phase; g.remain = null; g.phase = PH().ONLINE_SPECTATE; }
    if (d.t === "lobby") { g.isSpectator = false; g.isDead = false; g.specInfo = null; g.chatTab = "main"; g.lobbyPlayers = ONW.account.sanitizePlayers(d.players); ONW.account.setAvatarMap(g.lobbyPlayers); g.meIndex = d.me; g.roleCounts = d.counts; g.fakeWolfWhenNoWolf = d.fake; g.villageSize = d.vsize || 4; g.cpuCount = d.cpu; g.graveCount = d.grave; g.seerGraveCount = d.sgrave; g.timers = d.timers; g.revealTransforms = d.reveal; g.transformCandidates = d.cand; g.transformOff = d.off || []; g.cpuNames = d.cpuNames || []; g.debugOn = !!d.dbg; g.phase = PH().LOBBY; g.remain = null; }
    if (d.t === "tfskip") { ONW.stage.skipPaper(); return; }   // ホストが変化公開をスキップした → 全員の紙を飛ばす
    if (d.t === "tick") { g.remain = d.sec; ONW.ui.updateTimer(); return; }
    if (d.t === "coboard") { g.boardView = d.board || []; g.tfView = d.tf || null; ONW.ui.updateBoard(); if (g.co && g.co.step === "history" && ONW.co) ONW.co.render(); ONW.stage.sync(g); return; }
    if (d.t === "specinfo") { g.specInfo = d.info || null; if (ONW.ui.isSpecDeal(g)) ONW.ui.render(g); ONW.ui.updateSpecInfo(); ONW.stage.sync(g); return; }   // 観戦者: 全員の役職・夜の行動・投票
    if (d.t === "ghostlog") { g.ghostLog = d.log || []; ONW.ui.updateChat(); return; }                              // 霊界チャット
    if (d.t === "dead") { g.isDead = !!d.v; if (d.v) { g.chatTab = "ghost"; g.ghostLog = d.log || g.ghostLog || []; } }   // 昼中に死亡した（霊界チャットに入る）
    if (d.t === "chatlog") { g.chatLog = d.log; ONW.ui.updateChat(); return; }
    if (d.t === "role") {
      Object.assign(g, { isDead: false, specInfo: null, ghostLog: [], chatTab: "main", tfShown: false, tfIntro: false, tfAppeared: false, voteSel: null, myVote: null, resultStage: null, resultCap: "", debugOn: !!d.dbg, deck: d.deck, myFrom: d.from, myName: d.me || "", dealStart: d.ds || Date.now(), myCo: null, co: null, boardView: [], tfView: null, resultChatOpen: false, nightInfoClosed: false, chatLog: [], myRole: d.role, others: d.others, graveCount: d.graveCount, seerGraveCount: d.seerGraveCount, nightLogs: [], nightDone: false, morningChain: null, morningChainDone: false, morningChainReady: false, settleInsom: null, settleShown: false, settleStars: [], starNames: [], breadN: 0, settleStarShown: false, morningReveal: null, morningShown: false, phase: PH().ONLINE_ROLE });
    }
    if (d.t === "night") { g.nightLogs = [d.text, d.text2, ...(d.lines || [])].filter(Boolean); g.godReveal = d.godPeek || null; g.nightAck = []; g.nightDone = !d.act; g.actRole = d.act ? g.myRole : null; g.nightSel = d.sel ? { players: [...(d.sel.players || [])], graves: [...(d.sel.graves || [])] } : { players: [], graves: [] }; g.bigReveal = d.bigGraves || null; g.cultReveal = d.cultWolves || null; g.masonReveal = d.masonMates || null; g.phase = PH().ONLINE_NIGHT; }
    if (d.t === "ack") {   // 朝に使った能力の結果（即座に返る）
      if (g.phase === PH().ONLINE_MORNING) { g.nightLogs = [...(g.nightLogs || []), ...(d.lines || [])]; g.morningChainDone = true; }
      ONW.stage.onAck(d);
    }
    if (d.t === "morning") { g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.morningReveal = d.reveal || null; g.morningInsom = d.insom || null; g.morningShown = !!d.quiet; g.morningChain = d.chain || null; g.settleInsom = null; g.settleShown = false; g.settleStars = []; g.starNames = []; g.breadN = 0; g.settleStarShown = false; g.morningChainDone = !!d.chainDone; g.morningChainReady = !!d.quiet; g.nightSel = { players: [], graves: [] }; g.remain = null; g.settling = false; g.phase = PH().ONLINE_MORNING; }
    if (d.t === "settle") { g.settling = true; g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.settleInsom = d.insom || null; g.settleShown = !!d.quiet; g.settleStars = d.stars || []; g.starNames = d.starNames || []; g.settleStarShown = !!d.quiet; g.morningChainReady = !!d.quiet; }
    if (d.t === "bread") { g.breadN = d.n || 1; if (!d.quiet && ONW.ui.showBread) ONW.ui.showBread(d.n || 1); return; }   // パン屋: 昼のタイマー開始時のバナー
    if (d.t === "day") { g.chatLog = d.resync ? g.chatLog : []; g.co = null; if (d.resync) g.myCo = d.myCo || null; g.phase = PH().ONLINE_DAY; }
    if (d.t === "strawask") { g.strawPick = d.cands && d.cands.length ? d.cands : null; g.strawKind = d.kind || "straw"; ONW.stage.sync(g); }   // わら人形: 道連れ先を選ぶ（空 = 時間切れ）
    if (d.t === "strawwait") { g.strawWaitKind = d.kind || "straw"; g.strawWait = d.on ? (d.name || "") : null; if (!d.on) g.strawPick = null; ONW.stage.sync(g); }   // 全員: わら人形が選んでいる間の表示
    if (d.t === "vote_start") { g.strawPick = null; g.strawWait = null; g.voted = !!d.forced; g.voteSel = d.my || null; g.myVote = d.my || null; g.phase = PH().ONLINE_VOTE; }
    if (d.t === "forcevote") { g.voted = !!d.v; }   // デバッグ: ホストが投票先を指定した/解除した
    if (d.t === "result") {
      g.strawPick = null; g.strawWait = null; g.result = d.result; if (d.ghost) g.ghostLog = d.ghost; g.resultStage = "exec"; g.resultCap = ""; g.phase = PH().ONLINE_RESULT;
      if (ONW.stats && !g.isSpectator && !g.debugOn) ONW.stats.record(d.result, `${net.code || ""}:${g.dealStart || 0}`);   // 自分の戦績を保存（ログイン中のみ・デバッグモード中は保存しない）
    }
    if (!quiet) rerender();
  }

  // ---- COボード（プレイヤー一覧 + 誰が何をCOしたか）----
  function boardView() {
    const g = G();
    return g.players.map((p) => ({ id: p.id, name: p.name, cpu: !!p.isCpu, dead: isDead(p.id), co: (g.coBoard[p.id] || {}).co || null, results: (g.coBoard[p.id] || {}).results || [] }));
  }
  /** プレイヤー一覧の下に出す「変化公開」: 公開ON→変化前→変化後 / OFFで候補あり→変化先の候補 / それ以外→なし */
  function tfView() {
    const g = G();
    if (g.revealTransforms) return g.tfLines && g.tfLines.length ? { mode: "reveal", lines: g.tfLines, pairs: g.tfPairs || [] } : null;   // pairs: ガイドの「現在の配役」を変化後で数え直すための { b: 変化前, a: 変化後 }
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
    if (g.hostSpec && g.inGame) ids.push(net.selfSeat);
    return [...new Set(ids)];
  }
  function sendGhost() { const g = G(), m = { t: "ghostlog", log: g.ghostLog }; ghostRecipients().forEach((id) => send(id, m)); }
  function ghostNameOf(id) {
    const g = G(), p = g.players.find((q) => q.id === id);
    if (p) return p.name;
    if (id === HS()) return ((g.specRoster || []).find((x) => x.id === HS()) || {}).name || "ホスト";
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
    if (g.hostSpec && g.inGame && net.isHost) send(net.selfSeat, m);
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
      players: humans.map((p) => { const m = net.meta[p.id] || {}; return { name: p.name, status: p.id === HS() ? "host" : p.off ? "offline" : p.status, spec: !!p.spectate, uid: m.uid || null, av: m.av || 0 }; }),
      counts: g.roleCounts, fake: g.fakeWolfWhenNoWolf, vsize: g.villageSize, cpu: g.cpuCount, grave: g.graveCount, sgrave: g.seerGraveCount, timers: g.timers, reveal: g.revealTransforms, cand: g.transformCandidates, off: g.transformOff || [], cpuNames: g.cpuNames || [], dbg: !!g.debugOn,
    };
  }
  /** ロビーを見ている人（結果確認中の人を除く）へ送る */
  function broadcastLobby() {
    G().players.filter((p) => !p.isCpu && p.status !== "result").forEach((p) => send(p.id, lobbyMsg(p.id)));
    scheduleSnap();
  }
  const persist = () => ONW.settings.save(G());

  /** 村の埋まり具合: 参加者(観戦ONでない人間)＋CPU。CPUも定員に含む */
  const occupied = (g) => g.players.filter((p) => !p.isCpu && !p.spectate).length + (g.cpuCount || 0);
  net.occupied = occupied;
  /** 定員（何人村）を超えているとき、CPUを減らし、それでも超えるなら後から入った人から観戦側へ移す */
  function fitVillage() {
    const g = G();
    while (occupied(g) > g.villageSize && g.cpuCount > 0) g.cpuCount--;
    while (occupied(g) > g.villageSize) {
      const last = [...g.players].reverse().find((p) => !p.isCpu && !p.spectate && p.id !== HS());
      if (!last) break;
      last.spectate = true; last.status = "waiting";
    }
  }

  // =====================================================================
  // 接続まわり: ルーム作成 / 参加 / 自動再接続 / ホストの譲渡・一時委譲
  // ---------------------------------------------------------------------
  //  ・席ID(seat)は変わらない。ホストが代わっても、再接続しても同じ席IDで進行状態を引き継ぐ。
  //  ・参加者は最初に自分で作った「再入室キー」を持ち、ホストは席ごとにそのキーを覚える。
  //    再接続のときはキーが合う人だけが元の席に戻れる（他人が席を奪えない）。
  //  ・ホストは「ホストの次に参加した人（接続中）」へ、進行状態のスナップショットを送り続ける。
  //    ホストが落ちたら、その人が同じルームコード(onww-XXXX)を取り直して新しいホストになる。
  //  ・元のホスト（ルームを作った人 / 譲渡された人）が同じ席で戻ってきたら、自動でホストを返す。
  // =====================================================================
  const HB_MS = 3000, HB_DEAD_MS = 15000, REC_MAX_MS = 120000, LOBBY_GRACE_MS = 30000;
  const randKey = () => {
    try { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32); }
    catch (e) { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36); }
  };
  /** ホストだけが持つ「進行状態」。これをスナップショットにして後継者へ送る */
  const AUTH_KEYS = [
    "roleCounts", "villageSize", "graveCount", "seerGraveCount", "cpuCount", "timers", "fakeWolfWhenNoWolf", "revealTransforms", "transformCandidates", "transformOff", "cpuNames", "debugOn", "dbg", "dbgWarn",
    "players", "inGame", "spectators", "specNames", "specRoster", "hostSpec", "playerCount", "selectedRoles",
    "initialRoles", "currentRoles", "center", "center0", "transformFrom", "centerTransformFrom", "coDeck", "votes", "nightSels", "morningReveals", "deadIds", "ghostLog", "nightResolved", "dbgVotes", "nightResults",
    "coBoard", "tfLines", "tfPairs", "chatLog", "coState", "nightLogsAll", "cpuClaims", "tmQueue", "roleTrail", "centerTrail", "cards", "morningAct", "morningDone", "morningAck", "loveTargets", "executed", "chainIds", "chainBy", "chainKind", "mentalIds", "catPicks", "strawTargets", "strawAsk", "assassinTargets", "assassinList", "assassinResult",
    "masterPick", "masterCard", "cpuVotePlan", "cpuInfo", "announced", "holdUntil", "remain", "settling", "promotedWolfIds", "eliminated", "winners", "winnerIds", "winTitle", "winDetail", "winTeams", "dealStart", "resultObj",
  ];
  /** 参加者としての画面にも同じ意味で入っている項目。ホストを引き継ぐ人は、自分が見ていた最新の値を優先する */
  const SHARED_KEYS = ["chatLog", "remain", "settling", "dealStart", "debugOn", "roleCounts", "villageSize", "cpuCount", "graveCount", "seerGraveCount", "timers", "fakeWolfWhenNoWolf", "revealTransforms", "transformCandidates", "transformOff", "cpuNames"];
  /** ホストをやめて参加者に戻るとき、消す項目（参加者の画面では使わないもの） */
  const HOST_ONLY_KEYS = [
    "players", "inGame", "spectators", "specNames", "specRoster", "hostSpec", "initialRoles", "currentRoles", "center", "center0", "transformFrom", "centerTransformFrom", "coDeck", "votes", "nightSels", "morningReveals", "deadIds",
    "nightResolved", "dbgVotes", "nightResults", "coBoard", "tfLines", "tfPairs", "coState", "nightLogsAll", "cpuClaims", "tmQueue", "roleTrail", "centerTrail", "cards", "morningAct", "morningDone", "morningAck", "loveTargets",
    "executed", "chainIds", "chainBy", "chainKind", "mentalIds", "catPicks", "strawTargets", "strawAsk", "assassinTargets", "assassinList", "assassinResult", "masterPick", "masterCard", "cpuVotePlan", "cpuInfo", "announced", "holdUntil", "promotedWolfIds", "eliminated", "winners", "winnerIds", "winTitle", "winDetail", "winTeams", "resultObj", "dbg", "dbgWarn",
  ];

  // ---- 画面上部の通知（再接続中・ホスト交代中など）----
  let bannerEl = null;
  function banner(msg, opt) {
    if (!msg) { if (bannerEl) { bannerEl.remove(); bannerEl = null; } return; }
    if (!bannerEl) { bannerEl = document.createElement("div"); bannerEl.id = "net-banner"; document.body.appendChild(bannerEl); }
    bannerEl.innerHTML = `<span>${ONW.utils.esc(msg)}</span>${opt && opt.cancel ? `<button class="btn" onclick="ONW.net.cancelRecovery()">あきらめる</button>` : ""}`;
  }
  net.banner = banner;

  const connSeat = new Map();   // ホスト側: DataConnection → 席ID
  let hbId = null, snapTimer = null, snapPeriodic = null, watchId = null, touchId = null, backTimer = null, lastOrder = "", dropTimers = {};
  net.rx = {};   // ホスト側: 席ごとの最後に受信した時刻

  net.leave = function (opt) {
    net.gen++;
    const peer = net.peer, conn = net.hostConn, wasHost = net.isHost;
    try { if (wasHost) flushSnap(); } catch (e) {}           // 抜けるホストは、最後にもう一度後継者へ状態を渡す
    try { clearTimers(); } catch (e) {}
    clearInterval(hbId); clearInterval(snapPeriodic); clearTimeout(snapTimer); clearInterval(touchId); clearTimeout(backTimer); stopClientWatch();
    hbId = snapPeriodic = snapTimer = touchId = backTimer = null; lastOrder = "";
    Object.values(dropTimers).forEach(clearTimeout); dropTimers = {};
    if (net.xfer && net.xfer.timer) clearTimeout(net.xfer.timer);
    const sendBye = !!(conn && conn.open);
    if (sendBye) { try { conn.send({ t: "bye" }); } catch (e) {} }
    if (peer) setTimeout(() => { try { peer.destroy(); } catch (e) {} }, sendBye || wasHost ? 150 : 0);
    connSeat.clear();
    banner(null);
    if (opt && opt.forget && ONW.account && ONW.account.roomClear) net.forgetP = ONW.account.roomClear();   // 消し終わる前に checkRejoin が古い記録を拾わないよう待てるようにする
    Object.assign(net, { peer: null, conns: {}, hostConn: null, isHost: false, code: "", meta: {}, hostSeat: "host", selfSeat: "", keys: {}, origHost: null, order: [], myKey: "", myName: "", rec: null, xfer: null, frozen: false, snapStr: "", snapPlanned: false, rx: {}, onFail: null });
  };

  // ---------------------------------------------------------------------
  // 進行状態のスナップショット（ホスト → 後継者）
  // ---------------------------------------------------------------------
  function makeSnapshot() {
    const g = G();
    const s = { v: 1, code: net.code, hostSeat: HS(), origHost: net.origHost, keys: net.keys, meta: net.meta, g: {}, gphase: g.phase, dayWaiting: !!g.dayStartId, at: Date.now() };
    AUTH_KEYS.forEach((k) => { if (g[k] !== undefined && typeof g[k] !== "function") s.g[k] = g[k]; });
    return JSON.stringify(s);
  }
  function scheduleSnap() {
    if (!net.isHost || snapTimer) return;
    snapTimer = setTimeout(() => { snapTimer = null; flushSnap(); }, 800);
  }
  function flushSnap() {
    if (!net.isHost || net.frozen) return;
    const to = net.order[0], c = to && net.conns[to];
    if (!c || !c.open) return;
    try { c.send({ t: "snap", s: makeSnapshot() }); } catch (e) {}
  }
  /** 後継者の並び: ホスト以外の接続中の人間を、参加した順に */
  function computeOrder() {
    const g = G();
    return g.players.filter((p) => !p.isCpu && p.id !== HS() && !p.off && net.conns[p.id] && net.conns[p.id].open).map((p) => p.id);
  }
  function pushOrder() {
    if (!net.isHost) return;
    const o = computeOrder(), str = o.join(",");
    net.order = o;
    if (str === lastOrder) return;
    lastOrder = str;
    Object.values(net.conns).forEach((c) => { if (c && c.open) { try { c.send({ t: "succ", order: o, hostSeat: HS() }); } catch (e) {} } });
    scheduleSnap();
  }
  const welcomeMsg = (seat) => ({ t: "welcome", seat, hostSeat: HS(), order: net.order, code: net.code });

  // ---------------------------------------------------------------------
  // ホスト側: 接続の受け付け
  // ---------------------------------------------------------------------
  function startHosting(peer) {
    peer.on("connection", (conn) => {
      conn.on("data", (d) => {
        if (!d || typeof d !== "object") return;
        if (d.t === "join") return onJoin(conn, d);
        const seat = connSeat.get(conn);
        if (!seat || net.conns[seat] !== conn) return;
        net.rx[seat] = Date.now();
        if (d.t === "hb") return;
        if (d.t === "bye") return onBye(seat, conn);
        if (d.t === "xfer-ack") return onXferAck(seat);
        if (net.frozen) return;   // ホスト交代の準備中は操作を受け付けない
        hostRecv(seat, d);
        scheduleSnap();
      });
      conn.on("close", () => onClientClose(conn));
    });
    peer.on("disconnected", () => {   // 合図用サーバーとの接続だけ切れた場合は、つなぎ直す（参加者とのP2P接続は生きている）
      const again = (n) => {
        if (net.peer !== peer || !net.isHost || !peer.disconnected || peer.destroyed) return;
        try { peer.reconnect(); } catch (e) {}
        if (n < 40) setTimeout(() => again(n + 1), 3000);
      };
      again(0);
    });
    peer.on("error", (e) => {
      if (net.peer !== peer || !net.isHost) return;
      if (e.type === "unavailable-id") demoteToClient();   // 切れている間に別の人がルームを引き継いだ → 参加者として戻る
    });
    clearInterval(hbId); hbId = setInterval(hostTick, HB_MS);
    clearInterval(snapPeriodic); snapPeriodic = setInterval(flushSnap, 5000);
    startTouch();
  }
  function hostTick() {
    if (!net.isHost) return;
    const now = Date.now();
    Object.keys(net.conns).forEach((seat) => {
      const c = net.conns[seat];
      if (!c || !c.open) return;
      try { c.send({ t: "hb" }); } catch (e) {}
      if (now - (net.rx[seat] || now) > HB_DEAD_MS) { try { c.close(); } catch (e) {} }   // 返事が無い → 切れたものとして扱う
    });
  }

  function onJoin(conn, d) {
    const g = G();
    const key = typeof d.key === "string" && d.key.length >= 16 && d.key.length <= 64 ? d.key : "";
    if (!key) { conn.send({ t: "deny", why: "key" }); return; }
    if (net.frozen) { conn.send({ t: "deny", why: "busy" }); return; }
    const pname = String(d.name || "名無し").slice(0, 12);
    const want = typeof d.resume === "string" ? d.resume.slice(0, 80) : "";
    const isOrig = !!(net.origHost && want && net.origHost.seat === want && net.origHost.key === key);   // 元のホストの席
    let seat = conn.peer, resumed = false;
    if (want) {
      if (want === net.selfSeat) { conn.send({ t: "deny", why: "key" }); return; }
      const known = g.players.some((p) => !p.isCpu && p.id === want) || g.spectators.includes(want) || (g.specRoster || []).some((x) => x.id === want) || Object.prototype.hasOwnProperty.call(g.specNames || {}, want);
      if (known) {
        if (net.keys[want] !== key && !isOrig) { conn.send({ t: "deny", why: "key" }); return; }
        seat = want; resumed = true;
      } else if (isOrig) { seat = want; resumed = true; }
      // 知らない席番号なら、新しい参加者として扱う
    }
    const isPlayerSeat = g.players.some((p) => !p.isCpu && p.id === seat);
    if (!g.inGame && !isPlayerSeat && g.players.filter((p) => !p.isCpu).length >= 20) { conn.send({ t: "full" }); return; }
    // 同じ席の古い接続は閉じる
    const old = net.conns[seat];
    if (old && old !== conn) { connSeat.delete(old); try { old.close(); } catch (e) {} }
    net.conns[seat] = conn; connSeat.set(conn, seat); net.keys[seat] = key; net.rx[seat] = Date.now();
    net.meta[seat] = ONW.account.cleanMeta(d);               // アイコン情報（表示専用。UUID/数値の形だけ確認）
    clearTimeout(dropTimers[seat]); delete dropTimers[seat];

    if (g.inGame) {
      if (isPlayerSeat) {                                     // 試合中に落ちた参加者が戻ってきた → 画面を作り直して送る
        const p = g.players.find((q) => q.id === seat); delete p.off;
        conn.send(welcomeMsg(seat));
        conn.send({ t: "batch", msgs: resyncMsgs(seat) });
      } else {                                                // 試合中の途中参加 / 観戦席の再入室 → 観戦
        if (!g.spectators.includes(seat)) g.spectators.push(seat);
        g.specNames[seat] = (resumed && g.specNames[seat]) || pname;
        conn.send(welcomeMsg(seat));
        conn.send({ t: "spectate", phase: g.phase, log: g.chatLog, ghost: g.ghostLog || [], remain: g.remain, board: boardView(), tf: tfView(), dbg: !!g.debugOn });
        conn.send(specInfoMsg());
      }
    } else {
      let p = g.players.find((q) => !q.isCpu && q.id === seat);
      if (p) delete p.off;
      else { p = { id: seat, name: pname, isCpu: false, status: "waiting", spectate: occupied(g) >= g.villageSize }; g.players.push(p); }   // 定員（何人村。CPU含む）に達していたら観戦で入る
      conn.send(welcomeMsg(seat));
      broadcastLobby();
    }
    pushOrder(); scheduleSnap();
    maybeHandBack(seat);
  }

  function onClientClose(conn) {
    const seat = connSeat.get(conn);
    connSeat.delete(conn);
    if (!seat || net.conns[seat] !== conn) return;   // 席をすでに別の接続に引き継いだ古い接続
    const g = G();
    delete net.conns[seat];
    g.spectators = g.spectators.filter((id) => id !== seat);
    if (!g.inGame) {                                  // ロビー: 少しの間は席を残して、戻ってきたら同じ席に戻す
      const p = g.players.find((q) => q.id === seat);
      if (p && !net.xfer) { p.off = true; dropTimers[seat] = setTimeout(() => removeSeat(seat), LOBBY_GRACE_MS); }
      broadcastLobby();
    }                                                 // 試合中は残し、戻る時に整理する
    pushOrder(); scheduleSnap();
  }
  function removeSeat(seat) {
    const g = G();
    clearTimeout(dropTimers[seat]); delete dropTimers[seat];
    if (g.inGame || !net.isHost) return;
    g.players = g.players.filter((p) => p.id !== seat);
    delete net.conns[seat]; delete net.meta[seat]; delete net.keys[seat]; delete net.rx[seat];
    broadcastLobby(); pushOrder(); scheduleSnap();
  }
  /** 参加者が自分から退出した */
  function onBye(seat, conn) {
    const g = G();
    connSeat.delete(conn); delete net.conns[seat];
    g.spectators = g.spectators.filter((id) => id !== seat);
    delete net.keys[seat];                            // 退出した席には戻れない
    if (!g.inGame) removeSeat(seat); else { pushOrder(); scheduleSnap(); }
  }

  // ---------------------------------------------------------------------
  // 再入室した人へ、いまの画面を作り直すためのメッセージ（試合中）
  // ---------------------------------------------------------------------
  function resyncMsgs(seat) {
    const g = G(), P = PH(), p = g.players.find((q) => q.id === seat), ph = g.phase, m = [];
    if (!p) return m;
    m.push(roleMsg(p));
    if (ph !== P.ONLINE_ROLE) m.push({ ...nightMsg(p), sel: (g.nightSels || {})[seat] || null });
    if ([P.ONLINE_MORNING, P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) {
      const inMorning = ph === P.ONLINE_MORNING;
      m.push({ t: "morning", logs: [...((g.nightResults || {})[seat] || []), ...(((g.morningAck || {})[seat]) || [])], reveal: inMorning ? ((g.morningReveals || {})[seat] || null) : null, insom: null, chain: (g.morningAct || {})[seat] || null, chainDone: !!(g.morningDone || {})[seat], quiet: !inMorning });
      if (g.settling || !inMorning) { const tx = insomniacResults(g)[seat]; m.push({ t: "settle", logs: tx ? [tx] : [], insom: tx ? ONW.shownRole(g.currentRoles[seat]) : null, quiet: !inMorning, stars: starHolders(g), starNames: starHolders(g).map((id) => g.players.find((q) => q.id === id).name) }); }
      if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph) && bakerCount(g) > 0) m.push({ t: "bread", n: bakerCount(g), quiet: true });   // 再入室: バナーは出さず、情報確認にだけ反映
    }
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) m.push({ t: "day", resync: true, myCo: (g.coState || {})[seat] || null });
    if (isDead(seat)) m.push({ t: "dead", v: true, log: g.ghostLog });
    if (ph === P.ONLINE_VOTE) m.push({ t: "vote_start", my: (g.votes || {})[seat] || null, forced: !!(g.dbgVotes || {})[seat] });
    if (ph === P.ONLINE_RESULT && g.resultObj) m.push({ t: "result", result: g.resultObj, ghost: g.ghostLog || [] });
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) { m.push({ t: "chatlog", log: g.chatLog || [] }); m.push({ t: "coboard", board: boardView(), tf: tfView() }); }
    if (ph !== P.ONLINE_RESULT && Number.isFinite(g.remain)) m.push({ t: "tick", sec: g.remain });
    return m;
  }

  // ---------------------------------------------------------------------
  // ホストを引き継ぐ / 手放す
  // ---------------------------------------------------------------------
  /** スナップショットを受け取って、この端末が新しいホストになる（peer は onww-XXXX を取れた状態） */
  function becomeHost(peer, snapStr) {
    const g = G();
    let s;
    try { s = JSON.parse(snapStr); } catch (e) { return false; }
    if (!s || !s.g || s.code !== net.code || !net.selfSeat) return false;
    const own = {};
    SHARED_KEYS.forEach((k) => { if (g[k] !== undefined && g[k] !== null) own[k] = g[k]; });
    Object.assign(g, s.g, own);
    net.peer = peer; net.isHost = true; net.hostConn = null; net.hostSeat = net.selfSeat; net.code = s.code;
    net.conns = {}; net.rx = {}; net.keys = s.keys || {}; net.meta = s.meta || {}; net.origHost = s.origHost || null;
    net.rec = null; net.xfer = null; net.frozen = false; net.snapStr = ""; net.snapPlanned = false; net.order = []; lastOrder = "";
    connSeat.clear();
    net.keys[net.selfSeat] = net.myKey; net.meta[net.selfSeat] = ONW.account.me();
    const oldHost = s.hostSeat;
    g.hostSpec = false;                               // 引き継いだ人は参加者（試合中の観戦席は後継者にならない）
    g.players.forEach((p) => {
      if (p.isCpu) return;
      if (p.id === net.selfSeat) p.status = "host";
      else if (p.id === oldHost && p.status === "host") p.status = g.inGame ? "playing" : "waiting";
    });
    if (g.inGame) { if (s.gphase) g.phase = s.gphase; g.cpuQueue = []; g.pumpId = null; g.dayStartId = null; g.dayBegin = null; g.tickId = null; }
    else {                                            // ロビー: みんなが戻ってくるまで待ち、戻らなかった席は少ししたら外す
      g.phase = PH().LOBBY;
      g.players.forEach((p) => { if (!p.isCpu && p.id !== net.selfSeat) { p.off = true; dropTimers[p.id] = setTimeout(() => removeSeat(p.id), LOBBY_GRACE_MS); } });
    }
    banner(null);
    startHosting(peer);
    if (ONW.account && ONW.account.roomSave) ONW.account.roomSave(net.code, net.selfSeat, net.myKey);
    resumeTimers(s);
    if (!g.inGame) broadcastLobby(); else rerender();
    return true;
  }
  /** ホストを引き継いだ直後 / 引き継ぎをやめた直後に、止まっていた時計を続きから動かす */
  function resumeTimers(s) {
    const g = G(), P = PH();
    if (!g.inGame) return;
    const ph = g.phase, remain = Math.max(1, Math.round(Number.isFinite(g.remain) ? g.remain : 1));
    g.cpuQueue = []; g.pumpId = null;                 // CPUの発言予定は引き継げないので、引き継ぎ後は新しい発言だけになる
    if (ph === P.ONLINE_ROLE) startTimer(remain, toNight);
    else if (ph === P.ONLINE_NIGHT) startTimer(remain, toMorning);
    else if (ph === P.ONLINE_MORNING) startTimer(remain, g.settling ? toDay : toSettle);
    else if (ph === P.ONLINE_DAY) {
      if (s && s.dayWaiting) beginDay();
      else { startTimer(remain, toVote, (r) => { if (r <= 20) announceVotes(); }); if (remain <= 20) announceVotes(); }
    }
    else if (ph === P.ONLINE_VOTE) startTimer(remain, finishVoting);
  }

  /** この端末のホスト権限を手放して、参加者として同じ席に戻る */
  function demoteToClient(newHost) {
    if (!net.isHost) return;
    const g = G(), mySeat = net.selfSeat, code = net.code, name = net.myName, onFail = net.onFail, peer = net.peer;
    try { clearTimers(); } catch (e) {}
    clearInterval(hbId); clearInterval(snapPeriodic); clearTimeout(snapTimer); clearTimeout(backTimer);
    hbId = snapPeriodic = snapTimer = backTimer = null; lastOrder = "";
    Object.values(dropTimers).forEach(clearTimeout); dropTimers = {};
    if (net.xfer && net.xfer.timer) clearTimeout(net.xfer.timer);
    net.gen++;
    connSeat.clear();
    Object.assign(net, { isHost: false, hostSeat: newHost || "", conns: {}, keys: {}, rx: {}, xfer: null, frozen: false, order: newHost ? [newHost] : [], peer: null, hostConn: null, snapStr: "", snapPlanned: false });
    try { peer && peer.destroy(); } catch (e) {}
    const init = ONW.createInitialState();
    HOST_ONLY_KEYS.forEach((k) => { if (k in init) g[k] = init[k]; else delete g[k]; });
    g.inGame = false;
    banner(newHost ? "ホストを交代しています…" : "ホストとの接続が切れました。再接続しています…", { cancel: true });
    clientStart({ code, name, resume: mySeat, retry: true, maxMs: REC_MAX_MS, onFail: (why) => recoveryFailed(why, onFail) });
    rerender();
  }

  /** ホストを別の人に渡す（ロビーの「ホスト譲渡」/ 元のホストが戻ったときの返却）。permanent=true なら、その人が「元のホスト」になる */
  net.handoffTo = function (seat, permanent) {
    const g = G();
    if (!net.isHost || net.xfer || net.frozen) return false;
    const c = net.conns[seat], p = g.players.find((q) => !q.isCpu && q.id === seat);
    if (!c || !c.open || !p || seat === net.selfSeat) return false;
    net.xfer = { to: seat, permanent: !!permanent, prevOrig: net.origHost, timer: null, snap: "" };
    net.frozen = true;
    if (permanent) net.origHost = { seat, key: net.keys[seat] };
    net.xfer.snap = makeSnapshot();                   // 時計を止める前に作る
    clearTimers();
    banner(permanent ? "ホストを譲渡しています…" : "ホストを元の人に返しています…");
    try { c.send({ t: "xfer", s: net.xfer.snap }); } catch (e) { abortHandoff(); return false; }
    net.xfer.timer = setTimeout(abortHandoff, 8000);
    return true;
  };
  function onXferAck(seat) {
    const x = net.xfer;
    if (!x || x.to !== seat) return;
    clearTimeout(x.timer);
    Object.values(net.conns).forEach((c) => { if (c && c.open) { try { c.send({ t: "newhost", seat: x.to }); } catch (e) {} } });
    setTimeout(() => demoteToClient(x.to), 300);
  }
  function abortHandoff() {
    const x = net.xfer;
    if (!x) return;
    clearTimeout(x.timer);
    net.origHost = x.prevOrig; net.xfer = null; net.frozen = false;
    banner(null);
    let s = null; try { s = JSON.parse(x.snap); } catch (e) {}
    resumeTimers(s);
  }
  /** 元のホストが戻ってきたら、ホストを返す（試合中は参加者として戻ったときだけ。観戦席だった場合は試合が終わってから） */
  function maybeHandBack(seat) {
    const o = net.origHost, g = G();
    if (!net.isHost || !o || o.seat !== seat || seat === net.selfSeat || backTimer) return;
    if (g.inGame && !g.players.some((p) => !p.isCpu && p.id === seat)) return;
    backTimer = setTimeout(() => {
      backTimer = null;
      if (net.isHost && net.origHost && net.origHost.seat === seat && !net.xfer) net.handoffTo(seat, false);
    }, 1500);
  }
  /** ロビーのホスト譲渡ボタンから。idx はロビーの人間の並び（lobbyMsg の players と同じ順） */
  net.transferHost = function (idx) {
    const g = G();
    if (!net.isHost || g.inGame || g.phase !== PH().LOBBY) return;
    const p = g.players.filter((q) => !q.isCpu)[idx];
    if (!p || p.id === net.selfSeat || p.off) return;
    net.handoffTo(p.id, true);
  };

  // ---------------------------------------------------------------------
  // 参加者側: 接続・再接続・（後継者なら）ホストの引き継ぎ
  // ---------------------------------------------------------------------
  function tryRegister(code, cb) {
    const p = new Peer(PREFIX + code);
    let done = false;
    const fin = (ok, why) => { if (done) return; done = true; clearTimeout(to); if (!ok) { try { p.destroy(); } catch (e) {} } cb(ok ? p : null, why); };
    const to = setTimeout(() => fin(false, "timeout"), 9000);
    p.on("open", () => fin(true));
    p.on("error", (e) => fin(false, e.type));
  }
  function dial(o, cb) {
    const peer = new Peer();
    let done = false, conn = null;
    const fin = (ok, why) => { if (done) return; done = true; clearTimeout(to); if (!ok) { try { peer.destroy(); } catch (e) {} } cb(ok ? { peer, conn } : null, why); };
    const to = setTimeout(() => fin(false, "timeout"), 10000);
    peer.on("error", (e) => fin(false, e.type));
    peer.on("open", () => {
      conn = peer.connect(PREFIX + o.code, { reliable: true });
      conn.on("error", () => fin(false, "conn"));
      conn.on("open", () => {
        conn.send({ t: "join", name: o.name, key: net.myKey, resume: o.resume || "", ...ONW.account.me() });
        fin(true);
      });
    });
  }
  /** 接続を始める。retry=true なら、つながるまで（maxMs まで）繰り返す。後継者に選ばれている人は、必要ならここでホストを引き継ぐ */
  function clientStart(o) {
    const gen = net.gen, t0 = Date.now();
    net.rec = o.retry ? { t0 } : null;
    const hosted = (peer) => {
      if (gen !== net.gen) { try { peer.destroy(); } catch (e) {} return; }
      if (!becomeHost(peer, net.snapStr)) { try { peer.destroy(); } catch (e) {} setTimeout(loop, 1500); }
    };
    const loop = () => {
      if (gen !== net.gen) return;
      const el = Date.now() - t0;
      if (o.retry && el > o.maxMs) return o.onFail("gone");
      const rank = net.order.indexOf(net.selfSeat), hasSnap = !!net.snapStr, planned = hasSnap && net.snapPlanned;
      if (planned) return tryRegister(o.code, (peer) => (peer ? hosted(peer) : setTimeout(loop, 700)));   // ホスト交代を頼まれた: すぐに新しいホストになる
      dial(o, (res, why) => {
        if (gen !== net.gen) { if (res) { try { res.peer.destroy(); } catch (e) {} } return; }
        if (res) return adopt(res, o, gen);
        if (!o.retry) return o.onFail(why);
        if (hasSnap && rank >= 0 && el >= 1500 + rank * 3500 && (why === "peer-unavailable" || why === "timeout")) {   // ホストがいない: 先に参加した人から順に引き継ぐ
          return tryRegister(o.code, (peer) => (peer ? hosted(peer) : setTimeout(loop, 1000)));
        }
        setTimeout(loop, 1200);
      });
    };
    setTimeout(loop, o.delay || 0);
  }
  function adopt(res, o, gen) {
    const { peer, conn } = res;
    try { if (net.peer && net.peer !== peer) net.peer.destroy(); } catch (e) {}
    net.peer = peer; net.hostConn = conn; net.code = o.code; net.isHost = false; net.lastRx = Date.now();
    peer.on("error", () => {});
    startClientWatch();
    conn.on("data", (d) => { net.lastRx = Date.now(); clientRecv(d, o, gen); });
    conn.on("close", () => { if (gen !== net.gen || net.hostConn !== conn) return; onHostLost(); });
  }
  function clientRecv(d, o, gen) {
    if (!d || typeof d !== "object") return;
    if (d.t === "hb") return;
    if (d.t === "welcome") {
      net.selfSeat = d.seat; net.hostSeat = d.hostSeat; net.order = d.order || []; net.rec = null;
      banner(null);
      if (ONW.account && ONW.account.roomSave) ONW.account.roomSave(net.code, net.selfSeat, net.myKey);
      startTouch();
      return;
    }
    if (d.t === "succ") { net.order = d.order || []; net.hostSeat = d.hostSeat; return; }
    if (d.t === "snap") { net.snapStr = d.s; net.snapPlanned = false; return; }
    if (d.t === "xfer") { net.snapStr = d.s; net.snapPlanned = true; try { net.hostConn.send({ t: "xfer-ack" }); } catch (e) {} banner("ホストを引き継いでいます…"); return; }
    if (d.t === "newhost") { net.order = [d.seat]; banner("ホストを交代しています…", { cancel: true }); return; }
    if (d.t === "full") { o.onFail("full"); return; }
    if (d.t === "abandon") { banner("ホストが廃村にしました。ルームに戻ります。"); setTimeout(() => banner(null), 3500); return; }
    if (d.t === "kicked") {   // ホストにキックされた: 席の記録も消してトップ画面へ戻る
      const f = net.onFail;
      net.leave({ forget: true });
      if (f) f("ホストによってルームから退出させられました。");
      return;
    }
    if (d.t === "deny") {
      if (d.why === "busy" && o.retry) { try { net.hostConn.close(); } catch (e) {} return; }   // ホスト交代の最中: 少し待ってつなぎ直す
      o.onFail(d.why === "busy" ? "busy" : "deny"); return;
    }
    onMsg(d);
  }
  function onHostLost() {
    const onFail = net.onFail;
    net.hostConn = null;
    stopClientWatch();
    banner("ホストとの接続が切れました。再接続しています…", { cancel: true });
    clientStart({ code: net.code, name: net.myName, resume: net.selfSeat, retry: true, maxMs: REC_MAX_MS, delay: 800, onFail: (why) => recoveryFailed(why, onFail) });
  }
  function recoveryFailed(why, onFail) {
    const f = onFail || net.onFail;
    if (why === "deny" && ONW.account && ONW.account.roomClear) ONW.account.roomClear();   // 席に戻れない記録は消す
    net.leave();   // 再入室の情報は残す（トップ画面の「ルームに戻る」で再入室できる）
    if (f) f("ルームとの接続が切れました。" + (ONW.account && ONW.account.user ? "トップ画面の「ルームに戻る」から再入室できる場合があります。" : ""));
  }
  net.cancelRecovery = function () {
    const f = net.onFail;
    net.leave();
    if (f) f("再接続を中断しました。");
  };
  function startClientWatch() {
    stopClientWatch();
    watchId = setInterval(() => {
      const c = net.hostConn;
      if (!c || net.isHost) return;
      if (c.open) { try { c.send({ t: "hb" }); } catch (e) {} }
      if (Date.now() - (net.lastRx || 0) > HB_DEAD_MS) { try { c.close(); } catch (e) {} }   // ホストから何も届かない → 切れたものとして再接続
    }, 4000);
  }
  function stopClientWatch() { clearInterval(watchId); watchId = null; }
  /** 再入室の記録（ログイン中のみ）を、ルームにいる間は5分ごとに更新する */
  function startTouch() {
    clearInterval(touchId);
    touchId = setInterval(() => { if (net.code && net.selfSeat && net.myKey && ONW.account && ONW.account.roomSave) ONW.account.roomSave(net.code, net.selfSeat, net.myKey); }, 5 * 60 * 1000);
  }

  const failText = (why) => (why === "peer-unavailable" ? "ルームが見つかりません。コードを確認してください。"
    : why === "full" ? "このルームには参加できません（満員または開始済み）。"
    : why === "busy" ? "ホストを交代しているところです。少し待ってからやり直してください。"
    : why === "timeout" || why === "conn" ? "ルームに接続できませんでした。"
    : "接続に失敗しました: " + why);

  net.createRoom = function (name, onError) {
    net.leave();
    net.onFail = onError; net.myName = name; net.myKey = randKey();
    const code = genCode(), gen = net.gen;
    const peer = new Peer(PREFIX + code);
    peer.on("open", () => {
      if (gen !== net.gen) { try { peer.destroy(); } catch (e) {} return; }
      net.peer = peer; net.isHost = true; net.code = code; net.hostSeat = "host"; net.selfSeat = "host";
      net.keys = { host: net.myKey }; net.meta = { host: ONW.account.me() }; net.origHost = { seat: "host", key: net.myKey };
      const g = G(), saved = ONW.settings.load();
      if (saved) ONW.settings.apply(g, saved);            // 前回のルールを復元
      try { g.debugOn = localStorage.getItem("onw.debugOn.v1") === "1"; } catch (e) {}   // デバッグモードのON/OFFも前回のまま
      Object.assign(g, { players: [{ id: "host", name, isCpu: false, status: "host" }], inGame: false, spectators: [], specNames: {}, phase: PH().LOBBY });
      fitVillage();
      startHosting(peer);
      if (ONW.account && ONW.account.roomSave) ONW.account.roomSave(code, "host", net.myKey);
      broadcastLobby(); pushOrder();
    });
    peer.on("error", (e) => {
      if (net.peer === peer) return;                      // 開いたあとのエラーは startHosting 側で扱う
      if (gen !== net.gen) return;
      if (e.type === "unavailable-id") { try { peer.destroy(); } catch (x) {} net.createRoom(name, onError); }
      else onError("接続に失敗しました: " + e.type);
    });
  };
  net.joinRoom = function (code, name, onError) {
    net.leave();
    code = code.trim().toUpperCase();
    net.onFail = onError; net.myName = name; net.myKey = randKey(); net.code = code;
    clientStart({ code, name, resume: "", retry: false, onFail: (why) => { net.leave(); onError(failText(why)); } });
  };
  /** トップ画面の「ルームに戻る」: ログイン中なら、記録しておいた席とキーで同じ席に再入室する */
  net.rejoin = function (onError) {
    const row = net.rejoinInfo;
    if (!row || net.peer || net.rec) return;
    net.leave();
    const name = (ONW.account && ONW.account.displayName) || "名無し";
    net.onFail = onError; net.myName = name; net.myKey = row.key; net.selfSeat = row.seat; net.code = row.code;
    banner(`ルーム ${row.code} に再入室しています…`, { cancel: true });
    clientStart({ code: row.code, name, resume: row.seat, retry: true, maxMs: 30000, onFail: () => {
      if (ONW.account && ONW.account.roomClear) ONW.account.roomClear();
      net.rejoinInfo = null; net.leave();
      onError("ルームが見つかりませんでした。すでに終了している可能性があります。");
    } });
  };
  /** タイトル画面を開いたとき: 参加中のルームの記録があるか調べる（ログイン中のみ） */
  net.checkRejoin = async function () {
    const A = ONW.account;
    if (!A || !A.user || !A.roomLoad || net.peer || net.rec) { net.rejoinInfo = null; return; }
    let row = null;
    try { if (net.forgetP) await net.forgetP; } catch (e) {}
    net.forgetP = null;
    if (net.peer || net.rec) return;
    try { row = await A.roomLoad(); } catch (e) {}
    if (net.peer || net.rec) return;
    net.rejoinInfo = row ? { code: row.room_code, seat: row.seat_id, key: row.resume_key } : null;
    if (G().phase === PH().TITLE) rerender();
  };
  if (ONW.account && ONW.account.onChange) ONW.account.onChange(() => net.checkRejoin());


  net.changeRole = function (role, delta) {
    if (!net.isHost) return;
    const c = G().roleCounts;
    c[role] = Math.max(0, Math.min(10, (c[role] || 0) + delta));
    persist(); broadcastLobby();
  };

  /** 墓地枚数・CPU人数の増減（ホストのみ） */
  net.changeSetting = function (key, delta) {
    if (!net.isHost || !["graveCount", "seerGraveCount", "cpuCount", "villageSize"].includes(key)) return;
    const g = G();
    if (key === "villageSize") { g.villageSize = Math.max(3, Math.min(10, (g.villageSize ?? 4) + delta)); fitVillage(); }
    else if (key === "cpuCount") { if (delta > 0 && occupied(g) >= g.villageSize) return; g.cpuCount = Math.max(0, Math.min(10, (g.cpuCount ?? 0) + delta)); }
    else g[key] = Math.max(0, Math.min(10, (g[key] ?? 2) + delta));
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
    g.players = g.players.filter((p) => !p.isCpu && (p.id === HS() || (net.conns[p.id] && net.conns[p.id].open)));
    g.players.forEach((p) => { if (p.id === HS()) p.status = "host"; delete p.off; });
    const hs = (g.specRoster || []).find((x) => x.id === HS());
    if (hs && !g.players.some((p) => p.id === HS())) g.players.unshift({ id: HS(), name: hs.name, isCpu: false, status: "host", spectate: true });   // 観戦していたホストをルームへ戻す
    // ロビーで観戦ONだった人は、試合が終わっても観戦のまま戻す（結果を見終わるまでは「結果確認中」）
    (g.specRoster || []).filter((x) => x.id !== HS() && g.spectators.includes(x.id) && net.conns[x.id] && net.conns[x.id].open).forEach((x) => {
      g.spectators = g.spectators.filter((id) => id !== x.id);
      g.players.push({ id: x.id, name: x.name, isCpu: false, status: "result", spectate: true });
    });
    g.hostSpec = false;
    g.phase = PH().LOBBY; g.remain = null;
    broadcastLobby(); pushOrder();
    if (net.origHost) maybeHandBack(net.origHost.seat);   // 試合が終わった: 元のホストが戻っていれば、ホストを返す
  };

  /** 廃村（ホストのみ）: 試合を結果なしで打ち切り、全員をルーム（ロビー）へ戻す */
  net.abandonGame = function () {
    const g = G();
    if (!net.isHost || net.frozen || net.xfer || !g.inGame || g.phase === PH().ONLINE_RESULT || g.phase === PH().LOBBY) return;
    const m = { t: "abandon" };
    sendAll(m); sendSpec(m);
    g.players.forEach((p) => { if (!p.isCpu && p.id !== HS()) p.status = "waiting"; });   // 「試合中」のままロビーに戻らないように
    net.returnToRoom();
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
    if (net.isHost) { spectateOf(net.selfSeat, v); return; }
    if (net.hostConn) net.hostConn.send({ t: "spec", v: !!v });
  };
  /** ホストが他の人の観戦ON/OFFを切り替える（ロビーの名前メニューから。idx は lobbyMsg の players と同じ並び） */
  net.setSpectateOf = function (idx, v) {
    const g = G();
    if (!net.isHost || net.frozen || g.inGame || g.phase !== PH().LOBBY) return;
    const p = g.players.filter((q) => !q.isCpu)[idx];
    if (!p || p.id === net.selfSeat) return;
    spectateOf(p.id, v);
  };
  /** ホストが参加者をルームから外す（ロビーの名前メニューから）。外された人はトップ画面に戻る */
  net.kickPlayer = function (idx) {
    const g = G();
    if (!net.isHost || net.frozen || g.inGame || g.phase !== PH().LOBBY) return;
    const p = g.players.filter((q) => !q.isCpu)[idx];
    if (!p || p.id === net.selfSeat) return;
    const c = net.conns[p.id];
    if (c && c.open) {
      try { c.send({ t: "kicked" }); } catch (e) {}
      connSeat.delete(c);                                  // 閉じたときの「接続切れ」扱いにならないよう、先に席との結びつきを外す
      setTimeout(() => { try { c.close(); } catch (e) {} }, 400);
    }
    removeSeat(p.id);
  };
  function spectateOf(id, v) {
    const g = G(), p = g.players.find((q) => q.id === id && !q.isCpu);
    if (!p || g.inGame || g.phase !== PH().LOBBY) return;
    v = !!v;
    if (!v && occupied(g) >= g.villageSize) return;   // 定員（何人村。CPU含む）まで
    p.spectate = v;
    if (id !== HS()) p.status = "waiting";
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
    if (n < 3 || n !== g.villageSize || roles.length !== n + g.graveCount) return;   // 定員ぴったり（何人村）で開始
    if (humans.some((p) => p.id !== HS() && p.status !== "ready")) return;   // 全員の準備完了が必要
    g.players = [...humans, ...cpus];
    g.inGame = true; g.spectators = []; g.specNames = {};
    g.specRoster = specs.map((p) => ({ id: p.id, name: p.name }));
    g.hostSpec = specs.some((p) => p.id === HS());
    specs.filter((p) => p.id !== HS()).forEach((p) => { g.spectators.push(p.id); g.specNames[p.id] = p.name; });
    humans.forEach((p) => { p.status = p.id === HS() ? "host" : "playing"; delete p.off; });
    g.playerCount = n;
    g.dealStart = Date.now();   // 観戦ホストの配布演出用
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
    g.coDeck = deck.filter((d) => !ONW.TRANSFORM_GROUPS[d.r] && d.r !== "merlin");   // 光の使徒・闇の化身・銀色の影は試合開始時に別の役職へ変化するので、COの候補には出さない
    g.votes = {};
    g.nightSels = {}; g.morningReveals = {};
    Object.assign(g, { deadIds: [], ghostLog: [], nightResolved: false, dbgVotes: {}, nightResults: {}, coBoard: {}, tfLines: [], tfPairs: [], chatLog: [], coState: {}, nightLogsAll: [], cpuClaims: [], tmQueue: [], roleTrail: {}, centerTrail: {}, cards: null, morningAct: {}, morningDone: {}, loveTargets: {}, executed: [], chainIds: [], masterPick: null, masterCard: null, cpuQueue: [], cpuVotePlan: {}, announced: false, holdUntil: 0, remain: null, morningAck: {}, resultObj: null });
    clearTimers();
    g.spectators.forEach((id) => send(id, { t: "spectate", phase: PH().ONLINE_ROLE, log: [], ghost: [], remain: null, board: boardView(), tf: tfView(), dbg: !!g.debugOn }));
    startTimer(ONW.ui.dealDuration(g.center.length, g.players.length) + 5, toNight);   // 演出が終わって5秒後に自動で夜へ
    sendAll(roleMsg);
    sendSpecInfo();   // 観戦者・観戦ホストへ全員の役職を送る（roleメッセージのあとに送る）
  };

  /** 配役メッセージ（試合開始時と、再入室したときの両方で使う） */
  function roleMsg(p) {
    const g = G();
    return {
      t: "role", me: p.name, dbg: !!g.debugOn, role: ONW.shownRole(g.initialRoles[p.id]), graveCount: g.center.length, seerGraveCount: g.seerGraveCount, deck: g.coDeck, from: ONW.roles.shownFrom(g, g.transformFrom[p.id], g.initialRoles[p.id]), ds: g.dealStart,
      others: g.players.filter((q) => q.id !== p.id).map((q) => ({ id: q.id, name: q.name })),
    };
  }

  // ---- フェーズ進行（タイマーで自動。ホストの「スキップ」でも進める）----
  /** マーリンに見える人狼のID（墓地は見えない）。本物の人狼（一匹狼・忘却の人狼も含む）。人狼が誰もいなければ、昇格が決まっている狂人 */
  function merlinSees(g, selfId) {
    const ids = g.players.filter((q) => q.id !== selfId && ONW.WOLF_KIND.includes(g.initialRoles[q.id])).map((q) => q.id);
    if (ids.length) return ids;
    const mid = ONW.vote.certainPromotion(g);
    return mid && mid !== selfId ? [mid] : [];
  }
  /** 夜の始まりに本人へ送る内容（夜の画面の説明・仲間の表示など）。再入室でも同じものを作り直す */
  function nightMsg(p) {
    const g = G();
    const wolfNames = (self) => g.players.filter((q) => q.id !== self && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.name);
    {
      const r = g.initialRoles[p.id];
      let text = "", text2 = "", bigGraves = null, cultWolves = null, masonMates = null;
      if (r === "lone_wolf") {   // 一匹狼: 誰も見えず、誰からも見えない
        text = "あなたは一匹狼です。誰も見えず、誰からも見えません。";
      } else if (r === "werewolf" || r === "big_wolf" || r === "white_wolf" || r === "tofu_wolf" || r === "assassin") {
        const mates = wolfNames(p.id);
        text = mates.length ? `仲間の人狼: ${mates.join("、")}` : "仲間の人狼はいません。";
        const mateIds = g.players.filter((q) => q.id !== p.id && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.id);
        if (r === "white_wolf") text2 = "あなたは占い師に占われると村人と出ます。";
        if (r === "assassin") text2 = "あなたが追放されてめくれたら、自分以外の全員から1人を選びます。選んだ相手がマーリンなら、人狼陣営の逆転勝利です。";
        if (r === "tofu_wolf") text2 = "あなたは1票でも入ると、つられる人と一緒にめくられてメンタル崩壊します。";
        if (mateIds.length) cultWolves = mateIds;   // 夜の始まりに、仲間の人狼のカードが表になって🐺が出る（狂信者と同じ演出）
        if (r === "big_wolf") {   // 大狼: 墓地カードをすべて確認（配役直後の墓地）
          bigGraves = g.center0.slice();
          text2 = `墓地: ${bigGraves.map((c, i) => `${i + 1}枚目「${rn(c)}」`).join(" ")}`;
        }
      } else if (r === "wolf_dreamer") {   // 狼夢人: 自分は相方のいない一人の人狼だと思い込んでいる（本物の人狼と同じ表示。仲間のカードは出ない）
        text = "仲間の人狼はいません。";
      } else if (r === "cultist") {   // 狂信者: 人狼プレイヤーを知っている（墓地は見えない）
        const seenP = g.players.filter((q) => ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])), seen = seenP.map((q) => q.name);
        if (seenP.length) cultWolves = seenP.map((q) => q.id);   // 夜の始まりに、そのカードが表になって🐺が出る
        const mid = seen.length ? null : ONW.vote.certainPromotion(g);   // 人狼が不在で昇格が確定している狂人 = ご主人（役職まではわからない）
        const master = mid ? g.players.find((q) => q.id === mid) : null;
        if (!seenP.length && master && master.id === p.id) cultWolves = [p.id];   // 狂信者自身がご主人のときは、自分のカードが🐺にめくれる
        text = seen.length ? `人狼の気配: ${seen.join("、")}` : master ? `ご主人: ${master.name}${master.id === p.id ? "（あなた）" : ""}` : "見える人狼はいません。";
      }
      else if (r === "merlin") {   // マーリン: 墓地以外の人狼を知っている（人狼不在で昇格する狂人も人狼として見える）
        const ids = merlinSees(g, p.id), names = ids.map((id) => (g.players.find((q) => q.id === id) || {}).name);
        if (ids.length) cultWolves = ids;   // 夜の始まりに、そのカードが表になって🐺が出る
        text = ids.length ? `人狼: ${names.join("、")}` : "人狼はいません。";
        text2 = "あなたがアサシンに選ばれると、人狼陣営の逆転勝利になります。マーリンCOはしないでください。";
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
    }
  }
  function toNight() {
    const g = G();
    ONW.vote.certainPromotion(g);   // 昇格する狂人（のカード）を夜の始まり＝配布直後の役職で決めておく
    sendAll(nightMsg);
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
      out[p.id] = `夜の行動がすべて終わりました。あなたの最終的な役職は「${rn(ONW.shownRole(g.currentRoles[p.id]))}」です。`;
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
        const t = sel.players[0], r = ONW.seerSees(g.initialRoles[t]);
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
      hold(p.id, `墓地${i + 1}枚目と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`);
      if (CHAIN.includes(got)) { g.morningAct[p.id] = got; hold(p.id, `新しい役職（${rn(got)}）の能力を、朝のうちに使えます。`); }
      rev[p.id] = { kind: "relic", target: i, role: ONW.shownRole(got) };
      // 人狼系・狂信者・共有者を取ったら、夜の始まりに見えるはずの相方のカードを朝に表にする（狼は🐺 / 共有者は役職カード）
      const wolfIds = (self) => g.players.filter((q) => q.id !== self && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.id);
      const names = (ids) => ids.map(nameOf).join("、");
      if (ONW.SELF_AS_VILLAGER.includes(got)) {
        // 忘却の人狼・狼憑きを引いても、自分は村人だと思い込むので何も見えない
      } else if (got === "wolf_dreamer") {
        hold(p.id, "仲間の人狼はいません。");   // 狼夢人を引いたら、自分は相方のいない一人の人狼だと思い込む
      } else if (ONW.WOLF_KIND.includes(got)) {
        const ids = got === "lone_wolf" ? [] : wolfIds(p.id);
        hold(p.id, ids.length ? `仲間の人狼: ${names(ids)}` : "仲間の人狼はいません。");
        if (ids.length) rev[p.id].mates = { ids, role: "__wolf" };
      } else if (got === "cultist") {
        const ids = wolfIds(p.id);
        hold(p.id, ids.length ? `人狼の気配: ${names(ids)}` : "見える人狼はいません。");
        if (ids.length) rev[p.id].mates = { ids, role: "__wolf" };
      } else if (got === "merlin") {
        const ids = merlinSees(g, p.id);
        hold(p.id, ids.length ? `人狼: ${names(ids)}` : "人狼はいません。");
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
      hold(p.id, `${nameOf(t)} と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`);
      rev[p.id] = { kind: "swap", target: t, role: ONW.shownRole(got) };
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
    g.morningReveals = {}; g.morningAct = {}; g.morningDone = {}; g.morningAck = {}; g.settling = false;
    ONW.cpu.runNight(g, "init");
    ["seer", "relic", "robber", "tm"].forEach((kind) => { resolveNight(g, kind); ONW.cpu.runNight(g, kind); });
    applyTroublemakers(g);
    // 墓荒らしが交換した後の役職の能力は、朝に使う。CPUはここで即座に使い、人間は朝の画面で選ぶ
    ONW.cpu.runNight(g, "morning");
    applyTroublemakers(g);
    sendAll((p) => ({ t: "morning", logs: g.nightResults[p.id] || [], reveal: (g.morningReveals && g.morningReveals[p.id]) || null, insom: null, chain: g.morningAct[p.id] || null }));   // （再入室のときは resyncMsgs が同じ内容を作り直す）
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
    const stars = starHolders(g);   // 最終盤面でスターを持っている人（待機時間に全員の画面でカードが表になる）
    sendAll((p) => ({ t: "settle", logs: texts[p.id] ? [texts[p.id]] : [], insom: texts[p.id] ? g.currentRoles[p.id] : null, stars, starNames: stars.map((id) => g.players.find((q) => q.id === id).name) }));
    sendSpecInfo();
    startTimer(SETTLE_SEC, toDay);
  }
  /** 最終盤面でスターを持っているプレイヤーのID（スター公開の対象） */
  const starHolders = (g) => g.players.filter((p) => g.currentRoles[p.id] === ONW.ROLE.STAR).map((p) => p.id);
  /** 最終盤面のパン屋の数（昼タイマー開始時の「パンが焼けました」の対象） */
  const bakerCount = (g) => g.players.filter((p) => g.currentRoles[p.id] === ONW.ROLE.BAKER).length;
  const chainPending = (g) => Object.keys(g.morningAct || {}).some((id) => !g.morningDone[id]);

  /** 変化公開: 昼の開始時に「変化前 → 変化後」を（プレイヤー名なしで）公開する */
  function announceTransforms() {
    const g = G();
    if (!g.revealTransforms) return;
    const order = { light_apostle: 0, dark_avatar: 1, silver_shadow: 2 };
    const list = [
      ...Object.keys(g.transformFrom).map((id) => ({ b: g.transformFrom[id], a: g.initialRoles[id] })),
      ...Object.keys(g.centerTransformFrom).map((i) => ({ b: g.centerTransformFrom[i], a: (g.center0 || g.center)[i] })),   // 配役直後の墓地で見る（墓荒らしの交換後の g.center だと変化先が墓荒らしになってしまう）
    ].filter((e) => e.b !== e.a);
    if (!list.length) return;
    list.sort((x, y) => (order[x.b] ?? 9) - (order[y.b] ?? 9) || Math.random() - 0.5);
    g.tfLines = list.map((e) => `${rn(e.b)} → ${rn(e.a)}`);
    g.tfPairs = list.map((e) => ({ b: e.b, a: e.a }));   // tfLines と同じ並び
    // 変化公開はチャットには流さず、プレイヤー一覧の下の欄(tfLines)にだけ出す
  }

  /** 変化公開の演出が終わってから、昼のタイマーとCPUの発言を始める */
  function beginDay() {
    const g = G();
    g.dayStartId = null; g.dayBegin = null;
    if (g.phase !== PH().ONLINE_DAY) return;
    enqueue(ONW.cpu.plan(g));
    const bread = bakerCount(g);
    if (bread > 0) { const m = { t: "bread", n: bread }; sendAll(m); sendSpec(m); }   // パン屋: 昼タイマーが動き出す瞬間に「パンが焼けました」
    startTimer(g.timers.day, toVote, (remain) => { if (remain <= 20) announceVotes(); });
    if (g.timers.day <= 20) announceVotes();
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
    const begin = beginDay;
    if (wait > 0) {
      g.remain = g.timers.day; sendAll({ t: "tick", sec: g.remain }); sendSpec({ t: "tick", sec: g.remain });
      g.dayBegin = begin;
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

  /** 変化公開のスキップ（ホストのダブルタップ）: 全員の紙を飛ばし、昼のタイマーも紙が収まったらすぐ始める */
  net.skipPaper = function () {
    const g = G();
    if (!net.isHost || g.phase !== PH().ONLINE_DAY) return;
    sendAll({ t: "tfskip" }); sendSpec({ t: "tfskip" });
    ONW.stage.skipPaper();
    if (g.dayStartId && g.dayBegin) {
      clearTimeout(g.dayStartId);
      const b = g.dayBegin;
      g.dayStartId = setTimeout(b, 1100);   // 紙が下の欄に収まるのを待ってから昼を始める
    }
  };

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
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  /** 夜の選択を送る（朝まで何度でも変更できる）。sel: { players: [id...], graves: [index...] } */
  net.setSel = function (sel) {
    const msg = { t: "act", kind: "sel", sel: { players: [...(sel.players || [])], graves: [...(sel.graves || [])] } };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };

  net.sendChat = function (text) {
    text = String(text || "").trim();
    if (!text) return;
    const msg = { t: net.canGhost() ? "ghost" : "chat", text };   // 観戦者・死亡者の発言は霊界チャットへ
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };

  net.sendCo = function (text, claim, setRole, flag, short) {
    const msg = { t: "co", text, short: short ? String(short).slice(0, 80) : "", claim, setRole, hold: flag === "hold", disclose: flag === "disclose" };
    if (setRole) G().myCo = setRole;
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };

  net.strawPick = function (target) {   // わら人形: 道連れにする相手を送る
    const g = G();
    if (!g.strawPick || !g.strawPick.some((c) => c.id === target)) return;
    g.strawPick = null;
    const msg = { t: "strawpick", target };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  net.vote = function (target) {   // target: 投票先のID / null（未投票に戻す）。最終的な票はタイマー終了時に数える
    const g = G();
    if (g.voted) return;           // デバッグでホストが固定した票は変えられない
    const msg = { t: "vote", target: target || null };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
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
          const t = players[0], r = ONW.seerSees(g.currentRoles[t]);
          lines = [`${nameOf(t)} の役職は「${rn(r)}」でした。`];
          g.nightLogsAll.push(`${label} ${me.name} は 朝に${nameOf(t)} を占い、${rn(r)} でした。`);
          reveal = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
        }
      } else if (ar === "robber" && players.length) {
        const t = players[0];
        ONW.swapPlayers(g, id, t);
        const got = g.currentRoles[id];
        lines = [`${nameOf(t)} と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`];
        g.nightLogsAll.push(`${label} ${me.name} は 朝に${nameOf(t)} と役職を交換し、${rn(got)} になりました。`);
        reveal = { kind: "swap", target: t, role: ONW.shownRole(got) };
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
      (g.morningAck = g.morningAck || {})[id] = lines;   // 再入室したときに朝の結果を復元するため
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
        const full = occupied(g) >= g.villageSize;
        g.players.push({ id, name: g.specNames[id] || "名無し", isCpu: false, status: "waiting", spectate: wasSpec || full });
        broadcastLobby();
      }
    }
    if (d.t === "chat" && g.phase === PH().ONLINE_DAY) {
      const text = String(d.text || "").trim().slice(0, 100);
      if (text && byId(id) && !isDead(id)) pushChat(byId(id).name, text, "chat");   // 死亡者・観戦者は議論に書き込めない
    }
    if (d.t === "ghost" && g.inGame && g.phase !== PH().ONLINE_RESULT) {   // 霊界チャット: 観戦者と昼中に死亡した人だけが読み書きできる
      const spec = g.spectators.includes(id) || (id === HS() && g.hostSpec);
      if (!spec && !isDead(id)) return;
      const text = String(d.text || "").trim().slice(0, 100);
      if (!text) return;
      g.ghostLog.push({ name: ghostNameOf(id), text, kind: "chat", at: Date.now() });
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

    if (d.t === "strawpick" && g.phase === PH().ONLINE_VOTE && g.strawAsk && g.strawAsk.id === id) {   // わら人形が道連れ先を選んだ
      if (!g.strawAsk.cands.includes(d.target)) return;
      (g.strawAsk.kind === "assassin" ? g.assassinTargets : g.strawTargets)[id] = d.target; g.strawAsk = null;
      stopTimer();
      sendAll({ t: "strawwait", on: false });
      proceedChain();
      return;
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
    g.catPicks = {}; g.strawTargets = {}; g.assassinTargets = {}; g.assassinList = []; g.strawAsk = null;   // 猫又・黒猫・わら人形の道連れ先は、この結果ごとに決め直す
    proceedChain();
  }
  /** わら人形がめくれたら、本人にまだめくれていない人から道連れ先を選んでもらう。全員ぶん選び終わったら結果を確定する */
  function proceedChain() {
    const g = G();
    if (g.phase !== PH().ONLINE_VOTE) return;
    const need = ONW.vote.strawNeed(g);
    if (!need) { finalizeResult(); return; }
    const doll = g.players.find((p) => p.id === need.id);
    const cands = need.cands.map((id) => ({ id, name: (g.players.find((p) => p.id === id) || {}).name || "?" }));
    const kind = need.kind || "straw";
    const rand = () => {
      if (kind === "assassin") g.assassinTargets[need.id] = ONW.cpu.assassinPick(g, need.id, need.cands);   // CPU・時間切れ: 仲間と分かっている人は避けて選ぶ
      else g.strawTargets[need.id] = ONW.utils.randomChoice(need.cands);
      g.strawAsk = null; sendAll({ t: "strawwait", on: false }); proceedChain();
    };
    // CPU・通信が切れた人はその場でランダム。人間は制限時間つきで選んでもらい、時間切れもランダム
    if (!doll || doll.isCpu || (doll.id !== net.selfSeat && !(net.conns[doll.id] && net.conns[doll.id].open))) { rand(); return; }
    g.strawAsk = { id: need.id, cands: need.cands, kind };
    sendAll({ t: "strawwait", on: true, name: doll.name, kind });
    send(doll.id, { t: "strawask", cands, kind });
    startTimer(20, () => { if (g.strawAsk && g.strawAsk.id === need.id) { send(need.id, { t: "strawask", cands: [] }); rand(); } });
  }
  function finalizeResult() {
    const g = G();
    clearTimers();
    sendAll({ t: "strawwait", on: false });
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
      const isChain = (g.chainIds || []).includes(p.id);   // 巻き込まれた人（死因: 無理心中 = 一目惚れしてるてる / 道連れ = わら人形・猫又・黒猫）
      const kind = isChain ? (g.chainKind || {})[p.id] || "love" : null;
      const by = isChain ? nm((g.chainBy || {})[p.id]) : null;
      const label = kind === "tomo" ? "道連れ" : "無理心中";
      return { id: p.id, role: fin, ini, win: winIds.includes(p.id), dead: gone.includes(p.id), name: p.name, segs, cause: isChain ? "chain" : gone.includes(p.id) ? "exec" : null, mental: (g.mentalIds || []).includes(p.id), kind, by, byRole: isChain ? (g.currentRoles[(g.chainBy || {})[p.id]] || null) : null, status: isChain ? `［${label}］` : (g.mentalIds || []).includes(p.id) ? "［メンタル崩壊］" : gone.includes(p.id) ? "［追放］" : "［生存］" };
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
      assassin: (g.assassinResult || []).map((a) => ({ by: nm(a.by), byId: a.by, target: nm(a.target), targetId: a.target, role: g.currentRoles[a.target], hit: a.hit })),
      grave: g.center.map((r, i) => {
        const gSfx = (card) => (card && g.promotedWolfIds.some((id) => ONW.cardAt(g, id) === card) ? "(+人狼)" : "");
        const f = g.centerTransformFrom[i], o = (g.center0 || g.center)[i];   // o: 配役直後 / r: 墓荒らしの交換後
        return { label: `墓地${i + 1}`, role: r, segs: noDarkSfx([...(f ? [{ name: rn(f), team: teamOf(f) }] : []), { name: rn(o), team: teamOf(o), sfx: gSfx("G:" + i) }, ...((g.centerTrail || {})[i] || []).map((x, k) => ({ name: rn(x), team: teamOf(x), sfx: gSfx(((g.cards && g.cards.trail["g:" + i]) || [])[k]) })), ...((((g.centerTrail || {})[i] || []).slice(-1)[0] ?? o) !== r ? [{ name: rn(r), team: teamOf(r) }] : [])]) };
      }),
    };
    g.players.forEach((p) => { if (!p.isCpu) p.status = "result"; });   // 戻るまで「結果確認中」
    g.resultObj = result;   // 再入室した人にも同じ結果を送るため
    sendAll({ t: "result", result, ghost: g.ghostLog || [] });   // 霊界チャットも結果画面では全員が読める
    sendSpec({ t: "result", result });
  }

  ONW.net = net;
})(window.ONW);
