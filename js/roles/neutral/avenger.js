/**
 * 復讐者（マイクラ版 AVENGER を参考）: 第三陣営。
 * 夜に復讐対象を1人選ぶ。対象が敗北すると追加勝利する。ただし、対象が自分自身・復讐者どうしがお互いを対象にしている・勝利できない人 のときは敗北。
 *   ・復讐対象は「役職の持ち主」単位で記録（g.avengerTargets[持ち主ID] = 対象のプレイヤーID。ONW.setRoleBound(g, "avengerTargets", ...)）。
 *     役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。
 *   ・移動のしかた（state.js の swapBound / gremlinCopy / copyRole / shufflerPlace。node上で確認済み）:
 *       交換（怪盗・いたずらっ子・交換者・墓荒らしなど）= 記録がカードについて移る。墓地に入れば "g:番号" に予約され、引いた人へ移る。
 *       グレムリンのコピー = コピー先に復讐対象を複製（コピー先が酔っ払いのときは複製しない）。ドッペルのコピー = 引き継がない（朝のうちに選ぶ。マイクラ版と同じ）。
 *       役職が上書きされたとき（グレムリン・ドッペル・シャッフラー）= 上書きされた席の古い記録は消える。
 *   ・自己参照・相互参照は「補正しない」（マイクラ版の PRESERVE_RAW_SELF_REFERENCE_FIELDS と同じ）。役職交換・コピーの結果、
 *     対象が自分自身になったら敗北、復讐者どうしがお互いを指していたら両者敗北、という判定にこの状態そのものを使う。
 *   ・朝の演出: 復讐者本人の目線で、選んだ対象のカードが🔪でめくれる（処刑人の🎯と同じ作り。他の人には見えない）。
 *   ・勝敗: 追加勝利（優先度の表の対象外）。他の勝者がすべて決まったあとに「対象が勝者に入っていないか」で判定する。
 * 実装の進み具合は _wip/復讐者_依頼文.txt（依頼文_復讐者_*.txt）を参照。
 *  1of4: 登録・夜の選択・役職移動への追従・ルールコード（a: 登録の骨格【済】 / b: 夜の選択・記録・夜ログ・新聞・CPUの最低限の動き【済】 / c: 役職移動への追従の確認【済】 / d: コピー系の引き継ぎ・上書き削除【済】 / e: 有効な復讐者の一覧(picks)・復讐者でなくなった席の記録の削除(fix)【済】 / f: 酔いが覚めたとき・墓荒らし／ドッペル経由の選択(morning.run)【済】 / g: 封印・シャッフラーの登録（結果の再表示は hold で済み）【済】 / h: CPUの投票判断【済】 / i: デバッグの能力先指定【済】 / j: docs・全体確認）
 *  2of4: 朝の🔪演出(night.resolve の c.rev / morning.run の reveal)・待機時間で裏に戻る・情報確認(hold)・再入室(g.morningReveals)・説明文【済】 / 3of4: 酔い覚め(soberExtra/stageSober)・待機時間(settlePre/settleMsg/stageSettle)・昼のうち(dayCheck/daySober)・知らせた記録(g.avengerSeen)・勝敗判定(vote.js set())【済】 / 4of4: CPUの発言(cpuClaim)・騙り(cpuLie)・連鎖(cpuChainResult)・COボタン(coResult)・戦績/実績・docs【済】
 */
