/** 大狼: 他の人狼系と墓地カードをすべて確認できる */
(function (ONW) {
  const K = ONW.wolfKit;
  const cpuGraves = (g, id, k) => g.center0.forEach((c, idx) => k.infoOf(g, id).grave.push({ idx, role: c }));

  ONW.defineRole("big_wolf", {
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
