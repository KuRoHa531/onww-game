/** 早とちり（村人陣営）: 受動役職。夜の能力は無い。
 *  自分が投票した対象が追放された場合、その対象が「昇格していない狂人・狼夢人・狼憑き・妖狸・スパイ」なら
 *  人狼を追放できたことにして、人狼陣営の勝利を村人陣営の勝利にひっくり返す（成功）。
 *  逆に、その対象が「白狼・忘却の人狼」だった場合は人狼を追放できなかったことにして、
 *  村人陣営の勝利を人狼陣営の勝利にひっくり返す（失敗。他に本物の人狼が追放されていれば失敗は起きない）。
 *  最多得票者・同数最多者に投票していなかった場合（＝投票先が追放されなかった場合）は発動しない。
 *  判定はマイクラ版 applyHayatochiriOutcome（vote.js）の移植:
 *    ・対象者は最終役職が早とちりの人だけ。封印されていると発動しない（マイクラ版 isSealedPlayerId）。
 *    ・投票先は本人の生の投票（game.votes）。最多票の判定は集計後（書き換え・疑似票・強制込み）の票数。
 *    ・対象の役職は実効役職（クローンの思い込み・模倣の人狼の模倣先・ドッペルゲンガーのコピー先込み）。
 *    ・成功した早とちりは勝者に追加される（マイクラ版: 翻転のあとに success の人を winners へ追加）。
 *  Web版への写像（解釈点。docs/hayatochiri.md）:
 *    ・マイクラ版の preserveTitle（単独勝利などの確定タイトルでは割り込まない）は、Web版では
 *      「勝敗タイトルが『村人陣営勝利』『人狼陣営勝利』の素の結果のときだけ翻転する」＋
 *      乗っ取りフラグ（foxTake / tanukiTake / lawyerTake / shufflerTake / wagererTake）が立っているときは翻転しない、で再現した。
 *    ・適用位置はマイクラ版どおり勝負師の直後（finalizeResultWithChicken の順序: 勝負師 → 早とちり → 追加勝利）。
 *      Web版では determineWinnersCore の勝負師ブロックの直後で ONW.hayatochiri.apply を呼ぶ。
 *  変化候補: 光の使徒のみ（マイクラ版 TRANSFORM_ROLE_GROUPS[LIGHT_APOSTLE]）。銀色の影は不可。
 *  模倣不可（マイクラ版 NON_MIMICABLE_ROLES）。コスプレ可。シャッフラー山札入り。ペルソナの仮面候補。
 *  封印対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に無い。ただし判定側は封印チェックを持つ）。
 *  ハッキング: 対象にも思い込み側にもなる。思い込みだけでは発動せず、本物の早とちりがハッキングされていても発動する（マイクラ版どおり）。
 *  闇鍋シナジー: 早とちりが出る闇鍋には 狼憑き・狼夢人・白狼・忘却の人狼・スパイ・妖狸 のいずれかを最低1枚
 *    （マイクラ版 roles.js の4役＋2026-11-26の作者指示でスパイ・妖狸を追加。成功判定 SUCCESS_ROLES には両方とも元々含まれる）。
 */
