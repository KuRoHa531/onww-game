/** 共有者: 他の共有者を確認できる */
(function (ONW) {
  const cpuMates = (g, id, k) => g.players.forEach((q) => { if (q.id !== id && g.initialRoles[q.id] === "mason") k.infoOf(g, id).known[q.id] = "mason"; });

  // ---- CPUの発言・投票(もとは cpu.js。中身は変更なし) ----
  function lieClaim(k, g, p, others, selfRole, co) { return { co, result: { short: "自分だけ", text: "共有者は 私だけでした。", claim: { kind: "mason" } } }; }
  /** 共有者の結果開示（相方がいれば名前、いなければ「私だけ」） */
  const matesResult = (mates) => ({ short: mates.length ? `相方: ${mates.map((q) => q.name).join("、")}` : "自分だけ", text: mates.length ? `共有者は 私と ${mates.map((q) => q.name).join("、")} でした。` : "共有者は 私だけでした。", claim: { kind: "mason" } });
  function cpuClaim(k, g, p, r, i, c) {   // 共有者: 相方の名前を開示
    const others = g.players.filter((q) => q.id !== p.id);
    c.co = "mason";
    c.result = matesResult(others.filter((q) => i.known[q.id] === "mason"));
  }

  ONW.defineRole("mason", {
    // 昼に酔いが覚めた共有者: 他の共有者のカードがめくれる(stage.js の soberPeek の並び: 共有者 → 処刑人 → 従者 → 女王)
    stageSober: { list: { order: 10, run(sp, list) { (sp.masons || []).forEach((id) => list.push([`p:${id}`, "mason", true])); } } },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 他の共有者を選んで確定する
    coResult: {
      kind: "mason",
      masonDone: (sel, K) => [sel.length ? `共有者は 自分と ${sel.map((id) => K.nameOf(id)).join("、")} でした。` : "共有者は 自分だけでした。", { kind: "mason" }, null, "disclose", sel.length ? `相方: ${sel.map((id) => K.nameOf(id)).join("、")}` : "自分だけ"],
    },
    // 夜の演出(stage.js が g.masonReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに仲間の共有者のカードが順に表になる → 夜時間の間ずっと開いたまま
    stageNight: {
      order: 40, field: "masonReveal",
      run(ids, SK) {
        const { later, paint, G } = SK;
        ids.forEach((id, i) => later(() => { const k = `p:${id}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; SK.up[k] = "mason"; SK.glow[k] = true; if (SK.loveMate && id === SK.loveMate.id) SK.lov[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G()); }, i * 380));
      },
    },
    cpuLie: { role: "mason", weight: 9, order: 5, claim: lieClaim },
    cpuClaim,
    /** 墓荒らし・ドッペルゲンガーで共有者を手にしたCPUが、続けて言う結果: 相方（人間の夜の表示 got と同じく、最初の役職が共有者だった人）。いなければ「私だけ」 */
    cpuChainResult(k, g, p, i) { return matesResult(g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason")); },
    cpuVoteExclude: (k, g, p, q, i) => i.known[q.id] === "mason",   // 投票先候補から、共有者の相方は除く
    cpuInit: cpuMates, cpuLearn: cpuMates,   // CPU: 他の共有者を知る
    info: { deck: 13, name: "共有者", team: ONW.TEAM.VILLAGE, wakeOrder: 30, sort: 20,
      desc: "村人陣営。他の共有者がいれば確認できます。" },
    groups: { "transform:light_apostle": 7 },
    nightMsg(c, p) {
      const g = c.g;
      const mates = g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason").map((q) => q.name);
      const text = mates.length ? `もう一人の共有者: ${mates.join("、")}` : "他の共有者はいません。";
      const mateIds = g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason").map((q) => q.id);
      return { text, masonMates: mateIds.length ? mateIds : null };   // 夜の始まりに、仲間の共有者のカードが表になる（夜が終わるまで出続ける）
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      // 共有者: 初期役職時点で共有者だった人が相方として表になる
      const ids = g.players.filter((q) => q.id !== p.id && g.initialRoles[q.id] === "mason").map((q) => q.id);
      c.hold(p.id, ids.length ? `もう一人の共有者: ${t.names(ids)}` : "他の共有者はいません。");
      t.both(t.eff());
      t.setPeek(ids.map((id) => ({ k: `p:${id}`, role: "mason" })), 380);
    },
    soberLines(c, id) {
      const g = c.g;
      const m = g.players.filter((q) => q.id !== id && g.initialRoles[q.id] === "mason").map((q) => q.name);
      return [m.length ? `もう一人の共有者: ${m.join("、")}` : "もう一人の共有者はいません。"];
    },
    soberPeek(c, id) {
      const g = c.g, pk = {};
      const ids = g.players.filter((q) => q.id !== id && g.initialRoles[q.id] === "mason").map((q) => q.id);
      if (ids.length) pk.masons = ids;
      return pk;
    },
  });
})(window.ONW);
