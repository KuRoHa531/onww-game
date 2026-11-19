/**
 * イカロス（村人陣営・昼能力）: 昼の議論中に「昼能力」ボタンから、生きている自分以外のプレイヤーへ「票を分け与える」。
 *   使うたびに別の1人を選ぶ（同じ人には1回だけ）。選んだ人の「投票数」が増える（その人が投票するときの重みが増える）。
 *   マイクラ版（minecraftver.mcpack の main.js / vote.js / game.js の「イカロス」ICARUS）に合わせる。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・夜の能力はない。使えるのは、最終盤面で イカロス を持っていて（酔っ払いは酔いが覚めてから）、生きていて、
 *     まだ票を分け与えていない相手が残っていて、昼のタイマーが動いているとき。封印の狂人に封印されていると使えない。
 *   ・1回の使用で選べるのは「生きている自分以外の1人」。同じ人には1回だけ（カルメンに囁かれた人は各プレイヤーに2回ずつ。ONW.carmen.dayUses）。
 *     全員（生きている自分以外）に分け与えたら、その日はもう使えない。途中でやめて、あとで続きを使ってもよい（昼のうちなら何人でも）。
 *   ・追加される票数（使った瞬間の相手で決まる。あとで相手の状態が変わっても増えた票数は変わらない）:
 *       村人陣営の役職で、(+恋人)・(+シャッフラー)・(+反転) が付いていない人 → +1票
 *       それ以外（人狼陣営・第三陣営・恋人・シャッフラーの印・反転がついた人）          → +2票
 *   ・増えた票数は、その人の vote.weightOf（投票するときの重み）に足される。盗賊に盗まれる前（thief.adjust のあと）に足す
 *     （マイクラ版 vote.js: 盗賊の増減を反映したあとで icarusVoteBonus を足す）。メイヤー・ギャンブラーなどの票数にも足される。
 *   ・対象や票数は誰にも公開されない（イカロス本人にも、増えた票数は出さない＝相手の陣営が透けないように）。
 *     使ったことは「全員の画面に太陽へ翼が飛び上がる演出」で知らされる（誰が・誰に使ったかは分からない。マイクラ版: 「イカロスが誰かに投票を分け与えたようです。」）。
 *   ・【票は「人」につく】記録は「だれが（by）だれに（target）いくつ（bonus）」で残り、増える票数は投票者（target）の重みに足される。
 *     分け与えたあとにイカロスが死亡しても取り消さない（マイクラ版と同じ）。分け与えた人の役職が動いても（怪盗など）、票は「人」についたまま。
 *   ・【経由パターン】判定は「最終盤面」の役職で行う: 墓荒らし・怪盗でイカロスのカードを手にした人、ドッペルゲンガーがイカロスをコピーした人（イカロスが2人になる。
 *     それぞれが自分の分の「同じ人には1回だけ」を持つ）、酔いが覚めた酔っ払い（酔い中は使えない）が使える。模倣の人狼が模倣していても使える（ONW.mimic.actRole）。
 *     集計・演出は g.icarusGrants の記録だけを見るので、どの経由でイカロスになった人でも同じように動く。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（投票の重みが変わるだけ。追放者が変わる経路は通常の追放と同じ）。重複役職: 特別扱いなし（docs/overlay-role-priority.md）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に icarus はすでに入っている（steve の次）。wiki の order も 46 で一致。末尾追加は不要。
 * CPU・COボタン・実績（4of4）は下の「CPU・COボタン・実績」の節（cpuClaim / cpuSpeak / coResult / achievements）。実装の進み具合は docs/icarus.md を参照。
 *
 * 状態: g.icarusGrants = [{ by: イカロスのID, target: 票を分け与えた相手のID, bonus: 増えた票数(1 or 2) }, ...]（使った順。試合ごとに net.startGame が [] に戻す）
 * 呼び出し: net.js の hostIcarus(ホスト) → ONW.icarus.canUse / targets / apply。票への反映は vote.js の vote.weightOf が ONW.icarus.bonusOf を呼ぶ。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const grantsOf = (g) => g.icarusGrants || [];

  /** この人（by）が票を分け与えた記録（使った順） */
  const usesOf = (g, id) => grantsOf(g).filter((e) => e.by === id);
  /** 同じ人に使える回数: ふつう1回。村人陣営としてカルメンに囁かれた人は各プレイヤーに2回ずつ（マイクラ版 maxPerTarget = carmenVillageWhisperedTargets ? 2 : 1。ONW.carmen.dayUses と同じ数え方） */
  const maxPer = (g, id) => (ONW.carmen && ONW.carmen.dayUses ? ONW.carmen.dayUses(g, id) : 1);
  /** この人（by）が、その相手（target）に票を分け与えた回数 */
  const countOf = (g, id, target) => usesOf(g, id).filter((e) => e.target === target).length;
  /** 票を分け与える相手として選べる人（生きている自分以外で、この人が使った回数が maxPer 未満の人） */
  function targets(g, id) {
    const max = maxPer(g, id), cnt = {};
    usesOf(g, id).forEach((e) => { cnt[e.target] = (cnt[e.target] || 0) + 1; });
    return (g.players || []).map((p) => p.id).filter((x) => x !== id && !isDead(g, x) && (cnt[x] || 0) < max);
  }
  /** イカロスの昼能力を使える人か（最終盤面の役職がイカロス・酔いが覚めている・生きている・選べる相手が残っている・昼の議論中でタイマーが動いている） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R().ICARUS) return false;   // 模倣の人狼がイカロスを模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || isDead(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** この人が（生きている自分以外の）全員に分け与え終えたか（もう押しても何も起きない） */
  const finished = (g, id) => targets(g, id).length === 0;

  /**
   * 相手に追加される票数（マイクラ版 main.js: isPlainVillage ? 1 : 2）。使った瞬間の状態で決める。
   *   村人陣営の役職で、(+恋人)・(+シャッフラー)・(+反転) がどれも付いていない人 → 1 / それ以外 → 2
   */
  function bonusFor(g, target) {
    const role = g.currentRoles && g.currentRoles[target], info = (ONW.ROLE_INFO || {})[role];
    const village = !!info && info.team === ONW.TEAM.VILLAGE;
    const lover = ONW.loverMates ? ONW.loverMates(g, target).length > 0 : false;
    const shuffler = ONW.shuffler && ONW.shuffler.tagged ? !!ONW.shuffler.tagged(g, target) : false;
    const reversed = ONW.reverser && ONW.reverser.count ? ONW.reverser.count(g, target) > 0 : false;
    return village && !lover && !shuffler && !reversed ? 1 : 2;
  }
  /**
   * 票の分け与えを記録する（通信・画面の処理は net.js 側）。
   * 戻り値: 記録した { by, target, bonus }。条件を満たさなければ null（何も起きない）
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const e = { by: id, target, bonus: bonusFor(g, target) };
    (g.icarusGrants = g.icarusGrants || []).push(e);
    return e;
  }
  /** vote.weightOf から呼ばれる: この人（投票者）に分け与えられた票数の合計（なければ 0） */
  function bonusOf(g, voterId) {
    return grantsOf(g).reduce((a, e) => (e.target === voterId ? a + (Number(e.bonus) || 0) : a), 0);
  }

  /** 使った本人に出す文（情報確認）。マイクラ版は本人に何も出さないが、Web版は「情報確認にイカロスの情報が載る」仕様（依頼）。増えた票数は書かない（相手の陣営が透けないように） */
  function doneText(name, n) { return Number(n) > 1 ? `${name} に票を分け与えました。（${Number(n)}回目）` : `${name} に票を分け与えました。`; }   // n = 同じ相手への何回目か（カルメンに囁かれて2回目を使ったときだけ「（2回目）」を付けて、情報確認で同じ文が1行にまとまらないようにする）
  /** 結果発表の「昼行動結果」用。「イカロス A は 人狼 B に2票分け与えました。」（role = 分け与えた時点の相手の役職・bonus = 増えた票数 1 or 2。どちらも試合のあとに見る結果発表だけに出る）。role / bonus が無いときは従来の文 */
  function actText(rn, by, target, role, bonus) {
    if (!role && !bonus) return `${rn("icarus")} ${by} は ${target} に票を分け与えていました。`;
    return `${rn("icarus")} ${by} は ${role ? rn(role) + " " : ""}${target} に${bonus ? bonus + "票" : "票を"}分け与えました。`;
  }
  /** 全員に流す通知文（演出の字幕・チャット。マイクラ版 main.js の昼通知と同じ文。だれが・だれにかは出さない） */
  const NOTICE = "イカロスが誰かに投票を分け与えたようです。";
  /** 情報確認に載せる全員向けの通知（演出の字幕と同じ文）。n = その試合で何回目の使用か（2回目以降は「（2回目）」を付けて、同じ文でも別の行にする）。だれが・だれにかは出さない */
  function noticeText(n) { return Number(n) > 1 ? `${NOTICE}（${Number(n)}回目）` : NOTICE; }

  ONW.icarus = { usesOf, maxPer, countOf, targets, canUse, finished, bonusFor, apply, bonusOf, doneText, actText, NOTICE, noticeText };

  // ======================================================================
  // 【CPU・COボタン・実績（4of4）】マイクラ版 cpu.js / main.js / stats.js のイカロスに合わせる。
  //   ・本物のイカロスCPUは、昼に必ず「イカロスCO」（cpuClaim）。結果は言わない（票は結果発表まで誰にも確かめられない）。
  //   ・騙りはしない（cpuLie なし）: マイクラ版は昼能力の役職を騙りの候補から外している（cpu.js の dayRoles にイカロスが入っている）。
  //   ・CPUは昼能力を勝手に使わない（ONW.CPU_AUTO_DAY。固定していない CPU がイカロスを引いたら、roles.js avoidCpuDictator が人間と入れ替える）。
  //     デバッグの「昼能力」タブで使わせたときだけ、net.js hostIcarus が cpuSpeak を呼び、「〇〇 に票を分け与えていました。」と言う（マイクラ版 cpu.js と同じ文）。
  //   ・CPUの投票判断（cpuVoteSee）は足さない: 票を分け与えた申告は、結果発表まで真偽が分からない（相手の票数も見えない）ため、加点の根拠がない。
  //   ・使った数ぶんだけ cpuSpeak が呼ばれる（1回の使用ごとに1人ぶん）。増えた票数は言わない（相手の陣営が透けないように）。
  // ======================================================================
  const giveText = (name) => `${name} に票を分け与えていました。`;
  const giveShort = (name) => `${name} に票を分け与えた`;
  /** 票を分け与えたあとのCPUの発言（net.js hostIcarus が、使ったのがCPUで生きているときに呼ぶ）。[{ p, text, short, result, claim, gap }] */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: giveText(nm), short: giveShort(nm), result: true, claim: { kind: "icarus", target: e.target }, gap: 3500 }];
  }
  /** COボタンの結果開示の文。マイクラ版 main.js: 「〇〇に票を分け与えていました。」（Web版は名前のあとに空白を入れる）。複数人に使ったときは、1人ずつ結果開示を押す */
  const coText = giveText;
  /**
   * 実績（マイクラ版 stats.js と同じ条件。wiki の「イカロス」に定義済みの5つのうち、この試合の結果だけで決まる4つ）:
   *   win_icarus「自由な飛翔」 = 最終役職がイカロスで勝利 / lose_icarus「バラバラの羽」 = 最終役職がイカロスで敗北 /
   *   icarus_give_village「希望の翼」 = 票を分け与えた記録に +1（村人陣営扱い）がある / icarus_give_outsider「太陽に近づきすぎた」 = 記録に +2（人外扱い）がある。
   *   give の2つはマイクラ版と同じく「分け与えた人」の記録で判定する（最終役職は見ない。分け与えたあとに別の役職になっても、使ったことは残る）。
   *   first_icarus「太陽へ翔ぶ者」は「いままでにイカロスになった」履歴の判定（保存側）なのでここでは返さない（御乱心の first_goranshin と同じ）。
   *   Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（妖精さん・御乱心の achievements と同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], cur = g.currentRoles && g.currentRoles[id];
    if (cur === R().ICARUS) out.push(won ? "win_icarus" : "lose_icarus");   // 最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル経由でイカロスになった人も対象。模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    const uses = usesOf(g, id);
    if (uses.some((e) => e.bonus === 1)) out.push("icarus_give_village");
    if (uses.some((e) => e.bonus === 2)) out.push("icarus_give_outsider");
    return out;
  }
  Object.assign(ONW.icarus, { giveText, giveShort, cpuSpeak, coText, achievements });

  ONW.defineRole("icarus", {
    info: { sealTarget: true, deck: 110, name: "イカロス", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.7,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている自分以外のプレイヤーを1人ずつ選んで、票を分け与えます（同じ人には1回だけ。何人にでも使えます。カルメンに囁かれた人は各プレイヤーに2回ずつ使えます）。選ばれた人の投票数が増えます: 村人陣営の人には1票、人狼陣営・第三陣営・恋人・シャッフラー・反転状態の人には2票を追加します。対象や票数は誰にも公開されませんが、使うと全員の画面に太陽へ翼が飛び上がる演出が出ます（だれが・だれに使ったかは分かりません）。使えるのは最終的にイカロスを持っている人で、酔っ払いは酔いが覚めてからです。" },
    // CPU（4of4）: 本物は必ず「イカロスCO」（結果なし）。騙りはしない。票を分け与えたCPUの発言は cpuSpeak
    cpuClaim(k, g, p, r, i, c) { c.co = "icarus"; },
    cpuSpeak,
    // 結果開示(COボタン・co.js が kind で引く): 「イカロスCO」だけで終わらせられる(noChain)。結果開示で票を分け与えた相手を選ぶ → 「〇〇 に票を分け与えていました。」（妖精さんと同じ形。複数人なら1人ずつ）
    coResult: {
      kind: "icarus", targetLabel: "票を分け与えた相手", noChain: true,
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "icarus", target: id }, null, "disclose", giveShort(K.nameOf(id))],
    },
    groups: { "transform:light_apostle": 48 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 46）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
