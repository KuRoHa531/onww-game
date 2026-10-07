/** パン屋: 最終盤面にパン屋がいると、昼になって 変化公開 → 新聞 → 暴露 → 麻婆豆腐 のあと、昼のタイマーが始まる前に「パンが焼けました」と全員に知らされる(バナーが消えてから昼タイマー開始) */
(function (ONW) {
  /** 最終盤面のパン屋の数（昼タイマー開始時の「パンが焼けました」の対象） */
  const count = (g) => g.players.filter((p) => g.currentRoles[p.id] === ONW.ROLE.BAKER && !ONW.hiddenDrunk(g, p.id)).length;

  ONW.defineRole("baker", {
    cpuClaim(k, g, p, r, i, c) { c.co = "baker"; },   // パン屋: パンが焼けたことは全員に知らされるので、必ずパン屋COする
    info: { deck: 32, name: "パン屋", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 12,
      desc: "村人陣営。夜の能力はありません。最終盤面にパン屋がいると、昼になって、変化公開・新聞・暴露・麻婆豆腐のあと、昼のタイマーが始まる前に「パンが焼けました」と全員に知らされます（誰がパン屋かは分かりません）。" },
    groups: { "transform:light_apostle": 13 },
    /** 昼の始まり(変化公開 → 新聞 → 暴露 → 麻婆豆腐 のあと): 「パンが焼けました」を出す。戻り値: バナーが消えるまでの待ち時間(ms)。出さないときは 0（昼のタイマーはこの後に始まる） */
    dayAnnounce: { order: 120, run(c) {
      const bread = count(c.g);
      if (bread <= 0) return 0;
      const m = { t: "bread", n: bread }; c.sendAll(m); c.sendSpec(m);
      return ONW.stage && ONW.stage.breadMs ? ONW.stage.breadMs() : 0;
    } },
    /** 酔いが覚めた瞬間に全員へ公開（パンは焼けた通知） */
    soberReveal: { order: 20, run(c, ids) {
      const g = c.g;
      const newBread = ids.filter((id) => g.currentRoles[id] === ONW.ROLE.BAKER).length;
      if (newBread > 0) { const m = { t: "bread", n: count(g), banner: newBread }; c.sendAll(m); c.sendSpec(m); }
    } },
    /** 再入室: バナーは出さず、情報確認にだけ反映 */
    resyncDay: { order: 10, run(c) {
      const n = count(c.g);
      return n > 0 ? [{ t: "bread", n, quiet: true }] : [];
    } },
  });
})(window.ONW);
