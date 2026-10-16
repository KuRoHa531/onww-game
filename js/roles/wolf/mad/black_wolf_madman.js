/**
 * 黒子の狂人（マイクラ版 BLACK_WOLF_MADMAN を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 * 狼憑きとほぼ同じ作りだが、自認だけが違う:
 *   ・占い師・狂った占い師に占われると「人狼」と出る（seerSees。狼憑きと同じ見え方）
 *   ・狼憑きは本人が自分を「村人」だと思い込む（selfAsVillager）が、黒子の狂人は自分が黒子の狂人だと分かっている（自認は黒子の狂人のまま。groups に selfAsVillager は入れない）
 *   ・陣営は人狼陣営（狼憑きは村人陣営）。勝敗は狂人系の基本のまま: 人狼判定には数えない（人狼がいないとき狂人代用人狼で昇格することはある。groups.mad に入れるだけで vote.js が扱う）
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（人狼陣営＝狂人系の基本勝敗）。
 * 重複役職: 特別な扱いなし（抹消の人狼に抹消されたら狂人になる＝既存の MAD_KIND → 狂人の規則どおり）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に black_wolf_madman はすでに入っている（wiki の order 100）。
 * 実装の進み具合は _wip/依頼文_黒子の狂人_*.txt を参照。
 */
(function (ONW) {
  ONW.defineRole("black_wolf_madman", {
    info: { deck: 73, name: "黒子の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.66,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。占い師に占われると「人狼」と出ます（人狼判定には数えません）。人狼を勝たせるのが目的です。" },
    seerSees: "werewolf",   // 占われたときに見える役職
    groups: { mad: 2.8, "transform:dark_avatar": 17 },
  });
})(window.ONW);
