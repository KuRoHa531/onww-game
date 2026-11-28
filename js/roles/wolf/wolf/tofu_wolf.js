/** 豆腐の人狼: 1票でも入るとメンタル崩壊する人狼 */
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
    if (fin === "tofu_wolf") {
      if ((g.mentalIds || []).includes(id) && dead.has(id)) out.push("tofu_mental_break");
      if (g.mapoAnnounced && players.some((q) => q.id !== id && ONW.mimic.eff(g, q.id) === "mapo_wolf")) out.push("tofu_mapo_complete");   // 模倣の人狼は模倣先の役職として在場を数える（マイクラ版 hasEffectRoleInPlay 準拠）
    }
    return out;
  }

  ONW.defineRole("tofu_wolf", {
    achievements,   // 実績
    info: { deck: 26, name: "豆腐の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.25,
      desc: "人狼陣営。1票でも投票されると、処刑される人と同時にめくられ、メンタル崩壊で死亡します。ただし麻婆の人狼がいる間は、1票ではメンタル崩壊せず（最多得票のときだけ追放）、2票持ちになります。" },
    groups: { wolf: 5, "transform:dark_avatar": 5 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
