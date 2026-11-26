/**
 * レン（ren）: 村人陣営。マイクラ版 scripts のレンを移植（第6バッチ・11役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / main.js の昼能力フロー / vote.js buildDayActionResultLines 準拠）:
 *   ・夜の能力は無い。昼能力を合計3回まで使え、生きている自分以外のプレイヤー1人を選ぶと、その人の
 *     「最終役職が初期役職から変化しているかどうか」が分かる（マイクラ版: finalRoles[target] !== initialRoles[target]）。
 *     同じ対象に複数回使うことも可能。
 *   ・対象の最終役職がモーゼスの場合は、変化の有無に加えて「モーゼスであること」も分かる
 *     （本人への文に「{対象}はモーゼスでした。」が付く。実績 ren_use_moses の条件）。
 *   ・カルメンに囁かれた村人陣営のレンは合計4回まで使える（マイクラ版: carmenVillageWhisperedTargets が
 *     あると上限 4。囁き文も「あなたは昼能力を合計4回まで使うことができます。」とレン専用のものがある。
 *     Web版では g.carmenVillage[id] の有無で判定する。カウンセラーと同じく共通仕様で寄せた）。
 *   ・判定は最終役職そのもの同士の比較なので、思い込み（クローン・ハッキング）や仮面（ペルソナ）では
 *     「変化した」ことにはならない。逆に更生（カウンセラー）・救済（少佐）・変化（光の使徒など）・
 *     入れ替え（怪盗・いたずらっ子など）で最終役職が初期と変わっていれば「変化している」。
 *   ・封印されていると使えない（マイクラ版の昼フローは対象選択後に封印で失敗し使用回数を消費するが、
 *     Web版の昼能力の共通仕様「封印中は開けず消費しない」に合わせた。羊の狂人・霊媒師・カウンセラーと同じ。
 *     解釈点として docs/ren.md に明記）。
 *   ・兎の狂人: 草むらに隠れた人を対象に選ぶと失敗して消費される（マイクラ版も chooseParticipant の
 *     共通ゲートで失敗する）。Web版は hostRen が ONW.rabbitMadman.dayGate を通す（羊・霊媒・カウンセラーと同じ）。
 *     ただしレンの場合は「隠れていた」ことが結果として分かる形にはならない（失敗して消費のみ。
 *     結果開示フォームにはマイクラ版どおり「隠れていた」の選択肢がある）。
 *   ・鍵師のロックは対象にできない等の干渉は無い（マイクラ版のレンのフローにロック判定は無い。
 *     レンは役職を変える能力ではないため）。
 *   ・トラップマスター（罠師）: 罠師の移植時に接続済み（hostRen が ONW.trapMaster.dayGate を { multi: true } で
 *     通す。罠を張られた人を調べようとすると、その1回分が失敗して使用回数を1回分消費し、投票権を失う）。
 *   ・多重人格: マイクラ版では昼能力を使うたびに triggerMultiPersonaFlip が発動するが、多重人格は
 *     Web版未移植のため未接続（移植時に接続する）。
 * 演出（作者メモ）: 変わった記録がある場合は ⭕ でめくれる、ない場合は ❌ でめくれる。
 *   最終役がモーゼスの場合は、⭕/❌ の下に「モーゼス」と書かれる。
 *   ・レン本人の画面でだけ、対象のカードが「⭕」（変化している）/「❌」（変化していない）の面で
 *     めくれて数秒後に裏に戻る（stage.js の REN_MARU_MARK / REN_BATSU_MARK。stageFlash "renFlash"）。
 *     モーゼスのときは印の下に小さく「モーゼス」と出る（"__renmaru@moses" / "__renbatsu@moses"）。
 *   ・結果は本人への文（「{対象}の役職は変化しています。」など）として情報確認にも残る。
 * 変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（69番目。村人陣営）。
 *   闇の化身・銀色の影の対象外。コスプレイヤーの変化先に入る（cosplayerEligibleRoles に入っている）。
 *   シャッフラーの山札に入る（shufflerEligibleRoles の除外に無い）。模倣の人狼は模倣できる
 *   （NON_MIMICABLE_ROLES に無い。模倣したレンも昼能力を使え、回数・記録は模倣者本人に付く）。
 *   ペルソナの仮面候補に入る（PERSONA_MASK_EXCLUDED_ROLES に無い。被っても能力は使えないのが原則）。
 * 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている（封印対象は 105 → 106 役）。
 * シナジー: 鈴の巫女の対象（roles.js の鈴シナジーの anyOf に既存で含まれていて自動で有効化）。
 *   見張り番の受動リスト（PASSIVE_ONLY）にも先行登録済み（夜に行動しないため、そのまま整合）。
 *   闇鍋シナジー（マイクラ版 ensureResolvedRenSynergy）: レンが出る闇鍋には、モーゼスを必ず1枚、
 *     かつ役職変更系（鍵師の対象リストから蜃気狼・銀狼・エルフリンデを除き、コピリストを加えた
 *     YAMINABE_REN_CHANGER_ROLES）をモーゼスとは別枠で 1枚（50%）または 2枚（50%）出す。
 *     Web版の個数ルールに確率・別枠の仕組みが無いため、SYNERGY_COUNT_RULES の個数ルール
 *     （モーゼス最低1枚 + 役職変更系最低1枚）で置き換えた（見張り番・ハンターと同じ考え方）。
 *     マイクラ版の逆方向（役職変更系/モーゼスが選ばれているとレンを足す ensureSelectedRenSynergy）は
 *     選択リスト方式の闇鍋専用で、Web版の盤面シナジーには対応が無いため未接続。
 *   カルメンのシナジー対象リスト（YAMINABE_CARMEN_TARGET_ROLES）には入っていない（囁きの効果自体は
 *     マイクラ版にレン専用文があるため、上限4回の判定だけ接続した）。
 *   黄泉・鍵師の対象外（各リストに無い）。
 * ハッキング: 銀狼にハッキングされてレンだと思い込んだ人は、偽の昼能力（対象は生きている自分以外の1人。
 *   効果なし。文はマイクラ版の既定の偽文「○○を選びました。」）。silver_wolf.js の DAY に ren を追加し、
 *   net.js の偽UIの kind 一覧に "ren" を足した。本物のレンがハッキングされている場合は、
 *   思い込んでいる役職の能力を使う（共通フロー）。
 * CPU: マイクラ版でも通常の CPU はレンの昼能力を自分からは使わない（デバッグの昼能力でのみ使う。
 *   Web版も羊・霊媒・カウンセラーと同じ）。真CO（cpuClaim）は名乗り＋使った記録があれば開示。
 *   騙り（cpuLie）はマイクラ版でレンが騙り候補から外されていないため用意する。
 * デバッグ: デバッグの昼能力（kind: "ren"）で対象を指定して使える。
 * 状態: g.renUseCount = { 本人: 使った回数 }（マイクラ版 game.renUseCount と同じ）
 *       g.renActionLog = { 本人: [{ target, changed, isMoses }] }（マイクラ版 game.renActionLog と同じ）
 *       g.renUsedOnMoses = { 本人: true }（マイクラ版 game.renUsedOnMoses と同じ。実績用）
 */
