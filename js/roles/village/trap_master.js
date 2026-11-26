/**
 * 罠師（マイクラ版 TRAP_MASTER を参考）: 村人陣営・夜に1人に罠を張る役職。罠を張られた人に「引っかかる陣営」が
 * 昼能力を使おうとすると、その昼能力は失敗して消費され、使おうとした人は投票権を失う。
 * ・マイクラ版の説明文: 「夜に選んだプレイヤーに罠を張ります。人狼陣営か第三陣営が罠を張られたプレイヤーに
 *   昼能力を使おうとすると失敗し投票権が失われます。」（配布時説明は js/role-desc-mc.js の転記が正）
 * ・夜の設置（マイクラ版 night.js openTrapMasterAction）: 自分以外の参加者1人を選んで罠を張る
 *   （game.trapMasterTarget[罠師] = 対象。墓地は選べない）。封印されていると共通処理で失敗し、対象が
 *   草むらに隠れた人（兎の狂人）だと共通ゲートで失敗する。朝のうちの連鎖（墓荒らし・ドッペルゲンガー）でも張れる。
 *   張り直し・補充（夜に選べなかった場合の昼の自動セット）はマイクラ版に無い。
 * ・記録は「人に紐づく状態」（マイクラ版でも trapMasterTarget は役職に付いて動かない）: 罠師の役職が
 *   入れ替わっても・罠師が死んでも罠は残る。ONW.ROLE_BOUND_KEYS には登録しない。
 *   罠の種類は設置時点のスナップショット g.trapMasterIsMimic[罠師] で固定される（マイクラ版
 *   isTrapMasterMimicTrapper: スナップショットがあればそれ、無ければ「最終役職が模倣の人狼で模倣先が罠師」）。
 * ・発動（マイクラ版 utils.js checkAndTriggerTrapMaster）: 昼能力の対象の中に「まだ発動していない罠が
 *   張られた人」がいて、使おうとした人がその罠の「引っかかる陣営」なら発動する。罠は対象ごとに1回だけ
 *   （発動したら壊れる。同じ対象に複数の罠があっても、発動は最初の罠師の罠だけ = trapMasterTrapperOf は最初の1件）。
 *   発動すると: その昼能力は失敗して消費され、使おうとした人は投票権を失う（g.trapNoVote。マイクラ版 noVoteIds）。
 *   本人には「あなたは罠に引っかかったため投票権を失いました。」が届く（罠師本人には一切通知しない）。
 *   投票権の喪失は vote.js の vote.weightOf（ONW.trapMaster.noVote なら 0 票。狂信者の投票権喪失と同じ入口）と
 *   選挙管理者の立候補可否に反映される。妖狐投票も同じ weightOf を使うため無効になる。
 * ・引っかかる陣営（マイクラ版 trapMasterFactionOf / isTrapMasterEnemy）: 使おうとした人の実効陣営 =
 *   最終役職の素の陣営。ただし素が村人陣営でも、シャッフラーの印つき（自分に置いた印の持ち主・対象。
 *   羊の狂人の shufflerBound と同じ判定）・反転のスタックが奇数回・恋人がいる、のどれかなら第三陣営として扱う。
 *   第三陣営はどちらの罠にも引っかかる。通常の罠師の罠には 人狼陣営+第三陣営 が、模倣の人狼が張った罠
 *   （模倣罠師）には 村人陣営+第三陣営 が引っかかる。
 * ・昼能力への接続（マイクラ版 main.js openDayActionMenu の全昼能力ブロック + game.js の CPU/デバッグ昼能力）:
 *   net.js の各 host 関数が、兎の狂人の dayGate の直後・猿凸の差し替えより前に ONW.trapMaster.dayGate を呼ぶ
 *   （保安官・ヴァニティ・天秤・独裁はマイクラ版どおり「差し替え前の元の対象」で判定する）。
 *   対象の無い昼能力（ホクマー・勝負師・予想屋）はマイクラ版でも発動しない（予想屋・勝負師・ホクマーは
 *   CPU/デバッグ経路でも明示的に対象外）ため接続しない。代行者の「守れ」はマイクラ版では対象を選ぶため
 *   罠チェックの対象だが、Web版の代行者は対象がランダムに決まる仕様（既存の移植判断）なので発動しない。銀狼の偽の昼能力もマイクラ版
 *   openSilverWolfFakeDayAction に罠チェックが無いため発動しない（兎の草むらとは扱いが違う。マイクラ版どおり）。
 *   消費の扱い: 1回だけの昼能力は dayGate の記録（g.trapDayFails）で以降の使用自体を塞ぐ（マイクラ版 dayActionDone）。
 *   複数回使える昼能力は「その1回だけ」が失敗する: レンは使用回数を1回分消費する（マイクラ版は封印・罠の
 *   チェックより前に renUseCount を増やす）。イカロスは分け与えが記録されないだけ（その相手への再試行は、
 *   罠が壊れているので通る）。
 *   静観者・龍の狂人・鈴の巫女への「使われた」記録（watcher.touch）は、罠で失敗した場合は数えない
 *   （解釈点: マイクラ版は役職ごとに markWatcher の位置が違い、レン・カウンセラー等は罠チェック前、
 *   保安官・フリーターは後。Web版は兎の草むらで失敗したときと同じく「失敗した能力は記録しない」で統一した）。
 * ・鼠の狂人・犬の狂人・カウンセラー・レンで未接続だった罠干渉は、この接続でまとめて解消した
 *   （hostRat / hostSheep / hostCounselor / hostRen も他の昼能力と同じ共通ゲートを通る）。
 * ・演出（作者メモ）: 朝に、罠を張った相手のカードがトラバサミの面（stage.js の TRAP_MARK "__trap"。
 *   図形＝SVG のトラバサミ）でめくれる（罠師本人の画面だけ。朝の開示 rev "peek"。番犬の 🦴・煽動者の 📢 と同じ作り）。
 *   罠が発動したときは、踏んだ人の画面で、罠を張られた人のカードが閉じたトラバサミの面
 *   （TRAP_SPRUNG_MARK "__trapsprung"。ガシャンと閉じて震える）でめくれて裏に戻る（stageFlash "trapFlash"）。
 * ・結果情報（第6バッチ共通指示。マイクラ版 vote.js の役職情報どおり）: 模倣の人狼を除く罠師について
 *   「罠師 {名前} は {対象} に罠を仕掛けており、罠が発動していました。」/「罠師 {名前} は {対象} に罠を
 *   仕掛けていましたが、罠は発動しませんでした。」/ 張れなかった場合は「罠師 {名前} は罠を仕掛けられませんでした。」
 *   （net.js の res.traps → ui.js に「罠師:」行）。本人の夜の結果（「{対象} に罠を仕掛けました。」）は情報確認に残る。
 * ・結果開示（COボタン）: 罠を仕掛けた相手を選んで「{対象} に罠を仕掛けました。」（マイクラ版CPUの真申告と同じ文）。
 * ・ハッキング: 罠師はハッキングの対象にも思い込みの対象にもなる。思い込んだ人は夜に偽の対象を選び
 *   （silver_wolf.js の fakeResult に trap_master 分岐。本物の盤面・罠には影響しない。朝のトラバサミ演出も本物と同じ）。
 *   ハッキングされている本物の罠師は罠を張れない（マイクラ版に煽動者のような背景解決は無い）。
 *   グレムリンにコピーされた罠師も罠は引き継がない（マイクラ版に引き継ぎ処理は無い）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（村人陣営）。
 *   闇の化身・銀色の影の対象外。コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に最初から入っている）。
 *   シャッフラーの山札には入らない（マイクラ版 shufflerEligibleRoles の除外どおり。shuffler.js の BLOCKED に追加）。
 *   模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い。模倣した罠師の罠は「模倣罠師」として効く）。
 *   ペルソナの仮面候補からも外れていない（persona.js の除外リストに無い）。
 * ・封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget。封印対象は 106 → 107 役）。
 *   封印されていると夜の選択が共通処理で失敗する。昼に罠師が封印されても、張った罠は消えない（マイクラ版に解除条件は無い）。
 *   カルメン・黄泉・鍵師の対象外（マイクラ版の各リストに無い）。詩人・観測の人狼の対象（info.observe = "player"）。
 *   見張り番・鈴の巫女の対象リストにはマイクラ版で入っている（対象リスト側に最初から入っていて自動で有効化）。
 * ・シナジー（マイクラ版 YAMINABE_TRAP_MASTER_TARGET_ROLES = [ヴァニティ・心眼の人狼・狂った交換者・羊の狂人・鼠の狂人]）:
 *   罠師が出る闇鍋には、この対象役職を合わせて最低2枚出す（roles.js の SYNERGY_COUNT_RULES。狂った交換者は
 *   未移植のため文字列のまま入れてあり、移植時に自動で効く）。
 * ・CPU: 夜は自分以外の参加者から1人をランダムに選ぶ（デバッグ指定があればそれ。草むらに隠れた人は選ばない＝
 *   Web版CPU共通）。真COは「{対象}に罠を仕掛けました」と開示する（マイクラ版CPUの真申告と同じ）。騙りも同じ形。
 * 状態: g.trapMasterTarget = { 罠師のID: 対象のID } / g.trapMasterIsMimic = { 罠師のID: bool } /
 *   g.trapMasterTriggered = { 対象のID: true } / g.trapMasterTriggerBy = { 対象のID: 踏んだ人のID } /
 *   g.trapNoVote = { 踏んだ人のID: true } / g.trapDayFails = [{ by, targets }]（すべて人に紐づく。
 *   試合ごとに net.startGame が初期化し、ホスト引き継ぎキーにも追加済み）
 */
