/** 神: 全員の役職と墓地の役職を知っている */
(function (ONW) {
  const cpuAll = (g, id, k) => {
    g.players.forEach((q) => { k.infoOf(g, id).known[q.id] = g.initialRoles[q.id]; });
    g.center0.forEach((c, idx) => k.infoOf(g, id).grave.push({ idx, role: c }));
  };

  ONW.defineRole("god", {
    // 結果発表の演出(stage.js の startResult / skipResult が引く): 神降臨(生存している神がめくれると、ファーンと神が降臨) / 神の祝福(追放・道連れで死んだ神がキラキラ → 全員めくれたあと、負けた人が吹き飛ばされ、残りの人が祝福で勝つ)
    stageResult: {
      flipUp(R, h) { const god = R.res.god || {}; if (god.mode === "bless" && (god.ids || []).includes(h.id)) { R.gx[R.P(h.id)] = "spark"; R.gxStars(); } },
      restUp(R, k, hid) {
        const { res, later, setCap, esc, paint, G } = R, god = res.god || {};
        if (god.mode === "descend" && hid && (god.ids || []).includes(hid)) {
          R.gx[k] = "descend"; setCap(`<div class="res-cap__t t-third">神降臨</div><div>${esc((res.history.find((h) => h.id === hid) || {}).name || "")}</div>`);
          later(() => { if (R.gx[k] === "descend") { delete R.gx[k]; paint(G()); } }, 2400);
        }
      },
      afterRest(R) {
        const { res, P, later, setCap, paint, G, gx } = R, god = res.god || {};
        if (god.mode === "descend") R.t += 1800;
        if (god.mode === "bless") {   // 全員のカードがめくれたあと: 死んだオポ・天邪鬼・負け組が吹き飛ばされ、残りの人が祝福で勝つ
          const gods = new Set(god.ids || []), blown = new Set(res.history.filter((h) => !h.win).map((h) => h.id));   // 負けた人（神も含む）のカードが吹き飛ぶ
          later(() => {
            setCap(`<div class="res-cap__t t-third">神の祝福</div><div>神の光が降りそそぎます…</div>`);
            blown.forEach((id) => { gx[P(id)] = "blow"; });
            paint(G());
          }, R.t);
          later(() => {
            res.history.forEach((h) => { if (!blown.has(h.id) && !gods.has(h.id) && h.win) gx[P(h.id)] = "win"; });
            setCap(`<div class="res-cap__t t-third">神の祝福</div><div>${blown.size ? "負けた人のカードは吹き飛ばされ、" : ""}ほかの全員が勝利します</div>`);
            paint(G());
          }, R.t + 1500);
          R.t += 3600;
          R.noBlow = true;   // 神の祝福のときは、結果の字幕のあとにもう一度吹き飛ばさない
        }
      },
      skip(R) {   // 神の祝福: 神はキラキラ・吹き飛ばされた人は消え・勝つ人は金色
        const res = R.res;
        if (res.god && res.god.mode === "bless") {
          const gd = new Set(res.god.ids || []);
          res.history.forEach((h) => { R.gx[`p:${h.id}`] = gd.has(h.id) ? "spark" : h.win ? "win" : undefined; });
        }
      },
    },
    // 昼に酔いが覚めた神: 全員と墓地のカードがめくれる(stage.js の soberPeek の最後に並ぶ)
    stageSober: { listLate: { order: 10, run(sp, list) { if (sp.god) { Object.keys(sp.god.players).forEach((id) => list.push([`p:${id}`, sp.god.players[id], true])); sp.god.graves.forEach((c, i) => list.push([`g:${i}`, c, true])); } } } },
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜の行動がないときの説明文(idle。null なら共通の文言)
    uiNight: {
      idle(X) {
        return `<p class="night-step__hint">あなたに夜の行動はありません。追放されなければ神の勝利です。朝を待ちましょう。</p>`;
      },
    },
    // 夜の演出(stage.js が g.godReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに全員と墓地のカードが順に開き、金色に光る → 夜時間の間ずっと開いたまま(閉じるのは夜時間が終わったとき = stage.js の sync)
    stageNight: {
      order: 20, field: "godReveal",
      run(r, SK) {
        const { later, paint, G } = SK;
        const keys = [...Object.keys(r.players).map((id) => [`p:${id}`, r.players[id]]), ...r.graves.map((c, i) => [`g:${i}`, c])];
        keys.forEach(([k, role], i) => later(() => { if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; SK.up[k] = role; SK.glow[k] = true; if (SK.loveMate && k === `p:${SK.loveMate.id}`) SK.lov[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G()); }, i * 300));
      },
    },
    // CPU: 全員の初期役職と墓地を知る
    cpuInit: cpuAll, cpuLearn: cpuAll,
    info: { deck: 18, name: "神", team: ONW.TEAM.THIRD, wakeOrder: 1, sort: 36,
      desc: "第三陣営。全員の役職と墓地の役職を知っています。追放されなければ神の勝利です。追放された場合は神の祝福が発生し、神以外の全員が勝利します（オポチュニストは追放されていない場合のみ）。" },
    groups: { "transform:silver_shadow": 3 },
    nightMsg(c, p) {
      const g = c.g, rn = c.rn;   // 全員の初期役職（変化後）と墓地の役職を知っている
      const lines = g.players.map((q) => `${q.name}${q.id === p.id ? "（あなた）" : ""} = ${rn(g.initialRoles[q.id])}`);
      const godPeek = { players: Object.fromEntries(g.players.map((q) => [q.id, g.initialRoles[q.id]])), graves: g.center0.slice() };
      return {
        text: "あなたは全員の役職と墓地を知っています。",
        text2: `墓地: ${g.center0.map((cr, i) => `${i + 1}枚目「${rn(cr)}」`).join(" ")}`,
        lines, godPeek,
      };
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g, rn = c.rn, hold = c.hold, r = t.r;
      // 神: 朝に自分の神と（墓荒らしなら墓地の墓荒らしが）同時に表になり、他の人と墓地の初期役職（配役直後）が見える（本家の墓荒らしと同じ情報 + Web版の演出）
      const others = g.players.filter((q) => q.id !== p.id), graves = t.seeGraves(t.i);
      hold(p.id, "あなたは全員の役職と墓地を知っています。");
      others.forEach((q) => hold(p.id, `${q.name} = ${rn(g.initialRoles[q.id])}`));
      hold(p.id, `墓地: ${graves.map(([j, cr]) => `${j + 1}枚目「${rn(cr)}」`).join(" ")}`);
      t.both(t.eff());
      r.peek = t.peekOf([...others.map((q) => ({ k: `p:${q.id}`, role: g.initialRoles[q.id] })), ...graves.map(([j, cr]) => ({ k: `g:${j}`, role: cr }))]);
      r.gap = 300;
    },
    soberLines(c) {
      const g = c.g, rn = c.rn, ini = (q) => g.initialRoles[q.id];
      const graves = () => `墓地: ${g.center0.map((cr, i) => `${i + 1}枚目「${rn(cr)}」`).join(" ")}`;
      return [`全員の役職: ${g.players.map((q) => `${q.name}「${rn(ini(q))}」`).join(" ")}`, graves()];
    },
    soberPeek(c) {
      const g = c.g;
      return { god: { players: Object.fromEntries(g.players.map((q) => [q.id, g.initialRoles[q.id]])), graves: g.center0.slice() } };
    },
  });
})(window.ONW);
