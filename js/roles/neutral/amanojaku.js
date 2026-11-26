/** 天邪鬼 */
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
    if (fin === "amanojaku" && godActive && !won) out.push("amanojaku_god_loss");
    return out;
  }

  ONW.defineRole("amanojaku", {
    achievements,   // 実績
    info: { deck: 23, name: "天邪鬼", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 43,
      desc: "第三陣営。村人陣営が勝たなければ追加勝利です。" },
    groups: { "transform:silver_shadow": 5 },
    // CPUのCO（本家「COのみ」ルール）: 天邪鬼は本当のCOをせず、必ず騙る（村人側などを名乗る）
    cpuClaim(k, g, p, r, i, c) { k.optionalCo(g, p, r, c, null); },
  });
})(window.ONW);
