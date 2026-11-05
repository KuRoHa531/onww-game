/**
 * 予想屋（マイクラ版 PREDICTOR を参考）: 第三陣営・昼能力。
 *   ・マイクラ版の説明文: 「第三陣営。昼に最終的に死亡するプレイヤーを何人でも選べます。最終死亡者全員と完全に一致すると単独勝利します。」
 *   ・夜の能力なし（night なし）。昼の議論中に「昼能力」ボタンから、「最終的に死亡すると思う人」のカードを何人でも（0人でも・全員でも・自分も）選んでおく。
 *     ★ユーザー指定: 昼が終わるまで（投票が始まるまで）なら、何度でも選び直せる。使える回数の制限はない。
 *   ・封印の対象役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。封印されていると昼能力は使えない。
 *   ・模倣の人狼は模倣できない（マイクラ版の模倣の人狼の候補に入っていない）。シャッフラーの変化先には入る（wiki の SHUFFLE_CANDIDATE_KEYS）。
 *   ・夜の情報（ONW.observeNote）は呼ばない → info.observe なし。
 *
 * 【勝利条件（マイクラ版 predictorPriorityResult と同じ）】
 *   ・最終盤面（g.currentRoles）で予想屋を持っていて、予想を1回でも決めた人（g.predictorGuesses[id] が配列として存在する人。0人の予想も「決めた」に入る）
 *   ・その予想（重複なし）が、最終死亡者（ONW.vote.deadSet = 追放・連鎖死・昼中の死亡・魔界公爵追放会議の死者など、死因を問わない全員）と【完全に一致】する
 *       - 1人でも多くても少なくてもだめ。誰も死亡しなかった試合では「誰も死亡しない」と予想していた（0人の予想を決めた）人が勝つ
 *   ・予想屋が2人以上いるときは、完全一致した全員が同時に勝つ（単独勝利。追加勝利系は通常どおり一緒に勝つ）
 *   ・恋人（重複役職）になっている予想屋は勝てない / 保安官に撃たれて勝利条件を失った人は勝てない（名探偵・バランサーと同じ扱い）
 *   ・自分が死亡していても勝てる（予想さえ一致すれば。マイクラ版も生死を見ない）
 *
 * 【勝利優先度（正本: docs/victory-priority.md）】
 *   チキン ＞ 模倣チキン ＞ 愉快犯 ＞ 神の祝福 ＞ 勝負師 ＞ シャッフラー ＞ 静観者 ＞ 名探偵 ＞ 予想屋 ＞ 魔界公爵 ＞ 賞金稼ぎ ＞ バランサー ＞ …
 *   vote.js の determineWinnersCoreBase の分岐 1.62（名探偵 1.6 のあと・魔界公爵 1.65 の前）。チキンの逆転（chickenForce）の再判定では飛ばす。
 *   バランサーの演出を出さない勝利タイトル（ONW.balancer.HIGHER_TITLES）に「予想屋勝利」を足した。
 *
 * 【重複役職の優先度（docs/overlay-role-priority.md）】予想屋は第三陣営の単独勝利役職。恋人(+恋人)がついた予想屋は勝てない（名探偵と同じ）。新しい行は不要。
 *
 * 【処理順】夜の能力は無い（night なし）ので docs/role-process-order.md の位置は不要。昼能力は議論中に何度でも使え、投票が始まった時点で固定される。
 *
 * 状態: g.predictorGuesses = { 予想屋のID: [死ぬと予想した人のID…] }（席順。試合ごとに net.startGame が {} に戻す。ホスト引き継ぎのキー（AUTH_KEYS / HOST_ONLY_KEYS）に追加済み）
 *   ※ 死亡した人も選べる（2of4-b）。生きている人と同じように、投票が始まるまで何度でも選び直せる。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_予想屋_*of4-*.txt。docs/predictor.md に進み具合）:
 *   1of4: 登録・状態・予想の記録（このファイル）・勝敗の判定（vote.js 1.62）・ルールコード ONW73・並び・封印の対象・docs【ここ】
 *   2of4: 昼能力の本体（昼能力ボタン → カードを選ぶ画面 → ホストの検証 → 何度でも選び直し・再入室・封印・デバッグ）
 *   3of4: 結果発表の「予想屋情報」【済】・CPU（予想・COボタン・騙り・投票判断）【済】
 *   4of4: 実績・端のケース（酔っ払い・墓荒らし・ドッペルゲンガー・シャッフラー・恋人 ほか）・総合・docs の仕上げ
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const P = {};
  /** 昼中に死亡した人（g.deadIds。呪殺・心中・保安官の執行・後追いなど、昼のあいだに死んだ人はすべて入る） */
  const deadNow = (g, id) => (g.deadIds || []).includes(id);
  const order = (g) => (g.players || []).map((p) => p.id);

  /** 最終盤面で予想屋を持っている人のID（席順）。生死・恋人・撃たれたかは問わない */
  P.holders = function holders(g) {
    return (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === R().PREDICTOR);
  };
  /** その人が今使える予想屋の役職（予想屋のカードを持っていれば "predictor"）。模倣の人狼は予想屋を模倣できないので、カードを持っているかだけを見る */
  P.roleOf = function roleOf(g, id) {
    return g && g.currentRoles && g.currentRoles[id] === R().PREDICTOR ? R().PREDICTOR : null;
  };

  /** 選べる人（全員。昼のうちに死亡した人も選べる。自分も含む。席順）。※2of4-b: 死亡した人も選べるようにした */
  P.targets = function targets(g) {
    return order(g);
  };

  /**
   * 予想屋の昼能力を使えるか（最終盤面で予想屋・酔いが覚めている・生きている・昼の議論中でタイマーが動いている・
   * 独裁処刑や全員死亡スキップ中でない・天秤の発動中（まもなく投票）でない・封印されていない）。
   * 何回でも使える（使用済みという状態はない）。投票が始まる（phase が昼でなくなる）と使えなくなる
   */
  P.canUse = function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator || g.libraFlashing) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!P.roleOf(g, id)) return false;
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;            // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || deadNow(g, id)) return false;
    return true;
  };

  /** 記録されている予想（配列）。まだ決めていなければ null */
  P.guessOf = function guessOf(g, id) {
    const a = g && g.predictorGuesses && g.predictorGuesses[id];
    return Array.isArray(a) ? a.slice() : null;
  };

  /**
   * 予想を記録する（ホストが検証したあとに呼ぶ。通信・画面は net.js 側）。picks = 死ぬと思う人のID（0人も可）。
   *   ・選べるのは席にいる全員（自分も可。死亡した人も可＝2of4-b）。席にいない人のIDは無視する
   *   ・死亡した人も、生きている人と同じように選び直せる（外せる）
   *   ・重複は1つにまとめ、席順に並べる
   * 戻り値: 記録した予想（配列）。使えない・不正な入力なら null（何も起きない）
   */
  P.apply = function apply(g, id, picks) {
    if (!P.canUse(g, id) || !Array.isArray(picks)) return null;
    const seats = order(g), ok = new Set(P.targets(g));
    const next = [...new Set(picks.filter((x) => typeof x === "string" && ok.has(x)))];
    next.sort((a, b) => seats.indexOf(a) - seats.indexOf(b));
    g.predictorGuesses = g.predictorGuesses || {};
    g.predictorGuesses[id] = next;
    return next.slice();
  };

  // ---- 文言（マイクラ版 predictorGuessMessage / predictorResultText と同じ。0人の予想はマイクラ版では文が崩れるので「誰も死亡しない」にした）----
  /** 本人の情報確認の文: 「あなたは A と B が死亡すると予想しました。」 */
  P.doneText = function doneText(g, ids, nm) {
    const u = [...new Set(ids || [])];
    if (!u.length) return "あなたは誰も死亡しないと予想しました。";
    if (u.length === (g.players || []).length) return "あなたは全員死亡すると予想しました。";
    const names = u.map(nm);
    return names.length === 1 ? `あなたは${names[0]}だけが死亡すると予想しました。` : `あなたは${names.join("と")}が死亡すると予想しました。`;
  };
  /** 結果発表の「予想屋情報」に出す、予想の言い方: 「全員死亡する」「Aだけが死亡する」「AとBが死亡する」「誰も死亡しない」 */
  P.resultText = function resultText(g, ids, nm) {
    const u = [...new Set(ids || [])];
    if (!u.length) return "誰も死亡しない";
    if (u.length === (g.players || []).length) return "全員死亡する";
    const names = u.map(nm);
    return names.length === 1 ? `${names[0]}だけが死亡する` : `${names.join("と")}が死亡する`;
  };
  /** 結果発表の「予想屋情報」の1行: 「予想屋 〇〇 は A と B が死亡すると予想していました。」 */
  P.infoLine = (g, id, nm) => `予想屋 ${nm(id)} は${P.resultText(g, P.guessOf(g, id) || [], nm)}と予想していました。`;
  /** 結果発表用: 予想を決めた予想屋（最終盤面）の一覧 [{ id, name, ids, names, text, hit }]。hit = 予想が最終死亡者と完全一致したか。決めていなければ空 */
  P.view = function view(g, nm, dead) {
    const d = dead || ONW.vote.deadSet(g);
    return P.holders(g).filter((id) => P.guessOf(g, id)).map((id) => {
      const ids = P.guessOf(g, id);
      return { id, name: nm(id), ids, names: ids.map(nm), text: P.resultText(g, ids, nm), hit: P.isExact(g, ids, d) };
    });
  };

  // ---- 勝敗 ----
  const keyOf = (ids) => [...new Set(ids)].sort().join("|");
  /** 予想が最終死亡者と完全に一致するか（席に居る人だけを数える） */
  P.isExact = function isExact(g, ids, dead) {
    const seats = new Set(order(g));
    return keyOf((ids || []).filter((x) => seats.has(x))) === keyOf([...dead].filter((x) => seats.has(x)));
  };
  /**
   * 勝てる予想屋のID（予想が最終死亡者と完全に一致した人。恋人・撃たれて勝利条件を失った人は除く）。空なら勝利なし。
   * dead は ONW.vote.deadSet(g)（determineWinnersCoreBase が resolveChain のあとに作った死者の集合）。省略すると今の deadSet
   */
  P.winIds = function winIds(g, dead) {
    const d = dead || ONW.vote.deadSet(g);
    const shot = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(g) : [];
    return P.holders(g).filter((id) => P.guessOf(g, id) && P.isExact(g, P.guessOf(g, id), d) && !ONW.isLover(g, id) && !shot.includes(id));
  };
  /** 勝利の説明文 */
  P.winText = function winText(g, ids, nm) {
    return `予想屋 ${nm(ids)} が最終死亡者を完全に予想したため、予想屋の単独勝利です。`;
  };

  // ---- 実績（5〜6つ。wiki-data.js の「予想屋」に定義済み。マイクラ版 stats.js と同じ条件）----
  /**
   * 「この試合で id が満たした実績ID」を返すだけ（Web版にはまだ実績を保存する仕組みが無い。道化の爆弾魔・天秤と同じ形。保存側ができたら呼ぶ）。
   * won: その人が勝ったか。勝者の一覧は g.winnerIds。dead は省略可（省略すると今の deadSet）
   *   predictor_one_dead_win = 1人だけ死亡すると予想して勝利 / predictor_all_dead_win = 全員死亡すると予想して勝利
   *   predictor_too_few = 1人以上当たっていたが、死亡者より少なく予想して敗北 / predictor_too_many = 実際の死亡者より多く予想して敗北
   *   first_predictor = 初期役職か最終役職が予想屋（初めてかどうかは保存側が数える） / win_predictor = 最終役職が予想屋で勝利
   */
  P.achievements = function achievements(g, id, won, dead) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === R().PREDICTOR || cur === R().PREDICTOR) out.push("first_predictor");
    if (cur === R().PREDICTOR && won) out.push("win_predictor");
    const guess = cur === R().PREDICTOR ? P.guessOf(g, id) : null;
    if (guess) {
      const d = dead || ONW.vote.deadSet(g), u = [...new Set(guess)], hit = u.filter((x) => d.has(x)).length;
      if (won && u.length === 1) out.push("predictor_one_dead_win");
      if (won && u.length === (g.players || []).length) out.push("predictor_all_dead_win");
      if (!won && hit > 0 && u.length < d.size) out.push("predictor_too_few");
      if (!won && u.length > d.size) out.push("predictor_too_many");
    }
    return out.filter((x, k) => out.indexOf(x) === k);
  };

  // ---- 観戦（4of4） ----
  /** 観戦パネル「昼の行動（予想屋）」: 予想を決めた予想屋（最終盤面）ごとの { by, text }。text は「AとBが死亡する」など。観戦者は全員の役職が見えるので、決めた予想もそのまま出す */
  P.specLines = function specLines(g, nm) {
    return P.holders(g).filter((id) => P.guessOf(g, id)).map((id) => ({ by: nm(id), text: P.resultText(g, P.guessOf(g, id), nm) }));
  };

  // ---- CPU（3of4） ----
  /**
   * CPUの予想屋が選ぶ「死亡すると思う人」（CPU_AUTO_DAY.predictor が ON のときだけ net.js の cpuPredict が使う。既定はOFFで、デバッグの「昼能力」タブから決める）。
   *   ・人狼と分かっている人がいれば、その1人（吊られると思って）
   *   ・分からなければ、自分以外の生きている人から1人（生きている人がいなければ誰も選ばない = 「誰も死亡しない」予想）
   * 返すのは人のIDの配列（0人もあり得る）
   */
  function cpuPick(k, g, p) {
    const alive = P.targets(g).filter((t) => !deadNow(g, t) && t !== p.id);
    const i = k.infoOf(g, p.id);
    const wolves = alive.filter((t) => i.known && k.isWolf(i.known[t]));
    if (wolves.length) return [k.pick(wolves)];
    return alive.length ? [k.pick(alive)] : [];
  }
  /**
   * CPUの投票判断（cpu.js の scoreVote が全員の分を足す）: 予想屋COをした人 q への加点。
   *   ・予想屋が配役（と変化公開）にいないのに名乗る → 嘘（人外）
   *   ・予想屋COが、予想屋の枚数より多い → このなかに嘘つきがいる
   *   ・それ以外 → ほぼ何も見ない（予想屋は自分の予想を当てたいだけ。村人側のCPUは少しだけ疑う）
   */
  function cpuVoteSee(k, g, p, q, i, me, wolfSide) {
    if (q.id === p.id) return 0;
    const co = (g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co) || null;
    if (co !== R().PREDICTOR) return 0;
    if (!k.roleInSetup(g, R().PREDICTOR)) return wolfSide ? 0 : 3.0;
    const n = g.players.filter((x) => (g.coBoard && g.coBoard[x.id] && g.coBoard[x.id].co) === R().PREDICTOR).length;
    const cards = Math.max(1, (g.selectedRoles || []).filter((r) => r === R().PREDICTOR).length);
    if (n > cards) return wolfSide ? 0 : 1.6;
    return wolfSide ? 0 : 0.3;
  }

  ONW.predictor = P;

  ONW.defineRole("predictor", {
    info: { sealTarget: true, deck: 95, name: "予想屋", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.98,
      desc: "第三陣営。昼に最終的に死亡するプレイヤーを何人でも選べます。最終死亡者全員と完全に一致すると単独勝利します。" },
    // CPU（3of4）: 本物は半分の確率で「予想屋CO」（結果開示なし。予想は昼能力で決めるだけで、言うことはない）。しないときは村人などを騙る（cpu.js の既定）。
    //   騙りは「予想屋CO」だけ（結果なし）。予想の決め方・投票判断は上の cpuPick / cpuVoteSee
    cpuClaim(k, g, p, r, i, c) { if (Math.random() < 0.5) { c.co = "predictor"; return true; } return false; },
    cpuLie: { role: "predictor", weight: 3, order: 18, claim: () => ({ co: "predictor", result: null }) },
    cpuPick, cpuVoteSee,
    groups: { "transform:silver_shadow": 28 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    // 夜の画面: 夜の行動がない予想屋向けの説明
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼の議論中に、昼能力ボタンから<strong>最終的に死亡すると思う人</strong>を選べます（投票が始まるまで何度でも選び直せます）。</p>`;
      },
    },
  });
})(window.ONW);
