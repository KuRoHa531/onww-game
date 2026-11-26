/**
 * 猿の狂人（monkey_madman）: 人狼陣営（狂人系）。マイクラ版 scripts の猿の狂人を移植（第4バッチ・干支狂人の9役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / main.js の昼能力ハンドラと hasActiveMonkeyMadman / vote.js の結果情報 準拠）:
 *   ・夜の能力・昼能力は無い（受動役職）。「現世にいる」猿の狂人がいる間、保安官・ヴァニティ・独裁者・天秤の
 *     昼能力は「猿凸」状態になり、対象がランダムに変わる。
 *     - 発動条件（マイクラ版 hasActiveMonkeyMadman）: 実効役職（模倣・クローンの思い込み・開拓者の運命まで解決した
 *       昼行動役職）が猿の狂人で、封印されておらず、投票前に死んでいない参加者が1人でもいる。
 *     - 単体対象（保安官・ヴァニティ・独裁者）: 対象は「生きている参加者（能力を使った本人を除く）」から
 *       ランダムに1人へ変わる。元の対象と同じ人になることもある。猿凸が起きたことは記録される。
 *     - ペア対象（天秤）: 2人ともランダムに変わる（本人も含む・互いに別々）。どちらか決められなければ元のペアのまま（記録もしない）。
 *     - 差し替えは net.js の host 関数（hostSheriff / hostVanity / hostLibra / hostDictate）で、兎の狂人の
 *       dayGate のあと・判定/適用の前に行う。静観者・龍の狂人の記録（ONW.watcher.touch）には実際の対象が入る。
 *       CPU・デバッグの昼能力も同じ host 関数を通るので、同じく差し替わる。
 *     - ハッキングされた人の偽の昼能力（hostFakeDay）は盤面に効かない偽物なので差し替えない（マイクラ版も偽能力は対象外）。
 *   ・結果発表の役職情報: 「猿凸により{役職名} {名前}の能力先は{元の対象}から{実際の対象}に変わっていました。」
 *     （ペアは名前を「、」でつなぐ。マイクラ版 vote.js の文どおり）
 * 演出（作者メモ）: 能力を使った人のカードがめくれて 🐵 マークになってから、ランダムな人に能力を使う。
 *   Web版では、ホストが差し替えの直前に全員へ "monkeyfx" を送り、各画面で使った人のカードが 🐵 の面で
 *   めくれて数秒後に裏に戻る（stageFlash "monkeyFlash"・stage.js の MONKEY_MARK）。効果側の演出はその後ろで進む
 *   （天秤はもともと発動表示のあと約2.3秒待ってから適用される）。解釈点: ホストの判定自体は即時で、
 *   めくりが効果の演出より先に始まることで「めくれてから使う」順序を画面上で再現している。
 * 変化候補（マイクラ版で確認）: 闇の化身の変化候補（DARK_AVATAR の候補リストに猿の狂人が入っている）。光の使徒（村人陣営のみ）・
 *   銀色の影（第三陣営のみ）・コスプレイヤー（村人陣営のみ）の候補ではない。模倣の人狼はなれる（NON_MIMICABLE_ROLES に無い）。
 *   シャッフラーの山札に入る（除外は兎・龍・犬のみ）。ペルソナは Web版未実装。
 * 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に猿の狂人は入っていないが、2026-11-26 の作者決定
 *   （エルフリンデもいるので）で封印対象にした（sealTarget: true。馬の狂人・龍の狂人と同じ作者決定の先例）。
 *   発動条件の「封印されていない」はマイクラ版どおり。
 * ハッキング: 対象外には入っていない（本物の猿の狂人もハッキングされる。思い込んだ人の猿凸は起きない＝実効役職で判定）。
 * シナジー（マイクラ版 roles.js）:
 *   ・闇鍋で猿の狂人が出たら、猿凸の対象になる役職（保安官・天秤・開拓者・独裁者）を合わせて最低1枚出す
 *     （roles.js の SYNERGY_COUNT_RULES。マイクラ版 YAMINABE_MONKEY_MADMAN_TARGET_ROLES）。
 *   ・猿の狂人がいて保安官・天秤・独裁者が1枚もない盤面では、開拓者がいればその運命を「壊滅」に寄せる
 *     （マイクラ版 configureMonkeyMadmanTrailblazerSynergy。net.js の startGame で模倣の割り当てのあとに呼ぶ）。
 * CPU: 猿の狂人自身に夜・昼の行動は無い。CPU の保安官・ヴァニティ・天秤・独裁者も本番経路（host 関数）で猿凸する。
 * デバッグ: 猿の狂人自身の昼能力は無いので専用の kind は無い。デバッグの昼能力（shoot/libra/dictate 等）も host 関数経由で猿凸する。
 * 黄泉: マイクラ版の yomiCutStates に猿の狂人の記録は無いので、黄泉では断ち切られない（他の干支狂人と同じ）。
 * トラップマスター（罠師）: 罠師の移植時に確認済み。猿の狂人は受動役職で昼能力が無いため、罠の干渉は無い（罠は昼能力への共通ゲートでのみ発動する）。
 */
