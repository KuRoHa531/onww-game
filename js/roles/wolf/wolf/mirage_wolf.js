/**
 * 蜃気狼（マイクラ版 MIRAGE_WOLF を参考）: 人狼陣営の「人狼系」。白狼と同じ作りで、占われたときの見え方だけが「村人」ではなく「ランダムな役職」になる。
 *   夜は人狼と同じく仲間の人狼が分かり、人狼判定・勝利条件・追放・保安官の判定なども人狼と同じ（白狼のように村人扱いにはならない。マイクラ版と同じ）。
 *   占い師・狂った占い師（占い師と同じ処理）・心眼の人狼からは「盤面にあり得るランダムな役職」に見える。自分が何に見えるかは本人にも分からない。
 *   墓地にあっても発動する（墓地の蜃気狼を占っても、ランダムな役職に見える）。模倣の人狼が蜃気狼を模倣しているときも同じ。
 *
 * ランダムの出し方（マイクラ版と同じ）:
 *   ・占い（占い師・狂った占い師）: 配役直後の全プレイヤー＋墓地の役職から、1枚ぶんを等確率で引く（重複した役職は出やすい）。
 *     占い師が盤面に1枚しかないときだけ、占い師は出ない（占い師の結果に「占い師」と出ると占い師本人が分かってしまうため。2枚以上あるときは出る）。
 *     墓地を複数枚占っても、蜃気狼の枚ごとに別々に引く。同じ1回の占いの中で結果が変わらないよう、1回の占いにつき1回だけ引く（seer.js）。
 *   ・心眼の人狼（昼・最終役職を見抜く）: 配役直後・最終盤面・墓地に出てくる役職の種類から等確率で1つ引く。光の使徒・闇の化身・銀色の影は出ない（マイクラ版 randomMirageVisibleRole）。
 *   ・「占い師・指読み・心眼の人狼・感覚の占い師・偽占い師」のうち、Web版にあるのは 占い師・狂った占い師・心眼の人狼。偽占い師は Web版に無いので「必ず蜃気狼に見える」は未対応。
 *
 * 実装の場所:
 *   ・占われ方の差し替え: ONW.mimic.seerSeen（mimic_wolf.js）が ONW.mirage.isMirageCard で判定 → ONW.mirage.seerRole で引く
 *   ・心眼の人狼: mind_wolf.js の apply が ONW.mirage.dayRole で引く
 *   ・勝敗の優先度: 人狼系は基本勝敗のまま（docs/victory-priority.md の表に新しい行は不要）
 *
 * 実績（wiki に定義済みの5種）: ONW.mirage.achievements が返す（Web版にはまだ実績を保存する仕組みが無いので、「この試合で満たした実績ID」を返すだけ）。
 *   mirage_wolf_inspected = 蜃気狼で占い師/狂った占い師/心眼の人狼に確認された（g.mirageInspections[蜃気狼の人のID] に記録）。mirage_wolf_fake_seer（偽占い師）は Web版に偽占い師が無いので出ない。
 */
(function (ONW) {
  const K = ONW.wolfKit;
  const R_ = () => ONW.ROLE;
  /** 心眼の人狼に見えない役職（マイクラ版 randomMirageVisibleRole の blocked。お嬢様は Web版に無い） */
  const DAY_BLOCKED = new Set(["light_apostle", "dark_avatar", "silver_shadow", "daughter"]);

  /** そのカード（role）が、占い・見抜きでランダムに見える蜃気狼か。key = 席キー（プレイヤーID / "g:墓地番号"）。模倣の人狼が蜃気狼を模倣しているときも true */
  function isMirageCard(g, role, key) {
    if (role === R_().MIRAGE_WOLF) return true;
    return role === R_().MIMIC_WOLF && !!(g && g.mimicRole && g.mimicRole[key] === R_().MIRAGE_WOLF);
  }
  /** 占いで見える「ランダムな役職」（1回の占いにつき1回だけ呼ぶ）。盤面（配役直後の全プレイヤー＋墓地）から1枚ぶんを等確率で引く。占い師が1枚だけのときは占い師を除く */
  function seerRole(g) {
    const all = [...Object.values((g && g.initialRoles) || {}), ...(((g && (g.center0 || g.center)) || []))].filter(Boolean);
    const seers = all.filter((r) => r === R_().SEER).length;
    const pool = all.filter((r) => r !== R_().SEER || seers >= 2);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : R_().VILLAGER;
  }
  /** 心眼の人狼に見える「ランダムな役職」。配役直後・最終盤面・墓地に出てくる役職の種類（光の使徒・闇の化身・銀色の影を除く）から等確率で1つ引く */
  function dayRole(g) {
    const kinds = [...new Set([...Object.values((g && g.initialRoles) || {}), ...((g && g.center0) || []), ...((g && g.center) || []), ...Object.values((g && g.currentRoles) || {})]
      .filter((r) => r && !DAY_BLOCKED.has(r)))];
    return kinds.length ? kinds[Math.floor(Math.random() * kinds.length)] : R_().VILLAGER;
  }
  /** 「蜃気狼に確認された」記録（実績 mirage_wolf_inspected 用）。key がプレイヤーのときだけ（墓地は記録しない）。kind: "seer" | "mind_wolf" */
  function noteInspect(g, key, kind) {
    if (!g || typeof key !== "string" || key.startsWith("g:")) return;
    g.mirageInspections = g.mirageInspections || {};
    const a = (g.mirageInspections[key] = g.mirageInspections[key] || []);
    if (!a.includes(kind)) a.push(kind);
  }
  /** 実績（wiki の「蜃気狼」に定義済みの lose_mirage_wolf / mirage_wolf_inspected / first_mirage_wolf / win_mirage_wolf）。won: その人が勝ったか */
  function achievements(g, id, won) {
    const out = [], M = R_().MIRAGE_WOLF, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === M) out.push("first_mirage_wolf");   // 初めて蜃気狼になる（初回かどうかは保存側が数える）
    if (cur === M && won) out.push("win_mirage_wolf");
    if (cur === M && !won) out.push("lose_mirage_wolf");   // 蜃気狼で初めて敗北する（初回かどうかは保存側が数える）
    if (((g.mirageInspections || {})[id] || []).length && (ini === M || cur === M)) out.push("mirage_wolf_inspected");
    return out.filter((x, k) => out.indexOf(x) === k);
  }
  ONW.mirage = { isMirageCard, seerRole, dayRole, noteInspect, achievements, DAY_BLOCKED };

  ONW.defineRole("mirage_wolf", {
    info: { deck: 71, name: "蜃気狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.59,
      desc: "人狼陣営。占い師・狂った占い師・心眼の人狼からは、盤面にあり得るランダムな役職に見えます。自分が何に見えるかは分かりません。墓地でも発動します。相方や狂信者からは人狼として見えます。" },
    // 占われたときの見え方は固定の役職ではなくランダム（ONW.mimic.seerSeen が ONW.mirage を見て差し替える）。seerSees は書かない（書くと本当の役職＝蜃気狼が見えてしまう）
    groups: { wolf: 8.9, "transform:dark_avatar": 9.4 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek });
})(window.ONW);
