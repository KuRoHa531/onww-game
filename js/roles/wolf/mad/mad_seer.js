/** 狂った占い師: 占いの能力を持った狂人(夜・朝の処理は占い師と同じ。seer.js の定義を土台にする) */
(function (ONW) {
  ONW.defineRole("mad_seer", {
    info: { deck: 5, name: "狂った占い師", team: ONW.TEAM.WOLF, wakeOrder: 41, sort: 1.65,
      desc: "人狼陣営。占いの能力を持った狂人です。" },
    groups: { mad: 2, "transform:dark_avatar": 11 },
    like: "seer" });
})(window.ONW);
