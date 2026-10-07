/** 忘却の人狼: 自分を村人だと思い込んでいる人狼(夜の情報なし) */
(function (ONW) {
  const K = ONW.wolfKit;
  ONW.defineRole("forgetful_wolf", {
    info: { deck: 27, name: "忘却の人狼", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.3,
      desc: "人狼陣営。自分のことを村人だと思い込んでいる人狼です。占い結果は人狼です。本人視点では村人として夜を認識します。" },
    groups: { wolf: 6, selfAsVillager: 1, "transform:dark_avatar": 6 },
    // 夜の表示・手にしたとき・酔い覚めの文章は「村人」と同じで何もなし。
    // 既存の挙動を保持: 酔い覚めの演出だけは、他の人狼系と同じ🐺の表示が出る(旧 soberPeek の挙動)
    soberPeek: K.soberPeek,
  });
})(window.ONW);
