/** 忘却の人狼: 自分を村人だと思い込んでいる人狼(夜の情報なし) */
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
    if (fin === "forgetful_wolf" && voteTeam() === "wolf") out.push("forgetful_vote_wolf");
    return out;
  }

  ONW.defineRole("forgetful_wolf", {
    achievements,   // 実績
    info: { deck: 27, name: "忘却の人狼", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.3,
      desc: "人狼陣営。自分のことを村人だと思い込んでいる人狼です。占い結果は人狼です。本人視点では村人として夜を認識します。" },
    groups: { wolf: 6, selfAsVillager: 1, "transform:dark_avatar": 6 },
    // 夜の表示・手にしたとき・酔い覚めの文章は「村人」と同じで何もなし。
    // 既存の挙動を保持: 酔い覚めの演出だけは、他の人狼系と同じ🐺の表示が出る(旧 soberPeek の挙動)
    soberPeek: K.soberPeek,
  });
})(window.ONW);
