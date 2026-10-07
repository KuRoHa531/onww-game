/** タフガイ: 村人陣営。最多得票でも追放されず、票をはじき返して次点の人にとばっちりさせる(マイクラ版 applyToughGuyAndWolfKingToExecuted と同じ考え方) */
(function (ONW) {
  /** 効果が働いているタフガイか（酔いが覚めていない酔っ払いは、まだタフガイの能力を使えない） */
  const active = (g, id) => g.currentRoles[id] === ONW.ROLE.TOUGH_GUY && !ONW.hiddenDrunk(g, id);

  ONW.defineRole("tough_guy", {
    info: { deck: 47, name: "タフガイ", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.5,
      desc: "村人陣営。夜の能力はありません。最多得票になっても追放されず、カードがめくれて票をはじき返します。はじき返された票は次点の得票者（同数なら全員）にとばっちりとして降りかかり、代わりに追放されます（とばっちりで追放された人は、てるてる・一目惚れしてるてるの勝利条件も、処刑人のターゲットが追放された扱いも満たしません）。猫又・黒猫・ネコカボチャ・わら人形の道連れでは死亡しません（心中・無理心中ははじき返せず、死亡します）。" },
    // CPUの発言: 本家(cpu.js)どおり55%で本当にタフガイCO、残り45%は村人騙り（村人が配役にいないときは、いる村役職の騙り）
    cpuClaim(k, g, p, r, i, c) {
      if (Math.random() < 0.55) c.co = "tough_guy";
      else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    // 人狼陣営CPUの騙り: たまに「タフガイ」を名乗る（最多得票でも吊られない役を騙れば、吊りを避けられるため。結果開示はなし）
    cpuLie: { role: "tough_guy", weight: 4, order: 8, claim: () => ({ co: "tough_guy", result: null }) },   // claim を書かないと、村人が配役にいるとき「村人CO」に置き換わってしまう
    /** 道連れ(kind: tomo)だけを受け付けない役職(vote.js の resolveChain の kill() が見る) */
    chainImmune: true,
    groups: { "transform:light_apostle": 20 },   // 光の使徒の変化先（マイクラ版の TRANSFORM_ROLE_GROUPS でも女王の次に並ぶ）
    /**
     * 追放の決定(vote.js の resolveElimination が、最多得票者を決めた直後に呼ぶ)。
     * ctx = { counts, maxVotes, gone }。ctx.eliminated(配列)をその場で書き換える。
     * 結果: game.toughBounces = [{ id: タフガイ, votes: はじき返した票数, to: [とばっちりを受けた人...] }]
     *   ・タフガイは追放されない(カードはめくれる)
     *   ・とばっちり先: タフガイ以外で、1票以上入っていて、すでに死んでいない人のうち得票が最も多い人(同数なら全員)。誰もいなければ、はじき返すだけ(to = [])
     */
    elimination: { order: 10, run(g, ctx) {
      const tough = ctx.eliminated.filter((id) => active(g, id));
      if (!tough.length) return;
      g.toughBounces = g.toughBounces || [];
      ctx.eliminated = ctx.eliminated.filter((id) => !tough.includes(id));
      const cand = Object.keys(ctx.counts).filter((id) => ctx.counts[id] > 0 && !active(g, id) && !ctx.gone.has(id) && ctx.counts[id] <= ctx.maxVotes);
      const next = cand.reduce((m, id) => Math.max(m, ctx.counts[id]), 0);
      const to = next > 0 ? cand.filter((id) => ctx.counts[id] === next) : [];
      to.forEach((id) => { if (!ctx.eliminated.includes(id)) ctx.eliminated.push(id); });
      tough.forEach((id) => g.toughBounces.push({ id, votes: ctx.counts[id], to: to.slice() }));
    } },

    // 結果発表の演出(stage.js の startResult / skipResult が引く)
    //   intro   : タフガイのカードがめくれる → 「ガキン!」と票をはじき返す → 票が飛んで、とばっちり先のカードに命中(そのあと通常の追放フリップへ)
    //   flipped : とばっちりを受けた人の「追放」を「とばっちり」の表示に差し替える / 道連れ・無理心中を空振りさせたタフガイが「ガキン!」と弾く
    //   skip    : スキップ時の最終形 / clear: 飛んでいる票を片付ける
    stageResult: {
      intro: { order: 5, run(R) {
        const { res, P, later, setCap, esc, paint, G, up, gx, badge } = R;
        (res.toughs || []).forEach((x) => {
          const tk = P(x.id), h = res.history.find((q) => q.id === x.id), role = (h && h.role) || "tough_guy", t0 = R.t;
          const recv = x.to.map((id) => P(id));
          later(() => { setCap(`<div class="res-cap__t t-village">タフガイ</div><div>${esc(x.name)} のカードがめくれる…</div>`); up[tk] = role; paint(G()); }, t0);
          later(() => { setCap(`<div class="res-cap__t t-village">はじき返し!</div><div>${esc(x.name)} がはじき返した</div>`); gx[tk] = "toughclang"; badge[tk] = "はじき返し!"; tgBurst(R, tk, "ガキン!"); paint(G()); }, t0 + 1300);
          const n = Math.min(Math.max(x.votes, 1), 6), flyAt = t0 + 2000;
          later(() => { tgChips(R, tk, recv, n); }, flyAt);
          if (recv.length) {
            later(() => {
              delete gx[tk];
              recv.forEach((k) => { gx[k] = "toughrecv"; badge[k] = "とばっちり!"; tgBurst(R, k, "ドンッ!"); });
              setCap(`<div class="res-cap__t t-wolf">とばっちり</div><div>${x.toNames.map(esc).join("、")} にとばっちりが降りかかる!</div>`);
              paint(G());
            }, flyAt + 900 + (n - 1) * 90);
            later(() => { recv.forEach((k) => { delete gx[k]; }); paint(G()); }, flyAt + 900 + (n - 1) * 90 + 1100);
            R.t = flyAt + 900 + (n - 1) * 90 + 1400;
          } else {
            later(() => { delete gx[tk]; setCap(`<div class="res-cap__t t-village">はじき返し!</div><div>とばっちりを受ける人はいません</div>`); paint(G()); }, flyAt + 1100);
            R.t = flyAt + 2600;
          }
        });
      } },
      flipped: { order: 20, run(R, hs, at, kind) {
        const { res, P, later, setCap, esc, paint, G, up, gx, badge } = R;
        let extra = 0;
        // 1) とばっちりを受けた人の表示を差し替える（通常の追放フリップの直後）
        if (kind === "exec") {
          const sub = hs.filter((h) => (res.toughs || []).some((x) => x.to.includes(h.id)) && !h.mental && !h.shock);
          if (sub.length) {
            later(() => {
              sub.forEach((h) => { badge[P(h.id)] = "とばっちり"; });
              const plain = hs.filter((h) => !sub.includes(h) && !h.mental && !h.shock), mental = hs.filter((h) => h.mental), shock = hs.filter((h) => h.shock);
              const nm = (xs) => xs.map((h) => esc(h.name)).join("、");
              setCap(`<div class="res-cap__t t-wolf">とばっちり</div><div>${nm(sub)}</div>${plain.length ? `<div class="res-cap__t t-wolf">追放</div><div>${nm(plain)}</div>` : ""}${mental.length ? `<div class="res-cap__t t-wolf">メンタル崩壊</div><div>${nm(mental)}</div>` : ""}${shock.length ? `<div class="res-cap__t t-wolf">ショック死</div><div>${nm(shock)}</div>` : ""}`);
              paint(G());
            }, at);
          }
        }
        // 2) 道連れ・無理心中を空振りさせたタフガイ: 能力を使った人がめくれたあとに「ガキン!」と弾く
        (res.toughBlocks || []).filter((b) => hs.some((h) => h.id === b.by)).forEach((b, i) => {
          const tk = P(b.id), hh = res.history.find((q) => q.id === b.id), role = (hh && hh.role) || "tough_guy", t = at + 1500 + i * 2400;
          later(() => { setCap(`<div class="res-cap__t t-village">タフガイ</div><div>${esc(b.name)} は ${esc(b.byName)} の${b.kind === "love" ? "無理心中" : "道連れ"}をはじき返した!</div>`); up[tk] = role; gx[tk] = "toughclang"; badge[tk] = "はじき返し!"; tgBurst(R, tk, "ガキン!"); paint(G()); }, t);
          later(() => { delete gx[tk]; paint(G()); }, t + 1500);
          extra += 2400;
        });
        return extra;
      } },
      skip(R) {
        const res = R.res;
        (res.toughs || []).forEach((x) => {
          R.badge[`p:${x.id}`] = "はじき返し!";
          x.to.forEach((id) => { const h = res.history.find((q) => q.id === id); if (h && h.dead && h.cause !== "chain" && !h.mental && !h.shock) R.badge[`p:${id}`] = "とばっちり"; });
        });
        (res.toughBlocks || []).forEach((b) => { R.badge[`p:${b.id}`] = "はじき返し!"; });
      },
      clear(R) { document.querySelectorAll(".tg-chip, .tg-burst").forEach((e) => e.remove()); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (/^toughclang|^toughrecv/.test(R.gx[k])) delete R.gx[k]; }); },
    },
  });

  /** 席 k のカードの画面上の位置(中心)。なければ null */
  function center(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  /** 衝撃の演出: 席 k のカードの上に、広がる輪と文字(「ガキン!」「ドンッ!」)を出す */
  function tgBurst(R, k, text) {
    const c = center(R, k);
    if (!c) return;
    const el = document.createElement("div");
    el.className = "tg-burst";
    el.style.left = c.x + "px"; el.style.top = c.y + "px";
    el.innerHTML = `<i class="tg-ring"></i><i class="tg-ring tg-ring2"></i>`;   // 効果音の文字(「ガキン!」など)は出さない。text は使わない
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  /** はじき返された票: タフガイのカードから弾けて、とばっちり先のカード(なければ上へ)に飛んでいく */
  function tgChips(R, tk, recv, n) {
    const from = center(R, tk);
    if (!from) return;
    const dests = recv.map((k) => center(R, k)).filter(Boolean);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const el = document.createElement("div");
        el.className = "tg-chip";
        document.body.appendChild(el);
        const to = dests.length ? dests[i % dests.length] : { x: from.x + (i % 2 ? 1 : -1) * (40 + i * 14), y: from.y - 180 };
        const jx = (Math.random() - 0.5) * 24, jy = (Math.random() - 0.5) * 24;
        const mid = { x: (from.x + to.x) / 2 + (Math.random() - 0.5) * 80, y: Math.min(from.y, to.y) - 70 - Math.random() * 40 };
        const f = (p, s, o) => ({ transform: `translate(${p.x - 14}px,${p.y - 14}px) scale(${s}) rotate(${o}deg)` });
        if (!el.animate) { el.remove(); return; }
        const a = el.animate([Object.assign(f(from, 0.6, 0), { opacity: 1 }), Object.assign(f(mid, 1.3, 200), { opacity: 1, offset: 0.45 }), Object.assign(f({ x: to.x + jx, y: to.y + jy }, dests.length ? 0.9 : 0.3, 540), { opacity: dests.length ? 1 : 0 })], { duration: 900, easing: "cubic-bezier(.3,.1,.4,1)", fill: "forwards" });
        a.onfinish = () => el.remove();
      }, i * 90);
    }
  }
})(window.ONW);
