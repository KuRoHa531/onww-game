/**
 * カウンセラー（counselor）: 村人陣営。マイクラ版 scripts のカウンセラーを移植（第6バッチ・10役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / main.js の昼能力フロー / extraRoles.js resolveCounselorConversionForTarget 準拠）:
 *   ・夜の能力は無い。昼能力で、生きている自分以外のプレイヤー1人を選ぶ。その人の「最終役職」が狂人系
 *     （マイクラ版 isMadRole。Web版では ONW.MAD_KIND = groups.mad の役職一覧と一致）なら、最終役職を村人に
 *     書き換える（更生）。狂人系でない人に使った場合は失敗する。
 *   ・判定は最終役職そのもの（思い込み・模倣は見ない）: 昇格した狂人は最終役職が狂人のままなので更生でき、
 *     更生すると昇格も解ける（g.promotedWolfIds から外す）。狂人を模倣している模倣の人狼（最終役職は模倣の人狼）や、
 *     狂人を思い込んでいるクローン（最終役職はクローン）は更生できない（マイクラ版どおり）。
 *   ・更生の書き換えは少佐の救済（major.js の overwrite / clearOverlaps）と同じ後始末を行う:
 *     役職に紐づく記録の削除・恋人/シャッフラー/反転の状態解除・従者/処刑人の付け直し・履歴（roleTrail）への記録。
 *   ・対象が鍵師にロックされている場合は「静かに失敗」する: 対象の記録だけ残り、成功/失敗どちらの通知も
 *     本人に出ない（マイクラ版 resolveCounselorConversionForTarget の lockedRoleTargets 分岐。使用は消費される）。
 *   ・対象が口封じの狂人だった場合、その口封じは解除され、口封じされていた人に「口封じが解除されました。」が届く
 *     （マイクラ版どおり。解除の実処理は net.js の hostCounselor が行う）。
 *   ・封印されていると使えない（マイクラ版の昼フローは封印で消費するが、Web版の昼能力の共通仕様
 *     「封印中は開けず消費しない」に合わせた。羊の狂人・霊媒師と同じ。解釈点として docs/counselor.md に明記）。
 *   ・兎の狂人: 草むらに隠れた人を対象に選ぶと失敗して消費される（マイクラ版も chooseParticipant の共通ゲート
 *     failRabbitHiddenDayTarget で失敗する）。Web版は hostCounselor が ONW.rabbitMadman.dayGate を通す（羊・霊媒と同じ）。
 *   ・トラップマスター（罠師）: 罠師の移植時に接続済み（hostCounselor が ONW.trapMaster.dayGate を通す。
 *     罠を張られた人を対象に選ぶと失敗して消費され、投票権を失う）。
 *   ・使用回数: 1回だけ。ただしカルメンに囁かれたら2回使える形にした（マイクラ版のカルメン対象リスト・
 *     追加使用リストにカウンセラーは入っていないが、Web版の昼能力の共通仕様（使用をログ配列で数え、
 *     ONW.carmen.dayUses で上限を決める。鼠・羊・霊媒で採用済み）に合わせた。解釈点として docs に明記）。
 * 演出（作者メモ）: 狂人ではない場合は「失敗」でめくれる。成功の場合は「更生」と出る。
 *   更生された側は自身のカードが「更生」と出る。
 *   ・カウンセラー本人の画面でだけ、対象のカードが「更生」（成功）/「失敗」（狂人でなかった場合）の面で
 *     めくれて数秒後に裏に戻る（stage.js の COUNSEL_MARK / COUNSEL_FAIL_MARK。stageFlash "counselFlash"）。
 *     ロックで静かに失敗したときはどちらの面も出ない（マイクラ版どおり通知なし）。
 *   ・更生された本人には「貴方は更生しました。」が届き、自分のカードが「更生」の面でめくれる（本人の画面だけ）。
 *     役職確認（📕）にも村人が載る。
 * 変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（村人陣営）。
 *   闇の化身・銀色の影の対象外。コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に既存で含まれていて、
 *   移植と同時に有効化）。シャッフラーの山札に入る（除外リストに無い）。模倣の人狼は模倣できる
 *   （NON_MIMICABLE_ROLES に無い）。ペルソナの仮面候補に入る（除外リストに無い。被っても能力は使えないのが原則）。
 * 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている（封印対象は 104 → 105 役）。
 * シナジー: 鈴の巫女の対象（roles.js の鈴シナジーの anyOf に既存で含まれていて自動で有効化）。
 *   闇鍋シナジー（マイクラ版 ensureCounselorDarkAvatarSynergy）: マイクラ版は闇の化身の変化枠2つを
 *   「狂人+人狼」または「狂人+狂人」に確定させるが、Web版のシナジーに変化枠の予約の仕組みが無いため、
 *   SYNERGY_COUNT_RULES の個数ルール（カウンセラーが出る闇鍋には狂人系役職を最低1枚）で置き換えた
 *   （霊媒師・見張り番・ハンターの確率/パック置き換えと同じ考え方）。
 *   カルメンの対象ではない（マイクラ版 CARMEN_TARGET_ROLES に無い）。黄泉・鍵師の対象外（各リストに無い）。
 * ハッキング: 銀狼にハッキングされてカウンセラーだと思い込んだ人は、偽の昼能力（対象は生きている自分以外の1人。
 *   効果なし。文はマイクラ版の既定の偽文「○○を選びました。」）。silver_wolf.js の DAY に counselor を追加し、
 *   net.js の偽UIの kind 一覧に "counsel" を足した。本物のカウンセラーがハッキングされている場合は、
 *   思い込んでいる役職の能力を使う（共通フロー）。更生の判定は最終役職そのものなので、思い込みで誰かが
 *   更生することはない。
 * CPU: マイクラ版でも CPU はカウンセラーの昼能力を自分からは使わない（Web版も羊・霊媒と同じ。
 *   デバッグの昼能力でのみ使わせる）。真CO（cpuClaim）は名乗り＋結果があれば開示。騙り（cpuLie）は
 *   マイクラ版でカウンセラーが騙り候補から外されていないため用意する。
 * デバッグ: デバッグの昼能力（kind: "counsel"）で対象を指定して使える。
 * 状態: g.counselorTarget = { 本人: 対象 }（マイクラ版 game.counselorTarget と同じ本人キー）
 *       g.counselorLog = [{ by, target, ok, locked?, before? }]（使った回数=カルメン判定用）
 *       g.counselorConverted = { 更生された人: カウンセラー } / g.counselorForced = [強制カウンセリングした本人]
 *       g.counselorMisplaced = [ズレた好意をした本人]（どちらもマイクラ版の実績判定用リスト）
 */
