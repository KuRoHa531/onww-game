/** 闇の化身 */
(function (ONW) {
  ONW.defineRole("dark_avatar", {
    info: { deck: 3, name: "闇の化身", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.0,
      desc: "人狼陣営。試合開始時に人狼陣営の役職へランダムに変化します。" },
    groups: { newsHidden: 2 },
  });
})(window.ONW);
