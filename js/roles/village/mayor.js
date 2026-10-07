/** メイヤー */
(function (ONW) {
  ONW.defineRole("mayor", {
    cpuClaim(k, g, p, r, i, c) {   // メイヤー: 本家どおり70%で本当にメイヤーCO、残り30%は村人騙り（村人が配役にいないときは、いる村役職の騙り）
      if (Math.random() < 0.7) c.co = "mayor";
      else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    info: { deck: 44, name: "メイヤー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 14,
      desc: "村人陣営。夜の能力はありません。昼の投票で、ルーム設定の票数ぶん投票できます（最終盤面でメイヤーを持っている人の1票が、その票数ぶんとして数えられます）。票数はルーム設定で全員が見られます。" },
    groups: { "transform:light_apostle": 17 },
    descFor: (desc, g) => desc.replace("ルーム設定の票数", `ルーム設定の票数（このルームでは${ONW.mayorVotes(g)}票）`),   // いまのルーム設定の票数を説明文に差し込む
  });
})(window.ONW);
