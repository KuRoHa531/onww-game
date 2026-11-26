/**
 * 鶏の狂人（rooster_madman）: 人狼陣営（狂人系）。マイクラ版 scripts の鶏の狂人を移植（第4バッチ・干支狂人の10役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / vote.js の applyChickenOverride・ショック死の処理 準拠）:
 *   ・夜の能力・昼の能力は無い（受動役職）。チキンの人狼陣営版で、仕組みはチキンと対になる:
 *     - 1票でも入るとショック死する（追放扱い）。判定は vote.js の resolveElimination でチキンと共通
 *       （実効役職が鶏の狂人で、封印されておらず、投票前に死んでいないこと。騎士の護衛・従者/少佐/
 *       マティアスの身代わりで守られれば死なないのもチキンと同じ）。
 *       呪術の人狼の呪殺・蛇の狂人の毒殺の対象外には入っていないため、最多得票で呪殺/毒殺された場合は
 *       ショック死ではなく呪殺/毒殺で死ぬ（マイクラ版は死因を上書きする。vote.js 側で shockIds から外す）。
 *       魔界公爵の追放会議の票ではショック死しない（マイクラ版の会議側の処理はチキンのみ）。
 *     - 最後まで生き残っていると、人狼陣営以外が勝つはずの結果を、人狼陣営の逆転勝利に変える
 *       （マイクラ版 applyChickenOverride。vote.js の determineWinners / applyPrankster の中でチキンと
 *       共通の chickenForce の仕組みを使って作り直す。恋人になっている場合は逆転できない）。
 *     - チキンも生き残っている場合は、どちらが逆転させるかは生存数に応じた抽選で決まる
 *       （マイクラ版 game.chickenRoosterReverseSide: チキンの生存数 / 合計 の確率で村人側。
 *       同じ試合では最初に決めた側を使い続ける。選ばれた側がすでに勝っている結果では逆転しない）。
 *     - 模倣の人狼が鶏の狂人を模倣した場合も、生存していれば鶏の狂人として逆転させる
 *       （マイクラ版は実効役職で数える。村人陣営が勝っている結果では模倣の鶏は数えない＝マイクラ版どおり）。
 *       クローンの思い込みは、Web版のチキンと同じく生存者の数には入れない（チキン側の扱いに合わせた解釈）。
 *     - 封印されていても逆転は発動する（マイクラ版 applyChickenOverride に封印の条件は無い。
 *       ショック死だけが封印で止まる）。酔っ払い（未覚醒）はチキンと同じく生存者に数えない。
 *   ・結果の文（マイクラ版の detail の言い回しを Web版のチキンに合わせた）:
 *     「生存した鶏の狂人 ○○ が人狼陣営以外の勝利を逆転させました。（逆転前: ○○勝利）」
 * 演出（作者メモ）:
 *   ・「🐔マークじゃなくて🐓マーク」: 逆転の演出（チキンの stageResult.reverse を共用）で、鶏の狂人の
 *     カードには 🐔 ではなく 🐓 が飛び出す（gx "rooster"・css/style.css の .gx-rooster）。
 *   ・「チキンと鶏が同時に生きてる場合は、神降臨 → びっくりマーク🐓からの人狼陣営 → びっくりマーク🐔からの
 *     村人陣営勝利みたいになる」: 逆転の演出は既存のチキンと同じ流れ（逆転前の勝敗を先に発表 →
 *     「！」のバーストと逆転させた側のマーク（🐓/🐔）→ 逆転後の勝敗）で、メモの並びはこの流れの
 *     例示と解釈した。実際の逆転はマイクラ版どおり1回だけで、チキンと鶏の両方が生き残っている場合は
 *     生存数に応じた抽選で逆転させる側が決まる（両方が順番に逆転させるわけではない）。
 *     メモの「犬」は、マイクラ版でチキンと対になる役職が鶏の狂人であることと、マークが 🐓/🐔 である
 *     ことから、鶏の狂人のことと解釈した（「犬」という単独の役職は無く、犬の狂人は次の移植役職で別役職）。
 * 変化候補（マイクラ版で確認）: 闇の化身の変化候補（TRANSFORM_ROLE_GROUPS の DARK_AVATAR に入っている）。
 *   光の使徒（村人陣営のみ）・銀色の影（第三陣営のみ）・コスプレイヤー（村人陣営のみ）の候補ではない。
 *   模倣の人狼はなれる（NON_MIMICABLE_ROLES に無い）。シャッフラーの山札に入る（除外は兎・龍・犬のみ）。
 *   ペルソナは Web版未実装。
 * 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っているため sealTarget: true
 *   （封印されるとショック死しなくなる。逆転そのものはマイクラ版どおり封印でも発動する）。
 * ハッキング: 対象外には入っていない（本物の鶏の狂人もハッキングされる。思い込んだ人の逆転・ショック死は
 *   実効役職で判定するため、思い込み先が鶏の狂人なら実効役職ベースで数える）。
 * 乞食: 取れる（マイクラ版の除外リストに無い。ショック死した鶏の狂人もチキンと同じ扱いで取れる）。
 * 黄泉: マイクラ版の yomiCutStates に鶏の狂人の記録は無いので、黄泉では断ち切られない（他の干支狂人と同じ）。
 * トラップマスター（罠師）: 罠師の移植時に確認済み。鶏の狂人は受動役職で昼能力が無いため、罠の干渉は無い（罠は昼能力への共通ゲートでのみ発動する）。
 * CPU: 鶏の狂人自身に夜・昼の行動は無い。CO は狂人系の共通経路（騙り）に従う。
 * デバッグ: 鶏の狂人自身の昼能力は無いので専用の kind は無い（逆転の抽選は通常の乱数）。
 */
