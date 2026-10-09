/**
 * 独裁者（村人陣営・昼能力）: WEB版で最初の「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選んで確定すると、議論を打ち切って（投票はせず）選んだ相手だけを処刑する。
 *   マイクラ版（minecraftver.mcpack の main.js / vote.js）の独裁者に合わせる。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・使えるのは、最終盤面で独裁者を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
 *   ・選べるのは、生きている自分以外の人。
 *   ・使った瞬間に議論・投票は終わり、結果発表へ（妖狐投票もしない）。票は「独裁者 → 対象」の1票だけが入った扱い（マイクラ版の game.votes[独裁者] = 対象）。
 *   ・処刑されるのは対象だけ。タフガイ(はじき返す・次点はいないので誰も死なない)・人狼王(他に人狼判定の人がいればガード)は通常の追放と同じ。従者は身代わりにならない（連鎖の道連れでは従者の身代わりは従来どおり）。
 *   ・処刑後の連鎖（道連れ・恋人の心中・アサシン・賞金稼ぎなど）と勝敗は、通常の追放と同じ。
 *   ・マイクラ版の「反逆の狂人」(独裁を反転させてクーデター)は、WEB版にまだ役職がないので未実装（ONW.dictator.declare に差し込める形にしてある）。
 *
 * 状態: g.dictator = null | { by: 独裁者のID, target: 処刑する人のID }（試合ごとに net.startGame が null に戻す）
 * 呼び出し: net.js の hostDictate(ホスト) → ONW.dictator.canUse / targets / declare。vote.js の resolveElimination は g.dictator を見て従者の身代わりを飛ばす。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** 独裁者の昼能力を使える人か（最終盤面の役職が独裁者・酔いが覚めている・生きている・まだ誰も独裁していない・昼の議論中でタイマーが動いている） */
  function canUse(g, id) {
    if (!g || g.dictator || g.allDeadSkip) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || g.currentRoles[id] !== R().DICTATOR) return false;
    if (ONW.hiddenDrunk(g, id) || isDead(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** 独裁で処刑できる人（生きている自分以外） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => x !== id && !isDead(g, x));
  }
  /**
   * 独裁を宣言する（g.dictator を決め、独裁者→対象の1票を入れる）。通信・画面の処理は net.js 側。
   * 戻り値: 記録した { by, target }
   */
  function declare(g, id, target) {
    g.dictator = { by: id, target };
    g.votes = { [id]: target };   // マイクラ版: game.votes[独裁者] = 対象。ほかの人の票は入らない（議論を打ち切るので投票は行われない）
    return g.dictator;
  }

  ONW.dictator = { canUse, targets, declare };

  ONW.defineRole("dictator", {
    info: { deck: 64, name: "独裁者", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.8,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから独裁を宣言すると、すぐに議論を打ち切り（投票はしません）、選んだ相手だけを処刑します。従者は身代わりになれません。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に独裁者を持っている人が使えます。" },
    groups: { "transform:light_apostle": 25 },   // 光の使徒の変化先（村人系）

    // 結果発表の演出（stage.js の startResult / skipResult が引く）
    //   open : 独裁処刑のときだけ、「投票の結果」の代わりに最初に出る。独裁者のカードがめくれる → 「独裁宣言!」と議論を打ち切る
    //          → 処刑対象のカードに印が付く（そのあと、通常の追放と同じ流れで対象のカードがめくれ、「独裁処刑」と表示される。タフガイ・人狼王のガードもそのまま働く）
    //   skip : スキップ時の最終形（独裁者に「独裁」、はじかれて生き残った対象に「処刑対象」） / clear: 衝撃を片付ける
    stageResult: {
      open: { order: 1, run(R) {
        const d = R.res.dictator;
        if (!d) return false;
        const { P, later, setCap, esc, paint, G, up, gx, badge } = R;
        const k = P(d.byId), tk = P(d.targetId), t0 = R.t;
        const h = R.res.history.find((q) => q.id === d.byId), role = (h && h.role) || d.role || "dictator";
        later(() => { setCap(`<div class="res-cap__t t-village">独裁者</div><div>${esc(d.by)} のカードがめくれる…</div>`); up[k] = role; paint(G()); }, t0);
        later(() => { setCap(`<div class="res-cap__t t-village">独裁宣言!</div><div>${esc(d.by)} が議論を打ち切った</div>`); gx[k] = "dictdecree"; badge[k] = "独裁!"; dcBurst(R, k); paint(G()); }, t0 + 1300);
        later(() => { setCap(`<div class="res-cap__t t-wolf">独裁処刑</div><div>${esc(d.by)} → ${esc(d.target)}</div>`); }, t0 + 2600);
        later(() => { gx[tk] = "dicttarget"; badge[tk] = "処刑対象"; dcBurst(R, tk); paint(G()); }, t0 + 3300);
        later(() => { delete gx[k]; delete gx[tk]; delete badge[tk]; badge[k] = "独裁"; paint(G()); }, t0 + 4500);
        R.t = t0 + 4800;
        return true;
      } },
      skip(R) {
        const d = R.res.dictator;
        if (!d) return;
        R.badge[`p:${d.byId}`] = "独裁";
        const h = R.res.history.find((q) => q.id === d.targetId);
        if (h && !h.dead && !R.badge[`p:${d.targetId}`]) R.badge[`p:${d.targetId}`] = "処刑対象";
      },
      clear(R) { document.querySelectorAll(".dc-burst").forEach((e) => e.remove()); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (/^dictdecree|^dicttarget/.test(R.gx[k])) delete R.gx[k]; }); },
    },
  });

  /** 席 k のカードの画面上の位置(中心)。なければ null */
  function center(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /** 衝撃の輪: 席 k のカードの上に、広がる輪を出す */
  function dcBurst(R, k) {
    const c = center(R, k);
    if (!c) return;
    const el = document.createElement("div");
    el.className = "dc-burst";
    el.style.left = c.x + "px"; el.style.top = c.y + "px";
    el.innerHTML = `<i class="dc-ring"></i><i class="dc-ring dc-ring2"></i>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
})(window.ONW);
