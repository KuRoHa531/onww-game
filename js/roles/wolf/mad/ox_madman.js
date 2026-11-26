/**
 * 牛の狂人（人狼陣営・狂人系・干支狂人）: 受動役職。夜の能力・昼能力はない。
 * マイクラ版（minecraftver.mcpack の vote.js の executedIdsFromVotes / state.js の OX_MADMAN）に合わせる。
 *
 * ・投票の追放決定で、牛の狂人が「同数最多得票（同票）」の中にいると、同数最多の全員で「競り合い」が起きる:
 *   同数最多の人はそれぞれ 1/2 の確率で生き延びる（抽選は game.oxFlipCache に固定し、再計算でも同じ結果になる）。
 *   - 全員が生き残った場合: 誰も追放されない。全員に「引き分け」の記録（game.oxMarks = "draw"）。
 *   - 全員が死亡した場合: 「相打ち」で全員が追放される（oxMarks = "mutual"）。
 *   - 生き残りが2人以上: 生き残った人は「引き分け」で追放されず、死亡した人は「押し切り」で追放される（oxMarks = "push"）。
 *   - 生き残りが1人だけ: その人は通常の生存扱い（記録なし）、死亡した人は「押し切り」で追放される。
 * ・同数最多の中にタフガイ（効果が働いている人）がいる場合は競り合いは起きず、タフガイ以外が全員「押し切り」で追放される
 *   （マイクラ版の分岐どおり。タフガイの判定は Web版 tough_guy.js の active と同じ: 実効役職・酔いが覚めている・封印されていない）。
 * ・牛の狂人の判定は「最終盤面の実効役職」（ONW.mimic.actRole。マイクラ版 roleForMimicEffect）: 模倣の人狼が牛の狂人を模倣していても発動する。
 *   封印されている牛の狂人は発動しない。独裁処刑（マイクラ版は強制対象の経路で競り合いなし）では発動しない。
 * ・競り合いの結果は、通常の追放としてこのあとの処理（タフガイ・人狼王の elimination フック → 豆腐のメンタル崩壊 →
 *   チキンのショック死 → 呪術の人狼の呪殺 → 護衛・身代わり）にそのまま渡る（マイクラ版 applyToughGuyAndWolfKingToExecuted と同じ位置）。
 *   呪殺された人の死因表示は呪殺が優先する（マイクラ版は finalDeathReasons を呪殺で上書きする）。
 * ・黄泉に断ち切られる状態は持たない（マイクラ版 yomiCutStates に牛の狂人の項目なし）。乞食は牛の狂人を取れる
 *   （マイクラ版 isBeggarSwapExcludedTarget に牛の狂人は入っていない）。
 *
 * 演出（作者メモ）: 結果発表で、票数が出たあとに同数最多のカードが裏面のまま浮いて競り合う →
 *   負けたほう（死亡した人）は弾かれて元の場所に戻る（そのあと通常の追放フリップでめくれる）→
 *   勝ったほう（生き延びた人）は、負けたほうが戻ったあとに裏面のまま元の場所へ戻る。
 *   タフガイがいて競り合いが起きなかった場合は、この場面は出ない（タフガイの演出と通常の追放で見せる）。
 * 状態: g.oxMarks = { プレイヤーID: "draw" | "push" | "mutual" }（resolveElimination のたびに決め直す）
 *       g.oxClash = { tied, survived, died, marks } | null（競り合いが起きたときだけ。結果発表の演出用）
 *       g.oxFlipCache = { key, survived, died }（抽選の固定。再計算・結果プレビューでも同じ結果にする）
 * 呼び出し: vote.js の resolveElimination が、最多得票者を決めた直後（elimination フックの前）に ONW.oxMadman.applyVoteClash を呼ぶ。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const ID = "ox_madman";
  const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
  const sealed = (g, id) => !!(ONW.seal && ONW.seal.is(g, id));

  /** いま牛の狂人として判定される人（最終盤面の実効役職が牛の狂人・封印されていない。マイクラ版 roleForMimicEffect + isSealedPlayerId） */
  function holders(g) {
    return (g.players || []).map((p) => p.id).filter((id) => act(g, id) === ID && !sealed(g, id));
  }
  /** 効果が働いているタフガイか（Web版 tough_guy.js の active と同じ条件。マイクラ版の牛の分岐の isToughGuy 判定に、Web版タフガイの酔い条件を合わせたもの） */
  const activeTough = (g, id) => ONW.mimic.eff(g, id) === R().TOUGH_GUY && !ONW.hiddenDrunk(g, id) && !sealed(g, id);

  /**
   * 競り合いの判定（vote.resolveElimination が、最多得票者 = game.eliminated を決めた直後に呼ぶ）。
   * 発動すると game.eliminated を「死亡した人」だけに書き換え、game.oxMarks / game.oxClash を記録する。
   * 戻り値: 競り合いが起きたら { tied, survived, died, marks, tough }、起きなければ null。
   */
  function applyVoteClash(game, counts, maxVotes) {
    game.oxMarks = {};
    game.oxClash = null;
    if (game.dictator) return null;   // 独裁処刑は強制対象の経路（マイクラ版）: 競り合いは起きない
    const tied = (game.eliminated || []).slice();
    if (tied.length < 2) return null;
    if (!tied.some((id) => holders(game).includes(id))) return null;
    const marks = {};
    // 同数最多にタフガイがいれば、競り合い（抽選）は起きず、タフガイ以外が押し切りになる
    const tough = tied.filter((id) => activeTough(game, id));
    if (tough.length) {
      const died = tied.filter((id) => !tough.includes(id));
      died.forEach((id) => { marks[id] = "push"; });
      game.oxMarks = marks;
      game.eliminated = died;
      return { tied, survived: tough.slice(), died, marks, tough: true };
    }
    // 抽選（同数最多の人ごとに1回だけ・キャッシュで固定。再計算や結果プレビューでも同じ結果になる）
    const key = tied.slice().sort().join(",") + "@" + maxVotes;
    let cache = game.oxFlipCache;
    if (!cache || cache.key !== key) {
      const survived = [], died = [];
      tied.forEach((id) => { (Math.random() < 0.5 ? survived : died).push(id); });
      cache = game.oxFlipCache = { key, survived, died };
    }
    const survived = cache.survived.slice(), died = cache.died.slice();
    if (!died.length) survived.forEach((id) => { marks[id] = "draw"; });                       // 全員が生き残った: 引き分け
    else if (!survived.length) died.forEach((id) => { marks[id] = "mutual"; });                  // 全員が死亡: 相打ち
    else if (survived.length >= 2) { survived.forEach((id) => { marks[id] = "draw"; }); died.forEach((id) => { marks[id] = "push"; }); }   // 生き残り2人以上: 生存側は引き分け
    else died.forEach((id) => { marks[id] = "push"; });                                          // 生き残り1人: 通常の生存扱い（記録なし）
    game.oxMarks = marks;
    game.eliminated = died;
    game.oxClash = { tied, survived, died, marks: { ...marks } };
    return game.oxClash;
  }

  /** 結果発表用のデータ（net.js が res.oxClash として渡す）: 競り合いが起きたときだけ { tied: [{id, name}], survived, died, marks } */
  function resultData(g, nm) {
    const c = g.oxClash;
    if (!c) return null;
    return { tied: c.tied.map((id) => ({ id, name: nm(id) })), survived: c.survived.slice(), died: c.died.slice(), marks: { ...(c.marks || {}) } };
  }

  const ZODIAC_MADMEN = ["rat_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"];   // 牛以外の干支狂人（未移植のものは今後入る）
  /**
   * 実績（マイクラ版 stats.js と同じ条件。wiki の「牛の狂人」に定義済みのもの）:
   * win_ox_madman「牛の歩みも千里」 = 最終役職が牛の狂人で勝利 / zodiac_ox_madman「丑年」 = 試合終了時に牛以外の干支狂人が現世にいる。
   * first_ox_madman「猛牛注意」は履歴判定のため返さない（鼠の狂人の first_rat_madman と同じ）。
   * Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（鼠の狂人と同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;   // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外 = マイクラ版と同じ）
    if (won) out.push("win_ox_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_ox_madman");
    return out;
  }

  ONW.oxMadman = { holders, applyVoteClash, resultData, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 144, name: "牛の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.6996,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。牛の狂人が同数最多得票になった場合、同数最多の人はそれぞれ1/2の確率で生き延びます。全員が生き残った場合は引き分けになり、誰も追放されません。全員が死亡した場合は相打ちになり、全員が追放されます。生き残りが2人以上いる場合は引き分けで、生き残った人は追放されません。生き残りが1人だけの場合は通常の生存扱いです。死亡した人は押し切りで追放されます。同数最多の中にタフガイがいる場合は競り合いにならず、タフガイ以外が押し切りになります。封印されていると発動しません。模倣の人狼が模倣していても発動します。" },
    groups: { mad: 2.997, "transform:dark_avatar": 26 },   // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 109）で決まる

    // 結果発表の演出（stage.js の startResult が引く。使うデータは res.oxClash（net.js が ONW.oxMadman.resultData で作る））
    // intro（order 4 = タフガイの 5 より前。票数が出たあと・追放フリップの前）: 同数最多のカードが裏面のまま浮いて競り合う →
    //   負けたほう（死亡した人）が弾かれて元の場所に戻る → 勝ったほう（生き延びた人）が裏面のまま元の場所に戻る。
    //   めくれるのはこのあとの通常の追放フリップ（死亡した人）と生存者の一斉公開（生き延びた人）。
    stageResult: {
      intro: { order: 4, run(R) {
        const c = R.res && R.res.oxClash;
        if (!c || !c.tied || c.tied.length < 2) return;
        const { P, later, setCap, esc } = R;
        const nmOf = (id) => { const t = c.tied.find((x) => x.id === id); return t ? t.name : id; };
        const names = c.tied.map((x) => esc(x.name)).join("、");
        const t0 = R.t;
        later(() => setCap(`<div class="res-cap__t t-wolf">牛の狂人</div><div>同数最多の ${names} が競り合います…</div>`), t0);
        if (reduceMotion()) { R.t = t0 + 1000; return; }
        const card = (id) => seatCard(R, P(id));
        later(() => { c.tied.forEach((x) => { const el = card(x.id); if (el) el.animate(FLOAT_UP, { duration: 750, easing: "cubic-bezier(.3,.7,.4,1)", fill: "forwards" }); }); }, t0);
        later(() => { c.tied.forEach((x) => { const el = card(x.id); if (el) el.animate(CLASH, { duration: 600, easing: "ease-in-out", fill: "forwards" }); }); }, t0 + 950);
        const diedN = c.died.map(nmOf).map(esc), survN = c.survived.map(nmOf).map(esc);
        const outcome = !c.died.length ? `<div class="res-cap__t t-wolf">引き分け</div><div>全員が生き延びました</div>`
          : !c.survived.length ? `<div class="res-cap__t t-wolf">相打ち</div><div>${diedN.join("、")} は全員倒れました</div>`
          : c.survived.length >= 2 ? `<div class="res-cap__t t-wolf">押し切り</div><div>${diedN.join("、")} が押し切られました（${survN.join("、")} は引き分けで生き延びました）</div>`
          : `<div class="res-cap__t t-wolf">押し切り</div><div>${survN.join("、")} が競り勝ち、${diedN.join("、")} が押し切られました</div>`;
        if (c.died.length) later(() => {   // 負けたほう: 弾かれて元の場所に戻る（めくれるのは通常の追放フリップ）
          setCap(outcome);
          c.died.forEach((id) => { const el = card(id); if (el) el.animate(BOUNCE_BACK, { duration: 620, easing: "cubic-bezier(.3,.9,.4,1)", fill: "forwards" }); });
        }, t0 + 1750);
        if (c.survived.length) later(() => {   // 勝ったほう: 負けたほうが戻ったあとに、裏面のまま元の場所へ戻る
          if (!c.died.length) setCap(outcome);
          c.survived.forEach((id) => { const el = card(id); if (el) el.animate(FLOAT_DOWN, { duration: 650, easing: "ease-out", fill: "forwards" }); });
        }, t0 + (c.died.length ? 2350 : 1750));
        R.t = t0 + 3150;
      } },
    },
  });

  // ======================================================================
  // 競り合いのカードアニメーション（裏面のまま浮く → ぶつかり合う → 弾かれる / 戻る）
  // ======================================================================
  const reduceMotion = () => typeof window !== "undefined" && !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function seatCard(R, k) {
    const t = R && R.$t && R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"].tb-card`);
    return c && c.animate ? c : null;
  }
  const FLOAT_UP = [
    { transform: "translateY(0px)", boxShadow: "0 2px 6px rgba(0,0,0,.25)" },
    { transform: "translateY(-26px)", boxShadow: "0 18px 26px rgba(0,0,0,.42)" },
  ];
  const CLASH = [
    { transform: "translateY(-26px) translateX(0px) rotate(0deg)" },
    { transform: "translateY(-31px) translateX(9px) rotate(2deg)", offset: 0.25 },
    { transform: "translateY(-23px) translateX(-9px) rotate(-2deg)", offset: 0.5 },
    { transform: "translateY(-30px) translateX(6px) rotate(1.5deg)", offset: 0.75 },
    { transform: "translateY(-26px) translateX(0px) rotate(0deg)" },
  ];
  const BOUNCE_BACK = [
    { transform: "translateY(-26px)", boxShadow: "0 18px 26px rgba(0,0,0,.42)" },
    { transform: "translateY(3px) scale(1.06)", boxShadow: "0 3px 8px rgba(0,0,0,.3)", offset: 0.55 },
    { transform: "translateY(0px) scale(1)", boxShadow: "0 2px 6px rgba(0,0,0,.25)" },
  ];
  const FLOAT_DOWN = [
    { transform: "translateY(-26px)", boxShadow: "0 18px 26px rgba(0,0,0,.42)" },
    { transform: "translateY(0px)", boxShadow: "0 2px 6px rgba(0,0,0,.25)" },
  ];
})(window.ONW);
