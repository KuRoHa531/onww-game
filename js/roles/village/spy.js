/**
 * スパイ（村人陣営）
 * ------------------------------------------------------------
 * 夜の能力・昼の能力はなし。村人陣営（勝敗は村人陣営の基本勝敗のまま。docs/victory-priority.md）。
 *   ・「人狼が分かる役職」（人狼系・狂信者・マーリン・魔界公爵など）からは、人狼の🐺として見える。
 *     → 仲間の人狼の一覧・夜の始まりのカードめくり（🐺）・墓荒らし/ドッペル経由・酔い覚めの情報・CPUの記憶に入る（wolfLook: true。ONW.WOLF_LOOK / ONW.WOLF_LOOK_ALL）。
 *   ・占い結果は「スパイ」（seerSees を指定しないので本当の役職がそのまま見える）。
 *   ・保安官に撃たれると誤爆（村人陣営なので sheriff.js の isHit が false。この役職ファイルでは何もしない）。
 *   ・闇鍋: スパイが出る盤面には、闇の化身から「一匹狼以外の人狼系」が合計2人以上出る（js/roles.js の SYNERGY_COUNT_RULES。
 *     人狼が1人だけだとスパイが確定してしまうため）。
 * 詳細は docs/spy.md。
 */
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
    if (fin === "spy" && won && !exiled(id)) out.push("spy_survive_win");
    return out;
  }

  ONW.defineRole("spy", {
    achievements,   // 実績
    info: { deck: 98, name: "スパイ", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 23.3,
      desc: "村人陣営。人狼が分かる役職からは人狼として見えます。占い結果はスパイで、保安官に撃たれると誤爆になります。" },
    wolfLook: true,   // 人狼が分かる役職からは人狼の🐺として見える（ONW.WOLF_LOOK / WOLF_LOOK_ALL）
    groups: { "transform:light_apostle": 36 },   // 光の使徒の変化先（村人陣営）
  });
})(window.ONW);
