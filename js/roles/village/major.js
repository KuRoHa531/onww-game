/**
 * 少佐（マイクラ版 MAJOR を参考）: 村人陣営。
 *   ・夜に自分以外の1人を選んで「救済」しようとする。
 *   ・昼になる前（待機時間のはじめ）に、救済先の役職と重複役職を整える（抹消の人狼の「抹消」を参考。2of4）
 *       村人陣営の役職はそのまま / 村人陣営以外は村人になる。恋人・反転・シャッフラーの重複役職は消える。対象がロックされていたら何も起きない。
 *   ・救済先が投票で追放されそうになったら、生存している少佐が身代わりとして追放される（従者の身代わりを参考。3of4）
 *   ・酔っ払い・墓荒らし・ドッペルゲンガー経由でも同じように動く（4of4）
 *       墓荒らし・ドッペルで手にしたら朝のうちに救済先を選べる（morning.run）。酔いが覚めたあと（昼）は「昼になる前」の能力なので使えない（noDayChain。抹消の人狼と同じ）。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_少佐_*of4-a.txt、詳細は docs/major.md）:
 *   1of4: 骨格（このファイル・index.html・ルールコード ONW80・ロビー/ガイドの並び・夜の選択と記録・朝のうちの連鎖・CPUの夜・COボタン）【済】
 *   2of4: 救済の本体（昼になる前の役職変更・重複役職の削除・失敗条件）【済】= settlePre order 1.5 の ONW.major.resolve
 *   3of4: 身代わり（vote.js の applyMajorSubstitution・結果発表の演出・処刑人/賞金稼ぎの判定）【済】= game.servantSubs に {major:true} で積む
 *   4of4: 酔っ払い・墓荒らし・ドッペル・模倣の人狼の確認、デバッグ、観戦、docs、確認スクリプト
 *
 * 【状態】g.majorTargets[役職の持ち主ID] = 救済先のID（ONW.ROLE_BOUND_KEYS。少佐のカードについていく）
 *         g.majorResults = [{ holderId, targetId, beforeRole, afterRole, madman }]（成功した救済。2of4）
 *         g.majorFailed[持ち主ID] = "target_locked" | "aa_blocked" | "dead" | "sealed"（失敗の理由。2of4）
 * 【夜の段階】night.kind "tm"・night.order 96（抹消の人狼=95 のあと。docs/role-process-order.md の「抹消の人狼 → 少佐 → 姫君」）。
 * 【勝敗の優先度】村人陣営のまま（docs/victory-priority.md の行の追加は不要）。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const dead = (g, id) => (g.deadIds || []).includes(id) || (g.foxCursed || []).includes(id);

  /** 持ち主 holder の少佐が救済しようとした相手のID（まだ選んでいなければ null） */
  const targetOf = (g, holder) => ONW.getRoleBound(g, "majorTargets", holder) || null;
  /** 救済先を記録する（役職の持ち主に予約。以降にカードが動いたら移動先の人の救済先になる） */
  const setTarget = (g, holder, t) => ONW.setRoleBound(g, "majorTargets", holder, t);
  /** 文言（夜の結果・情報確認・COボタン・CPUの発言で完全に一致させるため、ここ1か所だけで作る。マイクラ版 main.js / night.js と同じ文） */
  const doneText = (name) => `${name} を救済しようとしました。`;
  const coText = (name) => `${name} を救済しようとしました。`;

  /** 最終盤面で少佐として働く席（模倣の人狼が少佐を模倣している席を含む）で、救済先が決まっているもの: [{ holder, target }] */
  function holders(g) {
    return (g.players || []).map((p) => p.id).filter((id) => ONW.mimic.eff(g, id) === R().MAJOR && targetOf(g, id)).map((id) => ({ holder: id, target: targetOf(g, id) }));
  }

  ONW.major = { targetOf, setTarget, doneText, coText, holders };

  // ---- 救済の本体（2of4。抹消の人狼の overwrite / breakLovers を参考） ----
  /** 対象が入っている恋人関係をすべて壊す（破局師と同じ g.brokenKeys）。戻り値: 壊した関係の数 */
  function breakLovers(g, t) {
    const rels = ONW.heartbreaker && ONW.heartbreaker.plan ? ONW.heartbreaker.plan(g, t) : [];
    if (!rels.length) return 0;
    g.brokenKeys = g.brokenKeys || {};
    rels.forEach((r) => { g.brokenKeys[r.key] = true; });
    return rels.length;
  }
  /** 重複役職（恋人・反転・シャッフラー）を消す（マイクラ版 clearMajorRescueOverlapRoles。酔っ払いは消さない） */
  function clearOverlaps(g, t) {
    const card = ONW.cardAt(g, t);
    const lover = breakLovers(g, t) > 0;
    if (g.reverserTarget) { delete g.reverserTarget[t]; Object.keys(g.reverserTarget).forEach((h) => { if (g.reverserTarget[h] === t) delete g.reverserTarget[h]; }); }
    if (g.shufflerMarks) delete g.shufflerMarks[card];
    (g.pureLoverGen = g.pureLoverGen || {})[card] = ((g.pureLoverGen || {})[card] || 0) + 1;
    return lover;
  }
  /** 対象の席の役職を書き換える（役職に紐づく記録も消す）。changed のときだけ役職の流れに積む */
  function overwrite(g, t, role) {
    const card = ONW.cardAt(g, t), changed = g.currentRoles[t] !== role;
    g.currentRoles[t] = role;
    ["akujoHonmei", "akujoKeep", "cupidPair", "breakerTargets", "keyTargets", "watchdogOwners", "pureLoverTargets", "loveTargets", "freeterTargets", "visitorTargets", "muzzleTargets", "gremlinPicks", "mimicRole", "mindWolfTarget", "mindWolfSeen", "senseSeerTarget", "senseSeerSeen", "lawyerClient", "lawyerClientRole", "mosesBonus"].forEach((k) => { if (g[k]) delete g[k][t]; });
    g.promotedWolfIds = (g.promotedWolfIds || []).filter((x) => x !== t);
    if (changed) {
      const tr = (g.roleTrail = g.roleTrail || {});
      (tr[t] = tr[t] || []).push(role);
      if (g.cards && g.cards.trail) (g.cards.trail[t] = g.cards.trail[t] || []).push(card);
    }
    if (ONW.fixServants) ONW.fixServants(g);
    if (ONW.fixExecutioners) ONW.fixExecutioners(g);
    if (ONW.pureLover && ONW.pureLover.note) ONW.pureLover.note(g, [t]);
  }
  /** 模倣の人狼が少佐を模倣している席か（マイクラ版 isMajorMimicActor）: 救済先は狂人になる */
  const isMimicActor = (g, h) => g.currentRoles[h] === R().MIMIC_WOLF && (g.mimicRole || {})[h] === R().MAJOR;
  /** 夜（と朝のうち）に選んだ救済を実行する（待機時間のはじめに1回。抹消の人狼(order 1)のあと） */
  function resolve(c) {
    const g = c.g;
    g.majorResults = g.majorResults || []; g.majorFailed = g.majorFailed || {};
    const done = [];
    Object.keys(g.majorTargets || {}).forEach((h) => {
      const t = g.majorTargets[h];
      if (String(h).startsWith("g:") || !t || !g.players.some((q) => q.id === h) || !g.players.some((q) => q.id === t)) return;
      if (g.majorResults.some((x) => x.holderId === h && x.targetId === t) || g.majorFailed[h]) return;
      if (ONW.seal && ONW.seal.is(g, h)) { g.majorFailed[h] = "sealed"; return; }
      if (dead(g, t)) { g.majorFailed[h] = "dead"; return; }
      if (ONW.keymaster && ONW.keymaster.isAA(g, t) && ONW.keymaster.blocks(g, t)) { g.majorFailed[h] = "aa_blocked"; g.nightLogsAll.push(`少佐 ${nm(g, h)} は ${nm(g, t)} の特殊な力により、救済に失敗しました。`); return; }   // A.A.（ロックされていない）: 救済できない（マイクラ版は何も起きない）
      if (ONW.keymaster && ONW.keymaster.blocks(g, t)) { g.majorFailed[h] = "target_locked"; g.nightLogsAll.push(`少佐 ${nm(g, h)} は ${nm(g, t)} の役職がロックされていたため、救済に失敗しました。`); return; }
      const beforeRole = g.currentRoles[t];
      const madman = isMimicActor(g, h);
      const hadLover = clearOverlaps(g, t);
      let after = beforeRole;
      if (madman) { if (beforeRole !== R().MADMAN) after = R().MADMAN; }
      else if (ONW.ROLE_INFO[beforeRole] && ONW.ROLE_INFO[beforeRole].team !== ONW.TEAM.VILLAGE) after = R().VILLAGER;
      if (after !== beforeRole) overwrite(g, t, after);
      const r = { holderId: h, targetId: t, beforeRole, afterRole: after, madman, hadLover };
      g.majorResults.push(r); done.push(r);
    });
    return done;
  }
  /** 救済が成功した救済先の席（身代わりの対象。3of4） */
  const rescued = (g) => (g.majorResults || []).map((x) => x.targetId).filter((x, i, a) => a.indexOf(x) === i);
  /** 観戦者の「救済」欄（specInfo）: 選んだ順に { by, target, before, after, fail } */
  function specLines(g, nm2) {
    return Object.keys(g.majorTargets || {}).filter((h) => !String(h).startsWith("g:") && g.players.some((q) => q.id === h)).map((h) => {
      const t = g.majorTargets[h], r = (g.majorResults || []).find((x) => x.holderId === h && x.targetId === t);
      return { by: nm2(h), target: nm2(t), before: r ? r.beforeRole : null, after: r ? r.afterRole : null, fail: r ? null : ((g.majorFailed || {})[h] || null) };
    });
  }
  ONW.major.specLines = specLines;
  ONW.major.resolve = resolve; ONW.major.rescued = rescued; ONW.major.clearOverlaps = clearOverlaps;

  // ---- CPUの夜の行動 ----
  /**
   * 自分以外の1人を救済先に選ぶ（記録は人間の night.resolve と同じ。救済の実行は待機時間のはじめの settlePre。2of4）。
   *   ・デバッグの能力先指定(forced.player)があればその人。なければ、村人陣営でないと分かっている人を優先（村人にできるので）、いなければランダム
   *   ・昼に酔いが覚めたCPU(stage "late")は、昼になる前に済む能力なので使えない（抹消の人狼と同じ。cpuNight.chain の酔い覚めでは呼ばれても何もしない）
   */
  function cpuRun(n, p, label, chain, rid) {
    if (n.stage === "late") return;
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const others = g.players.filter((q) => q.id !== p.id);
    const notVillage = others.filter((q) => { const r = i.known[q.id]; return r && ONW.ROLE_INFO[r] && ONW.ROLE_INFO[r].team !== ONW.TEAM.VILLAGE; });
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(notVillage.length ? notVillage : others);
    if (!t) return;
    setTarget(g, p.id, t.id);
    i.mode = "major"; i.target = t.id;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を救済しようとしました。`);
    n.hold(p.id, doneText(t.name));
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  // ---- CPUの発言 ----
  function lieClaim(k, g, p, others, selfRole, co) {   // 少佐の騙り: 適当な誰かを「救済しようとしました」と言う
    if (!others.length) return null;
    const t = k.pick(others);
    return { co, result: { short: `→ ${t.name}`, text: coText(t.name), claim: { kind: "major", target: t.id } } };
  }
  function cpuClaim(k, g, p, r, i, c) {   // 少佐: 必ず少佐COして、救済先を開示する（救済先が決まっていないときは通常の村人陣営の扱い）
    if (!(i.mode === "major" && i.target)) return false;
    const { nameOf } = k;
    c.co = "major";
    c.result = { short: `→ ${nameOf(g, i.target)}`, text: coText(nameOf(g, i.target)), claim: { kind: "major", target: i.target } };
  }

  ONW.defineRole("major", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>救済したい1人のカード</strong>を押してください。（自分以外）<br>救済した相手が、村人陣営以外なら昼になる前に村人になります。投票で追放されそうになったら、あなたが身代わりになります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>救済したい1人のカード</strong>を押して（自分以外）",
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分は選べない）
    stagePick: { players: 1 },
    noDayChain: true,   // 昼に入ってからは使えない（救済は昼になる前に実行する能力）: 酔い覚めの議論中の連鎖には出さない（net.js soberUp）。墓荒らし・ドッペルの朝のうちは使える
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 救済しようとした相手を選ぶ →「〇〇を救済しようとしました。」（マイクラ版 main.js と同じ文。CPUの発言と同じ文言）
    coResult: {
      kind: "major", targetLabel: "救済しようとした相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "major", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    cpuLie: { role: "major", weight: 5, order: 8, claim: lieClaim },
    cpuClaim,
    /** 墓荒らし・ドッペルゲンガーで少佐を手にしたCPUが、続けて言う結果: 朝のうちに救済しようとした相手 */
    cpuChainResult(k, g, p, i) { const c = {}; return cpuClaim(k, g, p, "major", i, c) === false ? null : (c.result || null); },
    // 待機時間のはじめ（net.js toSettle の settlePre）: 夜に選んだ救済を実行する。抹消の人狼(order 1)のあと・姫君(order 2)のまえ（docs/role-process-order.md）
    settlePre: { order: 1.5, run(c) { ONW.major.resolve(c); } },
    cpuNight: { order: 96, stage: "tm", chain: true, run: cpuRun },   // CPUの夜の行動(order が小さいほど先)。抹消の人狼(95)のあと。chain: 墓荒らし・ドッペルで手にしたCPUは朝のうちに選ぶ（昼の酔い覚めでは cpuRun が使わない）
    info: { observe: "player", deck: 102, name: "少佐", team: ONW.TEAM.VILLAGE, wakeOrder: 72, sort: 15.6,
      desc: "村人陣営。夜に自分以外の1人を選んで救済しようとします。昼になる前に、その相手が村人陣営以外なら村人に変化させます（村人陣営の相手はそのままです。恋人・反転・シャッフラーの重複役職は消えます。相手の役職がロックされていると何も起きません）。救済した相手が投票で追放されそうになったら、生存している少佐が身代わりになって追放されます（救済先は役職のカードについていくので、役職が入れ替わると救済先も入れ替わります）。" },
    groups: { "transform:light_apostle": 40 },
    night: {
      kind: "tm", order: 96,   // 抹消の人狼(95)のあと（docs/role-process-order.md）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      /** 骨格(1of4): 選んだ相手を記録するだけ（役職の変更は 2of4 の settlePre）。夜ログはマイクラ版 addNightLog と同じ文 */
      resolve(c, p) {
        const g = c.g, t = c.selOf(p).players[0];
        if (!t || t === p.id) return;
        setTarget(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${c.nameOf(t)} を救済しようとしました。`);
        c.hold(p.id, doneText(c.nameOf(t)));
        ONW.observeNote(g, p.id, [t], null, c.eff(p));
        ONW.newsNote(g, c.eff(p));
      },
    },
    // 墓荒らし・ドッペルゲンガーで手にしたときの、朝のうちの能力（net.js の mchain が呼ぶ）: 選んだ相手を記録するだけ。救済の実行は待機時間のはじめの settlePre（夜に選んだ分と同じ）。
    // 昼に入ってから（昼のドッペルのコピーなどで連鎖が出た場合）は、昼になる前に済む能力なので発動しない（マイクラ版 resolveMajorConversionsAtDayStart は昼の開始時だけ）
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        if (t === id) return null;
        if (g.phase === ONW.PHASE.ONLINE_DAY) return { lines: ["昼になったあとなので、救済は発動しません。"], reveal: null, nextChain: null, failed: true };
        setTarget(g, id, t);   // 朝に選んだ救済先も、その時点の持ち主に予約され、以降の移動にもついていく
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を救済しようとしました。`);
        return { lines: [doneText(c.nameOf(t))], reveal: null, nextChain: null };
      },
    },
  });
})(window.ONW);
