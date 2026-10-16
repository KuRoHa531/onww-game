/**
 * 狂ったメイヤー（マイクラ版 MAD_MAYOR を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 * 「メイヤー」とほぼ同じで、違いは次の2点だけ。
 *   ・陣営が人狼陣営の狂人系（勝敗は狂人系の基本のまま。人狼判定には数えない。人狼がいないときの狂人代用人狼の昇格も他の狂人と同じ）
 *   ・票数はメイヤーとは別の設定「狂ったメイヤーの投票数」（g.madMayorVoteCount。マイクラ版 madMayorVoteCount と同じ 2〜10票、初期値2票）
 *
 * 実装の場所:
 *   ・票の重み: js/vote.js の vote.weightOf（最終盤面で狂ったメイヤーを持っていて、酔いが覚めている人。模倣の人狼が模倣しているときも E() 経由で同じ）
 *   ・票数の取り出し: js/state.js の ONW.madMayorVotes(g) / 既定値 madMayorVoteCount: 2
 *   ・説明文への票数の差し込み: このファイルの descFor
 *   ・ルーム設定（票数の＋−・共有・ルールコード ONW53）: js/ui.js / js/net.js / js/settings.js
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（人狼陣営＝狂人系の基本勝敗）。
 * 重複役職: 特別な扱いなし（抹消の人狼に抹消されたら狂人になる＝既存の MAD_KIND → 狂人の規則どおり）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に mad_mayor はすでに入っている（wiki の order 101）ので、末尾追加は不要。
 * 実装の進み具合は _wip/依頼文_狂ったメイヤー_*.txt を参照。
 */
(function (ONW) {
  ONW.defineRole("mad_mayor", {
    info: { deck: 75, name: "狂ったメイヤー", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.67,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。昼の投票で、ルーム設定の狂ったメイヤー票数ぶん投票できます（最終盤面で狂ったメイヤーを持っている人の1票が、その票数ぶんとして数えられます）。票数はルーム設定で全員が見られます。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.9, "transform:dark_avatar": 18 },
    descFor: (desc, g) => desc.replace("ルーム設定の狂ったメイヤー票数", `ルーム設定の狂ったメイヤー票数（このルームでは${ONW.madMayorVotes(g)}票）`),   // いまのルーム設定の票数を説明文に差し込む（メイヤーの descFor と同じ作り）
  });
})(window.ONW);
