/** 勝ち組 */
(function (ONW) {
  ONW.defineRole("winner", {
    info: { deck: 36, name: "勝ち組", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 41,
      desc: "第三陣営。夜の能力はありません。最終的にこの役職であれば、ほかの勝敗に関係なく追加で勝利します（死亡・追放されていても勝てます）。恋人になっていても、最終的に勝ち組なら、恋人が敗北しても勝ち組のみ勝利します。" },
    groups: { "transform:silver_shadow": 8 },
    // CPUのCO（本家「COのみ」ルール）: 35%で本当に「勝ち組CO」（結果開示はなし）、残りは村人側などを騙る
    cpuClaim(k, g, p, r, i, c) { k.optionalCo(g, p, r, c, () => ({ co: "winner", result: null })); },
    cpuLie: { role: "winner", weight: 3, order: 9, claim: () => ({ co: "winner", result: null }) },   // 他の役職のCPUが騙りで名乗ることもある（本家の騙りの抽選表では重み1/約30）
  });
})(window.ONW);
