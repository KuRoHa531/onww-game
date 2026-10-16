/**
 * 狂った交換者（マイクラ版 MAD_EXCHANGER を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 * 「交換者」とほぼ同じで、違いは次の点だけ。
 *   ・陣営が人狼陣営の狂人系（勝敗は狂人系の基本のまま。人狼判定には数えない。人狼がいないときの狂人代用人狼の昇格も他の狂人と同じ）
 *   ・役職名・通知の名前が「狂った交換者」（昼行動結果・結果発表の字幕・昼能力の画面）
 *   昼能力そのもの（昼に1回、生きている人2人の票数を入れ替える）は交換者と同じ仕組みを共有する:
 *   js/roles/village/exchanger.js の ONW.exchanger（canUse / targets / apply / view）が、交換者と狂った交換者の両方を扱う。
 *
 * 実装の場所:
 *   ・登録: このファイル（info / groups）と index.html の <script>
 *   ・昼能力: js/roles/village/exchanger.js（共通）/ js/net.js hostExchange / js/ui.js exchBlock
 *   ・結果発表の演出: js/roles/village/exchanger.js の stageResult（交換者のフックが全員ぶんを処理する。ここには持たない＝二重に動かないように）
 *   ・ルールコード: js/settings.js（ONW55）
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（人狼陣営＝狂人系の基本勝敗）。
 * 重複役職: 特別な扱いなし（抹消の人狼に抹消されたら狂人になる＝既存の MAD_KIND → 狂人の規則どおり）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に mad_exchanger はすでに入っている（wiki の order 103）ので、末尾追加は不要。
 * 実装の進み具合は docs/mad-exchanger.md を参照（1of4=登録 / 2of4=昼能力 / 3of4=CPU・デバッグ・封印対象・表示確認 / 4of4=勝敗確認・docs・総合。全4段階 完了）。
 */
(function (ONW) {
  ONW.defineRole("mad_exchanger", {
    info: { deck: 77, name: "狂った交換者", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.69,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。昼の議論中に「昼能力」ボタンから生きている人を2人（自分を含めてよい）選ぶと、その2人の票数を入れ替えます。入れ替わるのは投票の集計のときで、結果発表で票数が出たあとに入れ替わる様子が見えます。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に狂った交換者を持っている人が使えます。交換者と同じく、使った順に入れ替わります。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.96, "transform:dark_avatar": 20 },
  });
})(window.ONW);
