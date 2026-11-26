/**
 * horse_madman.js — 馬の狂人（人狼陣営・狂人系 / deck 149 / wiki order 114 / 発案: くろは / 元ネタ: オリジナル）
 *
 * 作者（くろはさん）の依頼メモ（2026-11-25）: 「馬の狂人がいるとき、他の人が投票するとき、自分のカードから
 * 投票者へ🐎が走っていく演出がそれぞれ見える（自身の投票だけ…（メモはここで切れている）」。
 * 細かい仕様はマイクラ版（scripts/vote.js の isHorseMadmanActive / openVote）で確認した。
 *
 * ・能力（投票連動・受動役職。夜の行動なし）: 「暴れ馬状態」。実効役職（マイクラ版 roleForMimicEffect。
 *   模倣の人狼が模倣していればその人も馬の狂人扱い）が馬の狂人で、封印されておらず、投票前に死んでいない
 *   人が現世にいる間、馬の狂人以外の投票者は一度投票した先から投票先を変更できない。未投票に戻すことも
 *   できない。同じ相手にもう一度投票するのは変更ではないので可能。馬の狂人自身は自由に変更できる。
 *   拒否されたときの文はマイクラ版どおり「暴れ馬状態のため、一度投票した先から変更できません。」。
 *     - 効く場面: 通常投票と妖狐投票（マイクラ版は openVote 共用）。魔界公爵の追放会議はマイクラ版でも
 *       別経路（meeting.votes）で対象外なので、Web版でも会議の票には効かせない。
 *     - 投票先の書き換え系（ペンギン・交換者・御乱心など、集計時の書き換え）は投票者本人の変更ではない
 *       ので妨げない（マイクラ版も openVote の再投票だけを止める）。
 *     - CPU は Web版でもマイクラ版でも票を1回だけ入れて変更しないので、実質影響なし。
 *     - デバッグの固定票は従来どおり優先（ホスト側の既存チェックで先に弾かれる）。
 *   配線: ホストの投票受付（net.js の "vote" 処理）が ONW.horseMadman.canChange で判定し、変更できない
 *   ときは本人にだけ { t: "horselock", keep } を返して選択表示を元の票に戻す。オフライン側は
 *   vote.js の castVote が同じ判定で変更を受け付けない。
 * ・演出（作者メモ）: 投票した人の画面でだけ、その人が初めて票を入れた瞬間に、馬の狂人（発動中の人）の
 *   カードから投票者のカードへ 🐎 が走る（stage.js の stage.horseRun。複数いる場合は少しずつずらして
 *   全員分走る）。票は結果発表まで秘密なので、他の人の投票では誰の画面にも出ない。メモの切れた部分
 *   「（自身の投票だけ」は「自身の投票だけ見える」の読みで実装した（解釈点）。馬の狂人本人が投票した
 *   ときは走らない（メモの「他の人が投票するとき」）。
 * ・勝利条件は通常の人狼陣営（追加勝利・単独勝利なし）。占い結果は「馬の狂人」。狂人系なので人狼が
 *   誰かは分からない。
 * ・ハッキング: マイクラ版の対象外（ヴァニティ・ホタルのみ）に入っていないので、対象にも思い込み先にも
 *   なる。受動役職で偽の夜情報は無い（龍・蛇と同じ扱い）。思い込んだ人の実効役職は馬の狂人ではないので、
 *   その人はロックの対象になり、思い込みでは発動しない。本物の馬の狂人が思い込まされても実効役職は
 *   馬の狂人のままなので発動し、本人は変更できる（マイクラ版 roleForMimicEffect どおり）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / NON_MIMICABLE_ROLES / shufflerEligibleRoles /
 *   cosplayerEligibleRoles）: 闇の化身 = 入る（干支狂人全役が入る）/ 光の使徒・銀色の影 = 入らない /
 *   模倣 = できる（模倣した人の存在でも発動し、模倣した人は変更できる）/ コスプレ = 入らない
 *   （村人陣営のみ）/ シャッフラー = 山札に入る（マイクラ版のブロック対象は兎・龍・犬のみ）/
 *   ペルソナ = Web版未実装。
 * ・乞食: 狂人系は取れる（マイクラ版の除外リストに無い）。
 * ・封印: 発動条件として「封印されている場合は発動しない」。マイクラ版 YAMINABE_SEAL_TARGET_ROLES
 *   には馬の狂人は入っていないが、2026-11-26 の作者決定（エルフリンデもいるので）で封印対象にした
 *   （sealTarget: true。龍の狂人と同じ作者決定の先例）。
 * ・シナジー: 馬の狂人固有のトリガーはマイクラ版に無いので追加しない（干支シナジーの確率ルールも
 *   先行干支狂人と同様に未実装）。
 * ・見張り番・詩人・観測の人狼: 夜に行動しないので「行動した」扱いにならない。新聞にも載らない。
 * ・CPU: 夜の行動は無く、投票は通常の人狼陣営CPUと同じ（票は1回だけ入れるのでロックと競合しない）。
 *   結果開示の専用文はマイクラ版 main.js に無いため付けない（呪術・蛇と同じ扱い）。
 * ・デバッグ: 対象を選ぶ能力が無い受動役職なので専用配線は無し（呪術の人狼・蛇の狂人と同じ扱い）。
 * ・実績（判定だけ。wiki-data.js / マイクラ版 stats.js）: win_horse_madman「勝ち馬に乗る」/
 *   zodiac_horse_madman「午年」（first_horse_madman「暴れ馬」は履歴判定のため先行干支狂人どおり
 *   返さない。horse_madman_coffee「馬ルクト」も先行干支狂人どおり返さない）。
 */
