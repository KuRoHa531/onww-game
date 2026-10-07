/** オポチュニスト */
(function (ONW) {
  ONW.defineRole("opportunist", {
    info: { deck: 19, name: "オポチュニスト", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 44,
      desc: "第三陣営。夜の能力はありません。最後まで追放されなければ、ほかの勝敗に追加で勝利します。" },
    groups: { "transform:silver_shadow": 4 },
  });
})(window.ONW);
