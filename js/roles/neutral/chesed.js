/**
 * ケセド（第三陣営・マイクラ版 CHESED / Wiki の説明が正。発案: ダイ、元ネタ: ロボトミーカンパニー）:
 *   夜に自分以外の2人を選ぶ。1人目が「占い先」、2人目が「コーヒーを渡す人」（マイクラ版 openChesedAction の選択順。
 *   作者メモでは「先に選んだ人がコーヒーを渡す人、2人目が占い先」だったが、作者の恒常ルールによりマイクラ版を正とした。報告書に明記）。
 *   占い結果（対象の初期役職を占い師から見た姿。マイクラ版 chesedResultRole）はケセド本人には知らされず、コーヒーと一緒に渡された人だけが知る。
 *   コーヒーを渡された人が勝利すると、ケセドも追加で勝利する（マイクラ版 applyThirdSpecials）。
 *
 * ・コーヒータイム（マイクラ版 startCoffeeMuteAtDayStart / coffeeMutedIds）:
 *   昼の開始時点で、ケセドとコーヒーを渡された人は「コーヒータイム」になり、議論時間の 1/3 が経過するまで CO と発言ができない。
 *   終了すると本人に「コーヒータイム終了！」と届く。死亡した人のコーヒータイムは解除される（相手側は継続）。
 *   効果はチャット発言と CO のみ（昼能力は使える。マイクラ版のブロック範囲と同じ）。
 *   CPU の発言はコーヒータイム中は後ろ倒しになる（マイクラ版 cpu.js の isCoffeeMuted 遅延。残り20秒の投票先表明も同様に遅れる）。
 * ・待機時間の演出（作者メモ）: ケセドとコーヒーを渡された人の目線で、2人のカードがコーヒーの面
 *   （☕ ＋ 酔っ払いの背景の茶色・白バージョン ＋ カウントダウン）でめくれる。渡された側は、占い先のカードも占い結果の役職で同時にめくれる。
 *   渡された人が酔っ払い中（未覚醒）の場合は演出・文章を出さず、酔いが覚めた時点で結果だけが届く（stageFlash で占い先のカードがめくれる）。
 * ・昼の表示（作者メモ）: 自分のカードに、コーヒータイム中は☕とカウントダウンが出る。酔っ払いと同時の場合は
 *   上が黄色・白背景の🍺、下が茶色・白背景の☕の2段表示になり、片方が終われば片方だけになる（stage.js の .tb-drunk / .tb-coffee）。
 * ・酔っ払いとの相互作用: コーヒーで酔いが覚めることはない（マイクラ版に酔い覚め効果は無い）。ケセドが酔っ払い（未覚醒）の間は夜に選べない
 *   （他の夜役職と同じ。覚めたあとも選び直しはしない）。墓荒らし・ドッペルゲンガーでケセドを手にした場合は朝のうちに選べる（morning / cpuNight.chain）。
 * ・ハッキング: ケセドは銀狼のハッキング対象から外れない（マイクラ版の除外はヴァニティ・ホタルのみ。NO_HACK に追加しない）。
 *   思い込み先にもなり得る（マイクラ版の偽ケセド文「○○を占い、○○にコーヒーを渡しました。」を silver_wolf.js の fakeResult に追加）。
 *   思い込んだ人の選択は本物の記録・コーヒータイムには一切影響しない。本物のケセドがハッキングされている場合も、夜の選択・コーヒー・勝利は通常どおり働く
 *   （マイクラ版にケセド向けの通知スキップは無い）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   銀色の影の変化先に入る。光の使徒・闇の化身には入らない。シャッフラーの山札には入らない（shuffler.js の BLOCKED に追加）。
 *   コスプレの候補リストには入っていない。模倣の人狼は第三陣営を模倣できない。ペルソナは Web版未実装。
 * ・シナジー: マイクラ版の闇鍋シナジーにケセドをトリガーとするルールは無いので、ONW.SYNERGY_RULES への追加はなし。
 *   読切（ヨミ）の対象リストには最初から入っている（roles.js の YOMI_TARGET_ROLES。移植で自動的に効く）。
 * ・乞食: 乞食の「取れない対象」にケセドは入っていない（マイクラ版 isBeggarSwapExcludedTarget にも無い）ので、乞食はケセドを取れる。
 *
 * 状態: g.chesedTarget = { [ケセドのID]: 占い先のID } / g.chesedRecipient = { [ケセドのID]: 渡した人のID }
 *       g.chesedResultRole = { [ケセドのID]: 占い結果の役職ID }（行動した人のIDに紐づく。マイクラ版 game.chesed* と同じ）
 *       g.coffeeMute = { [プレイヤーID]: コーヒーが終わる g.remain の値 }（待機時間の settlePost で昼開始分を確定させる）
 *       g.chesedTold = { "ケセドID>渡された人ID": true }（結果を渡された側へ知らせ済みの印。二重通知防止）
 * 呼び出し: 夜 = defineRole の night / morning / cpuNight。コーヒータイム開始 = settlePost。演出 = settleMsg / stageSettle / soberReveal / stageFlash。
 *           発言・CO のブロックと終了通知 = net.js（chat / co ハンドラ・dayTick・killPlayer・CPU pump）。
 *           勝敗 = vote.js の set() が ONW.chesed.extraWins を見る。結果発表 = net.js buildResultObj の res.cheseds と ui.js の役職情報。
 */
