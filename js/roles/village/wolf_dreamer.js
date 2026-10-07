/** 狼夢人: 自分を「相方のいない一人の人狼」だと思い込んでいる村人 */
(function (ONW) {
  ONW.defineRole("wolf_dreamer", {
    info: { deck: 30, name: "狼夢人", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 8,
      desc: "村人陣営。自分のことを人狼だと思い込んでいる村人です。占い結果は狼夢人です。夜は相方のいない一人の人狼として認識します。" },
    groups: { selfAsWolf: 1, "transform:light_apostle": 11 },
    nightMsg: () => ({ text: "仲間の人狼はいません。" }),   // 本物の人狼と同じ表示(仲間のカードは出ない)
    got(c, p) { c.hold(p.id, "仲間の人狼はいません。"); },   // 手にしたら、自分は相方のいない一人の人狼だと思い込む
  });
})(window.ONW);
