/** わら人形 */
(function (ONW) {
  ONW.defineRole("straw_doll", {
    info: { deck: 20, name: "わら人形", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 21,
      desc: "村人陣営。夜行動はありません。死んだときに1人選んで道連れにします。" },
    groups: { tomo: 1, "transform:light_apostle": 8 },
  });
})(window.ONW);
