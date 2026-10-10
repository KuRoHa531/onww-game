/**
 * 麻婆の人狼（マイクラ版 MAPO_WOLF を参考）: 人狼陣営の「人狼系」。夜は人狼と同じく仲間の人狼が分かり、占い・判定・勝利条件も人狼と同じ。
 * 盤面にいる間の効果:
 *   ・豆腐の人狼は「1票でメンタル崩壊」しなくなり、最多得票のときだけ追放される（js/vote.js / wolf_king.js）
 *   ・豆腐の人狼は2票持ちとして数えられる（js/vote.js）
 *   ・昼の始まりに、麻婆の人狼と豆腐の人狼が両方いると「麻婆豆腐が完成しました」の演出が出る（このファイルの dayAnnounce。変化公開 → 新聞 → 麻婆豆腐 → 昼タイマー開始(パン屋)）
 *   ・闇鍋では、麻婆の人狼が出たら豆腐の人狼も必ず出る（js/roles.js の SYNERGY_RULES）
 *   ・闇鍋では、さらに麻婆豆腐の3票に対抗できる役職（市長・番犬・保安官・交換者・独裁者のどれか1枚）も盤面(プレイヤー+墓地)に必ず出る（js/roles.js の ONW.MAPO_COUNTER_ROLES。候補を足すときはそこに1つ足す）
 */
(function (ONW) {
  const K = ONW.wolfKit;
  /** 麻婆の人狼と豆腐の人狼が、どちらも最終盤面で酔いが覚めている人としているか。1試合1回だけ完成する */
  const hasMapo = (g) => g.players.some((p) => g.currentRoles[p.id] === ONW.ROLE.MAPO_WOLF && !ONW.hiddenDrunk(g, p.id));
  const hasTofu = (g) => g.players.some((p) => g.currentRoles[p.id] === ONW.ROLE.TOFU_WOLF && !ONW.hiddenDrunk(g, p.id));   // 豆腐の人狼も、酔いが覚めてから数える（酔い覚めの瞬間に完成の演出が出る）
  function announce(c) {
    const g = c.g;
    if (g.mapoAnnounced || !hasMapo(g) || !hasTofu(g)) return false;
    g.mapoAnnounced = true;
    return true;
  }
  ONW.defineRole("mapo_wolf", {
    info: { deck: 50, name: "麻婆の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.45,
      desc: "人狼陣営。他の人狼を確認できます。盤面にいる間、豆腐の人狼は1票追放ではなく最多得票時にのみ追放され、さらに2票持ちとして数えられます。豆腐の人狼もいると、昼の始まりに麻婆豆腐が完成します。占い・判定・勝利条件は常に人狼として扱われます。" },
    groups: { wolf: 8.5, "transform:dark_avatar": 8.5 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,
    /** 昼の始まり(変化公開 → 新聞 のあと): 麻婆豆腐の完成演出を出す。戻り値: 演出が出終わるまでの待ち時間(ms)。出さないときは 0 */
    dayAnnounce: { order: 110, run(c) {
      if (!announce(c)) return 0;
      const m = { t: "mapo" }; c.sendAll(m); c.sendSpec({ ...m, quiet: true });
      return ONW.stage && ONW.stage.mapoMs ? ONW.stage.mapoMs() : 0;
    } },
    /** 昼のうちに、酔いが覚めた麻婆の人狼がいるのに豆腐の人狼もいて、まだ完成していなければ、その瞬間に完成の演出を出す（昼のタイマーは止めない） */
    dayNews: { order: 110, run(c) {
      if (c.g.phase !== c.PH.ONLINE_DAY) return;
      if (!announce(c)) return;
      const m = { t: "mapo", late: true }; c.sendAll(m); c.sendSpec({ ...m, quiet: true });
    } },
    /** 再入室: 演出は出さず、情報確認にだけ反映 */
    resyncDay: { order: 15, run(c) {
      return c.g.mapoAnnounced ? [{ t: "mapo", quiet: true }] : [];
    } },
  });
})(window.ONW);
