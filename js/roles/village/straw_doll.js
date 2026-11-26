/** わら人形 */
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
    if (fin === "straw_doll") {
      const targets = Object.keys(g.chainBy || {}).filter((v) => (g.chainBy || {})[v] === id && (g.chainKind || {})[v] === "tomo");
      if (targets.some((v) => teamOfP(v) === "village")) out.push("straw_chain_village");
      if (targets.some((v) => teamOfP(v) !== "wolf") && targets.some((v) => teamOfP(v) !== "village")) out.push("straw_chain_nonvillage");
    }
    return out;
  }

  ONW.defineRole("straw_doll", {
    achievements,   // 実績
    info: { deck: 20, name: "わら人形", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 21,
      desc: "村人陣営。夜行動はありません。死んだときに1人選んで道連れにします。" },
    groups: { tomo: 1, "transform:light_apostle": 8 },
  });
})(window.ONW);
