/**
 * コピリスト（マイクラ版 COPYIST を正とする）: 第三陣営 / deck 180 / wiki order 181 / 発案: 狐餅 / 元ネタ: オリジナル。
 *
 * ・夜の行動: 変化公開の役職（他の参加者の最終役職＋墓地の役職。重複なし・参加者→墓地の順）を事前に知り、
 *   その中から1つ選んで、その役職になる（能力も使える。マイクラ版 openCopyistAction / finalizeCopyistChoice）。
 *   候補カードは本人の画面にだけ山札からめくれて並び、コピーできない役職にはバツマークが付く（作者メモ）。
 *   選ばなかった・無効な選択のときは、コピーできる候補からランダムに1つ選ぶ（マイクラ版のフォームを閉じたときと同じ）。
 *   候補が無いときは「コピーできる役職が見つかりませんでした。」で終わる。
 * ・コピーできない役職（マイクラ版 COPYIST_BLOCKED_ROLES）: 銀狼・バーテンダー・クローン・なのか・コスプレイヤー・
 *   ホタル・シャッフラー・女王・乞食・魔法使い（配布時に自動で効果が決まる役職と、自分を上書きする役職＋女王）。
 * ・コピーの確定（finalize）: 選んだ時点で既に別の役職に変化していたら失敗（「既に別の役職に変化していたため、コピーに失敗しました。」）。
 *   鍵師に自分の席をロックされていると失敗（鍵師の共通ゲート）。封印されていると夜の共通処理で失敗。
 *   コピーした役職に夜の能力があれば、コスプレイヤー・墓荒らしと同じく朝のうちに使える（連鎖）。
 *   スクリューガムをコピーしたら、その場で銀狼の気配を知る（マイクラ版 finalizeCopyistChoice の専用分岐）。
 *   魔法使いがいたら変化後の役職を奪われる（trySteal）。ただしコピーの記録はコピリストに残る
 *   （マイクラ版 copyRoleLinkedData はコピリストの状態を写さない。Web版の統一仕様と違う点。copylist.js の doCopy で付け戻す）。
 * ・記録は役職に付随する（g.copylistTarget[持ち主ID] = コピーした役職。ONW.setRoleBound でカードについて動く。
 *   マイクラ版 copyistActive / copyistTargetRole。いたずらっ子・怪盗・墓荒らしなどの交換ではカードと一緒に移り、
 *   上書き（ドッペル・グレムリン・シャッフラー・コスプレ・娘ちゃん化・死霊化）では消える＝ state.js / matthias.js /
 *   necromancer.js の明示削除＋ fix の掃除）。黄泉で断ち切られると、現在の役職が本来の役職として固定される（yomi.js）。
 * ・勝利（マイクラ版 applyCopyistWinnerConsistency。vote.js の set の最後、ペルソナの直後に ONW.copylist.applyWinners）:
 *   コピーした役職を持つ者が死亡している / その役職が墓地にある / その役職が場から消えている のいずれかなら追加勝利。
 *   そうでなければ勝者から外れる。反転・恋人・シャッフラーの乗っ取りが付いている人は対象外（その判定に任せる）。
 *   コピー先役職の単独勝利は「起点」にならない（マイクラ版 isCopyistCopiedHolder の除外を vote.js の各分岐に接続済み:
 *   てるてる系・処刑人・賞金稼ぎ・静観者・名探偵・予想屋・バランサー・糸紡ぎ・妖狐/妖狸/弁護士/勝負師の乗っ取り・神降臨）。
 *   コピーした神は神降臨の「本物の神」に数えない（マイクラ版 genuineLivingGods）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / PERSONA_MASK_EXCLUDED_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   銀色の影 = 入る（groups "transform:silver_shadow": 40。テレパシスト 39 の次）/ 光の使徒・闇の化身 = 入らない /
 *   模倣 = できない（第三陣営）/ コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入らない
 *   （マイクラ版 shufflerEligibleRoles の除外リスト → shuffler.js の BLOCKED に登録）/
 *   ペルソナ = 仮面候補に入る（除外リストに無い）。
 * ・封印: 封印の対象役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に COPYIST が入っている。114役目）。
 * ・ハッキング: 対象にも思い込み先にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
 *   思い込んだ人の偽UIは silver_wolf.js（候補カードがめくれ、選ぶと偽のコピーが朝に出る。盤面は動かない）。
 *   本物のコピリストが別の役職と思い込まされていても、最終役職で判定は通常どおり。
 * ・シナジー: 魔法使いの盗める変化役に加えた（roles.js の SYNERGY_COUNT_RULES。マイクラ版 YAMINABE_MAGICIAN_STEAL_ROLES）。
 *   見張り番の対象リスト・レンの REN_CHANGER_ROLES には文字列のまま入っていて自動で効く。見張り番からは
 *   「夜にコピーした」ことが行動として見える（lookout.js の個別補完）。鍵師の対象リストには入っていない
 *   （マイクラ版 YAMINABE_KEYMASTER_TARGET_ROLES に COPYIST は無い。ロックのゲートは自分の席へのロックで判定）。
 * ・CPU: 夜はコピーできる候補からランダムに1つ選ぶ（デバッグ指定があればそれ）。発言はマイクラ版 cpu.js の結果開示:
 *   コピー先を開示 / ロックで失敗 / 変化していて失敗。墓荒らし・ドッペルで手にしたときも同じ。
 * ・デバッグ: 能力先の指定は debug.js の ABILITY に copylist: "cos"（コスプレイヤーと同じ役職指定の形。n.forced(p).cosRole）。
 * ・実績（マイクラ版 stats.js / wiki-data.js）: first_copyist「将来の夢」/ win_copyist「本物として生きる道」/
 *   copyist_second_fiddle「二番煎じ」（敗北し、コピーした役職の持ち主が最後まで生きていて、墓地にも無かった）。
 * ・結果情報（情報確認。第6バッチ共通指示）: net.js の res.copylists → ui.js の「コピリスト:」行。
 *   文はマイクラ版 vote.js の「コピリスト {名前} は {役職名} をコピーしていました。」。
 * 状態: g.copylistDraw[席ID] = { roles:[候補の役職ID（コピー不可も含む）], at:"night"|"morning"|"day", used }
 *       g.copylistTarget[持ち主ID] = コピーした役職ID（役職に紐づく）
 * 詳細は docs/copylist.md。
 */
