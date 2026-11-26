/**
 * スティーブ（村人陣営・夜/昼の能力なし）: 昼に死亡したり噛殺・爆殺で死亡した場合に1度だけ、不死のトーテムで復活する。
 *   マイクラ版（minecraftver.mcpack の vote.js reviveStevePlayers / main.js reviveSteveImmediately の「スティーブ」STEVE）に合わせる。
 *   依頼: 「スティーブ復活時にマイクラの不死のトーテムが発動するときみたいな演出を再現 / 酔っ払い・墓荒らし・ドッペル経由でも演出や判定が正常に動作すること」。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・復活できる死因は4つだけ: 保安官の執行（kind "shot" で、死因の文字が「執行」のとき）/ 独裁処刑 / 番犬の噛殺（kind "bite"）/ 道化の爆弾魔の爆殺（kind "bomb"）。
 *     追放（投票）・道連れ・心中・後追い・王国滅亡・誤爆（保安官自身が撃たれた）・身代わり・メンタル崩壊・ショック死・呪殺などでは復活しない（マイクラ版 canSteveReviveFromReason）。
 *   ・復活は1人1回（g.steveUsed[id]）。復活したスティーブは、死亡の記録（投票権・勝利条件の喪失・死因）がすべて消え、生き返った扱いになる。
 *   ・復活しても、死んだ瞬間に起きた連鎖は戻らない（相方の心中・従者の後追いなど。マイクラ版と同じ）。
 *   ・判定は「最終盤面」の役職で行う（酔っ払いは酔いが覚めてから）。封印の対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っていない）。
 *
 * 【どこで復活するか】
 *   ・結果発表（噛殺・爆殺・独裁処刑）: vote.js の resolveChain の最後（連鎖・爆殺・王国滅亡がすべて終わったあと）に ONW.steve.reviveAtChain が呼ばれ、
 *     死亡者の一覧(done)・追放者(eliminated)・連鎖の記録(chainIds/chainBy/chainKind)・噛殺(dogBites)・爆殺(bombs)からスティーブを外す。復活の記録は g.steveResult[id] = 死因。
 *     resolveChain は何度呼び直されても同じ結果になる（復活は「使い切る」状態ではなく、毎回、同じ条件から決め直す）。
 *   ・昼中（保安官の執行）: net.js の hostSheriff が、撃たれたスティーブを死なせた直後に ONW.steve.reviveDay（2of4）。死亡の記録を巻き戻し、g.steveUsed を立てる。通信（本人の霊界解除・チャット・情報確認の知らせ・盤面）は net.js の steveReviveDay が行う。
 *   ・演出（不死のトーテム）: 3of4（昼は全員の画面に、結果発表は stage の演出で）。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（村人陣営の基本勝敗のまま。復活したスティーブは生存者として数える）。重複役職: 特別扱いなし。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に steve はすでに入っている（goranshin の次。wiki の order も 45 で一致）。
 * 実装の進み具合は docs/steve.md を参照（1of4=役職本体・結果発表の復活の判定 / 2of4=昼の復活 / 3of4=不死のトーテムの演出 / 4of4=CPU・実績・経由パターンの通し確認。全工程完了）。
 *
 * 状態: g.steveUsed = { スティーブのID: true }（昼に復活して使い切った人。試合ごとに net.startGame が {} に戻す）
 *       g.steveResult = { スティーブのID: 死因 }（結果発表で復活した人。死因は "bite" / "bomb" / "dictator"）
 *       g.steveLog = [{ id, reason, when }]（復活した順。when は "day" / "result"。3of4 以降の演出・戦績が使う）
 */
