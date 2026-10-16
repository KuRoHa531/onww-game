/**
 * 狂った女王（マイクラ版 MAD_QUEEN を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 * ほぼ「女王」と同じだが、次の2点が違う。
 *   ・王国滅亡は起きない（倒れても、他の村人陣営は巻き込まれない・勝利条件を失わない）。女王の追放では勝敗が動くが、狂った女王の追放は狂人系の追放として通常どおり
 *   ・通知の出し分け: 待機時間に、最終盤面が村人陣営で酔いが覚めている人には「◯◯は女王です。」（本物の女王と同じ文言・同じ演出。女王か狂った女王かは分からない）、
 *     最終盤面が人狼陣営で酔いが覚めている人（本人を含む）には「◯◯は狂った女王です。」（狂った女王のカードが表になる）。第三陣営には何も知らされない
 *
 * 実装の場所:
 *   ・村人陣営への通知: js/roles/village/queen.js（queenHolders / seenOf が狂った女王も数える。文言・演出は女王と同じ）
 *   ・人狼陣営への通知: このファイル（settlePost / settleMsg / dayCheck / daySober / soberExtra と、stageSettle / stageFlash / stageSober の演出）
 *   ・王国滅亡の引き金は vote.js / state.js が currentRoles === QUEEN だけを見ているので、狂った女王は引き金にならない（変更なし）
 *   ・勝敗は狂人系の基本（人狼陣営。人狼判定には数えない）。docs/victory-priority.md に新しい行は要らない
 *   ・模倣の人狼が狂った女王を模倣しているとき（ONW.mimic.eff が狂った女王）も、村人陣営には女王として、人狼陣営には狂った女王として通知される（マイクラ版 roleForMimicEffect と同じ）
 */