(function (ONW) {
  const ID = "trap_master";
  const TRAP_MARK = "__trap";   // stage.js の TRAP_MARK と同じ文字列。トラバサミの面（朝に罠師本人の画面でだけめくれる）
  const TRAP_SPRUNG_MARK = "__trapsprung";   // stage.js の TRAP_SPRUNG_MARK と同じ文字列。発動した（閉じた）トラバサミの面（踏んだ人の画面でだけ）
  const TRAP_TEXT = "あなたは罠に引っかかったため投票権を失いました。";   // マイクラ版「罠師通知」の文そのまま
  /** 罠の対象になりうる昼能力を持つ役職（マイクラ版 YAMINABE_TRAP_MASTER_TARGET_ROLES。シナジー用） */
  const TARGET_ROLES = ["vanity", "mind_wolf", "mad_exchanger", "sheep_madman", "rat_madman"];
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
  const pickText = (name) => `${name} に罠を仕掛けました。`;
  const logText = (label, p, nameOf, t) => `${label} ${p.name} は ${nameOf(t)} に罠を仕掛けました。`;

  /** その人が罠を張った相手（決まっていなければ null。人に紐づく記録なので、最終盤面でも「張った人」で引く） */
  function targetOf(g, id) {
    const t = (g && g.trapMasterTarget || {})[id];
    return t && (g.players || []).some((q) => q.id === t) ? t : null;
  }
  /** その人の罠が「模倣罠師」の罠か（マイクラ版 isTrapMasterMimicTrapper: 設置時のスナップショット優先） */
  function isMimicTrapper(g, id) {
    if (!g) return false;
    const snap = g.trapMasterIsMimic || {};
    if (Object.prototype.hasOwnProperty.call(snap, id)) return !!snap[id];
    return (g.currentRoles || {})[id] === "mimic_wolf" && (g.mimicRole || {})[id] === ID;
  }
  /** 罠を張る（対象と、模倣罠師かどうかのスナップショットを記録する） */
  function setTarget(g, id, t) {
    (g.trapMasterTarget = g.trapMasterTarget || {})[id] = t;
    (g.trapMasterIsMimic = g.trapMasterIsMimic || {})[id] = isMimicTrapper(g, id);
  }
  /** 対象に罠を張った最初の罠師（マイクラ版 trapMasterTrapperOf。いなければ null） */
  function trapperOf(g, targetId) {
    const map = (g && g.trapMasterTarget) || {};
    for (const [trapper, t] of Object.entries(map)) if (t === targetId) return trapper;
    return null;
  }
  /** その対象の罠が発動済みか / 誰が踏んだか */
  const triggeredOn = (g, targetId) => !!((g && g.trapMasterTriggered) || {})[targetId];
  const triggerByOf = (g, targetId) => ((g && g.trapMasterTriggerBy) || {})[targetId] || null;
  /** 投票権を失っているか（vote.weightOf と選挙管理者が見る） */
  const noVote = (g, id) => !!((g && g.trapNoVote) || {})[id];

  /** シャッフラーの印つきか（マイクラ版 hasShufflerBadge の Web版相当。羊の狂人の shufflerBound と同じ判定） */
  function shufflerBound(g, id) {
    if (!ONW.shuffler || !ONW.shuffler.picks) return false;
    return ONW.shuffler.picks(g).some(([holder, target, , self]) => holder === id || (self && target === id));
  }
  /**
   * その人の実効陣営（マイクラ版 trapMasterFactionOf）: 最終役職の素の陣営。ただし素が村人陣営でも、
   * シャッフラーの印つき・反転のスタックが奇数回・恋人がいる、のどれかなら第三陣営として扱う。
   */
  function factionOf(g, id) {
    const role = (g.currentRoles || {})[id] || (g.initialRoles || {})[id];
    const info = role ? ONW.roles.getInfo(role) : null;
    const base = info ? info.team : ONW.TEAM.THIRD;
    if (base !== ONW.TEAM.VILLAGE) return base;
    if (shufflerBound(g, id)) return ONW.TEAM.THIRD;
    if (ONW.reverser && ONW.reverser.odd && ONW.reverser.odd(g, id)) return ONW.TEAM.THIRD;
    if (ONW.isLover && ONW.isLover(g, id)) return ONW.TEAM.THIRD;
    return ONW.TEAM.VILLAGE;
  }
  /** 使おうとした人が、その罠師の罠に引っかかる陣営か（マイクラ版 isTrapMasterEnemy） */
  function isEnemy(g, actorId, trapperId) {
    const f = factionOf(g, actorId);
    if (f === ONW.TEAM.THIRD) return true;
    if (isMimicTrapper(g, trapperId)) return f === ONW.TEAM.VILLAGE;
    return f === ONW.TEAM.WOLF;
  }

  /**
   * 昼能力の共通ゲート（マイクラ版 checkAndTriggerTrapMaster。net.js の各 host 関数が、兎の狂人の dayGate の
   * 直後・猿凸の差し替えより前に呼ぶ）。戻り値:
   *   0 = 罠なし（そのまま能力を続けてよい）
   *   1 = この人は今日すでに罠で昼能力を消費した（マイクラ版 dayActionDone。呼び出し側は何も送らず return）
   *   { target, trapper } = いま発動した（呼び出し側は本人へ trapday を送って return。能力は失敗して消費される）
   * opts.multi（レン・イカロスのような複数回使える昼能力）: 消費の記録（dayActionDone 相当）は付けない
   * （レンは呼び出し側で使用回数を1回分増やす。イカロスは分け与えが記録されないだけ）。
   */
  function dayGate(g, actorId, targetIds, opts) {
    if (!g) return 0;
    if (!(opts && opts.multi) && (g.trapDayFails || []).some((e) => e.by === actorId)) return 1;
    for (const targetId of targetIds || []) {
      if (!targetId) continue;
      const trapper = trapperOf(g, targetId);
      if (!trapper) continue;
      if (triggeredOn(g, targetId)) continue;   // その罠は既に発動済み（壊れている）
      if (!isEnemy(g, actorId, trapper)) continue;
      (g.trapMasterTriggered = g.trapMasterTriggered || {})[targetId] = true;
      (g.trapMasterTriggerBy = g.trapMasterTriggerBy || {})[targetId] = actorId;
      (g.trapNoVote = g.trapNoVote || {})[actorId] = true;   // 投票権を失う（マイクラ版 noVoteIds）
      if (!(opts && opts.multi)) (g.trapDayFails = g.trapDayFails || []).push({ by: actorId, targets: [...(targetIds || [])] });
      return { target: targetId, trapper };
    }
    return 0;
  }

  /** 結果発表の「役職情報」の行（マイクラ版 vote.js の罠師情報。模倣の人狼の分は出さない） */
  function lines(g, nm2) {
    return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => {
      const t = targetOf(g, p.id);
      if (!t) return `罠師 ${nm2(p.id)} は罠を仕掛けられませんでした。`;
      return triggeredOn(g, t)
        ? `罠師 ${nm2(p.id)} は ${nm2(t)} に罠を仕掛けており、罠が発動していました。`
        : `罠師 ${nm2(p.id)} は ${nm2(t)} に罠を仕掛けていましたが、罠は発動しませんでした。`;
    });
  }

  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_trap_master");
    if (fin === ID && won) out.push("win_trap_master");
    return out;
  }

  const H = (ONW.trapMaster = { targetOf, setTarget, trapperOf, isMimicTrapper, factionOf, isEnemy, dayGate, noVote, triggeredOn, triggerByOf, lines, achievements, TRAP_MARK, TRAP_SPRUNG_MARK, TRAP_TEXT, TARGET_ROLES });

  // ---- CPUの夜の行動: 自分以外の参加者から1人をランダムに選ぶ（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const hidden = ONW.rabbitMadman && ONW.rabbitMadman.hiddenId ? ONW.rabbitMadman.hiddenId(g) : null;
    const cand = g.players.filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id) && q.id !== hidden);
    const t = (f.player && cand.some((q) => q.id === f.player)) ? g.players.find((q) => q.id === f.player) : n.pick(cand);
    if (!t) return;
    setTarget(g, p.id, t.id);
    i.trapMasterTarget = t.id;   // 発言（結果開示）が使う
    g.nightLogsAll.push(logText(label, p, n.nameOf, t.id));
    n.hold(p.id, pickText(t.name));
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }
  /** 本物の罠師の発言: 罠を仕掛けた相手を開示する（マイクラ版CPUの真申告「○○に罠を仕掛けました」と同じ） */
  function cpuClaim(k, g, p, r, i, c) {
    const tid = (i && i.trapMasterTarget) || targetOf(g, p.id);
    if (!tid) return;
    c.co = ID;
    c.result = { short: `${nm(g, tid)} に罠を仕掛けました`, text: `${nm(g, tid)} に罠を仕掛けました。`, claim: { kind: ID, target: tid } };
  }
  /** 騙りの結果開示: 適当な相手に罠を仕掛けたことにする（マイクラ版の騙りと同じ形） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)];
    return { co, result: { short: `${t.name} に罠を仕掛けました`, text: `${t.name} に罠を仕掛けました。`, claim: { kind: ID, target: t.id } } };
  }

  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 171, count: 0, name: "罠師", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 24.6,
      desc: "村人陣営。夜に選んだプレイヤーに罠を張ります。人狼陣営か第三陣営が罠を張られたプレイヤーに昼能力を使おうとすると失敗し投票権が失われます。" },
    groups: { "transform:light_apostle": 70 },   // 光の使徒の変化先（村人系）のみ。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    achievements,
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>罠を仕掛ける相手</strong>のカードを1人分押してください。（<strong>自分は選べません</strong>）<br>人狼陣営か第三陣営がその人に<strong>昼能力</strong>を使おうとすると失敗し、<strong>投票権を失います</strong>。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>罠を仕掛ける相手</strong>のカードを押して",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分は選べない。番犬・犬の狂人と同じ）
    cpuLie: { role: ID, weight: 20, order: 70, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    /** 墓荒らし・ドッペルゲンガーで罠師を手にしたCPUが、続けて言う結果 */
    cpuChainResult(k, g, p, i) {
      const c = {}; cpuClaim(k, g, p, ID, i, c); return c.result || null;
    },
    cpuNight: { order: 15, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 15,   // 占い師(10)・番犬(12)・見張り番(13)・煽動者(14)のあと。役職変動系より前に選ぶ
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        setTarget(g, p.id, t);
        g.nightLogsAll.push(logText(c.rn(c.eff(p)), p, nameOf, t));
        c.hold(p.id, pickText(nameOf(t)));
        c.rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: TRAP_MARK }] };   // 朝: 罠を仕掛けた相手のカードがトラバサミの面でめくれる（罠師本人の画面だけ。作者メモ）
        ONW.observeNote(g, p.id, [t], null, c.eff(p));
        ONW.newsNote(g, c.eff(p));
      },
    },
    /** 墓荒らし・ドッペルゲンガーで罠師を手にしたとき（朝のうち）と、酔い覚め（昼）: 罠を仕掛ける相手を1人選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        setTarget(g, id, t);
        g.nightLogsAll.push(logText(c.label, c.me, c.nameOf, t));
        ONW.observeNote(g, id, [t], null, ID);
        ONW.newsNote(g, ID);
        return { lines: [pickText(c.nameOf(t))], reveal: { kind: "peek", items: [{ k: `p:${t}`, role: TRAP_MARK }] }, nextChain: null };
      },
    },
    // 結果開示(COボタン)の流れ: 罠を仕掛けた相手を選ぶと、そのまま「○○ に罠を仕掛けました。」を開示する（マイクラ版の結果開示フォームと同じ。煽動者と同じ形）
    coResult: {
      kind: ID, targetLabel: "罠を仕掛けた相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} に罠を仕掛けました。`, { kind: ID, target: id }, null, "disclose", `${K.nameOf(id)} に罠を仕掛けました`],
    },
    // 罠が発動したときの演出（踏んだ人の画面だけ）: 罠を張られた人のカードが、閉じたトラバサミの面でめくれて数秒後に裏に戻る
    stageFlash: {
      field: "trapFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = TRAP_SPRUNG_MARK; SK.glow[k] = true;
          SK.paint(SK.G());
        }, 150 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 150 + list.length * 380 + 2600);
      },
    },
  });
})(window.ONW = window.ONW || {});
