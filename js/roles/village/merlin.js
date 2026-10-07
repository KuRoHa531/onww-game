/** マーリン: 墓地以外の人狼を知っている(アサシンに選ばれると人狼陣営の逆転勝利) */
(function (ONW) {
  /** マーリンに見える人狼のID（墓地は見えない）。本物の人狼（一匹狼・忘却の人狼も含む）。人狼が誰もいなければ、昇格が決まっている狂人 */
  function sees(g, selfId) {
    const ids = g.players.filter((q) => q.id !== selfId && ONW.WOLF_KIND.includes(g.initialRoles[q.id])).map((q) => q.id);
    if (ids.length) return ids;
    const mid = ONW.vote.certainPromotion(g);
    return mid && mid !== selfId ? [mid] : [];
  }
  const cpuLearn = (g, id, k) => g.players.forEach((q) => { if (q.id !== id && k.isWolf(g.initialRoles[q.id])) k.infoOf(g, id).known[q.id] = g.initialRoles[q.id]; });

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  /**
   * マーリンのCPUの騙り。マーリン自身はCO禁止（アサシンに狙われる）なので、別の村役職を名乗る。
   * 人狼が見えているので、占い師を騙るときは「見えている人狼を人狼と告発する / 村人側を村人と言う」
   * （人狼陣営の騙りと違って、本物の人狼を庇わない）。
   */
  function merlinLie(k, g, p, i) {
    const { rn, pick, weighted, roleInSetup, bareCo, isWolf, WOLF_LIKE, wolfLikeResult, villageLikeResult, lieClaim } = k;
    const opts = [["seer", 45], ["villager", 25], ["troublemaker", 10], ["robber", 10], ["mason", 10]].filter(([r]) => roleInSetup(g, r));
    const co = opts.length ? weighted(opts) : bareCo(g);
    if (co === "seer") {
      const others = g.players.filter((q) => q.id !== p.id);
      const wolves = others.filter((q) => isWolf(i.known[q.id])), safe = others.filter((q) => !wolves.includes(q));
      const accuse = wolves.length && (!safe.length || Math.random() < 0.7);   // 見えている人狼を告発する
      const t = accuse ? pick(wolves) : pick(safe.length ? safe : others);
      if (!t) return { co: bareCo(g, co), result: null };
      const real = g.initialRoles[t.id];
      const role = accuse ? (WOLF_LIKE().includes(real) ? real : wolfLikeResult(g)) : villageLikeResult(g);
      return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
    }
    return lieClaim(g, p, "merlin", co);
  }

  ONW.defineRole("merlin", {
    cpuClaim(k, g, p, r, i, c) { const lie = merlinLie(k, g, p, i); c.co = lie.co; c.result = lie.result; },   // マーリン: 人狼が見えているので、別の村役職を騙る（マーリンCOは禁止）
    cpuInit(g, id, k) { cpuLearn(g, id, k); const mid = g.players.some((q) => k.isWolf(g.initialRoles[q.id])) ? null : ONW.vote.certainPromotion(g);
      if (mid && mid !== id) k.infoOf(g, id).known[mid] = "werewolf"; },
    cpuLearn,   // CPU: 墓地以外の人狼を知っている
    info: { deck: 28, name: "マーリン", team: ONW.TEAM.VILLAGE, wakeOrder: 25, sort: 10,
      desc: "村人陣営。墓地以外の人狼を知っています。狂人が人狼に昇格する場合も人狼として見えます。アサシンに選ばれると人狼陣営の逆転勝利になるので、マーリンCOはしてはいけません。" },
    groups: { "transform:light_apostle": 10 },
    sees,
    nightMsg(c, p) {
      const g = c.g;
      const ids = sees(g, p.id), names = ids.map((id) => (g.players.find((q) => q.id === id) || {}).name);
      return {
        text: ids.length ? `人狼: ${names.join("、")}` : "人狼はいません。",
        text2: "あなたがアサシンに選ばれると、人狼陣営の逆転勝利になります。マーリンCOはしないでください。",
        cultWolves: ids.length ? ids : null,   // 夜の始まりに、そのカードが表になって🐺が出る
      };
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      // マーリン: 初期役職時点の人狼（人狼不在なら昇格する狂人）に🐺
      const ids = sees(g, p.id);
      c.hold(p.id, ids.length ? `人狼: ${t.names(ids)}` : "人狼はいません。");
      t.both(t.eff());
      t.setPeek(ids.map((id) => ({ k: `p:${id}`, role: "__wolf" })), 380);
    },
    soberLines(c, id) {
      const g = c.g, nm = (x) => (g.players.find((q) => q.id === x) || {}).name || "?";
      return [sees(g, id).length ? `人狼: ${sees(g, id).map(nm).join("、")}` : "人狼はいません。"];
    },
    soberPeek(c, id) {
      const pk = {}, ids = sees(c.g, id);
      if (ids.length) pk.wolves = ids;
      return pk;
    },
  });
})(window.ONW);
