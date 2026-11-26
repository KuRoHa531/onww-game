/**
 * スクリューガム（村人陣営）: 受動役職（夜の行動はない。夜は情報のみ）。
 * マイクラ版 SCREW_GUM の移植。仕様はマイクラ版で確認した:
 *   ・試合開始時、初期役職の時点でプレイヤーに銀狼がいるかどうかを知ることができる（誰が銀狼かは分からない）。
 *     判定は参加者の初期役職だけ（マイクラ版 roles.js の銀狼情報: Object.values(game.initialRoles) に SILVER_WOLF が
 *     含まれるか。模倣の人狼が銀狼を模倣していても数えない。墓地の銀狼も数えない）。
 *   ・プレイヤーにスクリューガムがいる場合、銀狼のハッキング先が村人陣営だったとき、ハッキングに失敗する
 *     （再抽選はしない。銀狼はその試合ハッキングできない。マイクラ版 assignSilverWolfHackFromSource）。
 *     - 「プレイヤーにスクリューガムがいる」= 参加者の 模倣込みの実効役職・最終役職・初期役職 のどれかが
 *       スクリューガム（マイクラ版 screwGumPresentInGame。墓地は対象外）。
 *     - ハッキング先の判定役職は 最終役職 ?? 初期役職（マイクラ版 targetActualRole）。
 *       村人陣営かどうかは役職の静的な陣営（マイクラ版 isVillageRole: baseTeamOf === 村人陣営。ホタルも村人扱いだが
 *       ホタルはハッキング対象外なので実質関係しない）。
 *     - ただし、役職配布時点で恋人陣営になっている村人役職へのハッキングは失敗しない
 *       （マイクラ版 targetWasInitialLover = 配布直後の恋人判定。Web版では g.loverOf が配布時点で付き、
 *       ハッキング割り当て（net.js startGame）より前に決まるので、そのまま使える）。
 *   ・ハッキングによってスクリューガムと思い込むことはない（マイクラ版 silverWolfFakeRolePool の除外。
 *     Web版では silver_wolf.js の NO_FAKE に追加）。
 *   ・銀狼側の通知: ハッキングに失敗した銀狼の夜情報は「{対象}へのハッキングに失敗しました。」
 *     （マイクラ版 roles.js の銀狼情報。成功時は従来どおり「{対象}をハッキングしていました。」系）。
 *     結果発表のハッキング情報には失敗は載らない（マイクラ版 vote.js のハッキング情報は成功分だけ）。
 *
 * 演出（作者メモ）:
 *   ・待機時間に、スクリューガム目線でだけ銀狼通知（パン屋みたいなバナー）が出る
 *     → settleMsg が out.screwSilver（0/1）を返し、本人の画面でだけ ui.showScrewSilver が
 *     🐺バナー「銀狼の気配があります / 銀狼の気配はありません」を出す（stageSettle order 31）。
 *     文は情報確認にも残る。酔っ払い中は待機時間に出さず、酔い覚め（soberReveal → screwnews）で届ける。
 *   ・銀狼目線: ハッキングが失敗するとき、ウイルスを読み込んだあとにビックリマークが出てきて失敗する感じ
 *     → silver_wolf.js の stageNight / stageSober が fail のとき stage.js の SK.hackUsbFail を使う
 *     （USBが刺さりインストールが進むが途中で止まり、ERROR表示＋大きな赤い「！」が弾けて出てカードが揺れる）。
 *
 * 変化候補（マイクラ版で確認）: 光の使徒の変化先にのみ入る。闇の化身・銀色の影の対象外。
 *   模倣不可（マイクラ版 NON_MIMICABLE_ROLES。Web版 mimic_wolf.js の NON_MIMICABLE に最初から入っている）。
 *   コスプレ不可（マイクラ版 cosplayerEligibleRoles に無い。Web版 cosplayer.js の ELIGIBLE にも無い）。
 *   シャッフラーの山札に入らない（マイクラ版 shufflerEligibleRoles の除外。shuffler.js の BLOCKED に追加）。
 *   ペルソナの仮面候補からは外れていない。
 * 封印対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に無い）。カルメン・黄泉・鍵師・ペルソナ情報役職の対象外。
 * 闇鍋シナジー: スクリューガムが出る闇鍋には銀狼も最低1枚出す（マイクラ版 YAMINABE_TRANSFORM_SYNERGY_RULES。
 *   roles.js の SYNERGY_RULES に追加）。マイクラ版には「銀狼がいてスクリューガムがいないとき50%で足す」確率ルールも
 *   あるが、Web版のシナジーに確率の仕組みが無いため入れていない（干支シナジー等と同じ扱い）。
 * 結果情報（情報確認）: 最終役職がスクリューガムの人について「銀狼の気配を感じていたか」を出す
 *   （マイクラ版に専用の結果行は無いが、第6バッチ共通指示で追加）。
 * 結果開示（CO）: 「銀狼がいます。」/「銀狼がいません。」の2択（マイクラ版のスクリューガムCOフォーム。co.js の kind "screw"）。
 * CPU: 真COは実際の初期役職から「銀狼がいます/いません」を開示（マイクラ版 cpu.js）。
 *   騙りは、配役に銀狼がいることが分かっている場合は「います」、そうでなければ20%で「います」（マイクラ版 cpu.js）。
 * 状態: g.hackScrewFail = { 銀狼のID: 失敗した対象のID }（silver_wolf.js 側で持つ。net.startGame の初期化と
 *   ホスト引き継ぎキーに追加済み）。
 */
