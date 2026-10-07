/** 天邪鬼 */
(function (ONW) {
  ONW.defineRole("amanojaku", {
    info: { deck: 23, name: "天邪鬼", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 43,
      desc: "第三陣営。村人陣営が勝たなければ追加勝利です。" },
    groups: { "transform:silver_shadow": 5 },
    // CPUのCO（本家「COのみ」ルール）: 天邪鬼は本当のCOをせず、必ず騙る（村人側などを名乗る）
    cpuClaim(k, g, p, r, i, c) { k.optionalCo(g, p, r, c, null); },
  });
})(window.ONW);