(function (ONW) {
  const ID = "ren";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
  const nameOf = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";

  /** 使える回数の上限: 通常3回。カルメンに囁かれた村人陣営のレンは4回（マイクラ版 carmenVillageWhisperedTargets 判定） */
  const capOf = (g, id) => (g && g.carmenVillage && g.carmenVillage[id]) ? 4 : 3;
  const useCountOf = (g, id) => Number((g && g.renUseCount && g.renUseCount[id]) || 0);
  const remainOf = (g, id) => Math.max(0, capOf(g, id) - useCountOf(g, id));
  /** 対象が初期役職から変化しているか（マイクラ版: finalRoles[target] !== initialRoles[target]） */
  const changedOf = (g, target) => (g.currentRoles || {})[target] !== (g.initialRoles || {})[target];
  /** 対象の最終役職がモーゼスか（マイクラ版: targetCurrentRole === ROLE.MOSES） */
  const isMosesOf = (g, target) => (g.currentRoles || {})[target] === "moses";
  /** 昼能力を使えるか（カウンセラーと同じ条件に、回数上限の判定を加えたもの） */
  function canUse(g, id) {
    return !!(g && g.phase === ONW.PHASE.ONLINE_DAY && !g.dayStartId && !g.dictator && !g.allDeadSkip && !isDead(g, id) && act(g, id) === ID && remainOf(g, id) > 0 && !ONW.seal.dayBlocked(g, id) && !ONW.hiddenDrunk(g, id));
  }
  /** 選べる相手: 生きている自分以外の参加者（マイクラ版 participantOptionsForDay(myId, false)。同じ対象を何度でも選べる） */
  function targets(g, id) {
    if (!canUse(g, id)) return [];
    return ((g && g.players) || []).filter((p) => p.id !== id && !isDead(g, p.id)).map((p) => p.id);
  }
  /**
   * 変化を調べる。戻り値: { target, changed, isMoses }（使えなければ null）。
   * 使用回数を消費し、記録（renActionLog）とモーゼス使用（renUsedOnMoses）を残す。
   */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const e = { target, changed: changedOf(g, target), isMoses: isMosesOf(g, target) };
    (g.renUseCount = g.renUseCount || {})[id] = useCountOf(g, id) + 1;
    (g.renActionLog = g.renActionLog || {})[id] = [...((g.renActionLog || {})[id] || []), e];
    if (e.isMoses) (g.renUsedOnMoses = g.renUsedOnMoses || {})[id] = true;
    return e;
  }
  // 本人への文（マイクラ版の昼フローの「レン通知」どおり: 変化の有無＋モーゼスのときはモーゼスの文）
  const resultText = (name, changed) => `${name}の役職は変化して${changed ? "います" : "いません"}。`;
  const mosesText = (name) => `${name}はモーゼスでした。`;
  // 結果開示(CO)の文（マイクラ版 main.js のレンCOフォームどおり: 過去形＋モーゼスの開示/否定）
  const coText = (name, changed) => `${name}の役職は変わって${changed ? "いました" : "いませんでした"}。`;
  const coMosesText = (name, isMoses) => `そして、${name}はモーゼス${isMoses ? "でした" : "ではありませんでした"}。`;
  const coShort = (name, changed, isMoses) => `${name} → ${changed ? "変化あり" : "変化なし"}${isMoses ? "・モーゼス" : ""}`;

  /** 結果発表の「役職情報」の行（マイクラ版 vote.js buildDayActionResultLines どおり。模倣の人狼が使った分は出さない＝マイクラ版 isMimicWolfId で skip） */
  function lines(g, nm) {
    const out = [];
    for (const [id, entries] of Object.entries(g.renActionLog || {})) {
      if ((g.currentRoles || {})[id] === "mimic_wolf") continue;   // マイクラ版: 模倣の人狼のレンの記録は結果情報に出ない
      for (const e of entries || []) {
        const changeText = e.changed ? "変わっていること" : "変わっていないこと";
        out.push(e.isMoses
          ? `レン ${nm(id)} は ${nm(e.target)} の役職が${changeText}、そしてモーゼスであることを知っていました。`
          : `レン ${nm(id)} は ${nm(e.target)} の役職が${changeText}を知っていました。`);
      }
    }
    return out;
  }
  // ---- CPUの発言 ----
  /** レンの騙り: 生きている誰かの変化を調べた（変化の有無は適当）と言う（マイクラ版のCOフォームと同じ形） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const pool = (others || []).filter((q) => !(g.deadIds || []).includes(q.id));
    if (!pool.length) return null;
    const t = k.pick(pool);
    const changed = Math.random() < 0.5;
    return { co, result: { short: coShort(t.name, changed, false), text: coText(t.name, changed), claim: { kind: ID, target: t.id, changed, moses: false } } };
  }
  /** 本物のレンの発言: 名乗りは必ずする。結果（デバッグ等で使った分）があれば、最後に調べた分を開示する */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = ID;
    const e = ((g.renActionLog || {})[p.id] || []).slice(-1)[0];
    if (e) { const nm = k.nameOf(g, e.target); c.result = { short: coShort(nm, e.changed, e.isMoses), text: coText(nm, e.changed) + (e.isMoses ? coMosesText(nm, true) : ""), claim: { kind: ID, target: e.target, changed: e.changed, moses: e.isMoses } }; }
  }
  /** 調べたあとのCPUの発言（net.js hostRen が、使ったのがCPUで生きているときに呼ぶ。デバッグで使わせたときだけ） */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: resultText(nm, e.changed) + (e.isMoses ? mosesText(nm) : ""), short: coShort(nm, e.changed, e.isMoses), result: true, claim: { kind: ID, target: e.target, changed: e.changed, moses: e.isMoses }, gap: 3500 }];
  }

  /** 実績（マイクラ版 stats.js / wiki の実績定義と同じ条件） */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_ren");
    if (fin === ID && won) out.push("win_ren");
    if (fin === ID && !won) out.push("lose_ren");
    if ((init === ID || fin === ID) && (g.renUsedOnMoses || {})[id]) out.push("ren_use_moses");   // マイクラ版: hasRoleForAchievement(初期/最終) かつ renUsedOnMoses
    return out;
  }

  ONW.defineRole(ID, {
    info: {
      sealTarget: true,   // マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている
      deck: 170, name: "レン", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24.5,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている自分以外のプレイヤー1人を選ぶと、その人の最終役職が初期役職から変化しているかどうかが分かります。合計3回まで使え（カルメンに囁かれると4回まで）、同じ相手に何度も使えます。調べた相手の最終役職がモーゼスの場合は、変化の有無に加えてモーゼスであることも分かります。",
    },
    groups: { "transform:light_apostle": 69 },   // 光の使徒の変化先（村人系）のみ。並びはマイクラ版 TRANSFORM_ROLE_GROUPS の順（カウンセラーの次）
    nightMsg(c, p) { return { text: "レンは夜行動がありません。昼に3回、相手の役職が変化しているかどうかを調べることができます。" }; },   // マイクラ版 night.js の夜情報どおり
    achievements,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 調べた相手を選ぶ → 変わっていた/いなかったを選ぶ → モーゼスだった/ではなかった/伏せるを選ぶ（マイクラ版 main.js のレンCOと同じ）
    coResult: { kind: ID, noChain: true, coText, coMosesText, coShort },
    cpuLie: { role: ID, weight: 4, order: 69, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示（マイクラ版はレンを騙り候補から外していない）
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    cpuSpeak,   // デバッグで使わせたCPUが、その場で結果を言う
    // 昼の変化調査の演出（作者メモ）: レン本人の画面で、対象のカードが「⭕」（変化している）/「❌」（変化していない）の面で
    // めくれて裏に戻る。対象の最終役職がモーゼスのときは、印の下に小さく「モーゼス」と出る。
    stageFlash: {
      field: "renFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = (x.changed ? "__renmaru" : "__renbatsu") + (x.moses ? "@moses" : ""); SK.glow[k] = true;
          SK.paint(SK.G());
        }, 150 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 150 + list.length * 380 + 2600);
      },
    },
  });
  ONW.ren = { canUse, targets, capOf, useCountOf, remainOf, changedOf, isMosesOf, apply, resultText, mosesText, coText, coMosesText, coShort, lines, achievements };
})(window.ONW = window.ONW || {});
