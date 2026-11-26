/**
 * 狂った神官（マイクラ版 MAD_PRIEST を参考）: 人狼陣営の狂人系。夜の能力・昼の能力はない。神官（js/roles/village/priest.js）の人狼陣営版。
 *   ・狂った神官が生存していると、神の勝利（神降臨）を無効にする。神の祝福（神が追放された）は無効にしない。
 *   ・狂った神官が死亡している（死因を問わない）と、神が勝利したとき、人狼陣営も一緒に勝てる（神降臨 + 人狼陣営）。
 *     ただし恋人・(+反転)がついた人・シャッフラーの印がついた人は、この追加勝利を受けられない（マイクラ版 canReceivePriestWin。神官と同じ）。
 *   ・判定は「最終盤面」（墓荒らし・怪盗・ドッペルゲンガー・酔っ払いが覚めたあと、カードが動いたあと）の狂った神官を数える。神と同じく、封印は見ない。
 *   ・神官と一緒に配役に入ったら、片方だけが残る（マイクラ版 buildRolePool / ensurePriestTypesDoNotCoexist。js/roles.js の priestTypesCoexist）。
 *   ・神がいない盤面では何も起きない。模倣の人狼は模倣できない（mimic_wolf.js の NON_MIMICABLE に入っている）。シャッフラーの山札には入らない（BLOCKED）。
 *   ・闇鍋: 狂った神官が出る盤面には、銀色の影から変化した神も出る（マイクラ版 ensureSilverGodForPriest。js/roles.js の SYNERGY_RULES）。
 *   ・闇の化身の変化先（狂人系）。夜の情報は「あなたは狂った神官です。夜行動はありません。」だけ（人狼が誰かも分からない。マイクラ版と同じ）。
 *
 * 勝敗の判定は js/vote.js（2of4。分岐 11 の神降臨）。結果発表の演出はこのファイルの stageResult（3of4。res.madPriest は js/net.js が渡す）。info と、勝敗が引く ONW.madPriest もここ。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に mad_priest はすでに入っている（煙幕の狂人の次）。wiki の order も 107 で一致。末尾追加は不要。
 * 詳細は docs/mad-priest.md（神官は docs/priest.md）。
 */
(function (ONW) {
  /** 最終盤面で狂った神官を持っている人（封印・酔いは見ない。神・神官と同じ） */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === "mad_priest");
  ONW.madPriest = { holders };

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
    const wolfPartners = (pid) => players.filter((q) => q.id !== pid && (teamOfP(q.id) === "wolf" || (g.promotedWolfIds || []).includes(q.id))).map((q) => q.id);
    const voteTeam = () => { const t = (g.votes || {})[id]; return t ? teamOfP(t) : null; };
    const chainTargets = (pid) => Object.keys(g.chainBy || {}).filter((v) => (g.chainBy || {})[v] === pid && (g.chainKind || {})[v] === "tomo");
    if (fin === "mad_priest" && (g.winTeams || []).includes("神") && (g.winTeams || []).includes("人狼陣営")) out.push("mad_priest_god_wolf");
    return out;
  }

  ONW.defineRole("mad_priest", {
    achievements,   // 実績
    // 結果発表の演出(stage.js の startResult が引く)。res.madPriest は net.js が渡す（神官 priest.js の stageResult の人狼陣営版。mode は神官と共通）。
    //   afterRest: 狂った神官が生きていて神が降臨できないとき（block）だけ、全員がめくれたあと（神降臨の位置）に、狂った神官のカードが光り、字幕で見せる
    //   winNote:   死んだ狂った神官のおかげで人狼陣営も追加勝利するとき（help）は、勝利の貼り重ね（人狼陣営勝利 → 神降臨）と最終結果の字幕のあと、追加勝利の札（人狼陣営）が貼られる前に出す
    stageResult: {
      afterRest(R) {
        const { res, later, setCap, esc, paint, G, P } = R, mp = res.madPriest;
        if (!mp || mp.mode !== "block" || !(mp.ids || []).length) return;
        const nm = esc((mp.names || []).join("、"));
        later(() => {
          mp.ids.forEach((id) => { R.gx[P(id)] = "spark"; });
          setCap(`<div class="res-cap__t t-wolf">狂った神官</div><div>狂った神官 ${nm} が生きているため、神は降臨できません</div>`);
          paint(G());
        }, R.t);
        later(() => { mp.ids.forEach((id) => { if (R.gx[P(id)] === "spark") delete R.gx[P(id)]; }); paint(G()); }, R.t + 2400);
        R.t += 2600;
      },
      winNote(R) {
        const { res, esc } = R, mp = res.madPriest;
        if (!mp || mp.mode !== "help" || !(mp.ids || []).length || !(res.extraWin || []).length) return null;
        const nm = esc((mp.names || []).join("、"));
        return { ids: mp.ids, html: `<div class="res-cap__t t-wolf">狂った神官</div><div>狂った神官${nm}の祈りにより人狼陣営も追加勝利しました。</div>` };
      },
    },
    info: { sealTarget: true, deck: 118, name: "狂った神官", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.699,
      desc: "人狼陣営。夜の能力はなく、人狼が誰かも分かりません。生存していると神の勝利（神降臨）を無効にします（神の祝福は無効にしません）。死亡していると、神が勝利したとき人狼陣営も一緒に勝てます。" },
    groups: { mad: 2.995, "transform:dark_avatar": 24 },   // 闇の化身の変化先（狂人系）。並びは ROLE_ORDER（wiki の order 107）で決まる
  });
})(window.ONW);
