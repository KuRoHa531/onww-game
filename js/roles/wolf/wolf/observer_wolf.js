/**
 * 観測の人狼（マイクラ版 OBSERVER_WOLF を参考）: 人狼陣営の「人狼系」。夜は人狼と同じく仲間の人狼が分かり、占い・判定・勝利条件も人狼と同じ。
 * 夜の能力はなく、朝のあとの待機時間に「昨夜だれが誰（どの墓地）に能力を使っていたか」を知る（使った役職は分からない）。
 *   ・観測結果は「〇〇は△△に能力を使っていました。」の形。同じ内容は1回にまとめ、並びはランダム（js/state.js の ONW.observerLines）
 *   ・夜に能力を使った記録は ONW.observeNote（js/state.js）。各役職の night.resolve / cpuNight と、朝の能力(net.js)から呼ばれる。新聞と同じく、昼に酔いが覚めてからの能力は記録しない
 *   ・観測結果は1人1回だけ（g.observerSeen[ID] = { lines }）。再入室では同じ内容を返す
 *   ・最終盤面で酔いが覚めている観測の人狼にだけ伝わる。酔っ払い中は、酔いが覚めたときに伝わる（soberLines）
 *   ・待機時間のメッセージ(settle)に logs（情報確認に載る文章）と observe（演出用の観測結果）を載せる。演出は stageSettle（カードがめくれて観測結果が飛び出す。js/stage.js の stage.observe）
 */
(function (ONW) {
  const K = ONW.wolfKit;
  /** この人に伝える観測結果（初回に決めて保存。以降は同じものを返す） */
  function deliver(g, id) {
    g.observerSeen = g.observerSeen || {};
    if (!g.observerSeen[id]) g.observerSeen[id] = { lines: ONW.observerLines(g) };
    return g.observerSeen[id].lines;
  }
  /** 情報確認に載せる文章 */
  const textOf = (lines) => ["【観測通知】", ...(lines.length ? lines : ["観測できる夜能力はありませんでした。"])];

  /** CPU の観測の人狼: 観測結果（誰が誰・どの墓地に能力を使ったか）を覚える（人狼側CPUの知識。発言への利用は今後） */
  function cpuLearn(g, id) {
    g.cpuInfo = g.cpuInfo || {};
    const i = ONW.cpu && ONW.cpu.kit && ONW.cpu.kit.infoOf ? ONW.cpu.kit.infoOf(g, id) : null;
    if (!i) return;
    i.observed = (g.observeLog || []).map((e) => ({ from: e.from, players: e.players.slice(), graves: e.graves.slice() }));
    i.observedAt = Date.now();
  }

  ONW.defineRole("observer_wolf", {
    info: { deck: 51, name: "観測の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.55,
      desc: "人狼陣営。他の人狼を確認できます。朝のあとの待機時間に、昨夜だれが誰（どの墓地）に能力を使っていたかが分かります（能力を使った役職は分かりません）。結果は昼の情報確認からいつでも見返せます。酔っ払っているときは、酔いが覚めたときに分かります。占い・判定・勝利条件は常に人狼として扱われます。" },
    groups: { wolf: 8.6, "transform:dark_avatar": 9.1 },
    nightMsg: K.nightMsg, got: K.got,
    /** 酔い覚めの演出: 仲間の人狼の🐺に加えて、観測結果(observe)を渡す。stageSober が自分のカードがめくれたあとに飛び出させる */
    soberPeek(c, id, fin) { return Object.assign({}, K.soberPeek(c, id, fin), { observe: deliver(c.g, id) }); },
    // 酔い覚め(stage.js の soberPeek): 仲間の🐺・墓地がめくれたあと、観測結果が飛び出す
    stageSober: { listLate: { order: 99, run(sp, list, SK) { if (sp.observe) SK.later(() => { if (ONW.stage.observe) ONW.stage.observe(sp.observe); }, 300 + list.length * 380 + 500); } } },
    // 夜の画面: 夜の行動がない観測の人狼向けの説明（仲間の人狼の表示は共通の文言のあとに出る）
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>朝のあとの待機時間に、<strong>昨夜だれが誰に能力を使っていたか</strong>（観測結果）が分かります。結果は昼の「情報確認」からも見返せます。</p>`;
      },
    },
    // 朝の待機時間(stage.js が g.settleObserve を受け取って呼ぶ): 観測の人狼「本人の画面だけ」で、自分のカードがめくれて「観測の人狼」と出たあと、観測結果が飛び出す（昼になったら伏せる）
    stageSettle: {
      field: "settleObserve", shown: "settleObserveShown",
      run: { order: 50, run(lines, SK) {
        const me = `p:${ONW.net.myId()}`;
        SK.later(() => { SK.show(me, "observer_wolf", true); SK.paint(SK.G()); }, 500);
        SK.later(() => { if (ONW.stage.observe) ONW.stage.observe(lines); }, 1500);
      } },
    },
    /** 酔いが覚めた観測の人狼: 仲間の人狼に加えて、観測結果が分かる */
    soberLines(c, id, fin) {
      const g = c.g;
      return [...K.soberLines(c, id, fin), ...textOf(deliver(g, id))];
    },
    /** 昼に役職が動いて観測の人狼になった人: 観測済みフラグを消して、その場で観測結果を伝える(酔いが覚める前の人は、覚めたときに伝わる)。CPUは結果を覚える */
    dayShift(c, before) {
      const g = c.g;
      g.players.forEach((p) => {
        if (before[p.id] === g.currentRoles[p.id] || g.currentRoles[p.id] !== ONW.ROLE.OBSERVER_WOLF) return;
        if (c.isDead(p.id) || ONW.hiddenDrunk(g, p.id)) return;
        if (g.observerSeen) delete g.observerSeen[p.id];
        const lines = deliver(g, p.id);
        if (p.isCpu) { cpuLearn(g, p.id); return; }
        const tx = textOf(lines);
        tx.forEach((t) => c.hold(p.id, t));
        if (g.soberLines && g.soberLines[p.id]) g.soberLines[p.id].push(...tx);
        c.send(p.id, { t: "observeday", lines, role: ONW.shownRole(g.currentRoles[p.id]) });
      });
    },
    /** 昼に酔いが覚めたCPUの観測の人狼も観測結果を覚える */
    soberReveal: { order: 90, run(c, ids) { const g = c.g; ids.forEach((id) => { const p = g.players.find((q) => q.id === id); if (p && p.isCpu && g.currentRoles[id] === ONW.ROLE.OBSERVER_WOLF) { deliver(g, id); cpuLearn(g, id); } }); } },
    /** 待機時間: CPUの観測の人狼も観測結果を覚える */
    settlePost: { order: 25, run(c) { const g = c.g; ONW.observerHolders(g).forEach((p) => { if (p.isCpu) { deliver(g, p.id); cpuLearn(g, p.id); } }); } },
    /** 待機時間: 最終盤面で酔いが覚めている観測の人狼に、観測結果を伝える（再入室では、すでに伝えた分だけ同じ内容を返す） */
    settleMsg: { order: 25, run(c, p, mode) {
      const g = c.g;
      if (p.isCpu || g.currentRoles[p.id] !== ONW.ROLE.OBSERVER_WOLF || ONW.hiddenDrunk(g, p.id)) return {};
      if (mode === "resync" && !(g.observerSeen || {})[p.id]) return {};
      const lines = deliver(g, p.id);
      return { logs: textOf(lines), observe: { lines } };
    } },
  });
})(window.ONW);