(function (ONW) {
  const ID = "monkey_madman";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const eff = (g, id) => (ONW.mimic && ONW.mimic.eff ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "rooster_madman", "dog_madman", "boar_madman"];
  const TARGET_ROLES = ["sheriff", "libra", "trailblazer", "dictator"];   // マイクラ版 YAMINABE_MONKEY_MADMAN_TARGET_ROLES

  const rand = { next: () => Math.random() };
  const pick = (arr) => (arr.length ? arr[Math.floor(rand.next() * arr.length) % arr.length] : null);

  /** 発動中の猿の狂人のID一覧（マイクラ版 hasActiveMonkeyMadman の条件: 実効役職が猿の狂人・封印されていない・投票前に死んでいない） */
  function activeHolders(g) {
    if (!g || !g.players) return [];
    return g.players.filter((p) => eff(g, p.id) === ID && !(ONW.seal && ONW.seal.is(g, p.id)) && !isDead(g, p.id)).map((p) => p.id);
  }
  const hasActive = (g) => activeHolders(g).length > 0;

  /** 単体対象の猿凸（マイクラ版 applyMonkeyMadmanSingleTarget）: 実際の対象を返す。猿凸が起きなければ null（元の対象のまま・記録もしない） */
  function redirectSingle(g, actorId, selectedId, role) {
    if (!hasActive(g)) return null;
    const pool = (g.players || []).filter((p) => p.id !== actorId && !isDead(g, p.id)).map((p) => p.id);
    const actual = pick(pool);
    if (!actual) return null;
    (g.monkeyRedirects = g.monkeyRedirects || []).push({ actorId, role, selectedIds: [selectedId], actualIds: [actual] });
    return actual;
  }
  /** ペア対象の猿凸（マイクラ版 applyMonkeyMadmanPairTargets）: [実際の1人目, 実際の2人目] を返す。どちらか決められなければ null（元のペアのまま・記録もしない） */
  function redirectPair(g, actorId, a, b, role) {
    if (!hasActive(g)) return null;
    const alive = (g.players || []).filter((p) => !isDead(g, p.id)).map((p) => p.id);
    const first = pick(alive);
    const second = pick(alive.filter((x) => x !== first));
    if (!first || !second) return null;
    (g.monkeyRedirects = g.monkeyRedirects || []).push({ actorId, role, selectedIds: [a, b], actualIds: [first, second] });
    return [first, second];
  }
  /** 結果情報の行（マイクラ版 vote.js の文どおり） */
  function lines(g, nm) {
    const rn = (r) => (ONW.roles.getInfo(r) || {}).name || r;
    return ((g && g.monkeyRedirects) || []).map((e) => `猿凸により${rn(e.role)} ${nm(e.actorId)}の能力先は${e.selectedIds.map(nm).join("、")}から${e.actualIds.map(nm).join("、")}に変わっていました。`);
  }
  /** 開拓者の運命シナジー（マイクラ版 configureMonkeyMadmanTrailblazerSynergy）: 猿がいて保安官・天秤・独裁者が1枚もなければ、開拓者の運命を「壊滅」に寄せる */
  function applyTrailblazerSynergy(g) {
    if (!g || !ONW.trailblazer) return false;
    const board = [...Object.values(g.initialRoles || {}), ...(g.center || [])];
    if (!board.includes(ID)) return false;
    if (board.some((r) => ["sheriff", "libra", "dictator"].includes(r))) return false;
    if (!board.includes("trailblazer")) return false;
    let changed = false;
    const fix = (key) => {
      if (!ONW.trailblazer.isCard(g, key)) return;
      g.mimicRole = g.mimicRole || {};
      if (g.mimicRole[key] !== ONW.trailblazer.ROLE_OF.destruction) { g.mimicRole[key] = ONW.trailblazer.ROLE_OF.destruction; changed = true; }
    };
    (g.players || []).forEach((p) => { if ((g.initialRoles || {})[p.id] === "trailblazer") fix(p.id); });
    (g.center || []).forEach((r, i) => { if (r === "trailblazer") fix("g:" + i); });
    if (changed) (g.trailInfo || []).forEach((x) => { x.fate = "destruction"; });   // trailInfo は配られた開拓者のぶんだけ（全て開拓者の行）なので全部差し替えてよい
    return changed;
  }
  /** 実績（wiki/js/wiki-data.js の猿の狂人の実績。first_ は履歴系なので返さない＝他の役職と同じ） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;
    if (won) out.push("win_monkey_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_monkey_madman");
    return out;
  }

  ONW.defineRole(ID, {
    info: {
      deck: 151, name: "猿の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.7003, sealTarget: true,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力も昼の能力もありません。猿の狂人が生きて現世にいる間、保安官・ヴァニティ・独裁者・天秤が昼能力を使うと、その人のカードが🐵マークでめくれ、能力の対象がランダムな人に変わります（保安官・ヴァニティ・独裁者は自分以外の生存者から、天秤は生存者の中から別々の2人）。対象が元の人と同じになることもあります。猿凸が起きたことは結果発表で分かります。",
    },
    groups: { mad: 3.004, "transform:dark_avatar": 33 },
    achievements,
    // 昼の猿凸演出（stage.js の flashes が g.monkeyFlash を渡す。全員に届く "monkeyfx" で積まれる）:
    // 能力を使った人のカードが 🐵 の面（stage.js の MONKEY_MARK = "__monkey"）でめくれ、しばらくして裏に戻る（ヴァニティの stageFlash と同じ仕組み）
    stageFlash: {
      field: "monkeyFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = "__monkey"; SK.glow[k] = true;
          SK.paint(SK.G());
        }, 150 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 150 + list.length * 380 + 2400);
      },
    },
  });
  ONW.monkeyMadman = { activeHolders, hasActive, redirectSingle, redirectPair, lines, applyTrailblazerSynergy, achievements, TARGET_ROLES };
})(window.ONW = window.ONW || {});
