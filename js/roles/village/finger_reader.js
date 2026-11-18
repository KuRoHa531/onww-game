/**
 * 指読み（マイクラ版 FINGER_READER を参考）: 村人陣営。
 *   ・夜に、自分以外のプレイヤー2人を選んで、その2人の「初期役職（配役直後のカード）」を確認する。墓地は見られない。
 *   ・妖狐・狐憑きを確認しても呪殺は起きない（占い師と違って ONW.foxInspect を呼ばない）。
 *   ・「指読みCO」と「指読み結果の開示」は禁止（マーリンと同じ扱い）: COボタンに指読みは出さない・結果開示も持たない。
 *     ただし、占い師などの結果開示で「〇〇は指読みでした」と言うための結果役職の一覧には、指読みが盤面にいれば出る（マイクラ版 availableSeerResultRoles）。
 *   ・他役職COや嘘の結果報告・別役職としての発言は可能（CPUもそうする）。
 *   ・蜃気狼を確認すると、初期役職ではなく「盤面にあり得るランダムな役職」に見える（3of4）。
 *   ・酔っ払い・墓荒らし・ドッペルゲンガー経由でも同じように動く（2of4）。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_指読み_*of4-a.txt、詳細は docs/finger-reader.md）:
 *   1of4: 骨格（このファイル・index.html・ルールコード ONW81・ロビー/ガイド/デバッグの並び・夜の2人選択と結果・CPUの夜・観測シナジー・封印対象）【済】
 *   2of4: 朝のうちの連鎖（墓荒らし・ドッペルで手にした指読み）・酔い覚め（昼の議論中）・確認済みの人の扱い【済】= morning.run（noDayChain なし。昼も使える）
 *   3of4: 蜃気狼（ランダムな役職）・COボタン（指読みCO禁止。結果役職の一覧には出す）【済】= seeRole / co.js の deckList(noCo)
 *   4of4: 通し確認（酔っ払い・墓荒らし・ドッペル・模倣の人狼）・デバッグ・観戦(specInfo.finger)・docs・確認スクリプト【済】
 *
 * 【状態】g.fingerReaderTargets[能力を使った人のID] = 確認した相手のID（配列。マイクラ版 game.fingerReaderTargets）
 *         g.fingerReaderResults[能力を使った人のID] = [{ targetId, role }]（見えた役職。蜃気狼はランダムに引いた役職）
 *   どちらも「人」についている（役職のカードにはついていかない。マイクラ版と同じ）。試合ごとに net.startGame が {} に戻す。
 * 【夜の段階】night.kind "seer"・night.order 11（占い師=10 のあと）。役職変動系ではないので docs/role-process-order.md の「役職変動系以外の役職」。
 *   初期役職を見るだけなので、他の役職の入れ替えの影響を受けない。
 * 【勝敗の優先度】村人陣営のまま（docs/victory-priority.md の行の追加は不要）。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

  /** 文言（夜の結果・情報確認・観戦で完全に一致させるため、ここ1か所だけで作る。マイクラ版 fingerReaderResultLines と同じ文） */
  const lineOf = (name, roleName) => `${name} の初期役職は ${roleName} でした。`;
  /** この人がこれまでに確認した相手のID（重複なし） */
  const seenIds = (g, id) => ((g.fingerReaderTargets || {})[id] || []).filter((x, i, a) => a.indexOf(x) === i);
  /** この人が確認した結果の一覧 [{ targetId, role }] */
  const resultsOf = (g, id) => ((g.fingerReaderResults || {})[id] || []).slice();
  /** 確認する相手が見える役職（1回の確認につき1回だけ呼ぶ）。初期役職（配役直後のカード）をそのまま見せる（蜃気狼だけランダム） */
  function seeRole(g, target) {
    const M = ONW.mirage, ini = (g.initialRoles || {})[target] || R().VILLAGER;
    // 蜃気狼（初期・最終のどちらか。模倣先が蜃気狼の模倣の人狼も。封印されている人は除く。マイクラ版 isMirageWolfTarget）: 初期役職ではなく「盤面にあり得るランダムな役職」に見える（1回の確認につき1回だけ引く）
    const mirage = !!M && !(ONW.seal && ONW.seal.is(g, target)) && (M.isMirageCard(g, (g.initialRoles || {})[target], target) || M.isMirageCard(g, (g.currentRoles || {})[target], target));
    if (mirage) { M.noteInspect(g, target, "finger_reader"); return M.seerRole(g); }   // 実績 mirage_wolf_inspected 用の記録
    return ini;
  }
  /**
   * 確認を記録する（マイクラ版 rememberFingerReaderResult）。ids = 選んだ相手（最大2人）。
   * 戻り値: [{ id, role }]（見えた役職。選んだ順）
   */
  function record(g, actorId, ids) {
    g.fingerReaderTargets = g.fingerReaderTargets || {}; g.fingerReaderResults = g.fingerReaderResults || {};
    const list = (ids || []).filter((x, i, a) => x && a.indexOf(x) === i);
    g.fingerReaderTargets[actorId] = [...new Set([...(g.fingerReaderTargets[actorId] || []), ...list])];
    const items = list.map((t) => ({ id: t, role: seeRole(g, t) }));
    g.fingerReaderResults[actorId] = [...(g.fingerReaderResults[actorId] || []), ...items.map((x) => ({ targetId: x.id, role: x.role }))];
    return items;
  }
  /** 本人への文（1人ぶん）の一覧 */
  const linesOf = (g, items) => items.map((x) => lineOf(nm(g, x.id), ONW.ROLE_INFO[x.role] ? ONW.ROLE_INFO[x.role].name : String(x.role)));
  /** 観戦者の「指読み」欄（specInfo）: 使った順に { by, targets: [{ name, role }] } */
  function specLines(g, nm2) {
    return Object.keys(g.fingerReaderResults || {}).filter((h) => g.players.some((q) => q.id === h)).map((h) => ({ by: nm2(h), targets: resultsOf(g, h).map((x) => ({ name: nm2(x.targetId), role: x.role })) }));
  }
  /** 選べる相手の人数（自分以外）。2人選べるのは3人以上のとき。2人村なら1人で完了（マイクラ版: 2人目の候補がいなければ1人で確認） */
  const need = (g) => Math.min(2, Math.max(1, ((g && g.players) ? g.players.length : ((g && g.others) ? g.others.length + 1 : 3)) - 1));

  ONW.fingerReader = { lineOf, seenIds, resultsOf, seeRole, record, linesOf, specLines, need };

  // ---- CPUの夜の行動 ----
  /**
   * 自分以外の2人を選んで初期役職を確認する（記録は人間の night.resolve と同じ ONW.fingerReader.record）。
   *   ・デバッグの能力先指定(forced.players)があればその人（1人だけならもう1人はランダム）
   *   ・なければ、まだ役職が分かっていない人を優先してランダム
   */
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, i = n.infoOf(p.id), f = n.forced(p);
    const others = g.players.filter((q) => q.id !== p.id);
    if (!others.length) return;
    const want = Math.min(2, others.length);
    let ids = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, want);
    const done = seenIds(g, p.id);
    const fresh = (list) => list.filter((q) => !ids.includes(q.id) && !done.includes(q.id));
    const unknown = ONW.utils.shuffle(fresh(others).filter((q) => i.known[q.id] === undefined));
    const rest = ONW.utils.shuffle(fresh(others).filter((q) => !unknown.includes(q)));
    const doneRest = ONW.utils.shuffle(others.filter((q) => !ids.includes(q.id) && done.includes(q.id)));   // 確認済みしか残っていなければ、確認済みの人から
    [...unknown, ...rest, ...doneRest].forEach((q) => { if (ids.length < want) ids.push(q.id); });
    if (!ids.length) return;
    const items = record(g, p.id, ids);
    i.mode = "finger"; i.pair = ids.slice();
    items.forEach((x) => { i.known[x.id] = x.role; });
    g.nightLogsAll.push(`${label} ${p.name} は ${ids.map((x) => nm(g, x)).join(" と ")} の初期役職を確認しました。`);
    linesOf(g, items).forEach((t) => n.hold(p.id, t));
    n.ob(p.id, ids);
    n.nn(rid);
  }

  // ---- CPUの発言 ----
  /**
   * 指読みのCPU: 指読みCO・指読み結果の開示は禁止なので、本物でも別の村役職を名乗る（マーリンと同じ。マイクラ版 CPU_NO_TRUTH_CO_ROLES）。
   * 占い師を名乗るときは、確認した2人のうち1人を「占った結果」として言う（初期役職を見ているので、本物の占いと同じ結果になる）。
   */
  function fingerLie(k, g, p, i) {
    const { rn, pick, weighted, roleInSetup, roleCoable, bareCo, lieClaim } = k;
    const opts = [["seer", 35], ["villager", 30], ["troublemaker", 10], ["robber", 10], ["mason", 15]].filter(([r]) => roleCoable(g, r));   // 騙りで名乗る役職は公開されている範囲だけ（2026-11-17）
    const co = opts.length ? weighted(opts) : bareCo(g);
    if (co === "seer" && i.pair && i.pair.length) {
      const t = g.players.find((q) => q.id === pick(i.pair));
      const real = t ? i.known[t.id] : null;
      if (t && real) {
        const role = ONW.seerSees ? ONW.seerSees(real) : real;   // 白狼などは占い師には村人と見える
        return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
      }
    }
    return lieClaim(g, p, "finger_reader", co);
  }
  function cpuClaim(k, g, p, r, i, c) {   // 指読み: CO禁止なので、別の村役職の騙りとして振る舞う
    const lie = fingerLie(k, g, p, i);
    c.co = lie.co; c.result = lie.result;
  }

  ONW.defineRole("finger_reader", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、初期役職を確認したい<strong>2人のカード</strong>を押してください。（自分以外・墓地は選べません）<br>妖狐を確認しても呪殺は起きません。<br><span class="t-wolf">指読みCOと指読み結果の開示は禁止です。</span>${later}</p>${nowSel(" と ", 2)}`;
      },
      chainReady: (np) => np >= need(ONW.game),
      chainHow: () => "初期役職を確認したい<strong>2人のカード</strong>を押して（自分以外）",
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人（墓地は選べない）
    stagePick: { players: 2 },
    // 指読みCO・結果開示は禁止: coResult を持たない（COボタンに出さない。3of4）
    cpuClaim,
    cpuNight: { order: 11, stage: "seer", chain: true, run: cpuRun },   // CPUの夜の行動(order が小さいほど先)。占い師(10)のあと。chain: 墓荒らし・ドッペル・酔い覚めで手にしたCPUは朝のうちに使う（2of4）
    info: { observe: "player", sealTarget: true, deck: 103, name: "指読み", team: ONW.TEAM.VILLAGE, wakeOrder: 73, sort: 15.7,
      desc: "村人陣営。夜に墓地以外のプレイヤー2人の初期役職を確認できます。妖狐や狐憑きを確認しても呪殺は発生しません。指読みCOと指読み結果の開示は禁止です。他役職COや嘘の結果報告、別役職としての発言は可能です。" },
    groups: { "transform:light_apostle": 41 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 39）で決まる（番号は所属を表すだけ）
    // 墓荒らし・ドッペルゲンガーで手にしたとき（朝のうち）・酔いが覚めたとき（昼の議論中）の能力（net.js の mchain が呼ぶ）。夜と同じ record を通すので、本人の文・夜ログ・観測・新聞(朝のみ)も同じ。
    //   見えるのは「初期役職」（朝の時点のカードではない）。すでに確認した人は選べない扱い（マイクラ版の seenIds）: 未確認の人が残っていれば、確認済みの人を外す
    morning: {
      run(c) {
        const g = c.g, id = c.id;
        const alive = (x) => x !== id && !(g.deadIds || []).includes(x) && !(g.foxCursed || []).includes(x);
        const done = seenIds(g, id);
        const unseen = g.players.map((q) => q.id).filter((x) => alive(x) && !done.includes(x));
        const want = Math.min(need(g), Math.max(1, unseen.length || g.players.filter((q) => alive(q.id)).length));
        let ids = c.players.filter((x) => alive(x)).slice(0, 2);
        if (unseen.length) ids = ids.filter((x) => !done.includes(x));
        if (ids.length < want) return null;   // 選び直し（足りない間は確定しない）
        const items = record(g, id, ids);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${ids.map((x) => c.nameOf(x)).join(" と ")} の初期役職を確認しました。`);
        return { lines: linesOf(g, items), reveal: { kind: "peek", items: items.map((x) => ({ k: `p:${x.id}`, role: x.role })) }, nextChain: null };
      },
    },
    night: {
      kind: "seer", order: 11,   // 占い師(10)のあと（役職変動系以外の役職。docs/role-process-order.md）
      complete: (np, ng, sel) => np >= need(ONW.game),
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      /** 初期役職を確認する（順序の影響を受けない）。夜ログはマイクラ版 addNightLog と同じ文（結果は書かない） */
      resolve(c, p) {
        const g = c.g, ids = c.selOf(p).players.slice(0, 2).filter((x) => x && x !== p.id);
        if (!ids.length) return;
        const items = record(g, p.id, ids);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${ids.map((x) => c.nameOf(x)).join(" と ")} の初期役職を確認しました。`);
        linesOf(g, items).forEach((t) => c.hold(p.id, t));
        c.rev[p.id] = { kind: "peek", items: items.map((x) => ({ k: `p:${x.id}`, role: x.role })) };
        ONW.observeNote(g, p.id, ids, null, c.eff(p));
        ONW.newsNote(g, c.eff(p));
      },
    },
  });
})(window.ONW);
