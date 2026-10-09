/**
 * 賞金稼ぎ（第三陣営）: 追放されて（めくれて）自分のカードが表になったとき、自分以外の全員から「人狼判定だと思う人」を1人選ぶ。
 *   選んだ相手が最終盤面で人狼判定（本物の人狼系 + 昇格した狂人）なら成功 → 賞金稼ぎの単独勝利。外れたら通常の勝敗に従う（勝てない）。
 *   マイクラ版: vote.js の resolveBountyHunterSelections / isBountyHunterSuccessTarget / 賞金稼ぎ勝利 を Web版の連鎖処理(vote.js resolveChain)に合わせたもの。
 *
 * 【Web版の決まり（依頼文どおり）】
 *   ・選ぶタイミングはアサシンと同じ（追放・道連れでめくれた瞬間。選び終わるまでタイマーは止まる）。選んでいる間、賞金稼ぎの画面には自分以外のめくれたカードは見えない（全員「？」）
 *   ・勝利の優先順位: 賞金稼ぎの勝利 ＞ てるてる坊主・一目惚れしてるてる・アサシンの逆転勝利（vote.js の 1.7）。神の祝福・恋人勝利はこれまでどおりその上
 *   ・心中・無理心中で死亡した場合は能力が発動しない（選ばない・勝てない）。タフガイのとばっちりで追放された場合も、てるてる系と同じく「追放」に数えない
 *   ・賞金稼ぎが処刑人のターゲットのとき: 投票で追放されて人狼判定を外した（失敗）なら、バツマークのあとに処刑人の演出（ギロチン）が入り処刑人の勝利。的中なら賞金稼ぎだけ勝利。追放されなかった・追放以外で死んだ（心中・道連れなど）場合は、処刑人は無効（勝ちも負けもない）。vote.js の execAll / bountyMissHanged、演出は executioner.js の bountyAfter
 *   ・従者は賞金稼ぎのご主人の身代わりにならない（vote.js の applyServantSubstitution）
 * 記録: game.bountyTargets[賞金稼ぎ] = 選んだ相手 / game.bountyList = めくれた順 [{id, target}] / game.bountyResult = [{by, target, hit}]（結果の演出・勝敗用）
 *
 * 進み具合（_wip/賞金稼ぎ_依頼文.txt も参照）: 1of3 = 登録・選択・勝敗【済】/ 2of3 = 結果発表の演出（手配書・狼マーク・バツマーク）【済】/ 3of3 = CPU・ガイド・総合テスト【済】
 */