(function (ONW) {
  const ID = "horse_madman";
  const eff = (g, id) => (ONW.mimic ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);
  const LOCK_TEXT = "暴れ馬状態のため、一度投票した先から変更できません。";   // マイクラ版 vote.js の文言どおり
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"]; // 馬以外の干支狂人

  /** 実効役職が馬の狂人か（模倣の人狼が模倣していれば true。ハッキングの思い込みではならない） */
  function isHorse(g, id) { return eff(g, id) === ID; }

  /**
   * 発動中の馬の狂人のID一覧（マイクラ版 isHorseMadmanActive の条件）:
   * 実効役職が馬の狂人で、封印されておらず、投票前に死んでいない人。
   * （マイクラ版の noVictoryIds は、Web版では抹消されれば実効役職自体が変わるため eff の判定で足りる）
   */
  function activeHolders(g) {
    if (!g || !g.players || !g.currentRoles) return [];
    const dead = new Set(g.deadIds || []);
    return g.players.filter((p) => eff(g, p.id) === ID && !(ONW.seal && ONW.seal.is(g, p.id)) && !dead.has(p.id)).map((p) => p.id);
  }

  /** 暴れ馬状態が発動しているか */
  function active(g) { return activeHolders(g).length > 0; }

  /** その投票者はロックされるか（馬の狂人自身は対象外） */
  function locks(g, voterId) { return active(g) && !isHorse(g, voterId); }

  /**
   * 投票先を targetId に変えてよいか。まだ投票していない・同じ相手への再投票は常によい。
   * 違う相手への変更と、未投票に戻すことは、ロック中はできない。
   */
  function canChange(g, voterId, targetId) {
    const prev = (g.votes || {})[voterId];
    if (prev == null || prev === targetId) return true;
    return !locks(g, voterId);
  }

  /** 実績（wiki-data.js の「馬の狂人」に定義済み。履歴判定の first_horse_madman と horse_madman_coffee は返さない=先行干支狂人と同じ） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;   // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    if (won) out.push("win_horse_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_horse_madman");
    return out;
  }

  ONW.horseMadman = { holders, isHorse, activeHolders, active, locks, canChange, LOCK_TEXT, achievements };

  ONW.defineRole(ID, {
    info: { deck: 149, name: "馬の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.7001, sealTarget: true,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。現世にいる間、馬の狂人以外は一度投票した先から投票先を変更できません（未投票に戻すこともできません）。馬の狂人自身は自由に変えられます。封印されている間は発動しません。" },
    groups: { mad: 3.002, "transform:dark_avatar": 31 },   // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER = wiki の order 114
  });
})(window.ONW);
