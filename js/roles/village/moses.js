/**
 * モーゼス（村人陣営・パッシブ）: 元々の投票数は0票。夜の能力・昼の能力を「使われる」たびに、投票数が1票ずつ増える。
 *   マイクラ版（minecraftver.mcpack の night.js markWatcherTouchedByAbility / main.js markWatcherTouchedByDayAbility / vote.js・game.js の MOSES）に合わせる。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・夜の能力・昼の能力はない（ボタンも要らない）。自分は何もしなくてよい。
 *   ・投票数 = 「モーゼスのカードに能力を使われた回数」。0回のモーゼスは0票（結果発表では「(無効)」）、1回なら1票、3回なら3票…。上限はない。
 *     数えるのは「選ばれた」ときだけ（自分が使った能力は数えない）。鍵師のロックなどで不発になった能力は数えない（静観者の「能力を使われた」と同じ。docs/watcher.md）。
 *   ・封印の狂人に封印されているモーゼスは1票（マイクラ版 vote.js: isSealedPlayerId ? 1）。封印中も使われた回数は貯まるが、封印されている間は貯まった票数ではなく1票として数える。
 *   ・酔いが覚めていない酔っ払い(+酔っ払い)のモーゼスは1票（Web版の共通の扱い: 新聞配達員・メイヤー・ギャンブラーと同じ。docs/drunk-order.md）。使われた回数は酔い中も貯まり、酔いが覚めると貯まった票数になる。
 *   ・【票数は「役職（カード）」に付属する】（マイクラ版「票数はモーゼスの役職に付属します」）。票数は g.mosesBonus = { 持ち主ID: 使われた回数 } に持ち、
 *     ONW.ROLE_BOUND_KEYS に入れてあるので、怪盗・いたずらっ子・墓荒らしでカードが動くと票数もついていく（墓地に入ったカードの票数は墓地に残り、次に引いた人へ）。
 *   ・墓荒らしが墓地からモーゼスを引いたときは、引いた人の票数は必ず1票になる（マイクラ版 night.js: centerRole === MOSES → mosesVoteBonus[id] = 1。墓地に貯まっていた票数は引き継がない）。
 *   ・ドッペルゲンガー・グレムリンがモーゼスをコピーしたときは、コピー元の票数をそのままコピーする（マイクラ版 transferRoleBoundSpecialData の copy。コピー元は減らない）。
 *   ・モーゼスの役職が別の役職に書き換わったら（シャッフラー・ドッペル・グレムリンのコピー・抹消・少佐の村人化）、票数は消える。新しくモーゼスが置かれたカードは0票から。
 *   ・使われたのが「誰のカードか」で数える。怪盗・いたずらっ子に選ばれたら、入れ替わる「前」のカードに1票つき、そのカードごと動く（マイクラ版は入れ替えの前に数える）。
 *     ドッペルゲンガー・グレムリンにコピー元として選ばれたら、コピー元に1票ついてからコピーされる（コピー先にもその1票が入る）。
 *   ・模倣の人狼がモーゼスを模倣しているときは、モーゼスとして数える（マイクラ版 roleForMimicEffect）。
 *   ・【経由パターン】判定は「最終盤面」の役職で行う: 墓荒らし・怪盗でモーゼスのカードを手にした人、ドッペルゲンガー・グレムリンがコピーした人（モーゼスが2人になり、それぞれ自分のカードの票数を持つ）、
 *     酔いが覚めた酔っ払いが対象。集計は vote.weightOf が g.mosesBonus を見るだけなので、どの経由でも同じように動く。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（投票の重みが変わるだけ。追放者が変わる経路は通常の追放と同じ）。重複役職: 特別扱いなし（docs/overlay-role-priority.md）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に moses はすでに入っている（election_manager の次）。wiki の order も 48 で一致。末尾追加は不要。
 * 封印の対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っているので info.sealTarget: true（docs/seal-target.md）。夜の能力はないので info.observe は付けない。
 * 闇鍋シナジー: モーゼスが出る闇鍋には「能力を使われる（選ばれる）役職」を最低4枚（マイクラ版 YAMINABE_MOSES_TOUCH_ROLES = 封印の対象からモーゼス自身を除いたもの）。js/roles.js の SYNERGY_COUNT_RULES（docs/moses.md）。
 *
 * 状態（試合ごとに net.startGame が初期化。ホスト引き継ぎ AUTH_KEYS / HOST_ONLY_KEYS に追加済み）:
 *   g.mosesBonus = { 持ち主ID: 使われた回数 }   ONW.ROLE_BOUND_KEYS 入り（カードについて動く）
 *   g.mosesTok   = [ "能力を使った人|選んだ席", … ]   入れ替え・コピーの「前」に数えた分の目印（あとの静観者/モーゼス共通の記録で二重に数えないため。呼び出しの直後に消える）
 * 呼び出し: ONW.watcher.touch（夜・朝のうち・昼の能力の「能力を使われた」の共通の入口）が ONW.moses.touch を呼ぶ。役職を動かす・書き換える能力は、動かす前に ONW.moses.before を呼ぶ。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const M = {};

  /** この席がいま「モーゼス」か（模倣の人狼がモーゼスを模倣していても可。最終盤面でなく、その時点の役職で見る） */
  M.is = function is(g, id) {
    if (!g || !id || !g.currentRoles) return false;
    return (ONW.mimic ? ONW.mimic.eff(g, id) : g.currentRoles[id]) === R().MOSES;
  };
  /** この席（カード）に貯まっている「使われた回数」（なければ0） */
  M.bonusOf = (g, id) => Math.max(0, Number(((g && g.mosesBonus) || {})[id]) || 0);
  /** 3票以上になっているか（実績 moses_three_votes 用） */
  M.threeOrMore = (g, id) => M.bonusOf(g, id) >= 3;
  /** 投票するときの「元の票数」（盗賊の増減・イカロスの分を足す前）。封印されている・酔いが覚めていないと1票、それ以外は使われた回数 */
  M.weight = function weight(g, id) {
    if (ONW.hiddenDrunk(g, id)) return 1;
    if (ONW.seal && ONW.seal.is(g, id)) return 1;
    return M.bonusOf(g, id);
  };
  /** 最終盤面でモーゼスを持っている人のID（席順。生死・酔い・封印は問わない） */
  M.holders = (g) => (g.players || []).map((p) => p.id).filter((id) => M.is(g, id));

  const bump = (g, id) => { (g.mosesBonus = g.mosesBonus || {})[id] = M.bonusOf(g, id) + 1; };

  /**
   * 能力を使われた（夜・朝のうち・昼）: 選ばれた席が、いまモーゼスなら 使われた回数 +1。
   * 1回の能力で同じ席を2回選んでも1回だけ数える（マイクラ版 uniqueTargets）。before で先に数えた分は、ここでは数えない（消費する）。
   * ONW.watcher.touch から呼ばれる。actor = 能力を使った人のID / targets = 選んだ席のID。
   */
  M.touch = function touch(g, actor, targets) {
    if (!g || !actor) return;
    const tok = g.mosesTok || [];
    [...new Set(targets || [])].filter(Boolean).forEach((t) => {
      const k = actor + "|" + t, at = tok.indexOf(k);
      if (at >= 0) { tok.splice(at, 1); return; }   // 動かす前に数え済み
      if (M.is(g, t)) bump(g, t);
    });
  };
  /**
   * 役職を動かす・書き換える能力（怪盗・いたずらっ子・ドッペルゲンガー・グレムリン・シャッフラー）が、動かす「前」に呼ぶ。
   * その時点でモーゼスの席に +1 し、目印を残す（動かしたあとの touch で二重に数えない）。targets = 実際に動かす席（数える席）、seen = あとの touch に渡る席（省略なら targets）。呼んだら、同じ能力の中で必ず touch が続く。
   */
  M.before = function before(g, actor, targets, seen) {
    if (!g || !actor) return;
    [...new Set(targets || [])].filter(Boolean).forEach((t) => { if (M.is(g, t)) bump(g, t); });   // targets = 実際に動かす・コピー元にする席（静観者にずれたときは、選んだ席ではなくずれた先）
    [...new Set(seen || targets || [])].filter(Boolean).forEach((t) => (g.mosesTok = g.mosesTok || []).push(actor + "|" + t));   // seen = あとの touch に渡される席（選んだ席）。動かしたあとに数え直さない目印
  };
  /** 墓荒らしが墓地からモーゼスを引いたとき（swapGrave のあと）: 引いた人の票数は必ず1票（マイクラ版）。 */
  M.drewFromGrave = function drewFromGrave(g, id) {
    if (!g || !M.is(g, id)) return;
    (g.mosesBonus = g.mosesBonus || {})[id] = 1;
  };

  /** 結果発表の「モーゼス情報」用: 最終盤面でモーゼスを持っている人 → 使われた回数と最終的な票数（盗賊・イカロスの分も入った実際の票数）。 */
  M.view = function view(g) {
    return M.holders(g).map((id) => ({ id, touched: M.bonusOf(g, id), votes: ONW.vote.weightOf(g, id) }));
  };

  /**
   * 実績（4of4。wiki の「モーゼス」に定義済み。aa / fairy の achievements と同じ形: 「この試合で id が満たした実績ID」を返すだけ。保存側ができたら呼ぶ。マイクラ版 stats.js）
   *   moses_win「回避成功」 = 最終役職がモーゼスで勝利 / moses_loss「回避失敗」 = 最終役職がモーゼスで敗北 /
   *   moses_three_votes「狂いのない世界」 = 最終役職がモーゼスで、使われた回数が3以上（マイクラ版 mosesVoteBonus >= 3。封印中・酔い中の票数(1票)ではなく、貯まった回数で見る）。first_moses は初回判定（保存側）なのでここでは返さない。
   *   最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル・グレムリン経由でモーゼスになった人も対象）。模倣の人狼がモーゼスを模倣しているだけでは対象外（最終役職は模倣の人狼）。
   */
  M.achievements = function achievements(g, id, won) {
    const out = [];
    if (!g || !g.currentRoles || g.currentRoles[id] !== R().MOSES) return out;
    out.push(won ? "moses_win" : "moses_loss");
    if (M.threeOrMore(g, id)) out.push("moses_three_votes");
    return out;
  };
  /** 役職別の統計（マイクラ版 stats.js の「能力を使われた回数」「3票以上になった回数」）。最終役職がモーゼスの人だけ。 */
  M.stats = function stats(g, id) {
    if (!g || !g.currentRoles || g.currentRoles[id] !== R().MOSES) return {};
    const n = M.bonusOf(g, id), o = {};
    if (n > 0) o["能力を使われた回数"] = n;
    if (n >= 3) o["3票以上になった回数"] = 1;
    return o;
  };

  ONW.moses = M;

  ONW.defineRole("moses", {
    info: { sealTarget: true, deck: 112, name: "モーゼス", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.9,
      desc: "村人陣営。夜と昼の能力はありません。元々の投票数は0票で、夜の能力や昼の能力を使われる（選ばれる）たびに、投票数が1票ずつ増えます。票数はモーゼスの役職（カード）に付属するので、役職が入れ替わると票数もついていきます。封印されている間と、酔いが覚めていない酔っ払いは1票です。" },
    groups: { "transform:light_apostle": 50 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 48）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