(function (ONW) {
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 夜・朝のうちの選択を記録する（役職についていく）。持ち主 holderId のカードの復讐対象 = targetId */
  function setTarget(g, holderId, targetId) { ONW.setRoleBound(g, "avengerTargets", holderId, targetId); }
  /** 持ち主 holderId のカードの復讐対象（記録がなければ undefined）。自己参照も補正せずそのまま返す */
  function targetOf(g, holderId) { return ONW.getRoleBound(g, "avengerTargets", holderId); }
  const R_ = () => ONW.ROLE.AVENGER;
  let avKeys = [];   // 待機時間に🔪を出した席（昼になる前に片づける）
  /** 朝の演出: 復讐者本人の目線で、選んだ対象のカードが「🔪復讐相手」の面でめくれる（stage.js の AVENGER_MARK。役職名は出さない。他の人には見えない）。
   *  kind "peek" は、朝のうちはめくれたまま待機時間で裏に戻り、昼に使ったとき（酔いが覚めた復讐者）は数秒で閉じる（stage.js の show / onAck）。何度作っても同じ内容 */
  const MARK = "__avenger";
  const avengerReveal = (t) => ({ kind: "peek", items: [{ k: `p:${t}`, role: MARK }] });
  /** 記録の持ち主（プレイヤーID、または墓地の "g:番号"）が、いま復讐者のカードを持っているか */
  function holdsCard(g, key) {
    if (String(key).startsWith("g:")) return (g.center || [])[+String(key).slice(2)] === R_();
    return g.currentRoles[key] === R_();
  }
  /** 復讐者のカードを持っていない持ち主の記録を消す（役職が動く・上書きされるたびに state.js から呼ぶ）。
   *  カードが人から人へ動くときの記録の移動は swapBound（ROLE_BOUND_KEYS）が済ませているので、ここでは「復讐者でなくなった席に古い記録が残らない」ことだけを保証する。
   *  自己参照・相互参照の補正はしない（敗北判定に使うため） */
  function fix(g) {
    const m = g && g.avengerTargets;
    if (!m) return;
    Object.keys(m).forEach((k) => { if (!holdsCard(g, k) || m[k] === undefined) delete m[k]; });
  }
  /** 最終盤面で復讐者のカードを持っている人の [持ち主, 復讐対象]。対象が実在する記録だけ。
   *  対象が持ち主自身（役職交換・コピーの結果）の記録もそのまま入れる（敗北判定が使う）。記録のない復讐者は含めない */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      const t = targetOf(g, p.id);
      if (!t || !g.players.some((q) => q.id === t)) return;
      out.push([p.id, t]);
    });
    return out;
  }
  /** 持ち主 holderId の復讐者が、お互いを復讐対象にしているか（対象も最終盤面で復讐者で、その対象が持ち主を指している） */
  function mutual(g, holderId) {
    const t = targetOf(g, holderId);
    return !!t && t !== holderId && g.currentRoles[t] === R_() && targetOf(g, t) === holderId;
  }
  /** 知らせた記録: g.avengerSeen[持ち主ID] = その人が「復讐対象を知っている」対象のID。夜・朝のうちに自分で選んだ人、待機時間・酔い覚め・昼のうちに知らされた人が入る。
   *  カードが動いて新しい持ち主が記録を引き継いだときだけ、まだ知らされていないので🔪で知らせる。何度呼んでも二重に出ない（同じ対象なら出さない） */
  const seen = (g, id, t) => { (g.avengerSeen = g.avengerSeen || {})[id] = t; };
  const seenOf = (g, id) => (g.avengerSeen || {})[id];
  /** 今の盤面で「まだ知らされていない復讐者の持ち主」の [持ち主, 対象]。自己参照（対象が自分）は知らせない（敗北の判定にだけ使う）。酔っ払いの人は覚めるまで含めない */
  function unseen(g) {
    return picks(g).filter(([h, t]) => t !== h && seenOf(g, h) !== t && !ONW.hiddenDrunk(g, h));
  }
  /** CPUの記憶（投票判断 cpuVoteScore が使う i.avengerTarget）に、いま持っている復讐対象を入れる */
  function cpuLearn(g, id, t) { if (ONW.cpu && ONW.cpu.kit) ONW.cpu.kit.infoOf(g, id).avengerTarget = t; }
  ONW.avenger = { nm, setTarget, targetOf, holdsCard, fix, picks, mutual, reveal: avengerReveal, seen, seenOf, unseen, cpuLearn };

  // ---- COの文・結果（COボタン / CPUの発言・騙り）: 「〇〇を復讐対象にしました。」。claim は { kind: "avenger", target } ----
  const coText = (name) => `${name} を復讐対象にしました。`;
  const coShort = (name) => `復讐対象: ${name}`;
  const claimOf = (name, id) => ({ short: coShort(name), text: coText(name), claim: { kind: "avenger", target: id } });
  /** CPUの騙り（人狼・狂人などが復讐者を名乗る）: 生きている他の人をランダムに「復讐対象にした」と言う。候補がいなければ結果なしのCO */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)];
    return { co, result: claimOf(t.name, t.id) };
  }
  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ）。選んだ相手は i.avengerTarget に覚える（発言・投票判断は 1of4-h / 4of4） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const others = g.players.filter((q) => q.id !== p.id);
    if (!others.length) return;
    const t = f.player && f.player !== p.id && n.validPlayer(p, f.player) ? f.player : n.pick(others).id;
    setTarget(g, p.id, t); seen(g, p.id, t);
    if (!cur) { i.mode = "avenger"; i.target = t; }
    i.avengerTarget = t;
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, t)} を復讐対象にしました。`);
    n.hold(p.id, `${nm(g, t)} を復讐対象にしました。`);
    n.ob(p.id, [t]);
    n.nn(rid);
  }

  ONW.defineRole("avenger", {
    info: { deck: 82, name: "復讐者", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 35.7,
      desc: "第三陣営。夜に自分以外のプレイヤーを1人選び、復讐対象にします。復讐対象が敗北すると、あなたも追加で勝利します。ただし、復讐者がお互いを復讐対象にしていたり、役職交換やコピーによる影響で自分自身が復讐対象になっている場合は敗北します。朝、復讐者本人にだけ、復讐対象のカードが🔪（復讐相手）でめくれます。" },
    groups: { "transform:silver_shadow": 22 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる。ロビーの変化候補・固定役の変化指定・設定のOFF・ガイドはここから自動で出る）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>復讐対象</strong>のカードを1人分押してください。（自分以外）<br>選んだ相手が敗北すると、あなたも追加で勝利します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>復讐対象</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分以外）
    /** CPUの発言: 本物の復讐者は、確率（k.coTruth）で本当にCOして「〇〇を復讐対象にしました。」と言う。それ以外は他の役職を騙る（第三陣営は名乗らない決まり）。復讐対象の記憶 i.avengerTarget は cpuRun / cpuLearn が入れる */
    cpuClaim(k, g, p, r, i, c) {
      const t = i.avengerTarget && g.players.find((q) => q.id === i.avengerTarget && q.id !== p.id);
      if (t && k.selfRole(g, p) === "avenger" && k.coTruth(g, p)) { c.co = "avenger"; c.result = claimOf(t.name, t.id); }
      else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    /** CPUの騙り: 他の役職の人（人狼・狂人など）が復讐者を名乗る。重みは小さめ（勝ち組・敗北組と同じ程度）。claim 付きの結果なので、CPUどうしの矛盾の判定でも使える */
    cpuLie: { role: "avenger", weight: 3, order: 14, claim: lieClaim },
    /** 墓荒らし・ドッペルゲンガーで復讐者を手にしたCPUが、朝のうちに選んだ対象を、連鎖のCOで伝える */
    cpuChainResult(k, g, p, i) {
      const t = i.avengerTarget && g.players.find((q) => q.id === i.avengerTarget && q.id !== p.id);
      return t ? claimOf(t.name, t.id) : null;
    },
    /** CPUの投票: 自分が復讐対象にした相手が敗北しないと勝てないので、その人に強く投票する（処刑人のターゲットと同じ扱い。マイクラ版 cpu.js の +100 に相当）。
     *  自分が復讐者のままか（役職交換で動いていないか）はCPUには分からないので、夜に選んだ相手をそのまま覚えて使う */
    cpuVoteScore: (k, g, p, q, i) => (i && i.avengerTarget === q.id ? 15 : 0),
    cpuNight: { order: 15, stage: "seer", chain: true, run: cpuRun },   // 占い師の段階。「役職変動系以外の役職」（docs/role-process-order.md。番犬12のあと・一目惚れしてるてる20より前）
    night: {
      kind: "seer", order: 15,   // 役職変動系以外の役職（番犬12のあと）。純愛者・悪女・キューピッド(21)・破局師(22)・鍵師(23)より前。墓荒らし・ドッペル・シャッフラー・グレムリン・怪盗・いたずらっ子はすべてこのあとの段階
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t || t === p.id) return;   // 自分自身は選べない（自己参照になるのは役職交換・コピーの結果だけ）
        setTarget(g, p.id, t); seen(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を復讐対象にしました。`);
        c.hold(p.id, `${nameOf(t)} を復讐対象にしました。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "avenger");
        c.rev[p.id] = avengerReveal(t);   // 朝、選んだ対象のカードが🔪でめくれる（復讐者本人の画面だけ）
      },
    },
    // ---- 役職が動いたあと・酔いが覚めたとき・昼のうち: 復讐対象の記録はカードについて動くので、新しい持ち主がまだ知らないときだけ、🔪で知らせる ----
    /** 待機時間（朝のあと）: 最終盤面で復讐者を持っていて、復讐対象をまだ知らされていない人（怪盗・いたずらっ子・交換者・グレムリン・シャッフラーなどでカードが動いた人）を確定する。酔っ払い・自己参照の人は含めない。CPUは記憶に入れる */
    settlePre: { order: 16, run(c) {
      const g = c.g, set = (g.avengerSettle = {});
      unseen(g).forEach(([h, t]) => {
        const hp = g.players.find((q) => q.id === h);
        seen(g, h, t);
        const text = `あなたの復讐対象は ${nm(g, t)} です。`;
        g.nightLogsAll.push(`${c.rn(R_())} ${hp.name} は ${nm(g, t)} を復讐対象として受け取りました。`);
        if (hp.isCpu) { cpuLearn(g, h, t); c.hold(h, text); return; }
        set[h] = { logs: [text], items: [{ id: t }] };
      });
    } },
    settleMsg: { order: 26, run(c, p) { const e = (c.g.avengerSettle || {})[p.id]; return e ? { logs: e.logs.slice(), avenger: e.items.map((x) => ({ ...x })) } : {}; } },
    stageSettle: {
      field: "settleAvenger", shown: "settleAvengerShown",
      run: { order: 36, run(items, SK) {
        SK.later(() => { items.forEach((it, i) => SK.later(() => { const k = `p:${it.id}`; if (!avKeys.includes(k)) avKeys.push(k); SK.show(k, SK.AVENGER_MARK, true); SK.paint(SK.G()); }, i * 380)); }, 900);
      } },
      end: { order: 36, run(SK) { if (avKeys.length) { avKeys.forEach((k) => { if (SK.up[k] === SK.AVENGER_MARK) { delete SK.up[k]; delete SK.glow[k]; } }); avKeys = []; SK.paint(SK.G()); } } },
    },
    /** 昼のうち（酔いが覚めた・昼に役職が動いた・昼に復讐者を手にした）: 新しく復讐者を手にして、まだ対象を知らされていない人へ。カードが数秒だけ🔪でめくれる（jobday）。何度呼んでもよい（知らせた記録 g.avengerSeen で重複を防ぐ）。
     *  net.js の dayCheck（昼に役職が動いた）と daySober（酔いが覚めた直後）から呼ばれる。酔いが覚めた本人には soberExtra でまとめて知らせる（二重に出さない） */
    dayCheck(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      unseen(g).forEach(([h, t]) => {
        const hp = g.players.find((q) => q.id === h);
        if (!hp || c.isDead(h)) return;
        seen(g, h, t);
        const text = `あなたの復讐対象は ${nm(g, t)} です。`;
        g.nightLogsAll.push(`${c.rn(R_())} ${hp.name} は ${nm(g, t)} を復讐対象として受け取りました。`);
        if (hp.isCpu) { cpuLearn(g, h, t); c.hold(h, text); return; }
        c.hold(h, text); c.send(h, { t: "jobday", id: t, text, role: MARK });
      });
    },
    daySober(c) { ONW.roleDef(R_()).dayCheck(c); },
    /** 酔いが覚めた本人（最終役職が復讐者で、役職のカードについてきた復讐対象がある人）に、対象を文章でまとめて知らせる。peek は stageSober の list がめくる（net.js の soberUp） */
    soberExtra(c, id) {
      const g = c.g;
      if (g.currentRoles[id] !== R_()) return {};
      const t = targetOf(g, id);
      if (!t || t === id || !g.players.some((q) => q.id === t)) return {};
      seen(g, id, t);
      return { lines: [`あなたの復讐対象は ${nm(g, t)} です。`], peek: { avenger: [t] } };
    },
    stageSober: { list: { order: 22, run(sp, list, SK) { (sp.avenger || []).forEach((t) => list.push([`p:${t}`, SK.AVENGER_MARK, true])); } } },
    /** 墓荒らし・ドッペルゲンガーで復讐者を手にしたとき（朝のうち）/ 酔いが覚めた復讐者が昼に使うとき: 自分以外の1人を選べる。
     *  朝の時点の盤面で復讐対象を記録する（役職についていくので、このあと朝のうちに役職が動いても追従する）。
     *  酔っ払いは酔いが覚めるまで夜の能力を使えない（夜の resolve は酔い中の人には呼ばれない）ので、記録は覚めたあとのこの処理だけで入る。
     *  🔪の演出（reveal）: 朝のうちは対象のカードが🔪でめくれ、昼（酔いが覚めたあと）は数秒で閉じる（どちらも stage.js が reveal.day で切り分ける）。酔い覚め・役職が動いたあとの出し直しは 3of4 */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        if (t === id) return null;   // 自分自身は選べない
        setTarget(g, id, t); seen(g, id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を復讐対象にしました。`);
        return { lines: [`${c.nameOf(t)} を復讐対象にしました。`], reveal: avengerReveal(t), nextChain: null };
      },
    },
    // COボタン（co.js が kind で呼ぶ）: 復讐対象にした相手を1人選んでCO・結果を言う
    coResult: {
      kind: "avenger", targetLabel: "復讐対象にした相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "avenger", target: id }, null, "disclose", coShort(K.nameOf(id))],
    },
  });
})(window.ONW);
