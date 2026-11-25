/** パン屋: 最終盤面にパン屋がいると、昼になって 変化公開 → 新聞 → 暴露 → 麻婆豆腐 のあと、昼のタイマーが始まる前に「パンが焼けました」と全員に知らされる(バナーが消えてから昼タイマー開始) */
(function (ONW) {
  /** 最終盤面のパン屋のID（昼タイマー開始時の「パンが焼けました」の対象） */
  const holders = (g) => g.players.filter((p) => ONW.mimic.eff(g, p.id) === ONW.ROLE.BAKER && !ONW.hiddenDrunk(g, p.id) && !ONW.seal.is(g, p.id)).map((p) => p.id);   // 模倣の人狼がパン屋を模倣していてもパンは焼ける（誰がパン屋かは分からない）
  const count = (g) => holders(g).length;
  /** viewer の目線のパンの数: 銀狼にハッキングされた人は、思い込んでいる役職の目線（本当のパン屋でも自分のぶんは焼けない / パン屋と思い込んでいれば自分のぶんが焼ける）。docs/silver-wolf.md */
  const countFor = (g, vid, ids, addSelf) => (ONW.hack ? ONW.hack.pubView(g, vid, ONW.ROLE.BAKER, ids || holders(g), addSelf) : (ids || holders(g))).length;
  const NOOP = { t: "noop" };   // 何も出さない人へ送る空のメッセージ

  ONW.defineRole("baker", {
    cpuClaim(k, g, p, r, i, c) { c.co = "baker"; },   // パン屋: パンが焼けたことは全員に知らされるので、必ずパン屋COする
    info: { sealTarget: true, deck: 32, name: "パン屋", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 12,
      desc: "村人陣営。夜の能力はありません。最終盤面にパン屋がいると、昼になって、変化公開・新聞・暴露・麻婆豆腐のあと、昼のタイマーが始まる前に「パンが焼けました」と全員に知らされます（誰がパン屋かは分かりません）。" },
    groups: { "transform:light_apostle": 13 },
    /** 昼の始まり(変化公開 → 新聞 → 暴露 → 麻婆豆腐 のあと): 「パンが焼けました」を出す。戻り値: バナーが消えるまでの待ち時間(ms)。出さないときは 0（昼のタイマーはこの後に始まる） */
    dayAnnounce: { order: 120, run(c) {
      const g = c.g, bread = count(g), mine = (vid) => countFor(g, vid, null, true);
      if (bread <= 0 && !g.players.some((p) => mine(p.id) > 0)) return 0;
      c.sendAll((p) => { const n = mine(p.id); return n > 0 ? { t: "bread", n } : NOOP; });   // ハッキングされた人には、その人の目線のパンの数（0なら何も出ない）
      c.sendSpec(bread > 0 ? { t: "bread", n: bread } : NOOP);
      return bread > 0 && ONW.stage && ONW.stage.breadMs ? ONW.stage.breadMs() : 0;   // 待ち時間は本物のパン屋がいるときだけ（偽のパンだけなら、他の人の昼を止めない）
    } },
    /** 酔いが覚めた瞬間に全員へ公開（パンは焼けた通知） */
    soberReveal: { order: 20, run(c, ids) {
      const g = c.g, real = holders(g), newIds = ids.filter((id) => ONW.mimic.eff(g, id) === ONW.ROLE.BAKER);
      const newBread = newIds.length;
      c.sendAll((p) => {
        if (!ONW.hack || !ONW.hack.isFakeUi(g, p.id)) return newBread > 0 ? { t: "bread", n: real.length, banner: newBread } : NOOP;
        const b = countFor(g, p.id, newIds, ids.includes(p.id)), n = countFor(g, p.id, real, true);   // ハッキングされた人: その人の目線
        return b > 0 ? { t: "bread", n, banner: b } : n > 0 ? { t: "bread", n, quiet: true } : NOOP;
      });
      if (newBread > 0) c.sendSpec({ t: "bread", n: count(g), banner: newBread });
    } },
    /** 再入室: バナーは出さず、情報確認にだけ反映 */
    resyncDay: { order: 10, run(c, seat) {
      const n = seat ? countFor(c.g, seat, null, true) : count(c.g);
      return n > 0 ? [{ t: "bread", n, quiet: true }] : [];
    } },
  });
})(window.ONW);
