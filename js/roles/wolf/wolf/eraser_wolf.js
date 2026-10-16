/**
 * 抹消の人狼（マイクラ版 ERASER_WOLF を参考）: 人狼陣営の「人狼系」。夜は人狼と同じく仲間の人狼が分かり、占い・判定・勝利条件も人狼と同じ。
 * 夜に自分以外の1人を選ぶ。昼になる前（朝のカードめくり）に、その人の役職と重複役職を「抹消」する。
 *   ・抹消後の役職: 人狼系 → 人狼 / 狂人系 → 狂人 / 村人陣営・第三陣営 → 村人（マイクラ版 eraserWolfAfterRole）
 *   ・重複役職（恋人・反転・シャッフラーなど）も消える（マイクラ版 clearOverlapRolesForEraser）。対象がロックされていたら失敗（鍵師）
 *   ・朝のカードめくりで、抹消された相手のカードが「真っ白のカード」でめくれる（演出）
 *
 * 実装は5段階（依頼文テキストは _wip/依頼文_抹消の人狼.txt）:
 *   1of5: 骨格（このファイル・index.html・ルールコード ONW48・ロビー/ガイドの並び・夜の選択と記録・夜の説明）【済】
 *   2of5: 抹消の本体（役職変更・重複役職の削除・失敗条件）【済】= 待機時間のはじめ(settlePre order 1)に ONW.eraserWolf.resolve が動く
 *   3of5: 朝の「真っ白のカード」めくり演出【済】= 待機時間に、抹消の人狼本人の画面だけ相手のカードが白紙でめくれる（失敗は🔒）。stage.js BLANK_MARK / css .tb-team-blank
 *   4of5: CPU・COボタン・情報確認・デバッグ固定・観戦【済】
 *         ・CPU: 夜に自分以外の1人を選んで抹消対象にする（cpuNight order 95 / stage "tm"。仲間の人狼と分かっている人は避ける。デバッグの能力先指定=forced(p).player が最優先）。記録・夜ログ・情報確認(hold)は人間と同じ文。
 *               人狼陣営のCPUは昼は必ず騙る（Web版の共通ルール。心眼の人狼と同じ）ので、「〇〇を抹消対象にしていました」を本当に自白することはしない。人間のCOボタンだけが同じ文を出す。
 *         ・COボタン: 役職CO「抹消の人狼」→ 結果開示で対象を選ぶと「〇〇を抹消対象にしていました。」（マイクラ版 main.js と同じ文）。失敗したときは「ロックされて失敗」。
 *                    情報開示の「役職が変わっていること」に「抹消に消されていそうです。」（マイクラ版の並びどおり先頭 / js/co.js の CHANGED_LINES）
 *         ・情報確認: 夜は night.resolve の hold（「〇〇 を抹消対象にしました。」）、待機時間は 3of5 の settleMsg（【抹消通知】）。CPUも夜の分は g.nightResults に同じ文で残る
 *         ・デバッグ固定: 抹消の人狼を固定したCPUの「能力先」で、抹消する相手を指定できる（js/debug.js の ABILITY.eraser_wolf = "era"）
 *         ・観戦: specInfo の eraser（夜ログに加えて「抹消」欄に「A → B（役職 → 抹消後の役職）」・失敗はその理由）
 *   5of5: 勝利優先度(docs)・端のケース・総合テスト・模倣の人狼の模倣先解禁【済】
 *         ・模倣の人狼の模倣先に解禁（マイクラ版 NON_MIMICABLE_ROLES に抹消の人狼は無い。mimic_wolf.js の NON_MIMICABLE から外し SUPPORTED に追加）。模倣の人狼が夜に選ぶと g.eraserWolfTarget[模倣の人狼の持ち主] に記録され、抹消の実行・演出・情報確認は本物と同じ
 *         ・墓荒らし・ドッペルゲンガーで手にしたとき: 朝のうちに抹消対象を選べる（morning.run。朝の画面で選ぶと即座に記録され、待機時間のはじめの settlePre で実行される）。CPUも朝のうちに選ぶ（cpuNight.chain）
 *         ・昼に入ってから（酔い覚め・昼のドッペルのコピー）は抹消できない: 抹消は「昼になる前」に実行する能力（マイクラ版 resolveEraserWolfAtDayStart は昼の開始時のみ）。酔い覚めでは議論中の連鎖の選択を出さない（noDayChain）
 *         ・実績ID（wiki 定義済みの eraser_target_* / first_eraser_wolf / win_eraser_wolf）を ONW.eraserWolf.achievements が返す（Web版にはまだ実績を保存する仕組みが無いので、模倣の人狼と同じく「この試合で満たしたID」を返すだけ）
 *         ・docs/victory-priority.md・docs/overlay-role-priority.md・docs/mimic-wolf.md に追記
 *
 * 【状態】g.eraserWolfTarget[能力を使った人のID] = 抹消対象のID（マイクラ版 eraserWolfTarget と同じ。試合ごとに net.startGame が {} に戻す）
 *         g.eraserWolfResults = [{ actorId, targetId, beforeRole, afterRole, hadLover }]（成功した抹消。マイクラ版 eraserWolfResults）
 *         g.eraserWolfFailed[actorId] = "target_locked" | "dead"（失敗の理由。マイクラ版 eraserWolfFailed）
 *
 * 【抹消の中身(2of5)】待機時間のはじめ（ONW.roleHooks("settlePre") order 1。後覚者・CPUが最終役職を知る前）に、最終盤面(g.currentRoles)で対象が持つ役職を書き換える。
 *   ・失敗: 対象の席がロック中(ONW.keymaster.locked) → 失敗（本人に「抹消通知」）。対象が昼になる前に死んでいる(g.deadIds / g.foxCursed) → 何もしない。
 *   ・成功: 抹消後の役職 = 人狼系(ONW.WOLF_KIND) → 人狼 / 狂人系(ONW.MAD_KIND) → 狂人 / それ以外 → 村人（マイクラ版 eraserWolfAfterRole）。
 *   ・重複役職も消す: 恋人（その人が入っている恋人関係をすべて破局扱い g.brokenKeys。破局師と同じ仕組み）/ 酔っ払い（酔いの記録）/ シャッフラーの印 / 役職に紐づく記録（鍵師・模倣先など）。
 *   ・変化公開(g.transformFrom)には載せない（抹消は変化役の変化ではない）。役職の流れ(roleTrail)には、役職が変わったときだけ積む（村人→村人・人狼→人狼は積まない）。夜ログ(nightLogsAll)・情報確認には「〇〇 は △△ を抹消対象にしました。」だけ出す（抹消の結果「A → B」は出さない。失敗＝ロックのときだけ「抹消に失敗しました」を出す）
 *   ・抹消の人狼が複数いて同じ対象を選んだときは、1回だけ（2人目以降は対象がすでに抹消後の役職でも同じ処理を繰り返さない）。
 *   ・Web版に無い封印の狂人・AAは対象外（マイクラ版の sealed / aa_blocked は Web版に役職が入ったときに足す）。
 * 【夜の段階】night.kind "tm"（いたずらっ子と同じ段階）・night.order 95。処理順メモ(docs/role-process-order.md)で抹消の人狼は「いたずらっ子・愉悦開拓者のあと」。
 *
 * 勝敗の優先度: 人狼系は基本勝敗のまま（docs/victory-priority.md の行の追加は 5of5 で決める）。
 */
