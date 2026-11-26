/** 負け組 */
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
    const godActive = players.some((q) => roleOf(q.id) === "god" && exiled(q.id) && (g.winnerIds || []).includes(q.id));   // 神が追放されて勝利した（マイクラ版 godBlessingActive）
    if (ini === "loser" && fin !== "loser" && won) out.push("loser_changed_win");
    if (ini !== "loser" && fin === "loser" && !won) out.push("loser_from_other_loss");
    if (fin === "loser" && ONW.isLover && ONW.isLover(g, id) && !won) out.push("loser_lover_win_loss");
    if (fin === "loser" && godActive && !won) out.push("loser_god_loss");
    return out;
  }

  ONW.defineRole("loser", {
    achievements,   // 実績
    info: { deck: 37, name: "負け組", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 42,
      desc: "第三陣営。夜の能力はありません。最終的にこの役職であれば、ほかの勝敗に関係なく敗北します（神の祝福でも敗北）。恋人になっていても、最終的に負け組なら、恋人が勝利しても負け組のみ敗北します。" },
    groups: { "transform:silver_shadow": 9 },
    // CPUのCO（本家「COのみ」ルール）: 35%で本当に「負け組CO」（結果開示はなし）、残りは村人側などを騙る
    cpuClaim(k, g, p, r, i, c) { k.optionalCo(g, p, r, c, () => ({ co: "loser", result: null })); },
    cpuLie: { role: "loser", weight: 3, order: 10, claim: () => ({ co: "loser", result: null }) },
  });
})(window.ONW);
