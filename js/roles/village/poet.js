/**
 * 詩人（マイクラ版 POET を参考）: 村人陣営。夜の能力はない。
 *   ・朝のあとの待機時間に、昨夜「どの役職の能力が、誰に使われていたか」がランダムに1件（上限 ONW.POET_LIMIT）分かる（使った人は分からない）。
 *     例:「占い師の能力が 〇〇 に使われていました。」。対象を選ぶ夜能力が無ければ「対象を選ぶ夜能力は使われていませんでした。」
 *   ・墓地だけを対象にした能力（占い師・墓荒らしが墓地を見たとき）は対象外（マイクラ版どおり）
 *   ・夜に能力を使った記録は観測の人狼と同じ ONW.observeNote（役職つき。js/state.js）。朝のうちの能力（墓荒らし・ドッペルで手にした能力）も入り、昼に酔いが覚めてからの能力は入らない
 *   ・結果は1人1回だけ（g.poetSeen[ID] = { lines }）。再入室では同じ内容を返す
 *
 * 【段階】onww-poet-1of4 〜 4of4（Task Important Rules.txt のとおり、各段階を a〜 に分けて納品）
 *   1of4（登録）: このファイル・index.html・ロビー/ガイド/wikiの並び・ルールコード ONW68・docs/poet.md
 *   2of4（判定本体）: ONW.observeNote に役職を記録 / ONW.poetLines / 待機時間の通知・再入室・情報確認
 *   3of4（演出・役職変化）: 待機時間の演出・酔い覚め・昼の入れ替え(dayShift)・COボタン・CPU
 *   4of4（周辺・総合）: 封印・模倣・シャッフラー・デバッグ・観戦・docs・全体zip
 * 実装の進み具合は docs/poet.md を参照。
 */
