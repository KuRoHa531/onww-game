/**
 * 愉快犯（マイクラ版 PRANKSTER を参考）: 第三陣営。
 * 夜に自分以外の1人を選ぶ。選んだ瞬間に「選んだ人が敗北/勝利したら ○○」の14通りの勝利条件から1つがランダムで決まる（愉快犯本人にも分からない）。
 *   ・夜の選択と、決まった条件は「役職の持ち主」単位で1つの記録にまとめる（g.pranksterPicks[持ち主ID] = { t: 選んだ人のID, o: 条件のコード }。
 *     ONW.setRoleBound(g, "pranksterPicks", ...)。ONW.ROLE_BOUND_KEYS に登録済み）。役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。
 *   ・グレムリンのコピー: コピー先に同じ記録（対象と条件）を複製。ドッペルゲンガーのコピー: 引き継がない（朝のうちに自分で選ぶ）。役職が上書きされた席の古い記録は消える（state.js の copyRole / gremlinCopy / shufflerPlace）。
 *   ・夜の処理順: 役職変動系以外の役職（docs/role-process-order.md。復讐者(15)のすぐあと = 16）。
 *   ・昼の笑い声通知「愉快な笑い声が聞こえました。」（暴露狂人の演出のあと・昼のタイマー開始前。夜に対象を選んでいない愉快犯は通知なし。酔いが覚めたとき通知）= 2of4。勝敗 = 3of4（docs/victory-priority.md の「愉快犯の判定メモ」）。
 * 実装の進み具合は _wip/依頼文_愉快犯.txt（と各ステップの依頼文）を参照。
 *  1of4: 登録・夜の選択・条件のランダム決定・状態の登録・役職移動への追従・CPUの最低限・デバッグ・ルールコード ONW61（a: 登録の骨格・夜の選択・状態・移動追従・CPU・デバッグ【済】）
 *  2of4: 昼の笑い声通知（dayAnnounce 107 / dayNews / resyncDay / stage.prankster / ui.showPrankster / 情報確認の1行）【済】 / 3of4: 勝敗【済】 / 4of4: CPUの発言・騙り・COボタン（cpuClaim / cpuLie / cpuChainResult / coResult）・実績（achievements）【a: 済】・端のケース・docs
 */
