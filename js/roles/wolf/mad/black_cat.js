/** 黒猫 */
(function (ONW) {
  ONW.defineRole("black_cat", {
    info: { deck: 22, name: "黒猫", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.75,
      desc: "人狼陣営。吊られると誰かを道連れにする狂人です。ご主人を道連れにする可能性もあります。" },
    groups: { mad: 4, tomo: 3, "transform:dark_avatar": 13 },
  });
})(window.ONW);
