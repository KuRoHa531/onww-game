/** メイヤー */
(function (ONW) {
    /** 実績（マイクラ版 stats.js の判定に合わせる） */
  function achievements(g, id, won) {
    const out = [], ini = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    const has = (r) => ini === r || fin === r;
    const roleOf = (pid) => (g.currentRoles || {})[pid] ?? (g.initialRoles || {})[pid];
    const teamKey = (r) => { if (r === "doppelganger") return "third"; const t = r && ONW.ROLE_INFO[r] && ONW.ROLE_INFO[r].team; return t === ONW.TEAM.WOLF ? "wolf" : t === ONW.TEAM.THIRD ? "third" : "village"; };
    const teamOfP = (pid) => teamKey(roleOf(pid));
    const exiled = (pid) => (g.executed || []).includes(pid);
    const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set(g.deadIds || []);
    const players = g.players || [];
    if (fin === "mayor" && (g.votes || {})[id] && exiled((g.votes || {})[id])) out.push("mayor_vote_exile");
    if (exiled(id) && players.some((q) => roleOf(q.id) === "mayor" && (g.votes || {})[q.id] === id)) out.push("exiled_by_mayor_vote");   // 市長に投票されて追放（受け手側）
    return out;
  }

  ONW.defineRole("mayor", {
    achievements,   // 実績
    cpuClaim(k, g, p, r, i, c) {   // メイヤー: 本家どおり70%で本当にメイヤーCO、残り30%は村人騙り（村人が配役にいないときは、いる村役職の騙り）
      if (Math.random() < 0.7) c.co = "mayor";
      else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    info: { sealTarget: true, deck: 44, name: "メイヤー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 14,
      desc: "村人陣営。夜の能力はありません。昼の投票で、ルーム設定の票数ぶん投票できます（最終盤面でメイヤーを持っている人の1票が、その票数ぶんとして数えられます）。票数はルーム設定で全員が見られます。" },
    groups: { "transform:light_apostle": 17 },
    descFor: (desc, g) => desc.replace("ルーム設定の票数", `ルーム設定の票数（このルームでは${ONW.mayorVotes(g)}票）`),   // いまのルーム設定の票数を説明文に差し込む
  });
})(window.ONW);