(function (ONW) {
  const R_ = () => ONW.ROLE;

  // ---- 役職固有の補助関数 ----
  /** 狂った女王を持っている人のID（最終盤面。酔いが覚めていない人は、覚めた瞬間に公開されるので除く。模倣の人狼が模倣しているときも含む） */
  ONW.madQueenHolders = (g) => (!g || !g.players) ? [] : g.players.filter((q) => ONW.mimic.eff(g, q.id) === R_().MAD_QUEEN && !ONW.hiddenDrunk(g, q.id) && !ONW.seal.is(g, q.id)).map((q) => q.id);
  /** 狂った女王が誰か知らされる人か: 最終盤面の役職が人狼陣営で、酔いが覚めている人（本人も含む。模倣の人狼も人狼陣営） */
  ONW.isMadQueenViewer = (g, id) => !!g && !!g.currentRoles && !ONW.hiddenDrunk(g, id) && !!ONW.ROLE_INFO[g.currentRoles[id]] && ONW.ROLE_INFO[g.currentRoles[id]].team === ONW.TEAM.WOLF;
  /** 狂った女王の通知文（マイクラ版の「狂った女王通知」と同じ文言） */
  ONW.madQueenNoticeText = (name) => `${name} は狂った女王です。`;

  const logs = (g, ids) => ids.map((qid) => ONW.madQueenNoticeText((g.players.find((q) => q.id === qid) || {}).name));
  /** 再入室用: この人にすでに知らせた狂った女王（今も狂った女王のカードを持っている人だけ） */
  const seenOf = (g, id) => ((g.madQueenSeen || {})[id] || []).filter((q) => ONW.mimic.eff(g, q) === R_().MAD_QUEEN);

  /**
   * 人狼陣営への通知（女王の noticeFor と同じ考え方）: 最終盤面が人狼陣営で酔いが覚めている人にだけ、狂った女王が誰か知らされる。
   * 「その人にもう知らせた狂った女王」は g.madQueenSeen[viewerId] に覚える。戻り値: 今回新しく知らせる狂った女王のID（なければ空）。CPUはその場で cpuInfo に覚える
   */
  function noticeFor(g, id) {
    const seen = ((g.madQueenSeen = g.madQueenSeen || {})[id] = g.madQueenSeen[id] || []);
    if (!ONW.isMadQueenViewer(g, id)) return [];
    const fresh = ONW.madQueenHolders(g).filter((q) => !seen.includes(q));
    if (!fresh.length) return [];
    seen.push(...fresh);
    const me = g.players.find((q) => q.id === id);
    if (me && me.isCpu && ONW.cpu.noticeMadQueens) ONW.cpu.noticeMadQueens(g, id, fresh);
    return fresh;
  }

  /** 昼のうちに狂った女王が新しく分かった人狼陣営の人（酔いが覚めた・役職が動いた）へ、狂った女王のカードを表にして知らせる。動いていなければ何もしない */
  function dayCheck(c) {
    const g = c.g;
    if (g.phase !== c.PH.ONLINE_DAY) return;
    g.players.forEach((p) => {
      const fresh = noticeFor(g, p.id);
      if (!fresh.length || p.isCpu) return;
      const lg = logs(g, fresh);
      lg.forEach((t) => c.hold(p.id, t));
      c.send(p.id, { t: "queenup", ids: [], madIds: fresh, logs: lg });
    });
  }

  /** 狂った女王のカードを表にして ♛ の札を付ける（待機時間・昼の公開演出・酔い覚めで共通） */
  const BADGE = "♛狂った女王";

  /**
   * 実績（wiki の「狂った女王」に定義済みの first_mad_queen / mad_queen_no_village_votes / win_mad_queen）。Web版にはまだ実績を保存する仕組みが無いので、
   * 「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ。模倣の人狼・抹消の人狼の achievements と同じ形）。
   * マイクラ版 stats.js と同じ条件: 最終役職が狂った女王で、村人陣営(最終盤面)の誰からも投票されなかった。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], M = R_().MAD_QUEEN, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === M) out.push("first_mad_queen");                              // 初めて狂った女王になる（初回かどうかは保存側が数える）
    if (cur === M) {
      const votes = g.votes || {};
      const gotVillageVote = Object.keys(votes).some((v) => votes[v] === id && ((ONW.ROLE_INFO[(g.currentRoles || {})[v]] || {}).team === ONW.TEAM.VILLAGE));
      if (!gotVillageVote) out.push("mad_queen_no_village_votes");
      if (won) out.push("win_mad_queen");
    }
    return out;
  }
  ONW.madQueen = { achievements };

  ONW.defineRole("mad_queen", {
    // CPU: 人狼陣営のCPUは、狂った女王を知らされたら仲間として投票しない（村人陣営のCPUは「女王」として知るので、queen.js の cpuNotice で避ける）。
    // 狂った女王のCPU本人は、他の人狼系のCPUと同じく村人役を騙る（cpu.js の lieClaim。女王は騙れない役職なので「女王CO」はしない）
    cpuVoteSee(k, g, p, q, i, me, wolfSide) { return wolfSide && i.known[q.id] === "mad_queen" ? -100 : 0; },
    // 朝の待機時間(stage.js が g.settleMadQueens を受け取って呼ぶ): 人狼陣営の画面で、狂った女王のカードが表になる（村人陣営の画面では女王のカード。昼になったら札を外して伏せる = 女王の end が外す）
    stageSettle: {
      field: "settleMadQueens", shown: "settleMadQueenShown",
      run: { order: 21, run(ids, SK) { SK.later(() => { ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.show(k, "mad_queen"); SK.badge[k] = BADGE; SK.queenKeys.push(k); SK.paint(SK.G()); }, i * 380)); }, 500); } },
    },
    // 昼に新しく狂った女王が分かった（酔いが覚めた・役職が動いた）人狼陣営の人: 狂った女王のカードが表になり、しばらくして裏に戻る
    stageFlash: {
      field: "madQueenFlash",
      run(ids, SK) {
        ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = "mad_queen"; SK.badge[k] = BADGE; SK.queenFlashKeys.push(k); SK.paint(SK.G()); }, 200 + i * 380));
        SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; delete SK.up[k]; delete SK.badge[k]; SK.pull(SK.queenFlashKeys, k); }); SK.paint(SK.G()); }, 200 + ids.length * 380 + 3000);
      },
    },
    // 昼に酔いが覚めた人狼陣営: 狂った女王のカードが表になる（♛狂った女王の札つき）。女王のあとに並ぶ
    stageSober: { list: { order: 41, run(sp, list, SK, fx) {
      (sp.madQueens || []).forEach((id) => list.push([`p:${id}`, "mad_queen", true]));
      const qset = new Set((sp.madQueens || []).map((id) => `p:${id}`));
      fx.push({
        up(k, role) { if (qset.has(k) && role === "mad_queen") { SK.badge[k] = BADGE; SK.queenFlashKeys.push(k); } },
        down(k) { if (qset.has(k)) { delete SK.badge[k]; SK.pull(SK.queenFlashKeys, k); } },
      });
    } } },
    // CPUの人狼陣営: 狂った女王を知らされた（人狼陣営どうしとして、投票しない）
    cpuNotice(g, id, queenIds, k) { const i = k.infoOf(g, id); queenIds.forEach((q) => { i.known[q] = "mad_queen"; }); },
    info: { deck: 72, name: "狂った女王", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.65,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。朝のあとの待機時間に、最終盤面で村人陣営になっていて酔いが覚めている人には「女王」と同じ通知が出ます（本物の女王と区別がつきません）。最終盤面で人狼陣営になっていて酔いが覚めている人（本人を含む）には、狂った女王のカードが表になって誰が狂った女王か知らされます。女王と違い、狂った女王が倒れても王国滅亡は起きません。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.7, "transform:dark_avatar": 16 },
    /** 待機時間: CPUの人狼陣営は、ここで狂った女王を知る（人間にはこの下の settleMsg で送る） */
    settlePost: { order: 21, run(c) {
      const g = c.g;
      g.madQueenSeen = {};
      g.players.forEach((q) => { if (q.isCpu) noticeFor(g, q.id); });
    } },
    settleMsg: { order: 41, run(c, p, mode) {
      const g = c.g;
      const qi = mode === "settle" ? (p.isCpu ? [] : noticeFor(g, p.id)) : seenOf(g, p.id);
      return { logs: logs(g, qi), madQueens: qi };
    } },
    dayCheck: dayCheck,     // 昼のうちに役職が動いたとき(net.js の dayCheck)
    daySober: dayCheck,     // 酔いが覚めた直後(net.js の soberUp)
    /** 酔いが覚めた瞬間に、最終役職が人狼陣営の人だけ、狂った女王が誰か分かる */
    soberExtra(c, id) {
      const qf = noticeFor(c.g, id);
      return { lines: logs(c.g, qf), peek: qf.length ? { madQueens: qf } : {} };   // 酔い覚めの瞬間に、狂った女王のカードが表になる
    },
  });
})(window.ONW);
