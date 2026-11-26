/** 黒猫 */
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
    if (fin === "black_cat") {
      const ts = chainTargets(id);
      if (ts.some((v) => teamOfP(v) === "wolf")) out.push("black_cat_chain_wolf");
      if (ts.some((v) => teamOfP(v) !== "wolf")) out.push("black_cat_chain_nonwolf");
    }
    return out;
  }

  ONW.defineRole("black_cat", {
    achievements,   // 実績
    info: { sealTarget: true, deck: 22, name: "黒猫", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.75,
      desc: "人狼陣営。吊られると誰かを道連れにする狂人です。ご主人を道連れにする可能性もあります。" },
    groups: { mad: 4, tomo: 3, "transform:dark_avatar": 13 },
  });
})(window.ONW);
