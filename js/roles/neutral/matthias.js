/**
 * マティアス／娘ちゃん（第三陣営ペア・マイクラ版 MATTHIAS / DAUGHTER / Wiki の説明が正。発案: ダイ、元ネタ: リンバスカンパニー）:
 *   マティアスが夜に自分以外のプレイヤー1人を選ぶと、その人の役職が「娘ちゃん」になる（カードはそのまま、役職だけが娘ちゃんに書き換わる）。
 *   マティアスが死にそうなとき、娘ちゃんが生存していれば、娘ちゃんが犠牲になってマティアスの死亡を回避する（従者の身代わりと同じ犠牲）。
 *   娘ちゃんは内部専用役職（直接配役できない。マティアスに選ばれた人だけがなる）。
 *
 * ・夜の選択（処理順 docs/role-process-order.md: グレムリン → マティアス → 怪盗。Web版では gremlin 段階の order 20）:
 *   自分以外の参加者1人を選ぶ。選ばれた人の最終役職が、その時点で「娘ちゃん」に変わる（マイクラ版 addMatthiasDaughter:
 *   昇格した人狼の記録・魔法少女の闇堕ち記録は消え、前の役職に紐づく記録は上書き扱いで消える）。
 *   対象が鍵師にロックされていると失敗する（能力は消費される。マイクラ版 matthiasFailed = "target_locked"）。
 *   封印されているマティアスは失敗する（net.js の封印チェックが共通で処理）。同じマティアスが選び直したときは、前の娘との関係だけが切れる（前の娘は娘ちゃんのまま残る。マイクラ版 rememberMatthiasDaughter）。
 *   墓荒らし・ドッペルゲンガーでマティアスを手にした場合は朝のうちに選べる（morning / cpuNight.chain。マイクラ版の借用役職フロー）。
 *   酔っ払い（未覚醒）のマティアスは夜に選べない（他の夜役職と同じ。覚めたあとは最終役職がマティアスでも選び直しはしない ＝ 娘がいないまま終わる。マイクラ版も酔っ払い中の行動は無い）。
 * ・関係の持ち方: g.matthiasDaughters[マティアスの持ち主ID] = [娘ちゃんの「カードID」]（ONW.ROLE_BOUND_KEYS。マティアスのカードについて動く）。
 *   娘ちゃん側は「カード」で追うので、娘ちゃんのカードが怪盗・いたずらっ子などで別の人に移れば、移った先の人が娘ちゃんになる
 *   （マイクラ版 copyMatthiasDaughterMarker / swapMatthiasDaughterMarkers と同じ考え方）。親子関係の読み出しは daughtersOf / parentsOf が最終盤面から導く。
 * ・朝の演出（作者メモ「朝に 👧 マークでめくる」）: 夜に選んだマティアスの画面では、朝に選んだ人のカードが 👧 マークでめくれる（morning reveal "peek"）。
 *   娘ちゃん本人には、待機時間に自分のカードが 👧 マークでめくれて「あなたは娘ちゃんになりました。」と知らされる（本人の画面だけ。stageSettle "settleDaughter"）。
 *   マイクラ版に朝の公開は無いので、ほかの人には見せない（情報の出方はマイクラ版に合わせた解釈。報告書に明記）。
 * ・身代わり（マイクラ版 applyMatthiasSubstitution / matthiasDaughterSubstituteForSheriffTarget）:
 *   対象になる死: 投票の追放（昼中に死んだマティアスの救済も含む）/ 連鎖死（道連れ・心中・無理心中・後追い・噛殺・爆殺など）/ 保安官・ヴァニティの執行。
 *   対象にならない死: 妖狐の呪殺（死因 "fox"。マイクラ版の "curse_kill" 除外）。魔界公爵の追放会議では働かない（マイクラ版に公爵会議での身代わりは無い。従者の公爵会議身代わりは Web版独自の先行仕様で、マティアスには広げない）。
 *   娘ちゃんが複数いる（カードの移動で増えた）場合はランダムに1人。同じ娘ちゃんを複数の死にそうなマティアスが共有しているときは、救われるのはランダムに1人だけ（マイクラ版）。
 *   優先順位: 従者の身代わりより先（マイクラ版の執行フロー: daughter || servant）。投票では 騎士 → 従者 → 少佐 → マティアス の順（マイクラ版の投票解決の順序）。
 *   犠牲になった娘ちゃんは g.matthiasSubs = [{ m, d, when: "shot" | "vote" | "chain" }] に記録される（マイクラ版 matthiasSacrificeLog）。
 *   執行で犠牲になった娘ちゃんは、撃たれた人として勝利条件を失う（保安官の lostIds がそのまま見る。keepVictory には入れない）。
 * ・勝利条件（マイクラ版 applyThirdSpecials の MATTHIAS 節）: 最終盤面でマティアスを持っている人 p について:
 *   (1) 犠牲の記録があり（娘ちゃんを犠牲にして死亡を回避した）、p が勝利条件を失っていなければ p が「マティアス」として勝利（このとき娘側の判定はしない）。
 *   (2) それ以外は娘ごとに: p と娘が両方とも生存（勝利条件喪失も死亡扱い）なら両方が勝利（「マティアス」＆「娘ちゃん」）。
 *       娘が死亡していて、死因が「犠牲」でなければ、娘だけが「娘ちゃん」として勝利する（親が死んでいてもよい。マイクラ版のコードどおり）。
 *   勝敗への組み込みは vote.js の set()（乞食の追加勝利の隣）。勝てなかった恋人は追加勝利しない（他の追加勝利と同じ）。
 * ・CO: マティアスCOの結果開示は「○○を娘ちゃんにしていました。」（選んだ相手を選ぶ。マイクラ版のCO・CPU発言と同じ文言。co.js の kind "matthias"）。
 *   CPUも同じ文言で結果開示する（結果開示は AI議論OFF でも出る分類。docs/cpu-speech.md）。
 * ・ハッキング: マティアスは銀狼のハッキング対象から外れない（マイクラ版の除外はヴァニティ・ホタルのみ。NO_HACK に追加しない）。
 *   娘ちゃんは思い込み先にならない（マイクラ版 forbiddenFakeRoles に DAUGHTER。Web版では墓地の偽役職プールからも外す）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / shufflerEligibleRoles）:
 *   マティアス: 銀色の影の変化先に入る。光の使徒・闇の化身には入らない。シャッフラーの山札には入らない（shuffler.js の BLOCKED に追加）。コスプレは村人系のみなので入らない。模倣の人狼は第三陣営を模倣できない。
 *   娘ちゃん: どの変化プールにも入らない（内部専用役職。銀色の影にも入らない）。シャッフラーの山札にも入らない。
 * ・シナジー: マイクラ版の闇鍋シナジーにマティアス／娘をトリガーとするルールは無いので、ONW.SYNERGY_RULES への追加はなし。
 * ・乞食: 乞食の「取れない対象」にマティアスと娘ちゃんが最初から入っている（beggar.js の EXCLUDED_ROLES。実効役職ベースなので移植で自動的に効く）。
 *
 * 状態: g.matthiasDaughters = { [持ち主ID]: [娘のカードID] }（役職に紐づく。net.startGame が {} に戻す）
 *       g.matthiasSubs = [{ m, d, when }]（犠牲の記録。net.startGame が [] に戻す）
 *       g.matthiasFailed = { [持ち主ID]: "target_locked" }（鍵師ロックで失敗した記録。マイクラ版 matthiasFailed）
 * 呼び出し: 夜 = defineRole の night / morning / cpuNight。身代わり = vote.js（resolveElimination / resolveChain の kill）と sheriff.js / vanity.js の judge。
 *           勝敗 = vote.js の set() が ONW.matthias.extraWins を見る。結果発表 = net.js buildResultObj の res.matthiasSubs / res.matthiasPairs と stageResult。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const ID = "matthias", DID = "daughter";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  /** 最終盤面でマティアスを持っている人 */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => (g.currentRoles || {})[id] === ID);
  /** カードID → いまそのカードを持っている人（墓地にあるなら "g:番号" が返る。g.cards が無い初期状態では "P:ID" をそのまま解く） */
  function holderOfCard(g, cardId) {
    if (!g.cards) return String(cardId).startsWith("P:") ? String(cardId).slice(2) : String(cardId);
    const k = Object.keys(g.cards.at).find((x) => g.cards.at[x] === cardId);
    return k || String(cardId).slice(2);
  }
  /** マティアス m の娘ちゃん（最終盤面で娘ちゃんのカードを持っている人）。m が最終盤面でマティアスでなければ空 */
  function daughtersOf(g, m) {
    if (!g || (g.currentRoles || {})[m] !== ID) return [];
    const out = [];
    ((g.matthiasDaughters || {})[m] || []).forEach((card) => {
      const h = holderOfCard(g, card);
      if (h !== m && (g.players || []).some((p) => p.id === h) && (g.currentRoles || {})[h] === DID && !out.includes(h)) out.push(h);
    });
    return out;
  }
  /** 娘ちゃん d のマティアス（最終盤面） */
  function parentsOf(g, d) {
    return holders(g).filter((m) => daughtersOf(g, m).includes(d));
  }
  /** 最終盤面の [マティアス, 娘ちゃん] の組（結果発表・CO用） */
  function pairs(g) {
    const out = [];
    holders(g).forEach((m) => daughtersOf(g, m).forEach((d) => out.push([m, d])));
    return out;
  }
  /**
   * holder が target を娘ちゃんにする（マイクラ版 rememberMatthiasDaughter → addMatthiasDaughter）。
   * 対象が鍵師にロックされていると失敗して false（能力は消費される。g.matthiasFailed に記録）。
   * 娘ちゃん化の掃除（マイクラ版 addMatthiasDaughter + syncSingleRoleLinkedData）: 昇格した人狼の記録・魔法少女の闇堕ち記録を消し、
   * 前の役職に紐づく記録（state.js の上書き系ヘルパーと同じ並び）を消す。役職履歴には「娘ちゃん」を積む（カードは動かない）。
   */
  function makeDaughter(g, holder, target) {
    if (!target || target === holder || !(g.players || []).some((p) => p.id === target)) return false;
    if (ONW.keymaster && ONW.keymaster.blocks(g, target)) { (g.matthiasFailed = g.matthiasFailed || {})[holder] = "target_locked"; return false; }
    ONW.setRoleBound(g, "matthiasDaughters", holder, []);   // 前の娘との関係だけ切る（前の娘は娘ちゃんのまま。マイクラ版 rememberMatthiasDaughter）
    if ((g.currentRoles || {})[target] !== DID) {
      g.currentRoles[target] = DID;
      const t = (g.roleTrail = g.roleTrail || {}); (t[target] = t[target] || []).push(DID);
      if (g.cards && g.cards.trail) (g.cards.trail[target] = g.cards.trail[target] || []).push(g.cards.at[target]);   // カードは同じ（役職だけが変わる。copyRole と同じ積み方）
      g.promotedWolfIds = (g.promotedWolfIds || []).filter((id) => id !== target);   // 昇格した人狼ではなくなる
      g.mgDarkFallen = (g.mgDarkFallen || []).filter((id) => id !== target);          // 魔法少女の闇堕ち記録は消える
      ["carmenTarget", "akujoHonmei", "akujoKeep", "cupidPair", "breakerTargets", "keyTargets", "avengerTargets", "pranksterPicks", "watchdogOwners", "pureLoverTargets", "loveTargets", "freeterTargets", "visitorTargets", "muzzleTargets", "gremlinPicks", "mimicRole", "sealTargets", "reverserTarget", "lawyerClient", "lawyerClientRole", "mosesBonus", "matthiasDaughters"].forEach((k) => { if (g[k]) delete g[k][target]; });   // 上書きされた役職の記録は消す（shufflerPlace の並び + 自分がマティアスだった場合の親記録）
      if (g.shufflerMarks && ONW.cardAt) delete g.shufflerMarks[ONW.cardAt(g, target)];   // 上書きされたカードのシャッフラーの印は消える（copyRole と同じ）
      ONW.fixServants(g); if (ONW.avenger) ONW.avenger.fix(g); if (ONW.prankster) ONW.prankster.fix(g);
      if (ONW.fixExecutioners) ONW.fixExecutioners(g);
    }
    const card = ONW.cardAt ? ONW.cardAt(g, target) : "P:" + target;
    ONW.setRoleBound(g, "matthiasDaughters", holder, [card]);
    return true;
  }
  /** 犠牲の記録（マイクラ版 matthiasSacrificeLog）。when: "shot"（執行）| "vote"（投票・昼中死亡の救済）| "chain"（連鎖） */
  function noteSacrifice(g, m, d, when) {
    g.matthiasSubs = g.matthiasSubs || [];
    if (g.matthiasSubs.some((x) => x.d === d)) return;
    g.matthiasSubs.push({ m, d, when });
  }
  /** 身代わりに立てる娘ちゃんの候補（生きていて、死にそうな人の中にいない娘）からランダムに1人。なければ null */
  function pickDaughter(g, m, exclude) {
    const cands = daughtersOf(g, m).filter((d) => d !== m && !isDead(g, d) && !(exclude && exclude.has(d)));
    return cands.length ? ONW.utils.randomChoice(cands) : null;
  }
  /**
   * 保安官・ヴァニティの執行の身代わり（マイクラ版 matthiasDaughterSubstituteForSheriffTarget）: 撃たれた人が最終盤面のマティアスで、
   * 生きている娘ちゃんがいれば、その娘ちゃんのIDを返す（従者の身代わりより先に見ること）。いなければ null。
   */
  function daughterSubForShot(g, target) {
    if (!g || (g.currentRoles || {})[target] !== ID || isDead(g, target)) return null;
    return pickDaughter(g, target, new Set((g.matthiasSubs || []).map((x) => x.d)));
  }
  /**
   * 連鎖死の身代わり（vote.js の resolveChain の kill から呼ぶ）: 死ぬ人 t が最終盤面のマティアスなら、身代わりの娘ちゃんを返す。
   * isGone(id): その人がすでに死んでいる（または同時に死ぬ）か。呪殺は連鎖に無いので、ここでは全死因が対象（マイクラ版の後段の身代わり）。
   */
  function daughterSubForChain(g, t, isGone) {
    if (!g || (g.currentRoles || {})[t] !== ID) return null;
    const cands = daughtersOf(g, t).filter((d) => d !== t && !isGone(d) && !(g.matthiasSubs || []).some((x) => x.d === d));
    return cands.length ? ONW.utils.randomChoice(cands) : null;
  }
  /**
   * 投票の身代わり（マイクラ版 applyMatthiasSubstitution。vote.js の resolveElimination が 従者 → 少佐 のあとに呼ぶ）:
   * 追放が決まった人と、昼中に死亡した人（呪殺＝死因 "fox" は除く）の中で、最終盤面がマティアスの人を、生きている娘ちゃんの犠牲で救う。
   * 救われた人は game.eliminated / game.deadIds から外れ（死因の記録も消す）、娘ちゃんが代わりに game.eliminated に入る。
   * 同じ娘ちゃんを複数のマティアスが共有しているときは、救われるのはランダムに1人だけ。戻り値: 起きた身代わり [{ m, d }]
   */
  function applyVoteSubstitution(game) {
    const out = [], sacrificed = new Set((game.matthiasSubs || []).map((x) => x.d));
    const dying = (id) => game.eliminated.includes(id) || (game.deadIds || []).includes(id);
    const curseDead = (id) => (game.deadIds || []).includes(id) && !game.eliminated.includes(id) && (game.deadKind || {})[id] === "fox";   // 呪殺で死んだ人は身代わりできない（マイクラ版 curse_kill 除外）
    let changed = true, guard = 0;
    while (changed && guard++ < 50) {
      changed = false;
      for (const m of holders(game)) {
        if (!dying(m) || curseDead(m)) continue;
        const cands = daughtersOf(game, m).filter((d) => d !== m && !dying(d) && !(game.deadIds || []).includes(d) && !sacrificed.has(d));
        if (!cands.length) continue;
        const d = ONW.utils.randomChoice(cands);
        const dyingParents = parentsOf(game, d).filter((p) => dying(p) && !curseDead(p));
        const saved = dyingParents.length > 1 ? ONW.utils.randomChoice(dyingParents) : m;   // 共有されている娘: 救われるのは1人だけ
        game.eliminated = game.eliminated.filter((x) => x !== saved);
        game.deadIds = (game.deadIds || []).filter((x) => x !== saved);
        if ((game.deadKind || {})[saved]) delete game.deadKind[saved];
        if ((game.deadBy || {})[saved]) delete game.deadBy[saved];
        if ((game.deadStep || {})[saved]) delete game.deadStep[saved];
        game.mentalIds = (game.mentalIds || []).filter((x) => x !== saved);
        game.shockIds = (game.shockIds || []).filter((x) => x !== saved);
        if (!game.eliminated.includes(d)) game.eliminated.push(d);
        sacrificed.add(d);
        noteSacrifice(game, saved, d, "vote");
        out.push({ m: saved, d });
        changed = true;
        break;
      }
    }
    return out;
  }
  /**
   * 追加勝利の判定（マイクラ版 applyThirdSpecials の MATTHIAS 節。vote.js の set() が呼ぶ）。
   * dead: ONW.vote.deadSet(game) / shotLoseIds: 撃たれて勝利条件を失った人（マイクラ版 noVictoryIds 相当。「死亡扱い」の判定に使う）
   * 戻り値: { matthias: [マティアスとして勝つ人], daughters: [娘ちゃんとして勝つ人] }
   */
  function extraWins(g, dead, shotLoseIds) {
    const lose = new Set(shotLoseIds || []), out = { matthias: [], daughters: [] };
    const gone = (id) => dead.has(id) || lose.has(id);
    holders(g).forEach((p) => {
      const sacrifice = (g.matthiasSubs || []).some((x) => x.m === p);
      if (sacrifice && !lose.has(p)) { out.matthias.push(p); return; }   // 犠牲で回避したマティアスが勝利（娘側の判定はしない。マイクラ版 continue）
      daughtersOf(g, p).forEach((d) => {
        if (!gone(p) && !gone(d)) { if (!out.matthias.includes(p)) out.matthias.push(p); out.daughters.push(d); }   // 両方生存: 2人とも勝利
        else if (gone(d) && !(g.matthiasSubs || []).some((x) => x.d === d)) out.daughters.push(d);   // 娘が犠牲以外で死亡: 娘だけ勝利
      });
    });
    return out;
  }
  /**
   * コピーへの追従（state.js の ONW.copyRole / ONW.gremlinCopy から呼ばれる。マイクラ版 copyMatthiasDaughterMarker / 親データのコピー）:
   * 娘ちゃんをコピーした人は、コピー元と同じマティアスたちの娘になる。マティアスをコピーした人は（グレムリンのコピーのときだけ）娘の関係もコピーする
   * （ドッペルゲンガーでマティアスを手にした人は、朝のうちに自分で選ぶので引き継がない）。
   */
  function copyLinks(g, srcId, dstId, role, isGremlin) {
    if (role === DID) parentsOf(g, srcId).forEach((m) => {
      const card = ONW.cardAt ? ONW.cardAt(g, dstId) : "P:" + dstId;
      const list = [...((g.matthiasDaughters || {})[m] || [])];
      if (!list.includes(card)) { list.push(card); ONW.setRoleBound(g, "matthiasDaughters", m, list); }
    });
    if (role === ID) {
      const list = isGremlin ? [...((g.matthiasDaughters || {})[srcId] || [])] : [];   // グレムリンのコピーは関係ごと引き継ぐ / ドッペルゲンガーは引き継がない（朝のうちに自分で選ぶ）
      if (list.length) ONW.setRoleBound(g, "matthiasDaughters", dstId, list);
      else if (g.matthiasDaughters) delete g.matthiasDaughters[dstId];   // 上書きされた側の古い親記録は消す（残すと、コピー元の娘がそのまま付いてくる）
    }
  }
  /** CO・結果開示の文言（人間のCOボタンとCPUの発言で一致させる。マイクラ版の「○○を娘ちゃんにしていました」） */
  const coText = (name) => `${name}を娘ちゃんにしていました。`;
  const coShort = (name) => `娘: ${name}`;
  /**
   * 実績（wiki-data.js の「マティアス」に定義済みの5つ）。Web版には実績を保存する仕組みが無いので「満たした実績ID」を返すだけ（先行移植と同じ形）。
   * won: その人が勝ったか / 組の相手も含めて判定する
   */
  function achievements(g, id, won) {
    const out = [], r = R();
    if (g.initialRoles && (g.initialRoles[id] === r.MATTHIAS || (g.currentRoles || {})[id] === r.MATTHIAS)) out.push("first_matthias");   // 初めてマティアスになる
    if (parentsOf(g, id).length || (g.roleTrail && (g.roleTrail[id] || []).includes(r.DAUGHTER))) out.push("first_daughter");   // 初めて娘ちゃんになる
    if (won && (g.currentRoles || {})[id] === r.MATTHIAS && daughtersOf(g, id).some((d) => !(g.deadIds || []).includes(d) && !((g.executed || []).includes(d)))) out.push("matthias_family");   // マティアスと娘ちゃんが両方生存して勝利
    if ((g.matthiasSubs || []).some((x) => x.m === id) && won) out.push("matthias_daughter_sacrifice");   // 娘ちゃんを犠牲にして勝利
    if ((g.currentRoles || {})[id] === r.MATTHIAS && !won) out.push("matthias_loss");   // マティアスで敗北する
    return out;
  }

  ONW.matthias = { holders, daughtersOf, parentsOf, pairs, makeDaughter, noteSacrifice, daughterSubForShot, daughterSubForChain, applyVoteSubstitution, extraWins, copyLinks, coText, coShort, achievements };

  // ---- 夜の実行（人間・CPU共通の本体） ----
  /** 選んだ相手を娘ちゃんにする。戻り値: 成功したら相手のID、失敗（ロック）なら null */
  function act(g, holder, target) {
    if (!target || target === holder) return null;
    return makeDaughter(g, holder, target) ? target : null;
  }
  // CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ。マイクラ版 cpuSpecifiedAbilityTarget と同じ）
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    if (!act(g, p.id, t.id)) { n.hold(p.id, "対象の役職がロックされていたため、娘ちゃんにできませんでした。"); n.nn(rid); return; }
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を娘ちゃんにしました。`);
    n.hold(p.id, `${t.name} を娘ちゃんにしました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  ONW.defineRole("matthias", {
    info: { observe: "player", sealTarget: true, deck: 122, name: "マティアス", team: ONW.TEAM.THIRD, wakeOrder: 54.5, sort: 50,
      desc: "第三陣営。夜に自分以外のプレイヤー1人を選び、その人を娘ちゃんにします（選ばれた人の役職は娘ちゃんになります）。朝、選んだ人のカードが👧マークでめくれます。マティアスが死亡しそうなとき、娘ちゃんが生存していれば、娘ちゃんが犠牲になってマティアスの死亡を回避します（保安官の執行・投票の追放・連鎖死が対象。妖狐の呪殺では回避できません）。マティアスと娘ちゃんが両方生存している場合、または娘ちゃんを犠牲にして死亡を回避した場合に、マティアスは追加で勝利します。娘ちゃんが犠牲以外の理由で死亡した場合は、娘ちゃんだけが追加で勝利します。対象が鍵師にロックされていると娘ちゃんにできません。" },
    groups: { "transform:silver_shadow": 26 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる。マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に MATTHIAS が入る）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>娘ちゃんにする相手</strong>のカードを1人分押してください。（自分以外）<br>選んだ人の役職は娘ちゃんになります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>娘ちゃんにする相手</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    cpuNight: { order: 90, stage: "gremlin", chain: true, run: cpuRun },   // グレムリン(order 80)のあと・怪盗の前（docs/role-process-order.md）
    night: {
      kind: "gremlin", order: 20,   // グレムリン(order 10)のあと・怪盗(robber 段階)の前（docs/role-process-order.md）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t || t === p.id) return;
        const real = ONW.watcher && ONW.watcher.shift ? ONW.watcher.shift(g, p.id, t, g.players.map((q) => q.id).filter((x) => x !== p.id)) : t;   // 静観者を選んだら、実際に娘ちゃんになる席は別の人（選んだ本人には静観者を選んだように見える）
        if (!real || real === p.id) { c.hold(p.id, ONW.watcher ? ONW.watcher.noneLine("娘ちゃんにする") : "娘ちゃんにできる人がいませんでした。"); return; }
        if (!act(g, p.id, real)) { c.hold(p.id, "対象の役職がロックされていたため、娘ちゃんにできませんでした。"); c.rev[p.id] = ONW.keymaster ? ONW.keymaster.failRev(g, p.id, p.id) : undefined; return; }   // 鍵師のロック: 失敗（能力は消費される）
        ONW.observeNote(g, p.id, [t], null, "matthias");
        ONW.newsNote(g, "matthias");
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(real)} を娘ちゃんにしました。`);
        c.hold(p.id, `${nameOf(t)} を娘ちゃんにしました。`);
        c.rev[p.id] = { kind: "peek", items: [{ k: `p:${real}`, role: "__daughter" }] };   // 朝: 選んだ人のカードが 👧 マークでめくれる（選んだ人の画面だけ）
      },
    },
    /** 墓荒らし・ドッペルでマティアスを手にしたとき: 朝のうちに選べる（マイクラ版の借用役職フロー） */
    morning: {
      run(c) {
        const g = c.g, nameOf = c.nameOf, id = c.id;
        const t = (c.players || [])[0];
        if (!t || t === id) return null;
        if (!act(g, id, t)) return { lines: ["対象の役職がロックされていたため、娘ちゃんにできませんでした。"], reveal: ONW.keymaster ? ONW.keymaster.failRev(g, id, id) : null, nextChain: null, failed: true };
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${nameOf(t)} を娘ちゃんにしました。`);
        return { lines: [`${nameOf(t)} を娘ちゃんにしました。`], reveal: { kind: "peek", items: [{ k: `p:${t}`, role: "__daughter" }] }, nextChain: null };
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 娘ちゃんにした相手を選ぶ（マイクラ版のCO文「○○を娘ちゃんにしていました。」）
    coResult: {
      kind: "matthias", targetLabel: "娘ちゃんにした相手",
      pickPlayer: (id, K) => [ONW.matthias.coText(K.nameOf(id)), { kind: "matthias", target: id }, null, "disclose", ONW.matthias.coShort(K.nameOf(id))],
    },
    /** CPU（マイクラ版 cpu.js）: マティアスCO + 結果開示「○○を娘ちゃんにしていました。」（結果開示なので AI議論OFF でも出る）。娘がいないときは通常の第三陣営の騙り */
    cpuClaim(k, g, p, r, i, c) {
      const ds = daughtersOf(g, p.id);
      if (!ds.length) return false;
      c.co = ID;
      c.result = { text: coText(nm(g, ds[0])), short: coShort(nm(g, ds[0])), claim: { kind: "matthias", target: ds[0] } };
    },
    // 結果発表の演出(stage.js の startResult / skipResult が引く): 投票の身代わり（従者の身代わりのあと）
    //   execExclude: 通常の追放フリップから除く人(犠牲になった娘ちゃん) / intro: マティアスのカードがめくれそうになる → 娘ちゃんのカードが「身代わり」の札でめくれる
    stageResult: {
      execExclude: (res) => (res.matthiasSubs || []).filter((x) => x.when === "vote").map((x) => x.daughterId),
      intro: { order: 20, run(R) {
        const { res, P, later, setCap, esc, paint, G, up, dead, badge, lovOn } = R;
        const subs = (res.matthiasSubs || []).filter((x) => x.when === "vote");
        subs.forEach((x) => {
          const mk = P(x.matthiasId), dk = P(x.daughterId), sh = res.history.find((h) => h.id === x.daughterId);
          later(() => { setCap(`<div class="res-cap__t t-wolf">娘ちゃんの犠牲</div><div>${esc(x.matthias)} が追放されそうになりました…</div>`); R.alm[mk] = true; paint(G()); }, R.t);
          later(() => {
            delete R.alm[mk];
            up[dk] = (sh && sh.role) || "daughter"; lovOn(x.daughterId); dead[dk] = true; badge[dk] = "身代わり";
            setCap(`<div class="res-cap__t t-wolf">娘ちゃんの犠牲</div><div>${esc(x.daughter)} が ${esc(x.matthias)} の身代わりになりました</div>`);
            paint(G());
          }, R.t + 1900);
          R.t += 4300;
        });
        if (subs.length && !R.exec.length) R.t -= 600;
      } },
    },
  });

  ONW.defineRole("daughter", {
    info: { deck: 123, name: "娘ちゃん", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 51,
      desc: "第三陣営（内部専用役職）。マティアスに選ばれた人がなる役職で、直接配役することはできません。夜の能力はありません。マティアスが死亡しそうになると、生存していれば犠牲になってマティアスの死亡を回避します。マティアスと両方生存していればマティアスと一緒に勝利し、犠牲以外の理由で死亡した場合は娘ちゃんだけが勝利します（犠牲になって死亡した場合は勝利しません）。" },
    // 変化候補には一切入らない（マイクラ版: SILVER_SHADOW / LIGHT_APOSTLE / DARK_AVATAR のどれにも DAUGHTER は入っていない。内部専用役職なので groups は付けない）
    // 本人への知らせ: 待機時間に、自分のカードが 👧 マークでめくれて知らされる（酔っ払い中は覚めるまで知らされない）
    settleMsg(c, p, mode) {
      const g = c.g;
      if ((g.currentRoles || {})[p.id] !== DID) return {};
      if (ONW.hiddenDrunk(g, p.id)) return {};
      if (!parentsOf(g, p.id).length) return {};
      return { logs: ["あなたは娘ちゃんになりました。"], daughterFlip: [p.id] };
    },
    soberLines(c, id) {   // 酔いが覚めた娘ちゃん: 自分が娘ちゃんだと分かる
      const g = c.g;
      return (g.currentRoles || {})[id] === DID && parentsOf(g, id).length ? ["あなたは娘ちゃんです。"] : [];
    },
    // 待機時間の演出: 自分のカードが 👧 マークでめくれる（本人の画面だけ。stage.js の面 "__daughter"）
    stageSettle: {
      field: "settleDaughter", shown: "settleDaughterShown",
      run: { order: 22, run(ids, SK) { SK.later(() => { ids.forEach((id) => SK.show(`p:${id}`, SK.DAUGHTER_MARK)); }, 300); } },
    },
  });
})(window.ONW);
