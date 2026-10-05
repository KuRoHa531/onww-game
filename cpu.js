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

  /** CPUの夜行動（占い師系 → 怪盗 → 墓荒らし → いたずらっ子の順）。占いは初期役職を見るので順序に影響されない */
  cpu.runNight = function (g, stage) {   // stage: "init" | "seer" | "relic" | "robber" | "tm"（省略時は全部を起床順に実行）
    const all = !stage;
    if (all || stage === "init") g.cpuInfo = {};
    g.cpuInfo = g.cpuInfo || {};
    const cpus = g.players.filter((p) => p.isCpu);
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
      if (role(p) === "big_wolf") g.center0.forEach((c, idx) => infoOf(g, p.id).grave.push({ idx, role: c }));
      if (role(p) === "god") {   // 神: 全員の初期役職と墓地を知っている
        g.players.forEach((q) => { infoOf(g, p.id).known[q.id] = role(q); });
        g.center0.forEach((c, idx) => infoOf(g, p.id).grave.push({ idx, role: c }));
      }
    });
    const forced = (p) => (ONW.debug ? ONW.debug.cpuTarget(g, p.id) : null) || {};   // デバッグ: 能力先の指定
    const validPlayer = (p, id) => id && id !== p.id && g.players.some((q) => q.id === id);

    const doSeer = (p, label, cur) => {   // cur: 朝に使うとき（朝の時点の実際のカードを見る）
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
        idxs.slice(0, lim).forEach((k) => i.grave.push({ idx: k, role: graveNow[k] }));
        i.grave.forEach((x) => g.nightLogsAll.push(`${label} ${p.name} は 墓地${x.idx + 1} を確認し、${rn(x.role)} でした。`));
      } else {
        const t = fp ? g.players.find((q) => q.id === fp) : pick(g.players.filter((q) => q.id !== p.id));
        i.mode = "player"; i.target = t.id; i.known[t.id] = ONW.seerSees(rolesNow[t.id]);
        g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を占い、${rn(ONW.seerSees(rolesNow[t.id]))} でした。`);
      }
    };
    const doRobber = (p, label) => {
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      ONW.swapPlayers(g, p.id, t.id);
      i.mode = "robber"; i.target = t.id; i.newRole = ONW.shownRole(g.currentRoles[p.id]);
      i.known[p.id] = i.newRole; i.known[t.id] = "robber";
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} と役職を交換し、${rn(i.newRole)} になりました。`);
    };
    const doTroublemaker = (p, label) => {
      const i = infoOf(g, p.id), others = g.players.filter((q) => q.id !== p.id), f = forced(p);
      if (others.length < 2) return;
      // デバッグ: 入れ替える2人の指定（1人だけ指定なら、もう1人はランダム）
      let pair = (f.players || []).filter((id, k, arr) => validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
      if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(others.filter((q) => !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
      const [a, b] = pair.map((id) => g.players.find((q) => q.id === id));
      g.tmQueue.push({ id: p.id, a: a.id, b: b.id });     // 反映は夜の終わり（net.js）
      i.mode = "tm"; i.pair = [a.id, b.id];
      g.nightLogsAll.push(`${label} ${p.name} は ${a.name} と ${b.name} の役職を入れ替えました。`);
    };
    const doLove = (p, label) => {   // 一目惚れしてるてる: 一目惚れする相手を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の選択になる）
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      ONW.setRoleBound(g, "loveTargets", p.id, t.id);   // 役職についていく（state.js の【必読】メモ参照）。移動「あと」に選んでも現在の持ち主に予約される
      i.mode = "love"; i.target = t.id;
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を選んでいました。`);
    };
    const doRelic = (p) => {
      const i = infoOf(g, p.id);
      if (!g.center.length) return;
      const fg = (forced(p).graves || []).filter((k) => k >= 0 && k < g.center.length);   // デバッグ: 交換する墓地の指定
      const idx = fg.length ? fg[0] : pick([...g.center.keys()]), got = g.center[idx];
      ONW.swapGrave(g, p.id, idx);
      i.mode = "relic"; i.graveIdx = idx; i.newRole = got; i.known[p.id] = got;
      g.nightLogsAll.push(`${rn("relic_robber")} ${p.name} は 墓地${idx + 1} と役職を交換し、${rn(got)} になりました。`);
      i.relic = { graveIdx: idx, newRole: got };
      // 交換後の役職に夜行動があれば、朝に使う（runNight の "morning" 段階）
      i.pendingChain = ["seer", "mad_seer", "robber", "troublemaker", "love_tanner"].includes(got) ? got : null;
    };

    const on = (s) => all || stage === s;
    if (on("seer")) cpus.filter((p) => role(p) === "seer" || role(p) === "mad_seer").forEach((p) => doSeer(p, rn(role(p))));
    if (on("seer")) cpus.filter((p) => role(p) === "love_tanner").forEach((p) => doLove(p, rn(role(p))));
    if (on("relic")) cpus.filter((p) => role(p) === "relic_robber").forEach((p) => doRelic(p));
    if (on("robber")) cpus.filter((p) => role(p) === "robber").forEach((p) => doRobber(p, rn(role(p))));
    if (on("tm")) cpus.filter((p) => role(p) === "troublemaker").forEach((p) => doTroublemaker(p, rn(role(p))));
    // 朝: 墓荒らしが交換した後の役職の能力を即座に使う（朝の時点の実際のカードが対象。いたずらっ子の入れ替えは呼び出し側で反映）
    if (on("morning")) cpus.forEach((p) => {
      const i = infoOf(g, p.id), got = i.pendingChain;
      if (!got) return;
      i.pendingChain = null;
      const label = rn(got), keep = i.relic ? { ...i.relic } : null;
      if (got === "seer" || got === "mad_seer") doSeer(p, label, true);
      else if (got === "robber") doRobber(p, label);
      else if (got === "troublemaker") doTroublemaker(p, label);
      else if (got === "love_tanner") doLove(p, label);
      i.relic = keep;
    });
  };

  /** 夜が全部終わったあと（いたずらっ子の反映後）に、CPUの後覚者が最終役職を知る */
  cpu.afterNight = function (g) {
    g.players.filter((p) => p.isCpu && g.initialRoles[p.id] === "insomniac").forEach((p) => {
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
  const weighted = (list) => {   // [[値, 重み], ...]
    let r = Math.random() * list.reduce((a, b) => a + b[1], 0);
    for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
    return list[list.length - 1][0];
  };
  /** 偽の占い結果に使う役職。実在する役職の中から、希望の役職を優先して選ぶ（本家 cpuPickSeerResultRole） */
  function pickResultRole(g, preferred) {
    const pool = [...new Set(setupRoles(g))];
    const pref = preferred.filter((r) => pool.includes(r));
    return pick(pref.length ? pref : pool.length ? pool : ["villager"]);
  }
  const wolfLikeResult = (g) => pickResultRole(g, WOLF_LIKE());
  const villageLikeResult = (g) => pickResultRole(g, ["villager", "mason", "seer", "robber", "troublemaker", "insomniac"]);
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
  /** 騙りで名乗る役職の抽選（本家 makeClaimPlan の人狼陣営の分）。山札に無い役職は名乗らない */
  function pickLieRole(g) {
    const chosen = weighted([["seer", 40], ["villager", 18], ["troublemaker", 12], ["robber", 12], ["mason", 9], ["merlin", 9]]);
    if (chosen === "villager" || roleInSetup(g, chosen)) return chosen;
    const fb = ["seer", "troublemaker", "robber", "mason"].filter((r) => r !== chosen && roleInSetup(g, r));
    return fb.length ? pick(fb) : "villager";
  }
  /** あり得る村役職 = この試合に実在する村人陣営の役職（変化後の役職・墓地・COの候補）。村人は常に含む */
  function villageRolesInPlay(g) {
    const pool = [...new Set([...setupRoles(g), ...(g.coDeck || []).map((x) => x.r)])]
      .filter((r) => ONW.roles.getInfo(r).team === "village" && !ONW.TRANSFORM_GROUPS[r] && r !== "merlin" && !ONW.SELF_AS_VILLAGER.includes(r) && !ONW.SELF_AS_WOLF.includes(r));   // マーリンCOは禁止。思い込み系(狼憑き・狼夢人)は本人が名乗れないので騙りにも使わない
    return pool.includes("villager") ? pool : ["villager", ...pool];
  }
  const fakeVillageRole = (g) => pick(villageRolesInPlay(g));
  /**
   * 夜のあとに人外(人狼・狂人・てるてる・第三陣営)の役職を手にしていた怪盗・墓荒らし・後覚者のCPUの騙り。
   *   A) 「村人役を手にした」という嘘（本人の役職COのまま、結果だけ偽る）
   *   B) そもそも最初から村人役だったと名乗る（あり得る村役職を普通に騙る）
   */
  function nonVillageLie(g, p, kind, i, now) {
    if (Math.random() < 0.5) {
      const role = fakeVillageRole(g);
      if (kind === "robber") return { co: "robber", result: { short: `${nameOf(g, i.target)} → ${rn(role)}`, text: `${nameOf(g, i.target)} の役職を奪って ${rn(role)} になりました。`, claim: { kind: "robber", target: i.target, role } } };
      if (kind === "relic") return { co: "relic_robber", result: { short: `墓地${i.relic.graveIdx + 1} → ${rn(role)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(role)} になりました。`, claim: { kind: "relic", role } } };
      return { co: "insomniac", result: { short: `→ ${rn(role)}`, text: `最終的な役職は ${rn(role)} でした。`, claim: { kind: "insomniac", role } } };
    }
    return lieClaim(g, p, now, fakeVillageRole(g));
  }
  /** 騙りの CO と結果開示（本家の mem.fakeRole）。戻り値: { co, result }（resultはnullのこともある） */
  function lieClaim(g, p, selfRole, forceCo) {
    const others = g.players.filter((q) => q.id !== p.id);
    const co = forceCo || pickLieRole(g);
    if (co === "seer") {
      const t = fakeSeerTarget(g, p);
      if (!t) return { co: "villager", result: null };
      const role = fakeSeerResult(g, p, t, selfRole);
      return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
    }
    if (co === "troublemaker" && others.length >= 2) {
      const a = pick(others), b = pick(others.filter((q) => q.id !== a.id));
      return { co, result: { short: `${a.name} ⇄ ${b.name}`, text: `${a.name} と ${b.name} を入れ替えました。`, claim: { kind: "troublemaker" } } };
    }
    if (co === "robber") {
      const t = fakeSeerTarget(g, p);
      const pool = ["villager", "mason", "insomniac", "troublemaker"].filter((r) => r === "villager" || roleInSetup(g, r));
      const role = pick(pool);
      return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} の役職を奪って ${rn(role)} になりました。`, claim: { kind: "robber", target: t.id, role } } };
    }
    if (co === "mason") return { co, result: { short: "自分だけ", text: "共有者は 私だけでした。", claim: { kind: "mason" } } };
    return { co: forceCo && forceCo !== "villager" ? forceCo : "villager", result: null };   // その他の村役職は、結果なしでCOだけする
  }

  /**
   * 昼の発言プラン（CPU1, CPU2… の順に1人ずつ）。
   * 各CPUは人間のCOボタンと同じ形（「〇〇CO」）で名乗り、その直後に結果開示を続けて言う。
   * 戻り値: [{ p, text, claim, gap(次の発言までのms) }]
   */
  cpu.plan = function (g) {
    const plan = [];
    g.players.filter((p) => p.isCpu).forEach((p) => {
      const r = ONW.shownRole(g.initialRoles[p.id]), i = infoOf(g, p.id);   // 忘却の人狼のCPUは自分を村人だと思っている
      const others = g.players.filter((q) => q.id !== p.id);
      let coRole = null, result = null;
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
      } else if (r === "relic_robber" && i.relic) {                    // 墓荒らし
        coRole = "relic_robber";
        if (isNonVillage(i.relic.newRole)) { const lie = nonVillageLie(g, p, "relic", i, i.relic.newRole); coRole = lie.co; result = lie.result; }
        else result = { short: `墓地${i.relic.graveIdx + 1} → ${rn(i.relic.newRole)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(i.relic.newRole)} になりました。`, claim: { kind: "relic", role: i.relic.newRole } };
      } else if (r === "troublemaker" && i.pair) {                     // いたずらっ子
        coRole = "troublemaker";
        result = { short: `${nameOf(g, i.pair[0])} ⇄ ${nameOf(g, i.pair[1])}`, text: `${nameOf(g, i.pair[0])} と ${nameOf(g, i.pair[1])} を入れ替えました。`, claim: { kind: "troublemaker" } };
      } else if (r === "insomniac" && i.finalRole) {                   // 後覚者
        coRole = "insomniac";
        if (isNonVillage(i.finalRole)) { const lie = nonVillageLie(g, p, "insomniac", i, i.finalRole); coRole = lie.co; result = lie.result; }
        else result = { short: `→ ${rn(i.finalRole)}`, text: `最終的な役職は ${rn(i.finalRole)} でした。`, claim: { kind: "insomniac", role: i.finalRole } };
      } else if (r === "mason") {                                       // 共有者: 相方の名前を開示
        coRole = "mason";
        const mates = others.filter((q) => i.known[q.id] === "mason");
        result = { short: mates.length ? `相方: ${mates.map((q) => q.name).join("、")}` : "自分だけ", text: mates.length ? `共有者は 私と ${mates.map((q) => q.name).join("、")} でした。` : "共有者は 私だけでした。", claim: { kind: "mason" } };
      } else if (r === "baker") {                                        // パン屋: パンが焼けたことは全員に知らされるので、必ずパン屋COする
        coRole = "baker";
      } else if (r === "villager" || r === "merlin") {   // マーリンはマーリンCO禁止なので、村人として振る舞う
        // 村人: 75%でCO、残りも60%は「COなし寄りだけど村人」と言う（本家）
        if (ONW.SELF_AS_VILLAGER.includes(g.initialRoles[p.id]) || Math.random() < 0.75 || Math.random() < 0.6) coRole = "villager";   // 忘却の人狼・狼憑きは自分を村人だと思っているので、必ず村人COする
      } else if (r === "tanner" || r === "love_tanner") {               // てるてる系: 55%村人騙り、残りの半分は占い騙り（本家）
        if (Math.random() < 0.55) coRole = "villager";
        else if (Math.random() < 0.5) {
          const t = fakeSeerTarget(g, p);
          if (t) {
            const role = fakeSeerResult(g, p, t, r);
            coRole = "seer";
            result = { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } };
          }
        }
      } else if (ONW.roles.getInfo(r).team === "village" && Math.random() < 0.45) {   // その他の村人陣営: 45%で自分の役職をCO（本家）
        coRole = r;
      }
      if (!coRole) return;                                              // COしない
      plan.push({ p, text: `${rn(coRole)}CO`, co: coRole, claim: result ? null : { kind: "villager" }, gap: result ? 1200 : 3500 });
      if (result) plan.push({ p, text: result.text, short: result.short, result: true, claim: result.claim, gap: 3500 });
    });
    return plan;
  };

  /** アサシンのCPUが暗殺する相手: 仲間と分かっている人は避け、あとはランダム */
  cpu.assassinPick = function (g, id, cands) {
    const i = infoOf(g, id);
    const pool = cands.filter((c) => !isWolf(i.known[c]));
    return pick(pool.length ? pool : cands);
  };

  const alive = (g, id) => !(g.deadIds || []).includes(id);
  /** 投票先候補（本家 chooseBestVoteTarget: 自分以外・生存・共有者の相方は除く） */
  function voteCandidates(g, p) {
    const i = infoOf(g, p.id), me = ONW.shownRole(g.currentRoles[p.id]);
    return g.players.filter((q) => q.id !== p.id && alive(g, q.id) && !(me === "mason" && i.known[q.id] === "mason"));
  }

  /** 投票先の評価点（本家 scoreTargetForCpu を、この版にある役職に合わせたもの） */
  function scoreVote(g, p, q) {
    const i = infoOf(g, p.id), me = ONW.shownRole(g.currentRoles[p.id]), ini = ONW.shownRole(g.initialRoles[p.id]);
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
    if (!wolfSide) claims.forEach((c) => { if ((c.kind === "robber" || c.kind === "relic" || c.kind === "insomniac") && WOLF_LIKE().includes(c.role) && c.from === q.id && c.from !== p.id) s += 3; });
    // 他のCPUの投票予告（同調）+0.6、味方の予告 +1.2
    const plans = g.cpuVotePlan || {};
    Object.entries(plans).forEach(([vid, t]) => {
      if (t !== q.id || vid === p.id) return;
      s += 0.6;
      if ((isWolf(me) || ini === "cultist") && isWolf(i.known[vid])) s += 1.2;
    });
    if (me === "tanner" || me === "love_tanner") s += 1.0;
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

  /** 残り20秒の投票意思表明。決めた先は投票でもそのまま使う（死亡・大幅な評価低下がなければ） */
  cpu.announceVote = function (g, p) {
    g.cpuVotePlan = g.cpuVotePlan || {};
    const cur = g.cpuVotePlan[p.id];
    const ok = cur && alive(g, cur) && cur !== p.id && voteCandidates(g, p).some((q) => q.id === cur) && scoreVote(g, p, g.players.find((q) => q.id === cur)) > -50;
    const t = ok ? cur : (g.cpuVotePlan[p.id] = chooseVote(g, p));
    return { target: t, text: `${nameOf(g, t)}に入れようと思います。` };
  };

  /** 投票先を決める */
  cpu.decideVote = function (g, p) { return chooseVote(g, p); };

  ONW.cpu = cpu;
})(window.ONW);
