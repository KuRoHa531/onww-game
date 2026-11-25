/**
 * negi_wolf.js — 葱の人狼（人狼陣営 / deck 140 / 発案: くろは / 元ネタ: オリジナル）
 *
 * マイクラ版（scripts/extraRoles.js の announceHiyayakkoNotification / shouldShowHiyayakkoNotification、
 * scripts/vote.js の applyNegiWolfMentalCollapse / hasMapoOrNegiWolf、state.js の ROLE_INFO、
 * roles.js の YAMINABE_TRANSFORM_SYNERGY_RULES / YAMINABE_SEAL_TARGET_ROLES、stats.js の実績）と
 * Wiki（order 90）を正とする。作者（くろはさん）の依頼メモ（2026-11-25）:
 * 「冷奴完成演出は麻婆豆腐を参考に。図形で普通の長ネギと豆腐が合わさったあと、
 * 豆腐の上に刻んだ長ネギがのった図形になる感じ」→ stage.js の stage.hiyayakko / css の .hyk-* 参照。
 *
 * ・夜の行動は無い（人狼系共通の夜情報だけ。仲間の人狼が分かる）。占い結果は「葱の人狼」。
 * ・冷奴の完成: 最終盤面で葱の人狼と豆腐の人狼が両方いて、どちらも酔いが覚めている（葱は封印も見ない）と、
 *   昼の始まりに「冷奴が完成しました」の演出が出る（dayAnnounce order 111 = 麻婆豆腐(110)の直後・パン屋(120)の前。
 *   完成は1試合1回 = game.hiyayakkoAnnounced）。作りは麻婆の人狼（mapo_wolf.js）と対:
 *     - ハッキングされた人の目線では、自分を葱・豆腐として数えない（realFor）。思い込んでいる人には
 *       偽の完成が本人にだけ1回出る（silver_wolf.js の fakeBanner kind "hiyayakko"）。
 *     - 昼のうちに酔いが覚めて完成条件がそろえば、その瞬間にも出す（dayNews。タイマーは止めない）。
 *     - 再入室では演出は出さず、情報確認にだけ反映する（resyncDay）。
 * ・豆腐の人狼の保護: 冷奴（または麻婆豆腐）が完成する組み合わせが生きている間、豆腐の人狼は1票では
 *   メンタル崩壊しない（vote.js の vote.mentalIds が vote.mapoOrNegiOn を見る。マイクラ版 hasMapoOrNegiWolf）。
 *   ただし葱の人狼は豆腐を2票持ちにはしない（2票は麻婆の人狼だけ。マイクラ版 vote.js の weight も麻婆だけ）。
 * ・冷奴のメンタル崩壊（applyMentalCollapse。マイクラ版 applyNegiWolfMentalCollapse）:
 *   冷奴が完成した（hiyayakkoAnnounced）あとに葱の人狼が死亡すると、投票の解決の最後
 *   （騎士・傭兵の護衛と従者・少佐・マティアスの身代わりがすべて決まったあと）に、生存者全員が
 *   メンタル崩壊で死亡する。葱の死に方は問わない（投票で追放 / 昼中に死亡 のどちらでも発動する）。
 *   豆腐の人狼が盤面にいなければ発動しない。崩壊で倒れた人は game.mentalIds に入って結果発表では
 *   「メンタル崩壊」でめくれる。護衛・身代わりは崩壊より先に解決されるので、崩壊は守れない。
 *     - 勝利の扱い: 崩壊で倒れた人は勝利できない（game.negiNoWinIds → vote.js の set / 愉快犯 /
 *       道化の爆弾魔 / 復讐者の noWin に相当。マイクラ版 noVictoryIds）。例外（マイクラ版
 *       protectedFromMentalLoss）: 最終役職が勝ち組・殉職者の人と、反転が奇数回ついている人は
 *       倒れても勝利を失わない（奇数人・偶数人はWeb版未実装なので対象なし）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / NON_MIMICABLE_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   闇の化身 = 入る（人狼系）/ 光の使徒・銀色の影 = 入らない / 模倣 = できる（模倣した人の葱も
 *   完成・崩壊の判定に入る。マイクラ版 roleForMimicEffect どおり）/ コスプレ = 入らない（村人陣営のみ）/
 *   シャッフラー = 山札に入る（マイクラ版の除外に NEGI_WOLF は無い）/ ペルソナ = Web版未実装。
 * ・ハッキング: 対象外には入っていない（マイクラ版の除外はヴァニティ・ホタルのみ）。
 *   葱の人狼と思い込んだ人には、銀狼の共通仕組みで人狼系の偽の夜情報（仲間の人狼）が出る
 *   （silver_wolf.js の WOLFVIEW に追加）。思い込みでは完成・崩壊は発動しない（実効役職で判定）。
 * ・乞食: 本物の人狼系は構造的に取れない（beggar.js が WOLF_KIND を除外）ので変更なし。
 *   逆に、崩壊で倒れた人はメンタル崩壊の死（死因 "mental"）として、豆腐のメンタル崩壊で
 *   倒れた人と同じく乞食の候補グループに入る（beggar.js の deathReason が mentalIds を見る）。
 * ・シナジー: 闇鍋では葱の人狼が出たら豆腐の人狼も必ず出す（js/roles.js の SYNERGY_RULES。
 *   マイクラ版 YAMINABE_TRANSFORM_SYNERGY_RULES どおり）。封印シナジーの対象には sealTarget で自動で入る。
 * ・封印: 完成の条件として「封印されている葱は数えない」（マイクラ版 isActiveForDayNotice）。
 *   封印の対象役職（info.sealTarget）にもマイクラ版 YAMINABE_SEAL_TARGET_ROLES どおり入る。
 * ・CPU: 夜の学習は人狼系共通（相方を知る）。専用の夜行動・投票スコア・結果開示文は無い（通常の人狼と同じ）。
 * ・実績（Wiki / マイクラ版 stats.js。Web版には保存が無いので判定関数だけ）:
 *   first_negi_wolf「薬味の相棒」/ win_negi_wolf「葱は添えるだけ」（敗北の実績は無い）。
 */
