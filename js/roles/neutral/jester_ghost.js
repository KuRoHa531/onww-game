/**
 * 道化の怨霊（マイクラ版 JESTER_GHOST を正とする）: 第三陣営 / deck 178 / wiki order 179 / 発案: くろは / 元ネタ: Feign ホーンター（旧ゴースト）。
 *
 * ・夜の行動: 自分以外の参加者1人を「恨み対象」に選ぶ（マイクラ版 openJesterGhostAction）。
 *   記録は役職に紐づく（g.jesterGhostTarget[持ち主ID] = 対象のプレイヤーID。ONW.setRoleBound）。
 *   役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら記録もカードについて動く（state.js の ROLE_BOUND_KEYS）。
 *   グレムリンのコピー = コピー先に恨み対象を複製（マイクラ版 transferRoleBoundSpecialData の "copy"。
 *   night.js の copiedRole 再選択リストにも JESTER_GHOST が入っている）。ドッペルのコピー = 引き継がない（朝のうちに選ぶ）。
 *   役職が上書きされた席の古い記録は消える。自己参照は補正しない（マイクラ版 PRESERVE_RAW 相当。恨殺の発動条件で弾く）。
 *   ウサギの狂人の草むらに隠れた対象は選んでも失敗（消費される。Web版の夜解決の共通処理が担う）。
 *   封印されている怨霊は夜に選べない（マイクラ版 failSealedNightAction。Web版も封印中は夜の resolve が呼ばれない）。
 *   新聞屋に役職が記録される（ONW.newsNote）。見張り番の「行動した」判定・鈴の巫女のカウント対象（夜に行動する役職）。
 *   本人の夜の知らせ（マイクラ版 tell）: 「あなたは {対象} を恨みました。」。夜ログ: 「道化の怨霊 {名前} は {対象} を恨みました。」（リザルトの夜行動結果では「恨んでいました。」に変換して出す）。
 * ・朝の演出（作者メモ）: 怨霊本人の画面でだけ、選んだ対象のカードが待機時間に 🕯️（恨み）の面でめくれる
 *   （復讐者の🔪と同じ peek の作り。stage.js の JESTER_GHOST_MARK。他の人には見えない）。
 * ・恨殺（投票の連鎖）: 最終盤面の道化の怨霊が投票解決で死亡し、封印されておらず、恨み対象がまだ死んでいなければ、
 *   対象を恨殺する（死因 kind "grudge"。マイクラ版 resolveChainDeaths の JESTER_GHOST ブロック / markFinalDeathReason "grudge_kill"）。
 *   処理は vote.js の resolveChain の波の1段目（猫又・虎の狂人と同じ場所。ハンター移植時に "grudge" は予約済みで、
 *   ハンターの CHAIN_KINDS にも入っている = 恨殺で死んだハンターは道連れを選べる）。
 *     - 騎士の護衛が付く（マイクラ版 tryKnightProtect(.., "chain")。kill() の騎士分岐を "grudge" にも広げた）。
 *     - タフガイのはじき・従者の身代わりは付かない（マイクラ版の連鎖処理に無い。kill() の分岐は tomo/bomb 限定のまま）。
 *     - マティアスの身代わりは kill() の共通処理で付く（マイクラ版も applyMatthiasSubstitution が最終集合に効く。
 *       娘が身代わりで死んだ場合も、マイクラ版は jesterGhostSuccess を立てたままにするので、Web版も成功として記録する）。
 *     - 呪殺・毒殺（貫通）で死んだ怨霊は発動しない（マイクラ版 isPiercingVoteKillReason の continue。呪殺は波の外、毒殺は分岐で弾く）。
 *     - 昼中に死亡していた怨霊は発動しない（波に入らない。マイクラ版 dayDeadPlayerIds の除外）。
 *     - 恨殺された人は連鎖の波に入る（その人の道連れ・暗殺などが通常どおり発動する）。
 *   成功すると g.jesterGhostSuccess[怨霊] = true、g.jesterGhostKills に { ghost, target } を記録（結果情報・実績用）。
 * ・追加勝利: 恨殺に成功し、かつ自身の死因が直接の追放（マイクラ版 finalDeathReasons === "execute"）のときだけ追加勝利。
 *   道連れ・心中・独裁処刑・メンタル崩壊・ショック死・拒絶などで死んだ場合は勝てない（vote.js の set() が
 *   ONW.jesterGhost.extraWins を足す。勝てなかった恋人は追加勝利しない＝他の追加勝利と同じ）。
 * ・恨殺の敗北フィルタ（マイクラ版 applyJesterGhostGrudgeKillLossFilter）: すべての勝敗判定（神の祝福含む）が終わったあと、
 *   恨殺で死んだ人は勝者から外れる。ただし最終役職が 殉職者 / 勝ち組 / 死霊、死ね指令の代行者、winnerForced の人は外れない。
 *   適用位置は vote.determineWinners の愉快犯・爆弾魔のあと、ネクロマンサーの前
 *   （マイクラ版は applyNecromancerWraith のあと・Combo の前だが、Web版のネクロマンサーは死霊化を一括で行い、
 *   死霊化された人は最終役職が死霊になるため結果は等価: フィルタで外れた敗北死亡者も死霊化の候補に戻る）。
 * ・封印: 封印の対象役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に JESTER_GHOST が入っている。112役目）。
 *   封印された怨霊は夜に選べず、死んでも恨殺が発動しない。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / PERSONA_MASK_EXCLUDED_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   銀色の影 = 入る（groups "transform:silver_shadow": 38。偶数人 37 の次）/ 光の使徒・闇の化身 = 入らない /
 *   模倣 = できない（第三陣営）/ コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入らない
 *   （マイクラ版 shufflerEligibleRoles の除外リストに JESTER_GHOST がある → shuffler.js の BLOCKED に登録）/
 *   ペルソナ = 仮面候補に入る（除外リストに無い）。
 * ・ハッキング: 対象にも思い込み先にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
 *   思い込んだ人の偽の夜結果は「{対象}を恨みました。」（マイクラ版 night.js の fakeRole 分岐。silver_wolf.js に接続済み）。
 *   本物の怨霊が別の役職と思い込まされていても、最終役職で恨殺・勝敗は通常どおり判定する。
 * ・シナジー: 見張り番・鈴の巫女の対象リスト（マイクラ版 YAMINABE_LOOKOUT_TARGET_ROLES / YAMINABE_BELL_MIKO_TARGET_ROLES）に
 *   すでに入っている（roles.js の文字列のまま自動で効く）。ハンターが出る闇鍋の「道連れできる役職」にも
 *   マイクラ版 roles.js の重み12で入っている（hunter.js の kill-source リストに "jester_ghost" 登録済みで自動で効く）。
 *   封印シナジーの対象には sealTarget で自動で入る（wiki/js/synergy-data.js の3リストにも追加済み）。
 * ・多重人格: 夜にGUI選択で能力を使う役職なので、反転トリガーは net.js / cpu.js の汎用配線で自動で効く（専用配線なし）。
 * ・CPU: 夜は自分以外の1人をランダムに選ぶ。投票では恨み対象を先に追放させないよう避ける（対象が恨殺以外で先に死ぬと負けるため）。
 * ・デバッグ: 能力先の指定は debug.js の ABILITY に jester_ghost: "rob"（1人指定）を登録。
 * ・実績（マイクラ版 stats.js / wiki-data.js）: first_jester_ghost「うらめしや〜」/ win_jester_ghost「恨み晴らさでおくべきか」/
 *   jester_ghost_target_died_early「は？何勝手に死んでんだよ」（恨んだ相手が恨殺以外の死因で先に死亡）。
 * ・結果発表の道連れ演出（作者メモ: Feignのゴーストみたいな道連れ演出）: 恨殺でめくれるカードは、stage.js の flipChain が
 *   kind "grudge" のときに stageResult.grudgeFx フックを呼ぶ。怨霊の席から半透明のゴースト（CSSで描いた Feign 風の白い亡霊）が
 *   ふわりと漂って対象の席へ移動し、対象のカードが蒼白く震えてから「恨殺」の字幕でめくれる（全員の画面）。
 *   死因表示は［恨殺］（net.js の label0 / stage.js の lab0 に接続済み）。
 * ・結果情報（情報確認。第6バッチ共通指示）: net.js の res.jesterGhosts → ui.js の「道化の怨霊:」行。
 *   恨殺が起きた分はマイクラ版 addChainLog の文「道化の怨霊 {怨霊} は {対象} を恨み殺しました。」、
 *   恨み対象が恨殺以外で先に死んだ分と、恨殺で敗北した分は Web版の補足文で出す。
 */
