/**
 * 執念の狂人（マイクラ版 TENACIOUS_MADMAN を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 *   ・ほかの狂人との違いはひとつだけ: 「人狼陣営が勝利していても、自身が死亡していると敗北する」。
 *     生きて（死亡せずに）最後まで残らないと勝てない。人狼陣営が負けた結果では、生死に関わらず通常の狂人と同じく敗北。
 *   ・「死亡」= 追放・連鎖死（道連れ・心中・後追いなど）・昼中の死亡など、死因を問わない（基本勝敗の dead と同じ。js/vote.js の ONW.vote.deadSet）。
 *   ・封印されている執念の狂人は、この効果を失い、ふつうの狂人と同じに勝つ（マイクラ版 addWolfTeamWinners: 封印されていて人狼判定に昇格していない人は対象外）。
 *   ・神の祝福（神が追放されたとき）でも、死亡した執念の狂人は勝てない（マイクラ版 cannotWinByGodBlessing）。封印の例外はなし（マイクラ版どおり）。
 *   ・人狼判定には数えない（狂人系の基本のまま）。人狼がいないときの狂人代用人狼の昇格も他の狂人と同じ。
 *
 * 実装の場所:
 *   ・登録: このファイル（info / groups）と index.html の <script>
 *   ・勝敗: js/vote.js（2of4。determineWinnersCoreBase の基本勝敗・神の祝福・王国滅亡の人狼陣営勝利で、死亡した執念の狂人を勝者から外す。勝敗の説明にも一行足す）
 *   ・ルールコード: js/settings.js（ONW69）
 *   ・周辺: js/roles.js（封印の対象 SEAL_TARGET_ROLES）/ js/roles/village/sense_seer.js（狂人系の気配）/ wiki ほか（3of4。追加済み）
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（人狼陣営＝狂人系の基本勝敗の中で、死亡した本人だけが勝者から外れる）。
 * 重複役職: 特別な扱いなし（docs/overlay-role-priority.md の履歴に追記）。抹消の人狼に抹消されたら狂人になる（最終盤面の役職で判定）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に tenacious_madman はすでに入っている（wiki の order 104）ので、末尾追加は不要。
 * 実装の進み具合は docs/tenacious-madman.md を参照（1of4=登録 / 2of4=勝敗 / 3of4=周辺 / 4of4=総合・docs）。
 */
(function (ONW) {
  ONW.defineRole("tenacious_madman", {
    info: { sealTarget: true, deck: 91, name: "執念の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.695,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。人狼陣営が勝利していても、自身が死亡していると敗北します（追放・道連れなど死因は問いません）。生き残って最後まで見届けるのが目的です。封印されているときはこの効果がなく、ふつうの狂人と同じです。" },
    groups: { mad: 2.97, "transform:dark_avatar": 21 },
  });
})(window.ONW);
