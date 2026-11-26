/** 勝ち組 */
(function (ONW) {
    /** 実績（マイクラ版 stats.js の判定に合わせる） */
  function achievements(g, id, won) {
    const out = [], ini = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    const has = (r) => ini === r || fin === r;
    const roleOf = (pid) => (g.currentRoles || {})[pid] ?? (g.initialRoles || {})[pid];
    const teamKey = (r) => { if (r === "doppelganger") return "third"; const t = r && ONW.ROLE_INFO[r] && ONW.ROLE_INFO[r].team; return t === ONW.TEAM.WOLF ? "wolf" : t === ONW.TEAM.THIRD ? "third" : "village"; };
    const teamOfP = (pid) => teamKey(roleOf(pid));
    const exiled = (pid) => (g.executed || []).includes(pid);
    const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set(g.deadIds || []);
    const players = g.players || [];
    const wolfPartners = (pid) => players.filter((q) => q.id !== pid && (teamOfP(q.id) === "wolf" || (g.promotedWolfIds || []).includes(q.id))).map((q) => q.id);
    const voteTeam = () => { const t = (g.votes || {})[id]; return t ? teamOfP(t) : null; };
    const chainTargets = (pid) => Object.keys(g.chainBy || {}).filter((v) => (g.chainBy || {})[v] === pid && (g.chainKind || {})[v] === "tomo");
    if (ini === "winner" && fin !== "winner" && !won) out.push("winner_changed_loss");
    if (ini !== "winner" && fin === "winner" && won) out.push("winner_from_other_win");
    if (fin === "winner" && ONW.isLover && ONW.isLover(g, id) && won) out.push("winner_lover_loss_win");
    // グレムリンに勝者をコピーされた（マイクラ版 gremlin_copy_winner。コピー元の勝者に付く）
    if (fin === "winner" && Object.keys(g.gremlinCopiedRole || {}).some((gid) => (g.gremlinCopiedRole || {})[gid] === "winner" && (g.gremlinSourceTarget || {})[gid] === id && (g.gremlinSuccess || {})[gid])) out.push("gremlin_copy_winner");
    return out;
  }

  ONW.defineRole("winner", {
    achievements,   // 実績
    info: { deck: 36, name: "勝ち組", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 41,
      desc: "第三陣営。夜の能力はありません。最終的にこの役職であれば、ほかの勝敗に関係なく追加で勝利します（死亡・追放されていても勝てます）。恋人になっていても、最終的に勝ち組なら、恋人が敗北しても勝ち組のみ勝利します。" },
    groups: { "transform:silver_shadow": 8 },
    // CPUのCO（本家「COのみ」ルール）: 35%で本当に「勝ち組CO」（結果開示はなし）、残りは村人側などを騙る
    cpuClaim(k, g, p, r, i, c) { k.optionalCo(g, p, r, c, () => ({ co: "winner", result: null })); },
    cpuLie: { role: "winner", weight: 3, order: 9, claim: () => ({ co: "winner", result: null }) },   // 他の役職のCPUが騙りで名乗ることもある（本家の騙りの抽選表では重み1/約30）
  });
})(window.ONW);
