/** 村人 */
(function (ONW) {
  ONW.defineRole("villager", {
    cpuLie: { role: "villager", weight: 18, order: 2 },   // 騙りで名乗る確率の重み
    cpuClaim(k, g, p, r, i, c) { c.co = "villager"; },   // 村人は必ずCOする（以前は約1割がCOしなかった）
    info: { deck: 7, count: 2, name: "村人", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 33,
      desc: "村人陣営。能力はありません。" },
    groups: { "transform:light_apostle": 1 },
  });
})(window.ONW);