(function (ONW) {
  const ID = "chesed";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  /** 最終盤面でケセドを持っている人 */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => (g.currentRoles || {})[id] === ID);
  /** コーヒータイムの長さ（秒）: 議論時間の 1/3（マイクラ版 daySeconds * 20 / 3 ticks = daySeconds / 3 秒） */
  const coffeeSecs = (g) => Math.max(1, Math.floor(((g.timers || {}).day || 0) / 3));
  /** 占い結果: 対象の初期役職を、占い師から見た姿で返す（マイクラ版 chesedResultRole = roleForSeerResult(initialRoles[target])） */
  function resultRoleFor(g, targetId) {
    const init = (g.initialRoles || {})[targetId];
    return ONW.mimic.seerSeen(g, init != null ? init : (g.currentRoles || {})[targetId], targetId);
  }
  /** 記録から [ケセド, 占い先, 渡された人, 結果役職] の組を全部返す（結果発表・CO・演出用） */
  function pairs(g) {
    return Object.keys(g.chesedTarget || {}).map((by) => ({ by, target: g.chesedTarget[by], recipient: (g.chesedRecipient || {})[by], role: (g.chesedResultRole || {})[by] })).filter((x) => x.target && x.recipient);
  }
  /** その人が関わる組（ケセド本人として / 渡された人として） */
  const pairsInvolving = (g, id) => pairs(g).filter((x) => x.by === id || x.recipient === id);
  /** 夜・朝の選択を記録する（人間・CPU共通の本体）。戻り値: 記録できたら true */
  function act(g, holder, target, recipient) {
    if (!target || !recipient || target === holder || recipient === holder) return false;
    (g.chesedTarget = g.chesedTarget || {})[holder] = target;
    (g.chesedRecipient = g.chesedRecipient || {})[holder] = recipient;
    (g.chesedResultRole = g.chesedResultRole || {})[holder] = resultRoleFor(g, target);
    return true;
  }
  /** コーヒータイム中かどうか（ホスト側の判定。net.js の発言・COブロックと CPU の遅延が使う） */
  function isMuted(g, id) {
    if (!g || g.phase !== ONW.PHASE.ONLINE_DAY) return false;
    const until = (g.coffeeMute || {})[id];
    return until != null && (g.remain == null || g.remain > until) && !isDead(g, id);
  }
  /** 追加勝利（マイクラ版 applyThirdSpecials）: 最終盤面のケセドについて、コーヒーを渡した人が勝者に入っていればケセドも勝利。winners はその時点の勝者集合 */
  function extraWins(g, winners) {
    return holders(g).filter((id) => { const r = (g.chesedRecipient || {})[id]; return !!r && winners.has(r); });
  }
  /** CO・結果開示の文言（人間のCOボタンとCPUの発言で一致させる。マイクラ版のCO文） */
  const coText = (t, r) => `${t}を占い、${r}にコーヒーを渡しました。`;
  const coTextPast = (t, r) => `${t}を占い、${r}にコーヒーを渡していました。`;
  const coShort = (t, r) => `☕${r}`;
  /**
   * 実績（wiki-data.js の「ケセド」に定義済みの3つ）。Web版には実績を保存する仕組みが無いので「満たした実績ID」を返すだけ（先行移植と同じ形）
   */
  function achievements(g, id, won) {
    const out = [], r = ONW.ROLE;
    if (g.initialRoles && (g.initialRoles[id] === r.CHESED || (g.currentRoles || {})[id] === r.CHESED)) out.push("first_chesed");   // 初めてケセドになる
    if (won && (g.currentRoles || {})[id] === r.CHESED) out.push("win_chesed");   // ケセドで勝利する
    if (!won && (g.currentRoles || {})[id] === r.CHESED) out.push("lose_chesed");   // ケセドで敗北する
    return out;
  }

  ONW.chesed = { holders, pairs, pairsInvolving, act, resultRoleFor, coffeeSecs, isMuted, extraWins, coText, coTextPast, coShort, achievements };

  // ---- CPUの夜の行動: 自分以外の2人をランダムに選ぶ（デバッグの指定があればそれ。1人目=占い先、2人目=コーヒーを渡す人） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p);
    const others = g.players.filter((q) => q.id !== p.id);
    if (others.length < 2) return;
    let picks = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
    if (picks.length < 2) picks = [...picks, ...ONW.utils.shuffle(others.filter((q) => !picks.includes(q.id))).slice(0, 2 - picks.length).map((q) => q.id)];
    const [t, r] = picks.map((id) => g.players.find((q) => q.id === id));
    if (!t || !r) return;
    act(g, p.id, t.id, r.id);
    const i = n.infoOf(p.id); i.mode = "chesed"; i.pair = [t.id, r.id];
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} の占い結果を ${r.name} に渡しました。`);
    n.hold(p.id, `${r.name} に占い結果とコーヒーを渡しました。`);
    n.ob(p.id, [t.id, r.id]);
    n.nn(rid);
  }

  ONW.defineRole("chesed", {
    info: { observe: "player", sealTarget: true, deck: 124, name: "ケセド", team: ONW.TEAM.THIRD, wakeOrder: 45, sort: 52,
      desc: "第三陣営。夜に自分以外の2人を選び、1人目を占って、その結果とコーヒーを2人目に渡します（ケセド自身は占い結果を知りません）。ケセドとコーヒーを渡された人はコーヒータイムのため、議論時間の1/3が経過するまでCOと発言ができません。コーヒーを渡された人が勝利すると、ケセドも勝利します。" },
    groups: { "transform:silver_shadow": 27 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に CHESED が入る）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>1人目に占い先</strong>、<strong>2人目にコーヒーを渡す相手</strong>の順で2人のカードを押してください。（自分以外）<br>占い結果はコーヒーを渡された人だけが知ります。${later}</p>${nowSel(" → ", 2)}`;
      },
      chainReady: (np) => np === 2,
      chainHow: () => "<strong>占い先 → コーヒーを渡す相手</strong>の順で2人のカードを押して（自分以外）",
    },
    stagePick: { players: 2 },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人
    cpuNight: { order: 30, stage: "chesed", chain: true, run: cpuRun },   // 墓荒らし・ドッペル・酔い覚めの後に朝のうちにも使える（chain）
    night: {
      kind: "chesed", order: 30,
      complete: (np) => np === 2,
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const [t0, r0] = c.selOf(p).players; if (!t0 || !r0) return;
        const t = ONW.watcher && ONW.watcher.shift ? ONW.watcher.shift(g, p.id, t0, [r0]) : t0;   // 静観者を占おうとしたら、実際に占う席は別の人（マイクラ版 watcherShiftForTarget は chesed の1人目=占い先に効く）
        if (!t || t === p.id) { c.hold(p.id, ONW.watcher ? ONW.watcher.noneLine("占い") : "占う人がいませんでした。"); return; }
        act(g, p.id, t, r0);
        ONW.observeNote(g, p.id, [t0, r0], null, "chesed");
        ONW.newsNote(g, "chesed");
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} の占い結果を ${nameOf(r0)} に渡しました。`);
        c.hold(p.id, `${nameOf(r0)} に占い結果とコーヒーを渡しました。`);   // ケセド本人は結果を知らない。渡された側への知らせは待機時間（settleMsg）で出す
      },
    },
    /** 墓荒らし・ドッペルでケセドを手にしたとき: 朝のうちに選べる（マイクラ版の借用役職フロー） */
    morning: {
      run(c) {
        const g = c.g, nameOf = c.nameOf, id = c.id;
        const [t, r] = c.players || [];
        if (!t || !r || t === id || r === id) return null;
        act(g, id, t, r);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${nameOf(t)} の占い結果を ${nameOf(r)} に渡しました。`);
        return { lines: [`${nameOf(r)} に占い結果とコーヒーを渡しました。`], reveal: null, nextChain: null };
      },
    },
    // 昼開始のコーヒータイム確定（待機時間の開始 = settlePost）: ケセドと渡された人のミュートを、昼タイマー基準で先に決めておく
    // （settleMsg が coffeeUntil を渡すために必要。実際のブロックは net.js が g.coffeeMute を見て行う。マイクラ版 startCoffeeMuteAtDayStart と同じ対象）
    settlePost(c) {
      const g = c.g;
      g.coffeeMute = {};
      const until = (g.timers.day || 0) - coffeeSecs(g);
      pairs(g).forEach((pr) => { g.coffeeMute[pr.by] = until; g.coffeeMute[pr.recipient] = until; });
    },
    // 待機時間の演出と知らせ（ケセド本人と渡された人だけ）: 2人のカードがコーヒーの面でめくれ、渡された側は占い先のカードも結果の役職でめくれる
    settleMsg(c, p, mode) {
      const g = c.g, mine = pairsInvolving(g, p.id);
      if (!mine.length) return {};
      const out = {};
      if ((g.coffeeMute || {})[p.id] != null) out.coffeeUntil = g.coffeeMute[p.id];   // 昼のコーヒータイム表示・送信ガード用（再入室でも届ける）
      if (ONW.hiddenDrunk(g, p.id)) return out;   // 酔っ払い中は演出・文章を出さない（結果は酔い覚めの soberReveal で届く。コーヒータイム自体は効く）
      const flips = [];
      mine.forEach((pr) => { [pr.by, pr.recipient].forEach((x) => { if (!flips.includes(x)) flips.push(x); }); });
      out.coffee = flips;
      out.coffeeSecs = coffeeSecs(g);
      const logs = [];
      mine.forEach((pr) => {
        if (pr.recipient !== p.id) return;
        const key = pr.by + ">" + p.id;
        if ((g.chesedTold || {})[key]) { out.coffeeTarget = [...(out.coffeeTarget || []), { id: pr.target, role: pr.role }]; return; }   // 再入室: 文章は二重に出さず、めくれるカードだけ戻す
        (g.chesedTold = g.chesedTold || {})[key] = true;
        logs.push("ケセドからコーヒーを受け取りました。");
        logs.push(`ケセドから占い結果を受け取りました。${nm(g, pr.target)} は ${c.rn(pr.role)} でした。`);
        out.coffeeTarget = [...(out.coffeeTarget || []), { id: pr.target, role: pr.role }];
      });
      if (logs.length) out.logs = logs;
      return out;
    },
    // 待機時間の演出（stage.js の stageSettle が g.settleCoffee を受け取って呼ぶ。ケセドと渡された人の画面にしか届かない）:
    // 2人のカードがコーヒーの面（__coffee@秒数）でめくれ、渡された側は占い先のカードも結果の役職でめくれる。昼になったら裏に戻る
    stageSettle: {
      field: "settleCoffee", shown: "settleCoffeeShown",
      run: { order: 24, run(ids, SK) { const g = SK.G(); const face = `__coffee@${(g && g.settleCoffeeSecs) || 0}`; SK.later(() => { ids.forEach((id) => SK.show(`p:${id}`, face)); ((g && g.settleCoffeeTarget) || []).forEach((t) => SK.show(`p:${t.id}`, t.role)); }, 300); } },
    },
    // 酔いが覚めた渡された人へ: 保留していた占い結果を届ける（本人だけ。占い先のカードが結果の役職でめくれて裏に戻る）
    soberReveal: { order: 52, run(c, ids) {
      const g = c.g;
      ids.forEach((id) => {
        pairsInvolving(g, id).forEach((pr) => {
          if (pr.recipient !== id) return;
          const key = pr.by + ">" + id;
          if ((g.chesedTold || {})[key]) return;
          (g.chesedTold = g.chesedTold || {})[key] = true;
          c.send(id, { t: "chesednews", text: `ケセドから占い結果を受け取りました。${nm(g, pr.target)} は ${c.rn(pr.role)} でした。`, target: pr.target, role: pr.role });
        });
      });
    } },
    // 酔い覚めで届いた占い結果の演出（stage.js の flashes("late") が g.chesedFlash を渡す。本人だけに届く "chesednews" で積まれる）:
    // 占い先のカードが結果の役職でめくれ、数秒後に裏に戻る（ヴァニティの気づき演出と同じ仕組み）
    stageFlash: {
      field: "chesedFlash", when: "late",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = x.role; SK.glow[k] = true;
          SK.paint(SK.G());
        }, 200 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 200 + list.length * 380 + 3200);
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 占い先 → コーヒーを渡した相手の順で2人を選ぶ（マイクラ版のCO文「○○を占い、○○にコーヒーを渡しました。」）
    coResult: {
      kind: "chesed", twoHint: "占い先 → コーヒーを渡した相手の順に2人を選んでください。",
      pickTwo: (sel, K) => [ONW.chesed.coText(K.nameOf(sel[0]), K.nameOf(sel[1])), { kind: "chesed", target: sel[0], recipient: sel[1] }, null, "disclose", ONW.chesed.coShort(K.nameOf(sel[0]), K.nameOf(sel[1]))],
    },
    /** CPU（マイクラ版 cpu.js）: ケセドCO + 結果開示「○○を占い、○○にコーヒーを渡していました。」（結果開示なので AI議論OFF でも出る） */
    cpuClaim(k, g, p, r, i, c) {
      const t = (g.chesedTarget || {})[p.id], rec = (g.chesedRecipient || {})[p.id];
      if (!t || !rec) return false;
      c.co = ID;
      c.result = { text: coTextPast(nm(g, t), nm(g, rec)), short: coShort(nm(g, t), nm(g, rec)), claim: { kind: "chesed", target: t, recipient: rec } };
    },
  });
})(window.ONW);