(function (ONW) {
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 夜・朝のうちの選択を記録する（役職についていく）。持ち主 holderId のカードの恨み対象 = targetId */
  function setTarget(g, holderId, targetId) { ONW.setRoleBound(g, "jesterGhostTarget", holderId, targetId); }
  /** 持ち主 holderId のカードの恨み対象（記録がなければ undefined）。自己参照も補正せずそのまま返す */
  function targetOf(g, holderId) { return ONW.getRoleBound(g, "jesterGhostTarget", holderId); }
  const R_ = () => ONW.ROLE.JESTER_GHOST;
  let jgKeys = [];   // 待機時間に🕯️を出した席（昼になる前に片づける）
  /** 朝の演出: 怨霊本人の目線で、選んだ対象のカードが「🕯️恨み」の面でめくれる（stage.js の JESTER_GHOST_MARK。役職名は出さない。他の人には見えない）。
   *  kind "peek" は、朝のうちはめくれたまま待機時間で裏に戻り、昼に使ったとき（酔いが覚めた怨霊）は数秒で閉じる（stage.js の show / onAck）。何度作っても同じ内容 */
  const MARK = "__jester_ghost";
  const ghostReveal = (t) => ({ kind: "peek", items: [{ k: `p:${t}`, role: MARK }] });
  /** 記録の持ち主（プレイヤーID、または墓地の "g:番号"）が、いま道化の怨霊のカードを持っているか */
  function holdsCard(g, key) {
    if (String(key).startsWith("g:")) return (g.center || [])[+String(key).slice(2)] === R_();
    return g.currentRoles[key] === R_();
  }
  /** 道化の怨霊のカードを持っていない持ち主の記録を消す（役職が動く・上書きされるたびに state.js から呼ぶ）。
   *  カードが人から人へ動くときの記録の移動は swapBound（ROLE_BOUND_KEYS）が済ませているので、ここでは「怨霊でなくなった席に古い記録が残らない」ことだけを保証する。
   *  自己参照の補正はしない（恨殺の発動条件で弾くため） */
  function fix(g) {
    const m = g && g.jesterGhostTarget;
    if (!m) return;
    Object.keys(m).forEach((k) => { if (!holdsCard(g, k) || m[k] === undefined) delete m[k]; });
  }
  /** 最終盤面で道化の怨霊のカードを持っている人の [持ち主, 恨み対象]。対象が実在する記録だけ。
   *  対象が持ち主自身（役職交換・コピーの結果）の記録もそのまま入れる（実績・結果情報が使う）。記録のない怨霊は含めない */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      const t = targetOf(g, p.id);
      if (!t || !g.players.some((q) => q.id === t)) return;
      out.push([p.id, t]);
    });
    return out;
  }
  /** 知らせた記録: g.jesterGhostSeen[持ち主ID] = その人が「恨み対象を知っている」対象のID。夜・朝のうちに自分で選んだ人、待機時間・酔い覚め・昼のうちに知らされた人が入る。
   *  カードが動いて新しい持ち主が記録を引き継いだときだけ、まだ知らされていないので🕯️で知らせる。何度呼んでも二重に出ない（同じ対象なら出さない） */
  const seen = (g, id, t) => { (g.jesterGhostSeen = g.jesterGhostSeen || {})[id] = t; };
  const seenOf = (g, id) => (g.jesterGhostSeen || {})[id];
  /** 今の盤面で「まだ知らされていない道化の怨霊の持ち主」の [持ち主, 対象]。自己参照（対象が自分）は知らせない（判定にだけ使う）。酔っ払いの人は覚めるまで含めない */
  function unseen(g) {
    return picks(g).filter(([h, t]) => t !== h && seenOf(g, h) !== t && !ONW.hiddenDrunk(g, h));
  }
  /** CPUの記憶（投票判断 cpuVoteScore が使う i.jesterGhostTarget）に、いま持っている恨み対象を入れる */
  function cpuLearn(g, id, t) { if (ONW.cpu && ONW.cpu.kit) ONW.cpu.kit.infoOf(g, id).jesterGhostTarget = t; }
  /** 恨殺が成立したことを記録する（vote.js の resolveChain から呼ぶ。成功フラグ + 結果情報用の kills） */
  function noteSuccess(g, ghostId, targetId) {
    (g.jesterGhostSuccess = g.jesterGhostSuccess || {})[ghostId] = true;
    (g.jesterGhostKills = g.jesterGhostKills || []).push({ ghost: ghostId, target: targetId });
  }
  /** その人の死因が「直接の追放」か（マイクラ版 finalDeathReasons === "execute" の Web版相当）。
   *  追放集合（game.eliminated）に入っていて、連鎖死・昼中死亡・呪殺・毒殺・メンタル崩壊・ショック死・拒絶・独裁処刑・魔界断罪のどれでもないこと */
  function executedDirectly(g, id) {
    if (!(g.eliminated || []).includes(id)) return false;
    if ((g.chainKind || {})[id]) return false;
    if ((g.deadKind || {})[id]) return false;
    if ((g.curseKillIds || []).includes(id) || (g.poisonKillIds || []).includes(id)) return false;
    if ((g.mentalIds || []).includes(id) || (g.shockIds || []).includes(id)) return false;
    if ((g.parityRejectIds || []).includes(id)) return false;
    if (g.dictator && g.dictator.target === id) return false;
    if ((g.dukeDead || []).includes(id) || (g.dukeJudged || []).includes(id)) return false;
    return true;
  }
  /** 追加勝利する道化の怨霊（最終役職が道化の怨霊で、恨殺に成功し、自身が直接の追放で死んだ人） */
  function extraWins(g) {
    return g.players.filter((p) => g.currentRoles[p.id] === R_() && (g.jesterGhostSuccess || {})[p.id] && executedDirectly(g, p.id)).map((p) => p.id);
  }
  /** 恨殺の敗北フィルタ（マイクラ版 applyJesterGhostGrudgeKillLossFilter）: 恨殺（chainKind "grudge"）で死んだ人を勝者から外す。
   *  ただし最終役職が 殉職者 / 勝ち組 / 死霊、死ね指令の代行者、winnerForced の人は外れない。
   *  外した人は g.jesterGhostFiltered に記録する（結果情報用）。vote.determineWinners が愉快犯・爆弾魔のあと、ネクロマンサーの前に呼ぶ */
  function applyGrudgeLossFilter(g) {
    g.jesterGhostFiltered = [];
    if (!g || g.abandoned || !Array.isArray(g.winnerIds)) return;
    const victims = Object.keys(g.chainKind || {}).filter((id) => g.chainKind[id] === "grudge");
    if (!victims.length) return;
    const R = ONW.ROLE;
    const keep = (id) => { const r = g.currentRoles[id]; return r === R.MARTYR || r === R.WINNER || r === R.WRAITH || (r === R.AGENT && ONW.agent && ONW.agent.commandOf(g, id) === "die") || !!(g.winnerForced && g.winnerForced[id]); };
    g.winnerIds = g.winnerIds.filter((id) => { if (!victims.includes(id) || keep(id)) return true; g.jesterGhostFiltered.push(id); return false; });
  }
  /** 結果情報（情報確認）の行。恨殺が起きた分はマイクラ版 addChainLog の文、それ以外は Web版の補足文 */
  function lines(g, nmf) {
    const out = [];
    (g.jesterGhostKills || []).forEach((k) => out.push(`道化の怨霊 ${nmf(k.ghost)} は ${nmf(k.target)} を恨み殺しました。`));
    const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set([...(g.executed || []), ...(g.deadIds || [])]);
    picks(g).forEach(([h, t]) => {
      if ((g.jesterGhostSuccess || {})[h]) return;
      if (dead.has(t) && (g.chainKind || {})[t] !== "grudge") out.push(`道化の怨霊 ${nmf(h)} の恨み対象 ${nmf(t)} は、恨殺以外の死因で先に死亡しました。`);
    });
    (g.jesterGhostFiltered || []).forEach((id) => out.push(`恨み殺された ${nmf(id)} は敗北しました。`));
    return out;
  }
  /** 実績（マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === R_() || cur === R_()) out.push("first_jester_ghost");
    if (cur === R_() && won) out.push("win_jester_ghost");
    if (cur === R_() && !(g.jesterGhostSuccess || {})[id]) {
      const t = targetOf(g, id);
      if (t && t !== id) {
        const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set([...(g.executed || []), ...(g.deadIds || [])]);
        if (dead.has(t)) out.push("jester_ghost_target_died_early");
      }
    }
    return out;
  }
  ONW.jesterGhost = { nm, setTarget, targetOf, holdsCard, fix, picks, seen, seenOf, unseen, cpuLearn, reveal: ghostReveal, noteSuccess, executedDirectly, extraWins, applyGrudgeLossFilter, lines, achievements };

  // ---- COの文・結果（COボタン / CPUの発言・騙り）: 「〇〇を恨んでいます。」（マイクラ版 main.js の CO 履歴の文）。claim は { kind: "jester_ghost", target } ----
  const coText = (name) => `${name} を恨んでいます。`;
  const coShort = (name) => `恨み対象: ${name}`;
  const claimOf = (name, id) => ({ short: coShort(name), text: coText(name), claim: { kind: "jester_ghost", target: id } });
  /** CPUの騙り（人狼・狂人などが道化の怨霊を名乗る）: 生きている他の人をランダムに「恨んでいる」と言う。候補がいなければ結果なしのCO */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)];
    return { co, result: claimOf(t.name, t.id) };
  }
  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ）。選んだ相手は i.jesterGhostTarget に覚える ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const others = g.players.filter((q) => q.id !== p.id);
    if (!others.length) return;
    const t = f.player && f.player !== p.id && n.validPlayer(p, f.player) ? f.player : n.pick(others).id;
    setTarget(g, p.id, t); seen(g, p.id, t);
    if (!cur) { i.mode = "jester_ghost"; i.target = t; }
    i.jesterGhostTarget = t;
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, t)} を恨みました。`);
    n.hold(p.id, `あなたは ${nm(g, t)} を恨みました。`);
    n.ob(p.id, [t]);
    n.nn(rid);
  }

  ONW.defineRole("jester_ghost", {
    info: { observe: "player", sealTarget: true, deck: 178, name: "道化の怨霊", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 63,
      desc: "第三陣営。夜に自分以外のプレイヤーを1人選び、恨み対象にします。自身が追放されると、恨み対象を恨み殺します。追放されたうえで恨み殺しに成功すれば追加で勝利します。ただし、恨み対象が恨殺以外の死因で先に死亡した場合は敗北します。恨み殺されたプレイヤーは、殉職者か勝ち組でない場合、無条件で敗北します。朝、怨霊本人にだけ、恨み対象のカードが🕯️（恨み）でめくれます。" },
    groups: { "transform:silver_shadow": 38 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる。偶数人 37 の次）。光の使徒・闇の化身からは変化しない
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>恨み対象</strong>のカードを1人分押してください。（自分以外）<br>あなたが追放されると、その相手を恨み殺します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>恨み対象</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分以外）
    /** CPUの発言: 本物の道化の怨霊は、確率（k.coTruth）で本当にCOして「〇〇を恨んでいます。」と言う。それ以外は他の役職を騙る（第三陣営は名乗らない決まり）。恨み対象の記憶 i.jesterGhostTarget は cpuRun / cpuLearn が入れる */
    cpuClaim(k, g, p, r, i, c) {
      const t = i.jesterGhostTarget && g.players.find((q) => q.id === i.jesterGhostTarget && q.id !== p.id);
      if (t && k.selfRole(g, p) === "jester_ghost" && k.coTruth(g, p)) { c.co = "jester_ghost"; c.result = claimOf(t.name, t.id); }
      else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    /** CPUの騙り: 他の役職の人（人狼・狂人など）が道化の怨霊を名乗る。重みは小さめ（勝ち組・敗北組と同じ程度） */
    cpuLie: { role: "jester_ghost", weight: 3, order: 15, claim: lieClaim },
    /** 墓荒らし・ドッペルゲンガーで道化の怨霊を手にしたCPUが、朝のうちに選んだ対象を、連鎖のCOで伝える */
    cpuChainResult(k, g, p, i) {
      const t = i.jesterGhostTarget && g.players.find((q) => q.id === i.jesterGhostTarget && q.id !== p.id);
      return t ? claimOf(t.name, t.id) : null;
    },
    /** CPUの投票: 恨み対象が恨殺以外の死因で先に死ぬと敗北するので、その人への投票は避ける（復讐者の投票判断の逆向き） */
    cpuVoteScore: (k, g, p, q, i) => (i && i.jesterGhostTarget === q.id ? -15 : 0),
    cpuNight: { order: 15, stage: "seer", chain: true, run: cpuRun },   // 占い師の段階。「役職変動系以外の役職」（復讐者と同じ位置）
    night: {
      kind: "seer", order: 15,   // 役職変動系以外の役職（復讐者と同じ位置）。墓荒らし・ドッペル・シャッフラー・グレムリン・怪盗・いたずらっ子はすべてこのあとの段階
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t || t === p.id) return;   // 自分自身は選べない（自己参照になるのは役職交換・コピーの結果だけ）
        setTarget(g, p.id, t); seen(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を恨みました。`);
        c.hold(p.id, `あなたは ${nameOf(t)} を恨みました。`);
        ONW.observeNote(g, p.id, [t], null, "jester_ghost");
        ONW.newsNote(g, "jester_ghost");
        c.rev[p.id] = ghostReveal(t);   // 朝、選んだ対象のカードが🕯️でめくれる（怨霊本人の画面だけ）
      },
    },
    // ---- 役職が動いたあと・酔いが覚めたとき・昼のうち: 恨み対象の記録はカードについて動くので、新しい持ち主がまだ知らないときだけ、🕯️で知らせる ----
    /** 待機時間（朝のあと）: 最終盤面で道化の怨霊を持っていて、恨み対象をまだ知らされていない人（怪盗・いたずらっ子・交換者・グレムリン・シャッフラーなどでカードが動いた人）を確定する。酔っ払い・自己参照の人は含めない。CPUは記憶に入れる */
    settlePre: { order: 16, run(c) {
      const g = c.g, set = (g.jesterGhostSettle = {});
      unseen(g).forEach(([h, t]) => {
        const hp = g.players.find((q) => q.id === h);
        seen(g, h, t);
        const text = `あなたの恨み対象は ${nm(g, t)} です。`;
        g.nightLogsAll.push(`${c.rn(R_())} ${hp.name} は ${nm(g, t)} を恨み対象として受け取りました。`);
        if (hp.isCpu) { cpuLearn(g, h, t); c.hold(h, text); return; }
        set[h] = { logs: [text], items: [{ id: t }] };
      });
    } },
    settleMsg: { order: 26, run(c, p) { const e = (c.g.jesterGhostSettle || {})[p.id]; return e ? { logs: e.logs.slice(), jesterGhost: e.items.map((x) => ({ ...x })) } : {}; } },
    stageSettle: {
      field: "settleJesterGhost", shown: "settleJesterGhostShown",
      run: { order: 37, run(items, SK) {
        SK.later(() => { items.forEach((it, i) => SK.later(() => { const k = `p:${it.id}`; if (!jgKeys.includes(k)) jgKeys.push(k); SK.show(k, SK.JESTER_GHOST_MARK, true); SK.paint(SK.G()); }, i * 380)); }, 900);
      } },
      end: { order: 37, run(SK) { if (jgKeys.length) { jgKeys.forEach((k) => { if (SK.up[k] === SK.JESTER_GHOST_MARK) { delete SK.up[k]; delete SK.glow[k]; } }); jgKeys = []; SK.paint(SK.G()); } } },
    },
    /** 昼のうち（酔いが覚めた・昼に役職が動いた・昼に道化の怨霊を手にした）: 新しく道化の怨霊を手にして、まだ対象を知らされていない人へ。カードが数秒だけ🕯️でめくれる（jobday）。何度呼んでもよい（知らせた記録 g.jesterGhostSeen で重複を防ぐ）。
     *  net.js の dayCheck（昼に役職が動いた）と daySober（酔いが覚めた直後）から呼ばれる。酔いが覚めた本人には soberExtra でまとめて知らせる（二重に出さない） */
    dayCheck(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      unseen(g).forEach(([h, t]) => {
        const hp = g.players.find((q) => q.id === h);
        if (!hp || c.isDead(h)) return;
        seen(g, h, t);
        const text = `あなたの恨み対象は ${nm(g, t)} です。`;
        g.nightLogsAll.push(`${c.rn(R_())} ${hp.name} は ${nm(g, t)} を恨み対象として受け取りました。`);
        if (hp.isCpu) { cpuLearn(g, h, t); c.hold(h, text); return; }
        c.hold(h, text); c.send(h, { t: "jobday", id: t, text, role: MARK });
      });
    },
    daySober(c) { ONW.roleDef(R_()).dayCheck(c); },
    /** 酔いが覚めた本人（最終役職が道化の怨霊で、役職のカードについてきた恨み対象がある人）に、対象を文章でまとめて知らせる。peek は stageSober の list がめくる（net.js の soberUp） */
    soberExtra(c, id) {
      const g = c.g;
      if (g.currentRoles[id] !== R_()) return {};
      const t = targetOf(g, id);
      if (!t || t === id || !g.players.some((q) => q.id === t)) return {};
      seen(g, id, t);
      return { lines: [`あなたの恨み対象は ${nm(g, t)} です。`], peek: { jesterGhost: [t] } };
    },
    stageSober: { list: { order: 23, run(sp, list, SK) { (sp.jesterGhost || []).forEach((t) => list.push([`p:${t}`, SK.JESTER_GHOST_MARK, true])); } } },
    /** 墓荒らし・ドッペルゲンガーで道化の怨霊を手にしたとき（朝のうち）/ 酔いが覚めた怨霊が昼に使うとき: 自分以外の1人を選べる。
     *  朝の時点の盤面で恨み対象を記録する（役職についていくので、このあと朝のうちに役職が動いても追従する）。
     *  酔っ払いは酔いが覚めるまで夜の能力を使えない（夜の resolve は酔い中の人には呼ばれない）ので、記録は覚めたあとのこの処理だけで入る。
     *  🕯️の演出（reveal）: 朝のうちは対象のカードが🕯️でめくれ、昼（酔いが覚めたあと）は数秒で閉じる（どちらも stage.js が reveal.day で切り分ける） */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        if (t === id) return null;   // 自分自身は選べない
        setTarget(g, id, t); seen(g, id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を恨みました。`);
        return { lines: [`あなたは ${c.nameOf(t)} を恨みました。`], reveal: ghostReveal(t), nextChain: null };
      },
    },
    // COボタン（co.js が kind で呼ぶ）: 恨み対象にした相手を1人選んでCO・結果を言う
    coResult: {
      kind: "jester_ghost", targetLabel: "恨み対象にした相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "jester_ghost", target: id }, null, "disclose", coShort(K.nameOf(id))],
    },
    /** 結果発表の演出: 恨殺（kind "grudge"）でめくれる人の直前に、stage.js の flipChain から呼ばれる（作者メモ: Feignのゴーストみたいな道連れ演出）。
     *  怨霊の席から半透明のゴーストが漂って対象の席へ移動し（stage.ghostDrag）、対象のカードが蒼白く震える。
     *  そのあと flipChain の通常の流れで「恨殺」の字幕とともにカードがめくれる。返り値 = 足す待ち時間 */
    stageResult: {
      grudgeFx: { order: 20, run(R, h) {
        const { later, P, G, paint, gx, setCap, esc } = R;
        const from = h.byId, to = h.id;
        if (!from || !to || from === to) return 0;
        const t0 = R.t, kTo = P(to);
        later(() => { setCap(`<div class="res-cap__t t-third">道化の怨霊</div><div>${esc(h.by)} の怨霊が ${esc(h.name)} を連れていく…</div>`); if (ONW.stage && ONW.stage.ghostDrag) ONW.stage.ghostDrag(from, to); paint(G()); }, t0);
        later(() => { gx[kTo] = "grudge"; paint(G()); }, t0 + 1500);   // ゴーストが取り憑いて、カードが蒼白く震える
        later(() => { gx[kTo] = "grudged"; paint(G()); }, t0 + 2100 + 1300);   // めくれたあとも蒼白い気配が残る（flipChain のめくり時刻に合わせる）
        return 2100;
      } },
      clear(SK) { const el = SK.$t(); if (el) el.querySelectorAll(".ghost-drag").forEach((n) => n.remove()); },
    },
    achievements(g, id, won) { return achievements(g, id, won); },
  });
})(window.ONW);