(function (ONW) {
  const ID = "hayatochiri";
  /** 成功扱いの役職（マイクラ版 HAYATOCHIRI_SUCCESS_EXTRA_ROLES）。狂人系は別枠（昇格していない場合のみ成功） */
  const SUCCESS_ROLES = ["wolf_dreamer", "wolf_marked", "yokai_tanuki", "spy"];
  /** 失敗扱いの役職（マイクラ版 HAYATOCHIRI_FAIL_ROLES） */
  const FAIL_ROLES = ["white_wolf", "forgetful_wolf"];
  const eff = (g, id) => (ONW.mimic && ONW.mimic.eff ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  /** 勝敗の所属判定（vote.js の素の分岐と同じ: ホタルの陣営解決 → 魔法少女の闇落ち込み） */
  const teamOf = (g, id) => (ONW.hotaru && ONW.hotaru.teamOf ? ONW.hotaru.teamOf(g, id)
    : ONW.magicalGirl && ONW.magicalGirl.teamOf ? ONW.magicalGirl.teamOf(g, id)
      : ((ONW.ROLE_INFO || {})[(g.currentRoles || {})[id]] || {}).team);
  /** マイクラ版 isRealWolfId: 闇落ちした魔法少女 / 模倣の人狼 / 実効役職が本物の人狼（昇格した狂人は含まない） */
  const isRealWolf = (g, id) => {
    if (ONW.magicalGirl && ONW.magicalGirl.isDark && ONW.magicalGirl.isDark(g, id)) return true;
    if ((g.currentRoles || {})[id] === "mimic_wolf") return true;
    return (ONW.WOLF_KIND || []).includes(eff(g, id));
  };

  /** 各早とちりの勘違いの結果を計算して game.hayatochiriOutcome に記録する。
   *  戻り値: { [早とちりのID]: "success" | "fail" | "none" } */
  function outcomes(g) {
    const out = {};
    const counts = (ONW.vote && ONW.vote.tally) ? ONW.vote.tally(g) : {};
    const vals = Object.values(counts);
    const max = vals.length ? Math.max(...vals) : 0;
    const executed = new Set(g.executed || []);
    for (const p of g.players || []) {
      if ((g.currentRoles || {})[p.id] !== ID) continue;
      out[p.id] = "none";
      const t = (g.votes || {})[p.id];   // 本人の生の投票（書き換えで変わった先ではない。マイクラ版 game.votes）
      if (!t) continue;
      if (ONW.seal && ONW.seal.is(g, p.id)) continue;   // 封印されていると発動しない
      if (!executed.has(t)) continue;                  // 投票先が追放されていない
      if (!(max > 0 && counts[t] === max)) continue;   // 投票先が最多得票者・同数最多者でない
      const tr = eff(g, t);
      if (FAIL_ROLES.includes(tr)) { out[p.id] = "fail"; continue; }
      if (SUCCESS_ROLES.includes(tr)) { out[p.id] = "success"; continue; }
      // 昇格していない狂人を追放しても、人狼を追放できたことにする
      if ((ONW.MAD_KIND || []).includes(tr) && !(g.promotedWolfIds || []).includes(t)) out[p.id] = "success";
    }
    g.hayatochiriOutcome = out;
    return out;
  }

  /** 勝敗への適用（determineWinnersCore の勝負師の直後から呼ばれる）。
   *  結果（勝者・タイトル・詳細）が変わったら true。勘違いの記録（outcomes）は常に行う。 */
  function apply(g) {
    const oc = outcomes(g);
    const holders = Object.keys(oc);
    if (!holders.length) return false;
    // マイクラ版 preserveTitle 相当: 乗っ取りが確定している結果には割り込まない（記録だけ残る）
    if (g.foxTake || g.tanukiTake || g.lawyerTake || g.shufflerTake || g.wagererTake) return false;
    if (g.winTitle !== "村人陣営勝利" && g.winTitle !== "人狼陣営勝利") return false;
    const ids = (g.players || []).map((p) => p.id);
    const cw = g.cursedWolfIds || [];
    const wolfSet = ids.filter((id) => cw.includes(id) || teamOf(g, id) === ONW.TEAM.WOLF);
    const villageSet = ids.filter((id) => !cw.includes(id) && teamOf(g, id) === ONW.TEAM.VILLAGE);
    if (ONW.multiPersona) { ONW.multiPersona.teamWinners(g, ONW.TEAM.WOLF).forEach((id) => { if (!wolfSet.includes(id)) wolfSet.push(id); }); ONW.multiPersona.teamWinners(g, ONW.TEAM.VILLAGE).forEach((id) => { if (!villageSet.includes(id)) villageSet.push(id); }); }   // 多重人格: 最終人格の陣営の側として数える（翻転で勝者集合を作り直すときに落とさない）
    const ten = (ONW.vote && ONW.vote.tenaciousLostIds) ? ONW.vote.tenaciousLostIds(g) : [];   // 執念の狂人: 人狼陣営の勝者には入れない（vote.js の素の分岐と同じ）
    const teams = [...(g.winTeams || [])];
    const w = new Set(g.winnerIds || []);
    const before = [...w].sort().join(",");
    let flipped = false;
    // 成功: 人狼陣営が勝っていたら、村人陣営の勝利にひっくり返る
    if (holders.some((id) => oc[id] === "success") && teams.includes("人狼陣営")) {
      wolfSet.forEach((id) => w.delete(id));
      villageSet.forEach((id) => w.add(id));
      teams.splice(teams.indexOf("人狼陣営"), 1, "村人陣営");
      g.winTitle = "村人陣営勝利"; g.winners = [ONW.TEAM.VILLAGE];
      g.winDetail = "早とちりの勘違いにより人狼を追放できたことになったため、村人陣営の勝利です。";
      g.winBaseIds = villageSet.filter((id) => w.has(id));
      flipped = true;
    }
    // 失敗: 村人陣営が勝っていたら（成功でひっくり返った直後も含む。マイクラ版の順序どおり）、
    // 失敗対象以外に本物の人狼が追放されていない場合に限り、人狼陣営の勝利にひっくり返る
    const failTargets = new Set(holders.filter((id) => oc[id] === "fail").map((id) => (g.votes || {})[id]).filter(Boolean));
    if (failTargets.size && teams.includes("村人陣営")) {
      const otherRealWolfExecuted = (g.executed || []).some((id) => !failTargets.has(id) && isRealWolf(g, id));
      if (!otherRealWolfExecuted) {
        villageSet.forEach((id) => w.delete(id));
        wolfSet.filter((id) => !ten.includes(id)).forEach((id) => w.add(id));
        teams.splice(teams.indexOf("村人陣営"), 1, "人狼陣営");
        g.winTitle = "人狼陣営勝利"; g.winners = [ONW.TEAM.WOLF];
        g.winDetail = "早とちりの勘違いにより人狼を追放できなかったことになったため、人狼陣営の勝利です。";
        g.winBaseIds = wolfSet.filter((id) => w.has(id) && !ten.includes(id));
        flipped = true;
      }
    }
    // 成功した早とちりは勝者に追加される（マイクラ版: 翻転のあと）
    for (const id of holders) if (oc[id] === "success") w.add(id);
    g.winnerIds = [...w];
    g.winTeams = teams;
    return flipped || [...w].sort().join(",") !== before;
  }

  /** 結果情報（情報確認）: 勘違いが起きた早とちりだけを出す（マイクラ版に専用の行は無いが、第6バッチ共通指示で追加） */
  function lines(g, nm) {
    const oc = (g.hayatochiriOutcome && Object.keys(g.hayatochiriOutcome).length) ? g.hayatochiriOutcome : outcomes(g);
    const out = [];
    for (const p of g.players || []) {
      const o = oc[p.id];
      if (!o || o === "none") continue;
      const t = (g.votes || {})[p.id];
      if (!t) continue;
      out.push(o === "success"
        ? `早とちり ${nm(p.id)} は ${nm(t)} を人狼と決めつけていました。`
        : `早とちり ${nm(p.id)} は ${nm(t)} を村人と決めつけていました。`);
    }
    return out;
  }

  /** 実績（マイクラ版 stats.js）: first / win は village 共通枠。固有2つは「初期役職に人狼陣営（狂人含む）の役職がいた」ことが条件（マイクラ版 initialWolfJudgeExists = isWolfTeamRoleForStats） */
  function achievements(g, id, won) {
    const out = [];
    const init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID) out.push("first_hayatochiri");
    if (fin !== ID) return out;
    if (won) out.push("win_hayatochiri");
    const wolfExisted = (g.players || []).some((p) => ((ONW.ROLE_INFO || {})[(g.initialRoles || {})[p.id]] || {}).team === ONW.TEAM.WOLF);
    const oc = (g.hayatochiriOutcome || {})[id];
    if (wolfExisted && oc === "success" && won) out.push("hayatochiri_wolf_assumption_win");
    if (wolfExisted && oc === "fail" && !won) out.push("hayatochiri_villager_assumption_loss");
    return out;
  }

  ONW.defineRole(ID, {
    info: { deck: 164, name: "早とちり", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24,
      desc: "村人陣営。夜の能力はありません。自身が投票した対象が追放された場合、昇格していない狂人・狼夢人・狼憑き・妖狸・スパイを追放しても人狼を追放できたことにします。また、自身が投票した対象が追放されたとき、その対象が白狼・忘却の人狼だった場合は人狼を追放できなかったことにします。最多得票者・同数最多者に投票していなかった場合は能力は発動しません。" },
    groups: { "transform:light_apostle": 64 },
    achievements,
    cpuClaim(k, g, p, r, i, c) { c.co = ID; },   // 早とちり: 結果開示は無いので、必ず早とちりCOだけする（パン屋と同じ形）
    cpuLie: { role: ID, weight: 4, order: 64, claim: () => ({ co: ID, result: null }) },   // 騙りで名乗ることもある（COだけ）
  });

  ONW.hayatochiri = { outcomes, apply, lines, achievements, isRealWolf, SUCCESS_ROLES, FAIL_ROLES };
})(window.ONW);