(function (ONW) {
  const R = () => ONW.ROLE;

  /** 復活できる死因（マイクラ版 canSteveReviveFromReason）。"shot" は保安官の「執行」だけ（誤爆・身代わりは含まない） */
  const REASONS = ["shot", "dictator", "bite", "bomb"];
  const used = (g, id) => !!(g.steveUsed && g.steveUsed[id]);
  /** 最終盤面のスティーブか（酔いが覚めていない酔っ払いは、まだスティーブではない） */
  const isSteve = (g, id) => !!(g.currentRoles && g.currentRoles[id] === R().STEVE) && !ONW.hiddenDrunk(g, id);
  /** 復活の資格がある人か（最終盤面のスティーブで、昼にまだ復活を使い切っていない） */
  const canRevive = (g, id) => isSteve(g, id) && !used(g, id);

  /**
   * 結果発表で、いまの死に方が復活できる死因か。戻り値: "bite" | "bomb" | "dictator" | null
   *   ・番犬の噛殺・爆殺: 連鎖の記録 chainKind が "bite" / "bomb"（従者の身代わりで死んだ人は除く＝マイクラ版の死因は「身代わり」）
   *   ・独裁処刑: 独裁者が選んだ相手として処刑された（クーデターで独裁者本人が処刑されるときは除く）。ショック死・メンタル崩壊・従者の身代わりが重なるときは除く
   */
  function resultReason(g, id) {
    if (((g.chainSub || {})[id])) return null;
    const k = (g.chainKind || {})[id];
    if ((g.chainIds || []).includes(id) && (k === "bite" || k === "bomb")) return k;
    if (g.dictator && g.dictator.target === id && g.dictator.by !== id && !g.dictator.coup && (g.eliminated || []).includes(id)
      && !(g.chainIds || []).includes(id) && !(g.mentalIds || []).includes(id) && !(g.shockIds || []).includes(id)
      && !(g.servantSubs || []).some((x) => x.servant === id)) return "dictator";
    return null;
  }

  /**
   * vote.resolveChain の最後から呼ばれる（マイクラ版 reviveStevePlayers）: 死亡者 done の中のスティーブのうち、復活できる死因の人を生き返らせる。
   *   ctx = { done: 死亡者の Set（ここから外す）, gone: 昼中に死亡した人の Set }
   *   外すもの: done / game.eliminated / game.chainIds・chainBy・chainKind / game.dogBites（噛まれた人）/ game.bombs[].ids（爆殺された人）。
   *   復活した記録: game.steveResult[id] = 死因、game.steveLog に1件（同じ人は1回だけ）。
   */
  function reviveAtChain(g, ctx) {
    if (!g || !ctx || !ctx.done) return [];
    const revived = [];
    [...ctx.done].forEach((id) => {
      if (!canRevive(g, id)) return;
      const reason = resultReason(g, id);
      if (!reason) return;
      ctx.done.delete(id);
      g.eliminated = (g.eliminated || []).filter((x) => x !== id);
      g.chainIds = (g.chainIds || []).filter((x) => x !== id);
      if (g.chainBy) delete g.chainBy[id];
      if (g.chainKind) delete g.chainKind[id];
      const bitten = (g.dogBites || []).filter((b) => b.target === id && !b.back);   // 噛んだ犬（演出用に steveLog へ残す。dogBites からは外す）
      const bombers = (g.bombs || []).filter((b) => (b.ids || []).includes(id)).map((b) => b.bomber);   // 爆殺した爆弾魔（演出・字幕用）
      g.dogBites = (g.dogBites || []).filter((b) => b.target !== id);
      (g.bombs || []).forEach((b) => { b.ids = (b.ids || []).filter((x) => x !== id); });
      (g.steveResult = g.steveResult || {})[id] = reason;
      g.steveLog = g.steveLog || [];
      if (!g.steveLog.some((e) => e.id === id && e.when === "result")) g.steveLog.push(reason === "bite" && bitten.length ? { id, reason, when: "result", bys: bitten.map((b) => b.by), simul: bitten.some((b) => b.simul) } : reason === "bomb" && bombers.length ? { id, reason, when: "result", bys: bombers } : { id, reason, when: "result" });   // bys = 噛んだ犬たち / 爆殺した爆弾魔（演出・字幕用）
      revived.push(id);
    });
    return revived;
  }

  /**
   * 昼の復活（保安官の執行）: net.js の hostSheriff が、撃たれたスティーブを killPlayer(..., "shot") で死なせた直後に呼ぶ（マイクラ版 reviveSteveImmediately）。
   *   復活できるのは「死因が撃たれた(shot)」かつ ONW.sheriff.labelOf が「執行」のスティーブだけ（誤爆の保安官・身代わりの従者・ネコカボチャの道連れ(tomo)は復活しない）。
   *   やること（ホストの状態だけ。画面・通信は net.js の hostSheriff が行う）:
   *     ・死亡の記録を消す: g.deadIds / g.deadKind / g.deadBy / g.deadStep（→ 投票権・勝利条件の喪失 ONW.sheriff.lostIds も戻る。昼の死亡の「撃たれた」札・銃痕も消える）
   *     ・昼に復活を使い切る: g.steveUsed[id] = true（結果発表の復活 reviveAtChain は、使い切った人を復活させない）
   *     ・復活の記録: g.steveLog に { id, reason: "shot", when: "day" } を1件（同じ人は1回だけ）。g.steveResult は結果発表の復活だけが使う（ここでは触らない）
   *   戻らないもの（マイクラ版と同じ）: 撃たれた瞬間に起きた連鎖（相方の心中・従者の後追い・背徳者の後追い・王国滅亡・姫君の昇格）、撃たれたときに消えた投票。
   *   戻り値: 復活したら true（資格がない・死んでいない・死因が違うときは false で何も変えない）。何度呼んでも2回は復活しない。
   */
  function reviveDay(g, id) {
    if (!g || !id || !canRevive(g, id)) return false;
    if (!(g.deadIds || []).includes(id) || (g.deadKind || {})[id] !== "shot") return false;
    if (!ONW.sheriff || ONW.sheriff.labelOf(g, id) !== "執行") return false;
    g.deadIds = g.deadIds.filter((x) => x !== id);
    if (g.dayDeathIds) g.dayDeathIds = g.dayDeathIds.filter((x) => x !== id);   // 霊媒師: 復活した人は霊媒の対象からも外れる（マイクラ版も preVoteDeadIds から外す）
    if (g.deadKind) delete g.deadKind[id];
    if (g.deadBy) delete g.deadBy[id];
    if (g.deadStep) delete g.deadStep[id];
    (g.steveUsed = g.steveUsed || {})[id] = true;
    g.steveLog = g.steveLog || [];
    if (!g.steveLog.some((e) => e.id === id && e.when === "day")) g.steveLog.push({ id, reason: "shot", when: "day" });
    return true;
  }

  /**
   * 結果発表の「始めの心中」（vote.resolveChain）で、昼に復活したスティーブを、相方の死で殺し直さないか（3of4）。
   *   昼にスティーブが撃たれて死んだとき、恋人の相方は心中で死んでいる（killPlayer の連鎖。戻らない）。スティーブが復活したあと、結果発表の「始めの心中」が
   *   「死んでいる相方の相方」としてスティーブを再び心中で殺すと、復活が無かったことになる。だから、
   *   「スティーブが昼に復活した」かつ「相方 deadId の死因が心中（スティーブの死で起きた）」のときだけ、殺し直さない。相方が別の理由で死んだ（追放・噛殺など）ときは、これまでどおり心中する。
   */
  const keepsAfterMate = (g, steveId, deadId) => !!(g && (g.steveLog || []).some((e) => e.id === steveId && e.when === "day") && (g.deadKind || {})[deadId] === "lovers");

  /**
   * 実績（4of4。マイクラ版 stats.js と同じ条件。wiki の「スティーブ」に定義済みの3つのうち、この試合の結果だけで決まる2つ）:
   *   steve_win「不死のトーテム！！」 = 最終役職がスティーブで勝利 / steve_loss「盾持ってたわ」 = 最終役職がスティーブで敗北（復活したかどうかは問わない）。
   *   first_steve「スティーブ参戦！！」は「いままでにスティーブになった」履歴の判定（マイクラ版は roleHistoryIncludes。保存側）なので、ここでは返さない（御乱心の first_goranshin・A.A. の first_aa と同じ）。
   *   Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（御乱心・妖精さんの achievements と同じ形）。won: その人が勝ったか。
   *   最終役職で判定する（酔っ払い・墓荒らし・怪盗・ドッペル経由でスティーブになった人も対象。酔いが覚めていない酔っ払いは、まだスティーブではないので対象外。模倣の人狼が模倣しているだけでも対象外=マイクラ版と同じ）。
   */
  function achievements(g, id, won) {
    if (!isSteve(g, id)) return [];
    return [won ? "steve_win" : "steve_loss"];
  }

  ONW.steve = { REASONS, used, isSteve, canRevive, resultReason, reviveAtChain, reviveDay, keepsAfterMate, achievements };

  ONW.defineRole("steve", {
    info: { deck: 109, name: "スティーブ", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.6,
      desc: "村人陣営。夜の能力はありません。昼に保安官に執行されたり、番犬の噛殺・道化の爆弾魔の爆殺・独裁処刑で死亡した場合に、1度だけ不死のトーテムで復活します。追放（投票）や道連れ・心中・後追い・王国滅亡・誤爆などそれ以外の死因では復活できません。復活できるのは最終的にスティーブを持っている人で、酔っ払いは酔いが覚めてからです。" },
    // CPU（4of4）: マイクラ版 cpu.js にスティーブ専用の動きは無い（isVillageSide の村人陣営の1つ）。本物のスティーブCPUは必ず「スティーブCO」（結果なし）。
    //   騙りはしない（cpuLie なし。人狼が「スティーブCO」と騙ることもない）。CPUの投票判断（cpuVoteSee）も足さない（能力が無いので、加点・減点の根拠がない）。
    //   復活はCPUでも同じように起きる（昼は net.steveReviveDay / 結果発表は reviveAtChain。CPUは発言も復活のための操作も要らない）
    cpuClaim(k, g, p, r, i, c) { c.co = "steve"; },
    groups: { "transform:light_apostle": 47 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 45）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
