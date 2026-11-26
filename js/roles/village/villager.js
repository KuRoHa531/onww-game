/** 村人 */
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
    if (fin === "villager" && won && !exiled(id)) out.push("villager_survive_win");   // 追放されずに村人で勝利
    return out;
  }

  ONW.defineRole("villager", {
    achievements,   // 実績
    cpuLie: { role: "villager", weight: 18, order: 2 },   // 騙りで名乗る確率の重み
    cpuClaim(k, g, p, r, i, c) { c.co = "villager"; },   // 村人は必ずCOする（以前は約1割がCOしなかった）
    info: { deck: 7, count: 2, name: "村人", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 33,
      desc: "村人陣営。能力はありません。" },
    groups: { "transform:light_apostle": 1 },
  });
})(window.ONW);
