/** てるてる坊主 */
(function (ONW) {
  // ---- CPUの発言・投票(もとは cpu.js。中身は変更なし。一目惚れしてるてるも使う) ----
  function cpuClaim(k, g, p, r, i, c) {   // てるてる系: 55%村人騙り、残りの半分は占い騙り（本家）。どれでも必ず何かをCOする
    const { rn, plainLie, fakeSeerTarget, fakeSeerResult } = k;
    { const pl = plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }   // 村人がいなければ別の村役職を騙る
    if (Math.random() >= 0.55 && Math.random() < 0.5) {
      const t = fakeSeerTarget(g, p);
      if (t) {
        const role = fakeSeerResult(g, p, t, r);
        c.co = "seer";
        c.result = { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } };
      }
    }
  }

  ONW.defineRole("tanner", {
    cpuClaim,
    cpuVoteScore: () => 1.0,   // 投票: てるてる系は追放されたいので、評価点に少し足す
    info: { deck: 15, name: "てるてる坊主", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 34,
      desc: "第三陣営。自分が追放されると勝利です。" },
    groups: { "transform:silver_shadow": 1 },
  });
})(window.ONW);
