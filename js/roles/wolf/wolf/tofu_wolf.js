/** 豆腐の人狼: 1票でも入るとメンタル崩壊する人狼 */
(function (ONW) {
  const K = ONW.wolfKit;
  ONW.defineRole("tofu_wolf", {
    info: { deck: 26, name: "豆腐の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.25,
      desc: "人狼陣営。1票でも投票されると、処刑される人と同時にめくられ、メンタル崩壊で死亡します。ただし麻婆の人狼がいる間は、1票ではメンタル崩壊せず（最多得票のときだけ追放）、2票持ちになります。" },
    groups: { wolf: 5, "transform:dark_avatar": 5 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
