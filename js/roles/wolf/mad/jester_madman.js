/**
 * 道化の狂人（マイクラ版 JESTER_MADMAN を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 *   ・ほかの狂人との違いはひとつだけ: 「追放または道連れで死亡した場合、人狼が1人以上死んでいても人狼陣営の勝利になる」。
 *     （人狼が誰か死んでいると、ふつうは村人陣営の勝ちになるが、道化の狂人が吊られる・道連れで死ぬとそれを覆して人狼陣営が勝つ）
 *   ・ただし、道化の狂人自身が人狼判定に昇格していて（人狼がいないときの狂人代用人狼）吊られた場合は、この効果は働かず、人狼陣営は敗北（村人陣営の勝ち）。
 *   ・封印されている道化の狂人は、この効果を失い、ふつうの狂人と同じ（マイクラ版 buildJesterMadmanPriorityResult の isSealedPlayerId）。
 *   ・「追放または道連れ」= 投票による追放（独裁処刑・クーデターも追放）と、猫又・黒猫・ネコカボチャ・わら人形などの道連れ。心中・無理心中・後追い・番犬の噛殺・爆殺・王国滅亡・昼中の死亡では働かない（マイクラ版の死因 execute / chain だけ）。
 *   ・従者は、昇格していない道化の狂人の身代わりにならない（マイクラ版 isServantSubstitutionBlockedRole）。
 *   ・人狼判定には数えない（狂人系の基本のまま）。人狼がいないときの狂人代用人狼の昇格も他の狂人と同じ。
 *
 * 実装の場所:
 *   ・登録: このファイル（info / groups）と index.html の <script>（1of4）
 *   ・勝敗: js/vote.js（2of4。determineWinnersCoreBase の分岐 1.9。バランサーのすぐ下・てるてる系のすぐ上）
 *   ・周辺: 従者の身代わりの除外（js/vote.js）/ js/roles/village/sense_seer.js（狂人系の気配）/ wiki ほか（3of4）
 *   ・ルールコード: js/settings.js（ONW70）
 *
 * 勝利優先度: docs/victory-priority.md に新しい行を足した（バランサー ＞ 道化の狂人 ＞ てるてる坊主＝一目惚れしてるてる＝処刑人）。詳細は docs/jester-madman.md。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に jester_madman はすでに入っている（wiki の order 105）ので、末尾追加は不要。
 * 実装の進み具合は docs/jester-madman.md を参照（1of4=登録 / 2of4=勝敗 / 3of4=周辺 / 4of4=総合・docs）。
 */
(function (ONW) {
  ONW.defineRole("jester_madman", {
    info: { sealTarget: true, deck: 92, name: "道化の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.697,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。追放または道連れで死亡した場合、人狼が1人以上死んでいても人狼陣営の勝利になります。しかし、自身が人狼判定に昇格したうえで吊られた場合は、人狼陣営は敗北します。封印されているときはこの効果がなく、ふつうの狂人と同じです。" },
    groups: { mad: 2.98, "transform:dark_avatar": 22 },
  });
})(window.ONW);
