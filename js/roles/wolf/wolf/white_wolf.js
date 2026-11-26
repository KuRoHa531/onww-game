/** 白狼: 占い結果が村人と出る人狼 */
(function (ONW) {
  const K = ONW.wolfKit;
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
    if (fin === "white_wolf" && Object.values(g.seerData || {}).some((d) => d && d.targetId === id && d.role !== "fake_seer")) out.push("white_wolf_inspected");
    return out;
  }

  ONW.defineRole("white_wolf", {
    achievements,   // 実績
    info: { deck: 25, name: "白狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.2,
      desc: "人狼陣営。占い結果が村人と出る人狼です。相方や狂信者からは人狼として見えます。" },
    seerSees: "villager",   // 占われたときに見える役職
    groups: { wolf: 4, "transform:dark_avatar": 4 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
