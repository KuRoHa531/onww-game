/** 処刑人: 試合開始時にターゲットが決まる。ターゲットが追放されたら勝利(勝敗の処理は vote.js の共通処理) */
(function (ONW) {
  // ---- 役職固有の補助関数(もとは state.js にあったもの。中身は変更なし) ----
  /** 処刑人のターゲット(プレイヤーID)。最終盤面でその人が処刑人を持っていて、ターゲットが決まっているときだけ。なければ null（ターゲットは役職の持ち主に記録され、カードについて動く） */
  ONW.execTarget = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.EXECUTIONER && (g.execTargets || {})[id]) || null;
  /** 処刑人を持っている人(持ち主ID)とターゲットの組 [[処刑人の持ち主, ターゲット], ...] */
  ONW.execPairs = (g) => (g.players || []).map((p) => [p.id, ONW.execTarget(g, p.id)]).filter(([, t]) => t);
  ONW.EXEC_CO_TEXT = (name) => `ターゲットは${name}です。`;
  /** 役職が動いたあとの処刑人の整合を取る（fixServants と同じ考え方）。墓地に入った処刑人はターゲットを失い、墓地から引いた/コピーした処刑人には、自分以外からランダムで新しいターゲットが決まる。新しく決まった人のIDの配列を返す */
  ONW.fixExecutioners = (g) => {
    const m = (g.execTargets = g.execTargets || {}), fresh = [], ids = (g.players || []).map((p) => p.id);
    Object.keys(m).forEach((k) => { if (String(k).startsWith("g:")) delete m[k]; });
    ids.forEach((id) => {
      if (g.currentRoles[id] !== ONW.ROLE.EXECUTIONER) { delete m[id]; return; }
      if (m[id] && ids.includes(m[id]) && m[id] !== id) return;
      const c = ids.filter((x) => x !== id);
      if (!c.length) { delete m[id]; return; }
      m[id] = c[Math.floor(Math.random() * c.length)];
      fresh.push(id);
    });
    return fresh;
  };
  // ---- ここまで ----

  const cpuTarget = (g, id, k) => { const tid = ONW.execTarget(g, id); if (tid) k.infoOf(g, id).execTarget = tid; };   // ターゲットを知る（known には入れない）

  // ---- 処刑人: ターゲットが追放されたとき、めくれたカードが揺れ始め → ギロチンの刃が落ちて → カードが真っ二つに割れる(stage.js の結果発表が stageResult 経由で呼ぶ) ----
  const GL_DUR = 3300;   // めくれてから処刑人勝利の字幕まで
  function glHalves(SK, k) {
    const seat = SK.$t().querySelector(`[data-k="${k}"]`), card = seat && seat.querySelector(".tb-card"), front = seat && seat.querySelector(".tb-front");
    if (!card || !front) return null;
    let hs = card.querySelectorAll(".gl-half");
    if (hs.length) return [...hs];
    hs = ["gl-top", "gl-bot"].map((c) => {
      const h = document.createElement("div"); h.className = `gl-half ${c}`;
      const f = front.cloneNode(true); f.classList.add("gl-face"); h.appendChild(f); card.appendChild(h); return h;
    });
    const inner = card.querySelector(".tb-inner"); if (inner) inner.style.display = "none";   // 元のカードは消し(visibility だと .tb-seat.up .tb-front の visible に負けて後ろに残るので display:none)、同じ見た目の2枚(上下)に置き換える
    return hs;
  }
  function glFinal(SK, k) { const hs = glHalves(SK, k); if (hs) hs.forEach((h) => h.classList.add("split")); }   // スキップ時: 最初から割れた状態
  function glClear(SK) {
    const el = SK.$t(); if (!el) return;
    el.querySelectorAll(".gl-half,.gl-blade").forEach((n) => n.remove());
    el.querySelectorAll(".tb-inner").forEach((n) => { n.style.visibility = ""; n.style.display = ""; });
    el.querySelectorAll(".gl-shake").forEach((n) => n.classList.remove("gl-shake"));
  }
  function glSeq(R, x, at) {   // x: res.execs の1件（ターゲットが追放された処刑人）。at: ターゲットのカードがめくれる時刻
    const { later, setCap, esc } = R, k = `p:${x.targetId}`;
    later(() => { const s = R.$t().querySelector(`[data-k="${k}"]`); if (s) s.classList.add("gl-shake"); }, at + 800);   // めくれ終わったら揺れ始める
    later(() => {                                                                                                   // 刃が落ちる
      const card = R.$t().querySelector(`[data-k="${k}"] .tb-card`); if (!card) return;
      const b = document.createElement("div"); b.className = "gl-blade"; card.appendChild(b);
      later(() => b.remove(), 600);
    }, at + 1900);
    later(() => { const s = R.$t().querySelector(`[data-k="${k}"]`); if (s) s.classList.remove("gl-shake"); const hs = glHalves(R, k); if (hs) requestAnimationFrame(() => hs.forEach((h) => h.classList.add("split"))); if (x.late) { R.badge[k] = "処刑"; R.paint(R.G()); } }, at + 2150);   // 刃が通り抜けた瞬間に真っ二つ（賞金稼ぎのターゲットは、ここで「追放」の札が「処刑」に変わる）
    later(() => setCap(`<div class="res-cap__t t-third">処刑人勝利</div><div>${esc(x.exec)} のターゲット ${esc(x.target)} が追放されました</div>`), at + 3000);
  }
  const glWin = (res) => (res.execs || []).filter((x) => x.win && x.execId !== x.targetId);   // ターゲットが追放された処刑人

  ONW.defineRole("executioner", {
    // 結果発表の演出(stage.js の startResult / skipResult が引く)
    //   flipped: 追放・道連れ・心中で死んだターゲットのカードがめくれたあと、ギロチンで割れる(R.noFlip に入れて、猫など他の演出に「重なっている」と伝える) / skip: スキップ時は最初から割れた状態 / clear: スキップ時に演出を止める
    stageResult: {
      flipped: { order: 10, run(R, hs, at) {
        const hit = glWin(R.res).filter((x) => !x.late && hs.some((h) => h.id === x.targetId));   // 賞金稼ぎのターゲット(late)は、めくれた直後ではなく、賞金稼ぎの外れが出たあと(bountyAfter)
        hit.forEach((x) => glSeq(R, x, at));
        hit.forEach((x) => R.noFlip.add(x.targetId));
        return hit.length ? GL_DUR : 0;
      } },
      // 賞金稼ぎがターゲットの処刑人: 賞金稼ぎが追放され、人狼判定を外したあと（バツマークの札が出て一呼吸おいてから）ギロチンが落ちて処刑人勝利。的中なら賞金稼ぎの勝利なので、ここには来ない（net.js の res.execs に入らない）
      bountyAfter: { order: 10, run(R) {
        const late = glWin(R.res).filter((x) => x.late);
        late.forEach((x) => { glSeq(R, x, R.t); R.noFlip.add(x.targetId); });
        if (late.length) R.t += GL_DUR;
      } },
      skip(R) { glWin(R.res).forEach((x) => glFinal(R, `p:${x.targetId}`)); },
      clear(SK) { glClear(SK); },
    },
    // 昼に酔いが覚めた処刑人: ターゲットのカードがめくれる(stage.js の soberPeek の並び: 共有者 → 処刑人 → 従者 → 女王)
    stageSober: { list: { order: 20, run(sp, list, SK) { if (sp.target) list.push([`p:${sp.target}`, SK.TARGET_MARK, true]); } } },
    // 投票: ターゲットを追放させたいので、ターゲットに投票する（ターゲットを知っているときだけ。怪盗で奪った処刑人などは知らない）
    cpuVoteScore: (k, g, p, q, i) => (i.execTarget === q.id ? 15 : 0),   // ターゲットが賞金稼ぎでも狙う（吊られて人狼判定を外せば処刑人の勝利。当てられたら賞金稼ぎの勝ち）
    cpuInit: cpuTarget, cpuLearn: cpuTarget,   // CPU: ターゲットを知る
    info: { deck: 40, name: "処刑人", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 39,
      desc: "第三陣営。試合開始時にランダムなターゲット（他の参加者）が決まり、夜のはじめにターゲットのカードがめくれて🎯の印が出ます。ターゲットが追放されたら、あなたの勝利です（他の陣営の勝敗とは別に、追加で勝利します）。ターゲットは役職のカードについてきて、墓地に入った処刑人はターゲットを失い、墓地から引いた人・コピーした人には新しいターゲットが決まります。ターゲットが賞金稼ぎのときは、賞金稼ぎが追放されて人狼判定を外したときだけ処刑人の勝利になります（当てられたら賞金稼ぎの勝利）。" },
    groups: { "transform:silver_shadow": 12 },
    nightMsg(c, p) {   // 夜のはじめに、ターゲットのカードがめくれて🎯の印が出る（ターゲットはカードについてくる。配布時に決まっている）
      const g = c.g;
      const tid = ONW.execTarget(g, p.id), tp = tid && g.players.find((q) => q.id === tid);
      return {
        text: tp ? `あなたのターゲットは ${tp.name} です。` : "ターゲットが見つかりませんでした。",
        text2: "ターゲットが追放されたら、あなたの勝利です。",
        master: (tp && tid !== p.id) ? { id: tid, mark: "__target" } : null,
      };
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      // 処刑人: 新しい処刑人にはターゲットがランダムで決まっている(ONW.swapGrave / ONW.copyRole → fixExecutioners)。朝に自分のカードが表になり、ターゲットのカードに🎯の印が出る
      const tid = ONW.execTarget(g, p.id);
      c.hold(p.id, tid ? `あなたのターゲットは ${t.nameOf(tid)} です。ターゲットが追放されたら、あなたの勝利です。` : "ターゲットが見つかりませんでした。");
      if (tid) g.nightLogsAll.push(`処刑人 ${p.name} のターゲットは ${t.nameOf(tid)} になりました（${t.o.via || "引いた処刑人"}）。`);
      t.both(t.eff());
      if (tid && tid !== p.id) t.setPeek([{ k: `p:${tid}`, role: "__target" }], 380);
    },
    soberLines(c, id) {
      const g = c.g, nm = (x) => (g.players.find((q) => q.id === x) || {}).name || "?";
      const tid = ONW.execTarget(g, id);
      return [tid ? `あなたのターゲットは ${nm(tid)} です。ターゲットが追放されたら、あなたの勝利です。` : "ターゲットが見つかりませんでした。"];
    },
    soberPeek(c, id) {
      const pk = {}, tid = ONW.execTarget(c.g, id);
      if (tid && tid !== id) pk.target = tid;   // ターゲットのカードが🎯の印でめくれる
      return pk;
    },
  });
})(window.ONW);