(function (ONW) {
  const ID = "counselor";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
  const rn = (r) => ONW.roles.getInfo(r).name;
  const nameOf = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";

  const targetOf = (g, id) => (g && g.counselorTarget && g.counselorTarget[id]) || null;
  const used = (g, id) => (g.counselorLog || []).filter((e) => e.by === id).length >= (ONW.carmen ? ONW.carmen.dayUses(g, id) : 1);
  /** 更生できるか: 対象の「最終役職」が狂人系か（マイクラ版 isMadRole(finalRoles[target])。思い込み・模倣は見ない） */
  const isMadFinal = (g, target) => (ONW.MAD_KIND || []).includes((g.currentRoles || {})[target]);
  /** 昼能力を使えるか（羊の狂人・霊媒師と同じ条件。封印されていると開けない） */
  function canUse(g, id) {
    return !!(g && g.phase === ONW.PHASE.ONLINE_DAY && !g.dayStartId && !g.dictator && !g.allDeadSkip && !isDead(g, id) && act(g, id) === ID && !used(g, id) && !ONW.seal.dayBlocked(g, id) && !ONW.hiddenDrunk(g, id));
  }
  /** 選べる相手: 生きている自分以外の参加者（マイクラ版 participantOptionsForDay(myId, false)） */
  function targets(g, id) {
    if (!canUse(g, id)) return [];
    return ((g && g.players) || []).filter((p) => p.id !== id && !isDead(g, p.id)).map((p) => p.id);
  }
  /**
   * 更生の書き換え: 対象の最終役職を村人にする（少佐の救済 major.overwrite と同じ後始末）。
   * 戻り値: 更生前の最終役職。
   */
  function convert(g, target) {
    const before = (g.currentRoles || {})[target];
    (g.roleTrail = g.roleTrail || {})[target] = [...((g.roleTrail || {})[target] || []), "villager"];
    if (g.cards && g.cards.trail) (g.cards.trail[target] = g.cards.trail[target] || []).push(g.cards.at[target]);   // カードの流れも roleTrail と同じ並びで積む（結果画面の「(+シャッフラー)」の印は最新の段階に付く）
    g.currentRoles[target] = "villager";
    // 役職に紐づく記録は消す（少佐の overwrite と同じ一覧。口封じの対象の記録もここで消える）
    ["seerTarget", "senseSeerTarget", "mindWolfTarget", "fingerReaderTargets", "visitorTargets", "majorTargets", "mimicRole", "cloneThoughtRole", "watchdogOwners", "dogMadmanOwners", "boarMadmanTarget", "mercenaryTarget", "chesedTarget", "chesedRecipient", "keyTargets", "breakerTargets", "muzzleTargets", "carmenTarget", "carmenVillage", "carmenOutsider", "exposeTargets", "exposeBy", "sealTargets", "sealIntent", "elfrindeTarget", "keyLocks", "servantMasters", "execTargets", "avengerTargets", "loveTargets", "pureLoverTargets", "freeterTargets", "akujoHonmei", "akujoKeep", "emObserved", "formerQueens", "crownShield", "crownPending", "coffeeMute", "threadPair", "threadPairNo", "matthiasDaughters", "nanokaMode", "nanokaLongNightTarget", "nanokaLoveTarget", "bartenderTarget", "cocktailDrunk", "ratHideTarget", "sheepTarget", "boarMadmanAuto", "agitatorTarget", "lookoutTarget", "lookoutBy", "dragonTok", "agentCommand", "agentProtectTarget", "personaMaskRole", "personaFakeMask", "hackRole", "hackTarget", "hackSource", "hackView", "hackCos", "hackSub"].forEach((k) => { if (g[k]) delete g[k][target]; });
    if (g.promotedWolfIds) g.promotedWolfIds = g.promotedWolfIds.filter((x) => x !== target);   // 昇格した狂人の更生: 昇格は解ける（マイクラ版 clearWolfBadgesForMajorConversion + updatePromotedWolfId）
    if (ONW.major && ONW.major.clearOverlaps) ONW.major.clearOverlaps(g, target);   // 恋人・シャッフラー・反転の状態解除（マイクラ版 clearMajorRescueOverlapRoles と同じ）
    if (ONW.fixServants) ONW.fixServants(g);
    if (ONW.fixExecutioners) ONW.fixExecutioners(g);
    if (ONW.pureLover && ONW.pureLover.note) ONW.pureLover.note(g);
    return before;
  }
  /**
   * 更生を試みる。戻り値: { by, target, ok, locked?, before?, muzzleReleased? }（使えなければ null）。
   *   ok=true: 狂人系だったので村人に更生した / ok=false: 狂人系ではなかった（失敗）
   *   locked=true: 対象が鍵師にロックされていて静かに失敗した（対象の記録だけ残る。通知は一切出ない）
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    (g.counselorTarget = g.counselorTarget || {})[id] = target;   // マイクラ版: ロックで失敗するときも対象は記録される
    if (ONW.keymaster && ONW.keymaster.locked(g, target)) {
      const e = { by: id, target, ok: false, locked: true };
      (g.counselorLog = g.counselorLog || []).push(e);
      return e;
    }
    if (!isMadFinal(g, target)) {
      const e = { by: id, target, ok: false };
      (g.counselorLog = g.counselorLog || []).push(e);
      (g.counselorMisplaced = g.counselorMisplaced || []);
      if (!g.counselorMisplaced.includes(id)) g.counselorMisplaced.push(id);   // 実績「ズレた好意」
      return e;
    }
    const muzzleReleased = (g.currentRoles || {})[target] === "muzzle_madman" ? ((g.muzzleTargets || {})[target] || null) : null;   // 口封じの狂人の更生: その口封じは解除される（解除通知は hostCounselor が送る）
    const before = convert(g, target);
    const e = { by: id, target, ok: true, before, muzzleReleased };
    (g.counselorLog = g.counselorLog || []).push(e);
    (g.counselorForced = g.counselorForced || []);
    if (!g.counselorForced.includes(id)) g.counselorForced.push(id);   // 実績「強制カウンセリング」
    (g.counselorConverted = g.counselorConverted || {})[target] = id;
    return e;
  }
  // 本人への文（マイクラ版の昼フローの通知どおり: 試み → 成功/失敗。ロックのときは試みの文だけ）
  const attemptText = (name) => `あなたは ${name} を更生させようとしました。`;
  const resultText = (name, ok) => ok ? `${name} の更生に成功しました。` : `${name} の更生に失敗しました。`;
  const toldText = () => "貴方は更生しました。";   // 更生された本人への通知（マイクラ版「更生通知」）
  const coText = resultText;
  const coShort = (name, ok) => `${name} → ${ok ? "更生成功" : "更生失敗"}`;

  /** 結果発表の「役職情報」の行（マイクラ版 vote.js にカウンセラーの情報行は無い。第6バッチ共通指示でWeb版独自に出す） */
  function lines(g, nm) {
    return (g.counselorLog || []).map((e) => e.locked
      ? `カウンセラー ${nm(e.by)} は ${nm(e.target)} を更生させようとしました。`
      : e.ok
        ? `カウンセラー ${nm(e.by)} は ${nm(e.target)} を更生させました。`
        : `カウンセラー ${nm(e.by)} は ${nm(e.target)} の更生に失敗しました。`);
  }
  // ---- CPUの発言 ----
  /** カウンセラーの騙り: 生きている誰かを更生させた（成功/失敗は適当）と言う（マイクラ版のCOフォームと同じ形） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const pool = (others || []).filter((q) => !(g.deadIds || []).includes(q.id));
    if (!pool.length) return null;
    const t = k.pick(pool);
    const ok = Math.random() < 0.5;
    return { co, result: { short: coShort(t.name, ok), text: coText(t.name, ok), claim: { kind: ID, target: t.id, ok } } };
  }
  /** 本物のカウンセラーの発言: 名乗りは必ずする。結果（デバッグ等で使った分）があれば開示する（ロックで失敗した分はマイクラ版どおり何も言わない） */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = ID;
    const e = (g.counselorLog || []).filter((x) => x.by === p.id && !x.locked).pop();
    if (e) { const nm = k.nameOf(g, e.target); c.result = { short: coShort(nm, e.ok), text: coText(nm, e.ok), claim: { kind: ID, target: e.target, ok: e.ok } }; }
  }
  /** 更生させたあとのCPUの発言（net.js hostCounselor が、使ったのがCPUで生きているときに呼ぶ。デバッグで使わせたときだけ） */
  function cpuSpeak(k, g, p, e) {
    if (!e || e.locked) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: coText(nm, e.ok), short: coShort(nm, e.ok), result: true, claim: { kind: ID, target: e.target, ok: e.ok }, gap: 3500 }];
  }

  /** 実績（マイクラ版 stats.js / wiki の実績定義と同じ条件） */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_counselor");
    if (fin === ID && won) out.push("counselor_win");
    if (fin === ID && !won) out.push("counselor_loss");
    if ((g.counselorForced || []).includes(id)) out.push("counselor_forced_counseling");   // マイクラ版: 本人のリストに入っていれば役職条件なし
    if ((g.counselorMisplaced || []).includes(id)) out.push("counselor_misplaced_kindness");
    return out;
  }

  ONW.defineRole(ID, {
    info: {
      sealTarget: true,   // マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている
      deck: 169, name: "カウンセラー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24.4,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている自分以外のプレイヤー1人を選ぶと、その人の最終役職が狂人系なら村人に更生させます（昇格した狂人も更生でき、昇格は解けます）。狂人系でない人に使った場合は失敗します。対象が鍵師にロックされていると、成功も失敗も分からないまま終わります。使えるのは酔いが覚めたあとの昼に1回だけで、最終的にカウンセラーを持っている人が使えます。",
    },
    groups: { "transform:light_apostle": 68 },   // 光の使徒の変化先（村人系）のみ。並びはマイクラ版 TRANSFORM_ROLE_GROUPS の順（ネクロマンサーの次）
    achievements,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 更生させようとした相手を選ぶ → 成功した/失敗したを選ぶ（マイクラ版 main.js のカウンセラーCOと同じ）
    coResult: { kind: ID, noChain: true, coText, coShort },
    cpuLie: { role: ID, weight: 4, order: 68, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示（マイクラ版はカウンセラーを騙り候補から外していない）
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    cpuSpeak,   // デバッグで使わせたCPUが、その場で結果を言う
    // 昼の更生演出（作者メモ）: カウンセラー本人の画面で、対象のカードが「更生」（成功）/「失敗」（狂人でなかった）の面で
    // めくれて裏に戻る。更生された本人の画面では、自分のカードが「更生」の面でめくれる（counseltold が同じ印を立てる）。
    // ロックで静かに失敗したときは印自体が届かない（どちらの面も出ない）。
    stageFlash: {
      field: "counselFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = x.ok ? "__counsel" : "__counselfail"; SK.glow[k] = true;
          SK.paint(SK.G());
        }, 150 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 150 + list.length * 380 + 2600);
      },
    },
  });
  ONW.counselor = { canUse, targets, targetOf, used, isMadFinal, apply, convert, attemptText, resultText, toldText, coText, coShort, lines, achievements };
})(window.ONW = window.ONW || {});
