/**
 * 静観者（マイクラ版 WATCHER を参考）: 第三陣営。夜の能力・昼の能力はない。
 *   ・マイクラ版の説明文: 「第三陣営。誰にも能力を使われず、誰からも票を入れられなければ単独勝利します。ただし、他に追加勝利の条件を満たしているプレイヤーがいる場合は敗北します。
 *     静観者の役職は交換やコピーされることはありません。交換されそうになったとき他のプレイヤーの役職と交換させます。」
 *   ・封印の対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っていない）。夜の情報（ONW.observeNote）は呼ばない → info.observe なし。
 *   ・闇鍋のシナジーなし。シャッフラーの山札に入らない（マイクラ版 shufflerEligibleRoles の除外）。模倣の人狼は模倣できない（第三陣営）。銀色の影の変化先には入る。
 *
 * 【勝利条件（マイクラ版 watcherPriorityResult と同じ）】
 *   ・最終盤面（g.currentRoles）で静観者を持っていて、死亡していない（追放・連鎖死・昼中の死亡など = ONW.vote.deadSet に入っていない）
 *   ・その試合の間、誰にも能力を使われておらず（g.watcherTouched[席] が空）、誰からも票を入れられていない（ONW.vote.tally で 0票）
 *   ・条件を満たした静観者が【ちょうど1人】のときだけ単独勝利（2人以上が条件を満たしたら、静観者の勝利は成立しない = マイクラ版の ids.length >= 2 → null）
 *   ・他に追加勝利の条件を満たしている人（オポチュニスト・天邪鬼・勝ち組・フリーター・従者など）がいるときは敗北（静観者の勝利は成立せず、下の分岐の結果になる）。判定は vote.js の watcherBlocked
 *   ・恋人（重複役職）になっている静観者 / 保安官に撃たれて勝利条件を失った人 / シャッフラーの失敗条件に当たる人は勝てない（予想屋・バランサーと同じ扱い）
 *   ・(+反転) が奇数回ついた静観者は、勝利の分岐では扱わず、反転者の共通ルール（ONW.reverser.apply = 元の役職として敗北すれば勝利）に任せる。偶数回は反転なしと同じ
 *
 * 【「能力を使われた」の数え方（2of4）】g.watcherTouched = { 静観者の席ID: [能力を使った人のID…] }。
 *   夜・朝のうちの能力は ONW.observeNote（能力が実際に使われたとき1回呼ばれる）、昼の能力・酔い覚めの昼のうちの能力は各ホスト処理から ONW.watcher.touch を呼ぶ。
 *   席の初期役職か最終役職が静観者のとき（マイクラ版 isWatcherRoleId）に記録する。鍵師のロックなどで不発だった能力は数えない。
 * 【交換・コピーされない（3of4・済）】怪盗・いたずらっ子・墓荒らし・ドッペルゲンガー・シャッフラー・グレムリンが静観者を選んだら、選ばれた静観者ではなく別の人（墓荒らしは別の墓地）に移す。
 *   選んだ本人には静観者を選んだように見える（マイクラ版 resolveWatcherShiftTarget）。移す先がなければ失敗（「静観者以外に〜できる相手がいなかった」）。
 *
 * 【ずれた能力も「使われた」（OJv26.11.07-52 の取り決め。今後のずらし処理もこれに従う）】
 *   ・静観者を選んで別の人にずれた能力は、選ばれた静観者に「能力を使われた」を数える。ずれた先がまた静観者なら、その静観者にも数える（連鎖。例: 魔理沙（静観者）→ 霊夢（静観者）→ 妖夢 なら魔理沙も霊夢も使われた判定）。W.shiftChain が連鎖で引く。
 *   ・今後ほかの「ずれる能力」（役職・演出・昼能力など）を足すときも、ずれる途中で当たった静観者は全員「能力を使われた」に数える（W.touch）。
 *   ・鈴の巫女・龍の狂人（Web版は未実装。wiki-data.js に定義のみ）は、ずれた先に当たったとき「自身に能力が使われた」判定にする（ずれる前に選ばれた席ではなく、実際に効いた席が自身）。実装するときは W.shiftChain の to が自分の席のときに、鈴の巫女の鈴・龍の狂人の逆鱗を発動させる。
 *   ・結果発表の夜行動ログは、静観者にずれたとき「〜しようとしましたが、静観者だったため〜」の形で書く（怪盗＝W.shiftText / ドッペル・シャッフラー＝W.hopLine / いたずらっ子・グレムリン＝W.pairLine / 墓荒らし＝W.graveText。OJv26.11.07-53 で全部そろえた）。
 *
 * 【勝利優先度（正本: docs/victory-priority.md）】
 *   チキン ＞ 模倣チキン ＞ 愉快犯 ＞ 神の祝福 ＞ 勝負師 ＞ シャッフラー ＞ 静観者 ＞ 名探偵 ＞ 予想屋 ＞ 魔界公爵 ＞ 賞金稼ぎ ＞ バランサー ＞ …
 *   vote.js の determineWinnersCoreBase の分岐 1.55（神の祝福 1 のあと・名探偵 1.6 の前。hit 番号 13）。チキンの逆転（chickenForce）の再判定では飛ばす。
 *   バランサーの演出を出さない勝利タイトル（ONW.balancer.HIGHER_TITLES）に「静観者勝利」を足した。
 *
 * 【重複役職の優先度（docs/overlay-role-priority.md）】静観者は第三陣営の単独勝利役職。(+恋人) がついた静観者は勝てない（予想屋と同じ）。新しい行は不要。
 *
 * 状態: g.watcherTouched = { 静観者の席ID: [能力を使った人のID…] }（試合ごとに net.startGame が {} に戻す。ホスト引き継ぎのキー AUTH_KEYS / HOST_ONLY_KEYS に追加済み）
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_静観者_*of4-*.md。docs/watcher.md に進み具合）:
 *   1of4: 登録・状態・勝敗の判定（このファイル・vote.js 1.55）・ルールコード ONW79・並び・シャッフラーの山札から除外・docs【ここ】
 *   2of4: 「能力を使われた」の記録（夜・朝のうち・昼の能力・酔い覚め・CPU）と「票を入れられた」の集計
 *   3of4: 交換・コピーされない（別の人へ移す）: 怪盗・いたずらっ子・墓荒らし・ドッペルゲンガー・シャッフラー・グレムリン / 墓荒らし・ドッペル・酔っ払い経由【済。W.shift / shiftPair / shiftGrave・各役職の night.resolve / morning.run / CPU run】
 *   4of4: 結果発表の「静観者情報」【済。W.view / infoLines → net.js res.watcher → ui.js・png.js】・情報確認（静観者本人に出す情報はない = 変更なし）・実績【済。W.achievements】・CPU【済】・端のケース・総合・docs
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const W = {};
  const nameOf = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";

  /** 最終盤面で静観者を持っている人のID（席順）。生死・恋人・撃たれたかは問わない */
  W.holders = function holders(g) {
    return (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === R().WATCHER);
  };

  /**
   * その席が「静観者の席」か（マイクラ版 isWatcherRoleId = 初期役職か最終役職が静観者）。能力を使われた記録・別の人へ移す判定で使う。
   * 夜のあいだは g.currentRoles が動いていくが、静観者のカードは交換されない（移されるので）ため、配られた席が静観者の席のまま。
   */
  W.isSeat = function isSeat(g, id) {
    return !!g && !!id && ((g.initialRoles || {})[id] === R().WATCHER || (g.currentRoles || {})[id] === R().WATCHER);
  };

  // ---- 能力を使われた（2of4 で呼び出しを足す）----
  /** 静観者の席に能力を使った記録を残す。actor = 能力を使った人のID / targets = 対象にした席のID（静観者でない席は何もしない）。同じ人は1回だけ */
  W.touch = function touch(g, actor, targets) {
    if (!g || !actor) return;
    const m = g.watcherTouched = g.watcherTouched || {};
    [...new Set(targets || [])].filter(Boolean).forEach((t) => {
      if (!W.isSeat(g, t)) return;
      if (!Array.isArray(m[t])) m[t] = [];
      if (!m[t].includes(actor)) m[t].push(actor);
    });
  };
  /** 静観者の席 id に能力を使った人のID（使った順） */
  W.touchedBy = (g, id) => ((g && g.watcherTouched && g.watcherTouched[id]) || []).slice();

  // ---- 交換・コピーされない（3of4。マイクラ版 resolveWatcherShiftTarget / resolveWatcherShiftCenterIndex）----
  /**
   * 怪盗・いたずらっ子・ドッペルゲンガー・シャッフラー・グレムリンが選んだ席 intended が静観者の席なら、実際に効かせる席を別の人に移して返す。
   *   ・intended が静観者の席でなければ intended のまま返す（何もしない）
   *   ・静観者の席なら「能力を使われた」を記録し（失敗しても数える）、actor・intended・excluded・静観者の席を除いた候補からランダムに1人返す。候補がなければ null（呼び出し側が「変化しませんでした」にする）
   *   ・選んだ本人には静観者を選んだように見せる（文章・演出・ログは intended のまま。変わるのは実際に動く席だけ）
   * pool = 候補の席ID（省略なら全員）。excluded = ほかに除く席（いたずらっ子・グレムリンのもう1人）。
   */
  W.shift = function shift(g, actor, intended, pool, excluded) {
    return W.shiftChain(g, actor, intended, pool, excluded).to;
  };
  /**
   * W.shift の本体（OJv26.11.07-52 で連鎖に変更）。{ to: 実際に効かせる席（なければ null）, seats: 選ばれて「静観者だったため」ずらされた静観者の席（選んだ席 → 次に当たった静観者 …の順。静観者を選んでいなければ空）}。
   *   ・選んだ席が静観者の席なら「能力を使われた」を記録し、actor・選んだ席・excluded を除いた全員（ほかの静観者の席も含む）から1人ランダムに引く。
   *   ・引いた席がまた静観者の席なら、その席も「能力を使われた」に数えて、その席を除いてもう一度引く（これを静観者でない席に当たるか、候補が尽きるまで繰り返す）。
   *   ・候補が尽きたら to = null（失敗）。それまでに当たった静観者は全員「能力を使われた」のまま。
   *   ・結果発表の夜行動ログは W.shiftText で「〇〇と交換しようとしましたが、静観者だったため△△の役職と交換しようとしましたが、静観者だったため□□の村人と交換しました。」の形にする（怪盗で実装済み。ほかの役職は今後必要になったら同じ形）。
   */
  W.shiftChain = function shiftChain(g, actor, intended, pool, excluded) {
    if (!intended) return { to: null, seats: [] };
    if (!W.isSeat(g, intended)) return { to: intended, seats: [] };
    const seats = [intended];
    W.touch(g, actor, [intended]);
    const ex = new Set([actor, intended, ...(excluded || [])]);
    const all = (pool || (g.players || []).map((p) => p.id)).filter((id) => id && !ex.has(id));
    for (;;) {
      const cand = all.filter((id) => !seats.includes(id));
      if (!cand.length) return { to: null, seats };
      const pick = ONW.utils.randomChoice(cand);
      if (!W.isSeat(g, pick)) return { to: pick, seats };
      seats.push(pick);   // 当たったのも静観者: この席にも「能力を使われた」を数えて、もう一度引く
      W.touch(g, actor, [pick]);
    }
  };
  /**
   * 静観者にずらされたときの夜行動ログ（結果発表用）。chain = W.shiftChain の戻り値 / who = 「怪盗 くろは」のような能力を使った人の表記 / nameOf = 席ID→名前 / role = 実際に効いた席が持っていた役職の表示名（「村人」）/ verb = 「交換」など。
   *   例（1回ずれた）: 怪盗 くろは は 魔理沙 と役職を交換しようとしましたが、静観者だったため 霊夢 の村人と交換しました。
   *   例（2回ずれた）: 怪盗 くろは は 魔理沙 と役職を交換しようとしましたが、静観者だったため 霊夢 の役職と交換しようとしましたが、静観者だったため 妖夢 の村人と交換しました。
   *   静観者を選んでいない（chain.seats が空）ときは null（呼び出し側の従来の文を使う）。
   */
  W.shiftText = function shiftText(chain, who, nameOf, role, verb) {
    if (!chain || !chain.seats || !chain.seats.length || !chain.to) return null;
    const v = verb || "交換", s = chain.seats;
    const mid = s.slice(1).map((id) => `静観者だったため ${nameOf(id)} の役職と${v}しようとしましたが、`).join("");
    return `${who} は ${nameOf(s[0])} と役職を${v}しようとしましたが、${mid}静観者だったため ${nameOf(chain.to)} の${role}と${v}しました。`;
  };
  /** 2人を選ぶ能力（いたずらっ子・グレムリン）の移し替え。[実際の1人目, 実際の2人目]。どちらかが null・同じ人になったら失敗（ok=false）。ca / cb = それぞれの W.shiftChain の戻り値（ログ文用） */
  W.shiftPair = function shiftPair(g, actor, a0, b0, pool) {
    const ca = W.shiftChain(g, actor, a0, pool, [b0]), a = ca.to;
    const cb = W.shiftChain(g, actor, b0, pool, [a0, a].filter(Boolean)), b = cb.to;   // 2人目は1人目の選んだ席・ずれた先を除く（静観者の1人目に当たり直さない）
    return { a, b, ok: !!a && !!b && a !== b, ca, cb };
  };
  /**
   * 結果発表の夜行動ログ（1人を選ぶ能力: ドッペルゲンガー・シャッフラー用。怪盗の W.shiftText と同じ流れ）。静観者を選んでいない・失敗したときは null（従来の文を使う）。
   *   first(名前) = 選んだ人への「…しよう」（「と」は足される）/ next(名前) = ずれた先の静観者への「…しよう」/ done(名前) = 実際に効いた人への結びの文（「…しました。」まで）。
   *   例（ドッペル）: 〇〇 は 魔理沙 をコピーしようとしましたが、静観者だったため 霊夢 の役職をコピーし、村人 になりました。
   */
  W.hopLine = function hopLine(chain, who, nameOf, first, next, done) {
    if (!chain || !chain.seats || !chain.seats.length || !chain.to) return null;
    const s = chain.seats;
    return `${who} は ${first(nameOf(s[0]))}としましたが、${s.slice(1).map((id) => `静観者だったため ${next(nameOf(id))}としましたが、`).join("")}静観者だったため ${done(nameOf(chain.to))}`;
  };
  /**
   * 結果発表の夜行動ログ（2人を選ぶ能力: いたずらっ子・グレムリン用）。sp = W.shiftPair の戻り値 / a0, b0 = 選んだ2席。どちらも静観者でなければ null。
   *   attempt(A, B) = 「A と B の役職を入れ替えよう」（「と」は足される） / done(A, B) = 結びの文。どちらがどうずれたかを「魔理沙 は静観者だったため 霊夢 に、霊夢 も静観者だったため 妖夢 に変わり」の形で挟む。
   *   例（いたずらっ子）: いたずらっ子 〇〇 は 魔理沙 と 咲夜 の役職を入れ替えようとしましたが、魔理沙 は静観者だったため 霊夢 に変わり、霊夢 と 咲夜 の役職を入れ替えました。
   */
  W.pairLine = function pairLine(sp, who, nameOf, a0, b0, attempt, done) {
    if (!sp || !sp.ok) return null;
    const side = (c) => (c && c.seats && c.seats.length ? `${nameOf(c.seats[0])} は静観者だったため ${c.seats.slice(1).map((id) => `${nameOf(id)} に、${nameOf(id)} も静観者だったため `).join("")}${nameOf(c.to)} に変わり` : "");
    const desc = [side(sp.ca), side(sp.cb)].filter(Boolean).join("、");
    if (!desc) return null;
    return `${who} は ${attempt(nameOf(a0), nameOf(b0))}としましたが、${desc}、${done(nameOf(sp.a), nameOf(sp.b))}`;
  };
  /** 結果発表の夜行動ログ（墓荒らし）。選んだ墓地 from が静観者の札で to にずれたときだけ文を返す（同じなら null = 従来の文）。例: 墓荒らし 〇〇 は 墓地1 と役職を交換しようとしましたが、静観者だったため 墓地3 の村人と交換しました。 */
  W.graveText = (who, from, to, role) => (from === to ? null : `${who} は 墓地${from + 1} と役職を交換しようとしましたが、静観者だったため 墓地${to + 1} の${role}と交換しました。`);
  /** 墓荒らし: 選んだ墓地の札が静観者なら、静観者でない別の墓地へ移す（マイクラ版 resolveWatcherShiftCenterIndex。移す先がなければ選んだままの番号）。墓地は席ではないので「能力を使われた」には数えない */
  W.shiftGrave = function shiftGrave(g, index) {
    const c = g.center || [];
    if (c[index] !== R().WATCHER) return index;
    const cand = c.map((r, i) => ({ r, i })).filter((e) => e.i !== index && e.r !== R().WATCHER).map((e) => e.i);
    return cand.length ? ONW.utils.randomChoice(cand) : index;
  };
  /** 失敗の文章（移す先がなかったとき。マイクラ版と同じ） */
  W.noneLine = (verb) => (verb === "コピー" ? "静観者以外にコピーできる相手がいなかったため、コピーできませんでした。" : verb === "変化" ? "静観者以外に変化させられる相手がいなかったため、役職は変化しませんでした。" : `静観者以外に${verb}できる相手がいなかったため、役職は変化しませんでした。`);
  /** 鍵師のロックで失敗したとき、🔒の演出が「実際の対象」ではなく選んだ席（intended）に出るようにする（選んだ人には静観者を選んだままに見せる）。shown / actual は同じ並びの席ID */
  W.keyFailShown = function keyFailShown(g, actor, shown, actual) {
    const f = ((g && g.keyFails) || {})[ONW.cardAt(g, actor)];
    if (!f || f.kind === "self" || !ONW.keymaster) return;
    f.targets = shown.slice(); f.locked = shown.filter((s, k) => ONW.keymaster.locked(g, actual[k]));
  };

  // ---- 票を入れられた ----
  /** 静観者の席 id に有効な票を入れた人のID（席順。ペンギンの滑り後の投票先で見る。0票の重みの人は除く）。結果発表・情報確認用 */
  W.votedBy = function votedBy(g, id) {
    const ev = ONW.vote && ONW.vote.effectiveVotes ? ONW.vote.effectiveVotes(g) : (g.votes || {});
    return (g.players || []).map((p) => p.id).filter((v) => ev[v] === id && (!ONW.vote.weightOf || ONW.vote.weightOf(g, v) > 0));
  };
  /** 票を入れられたか（最終的な票数が1票以上。交換者・番犬の反映後 = ONW.vote.tally） */
  W.voted = function voted(g, id, counts) {
    const c = counts || (ONW.vote && ONW.vote.tally ? ONW.vote.tally(g) : {});
    return (c[id] || 0) >= 1;
  };

  // ---- 勝敗 ----
  /**
   * 「誰にも能力を使われず、誰からも票を入れられなかった」静観者のID（死亡・恋人・撃たれた人・opts.exclude の人・(+反転)が奇数の人は除く）。
   * ちょうど1人のときだけその1人を返し、0人・2人以上なら空（マイクラ版 watcherPriorityResult）。「追加勝利の人がいたら敗北」は vote.js の watcherBlocked が見る。
   */
  W.winIds = function winIds(g, opts) {
    const o = opts || {}, dead = o.dead || ONW.vote.deadSet(g), counts = ONW.vote.tally(g), ex = new Set(o.exclude || []);
    const shot = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(g) : [];
    const ids = W.holders(g).filter((id) => !dead.has(id) && !ex.has(id) && !ONW.isLover(g, id) && !shot.includes(id)
      && !(ONW.reverser && ONW.reverser.odd(g, id)) && !W.touchedBy(g, id).length && !W.voted(g, id, counts));
    return ids.length === 1 ? ids : [];
  };
  /** 勝利の説明文 */
  W.winText = function winText(g, ids, nm) {
    return `誰にも能力を使われず、誰からも票を入れられなかった静観者 ${nm(ids)} の単独勝利です。`;
  };

  // ---- 結果発表の「静観者情報」・実績（4of4。マイクラ版 vote.js の静観者情報 / stats.js の watcher_*）----
  /**
   * 結果発表の「静観者情報」用: 最終盤面の静観者のうち、能力を使われた or 票を入れられた人だけ（マイクラ版と同じ。どちらもなければ出さない）。
   * [{ id, name, touchedIds, touched（名前）, votedIds, voted（名前）}]。席順。票は ONW.vote.effectiveVotes（ペンギンの滑り後）で見る（W.votedBy）。
   */
  W.view = function view(g, nm) {
    return W.holders(g).map((id) => {
      const touchedIds = W.touchedBy(g, id), votedIds = W.votedBy(g, id);
      return { id, name: nm(id), touchedIds, touched: touchedIds.map(nm), votedIds, voted: votedIds.map(nm) };
    }).filter((x) => x.touchedIds.length || x.votedIds.length);
  };
  /** 結果発表の「静観者情報」の行（マイクラ版と同じ文言。静観者ごとに 能力 → 投票 の順） */
  W.infoLines = function infoLines(v) {
    return (v || []).flatMap((x) => [
      ...(x.touched.length ? [`静観者 ${x.name} は ${x.touched.join("、")} に能力を使われていました。`] : []),
      ...(x.voted.length ? [`静観者 ${x.name} は ${x.voted.join("、")} に投票を入れられていました。`] : []),
    ]);
  };
  /** 追加勝利の役職（マイクラ版 stats.js hasAdditionalStyleWinner の一覧。Web版の役職IDに対応） */
  const EXTRA_STYLE = ["winner", "opportunist", "freeter", "servant", "martyr", "odd_one", "even_one", "jester_ghost", "lawyer", "cupid", "heartbreaker", "reverser", "avenger", "prankster"];
  /** 静観者 selfId のほかに、追加勝利の役職（か勝利を乗っ取られず追加された人）で勝った人がいるか。winners = 勝者のID（省略は g.winnerIds） */
  W.extraWinnerExists = function extraWinnerExists(g, selfId, winners) {
    const ws = winners || g.winnerIds || [];
    return (g.players || []).some((p) => p.id !== selfId && ws.includes(p.id)
      && (EXTRA_STYLE.some((k) => R()[k.toUpperCase()] && g.currentRoles && g.currentRoles[p.id] === R()[k.toUpperCase()]) || (g.winnerForced && g.winnerForced[p.id])));
  };
  /**
   * 実績（wiki に定義済みの7つ。マイクラ版 stats.js と同じ条件）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ）。
   *   ・first_watcher: 配られたカードが静観者（初めてかどうかは保存側が数える） / win_watcher: 最終役職が静観者で勝利
   *   ・以下は最終役職が静観者のとき: watcher_touched（能力を使われた）/ watcher_voted（票を入れられた）/ watcher_extra_winner_exists（追加勝利している人がいる）/
   *     watcher_center_of_attention（能力も票も、追加勝利している人もいる）/ watcher_god_loss（神の祝福が起きて勝てなかった）
   *   won = その人が勝ったか / winners = 勝者のID（省略は g.winnerIds）
   */
  W.achievements = function achievements(g, id, won, winners) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === R().WATCHER) out.push("first_watcher");
    if (cur !== R().WATCHER) return out;
    const touched = W.touchedBy(g, id).length > 0, voted = W.votedBy(g, id).length > 0 || W.voted(g, id), extra = W.extraWinnerExists(g, id, winners);
    if (won) out.push("win_watcher");
    if (touched) out.push("watcher_touched");
    if (voted) out.push("watcher_voted");
    if (extra) out.push("watcher_extra_winner_exists");
    if (touched && voted && extra) out.push("watcher_center_of_attention");
    if (g.godMode === "bless" && !won) out.push("watcher_god_loss");
    return out;
  };

  ONW.watcher = W;

  ONW.defineRole("watcher", {
    info: { deck: 101, name: "静観者", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.996,
      desc: "第三陣営。誰にも能力を使われず、誰からも票を入れられなければ単独勝利します。ただし、他に追加勝利の条件を満たしているプレイヤーがいる場合は敗北します。静観者の役職は交換やコピーされることはありません。交換されそうになったとき他のプレイヤーの役職と交換させます。" },
    groups: { "transform:silver_shadow": 29 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    // 夜の画面: 夜の行動がない静観者向けの説明
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>誰にも能力を使われず、誰からも票を入れられなければ、単独で勝利します。</p>`;
      },
    },
  });
})(window.ONW);
