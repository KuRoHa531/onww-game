/**
 * 妖狐（マイクラ版 FOX を参考）: 第三陣営。
 *   ・占い師・狂った占い師に「占われる」と呪殺される（死亡して、投票権と勝利条件を失う）。
 *   ・呪殺されずに生き残っていれば、村人陣営または人狼陣営の勝利を乗っ取って勝つ。
 *   ・夜の能力はない。
 * 実装の進み具合は _wip/妖狐_依頼文.txt を参照。
 *  1of4: 登録・占われた席の記録・呪殺の対象判定(ONW.fox.curseTargets)・ルールコード ONW38【済】
 *  2of4: 待機時間の呪殺演出(🦊・灰色)・昼中死亡/霊界チャットとの接続・後追い心中・結果発表の順番【済】
 *  3of4: 酔っ払い(酔い覚め→🦊→全体で同時に呪殺→後追い)・昼のうちの役職移動/昼の占い・再入室【済】
 *  4of4: 勝敗(乗っ取り・呪殺で勝利条件を失う)・CPU(占い騙りで妖狐と言う / 妖狐と占われた人に投票しにくい)・COボタン・ガイド・総合テスト【済】
 *
 * 【占われた席の記録】g.foxInspected[席ID] = true
 *   占い師・狂った占い師（seer.js の夜・朝のうち・CPU）が「プレイヤーを占った」ときに ONW.foxInspect(g, 席ID) で記録する。
 *   墓地を占ったときは記録しない。記録は「席」単位（役職のカードではない）。マイクラ版と同じく、
 *   呪殺されるのは「占われた席」の【最終的な役職】が妖狐のとき（占った時点の役職ではない）。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.FOX;
  /** 占われると呪殺される役職か: 妖狐と狐憑き（マイクラ版 game.js の cursedFoxIds は FOX と FOX_MARKED）。
   *  妖狐は呪殺・妖狐投票の追放で勝利条件を失うが、狐憑き（村人陣営）は死んでも勝利条件を失わない（vote.js が勝者から外すのは妖狐・背徳者だけ） */
  const isFoxLike = (g, id) => g.currentRoles[id] === R_() || g.currentRoles[id] === ONW.ROLE.FOX_MARKED;
  /** 占い師・狂った占い師がプレイヤーを占った（墓地は対象外）。何度呼んでも同じ */
  ONW.foxInspect = function (g, id) {
    if (!g || !id || String(id).startsWith("g:")) return;
    (g.foxInspected = g.foxInspected || {})[id] = true;
  };
  /** 最終盤面で妖狐を持っていて、占われている席 [席ID, ...]。
   *  opts.hidden: true なら「酔いが覚めていない席だけ」（酔い覚めで呪殺される予定の席）、省略なら「酔いが覚めている席だけ」。
   *  すでに昼中に死亡している席・すでに呪殺済みの席は含めない（二重に呪殺しない） */
  function curseTargets(g, opts) {
    const o = opts || {}, done = new Set([...(g.foxCursed || []), ...(g.deadIds || [])]);
    return g.players.map((p) => p.id).filter((id) =>
      isFoxLike(g, id) && (g.foxInspected || {})[id] && !done.has(id) && (o.hidden ? ONW.hiddenDrunk(g, id) : !ONW.hiddenDrunk(g, id)));
  }
  /** 妖狐の乗っ取り勝利（マイクラ版 applyFoxOverride）: 最終盤面の妖狐が全員、死んでいない（呪殺・追放・道連れ・心中・昼中死亡のどれでもない）ときの妖狐の席。
 *  1人でも死んだ妖狐がいれば（anyFoxLost）乗っ取らず、通常の勝敗のまま。妖狐がいなければ空 */
