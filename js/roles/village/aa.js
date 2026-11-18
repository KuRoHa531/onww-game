/**
 * A.A.（マイクラ版 AA を参考）: 村人陣営。夜の能力・昼の能力はない（パッシブ）。
 *   ・役職変化系の能力（怪盗・いたずらっ子・シャッフラー・グレムリン・ドッペルゲンガー・抹消の人狼・少佐など）の対象になっても、役職が変化しない。
 *   ・ただし鍵師にロックされている場合は、逆に役職変化が成功するようになる（ロックの効き方が反転する）。
 *   ・鍵師から見ると、A.A.に鍵をかけた1回目は「ロック解除」の文・演出（🔒→🔑→🔓）、2回目は「ロック」の文・演出（🔓→🔑→🔒）になる。
 *     （鍵そのものは他の人と同じく、1回目でロック状態・2回目で解除状態。見せ方だけが反転する。マイクラ版 keymasterEffectiveActionForTarget）
 *   ・封印の狂人に封印されている A.A. は、この力を失う（ふつうの役職として扱う）。酔いが覚めていない（hiddenDrunk）間も働かない。
 *   ・判定は「その時点の席の役職」（g.currentRoles）。墓荒らし・怪盗・シャッフラー・ドッペルゲンガーで A.A. を手にした人、酔いが覚めた酔っ払いも同じ。
 *
 * 実装の分担（docs/aa.md）:
 *   ・この役職ファイル: info と ONW.aa（is / holders / blocks）。
 *   ・ロックの反転・鍵師の演出の反転: js/roles/village/keymaster.js（ONW.keymaster.blocks / gate / toggle）。
 *   ・各変化役・抹消・少佐・静観者への反映: 各役職ファイル（2of4〜）。
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（役職は変化しないだけ）。重複役職: 特別扱いなし（docs/overlay-role-priority.md に変更なし）。
 * 並び: ROLE_ORDER に aa はすでに入っている（fairy の次・wiki order 43）。末尾追加は不要。
 */
(function (ONW) {
  /** この席が「いま働いている A.A.」か（その時点の役職が A.A.・酔いが覚めている・封印されていない） */
  const is = (g, id) => !!(g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.AA && !ONW.hiddenDrunk(g, id) && !(ONW.seal && ONW.seal.is(g, id)));
  /** いま働いている A.A. の席すべて */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => is(g, id));
  /** 変化系の能力がこの席の役職を変えられないか（A.A. はロックされていないと弾き、ロックされていると通す。それ以外はロックされていると弾く） */
  const blocks = (g, id) => {
    const lk = !!(ONW.keymaster && ONW.keymaster.locked && ONW.keymaster.locked(g, id));
    return is(g, id) ? !lk : lk;
  };
  /**
   * 実績（4of4。wiki の「A.A.」に定義済み。fairy の achievements と同じ形: 「この試合で id が満たした実績ID」を返すだけ。保存側ができたら呼ぶ）
   *   aa_win「錆鉄の魔女」 = 最終役職が A.A. で勝利 / aa_loss「全て錆びてしまうなら」 = 最終役職が A.A. で敗北 /
   *   aa_locked_win「錆鉄の空」 = 鍵師にロックされた A.A.（最終役職）で勝利。first_aa は初回判定（保存側）なのでここでは返さない。
   *   最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル経由で A.A. になった人も対象。模倣の人狼が模倣しているだけでは対象外）。封印されていても最終役職が A.A. なら対象。
   */
  function achievements(g, id, won) {
    const out = [];
    if (!g || !g.currentRoles || g.currentRoles[id] !== ONW.ROLE.AA) return out;
    out.push(won ? "aa_win" : "aa_loss");
    if (won && ONW.keymaster && ONW.keymaster.locked && ONW.keymaster.locked(g, id)) out.push("aa_locked_win");
    return out;
  }
  ONW.aa = { is, holders, blocks, achievements };

  function cpuClaim(k, g, p, r, i, c) {   // A.A.: 夜の結果はない。本当の A.A. は A.A.CO（70%）、残りは村人騙り
    if (Math.random() < 0.7) c.co = "aa";
    else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
  }

  ONW.defineRole("aa", {
    cpuClaim,
    achievements,
    info: { deck: 107, name: "A.A.", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 15.97,
      desc: "村人陣営。夜の能力はありません。役職変化系能力の対象になっても変化しません。ただし鍵師にロックされている場合は、逆に役職変化が成功するようになります。（鍵師から見ると、A.A.への1回目は「ロック解除」、2回目は「ロック」に見えます）" },
    groups: { "transform:light_apostle": 45 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 43）で決まる
  });
})(window.ONW);
