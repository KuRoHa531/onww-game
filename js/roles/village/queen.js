/**
 * 女王: 村人陣営。夜の能力なし。待機時間に、最終的に村人陣営で酔っていない人にだけ女王のカードが表になる。
 * （王国滅亡の連鎖処理は vote.js の共通処理 / ここは「誰に女王を知らせるか」の通知だけ）
 * 狂った女王(js/roles/wolf/mad/mad_queen.js)も、村人陣営には「女王」としてここで通知される（区別がつかない）。王国滅亡の引き金は本物の女王だけ。
 */
(function (ONW) {
  // ---- 役職固有の補助関数(もとは state.js にあったもの。中身は変更なし) ----
  /** 村人陣営に「女王」として知らされるカードか: 本物の女王と、狂った女王（村人陣営からは区別がつかない。王国滅亡の引き金は本物の女王だけ） */
  ONW.isQueenCard = (r) => r === ONW.ROLE.QUEEN || (!!ONW.ROLE.MAD_QUEEN && r === ONW.ROLE.MAD_QUEEN);
  /** 女王を持っている人のID（最終盤面。酔いが覚めていない人は、覚めた瞬間に公開されるので除く） */
  ONW.queenHolders = (g) => (!g || !g.players) ? [] : g.players.filter((q) => ONW.isQueenCard(ONW.mimic.eff(g, q.id)) && !ONW.hiddenDrunk(g, q.id) && !ONW.seal.is(g, q.id)).map((q) => q.id);   // 模倣の人狼が女王を模倣していても、村人陣営には「女王」として知らされる（王国滅亡の引き金・勝敗は本物の女王のみ。マイクラ版と同じ）
  /** 女王が誰か知らされる人か: 最終盤面の役職が村人陣営で、酔いが覚めている人（恋人でも最終役職が村人陣営なら対象。本人も含む） */
  ONW.isQueenViewer = (g, id) => !!g && !!g.currentRoles && !ONW.hiddenDrunk(g, id) && !!ONW.ROLE_INFO[g.currentRoles[id]] && ONW.ROLE_INFO[g.currentRoles[id]].team === ONW.TEAM.VILLAGE;
  // ---- ここまで ----

  /** 女王の通知文（本家の「女王通知」と同じ文言） */
  ONW.queenNoticeText = (name) => `${name} は女王です。`;

  /** 女王が夜の始まりに知る姫君（初期役職の時点で姫君だった人。共有者の相方と同じ考え方。模倣の人狼は模倣先で見る）。id 自身は除く */
  const princessIds = (g, id) => g.players.filter((q) => q.id !== id && ONW.mimic.actRole(g, q.id, g.initialRoles[q.id]) === ONW.ROLE.PRINCESS).map((q) => q.id);
  const princessText = (g, ids, none) => ids.length ? `姫君: ${ids.map((i) => (g.players.find((q) => q.id === i) || {}).name || "?").join("、")}` : none;
  const cpuPrincess = (g, id, k) => princessIds(g, id).forEach((q) => { k.infoOf(g, id).known[q] = "princess"; });   // CPU: 姫君を知る

  const logs = (g, ids) => ids.map((qid) => ONW.queenNoticeText((g.players.find((q) => q.id === qid) || {}).name));
  /** 再入室用: この人にすでに知らせた女王（今も女王のカードを持っている人だけ） */
  const seenOf = (g, id) => ((g.queenSeen || {})[id] || []).filter((q) => ONW.isQueenCard(ONW.mimic.eff(g, q)));

  /**
   * 女王（本家 announceQueenNotificationsAtDayStart と同じ考え方）: 最終盤面が村人陣営で酔いが覚めている人にだけ、女王が誰か知らされる（人狼陣営・第三陣営には知らされない）。
   * 「その人にもう知らせた女王」は g.queenSeen[viewerId] に覚える。酔いが覚めたとき・昼の能力で役職が動いたときに、まだ知らせていない女王だけを新しく知らせる。
   * 戻り値: 今回新しく知らせる女王のID（なければ空）。CPUはその場で cpuInfo に覚える
   */
  function noticeFor(g, id) {
    const seen = ((g.queenSeen = g.queenSeen || {})[id] = g.queenSeen[id] || []);
    if (!ONW.isQueenViewer(g, id)) return [];
    const fresh = ONW.queenHolders(g).filter((q) => !seen.includes(q));
    if (!fresh.length) return [];
    seen.push(...fresh);
    const me = g.players.find((q) => q.id === id);
    if (me && me.isCpu && ONW.cpu.noticeQueens) ONW.cpu.noticeQueens(g, id, fresh);
    return fresh;
  }

  /** 昼のうちに女王が新しく分かった人（酔いが覚めた・役職が動いた）へ、女王のカードを表にして知らせる。女王が動いていなければ何もしない */
  function dayCheck(c) {
    const g = c.g;
    if (g.phase !== c.PH.ONLINE_DAY) return;
    g.players.forEach((p) => {
      const fresh = noticeFor(g, p.id);
      if (!fresh.length || p.isCpu) return;
      const lg = logs(g, fresh);
      lg.forEach((t) => c.hold(p.id, t));
      c.send(p.id, { t: "queenup", ids: fresh, logs: lg });
    });
  }

  ONW.defineRole("queen", {
    // 結果発表の演出(stage.js の startResult が引く): 王国滅亡 — 女王が追放・道連れで倒れたあと、他の村人陣営のカードが全員同時にめくれる
    stageResult: {
      // 先代女王（姫君が昇格して女王でなくなった席。docs/princess.md）: 昼中に継承済み・待機時間の昇格で墓地にいた女王は、最初から「先代女王」の面でめくれる（res.former の direct / graves）
      intro: { order: 30, run(R) {
        const f = R.res.former || {};
        (f.direct || []).forEach((id) => { R.fqv[R.P(id)] = (f.labels || {})[id] || true; });
        (f.graves || []).forEach((i) => { R.fqv[`g:${i}`] = true; });
      } },
      // 結果発表で倒れて姫君が継承した女王（res.former.two）: 女王の面でめくれたあと、呪われし者・猫のように一度裏へ戻り、もう一度めくれて「先代女王」になる
      flipped: { order: 22, run(R, hs, at) {
        const two = new Set((R.res.former || {}).two || []), cs = hs.filter((h) => h.role === "queen" && two.has(h.id));
        const { later, setCap, esc, paint, G, P } = R, CAP = (n, line) => `<div class="res-cap__t t-village">先代女王</div><div>${esc(n)} ${line}</div>`;
        let extra = 0;
        cs.forEach((h) => {
          const k = P(h.id);
          const lab = ((R.res.former || {}).labels || {})[h.id] || "先代女王";
          if (R.noFlip.has(h.id)) { R.fqv[k] = lab; return; }   // ギロチンなどで割れるカードは裏返さず、最初から先代女王で見せる
          extra = 2300;
          later(() => { setCap(CAP(h.name, "のカードが…")); delete R.up[k]; paint(G()); }, at + 1500);
          later(() => { R.fqv[k] = lab; R.up[k] = "queen"; setCap(CAP(h.name, `は姫君に王位を継ぎ、${lab}になりました`)); paint(G()); }, at + 1500 + 1700);
        });
        return extra;
      } },
      skip(R) { const f = R.res.former || {}; [...(f.direct || []), ...(f.two || [])].forEach((id) => { R.fqv[R.P(id)] = (f.labels || {})[id] || true; }); (f.graves || []).forEach((i) => { R.fqv[`g:${i}`] = true; }); },   // スキップ時は最終形（先代女王の面）
      kingdom: { order: 10, run(R) {
        const { res, P, kingdom, later, setCap, esc, paint, G, dead, shin, badge, up, lovOn } = R;
        if (!kingdom.length) return;
        const qn = ((res.kingdom || {}).queens || []).map(esc).join("、");
        later(() => { setCap(`<div class="res-cap__t t-wolf">王国滅亡</div><div>${qn ? `女王 ${qn} が倒れました…` : "女王が倒れました…"}</div>`); kingdom.forEach((h) => { shin[P(h.id)] = true; dead[P(h.id)] = true; badge[P(h.id)] = "王国滅亡"; }); paint(G()); }, R.t);
        later(() => { kingdom.forEach((h) => { up[P(h.id)] = h.role; lovOn(h.id); }); setCap(`<div class="res-cap__t t-wolf">王国滅亡</div><div>${kingdom.map((h) => esc(h.name)).join("、")}</div>`); paint(G()); }, R.t + 1300);
        R.t += 3400;
      } },
    },
    // 朝の待機時間(stage.js が g.settleQueens を受け取って呼ぶ): 女王を知らされる人（最終盤面が村人陣営で、酔いが覚めている人）の画面で、女王のカードが表になる（人狼陣営・第三陣営の画面では何も起きない。昼になったら札を外して伏せる）
    stageSettle: {
      field: "settleQueens", shown: "settleQueenShown",
      run: { order: 20, run(ids, SK) { SK.later(() => { ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.show(k, "queen"); SK.badge[k] = "♛女王"; SK.queenKeys.push(k); SK.paint(SK.G()); }, i * 380)); }, 500); } },
      end: { order: 10, run(SK) { if (SK.queenKeys.length) { SK.queenKeys.forEach((k) => { delete SK.badge[k]; }); SK.queenKeys.length = 0; SK.paint(SK.G()); } } },
    },
    // 昼に新しく女王が分かった（酔いが覚めた・役職が動いた）村人陣営の人: 女王のカードが表になり、しばらくして裏に戻る
    stageFlash: {
      field: "queenFlash",
      run(ids, SK) {
        ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = "queen"; SK.badge[k] = "♛女王"; SK.queenFlashKeys.push(k); SK.paint(SK.G()); }, 200 + i * 380));
        SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; delete SK.up[k]; delete SK.badge[k]; SK.pull(SK.queenFlashKeys, k); }); SK.paint(SK.G()); }, 200 + ids.length * 380 + 3000);
      },
    },
    // 昼に酔いが覚めた村人陣営: 女王のカードが表になる（♛女王の札つき）。stage.js の soberPeek の並び: 共有者 → 処刑人 → 従者 → 女王
    stageSober: { list: { order: 40, run(sp, list, SK, fx) {
      (sp.princesses || []).forEach((id) => list.push([`p:${id}`, "princess", true]));   // 酔いが覚めた女王: 姫君のカードがめくれる
      (sp.queens || []).forEach((id) => list.push([`p:${id}`, "queen", true]));
      const qset = new Set((sp.queens || []).map((id) => `p:${id}`));
      fx.push({
        up(k, role) { if (qset.has(k) && role === "queen") { SK.badge[k] = "♛女王"; SK.queenFlashKeys.push(k); } },
        down(k) { if (qset.has(k)) { delete SK.badge[k]; SK.pull(SK.queenFlashKeys, k); } },
      });
    } } },
    // CPUの発言: 村人陣営の全員に知られているが、本当のCOはしない（本家 CPU_NO_TRUTH_CO）。村人などを騙る。人狼陣営のときは通常の騙り
    cpuFirst(k, g, p, r) {
      if (k.isWolfSide(r)) return null;
      const out = [], pl = k.plainLie(g, p, "queen"), co = pl.co, result = pl.result;
      if (co) { out.push({ p, text: k.coText(co), co, claim: result ? null : { kind: "villager" }, gap: result ? 1200 : 3500 }); if (result) out.push({ p, text: result.text, short: result.short, result: true, claim: result.claim, gap: 3500 }); }
      return out;
    },
    cpuNotice(g, id, queenIds, k) { const i = k.infoOf(g, id); queenIds.forEach((q) => { i.known[q] = "queen"; }); },   // CPU: 女王を知らされた(村人陣営として、女王には投票しない)
    // 夜の演出(stage.js が g.princessReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに姫君のカードが順に表になる → 夜時間の間ずっと開いたまま（共有者の相方と同じ形）
    stageNight: {
      order: 45, field: "princessReveal",
      run(ids, SK) {
        const { later, paint, G } = SK;
        ids.forEach((id, i) => later(() => { const k = `p:${id}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; SK.up[k] = "princess"; SK.glow[k] = true; if (SK.loveMate && id === SK.loveMate.id) SK.lov[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G()); }, i * 380));
      },
    },
    cpuInit: cpuPrincess, cpuLearn: cpuPrincess,   // CPU: 夜に姫君を知る（女王で始まったとき / 酔い覚め・墓荒らし・ドッペルで女王を手にしたとき）
    nightMsg(c, p) {
      const g = c.g, ids = princessIds(g, p.id);
      return { text: princessText(g, ids, "姫君はいません。"), princessMates: ids.length ? ids : null };   // 夜の始まりに、姫君のカードが表になる（夜が終わるまで出続ける）
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g, ids = princessIds(g, p.id);
      c.hold(p.id, princessText(g, ids, "姫君はいません。"));   // 墓荒らし・ドッペル: 夜の始まりに見えるはずだった姫君が朝に分かる
      t.both(t.eff());
      t.setPeek(ids.map((id) => ({ k: `p:${id}`, role: "princess" })), 380);
    },
    soberLines(c, id) { return [princessText(c.g, princessIds(c.g, id), "姫君はいません。")]; },
    soberPeek(c, id) { const ids = princessIds(c.g, id); return ids.length ? { princesses: ids } : {}; },
    info: { sealTarget: true, deck: 46, name: "女王", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17,
      desc: "村人陣営。夜の能力はありません。朝のあとの待機時間に、最終盤面で村人陣営になっていて酔いが覚めている人にだけ、女王のカードが表になって誰が女王か知らされます（人狼陣営・第三陣営には知らされません。恋人でも最終役職が村人陣営なら知らされます）。女王が追放または道連れで倒れると「王国滅亡」: 他の村人陣営（チキン・恋人になっている人も含む）のカードが一斉にめくれ、勝利条件を失います。女王と人狼判定の者が同時に倒れたときは勝者なし、人狼判定の者が倒れていなければ人狼陣営の勝利です。" },
    groups: { "transform:light_apostle": 19 },
    /** 待機時間: 人間にはこの下の settleMsg で送る。CPUの村人陣営は、ここで女王を知る */
    settlePost: { order: 20, run(c) {
      const g = c.g;
      g.queenSeen = {};
      g.players.forEach((q) => { if (q.isCpu) noticeFor(g, q.id); });   // CPUの村人陣営も、待機時間に女王を知る（人間にはこの下で送る）
    } },
    settleMsg: { order: 40, run(c, p, mode) {
      const g = c.g;
      const qi = mode === "settle" ? (p.isCpu ? [] : noticeFor(g, p.id)) : seenOf(g, p.id);
      return { logs: logs(g, qi), queens: qi };
    } },
    dayCheck: dayCheck,     // 昼のうちに役職が動いたとき(net.js の dayCheck)
    daySober: dayCheck,     // 酔いが覚めた直後(net.js の soberUp)
    /** 酔いが覚めた瞬間に、最終役職が村人陣営（狼夢人を含む。忘却の人狼などの人狼陣営・第三陣営は対象外）の人だけ、女王が誰か分かる */
    soberExtra(c, id) {
      const qf = noticeFor(c.g, id);
      return { lines: logs(c.g, qf), peek: qf.length ? { queens: qf } : {} };   // 女王: 酔い覚めの瞬間に、女王のカードが表になる
    },
  });
})(window.ONW);