(function (ONW) {
  const K = ONW.wolfKit;

  /** この人（能力を使った人）が抹消対象にした相手のID（まだ選んでいなければ null） */
  const targetOf = (g, id) => (g.eraserWolfTarget || {})[id] || null;

  const dead = (g, id) => (g.deadIds || []).includes(id) || (g.foxCursed || []).includes(id);
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

  /** 抹消後の役職（マイクラ版 eraserWolfAfterRole） */
  function afterRole(role) {
    if ((ONW.WOLF_KIND || []).includes(role)) return ONW.ROLE.WEREWOLF;
    if ((ONW.MAD_KIND || []).includes(role)) return ONW.ROLE.MADMAN;
    return ONW.ROLE.VILLAGER;
  }
  /** 対象が入っている恋人関係をすべて壊す（破局師と同じ g.brokenKeys）。戻り値: 壊した関係の数 */
  function breakLovers(g, t) {
    const rels = ONW.heartbreaker && ONW.heartbreaker.plan ? ONW.heartbreaker.plan(g, t) : [];
    if (!rels.length) return 0;
    g.brokenKeys = g.brokenKeys || {};
    rels.forEach((r) => { g.brokenKeys[r.key] = true; });
    return rels.length;
  }
  /** 対象の席の役職を書き換える（役職に紐づく記録は消す。変化公開には載せない） */
  function overwrite(g, t, role) {
    const card = ONW.cardAt(g, t), changed = g.currentRoles[t] !== role;
    g.currentRoles[t] = role;
    ["akujoHonmei", "akujoKeep", "cupidPair", "breakerTargets", "keyTargets", "watchdogOwners", "pureLoverTargets", "loveTargets", "freeterTargets", "visitorTargets", "muzzleTargets", "gremlinPicks", "mimicRole", "mindWolfTarget", "mindWolfSeen"].forEach((k) => { if (g[k]) delete g[k][t]; });
    if (g.shufflerMarks) delete g.shufflerMarks[card];   // シャッフラーの印も消える
    if (g.drunkOverlay) delete g.drunkOverlay[t];        // 酔っ払い(重複役職)も消える
    if (g.drunkRevealed) delete g.drunkRevealed[t];
    (g.pureLoverGen = g.pureLoverGen || {})[card] = ((g.pureLoverGen || {})[card] || 0) + 1;   // このカードの純愛者などの関係は別の世代 = 切れる
    if (changed) {   // 役職の流れ(roleTrail)には、役職が変わったときだけ積む（もともと村人の人を抹消して「村人 → 村人」と出ないように。人狼・狂人も同じ）
      const tr = (g.roleTrail = g.roleTrail || {});
      (tr[t] = tr[t] || []).push(role);
      if (g.cards && g.cards.trail) (g.cards.trail[t] = g.cards.trail[t] || []).push(card);
    }
    if (ONW.fixServants) ONW.fixServants(g);
    if (ONW.fixExecutioners) ONW.fixExecutioners(g);
    if (ONW.pureLover && ONW.pureLover.note) ONW.pureLover.note(g, [t]);
  }
  /**
   * 夜に選ばれた抹消を実行する（待機時間のはじめに1回。c = net.js の RC()）。戻り値: 成功した抹消のリスト
   * 同じ試合で2回呼ばれても、すでに処理した (actor, target) は飛ばす。
   */
  function resolve(c) {
    const g = c.g;
    g.eraserWolfResults = g.eraserWolfResults || []; g.eraserWolfFailed = g.eraserWolfFailed || {};
    const done = [];
    Object.keys(g.eraserWolfTarget || {}).forEach((actorId) => {
      const t = g.eraserWolfTarget[actorId];
      if (!t || !g.players.some((q) => q.id === t)) return;
      if ((g.eraserWolfResults || []).some((x) => x.actorId === actorId && x.targetId === t) || g.eraserWolfFailed[actorId]) return;
      if (dead(g, t)) { g.eraserWolfFailed[actorId] = "dead"; return; }
      if (ONW.keymaster && ONW.keymaster.locked(g, t)) {
        g.eraserWolfFailed[actorId] = "target_locked";
        g.nightLogsAll.push(`抹消の人狼 ${nm(g, actorId)} は ${nm(g, t)} の役職がロックされていたため、抹消に失敗しました。`);
        return;
      }
      const beforeRole = g.currentRoles[t], after = afterRole(beforeRole);
      const hadLover = breakLovers(g, t) > 0;
      overwrite(g, t, after);
      const r = { actorId, targetId: t, beforeRole, afterRole: after, hadLover };
      g.eraserWolfResults.push(r); done.push(r);
    });
    return done;
  }
  const FAIL_TEXT = { target_locked: "対象の役職がロックされていたため抹消に失敗しました。" };
  /** 失敗の通知文（失敗していなければ null） */
  const failText = (g, id) => FAIL_TEXT[(g.eraserWolfFailed || {})[id]] || null;
  /** 本人への抹消の結果: { ok, logs }。成功は logs なし（演出だけ）、失敗はロックの通知、対象が昼になる前に死亡したときは null（何も出さない） */
  function resultFor(g, id) {
    const t = targetOf(g, id); if (!t) return null;
    if ((g.eraserWolfResults || []).some((x) => x.actorId === id && x.targetId === t)) return { ok: true, logs: [] };   // 成功は文を出さない（情報確認には夜の「〇〇 を抹消対象にしました。」だけ）。真っ白のカードの演出は ok で出る
    const ft = failText(g, id);
    return ft ? { ok: false, logs: ["【抹消通知】", ft] } : null;
  }
  /** COボタンの結果開示の文（マイクラ版 main.js の「〇〇を抹消対象にしていました。」と同じ） */
  const coText = (name) => `${name} を抹消対象にしていました。`;
  /** 観戦者の「抹消」欄（specInfo）: 選んだ順に { by, target, before, after, fail }（名前と役職のID。成功なら before/after、失敗は fail に理由）。観戦者は全員の役職が見えるので事実をそのまま出す */
  function specLines(g, nm) {
    return Object.entries(g.eraserWolfTarget || {}).map(([by, t]) => {
      const r = (g.eraserWolfResults || []).find((x) => x.actorId === by && x.targetId === t);
      return { by: nm(by), target: nm(t), before: r ? r.beforeRole : null, after: r ? r.afterRole : null, fail: r ? null : ((g.eraserWolfFailed || {})[by] || null) };
    });
  }
  /**
   * CPUの夜の行動: 自分以外の1人を抹消対象に選ぶ（記録は人間の night.resolve と同じ g.eraserWolfTarget。抹消の実行は待機時間のはじめの settlePre）。
   *   ・デバッグの能力先指定(forced.player)があればその人。なければ、仲間の人狼と分かっている人を避けてランダム（全員が仲間なら誰でも）
   *   ・昼に酔いが覚めたCPU(stage "late")は、抹消の実行のあとなので使わない（cpuNight.chain を付けていないので、そもそも呼ばれない）
   */
  function cpuRun(n, p, label, chain, rid) {
    if (n.stage === "late") return;   // 昼に酔いが覚めたCPU: 抹消は昼になる前に済む能力なので使えない（5of5。酔い覚めの連鎖・墓荒らし/ドッペルの昼のコピー）
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const others = g.players.filter((q) => q.id !== p.id);
    const nonMate = others.filter((q) => !(ONW.VISIBLE_WOLF || []).includes(i.known[q.id]));
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(nonMate.length ? nonMate : others);
    if (!t) return;
    g.eraserWolfTarget = g.eraserWolfTarget || {};
    g.eraserWolfTarget[p.id] = t.id;
    i.mode = "eraser"; i.target = t.id;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を抹消対象にしました。`);
    n.hold(p.id, `${t.name} を抹消対象にしました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }
  /** 実績（wiki の「抹消の人狼」に定義済みの eraser_target_* / first_eraser_wolf / win_eraser_wolf）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ。模倣の人狼の achievements と同じ形）。
   *  マイクラ版 stats.js と同じ条件: 成功した抹消の before の陣営（村人陣営 / 元々村人 / 人狼陣営 / 第三陣営）・対象が恋人だった。won: その人が勝ったか */
  function achievements(g, id, won) {
    const out = [];
    if (g.initialRoles && g.initialRoles[id] === ONW.ROLE.ERASER_WOLF) out.push("first_eraser_wolf");   // 初めて抹消の人狼になる（初回かどうかは保存側が数える）
    (g.eraserWolfResults || []).filter((x) => x.actorId === id).forEach((x) => {
      const tm = (ONW.ROLE_INFO[x.beforeRole] || {}).team;
      if (tm === ONW.TEAM.VILLAGE) out.push("eraser_target_village");
      if (x.beforeRole === ONW.ROLE.VILLAGER) out.push("eraser_target_plain_villager");
      if (tm === ONW.TEAM.WOLF) out.push("eraser_target_wolf");
      if (tm === ONW.TEAM.THIRD) out.push("eraser_target_third");
      if (x.hadLover) out.push("eraser_target_lover");
    });
    if (won && g.currentRoles && g.currentRoles[id] === ONW.ROLE.ERASER_WOLF) out.push("win_eraser_wolf");
    return out.filter((x, k) => out.indexOf(x) === k);
  }
  ONW.eraserWolf = { targetOf, afterRole, resolve, failText, resultFor, coText, specLines, achievements };

  ONW.defineRole("eraser_wolf", {
    info: { deck: 70, name: "抹消の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.58,
      desc: "人狼陣営。他の人狼を確認できます。夜に自分以外の1人を選ぶと、朝にその人の役職と重複役職を抹消します（人狼系は人狼、狂人系は狂人、村人陣営・第三陣営は村人になります）。対象がロックされている場合は失敗します。占い・判定・勝利条件は常に人狼として扱われます。" },
    groups: { wolf: 8.8, "transform:dark_avatar": 9.3 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,
    // 夜の画面: 自分以外のプレイヤー1人を選ぶ（仲間の人狼の表示は共通の文言のあとに出る）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、役職を<strong>抹消したい1人のカード</strong>を押してください。（自分以外）${later}</p>${nowSel("、")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "役職を<strong>抹消したい1人のカード</strong>を押して（自分以外）",
    },
    // 夜にカードを押して行動する: プレイヤー1人（自分は選べない）
    stagePick: { players: 1 },
    noDayChain: true,   // 昼に入ってからは使えない（抹消は昼になる前に実行する能力）: 酔い覚めの議論中の連鎖には出さない（net.js soberUp）
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 抹消対象にした相手を選ぶ →「〇〇を抹消対象にしていました。」（マイクラ版 main.js と同じ文。CPUは人狼陣営なので騙るため、この文を自白には使わない）
    coResult: {
      kind: "eraser", targetLabel: "抹消対象にした相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), null, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    cpuNight: { order: 95, stage: "tm", chain: true, run: cpuRun },   // CPUの夜の行動(order が小さいほど先)。いたずらっ子(90)のあと。chain: 墓荒らし・ドッペルで手にしたCPUは朝のうちに選ぶ（昼の酔い覚めでは cpuRun が使わない）
    // 待機時間のはじめ（net.js toSettle の settlePre）: 夜に選んだ抹消を実行する。後覚者・CPUが最終役職を知る前に済ませる
    settlePre: { order: 1, run(c) { ONW.eraserWolf.resolve(c); } },
    // 待機時間: 抹消の人狼「本人の画面だけ」で、選んだ相手のカードが真っ白のカードでめくれる（抹消の成功）。失敗（ロック）のときは🔒の面でめくれる。
    // 昼になる前に裏に戻る。相手本人・ほかの人・観戦者には何も出ない（stage.js の stageSettle が g.settleErase を受け取って呼ぶ）
    stageSettle: {
      field: "settleErase", shown: "settleEraseShown",
      run: { order: 52, run(list, SK) {
        list.forEach((x, i) => {
          const k = `p:${x.id}`, at = 500 + i * 450;
          SK.later(() => { SK.up[k] = x.ok ? SK.BLANK_MARK : SK.BLANKX_MARK; SK.badge[k] = x.ok ? "抹消" : "失敗"; SK.paint(SK.G()); }, at);
          SK.later(() => { if (!SK.held[k]) delete SK.up[k]; delete SK.badge[k]; SK.paint(SK.G()); }, at + 3600);
        });
      } },
    },
    // 待機時間のメッセージ: 本人に、抹消の結果（演出用 erase と、情報確認に載る文）。再入室でも同じ内容を返す
    settleMsg: { order: 40, run(c, p, mode) {
      const g = c.g, id = p.id, t = ONW.eraserWolf.targetOf(g, id);
      if (p.isCpu || !t) return {};
      const res = ONW.eraserWolf.resultFor(g, id);
      if (!res) return {};
      return { erase: [{ id: t, ok: res.ok }], logs: res.logs };
    } },
    // 墓荒らし・ドッペルゲンガーで手にしたときの、朝のうちの能力（net.js の mchain が呼ぶ）: 選んだ相手を記録するだけ。抹消の実行は待機時間のはじめの settlePre（夜に選んだ分と同じ）。
    // 昼に入ってから（昼のドッペルのコピーなどで連鎖が出た場合）は、昼になる前に済む能力なので発動しない（マイクラ版 resolveEraserWolfAtDayStart は昼の開始時だけ）
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        if (t === id) return null;
        if (g.phase === ONW.PHASE.ONLINE_DAY) return { lines: ["昼になったあとなので、抹消は発動しません。"], reveal: null, nextChain: null, failed: true };
        g.eraserWolfTarget = g.eraserWolfTarget || {};
        g.eraserWolfTarget[id] = t;
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を抹消対象にしました。`);
        return { lines: [`${c.nameOf(t)} を抹消対象にしました。`], reveal: null, nextChain: null };
      },
    },
    night: {
      kind: "tm", order: 95,
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      /** 骨格(1of5): 選んだ相手を記録するだけ（役職の変更は 2of5）。夜ログはマイクラ版 addNightLog と同じ文 */
      resolve(c, p) {
        const g = c.g, sel = c.selOf(p), t = sel.players[0];
        if (!t || t === p.id) return;
        g.eraserWolfTarget = g.eraserWolfTarget || {};
        g.eraserWolfTarget[p.id] = t;
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${c.nameOf(t)} を抹消対象にしました。`);
        c.hold(p.id, `${c.nameOf(t)} を抹消対象にしました。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, c.eff(p));
      },
    },
  });
})(window.ONW);
