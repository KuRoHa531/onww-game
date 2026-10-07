/** 猫又 */
(function (ONW) {
  ONW.defineRole("cat_sidhe", {
    info: { deck: 21, name: "猫又", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 22,
      desc: "村人陣営。自分が処刑されたらランダムな1人を道連れにします。" },
    groups: { tomo: 2, "transform:light_apostle": 9 },
  });
})(window.ONW);
