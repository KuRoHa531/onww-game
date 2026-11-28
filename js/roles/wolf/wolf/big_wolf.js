/** 大狼: 他の人狼系と墓地カードをすべて確認できる */
(function (ONW) {
  const K = ONW.wolfKit;
  const cpuGraves = (g, id, k) => g.center0.forEach((c, idx) => k.infoOf(g, id).grave.push({ idx, role: c }));

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
    if (has("big_wolf")) {
      const entry = (g.coBoard || {})[id] || {};
      const lines = [entry.co || "", ...((entry.results || []).map((r) => (r && (r.text || r.short)) || ""))];
      const centerNames = [...new Set((g.center || []).filter(Boolean))].map((r) => (ONW.ROLE_INFO[r] || {}).name).filter(Boolean);
      if (lines.some((ln) => (ln.includes("墓地") || ln.includes("中央")) && centerNames.some((n) => ln.includes(n)))) out.push("big_wolf_center_role");   // 同じ発言の中で墓地の役職名に触れたときだけ（マイクラ版準拠。全発言の連結では付かない）
    }
    return out;
  }

  ONW.defineRole("big_wolf", {
    achievements,   // 実績
    // 夜の演出(stage.js が g.bigReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに墓地のカードが順に全部開き、赤く光る → 夜時間の間ずっと開いたまま
    stageNight: {
      order: 50, field: "bigReveal",
      run(roles, SK) {
        const { later, paint, G } = SK;
        roles.forEach((role, i) => later(() => { const k = `g:${i}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; SK.up[k] = role; SK.glow[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G()); }, i * 380));
      },
    },
    // CPU: 夜のはじめ/情報取得で墓地をすべて知る
    cpuInit: cpuGraves, cpuLearn: cpuGraves,
    info: { deck: 2, name: "大狼", team: ONW.TEAM.WOLF, wakeOrder: 11, sort: 1.1,
      desc: "人狼陣営。他の人狼系を確認できます。さらに墓地カードをすべて確認できます。" },
    groups: { wolf: 2, "transform:dark_avatar": 2 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