function takeover(g) {
  const foxes = g.players.map((p) => p.id).filter((id) => g.currentRoles[id] === R_());
  if (!foxes.length) return [];
  const dead = ONW.vote.deadSet(g);
  return foxes.some((id) => dead.has(id) || (g.foxCursed || []).includes(id)) ? [] : foxes;
}
function takeoverText(g, ids) {
  const fan = (g.foxTake && g.foxTake.fanatics) || [];   // いっしょに勝つ背徳者（5of5）
  return `妖狐 ${ids.map((id) => ONW.fox.nm(g, id)).join("、")} が生き残っていたため、${(g.foxTake && g.foxTake.from) || "村人陣営または人狼陣営"}の勝利を乗っ取りました。` + (fan.length ? `背徳者 ${fan.map((id) => ONW.fox.nm(g, id)).join("、")} もいっしょに勝利しました。` : "");
}
ONW.fox = { isFoxLike, curseTargets, curseNow, lateCurse, takeover, takeoverText, nm: (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?" };

  /** 呪殺で連鎖して死ぬ人（恋人の心中・キューピッドと背徳者の後追い）の演出用リスト [{ id, label: "心中"|"後追い", depth }]（killPlayer の連鎖と同じ ONW.deathPlan から） */
  function chainView(g, seeds, seedKind) {
    const plan = ONW.deathPlan(g, seeds || [], seedKind);
    if (!plan.length) return [];
    // めくれる段: 妖狐からの最短の段数。恋人の心中・背徳者の後追いは1段、キューピッドの後追いは2段（心中のあとにめくれる）
    const dist = {}, kindOf = {}; (seeds || []).forEach((id) => { dist[id] = 0; kindOf[id] = seedKind || "fox"; }); plan.forEach((e) => { kindOf[e.id] = e.kind; });
    const nodes = new Set([...(seeds || []), ...plan.map((e) => e.id)]);
    for (let changed = true, n = 0; changed && n < 50; n++) {
      changed = false;
      Object.keys(dist).forEach((u) => ONW.deathFollowers(g, u, kindOf[u]).forEach((f) => {
        if (!nodes.has(f.id)) return;
        const d = dist[u] + (f.kind === "cupid" ? 2 : 1);
        if (dist[f.id] === undefined || d < dist[f.id]) { dist[f.id] = d; changed = true; }
      }));
    }
    return plan.map((e) => ({ id: e.id, label: ONW.deathMarkOf(e.kind, g, e.id), depth: dist[e.id] || e.depth }));
  }
  /** カードを face の面に表にめくる。すでに表になっているカード(❤・💘など、恋人の印で開いたまま)は、表のまま中身だけ切り替えず、
   *  いったん裏返してから(800ms)めくり直す（点滅にしない）。めくれた直後に done を呼ぶ（灰色にする処理など）。
   *  このカードは SK.held に入れる（酔い覚め・昼の公開などの「あとで自動で伏せる」処理が、灰色になる前に勝手に裏返さないように） */
  function flipUp(SK, k, face, done) {
    if (SK.held) SK.held[k] = true;   // (簡易の道具箱でも動くように)
    const go = () => { SK.up[k] = face; SK.glow[k] = true; SK.paint(SK.G()); if (done) done(); };
    if (SK.up[k] && SK.up[k] !== face) { delete SK.up[k]; delete SK.glow[k]; SK.paint(SK.G()); SK.later(go, 800); } else go();
  }
  /** 呪殺のあとで連鎖して死ぬ人のカードが、同じ深さごとに同時に「心中」「後追い」の面にめくれて灰色になる（妖狐のカードが🦊でめくれたあと）。base: 妖狐のカードがめくれ終わる時刻(ms)
   *  すでに表の❤のカードは、いったん裏返してから「心中」「後追い」でめくれる（その分、深さの間隔を少し広げてある） */
  function playChain(chain, base, SK) {
    const depths = [...new Set(chain.map((e) => e.depth))].sort((a, b) => a - b);
    depths.forEach((d, n) => {
      const t = base + n * 2200;
      chain.filter((e) => e.depth === d).forEach((e, i) => {
        const k = `p:${e.id}`;
        SK.later(() => flipUp(SK, k, SK.deadMark(e.label), () => SK.later(() => { SK.curse[k] = e.label; SK.badge[k] = e.label; delete SK.glow[k]; SK.paint(SK.G()); }, 1300)), t + i * 120);
      });
    });
  }
  /** 呪殺の演出: 妖狐のカードが🦊に裏返って光り、1.4秒後に灰色(札「呪殺」)。全員が灰色になった380ms後に、連鎖で死ぬ人(心中・後追い)の演出が始まる。d: 始まるまでの待ち(ms) */
  function playCurse(ids, chain, d, SK) {
    let left = ids.length;
    const next = () => { if (--left <= 0) playChain(chain || [], 380, SK); };
    ids.forEach((id, i) => {
      const k = `p:${id}`;
      SK.later(() => flipUp(SK, k, SK.FOX_MARK, () => SK.later(() => { SK.curse[k] = true; SK.badge[k] = "呪殺"; delete SK.glow[k]; SK.paint(SK.G()); next(); }, 1400)), d + 700 + i * 380);
    });
  }
  ONW.fox.chainView = chainView; ONW.fox.playChain = playChain; ONW.fox.playCurse = playCurse; ONW.fox.flipUp = flipUp;

  /** 昼の開始時に呪殺する(マイクラ版 processFoxAndFanaticAtDayStart と同じタイミング)。
   *  待機時間(settlePre)で決めた席 g.foxPending を、昼中死亡(net.killPlayer)として死なせる。
   *  killPlayer が 霊界チャット・恋人の心中・キューピッドの後追い まで面倒を見る(死因が増えても同じ入口)。
   *  only: 指定した席だけ呪殺する(昼のうちの呪殺 lateCurse 用。ほかの保留は残す) */
  function curseNow(c, only) {
    const g = c.g, all = (g.foxPending || []).slice(), ids = only ? all.filter((id) => only.includes(id)) : all;
    g.foxPending = all.filter((id) => !ids.includes(id));
    ids.forEach((id) => { if (!(g.foxCursed || []).includes(id)) (g.foxCursed = g.foxCursed || []).push(id); });   // 🦊の灰色で見せた席は、全員「呪殺済み」にする
    ids.forEach((id) => {
      if ((g.deadIds || []).includes(id)) { if (!(g.deadKind || {})[id] || ["follow", "lovers", "cupid", "fanatic"].includes(g.deadKind[id])) (g.deadKind = g.deadKind || {})[id] = "fox"; return; }   // 先に妖狐同士の心中などで死んでいても、死因は呪殺
      ONW.net.killPlayer(id, null, "fox");
    });
  }

  /** 昼のうちの呪殺(3of4): 酔いが覚めた妖狐 / 昼に役職が動いて・昼に占われて、新しく「占われた席に妖狐」になった席。
   *  全員の画面で🦊に裏返って灰色になる演出(foxcurse)のあと、昼中死亡(後追い心中つき)にする。何度呼んでも二重にならない(保留 g.foxPending に入れて除く)。
   *  delay: 演出を始めるまでの待ち(ms)。酔い覚めは、本人のカードが「妖狐」とめくれ終わるのを待つ */
  function lateCurse(c, delay) {
    const g = c.g;
    if (g.phase !== ONW.PHASE.ONLINE_DAY) return;
    const pend = new Set(g.foxPending || []), ids = curseTargets(g).filter((id) => !pend.has(id));
    if (!ids.length) return;
    g.foxPending = [...(g.foxPending || []), ...ids];
    const m = { t: "foxcurse", ids: ids.slice(), chain: chainView(g, ids), delay: delay || 0 };
    c.sendAll(m); c.sendSpec(m);
    setTimeout(() => {   // 演出(めくれ → 灰色)が終わってから死亡にする。その間に投票へ進んでいても、結果が出るまでなら呪殺できる
      const cur = ONW.game;
      if (!cur || cur !== g || ![ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE].includes(g.phase)) return;
      curseNow(c, ids);
    }, (delay || 0) + 3200);
  }

  ONW.defineRole("fox", {
    // CPUの発言: 第三陣営の役職は名乗らない（必ず他の村役職を騙る。本当のCOはしない）
    cpuClaim(k, g, p, r, i, c) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; },
    info: { deck: 60, name: "妖狐", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 36.8,
      desc: "第三陣営。夜の能力はありません。占い師・狂った占い師に占われると呪殺され、投票権と勝利条件を失います（妖狐投票で追放されても勝利条件を失います）。呪殺されずに生き残っていれば、村人陣営または人狼陣営の勝利を乗っ取って勝利します。" },
    // ---- 待機時間の演出（朝のあと）: 最終盤面で決まるので、墓荒らし・ドッペル・怪盗など、どの経由でも同じように出る ----
    /** 占われた妖狐の席（酔いが覚めている席だけ）を決める。呪殺は昼になる瞬間(dayCurse)。酔っ払いの妖狐は 3of4（酔い覚め）で扱う */
    settlePre: { order: 18, run(c) { const g = c.g; g.foxPending = curseTargets(g); g.foxSettleIds = g.foxPending.slice(); g.foxChainSettle = chainView(g, g.foxSettleIds); } },
    /** 全員の画面へ: 呪殺される席のカードが🦊に裏返って灰色になる（再入室でも同じものを送る） */
    settleMsg: { order: 28, run(c) { const ids = c.g.foxSettleIds || []; return ids.length ? { fox: ids.slice(), foxChain: (c.g.foxChainSettle || []).slice() } : {}; } },
    // 昼の呪殺演出(foxcurse): 待機時間と同じ見た目(🦊に裏返る → 灰色)。観戦者・ホストの観戦には出さない(昼中死亡の印で同じ見た目になる)
    stageFlash: {
      field: "dayFox", when: "late",
      run(ids, SK) {
        playCurse(ids, SK.G().dayFoxChain || [], SK.G().dayFoxDelay || 0, SK);   // 呪殺された妖狐 → そのあと、連鎖で死ぬ人（心中・後追い）。表の❤のカードはいったん裏返してから
      },
    },
    stageSettle: {
      field: "settleFox", shown: "settleFoxShown",
      run: { order: 38, run(ids, SK) {
        playCurse(ids, SK.G().settleFoxChain || [], 0, SK);   // カードが裏返って🦊 → 灰色に呪殺された見た目へ（昼の議論中も、結果発表までそのまま）→ 連鎖で死ぬ人（心中・後追い）が同じ深さごとに同時にめくれる
      } },
    },
    /** 昼になった瞬間に呪殺（昼中死亡 → 霊界チャット・後追い心中）。net.js の toDay から呼ばれる */
    dayCurse: curseNow,
    // ---- 昼のうち(3of4) ----
    /** 昼に酔いが覚めた妖狐: 本人のカードが妖狐とめくれ終わってから(約4秒後)、全員で同時に呪殺演出 → 死亡 → 後追い心中 */
    daySober(c) { lateCurse(c, 4000); },
    /** 昼に役職が動いた・昼に占った(昼の占い): 占われた席に妖狐が来たら、すぐ呪殺演出 → 死亡 → 後追い心中 */
    dayCheck(c) { lateCurse(c, 300); },
    groups: { "transform:silver_shadow": 20 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
  });
})(window.ONW);
