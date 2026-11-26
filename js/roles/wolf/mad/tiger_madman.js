/**
 * 虎の狂人（人狼陣営・狂人系・干支狂人）: 受動役職。夜の能力・昼能力・CO は無い。
 * マイクラ版（minecraftver.mcpack の vote.js の resolveChainDeaths の TIGER_MADMAN / state.js の ROLE_INFO）に合わせる。
 * 作者メモ「虎はまぁ黒猫と同じ」: Web版の黒猫（投票の連鎖でめくれたときに道連れ）と同じ仕組みで、違うのは道連れの対象と細部。
 *
 * ・自分が投票の連鎖の中でめくれた（死んだ）とき、生存している第三陣営がいれば、その中からランダムに1人を道連れにする
 *   （死因は黒猫と同じ kind "tomo"。結果発表でも黒猫と同じ「道連れ」でめくれる。専用演出は無い）。
 *   - 対象は「最終盤面の実効役職の静的な陣営が第三陣営」の生存者だけ（マイクラ版 baseTeamOf(roleForMimicEffect(id)) === THIRD）。
 *     村人陣営・人狼陣営は対象にならない。同じ波で他の猫などがすでに選んだ人は選ばない（黒猫の pool と共通）。
 *   - 虎の判定は実効役職（マイクラ版 roleForMimicEffect）: 模倣の人狼が虎の狂人を模倣していても発動する。
 *   - 封印されている虎の狂人は発動しない（マイクラ版 isSealedPlayerId。vote.js の sealedAct）。
 *   - 呪術の人狼の呪殺で死んだ虎の狂人は発動しない（マイクラ版 isPiercingVoteKillReason の continue。
 *     Web版は呪殺の死者を連鎖の波に入れないことで一致）。
 *   - 昼中にすでに死んでいる虎の狂人は発動しない（連鎖の波は投票でめくれた人から始まる。マイクラ版もキューは追放者から）。
 *   - 黒猫と違う点（マイクラ版準拠）: 無理心中（love）・心中（lovers）で死んだ虎の狂人も発動する。
 *     マイクラ版は貫通死以外のすべての死で発動するため。Web版の loveDead は TOMO_ROLES・一目惚れ・
 *     アサシン・賞金稼ぎだけを止める決まりで、虎の狂人はその対象に入っていない（groups に tomo を付けない）。
 *   - 黒猫と違う点（マイクラ版準拠）: 道連れ先は騎士に守られず、従者の身代わりにもならない
 *     （マイクラ版は対象をそのまま死亡させる。vote.js の kill() で tigerDrags の対象だけ tomo の護衛・身代わり分岐を迂回）。
 *     なお騎士は村人陣営しか守れないので、第三陣営の対象が騎士に守られることは元々ない。実際の差は従者の身代わりだけ。
 *     マティアスの身代わりは kill() の共通処理で従来どおり働く（対象がマティアスで娘が生きていれば娘が代わりに死ぬ）。
 * ・道連れ先は game.tigerPicks[虎のID] に固定する（再計算でも同じ相手。黒猫の game.catPicks と同じ考え方）。
 *   デバッグの道連れ先指定（kind "cat"・黒猫と共通）も使える。
 * ・黄泉に断ち切られる状態は持たない（マイクラ版 yomiCutStates に虎の狂人の項目なし）。乞食は虎の狂人を取れる
 *   （マイクラ版 isBeggarSwapExcludedTarget に虎の狂人は入っていない）。
 * 呼び出し: vote.js の resolveChain（波の1段階目）が ONW.tigerMadman.candidates で対象を絞り、take(t, id, "tomo") する。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const ID = "tiger_madman";
  const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
  const sealed = (g, id) => !!(ONW.seal && ONW.seal.is(g, id));

  /** いま虎の狂人として判定される人（最終盤面の実効役職が虎の狂人・封印されていない。マイクラ版 roleForMimicEffect + isSealedPlayerId） */
  function holders(g) {
    return (g.players || []).map((p) => p.id).filter((id) => act(g, id) === ID && !sealed(g, id));
  }
  /** その人の陣営が第三陣営か（最終盤面の実効役職の静的な陣営で判定。マイクラ版 baseTeamOf(roleForMimicEffect(id)) === TEAM.THIRD） */
  function isThird(g, id) {
    const info = ONW.ROLE_INFO[ONW.mimic.eff(g, id)];
    return !!info && info.team === ONW.TEAM.THIRD;
  }
  /** 道連れの対象候補: base（生存者プール）から第三陣営だけを残す */
  function candidates(g, base) {
    return (base || []).filter((id) => isThird(g, id));
  }

  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"]; // 虎以外の干支狂人
  /**
   * 実績（マイクラ版 stats.js / wiki と同じ条件）:
   * win_tiger_madman「虎の威を借る狂人」 = 最終役職が虎の狂人で勝利 / zodiac_tiger_madman「寅年」 = 試合終了時に虎以外の干支狂人が現世にいる。
   * first_tiger_madman「虎視眈々」（初めて虎の狂人になる）は履歴判定のため返さない（鼠・牛と同じ）。
   * Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（鼠・牛と同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out; // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    if (won) out.push("win_tiger_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_tiger_madman");
    return out;
  }

  ONW.tigerMadman = { holders, isThird, candidates, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 145, name: "虎の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.6997,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。自分が吊られたとき、生存している第三陣営がいれば、その中からランダムに1人を道連れにします（道連れにした人は騎士に守られず、従者の身代わりにもなりません）。封印されている場合は発動しません。最終的に虎の狂人を持っている人が対象です。" },
    groups: { mad: 2.998, "transform:dark_avatar": 27 }, // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 110）で決まる
  });
})(window.ONW);
