/** 狂人 */
(function (ONW) {
  ONW.defineRole("madman", {
    info: { deck: 4, name: "狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.6,
      desc: "人狼陣営。夜の能力はなく、人狼が誰かも分かりません。人狼を勝たせるのが目的です。" },
    groups: { mad: 1, "transform:dark_avatar": 8 },
  });
})(window.ONW);
