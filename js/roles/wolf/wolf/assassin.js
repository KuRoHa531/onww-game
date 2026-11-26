/** アサシン: 追放されたら自分以外から1人を選ぶ(選んだ相手がマーリンなら人狼陣営の逆転勝利) */
(function (ONW) {
  const K = ONW.wolfKit;
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
    if (fin === "assassin") {
      const mine = (g.assassinResult || []).filter((a) => a && a.by === id);
      if (mine.some((a) => a.hit)) out.push("assassin_hit_merlin");
      if (mine.some((a) => !a.hit)) out.push("assassin_miss_merlin");
      if (mine.length && !players.some((q) => roleOf(q.id) === "merlin")) out.push("assassin_no_merlin");
    }
    return out;
  }

  ONW.defineRole("assassin", {
    achievements,   // 実績
    // 結果発表の演出(stage.js の startResult / skipResult が引く): 暗殺者のカードが光り、狙われた相手に照準 → 斬撃 → カードが表になってマーリンかどうかが分かる
    // （選ばれた相手は死なない。当たりは赤い閃光で「暗殺」、外れは静かに「無事」）
    stageResult: {
      assassin: { order: 10, run(R) {
        const { res, P, later, setCap, esc, paint, G, up, badge, asn, veil } = R;
        (res.assassin || []).forEach((a) => {
          const head = `<div class="res-cap__t t-wolf">アサシン</div><div>${esc(a.by)} → ${esc(a.target)}</div>`;
          const tk = P(a.targetId), bk = P(a.byId);
          later(() => { setCap(`<div class="res-cap__t t-wolf">アサシン</div><div>${esc(a.by)} が暗殺する相手を選びました…</div>`); asn[bk] = "by"; delete veil[bk]; paint(G()); }, R.t);   // この人の演出が始まったので、「？」で隠していた暗殺者(別のアサシン・賞金稼ぎ視点)のカードも本当の役職で見える
          later(() => { setCap(head); asn[tk] = "aim"; paint(G()); }, R.t + 1300);                    // 照準
          later(() => { asn[tk] = "slash"; paint(G()); }, R.t + 2400);                                // 斬撃
          later(() => {                                                                              // カードが表に → 結果
            up[tk] = a.role; delete veil[tk]; asn[tk] = a.hit ? "hit" : "miss"; delete asn[bk];
            badge[tk] = a.hit ? "暗殺" : "無事";
            setCap(`${head}<div class="${a.hit ? "t-wolf" : "rs-dim"}">${a.hit ? "マーリンでした！ 暗殺成功" : "マーリンではありませんでした（暗殺失敗）"}</div>`);
            paint(G());
          }, R.t + 3200);
          R.t += 5200;
        });
      } },
      skip(R) { (R.res.assassin || []).forEach((x) => { R.badge[`p:${x.targetId}`] = x.hit ? "暗殺" : "無事"; }); },   // アサシンに選ばれた人（死なない）
    },
    cpuPick(k, g, id, cands) {   // CPUの暗殺先: 仲間と分かっている人は避け、あとはランダム
      const i = k.infoOf(g, id);
      const pool = cands.filter((c) => !k.isWolf(i.known[c]));
      return k.pick(pool.length ? pool : cands);
    },
    info: { sealTarget: true, deck: 29, name: "アサシン", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.35,
      desc: "人狼陣営。他の人狼を確認できます。追放されたら、その場で自分以外の全員から1人を選びます。選んだ相手がマーリンなら、人狼陣営の逆転勝利です。" },
    groups: { wolf: 7, "transform:dark_avatar": 7 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