(function (ONW) {
  const ID = "screw_gum";
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";

  /** 銀狼の気配があるか（参加者の初期役職に銀狼がいるか。マイクラ版 roles.js の判定どおり） */
  const silverPresent = (g) => (g.players || []).some((p) => (g.initialRoles || {})[p.id] === "silver_wolf");
  /** 気配の文（夜情報・待機時間・酔い覚めで共通） */
  const silverText = (g) => (silverPresent(g) ? "銀狼の気配があります。" : "銀狼の気配はありません。");

  /** プレイヤーにスクリューガムがいるか（マイクラ版 screwGumPresentInGame: 参加者の実効役職・最終役職・初期役職のどれか） */
  function present(g) {
    return (g.players || []).some((p) => {
      if ((g.initialRoles || {})[p.id] === ID || (g.currentRoles || {})[p.id] === ID) return true;
      return !!(ONW.mimic && ONW.mimic.actRole && ONW.mimic.actRole(g, p.id, (g.currentRoles || {})[p.id]) === ID);
    });
  }

  /** その人へのハッキングがスクリューガムで失敗するか（マイクラ版 assignSilverWolfHackFromSource の失敗条件）。
   *  対象の役職は 最終役職 ?? 初期役職。村人陣営（静的な陣営。ホタル含む）で、配布時点で恋人になっていないこと */
  function blocksHack(g, targetId) {
    const role = (g.currentRoles || {})[targetId] ?? (g.initialRoles || {})[targetId];
    if (!role) return false;
    const village = role === "hotaru" || (((ONW.ROLE_INFO || {})[role] || {}).team === ONW.TEAM.VILLAGE);
    if (!village) return false;
    if ((g.loverOf || {})[targetId]) return false;   // 配布時点で恋人陣営になっている村人役職は失敗しない
    return true;
  }

  /** 結果情報（情報確認）: 最終役職がスクリューガムの人だけ（第6バッチ共通指示で追加したWeb版の行） */
  function lines(g, nm2) {
    const has = silverPresent(g);
    return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID)
      .map((p) => `スクリューガム ${nm2(p.id)} は銀狼の気配を${has ? "感じていました" : "感じませんでした"}。`);
  }

  /** 実績（マイクラ版 wiki データ）: first_screw_gum「天才クラブ#76」/ win_screw_gum「スクリューガムで初勝利」 */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_screw_gum");
    if (fin === ID && won) out.push("win_screw_gum");
    return out;
  }

  /** CPUの真CO: 実際の初期役職から銀狼の有無を開示する（マイクラ版 cpu.js） */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = ID;
    const has = silverPresent(g);
    c.result = { short: has ? "銀狼がいる" : "銀狼がいない", text: has ? "銀狼がいます。" : "銀狼がいません。", claim: { kind: "screw", has } };
  }
  /** CPUの騙り: 配役に銀狼がいることが分かっている場合は「います」、そうでなければ20%で「います」（マイクラ版 cpu.js） */
  function lieClaim(k, g, p, r, i, c) {
    const known = Number((g.roleCounts || {})["silver_wolf"] || 0) > 0;
    const has = known || Math.random() < 0.2;
    return { co: ID, result: { short: has ? "銀狼がいる" : "銀狼がいない", text: has ? "銀狼がいます。" : "銀狼がいません。", claim: { kind: "screw", has } } };
  }

  ONW.defineRole(ID, {
    info: { deck: 165, name: "スクリューガム", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24.1,
      desc: "村人陣営。試合開始時、初期役職の時点でプレイヤーに銀狼がいるかどうかを知ることができます。プレイヤーにスクリューガムがいる場合、銀狼のハッキング先が村人陣営だったとき、ハッキングに失敗します。ただし、役職配布時点で恋人陣営になっている村人役職へのハッキングは失敗しません。また、ハッキングによってスクリューガムと思い込むこともありません。" },
    groups: { "transform:light_apostle": 65 },   // 光の使徒の変化先（村人系）のみ
    achievements,
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>初期役職の時点で銀狼がいるかどうかが、夜の情報と待機時間の通知で分かります。</p>`;
      },
    },
    /** 夜の情報: 銀狼の気配（マイクラ版 roles.js のスクリューガム情報。情報確認にも残る） */
    nightMsg(c, p) { return { text: silverText(c.g) }; },
    /** 墓荒らし・ドッペルゲンガー・コスプレイヤー経由で手にしたとき: 気配の情報をその場で知る */
    got(c, p) { c.hold(p.id, silverText(c.g)); },
    /** 酔い覚めの情報: 酔っ払いだったスクリューガムも、覚めた時点で気配を知る（バナーは soberReveal が出す） */
    soberLines(c, id) { return [silverText(c.g)]; },
    /**
     * 待機時間の通知（作者メモ）: 現在の持ち主へ気配を知らせ、本人の画面でだけ銀狼通知バナーを出す。
     * 酔っ払い中は出さない（酔い覚めの soberReveal で届ける）。ハッキングされている本物のスクリューガムには出さない
     * （思い込み先にスクリューガムは無いので、起きるのは配布時恋人の端ケースだけ）。
     */
    settleMsg(c, p, mode) {
      const g = c.g, out = { logs: [] };
      if (mode !== "settle" || !p || p.isCpu) return out;
      if ((g.currentRoles || {})[p.id] !== ID) return out;
      if (ONW.hack && ONW.hack.isFakeUi(g, p.id)) return out;
      if (ONW.hiddenDrunk && ONW.hiddenDrunk(g, p.id)) return out;
      const has = silverPresent(g);
      out.logs.push(silverText(g));
      out.screwSilver = has ? 1 : 0;
      return out;
    },
    /** 待機時間の演出（作者メモ）: スクリューガム本人の画面でだけ、銀狼の気配バナーが出る */
    stageSettle: {
      field: "settleScrewSilver", shown: "settleScrewShown", order: 31,
      run(ids, SK) { if (ids && ids.length && ONW.ui && ONW.ui.showScrewSilver) ONW.ui.showScrewSilver(ids[0] === 1); },
    },
    /** 酔いが覚めた瞬間: 待機時間に出せなかった気配通知をバナーで届ける（文は soberLines が情報確認に残す） */
    soberReveal: { order: 31, run(c, ids) {
      const g = c.g;
      ids.forEach((id) => {
        if ((g.currentRoles || {})[id] !== ID) return;
        if (ONW.hack && ONW.hack.isFakeUi(g, id)) return;
        const p = (g.players || []).find((q) => q.id === id);
        if (!p || p.isCpu) return;
        c.send(id, { t: "screwnews", has: silverPresent(g) ? 1 : 0, text: silverText(g) });
      });
    } },
    // 結果開示(COボタン)の流れ: 銀狼がいます / 銀狼がいません の2択（マイクラ版のスクリューガムCOフォーム。co.js の kind "screw"）
    coResult: { kind: "screw" },
    cpuClaim,
    cpuLie: { role: ID, weight: 20, order: 65, claim: lieClaim },
  });

  ONW.screwGum = { present, blocksHack, silverPresent, silverText, lines, achievements };
})(window.ONW = window.ONW || {});
