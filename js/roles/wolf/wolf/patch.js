/**
 * patch.js — パッチ（人狼陣営 / deck 172 / wiki order 91 / 元ネタ: エルデンリング）
 *
 * マイクラ版（scripts/night.js の openPatchAction / resolvePatchAutoSwap / finishPatchPostSwapFlow /
 * finishGraveyardRobberySwap、extraRoles.js の getWolfTeamVisiblePartnerIds、vote.js の
 * buildPatchResultInfo、state.js の ROLE_INFO、roles.js の YAMINABE_SEAL_TARGET_ROLES /
 * TRANSFORM_ROLE_GROUPS、stats.js の実績）を正とする。
 * 作者（くろはさん）の依頼メモ（2026-11-26・第6バッチ）:
 * 「墓荒らしをもとに作ってほしいが、自動能力なので、夜のうちに墓から自分のところへ持ってくる。
 * 墓荒らしみたいな演出で夜のうちに行い、能力後の夜能力選択や見えるべき情報が
 * めくれるようにお願いします。ここバグらないのだいじ」
 * → 土台は墓荒らし（relic_robber.js）: 夜の段階は "relic"（起床順も墓荒らしと同じ order 10）、
 *   朝の演出も墓荒らしと同じ rev.kind "relic"（墓地のカードが揺れて自分のカードと入れ替わる）。
 *   交換後に手にした役職の夜情報は gotInfo で届け、夜能力は朝の連鎖（g.morningAct）に載せる。
 *
 * ・自動能力: 夜に自分で選ぶ操作はない。自分の番（墓荒らしと同じ段階）に自動で判定する:
 *     1. 相方の人狼がいる → 発動しない（「相方がいるため、能力は発動しませんでした。」）。
 *        相方 = 他の参加者の「初期役職」が人狼として見える役職（ONW.WOLF_LOOK = 見える人狼系 +
 *        スパイ + 妖狸。一匹狼は誰からも見えないので相方に入らない。マイクラ版
 *        getWolfTeamVisiblePartnerIds の22役職と一致）。
 *     2. 相方がいない → 墓地からランダムに1枚と自分の役職を交換する。
 *        - 鍵師に自分の役職をロックされている → 失敗（patchFailReason "locked"）。
 *        - 墓地が無い → 失敗（"no_center"。結果情報には行を出さない = マイクラ版どおり）。
 *        - 奪う先は賞金稼ぎ・妖狸を避ける（避けた先が無いときだけ、その2役からも選ぶ）。
 *          静観者の札の墓地に当たったら墓荒らしと同じく別の墓地へずれる（watcher.shiftGrave）。
 *        - 墓地が銀狼 → ハッキングに阻まれて奪えない（"silver_wolf"）。
 *     封印されているときは共通の仕組みで失敗する（結果情報は「封印されていたため失敗しました。」）。
 * ・交換が成立したら: 新聞に「パッチ」が載る（マイクラ版 recordNewspaperRole(ROLE.PATCH) は
 *   交換成立時だけ）。魔法使いの盗み・モーゼスの引き（票数1票）も墓荒らしと同じ接続。
 *   処刑人・従者を奪ったら、その情報も墓荒らしと同じく届く。
 * ・交換後の役職の扱い（作者の最重要指示）: 夜情報は gotInfo で「手にした役職の初期夜情報」が
 *   そのまま届き、夜能力のある役職は朝の連鎖で使える（CPUは pendingChain で即座に使う）。
 *   パッチ自身を奪った場合は連鎖しない（マイクラ版 patchNightExecuted の再入防止と同じ）。
 * ・墓荒らし・ドッペルゲンガー・酔い覚め経由: 朝/昼の連鎖（morning.run）でも同じ自動判定が
 *   その時点の盤面で走る（マイクラ版 openCopiedNightAction の PATCH 分岐と同じ）。
 * ・結果情報（情報確認。マイクラ版 buildPatchResultInfo）: 初期役職がパッチの人だけ:
 *     相方がいた / 墓地NからXを奪っていた / ロックで交換できなかった / 封印で失敗した /
 *     墓地の銀狼を盗めなかった。相方の判定は初期役職から決まるので、結果を作るときに再計算する。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / NON_MIMICABLE_ROLES / cosplayerEligibleRoles /
 *   shufflerEligibleRoles / PERSONA_MASK_EXCLUDED_ROLES）:
 *   闇の化身 = 入る（人狼系）/ 光の使徒・銀色の影 = 入らない / 模倣 = できる（模倣したパッチも
 *   自動交換する。結果情報には出ない = マイクラ版が初期役職で判定するため）/
 *   コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入らない（除外に追加済み）/
 *   ペルソナの仮面候補 = 入る（除外リストに PATCH は無い）。
 * ・封印: 対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に PATCH あり。108役目）。
 * ・ハッキング: 対象にも思い込み先にもなる。思い込んだ人には人狼系の偽の夜情報（仲間の人狼）が
 *   出て（silver_wolf.js の WOLFVIEW に追加）、朝には偽の結果（相方がいた / 墓地から奪った +
 *   墓荒らしと同じ入れ替わり演出 + 偽の連鎖）が出る。本物のパッチがハッキングされたときは、
 *   本当の自動能力が裏で CPU と同じ動きで使われる（結果情報も本物の記録から作られる）。
 * ・乞食: 本物の人狼系は構造的に取れない（beggar.js が WOLF_KIND を除外）ので変更なし。
 * ・見張り番: 交換した夜は observeNote（墓地対象）で「行動していた」になる。相方がいて
 *   発動しなかった夜は記録が無いので「行動していなかった」になる（マイクラ版の actionDone の
 *   立ち方は未確認のため、観測記録ベースの Web 版の流儀に合わせた解釈）。
 * ・CPU: 夜は cpuNight（段階 "relic"・order 50）で自動判定。交換後は墓荒らしと state を共有し
 *   （i.relic）、CO はマイクラ版どおり「墓地NからXを盗みました」と開示し、手にした役職の
 *   結果（占い結果など）も chainedResult で続けて言う。パッチは人狼陣営なので、通常の CPU は
 *   村人役を騙る（騙り先がパッチのときは cpuLieResult で偽の「盗みました」を言う）。
 * ・実績（Wiki / マイクラ版 stats.js。Web版には保存が無いので判定関数だけ）:
 *   first_patch「あんた聞こえないのか？降参だと言ってるじゃ無いか！」/
 *   win_patch「へへへっありがとよそれ開けられなくて困ってたんだ」/
 *   lose_patch「…ま、待ってくれ！降参！降参だ！」（最終役職がパッチで敗北）/
 *   patch_steal_wolf「…そりゃあ、いつかこうなるわなクソったれが…」
 *   （パッチの能力で墓地から人狼系（見た目判定）を奪う。マイクラ版は共有の relicSeen を見るが、
 *   Web版はパッチ自身の交換記録 patchStolenRole で判定する）。
 *
 * 状態: g.patchStolenRole = { 持ち主ID: 奪った役職 } / g.patchGraveIdx = { 持ち主ID: 墓地番号 } /
 *       g.patchHadPartner = { 持ち主ID: true } / g.patchFailReason = { 持ち主ID: "locked"|"no_center"|"silver_wolf" }
 *       （net.startGame が {} に戻し、ホスト引き継ぎキーにも追加済み）
 */