(function (ONW) {
  const ID = "copylist";
  const rn = (r) => (ONW.roles.getInfo(r) || {}).name || "?";
  const nm = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";
  /** コピーできない役職（マイクラ版 COPYIST_BLOCKED_ROLES） */
  const BLOCKED = ["silver_wolf", "bartender", "clone", "nanoka", "cosplayer", "hotaru", "shuffler", "queen", "beggar", "magician"];
  const store = (g) => (g.copylistDraw = g.copylistDraw || {});

  /** コピーの候補（マイクラ版 copyistCandidateRoles）: 自分以外の参加者の最終役職＋墓地の役職。
   *  重複なし（参加者を先に、墓地をあとに）。コピリスト自身の役職は除く。コピーできない役職も候補には含める（バツマークで見せる） */
  function candidates(g, selfId) {
    const out = [], seen = new Set();
    const push = (r) => { if (r && r !== ID && !seen.has(r)) { seen.add(r); out.push(r); } };
    (g.players || []).forEach((p) => { if (p.id !== selfId) push((g.currentRoles || {})[p.id]); });
    (g.center || []).forEach((r) => push(r));
    return out;
  }
  const usableOf = (roles) => roles.filter((r) => !BLOCKED.includes(r));
  /** 候補をめくる（未使用の引きが残っていればそれを返す。再入室・再送でも同じ並び） */
  function ensureDraw(g, id, at) {
    const cur = store(g)[id];
    if (cur && !cur.used) return cur;
    return (store(g)[id] = { roles: candidates(g, id), at: at || "night", used: false });
  }
  const validPick = (d, pick) => !!d && !d.used && Number.isInteger(pick) && pick >= 0 && pick < d.roles.length && !BLOCKED.includes(d.roles[pick]);
  const randomUsablePick = (d) => {
    if (!d) return null;
    const idx = d.roles.map((r, i) => i).filter((i) => !BLOCKED.includes(d.roles[i]));
    return idx.length ? idx[Math.floor(Math.random() * idx.length)] : null;
  };

  /** コピーの記録（役職に付随する） */
  function setTarget(g, holderId, role) { ONW.setRoleBound(g, "copylistTarget", holderId, role); }
  function targetOf(g, holderId) { return ONW.getRoleBound(g, "copylistTarget", holderId); }
  /** その人が「コピリストがコピーして得た役職」を持っているか（マイクラ版 isCopyistCopiedHolder / transformFrom === COPYIST 相当）。
   *  魔法使いに奪われて村人になった人も、記録が残っている間は true（マイクラ版どおり） */
  function isCopied(g, id) { return !!(g && g.copylistTarget && g.copylistTarget[id]); }
  /** 記録の持ち主（プレイヤーID、または墓地の "g:番号"）が、いまコピリスト由来のカードを持っているか */
  function holdsCard(g, key) {
    const t = (g.copylistTarget || {})[key];
    if (!t) return false;
    if (String(key).startsWith("g:")) { const c = (g.center || [])[+String(key).slice(2)]; return c === ID || c === t; }
    const cur = (g.currentRoles || {})[key];
    if (cur === ID || cur === t) return true;
    if (cur === "villager") return true;   // 魔法使いに奪われた人・カウンセラーに更生された人は村人になるが、記録は残る（マイクラ版は明示削除が無い）
    if (cur === "queen" && t === "princess") return true;   // 姫君→女王の昇格では記録は残る（マイクラ版の昇格はコピリスト状態に触らない）
    return false;
  }
  /** カードを持っていない持ち主の記録を消す（役職が動く・上書きされるたびに state.js から呼ぶ）。
   *  カードが人から人へ動くときの記録の移動は swapBound（ROLE_BOUND_KEYS）が済ませている */
  function fix(g) {
    const m = g && g.copylistTarget;
    if (!m) return;
    Object.keys(m).forEach((k) => { if (m[k] === undefined || !holdsCard(g, k)) delete m[k]; });
  }
  /** 最終盤面でコピーの記録がある参加者 [持ち主ID, コピーした役職] */
  function copies(g) {
    const out = [];
    (g.players || []).forEach((p) => { const t = targetOf(g, p.id); if (t) out.push([p.id, t]); });
    return out;
  }

  /**
   * コピーの確定（夜・朝の連鎖・CPUで共通。マイクラ版 finalizeCopyistChoice）。
   * 前提: 鍵師のロックのゲートは呼び出し側で済ませること。戻り値 { ok, role, stolen } / { ok:false, reason:"changed" }
   */
  function doCopy(g, id, role) {
    if ((g.currentRoles || {})[id] !== ID) return { ok: false, reason: "changed" };   // 選んだ時点で既に別の役職に変化していた
    ONW.cosplayPlace(g, id, role);   // カードの上で役職だけが書き換わる（履歴・従者・多重人格などの追随は cosplayPlace が担う）
    if (role === "persona" && ONW.persona) ONW.persona.ensure(g, id);   // ペルソナをコピーしたら仮面を決める（マイクラ版の配置と同じ）
    if (role === "clone" && ONW.clone) ONW.clone.ensure(g, id);   // クローンをコピーしたら思い込み役職を決める
    setTarget(g, id, role);
    const stolen = ONW.magician ? ONW.magician.trySteal(g, id, role, "copylist", "auto") : false;
    if (stolen) {
      // 魔法使いに変化後の役職を奪われても、コピーの記録はコピリストに残る（マイクラ版）。
      // Web版 trySteal は ROLE_BOUND_KEYS を魔法使いへ写して消すので、コピリストの分だけ付け戻す
      (g.players || []).forEach((q) => {
        if (q.id !== id && (g.copylistTarget || {})[q.id] === role && ONW.magician.stolenRoleOf(g, q.id) === role && (g.magicianStolenFrom || {})[q.id] === id) delete g.copylistTarget[q.id];
      });
      setTarget(g, id, role);
    }
    if (ONW.newsNote) ONW.newsNote(g, ID);
    return { ok: true, role, stolen: !!stolen };
  }

  /** 結果情報（情報確認）の行（マイクラ版 vote.js の「コピリスト情報」） */
  function lines(g, nmf) {
    const n = nmf || ((id) => nm(g, id));
    return copies(g).map(([id, t]) => `コピリスト ${n(id)} は ${rn(t)} をコピーしていました。`);
  }

  /** コピー先役職の「本来の陣営名」（単独勝利の名前）。マイクラ版 baseTeamNameByRole + COPYIST_EXTRA_OWN_TEAM_NAME_BY_ROLE のうち、
   *  Web版の winTeams に実際に載る名前だけを転記（追加勝利の名前は含めない） */
  const OWN_TEAM = {
    tanner: "てるてる坊主", love_tanner: "一目惚れしてるてる", god: "神", fox: "妖狐陣営", yokai_tanuki: "妖狸",
    detective: "名探偵", predictor: "予想屋", bounty_hunter: "賞金稼ぎ", balancer: "バランサー", watcher: "静観者",
    lawyer: "弁護士", wagerer: "勝負師", thread_spinner: "糸紡ぎ", executioner: "処刑人", shuffler: "シャッフラー",
    jester_ghost: "道化の怨霊", detective_ghost: "探偵の亡霊", vanity: "ヴァニティ", daughter: "娘ちゃん",
    chesed: "ケセド", long_night_moon: "長夜月", mitsuki_nanoka: "三月なのか", rasetsu: "羅刹",
    agent: "代行者", telepathist: "テレパシスト", demon_duke: "魔界公爵",
  };
  /** 勝利の整合（マイクラ版 applyCopyistWinnerConsistency）。vote.js の set の最後（ペルソナの直後）に呼ぶ。
   *  w = 勝者の Set、teams = 勝利陣営名の配列。戻り値: コピリストとして勝利が確定した人のID配列（既に勝者だった人も含む） */
  function applyWinners(g, w, teams) {
    const won = [];
    const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set();
    copies(g).forEach(([id, target]) => {
      // 反転・恋人・シャッフラーの乗っ取りが付いている人は、コピリストの判定をしない（マイクラ版 hasCopyistOverridingStatus）
      if (ONW.reverser && ONW.reverser.count && ONW.reverser.count(g, id) > 0) return;
      if (ONW.isLover && ONW.isLover(g, id)) return;
      if (g.shufflerTake && (g.shufflerTake.pairs || []).some((pr) => pr.sh === id)) return;   // シャッフラーの乗っ取りの本人（マイクラ版 shufflerSourceOwner）
      let holderAlive = false, holderDead = false;
      (g.players || []).forEach((q) => {
        if ((g.currentRoles || {})[q.id] !== target) return;
        if (dead.has(q.id)) holderDead = true; else holderAlive = true;
      });
      const inGraveyard = (g.center || []).includes(target);
      const roleVanished = !holderAlive && !holderDead && !inGraveyard;
      if (holderDead || inGraveyard || roleVanished) {
        if (!w.has(id)) w.add(id);
        won.push(id);   // 既に勝者だった人も含める（「コピリスト」の陣営タグと vote.js 側の winTeams 更新のため）
      } else w.delete(id);
      // コピー先役職の本来の陣営名は、本物の持ち主がその役職で勝っていない限り取り除く（マイクラ版と同じ）
      const own = OWN_TEAM[target];
      if (own && teams && teams.includes(own)) {
        const genuine = [...w].some((x) => x !== id && (g.currentRoles || {})[x] === target && !isCopied(g, x));
        if (!genuine) teams.splice(teams.indexOf(own), 1);
      }
    });
    if (won.length && teams && !teams.includes("コピリスト")) teams.push("コピリスト");
    return won;
  }

  /** 実績（マイクラ版 stats.js と同じ条件。Web版に保存が無いので判定だけ） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    const target = targetOf(g, id);
    if (ini === ID || cur === ID || target) out.push("first_copyist");
    if (won && (ini === ID || target)) out.push("win_copyist");
    if (!won && target) {   // 二番煎じ: コピーした役職の持ち主が最後まで生きていて、墓地にも無かった
      const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set();
      const holderAlive = (g.players || []).some((q) => (g.currentRoles || {})[q.id] === target && !dead.has(q.id));
      if (holderAlive && !(g.center || []).includes(target)) out.push("copyist_second_fiddle");
    }
    return out;
  }

  ONW.copylist = { BLOCKED, candidates, usableOf, ensureDraw, validPick, setTarget, targetOf, is: isCopied, holdsCard, fix, copies, doCopy, lines, applyWinners, achievements, rn };

  const cardsMsg = (c, p) => { const d = ensureDraw(c.g, p.id, "night"); return { cosplay: { cards: d.roles.slice() } }; };

  // ---- CPU ----
  /** CPUが候補から選ぶ。デバッグ指定: n.forced(p).cosRole（役職ID=その役職をコピー）、pick（候補の番号） */
  function cpuChoose(n, p, d) {
    const f = n.forced(p) || {};
    if (f.cosRole && d.roles.includes(f.cosRole) && !BLOCKED.includes(f.cosRole)) return d.roles.indexOf(f.cosRole);
    if (Number.isInteger(f.pick) && validPick(d, f.pick)) return f.pick;
    return randomUsablePick(d);
  }
  /** CPUの夜の行動（夜のコピー・朝の連鎖・酔い覚めで共通）。人間の night.resolve / morning.run と同じ順で、鍵師 → 選ぶ → コピー → 連鎖。
   *  記憶は i.copylist = { target(コピーした役職), failed("locked" | "changed" | "none") } */
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, i = n.infoOf(p.id);
    const d = ensureDraw(g, p.id, cur ? "morning" : "night");
    i.mode = "copylist"; i.copylist = { target: null, failed: null };
    const pick = cpuChoose(n, p, d);
    if (pick === null) {   // コピーできる候補が無い
      d.used = true; i.copylist.failed = "none";
      n.hold(p.id, "コピーできる役職が見つかりませんでした。");
      if (!cur) n.nn(rid);
      return;
    }
    if (ONW.keymaster.gate(g, p.id, [])) {   // 鍵師のロック: 自分の席がロック中なら失敗
      d.used = true; i.copylist.failed = "locked"; if (!cur) i.keyFail = { kind: "self" };
      n.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "コピー", [], `${label} ${p.name}`));
      if (!cur) n.nn(rid);
      return;
    }
    const role = d.roles[pick];
    d.used = true;
    const r = doCopy(g, p.id, role);
    if (!r.ok) { i.copylist.failed = "changed"; n.hold(p.id, "既に別の役職に変化していたため、コピーに失敗しました。"); if (!cur) n.nn(rid); return; }
    i.copylist.target = role; i.known[p.id] = role;
    g.nightLogsAll.push(`コピリスト ${p.name} は ${n.rn(role)} をコピーした`);
    n.hold(p.id, `あなたは${n.rn(role)}をコピーしました。`);
    if (role === "screw_gum" && !r.stolen && ONW.screwGum) n.hold(p.id, ONW.screwGum.silverText(g));
    if (!r.stolen) ONW.cpu.learnInfo(g, p.id, role);   // コピー先の「夜の始まりに見える情報」も知る。魔法使いに奪われたときは村人なので知らない
    const ga = ONW.mimic.gotAct(g, p.id, role);   // 模倣の人狼になったら模倣先の能力
    i.pendingChain = !r.stolen && ONW.cpu.chainRoles(ID).includes(ga) ? ga : null;   // コピー先に夜の行動があれば、朝のうちに続けて使う
    if (!cur) n.nn(rid);
  }
  /** コピーの結果の発言（本当）: マイクラ版 cpu.js の結果開示の文 */
  function cpuClaim(k, g, p, r, i, c) {
    if (k.selfRole(g, p) !== ID && !i.copylist) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; return; }
    c.co = ID;
    const x = i.copylist;
    if (!x) return;   // 夜の情報なし: COだけする
    if (x.target) c.result = { short: `コピー → ${k.rn(x.target)}`, text: `コピリストCO。${k.rn(x.target)}をコピーしました`, claim: { kind: "copylist", role: x.target } };
    else if (x.failed === "locked") c.result = { short: "ロックで失敗", text: "ロックされて失敗しました。", claim: null };
    else if (x.failed === "none") c.result = { short: "コピーなし", text: "コピーできる役職が見つかりませんでした。", claim: null };
    else c.result = { short: "コピー失敗", text: "コピリストCO。既に別の役職に変化していたためコピーに失敗しました", claim: null };
  }
  /** コピリストを騙る（人狼側など）: 場にある役職（コピーできるもの）から1つ選んで「コピーしました」と言う */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = usableOf(candidates(g, p.id));
    const role = cand.length ? cand[Math.floor(Math.random() * cand.length)] : "villager";
    return { co: ID, result: { short: `コピー → ${k.rn(role)}`, text: `${k.rn(role)}をコピーしました。`, claim: { kind: "copylist", role } } };
  }
  /** 墓荒らし・ドッペルゲンガーでコピリストを手にしたCPUが、続けて言う結果 */
  function cpuChainResult(k, g, p, i) {
    const x = i.copylist;
    if (!x) return null;
    if (x.target) return { short: `コピー → ${k.rn(x.target)}`, text: `コピリストCO。${k.rn(x.target)}をコピーしました`, claim: { kind: "copylist", role: x.target } };
    if (x.failed === "locked") return { short: "ロックで失敗", text: "ロックされて失敗しました。", claim: null };
    if (x.failed === "none") return { short: "コピーなし", text: "コピーできる役職が見つかりませんでした。", claim: null };
    return { short: "コピー失敗", text: "コピリストCO。既に別の役職に変化していたためコピーに失敗しました", claim: null };
  }

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 180, name: "コピリスト", team: ONW.TEAM.THIRD, wakeOrder: 46, sort: 65,
      desc: "第三陣営。夜に、変化公開の役職（他の参加者の役職と墓地の役職）の中から1つを選んでコピーし、その役職になります（能力も使えます）。候補のカードが山札からめくれ、コピーできない役職にはバツマークが付きます。コピーした役職を持つ者が死亡するか、その役職が墓地にあれば追加勝利です。銀狼・バーテンダー・クローン・なのか・コスプレイヤー・ホタル・シャッフラー・女王・乞食・魔法使いはコピーできません。" },
    groups: { "transform:silver_shadow": 40 },   // 銀色の影の変化先（テレパシスト 39 の次）。光の使徒・闇の化身からは変化しない
    uiNight: {
      action(X) {
        const { later } = X, g = ONW.game, n = (g.nightSel && Number.isInteger(g.nightSel.pick)) ? g.nightSel.pick : null;
        const cards = g.cosplayCards || [];
        const now = n === null || !cards[n] ? "まだ選んでいません（選ばなければランダムにコピーします）" : `${rn(cards[n])}`;
        return `<p class="night-step__hint">上のテーブルに、<strong>場にある役職のカード</strong>が山札からめくれています。コピーしたい役職のカードを1枚押してください。${later}<br>バツマークの役職はコピーできません。朝になると、選んだカードがあなたのカードの上に置かれ、その役職になります。</p><p class="night-step__hint">選択中: <strong>${now}</strong></p>`;
      },
      chainReady: (np, ng, sel) => !!sel && Number.isInteger(sel.pick),
      chainHow: () => "<strong>コピーしたい役職のカード</strong>（場にある役職がめくれています。バツマークは選べません）を1枚押して",
    },
    stagePick: { players: false, cosplay: true },   // カードを押して行動する: 候補のカードだけ（プレイヤー・墓地は選べない）
    // 結果開示(COボタン)の流れ(co.js が kind で引く): コピーした役職を選ぶ / ロックで失敗 / 伏せる
    coResult: {
      kind: "copylist",
      roleList: () => ONW.sortByRoleOrder(Object.keys(ONW.ROLE_INFO || {}).filter((r) => r !== ID && !["daughter", "sam", "wraith", "mitsuki_nanoka", "long_night_moon", "rasetsu"].includes(r))),
      noneText: "コピーできる役職が見つかりませんでした。",
      cosRole(role, K) {
        if (role === "hide") return ["コピーしました。役職は伏せます。", null, null, "disclose", "コピー → 伏せ"];
        return [`${K.rn(role)}をコピーしました。`, { kind: "copylist", role }, null, "disclose", `コピー → ${K.rn(role)}`];
      },
    },
    // 朝の演出（stage.js の playMorning / morningDur が reveal.kind === "copylist" のときに呼ぶ。コピーした本人の画面）
    // 候補のカードがそのまま見える → 選ばなかったカードが裏返って山札の一番下へ戻る → 選んだカードが自分の席へ飛んで置かれ、自分のカードがコピーした役職で表になる。
    // コピーできなかったとき(pick が null)は、全部のカードが裏返って山札へ戻るだけ。墓荒らし・ドッペル・酔い覚め経由（朝の連鎖・昼能力）も同じ演出。
    stageMorning: {
      kind: "copylist", dur: () => 2900,
      play(r, SK) {
        const { later } = SK, C = SK.cosplay, el = SK.$t(), mine = `p:${ONW.net.myId()}`;
        C.keep(true); C.ensure(r.cards, true); SK.paint(SK.G());
        const pile = el.querySelector(".tb-pile .tb-card");
        const fly = (i, to, ms, shrink) => {
          const card = el.querySelector(`[data-k="c:${i}"] .tb-card`);
          if (!card || !to || !card.animate) return;
          const a = card.getBoundingClientRect(), b = to.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
          card.style.zIndex = 60;
          card.animate([{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx / 2}px,${dy / 2 - 26}px) scale(1.15)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(${shrink ? 0.85 : 1})`, opacity: shrink ? 0.2 : 1 }], { duration: ms, easing: "ease-in-out", fill: "forwards" });
        };
        const g0 = SK.G();
        r.cards.forEach((_, i) => {
          if (i === r.pick) return;
          later(() => { delete SK.up[`c:${i}`]; SK.paint(SK.G()); }, 400);        // ① 選ばなかったカードが裏返る
          later(() => fly(i, pile, 800, true), 1200);                              // ② 山札の一番下へ戻る
        });
        if (Number.isInteger(r.pick)) {
          const dst = el.querySelector(`[data-k="${mine}"] .tb-card`);
          later(() => fly(r.pick, dst, 900, false), 1200);                         // ③ 選んだカードが自分の席へ飛ぶ
          later(() => { if (ONW.sound) ONW.sound.se("deal"); SK.show(mine, r.role); }, 1200 + 900);   // ④ 置かれて、自分のカードがコピーした役職で表になる
        }
        later(() => { C.keep(false); C.clear(); g0.cosAnim = "done"; SK.paint(SK.G()); }, 2500);
      },
    },
    stageEnd(c, kind) {   // コピーの段階(relic)が終わったら、夜にめくった候補は使い終わり（選び忘れ・封印で残った引きも閉じる。連鎖では引き直す）
      if (kind !== "relic") return;
      Object.values(c.g.copylistDraw || {}).forEach((d) => { if (d.at === "night") d.used = true; });
    },
    nightMsg: cardsMsg,
    cpuNight: { order: 4, stage: "relic", chain: true, run: cpuRun },   // 鍵師(seer段階)のあと・コスプレイヤー(5)の前（マイクラ版の処理順: 鍵師 → コピリスト → ホタル → なのか → コスプレイヤー）
    cpuClaim,
    cpuLie: { role: ID, weight: 3, order: 17, claim: lieClaim },
    cpuChainResult,
    /** 朝の連鎖・酔い覚めの昼能力が始まるとき（墓荒らし/ドッペル経由・酔い覚め）、候補のカードをめくる。本人に送る候補（役職ID） */
    chainDraw(c, id) { return ensureDraw(c.g, id, c.g.phase === c.PH.ONLINE_DAY ? "day" : "morning").roles.slice(); },
    night: {
      kind: "relic", order: 4,
      complete: (np, ng, sel) => !!sel && Number.isInteger(sel.pick),
      normalize: (c, players, graves, sel, id) => {
        const d = (c.g.copylistDraw || {})[id], pick = sel && sel.pick;
        return { players: [], graves: [], pick: validPick(d, pick) ? pick : null };
      },
      resolve(c, p) {
        const g = c.g, d = (g.copylistDraw || {})[p.id];
        if (!d || d.used) return;
        const cards = d.roles.slice(), label = `${c.rn(c.eff(p))} ${p.name}`;
        let pick = (c.selOf(p) || {}).pick;
        if (!validPick(d, pick)) pick = randomUsablePick(d);   // 選んでいない・コピーできない役職のときは、コピーできる候補からランダム（マイクラ版のフォームを閉じたときと同じ）
        d.used = true;
        if (pick === null) {   // 候補が無い / 全部コピーできない
          c.hold(p.id, "コピーできる役職が見つかりませんでした。");
          c.rev[p.id] = { kind: "copylist", cards, pick: null, role: null };
          return;
        }
        if (ONW.keymaster.gate(g, p.id, [])) {   // 鍵師のロック: 自分の席がロック中ならコピーに失敗（候補は全部山札に戻る）
          c.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "コピー", [], label));
          c.rev[p.id] = ONW.keymaster.failRev(g, p.id, p.id);
          return;
        }
        const role = cards[pick];
        const r = doCopy(g, p.id, role);
        if (!r.ok) {   // 選んだ時点で既に別の役職に変化していた
          c.hold(p.id, "既に別の役職に変化していたため、コピーに失敗しました。");
          c.rev[p.id] = { kind: "copylist", cards, pick: null, role: null };
          return;
        }
        g.nightLogsAll.push(`コピリスト ${p.name} は ${c.rn(role)} をコピーした`);
        c.hold(p.id, `あなたは${c.rn(role)}をコピーしました。`);
        if (role === "screw_gum" && !r.stolen && ONW.screwGum) c.hold(p.id, ONW.screwGum.silverText(g));   // スクリューガムをコピーしたら、その場で銀狼の気配を知る（マイクラ版 finalize の専用分岐）
        const ga = ONW.mimic.gotAct(g, p.id, role);   // 模倣の人狼になったら模倣先の能力
        if (!r.stolen && ONW.roleIsActive(ga)) g.morningAct[p.id] = ga;   // コピー先に夜能力があれば朝のうちに使える（連鎖OK）。魔法使いに奪われたときは使えない
        c.rev[p.id] = { kind: "copylist", cards, pick, role };
        if (!r.stolen) c.gotInfo(g, p, role, c.rev, { skipGrave: null, both: false, via: "コピーした従者" });   // コピー先の「夜の始まりに見える情報」が届く
      },
    },
    morning: {
      run(c) {   // 墓荒らし/ドッペルで手にしたコピリスト・酔い覚めのコピリスト: めくれた候補から選んで確定
        const g = c.g, id = c.id, d = (g.copylistDraw || {})[id];
        if (!d || d.used) return null;
        const cards = d.roles.slice();
        let pick = c.sel && c.sel.pick;
        if (!validPick(d, pick)) pick = randomUsablePick(d);
        d.used = true;
        if (pick === null) return { lines: ["コピーできる役職が見つかりませんでした。"], reveal: { kind: "copylist", cards, pick: null, role: null }, nextChain: null };
        if (ONW.keymaster.gate(g, id, [])) return { lines: [ONW.keymaster.fail(g, id, "self", "コピー", [], `${c.label} ${c.me.name}`)], reveal: ONW.keymaster.failRev(g, id, id), nextChain: null, failed: true };
        const role = cards[pick];
        const r = doCopy(g, id, role);
        if (!r.ok) return { lines: ["既に別の役職に変化していたため、コピーに失敗しました。"], reveal: { kind: "copylist", cards, pick: null, role: null }, nextChain: null };
        g.nightLogsAll.push(`コピリスト ${c.me.name} は ${c.rn(role)} をコピーした`);
        const lines = [`あなたは${c.rn(role)}をコピーしました。`];
        if (role === "screw_gum" && !r.stolen && ONW.screwGum) lines.push(ONW.screwGum.silverText(g));
        lines.push(...c.soberInfoLines(g, id, role));
        return { lines, reveal: { kind: "copylist", cards, pick, role }, nextChain: null };
      },
      after(c, res) {   // コピー先にも夜の能力があれば続けて1回使える（コピリスト→墓荒らし→占い師）
        const g = c.g, id = c.id, ga = ONW.mimic.gotAct(g, id, g.currentRoles[id]);
        if (ONW.roleIsActive(ga)) { res.nextChain = ga; (g.morningAct = g.morningAct || {})[id] = ga; (g.morningDone = g.morningDone || {})[id] = false; res.lines.push(g.phase === c.PH.ONLINE_DAY ? "この役職の能力も、議論中に1回だけ使えます。" : "この役職の能力も、朝のうちに1回だけ使えます。"); }
      },
      peek: (c) => c.soberPeek(c.g, c.id, c.g.currentRoles[c.id]),
    },
    achievements(g, id, won) { return achievements(g, id, won); },
  });
})(window.ONW);
