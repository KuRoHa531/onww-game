/** 狂信者: 墓地以外の人狼プレイヤーを知っている狂人 */
(function (ONW) {
  const cpuLearn = (g, id, k) => g.players.forEach((q) => { if (k.isVisibleWolf(g.initialRoles[q.id])) k.infoOf(g, id).known[q.id] = g.initialRoles[q.id]; });

  ONW.defineRole("cultist", {
    // 夜の演出(stage.js が g.cultReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに人狼プレイヤーのカードが順に表になり、🐺が出る → 夜時間の間ずっと開いたまま
    stageNight: {
      order: 30, field: "cultReveal",
      run(ids, SK) {
        const { later, paint, G } = SK;
        ids.forEach((id, i) => later(() => { const k = `p:${id}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; SK.up[k] = SK.loveMate && SK.loveMate.id === id ? SK.DUO_MARK : SK.WOLF_MARK; SK.glow[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G()); }, i * 380));
      },
    },
    cpuInit(g, id, k) { cpuLearn(g, id, k); const mid = g.players.some((q) => k.isWolf(g.initialRoles[q.id])) ? null : ONW.vote.certainPromotion(g);   // 人狼不在で昇格が確定している狂人 = ご主人
      if (mid && mid !== id) k.infoOf(g, id).known[mid] = "werewolf"; },   // CPUは人狼側の仲間として扱う（役職は不明）
    cpuLearn,   // CPU: 人狼系を知っている
    info: { deck: 6, name: "狂信者", team: ONW.TEAM.WOLF, wakeOrder: 20, sort: 1.7,
      desc: "人狼陣営。墓地以外の人狼プレイヤーを知っている狂人です。" },
    groups: { mad: 3, "transform:dark_avatar": 10 },
    nightMsg(c, p) {
      const g = c.g;
      let cultWolves = null;
      const seenP = g.players.filter((q) => ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])), seen = seenP.map((q) => q.name);
      if (seenP.length) cultWolves = seenP.map((q) => q.id);   // 夜の始まりに、そのカードが表になって🐺が出る
      const mid = seen.length ? null : ONW.vote.certainPromotion(g);   // 人狼が不在で昇格が確定している狂人 = ご主人（役職まではわからない）
      const master = mid ? g.players.find((q) => q.id === mid) : null;
      if (!seenP.length && master && master.id === p.id) cultWolves = [p.id];   // 狂信者自身がご主人のときは、自分のカードが🐺にめくれる
      const text = seen.length ? `人狼の気配: ${seen.join("、")}` : master ? `ご主人: ${master.name}${master.id === p.id ? "（あなた）" : ""}` : "見える人狼はいません。";
      return { text, cultWolves };
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      // 狂信者: 初期役職時点の人狼に🐺。人狼が不在なら、昇格が決まっている狂人がご主人（自分がご主人なら自分のカードが🐺にめくれる）
      const ids = t.wolfIds(p.id);
      // 他に昇格が決まっている狂人も人狼系もいなければ、いま手にした狂信者の自分自身が昇格する → 自分がご主人
      const mid = ids.length ? null : (ONW.vote.certainPromotion(g) || (ONW.vote.claimSelfPromotion(g, p.id) ? p.id : null)), master = mid ? g.players.find((q) => q.id === mid) : null;
      c.hold(p.id, ids.length ? `人狼の気配: ${t.names(ids)}` : master ? `ご主人: ${master.name}${master.id === p.id ? "（あなた）" : ""}` : "見える人狼はいません。");
      t.both(t.eff());
      const peek = ids.map((id) => ({ k: `p:${id}`, role: "__wolf" }));
      if (master && master.id === p.id) peek.push({ k: `p:${p.id}`, role: "__wolf" });
      t.setPeek(peek, 380);
    },
    soberLines(c, id) {
      const g = c.g;
      const wolves = g.players.filter((q) => q.id !== id && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.name);
      return [wolves.length ? `人狼: ${wolves.join("、")}` : "人狼はいません。"];
    },
    soberPeek(c, id) {
      const g = c.g, pk = {};
      const ids = g.players.filter((q) => ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.id);
      if (ids.length) pk.wolves = ids;
      else { const mid = ONW.vote.certainPromotion(g); if (mid === id) pk.wolves = [id]; }
      return pk;
    },
  });
})(window.ONW);
