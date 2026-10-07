/** 負け組 */
(function (ONW) {
  ONW.defineRole("loser", {
    info: { deck: 37, name: "負け組", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 42,
      desc: "第三陣営。夜の能力はありません。最終的にこの役職であれば、ほかの勝敗に関係なく敗北します（神の祝福でも敗北）。恋人になっていても、最終的に負け組なら、恋人が勝利しても負け組のみ敗北します。" },
    groups: { "transform:silver_shadow": 9 },
    // CPUのCO（本家「COのみ」ルール）: 35%で本当に「負け組CO」（結果開示はなし）、残りは村人側などを騙る
    cpuClaim(k, g, p, r, i, c) { k.optionalCo(g, p, r, c, () => ({ co: "loser", result: null })); },
    cpuLie: { role: "loser", weight: 3, order: 10, claim: () => ({ co: "loser", result: null }) },
  });
})(window.ONW);
