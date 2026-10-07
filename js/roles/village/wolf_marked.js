/** 狼憑き */
(function (ONW) {
  ONW.defineRole("wolf_marked", {
    info: { deck: 31, name: "狼憑き", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 9,
      desc: "村人陣営。自認はただの村人ですが、占われると人狼結果が出ます。" },
    seerSees: "werewolf",   // 占われたときに見える役職
    groups: { selfAsVillager: 2, "transform:light_apostle": 12 },
  });
})(window.ONW);