(function (ONW) {
  /** 賞金稼ぎごとの結果 [{ by, target, hit }]（hit = 選んだ相手が人狼判定）。最終盤面で判定する */
  ONW.bountyResult = (g) => {
    const wolves = ONW.vote.wolfJudgeIds(g);
    return (g.bountyList || []).map((b) => ({ by: b.id, target: b.target, hit: wolves.includes(b.target) }));
  };

  ONW.defineRole("bounty_hunter", {
    // 結果発表の演出(stage.js の startResult / skipResult が引く。アサシンの演出のあと・全員がめくれる前):
    //   賞金稼ぎのカードが金色に脈打つ → 選ばれた相手のカードが手配書に変わる(顔写真の位置は「？」) → 的中なら狼マーク🐺 / 外れならバツマーク❌
    //   昇格した狂人も的中扱い(res.bounty[].hit は最終盤面の人狼判定 = vote.js wolfJudgeIds で出したもの)。手配書はそのあとの全員めくりでも残る
    stageResult: {
      bounty: { order: 20, run(R) {
        const { res, P, later, setCap, esc, paint, G, up, badge, bnt, veil } = R;
        (res.bounty || []).forEach((a) => {
          const head = `<div class="res-cap__t t-third">賞金稼ぎ</div><div>${esc(a.by)} → ${esc(a.target)}</div>`;
          const tk = P(a.targetId), bk = P(a.byId);
          later(() => { setCap(`<div class="res-cap__t t-third">賞金稼ぎ</div><div>${esc(a.by)} が人狼だと思う相手を選びました…</div>`); bnt[bk] = "by"; delete veil[bk]; paint(G()); }, R.t);   // この人の演出が始まったので、「？」で隠していた賞金稼ぎ(別のアサシン・賞金稼ぎ視点)のカードも本当の役職で見える
          later(() => { setCap(head); up[tk] = a.role; delete veil[tk]; bnt[tk] = "pick"; paint(G()); }, R.t + 1300);   // 選ばれたカードが手配書に（顔写真の位置は「？」。恋人❤などの丸いマークはまだ付けない）
          later(() => {                                                                                                      // 判定 → 狼マーク / バツマーク
            bnt[tk] = a.hit ? "hit" : "miss"; delete bnt[bk];
            R.lovOn(a.targetId);   // 恋人❤・🔀・♡・🍺・昇格🐺の丸いマークは、役職名が出るこのタイミングで付く
            badge[tk] = a.hit ? "的中" : "外れ";
            setCap(`${head}<div class="${a.hit ? "t-third" : "rs-dim"}">${a.hit ? "人狼判定でした！ 賞金稼ぎの成功" : "人狼判定ではありませんでした（賞金稼ぎの失敗）"}</div>`);
            paint(G());
          }, R.t + 3000);
          R.t += 5000;
        });
      } },
      skip(R) {   // 演出なしの最終形: 選ばれたカードは手配書のまま（外れ→的中の順に置くので、同じ人を複数の賞金稼ぎが選んでいたら的中が残る）
        [...(R.res.bounty || [])].sort((x, y) => (x.hit ? 1 : 0) - (y.hit ? 1 : 0)).forEach((x) => { const k = `p:${x.targetId}`; R.up[k] = x.role; R.bnt[k] = x.hit ? "hit" : "miss"; R.badge[k] = x.hit ? "的中" : "外れ"; });
      },
    },
    // ---- CPU（3of3）: 賞金稼ぎは「追放されたい役職」。てるてる坊主と同じ扱い（本家の考え方）----
    //   発言: 必ず何かをCO（55%村人騙り・残りの半分は占い騙り）。投票: 評価点に少し足す（追放されたいので）。他のCPUは賞金稼ぎだと分かっている人には投票しない（cpu.js AVOID_RESULT）
    cpuClaim(k, g, p, r, i, c) { const h = ONW.roleHook("tanner", "cpuClaim"); if (h) h(k, g, p, r, i, c); },
    cpuVoteScore: () => 1.0,
    // 選択: ①人狼と分かっている人 ②占い師COの「人狼」報告・人狼系のCOをされている人（得点の高い順）③村人側と分かっている人を除いてランダム
    cpuPick(k, g, id, cands) {
      const i = k.infoOf(g, id), wl = ONW.WOLF_KIND || [];
      const wolves = cands.filter((c) => i.known && i.known[c] && k.isWolf(i.known[c]));
      if (wolves.length) return k.pick(wolves);
      const safe = (c) => { const r = i.known && i.known[c]; return !!r && ONW.roles.getInfo(r) && ONW.roles.getInfo(r).team === "village"; };
      const pool = cands.filter((c) => !safe(c));
      const score = (c) => {
        let n = 0;
        (g.cpuClaims || []).forEach((x) => { if (x.kind === "seer" && x.target === c && x.from !== id && wl.includes(x.role)) n += 3; });
        const co = g.coBoard && g.coBoard[c] && g.coBoard[c].co;
        if (co && (wl.includes(co) || co === "team:wolf")) n += 2.4;
        return n;
      };
      const sc = (pool.length ? pool : cands).map((c) => ({ c, n: score(c) }));
      const top = Math.max(...sc.map((x) => x.n));
      return k.pick(sc.filter((x) => x.n === top).map((x) => x.c));
    },
    info: { deck: 59, name: "賞金稼ぎ", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.5,
      desc: "第三陣営。追放されたとき、自分以外から人狼判定だと思う人を1人選びます。選んだ相手が最終的に人狼判定（人狼系・昇格した狂人）なら単独勝利です。" },
    groups: { "transform:silver_shadow": 19 },
  });
})(window.ONW);
