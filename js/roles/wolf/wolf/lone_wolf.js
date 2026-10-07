/** 一匹狼: 誰も見えず、誰からも見えない */
(function (ONW) {
  const K = ONW.wolfKit;
  ONW.defineRole("lone_wolf", {
    info: { deck: 24, name: "一匹狼", team: ONW.TEAM.WOLF, wakeOrder: 12, sort: 1.15,
      desc: "人狼陣営。相方が分からず、他の人狼からも見えません。" },
    groups: { wolf: 3, "transform:dark_avatar": 3 },
    hiddenWolf: true,   // 人狼系だが、夜に仲間の人狼から見えない(ONW.VISIBLE_WOLF から外れる)
    nightMsg: () => ({ text: "あなたは一匹狼です。誰も見えず、誰からも見えません。" }),
    got: K.got,   // 手にしたときは「仲間の人狼はいません。」だけ（K.got が一匹狼を分けて扱う）
    soberLines: () => ["あなたは一匹狼です。誰も見えず、誰からも見えません。"],
    // soberPeek なし(誰のカードも🐺にならない)
  });
})(window.ONW);
