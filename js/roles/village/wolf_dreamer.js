/** 狼夢人: 自分を「相方のいない一人の人狼」だと思い込んでいる村人 */
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
    if (fin === "wolf_dreamer") {
      if (voteTeam() === "village") out.push("wolf_dreamer_vote_village");
      if (voteTeam() === "wolf") out.push("wolf_dreamer_vote_wolf");
    }
    return out;
  }

  ONW.defineRole("wolf_dreamer", {
    achievements,   // 実績
    info: { deck: 30, name: "狼夢人", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 8,
      desc: "村人陣営。自分のことを人狼だと思い込んでいる村人です。占い結果は狼夢人です。夜は相方のいない一人の人狼として認識します。" },
    groups: { selfAsWolf: 1, "transform:light_apostle": 11 },
    nightMsg: () => ({ text: "仲間の人狼はいません。" }),   // 本物の人狼と同じ表示(仲間のカードは出ない)
    got(c, p) { c.hold(p.id, "仲間の人狼はいません。"); },   // 手にしたら、自分は相方のいない一人の人狼だと思い込む
  });
})(window.ONW);
