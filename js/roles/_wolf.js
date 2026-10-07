/**
 * roles/_wolf.js  ── 人狼系(人狼・大狼・白狼・豆腐の人狼・アサシン・一匹狼・忘却の人狼)で共有する夜の処理
 * 役職ではなく共有部品。各人狼ファイルが ONW.wolfKit から必要なものを取って defineRole に渡す。
 */
window.ONW = window.ONW || {};

(function (ONW) {
  const wolfNames = (g, self) => g.players.filter((q) => q.id !== self && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.name);

  ONW.wolfKit = {
    /** 夜の始まり: 仲間の人狼を知る(人狼・大狼・白狼・豆腐の人狼・アサシン) */
    nightMsg(c, p, r) {
      const g = c.g;
      let text = "", text2 = "", bigGraves = null, cultWolves = null;
      const mates = wolfNames(g, p.id);
      text = mates.length ? `仲間の人狼: ${mates.join("、")}` : "仲間の人狼はいません。";
      const mateIds = g.players.filter((q) => q.id !== p.id && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.id);
      if (r === "white_wolf") text2 = "あなたは占い師に占われると村人と出ます。";
      if (r === "assassin") text2 = "あなたが追放されたら、自分以外の全員から1人を選びます。選んだ相手がマーリンなら、人狼陣営の逆転勝利です。";
      if (r === "tofu_wolf") text2 = "あなたは1票でも入ると、つられる人と一緒にめくられてメンタル崩壊します。ただし麻婆の人狼がいる間は、1票ではメンタル崩壊せず、2票持ちになります。";
      if (r === "mapo_wolf") text2 = "あなたがいる間、豆腐の人狼は1票ではメンタル崩壊せず、2票持ちになります。豆腐の人狼もいると、昼の始まりに麻婆豆腐が完成します。";
      if (r === "observer_wolf") text2 = "朝のあとの待機時間に、昨夜だれが誰（どの墓地）に能力を使っていたかが分かります（能力を使った役職は分かりません）。昼の情報確認からも見返せます。";
      if (mateIds.length) cultWolves = mateIds;   // 夜の始まりに、仲間の人狼のカードが表になって🐺が出る（狂信者と同じ演出）
      if (r === "big_wolf") {   // 大狼: 墓地カードをすべて確認（配役直後の墓地）
        bigGraves = g.center0.slice();
        text2 = `墓地: ${bigGraves.map((cr, i) => `${i + 1}枚目「${c.rn(cr)}」`).join(" ")}`;
      }
      return { text, text2, bigGraves, cultWolves };
    },
    /** 墓荒らし・ドッペルで人狼系を手にしたとき(一匹狼も同じ関数。忘却の人狼は何も見えないので使わない) */
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g, hold = c.hold, rn = c.rn;
      const ids = got === "lone_wolf" ? [] : t.wolfIds(p.id);
      hold(p.id, ids.length ? `仲間の人狼: ${t.names(ids)}` : "仲間の人狼はいません。");
      if (got === "lone_wolf") {
        // 一匹狼は従来どおり（誰も見えない）
      } else {
        // 人狼系: 朝に自分の人狼（と墓荒らしなら墓地の墓荒らし）が同時に表になり、初期役職の別の人狼に🐺が出る。大狼はさらに他の墓地の初期役職が見える
        const peek = ids.map((id) => ({ k: `p:${id}`, role: "__wolf" }));
        if (got === "big_wolf") {
          const graves = t.seeGraves(t.i);
          hold(p.id, `墓地: ${graves.map(([j, cr]) => `${j + 1}枚目「${rn(cr)}」`).join(" ")}`);
          graves.forEach(([j, cr]) => peek.push({ k: `g:${j}`, role: cr }));
        }
        t.both(t.eff());
        t.setPeek(peek, 380);
      }
    },
    /** 酔い覚め: 仲間の人狼(大狼は墓地も) */
    soberLines(c, id, fin) {
      const g = c.g, rn = c.rn;
      const wolves = g.players.filter((q) => q.id !== id && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.name);
      const graves = () => `墓地: ${g.center0.map((cr, i) => `${i + 1}枚目「${rn(cr)}」`).join(" ")}`;
      return [wolves.length ? `仲間の人狼: ${wolves.join("、")}` : "仲間の人狼はいません。", ...(fin === "big_wolf" ? [graves()] : [])];
    },
    /** 酔い覚めの演出: 仲間の人狼のカードに🐺(大狼は墓地も) */
    soberPeek(c, id, fin) {
      const g = c.g, pk = {};
      const ids = g.players.filter((q) => q.id !== id && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.id);
      if (ids.length) pk.wolves = ids;
      if (fin === "big_wolf") pk.graves = g.center0.slice();
      return pk;
    },
  };
})(window.ONW);
