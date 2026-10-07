/** 銀色の影 */
(function (ONW) {
  ONW.defineRole("silver_shadow", {
    info: { deck: 16, name: "銀色の影", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 32,
      desc: "第三陣営。試合開始時に第三陣営の役職へランダムに変化します。" },
    groups: { newsHidden: 3 },
  });
})(window.ONW);