(function (ONW) {
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const R_ = () => ONW.ROLE.PRANKSTER;
  /** 勝利条件の14通り（マイクラ版 night.js の randomChoice と同じ並び・同じコード）。成立のしかたは 3of4（vote.js）で使う */
  const OUTCOMES = [
    "target_lose_bonus", "target_lose_solo", "target_lose_all_lose", "target_lose_all_win", "target_lose_only_target", "target_lose_others_win", "target_lose_everyone_but_prankster",
    "target_win_bonus", "target_win_solo", "target_win_all_lose", "target_win_all_win", "target_win_only_target", "target_win_others_win", "target_win_everyone_but_prankster",
  ];
  /** 結果発表などで見せる文（マイクラ版 pranksterOutcomeDisplayLabel と同じ文） */
  const LABELS = {
    target_lose_bonus: "選んだ人が敗北したら追加勝利", target_lose_solo: "選んだ人が敗北したら単独勝利", target_lose_all_lose: "選んだ人が敗北したら全員敗北", target_lose_all_win: "選んだ人が敗北したら全員勝利",
    target_lose_only_target: "選んだ人が敗北したら選んだ人だけ勝利", target_lose_others_win: "選んだ人が敗北したら選んだ人以外全員勝利", target_lose_everyone_but_prankster: "選んだ人が敗北したら愉快犯以外全員勝利",
    target_win_bonus: "選んだ人が勝利したら追加勝利", target_win_solo: "選んだ人が勝利したら単独勝利", target_win_all_lose: "選んだ人が勝利したら全員敗北", target_win_all_win: "選んだ人が勝利したら全員勝利",
    target_win_only_target: "選んだ人が勝利したら選んだ人だけ勝利", target_win_others_win: "選んだ人が勝利したら選んだ人以外全員勝利", target_win_everyone_but_prankster: "選んだ人が勝利したら愉快犯以外全員勝利",
  };
  const rollOutcome = () => ONW.utils.randomChoice(OUTCOMES);
  /** 夜・朝のうちの選択を記録する（役職についていく）。持ち主 holderId のカードの記録 = { t: 対象, o: 条件のコード }。選び直したら条件も引き直す */
  function setPick(g, holderId, targetId) { const rec = { t: targetId, o: rollOutcome() }; ONW.setRoleBound(g, "pranksterPicks", holderId, rec); return rec; }
  /** 持ち主 holderId のカードの記録（なければ undefined） */
  function pickOf(g, holderId) { return ONW.getRoleBound(g, "pranksterPicks", holderId); }
  /** 記録の持ち主（プレイヤーID、または墓地の "g:番号"）が、いま愉快犯のカードを持っているか */
  function holdsCard(g, key) {
    if (String(key).startsWith("g:")) return (g.center || [])[+String(key).slice(2)] === R_();
    return g.currentRoles[key] === R_();
  }
  /** 愉快犯のカードを持っていない持ち主の記録を消す（役職が動く・上書きされるたびに state.js から呼ぶ）。カードが動くときの記録の移動は swapBound（ROLE_BOUND_KEYS）が済ませている */
  function fix(g) {
    const m = g && g.pranksterPicks;
    if (!m) return;
    Object.keys(m).forEach((k) => { if (!holdsCard(g, k) || m[k] === undefined) delete m[k]; });
  }
  /** 最終盤面で愉快犯のカードを持っていて、対象を選んでいて、酔い中・封印中でない人の [持ち主, 記録]（対象が実在する記録だけ）。通知（2of4）・勝敗（3of4）が使う */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      if (ONW.hiddenDrunk(g, p.id) || (ONW.seal && ONW.seal.is(g, p.id))) return;   // 酔いが覚めていない人・封印された人は、選んでいても適用の候補に入れない（笑い声の通知と同じ）
      const rec = pickOf(g, p.id);
      if (!rec || !rec.t || !g.players.some((q) => q.id === rec.t)) return;
      out.push([p.id, rec]);
    });
    return out;
  }
  /** 笑い声を出すか（出すなら出した印をつけて true）。酔いが覚めていない人・封印された人の記録は数えない */
  function announce(c) {
    const g = c.g;
    if (g.pranksterAnnounced) return false;
    if (!picks(g).length) return false;
    g.pranksterAnnounced = true;
    return true;
  }
  /** 実績（マイクラ版 stats.js と同じ条件。wiki-data.js の「愉快犯」に定義済みの2つ）。
   *   first_prankster = ゲーム中に一度でも愉快犯になった（初期役職・役職の流れ roleTrail・最終役職のどれか。マイクラ版 roleHistoryIncludes。「初めて」かどうかは保存側が数える）/
   *   win_prankster = 最終役職が愉快犯で勝利。
   *   Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（バランサー・盗賊と同じ。保存側ができたら呼ぶ）。won: その人が勝ったか */
  function achievements(g, id, won) {
    const out = [], P = R_(), ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    const trail = (g.roleTrail || {})[id] || [];
    if (ini === P || cur === P || trail.includes(P)) out.push("first_prankster");
    if (cur === P && won) out.push("win_prankster");
    return out;
  }
  ONW.prankster = { OUTCOMES, LABELS, rollOutcome, setPick, pickOf, holdsCard, fix, picks, nm, achievements };

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ）。条件は選んだ瞬間に決まり、CPUにも分からない ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const others = g.players.filter((q) => q.id !== p.id);
    if (!others.length) return;
    const t = f.player && f.player !== p.id && n.validPlayer(p, f.player) ? f.player : n.pick(others).id;
    setPick(g, p.id, t);
    if (!cur) { i.mode = "prankster"; i.target = t; }
    i.pranksterTarget = t;   // CPUの記憶: 発言（cpuClaim / cpuChainResult）で「〇〇を選びました。」と言うために覚える。条件は分からないので投票判断には使わない
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, t)} を選びました。`);
    n.hold(p.id, `対象を選びました。勝利条件の詳細はあなたにも分かりません。`);
    n.ob(p.id, [t]);
    n.nn(rid);
  }

  // ---- COの文・結果（COボタン / CPUの発言・騙り）: 「〇〇を選びました。」（マイクラ版 main.js の PRANKSTER と同じ文。条件は愉快犯本人にも分からないので言えない）。claim は { kind: "prankster", target } ----
  const coText = (name) => `${name} を選びました。`;
  const coShort = (name) => `選んだ人: ${name}`;
  const claimOf = (name, id) => ({ short: coShort(name), text: coText(name), claim: { kind: "prankster", target: id } });
  /** CPUの騙り（人狼・狂人などが愉快犯を名乗る）: 生きている他の人をランダムに「選びました」と言う。候補がいなければ結果なしのCO */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)];
    return { co, result: claimOf(t.name, t.id) };
  }

  ONW.defineRole("prankster", {
    info: { deck: 83, name: "愉快犯", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 35.8,
      desc: "第三陣営。夜に自分以外のプレイヤーを1人選びます。選んだ相手を基準に、「選んだ人が敗北したら／勝利したら」のあとに「追加勝利・単独勝利・全員敗北・全員勝利・選んだ人だけ勝利・選んだ人以外全員勝利・愉快犯以外全員勝利」のいずれかが続く14通りの勝利条件から、1つがランダムで適用されます（どの条件になるかは愉快犯本人にも分かりません）。愉快犯が2人以上いる場合は、誰か1人の条件が共有されて適用されます。夜に対象を選んだ愉快犯がいると、昼の始まりに「愉快な笑い声が聞こえました。」と全員に知らされます。" },
    groups: { "transform:silver_shadow": 23 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>対象</strong>のカードを1人分押してください。（自分以外）<br>どんな勝利条件になるかは、あなたにも分かりません。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>対象</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分以外）
    /** CPUの発言: 本物の愉快犯は、確率（k.coTruth）で本当にCOして「〇〇を選びました。」と言う。それ以外は他の役職を騙る（第三陣営は名乗らない決まり）。選んだ相手の記憶 i.pranksterTarget は cpuRun が入れる。投票への影響は付けない（依頼どおり） */
    cpuClaim(k, g, p, r, i, c) {
      const t = i.pranksterTarget && g.players.find((q) => q.id === i.pranksterTarget && q.id !== p.id);
      if (t && k.selfRole(g, p) === "prankster" && k.coTruth(g, p)) { c.co = "prankster"; c.result = claimOf(t.name, t.id); }
      else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    /** CPUの騙り: 他の役職の人（人狼・狂人など）が愉快犯を名乗る。重みは小さめ（復讐者と同じ3）。claim 付きの結果なので、CPUどうしの矛盾の判定でも使える */
    cpuLie: { role: "prankster", weight: 3, order: 15, claim: lieClaim },
    /** 墓荒らし・ドッペルゲンガーで愉快犯を手にしたCPUが、朝のうちに選んだ対象を、連鎖のCOで伝える */
    cpuChainResult(k, g, p, i) {
      const t = i.pranksterTarget && g.players.find((q) => q.id === i.pranksterTarget && q.id !== p.id);
      return t ? claimOf(t.name, t.id) : null;
    },
    cpuNight: { order: 16, stage: "seer", chain: true, run: cpuRun },   // 占い師の段階。「役職変動系以外の役職」（docs/role-process-order.md。復讐者15のすぐあと）
    night: {
      kind: "seer", order: 16,   // 役職変動系以外の役職（復讐者15のあと）。純愛者・悪女・キューピッド(21)・破局師(22)・鍵師(23)より前
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t || t === p.id) return;   // 自分自身は選べない
        setPick(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を選びました。`);
        c.hold(p.id, "対象を選びました。勝利条件の詳細はあなたにも分かりません。");
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "prankster");
      },
    },
    /** 昼の始まり(変化公開 → 新聞 → 暴露 のあと・麻婆豆腐の前): 「愉快な笑い声が聞こえました。」を出す。戻り値: バナーが消えるまでの待ち時間(ms)。出さないときは 0 */
    dayAnnounce: { order: 107, run(c) {
      if (!announce(c)) return 0;
      const m = { t: "prankster" }; c.sendAll(m); c.sendSpec({ ...m, quiet: true });
      return ONW.stage && ONW.stage.pranksterMs ? ONW.stage.pranksterMs() : 0;
    } },
    /** 昼のうちに、酔いが覚めた / 昼に愉快犯を手にして選んだ人がいて、まだ出していなければ、その瞬間に出す（昼のタイマーは止めない） */
    dayNews: { order: 107, run(c) {
      if (c.g.phase !== c.PH.ONLINE_DAY) return;
      if (!announce(c)) return;
      const m = { t: "prankster", late: true }; c.sendAll(m); c.sendSpec({ ...m, quiet: true });
    } },
    /** 再入室: バナーは出さず、情報確認にだけ反映 */
    resyncDay: { order: 17, run(c) {
      return c.g.pranksterAnnounced ? [{ t: "prankster", quiet: true }] : [];
    } },
    /** 墓荒らし・ドッペルゲンガーで愉快犯を手にしたとき（朝のうち）/ 酔いが覚めた愉快犯が昼に使うとき: 自分以外の1人を選べる。
     *  酔っ払いは酔いが覚めるまで夜の能力を使えない（夜の resolve は酔い中の人には呼ばれない）ので、記録は覚めたあとのこの処理だけで入る。 */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        if (t === id) return null;   // 自分自身は選べない
        setPick(g, id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を選びました。`);
        return { lines: ["対象を選びました。勝利条件の詳細はあなたにも分かりません。"], reveal: null, nextChain: null };
      },
    },
    // COボタン（co.js が kind で呼ぶ）: 選んだ相手を1人選んでCO・結果を言う（条件は言えない）
    coResult: {
      kind: "prankster", targetLabel: "選んだ相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "prankster", target: id }, null, "disclose", coShort(K.nameOf(id))],
    },
  });
})(window.ONW);
