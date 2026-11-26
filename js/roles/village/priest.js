/**
 * 神官（マイクラ版 PRIEST を参考）: 村人陣営。夜の能力・昼の能力はない。
 *   ・神官が生存していると、神の勝利（神降臨）を無効にする。神の祝福（神が追放された）は無効にしない。
 *   ・神官が死亡している（死因を問わない）と、神が勝利したとき、村人陣営も一緒に勝てる（神降臨 + 村人陣営）。
 *     ただし恋人・(+反転)がついた人・シャッフラーの印がついた人は、この追加勝利を受けられない（マイクラ版 canReceivePriestWin）。
 *   ・判定は「最終盤面」（墓荒らし・怪盗・ドッペルゲンガー・酔っ払いが覚めたあとなど、カードが動いたあと）の神官を数える。神と同じく、封印は見ない。
 *   ・神がいない盤面では何も起きない。模倣の人狼は模倣できない（mimic_wolf.js の NON_MIMICABLE に入っている）。シャッフラーの山札には入らない（BLOCKED）。
 *   ・闇鍋: 神官が出る盤面には、銀色の影から変化した神も出る（マイクラ版 ensureSilverGodForPriest。js/roles.js の SYNERGY_RULES）。
 *
 * 勝敗の判定は js/vote.js（2of4 で実装。分岐 3 の神降臨）。この役職ファイルは info と、勝敗が引く ONW.priest だけ。
 * 詳細は docs/priest.md。
 */
(function (ONW) {
  /** 最終盤面で神官を持っている人（封印・酔いは見ない。神と同じ） */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === ONW.ROLE.PRIEST);
  ONW.priest = { holders };

  function cpuClaim(k, g, p, r, i, c) {   // 神官: 夜の結果はない。本当の神官は神官CO（70%）、残りは村人騙り
    if (Math.random() < 0.7) c.co = "priest";
    else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
  }

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
    if (fin === "priest" && (g.winTeams || []).includes("神") && (g.winTeams || []).includes("村人陣営")) out.push("priest_god_village");
    return out;
  }

  ONW.defineRole("priest", {
    achievements,   // 実績
    // 結果発表の演出(stage.js の startResult が引く)。res.priest は net.js が渡す。
    //   afterRest: 神官が生きていて神が降臨できないとき（block）だけ、全員がめくれたあと（神降臨の位置）に、神官のカードが光り、字幕で見せる
    //   winNote:   死んだ神官のおかげで村人陣営も追加勝利するとき（help）は、勝利の貼り重ね（人狼陣営勝利 → 神降臨）と最終結果の字幕のあと、追加勝利の札（村人陣営）が貼られる前に出す
    stageResult: {
      afterRest(R) {
        const { res, later, setCap, esc, paint, G, P } = R, pr = res.priest;
        if (!pr || pr.mode !== "block" || !(pr.ids || []).length) return;
        const nm = esc((pr.names || []).join("、"));
        later(() => {
          pr.ids.forEach((id) => { R.gx[P(id)] = "spark"; });
          setCap(`<div class="res-cap__t t-village">神官</div><div>神官 ${nm} が生きているため、神は降臨できません</div>`);
          paint(G());
        }, R.t);
        later(() => { pr.ids.forEach((id) => { if (R.gx[P(id)] === "spark") delete R.gx[P(id)]; }); paint(G()); }, R.t + 2400);
        R.t += 2600;
      },
      winNote(R) {
        const { res, esc } = R, pr = res.priest;
        if (!pr || pr.mode !== "help" || !(pr.ids || []).length || !(res.extraWin || []).length) return null;
        const nm = esc((pr.names || []).join("、"));
        return { ids: pr.ids, html: `<div class="res-cap__t t-village">神官</div><div>神官${nm}の祈りにより村人陣営も追加勝利しました。</div>` };
      },
    },
    cpuClaim,
    info: { sealTarget: true, deck: 105, name: "神官", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 15.9,
      desc: "村人陣営。夜の能力はありません。生存していると神の勝利（神降臨）を無効にします（神の祝福は無効にしません）。死亡していると、神が勝利したとき村人陣営も一緒に勝てます。" },
    groups: { "transform:light_apostle": 43 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 41）で決まる
  });
})(window.ONW);
