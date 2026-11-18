/**
 * ギャンブラー（マイクラ版 GAMBLER を参考）: 村人陣営。夜の能力・昼の能力はない。
 *   ・投票するときの票数が、試合ごとに 0〜3 票のどれかになる。自分の票数は本人にも分からない（結果発表の「(N)」で初めて分かる）。
 *   ・抽選はマイクラ版 roles.js と同じ: 0票10% / 1票50% / 2票30% / 3票10%。【試合開始時に参加者全員ぶんを引く】（ギャンブラーでない人の分も引いておく）。
 *   ・【票数は役職ではなく「人」につく】g.gamblerWeights[人のID]。酔っ払い・墓荒らし・ドッペルゲンガー・怪盗などでギャンブラーのカードを持った人は、その人の票数になる。
 *     集計の時点（最終盤面）でギャンブラーを持っていて、酔いが覚めている人だけがその票数。ほかの役職になったら1票に戻る（メイヤーと同じ）。
 *   ・封印の狂人に封印されても票数は変わらない（マイクラ版 vote.js は封印を見ない）。
 *   ・盗賊（thief.js）は、この票数を元に盗む（0票の人からは盗めず失敗）。メイヤーと同じ仕組み（vote.weightOf → ONW.thief.adjust）。
 *
 * 状態: g.gamblerWeights = { 人のID: 0〜3 }（試合ごとに net.startGame が ONW.gambler.reset で引き直す）
 * 呼び出し: vote.js の vote.weightOf が ONW.gambler.of を呼ぶ。結果発表・PNG・観戦・盗賊・シュレ猫・観察者は weightOf を通るので、ここは1か所だけ。
 * 勝敗の優先度: 村人陣営のまま（docs/victory-priority.md への行の追加は不要）。重複役職の優先度も変わらない。
 * 並び: ROLE_ORDER に gambler は入っている（wiki order 40）。info.sealTarget = true（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている）。observe は付けない（夜の能力なし）。
 * 実装の進み具合は docs/gambler.md（1of4=役職本体 / 2of4=票数の抽選・集計 / 3of4=CPU・観戦・表示 / 4of4=経由パターン・確認・全体zip）。
 */
(function (ONW) {
  /** 票数の抽選（マイクラ版 roles.js と同じ。r は 0以上100未満の乱数。テストで差し替えられる） */
  const draw = (r) => { const x = r === undefined ? Math.random() * 100 : r; return x < 10 ? 0 : x < 60 ? 1 : x < 90 ? 2 : 3; };
  /** 試合開始時に、参加者全員ぶんの票数を引く（人につく。役職のカードが動いても変わらない） */
  function reset(g) {
    g.gamblerWeights = {};
    (g.players || []).forEach((p) => {
      const f = ONW.debug && ONW.debug.gamblerWeight ? ONW.debug.gamblerWeight(g, p.id) : undefined;   // デバッグの票数指定（0〜3）
      g.gamblerWeights[p.id] = Number.isFinite(f) ? f : draw();
    });
    return g.gamblerWeights;
  }
  /** この人の「ギャンブラーとしての票数」（0〜3）。まだ引いていない人はその場で引く（マイクラ版: 未設定なら0〜3の一様乱数） */
  function of(g, id) {
    g.gamblerWeights = g.gamblerWeights || {};
    if (!Number.isFinite(g.gamblerWeights[id])) g.gamblerWeights[id] = Math.floor(Math.random() * 4);
    return g.gamblerWeights[id];
  }
  /** 最終盤面でギャンブラーとして票数が決まる人か（酔いが覚めていること。呼び出し側が E / hiddenDrunk を渡す） */
  const active = (g, id) => !!g.currentRoles && ((ONW.mimic ? ONW.mimic.eff(g, id) : g.currentRoles[id]) === ONW.ROLE.GAMBLER) && !ONW.hiddenDrunk(g, id);

  ONW.gambler = { draw, reset, of, active };

  function cpuClaim(k, g, p, r, i, c) {   // ギャンブラー: 夜の結果はない。本当のギャンブラーはギャンブラーCO（70%）、残りは村人騙り（メイヤーと同じ作り）
    if (Math.random() < 0.7) c.co = "gambler";
    else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
  }

  ONW.defineRole("gambler", {
    cpuClaim,
    info: { sealTarget: true, deck: 104, name: "ギャンブラー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 15.8,
      desc: "村人陣営。夜の能力はありません。昼の投票の票数が、試合ごとに0〜3票のどれかになります。自分の票数は分かりません（結果発表で分かります）。" },
    groups: { "transform:light_apostle": 42 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 40）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
