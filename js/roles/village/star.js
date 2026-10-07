/** スター: 村人陣営。最終盤面でスターを持っている人のカードは、朝のあとの待機時間に全員の画面で表になる */
(function (ONW) {
  /** 最終盤面でスターを持っているプレイヤーのID（スター公開の対象） */
  const holders = (g) => g.players.filter((p) => g.currentRoles[p.id] === ONW.ROLE.STAR && !ONW.hiddenDrunk(g, p.id)).map((p) => p.id);   // 酔いが覚めていない人は、覚めた瞬間に公開される
  const nameList = (g, ids) => ids.map((id) => (g.players.find((q) => q.id === id) || {}).name);

  ONW.defineRole("star", {
    // 朝の待機時間(stage.js が g.settleStars を受け取って呼ぶ): 最終盤面でスターを持っている人のカードが全員の画面で同時に表になる（後覚者の確認とは別に「スター」の札が付く。昼になったら札を外して伏せる）
    stageSettle: {
      field: "settleStars", shown: "settleStarShown",
      run: { order: 10, run(ids, SK) { SK.later(() => { ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.show(k, "star"); SK.badge[k] = "★スター"; SK.starKeys.push(k); SK.paint(SK.G()); }, i * 380)); }, 300); } },
      end: { order: 20, run(SK) { if (SK.starKeys.length) { SK.starKeys.forEach((k) => { delete SK.badge[k]; }); SK.starKeys.length = 0; SK.paint(SK.G()); } } },
    },
    // 昼に酔いが覚めたスター: 全員の画面でカードがめくれ、しばらくして裏に戻る
    stageFlash: {
      field: "starFlash",
      run(ids, SK) {
        ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = "star"; SK.badge[k] = "★スター"; SK.flashKeys.push(k); SK.paint(SK.G()); }, 200 + i * 380));
        SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; delete SK.up[k]; delete SK.badge[k]; SK.pull(SK.flashKeys, k); }); SK.paint(SK.G()); }, 200 + ids.length * 380 + 3000);
      },
    },
    // CPUの発言: 待機時間に全員へ公開済みなので、必ずスターCOする
    cpuFirst: (k, g, p) => [{ p, text: `${k.rn("star")}CO`, co: "star", claim: { kind: "villager" }, gap: 3500 }],
    info: { deck: 33, name: "スター", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16,
      desc: "村人陣営。夜の能力はありません。最終盤面でスターを持っている人のカードは、朝のあとの待機時間に全員の画面で表になり、誰がスターか公開されます。" },
    groups: { "transform:light_apostle": 14 },
    settleMsg: { order: 60, run(c, p, mode) {
      const g = c.g, stars = holders(g);
      // ※既存の挙動を保持: 待機時間の通常送信と再入室で、名前の取り出し方が同じ(見つからなければ例外)
      return { stars, starNames: stars.map((id) => g.players.find((q) => q.id === id).name) };
    } },
    /** 昼のうちに役職が動いて、新しくスターを持った人（酔いが覚めている人）がいたら、その瞬間に全員の画面でカードが表になって裏に戻る。before: 動く前の g.currentRoles */
    dayCheck(c, before) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      const ids = holders(g).filter((id) => before[id] !== ONW.ROLE.STAR);
      if (!ids.length) return;
      const m = { t: "starup", ids, names: nameList(g, holders(g)) };
      c.sendAll(m); c.sendSpec(m);
    },
    /** 酔いが覚めた瞬間に全員へ公開（全員の画面でカードがめくれて裏に戻る） */
    soberReveal: { order: 10, run(c, ids) {
      const g = c.g;
      const newStars = ids.filter((id) => g.currentRoles[id] === ONW.ROLE.STAR);
      if (newStars.length) { const m = { t: "starup", ids: newStars, names: nameList(g, holders(g)) }; c.sendAll(m); c.sendSpec(m); }
    } },
  });
})(window.ONW);
