/**
 * ネコカボチャ（マイクラ版 CAT_PUMPKIN を参考）: 人狼陣営の「人狼系」。夜は人狼と同じく仲間の人狼が分かり、占い・判定・勝利条件も人狼と同じ。
 * 追放（めくれた）されると、黒猫と同じ演出で誰かを道連れにする（kind: "tomo"）。黒猫との違いは、道連れの候補から「人狼判定」の人
 * （本物の人狼系 + 昇格した狂人 = ONW.vote.wolfJudgeIds）を除くこと。人狼判定の人しか残っていなければ道連れは起きない。
 * 道連れの選択は vote.js の resolveChain（猫又・黒猫と同じ場所）。保安官・番犬はWeb版にないので、その部分は対象外。
 */
(function (ONW) {
  const K = ONW.wolfKit;
  ONW.defineRole("cat_pumpkin", {
    info: { deck: 49, name: "ネコカボチャ", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.5,
      desc: "人狼陣営。他の人狼を確認できます。追放されると、黒猫と同じようにランダムな1人を道連れにします。占い・判定・勝利条件は常に人狼として扱われます。" },
    groups: { wolf: 9, tomo: 4, "transform:dark_avatar": 9 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,
  });
})(window.ONW);
