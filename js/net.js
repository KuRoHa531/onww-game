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
  // 夜に自分で操作する役職・朝に使える役職は js/roles/ の各役職ファイル(night 定義)から決まる。ここには役職名を書かない
  const isActive = (r) => ONW.roleIsActive(r);   // 夜に自分で操作する役職か
  /** 夜が明けるときに実行する段階(起床順)。各役職ファイルの night.kind がこのどれかに対応する。段階を増やすときは cpu.js の runNight も同じ名前で合わせる */
  const NIGHT_STAGES = ["seer", "relic", "doppel", "shuffler", "gremlin", "robber", "tm"];
  const G = () => ONW.game;
  const PH = () => ONW.PHASE;
  const rerender = () => ONW.ui.render(G());
  const rn = (r) => ONW.roles.getInfo(r).name;
  /** 役職ファイル(js/roles/*.js)のフックへ渡すコンテキスト。役職ファイルは net.js の中身に直接触らず、ここにある道具だけを使う */
  const RC = () => ({
    g: G(), PH: PH(), hold, send, sendAll, sendSpec, sendSpecInfo, rn, isDead,
    nameOf: (x) => (G().players.find((p) => p.id === x) || {}).name || "?",
    byId: (x) => G().players.find((p) => p.id === x),
    gotInfo, soberInfoLines, soberPeek,
  });
  const TEAM = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" };

  net.myId = () => net.selfSeat || (net.peer && net.peer.id) || "";
  const HS = () => net.hostSeat;   // いまホスト権限を持っている席ID
  /** 夜の行動をまだ選んでいない（またはまだ足りない）人の数 */
  const selComplete = (role, sel) => {
    sel = sel || {}; const np = (sel.players || []).length, ng = (sel.graves || []).length;
    const d = ONW.roleDef(role);
    return d && d.night && d.night.complete ? !!d.night.complete(np, ng) : true;   // 選択の条件は各役職ファイル(night.complete)
  };
  const effRole = (g, id) => g.initialRoles[id];   // 夜に選べるのは配られた役職の能力だけ（墓荒らしの交換後の能力は朝に使う）
  const actDone = (g, id) => selComplete(effRole(g, id), (g.nightSels || {})[id]);
  net.pendingCount = () => { const g = G(); return (g.players || []).filter((p) => !p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]) && isActive(g.initialRoles[p.id]) && !actDone(g, p.id)).length; };

  // ---- タイマー（ホストの端末が時計）----
  function stopTimer() { const g = G(); if (g.tickId) clearInterval(g.tickId); g.tickId = null; g.tickCb = null; }
  function startTimer(sec, onEnd, onTick) {
    const g = G();
    stopTimer();
    g.remain = sec;
    sendAll({ t: "tick", sec }); sendSpec({ t: "tick", sec });
    g.tickCb = { onEnd, onTick };   // 画面を離れて一時停止したあと、同じ終わり方で続きから動かすため
    const myTick = g.tickId = setInterval(() => {
      if (g.tickId !== myTick) { clearInterval(myTick); return; }   // 取り残された古い時計（ホスト復元などで置き換わったもの）は止める。二重に動くと残り時間が倍速で進み、フェーズ移行も二重に走る
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
    Object.keys(cpuVoteWait).forEach((k) => { clearTimeout(cpuVoteWait[k]); delete cpuVoteWait[k]; });   // 考え中のCPUの票は、投票の場面が終わったら取り消す（終わらせるときは先に flushCpuVotes で入れておく）
  }
  function pushChat(name, text, kind) {
    const g = G();
    g.chatLog.push({ name, text, kind, at: Date.now() });
    sendAll({ t: "chatlog", log: g.chatLog }); sendSpec({ t: "chatlog", log: g.chatLog });
  }
  /** 昼中の死亡の知らせ（呪殺・後追い・心中・王国滅亡・撃たれた）。チャットには流さず、全員の「情報確認」(公開された情報)にだけ載せる。
   *  妖狐か狐憑きか・執行か誤爆かなど、役職や理由が分かる言葉は入れない（名前と死に方だけ） */
  function deathNote(text) {
    const g = G();
    (g.deathNotes = g.deathNotes || []).push(text);
    sendAll({ t: "deathnote", lines: g.deathNotes }); sendSpec({ t: "deathnote", lines: g.deathNotes });
  }
  /** CPUの発言キュー。1人ずつ順番に話し、人間がCO→結果開示の途中なら待つ */
  function pump() {
    const g = G();
    g.pumpId = null;
    if (g.phase !== PH().ONLINE_DAY || !g.cpuQueue.length) return;
    if (Date.now() < (g.holdUntil || 0)) { g.pumpId = setTimeout(pump, 500); return; }
    const it = g.cpuQueue.shift();
    if (isDead(it.p.id)) { g.pumpId = setTimeout(pump, 50); return; }   // 死亡したCPUは発言しない
    if (ONW.muzzle && ONW.muzzle.isMuzzled(g, it.p.id)) { g.pumpId = setTimeout(pump, 50); return; }   // 口封じされたCPUは、発言もCOもしない
    if (it.co || it.result) pushChat(null, `${it.p.name}: ${it.text}`, "co");   // 人間のCOボタンと同じ表示（「名前: 占い師CO」「名前: 〇〇を占って…」。名前と発言の区切りに「:」を付ける）
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
  // 最終結果の「情報確認」用: 昼のうちに本人へ届く通知（再入室の作り直しには含まれないもの）をホストが席ごとに覚えておく
  const INFO_DAY = new Set(["observeday", "insomday", "jobcut", "servantday", "jobday", "queenup", "muzzle"]);
  function send(id, msg) {
    if (net.isHost && msg && INFO_DAY.has(msg.t) && G().inGame) { const g = G(); g.infoDay = g.infoDay || {}; (g.infoDay[id] = g.infoDay[id] || []).push(msg); }
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
  net.onMsg = (d, quiet) => onMsg(d, quiet);   // テスト用に公開
  function onMsg(d, quiet) {
    const g = G();
    if (d.t === "batch") { (d.msgs || []).forEach((m) => onMsg(m, true)); rerender(); return; }   // 再入室: 複数のメッセージをまとめて反映（途中の画面を出さない）
    if (d.t === "spectate") { if (d.phase === PH().ONLINE_ROLE) g.dealStart = Date.now(); Object.assign(g, { tfShown: true, tfIntro: false, isSpectator: true, isDead: false, specInfo: null, ghostLog: d.ghost || [], chatTab: "main", debugOn: !!d.dbg, specPhase: d.phase, chatLog: d.log || [], boardView: d.board || [], tfView: d.tf || null, remain: d.remain, phase: PH().ONLINE_SPECTATE }); }
    if (d.t === "specphase") { if (g.phase === PH().ONLINE_RESULT) return; g.specPhase = d.phase; g.remain = null; g.phase = PH().ONLINE_SPECTATE; }
    if (d.t === "lobby") { g.isSpectator = false; g.isDead = false; g.specInfo = null; g.chatTab = "main"; g.lobbyPlayers = ONW.account.sanitizePlayers(d.players); ONW.account.setAvatarMap(g.lobbyPlayers); g.meIndex = d.me; g.roleCounts = d.counts; g.fakeWolfWhenNoWolf = d.fake; g.villageSize = d.vsize || 4; g.cpuCount = d.cpu; g.graveCount = d.grave; g.seerGraveCount = d.sgrave; g.mayorVoteCount = d.mvote ?? 2; g.drunkCount = d.drunk || 0; g.drunkChance = d.drunkp ?? 100; g.loverCount = d.lover || 0; g.loverChance = d.loverp ?? 100; g.timers = { deal: 5, settle: 5, ...d.timers }; g.revealTransforms = d.reveal; g.transformCandidates = d.cand; g.transformOff = d.off || []; g.cpuNames = d.cpuNames || []; g.debugOn = !!d.dbg; g.phase = PH().LOBBY; g.remain = null; }
    if (d.t === "tfskip") { ONW.stage.skipPaper(); return; }   // ホストが変化公開をスキップした → 全員の紙を飛ばす
    if (d.t === "tick") { g.remain = d.sec; ONW.ui.updateTimer(); if (d.sec <= 1 && g.phase === PH().ONLINE_MORNING && !g.settling && ONW.stage.morningEnd) ONW.stage.morningEnd(); return; }   // 朝の残り1秒: 朝にめくれた面を裏に戻す（待機時間の演出と重ならないように）
    if (d.t === "coboard") { g.boardView = d.board || []; g.tfView = d.tf || null; ONW.ui.updateBoard(); if (g.co && g.co.step === "history" && ONW.co) ONW.co.render(); ONW.stage.sync(g); return; }
    if (d.t === "specinfo") { g.specInfo = d.info || null; if (ONW.ui.isSpecDeal(g)) ONW.ui.render(g); ONW.ui.updateSpecInfo(); ONW.stage.sync(g); return; }   // 観戦者: 全員の役職・夜の行動・投票
    if (d.t === "ghostlog") { g.ghostLog = d.log || []; ONW.ui.updateChat(); return; }                              // 霊界チャット
    if (d.t === "dead") { g.isDead = !!d.v; if (d.v) { g.chatTab = "ghost"; g.ghostLog = d.log || g.ghostLog || []; } }   // 昼中に死亡した（霊界チャットに入る）
    if (d.t === "chatlog") { g.chatLog = d.log; ONW.ui.updateChat(); return; }
    if (d.t === "deathnote") { g.deathNotes = d.lines || []; if (ONW.ui.refreshInfo) ONW.ui.refreshInfo(); return; }   // 昼中の死亡の知らせ: チャットには出さず、情報確認の「公開された情報」にだけ載せる
    if (d.t === "role") {
      Object.assign(g, { result: null, viewResult: false, isDead: false, specInfo: null, ghostLog: [], chatTab: "main", tfShown: false, tfIntro: false, tfAppeared: false, voteSel: null, myVote: null, resultStage: null, resultCap: "", debugOn: !!d.dbg, deck: d.deck, myFrom: d.from, myLover: !!d.lover, myName: d.me || "", dealStart: d.ds || Date.now(), myCo: null, co: null, boardView: [], tfView: null, resultChatOpen: false, nightInfoClosed: false, deathNotes: [], chatLog: [], myRole: d.role, others: d.others, graveCount: d.graveCount, seerGraveCount: d.seerGraveCount, nightLogs: [], soberRole: null, soberLines: [], dayLines: [], abilityOpen: false, dictOpen: false, rejobOpen: false, dictDeclared: false, abilityMsg: "", nightDone: false, morningChain: null, morningChainDone: false, morningChainReady: false, settleInsom: null, settleShown: false, settleStars: [], starNames: [], breadN: 0, breadPending: false, mapoDone: false, muzzled: false, settleMuzzled: [], settleMuzzledShown: false, exposeRows: [], exposePending: false, exposeSkip: false, exposeForce: false, mapoPending: false, mapoSkip: false, mapoForce: false, newsLines: null, newsPending: false, newsSkip: false, newsForce: false, settleStarShown: false, morningReveal: null, morningShown: false, logHold: 0, phase: PH().ONLINE_ROLE });
    }
    if (d.t === "night") { g.nightLogs = [d.text, d.text2, d.loveText, ...(d.lines || [])].filter(Boolean); g.loveReveal = d.love || null; g.masterReveal = d.master || null; g.muzzleReveal = d.muzzle ? { id: d.muzzle } : null; g.godReveal = d.godPeek || null; g.nightAck = []; g.nightDone = !d.act; g.actRole = d.act ? g.myRole : null; g.nightSel = d.sel ? { players: [...(d.sel.players || [])], graves: [...(d.sel.graves || [])] } : { players: [], graves: [] }; g.bigReveal = d.bigGraves || null; g.cultReveal = d.cultWolves || null; g.foxReveal = d.foxMates || null; g.masonReveal = d.masonMates || null; ONW.ui.releaseLogs(g); if ((g.loveReveal || g.masterReveal || g.muzzleReveal || g.godReveal || g.bigReveal || g.cultReveal || g.foxReveal || g.masonReveal) && !g.isSpectator) ONW.ui.holdLogs(g, 3900);   // 夜の始まりにカードがめくれる人は、めくれ終わってから文章を出す
 g.phase = PH().ONLINE_NIGHT; }
    if (d.t === "observeday") {   // 昼の入れ替えで観測の人狼になった: 自分のカードがめくれて、観測結果が飛び出す
      const tx = ["【観測通知】", ...((d.lines && d.lines.length) ? d.lines : ["観測できる夜能力はありませんでした。"])];
      ONW.ui.holdLogs(g, 3200);   // カードがめくれて観測結果が飛び出してから文章を出す
      g.nightLogs = [...(g.nightLogs || []), ...tx]; g.dayLines = [...(g.dayLines || []), ...tx]; g.soberFlash = d.role;
      if (g.soberRole) g.soberRole = d.role;
      ONW.stage.sync(g);
      if (!g.isSpectator && ONW.stage.observe) setTimeout(() => ONW.stage.observe(d.lines || []), 1400);
    }
    if (d.t === "insomday") {   // 昼の入れ替えで後覚者の能力が発動した
      ONW.ui.holdLogs(g, 1500);   // 自分のカードがめくれてから文章を出す
      g.nightLogs = [...(g.nightLogs || []), d.text]; g.dayLines = [...(g.dayLines || []), d.text]; g.soberFlash = d.role;
      if (g.soberRole) g.soberRole = d.role;
      ONW.stage.sync(g);
    }
    if (d.t === "jobcut") {   // フリーター: 就職先が昼中に死亡した。昼能力で再就職できる。画面（チャットの上）には「再就職できます」の文章を出さない（情報確認用の記録はホスト側 INFO_DAY に残る）
      ONW.stage.sync(g);
    }
    if (d.t === "servantday") {   // 昼に、ご主人へ従者通知（酔いが覚めた / 墓荒らしが従者を引いた など）。誰が従者かは教えないので、カードの演出はしない
      g.nightLogs = [...(g.nightLogs || []), d.text]; g.dayLines = [...(g.dayLines || []), d.text];
      if (!g.isSpectator && ONW.ui.showServant) ONW.ui.showServant();   // 昼の通知にも同じバナー
      ONW.stage.sync(g);
    }
    if (d.t === "jobday") {   // 昼に、誰かが自分のところに就職した: フリーターのカードが数秒だけ表になる
      ONW.ui.holdLogs(g, 1800);   // フリーターのカードが表になってから文章を出す
      g.nightLogs = [...(g.nightLogs || []), d.text]; g.jobFlash = d.items && d.items.length ? d.items : [{ id: d.id, role: d.role }];   // 悪女: 本命❤・キープ♡を同時に出すときは items
      ONW.stage.sync(g);
    }
    if (d.t === "foxcurse") {   // 妖狐: 昼のうちの呪殺（酔い覚め・昼の役職移動・昼の占い）。全員の画面で🦊に裏返って灰色になる
      g.dayFox = d.ids || []; g.dayFoxChain = d.chain || []; g.dayFoxDelay = d.delay || 0;
      ONW.stage.sync(g);
      return;
    }
    if (d.t === "fanfollow") {   // 背徳者: 昼のうちの後追い（酔い覚め・昼の入れ替わり）。全員の画面で「後追い」の面に裏返って灰色になる
      g.dayFollow = d.chain || []; g.dayFollowDelay = d.delay || 0;
      ONW.stage.sync(g);
      return;
    }
    if (d.t === "starup") {   // 昼に酔いが覚めたスター: 全員の画面でカードが表になって裏に戻る。情報確認にも載る
      g.starNames = d.names || g.starNames; g.starFlash = d.ids || [];
      ONW.stage.sync(g);
      return;
    }
    if (d.t === "kingup") {   // 昼に、新しく人狼王になった人（酔いが覚めた・役職が動いた など）: 全員の画面で人狼王のカードが表になって裏に戻る
      g.kingFlash = d.ids || []; if (d.names) g.kingNames = d.names;   // 情報確認の「公開された情報」に残す
      ONW.stage.sync(g);
      return;
    }
    if (d.t === "queenup") {   // 昼に、新しく女王が分かった（酔いが覚めた・役職が動いた など）: 村人陣営の人の画面で、女王のカードが表になって裏に戻る。ログにも残る
      ONW.ui.holdLogs(g, 1800);   // 女王のカードが表になってから文章を出す
      g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.queenFlash = d.ids || [];
      ONW.stage.sync(g);
      return;
    }
    if (d.t === "sober") {   // 酔いが覚めた（昼）: その時点の最終役職と、役職の情報。能力があれば昼のうちに1回使える
      g.soberRole = d.role; g.soberLines = d.lines || []; g.soberBase = (d.lines || []).length; g.abilityOpen = false;
      if (!d.quiet) { ONW.ui.holdLogs(g, d.peek && d.peek.love ? 3600 : 1500); g.soberFlash = d.role; g.soberPeek = d.peek || null; g.nightLogs = [...(g.nightLogs || []), ...(d.lines || [])]; g.morningChain = d.chain || null; g.morningChainDone = false; g.morningChainReady = !!d.chain; g.nightSel = { players: [], graves: [] }; }
    }
    if (d.t === "ack") {   // 朝に使った能力の結果（即座に返る）
      if (d.reveal && ONW.stage.ackDelay) ONW.ui.holdLogs(g, ONW.stage.ackDelay(d.reveal) + 300);   // 交換・コピーなどの演出が終わってから「〇〇をしました」を出す
      if (g.phase === PH().ONLINE_DAY) { g.abilityOpen = false; g.soberLines = [...(g.soberLines || []), ...(d.lines || [])]; if (d.chain) { g.morningChain = d.chain; g.morningChainReady = true; g.nightSel = { players: [], graves: [] }; } }
      if (g.phase === PH().ONLINE_MORNING || g.phase === PH().ONLINE_DAY) {
      g.nightLogs = [...(g.nightLogs || []), ...(d.lines || [])];
      g.morningChainDone = !d.chain;   // 取った役職にも使える能力があるとき（墓荒らし・ドッペルゲンガーの連鎖）は、「使用済み」にせず、続けて使えるようにする
      if (d.chain && g.phase === PH().ONLINE_MORNING) { g.morningChain = d.chain; g.morningChainReady = false; g.nightSel = { players: [], graves: [] }; }   // 朝: 演出が終わってから使える（stage.onAck が ready にする）
    }
      if (d.peek) g.soberPeek = d.peek;
      ONW.stage.onAck(d);
      if (d.peek) ONW.stage.sync(g);
    }
    if (d.t === "morning") { g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.morningReveal = d.reveal || null; g.morningInsom = d.insom || null; g.morningShown = !!d.quiet; g.morningChain = d.chain || null; g.settleInsom = null; g.settleShown = false; g.settleStars = []; g.starNames = []; g.settleFreeters = []; g.settleFreeterShown = false; g.settlePure = []; g.settlePureShown = false; g.settleEvil = []; g.settleCupid = []; g.settleCupidShown = false; g.settleFox = []; g.settleFoxChain = []; g.settleFoxShown = false; g.settleFoxQuiet = false; g.settleBreaker = []; g.settleBreakerShown = false; g.settleShuffled = []; g.settleShuffledShown = false; g.settleEvilShown = false; g.settleVisitors = []; g.settleVisitorShown = false; g.settleObserve = []; g.settleObserveShown = false; g.settleQueens = []; g.settleQueenShown = false; g.settleKings = []; g.kingNames = []; g.settleKingShown = false; g.breadN = 0; g.settleStarShown = false; g.morningChainDone = !!d.chainDone; g.morningChainReady = !!d.quiet; g.nightSel = { players: [], graves: [] }; g.remain = null; g.settling = false; g.logHold = 0; if (!d.quiet && (d.reveal || d.insom) && ONW.ui && ONW.ui.holdLogs) ONW.ui.holdLogs(g, 30000);   // カードがめくれ終わるまで結果の文章は出さない（めくれる長さは stage.sync が決め直す）
 g.phase = PH().ONLINE_MORNING; }
    if (d.t === "settle") { if (d.servant && !d.quiet && !g.isSpectator && ONW.ui.showServant) ONW.ui.showServant(); g.settling = true; g.nightLogs = [...(g.nightLogs || []), ...(d.logs || [])]; g.settleInsom = d.insom || null; g.settleShown = !!d.quiet; g.settleStars = d.stars || []; g.starNames = d.starNames || []; g.settleStarShown = !!d.quiet; g.settleFreeters = d.fids || []; g.settleFreeterShown = !!d.quiet; g.settlePure = d.pure || []; g.settlePureShown = !!d.quiet; g.settleEvil = d.evil || []; g.settleEvilShown = !!d.quiet; g.settleCupid = d.cupid || []; g.settleCupidShown = !!d.quiet; g.settleFox = d.fox || []; g.settleFoxChain = d.foxChain || []; g.settleFoxShown = !!d.quiet; g.settleFoxQuiet = !!d.quiet && !!(d.fox || []).length; g.settleBreaker = d.breaker || []; g.settleBreakerShown = !!d.quiet; g.settleShuffled = d.shuffled || []; g.settleShuffledShown = !!d.quiet; g.settleVisitors = d.vids || []; g.settleVisitorShown = !!d.quiet; g.settleObserve = d.observe ? (d.observe.lines && d.observe.lines.length ? d.observe.lines : ["観測できる夜能力はありませんでした。"]) : []; g.settleObserveShown = !!d.quiet; g.settleQueens = d.queens || []; g.settleQueenShown = !!d.quiet; g.settleKings = d.kings || []; g.kingNames = d.kingNames || []; g.settleKingShown = !!d.quiet; g.muzzled = !!d.muzzled; g.settleMuzzled = d.muzzled ? [1] : []; g.settleMuzzledShown = !!d.quiet; g.settleMad = d.mad || []; g.settleMadShown = !!d.quiet; g.settleMadQuiet = !!d.quiet && !!(d.mad || []).length; g.morningChainReady = !!d.quiet; }
    if (d.t === "muzzle") { g.muzzled = !!d.on; if (d.on) g.co = null; if (d.on && !d.quiet && !g.isSpectator && ONW.stage && ONW.stage.muzzled) ONW.stage.muzzled(); if (d.text) g.nightLogs = [...(g.nightLogs || []), d.text]; if (ONW.ui && ONW.ui.render) ONW.ui.render(g); return; }   // 口封じの狂人: 昼のうちに口封じされた/解かれた
    if (d.t === "muzzlenote") { g.chatLog = [...(g.chatLog || []), { name: null, text: "あなたは口封じされているため送信できませんでした。", kind: "co" }]; if (ONW.ui && ONW.ui.render) ONW.ui.render(g); return; }
    if (d.t === "news") { g.newsLines = d.lines || []; if (!(d.quiet || quiet) && !g.isSpectator && ONW.stage && ONW.stage.news) ONW.stage.news(g.newsLines, !!d.late); return; }   // 新聞配達員: 変化公開の紙のあとに新聞の紙が出る。「情報確認」からも見返せる
    if (d.t === "expose") { const rows = d.rows || []; g.exposeRows = d.quiet ? rows.slice() : [...(g.exposeRows || []), ...rows]; if (!(d.quiet || quiet) && !g.isSpectator && rows.length && ONW.stage && ONW.stage.expose) ONW.stage.expose(rows, !!d.late); return; }   // 暴露狂人: 新聞のあと・麻婆豆腐の前に「暴露された人の最終役職」の紙が出る。「情報確認」からも見返せる
    if (d.t === "mapo") { g.mapoDone = true; if (!(d.quiet || quiet) && !g.isSpectator && ONW.stage && ONW.stage.mapo) ONW.stage.mapo(!!d.late); return; }   // 麻婆の人狼: 麻婆豆腐の完成（情報確認に載せ、演出は新聞のあとに出す）
    if (d.t === "bread") { g.breadN = d.n || 1; if (!d.quiet) { if (!d.banner && !g.isSpectator && ONW.stage && ONW.stage.bread) ONW.stage.bread(d.n || 1); else if (ONW.ui.showBread) ONW.ui.showBread(d.banner || d.n || 1); } return; }   // パン屋: 昼のタイマー開始時のバナー
    if (d.t === "day") { g.dictOpen = false; g.rejobOpen = false; g.exchOpen = false; g.sheriffOpen = false; if (!d.resync) { g.exchDone = null; g.sheriffDone = false; } g.dictDeclared = false; if (!d.resync) { g.foxVoteView = null; g.foxVoteOn = false; g.foxVoteWait = false; } g.chatLog = d.resync ? g.chatLog : []; g.co = null; if (d.resync) g.myCo = d.myCo || null; g.phase = PH().ONLINE_DAY; }
    if (d.t === "strawask") { g.strawPick = d.cands && d.cands.length ? d.cands : null; g.strawKind = d.kind || "straw"; g.strawFlipped = d.flipped || []; ONW.stage.sync(g); }   // わら人形: 道連れ先を選ぶ（空 = 時間切れ）
    if (d.t === "strawwait") { g.strawWait = d.on ? "wait" : null; g.strawHide = !!(d.on && d.hide); if (d.on && d.flipped) g.strawFlipped = d.flipped; g.strawShow = d.on ? d.show || {} : {}; g.strawShake = d.on ? (d.ids || []) : []; if (!d.on) g.strawPick = null; ONW.stage.sync(g); }   // 全員: 誰かが道連れ・暗殺を選んでいる間の「待ち」表示（誰が選んでいるかは出さない）
    if (d.t === "foxvote") { g.foxVoteView = d.view || null; g.foxVoteWait = !d.quiet; if (d.flash) { g.foxVoteFlash = d.flash; ONW.stage.sync(g); } }   // 妖狐投票の結果(得票数・追放された人)。本投票の画面にも残す
    if (d.t === "vote_start") { g.dictOpen = false; g.rejobOpen = false; g.exchOpen = false; g.sheriffOpen = false; g.dictDeclared = !!d.dictator; g.foxVoteOn = !!d.fox; g.foxVoteWait = false; if (d.fox) g.foxVoteView = null; g.asnHold = null; g.strawPick = null; g.strawWait = null; g.strawShake = []; g.voted = !!d.forced || !!d.dictator; g.voteSel = d.my || null; g.myVote = d.my || null; g.phase = PH().ONLINE_VOTE; }
    if (d.t === "rejobok") { g.rejobOpen = !!d.on; g.dictOpen = false; g.exchOpen = false; g.sheriffOpen = false; g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); }   // フリーター: 昼能力(再就職)を使える（再就職先のカードを選ぶ画面を開く）
    if (d.t === "rejobdone") { g.rejobOpen = false; g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); if (ONW.ui && g.phase === PH().ONLINE_DAY) ONW.ui.render(g); }   // 再就職を受け付けた（画面を閉じる。就職先の演出・通知はステップ3）
    if (d.t === "dictok") { g.dictOpen = !!d.on; g.exchOpen = false; g.sheriffOpen = false; g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); }   // 独裁者: 昼能力を使える（カードを選ぶ画面を開く）
    if (d.t === "exchok") { g.exchOpen = !!d.on; g.dictOpen = false; g.rejobOpen = false; g.sheriffOpen = false; g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); }   // 交換者: 昼能力を使える（入れ替える2人のカードを選ぶ画面を開く）
    if (d.t === "exchdone") { g.exchOpen = false; g.exchDone = d.a && d.b ? { a: d.a, b: d.b } : g.exchDone; if (d.a && d.b) { const tx = `${d.a} と ${d.b} の票数を入れ替えます（入れ替わるのは投票の集計のときです）。`; if (!(g.nightLogs || []).includes(tx)) { g.nightLogs = [...(g.nightLogs || []), tx]; if (ONW.ui.refreshInfo) ONW.ui.refreshInfo(); } }   /* 何をしたかは情報確認に載せる */ g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); if (ONW.ui && g.phase === PH().ONLINE_DAY) ONW.ui.render(g); }   // 交換を受け付けた（画面を閉じて「交換しました」を出す。本人だけに届く）
    if (d.t === "sheriffok") { g.sheriffOpen = !!d.on; g.dictOpen = false; g.exchOpen = false; g.rejobOpen = false; g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); }   // 保安官: 昼能力を使える（撃つ相手のカードを選ぶ画面を開く）
    if (d.t === "sheriffdone") { g.sheriffOpen = false; g.sheriffDone = true; if (d.text && !(g.nightLogs || []).includes(d.text)) { g.nightLogs = [...(g.nightLogs || []), d.text]; if (ONW.ui.refreshInfo) ONW.ui.refreshInfo(); }   /* 何をしたかは情報確認に載せる（議論タイムの画面・チャットの上には出さない） */ g.nightSel = { players: [], graves: [] }; ONW.stage.sync(g); if (ONW.ui && g.phase === PH().ONLINE_DAY) ONW.ui.render(g); }   // 撃ったことを受け付けた（画面を閉じて「使用済み」を出す。執行か誤爆かは本人にも伝えない。本人だけに届く）
    if (d.t === "forcevote") { g.voted = !!d.v; }   // デバッグ: ホストが投票先を指定した/解除した
    if (d.t === "result") {
      g.strawPick = null; g.strawWait = null; g.strawShake = []; g.result = d.result; if (d.ghost) g.ghostLog = d.ghost; g.resultStage = "exec"; g.resultCap = ""; g.phase = PH().ONLINE_RESULT;
      if (ONW.stats && !g.isSpectator && !g.debugOn) ONW.stats.record(d.result, `${net.code || ""}:${g.dealStart || 0}`);   // 自分の戦績を保存（ログイン中のみ・デバッグモード中は保存しない）
    }
    if (!quiet) rerender();
  }

  // ---- COボード（プレイヤー一覧 + 誰が何をCOしたか）----
  function boardView() {
    const g = G();
    return g.players.map((p) => ({ id: p.id, name: p.name, cpu: !!p.isCpu, dead: isDead(p.id), shot: isDead(p.id) && (g.deadKind || {})[p.id] === "shot", step: isDead(p.id) ? ((g.deadStep || {})[p.id] || 0) : 0, fox: (g.foxCursed || []).includes(p.id), fx: isDead(p.id) && (g.deadKind || {})[p.id] === "foxvote" ? ONW.foxVote.labelOf(g, p.id) : null, mark: isDead(p.id) && !(g.foxCursed || []).includes(p.id) && (g.deadKind || {})[p.id] !== "shot" ? ONW.deathMarkOf((g.deadKind || {})[p.id], g, p.id) : null, co: (g.coBoard[p.id] || {}).co || null, results: (g.coBoard[p.id] || {}).results || [] }));
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
    const players = g.players.map((p) => ({ id: p.id, name: p.name, cpu: !!p.isCpu, dead: isDead(p.id), from: g.transformFrom[p.id] || null, lover: ONW.isLover(g, p.id), ini: g.initialRoles[p.id], cur: res ? g.currentRoles[p.id] : null }));
    const center = (g.center0 || g.center || []).map((r, i) => ({ ini: r, from: (g.centerTransformFrom || {})[i] || null, cur: res ? g.center[i] : null }));
    let sels = [];
    if (g.phase === PH().ONLINE_NIGHT) {
      sels = g.players.filter((p) => !p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]) && isActive(g.initialRoles[p.id])).map((p) => {
        const er = effRole(g, p.id), sel = (g.nightSels || {})[p.id] || { players: [], graves: [] };
        const picks = [...(sel.players || []).map(nm), ...(sel.graves || []).map((i) => `墓地${i + 1}`)];
        const text = picks.length ? `選択中: ${picks.join("、")}` : "未選択";
        return { name: p.name, role: er, text };
      });
    }
    const votes = g.phase === PH().ONLINE_VOTE ? g.players.map((p) => ({ from: p.name, to: g.votes[p.id] ? nm(g.votes[p.id]) : null, w: ONW.vote.weightOf(g, p.id), x: isDead(p.id) })) : [];
    return { t: "specinfo", info: { players, center, log: g.nightLogsAll || [], sels, votes, dict: g.dictator ? { by: nm(g.dictator.by), target: nm(g.dictator.target) } : null, night: g.phase === PH().ONLINE_NIGHT, vote: g.phase === PH().ONLINE_VOTE } };
  }
  function sendSpecInfo() {
    const g = G(), m = specInfoMsg();
    sendSpec(m);
    if (g.hostSpec && g.inGame && net.isHost) send(net.selfSeat, m);
  }

  /** 昼中に死亡させる（ホストのみ）。死亡した人は投票・発言ができなくなり、霊界チャットに入る */
  net.killPlayer = function (id, byMate, kind, opts) {
    const g = G(), p = g.players.find((q) => q.id === id);
    if (!net.isHost || !g.inGame || !p || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return;
    g.deadIds = g.deadIds || [];
    if (g.deadIds.includes(id)) return;
    g.deadIds.push(id);
    (g.deadKind = g.deadKind || {})[id] = kind || (byMate ? "follow" : "dead"); (g.deadBy = g.deadBy || {})[id] = byMate || null;
    // 連鎖の段（保安官の連鎖化）: opts.step = この死の段（撃たれた人 0 → 道連れ・心中・後追い・王国滅亡 1 → その先 2 …）。画面は段ごとに時間差で出す（stage.js）。step を渡さない死に方（呪殺など）は今までどおり（段なし）
    const stepped = !!(opts && typeof opts.step === "number");
    if (stepped) (g.deadStep = g.deadStep || {})[id] = opts.step;   // 結果発表・戦績で「呪殺 / 後追い / 死亡」を出し分ける
    delete g.votes[id];
    Object.keys(g.votes).forEach((v) => { if (g.votes[v] === id) delete g.votes[v]; });
    // 情報確認だけに出す死亡の知らせ（チャットには出さない）。呪殺は妖狐と狐憑きで言葉を変えない。撃たれた(kind "shot" = 保安官)は執行と誤爆で言葉を変えない
    const NOTE = { fox: `${p.name} が呪殺されました。`, cupid: `${p.name} が後追いしました。`, fanatic: `${p.name} が後追いしました。`, follow: `${p.name} が後追いしました。`, lovers: `${p.name} が心中しました。`, queen: `${p.name} が王国滅亡で死亡しました。`, mad: `${p.name}は狂い死にました。`, shot: `${p.name} が撃たれました。`, tomo: `${p.name} が道連れになりました。` };
    if (NOTE[kind]) deathNote(NOTE[kind]);
    else if (kind === "foxvote") pushChat(null, (ONW.foxVote.labelOf(g, id) === "身代わり" ? `${nameOf((((g.foxVote && g.foxVote.subs) || []).find((x) => x.servant === id) || {}).master) || "ご主人"} が妖狐投票で追放されそうになり、従者の ${p.name} が身代わりになって追放されました。` : `${g.currentRoles[id] === ONW.ROLE.FOX_MARKED ? "狐憑き" : "妖狐"} ${p.name} が妖狐投票で追放されました。`), "death");
    else if (byMate) deathNote(`${p.name} が心中しました。`);
    else pushChat(null, `${p.name} が死亡しました。`, "death");
    if (!p.isCpu) send(id, { t: "dead", v: true, log: g.ghostLog });
    // 恋人: 昼中の死因が何であっても（今後増える死因も、この関数を通すかぎり）、死んだ瞬間に相方も心中で死亡する
    // 妖狐: 死んだ妖狐のあとを背徳者が追う（後追い）。連鎖の順は ONW.deathFollowers（恋人の心中 → キューピッドの後追い → 背徳者の後追い）
    if (!(opts && opts.noChain)) ONW.deathFollowers(g, id, g.deadKind[id]).forEach((f) => { if (!g.deadIds.includes(f.id)) net.killPlayer(f.id, p.name, f.kind, stepped ? { step: opts.step + 1 } : undefined); });
    ONW.roleHooks("dayDeath").forEach((h) => h.fn(RC(), id));   // 昼中の死亡の通知（フリーター: 就職先が死亡したら再就職できると知らせる）。連鎖で死ぬ人が出そろってから呼ぶ
    sendBoard(); sendSpecInfo(); sendGhost();
    rerender();
    skipIfAllDead();   // 昼のうちに全員が死んだら、議論と投票の時間は飛ばして結果発表へ
  };
  /** 昼（議論・投票）の途中で全員が死んだら、残りの議論時間と投票時間を飛ばして、すぐ結果発表にする（死亡の演出が見える分だけ待つ）。何度呼んでも1回だけ */
  function skipIfAllDead() {
    const g = G();
    if (!net.isHost || !g.inGame || g.allDeadSkip || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return false;
    if (!g.players.length || !g.players.every((p) => isDead(p.id))) return false;
    clearTimers(); haltClock();
    if (g.dayStartId) { clearTimeout(g.dayStartId); g.dayStartId = null; g.dayBegin = null; }
    g.cpuQueue = [];
    g.allDeadSkip = setTimeout(() => {
      const cur = ONW.game;
      g.allDeadSkip = null;
      if (!cur || cur !== g || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return;
      g.foxVote = null; g.votes = {}; g.phase = PH().ONLINE_VOTE;   // 投票はしない（全員が死んでいるので未投票のまま）。結果の計算は通常の投票終了と同じ
      finishVoting();
    }, ALL_DEAD_WAIT_MS);
    return true;
  }
  const ALL_DEAD_WAIT_MS = 2800;

  function lobbyMsg(forId) {
    const g = G(), humans = g.players.filter((p) => !p.isCpu);
    return {
      t: "lobby", code: net.code, me: humans.findIndex((p) => p.id === forId),
      players: humans.map((p) => { const m = net.meta[p.id] || {}; return { name: p.name, status: p.id === HS() ? "host" : p.off ? "offline" : p.status, spec: !!p.spectate, uid: m.uid || null, av: m.av || 0 }; }),
      counts: g.roleCounts, fake: g.fakeWolfWhenNoWolf, vsize: g.villageSize, cpu: g.cpuCount, grave: g.graveCount, sgrave: g.seerGraveCount, mvote: g.mayorVoteCount ?? 2, drunk: g.drunkCount || 0, drunkp: g.drunkChance ?? 100, lover: g.loverCount || 0, loverp: g.loverChance ?? 100, timers: g.timers, reveal: g.revealTransforms, cand: g.transformCandidates, off: g.transformOff || [], cpuNames: g.cpuNames || [], dbg: !!g.debugOn,
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
    g.loverCount = Math.min(g.loverCount || 0, Math.floor((g.villageSize || 4) / 2));   // 恋人は2人1組なので、村の人数の半分まで
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
    "roleCounts", "villageSize", "graveCount", "seerGraveCount", "mayorVoteCount", "cpuCount", "timers", "fakeWolfWhenNoWolf", "revealTransforms", "transformCandidates", "transformOff", "cpuNames", "debugOn", "dbg", "dbgWarn",
    "players", "inGame", "spectators", "specNames", "specRoster", "hostSpec", "playerCount", "selectedRoles",
    "initialRoles", "currentRoles", "center", "center0", "transformFrom", "centerTransformFrom", "coDeck", "votes", "nightSels", "morningReveals", "deadIds", "ghostLog", "nightResolved", "dbgVotes", "dbgFoxVotes", "nightResults",
    "coBoard", "tfLines", "tfPairs", "chatLog", "deathNotes", "coState", "nightLogsAll", "dayLogsAll", "infoDay", "cpuClaims", "tmQueue", "roleTrail", "centerTrail", "cards", "morningAct", "morningDone", "morningAck", "loveTargets", "freeterTargets", "freeterHist", "freeterCutSeen", "visitorTargets", "pureLoverTargets", "akujoHonmei", "akujoKeep", "cupidPair", "breakerTargets", "keyTargets", "watchdogOwners", "keyLocks", "keyActs", "keyLog", "keyFails", "brokenKeys", "breakerShow", "breakerSuccess", "breakerSeen", "breakerBelief", "breakerApplied", "breakerSettle", "shufflerMarks", "shufflerStamp", "shufflerSettle", "shufflerTold", "loveLostD", "cupidSeen", "cupidTold", "cupidSettle", "akujoSeen", "akujoTold", "evilSettle", "fanaticConv", "fanaticLocked", "madPending", "madSettleIds", "madChainSettle", "madLate", "fanFollowPending", "foxVote", "foxInspected", "foxCursed", "foxPending", "foxSettleIds", "deadKind", "deadBy", "deadStep", "pureLoverPairs", "pureLoverSeen", "pureLoverSettle", "pureLoverTold", "pureLoverNo", "pureLoverNoU", "pureLoverGen", "loveHist", "loveLast", "executed", "chainIds", "chainBy", "chainKind", "dogBites", "chainSub", "chainLate", "mentalIds", "shockIds", "chickenReverse", "catPicks", "catSources", "catInfo", "strawTargets", "strawAsk", "assassinTargets", "assassinList", "assassinResult", "bountyTargets", "bountyList", "bountyResult", "toughBounces", "toughBlocks", "kingGuards", "sheriffShots", "sheriffCatFix", "dictator",
    "masterPick", "masterCard", "cpuVotePlan", "cpuRealVote", "cpuInfo", "announced", "holdUntil", "remain", "settling", "promotedWolfIds", "queenSeen", "kingdomIds", "queenFallen", "eliminated", "winners", "winnerIds", "winTitle", "winDetail", "winTeams", "dealStart", "resultObj", "drunkCount", "drunkChance", "drunkOverlay", "drunkRevealed", "drunkSober", "soberLines", "loverCount", "loverChance", "loverOf", "servantMasters", "servantSubs", "servantNotified", "execTargets", "gremlinPicks", "newsRoles", "newsLines", "newsAnnounced", "mapoAnnounced", "observeLog", "observerSeen", "exposeTargets", "exposeAnnounced", "exposeLines", "muzzleTargets", "muzzleNotified", "exchanges",
  ];
  /** 参加者としての画面にも同じ意味で入っている項目。ホストを引き継ぐ人は、自分が見ていた最新の値を優先する */
  const SHARED_KEYS = ["chatLog", "deathNotes", "remain", "settling", "dealStart", "debugOn", "roleCounts", "villageSize", "cpuCount", "graveCount", "seerGraveCount", "mayorVoteCount", "timers", "fakeWolfWhenNoWolf", "revealTransforms", "transformCandidates", "transformOff", "cpuNames"];
  /** ホストをやめて参加者に戻るとき、消す項目（参加者の画面では使わないもの） */
  const HOST_ONLY_KEYS = [
    "players", "inGame", "spectators", "specNames", "specRoster", "hostSpec", "initialRoles", "currentRoles", "center", "center0", "transformFrom", "centerTransformFrom", "coDeck", "votes", "nightSels", "morningReveals", "deadIds",
    "nightResolved", "dbgVotes", "dbgFoxVotes", "nightResults", "coBoard", "tfLines", "tfPairs", "coState", "nightLogsAll", "dayLogsAll", "infoDay", "cpuClaims", "tmQueue", "roleTrail", "centerTrail", "cards", "morningAct", "morningDone", "morningAck", "loveTargets", "freeterTargets", "freeterHist", "freeterCutSeen", "visitorTargets", "pureLoverTargets", "akujoHonmei", "akujoKeep", "cupidPair", "breakerTargets", "keyTargets", "watchdogOwners", "keyLocks", "keyActs", "keyLog", "keyFails", "brokenKeys", "breakerShow", "breakerSuccess", "breakerSeen", "breakerBelief", "breakerApplied", "breakerSettle", "shufflerMarks", "shufflerStamp", "shufflerSettle", "shufflerTold", "loveLostD", "cupidSeen", "cupidTold", "cupidSettle", "akujoSeen", "akujoTold", "evilSettle", "fanaticConv", "fanaticLocked", "madPending", "madSettleIds", "madChainSettle", "madLate", "fanFollowPending", "foxVote", "foxInspected", "foxCursed", "foxPending", "foxSettleIds", "deadKind", "deadBy", "deadStep", "pureLoverPairs", "pureLoverSeen", "pureLoverSettle", "pureLoverTold", "pureLoverNo", "pureLoverNoU", "pureLoverGen", "loveHist", "loveLast",
    "executed", "chainIds", "chainBy", "chainKind", "dogBites", "chainSub", "chainLate", "mentalIds", "shockIds", "chickenReverse", "catPicks", "catSources", "catInfo", "strawTargets", "strawAsk", "assassinTargets", "assassinList", "assassinResult", "bountyTargets", "bountyList", "bountyResult", "toughBounces", "toughBlocks", "kingGuards", "sheriffShots", "sheriffCatFix", "dictator", "masterPick", "masterCard", "cpuVotePlan", "cpuRealVote", "cpuInfo", "announced", "holdUntil", "promotedWolfIds", "queenSeen", "kingdomIds", "queenFallen", "eliminated", "winners", "winnerIds", "winTitle", "winDetail", "winTeams", "resultObj", "dbg", "dbgWarn", "loverOf", "servantMasters", "servantSubs", "servantNotified", "execTargets", "gremlinPicks", "newsRoles", "newsLines", "newsAnnounced", "mapoAnnounced", "observeLog", "observerSeen", "exposeTargets", "exposeAnnounced", "exposeLines", "exchanges",
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
    { const g0 = G(); if (g0) { g0.result = null; g0.viewResult = false; } }   // 部屋を出たら前回の結果も消す（別の部屋に「前回の結果を見る」が残らないように）
    if (opt && opt.forget) clearLocalSnap();   // 自分から退出したときだけ、端末内の引き継ぎ記録も消す
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
  // ホスト端末の中にも進行状態を保存しておく（一人でCPUとデバッグしているときなど、後継者がいなくて接続が切れても / ページを開き直しても、CPUの情報・固定役・進行を引き継げる）
  const LOCAL_SNAP = "onw.hostSnap.v1", LOCAL_SNAP_MAX_MS = 12 * 3600 * 1000;
  function saveLocalSnap() {
    if (!net.isHost || net.frozen || !net.code) return;
    try { localStorage.setItem(LOCAL_SNAP, JSON.stringify({ code: net.code, seat: net.selfSeat, key: net.myKey, name: net.myName, at: Date.now(), snap: makeSnapshot() })); } catch (e) {}
  }
  const clearLocalSnap = () => { try { localStorage.removeItem(LOCAL_SNAP); } catch (e) {} };
  const loadLocalSnap = () => { try { const r = JSON.parse(localStorage.getItem(LOCAL_SNAP)); return r && r.snap && r.code && r.seat && r.key && Date.now() - r.at < LOCAL_SNAP_MAX_MS ? r : null; } catch (e) { return null; } };
  function flushSnap() {
    if (!net.isHost || net.frozen) return;
    saveLocalSnap();
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
    peer.on("close", () => {   // 合図用サーバーとの接続が完全に閉じた（つなぎ直しも効かない）: 同じ状態のまま、同じルームコードを取り直して続ける
      if (net.peer !== peer || !net.isHost) return;
      reviveHost(makeSnapshot(), net.gen, 0);
    });
    peer.on("error", (e) => {
      if (net.peer !== peer || !net.isHost) return;
      if (e.type === "unavailable-id") {
        // 切れている間に別の人がルームを引き継いだ → 参加者として戻る。
        // ただし、他に人間の参加者がいない（一人でCPUとデバッグしているなど）なら引き継ぐ人はいない。
        // 参加者として戻ると初期状態（ロビー・CPUなし）に戻されてしまうので、状態を保ったまま同じコードを取り直す
        const others = G().players.some((p) => !p.isCpu && p.id !== net.selfSeat) || (net.order && net.order.length);
        if (others) demoteToClient();
        else { net.peer = null; try { peer.destroy(); } catch (x) {} reviveHost(makeSnapshot(), net.gen, 0); }
      }
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
    if (g.inGame && g.phase === PH().ONLINE_VOTE && g.strawAsk && g.strawAsk[seat]) { clearTimeout(askDrop[seat]); askDrop[seat] = setTimeout(() => autoAsk(seat), ASK_GRACE_MS); }   // 選んでいる最中に切れた: 少し待って、戻らなければ自動
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
    if (g.inGame && g.strawAsk && g.strawAsk[seat]) autoAsk(seat);   // 選んでいる最中に退出: その場で自動
    if (!g.inGame) removeSeat(seat); else { pushOrder(); scheduleSnap(); }
  }

  // ---------------------------------------------------------------------
  // 再入室した人へ、いまの画面を作り直すためのメッセージ（試合中）
  // ---------------------------------------------------------------------
  function resyncMsgs(seat, phOverride) {
    const g = G(), P = PH(), p = g.players.find((q) => q.id === seat), ph = phOverride || g.phase, m = [];   // phOverride: 結果画面の「情報確認」用に、結果発表の時点の内容を作る
    if (!p) return m;
    m.push(roleMsg(p));
    if (ph !== P.ONLINE_ROLE) m.push({ ...nightMsg(p), sel: (g.nightSels || {})[seat] || null });
    if ([P.ONLINE_MORNING, P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) {
      const inMorning = ph === P.ONLINE_MORNING;
      m.push({ t: "morning", logs: [...((g.nightResults || {})[seat] || []), ...(((g.morningAck || {})[seat]) || [])], reveal: inMorning ? ((g.morningReveals || {})[seat] || null) : null, insom: null, chain: (g.morningAct || {})[seat] || null, chainDone: !!(g.morningDone || {})[seat], quiet: !inMorning });
      if (g.settling || !inMorning) m.push({ ...settleMsg(Object.assign(RC(), { tmp: {} }), p, "resync"), quiet: !inMorning });
      if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) ONW.roleHooks("resyncDay").forEach((h) => m.push(...(h.fn(RC(), seat) || [])));   // 再入室: パン屋・新聞は、バナー/紙は出さず情報確認にだけ反映
    }
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) m.push({ t: "day", resync: true, myCo: (g.coState || {})[seat] || null });
    if ([P.ONLINE_DAY, P.ONLINE_VOTE].includes(ph)) { const ex = (g.exchanges || []).find((e) => e.by === seat); if (ex) m.push({ t: "exchdone", a: nameOf(ex.a), b: nameOf(ex.b) }); { const sh = (g.sheriffShots || []).find((e) => e.by === seat); if (sh) m.push({ t: "sheriffdone", text: ONW.sheriff.shotText(nameOf(sh.target)) }); } }   // 再入室: 交換者本人に「交換しました」を戻す
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph) && g.drunkRevealed && g.drunkRevealed[seat]) m.push({ t: "sober", role: ONW.shownRole(g.currentRoles[seat]), lines: (g.soberLines || {})[seat] || [], quiet: true });   // 再入室: 酔いが覚めたあとの状態を戻す
    if (isDead(seat)) m.push({ t: "dead", v: true, log: g.ghostLog });
    if (ph === P.ONLINE_VOTE) m.push({ t: "vote_start", my: (g.votes || {})[seat] || null, forced: !!(g[dbgKey(g)] || {})[seat], fox: !!(g.foxVote && g.foxVote.active), dictator: !!g.dictator });   // dictator: 独裁処刑の結果待ち（再入室しても投票画面にしない）
    if (ph === P.ONLINE_VOTE && g.foxVote && g.foxVote.view) m.push({ t: "foxvote", view: g.foxVote.view, quiet: !g.foxVote.wait });   // 再入室: 妖狐投票の結果（発表中なら発表中のまま）
    if (ph === P.ONLINE_RESULT && g.resultObj) m.push({ t: "result", result: g.resultObj, ghost: g.ghostLog || [] });
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph) && (g.deathNotes || []).length) m.push({ t: "deathnote", lines: g.deathNotes });   // 再入室: 死亡の知らせを情報確認へ戻す
    if ([P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(ph)) { m.push({ t: "chatlog", log: g.chatLog || [] }); m.push({ t: "coboard", board: boardView(), tf: tfView() }); }
    if (ph === P.ONLINE_VOTE && chainAsking()) {   // 道連れ・暗殺を選んでいる最中: 本人には選択を出し直し、全員に待ち表示を送る
      if (g.strawAsk[seat]) { clearTimeout(askDrop[seat]); m.push(askMsg(seat)); }
      m.push(askWaitMsg(seat));
    }
    if (ph !== P.ONLINE_RESULT && Number.isFinite(g.remain)) m.push({ t: "tick", sec: g.remain });
    return m;
  }

  // ---------------------------------------------------------------------
  // ホストを引き継ぐ / 手放す
  // ---------------------------------------------------------------------
  /** スナップショットを受け取って、この端末が新しいホストになる（peer は onww-XXXX を取れた状態） */
  function becomeHost(peer, snapStr, restore) {
    const g = G();
    let s;
    try { s = JSON.parse(snapStr); } catch (e) { return false; }
    if (!s || !s.g || s.code !== net.code || !net.selfSeat) return false;
    const own = {};
    if (!restore) SHARED_KEYS.forEach((k) => { if (g[k] !== undefined && g[k] !== null) own[k] = g[k]; });   // 復元のときは、保存しておいた値をそのまま使う（開き直した直後の初期値で上書きしない）
    Object.assign(g, s.g, own);
    net.peer = peer; net.isHost = true; net.hostConn = null; net.hostSeat = net.selfSeat; net.code = s.code;
    net.conns = {}; net.rx = {}; net.keys = s.keys || {}; net.meta = s.meta || {}; net.origHost = s.origHost || null;
    net.rec = null; net.xfer = null; net.frozen = false; net.snapStr = ""; net.snapPlanned = false; net.order = []; lastOrder = "";
    connSeat.clear();
    net.keys[net.selfSeat] = net.myKey; net.meta[net.selfSeat] = ONW.account.me();
    const oldHost = s.hostSeat;
    g.hostSpec = restore ? !!s.g.hostSpec : false;    // 引き継いだ人は参加者（試合中の観戦席は後継者にならない）。同じ席で復元するときは、観戦ホストならそのまま
    g.players.forEach((p) => {
      if (p.isCpu) return;
      if (p.id === net.selfSeat) p.status = "host";
      else if (p.id === oldHost && p.status === "host") p.status = g.inGame ? "playing" : "waiting";
    });
    if (g.inGame) { try { clearTimers(); } catch (e) {} if (s.gphase) g.phase = s.gphase; }   // 古い時計・CPU発言・昼の開始待ちを、null にするだけでなく実際に止める（残すと二重に動く）
    else {                                            // ロビー: みんなが戻ってくるまで待ち、戻らなかった席は少ししたら外す
      g.phase = PH().LOBBY;
      g.players.forEach((p) => { if (!p.isCpu && p.id !== net.selfSeat) { p.off = true; dropTimers[p.id] = setTimeout(() => removeSeat(p.id), LOBBY_GRACE_MS); } });
    }
    banner(null);
    startHosting(peer);
    if (ONW.account && ONW.account.roomSave) ONW.account.roomSave(net.code, net.selfSeat, net.myKey);
    resumeTimers(s);
    if (!g.inGame) broadcastLobby(); else { if (restore) resyncSelf(); rerender(); }
    return true;
  }
  /** ホスト自身の画面を作り直す（ページを開き直して同じ席のホストに戻ったとき）。
   *  進行状態(AUTH_KEYS)は復元されても、自分の画面用の状態（CPUを含む投票先の一覧 others・自分の役職・夜の記録・投票画面・結果など）は
   *  開き直した直後は空のまま。参加者が再入室したときと同じ resyncMsgs を、自分の席にも届けて作り直す */
  function resyncSelf() {
    const g = G(), seat = net.selfSeat;
    if (!net.isHost || !g.inGame || !seat) return;
    let msgs = [];
    if (g.hostSpec) msgs = [{ t: "spectate", phase: g.phase, log: g.chatLog, ghost: g.ghostLog || [], remain: g.remain, board: boardView(), tf: tfView(), dbg: !!g.debugOn }, specInfoMsg()];   // 観戦ホスト: 観戦席が再入室したときと同じ
    else if (g.players.some((p) => !p.isCpu && p.id === seat)) msgs = resyncMsgs(seat);
    if (msgs.length) onMsg({ t: "batch", msgs });
  }
  net.resyncSelf = resyncSelf;   // テスト用に公開
  net.resumeTimers = resumeTimers;   // テスト用に公開
  net.makeSnapshot = makeSnapshot; net.becomeHost = becomeHost;   // テスト用に公開（再接続・復元の検証で、保存→復元を直接動かす）
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
      else { startTimer(remain, toVote, dayTick); if (remain <= 20) announceVotes(); cpuSheriff(); resumeCpuTalk(); }   // CPUの保安官の「撃つ」予約は古いホストのメモリにあったので、引き継いだ側で取り直す（使用済み・死亡は canUse が見る。撃つ予約は二重にならない: hostSheriff が1日1回を見る）
    }
    else if (ph === P.ONLINE_VOTE) {
      if (chainAsking()) Object.keys(g.strawAsk).forEach((id) => { if (id !== net.selfSeat) { clearTimeout(askDrop[id]); askDrop[id] = setTimeout(() => autoAsk(id), g.strawAsk[id].cpu ? CPU_THINK_MS : ASK_GRACE_MS); } });   // 選んでいる最中の引き継ぎ（CPUは2秒で選ぶ）: 選んでいた人が戻ってくるのを待つ（タイマーは動かさない）
      else { castMissingCpuVotes(); startTimer(remain, finishVoting); }   // 考え中だったCPUの票は、引き継いだ時点で入れる
    }
  }

  /** 昼の途中で引き継いだ・復元したとき: CPUの発言予定(cpuQueue)は引き継げないので、まだ一度も発言していない生きているCPUの分だけ作り直す（残り時間ずっと黙ったままにならないように） */
  function resumeCpuTalk() {
    const g = G();
    if (!net.isHost || g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return;
    const log = g.chatLog || [];
    const ids = g.players.filter((p) => p.isCpu && !isDead(p.id) && !log.some((c) => c.name === p.name || (typeof c.text === "string" && c.text.startsWith(p.name + ":")))).map((p) => p.id);
    if (ids.length) enqueue(ONW.cpu.plan(g, ids));
  }
  /** ホスト自身の接続が閉じたとき: 今の状態を保ったまま、同じコードで取り直してホストを続ける（CPU・固定役・進行はそのまま） */
  function reviveHost(snapStr, gen, n) {
    if (gen !== net.gen || !net.selfSeat) return;
    banner("接続が切れました。ルームを復元しています…", { cancel: false });
    tryRegister(net.code, (peer) => {
      if (gen !== net.gen) { if (peer) { try { peer.destroy(); } catch (e) {} } return; }
      if (peer && net.isHost) {
        // この端末はまだホストのまま（スマホで別アプリに切り替えて、合図用サーバーとの接続だけ落ちた場合など）:
        // ゲームの状態・時計・CPUの発言予定には触れず、接続の受け付けだけ新しい peer に載せ替える
        const old = net.peer;
        net.peer = peer;
        try { if (old && old !== peer) old.destroy(); } catch (e) {}
        banner(null);
        startHosting(peer);
        if (ONW.account && ONW.account.roomSave) ONW.account.roomSave(net.code, net.selfSeat, net.myKey);
        pushOrder();
        const g = G();
        if (!g.inGame) broadcastLobby(); else rerender();
        return;
      }
      if (peer && becomeHost(peer, snapStr, true)) return;
      if (peer) { try { peer.destroy(); } catch (e) {} }
      if (n >= 20) { banner("ルームを復元できませんでした。タイトルの「前回のルームを再開」から戻れます。", { cancel: true }); return; }
      setTimeout(() => reviveHost(snapStr, gen, n + 1), 2000);
    });
  }
  /** タイトル画面の「前回のルームを再開」: この端末に保存しておいた状態で、同じコードのホストとして戻る */
  net.resumeHost = function (onError) {
    const r = loadLocalSnap();
    if (!r || net.peer || net.rec) return;
    net.leave();
    net.onFail = onError; net.myName = r.name || "名無し"; net.myKey = r.key; net.selfSeat = r.seat; net.code = r.code;
    const gen = net.gen;
    const fail = () => { net.leave(); onError("ルームを復元できませんでした。しばらくしてからもう一度お試しください。"); };
    let n = 0;
    const go = () => {
      if (gen !== net.gen) return;
      banner(`ルーム ${r.code} を復元しています…`, { cancel: true });
      tryRegister(r.code, (peer) => {
        if (gen !== net.gen) { if (peer) { try { peer.destroy(); } catch (e) {} } return; }
        if (peer && becomeHost(peer, r.snap, true)) { net.hostResume = null; return; }
        if (peer) { try { peer.destroy(); } catch (e) {} }
        if (++n >= 15) return fail();   // 古い登録が合図用サーバーに残っている間は取れないので、少し待って取り直す
        setTimeout(go, 2000);
      });
    };
    go();
  };
  net.checkLocalHost = function () {
    const A = ONW.account;
    // ログインの有無にかかわらず、自分から退出しない限り（結果発表まで終わっていても）端末に残った記録から再開できる（記録は12時間で期限切れ）
    const r = net.peer || net.rec ? null : loadLocalSnap();
    net.hostResume = r ? { code: r.code, at: r.at } : null;
  };

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
  /** ルームのホストがいるか確かめる（参加はしない）。"alive" = いる / "gone" = いない / "unknown" = 通信できず判断できない */
  function probeRoom(code) {
    return new Promise((resolve) => {
      let peer = null, done = false;
      const fin = (v) => { if (done) return; done = true; clearTimeout(to); try { if (peer) peer.destroy(); } catch (e) {} resolve(v); };
      const to = setTimeout(() => fin("unknown"), 9000);
      try {
        peer = new Peer();
        peer.on("error", (e) => fin(e && e.type === "peer-unavailable" ? "gone" : "unknown"));
        peer.on("open", () => {
          const conn = peer.connect(PREFIX + code, { reliable: true });
          conn.on("open", () => fin("alive"));
          conn.on("error", () => fin("unknown"));
        });
      } catch (e) { fin("unknown"); }
    });
  }
  /** タイトル画面を開いたとき: 参加中のルームの記録があるか調べる（ログイン中のみ） */
  net.checkRejoin = async function () {
    net.checkLocalHost();   // ログインしていなくても、この端末で自分がホストだったルームがあれば「再開」を出す
    const A = ONW.account;
    if (!A || !A.user || !A.roomLoad || net.peer || net.rec) { net.rejoinInfo = null; if (!net.peer && !net.rec && G().phase === PH().TITLE) rerender(); return; }   // ログアウトしたら、再入室・再開のボタンもすぐ消す
    let row = null;
    net.rejoinInfo = null;   // 調べ終わるまでは出さない（前回調べた結果を残さない）
    try { if (net.forgetP) await net.forgetP; } catch (e) {}
    net.forgetP = null;
    if (net.peer || net.rec) return;
    try { row = await A.roomLoad(); } catch (e) {}
    if (net.peer || net.rec) return;
    // 記録があっても、ルーム自体がもう無い（アプリを強制終了したあとにホストも落ちた・全員退出した）ことがある。
    // 実際にそのルームがあるか確かめてから「参加中のルームがあります」を出す（無ければ記録を消す）
    if (row) {
      let st = await probeRoom(row.room_code);
      if (st === "gone") { await new Promise((r) => setTimeout(r, 2500)); if (net.peer || net.rec) return; st = await probeRoom(row.room_code); }   // ホスト交代の最中かもしれないので、少し待ってもう一度
      if (net.peer || net.rec) return;
      if (st === "gone") { try { await A.roomClear(); } catch (e) {} row = null; }
      else if (st !== "alive") row = null;   // 通信できず確かめられなかったときも出さない（記録は消さず、次にタイトルを開いたときに調べ直す）
    }
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
    if (!net.isHost || !["graveCount", "seerGraveCount", "mayorVoteCount", "cpuCount", "villageSize", "drunkCount", "drunkChance", "loverCount", "loverChance"].includes(key)) return;
    const g = G();
    if (key === "villageSize") { g.villageSize = Math.max(3, Math.min(10, (g.villageSize ?? 4) + delta)); fitVillage(); }
    else if (key === "cpuCount") { if (delta > 0 && occupied(g) >= g.villageSize) return; g.cpuCount = Math.max(0, Math.min(10, (g.cpuCount ?? 0) + delta)); }
    else if (key === "mayorVoteCount") g.mayorVoteCount = Math.max(2, Math.min(10, (g.mayorVoteCount ?? 2) + delta));   // メイヤーの投票数: 本家と同じ2〜10票
    else if (key === "drunkChance") g.drunkChance = Math.max(0, Math.min(100, (g.drunkChance ?? 100) + delta));
    else if (key === "drunkCount") g.drunkCount = Math.max(0, Math.min(g.villageSize || 10, (g.drunkCount || 0) + delta));
    else if (key === "loverChance") g.loverChance = Math.max(0, Math.min(100, (g.loverChance ?? 100) + delta));
    else if (key === "loverCount") g.loverCount = Math.max(0, Math.min(5, Math.floor((g.villageSize || 4) / 2), (g.loverCount || 0) + delta));   // 2人1組なので、村の人数の半分まで（最大5組）
    else g[key] = Math.max(0, Math.min(10, (g[key] ?? 2) + delta));
    persist(); broadcastLobby();
  };

  const TIMER_LIMITS = { deal: [0, 600], settle: [1, 60] };   // タイマー設定の下限・上限(秒)
  net.changeTimer = function (key, delta) {
    if (!net.isHost || G().timers[key] === undefined) return;
    const t = G().timers, lim = TIMER_LIMITS[key] || [5, 600];   // 役職配布は0秒まで・待機時間は1〜60秒（ほかは5〜600秒）
    t[key] = Math.max(lim[0], Math.min(lim[1], t[key] + delta));
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
    // 重複役職: 恋人（配役の枚数には数えず、2人1組でランダムな参加者(CPU含む)に重なる。酔っ払いと同じ人に重なることもある）
    // 組ごとに「恋人になる確率」で当たる。夜に相方のカードが❤️でめくれて、お互いが分かる
    g.loverOf = {};
    {
      // デバッグ: 指定した組を先に作る（確率は無視）。残りの組は、指定した人を除いたランダムな参加者から
      const maxPairs = Math.max(0, Math.min(g.loverCount || 0, 5, Math.floor(g.players.length / 2)));
      const fixedPairs = (ONW.debug ? ONW.debug.loverPairs(g) : []).filter((pr, i, all) => all.slice(0, i).every((q) => !q.includes(pr[0]) && !q.includes(pr[1]))).slice(0, 5);   // 指定した組は、恋人の組数の設定に関係なく全部できる
      fixedPairs.forEach(([a, b]) => { g.loverOf[a] = b; g.loverOf[b] = a; });
      const order = ONW.utils.shuffle(g.players.map((p) => p.id).filter((id) => !g.loverOf[id])), pairs = Math.max(0, maxPairs - fixedPairs.length);
      for (let i = 0; i < pairs; i++) {
        const a = order[i * 2], b = order[i * 2 + 1];
        if (!a || !b || !(Math.random() * 100 < (g.loverChance ?? 100))) continue;
        g.loverOf[a] = b; g.loverOf[b] = a;
      }
    }
    ONW.roles.dealRoles(g);   // 恋人を先に決める（闇鍋の破局師シナジーが「恋人がいるか」を見るため）
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
    // 重複役職: 酔っ払い（配役の枚数には数えず、ランダムな参加者(CPU含む)に重なる）
    g.drunkOverlay = {}; g.drunkRevealed = {}; g.drunkSober = false; g.soberLines = {};
    // 人数ぶんの枠それぞれが、酔う確率（%）で当たる（1人ごとの抽選）
    {
      const dn = Math.max(0, Math.min(g.drunkCount || 0, g.players.length));
      const forced = ONW.debug ? ONW.debug.drunkIds(g) : [];   // デバッグ: 酔っ払いにする人の指定（確率・人数の設定は無視して、指定した人は全員なる）
      forced.forEach((id) => { g.drunkOverlay[id] = true; });
      ONW.utils.shuffle(g.players.map((p) => p.id).filter((id) => !forced.includes(id))).slice(0, Math.max(0, dn - forced.length)).forEach((id) => { if (Math.random() * 100 < (g.drunkChance ?? 100)) g.drunkOverlay[id] = true; });
    }
    if (Object.keys(g.drunkOverlay).length) g.coDeck.push({ r: "drunk" });
    if (Object.keys(g.loverOf).length) g.coDeck.push({ r: "lover" });
    g.votes = {};
    g.nightSels = {}; g.morningReveals = {};
    if (g.allDeadSkip) clearTimeout(g.allDeadSkip);
    Object.assign(g, { allDeadSkip: null, dictator: null, exchanges: [], sheriffShots: [], sheriffCatFix: {}, deadStep: {}, toughBounces: [], toughBlocks: [], kingGuards: [], strawAsk: {}, deadIds: [], ghostLog: [], fanaticConv: {}, fanaticLocked: {}, madPending: [], madSettleIds: [], madChainSettle: [], madLate: [], fanFollowPending: [], foxVote: null, foxInspected: {}, foxCursed: [], foxPending: [], foxSettleIds: [], deadKind: {}, deadBy: {}, deathNotes: [], nightResolved: false, dbgVotes: {}, dbgFoxVotes: {}, nightResults: {}, coBoard: {}, tfLines: [], tfPairs: [], chatLog: [], coState: {}, nightLogsAll: [], dayLogsAll: [], infoDay: {}, newsRoles: [], newsLines: null, newsAnnounced: false, mapoAnnounced: false, observeLog: [], observerSeen: {}, exposeTargets: {}, exposeAnnounced: {}, exposeLines: [], muzzleTargets: {}, muzzleNotified: {}, cpuClaims: [], tmQueue: [], roleTrail: {}, centerTrail: {}, cards: null, morningAct: {}, morningDone: {}, loveTargets: {}, freeterTargets: {}, freeterHist: {}, freeterCutSeen: {}, visitorTargets: {}, pureLoverTargets: {}, akujoHonmei: {}, akujoKeep: {}, cupidPair: {}, breakerTargets: {}, keyTargets: {}, watchdogOwners: {}, keyLocks: {}, keyActs: {}, keyLog: [], keyFails: {}, brokenKeys: {}, breakerShow: {}, breakerSuccess: {}, breakerSeen: {}, breakerBelief: {}, breakerApplied: {}, breakerSettle: {}, shufflerMarks: {}, shufflerStamp: {}, shufflerSettle: {}, shufflerTold: {}, loveLostD: {}, cupidSeen: {}, cupidTold: {}, cupidSettle: {}, akujoSeen: {}, akujoTold: {}, evilSettle: {}, pureLoverPairs: [], pureLoverSeen: {}, pureLoverSettle: {}, pureLoverTold: {}, pureLoverNo: {}, pureLoverNoU: {}, pureLoverGen: {}, loveHist: {}, loveLast: {}, executed: [], servantSubs: [], chainIds: [], kingdomIds: [], queenFallen: [], queenSeen: {}, masterPick: null, masterCard: null, cpuQueue: [], cpuVotePlan: {}, cpuRealVote: {}, announced: false, holdUntil: 0, remain: null, morningAck: {}, resultObj: null });
    ONW.loverPairs(g).forEach(([a, b]) => g.nightLogsAll.push(`恋人 ${(g.players.find((q) => q.id === a) || {}).name} と ${(g.players.find((q) => q.id === b) || {}).name} が恋人になっていました。`));
    ONW.servantPairs(g).forEach(([a, b]) => g.nightLogsAll.push(`従者 ${(g.players.find((q) => q.id === a) || {}).name} のご主人は ${(g.players.find((q) => q.id === b) || {}).name} でした。`));   // 従者のご主人は、配布(ONW.roles.assignServants)のときに決まっている
    ONW.execPairs(g).forEach(([a, b]) => g.nightLogsAll.push(`処刑人 ${(g.players.find((q) => q.id === a) || {}).name} のターゲットは ${(g.players.find((q) => q.id === b) || {}).name} でした。`));   // 処刑人のターゲットも配布(ONW.roles.assignExecutioners)のときに決まっている
    clearTimers();
    g.spectators.forEach((id) => send(id, { t: "spectate", phase: PH().ONLINE_ROLE, log: [], ghost: [], remain: null, board: boardView(), tf: tfView(), dbg: !!g.debugOn }));
    startTimer(ONW.ui.dealDuration(g.center.length, g.players.length, ONW.loverPairs(g).length > 0) + (g.timers.deal ?? 5), toNight);   // 演出が終わって(タイマー設定「役職配布」の秒数・初期値5秒)後に自動で夜へ
    sendAll(roleMsg);
    sendSpecInfo();   // 観戦者・観戦ホストへ全員の役職を送る（roleメッセージのあとに送る）
  };

  /** 配役メッセージ（試合開始時と、再入室したときの両方で使う） */
  function roleMsg(p) {
    const g = G(), dr = !!(g.drunkOverlay && g.drunkOverlay[p.id]);   // 酔っ払い: 自分の役職は分からない（配られたカードは「酔っ払い」と表示される）
    return {
      t: "role", me: p.name, dbg: !!g.debugOn, role: dr ? "drunk" : ONW.shownRole(g.initialRoles[p.id]), graveCount: g.center.length, seerGraveCount: g.seerGraveCount, deck: g.coDeck, from: dr ? null : ONW.roles.shownFrom(g, g.transformFrom[p.id], g.initialRoles[p.id]), lover: !dr && !!ONW.loverMate(g, p.id), ds: g.dealStart,
      others: g.players.filter((q) => q.id !== p.id).map((q) => ({ id: q.id, name: q.name })),
    };
  }

  // ---- フェーズ進行（タイマーで自動。ホストの「スキップ」でも進める）----
  /** 夜の始まりに本人へ送る内容（夜の画面の説明・仲間の表示など）。再入室でも同じものを作り直す */
  /** 恋人: 夜の情報に「〇〇と恋人です」を足し、夜の始まりに相方のカードが❤️でめくれる演出の指示(love)を付ける。
   *  相方のカードが他の演出ですでに開く場合: 人狼の🐺なら🐺と❤️を上下に(mode: "wolf")、共有者・神の役職カードなら右上に丸いハート(mode: "badge")、それ以外は❤️だけ(mode: "solo") */
  function nightMsg(p) {
    const g = G(), m = nightMsgBase(p), mate = ONW.loverMate(g, p.id);
    if (!mate || ONW.hiddenDrunk(g, p.id)) return m;   // 酔っ払い（未覚醒）は恋人も分からない。覚めたときに分かる
    const mp = g.players.find((q) => q.id === mate);
    // 相方のカードが他の演出ですでに開く場合は、❤️だけ右上の丸いハートにする（従者のご主人と恋人の相方が同じ人のときも同じ）
    const mode = (m.cultWolves || []).includes(mate) ? "wolf" : ((m.masonMates || []).includes(mate) || (m.foxMates || []).includes(mate) || m.godPeek || (m.master && m.master.id === mate)) ? "badge" : "solo";
    return { ...m, loveText: `あなたは${mp ? mp.name : "?"}と恋人です。`, love: { id: mate, mode } };
  }
  function nightMsgBase(p) {
    const g = G();
    if (g.drunkOverlay && g.drunkOverlay[p.id]) {   // 酔っ払い: 夜の情報も能力もない（昼の議論時間の半分が過ぎると覚める）
      return { t: "night", text: "あなたは酔っ払っています。自分の役職も、夜の情報も、能力も分かりません。", text2: "議論時間の半分が過ぎて酔いが覚めると、その時点の最終的な役職が分かり、能力のある役職なら昼のうちに使えます。", lines: [], act: false };
    }
    // 役職ごとの夜の表示(仲間・墓地・ご主人など)は js/roles/<役職>.js の nightMsg が作る。役職に表示がなければ空の表示
    const r = g.initialRoles[p.id], d = ONW.roleDef(r);
    const msg = { t: "night", text: "", text2: "", lines: null, godPeek: null, bigGraves: null, cultWolves: null, masonMates: null, master: null, act: isActive(r) };
    if (d && d.nightMsg) Object.assign(msg, d.nightMsg(RC(), p, r));
    return msg;
  }
  function toNight() {
    const g = G();
    ONW.roleHooks("nightStart").forEach((h) => h.fn(RC()));   // 夜の始まりに自動で起きる能力（口封じの狂人の対象決めなど）。夜の画面を送る前に済ませる
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
  /** 墓荒らし・ドッペルゲンガーが「手にした役職」に応じて、朝に分かる夜の情報（夜の始まりに見えるはずの内容）を hold / rev に積む。
   *  opts.skipGrave: 交換した墓地の番号（その墓地は見えない。ドッペルゲンガーは墓地を動かさないので null）
   *  opts.both: 自分の役職カードと、交換した墓地のカードを同時に表にする（墓荒らし）。 opts.skipKey: 演出で重ねて開かないカード（ドッペルゲンガーが選んだ人）
   *  opts.via: 従者のログに出す「どこから手にしたか」 */
  function gotInfo(g, p, got, rev, opts) {
    const d = ONW.roleDef(got);
    if (d && d.got) d.got(RC(), p, got, rev, opts);   // 手にした役職ごとの情報は js/roles/<役職>.js の got。何も見えない役職は定義なし
  }
  /** 夜の終わり: 人間の選択を起床順に実行し、朝に見せる演出データ(morningReveals)を作る */
  function resolveNight(g, kind) {   // kind: NIGHT_STAGES のどれか（起床順に1段階ずつ呼ぶ）
    const humans = g.players.filter((p) => !p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]) && isActive(g.initialRoles[p.id]));
    const rev = g.morningReveals = g.morningReveals || {};
    if (kind === "seer") humans.forEach((p) => { if (!actDone(g, p.id)) hold(p.id, "夜の行動をしませんでした。"); });
    const c = Object.assign(RC(), { rev, selOf: (p) => g.nightSels[p.id] || { players: [], graves: [] }, eff: (p) => effRole(g, p.id) });
    // 各役職の夜の能力は js/roles/<役職>.js の night.resolve（同じ段階の中は night.order の順）
    ONW.roleNightSteps(kind).forEach((st) => humans.filter((p) => st.roles.includes(effRole(g, p.id))).forEach((p) => st.fn(c, p)));
  }

  function toMorning() {
    const g = G();
    // 夜の選択を起床順（占い → 墓荒らし → ドッペルゲンガー → シャッフラー → グレムリン → 怪盗 → いたずらっ子）に実行。各段階で人間 → CPU の順
    g.morningReveals = {}; g.morningAct = {}; g.morningDone = {}; g.morningAck = {}; g.settling = false;
    ONW.cpu.runNight(g, "init");
    NIGHT_STAGES.forEach((kind) => { resolveNight(g, kind); ONW.cpu.runNight(g, kind); ONW.roleHooks("stageEnd").forEach((h) => h.fn(RC(), kind)); });   // stageEnd: 人間もCPUも終わった段階の最後に呼ぶ（破局師の判定。処理順メモ参照）
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
  const SETTLE_SEC = 5;   // 待機時間の初期値(秒)。実際の秒数はタイマー設定 g.timers.settle
  // 待機時間・昼の通知(訪問者・フリーター・従者・女王・スター・パン屋・新聞配達員・後覚者)の中身は js/roles/<役職>.js のフック
  /** 待機時間に1人へ送る settle メッセージを、各役職の settleMsg フックから組み立てる。mode: "settle"(通常) | "resync"(再入室) */
  function settleMsg(c, p, mode) {
    const msg = { t: "settle", logs: [] };
    ONW.roleHooks("settleMsg").forEach((h) => {
      const r = h.fn(c, p, mode) || {};
      if (r.logs) msg.logs.push(...r.logs);
      Object.keys(r).forEach((k) => { if (k !== "logs") msg[k] = r[k]; });
    });
    return msg;
  }
  function toSettle() {
    const g = G();
    if (g.settling) return;
    g.settling = true;
    const c = Object.assign(RC(), { tmp: {} });   // tmp: この待機時間の間だけ役職フック同士で受け渡す一時データ(g には入れない)
    ONW.roleHooks("settlePre").forEach((h) => h.fn(c));    // 就職先・訪問先を決めきれなかった役職の補完、訪問されたCPUへの通知など
    ONW.cpu.afterNight(g);                  // CPUの後覚者もここで最終役職を知る
    ONW.roleHooks("settlePost").forEach((h) => h.fn(c));   // 従者通知・CPUの女王通知など
    sendAll((p) => settleMsg(c, p, "settle"));
    sendSpecInfo();
    startTimer(g.timers.settle ?? SETTLE_SEC, toDay);
  }
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
    // 変化公開の並び: 変化役(光の使徒 → 闇の化身 → 銀色の影)の順 → 変化役の基準順 → 変化後の役職の基準順(js/roleorder.js)。乱数は使わない
    list.sort((x, y) => (order[x.b] ?? 9) - (order[y.b] ?? 9) || ONW.roleRank(x.b) - ONW.roleRank(y.b) || ONW.roleRank(x.a) - ONW.roleRank(y.a));
    g.tfLines = list.map((e) => `${rn(e.b)} → ${rn(e.a)}`);
    g.tfPairs = list.map((e) => ({ b: e.b, a: e.a }));   // tfLines と同じ並び
    // 変化公開はチャットには流さず、プレイヤー一覧の下の欄(tfLines)にだけ出す
  }

  /** 変化公開の演出が終わってから、昼のタイマーとCPUの発言を始める */
  function beginDay() {
    const g = G();
    g.dayStartId = null; g.dayBegin = null;
    if (g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return;
    enqueue(ONW.cpu.plan(g));
    ONW.roleHooks("dayStart").forEach((h) => h.fn(RC()));   // パン屋: 昼タイマーが動き出す瞬間に「パンが焼けました」
    startTimer(g.timers.day, toVote, dayTick);
    if (g.timers.day <= 20) announceVotes();
    cpuSheriff();
  }
  /** CPUの保安官が、昼の途中で撃つ（5of6a）。撃つ相手は保安官ファイルの cpuPick（デバッグの事前指定は廃止。いま撃たせたいときは、デバッグの「昼能力」タブでリアルタイムに発動する）（確実に人外と分かっている人がいるときだけ）。
   *  撃つ時刻は議論時間の前半〜中盤にばらける。使えない（保安官でない・酔い中・死亡・使用済み・独裁中・相手が死亡）ときは hostSheriff の検証で何も起きない。beginDay と酔い覚めから呼ばれる */
  net.cpuSheriff = cpuSheriff;   // テスト用に公開
  function cpuSheriff() {
    const g = G();
    if (!net.isHost || !ONW.CPU_AUTO_DAY.sheriff) return;   // 基本、CPUは昼能力を勝手に使わない（ONW.CPU_AUTO_DAY）
    const pickFn = ONW.roleHook("sheriff", "cpuPick");
    g.players.filter((p) => p.isCpu).forEach((p) => {
      const decide = () => (pickFn ? pickFn(ONW.cpu.kit, g, p) : null);
      if (!ONW.sheriff.canUse(g, p.id) || !decide()) return;   // 撃てない・撃つ相手がいない CPU は予約しない
      const wait = CPU_THINK_MS + Math.floor(Math.random() * (g.timers.day || 60) * 500);   // 2秒〜 + 議論時間の半分までのどこか
      setTimeout(() => {
        const cur = G();
        if (cur !== g || g.phase !== PH().ONLINE_DAY || g.dictator || isDead(p.id)) return;
        const t = decide();
        if (t) hostSheriff(p.id, t);
      }, wait);
    });
  }
  /** 昼の毎秒の処理: 投票の予告と、酔い覚め（議論時間の半分が過ぎたとき） */
  function dayTick(remain) {
    const g = G();
    if (remain <= 20) announceVotes();
    if (!g.drunkSober && remain <= Math.floor(g.timers.day / 2)) { soberUp(); cpuSheriff(); }
  }

  /** 酔いが覚めた人が、最終的な役職に応じて受け取る情報（夜に仲間などを知る役職の分）。中身は js/roles/<役職>.js の soberLines */
  function soberInfoLines(g, id, fin) {
    const d = ONW.roleDef(fin);
    return d && d.soberLines ? d.soberLines(RC(), id, fin) : [];
  }
  /** 酔いが覚めた人に、夜の始まりと同じ「カードがめくれる」演出をさせるための情報（初期役職の時点で見える人・墓地）。文章は出さない。中身は js/roles/<役職>.js の soberPeek */
  function soberPeek(g, id, fin) {
    const d = ONW.roleDef(fin), pk = d && d.soberPeek ? d.soberPeek(RC(), id, fin) : null;
    return pk && Object.keys(pk).length ? pk : null;
  }
  // 昼のうちに役職が動いたときの通知(後覚者・女王・スター・新聞配達員・従者)。中身は js/roles/<役職>.js のフック
  const dayShift = (before) => ONW.roleHooks("dayShift").forEach((h) => h.fn(RC(), before));   // 昼に役職が入れ替わって後覚者が絡んだとき
  function dayCheck(before) {   // 昼のうちに新しくスター・女王が分かった人へ。before: 動く前の g.currentRoles
    const g = G();
    if (g.phase !== PH().ONLINE_DAY) return;
    ONW.roleHooks("dayCheck").forEach((h) => h.fn(RC(), before));
  }
  const dayNews = () => ONW.roleHooks("dayNews").forEach((h) => h.fn(RC()));       // 新聞配達員を手にした / 酔いが覚めたとき
  const dayNotice = () => ONW.roleHooks("dayNotice").forEach((h) => h.fn(RC()));   // 新しく従者通知が出る人へ
  /** 昼の議論時間の半分が過ぎた: 酔っ払いが覚め、その時点の最終役職を知る（能力のある役職なら昼のうちに1回使える） */
  function soberUp(only) {   // only: デバッグ用。指定した1人だけ今すぐ酔いを覚ます（タイマーの判定は進めない）
    const g = G();
    if (!only) g.drunkSober = true;
    if (g.phase !== PH().ONLINE_DAY) return;
    const ids = g.players.map((p) => p.id).filter((id) => ONW.hiddenDrunk(g, id) && !isDead(id) && (!only || id === only));
    if (!ids.length) return;
    pushChat(null, "誰かの酔いが覚めたようです。", "sys");
    ONW.roleHooks("soberJudge").forEach((h) => h.fn(RC(), ids));   // 破局師: 覚める人の中に破局師のカードがあれば、その時点の盤面で破局を判定（覚めた本人への💔は下の soberExtra）
    const cpuIds = [];
    ids.forEach((id) => {
      g.drunkRevealed[id] = true;
      const p = g.players.find((q) => q.id === id), fin = g.currentRoles[id], shown = ONW.shownRole(fin);
      const chain = isActive(fin) ? fin : null;   // 酔い覚めの最終役職がドッペルゲンガーでも、議論中に1回コピーできる
      if (p.isCpu) { cpuIds.push(id); return; }
      const mate = ONW.loverMate(g, id), mp = mate && g.players.find((q) => q.id === mate);
      const extras = ONW.roleHooks("soberExtra").map((h) => h.fn(RC(), id, fin) || {});   // 女王: 酔いが覚めた瞬間に、最終役職が村人陣営の人だけ、女王が誰か分かる
      const lines = [`酔いが覚めました。あなたの最終的な役職は「${rn(shown)}」です。`, ...soberInfoLines(g, id, fin), ...extras.flatMap((x) => x.lines || []), ...(mp ? [`あなたは${mp.name}と恋人です。`] : [])];
      if (chain) { g.morningAct[id] = chain; g.morningDone[id] = false; lines.push(`この能力を、議論中に1回だけ使えます。`); }
      g.soberLines[id] = [...lines];
      lines.forEach((t) => hold(id, t));
      const pk = soberPeek(g, id, fin) || {}; if (mp) pk.love = mate; extras.forEach((x) => Object.assign(pk, x.peek || {}));   // 女王: 酔い覚めの瞬間に、女王のカードが表になる   // 恋人: 自分と相方のカードがハートでめくれる
      send(id, { t: "sober", role: shown, lines, chain, peek: Object.keys(pk).length ? pk : null });
    });
    // スター・パン屋: 酔いが覚めた瞬間に全員へ公開（スターは全員の画面でカードがめくれて裏に戻る / パンは焼けた通知）
    ONW.roleHooks("soberReveal").forEach((h) => h.fn(RC(), ids));
    ONW.roleHooks("daySober").forEach((h) => h.fn(RC()));   // 酔いが覚めた村人陣営の人には女王が誰か、酔いが覚めた女王は村人陣営の全員に知らせる
    // 酔いが覚めたCPUは、2秒考えてから能力を使う（昼が終わって投票へ進むときは、待たずにその場で使う: flushCpuSober）
    if (cpuIds.length) {
      const runCpu = () => {
        const g = G();
        const before = { ...g.currentRoles };   // 酔い覚めの瞬間にスターを持っていた人は上で公開済み。ここから動いた分を下で公開する
        ONW.cpu.sober(g, cpuIds);
        ONW.roleHooks("cpuLateVisits").forEach((h) => h.fn(RC()));   // 酔いが覚めたCPUの訪問者が昼に訪問した: 訪問された人へも通知
        applyTroublemakers(g);
        dayShift(before);
        dayCheck(before);   // 酔い覚めCPUの能力でスター・女王が新しく分かった人
        enqueue(ONW.cpu.plan(g, cpuIds));
        soberTail();        // CPUの能力で新聞配達員を手にした / 従者通知が出せるようになった場合
      };
      const w = { g, run: runCpu, timer: null };
      w.timer = setTimeout(() => { cpuSoberWait = cpuSoberWait.filter((x) => x !== w); if (G() === g) runCpu(); }, CPU_THINK_MS);
      cpuSoberWait.push(w);
    }
    soberTail();
  }
  /** 酔い覚めのあとの共通の通知（新聞配達員の酔いが覚めた / 保留していた従者通知 / 観戦者への状況） */
  function soberTail() {
    dayNews();     // 新聞配達員の酔いが覚めた（CPUの酔い覚め後の能力で手にした場合も含む）: その瞬間に新聞が出る
    dayNotice();   // 酔いが覚めて、保留していた従者通知が出せるようになった人へ
    sendSpecInfo();
    rerender();
  }
  let cpuSoberWait = [];   // 2秒考えている最中の、酔い覚めCPUの能力 [{ g, run, timer }]
  /** 考え中の酔い覚めCPUの能力を、待たずに今すぐ使う（昼が終わって投票へ進むとき） */
  function flushCpuSober() {
    const list = cpuSoberWait; cpuSoberWait = [];
    list.forEach((w) => { clearTimeout(w.timer); if (G() === w.g && w.g.phase === PH().ONLINE_DAY) w.run(); });
  }
  function toDay() {
    const g = G();
    // 前のフェーズのタイマーが動いたままだと（ホストの「次へ」のスキップなど）、変化公開を待っている間も残り時間が減り、
    // 昼が始まった瞬間に満タンへ戻ってしまう。昼のタイマーは beginDay で始めるまで必ず止めておく
    stopTimer();
    if (g.dayStartId) { clearTimeout(g.dayStartId); g.dayStartId = null; g.dayBegin = null; }
    g.announced = false; g.holdUntil = 0; g.cpuQueue = [];
    sendAll({ t: "day" });
    ONW.roleHooks("dayCurse").forEach((h) => h.fn(RC()));   // 妖狐: 昼になった瞬間に呪殺（昼中死亡・後追い心中）
    sendSpec({ t: "specphase", phase: PH().ONLINE_DAY });
    sendSpecInfo();
    announceTransforms();
    sendBoard();
    if (g.allDeadSkip) return;   // 昼になった瞬間の呪殺・後追い・心中・王国滅亡で全員が死んだ: 議論も投票もせず結果発表へ（skipIfAllDead が予約済み）
    // 変化公開が出終わってから、昼のタイマーとCPUの発言を始める（その間、タイマーは満タンのまま止まる）
    // 新聞配達員: 変化公開の紙のあとに、新聞の紙で「昨夜動いた役職」を出す。両方が終わってから昼のタイマーを始める
    let newsWait = 0;
    ONW.roleHooks("dayAnnounce").forEach((h) => { newsWait += h.fn(RC()) || 0; });   // 新聞配達員: 新聞の紙を出し、出終わるまでの待ち時間を返す
    const wait = (g.revealTransforms && ONW.stage && ONW.stage.paperMs ? ONW.stage.paperMs(g.tfLines) : 0) + newsWait;
    const begin = beginDay;
    if (wait > 0) {
      g.remain = g.timers.day; sendAll({ t: "tick", sec: g.remain }); sendSpec({ t: "tick", sec: g.remain });
      g.dayBegin = begin;
      g.dayStartId = setTimeout(begin, wait);
    } else begin();
  }

  function toVote() { flushCpuSober(); beginVote(false); }
  /** 投票を始める。second: 妖狐投票のあとの本投票（もう妖狐投票は行わない）。生きている妖狐がいれば、先に妖狐投票（本投票と同じやり方・追放されるのは最多得票の妖狐だけ） */
  function beginVote(second) {
    const g = G();
    if (g.allDeadSkip) return;   // 全員死亡で結果発表へ向かっている
    clearTimers();
    g.votes = {};
    if (!second) g.foxVote = ONW.foxVote.needed(g) ? { active: true, completed: false } : null;
    const fox = !!(g.foxVote && g.foxVote.active);
    // デバッグで投票先を指定されたCPUはすぐ入れる。指定されていないCPUは、2秒考えてから入れる
    g.players.filter((p) => p.isCpu && !isDead(p.id)).forEach((p) => { if (g.debugOn && (g[dbgKey(g)] || {})[p.id]) castCpuVote(p); else scheduleCpuVote(p); });
    const forced = applyDebugVotes();
    sendAll({ t: "vote_start", fox });
    sendSpec({ t: "specphase", phase: PH().ONLINE_VOTE });
    sendSpecInfo();
    forced.forEach((id) => send(id, { t: "forcevote", v: true }));
    startTimer(g.timers.vote, finishVoting);
    if (forced.length && Object.keys(g.votes).length === g.players.length) finishVoting();
  }

  // ---- CPUの投票: 指定がなければ2秒考えてから入れる ----
  const cpuVoteWait = {};   // 席ID → タイマー（考えている最中のCPU）
  /** CPUが今すぐ票を入れる（まだ入れていない・生きているときだけ） */
  function castCpuVote(p) {
    const g = G();
    if (isDead(p.id) || g.votes[p.id]) return;
    const fox = !!(g.foxVote && g.foxVote.active);
    const t = fox ? ONW.foxVote.cpuTarget(g, p) : ONW.cpu.announceVote(g, p).target;
    if (t && !isDead(t)) g.votes[p.id] = t;
  }
  function scheduleCpuVote(p) {
    const g = G();
    clearTimeout(cpuVoteWait[p.id]);
    cpuVoteWait[p.id] = setTimeout(() => {
      delete cpuVoteWait[p.id];
      if (G() !== g || g.phase !== PH().ONLINE_VOTE) return;
      castCpuVote(p);
      sendSpecInfo(); rerender();
      if (g.debugOn && Object.keys(g[dbgKey(g)] || {}).length && Object.keys(g.votes).length === g.players.length) finishVoting();   // 指定した票がそろったらそのまま結果へ（デバッグの今までの動き）
    }, CPU_THINK_MS);
  }
  /** 考え中のCPUの票を、待たずに今すぐ入れる（投票を終わらせるとき） */
  function flushCpuVotes() {
    const g = G();
    Object.keys(cpuVoteWait).forEach((id) => { clearTimeout(cpuVoteWait[id]); delete cpuVoteWait[id]; const p = g.players.find((q) => q.id === id); if (p) castCpuVote(p); });
  }
  /** まだ票のない生きているCPUに、今すぐ入れる（ホスト交代で、考え中の票が消えたとき） */
  function castMissingCpuVotes() { const g = G(); g.players.forEach((p) => { if (p.isCpu && !g.votes[p.id]) castCpuVote(p); }); }

  // ---- デバッグ: 投票先の指定（ホストのみ・debug.js から呼ぶ）----
  /** 指定した票の入れ物。妖狐投票の最中は g.dbgFoxVotes、通常投票は g.dbgVotes（妖狐がいるときだけ、妖狐投票と通常投票で別々に指定できる。
   *  今後、魔界公爵追放会議など投票が増えたら、ここに入れ物を足す） */
  function dbgKey(g) { return g.foxVote && g.foxVote.active ? "dbgFoxVotes" : "dbgVotes"; }
  /** 投票開始時に、指定済みの票を入れる。戻り値: 指定された人間のID */
  function applyDebugVotes() {
    const g = G(), ids = [];
    if (!g.debugOn) return ids;
    Object.entries(g[dbgKey(g)] || {}).forEach(([vid, tid]) => {
      const v = g.players.find((p) => p.id === vid);
      if (!v || vid === tid || !g.players.some((p) => p.id === tid)) return;
      g.votes[vid] = tid;
      if (!v.isCpu) ids.push(vid);
    });
    return ids;
  }
  /** デバッグモード: ホストが酔っ払いのカードをダブルタップしたとき、その人だけ即座に酔いが覚める */
  net.debugSober = function (id) {
    const g = G();
    if (!net.isHost || !g.debugOn || g.phase !== PH().ONLINE_DAY || !ONW.hiddenDrunk(g, id)) return false;
    soberUp(id);
    return true;
  };
  /** fox が true なら妖狐投票の指定、そうでなければ通常投票の指定。いま行われている投票と同じ種類のときだけ、その場で票に反映する */
  net.debugVote = function (vid, tid, fox) {
    const g = G();
    if (!net.isHost || !g.debugOn || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return;
    const v = g.players.find((p) => p.id === vid);
    if (!v) return;
    fox = !!fox;
    const key = fox ? "dbgFoxVotes" : "dbgVotes", map = (g[key] = g[key] || {});
    const foxNow = !!(g.foxVote && g.foxVote.active);
    const voting = g.phase === PH().ONLINE_VOTE && fox === foxNow && !(g.foxVote && g.foxVote.wait), was = !!map[vid];
    if (tid && tid !== vid && g.players.some((p) => p.id === tid)) {
      map[vid] = tid;
      if (voting) { clearTimeout(cpuVoteWait[vid]); delete cpuVoteWait[vid]; }   // 指定されたので、考え中の票は取り消す
      if (!fox && v.isCpu) { g.cpuVotePlan = g.cpuVotePlan || {}; g.cpuVotePlan[vid] = tid; (g.cpuRealVote = g.cpuRealVote || {})[vid] = tid; }
      if (voting) { g.votes[vid] = tid; if (!v.isCpu) send(vid, { t: "forcevote", v: true }); }
    } else {
      delete map[vid];
      if (!fox && v.isCpu) { if (g.cpuVotePlan) delete g.cpuVotePlan[vid]; if (g.cpuRealVote) delete g.cpuRealVote[vid]; }
      if (v.isCpu) { if (voting) { delete g.votes[vid]; scheduleCpuVote(v); } }
      else if (voting && was) { delete g.votes[vid]; send(vid, { t: "forcevote", v: false }); }
    }
    if (voting && Object.keys(g.votes).length === g.players.length) finishVoting(); else rerender();
  };
  net.debugVoteAll = function (tid, fox) { G().players.forEach((p) => { if (p.id !== tid) net.debugVote(p.id, tid, fox); }); };
  net.debugVoteClearAll = function (fox) { Object.keys(G()[fox ? "dbgFoxVotes" : "dbgVotes"] || {}).forEach((id) => net.debugVote(id, null, fox)); };
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
    else if (g.phase === PH().ONLINE_VOTE) { if (chainAsking()) Object.keys(g.strawAsk).forEach(autoAsk); else finishVoting(); }   // 道連れ・暗殺を選んでいる最中のスキップ: 選んでいる人をランダムで進める
    else if (g.phase === PH().ONLINE_RESULT) net.returnToRoom();
  };

  // ---- 本人の操作 ----
  /** 朝に能力を使う（墓荒らしが交換した後の役職）。選んだ内容を送ると、その場で結果が返る */
  net.morningUse = function () {
    const g = G(), sel = g.nightSel || { players: [], graves: [] };
    if (!g.morningChain || g.morningChainDone || !selComplete(g.morningChain, sel)) return;
    if (g.phase === PH().ONLINE_MORNING && g.settling) return;   // 待機時間は受け付けられない（昼の議論中に使う）
    const msg = { t: "act", kind: "mchain", sel: { players: [...sel.players], graves: [...sel.graves] } };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  /** 夜の選択を送る（朝まで何度でも変更できる）。sel: { players: [id...], graves: [index...] } */
  net.setSel = function (sel) {
    const msg = { t: "act", kind: "sel", sel: { players: [...(sel.players || [])], graves: [...(sel.graves || [])] } };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };

  /** 独裁者: 昼能力ボタンを押した（使える人だけ、ホストから dictok が返ってカード選択が開く） */
  net.dictOpen = function () {
    const msg = { t: "act", kind: "dictopen" };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  /** 独裁者: 選んだ相手を独裁処刑にする（確定） */
  /** フリーター: 再就職先を選んで確定（昼能力） */
  net.rejob = function (target) {
    const msg = { t: "act", kind: "rejob", target };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  /** 交換者: 選んだ2人の票数を入れ替える（確定） */
  net.exchange = function (a, b) {
    const msg = { t: "act", kind: "exchange", a, b };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  /** 保安官: 選んだ相手を撃つ（確定。昼に1回だけ。取り消せない） */
  net.shoot = function (target) {
    const msg = { t: "act", kind: "shoot", target };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };
  net.dictate = function (target) {
    const msg = { t: "act", kind: "dictate", target };
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };

  net.sendChat = function (text) {
    text = String(text || "").trim();
    if (!text) return;
    if (G().muzzled) return;   // 口封じされている人は発言できない
    const msg = { t: net.canGhost() ? "ghost" : "chat", text };   // 観戦者・死亡者の発言は霊界チャットへ
    if (net.isHost) hostRecv(net.selfSeat, msg); else net.hostConn && net.hostConn.send(msg);
  };

  net.sendCo = function (text, claim, setRole, flag, short) {
    if (G().muzzled) return;   // 口封じされている人はCO・結果開示ができない
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

    // 独裁者の昼能力: 押したとき(dictopen)に本人だけ「使える」と返す（使えない人には何も返さない = 押しても何も起きない） / 確定したとき(dictate)に独裁処刑を宣言する
    if (d.t === "act" && d.kind === "dictopen") {   // 昼能力ボタン: 独裁者(dictok) / 再就職できるフリーター(rejobok) にだけ返す。どちらでもない人には何も返さない
      if (g.phase === PH().ONLINE_DAY && byId(id)) { if (ONW.dictator.canUse(g, id)) send(id, { t: "dictok", on: true }); else if (ONW.exchanger.canUse(g, id)) send(id, { t: "exchok", on: true }); else if (ONW.sheriff.canUse(g, id)) send(id, { t: "sheriffok", on: true }); else if (ONW.freeter.canRejob(g, id)) send(id, { t: "rejobok", on: true }); }
      return;
    }
    if (d.t === "act" && d.kind === "rejob") { if (byId(id)) hostRejob(id, d.target); return; }
    if (d.t === "act" && d.kind === "dictate") { if (byId(id)) hostDictate(id, d.target); return; }
    if (d.t === "act" && d.kind === "exchange") { if (byId(id)) hostExchange(id, d.a, d.b); return; }
    if (d.t === "act" && d.kind === "shoot") { if (byId(id)) hostSheriff(id, d.target); return; }

    if (d.t === "act" && d.kind === "mchain" && ((g.phase === PH().ONLINE_MORNING && !g.settling) || g.phase === PH().ONLINE_DAY) && g.morningAct[id] && !g.morningDone[id] && byId(id)) {
      // 朝に使う能力（墓荒らしが交換した後の役職）: 選んだ瞬間に実行して結果を返す。朝の時点の実際のカードを見る・動かす
      const before = { ...g.currentRoles };
      const me = byId(id), ar = g.morningAct[id], sel = d.sel || {}, label = rn(ar);
      const selfOk = !!((ONW.roleDef(ar) || {}).stagePick || {}).self;   // シャッフラーは自分も選べる（stagePick.self）
      const okP = (x) => typeof x === "string" && (x !== id || selfOk) && !!byId(x);
      const okG = (x) => Number.isInteger(x) && x >= 0 && x < g.center.length;
      const players = [...new Set((sel.players || []).filter(okP))], graves = [...new Set((sel.graves || []).filter(okG))];
      // 能力の中身は js/roles/<役職>.js の morning.run（結果の文章・演出・次に使える能力を返す。選択が足りなければ null）
      const mc = (ONW.roleDef(ar) || {}).morning, c = Object.assign(RC(), { id, me, ar, sel, label, players, graves });
      const res = mc && mc.run ? mc.run(c) : null;
      if (!res || !res.lines) return;
      if (g.phase === PH().ONLINE_MORNING && !res.failed) { ONW.newsNote(g, ar); ONW.observeNote(g, id, players, graves); }   // 鍵師のロックで失敗した能力は載らない   // 朝のうちに使った能力も新聞に載る（昼に酔いが覚めてからの能力は載らない）
      g.morningDone[id] = true;
      if (mc.after && !res.failed) mc.after(c, res);   // 昼に墓地と交換した先の役職にも能力があれば、続けて1回使える（墓荒らし・ドッペルゲンガー）
      const lines = res.lines, reveal = res.reveal || null, nextChain = res.nextChain || null;
      if (reveal && g.currentRoles[id] === ONW.ROLE.MUZZLE_MADMAN && before[id] !== ONW.ROLE.MUZZLE_MADMAN && !ONW.hiddenDrunk(g, id)) reveal.muzzle = ONW.muzzle.assign(g, id);   // 朝のうちの連鎖(墓荒らし・ドッペル)で口封じの狂人を取ったとき: 取ったと分かったあと、ターゲットのカードがミュートマークでめくれる
      (g.morningAck = g.morningAck || {})[id] = lines;   // 再入室したときに朝の結果を復元するため
      if (g.phase === PH().ONLINE_DAY) { if (reveal) reveal.day = true; (g.soberLines[id] = g.soberLines[id] || []).push(...lines); }   // 昼に使った（酔いが覚めた人）: 演出なし、結果は文章だけ
      send(id, { t: "ack", done: true, lines, text: lines.join(" "), reveal, chain: nextChain, peek: (g.phase === PH().ONLINE_DAY && mc.peek && !res.failed) ? mc.peek(c) : null });
      if (g.phase === PH().ONLINE_DAY && mc.dayNotify) mc.dayNotify(c);   // 昼に就職・訪問: 相手の画面でも、その時点のカードが表になって、数秒後に閉じる（フリーター・訪問者）
      if (g.phase === PH().ONLINE_DAY) dayShift(before);   // 昼の入れ替えで後覚者が絡んだら、その場で後覚者の能力
      if (g.phase === PH().ONLINE_DAY) dayCheck(before);   // 昼の能力で新しくスター・女王が分かった人: カードが表になる
      if (g.phase === PH().ONLINE_DAY) dayNews();          // 昼の能力で新聞配達員を手にした: 新聞が出る
      if (g.phase === PH().ONLINE_DAY) dayNotice();        // 昼に墓荒らしが従者を引いた（新しいご主人が決まった）ときなど、ご主人へ従者通知
      sendSpecInfo();
      if (g.phase === PH().ONLINE_MORNING && !chainPending(g)) startTimer(g.timers.morning, toSettle);   // 全員が使い終わったら、通常の朝の長さに戻す
      rerender();
    }
    if (d.t === "act" && d.kind === "sel" && g.phase === PH().ONLINE_NIGHT && isActive(role) && !(g.drunkOverlay && g.drunkOverlay[id]) && byId(id)) {
      // 夜の選択: 朝になるまで何度でも変更できる。確定・演出は夜の終わり(resolveNight)
      const sel = d.sel || {}, ar = effRole(g, id);
      const selfOk = !!((ONW.roleDef(ar) || {}).stagePick || {}).self;   // シャッフラーは自分も選べる（stagePick.self）
      const okP = (x) => typeof x === "string" && (x !== id || selfOk) && !!byId(x);
      const okG = (x) => Number.isInteger(x) && x >= 0 && x < g.center.length;
      let players = [...new Set((sel.players || []).filter(okP))], graves = [...new Set((sel.graves || []).filter(okG))];
      const nz = ONW.roleDef(ar).night.normalize;   // 選べる人数・墓地の枚数は js/roles/<役職>.js の night.normalize
      if (nz) { const n = nz(RC(), players, graves); players = n.players; graves = n.graves; }
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
      if (text && byId(id) && !isDead(id)) {
        if (ONW.muzzle && ONW.muzzle.isMuzzled(g, id)) { send(id, { t: "muzzlenote" }); return; }   // 口封じされている人は議論に書き込めない
        pushChat(byId(id).name, text, "chat");
      }   // 死亡者・観戦者は議論に書き込めない
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
      if (ONW.muzzle && ONW.muzzle.isMuzzled(g, id)) { send(id, { t: "muzzlenote" }); return; }   // 口封じされている人はCO・結果開示ができない
      const text = String(d.text || "").trim().slice(0, 120);
      if (!text) return;
      if (d.hold) g.holdUntil = Date.now() + 25000;      // CO→結果開示の途中はCPUの発言を待たせる
      if (d.disclose) g.holdUntil = 0;
      if (d.setRole && d.setRole !== "merlin" && (g.coDeck.some((x) => x.r === d.setRole) || String(d.setRole).startsWith("team:"))) { g.coState[id] = d.setRole; boardEntry(id).co = d.setRole; }
      if (d.disclose) boardEntry(id).results.push(String(d.short || text).slice(0, 80));
      const c = d.claim;
      if (c && ["seer", "robber", "doppel", "freeter", "servant", "sheriff"].includes(c.kind) && byId(c.target) && g.initialRoles[id] !== undefined) g.cpuClaims.push({ from: id, kind: c.kind, target: c.target, role: c.role });   // フリーター・従者は、名指しされたCPUが騙りで話を合わせるために記録する / 保安官は、撃ったという申告をCPUの投票判断（保安官 cpuVoteSee）が見る
      pushChat(null, `${byId(id).name}: ${text}`, "co");
      sendBoard();
    }

    if (d.t === "strawpick" && g.phase === PH().ONLINE_VOTE && g.strawAsk && g.strawAsk[id]) {   // わら人形・アサシンが選んだ（同時に選んでいる人たちのうちの1人）
      const a = g.strawAsk[id];
      if (!a.cands.includes(d.target)) return;
      (a.kind === "assassin" ? g.assassinTargets : a.kind === "bounty" ? g.bountyTargets : g.strawTargets)[id] = d.target;
      delete g.strawAsk[id]; clearTimeout(askDrop[id]);
      afterAsk();
      return;
    }
    if (d.t === "vote" && g.phase === PH().ONLINE_VOTE) {
      if (chainAsking()) return;                            // 道連れ・暗殺の選択中は、票はもう確定している
      if (g.foxVote && g.foxVote.wait) return;              // 妖狐投票の結果を発表している間は、票を受け付けない
      if (isDead(id) || isDead(d.target)) return;           // 死亡者は投票できず、投票先にもできない
      if ((g[dbgKey(g)] || {})[id]) return;                   // デバッグ固定票は変えない（妖狐投票中は妖狐投票の指定、通常投票は通常の指定）
      if (d.target == null) delete g.votes[id];             // 同じ人をもう一度押した = 未投票
      else if (id !== d.target && byId(d.target)) g.votes[id] = d.target;
      else return;
      sendSpecInfo();
      rerender();                                           // 数えるのはタイマー終了時（finishVoting）
    }
  }

  /**
   * 独裁者の独裁処刑（ホストのみ）。議論を打ち切って、投票を飛ばし、選ばれた人だけを処刑して結果発表へ（マイクラ版 main.js の独裁者 → showResult）。
   * 昼のタイマー・CPUの発言・考え中の酔い覚めCPUの能力は、ここで終わらせる。妖狐投票もしない。
   */
  /** フリーターの再就職（昼能力）。検証 → freeter.applyRejob（就職先・履歴の更新、本人に新就職先の最終役職、新就職先に通知、全体ログ）→ 本人の選択画面を閉じる */
  function hostRejob(id, target) {
    const g = G(), F = ONW.freeter;
    if (!net.isHost || !g.inGame || g.phase !== PH().ONLINE_DAY) return;
    if (!F.canRejob(g, id) || !F.targets(g, id).includes(target)) return;
    F.applyRejob(RC(), id, target);   // 就職先・履歴の更新 / 本人への初期役職 / 新しい就職先への通知 / 全体ログ
    send(id, { t: "rejobdone" });
    sendSpecInfo();   // 観戦者の盤面（就職先）も更新
  }
  /**
   * 交換者の昼能力（ホストのみ）。検証 → exchanger.apply（g.exchanges に使った順で記録）→ 本人に「交換しました」。議論・投票はそのまま続く。
   * 使ったことは結果発表まで他の人にはわからない（チャットにも出さない）。結果発表の「昼行動結果」に文章が出る（dayLogsAll）。
   */
  function hostExchange(id, a, b) {
    const g = G();
    if (!net.isHost || !g.inGame || g.phase !== PH().ONLINE_DAY) return;
    if (!ONW.exchanger.canUse(g, id)) return;
    const ex = ONW.exchanger.apply(g, id, a, b);
    if (!ex) return;
    (g.dayLogsAll = g.dayLogsAll || []).push(`${rn("exchanger")} ${nameOf(id)} は ${nameOf(a)} と ${nameOf(b)} の票数を入れ替えていました。`);
    send(id, { t: "exchdone", a: nameOf(a), b: nameOf(b) });
    sendSpecInfo();
  }
  /**
   * 保安官の昼能力（ホストのみ）。検証（使える人・撃てる相手）→ ONW.sheriff.judge で結果を決める → record で記録 → 死ぬ人を killPlayer(..., "shot") で順に死なせる。
   *   ・執行・誤爆・従者の身代わり・ネコカボチャは、どれも死因 "shot" 1つ（区別できない）。心中・後追い・王国滅亡などの連鎖は killPlayer（ONW.deathFollowers）に任せる。
   *   ・ガード(人狼王)・シュレディンガーの猫: 何も起きない（撃ったことだけ記録する）。
   *   ・撃ったことは、本人にも「執行/誤爆」を伝えない（本人には画面を閉じて「使用済み」だけ）。議論・投票はそのまま続く。演出（銃痕・ひび）は 3of6、結果発表は 4of6。
   *   ・record を先に呼ぶ: 誤爆・ネコカボチャで死ぬ人の従者が後追いするかは、記録した followIds を state.js の deathFollowers が見て決めるため。
   */
  function hostSheriff(id, target) {
    const g = G();
    if (!net.isHost || !g.inGame || g.phase !== PH().ONLINE_DAY) return;
    if (!ONW.sheriff.canUse(g, id) || !ONW.sheriff.targets(g, id).includes(target)) return;
    const plan = ONW.sheriff.judge(g, id, target);
    if (!ONW.sheriff.record(g, plan)) return;
    (g.dayLogsAll = g.dayLogsAll || []).push(ONW.sheriff.actText(nameOf(id), nameOf(target)));   // 結果発表の「昼行動結果」（誰が誰を撃ったかだけ。執行か誤爆かは書かない）
    send(id, { t: "sheriffdone", text: ONW.sheriff.shotText(nameOf(target)) });   // 本人の情報確認に「〇〇 を撃ちました。」（執行か誤爆かは書かない）
    plan.victims.forEach((v) => { if (!isDead(v)) net.killPlayer(v, null, "shot", { step: 0 }); });   // 撃たれた人は段0。心中・後追い・王国滅亡は killPlayer の連鎖が段1以降で続ける
    (plan.tomo || []).forEach((v) => { if (!isDead(v)) net.killPlayer(v, nameOf(plan.target), "tomo", { step: 1 }); });   // ネコカボチャを撃った保安官は、ネコカボチャの道連れ（段1）。同時ではなく連鎖
    const sp = g.players.find((q) => q.id === id), speak = sp && sp.isCpu && !isDead(id) ? ONW.roleHook("sheriff", "cpuSpeak") : null;   // 撃ったのがCPUで生きていれば、「〇〇を撃ちました。」と言う（誤爆で死ぬときは言わない）
    if (speak) { const items = speak(ONW.cpu.kit, g, sp, plan); if (items.length) enqueue(items); }
    sendSpecInfo();
  }
  /**
   * デバッグ(ホストのみ): CPUの昼能力を「いま」発動する（リアルタイム指定。マイクラ版 applyDebugCpuDayAbility と同じ形: 対象を選んだ瞬間に使う）。
   * kind: "dictate"(独裁) / "exchange"(交換: a と b) / "sheriff"(撃つ) / "rejob"(再就職)。使えない（役職でない・酔い中・死亡・使用済み・対象が死亡）ときは各 host〇〇 の検証で何も起きない。
   * 戻り値: 発動を試みたら true（使えない状態なら false）
   */
  net.debugDayAbility = function (id, kind, a, b) {
    const g = G();
    if (!net.isHost || !g.debugOn || !g.inGame || g.phase !== PH().ONLINE_DAY) return false;
    const p = g.players.find((q) => q.id === id);
    if (!p || !p.isCpu || isDead(id)) return false;
    if (kind === "dictate") { if (!ONW.dictator.canUse(g, id)) return false; hostDictate(id, a); }
    else if (kind === "exchange") { if (!ONW.exchanger.canUse(g, id)) return false; hostExchange(id, a, b); }
    else if (kind === "sheriff") { if (!ONW.sheriff.canUse(g, id)) return false; hostSheriff(id, a); }
    else if (kind === "rejob") { if (!ONW.freeter.canRejob(g, id)) return false; hostRejob(id, a); }
    else return false;
    return true;
  };
  function hostDictate(id, target) {
    const g = G();
    if (!net.isHost || !g.inGame || g.phase !== PH().ONLINE_DAY) return;
    if (!ONW.dictator.canUse(g, id) || !ONW.dictator.targets(g, id).includes(target)) return;
    flushCpuSober();                       // 考え中のCPUの酔い覚めの能力は、待たずに使う（昼が終わるとき）
    ONW.dictator.declare(g, id, target);
    pushChat(null, `独裁者 ${nameOf(id)} が独裁を宣言しました。議論を打ち切り、${nameOf(target)} を独裁処刑します。`, "sys");   // 全員のチャット・結果のチャット履歴に残る
    clearTimers(); haltClock();
    g.foxVote = null; g.phase = PH().ONLINE_VOTE;
    sendAll({ t: "vote_start", dictator: true });   // 各自の画面: 昼の操作を閉じて「結果を待っています」にする（投票の選択は出さない）
    sendSpec({ t: "specphase", phase: PH().ONLINE_VOTE });
    sendSpecInfo();
    finishVoting();
  }

  /** 妖狐投票の終わり。得票数を全員に発表 → 最多得票の妖狐だけが追放される（従者の身代わりつき）→ 追放された人のカードだけがめくれる → 連鎖で死ぬ人（恋人の心中・キューピッドと背徳者の後追い）→ 票を空にして本投票へ。
   *  追放された人がいなければ、票数が出るだけでカードはめくれない（3秒の発表のあと本投票）。 */
  function finishFoxVote() {
    const g = G();
    clearTimers();
    const r = ONW.foxVote.resolve(g), v = ONW.foxVote.view(g, r), pl = ONW.foxVote.plan(g, r);
    g.foxVote = { active: false, completed: false, wait: true, noVote: (g.deadIds || []).slice(), votes: { ...g.votes }, counts: r.counts, topIds: r.topIds, executedIds: r.executed, subs: r.subs, view: v };
    const m = { t: "foxvote", view: v };
    if (pl) m.flash = { ids: pl.ids, subs: pl.subs, chain: pl.chain };   // 全員の画面で、追放された人のカードがめくれる演出
    sendAll(m); sendSpec(m);
    pushChat(null, v.counts.length ? `妖狐投票 得票数: ${v.counts.map((c) => `${c.name} ${c.n}票`).join("、")}` : "妖狐投票: 得票はありませんでした。", "sys");
    if (!pl) pushChat(null, "妖狐投票では妖狐は追放されませんでした。", "sys");
    const wait = pl ? pl.ms : 3000;
    setTimeout(() => {
      const cur = ONW.game;
      if (!cur || cur !== g || g.phase !== PH().ONLINE_VOTE || !g.foxVote || !g.foxVote.wait) return;
      if (pl) ONW.foxVote.execute(g, pl);   // 演出が終わってから死亡にする（killPlayer が心中・後追いまで連鎖させる）
      g.foxVote.wait = false; g.foxVote.completed = true;
      beginVote(true);
    }, wait);
  }

  function finishVoting() {
    const g = G();
    if (g.phase !== PH().ONLINE_VOTE) return;
    if (chainAsking()) return;   // わら人形・アサシンが選んでいる間は、勝手に終わらせない
    flushCpuVotes();             // 2秒考え中のCPUの票は、投票が終わる前に入れる（ホストの「次へ」など）
    if (g.foxVote && g.foxVote.wait) return;   // 妖狐投票の結果を発表している間
    if (g.foxVote && g.foxVote.active) { finishFoxVote(); return; }   // 妖狐投票が終わった: 得票数を出して、本投票へ
    clearTimers();
    ONW.vote.resolveElimination(g);
    g.catPicks = {}; g.catSources = {}; g.catInfo = {}; g.strawTargets = {}; g.assassinTargets = {}; g.assassinList = []; g.bountyTargets = {}; g.bountyList = []; g.strawAsk = {};   // 猫又・黒猫・わら人形・アサシン・賞金稼ぎの選択と、シュレディンガーの猫の参照先は、この結果ごとに決め直す
    proceedChain();
  }

  // ---- わら人形・アサシンの選択（タイマーなし。選び終わるまで待つ）----
  const CPU_THINK_MS = 2000;   // CPUが「考える」時間（わら人形・賞金稼ぎ・アサシンの選択 / 酔い覚め後の能力 / 投票）。この時間が過ぎてから使う
  const ASK_GRACE_MS = 30000;   // 通信が切れた人が戻ってくるのを待つ時間（戻らなければランダム）
  const askDrop = {};
  const chainAsking = () => { const a = G().strawAsk; return !!a && Object.keys(a).length > 0; };
  const nameOf = (id) => (G().players.find((p) => p.id === id) || {}).name || "?";
  /** 誰かが選んでいる間の「待ち」表示（誰が・何の役職が選んでいるかは全員に伏せる） */
  const askWaitMsg = (who) => {   // 選択待ちの表示（席ごとに中身が違う）。who: 席のID か { id }
    const g = G(), seat = who && typeof who === "object" ? who.id : who, R = ONW.ROLE, special = (r) => r === R.ASSASSIN || r === R.BOUNTY_HUNTER;
    const flipped = flippedNow(), mine = g.currentRoles ? g.currentRoles[seat] : null;
    const show = {};   // めくれていても「？」にしないカード。アサシン・賞金稼ぎ以外の人の画面では、めくれたアサシン・賞金稼ぎだけは本当の役職で見える / アサシン・賞金稼ぎの画面では、自分のカード以外はすべて「？」（アサシンには賞金稼ぎも、賞金稼ぎにはアサシンも「？」に見える）
    flipped.forEach((id) => { const r = (g.currentRoles || {})[id]; if (!special(r)) return; if (!special(mine) || id === seat) show[id] = r; });
    return { t: "strawwait", on: chainAsking(), ids: Object.keys(g.strawAsk || {}), hide: Object.values(g.currentRoles || {}).some(special), flipped, show };   // hide: アサシン・賞金稼ぎが現世にいる（死んでいても）なら、選んでいない人の画面でもめくれたカードを「？」にする
  };
  /** ここまでにめくれた人（追放 + 連鎖 + わら人形がすでに選んだ道連れ先） */
  const flippedNow = () => { const g = G(); return [...new Set([...(g.eliminated || []), ...(g.chainIds || []), ...Object.values(g.strawTargets || {})])]; };
  const askMsg = (id) => { const a = G().strawAsk[id]; return { t: "strawask", cands: a.cands.map((c) => ({ id: c, name: nameOf(c) })), kind: a.kind, flipped: flippedNow() }; };   // flipped: アサシンの画面で全員同じ「？」にする人
  function autoPick(kind, id, cands) {   // CPU・通信が切れた人・ホストのスキップ: 仲間と分かっている人は避けて選ぶ（アサシン）/ ランダム（わら人形）
    const g = G();
    if (kind === "assassin") g.assassinTargets[id] = ONW.cpu.assassinPick(g, id, cands);
    else if (kind === "bounty") g.bountyTargets[id] = ONW.cpu.bountyPick(g, id, cands);
    else { const f = ONW.debug ? ONW.debug.randTarget(g, "straw", id) : null; g.strawTargets[id] = f && cands.includes(f) ? f : ONW.utils.randomChoice(cands); }   // デバッグ: 道連れ先の指定
  }
  /** 選んでいる人の代わりに自動で決める（退出・通信切れ・ホストのスキップ） */
  function autoAsk(seat) {
    const g = G(), a = g.strawAsk && g.strawAsk[seat];
    if (!a || g.phase !== PH().ONLINE_VOTE) return;
    clearTimeout(askDrop[seat]);
    autoPick(a.kind, seat, a.cands);
    delete g.strawAsk[seat];
    send(seat, { t: "strawask", cands: [] });   // 本人の画面の選択を閉じる
    afterAsk();
  }
  /** 1人が選び終わった: まだ選んでいる人がいれば待ち、全員終わったら次へ */
  function afterAsk() {
    if (chainAsking()) {
      sendAll(askWaitMsg);
      Object.keys(G().strawAsk).forEach((id) => { if (["assassin", "bounty"].includes(G().strawAsk[id].kind) && !G().strawAsk[id].cpu) send(id, askMsg(id)); });   // まだ選んでいるアサシン・賞金稼ぎの画面に、道連れで増えた「？」を反映
      return;
    }
    sendAll({ t: "strawwait", on: false });
    proceedChain();
  }
  /** タイマーの表示を消す（選び終わるまで止まっている） */
  function haltClock() {
    const g = G();
    stopTimer(); g.remain = null;
    sendAll({ t: "tick", sec: null }); sendSpec({ t: "tick", sec: null });
  }
  /** わら人形・アサシンがめくれたら、本人たちに（同時に）選んでもらう。全員ぶん選び終わったら次の波 / 結果へ */
  function proceedChain() {
    const g = G();
    if (g.phase !== PH().ONLINE_VOTE) return;
    const need = ONW.vote.strawNeed(g);
    if (!need) { g.strawAsk = {}; finalizeResult(); return; }
    haltClock();
    g.strawAsk = {};
    const humans = [], cpus = [];
    need.forEach((n) => {
      const p = g.players.find((q) => q.id === n.id);
      // CPU・通信が切れた人はその場で自動。人間は選び終わるまで待つ
      if (p && p.isCpu) cpus.push(n);   // CPUは2秒考えてから選ぶ（その間も「選んでいる最中」として待つ）
      else if (!p || (p.id !== net.selfSeat && !(net.conns[p.id] && net.conns[p.id].open))) autoPick(n.kind, n.id, n.cands);
      else humans.push(n);
    });
    if (!humans.length && !cpus.length) { proceedChain(); return; }
    humans.forEach((n) => { g.strawAsk[n.id] = { cands: n.cands, kind: n.kind }; });
    cpus.forEach((n) => { g.strawAsk[n.id] = { cands: n.cands, kind: n.kind, cpu: true }; clearTimeout(askDrop[n.id]); askDrop[n.id] = setTimeout(() => { if (G() === g) autoAsk(n.id); }, CPU_THINK_MS); });
    sendAll(askWaitMsg);
    humans.forEach((n) => send(n.id, askMsg(n.id)));
  }
  /** 最終結果の「情報確認」: CPUも含めた全員ぶん（役職・夜と昼に得た情報）。結果の表と一緒に全員へ送る */
  function buildInfo() {
    const g = G();
    return g.players.map((p) => {
      let msgs = [];
      try { msgs = [...resyncMsgs(p.id, PH().ONLINE_RESULT), ...((g.infoDay || {})[p.id] || [])]; } catch (e) {}
      const r = ONW.utils.infoFromMsgs(msgs);
      return { name: p.name, cpu: !!p.isCpu, role: r.role, from: r.from, soberRole: r.soberRole, logs: r.logs };
    });
  }
  function buildInfoPub() {
    const g = G();
    return { stars: g.starNames || [], kings: g.kingNames || [], expose: g.exposeRows || [], mapo: !!g.mapoDone, bread: g.breadN || 0, deaths: g.deathNotes || [], news: Array.isArray(g.newsLines) ? g.newsLines : null };
  }
  function finalizeResult() {
    const g = G();
    clearTimers();
    Object.keys(askDrop).forEach((k) => { clearTimeout(askDrop[k]); delete askDrop[k]; });
    sendAll({ t: "strawwait", on: false });
    ONW.vote.determineWinners(g);
    const tally = ONW.vote.tally(g);
    const nm = (id) => (g.players.find((p) => p.id === id) || {}).name || "?";
    const teamOf = (role) => ONW.roles.getInfo(role).team;
    const winIds = g.winnerIds || g.players.filter((p) => g.winners.includes(teamOf(g.currentRoles[p.id]))).map((p) => p.id);
    const gone = g.executed || g.eliminated;   // 追放された人（一目惚れしてるてるに巻き込まれた人を含む）
    const bntMiss = (id) => (g.eliminated || []).includes(id) && !(g.servantSubs || []).some((x) => x.servant === id) && !(g.toughBounces || []).some((t) => (t.to || []).includes(id)) && (g.bountyResult || []).some((b) => b.by === id && !b.hit);   // 賞金稼ぎが投票で追放され、人狼判定を外した（処刑人のターゲットなら、このときだけ処刑人が有効）
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
      const shufStamp = g.shufflerStamp || {};   // シャッフラーの印が付いた段階（置かれた段階と、そのカードが動いたあとの段階）
      trail.forEach((r, k) => segs.push({ name: rn(r), team: teamOf(r), sfx: sfxOf(cardTrail[k]), shuf: !!shufStamp[p.id + "|" + k] }));
      if ((trail.length ? trail[trail.length - 1] : ini) !== fin) segs.push({ name: rn(fin), team: teamOf(fin) });
      segs[segs.length - 1].sfx = sfx;
      noDarkSfx(segs);   // 闇の化身には (+人狼) を付けない
      // 本家どおり: 恋人は「(+恋人1)」（組の番号つき・ピンク）、酔っ払いは「(+酔っ払い)」（金色）を、最終の役職のあとに並べる
      // 配布時の恋人は「人」についているので、変化・交換の途中のカードすべてに付ける。
      // 純愛者の恋人は「成立していた間の段階」にだけ付ける（光の使徒→村人→村人(+恋人1)→村人）。番号は成立した順。純愛者が選んだ段階・組が変わった段階は、役職が同じでも1段階として足す（純愛者→純愛者(+恋人1)）
      ONW.pureLover.applyMarks(g, p.id, segs, !!from);
      ONW.shuffler.tagSegs(segs);   // シャッフラーが置いたカードの段階には「(+シャッフラー)」（恋人の印のあとに並べる）   // 配布時の恋人は全段階に、純愛者の恋人は成立していた段階にだけ付ける
      if (g.drunkOverlay && g.drunkOverlay[p.id]) segs.forEach((sg) => { sg.tags = [{ t: "(+酔っ払い)", k: "drunk" }, ...(sg.tags || [])]; });   // 酔っ払いは「人」についているので、変化の途中のカードすべてに付ける: 闇の化身(+酔っ払い)→人狼(+酔っ払い)
      // シュレディンガーの猫: 最終役職の文字色が、参照先の陣営の色になる（村人=緑 / 人狼=赤 / 第三陣営の役職=灰色のまま「(+その役職名)」/ 無所属・堂々巡り・恋人=灰色）
      const catI = fin === ONW.ROLE.SCHRODINGER_CAT ? (g.catInfo || {})[p.id] : null;
      if (catI && (catI.votes >= 1 || catI.fixed) && catI.team !== "lover") {   // 本家と同じ: 1票以上入っていれば「シュレディンガーの猫(灰色) → シュレディンガーの猫(陣営の色)」と、もう一度裏返った分を続ける
        const last = segs[segs.length - 1];
        const nx = { name: last.name, team: catI.team === "village" || catI.team === "wolf" ? catI.team : "third", tags: [...(last.tags || [])] };
        if (catI.team === "third" && catI.final) nx.tags.push({ t: `(+${rn(g.currentRoles[catI.final])})`, k: "cat" });
        if (catI.fixed) last.team = nx.team; else segs.push(nx);   // 保安官に撃たれた猫は裏返らず、最初から陣営の色（緑）の1段だけ
      }
      const execTg = !(g.chainIds || []).includes(p.id) && (g.eliminated || []).includes(p.id) && !(g.servantSubs || []).some((x) => x.servant === p.id) && !(g.mentalIds || []).includes(p.id) && !(g.toughBounces || []).some((t) => (t.to || []).includes(p.id)) && ONW.execPairs(g).some(([e, t]) => t === p.id && e !== t && (g.currentRoles[t] !== ONW.ROLE.BOUNTY_HUNTER || bntMiss(t)));   // 処刑人のターゲットが投票で追放された（死因: 処刑。賞金稼ぎがターゲットなら、人狼判定を外したときだけ有効）
      const execLate = execTg && g.currentRoles[p.id] === ONW.ROLE.BOUNTY_HUNTER;   // 賞金稼ぎのターゲット: 追放でめくれたときは「追放」のまま、賞金稼ぎの外れが出たあとで処刑人の演出（ギロチン）に入る
      const bounce = !(g.chainIds || []).includes(p.id) && gone.includes(p.id) && !(g.mentalIds || []).includes(p.id) && !(g.shockIds || []).includes(p.id) && !(g.servantSubs || []).some((x) => x.servant === p.id) && (g.toughBounces || []).some((t) => (t.to || []).includes(p.id));   // タフガイのとばっちりで追放された（死因: とばっちり）
      const dict = !!g.dictator && g.dictator.target === p.id && gone.includes(p.id) && !(g.chainIds || []).includes(p.id) && !(g.mentalIds || []).includes(p.id) && !(g.shockIds || []).includes(p.id) && !(g.servantSubs || []).some((x) => x.servant === p.id) && !execTg && !bounce;   // 独裁処刑で追放された（死因: 独裁処刑。ショック死・処刑人のターゲットの「処刑」・とばっちりはそちらの表示を優先）
      const isChain = (g.chainIds || []).includes(p.id);   // 巻き込まれた人（死因: 無理心中 = 一目惚れしてるてる / 道連れ = わら人形・猫又・黒猫）
      const kind = isChain ? (g.chainKind || {})[p.id] || "love" : null;
      const by = isChain ? nm((g.chainBy || {})[p.id]) : null;
      const sub = isChain && (g.chainSub || {})[p.id] ? nm(g.chainSub[p.id]) : null;   // 道連れの身代わりになった従者: 守られたご主人の名前
      const label = sub ? "身代わり" : kind === "tomo" ? "道連れ" : kind === "bite" ? "噛殺" : kind === "lovers" ? "心中" : kind === "queen" ? "王国滅亡" : kind === "follow" ? "後追い" : "無理心中";
      const dayDead = !gone.includes(p.id) && (g.deadIds || []).includes(p.id);   // 昼中に死亡した人（呪殺・後追い・デバッグの死亡）。結果発表で、生存者より先にめくれる
      const dayKind = dayDead ? (g.deadKind || {})[p.id] || "dead" : null, dayBy = dayDead && (g.deadBy || {})[p.id] ? (g.deadBy || {})[p.id] : null;
      const dayLabel = dayKind === "fox" ? "呪殺" : dayKind === "foxvote" ? ONW.foxVote.labelOf(g, p.id) : ONW.deathMarkOf(dayKind, g, p.id) || "死亡";
      return { id: p.id, role: fin, ini, day: dayDead, dayN: (g.deadIds || []).indexOf(p.id), dayKind, dayBy, dayLabel, foxTie: !!(g.foxVote && (g.foxVote.executedIds || []).includes(p.id) && (g.foxVote.topIds || []).length >= 2 && (g.foxVote.topIds || []).includes(p.id) && g.currentRoles[p.id] === ONW.ROLE.FOX), shuf: !!(segs[segs.length - 1].tags || []).some((t) => t.k === "shuffler"), keep: !!(segs[segs.length - 1].tags || []).some((t) => t.k === "keep"), prom: segs[segs.length - 1].sfx === "(+人狼)", drunk: !!(g.drunkOverlay && g.drunkOverlay[p.id]), win: winIds.includes(p.id), dead: gone.includes(p.id), name: p.name, segs, sub, cause: isChain ? "chain" : gone.includes(p.id) ? "exec" : null, mental: (g.mentalIds || []).includes(p.id), shock: (g.shockIds || []).includes(p.id), kind, by, late: !!(g.chainLate || {})[p.id], lover: ONW.isLover(g, p.id), loverNos: ONW.loverPairs(g).filter(([a, b]) => a === p.id || b === p.id).map((q) => ONW.loverNo(g, q[0], q[1], q[2])).sort((x, y) => x - y), loverNo: (() => { const q = ONW.loverPairs(g).find(([a, b]) => a === p.id || b === p.id); return q ? ONW.loverNo(g, q[0], q[1], q[2]) : 0; })(), byRole: isChain ? (g.currentRoles[(g.chainBy || {})[p.id]] || null) : null, bounce, dict, status: isChain ? `［${label}］` : (g.mentalIds || []).includes(p.id) ? "［メンタル崩壊］" : gone.includes(p.id) ? ((g.servantSubs || []).some((x) => x.servant === p.id) ? "［身代わり］" : execTg ? "［処刑］" : bounce ? "［とばっちり］" : dict ? "［独裁処刑］" : "［追放］") : dayDead ? `［${dayLabel}］` : "［生存］", execTg, execLate };
    });
    const result = {
      title: g.winTitle,
      detail: g.winDetail,
      teams: g.winTeams,
      winners: winIds.map(nm),
      losers: g.players.filter((p) => !winIds.includes(p.id)).map((p) => p.name),
      votes: g.players.map((p) => ({ from: p.name, to: g.votes[p.id] ? nm(g.votes[p.id]) : null, w: g.votes[p.id] ? ONW.vote.weightOf(g, p.id) : 0, x: (g.deadIds || []).includes(p.id) })),   // x: 投票できなかった（昼中に死亡していた）→ 「投票無効」。自分で投票しなかった人は「未投票」   // w: その人の投票が何票ぶんか（メイヤーは設定した票数）
      dictator: g.dictator ? { byId: g.dictator.by, by: nm(g.dictator.by), targetId: g.dictator.target, target: nm(g.dictator.target), role: g.currentRoles[g.dictator.by] || null } : null,   // 独裁者（独裁処刑）: 宣言した人と、処刑対象に選んだ人。ある試合は「投票結果」の代わりに独裁処刑を出す
      foxVote: g.foxVote && g.foxVote.view ? {   // 妖狐投票（マイクラ版と同じ順で、本投票の結果より先に出す）: 誰が誰に投票したか / 得票数 / 追放された人（tie: 同数最多で追放 = 実績 fox_vote_tie_exile 用）
        votes: g.players.map((p) => { const t = (g.foxVote.votes || {})[p.id]; return { from: p.name, to: t ? nm(t) : null, w: t ? ONW.vote.weightOf(g, p.id) : 0, x: (g.foxVote.noVote || []).includes(p.id) }; }),   // x: 妖狐投票の時点で死亡していて投票できなかった
        counts: (g.foxVote.view.counts || []).map((c) => ({ id: c.id, name: c.name, c: c.n })),
        executed: (g.foxVote.view.executed || []).map((e) => ({ id: e.id, name: e.name, sub: !!e.sub })),
        tie: (g.foxVote.executedIds || []).length > 0 && (g.foxVote.topIds || []).length >= 2,
      } : null,
      counts: Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([id, c]) => ({ id, name: nm(id), c })),
      sheriffs: ONW.sheriff.lines(g, nm),   // 保安官（撃った順）: 結果発表の「役職情報」に、撃った結果の文（info）を出す
      exchanges: ONW.exchanger.view(g, nm),   // 交換者（使った順）: 結果発表で、得票数が出たあとに2人の票数が入れ替わる演出に使う
      countSteps: ONW.vote.tallySteps(g).map((st) => Object.entries(st).map(([id, c]) => ({ id, c }))),   // 入れ替え前 → 1つ目の入れ替え後 → … の得票数（交換者がいない試合は1つだけ）
      promoted: g.promotedWolfIds.map(nm),
      nightLogs: g.nightLogsAll,
      info: buildInfo(),   // 情報確認（全員ぶん）
      infoPub: buildInfoPub(),   // 全員に公開された情報
      dayLogs: g.dayLogsAll || [],   // 昼行動結果（昼に自分で選ぶ能力の結果: フリーターの再就職など。独裁者は res.dictator）
      history,
      chainOrder: [...(g.chainIds || [])],
      kingdom: { ids: [...(g.kingdomIds || [])], queens: (g.queenFallen || []).map(nm) },   // 王国滅亡: 一斉にめくれる村人陣営 / 倒れた女王
      lovers: ONW.loverPairs(g).map(([a, b]) => [nm(a), nm(b)]),
      gremlins: ONW.gremlinPairs(g).map(([gid, [a, b]]) => ({ gremlin: nm(gid), from: nm(a), to: nm(b) })),   // グレムリン情報（最終盤面のグレムリンの持ち主と、選んだ2人）
      reverse: g.chickenReverse ? { fromTitle: g.chickenReverse.fromTitle, fromTeams: g.chickenReverse.fromTeams, ids: [...g.chickenReverse.ids], names: [...g.chickenReverse.names] } : null,   // チキンの逆転演出（逆転前の勝敗を先に見せる）
      god: { mode: g.godMode || null, ids: [...(g.godIds || [])], blown: [...(g.godBlown || [])] },   // 神の演出（祝福 / 降臨）
      execs: ONW.execPairs(g).filter(([a, b]) => g.currentRoles[b] !== ONW.ROLE.BOUNTY_HUNTER || bntMiss(b)).map(([a, b]) => ({ late: g.currentRoles[b] === ONW.ROLE.BOUNTY_HUNTER, execId: a, targetId: b, exec: nm(a), target: nm(b), win: (g.eliminated || []).includes(b) && !(g.servantSubs || []).some((x) => x.servant === b) && !(g.toughBounces || []).some((t) => (t.to || []).includes(b)), dead: (g.executed || []).includes(b) || (g.deadIds || []).includes(b) })),   // 処刑人情報（最終盤面の処刑人の持ち主とターゲット / ターゲットが追放されたか）
      watchdogs: ONW.watchdog ? ONW.watchdog.pairs(g).map(([a, b]) => ({ byId: a, by: nm(a), ownerId: b, owner: nm(b), votes: ONW.vote.tally(g, { unguarded: true })[b] || 0, hang: (() => { const u = ONW.vote.tally(g, { unguarded: true }), v = u[b] || 0; return v > 0 && v === Math.max(0, ...Object.values(u)); })(), bite: (g.dogBites || []).some((x) => x.by === a && x.target === b && !x.back), back: (g.dogBites || []).some((x) => x.by === b && x.target === a && x.back) })) : [],   // 役職情報（番犬: 最終盤面の持ち主と飼い主）。votes = 無効になった飼い主への票数 / hang = 守られていなければ追放されていた(最多得票だった) / bite = 噛み殺した / back = ネコカボチャに噛み返された
      servants: ONW.servantPairs(g).map(([a, b]) => [nm(a), nm(b)]),   // 役職情報（従者）（最終盤面の従者の持ち主とご主人）
      muzzles: ONW.muzzle ? ONW.muzzle.pairs(g).map(([a, b]) => ({ by: nm(a), target: nm(b) })) : [],   // 役職情報（口封じの狂人: 最終盤面の持ち主と、口封じした人）
      chainSubs: Object.entries(g.chainSub || {}).map(([s, m]) => ({ servant: nm(s), master: nm(m) })),   // 道連れの身代わり
      servantSubs: (g.servantSubs || []).map((x) => ({ servantId: x.servant, masterId: x.master, servant: nm(x.servant), master: nm(x.master) })),   // 身代わり（起きた順）
      cats: Object.entries(g.catInfo || {}).map(([id, c]) => ({ id, name: nm(id), team: c.team, votes: c.votes, fixed: !!c.fixed, bitten: !!c.bitten, direct: c.direct ? nm(c.direct) : null, final: c.final ? nm(c.final) : null, finalRole: c.final ? g.currentRoles[c.final] : null, via: !!c.via, win: winIds.includes(id) })),   // シュレディンガーの猫（最終盤面の持ち主ごと）: team = village / wolf / third / none / loop / lover。votes = 得票数（1票以上で結果の演出でもう一度裏返る）
      kings: (g.kingGuards || []).map((b) => ({ id: b.id, name: nm(b.id), votes: b.votes, kind: b.kind || "exec", by: b.by || null, byName: b.by ? nm(b.by) : null })),   // 人狼王: 他に人狼判定の人がいて、追放されそうになってガードされた人狼王
      toughs: (g.toughBounces || []).map((b) => ({ id: b.id, name: nm(b.id), votes: b.votes, to: b.to.slice(), toNames: b.to.map(nm) })),   // タフガイ: はじき返した票と、とばっちりを受けた人
      toughBlocks: (g.toughBlocks || []).map((b) => ({ id: b.id, name: nm(b.id), by: b.by, byName: nm(b.by), kind: b.kind })),   // タフガイ: 空振りさせた道連れ・無理心中
      assassin: (g.assassinResult || []).map((a) => ({ by: nm(a.by), byId: a.by, target: nm(a.target), targetId: a.target, role: g.currentRoles[a.target], hit: a.hit })),
      bounty: (g.bountyResult || []).map((a) => ({ by: nm(a.by), byId: a.by, target: nm(a.target), targetId: a.target, role: g.currentRoles[a.target], hit: a.hit })),   // 賞金稼ぎ: 選んだ相手が人狼判定だったか（演出は 2of3）
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

  // ホスト端末: 画面を閉じる・隠す直前にも、進行状態を端末に保存する（スマホで別アプリに切り替えて接続が切れても、戻ってきたら再開できる）
  const saveNow = () => { try { if (net.isHost) saveLocalSnap(); } catch (e) {} };
  window.addEventListener("pagehide", saveNow);
  // ホスト（と CPU だけ）の試合: 別のアプリを開いている間は、時計・CPUの発言・昼の開始待ちを止めて、戻ってきたら続きから動かす
  // （他に人間の参加者がいるときは止めない。止めると全員の試合が止まってしまう）
  let hidePause = null;
  const soloHost = () => net.isHost && G().inGame && !net.frozen && !net.xfer && !Object.values(net.conns).some((c) => c && c.open);
  function pauseForHide() {
    const g = G();
    if (hidePause || !soloHost()) return;
    const P = PH();
    if (g.phase === P.LOBBY || g.phase === P.ONLINE_RESULT) return;
    const cb = g.tickCb, hadTick = !!g.tickId, hadPump = !!g.pumpId, hadDay = !!g.dayStartId && !!g.dayBegin;
    if (!hadTick && !hadPump && !hadDay) return;
    if (hadTick) stopTimer();
    if (hadPump) { clearTimeout(g.pumpId); g.pumpId = null; }
    if (hadDay) clearTimeout(g.dayStartId);
    hidePause = { cb: hadTick ? cb : null, pump: hadPump, day: hadDay ? g.dayBegin : null };
  }
  function resumeFromHide() {
    const g = G(), h = hidePause;
    if (!h) return;
    hidePause = null;
    if (!net.isHost || !g.inGame) return;
    if (h.cb && Number.isFinite(g.remain) && g.remain > 0) startTimer(g.remain, h.cb.onEnd, h.cb.onTick);   // 止めた残り時間から続きを数える
    if (h.pump && g.phase === PH().ONLINE_DAY && g.cpuQueue && g.cpuQueue.length && !g.pumpId) g.pumpId = setTimeout(pump, 800);
    if (h.day && g.phase === PH().ONLINE_DAY && !g.dayStartId) { g.dayBegin = h.day; g.dayStartId = setTimeout(h.day, 600); }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { pauseForHide(); saveNow(); return; }
    // 画面に戻ってきた（別アプリから復帰）: 隠れている間はこちらからの生存確認(hb)も止まっていて、参加者からの返事も届いていない。
    // そのまま判定すると「返事が無い」と誤って接続を切ってしまうので、猶予を作り直し、落ちている合図用サーバーとの接続をつなぎ直す
    if (!net.isHost) return;
    const now = Date.now();
    Object.keys(net.conns).forEach((seat) => { net.rx[seat] = now; });
    const p = net.peer;
    if (p && !p.destroyed && p.disconnected) { try { p.reconnect(); } catch (e) {} }
    resumeFromHide();   // 接続のつなぎ直しを始めたうえで、止めていた時計を動かす
  });
  setTimeout(() => { net.checkLocalHost(); try { if (G().phase === PH().TITLE) rerender(); } catch (e) {} }, 0);   // 開き直したとき、前回のルームがあればタイトルに「再開」を出す

  ONW.net = net;
})(window.ONW);