(function (ONW) {
  const ID = "rooster_madman";
  const eff = (g, id) => (ONW.mimic && ONW.mimic.eff ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "dog_madman", "boar_madman"];

  /** 鶏の狂人として数える人か（本物、または鶏の狂人を模倣した模倣の人狼） */
  function isRooster(g, id) {
    if (!g || !g.currentRoles) return false;
    if (g.currentRoles[id] === ID) return true;
    return g.currentRoles[id] === "mimic_wolf" && eff(g, id) === ID;
  }
  /**
   * 逆転できる鶏の狂人の生存者（マイクラ版 applyChickenOverride の survivingRoosterIds）。
   * alive(id): 呼び出し側の生存判定（死亡・恋人・未覚醒の酔いを除く。チキン側と共通の関数を受け取る）。
   * teams0: 逆転前の勝利陣営。模倣の鶏は、村人陣営が勝っている結果では数えない（マイクラ版どおり）。
   */
  function survivors(g, alive, teams0) {
    if (!g || !g.players) return [];
    const villageWin = (teams0 || []).includes("村人陣営");
    return g.players.map((p) => p.id).filter((id) => {
      if (!alive(id)) return false;
      if ((g.currentRoles || {})[id] === ID) return true;
      return !villageWin && (g.currentRoles || {})[id] === "mimic_wolf" && eff(g, id) === ID;
    });
  }
  /** 実績（wiki/js/wiki-data.js の鶏の狂人の実績。first_ は履歴系なので返さない＝他の役職と同じ） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;
    if (won) out.push("win_rooster_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_rooster_madman");
    return out;
  }

  ONW.defineRole(ID, {
    info: {
      sealTarget: true, deck: 152, name: "鶏の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.7004,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力も昼の能力もありません。1票でも入るとショック死（追放扱い）します。最後まで生き残っていると、人狼陣営以外が勝つはずの結果を、人狼陣営の逆転勝利に変えます（恋人になっている場合は逆転できません）。チキンも生き残っている場合は、どちらが逆転させるかは生存数に応じた抽選で決まります。模倣の人狼が鶏の狂人を模倣したときも、同じく人狼陣営の逆転勝利に変えます。",
    },
    groups: { mad: 3.005, "transform:dark_avatar": 34 },
    achievements,
  });
  ONW.roosterMadman = { isRooster, survivors, achievements };
})(window.ONW = window.ONW || {});
