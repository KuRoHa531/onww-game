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

  /** CPUの夜行動（占い師系 → 怪盗 → 墓荒らし → いたずらっ子の順）。占いは初期役職を見るので順序に影響されない */
  cpu.runNight = function (g, stage) {   // stage: "init" | "seer" | "relic" | "robber" | "tm"（省略時は全部を起床順に実行）
    const all = !stage;
    if (all || stage === "init") g.cpuInfo = {};
    g.cpuInfo = g.cpuInfo || {};
    const cpus = g.players.filter((p) => p.isCpu);
    const role = (p) => g.initialRoles[p.id];
    // 人狼系は互いを、狂信者は人狼系を知っている / 大狼は墓地をすべて知っている
    if (all || stage === "init") cpus.forEach((p) => {
      if (isWolf(role(p))) g.players.forEach((q) => { if (q.id !== p.id && isWolf(role(q))) infoOf(g, p.id).known[q.id] = role(q); });
      if (role(p) === "cultist") {
        g.players.forEach((q) => { if (isWolf(role(q))) infoOf(g, p.id).known[q.id] = role(q); });
        const mid = g.players.some((q) => isWolf(role(q))) ? null : ONW.vote.certainPromotion(g);   // 人狼不在で昇格が確定している狂人 = ご主人
        if (mid && mid !== p.id) infoOf(g, p.id).known[mid] = "werewolf";                           // CPUは人狼側の仲間として扱う（役職は不明）
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
        i.mode = "player"; i.target = t.id; i.known[t.id] = rolesNow[t.id];
        g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を占い、${rn(rolesNow[t.id])} でした。`);
      }
    };
    const doRobber = (p, label) => {
      const f = forced(p), i = infoOf(g, p.id);
      const t = validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : pick(g.players.filter((q) => q.id !== p.id));
      ONW.swapPlayers(g, p.id, t.id);
      i.mode = "robber"; i.target = t.id; i.newRole = g.currentRoles[p.id];
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
      const i = infoOf(g, p.id), fin = g.currentRoles[p.id];
      i.mode = "insomniac"; i.finalRole = fin; i.known[p.id] = fin;
    });
  };

  /**
   * 昼の発言プラン（CPU1, CPU2… の順に1人ずつ）。
   * 各CPUは人間のCOボタンと同じ形（「〇〇CO」）で名乗り、その直後に結果開示を続けて言う。
   * 戻り値: [{ p, text, claim, gap(次の発言までのms) }]
   */
  cpu.plan = function (g) {
    const plan = [];
    g.players.filter((p) => p.isCpu).forEach((p) => {
      const r = g.initialRoles[p.id], i = infoOf(g, p.id);
      const others = g.players.filter((q) => q.id !== p.id);
      let coRole = "villager", result = null;
      if (r === "seer" && i.mode === "player") {
        coRole = "seer";
        result = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} を占って ${rn(i.known[i.target])} でした`, claim: { kind: "seer", target: i.target, role: i.known[i.target] } };
      } else if (r === "seer") {
        coRole = "seer";
        result = { short: i.grave.map((c) => `墓地${c.idx + 1} → ${rn(c.role)}`).join("、"), text: i.grave.map((c) => `墓地${c.idx + 1} を見て ${rn(c.role)}`).join("、") + " でした", claim: { kind: "seer-grave" } };
      } else if (r === "robber") {
        coRole = "robber";
        const shown = i.newRole === "werewolf" ? "villager" : i.newRole; // 人狼になったら村人と偽る
        result = { short: `${nameOf(g, i.target)} → ${rn(shown)}`, text: `${nameOf(g, i.target)} の役職を奪って ${rn(shown)} になりました`, claim: { kind: "robber", target: i.target, role: shown } };
      } else if (r === "mad_seer" && i.mode === "player") {            // 狂った占い師: 偽の占い結果（人狼は白、それ以外は人狼と言う）
        coRole = "seer";
        const shown = isWolf(i.known[i.target]) ? "villager" : "werewolf";
        result = { short: `${nameOf(g, i.target)} → ${rn(shown)}`, text: `${nameOf(g, i.target)} を占って ${rn(shown)} でした`, claim: { kind: "seer", target: i.target, role: shown } };
      } else if (r === "mad_seer") {
        coRole = "seer";
        result = { short: i.grave.map((c) => `墓地${c.idx + 1} → ${rn(isWolf(c.role) ? "villager" : c.role)}`).join("、"), text: i.grave.map((c) => `墓地${c.idx + 1} を見て ${rn(isWolf(c.role) ? "villager" : c.role)}`).join("、") + " でした", claim: { kind: "seer-grave" } };
      } else if (r === "relic_robber" && i.relic) {                    // 墓荒らし
        coRole = "relic_robber";
        const shown = isWolf(i.relic.newRole) ? "villager" : i.relic.newRole;   // 人狼になったら村人と偽る
        result = { short: `墓地${i.relic.graveIdx + 1} → ${rn(shown)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(shown)} になりました`, claim: { kind: "relic", role: shown } };
      } else if (r === "troublemaker" && i.pair) {                     // いたずらっ子
        coRole = "troublemaker";
        result = { short: `${nameOf(g, i.pair[0])} ⇄ ${nameOf(g, i.pair[1])}`, text: `${nameOf(g, i.pair[0])} と ${nameOf(g, i.pair[1])} を入れ替えました`, claim: { kind: "troublemaker" } };
      } else if (r === "insomniac" && i.finalRole) {                   // 後覚者
        coRole = "insomniac";
        const shown = isWolf(i.finalRole) ? "insomniac" : i.finalRole;   // 人狼になっていたら隠す
        result = { short: `→ ${rn(shown)}`, text: `最終的な役職は ${rn(shown)} でした`, claim: { kind: "insomniac", role: shown } };
      } else if (r === "mason") {                                       // 共有者: 相方の名前を開示
        coRole = "mason";
        const mates = others.filter((q) => i.known[q.id] === "mason");
        result = { short: mates.length ? `相方: ${mates.map((q) => q.name).join("、")}` : "自分だけ", text: mates.length ? `共有者は 私と ${mates.map((q) => q.name).join("、")} でした` : "共有者は 私だけでした", claim: { kind: "mason" } };
      } else if (isWolf(r) && Math.random() < 0.5) {
        coRole = "seer";
        const t = pick(others.filter((q) => !isWolf(g.initialRoles[q.id]))) || pick(others);
        result = { short: `${t.name} → ${rn("villager")}`, text: `${t.name} を占って ${rn("villager")} でした`, claim: { kind: "seer", target: t.id, role: "villager" } };
      } else if ((r === "madman" || r === "cultist") && Math.random() < 0.5) {
        coRole = "seer";
        const t = pick(others.filter((q) => !isWolf(i.known[q.id]))) || pick(others);   // 狂信者は人狼を告発しない
        result = { short: `${t.name} → ${rn("werewolf")}`, text: `${t.name} を占って ${rn("werewolf")} でした`, claim: { kind: "seer", target: t.id, role: "werewolf" } };
      }
      plan.push({ p, text: `${rn(coRole)}CO`, co: coRole, claim: result ? null : { kind: "villager" }, gap: result ? 1200 : 3500 });
      if (result) plan.push({ p, text: result.text, short: result.short, result: true, claim: result.claim, gap: 3500 });
    });
    return plan;
  };

  /** 残り20秒の投票意思表明。決めた先は投票でもそのまま使う */
  cpu.announceVote = function (g, p) {
    g.cpuVotePlan = g.cpuVotePlan || {};
    const t = g.cpuVotePlan[p.id] || (g.cpuVotePlan[p.id] = cpu.decideVote(g, p));
    return { target: t, text: `${nameOf(g, t)}に入れようと思います。` };
  };

  /** 投票先を決める（自分以外から、点数に比例してランダム） */
  cpu.decideVote = function (g, p) {
    const i = infoOf(g, p.id), me = g.currentRoles[p.id];
    const wolfSide = isWolf(me) || isMad(me);
    const claims = g.cpuClaims || [];
    const seerClaimers = claims.filter((c) => c.kind === "seer" || c.kind === "seer-grave").map((c) => c.from);
    const cands = g.players.filter((q) => q.id !== p.id);
    const scored = cands.map((q) => {
      let s = 1;
      const k = i.known[q.id];
      if (isWolf(me)) {
        if (isWolf(k)) s -= 8;                      // 仲間は避ける
        if (seerClaimers.includes(q.id)) s += 2;    // 占い師COは邪魔
      } else if (isMad(me)) {
        if (isWolf(k)) s -= 6;                      // 狂信者は人狼を守る
        if (seerClaimers.includes(q.id)) s += 1.5;
      } else {
        if (isWolf(k)) s += 10;                     // 人狼と分かっている相手
        else if (k) s -= 3;                          // 人狼ではないと分かっている相手
        claims.forEach((c) => {
          if (c.from === p.id) return;
          if (c.kind === "seer" && c.role === "werewolf" && c.target === q.id && k !== "villager") s += 4;
          if (c.kind === "seer" && c.target && isWolf(i.known[c.target]) && !isWolf(c.role) && c.from === q.id) s += 4; // 人狼を白と言った
        });
        if (seerClaimers.includes(q.id) && seerClaimers.length >= 2) s += 1.5; // 占いCO被り
        claims.forEach((c) => {
          if ((c.kind === "robber" || c.kind === "relic" || c.kind === "insomniac") && isWolf(c.role) && c.from === q.id && c.from !== p.id) s += 3; // 人狼を奪ったと名乗る怪盗
        });
      }
      return { id: q.id, w: Math.pow(Math.max(0.1, s), 2) };
    });
    let r = Math.random() * scored.reduce((a, b) => a + b.w, 0);
    for (const c of scored) { r -= c.w; if (r <= 0) return c.id; }
    return scored[scored.length - 1].id;
  };

  ONW.cpu = cpu;
})(window.ONW);