(function (ONW) {
  const sealed = (g, id) => !!(ONW.seal && ONW.seal.is(g, id));   // 封印されている席は、詩人の通知を受け取れない
  const TITLE = "【詩人通知】";
  /** この人に伝える詩人通知（初回に決めて保存。以降は同じものを返す） */
  function deliver(g, id) {
    g.poetSeen = g.poetSeen || {};
    if (!g.poetSeen[id]) { const pk = ONW.poetPick(g); g.poetSeen[id] = { lines: pk.lines, events: pk.events }; }
    return g.poetSeen[id].lines;
  }
  /** 情報確認に載せる文章 */
  const textOf = (lines) => [TITLE, ...lines];

  /** CPU の詩人: 通知（どの役職の能力が誰に使われたか）を覚える（発言・投票判断に使う） */
  function cpuLearn(g, id, lines) {
    const i = ONW.cpu && ONW.cpu.kit && ONW.cpu.kit.infoOf ? ONW.cpu.kit.infoOf(g, id) : null;
    if (!i) return;
    i.poetLines = lines.slice();
    i.poetEvents = ((g.poetSeen || {})[id] || {}).events || [];
    i.poetAt = Date.now();
  }

  /** COボタン・CPUの発言の文（マイクラ版 main.js の詩人結果と同じ「〇〇が△△に能力を使っていました。」）。names は対象の名前の配列 */
  const coText = (role, names) => `${ONW.roleDef(role) ? (ONW.ROLE_INFO[role] || {}).name : role}が${names.join("と")}に能力を使っていました。`;
  const NONE_TEXT = "対象を選ぶ夜能力は使われていませんでした。";
  /** 2人を対象にする夜能力（マイクラ版 twoTargetRoles） */
  const TWO = ["troublemaker", "gremlin", "cupid", "evil_woman"];
  /** CO・騙りで「使われていた」と言える役職: 配役にあり、夜に対象を選ぶ能力を持つ（墓荒らしは墓地だけなので除く） */
  const nightRoles = (k, g) => ONW.roleIds().filter((r) => r !== "poet" && r !== "relic_robber" && (ONW.roleDef(r) || {}).night && k.roleInSetup(g, r));
  const claimOf = (g, role, ids) => ({ short: `${(ONW.ROLE_INFO[role] || {}).name} → ${ids.map((x) => nameIn(g, x)).join("・")}`, text: coText(role, ids.map((x) => nameIn(g, x))), claim: { kind: "poet", role, targets: ids } });
  const nameIn = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";
  const noneClaim = () => ({ short: "能力の使用なし", text: NONE_TEXT, claim: { kind: "poet", none: true } });

  ONW.defineRole("poet", {
    info: { deck: 90, name: "詩人", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 23.2,
      desc: "村人陣営。夜の能力はありません。朝のあとの待機時間に、昨夜ランダムな1つの役職の能力が誰に使われていたかが分かります（使った人は分かりません。墓地だけを対象にした能力は対象外）。結果は昼の「情報確認」からいつでも見返せます。酔っ払っているときは、酔いが覚めたときに分かります。" },
    groups: { "transform:light_apostle": 35 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 35）で決まる
    // ---- COボタン（結果開示: 使われていた役職 → 対象。co.js の poetrole / poettgt） ----
    coResult: { kind: "poet", twoRoles: TWO, coText, noneText: NONE_TEXT },
    // ---- CPU ----
    /** 本物の詩人のCPU: 「詩人CO」→ 覚えた通知（1件）をそのまま言う */
    cpuClaim(k, g, p, r, i, c) {
      c.co = "poet";
      const ev = (i.poetEvents || [])[0];
      if (i.poetLines && !(i.poetEvents || []).length) { c.result = noneClaim(); return; }
      if (ev) c.result = claimOf(g, ev.role, ev.players);
    },
    /** ドッペル・墓荒らしで手にした詩人の結果（cpuChainResult） */
    cpuChainResult(k, g, p, i) {
      const ev = (i.poetEvents || [])[0];
      return ev ? claimOf(g, ev.role, ev.players) : i.poetLines ? noneClaim() : null;
    },
    /** 騙り詩人: 配役にある夜能力の役職が、誰かに使われていたと言う（人狼陣営は自分以外の非人狼を選ぶ） */
    cpuLie: { role: "poet", weight: 7, order: 17, claim(k, g, p, others, selfRole, co) {
      const roles = nightRoles(k, g);
      if (!roles.length) return { co: k.bareCo(g, co), result: null };
      const role = k.pick(roles), t = k.fakeSeerTarget(g, p), ids = [t.id];
      if (TWO.includes(role)) { const rest = g.players.filter((q) => q.id !== p.id && q.id !== t.id); if (rest.length) ids.push(k.pick(rest).id); }
      return { co, result: claimOf(g, role, ids) };
    } },
    /** 投票判断: 配役にない役職の能力が使われたと言った人は怪しい（人狼陣営CPUは仲間の嘘を見逃す） */
    cpuVoteSee(k, g, p, q, i, me, wolfSide) {
      let s = 0;
      (g.cpuClaims || []).filter((c) => c.kind === "poet" && c.from === q.id && c.from !== p.id && c.role && !c.none).forEach((c) => { if (!k.roleInSetup(g, c.role)) s += wolfSide ? 0 : 1.6; });
      return s;
    },
    // 夜の画面: 夜の行動がない詩人向けの説明
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>朝のあとの待機時間に、<strong>昨夜どの役職の能力が誰に使われていたか</strong>（詩人通知）が分かります。結果は昼の「情報確認」からも見返せます。</p>`;
      },
    },
    /** 酔い覚めの演出: 通知(poet)を渡す。stageSober が自分のカードがめくれたあとに飛び出させる */
    soberPeek(c, id) { return sealed(c.g, id) ? {} : { poet: deliver(c.g, id) }; },
    stageSober: { listLate: { order: 98, run(sp, list, SK) { if (sp.poet) SK.later(() => { if (ONW.stage.observe) ONW.stage.observe(sp.poet, { title: "🪶 詩人通知" }); }, 300 + list.length * 380 + 500); } } },
    /** 酔いが覚めた詩人: 通知が分かる（情報確認にも載る） */
    soberLines(c, id) { return sealed(c.g, id) ? [] : textOf(deliver(c.g, id)); },
    // 朝の待機時間(stage.js が g.settlePoet を受け取って呼ぶ): 本人の画面だけ。自分のカードが「詩人」でめくれたあと、通知が飛び出す
    stageSettle: {
      field: "settlePoet", shown: "settlePoetShown",
      run: { order: 51, run(lines, SK) {
        const me = `p:${ONW.net.myId()}`;
        SK.later(() => { SK.show(me, "poet", true); SK.paint(SK.G()); }, 500);
        SK.later(() => { if (ONW.stage.observe) ONW.stage.observe(lines, { title: "🪶 詩人通知" }); }, 1500);
      } },
    },
    /** 昼に役職が動いて詩人になった人（酔いが覚める前の人は、覚めたときに伝わる）: 通知済みフラグを消して、その場で伝える。CPUは結果を覚える */
    dayShift(c, before) {
      const g = c.g;
      g.players.forEach((p) => {
        if (ONW.mimic.beforeEff(before, p.id) === ONW.mimic.eff(g, p.id) || ONW.mimic.eff(g, p.id) !== ONW.ROLE.POET) return;
        if (c.isDead(p.id) || ONW.hiddenDrunk(g, p.id) || sealed(g, p.id)) return;
        if (g.poetSeen) delete g.poetSeen[p.id];
        const lines = deliver(g, p.id), tx = textOf(lines);
        if (p.isCpu) { cpuLearn(g, p.id, lines); tx.forEach((t) => c.hold(p.id, t)); return; }
        tx.forEach((t) => c.hold(p.id, t));
        if (g.soberLines && g.soberLines[p.id]) g.soberLines[p.id].push(...tx);
        c.send(p.id, { t: "poetday", lines, role: ONW.shownRole(g.currentRoles[p.id]) });
      });
    },
    /** 昼に酔いが覚めたCPUの詩人も通知を覚える */
    soberReveal: { order: 91, run(c, ids) { const g = c.g; ids.forEach((id) => { const p = g.players.find((q) => q.id === id); if (p && p.isCpu && ONW.mimic.eff(g, id) === ONW.ROLE.POET && !sealed(g, id)) cpuLearn(g, id, deliver(g, id)); }); } },
    /** 待機時間: CPUの詩人も通知を覚える */
    settlePost: { order: 26, run(c) { const g = c.g; ONW.poetHolders(g).forEach((p) => { if (p.isCpu) cpuLearn(g, p.id, deliver(g, p.id)); }); } },
    /** 待機時間: 最終盤面で酔いが覚めている詩人に通知を伝える（再入室では、すでに伝えた分だけ同じ内容を返す） */
    settleMsg: { order: 26, run(c, p, mode) {
      const g = c.g;
      if (p.isCpu || ONW.mimic.eff(g, p.id) !== ONW.ROLE.POET || ONW.hiddenDrunk(g, p.id) || sealed(g, p.id)) return {};
      if (mode === "resync" && !(g.poetSeen || {})[p.id]) return {};
      const lines = deliver(g, p.id);
      return { logs: textOf(lines), poet: { lines } };
    } },
  });
})(window.ONW);
