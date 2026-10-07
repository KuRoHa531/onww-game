/** 白狼: 占い結果が村人と出る人狼 */
(function (ONW) {
  const K = ONW.wolfKit;
  ONW.defineRole("white_wolf", {
    info: { deck: 25, name: "白狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.2,
      desc: "人狼陣営。占い結果が村人と出る人狼です。相方や狂信者からは人狼として見えます。" },
    seerSees: "villager",   // 占われたときに見える役職
    groups: { wolf: 4, "transform:dark_avatar": 4 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
