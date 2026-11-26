/** 猫又 */
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
    if (fin === "cat_sidhe") {
      const targets = Object.keys(g.chainBy || {}).filter((v) => (g.chainBy || {})[v] === id && (g.chainKind || {})[v] === "tomo");
      if (targets.some((v) => teamOfP(v) === "village")) out.push("cat_sidhe_chain_village");
      if (targets.some((v) => teamOfP(v) !== "village")) out.push("cat_sidhe_chain_nonvillage");
    }
    // 猫又のだれかが女王を道連れにしたら、猫又全員（マイクラ版 chainSourceHitRole）
    if (fin === "cat_sidhe" && Object.keys(g.chainBy || {}).some((v) => (g.chainKind || {})[v] === "tomo" && roleOf(v) === "queen" && roleOf((g.chainBy || {})[v]) === "cat_sidhe")) out.push("cat_sidhe_chain_queen");
    return out;
  }

  ONW.defineRole("cat_sidhe", {
    achievements,   // 実績
    info: { sealTarget: true, deck: 21, name: "猫又", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 22,
      desc: "村人陣営。自分が処刑されたらランダムな1人を道連れにします。" },
    groups: { tomo: 2, "transform:light_apostle": 9 },
  });
})(window.ONW);
