/**
 * 反逆の狂人（マイクラ版 REBEL_MADMAN を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 * 独裁者のクーデター反転が役目:
 *   ・独裁者が独裁を宣言しようとした瞬間、生きている反逆の狂人がいれば、独裁は反転する。選んだ相手ではなく、独裁者本人が処刑される（クーデター）。
 *   ・反逆の狂人が処刑対象に選ばれたときだけは反転しない（そのまま反逆の狂人が処刑される）。
 *   ・反転の判定（ONW.rebel.alive / coupFor）と、独裁者側の処理（js/roles/village/dictator.js の declare）は dictator.js / このファイルのどちらからでも呼べる。
 *   ・反転の演出（独裁者が選んだ相手に決めた瞬間、反逆の狂人のカードがめくれて跳ね返し、独裁者がクーデターで死ぬ）は stageResult の open フック。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（人狼陣営＝狂人系の基本勝敗。人狼判定には数えない）。
 * 重複役職: 特別な扱いなし（抹消の人狼に抹消されたら狂人になる＝既存の MAD_KIND → 狂人の規則どおり）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に rebel_madman はすでに入っている（wiki の order 98）ので、末尾追加は不要。
 * 実装の進み具合は _wip/依頼文_反逆の狂人_*.txt を参照。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /**
   * クーデターを起こせる反逆の狂人のID（最終盤面で反逆の狂人を持っている・昼中に死んでいない・酔いが覚めている）。
   *   ・マイクラ版 rebelAlive: finalRoles が REBEL_MADMAN の人で、封印・勝利条件喪失・昼中の死亡(preVoteDeadIds)でない人。
   *     Web版では「昼中の死亡」= g.deadIds（呪殺・後追い・保安官に撃たれた など）。酔いが覚めていない酔っ払いは、まだ反逆の狂人として働かない（他の常時効果と同じ）。
   *   ・模倣の人狼が反逆の狂人を模倣していても反転しない（マイクラ版は finalRoles のカードそのものを見る。ONW.mimic.eff は使わない）。
   */
  function holders(g) {
    if (!g || !g.currentRoles) return [];
    return (g.players || []).map((p) => p.id).filter((id) => g.currentRoles[id] === R().REBEL_MADMAN && !isDead(g, id) && !ONW.hiddenDrunk(g, id));
  }
  /**
   * 独裁者 by が target を選んだとき、クーデター（独裁の反転）になるか。
   *   戻り値: 反転しないなら null / 反転するなら { ids: クーデターを起こす反逆の狂人たち, forced: 実際に処刑される人（= 独裁者本人） }
   *   ・反逆の狂人が選ばれたとき（最終盤面の役職が反逆の狂人）だけは反転しない（そのまま反逆の狂人が処刑される）
   */
  function coupFor(g, by, target) {
    const ids = holders(g);
    if (!ids.length) return null;
    if (g.currentRoles[target] === R().REBEL_MADMAN) return null;
    return { ids, forced: by };
  }

  /**
   * 実績（wiki の「反逆の狂人」「独裁者」に定義済みの rebel_coup / first_rebel_madman / win_rebel_madman / dictator_couped）。
   * Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（狂った女王の achievements と同じ形）。
   * マイクラ版 stats.js と同じ条件:
   *   rebel_coup      = 最終役職が反逆の狂人で、クーデターが起き、処刑された独裁者(最終役職)がいる
   *   dictator_couped = 最終役職が独裁者で、自分の独裁をクーデターで返された人（独裁者本人）
   *   first_rebel_madman = 初期役職が反逆の狂人 / win_rebel_madman = 最終役職が反逆の狂人で勝利
   * won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], M = R().REBEL_MADMAN, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id], d = g.dictator;
    if (ini === M) out.push("first_rebel_madman");
    if (cur === M) {
      if (d && d.coup && g.currentRoles[d.by] === R().DICTATOR) out.push("rebel_coup");
      if (won) out.push("win_rebel_madman");
    }
    if (d && d.coup && d.by === id && cur === R().DICTATOR) out.push("dictator_couped");
    return out;
  }
  ONW.rebel = { holders, coupFor, achievements };

  ONW.defineRole("rebel_madman", {
    info: { deck: 74, name: "反逆の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.64,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。独裁が発動したとき、生存しているなら選ばれた相手の代わりに独裁者本人を処刑します（クーデター）。ただし、反逆の狂人自身が選ばれたときは反転しません。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.7, "transform:dark_avatar": 16 },   // 狂人系（人狼判定には数えない）・闇の化身の変化先

    // 結果発表の演出（stage.js の startResult / skipResult が引く）: クーデター（3of3）
    //   open : クーデターのときだけ、「投票の結果」の代わりに最初に出る（独裁者の open はクーデターのとき何もしない）。
    //          独裁者のカードがめくれる → 「独裁宣言!」 → 選ばれた人のカードが「めくれそう」になる（途中まで回って揺れる）
    //          → 反逆の狂人のカードがめくれる → 「クーデター発動!」 → 独裁が跳ね返って独裁者に当たる
    //          （そのあと通常の追放と同じ流れで、独裁者のカードに「クーデター」と出て追放される = stage.js の h.coup）
    //   skip : スキップ時の最終形（反逆の狂人に「反逆」の札） / clear: 演出の飾りを片付ける
    stageResult: {
      open: { order: 0, run(R) {
        const d = R.res.dictator;
        if (!d || !d.coup) return false;   // クーデターでなければ、独裁者の役職ファイル(dictator.js)の open に任せる
        const { P, later, setCap, esc, paint, G, up, gx, badge } = R;
        const k = P(d.byId), tk = P(d.chosenId), t0 = R.t;
        const rids = (d.rebelIds || []), rnames = (d.rebels || []).map(esc).join("、");
        const h = R.res.history.find((q) => q.id === d.byId), role = (h && h.role) || d.role || "dictator";
        // 1) 独裁者のカードがめくれる
        later(() => { setCap(`<div class="res-cap__t t-village">独裁者</div><div>${esc(d.by)} のカードがめくれる…</div>`); up[k] = role; paint(G()); }, t0);
        // 2) 独裁宣言!
        later(() => { setCap(`<div class="res-cap__t t-village">独裁宣言!</div><div>${esc(d.by)} が議論を打ち切った</div>`); gx[k] = "dictdecree"; badge[k] = "独裁!"; rbBurst(R, k, "gold"); paint(G()); }, t0 + 1300);
        // 3) 選ばれた人のカードがめくれそうになる（絶対に表にならない。従者の身代わりと同じ「めくれそう」）
        later(() => { setCap(`<div class="res-cap__t t-wolf">独裁処刑</div><div>${esc(d.by)} → ${esc(d.chosen)}</div>`); delete gx[k]; R.alm[tk] = true; paint(G()); }, t0 + 2600);
        // 4) 反逆の狂人のカードがめくれる
        later(() => {
          setCap(`<div class="res-cap__t t-wolf">反逆の狂人</div><div>${rnames} のカードがめくれた…!</div>`);
          rids.forEach((id, i) => later(() => { const rk = P(id); up[rk] = "rebel_madman"; gx[rk] = "rebelflip"; badge[rk] = "反逆!"; rbBurst(R, rk, "red"); paint(G()); }, i * 280));
        }, t0 + 3500);
        // 5) クーデター発動!（選ばれた人のカードは裏のまま元に戻る）
        later(() => {
          delete R.alm[tk];
          setCap(`<div class="res-cap__t t-wolf">クーデター発動!</div><div>独裁は跳ね返された</div>`);
          paint(G());
        }, t0 + 4500);
        // 6) 独裁者に当たる: 独裁者のカードが揺れて「クーデター」
        later(() => {
          setCap(`<div class="res-cap__t t-wolf">クーデター</div><div>${rnames} が独裁を跳ね返し、${esc(d.by)} に当たった</div>`);
          gx[k] = "rebelhit"; badge[k] = "クーデター"; rbBurst(R, k, "red"); paint(G());
        }, t0 + 5200);
        later(() => { delete gx[k]; rids.forEach((id) => { delete gx[P(id)]; }); paint(G()); }, t0 + 6500);
        R.t = t0 + 6800;
        return true;
      } },
      skip(R) {
        const d = R.res.dictator;
        if (!d || !d.coup) return;
        (d.rebelIds || []).forEach((id) => { R.badge[`p:${id}`] = "反逆"; });   // 独裁者本人の「クーデター」は履歴(h.coup)から付く
      },
      clear(R) {
        document.querySelectorAll(".rb-burst").forEach((e) => e.remove());
        if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (/^rebelflip|^rebelhit/.test(R.gx[k])) delete R.gx[k]; });
      },
    },
  });

  /** 席 k のカードの画面上の位置(中心)。なければ null */
  function center(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /** 衝撃の輪: 席 k のカードの上に、広がる輪を出す（tone: "gold" 独裁 / "red" クーデター） */
  function rbBurst(R, k, tone) {
    const c = center(R, k);
    if (!c) return;
    const el = document.createElement("div");
    el.className = `rb-burst rb-${tone}`;
    el.style.left = c.x + "px"; el.style.top = c.y + "px";
    el.innerHTML = `<i class="rb-ring"></i><i class="rb-ring rb-ring2"></i>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
})(window.ONW);
