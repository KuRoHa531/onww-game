/** 光の使徒 */
(function (ONW) {
  ONW.defineRole("light_apostle", {
    info: { deck: 14, name: "光の使徒", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 30,
      desc: "村人陣営。試合開始時に村人陣営の役職へランダムに変化します。" },
    groups: { newsHidden: 1 },
  });
})(window.ONW);
