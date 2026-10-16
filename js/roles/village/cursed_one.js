/**
 * 呪われし者（マイクラ版 CURSED_ONE を参考）: 村人陣営。
 *   ・本人は自分を「村人」だと思い込んでいる（ONW.SELF_AS_VILLAGER / ONW.shownRole。CPU も同じ自認で動く）。
 *   ・占い師・狂った占い師に占われると「呪われし者」と出る（seerSees を指定しない＝その役職のまま。狼憑き・狐憑きと違って別の役職には見えない）。
 *   ・吊られなければ村人陣営のまま。吊られる（追放される）と人狼陣営になる。
 *     結果発表では、カードが一度めくれたあと、シュレディンガーの猫のようにもう一度めくれて、名前が赤色（人狼陣営の色）になる。
 *
 * 【仕様（マイクラ版 scripts/vote.js の isCursedOneWolfTeamAtEnd どおり）】
 *   ・人狼陣営になる条件: 最終盤面で呪われし者を持っていて、追放された（独裁処刑も追放として扱う）人。
 *     ただし 呪殺・毒殺（死因 curse_kill / poison）で死んだ人と、封印されている人は人狼陣営にならない（村人陣営のまま）。
 *   ・人狼陣営になった呪われし者は、人狼陣営の勝利に勝者として入り、村人陣営の勝利には入らない。
 *   ・人狼判定（人狼がいるかどうか・占いの人狼結果）には数えない（マイクラ版は勝者の振り分けだけ）。
 *   ・模倣の人狼は模倣できない（NON_MIMICABLE に入っている・済）。
 *   ・勝利優先度の表に新しい行は作らない（村人陣営の通常勝敗の中で、陣営だけが入れ替わる）。詳細は docs/cursed-one.md。
 *
 * 【段階】onww-cursed-1of4 〜 4of4（Task Important Rules.txt のとおり、各段階を a〜j に分けて納品）
 *   1of4（登録）: このファイル・index.html の <script>・ロビー/ガイドの並び（js/ui.js / js/wikiview.js）・wiki/js/web-roles.js・ROLE_ORDER と wiki order の確認・ルールコード ONW57（js/settings.js）・docs/cursed-one.md
 *   2of4（勝敗の処理）: js/vote.js（吊られた呪われし者を人狼陣営の勝者に。呪殺・封印の例外）・結果の役職履歴・勝敗の説明
 *   3of4（演出）: 結果発表で「めくれる → もう一度めくれて赤い名前」・スキップ・clear・css
 *   4of4（周辺・総合）: CPU・debug・COボタン・プレイヤー一覧・観戦・実績・docs 履歴・端のケース
 * 実装の進み具合は docs/cursed-one.md を参照。
 */
(function (ONW) {
  const CUR = "cursed_one";
  // 結果発表: 吊られて（道連れで）めくれたあと、シュレディンガーの猫のように一度裏へ戻り、もう一度めくれて赤色の名前（人狼陣営の面 "cursed_one@wolf"）になる
  const CUR_UP2 = 1300, CUR_EXTRA = 2300;   // 1回目にめくれてから裏に戻るまで / 裏に戻ってからもう一度めくれるまで（猫と同じ長さ。0.75秒のフリップより長いので、ちゃんと裏返って見える）
  const curIds = (res) => new Set((res.cursed || []).map((c) => c.id));   // 吊られて人狼陣営になった呪われし者（net.js の結果オブジェクト res.cursed ← vote.cursedWolfIds）
  const curName = (res, id) => { const c = (res.cursed || []).find((x) => x.id === id); return c ? c.name : ""; };
  const CAP = (esc, name, line) => `<div class="res-cap__t t-wolf">呪われし者</div><div>${esc(name)} ${line}</div>`;
  /** めくれた呪われし者のカードを at の時刻に裏へ戻し、少しあとでもう一度めくる。noFlip: 演出が重なる（処刑人のギロチンなど）ので、裏返さずに最初から赤色で見せる */
  function curFlip2(R, id, at, noFlip) {
    const { later, setCap, esc, paint, G, P } = R, k = P(id), name = curName(R.res, id);
    if (noFlip) { R.curv[k] = true; return; }
    later(() => { setCap(CAP(esc, name, "のカードが…")); delete R.up[k]; paint(G()); }, at);
    later(() => { R.curv[k] = true; R.up[k] = CUR; setCap(CAP(esc, name, `の呪いが発動しました。<span class="t-wolf">人狼陣営</span>になりました`)); paint(G()); }, at + CUR_EXTRA - 600);
  }
  ONW.defineRole("cursed_one", {
    // 結果発表の演出(stage.js の startResult / skipResult が引く)。猫(schrodinger_cat.js)の2回目の裏返しと同じ要領
    //   flipped: 追放・道連れでめくれた呪われし者（人狼陣営になる人だけ。心中・後追い・噛殺などは res.cursed に入らない）/ skip: スキップ時は2回目の面（赤色）で見せる
    stageResult: {
      flipped: { order: 21, run(R, hs, at) {
        const ids = curIds(R.res), cs = hs.filter((h) => h.role === CUR && ids.has(h.id));
        cs.forEach((h) => curFlip2(R, h.id, at + CUR_UP2 + 200, R.noFlip.has(h.id)));   // ギロチンで割れるカードは裏返さない（最初から赤色）
        return cs.some((h) => !R.noFlip.has(h.id)) ? CUR_EXTRA : 0;
      } },
      skip(R) { (R.res.cursed || []).forEach((c) => { R.curv[`p:${c.id}`] = true; }); },   // 吊られて人狼陣営になった呪われし者は、2回目の面（赤色の名前）で見せる
    },
    info: { deck: 79, name: "呪われし者", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.99,
      desc: "村人陣営。自認はただの村人です。吊られなければ村人陣営のままですが、吊られると人狼陣営になります。占われると「呪われし者」と出ます。結果発表では、吊られてめくれたあとにもう一度めくれて、赤色の名前になります。" },
    groups: { selfAsVillager: 3, "transform:light_apostle": 29 },   // 自認は村人。光の使徒の変化先（村人系）。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