(function (ONW) {
  const ID = "negi_wolf";
  const K = ONW.wolfKit;
  const eff = (g, id) => (ONW.mimic ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);

  /** 葱の人狼と豆腐の人狼が、どちらも最終盤面で酔いが覚めている人としているか（麻婆の人狼の hasMapo / hasTofu と同じ作り。葱は封印も見ない = マイクラ版 isActiveForDayNotice）。1試合1回だけ完成する */
  const hasNegi = (g) => g.players.some((p) => eff(g, p.id) === ONW.ROLE.NEGI_WOLF && !ONW.hiddenDrunk(g, p.id) && !ONW.seal.is(g, p.id));
  const hasTofu = (g) => g.players.some((p) => eff(g, p.id) === ONW.ROLE.TOFU_WOLF && !ONW.hiddenDrunk(g, p.id));   // 豆腐の人狼も、酔いが覚めてから数える（酔い覚めの瞬間に完成の演出が出る）
  function announce(c) {
    const g = c.g;
    if (g.hiyayakkoAnnounced || !hasNegi(g) || !hasTofu(g)) return false;
    g.hiyayakkoAnnounced = true;
    return true;
  }
  /** viewer の目線で、本物の冷奴の完成が見えるか: 銀狼にハッキングされた人は、自分を葱・豆腐として数えない（本当は葱の人狼でも、思い込んでいる別の役職の目線ではなかったことになる） */
  const realFor = (g, vid) => {
    if (!ONW.hack || !ONW.hack.isFakeUi(g, vid)) return true;
    const has = (role, sealOk) => g.players.some((p) => p.id !== vid && eff(g, p.id) === role && !ONW.hiddenDrunk(g, p.id) && (sealOk || !ONW.seal.is(g, p.id)));
    return has(ONW.ROLE.NEGI_WOLF, false) && has(ONW.ROLE.TOFU_WOLF, true);
  };
  /** 完成の演出を全員へ。ハッキングされた人は、その人の目線（葱の人狼と思い込んでいて偽の仲間が見えていれば、偽の完成が本人にだけ1回出る）。docs/silver-wolf.md */
  function sendHiyayakko(c, real, late) {
    const g = c.g;
    if (!real && !(ONW.hack && g.players.some((q) => ONW.hack.isFakeUi(g, q.id)))) return;   // 本物もなく、ハッキングされた人もいなければ何も送らない
    const m = late ? { t: "hiyayakko", late: true } : { t: "hiyayakko" };
    c.sendAll((p) => {
      if (!ONW.hack || !ONW.hack.isFakeUi(g, p.id)) return real ? m : { t: "noop" };
      if (real && realFor(g, p.id)) return m;
      return ONW.hack.fakeBanner(g, p.id, "hiyayakko", false) ? { t: "noop" } : ONW.hack.fakeBanner(g, p.id, "hiyayakko", true) ? m : { t: "noop" };
    });
    if (real) c.sendSpec({ ...m, quiet: true });
  }

  /** 崩壊で倒れても勝利を失わない人（マイクラ版 applyNegiWolfMentalCollapse の protectedFromMentalLoss） */
  const keepsWin = (g, id) => {
    const r = (g.currentRoles || {})[id];
    if (r === ONW.ROLE.WINNER || r === ONW.ROLE.MARTYR) return true;   // 勝ち組・殉職者（マイクラ版は winnerForced = 勝ち組を持っていることも見る。Web版は最終役職で判定する）
    if (ONW.reverser && ONW.reverser.odd(g, id)) return true;          // 反転が奇数回ついている人
    return false;                                                       // 奇数人・偶数人はWeb版未実装
  };

  /**
   * 冷奴のメンタル崩壊（マイクラ版 applyNegiWolfMentalCollapse）。vote.js の resolveElimination が、
   * 護衛・身代わりまで決まった最後に呼ぶ（得票0で誰も追放されない場合も、昼中に葱が死んでいれば発動する）。
   * 発動すると生存者全員（追放・昼中死亡が決まっている人以外）がメンタル崩壊で死ぬ:
   *   game.eliminated と game.mentalIds に足し、game.negiCollapseIds（崩壊で倒れた人）と
   *   game.negiNoWinIds（勝利を失う人。keepsWin の人は入らない）に記録する。
   * 戻り値: game.negiCollapseIds。resolveElimination のたびに決め直す（呼び出し側で初期化される）。
   */
  function applyMentalCollapse(g) {
    g.negiCollapseIds = []; g.negiNoWinIds = [];
    if (!g || !g.players || !g.hiyayakkoAnnounced) return g.negiCollapseIds;   // 冷奴が完成していなければ発動しない
    const dead = new Set(g.deadIds || []), exec = new Set(g.eliminated || []);
    if (!g.players.some((p) => eff(g, p.id) === ID && (exec.has(p.id) || dead.has(p.id)))) return g.negiCollapseIds;   // 葱の人狼が死んでいない
    if (!g.players.some((p) => eff(g, p.id) === ONW.ROLE.TOFU_WOLF)) return g.negiCollapseIds;                          // 豆腐の人狼が盤面にいない
    g.eliminated = g.eliminated || []; g.mentalIds = g.mentalIds || [];
    g.players.forEach((p) => {
      if (exec.has(p.id) || dead.has(p.id)) return;   // すでに死ぬことが決まっている人は対象外（マイクラ版どおり）
      exec.add(p.id); g.eliminated.push(p.id);
      if (!g.mentalIds.includes(p.id)) g.mentalIds.push(p.id);
      g.negiCollapseIds.push(p.id);
      if (!keepsWin(g, p.id)) g.negiNoWinIds.push(p.id);
    });
    return g.negiCollapseIds;
  }

  /** 実績（Wiki / マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_negi_wolf");
    if (cur === ID && won) out.push("win_negi_wolf");
    return out;
  }

  ONW.negiWolf = { holders, applyMentalCollapse, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 140, name: "葱の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.598,
      desc: "人狼陣営。他の人狼を確認できます。豆腐の人狼と同時にいると冷奴が完成し、豆腐の人狼は1票ではメンタル崩壊せず（最多得票のときだけ追放）、冷奴完成後に葱の人狼が死亡すると、豆腐の人狼が生存者全員のメンタルを崩壊させます。占い・判定・勝利条件は人狼として扱われます。" },
    groups: { wolf: 8.99, "transform:dark_avatar": 9.49 },   // 人狼系（闇の化身の変化先。並びは ROLE_ORDER = wiki の order 90）
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,   // 人狼系共通の夜情報（仲間の人狼）
    /** 昼の始まり(変化公開 → 新聞 → 麻婆豆腐 のあと): 冷奴の完成演出を出す。戻り値: 演出が出終わるまでの待ち時間(ms)。出さないときは 0 */
    dayAnnounce: { order: 111, run(c) {
      const real = announce(c);
      sendHiyayakko(c, real, false);
      return real && ONW.stage && ONW.stage.hiyayakkoMs ? ONW.stage.hiyayakkoMs() : 0;   // 待ち時間は本物の完成のときだけ（偽の完成だけなら、他の人の昼を止めない）
    } },
    /** 昼のうちに、酔いが覚めた葱の人狼がいるのに豆腐の人狼もいて、まだ完成していなければ、その瞬間に完成の演出を出す（昼のタイマーは止めない） */
    dayNews: { order: 111, run(c) {
      if (c.g.phase !== c.PH.ONLINE_DAY) return;
      sendHiyayakko(c, announce(c), true);
    } },
    /** 再入室: 演出は出さず、情報確認にだけ反映 */
    resyncDay: { order: 16, run(c, seat) {
      const g = c.g, ok = g.hiyayakkoAnnounced && (!seat || realFor(g, seat)) || (seat && ONW.hack && ONW.hack.fakeBanner(g, seat, "hiyayakko", false));
      return ok ? [{ t: "hiyayakko", quiet: true }] : [];
    } },
  });
})(window.ONW);
