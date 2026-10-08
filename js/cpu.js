/**
 * cpu.js — CPUプレイヤーの思考（ホストの端末で動く）
 * 夜の行動 → 昼の発言(CO) → 投票 を、役職ごとの持っている情報から決める。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const cpu = {};
  const rn = (r) => ONW.roles.getInfo(r).name;
  const pick = (a) => ONW.utils.randomChoice(a);
  const nameOf = (g, id) => (g.players.find((p) => p.id === id) || {}).name || "?";
  const infoOf = (g, id) => (g.cpuInfo[id] = g.cpuInfo[id] || { known: {}, grave: [] });

  const WOLF = () => ONW.WOLF_KIND;
  const isWolf = (r) => WOLF().includes(r);
  const isMad = (r) => ONW.MAD_KIND.includes(r);
  /** 人外(村人陣営でない役職: 人狼・狂人・てるてる・第三陣営など)。奪った/最終的に手にした役職がこれなら、昼は村人側と偽る */
  const isNonVillage = (r) => ONW.roles.getInfo(r).team !== "village";

  /** 役職ファイル(js/roles/<役職>.js)のCPUフックが使う道具(役職固有ではない) */
  cpu.kit = {
    infoOf, isWolf, isMad, pick, nameOf,
    isVisibleWolf: (r) => ONW.VISIBLE_WOLF.includes(r),   // 一匹狼は誰からも見えない
  };
  /** 墓荒らし・ドッペル・酔い覚めのあと、朝のうちに夜の行動を使える役職(cpuNight.chain を持つ役職)。excl は除く */
  cpu.chainRoles = (excl) => ONW.roleIds().filter((id) => id !== excl && ((ONW.roleDef(id) || {}).cpuNight || {}).chain);
  /** CPUの夜の行動の実行リスト: [{ roles, nd(=cpuNight), order, idx }]（同じ run を共有する役職は1組にまとまる） */
  const nightSteps = () => {
    const steps = [];
    ONW.roleIds().forEach((id, idx) => {
      const nd = (ONW.roleDef(id) || {}).cpuNight;
      if (!nd || typeof nd.run !== "function") return;
      let s = steps.find((x) => x.nd.run === nd.run);
      if (!s) steps.push((s = { nd, order: nd.order == null ? 100 : nd.order, idx, roles: [] }));
      s.roles.push(id);
    });
    return steps.sort((a, b) => a.order - b.order || a.idx - b.idx);
  };

  /** CPUの夜行動（占い師系 → 墓荒らし → ドッペルゲンガー → シャッフラー → グレムリン → 怪盗 → いたずらっ子の順）。占いは初期役職を見るので順序に影響されない。
   *  役職ごとの行動は各役職ファイルの cpuNight.run（order の小さい順）。ここは「誰が・いつ使うか」の枠組みだけ */
  cpu.runNight = function (g, stage, ids) {   // stage: "init" | "seer" | "relic" | "doppel" | "shuffler" | "gremlin" | "robber" | "tm"（省略時は全部を起床順に実行）
    const all = !stage;
    if (all || stage === "init") g.cpuInfo = {};
    g.cpuInfo = g.cpuInfo || {};
    // 酔っ払いが重なっているCPUは、酔いが覚める(late)までは夜の行動も情報もない
    const cpus = stage === "late" ? g.players.filter((p) => (ids || []).includes(p.id)) : g.players.filter((p) => p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]));
    const role = (p) => g.initialRoles[p.id];
    // 人狼系は互いを知っている（役職ごとの情報は cpuInit: 狂信者・マーリン・共有者・従者・処刑人・大狼・神）
    if (all || stage === "init") cpus.forEach((p) => {
      const vis = (r) => ONW.VISIBLE_WOLF.includes(r);   // 一匹狼は誰からも見えない
      if (vis(role(p)) && role(p) !== "forgetful_wolf") g.players.forEach((q) => { if (q.id !== p.id && vis(role(q))) infoOf(g, p.id).known[q.id] = role(q); });
      const h = ONW.roleHook(role(p), "cpuInit");
      if (h) h(g, p.id, cpu.kit);
    });
    const forced = (p) => (ONW.debug ? ONW.debug.cpuTarget(g, p.id) : null) || {};   // デバッグ: 能力先の指定
    const validPlayer = (p, id) => id && id !== p.id && g.players.some((q) => q.id === id);
    const nn = (rid) => { if (stage !== "late") ONW.newsNote(g, rid); };   // 新聞配達員の新聞: 夜に能力を使った役職を記録（昼に酔いが覚めてからの能力は、新聞には載らない）
    // 役職ファイルの cpuNight.run に渡す道具
    const ob = (from, players, graves) => { if (stage !== "late") ONW.observeNote(g, from, players, graves); };   // 観測の人狼: 夜に誰が誰に能力を使ったかを記録（昼の酔い覚め後は記録しない）
    const n = { g, stage, forced, validPlayer, nn, ob, rn, pick, infoOf: (id) => infoOf(g, id), nameOf: (id) => nameOf(g, id) };

    const on = (s) => all || stage === s;
    nightSteps().forEach((s) => {
      if (!on(s.nd.stage)) return;
      cpus.filter((p) => s.roles.includes(role(p))).forEach((p) => s.nd.run(n, p, rn(role(p)), false, role(p)));
    });
    // 朝: 墓荒らしが交換した後の役職の能力を即座に使う（朝の時点の実際のカードが対象。いたずらっ子の入れ替えは呼び出し側で反映）
    if (on("morning") || stage === "late") for (let pass = 0; pass < (stage === "late" ? 2 : 1); pass++) cpus.forEach((p) => {   // 昼に墓地と交換した先に能力があれば、もう1回（pass 2）続けて使う
      const i = infoOf(g, p.id), got = i.pendingChain;
      if (!got) return;
      i.pendingChain = null;
      const label = rn(got), keep = i.relic ? { ...i.relic } : null;
      const nd = (ONW.roleDef(got) || {}).cpuNight;
      if (nd && nd.chainEnd) { nd.run(n, p, label, true, got); return; }   // 墓荒らし・ドッペルゲンガー: 次の pendingChain は自分で立てる
      if (nd) nd.run(n, p, label, true, got);
      i.relic = keep;
    });
  };

  /** 最終的に手にした役職 fin の「夜の始まりに見えるはずの情報」（仲間の人狼・共有者・神・墓地・従者のご主人など）を、CPUが知る。
   *  酔いが覚めたCPU（sober）と、ドッペルゲンガーでコピーしたCPUが使う。役職ごとの情報は各役職ファイルの cpuLearn */
  cpu.learnInfo = function (g, id, fin) {
    const vis = (r) => ONW.VISIBLE_WOLF.includes(r), ini = (q) => g.initialRoles[q.id];
    const i = infoOf(g, id);
    if (vis(fin) && fin !== "forgetful_wolf") g.players.forEach((q) => { if (q.id !== id && vis(ini(q))) i.known[q.id] = ini(q); });
    const h = ONW.roleHook(fin, "cpuLearn");
    if (h) h(g, id, cpu.kit);
  };
  /** 酔いが覚めたCPU: その時点の最終役職を知り、仲間の情報を得て、能力のある役職なら今使う */
  cpu.sober = function (g, ids) {
    g.cpuInfo = g.cpuInfo || {};
    ids.forEach((id) => {
      const i = infoOf(g, id), fin = g.currentRoles[id], shown = ONW.shownRole(fin);
      i.known[id] = shown;
      cpu.learnInfo(g, id, fin);
      const hs = ONW.roleHook(fin, "cpuSober");
      if (hs) hs(g, id, i, shown);
      i.pendingChain = cpu.chainRoles().includes(fin) ? fin : null;   // ドッペルゲンガーも酔い覚め後にコピーする
    });
    cpu.lateVisits = [];
    cpu.runNight(g, "late", ids);
    return cpu.lateVisits;
  };

  /** 従者通知を受けたCPUのご主人: 自分に従者がいることを知る（誰かは分からない）。役職ごとの中身は servant.js の cpuNotice */
  cpu.noticeServant = function (g, id) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("servant", "cpuNotice")(g, id, cpu.kit);
  };
  /** 訪問されたCPU: 待機時間に、訪問してきた人（最終盤面で訪問者のカードを持っている人）を知る。中身は visitor.js の cpuNotice */
  cpu.noticeVisitors = function (g, id, visitorIds) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("visitor", "cpuNotice")(g, id, visitorIds, cpu.kit);
  };
  /** 就職されたCPU: 待機時間に、就職してきた人（最終盤面でフリーターのカードを持っている人）を知る。中身は freeter.js の cpuNotice */
  cpu.noticeEmployers = function (g, id, freeterIds) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("freeter", "cpuNotice")(g, id, freeterIds, cpu.kit);
  };
  /** 純愛者に選ばれたCPU: 待機時間に、純愛者のカードを持っている人を知る。中身は pure_lover.js の cpuNotice */
  cpu.noticePureLovers = function (g, id, holderIds) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("pure_lover", "cpuNotice")(g, id, holderIds, cpu.kit);
  };
  /** 悪女に選ばれたCPU（本命もキープも）: 待機時間に、悪女のカードを持っている人を知る。中身は evil_woman.js の cpuNotice */
  cpu.noticeEvilWomen = function (g, id, holderIds, keep) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("evil_woman", "cpuNotice")(g, id, holderIds, cpu.kit, !!keep);
  };
  /** 女王を知らされたCPU（最終盤面が村人陣営で酔いが覚めている）: 誰が女王かを知る。中身は queen.js の cpuNotice */
  cpu.noticeQueens = function (g, id, queenIds) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("queen", "cpuNotice")(g, id, queenIds, cpu.kit);
  };
  /** 昼に役職が入れ替わって後覚者の能力が発動したCPU: 最終的な役職を知る。中身は insomniac.js の cpuNotice */
  cpu.notifyInsom = function (g, id) {
    g.cpuInfo = g.cpuInfo || {};
    ONW.roleHook("insomniac", "cpuNotice")(g, id, cpu.kit);
  };
  /** 夜が全部終わったあと（いたずらっ子の反映後）に、CPUの後覚者が最終役職を知る。中身は insomniac.js の cpuAfter */
  cpu.afterNight = function (g) {
    g.players.filter((p) => p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id])).forEach((p) => {
      const h = ONW.roleHook(g.initialRoles[p.id], "cpuAfter");
      if (h) h(g, p.id, cpu.kit);
    });
  };

  // =========================================================
  // 昼の発言（CO・騙り・結果開示）と投票。本家(マイクラ版)のCPUの考え方に合わせてある
  // =========================================================
  const isWolfSide = (r) => isWolf(r) || isMad(r);                       // 人狼陣営（狂人含む）= 本家の isWolfTeam
  const WOLF_LIKE = () => ONW.WOLF_KIND;                                  // 占い結果で「人狼」と見える役職
  const AVOID_RESULT = ["tanner", "love_tanner", "opportunist", "amanojaku", "winner", "freeter", "servant"];   // 投票を避ける結果役職（本家 cpuVoteAvoidResultRoles。COルール3/3で 天邪鬼・勝ち組・フリーター・従者 を追加）
  const setupRoles = (g) => [...Object.values(g.initialRoles || {}), ...(g.center0 || g.center || [])];   // 占い結果に出してよい（実在する）役職
  const roleInSetup = (g, role) => setupRoles(g).includes(role) || (g.coDeck || []).some((x) => x.r === role);
  /** 「村人CO」をしてよいか: 配役(selectedRoles)か、変化公開で公開された役職(coDeck の cand でないもの)に、村人・忘却の人狼・狼憑き(本人は村人だと思い込む役職)がいるときだけ。
   *  変化後の本当の役職(initialRoles)は公開されていないと分からないので見ない（見ると、配役にも公開にも村人がいないのに村人COできてしまう） */
  const villagerAppears = (g) => [...(g.selectedRoles || setupRoles(g)), ...(g.coDeck || []).filter((x) => !x.cand).map((x) => x.r)]
    .some((r) => r === "villager" || ONW.SELF_AS_VILLAGER.includes(r));
  /** 騙りで名乗れる役職が1つもないときの「村人陣営CO」（COボタンの陣営COと同じ値）。co にこの値が入ったら、発言は「村人陣営CO」になる */
  const TEAM_CO = "team:village";
  /** 騙りでは名乗らない役職（マーリン: 人狼が見えている / 女王・チキン: 待機時間の扱いが特別）。これだけしか名乗れる村役職がないときは、役職COではなく村人陣営COにする */
  const NO_LIE_ROLES = ["merlin", "queen", "chicken", "wolf_marked", "wolf_dreamer"];   // 狼憑き・狼夢人は本人が自分の役職を知らない（思い込み系）ので、騙りでも名乗らない
  const noLie = (r) => NO_LIE_ROLES.includes(r) || ONW.SELF_AS_VILLAGER.includes(r) || ONW.SELF_AS_WOLF.includes(r);   // 思い込み系の役職が増えても自動で含める
  /** COの発言文: 陣営COは「村人陣営CO」、それ以外は「〇〇CO」 */
  const coText = (co) => (String(co).startsWith("team:") ? ({ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[String(co).slice(5)] || "陣営CO") : `${rn(co)}CO`);
  /** この試合に実在するその役職のカード枚数（配られた役職 + 墓地） */
  const roleCount = (g, role) => setupRoles(g).filter((r) => r === role).length;
  /**
   * 怪盗・墓荒らしの騙り結果で「手にした」と言える役職か。
   * 怪盗が怪盗を、墓荒らしが墓荒らしを手にするには、そのカードが2枚以上ないと成り立たないので、1枚以下なら言わない
   */
  const canGetByClaim = (g, kind, role) => !((kind === "robber" && role === "robber") || (kind === "relic" && role === "relic_robber")) || roleCount(g, role) >= 2;
  const weighted = (list) => {   // [[値, 重み], ...]
    let r = Math.random() * list.reduce((a, b) => a + b[1], 0);
    for (const [v, w] of list) { r -= w; if (r <= 0) return v; }
    return list[list.length - 1][0];
  };
  /** 偽の占い結果に使う役職。実在する役職の中から、希望の役職を優先して選ぶ（本家 cpuPickSeerResultRole） */
  function pickResultRole(g, preferred, ok) {
    const seers = setupRoles(g).filter((r) => r === "seer").length;   // 占い師が1枚しかないとき、占い結果で「占い師」と言うと、騙っている本人と合わせて2人になり破綻するので言わない
    const pool = [...new Set(setupRoles(g))].filter((r) => (!ok || ok(r)) && (r !== "seer" || seers >= 2));   // ok: 言ってよい役職だけに絞る（任意）
    const pref = preferred.filter((r) => pool.includes(r));
    return pick(pref.length ? pref : pool.length ? pool : ["villager"]);
  }
  const wolfLikeResult = (g) => pickResultRole(g, WOLF_LIKE());
  const villageLikeResult = (g, ok) => pickResultRole(g, ["villager", "mason", "seer", "robber", "troublemaker", "insomniac"], (r) => ONW.roles.getInfo(r).team === "village" && !ONW.TRANSFORM_GROUPS[r] && (!ok || ok(r)));   // 村人側の結果は必ず村人陣営の役職から（候補が無いときに人狼などを言って自白しない）
  /** 騙り占いの対象: 人狼陣営は本物の人狼を避ける（本家 chooseFakeSeerTarget） */
  function fakeSeerTarget(g, p) {
    const others = g.players.filter((q) => q.id !== p.id);
    const nonWolf = others.filter((q) => !isWolf(g.currentRoles[q.id]));
    return pick(nonWolf.length ? nonWolf : others);
  }
  /** 騙り占いの結果（本家 chooseFakeSeerResult） */
  function fakeSeerResult(g, p, t, selfRole) {
    const tr = g.currentRoles[t.id];
    if (selfRole === "mad_seer") {   // 狂った占い師: 人狼・狂人には村人っぽい結果、それ以外には本当の結果
      if (isWolf(tr) || isMad(tr) || (g.promotedWolfIds || []).includes(t.id)) return villageLikeResult(g);
      const real = g.initialRoles[t.id];
      return setupRoles(g).includes(real) && (real !== "seer" || setupRoles(g).filter((r) => r === "seer").length >= 2) ? real : villageLikeResult(g);
    }
    if (isWolfSide(selfRole)) {
      if (isWolf(tr)) return villageLikeResult(g);                                // 仲間の人狼は白と言う
      return Math.random() < 0.72 ? wolfLikeResult(g) : villageLikeResult(g);      // 72%で人狼だと告発
    }
    return Math.random() < 0.5 ? wolfLikeResult(g) : villageLikeResult(g);         // 非人狼の騙り（てるてる系）
  }
  /** 騙りで名乗る役職の抽選（本家 makeClaimPlan の人狼陣営の分）。山札に無い役職は名乗らない。マーリンは騙り禁止 */
  /** 騙りで名乗る役職の抽選表 [[役職ID, 重み], ...]（各役職ファイルの cpuLie.weight を order の小さい順に並べたもの） */
  const lieTable = () => ONW.roleIds().map((id, idx) => ({ id, idx, nd: (ONW.roleDef(id) || {}).cpuLie })).filter((x) => x.nd && x.nd.role === x.id)
    .sort((a, b) => a.nd.order - b.nd.order || a.idx - b.idx).map((x) => [x.id, x.nd.weight]);
  function pickLieRole(g) {
    const chosen = weighted(lieTable());   // 重みは各役職ファイルの cpuLie(order 順)。従者は村人陣営以外だけが騙れる（本家も配役にいるときだけ、低めの確率）
    if (chosen === "villager" ? villagerAppears(g) : roleInSetup(g, chosen)) return chosen;   // 村人も、配役か変化公開に村人・忘却の人狼・狼憑きがいるときだけ名乗る
    const fb = ["seer", "troublemaker", "robber", "mason"].filter((r) => r !== chosen && roleInSetup(g, r));
    if (fb.length) return pick(fb);
    const pool = villageLieRoles(g);
    return pool.length ? pick(pool) : TEAM_CO;   // 名乗れる役職が1つもなければ村人陣営CO
  }
  /** あり得る村役職 = この試合に実在する村人陣営の役職（変化後の役職・墓地・COの候補）。村人も、配役に入っているときだけ含む */
  /** 騙りで名乗れる村役職（実在する村人陣営の役職。マーリン・女王・チキンは含めない）。なければ空配列 */
  function villageLieRoles(g, ok) {
    return [...new Set([...setupRoles(g), ...(g.coDeck || []).map((x) => x.r), ...(villagerAppears(g) ? ["villager"] : [])])]
      .filter((r) => r !== "villager" || villagerAppears(g))
      .filter((r) => ONW.roles.getInfo(r).team === "village" && !ONW.TRANSFORM_GROUPS[r] && !noLie(r) && (!ok || ok(r)));   // 思い込み系(狼憑き・狼夢人)は本人が名乗れないので騙りにも使わない
  }
  /** あり得る村役職 = 上の一覧。空のときは「手にした役職」の嘘などで役職名が要るので、最終手段として村人を返す（COの発言には使わない: CO は bareCo / pickLieRole が村人陣営COにする） */
  function villageRolesInPlay(g, ok) {
    const pool = villageLieRoles(g, ok);
    return pool.length ? pool : ["villager"];
  }
  const fakeVillageRole = (g, ok) => pick(villageRolesInPlay(g, ok));
  /** 村人が配役にいないのに「村人CO」をすると嘘がバレるので、村人COの代わりに名乗れる役職を返す（結果なしのCOだけ） */
  function bareCo(g, pref) {
    if (pref === TEAM_CO) return TEAM_CO;
    if (villagerAppears(g)) return "villager";
    if (pref && pref !== "villager" && !noLie(pref)) return pref;
    const found = ["seer", "troublemaker", "robber", "mason", "insomniac"].find((r) => roleInSetup(g, r));
    if (found) return found;
    const pool = villageLieRoles(g);
    return pool.length ? pick(pool) : TEAM_CO;   // 名乗れる役職がなければ村人陣営CO
  }
  /** 「ただの村人のふり」をしたいときのCO。村人がいなければ、いる村役職の騙り（占い師なら偽結果つき）にする */
  function plainLie(g, p, selfRole) {
    if (villagerAppears(g)) return { co: "villager", result: null };
    const pool = ["seer", "troublemaker", "robber", "mason"].filter((r) => roleInSetup(g, r));
    return pool.length ? lieClaim(g, p, selfRole, pick(pool)) : { co: bareCo(g), result: null };
  }
  /**
   * 本家(マイクラ版)の「COのみ」ルールの CPU 判定（勝ち組・負け組・フリーター・従者 = 本当のCOを任意でする役職 / 天邪鬼 = 必ず騙る役職）
   *   ・本当にCOするかは CPU ごとに 1 回だけ抽選して覚える（本家 coOnlyOptionalTruthCo: 35%）。残り 65% は騙り
   *   ・騙りで名乗る役職は、配役にいる村人陣営の役職（と、勝ち組・負け組・従者など）から抽選（pickLieRole）。自分の本当の役職は名乗らない
   */
  const OPTIONAL_TRUTH_RATE = 0.35;
  function coTruth(g, p) {
    const i = infoOf(g, p.id);
    if (i.coTruth === undefined) i.coTruth = Math.random() < OPTIONAL_TRUTH_RATE;
    return i.coTruth;
  }
  /** 騙り用のCO。自分の本当の役職（selfRole）は名乗らない（引き直し。どうしても決まらなければ「ただの村人」） */
  function coverLie(g, p, selfRole) {
    for (let n = 0; n < 12; n++) { const l = lieClaim(g, p, selfRole); if (l.co !== selfRole) return l; }
    return plainLie(g, p, selfRole);
  }
  /** 役職ファイルの cpuClaim から呼ぶ: truthFn が { co, result } を返せて、かつ「本当にCOする」抽選に当たれば本当のCO。それ以外は騙り。truthFn が無い役職（天邪鬼）は必ず騙る */
  function optionalCo(g, p, selfRole, c, truthFn) {
    const t = truthFn && coTruth(g, p) ? truthFn() : null;
    const r = t || coverLie(g, p, selfRole);
    c.co = r.co; c.result = r.result;
  }

  /**
   * 夜のあとに人外(人狼・狂人・てるてる・第三陣営)の役職を手にしていた怪盗・墓荒らし・後覚者のCPUの騙り。
   *   A) 「村人役を手にした」という嘘（本人の役職COのまま、結果だけ偽る）
   *   B) そもそも最初から村人役だったと名乗る（あり得る村役職を普通に騙る）
   */
  function nonVillageLie(g, p, roleId, i, now) {   // roleId: 手にした人外の「元の役職」(robber / relic_robber / doppelganger / insomniac)。嘘の中身は各役職ファイルの cpuFakeGot
    const fg = (ONW.roleDef(roleId) || {}).cpuFakeGot;
    if (Math.random() < 0.5) {
      const role = fakeVillageRole(g, (r) => canGetByClaim(g, fg.kind, r));   // 怪盗→怪盗 / 墓荒らし→墓荒らしは、そのカードが2枚以上あるときだけ
      return fg.make(cpu.kit, g, i, role);
    }
    return lieClaim(g, p, now, fakeVillageRole(g));
  }
  /** 騙りの CO と結果開示（本家の mem.fakeRole）。戻り値: { co, result }（resultはnullのこともある） */
  function lieClaim(g, p, selfRole, forceCo) {
    const others = g.players.filter((q) => q.id !== p.id);
    const co = forceCo || pickLieRole(g);
    const nd = (ONW.roleDef(co) || {}).cpuLie;   // 騙りの結果開示は、その役職ファイルの cpuLie.claim（null なら通常の「COだけ」）
    if (nd && nd.role === co && nd.claim) { const res = nd.claim(cpu.kit, g, p, others, selfRole, co); if (res) return res; }
    const lr = (ONW.roleDef(co) || {}).cpuLieResult;   // 騙りの結果開示の作り方を持つ役職（墓荒らし: 「墓地N → 役職」）。COだけで終わらせず結果も言う
    if (lr) { const res = lr(cpu.kit, g, p, selfRole, co); if (res) return res; }
    return { co: forceCo && forceCo !== "villager" ? forceCo : bareCo(g, co), result: null };   // その他の村役職は、結果なしでCOだけする（村人がいなければ村人COはしない）
  }

  // ---- 情報開示（本家 _cpuCoOnlyMaybeInboundInfo）: 「フリーターに就職されています」「自分の従者がいます」 ----
  //   ・本当に就職された / 従者がいるCPUは、そのことを1回だけ言う（誰がフリーターかも言う。従者は誰かは分からない）
  //   ・自分の役職を偽っているCPU（人狼側を含む）は、「あなたに就職した」「あなたがご主人」と名乗る人がいると、話を合わせることがある（仲間と分かっている相手なら78%、そうでなければ34%）
  //   ・自分が同じ役職のCOをしているときは、その役職が2人以上いる試合でだけ言える（1人しかいないのに就職された・従者がいる、は成り立たない）
  const holdersOf = (g, role) => g.players.filter((q) => g.initialRoles[q.id] === role || g.currentRoles[q.id] === role).length;
  const sameRoleOk = (g, co, role) => co !== role || holdersOf(g, role) >= 2;
  const NO_FAKE_INBOUND = ["merlin", "queen", "chicken"];   // 本家 CPU_NO_FAKE_INBOUND_INFO_ROLES: 話を合わせない役職
  const isAllyOf = (g, i, r, actorId) => isWolfSide(r) && isWolf(i.known[actorId]);   // 人狼側で、相手が仲間の人狼と分かっている
  /** 本当の情報開示（就職された / 従者がいる）。なければ null */
  function inboundReal(g, p, i, co) {
    if (i.employedBy && i.employedBy.length && sameRoleOk(g, co, "freeter")) { const f = i.employedBy[0]; return { text: ONW.freeterInfoText(nameOf(g, f)), short: ONW.freeterInfoShort(nameOf(g, f)), claim: { kind: "employed", freeter: f } }; }
    if (i.hasServant && sameRoleOk(g, co, "servant")) return { text: ONW.servantInfoText, short: ONW.servantInfoShort, claim: { kind: "has_servant" } };
    return null;
  }
  /** 騙りの情報開示（話を合わせる）。claimers: { freeter: [就職先に自分を名乗った人のID], servant: [ご主人に自分を名乗った人のID] } */
  function inboundFake(g, p, r, i, co, claimers) {
    if (NO_FAKE_INBOUND.includes(r)) return null;
    for (const kind of ["freeter", "servant"]) {
      const list = [...new Set(claimers[kind] || [])].filter((id) => id !== p.id && alive(g, id));
      if (!roleInSetup(g, kind) || !list.length || !sameRoleOk(g, co, kind)) continue;
      const allies = list.filter((id) => isAllyOf(g, i, r, id)), actor = pick(allies.length ? allies : list);
      if (Math.random() >= (isAllyOf(g, i, r, actor) ? 0.78 : 0.34)) continue;
      const nm = nameOf(g, actor);
      return kind === "freeter"
        ? { text: ONW.freeterInfoText(nm), short: ONW.freeterInfoShort(nm), claim: { kind: "employed", freeter: actor } }
        : { text: ONW.servantFakeInfoText(nm), short: ONW.servantInfoShort, claim: { kind: "has_servant" } };
    }
    return null;
  }
  /** 「このCPUに就職した / このCPUがご主人」と名乗った人の一覧（これまでの発言 g.cpuClaims と、extra の予定の発言から） */
  function claimersTo(g, targetId, extra) {
    const out = { freeter: [], servant: [] };
    [...(g.cpuClaims || []), ...(extra || [])].forEach((c) => { if ((c.kind === "freeter" || c.kind === "servant") && c.target === targetId && c.from) out[c.kind].push(c.from); });
    return out;
  }
  /**
   * 昼の発言プラン（CPU1, CPU2… の順に1人ずつ）。
   * 各CPUは人間のCOボタンと同じ形（「〇〇CO」）で名乗り、その直後に結果開示を続けて言う。
   * 戻り値: [{ p, text, claim, gap(次の発言までのms) }]
   */
  cpu.plan = function (g, only) {   // only: 指定すると、そのCPUだけの発言予定を作る（酔いが覚めたCPU用）
    const plan = [], spoke = [];   // spoke: COを言うCPUの { p, r, i, c }（あとで情報開示の発言を足すのに使う）
    g.players.filter((p) => p.isCpu && (!only || only.includes(p.id))).forEach((p) => {
      const od = !!(g.drunkOverlay && g.drunkOverlay[p.id]), hid = ONW.hiddenDrunk(g, p.id);
      // 酔っ払い: 覚めるまでは「酔っ払いCO」だけ。覚めたあとは最終的な役職として振る舞う
      const i = infoOf(g, p.id);
      let r = hid ? "drunk" : ONW.shownRole(g.currentRoles[p.id] !== undefined && od ? g.currentRoles[p.id] : g.initialRoles[p.id]);   // 忘却の人狼のCPUは自分を村人だと思っている
      if (!hid && i.shuffledTo) r = i.shuffledTo;   // シャッフラーに役職を変えられた（自分に置いた）CPUは、知っている新しい役職として振る舞う（shuffler.js の cpuNotice / cpuRun）
      const others = g.players.filter((q) => q.id !== p.id);
      const c = { co: null, result: null, extra: null };   // extra: 結果開示のあとに続けて言う2つ目の結果
      if (hid) { plan.push({ p, text: `${rn("drunk")}CO`, co: "drunk", claim: { kind: "villager" }, gap: 3500 }); return; }
      // スター・女王: 待機時間に知らされるので、本当のCOの扱いが特別（各役職ファイルの cpuFirst。配列を返したらその発言だけで終わり）
      const first = ONW.roleHook(g.currentRoles[p.id], "cpuFirst"), fr = first ? first(cpu.kit, g, p, r) : null;
      if (fr) { fr.forEach((e) => plan.push(e)); return; }
      if (isWolfSide(r)) {                                                 // 人狼陣営は必ず騙る（本家 liarMode）
        const lie = lieClaim(g, p, r);
        c.co = lie.co; c.result = lie.result;
      } else {
        // 役職ごとの発言は各役職ファイルの cpuClaim（false を返したら通常の扱い）
        const h = ONW.roleHook(r, "cpuClaim");
        if (h && h(cpu.kit, g, p, r, i, c) !== false) { /* 役職ファイルで決まった */ }
        else if (ONW.roles.getInfo(r).team === "village") c.co = r;      // その他の村人陣営（わら人形・猫又など）: 必ず自分の役職をCO
        else { const pl = plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }   // 神・天邪鬼・オポチュニストなど（人狼でもてるてる系でもない第三陣営）: 村人を騙る（村人がいなければ別の村役職）
      }
      if (c.co && !c.result && !isWolfSide(r) && i.visitedBy && i.visitedBy.length && Math.random() < 0.6) {   // 訪問された（本当）: 訪問してきた人を開示する
        const vn = i.visitedBy.map((v) => nameOf(g, v)).join("、");
        c.result = { short: `${vn} が訪問`, text: `${vn} が訪問してきました。`, claim: { kind: "visited", from: i.visitedBy[0] } };
      }
      const hf = c.co ? ONW.roleHook(c.co, "cpuCoFollow") : null;   // 名乗った役職ごとの後処理（後覚者: 結果を言わないと騙りだと透けるので、嘘の結果開示もする）
      if (hf) hf(cpu.kit, g, p, r, i, c);
      if (!c.co) return;                                              // COしない
      plan.push({ p, text: coText(c.co), co: c.co, claim: c.result ? null : { kind: "villager" }, gap: c.result ? 1200 : 3500 });
      if (c.result) plan.push({ p, text: c.result.text, short: c.result.short, result: true, claim: c.result.claim, gap: c.extra ? 1200 : 3500 });
      if (c.result && c.extra) plan.push({ p, text: c.extra.text, short: c.extra.short, result: true, claim: c.extra.claim, gap: 3500 });
      spoke.push({ p, r, i, c });
    });
    // 情報開示（本家 _cpuCoOnlyMaybeInboundInfo）: 全員のCOが出そろったあとに、1人1回だけ。訪問された話をした人は、そちらが先（本家は1回だけ）
    const claimsNow = plan.filter((e) => e.claim && (e.claim.kind === "freeter" || e.claim.kind === "servant")).map((e) => ({ from: e.p.id, ...e.claim }));
    spoke.forEach(({ p, r, i, c }) => {
      if (!c.co || i.inboundSpoken || (c.result && c.result.claim && c.result.claim.kind === "visited")) return;
      const lying = isWolfSide(r) || c.co !== r;
      const e = inboundReal(g, p, i, c.co) || (lying ? inboundFake(g, p, r, i, c.co, claimersTo(g, p.id, claimsNow)) : null);
      if (!e) return;
      i.inboundSpoken = true;
      plan.push({ p, text: e.text, short: e.short, result: true, claim: e.claim, gap: 3500 });
    });
    return plan;
  };

  /** アサシンのCPUが暗殺する相手: 仲間と分かっている人は避け、あとはランダム */
  cpu.assassinPick = function (g, id, cands) {   // 中身は assassin.js の cpuPick
    return ONW.roleHook("assassin", "cpuPick")(cpu.kit, g, id, cands);
  };

  /**
   * CPU本人が思っている今の役職（自認）。怪盗・墓荒らし・後覚者で知った役職があればそれ、なければ最初に配られた役職。
   * いたずらっ子や他人の怪盗に入れ替えられたことは本人には分からないので、実際の今の役職は見ない。
   */
  const selfRole = (g, p) => (ONW.hiddenDrunk(g, p.id) ? "villager" : infoOf(g, p.id).known[p.id] || ONW.shownRole(g.initialRoles[p.id]));   // 酔いが覚める前のCPUは自分の役職を知らない
  const alive = (g, id) => !(g.deadIds || []).includes(id);
  /** 投票先候補（本家 chooseBestVoteTarget: 自分以外・生存・共有者の相方は除く） */
  function voteCandidates(g, p) {
    const i = infoOf(g, p.id), me = selfRole(g, p);
    const mates = [...ONW.loverMates(g, p.id), ...(ONW.heartbreaker ? ONW.heartbreaker.believed(g, p.id) : [])];   // 恋人の相方には投票しない（追放されると心中で一緒に敗北するため）。破局で壊されたことはCPUには知らされないので、壊された相方もまだ恋人だと思って避ける
    const hx = ONW.roleHook(me, "cpuVoteExclude");   // 役職ごとの除外（従者はご主人に投票しない / 共有者は相方に投票しない）。各役職ファイルの cpuVoteExclude
    return g.players.filter((q) => q.id !== p.id && !mates.includes(q.id) && alive(g, q.id) && !(hx && hx(cpu.kit, g, p, q, i, me)));
  }

  /** 投票先の評価点（本家 scoreTargetForCpu を、この版にある役職に合わせたもの） */
  function scoreVote(g, p, q) {
    const i = infoOf(g, p.id), me = selfRole(g, p), ini = g.drunkOverlay && g.drunkOverlay[p.id] ? me : ONW.shownRole(g.initialRoles[p.id]);
    const wolfSide = isWolfSide(me);
    const k = i.known[q.id];
    const claims = g.cpuClaims || [];
    const co = (g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co) || null;
    let s = 0;
    // 仲間は投票しない（人狼系は仲間の人狼、狂信者は人狼）
    if ((isWolf(me) || ini === "cultist") && isWolf(k)) s -= 100;
    // 自分が見て知っている情報: 村人側と分かっている人は避ける / 投票を避ける結果役職は避ける / 人狼と分かっている人は狙う
    if (k && !wolfSide) {
      if (isWolf(k)) s += 12;
      else if (AVOID_RESULT.includes(k)) s -= 100;
      else if (ONW.roles.getInfo(k).team === "village") s -= 100;
    }
    // 人狼王: 待機時間に公開される。仲間・狂人側は票を入れない / 村人側は kingBet(半々の賭け)で、乗らないCPUは避ける（他に人狼がいなければ追放されるが、いるとガードされて誰も追放されないため）
    if (k === "wolf_king") { if (wolfSide) s -= 100; else if (i.kingBet === false) s -= 112; }
    // 他人のCO（役職）
    if (co === "villager") s += wolfSide ? 1.8 : 0.8;
    if (co && WOLF_LIKE().includes(co) || co === "team:wolf") s += wolfSide ? -1.0 : 2.4;
    if (co === "tanner" || co === "love_tanner") s -= wolfSide ? 0.6 : 2.4;
    if (co === "seer" || co === "mad_seer") {
      const n = g.players.filter((x) => { const c = g.coBoard && g.coBoard[x.id] && g.coBoard[x.id].co; return c === "seer" || c === "mad_seer"; }).length;
      s += n >= 2 ? (wolfSide ? 0.6 : 1.5) : (wolfSide ? -0.3 : -0.8);
    }
    if (co === "mason") s -= wolfSide ? 0.2 : 1.4;
    if (co === "tough_guy") s -= wolfSide ? 0.3 : 0.8;   // タフガイCO: 票を入れても、はじき返されて次点の人にとばっちりが行くだけなので、あまり狙わない
    // 占い師COの結果（この人を占ったという報告）
    claims.filter((c) => c.kind === "seer" && c.target === q.id).forEach((c) => {
      if (WOLF_LIKE().includes(c.role)) s += wolfSide ? 0.8 : 2.8;
      else if (c.role === "tanner" || c.role === "love_tanner") s -= wolfSide ? 0.5 : 2.2;
      else s += wolfSide ? -0.4 : -1.0;
      if (c.from === p.id) {   // 自分が報告した結果には従う（本家）
        if (WOLF_LIKE().includes(c.role)) s += 12;
        else if (AVOID_RESULT.includes(c.role) || ONW.roles.getInfo(c.role).team === "village") s -= 100;
      }
    });
    // 人狼を奪ったと名乗る怪盗系（本家に近い読み）
    if (!wolfSide) claims.forEach((c) => { if ((c.kind === "robber" || c.kind === "relic" || c.kind === "insomniac" || c.kind === "doppel") && WOLF_LIKE().includes(c.role) && c.from === q.id && c.from !== p.id) s += 3; });
    // 「人狼をコピーした」と名乗るドッペルゲンガーが選んだ相手も、初期役職は人狼（本当のことを言っているなら）
    if (!wolfSide) claims.forEach((c) => { if (c.kind === "doppel" && WOLF_LIKE().includes(c.role) && c.target === q.id && c.from !== p.id && c.from !== q.id) s += 1.5; });
    // 他のCPUの投票予告（同調）+0.6、味方の予告 +1.2。人外CPUの予告は嘘のことがあるので、仲間(人狼を知っている側)は仲間の本当の投票先を見る
    const plans = g.cpuVotePlan || {}, reals = g.cpuRealVote || {};
    Object.entries(plans).forEach(([vid, t]) => {
      if (vid === p.id) return;
      const ally = (isWolf(me) || ini === "cultist") && isWolf(i.known[vid]);
      if ((ally ? (reals[vid] || t) : t) !== q.id) return;
      s += 0.6;
      if (ally) s += 1.2;
    });
    // 役職ごとの加点（てるてる系・処刑人・従者）。各役職ファイルの cpuVoteScore
    const hv = ONW.roleHook(me, "cpuVoteScore");
    if (hv) s += hv(cpu.kit, g, p, q, i, me);
    return s;
  }

  /** 評価点から投票先を選ぶ（本家 chooseBestVoteTarget + weightedCpuVoteChoice: 上位4点差以内から温度1.8で抽選） */
  function chooseVote(g, p) {
    const cands = voteCandidates(g, p);
    if (!cands.length) return null;
    const scored = cands.map((q) => ({ id: q.id, score: scoreVote(g, p, q) })).filter((x) => x.score > -50).sort((a, b) => b.score - a.score);
    if (!scored.length) return pick(cands).id;
    const top = scored[0].score, pool = scored.filter((x) => x.score >= top - 4.0);
    if (pool.length === 1) return pool[0].id;
    const w = pool.map((x) => Math.exp((x.score - top) / 1.8));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let n = 0; n < pool.length; n++) { r -= w[n]; if (r <= 0) return pool[n].id; }
    return pool[pool.length - 1].id;
  }

  /** 自認が人外のCPU（人狼・狂人・てるてる・第三陣営）が、投票先の予告で嘘をつく確率 */
  const VOTE_LIE_RATE = 0.5;
  /** 嘘の投票先: 本当の投票先以外で、自分の仲間と分かっている人は避ける */
  function fakeVoteTarget(g, p, real) {
    const i = infoOf(g, p.id);
    const cands = voteCandidates(g, p).filter((q) => q.id !== real);
    const pool = cands.filter((q) => !isWolf(i.known[q.id]));
    const c = pool.length ? pool : cands;
    return c.length ? pick(c).id : real;
  }
  /**
   * 残り20秒の投票意思表明。
   * 戻り値の target は本当に入れる先、said は予告した先（人外CPUは嘘をつくことがある）。
   * 予告(cpuVotePlan)は全員に見える情報、本当の投票先(cpuRealVote)は本人と人狼の仲間だけが知っている。
   */
  cpu.announceVote = function (g, p) {
    g.cpuVotePlan = g.cpuVotePlan || {}; g.cpuRealVote = g.cpuRealVote || {};
    const forcedT = g.dbgVotes && g.dbgVotes[p.id];   // デバッグで投票先を指定されたCPUは嘘をつかない
    if (forcedT) { g.cpuVotePlan[p.id] = forcedT; g.cpuRealVote[p.id] = forcedT; return { target: forcedT, said: forcedT, text: `${nameOf(g, forcedT)}に入れようと思います。` }; }
    const cands = voteCandidates(g, p);
    const realCur = g.cpuRealVote[p.id] || g.cpuVotePlan[p.id], saidCur = g.cpuVotePlan[p.id];
    const realOk = realCur && alive(g, realCur) && realCur !== p.id && cands.some((q) => q.id === realCur) && scoreVote(g, p, g.players.find((q) => q.id === realCur)) > -50;
    const saidOk = saidCur && alive(g, saidCur) && saidCur !== p.id && cands.some((q) => q.id === saidCur);
    let real = realCur, said = saidCur;
    if (!(realOk && saidOk)) {
      real = chooseVote(g, p);
      const me = selfRole(g, p);   // 自認が人外のときだけ嘘をつく（実際の役職は見ない）
      said = real && isNonVillage(me) && Math.random() < VOTE_LIE_RATE ? fakeVoteTarget(g, p, real) : real;   // 村人側と思っているCPUは本当のことを言う
      g.cpuRealVote[p.id] = real; g.cpuVotePlan[p.id] = said;
    }
    return { target: real, said, text: `${nameOf(g, said)}に入れようと思います。` };
  };

  /** 投票先を決める */
  cpu.decideVote = function (g, p) { return chooseVote(g, p); };

  // 役職ファイルのCPUフック(cpuClaim / cpuLie / cpuFakeGot など)が使う、役職をまたぐ道具
  Object.assign(cpu.kit, { rn, weighted, isNonVillage, isWolfSide, WOLF_LIKE, roleInSetup, bareCo, plainLie, lieClaim, nonVillageLie, fakeSeerTarget, fakeSeerResult, villageLikeResult, wolfLikeResult, fakeVillageRole, canGetByClaim, selfRole, coTruth, coverLie, optionalCo, coText, TEAM_CO });
  ONW.cpu = cpu;
})(window.ONW);
