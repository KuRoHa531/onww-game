/**
 * cpu.js — CPUプレイヤーの思考（ホストの端末で動く）
 * 夜の行動 → 昼の発言(CO) → 投票 を、役職ごとの持っている情報から決める。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const cpu = {};
  const rn = (r) => ONW.roles.getInfo(r).name;
  const pick = (a) => ONW.utils.randomChoice(a);
  const nameOf = (g, id) => (g.players.find((p) => p.id === id) || {}).name || "?";
  const infoOf = (g, id) => (g.cpuInfo[id] = g.cpuInfo[id] || { known: {}, grave: [] });

  const WOLF = () => ONW.WOLF_KIND;
  const isWolf = (r) => WOLF().includes(r);
  const isMad = (r) => ONW.MAD_KIND.includes(r);
  /** 人外(村人陣営でない役職: 人狼・狂人・てるてる・第三陣営など)。奪った/最終的に手にした役職がこれなら、昼は村人側と偽る */
  const isNonVillage = (r) => ONW.roles.getInfo(r).team !== "village";

  /** CPUの夜行動（占い師系 → 墓荒らし → ドッペルゲンガー → 怪盗 → いたずらっ子の順）。占いは初期役職を見るので順序に影響されない */
  cpu.runNight = function (g, stage, ids) {   // stage: "init" | "seer" | "relic" | "doppel" | "robber" | "gremlin" | "tm"（省略時は全部を起床順に実行）
    const all = !stage;
    if (all || stage === "init") g.cpuInfo = {};
    g.cpuInfo = g.cpuInfo || {};
    // 酔っ払いが重なっているCPUは、酔いが覚める(late)までは夜の行動も情報もない
    const cpus = stage === "late" ? g.players.filter((p) => (ids || []).includes(p.id)) : g.players.filter((p) => p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]));
    const role = (p) => g.initialRoles[p.id];
    // 人狼系は互いを、狂信者は人狼系を知っている / 大狼は墓地をすべて知っている
    if (all || stage === "init") cpus.forEach((p) => {
      const vis = (r) => ONW.VISIBLE_WOLF.includes(r);   // 一匹狼は誰からも見えない
      if (vis(role(p)) && role(p) !== "forgetful_wolf") g.players.forEach((q) => { if (q.id !== p.id && vis(role(q))) infoOf(g, p.id).known[q.id] = role(q); });
      if (role(p) === "cultist") {
        g.players.forEach((q) => { if (vis(role(q))) infoOf(g, p.id).known[q.id] = role(q); });
        const mid = g.players.some((q) => isWolf(role(q))) ? null : ONW.vote.certainPromotion(g);   // 人狼不在で昇格が確定している狂人 = ご主人
        if (mid && mid !== p.id) infoOf(g, p.id).known[mid] = "werewolf";                           // CPUは人狼側の仲間として扱う（役職は不明）
      }
      if (role(p) === "merlin") {   // マーリン: 墓地以外の人狼を知っている（人狼不在なら昇格する狂人）
        g.players.forEach((q) => { if (q.id !== p.id && isWolf(role(q))) infoOf(g, p.id).known[q.id] = role(q); });
        const mid = g.players.some((q) => isWolf(role(q))) ? null : ONW.vote.certainPromotion(g);
        if (mid && mid !== p.id) infoOf(g, p.id).known[mid] = "werewolf";
      }
      if (role(p) === "mason") g.players.forEach((q) => { if (q.id !== p.id && role(q) === "mason") infoOf(g, p.id).known[q.id] = "mason"; });   // 共有者は互いを知っている
      if (role(p) === "servant") { const mid = ONW.servantMaster(g, p.id); if (mid) infoOf(g, p.id).master = mid; }   // 従者: 夜のはじめにご主人を知る（known には入れない = 投票の「村人側と分かっている人」扱いにしない）
      if (role(p) === "executioner") { const tid = ONW.execTarget(g, p.id); if (tid) infoOf(g, p.id).execTarget = tid; }   // 処刑人: 夜のはじめにターゲットを知る（known には入れない = 投票の「村人側と分かっている人」扱いにしない）
      if (role(p) === "big_wolf") g.center0.forEach((c, idx) => infoOf(g, p.id).grave.push({ idx, role: c }));
      if (role(p) === "god") {   // 神: 全員の初期役職と墓地を知っている
        g.players.forEach((q) => { infoOf(g, p.id).known[q.id] = role(q); });
        g.center0.forEach((c, idx) => infoOf(g, p.id).grave.push({ idx, role: c }));
      }
    });
    const forced = (p) => (ONW.debug ? ONW.debug.cpuTarget(g, p.id) : null) || {};   // デバッグ: 能力先の指定
    const validPlayer = (p, id) => id && id !== p.id && g.players.some((q) => q.id === id);
    const nn = (rid) => { if (stage !== "late") ONW.newsNote(g, rid); };   // 新聞配達員の新聞: 夜に能力を使った役職を記録（昼に酔いが覚めてからの能力は、新聞には載らない）

    const doSeer = (p, label, cur, rid) => {   // cur: 朝に使うとき（朝の時点の実際のカードを見る）
      const rolesNow = cur ? g.currentRoles : g.initialRoles, graveNow = cur ? g.center : g.center0;
      const i = infoOf(g, p.id), f = forced(p);
      const lim = ONW.seerGraveMax(g);   // 設定された「占える墓地の枚数」
      const fg = (f.graves || []).filter((k) => k >= 0 && k < g.center.length).slice(0, lim);
      const fp = validPlayer(p, f.player) ? f.player : null;
      i.grave = [];
      if (fg.length || (!fp && lim > 0 && g.center.length >= lim && Math.random() < 0.4)) {
        i.mode = "grave";
        const idxs = fg.slice(0, lim);
        ONW.utils.shuffle([...g.center.keys()].filter((k) => !idxs.includes(k))).forEach((k) => { if (idxs.length < lim) idxs.push(k); });
        idxs.slice(0, lim).forEach((k) => i.grave.push({ idx: k, role: ONW.seerSees(graveNow[k]) }));   // 墓地の白狼も村人と出る
        i.grave.forEach((x) => g.nightLogsAll.push(`${label} ${p.name} は 墓地${x.idx + 1} を確認し、${rn(x.role)} でした。`));
      } else {
        const t = fp ? g.players.find((q) => q.id === fp) : pick(g.players.filter((q) => q.id !== p.id));
        i.mode = "player"; i.target = t.id; i.known[t.id] = ONW.seerSees(rolesNow[t.id]);
        g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を占い、${rn(ONW.seerSees(rolesNow[t.id]))} でした。`);
      }
      nn(rid);
    };
    const doRobber = (p, label, rid) => {
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      ONW.swapPlayers(g, p.id, t.id);
      i.mode = "robber"; i.target = t.id; i.newRole = ONW.shownRole(g.currentRoles[p.id]);
      i.known[p.id] = i.newRole; i.known[t.id] = "robber";
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} と役職を交換し、${rn(i.newRole)} になりました。`);
      nn(rid);
    };
    const doTroublemaker = (p, label, rid) => {
      const i = infoOf(g, p.id), others = g.players.filter((q) => q.id !== p.id), f = forced(p);
      if (others.length < 2) return;
      // デバッグ: 入れ替える2人の指定（1人だけ指定なら、もう1人はランダム）
      let pair = (f.players || []).filter((id, k, arr) => validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
      if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(others.filter((q) => !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
      const [a, b] = pair.map((id) => g.players.find((q) => q.id === id));
      g.tmQueue.push({ id: p.id, a: a.id, b: b.id });     // 反映は夜の終わり（net.js）
      i.mode = "tm"; i.pair = [a.id, b.id];
      g.nightLogsAll.push(`${label} ${p.name} は ${a.name} と ${b.name} の役職を入れ替えました。`);
      nn(rid);
    };
    const doLove = (p, label, rid) => {   // 一目惚れしてるてる: 一目惚れする相手を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の選択になる）
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      ONW.setRoleBound(g, "loveTargets", p.id, t.id);   // 役職についていく（state.js の【必読】メモ参照）。移動「あと」に選んでも現在の持ち主に予約される
      i.mode = "love"; i.target = t.id;
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を選んでいました。`);
      nn(rid);
    };
    const doFreeter = (p, label, rid) => {   // フリーター: 就職先を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の就職先になる）。就職先の初期役職を知る
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      ONW.setRoleBound(g, "freeterTargets", p.id, t.id);
      i.mode = "freeter"; i.target = t.id; i.known[t.id] = g.initialRoles[t.id];
      g.nightLogsAll.push(`${label} ${p.name} は ${rn(g.initialRoles[t.id])} の ${t.name} に就職しました。`);
      nn(rid);
    };
    const doVisitor = (p, label, rid) => {   // 訪問者: 訪問する相手を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の訪問先になる）。相手の役職は分からない
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      if (!t) return;
      ONW.setRoleBound(g, "visitorTargets", p.id, t.id);
      i.mode = "visitor"; i.target = t.id;
      if (stage === "late") (cpu.lateVisits = cpu.lateVisits || []).push({ from: p.id, to: t.id });   // 昼（酔い覚め後）の訪問: 訪問された人への通知用
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を訪問しました。`);
      nn(rid);
    };
    // グレムリン: 2人（コピー元 → コピー先）を選び、その時点のコピー元の役職をコピー先にコピーする。コピー元の役職は本人が知る（朝に分かる）
    const doGremlin = (p, label, rid) => {
      const f = forced(p), i = infoOf(g, p.id);
      const all = g.players;
      if (all.length < 2) return;
      let pair = (f.players || []).filter((id, k, arr) => validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
      if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(g.players.filter((q) => q.id !== p.id && !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
      if (pair.length < 2) return;
      const [a, b] = pair, seen = g.currentRoles[a], got = ONW.gremlinCopy(g, a, b), shown = ONW.shownRole(got), sa = ONW.shownRole(seen);
      ONW.setRoleBound(g, "gremlinPicks", p.id, [a, b]);
      i.mode = "gremlin"; i.gremlin = { from: a, to: b, role: sa };
      i.known[a] = sa; i.known[b] = shown;
      g.nightLogsAll.push(`${label} ${p.name} は ${nameOf(g, a)} の役職を ${nameOf(g, b)} にコピーしました（${rn(got)}）。`);
      nn(rid);
    };
    const doRelic = (p) => {
      const i = infoOf(g, p.id);
      if (!g.center.length) return;
      const fg = (forced(p).graves || []).filter((k) => k >= 0 && k < g.center.length);   // デバッグ: 交換する墓地の指定
      const idx = fg.length ? fg[0] : pick([...g.center.keys()]), got = g.center[idx], seen = ONW.shownRole(got);   // seen: 本人が思う新しい役職（忘却の人狼・狼憑きは村人、狼夢人は人狼）
      ONW.swapGrave(g, p.id, idx);
      i.mode = "relic"; i.graveIdx = idx; i.newRole = seen; i.known[p.id] = seen;
      g.nightLogsAll.push(`${rn("relic_robber")} ${p.name} は 墓地${idx + 1} と役職を交換し、${rn(got)} になりました。`);
      i.relic = { graveIdx: idx, newRole: seen };
      if (got === ONW.ROLE.EXECUTIONER) { const tid = ONW.execTarget(g, p.id); if (tid) i.execTarget = tid; }   // 墓地から引いた処刑人: 新しいターゲットが決まっていて、引いた本人は朝に知る
      if (got === ONW.ROLE.SERVANT) { const mid = ONW.servantMaster(g, p.id); if (mid) i.master = mid; }   // 墓地から引いた従者: 新しいご主人が決まっていて、引いた本人は朝に知る（怪盗で奪った場合は役職名だけ）
      // 交換後の役職に夜行動があれば、朝に使う（runNight の "morning" 段階）
      i.pendingChain = ["seer", "mad_seer", "robber", "gremlin", "troublemaker", "love_tanner", "freeter", "visitor", "doppelganger"].includes(got) ? got : null;
      nn("relic_robber");
    };

    // ドッペルゲンガー: 選んだ人のその時点の役職をコピーする（選ばれた人は動かない）。コピーした役職の夜の情報も、その場で知る（朝に分かる）。能力は朝に使う
    const doDoppel = (p) => {
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      if (!t) return;
      const seen = g.currentRoles[t.id], got = ONW.copyRole(g, t.id, p.id), shown = ONW.shownRole(got);
      i.mode = "doppel"; i.target = t.id; i.newRole = shown; i.known[p.id] = shown; i.known[t.id] = ONW.shownRole(seen);
      i.doppel = { target: t.id, newRole: shown };
      g.nightLogsAll.push(`${rn("doppelganger")} ${p.name} は ${t.name} をコピーし、${rn(got)} になりました。`);
      cpu.learnInfo(g, p.id, got);
      i.pendingChain = ["seer", "mad_seer", "robber", "relic_robber", "gremlin", "troublemaker", "love_tanner", "freeter", "visitor"].includes(got) ? got : null;
      nn("doppelganger");
    };

    const on = (s) => all || stage === s;
    if (on("seer")) cpus.filter((p) => role(p) === "seer" || role(p) === "mad_seer").forEach((p) => doSeer(p, rn(role(p)), false, role(p)));
    if (on("seer")) cpus.filter((p) => role(p) === "love_tanner").forEach((p) => doLove(p, rn(role(p)), role(p)));
    if (on("seer")) cpus.filter((p) => role(p) === "freeter").forEach((p) => doFreeter(p, rn(role(p)), role(p)));
    if (on("seer")) cpus.filter((p) => role(p) === "visitor").forEach((p) => doVisitor(p, rn(role(p)), role(p)));
    if (on("relic")) cpus.filter((p) => role(p) === "relic_robber").forEach((p) => doRelic(p));
    if (on("doppel")) cpus.filter((p) => role(p) === "doppelganger").forEach((p) => doDoppel(p));
    if (on("robber")) cpus.filter((p) => role(p) === "robber").forEach((p) => doRobber(p, rn(role(p)), role(p)));
    if (on("gremlin")) cpus.filter((p) => role(p) === "gremlin").forEach((p) => doGremlin(p, rn(role(p)), role(p)));
    if (on("tm")) cpus.filter((p) => role(p) === "troublemaker").forEach((p) => doTroublemaker(p, rn(role(p)), role(p)));
    // 朝: 墓荒らしが交換した後の役職の能力を即座に使う（朝の時点の実際のカードが対象。いたずらっ子の入れ替えは呼び出し側で反映）
    if (on("morning") || stage === "late") for (let pass = 0; pass < (stage === "late" ? 2 : 1); pass++) cpus.forEach((p) => {   // 昼に墓地と交換した先に能力があれば、もう1回（pass 2）続けて使う
      const i = infoOf(g, p.id), got = i.pendingChain;
      if (!got) return;
      i.pendingChain = null;
      const label = rn(got), keep = i.relic ? { ...i.relic } : null;
      if (got === "doppelganger") { doDoppel(p); return; }   // 墓荒らしが引いたドッペルゲンガー: 朝にコピー
      if (got === "relic_robber") { doRelic(p); return; }   // 昼の墓荒らし: 墓地と交換（交換先に能力があれば doRelic が次の pendingChain を立てる）
      if (got === "seer" || got === "mad_seer") doSeer(p, label, true, got);
      else if (got === "robber") doRobber(p, label, got);
      else if (got === "troublemaker") doTroublemaker(p, label, got);
      else if (got === "gremlin") doGremlin(p, label, got);
      else if (got === "love_tanner") doLove(p, label, got);
      else if (got === "freeter") doFreeter(p, label, got);
      else if (got === "visitor") doVisitor(p, label, got);
      i.relic = keep;
    });
  };

  /** 酔いが覚めたCPU: その時点の最終役職を知り、仲間の情報を得て、能力のある役職なら今使う */
  /** 最終的に手にした役職 fin の「夜の始まりに見えるはずの情報」（仲間の人狼・共有者・神・墓地・従者のご主人など）を、CPUが知る。
   *  酔いが覚めたCPU（sober）と、ドッペルゲンガーでコピーしたCPUが使う */
  cpu.learnInfo = function (g, id, fin) {
    const vis = (r) => ONW.VISIBLE_WOLF.includes(r), ini = (q) => g.initialRoles[q.id];
    const i = infoOf(g, id);
    if (vis(fin) && fin !== "forgetful_wolf") g.players.forEach((q) => { if (q.id !== id && vis(ini(q))) i.known[q.id] = ini(q); });
    if (fin === "cultist") g.players.forEach((q) => { if (vis(ini(q))) i.known[q.id] = ini(q); });
    if (fin === "merlin") g.players.forEach((q) => { if (q.id !== id && isWolf(ini(q))) i.known[q.id] = ini(q); });
    if (fin === "mason") g.players.forEach((q) => { if (q.id !== id && ini(q) === "mason") i.known[q.id] = "mason"; });
    if (fin === "big_wolf") g.center0.forEach((c, idx) => i.grave.push({ idx, role: c }));
    if (fin === "god") { g.players.forEach((q) => { i.known[q.id] = ini(q); }); g.center0.forEach((c, idx) => i.grave.push({ idx, role: c })); }
    if (fin === "servant") { const mid = ONW.servantMaster(g, id); if (mid) i.master = mid; }   // 従者: ご主人を知る
    if (fin === "executioner") { const tid = ONW.execTarget(g, id); if (tid) i.execTarget = tid; }   // 処刑人: ターゲットを知る
  };
  cpu.sober = function (g, ids) {
    g.cpuInfo = g.cpuInfo || {};
    ids.forEach((id) => {
      const i = infoOf(g, id), fin = g.currentRoles[id], shown = ONW.shownRole(fin);
      i.known[id] = shown;
      cpu.learnInfo(g, id, fin);
      if (fin === "insomniac") { i.mode = "insomniac"; i.finalRole = shown; }
      i.pendingChain = ["seer", "mad_seer", "robber", "relic_robber", "doppelganger", "gremlin", "troublemaker", "love_tanner", "freeter", "visitor"].includes(fin) ? fin : null;   // ドッペルゲンガーも酔い覚め後にコピーする
    });
    cpu.lateVisits = [];
    cpu.runNight(g, "late", ids);
    return cpu.lateVisits;
  };

  /** 従者通知を受けたCPUのご主人: 自分に従者がいることを知る（誰かは分からない） */
  cpu.noticeServant = function (g, id) {
    g.cpuInfo = g.cpuInfo || {};
    infoOf(g, id).hasServant = true;
  };

  /** 訪問されたCPU: 待機時間に、訪問してきた人（最終盤面で訪問者のカードを持っている人）を知る */
  cpu.noticeVisitors = function (g, id, visitorIds) {
    g.cpuInfo = g.cpuInfo || {};
    const i = infoOf(g, id);
    i.visitedBy = [...new Set([...(i.visitedBy || []), ...visitorIds])];
    visitorIds.forEach((v) => { i.known[v] = "visitor"; });
  };

  /** 昼に役職が入れ替わって後覚者の能力が発動したCPU: 最終的な役職を知る */
  cpu.notifyInsom = function (g, id) {
    g.cpuInfo = g.cpuInfo || {};
    const i = infoOf(g, id), fin = ONW.shownRole(g.currentRoles[id]);
    i.mode = "insomniac"; i.finalRole = fin; i.known[id] = fin;
  };

  /** 夜が全部終わったあと（いたずらっ子の反映後）に、CPUの後覚者が最終役職を知る */
  cpu.afterNight = function (g) {
    g.players.filter((p) => p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]) && g.initialRoles[p.id] === "insomniac").forEach((p) => {
      const i = infoOf(g, p.id), fin = ONW.shownRole(g.currentRoles[p.id]);
      i.mode = "insomniac"; i.finalRole = fin; i.known[p.id] = fin;
    });
  };

  // =========================================================
  // 昼の発言（CO・騙り・結果開示）と投票。本家(マイクラ版)のCPUの考え方に合わせてある
  // =========================================================
  const isWolfSide = (r) => isWolf(r) || isMad(r);                       // 人狼陣営（狂人含む）= 本家の isWolfTeam
  const WOLF_LIKE = () => ONW.WOLF_KIND;                                  // 占い結果で「人狼」と見える役職
  const AVOID_RESULT = ["tanner", "love_tanner", "opportunist"];          // 投票を避ける結果役職（本家 cpuVoteAvoidResultRoles）
  const setupRoles = (g) => [...Object.values(g.initialRoles || {}), ...(g.center0 || g.center || [])];   // 占い結果に出してよい（実在する）役職
  const roleInSetup = (g, role) => setupRoles(g).includes(role) || (g.coDeck || []).some((x) => x.r === role);
  /** この試合に実在するその役職のカード枚数（配られた役職 + 墓地） */
  const roleCount = (g, role) => setupRoles(g).filter((r) => r === role).length;
  /**
   * 怪盗・墓荒らしの騙り結果で「手にした」と言える役職か。
   * 怪盗が怪盗を、墓荒らしが墓荒らしを手にするには、そのカードが2枚以上ないと成り立たないので、1枚以下なら言わない
   */
  const canGetByClaim = (g, kind, role) => !((kind === "robber" && role === "robber") || (kind === "relic" && role === "relic_robber")) || roleCount(g, role) >= 2;
  const weighted = (list) => {   // [[値, 重み], ...]
    let r = Math.random() * list.reduce((a, b) => a + b[1], 0);
    for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
    return list[list.length - 1][0];
  };
  /** 偽の占い結果に使う役職。実在する役職の中から、希望の役職を優先して選ぶ（本家 cpuPickSeerResultRole） */
  function pickResultRole(g, preferred, ok) {
    const pool = [...new Set(setupRoles(g))].filter((r) => !ok || ok(r));   // ok: 言ってよい役職だけに絞る（任意）
    const pref = preferred.filter((r) => pool.includes(r));
    return pick(pref.length ? pref : pool.length ? pool : ["villager"]);
  }
  const wolfLikeResult = (g) => pickResultRole(g, WOLF_LIKE());
  const villageLikeResult = (g, ok) => pickResultRole(g, ["villager", "mason", "seer", "robber", "troublemaker", "insomniac"], ok);
  /** 騙り占いの対象: 人狼陣営は本物の人狼を避ける（本家 chooseFakeSeerTarget） */
  function fakeSeerTarget(g, p) {
    const others = g.players.filter((q) => q.id !== p.id);
    const nonWolf = others.filter((q) => !isWolf(g.currentRoles[q.id]));
    return pick(nonWolf.length ? nonWolf : others);
  }
  /** 騙り占いの結果（本家 chooseFakeSeerResult） */
  function fakeSeerResult(g, p, t, selfRole) {
    const tr = g.currentRoles[t.id];
    if (selfRole === "mad_seer") {   // 狂った占い師: 人狼・狂人には村人っぽい結果、それ以外には本当の結果
      if (isWolf(tr) || isMad(tr) || (g.promotedWolfIds || []).includes(t.id)) return villageLikeResult(g);
      return setupRoles(g).includes(g.initialRoles[t.id]) ? g.initialRoles[t.id] : villageLikeResult(g);
    }
    if (isWolfSide(selfRole)) {
      if (isWolf(tr)) return villageLikeResult(g);                                // 仲間の人狼は白と言う
      return Math.random() < 0.72 ? wolfLikeResult(g) : villageLikeResult(g);      // 72%で人狼だと告発
    }
    return Math.random() < 0.5 ? wolfLikeResult(g) : villageLikeResult(g);         // 非人狼の騙り（てるてる系）
  }
  /** 騙りで名乗る役職の抽選（本家 makeClaimPlan の人狼陣営の分）。山札に無い役職は名乗らない。マーリンは騙り禁止 */
  function pickLieRole(g) {
    const chosen = weighted([["seer", 40], ["villager", 18], ["troublemaker", 12], ["robber", 12], ["mason", 9], ["servant", 6], ["visitor", 5]]);   // 従者は村人陣営以外だけが騙れる（本家も配役にいるときだけ、低めの確率）
    if (roleInSetup(g, chosen)) return chosen;   // 村人も、配役にいるときだけ名乗る
    const fb = ["seer", "troublemaker", "robber", "mason"].filter((r) => r !== chosen && roleInSetup(g, r));
    return fb.length ? pick(fb) : "villager";
  }
  /** あり得る村役職 = この試合に実在する村人陣営の役職（変化後の役職・墓地・COの候補）。村人も、配役に入っているときだけ含む */
  function villageRolesInPlay(g, ok) {
    const pool = [...new Set([...setupRoles(g), ...(g.coDeck || []).map((x) => x.r)])]
      .filter((r) => ONW.roles.getInfo(r).team === "village" && !ONW.TRANSFORM_GROUPS[r] && r !== "merlin" && !ONW.SELF_AS_VILLAGER.includes(r) && !ONW.SELF_AS_WOLF.includes(r) && (!ok || ok(r)));   // マーリンCOは禁止。思い込み系(狼憑き・狼夢人)は本人が名乗れないので騙りにも使わない
    return pool.length ? pool : ["villager"];   // 村人が配役にいないときは名乗らない（最終手段としてだけ村人）
  }
  const fakeVillageRole = (g, ok) => pick(villageRolesInPlay(g, ok));
  /** 村人が配役にいないのに「村人CO」をすると嘘がバレるので、村人COの代わりに名乗れる役職を返す（結果なしのCOだけ） */
  function bareCo(g, pref) {
    if (roleInSetup(g, "villager")) return "villager";
    if (pref && pref !== "villager" && pref !== "merlin") return pref;
    return ["seer", "troublemaker", "robber", "mason", "insomniac"].find((r) => roleInSetup(g, r)) || "villager";
  }
  /** 「ただの村人のふり」をしたいときのCO。村人がいなければ、いる村役職の騙り（占い師なら偽結果つき）にする */
  function plainLie(g, p, selfRole) {
    if (roleInSetup(g, "villager")) return { co: "villager", result: null };
    const pool = ["seer", "troublemaker", "robber", "mason"].filter((r) => roleInSetup(g, r));
    return pool.length ? lieClaim(g, p, selfRole, pick(pool)) : { co: bareCo(g), result: null };
  }
  /** 後覚者の結果開示（本家式）。fin = 最終的な役職。後覚者のままなら「元々後覚者でした。」、変わっていたら「〇〇に役職が変わっていました。」 */
  function insomResult(fin) {
    if (fin === "insomniac") return { short: "元々後覚者", text: "元々後覚者でした。", claim: { kind: "insomniac", role: "insomniac", orig: "insomniac" } };
    return { short: `→ ${rn(fin)}`, text: `${rn(fin)}に役職が変わっていました。`, claim: { kind: "insomniac", role: fin } };
  }
  /** 後覚者を騙るときの嘘の結果開示（結果を言わないと騙りだと透けるので、必ず何か言う） */
  function insomLie(g) {
    const r = Math.random();
    if (r < 0.5) return insomResult("insomniac");                                              // 元々後覚者でした
    const role = fakeVillageRole(g, (x) => x !== "insomniac");
    if (r < 0.8) return insomResult(role);                                                     // 〇〇に役職が変わっていました
    return { short: `元々${rn(role)}`, text: `元々${rn(role)}でした。`, claim: { kind: "insomniac", role: "insomniac", orig: role } };   // 別の役職から後覚者になった
  }
  /**
   * 夜のあとに人外(人狼・狂人・てるてる・第三陣営)の役職を手にしていた怪盗・墓荒らし・後覚者のCPUの騙り。
   *   A) 「村人役を手にした」という嘘（本人の役職COのまま、結果だけ偽る）
   *   B) そもそも最初から村人役だったと名乗る（あり得る村役職を普通に騙る）
   */
  function nonVillageLie(g, p, kind, i, now) {
    if (Math.random() < 0.5) {
      const role = fakeVillageRole(g, (r) => canGetByClaim(g, kind, r));   // 怪盗→怪盗 / 墓荒らし→墓荒らしは、そのカードが2枚以上あるときだけ
      if (kind === "robber") return { co: "robber", result: { short: `${nameOf(g, i.target)} → ${rn(role)}`, text: `${nameOf(g, i.target)} の役職を奪って ${rn(role)} になりました。`, claim: { kind: "robber", target: i.target, role } } };
      if (kind === "doppel") return { co: "doppelganger", result: { short: `${nameOf(g, i.doppel.target)} → ${rn(role)}`, text: `${nameOf(g, i.doppel.target)} をコピーして ${rn(role)} になりました。`, claim: { kind: "doppel", target: i.doppel.target, role } } };
      if (kind === "relic") return { co: "relic_robber", result: { short: `墓地${i.relic.graveIdx + 1} → ${rn(role)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(role)} になりました。`, claim: { kind: "relic", role } } };
      return { co: "insomniac", result: insomResult(role) };
    }
    return lieClaim(g, p, now, fakeVillageRole(g));
  }
  /**
   * マーリンのCPUの騙り。マーリン自身はCO禁止（アサシンに狙われる）なので、別の村役職を名乗る。
   * 人狼が見えているので、占い師を騙るときは「見えている人狼を人狼と告発する / 村人側を村人と言う」
   * （人狼陣営の騙りと違って、本物の人狼を庇わない）。
   */
  function merlinLie(g, p, i) {
    const opts = [["seer", 45], ["villager", 25], ["troublemaker", 10], ["robber", 10], ["mason", 10]].filter(([r]) => roleInSetup(g, r));
    const co = opts.length ? weighted(opts) : bareCo(g);
    if (co === "seer") {
      const others = g.players.filter((q) => q.id !== p.id);
      const wolves = others.filter((q) => isWolf(i.known[q.id])), safe = others.filter((q) => !wolves.includes(q));
      const accuse = wolves.length && (!safe.length || Math.random() < 0.7);   // 見えている人狼を告発する
      const t = accuse ? pick(wolves) : pick(safe.length ? safe : others);
      if (!t) return { co: bareCo(g, co), result: null };
      const real = g.initialRoles[t.id];
      const role = accuse ? (WOLF_LIKE().includes(real) ? real : wolfLikeResult(g)) : villageLikeResult(g);
      return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
    }
    return lieClaim(g, p, "merlin", co);
  }
  /** 従者のCOと結果開示（本当も騙りも同じ形。文言は人間のCOボタンと同じ ONW.servantCoText / servantCoShort） */
  function servantClaim(g, t) {
    if (!t) return { co: "servant", result: null };
    return { co: "servant", result: { short: ONW.servantCoShort(t.name), text: ONW.servantCoText(t.name), claim: { kind: "servant", target: t.id } } };
  }
  /** 騙りの CO と結果開示（本家の mem.fakeRole）。戻り値: { co, result }（resultはnullのこともある） */
  function lieClaim(g, p, selfRole, forceCo) {
    const others = g.players.filter((q) => q.id !== p.id);
    const co = forceCo || pickLieRole(g);
    if (co === "seer") {
      const t = fakeSeerTarget(g, p);
      if (!t) return { co: bareCo(g, co), result: null };
      const role = fakeSeerResult(g, p, t, selfRole);
      return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
    }
    if (co === "troublemaker" && others.length >= 2) {
      const a = pick(others), b = pick(others.filter((q) => q.id !== a.id));
      return { co, result: { short: `${a.name} ⇄ ${b.name}`, text: `${a.name} と ${b.name} を入れ替えました。`, claim: { kind: "troublemaker" } } };
    }
    if (co === "robber") {
      const t = fakeSeerTarget(g, p);
      const pool = ["villager", "mason", "insomniac", "troublemaker"].filter((r) => roleInSetup(g, r));   // 村人がいない配役で「村人を奪った」とは言わない
      const role = pool.length ? pick(pool) : villageLikeResult(g, (r) => canGetByClaim(g, "robber", r));   // 怪盗が1枚しかないのに「怪盗を奪った」とは言わない
      return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} の役職を奪って ${rn(role)} になりました。`, claim: { kind: "robber", target: t.id, role } } };
    }
    if (co === "mason") return { co, result: { short: "自分だけ", text: "共有者は 私だけでした。", claim: { kind: "mason" } } };
    if (co === "visitor" && others.length) { const t = pick(others); return { co, result: { short: `→ ${t.name}`, text: `${t.name} を訪問しました。`, claim: { kind: "visitor", target: t.id } } }; }   // 訪問者の騙り: 適当な誰かを訪問したと言う
    if (co === "servant") return servantClaim(g, pick(others));   // 従者の騙り: 適当な誰かを「ご主人」と言う（本家の fakeServantMaster）
    return { co: forceCo && forceCo !== "villager" ? forceCo : bareCo(g, co), result: null };   // その他の村役職は、結果なしでCOだけする（村人がいなければ村人COはしない）
  }

  /**
   * 昼の発言プラン（CPU1, CPU2… の順に1人ずつ）。
   * 各CPUは人間のCOボタンと同じ形（「〇〇CO」）で名乗り、その直後に結果開示を続けて言う。
   * 戻り値: [{ p, text, claim, gap(次の発言までのms) }]
   */
  cpu.plan = function (g, only) {   // only: 指定すると、そのCPUだけの発言予定を作る（酔いが覚めたCPU用）
    const plan = [];
    g.players.filter((p) => p.isCpu && (!only || only.includes(p.id))).forEach((p) => {
      const od = !!(g.drunkOverlay && g.drunkOverlay[p.id]), hid = ONW.hiddenDrunk(g, p.id);
      // 酔っ払い: 覚めるまでは「酔っ払いCO」だけ。覚めたあとは最終的な役職として振る舞う
      const r = hid ? "drunk" : ONW.shownRole(g.currentRoles[p.id] !== undefined && od ? g.currentRoles[p.id] : g.initialRoles[p.id]), i = infoOf(g, p.id);   // 忘却の人狼のCPUは自分を村人だと思っている
      const others = g.players.filter((q) => q.id !== p.id);
      let coRole = null, result = null, extra = null;   // extra: 結果開示のあとに続けて言う2つ目の結果
      if (hid) { plan.push({ p, text: `${rn("drunk")}CO`, co: "drunk", claim: { kind: "villager" }, gap: 3500 }); return; }
      if (g.currentRoles[p.id] === "star") {                               // スター: 待機時間に全員へ公開済みなので、必ずスターCOする
        plan.push({ p, text: `${rn("star")}CO`, co: "star", claim: { kind: "villager" }, gap: 3500 });
        return;
      }
      if (isWolfSide(r)) {                                                 // 人狼陣営は必ず騙る（本家 liarMode）
        const lie = lieClaim(g, p, r);
        coRole = lie.co; result = lie.result;
      } else if (r === "seer" && i.mode === "player") {
        coRole = "seer";
        result = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} を占って ${rn(i.known[i.target])} でした。`, claim: { kind: "seer", target: i.target, role: i.known[i.target] } };
      } else if (r === "seer") {
        coRole = "seer";
        result = { short: i.grave.map((c) => `墓地${c.idx + 1} → ${rn(c.role)}`).join("、"), text: i.grave.map((c) => `墓地${c.idx + 1} を見て ${rn(c.role)}`).join("、") + " でした。", claim: { kind: "seer-grave" } };
      } else if (r === "robber") {
        coRole = "robber";
        if (isNonVillage(i.newRole)) { const lie = nonVillageLie(g, p, "robber", i, i.newRole); coRole = lie.co; result = lie.result; }   // 人外を手にした: 村人役を騙る
        else result = { short: `${nameOf(g, i.target)} → ${rn(i.newRole)}`, text: `${nameOf(g, i.target)} の役職を奪って ${rn(i.newRole)} になりました。`, claim: { kind: "robber", target: i.target, role: i.newRole } };
      } else if (r === "relic_robber" && !i.relic) {                   // 墓荒らし（交換情報なし）: COだけする
        coRole = "relic_robber";
      } else if (r === "relic_robber") {                               // 墓荒らし
        coRole = "relic_robber";
        if (isNonVillage(i.relic.newRole)) { const lie = nonVillageLie(g, p, "relic", i, i.relic.newRole); coRole = lie.co; result = lie.result; }
        else result = { short: `墓地${i.relic.graveIdx + 1} → ${rn(i.relic.newRole)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(i.relic.newRole)} になりました。`, claim: { kind: "relic", role: i.relic.newRole } };
      } else if (r === "doppelganger" && !i.doppel) {                  // ドッペルゲンガー（コピー情報なし）: COだけする
        coRole = "doppelganger";
      } else if (r === "doppelganger") {                               // ドッペルゲンガー: 選んだ人と、コピーして手にした役職を開示（人外を手にしたら村人役を騙る）
        coRole = "doppelganger";
        const dt = nameOf(g, i.doppel.target), dn = i.doppel.newRole;
        if (isNonVillage(dn)) { const lie = nonVillageLie(g, p, "doppel", i, dn); coRole = lie.co; result = lie.result; }
        else {
          result = { short: `${dt} → ${rn(dn)}`, text: `${dt} をコピーして ${rn(dn)} になりました。`, claim: { kind: "doppel", target: i.doppel.target, role: dn } };
          if ((dn === "seer" || dn === "mad_seer") && i.mode === "player") extra = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} を占って ${rn(i.known[i.target])} でした。`, claim: { kind: "seer", target: i.target, role: i.known[i.target] } };   // コピーした占い師の結果も続けて開示する
        }
      } else if (r === "troublemaker" && !i.pair) {                    // いたずらっ子（入れ替え情報なし）: COだけする
        coRole = "troublemaker";
      } else if (r === "troublemaker") {                               // いたずらっ子
        coRole = "troublemaker";
        result = { short: `${nameOf(g, i.pair[0])} ⇄ ${nameOf(g, i.pair[1])}`, text: `${nameOf(g, i.pair[0])} と ${nameOf(g, i.pair[1])} を入れ替えました。`, claim: { kind: "troublemaker" } };
      } else if (r === "insomniac" && !i.finalRole) {                  // 後覚者（情報なし）: COだけする
        coRole = "insomniac";
      } else if (r === "insomniac") {                                  // 後覚者
        coRole = "insomniac";
        if (isNonVillage(i.finalRole)) { const lie = nonVillageLie(g, p, "insomniac", i, i.finalRole); coRole = lie.co; result = lie.result; }
        else result = insomResult(i.finalRole);
      } else if (r === "mason") {                                       // 共有者: 相方の名前を開示
        coRole = "mason";
        const mates = others.filter((q) => i.known[q.id] === "mason");
        result = { short: mates.length ? `相方: ${mates.map((q) => q.name).join("、")}` : "自分だけ", text: mates.length ? `共有者は 私と ${mates.map((q) => q.name).join("、")} でした。` : "共有者は 私だけでした。", claim: { kind: "mason" } };
      } else if (r === "baker") {                                        // パン屋: パンが焼けたことは全員に知らされるので、必ずパン屋COする
        coRole = "baker";
      } else if (r === "merlin") {                                      // マーリン: 人狼が見えているので、別の村役職を騙る（マーリンCOは禁止）
        const lie = merlinLie(g, p, i);
        coRole = lie.co; result = lie.result;
      } else if (r === "servant") {                                     // 従者: 本家どおり35%で本当にCO（ご主人を開示）、残りは村人騙り。ご主人を知らない(怪盗で奪った等)ときは、本当のCOはしない
        const mt = i.master && others.find((q) => q.id === i.master);
        if (mt && Math.random() < 0.35) { const c = servantClaim(g, mt); coRole = c.co; result = c.result; }
        else { const pl = plainLie(g, p, r); coRole = pl.co; result = pl.result; }
      } else if (r === "freeter") {                                     // フリーター: 半分は本当にCO（就職先と、その初期役職を開示）、残りは村人騙り
        if (i.mode === "freeter" && Math.random() < 0.5) {
          coRole = "freeter";
          result = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} に就職しました。初期役職は ${rn(i.known[i.target])} でした。`, claim: { kind: "freeter", target: i.target, role: i.known[i.target] } };
        } else { const pl = plainLie(g, p, r); coRole = pl.co; result = pl.result; }
      } else if (r === "visitor" && i.mode === "visitor" && i.target) {   // 訪問者: 必ず訪問者COして、訪問先を開示する
        coRole = "visitor";
        result = { short: `→ ${nameOf(g, i.target)}`, text: `${nameOf(g, i.target)} を訪問しました。`, claim: { kind: "visitor", target: i.target } };
      } else if (r === "villager") {
        coRole = "villager";   // 村人は必ずCOする（以前は約1割がCOしなかった）
      } else if (r === "tanner" || r === "love_tanner") {               // てるてる系: 55%村人騙り、残りの半分は占い騙り（本家）。どれでも必ず何かをCOする
        { const pl = plainLie(g, p, r); coRole = pl.co; result = pl.result; }   // 村人がいなければ別の村役職を騙る
        if (Math.random() >= 0.55 && Math.random() < 0.5) {
          const t = fakeSeerTarget(g, p);
          if (t) {
            const role = fakeSeerResult(g, p, t, r);
            coRole = "seer";
            result = { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } };
          }
        }
      } else if (r === "mayor") {                                       // メイヤー: 本家どおり70%で本当にメイヤーCO、残り30%は村人騙り（村人が配役にいないときは、いる村役職の騙り）
        if (Math.random() < 0.7) coRole = "mayor";
        else { const pl = plainLie(g, p, r); coRole = pl.co; result = pl.result; }
      } else if (ONW.roles.getInfo(r).team === "village") {              // その他の村人陣営（わら人形・猫又など）: 必ず自分の役職をCO
        coRole = r;
      } else {                                                           // 神・天邪鬼・オポチュニストなど（人狼でもてるてる系でもない第三陣営）: 村人を騙る（村人がいなければ別の村役職）
        const pl = plainLie(g, p, r); coRole = pl.co; result = pl.result;
      }
      if (coRole && !result && !isWolfSide(r) && i.visitedBy && i.visitedBy.length && Math.random() < 0.6) {   // 訪問された（本当）: 訪問してきた人を開示する
        const vn = i.visitedBy.map((v) => nameOf(g, v)).join("、");
        result = { short: `${vn} が訪問`, text: `${vn} が訪問してきました。`, claim: { kind: "visited", from: i.visitedBy[0] } };
      }
      if (coRole === "insomniac" && !result && (r !== "insomniac" || i.finalRole)) result = insomLie(g);   // 後覚者を騙るのに結果を言わないと透けるので、嘘の結果開示もする
      if (!coRole) return;                                              // COしない
      plan.push({ p, text: `${rn(coRole)}CO`, co: coRole, claim: result ? null : { kind: "villager" }, gap: result ? 1200 : 3500 });
      if (result) plan.push({ p, text: result.text, short: result.short, result: true, claim: result.claim, gap: extra ? 1200 : 3500 });
      if (result && extra) plan.push({ p, text: extra.text, short: extra.short, result: true, claim: extra.claim, gap: 3500 });
    });
    return plan;
  };

  /** アサシンのCPUが暗殺する相手: 仲間と分かっている人は避け、あとはランダム */
  cpu.assassinPick = function (g, id, cands) {
    const i = infoOf(g, id);
    const pool = cands.filter((c) => !isWolf(i.known[c]));
    return pick(pool.length ? pool : cands);
  };

  /**
   * CPU本人が思っている今の役職（自認）。怪盗・墓荒らし・後覚者で知った役職があればそれ、なければ最初に配られた役職。
   * いたずらっ子や他人の怪盗に入れ替えられたことは本人には分からないので、実際の今の役職は見ない。
   */
  const selfRole = (g, p) => (ONW.hiddenDrunk(g, p.id) ? "villager" : infoOf(g, p.id).known[p.id] || ONW.shownRole(g.initialRoles[p.id]));   // 酔いが覚める前のCPUは自分の役職を知らない
  const alive = (g, id) => !(g.deadIds || []).includes(id);
  /** 投票先候補（本家 chooseBestVoteTarget: 自分以外・生存・共有者の相方は除く） */
  /** 従者のCPUが知っているご主人（自認が従者で、ご主人を知っているときだけ。怪盗で奪った従者などは知らない） */
  const masterOfServant = (g, p) => (selfRole(g, p) === "servant" && infoOf(g, p.id).master) || null;
  function voteCandidates(g, p) {
    const i = infoOf(g, p.id), me = selfRole(g, p);
    const mate = ONW.loverMate(g, p.id);   // 恋人の相方には投票しない（追放されると心中で一緒に敗北するため）
    const master = masterOfServant(g, p);  // 従者は自分のご主人には投票しない（予告でも嘘の投票先にも出さない。ご主人が追放されそうだと身代わりで死ぬため）
    return g.players.filter((q) => q.id !== p.id && q.id !== mate && q.id !== master && alive(g, q.id) && !(me === "mason" && i.known[q.id] === "mason"));
  }

  /** 投票先の評価点（本家 scoreTargetForCpu を、この版にある役職に合わせたもの） */
  function scoreVote(g, p, q) {
    const i = infoOf(g, p.id), me = selfRole(g, p), ini = g.drunkOverlay && g.drunkOverlay[p.id] ? me : ONW.shownRole(g.initialRoles[p.id]);
    const wolfSide = isWolfSide(me);
    const k = i.known[q.id];
    const claims = g.cpuClaims || [];
    const co = (g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co) || null;
    let s = 0;
    // 仲間は投票しない（人狼系は仲間の人狼、狂信者は人狼）
    if ((isWolf(me) || ini === "cultist") && isWolf(k)) s -= 100;
    // 自分が見て知っている情報: 村人側と分かっている人は避ける / 投票を避ける結果役職は避ける / 人狼と分かっている人は狙う
    if (k && !wolfSide) {
      if (isWolf(k)) s += 12;
      else if (AVOID_RESULT.includes(k)) s -= 100;
      else if (ONW.roles.getInfo(k).team === "village") s -= 100;
    }
    // 他人のCO（役職）
    if (co === "villager") s += wolfSide ? 1.8 : 0.8;
    if (co && WOLF_LIKE().includes(co) || co === "team:wolf") s += wolfSide ? -1.0 : 2.4;
    if (co === "tanner" || co === "love_tanner") s -= wolfSide ? 0.6 : 2.4;
    if (co === "seer" || co === "mad_seer") {
      const n = g.players.filter((x) => { const c = g.coBoard && g.coBoard[x.id] && g.coBoard[x.id].co; return c === "seer" || c === "mad_seer"; }).length;
      s += n >= 2 ? (wolfSide ? 0.6 : 1.5) : (wolfSide ? -0.3 : -0.8);
    }
    if (co === "mason") s -= wolfSide ? 0.2 : 1.4;
    // 占い師COの結果（この人を占ったという報告）
    claims.filter((c) => c.kind === "seer" && c.target === q.id).forEach((c) => {
      if (WOLF_LIKE().includes(c.role)) s += wolfSide ? 0.8 : 2.8;
      else if (c.role === "tanner" || c.role === "love_tanner") s -= wolfSide ? 0.5 : 2.2;
      else s += wolfSide ? -0.4 : -1.0;
      if (c.from === p.id) {   // 自分が報告した結果には従う（本家）
        if (WOLF_LIKE().includes(c.role)) s += 12;
        else if (AVOID_RESULT.includes(c.role) || ONW.roles.getInfo(c.role).team === "village") s -= 100;
      }
    });
    // 人狼を奪ったと名乗る怪盗系（本家に近い読み）
    if (!wolfSide) claims.forEach((c) => { if ((c.kind === "robber" || c.kind === "relic" || c.kind === "insomniac" || c.kind === "doppel") && WOLF_LIKE().includes(c.role) && c.from === q.id && c.from !== p.id) s += 3; });
    // 「人狼をコピーした」と名乗るドッペルゲンガーが選んだ相手も、初期役職は人狼（本当のことを言っているなら）
    if (!wolfSide) claims.forEach((c) => { if (c.kind === "doppel" && WOLF_LIKE().includes(c.role) && c.target === q.id && c.from !== p.id && c.from !== q.id) s += 1.5; });
    // 他のCPUの投票予告（同調）+0.6、味方の予告 +1.2。人外CPUの予告は嘘のことがあるので、仲間(人狼を知っている側)は仲間の本当の投票先を見る
    const plans = g.cpuVotePlan || {}, reals = g.cpuRealVote || {};
    Object.entries(plans).forEach(([vid, t]) => {
      if (vid === p.id) return;
      const ally = (isWolf(me) || ini === "cultist") && isWolf(i.known[vid]);
      if ((ally ? (reals[vid] || t) : t) !== q.id) return;
      s += 0.6;
      if (ally) s += 1.2;
    });
    if (me === "tanner" || me === "love_tanner") s += 1.0;
    // 処刑人: ターゲットを追放させたいので、ターゲットに投票する（ターゲットを知っているときだけ。怪盗で奪った処刑人などは知らない）
    if (me === "executioner" && i.execTarget === q.id) s += 15;
    // 従者: ご主人が投票を予告していれば、それに合わせる（本家: 約7割の従者がご主人に合わせる。ご主人への投票は候補から外している）
    const master = masterOfServant(g, p);
    if (master) {
      if (i.followMaster === undefined) i.followMaster = Math.random() < 0.7;
      if (i.followMaster && (g.cpuVotePlan || {})[master] === q.id) s += 8;
    }
    return s;
  }

  /** 評価点から投票先を選ぶ（本家 chooseBestVoteTarget + weightedCpuVoteChoice: 上位4点差以内から温度1.8で抽選） */
  function chooseVote(g, p) {
    const cands = voteCandidates(g, p);
    if (!cands.length) return null;
    const scored = cands.map((q) => ({ id: q.id, score: scoreVote(g, p, q) })).filter((x) => x.score > -50).sort((a, b) => b.score - a.score);
    if (!scored.length) return pick(cands).id;
    const top = scored[0].score, pool = scored.filter((x) => x.score >= top - 4.0);
    if (pool.length === 1) return pool[0].id;
    const w = pool.map((x) => Math.exp((x.score - top) / 1.8));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let n = 0; n < pool.length; n++) { r -= w[n]; if (r <= 0) return pool[n].id; }
    return pool[pool.length - 1].id;
  }

  /** 自認が人外のCPU（人狼・狂人・てるてる・第三陣営）が、投票先の予告で嘘をつく確率 */
  const VOTE_LIE_RATE = 0.5;
  /** 嘘の投票先: 本当の投票先以外で、自分の仲間と分かっている人は避ける */
  function fakeVoteTarget(g, p, real) {
    const i = infoOf(g, p.id);
    const cands = voteCandidates(g, p).filter((q) => q.id !== real);
    const pool = cands.filter((q) => !isWolf(i.known[q.id]));
    const c = pool.length ? pool : cands;
    return c.length ? pick(c).id : real;
  }
  /**
   * 残り20秒の投票意思表明。
   * 戻り値の target は本当に入れる先、said は予告した先（人外CPUは嘘をつくことがある）。
   * 予告(cpuVotePlan)は全員に見える情報、本当の投票先(cpuRealVote)は本人と人狼の仲間だけが知っている。
   */
  cpu.announceVote = function (g, p) {
    g.cpuVotePlan = g.cpuVotePlan || {}; g.cpuRealVote = g.cpuRealVote || {};
    const forcedT = g.dbgVotes && g.dbgVotes[p.id];   // デバッグで投票先を指定されたCPUは嘘をつかない
    if (forcedT) { g.cpuVotePlan[p.id] = forcedT; g.cpuRealVote[p.id] = forcedT; return { target: forcedT, said: forcedT, text: `${nameOf(g, forcedT)}に入れようと思います。` }; }
    const cands = voteCandidates(g, p);
    const realCur = g.cpuRealVote[p.id] || g.cpuVotePlan[p.id], saidCur = g.cpuVotePlan[p.id];
    const realOk = realCur && alive(g, realCur) && realCur !== p.id && cands.some((q) => q.id === realCur) && scoreVote(g, p, g.players.find((q) => q.id === realCur)) > -50;
    const saidOk = saidCur && alive(g, saidCur) && saidCur !== p.id && cands.some((q) => q.id === saidCur);
    let real = realCur, said = saidCur;
    if (!(realOk && saidOk)) {
      real = chooseVote(g, p);
      const me = selfRole(g, p);   // 自認が人外のときだけ嘘をつく（実際の役職は見ない）
      said = real && isNonVillage(me) && Math.random() < VOTE_LIE_RATE ? fakeVoteTarget(g, p, real) : real;   // 村人側と思っているCPUは本当のことを言う
      g.cpuRealVote[p.id] = real; g.cpuVotePlan[p.id] = said;
    }
    return { target: real, said, text: `${nameOf(g, said)}に入れようと思います。` };
  };

  /** 投票先を決める */
  cpu.decideVote = function (g, p) { return chooseVote(g, p); };

  ONW.cpu = cpu;
})(window.ONW);
