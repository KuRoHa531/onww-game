/** オポチュニスト */
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
    if (fin === "opportunist") {
      if (dead.size === 1 && dead.has(id)) out.push("opportunist_only_dead");
      if (won) {
        const others = players.filter((q) => q.id !== id && (g.winnerIds || []).includes(q.id));
        if (others.some((q) => teamOfP(q.id) === "village")) out.push("opportunist_with_village");
        if (others.some((q) => teamOfP(q.id) === "wolf")) out.push("opportunist_with_wolf");
        if (others.some((q) => teamOfP(q.id) === "third")) out.push("opportunist_with_third");
      }
      if (godActive && !won) out.push("opportunist_god_loss");
    }
    return out;
  }

  ONW.defineRole("opportunist", {
    achievements,   // 実績
    info: { deck: 19, name: "オポチュニスト", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 44,
      desc: "第三陣営。夜の能力はありません。最後まで追放されなければ、ほかの勝敗に追加で勝利します。" },
    groups: { "transform:silver_shadow": 4 },
  });
})(window.ONW);
