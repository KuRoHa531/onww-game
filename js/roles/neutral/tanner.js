/** てるてる坊主 */
(function (ONW) {
  // ---- CPUの発言・投票(もとは cpu.js。中身は変更なし。一目惚れしてるてるも使う) ----
  function cpuClaim(k, g, p, r, i, c) {   // てるてる系: 55%村人騙り、残りの半分は占い騙り（本家）。どれでも必ず何かをCOする
    const { rn, plainLie, fakeSeerTarget, fakeSeerResult } = k;
    { const pl = plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }   // 村人がいなければ別の村役職を騙る
    if (Math.random() >= 0.55 && Math.random() < 0.5) {
      const t = fakeSeerTarget(g, p);
      if (t) {
        const role = fakeSeerResult(g, p, t, r);
        c.co = "seer";
        c.result = { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } };
      }
    }
  }

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
    if (fin === "tanner" && won && (g.executed || []).length >= 2) out.push("tanner_multi_exile_win");
    return out;
  }

  ONW.defineRole("tanner", {
    achievements,   // 実績
    cpuClaim,
    cpuVoteScore: () => 1.0,   // 投票: てるてる系は追放されたいので、評価点に少し足す
    info: { deck: 15, name: "てるてる坊主", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 34,
      desc: "第三陣営。自分が追放されると勝利です。" },
    groups: { "transform:silver_shadow": 1 },
  });
})(window.ONW);
