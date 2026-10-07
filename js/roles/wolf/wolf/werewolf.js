/** 人狼 */
(function (ONW) {
  const K = ONW.wolfKit;
  ONW.defineRole("werewolf", {
    info: { deck: 1, count: 2, name: "人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.05,
      desc: "人狼陣営。他の人狼を確認できます。" },
    groups: { wolf: 1, "transform:dark_avatar": 1 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