(function (ONW) {
  const ID = "patch";
  const K = ONW.wolfKit;
  const rn = (r) => (ONW.ROLE_INFO[r] || {}).name || r;

  /** 相方の人狼（他の参加者の初期役職が「人狼として見える」役職。一匹狼は含まない） */
  const partnersOf = (g, id) => (g.players || []).filter((q) => q.id !== id && (ONW.WOLF_LOOK || []).includes((g.initialRoles || {})[q.id])).map((q) => q.id);

  /** 奪う墓地の番号: 賞金稼ぎ・妖狸を避けてランダム（避けた先が無ければ全部から）。forced = デバッグ指定 */
  function pickGrave(g, forced) {
    const c = g.center || [];
    if (forced != null && forced >= 0 && forced < c.length) return forced;
    const avoid = c.map((r, i) => i).filter((i) => c[i] !== ONW.ROLE.BOUNTY_HUNTER && c[i] !== ONW.ROLE.YOKAI_TANUKI);
    const cand = avoid.length ? avoid : c.map((r, i) => i);
    return cand[Math.floor(Math.random() * cand.length)];
  }

  /**
   * 自動判定の本体（夜の resolve / 朝・昼の連鎖 / CPU で共有）。盤面の交換と記録だけ行い、
   * 文章・演出・連鎖の載せ方は呼び出し側が文脈に合わせて行う（墓荒らしと同じ作り）。
   * when: 魔法使いの盗みの文脈（"night" = 夜のうち / "auto" = 朝・昼の連鎖）
   * 戻り値: { type: "partner"|"locked"|"no_center"|"silver"|"stolen", idx?, got?, stolen? }
   */
  function attempt(g, id, forced, when) {
    g.patchStolenRole = g.patchStolenRole || {}; g.patchGraveIdx = g.patchGraveIdx || {};
    g.patchHadPartner = g.patchHadPartner || {}; g.patchFailReason = g.patchFailReason || {};
    if (partnersOf(g, id).length) { g.patchHadPartner[id] = true; return { type: "partner" }; }
    if (ONW.keymaster.gate(g, id, [])) { g.patchFailReason[id] = "locked"; return { type: "locked" }; }   // 鍵師のロック: 自分の席がロック中なら🔒に弾かれて失敗
    if (!g.center || !g.center.length) { g.patchFailReason[id] = "no_center"; return { type: "no_center" }; }
    let idx = pickGrave(g, forced);
    idx = ONW.watcher.shiftGrave(g, idx);   // 静観者の札の墓地に当たったら、静観者でない別の墓地と交換する（墓荒らしと同じ）
    const got = g.center[idx];
    if (ONW.hack && ONW.hack.blocks(got)) { g.patchFailReason[id] = "silver_wolf"; g.patchGraveIdx[id] = idx; return { type: "silver", idx }; }   // 銀狼は奪えない
    ONW.swapGrave(g, id, idx);
    const stolen = ONW.magician ? ONW.magician.trySteal(g, id, got, ID, when || "night") : false;   // 魔法使い: 変化後の役職を奪われる（奪われたら連鎖能力は使えない。見た役職は奪った役職のまま）
    if (ONW.moses) ONW.moses.drewFromGrave(g, id);   // モーゼスを引いたら票数は1票（マイクラ版）
    g.patchStolenRole[id] = got; g.patchGraveIdx[id] = idx;
    return { type: "stolen", idx, got, stolen };
  }

  /** 結果情報（マイクラ版 buildPatchResultInfo。初期役職がパッチの人だけ。模倣の人狼の分は出さない） */
  function lines(g, nm) {
    const out = [];
    (g.players || []).forEach((p) => {
      if ((g.initialRoles || {})[p.id] !== ID) return;
      const name = nm ? nm(p.id) : p.name;
      if (partnersOf(g, p.id).length) { out.push(`パッチ${name} は相方がいたため能力を発動しませんでした。`); return; }
      const st = (g.patchStolenRole || {})[p.id];
      if (st) { out.push(`パッチ${name} は相方がいなかったため、墓地${(g.patchGraveIdx || {})[p.id] + 1}から${rn(st)}を奪っていました。`); return; }
      const f = (g.patchFailReason || {})[p.id];
      if (f === "locked") out.push(`パッチ${name} は相方がいなかったため能力を発動しようとしましたが、自身の役職がロックされていたため交換できませんでした。`);
      else if (f === "silver_wolf") out.push(`パッチ${name} は相方がいなかったため能力を発動しましたが、墓地の銀狼を盗めませんでした。`);
      else if (f !== "no_center" && ONW.seal && ONW.seal.is(g, p.id)) out.push(`パッチ${name} は相方がいなかったため能力を発動しようとしましたが、封印されていたため失敗しました。`);
    });
    return out;
  }

  /** 実績（Wiki / マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_patch");
    if (cur === ID && won) out.push("win_patch");
    if (cur === ID && !won) out.push("lose_patch");
    const st = (g.patchStolenRole || {})[id];
    if ((ini === ID || cur === ID) && st && (ONW.WOLF_KIND || []).includes(ONW.shownRole(st))) out.push("patch_steal_wolf");
    return out;
  }

  ONW.patch = { partnersOf, pickGrave, attempt, lines, achievements };

  // ---- CPUの夜の行動（墓荒らしの run と同じ作り。自動判定なので選択はない） ----
  function run(n, p, label, cur, rid) {
    const g = n.g, i = n.infoOf(p.id);
    const fg = (n.forced(p).graves || []).filter((x) => x >= 0 && x < (g.center || []).length);   // デバッグ: 奪う墓地の指定
    const out = attempt(g, p.id, fg.length ? fg[0] : undefined, cur ? "auto" : "night");
    i.mode = "patch";
    if (out.type === "partner") { n.hold(p.id, "相方がいるため、能力は発動しませんでした。"); return; }
    if (out.type === "locked") { i.keyFail = { kind: "self" }; n.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "交換", [], `${label} ${p.name}`)); return; }
    if (out.type === "no_center") return;
    if (out.type === "silver") { i.keyFail = { kind: "hack" }; n.hold(p.id, ONW.hack.fail(g, "relic", `${label} ${p.name}`, `墓地${out.idx + 1}`)); return; }
    const { idx, got } = out, seen = ONW.shownRole(got);
    i.relic = { graveIdx: idx, newRole: seen }; i.known[p.id] = seen;   // 墓荒らしと state を共有（マイクラ版も relicTargetIndex / relicSeen を共有。CO・連鎖結果の仕組みをそのまま使う）
    n.hold(p.id, `あなたは能力を発動し、墓地${idx + 1}の${n.rn(got)}を奪いました。`);
    if (got === ONW.ROLE.EXECUTIONER) { const tid = ONW.execTarget(g, p.id); if (tid) i.execTarget = tid; }   // 墓地から引いた処刑人: 新しいターゲットが決まっていて、本人は朝に知る
    if (got === ONW.ROLE.SERVANT) { const mid = ONW.servantMaster(g, p.id); if (mid) i.master = mid; }   // 墓地から引いた従者: 新しいご主人が決まっていて、本人は朝に知る
    const ga = ONW.mimic.gotAct(g, p.id, got);   // 模倣の人狼を引いたら、模倣先の能力を使う
    i.pendingChain = !out.stolen && ga !== ID && ONW.cpu.chainRoles(ID).includes(ga) ? ga : null;   // 交換後の役職に夜行動があれば、朝に使う（パッチ自身は連鎖しない）
    n.ob(p.id, [], [idx]);
    n.nn(ID);
  }

  // ---- CPUの発言 ----
  function cpuClaim(k, g, p, r, i, c) {
    const { rn } = k;
    c.co = ID;
    if (i.keyFail && i.keyFail.kind === "hack") { c.result = { short: "ハッキングで失敗", text: ONW.hack.failLine("relic"), claim: null }; return; }   // 銀狼に阻まれて失敗した: 正直に言う
    if (i.keyFail) { c.result = { short: "ロックで失敗", text: "自身の役職がロックされていたため交換に失敗しました。", claim: null }; return; }   // ロックされて交換に失敗した: 正直に言う
    const st = (g.patchStolenRole || {})[p.id];
    if (!st) return;   // 相方がいた（交換情報なし）: COだけする（マイクラ版も結果は言わない）
    const idx = (g.patchGraveIdx || {})[p.id], seen = ONW.shownRole(st);
    c.result = { short: `墓地${idx + 1} → ${rn(seen)}`, text: `墓地${idx + 1}から${rn(seen)}を盗みました。`, claim: { kind: "relic", role: seen, graveIdx: idx } };   // マイクラ版「パッチCO。墓地NからXを盗みました」。claim は墓荒らしと同じ形（手にした役職の結果も chainedResult で続けて言う）
  }
  function fakeGot(k, g, i, role) {
    const { rn } = k;
    return { co: ID, result: { short: `墓地${i.relic.graveIdx + 1} → ${rn(role)}`, text: `墓地${i.relic.graveIdx + 1}から${rn(role)}を盗みました。`, claim: { kind: "relic", role, graveIdx: i.relic.graveIdx } } };
  }

  ONW.defineRole(ID, {
    // 夜の画面: 自動能力なので選ぶ操作はない（idle の説明だけ。夜情報＝仲間の人狼は nightMsg が出す）
    uiNight: {
      idle(X) {
        return `<p class="night-step__hint">パッチは<strong>自動</strong>で発動します（選ぶ操作はありません）。相方の人狼がいないとき、夜の終わりに墓地の役職と自動で交換します。交換した役職に夜の能力があれば、朝のうちに使えます。</p>`;
      },
      chainReady: () => true,   // 朝・昼の連鎖（墓荒らし・ドッペル・酔い覚め経由）: 選ぶものはなく、そのまま確定できる
      chainHow: () => "選ぶものはありません（自動で発動します）。そのまま",
    },
    // 朝の演出は墓荒らしと同じ（stage.js が rev.kind "relic" で墓荒らしの stageMorning を使う）: 墓地のカードがガタッと揺れて、自分のカードと入れ替わる
    cpuClaim,
    /** パッチを騙るときも、COだけで終わらず「墓地Nから ○○ を盗みました」と結果を言う */
    cpuLieResult(k, g, p, selfRole, co) {
      if (!g.center || !g.center.length) return null;
      const idx = k.pick ? k.pick([...g.center.keys()]) : Math.floor(Math.random() * g.center.length);
      return fakeGot(k, g, { relic: { graveIdx: idx } }, k.fakeVillageRole(g, (r) => k.canGetByClaim(g, "relic", r)));
    },
    cpuFakeGot: { kind: "relic", make: fakeGot },
    cpuNight: { order: 50, stage: "relic", chain: true, run },   // CPUの夜の行動（墓荒らしと同じ段階・起床順。chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える）
    info: { observe: "grave", sealTarget: true, deck: 172, name: "パッチ", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.599,
      desc: "人狼陣営。相方の人狼がいないとき、夜に自動で墓地の役職と自分の役職を交換します。交換後の役職に夜行動があればその能力も使えます。" },
    groups: { wolf: 9.49, "transform:dark_avatar": 9.99 },   // 人狼系（闇の化身の変化先。並びは ROLE_ORDER = wiki の order 91）
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,   // 人狼系共通の夜情報（仲間の人狼）。got = 墓荒らし/ドッペルでパッチを手にしたときの情報
    night: {
      kind: "relic", order: 10,   // 墓荒らしと同じ段階・起床順（chain は切らない: 墓荒らし・ドッペルで手にしたパッチは朝の連鎖で使える）
      complete: () => true,   // 自動能力: 選択は不要
      normalize: (c, players, graves) => ({ players: [], graves: [] }),
      resolve(c, p) {   // 夜の終わりに自動で判定（選ぶ操作はない）
        const g = c.g, rn = c.rn, hold = c.hold, rev = c.rev;
        const label = `${rn(c.eff(p))} ${p.name}`;
        const out = attempt(g, p.id, undefined, "night");
        if (out.type === "partner") { hold(p.id, "相方がいるため、能力は発動しませんでした。"); return; }
        if (out.type === "locked") { hold(p.id, ONW.keymaster.fail(g, p.id, "self", "交換", [], label)); rev[p.id] = ONW.keymaster.failRev(g, p.id, p.id); return; }   // 鍵師のロック: 失敗。墓地は動かず、新聞・観測にも載らない
        if (out.type === "no_center") { hold(p.id, "墓地カードがありません。"); return; }
        if (out.type === "silver") { hold(p.id, ONW.hack.fail(g, "relic", label, `墓地${out.idx + 1}`)); rev[p.id] = ONW.hack.failRev("g:" + out.idx); return; }   // 銀狼は奪えない。墓地は動かず、新聞・観測にも載らない
        const { idx, got } = out;
        hold(p.id, `あなたは能力を発動し、墓地${idx + 1}の${rn(got)}を奪いました。`);
        const ga = ONW.mimic.gotAct(g, p.id, got);   // 模倣の人狼を引いたら、模倣先の能力を朝のうちに使える
        if (!out.stolen && ga !== ID && ONW.roleCanChain(ga)) { g.morningAct[p.id] = ga; }   // 交換後の役職の夜能力は朝のうちに使える（パッチ自身は連鎖しない）
        rev[p.id] = ONW.mimic.tag(g, p.id, got, { kind: "relic", target: idx, role: ONW.shownRole(got) });   // 墓荒らしと同じ入れ替わり演出
        ONW.observeNote(g, p.id, [], [idx], ID);
        ONW.newsNote(g, ID);
        c.gotInfo(g, p, got, rev, { skipGrave: idx, both: true, via: `墓地${idx + 1} から奪った従者` });   // 手にした役職の初期夜情報（仲間の人狼・墓地・ご主人など）が届く
      },
    },
    morning: {
      run(c) {   // ドッペルゲンガーがコピーしたパッチ / 墓荒らしが奪ったパッチ / 昼に酔いが覚めたパッチ: その時点の盤面で自動判定
        const g = c.g, rn = c.rn, id = c.id;
        const label = `${c.label} ${c.me.name}`;
        const out = attempt(g, id, undefined, "auto");
        if (out.type === "partner") return { lines: ["相方がいるため、能力は発動しませんでした。"], reveal: null, nextChain: null };
        if (out.type === "locked") return { lines: [ONW.keymaster.fail(g, id, "self", "交換", [], label)], reveal: ONW.keymaster.failRev(g, id, id), nextChain: null, failed: true };   // 朝のうち・酔い覚めにもロックは効く
        if (out.type === "no_center") return { lines: ["墓地カードがありません。"], reveal: null, nextChain: null };
        if (out.type === "silver") return { lines: [ONW.hack.fail(g, "relic", label, `墓地${out.idx + 1}`)], reveal: ONW.hack.failRev("g:" + out.idx), nextChain: null, failed: true };   // 銀狼は奪えない（経由でも同じ）
        const got = out.got;
        const lines = [`あなたは能力を発動し、墓地${out.idx + 1}の${rn(got)}を奪いました。`];
        lines.push(...c.soberInfoLines(g, id, got));   // 手にした役職の情報（模倣の人狼を引いたら「〜を模倣しています。」もここに入る）
        const reveal = ONW.mimic.tag(g, id, got, { kind: "relic", target: out.idx, role: ONW.shownRole(got) });   // 墓地と入れ替わる演出（朝も、昼に酔いが覚めたときも出す）
        return { lines, reveal, nextChain: null };
      },
      after(c, res) {   // 昼に奪った先の役職にも能力があれば、続けて1回使える（墓荒らしと同じ）
        const g = c.g, id = c.id;
        const ga = ONW.mimic.gotAct(g, id, g.currentRoles[id]);   // 模倣の人狼を引いたら、模倣先の能力を使える
        if (ga !== ID && ONW.roleCanChain(ga)) { res.nextChain = ga; g.morningAct[id] = res.nextChain; g.morningDone[id] = false; res.lines.push("この役職の能力も、議論中に1回だけ使えます。"); }
      },
      peek: (c) => c.soberPeek(c.g, c.id, c.g.currentRoles[c.id]),   // 昼に使ったパッチ: 奪った後の役職の演出
    },
  });
})(window.ONW);
