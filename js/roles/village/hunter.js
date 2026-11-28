/**
 * ハンター（村人陣営）: 受動役職（夜の行動はない）。
 * マイクラ版 HUNTER の移植。仕様はマイクラ版で確認した:
 *   ・追放・道連れ以外の死因で死亡したとき、生存者から1人を選んで道連れにする（マイクラ版 resolveHunterCompanions）。
 *     発動する死因（マイクラ版 HUNTER_TRIGGER_DEATH_REASONS）:
 *       執行（保安官・ヴァニティの昼の射撃）/ 噛殺（番犬・犬の狂人）/ 恨殺（道化の怨霊。Web版は未移植で死因 "grudge" を予約）/
 *       爆殺（道化の爆弾魔）/ とばっちり（タフガイの身代わりで追放された）/ 無理心中（一目惚れしてるてるの対象）/
 *       王国滅亡（女王）/ 後追い（心中・キューピッド・背徳者・糸紡ぎ・鼠の狂人などの後追い系すべて）。
 *     発動しない死因: 追放 / 道連れ（chain）/ 身代わり・犠牲（従者・マティアス）/ メンタル崩壊 / ショック死 /
 *       押し切り（牛の狂人）/ 拒絶（奇数人・偶数人）/ 独裁処刑 / 呪殺 / 毒殺。
 *   ・判定は模倣込みの実効役職（マイクラ版 roleForMimicEffect）: 模倣の人狼がハンターを模倣していれば発動する。
 *     封印されたハンターは発動しない（マイクラ版 isSealedPlayerId）。
 *   ・道連れ先の候補は「その時点でまだ死んでいない全員（自分以外）」。候補が全員タフガイなら発動しない（選択もしない）。
 *     道連れ先がタフガイなら弾かれ、騎士に守られても死なない（どちらも選択自体は記録され、二度は選ばない）。
 *     マイクラ版は従者の身代わりを適用しない（applyServantSubstitution は追放の初期集合だけ）ので、
 *     Web版も kill() の従者の身代わり分岐だけをこの道連れでは迂回する（虎の狂人と同じ考え方。タフガイ・騎士は通常どおり）。
 *   ・昼中に適格な死因で死んだハンターも発動する。マイクラ版は昼の射撃の直後に即時解決するが、
 *     Web版には昼フェイズに死者が選ぶ仕組みが無い（わら人形も昼死では発動しない）ため、
 *     投票解決（resolveChain の最後・王国滅亡のあと・スティーブ復活の前）にまとめて選ぶ形にした（解釈点）。
 *     そのため昼死したハンターの道連れ先は投票できる（マイクラ版では投票できない）。
 *
 * 演出（作者メモ「わら人形とほぼ同じ」）:
 *   ・選択はわら人形・アサシン・賞金稼ぎと共通の選択フロー（strawPending / strawask、kind: "hunter"）で、
 *     本人の画面に「ハンター」のパネルが出て、テーブルのカードを押して道連れ先を選ぶ。
 *     結果発表では通常の道連れ（kind "tomo"）としてめくれる。専用の追加演出は無い。
 *
 * 変化候補（マイクラ版で確認）: 光の使徒の変化先にのみ入る（TRANSFORM_ROLE_GROUPS[LIGHT_APOSTLE] の66番目）。
 *   闇の化身・銀色の影の対象外。模倣可（NON_MIMICABLE_ROLES に無い）。コスプレ不可（cosplayerEligibleRoles に無い）。
 *   シャッフラーの山札に入る（shufflerEligibleRoles の除外に無い）。ペルソナの仮面候補からは外れていない。
 * 封印対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に無い）。カルメン・黄泉・鍵師・ペルソナ情報役職の対象外。
 * 闇鍋シナジー: ハンターが出る闇鍋には「ハンターを殺せる役職」を最低1枚出す
 *   （マイクラ版 YAMINABE_HUNTER_KILL_SOURCE_WEIGHTS: 番犬14・タフガイ14・犬の狂人16・道化の爆弾魔12・道化の怨霊12・
 *   一目惚れしてるてる10・糸紡ぎ10・純愛者10・ヴァニティ8・模倣の人狼8・女王4。保安官は撃つと村人側が失敗するので数えない。
 *   マイクラ版は重み付きで1枚保証＋50%でもう1枚だが、Web版の個数ルールに確率の仕組みが無いため最低1枚で置き換えた）。
 *   犬の狂人移植時に未接続だったシナジーはこれ（重み16 = 犬の狂人）。
 * 結果情報（情報確認）: 道連れに成功したハンターについて「ハンター {名前} は {対象} を道連れにしました。」を出す
 *   （マイクラ版の連鎖ログ・全員への「ハンター通知」と同じ文。第6バッチ共通指示）。
 * 状態: g.hunterTargets = { ハンターのID: 選んだ道連れ先 }（試合ごとの結果。わら人形の strawTargets と同じ扱い）、
 *   g.hunterChain = { ハンターのID: 道連れ先 }（道連れが成立した分だけ。resolveChain が毎回作り直す。実績・結果情報用）。
 */
(function (ONW) {
  const ID = "hunter";

  /** 昼中に死んだハンターが発動する死因（game.deadKind。マイクラ版の preVoteDeathReasons に対応） */
  const DAY_KINDS = ["shot", "lovers", "follow", "cupid", "fanatic", "queen", "thread"];
  /** 投票の連鎖で死んだハンターが発動する死因（game.chainKind。マイクラ版 HUNTER_TRIGGER_DEATH_REASONS に対応。
   *  "grudge" は道化の怨霊（未移植）の恨殺の予約） */
  const CHAIN_KINDS = ["bite", "bomb", "love", "queen", "follow", "lovers", "thread", "grudge"];

  /**
   * そのハンターの死が道連れの発動条件を満たすか（マイクラ版 HUNTER_TRIGGER_DEATH_REASONS の判定）。
   * ctx: { gone: 昼中に死んでいるか, deadKind, chainKind, bounced: タフガイのとばっちりで追放されたか, substituted: 従者の身代わりで死んだか }
   */
  function qualifies(ctx) {
    if (!ctx) return false;
    if (ctx.substituted) return false;   // 従者の身代わり・犠牲で死んだ場合は発動しない（マイクラ版: servant / sacrifice は対象外）
    if (ctx.gone) return DAY_KINDS.includes(ctx.deadKind);
    if (ctx.chainKind) return CHAIN_KINDS.includes(ctx.chainKind);
    return !!ctx.bounced;   // 死因の記録が無い死（直接の追放・メンタル崩壊・ショック死・押し切り・独裁処刑）は、とばっちりだけが発動する
  }

  /** 結果情報（情報確認）: 道連れに成功したハンターの行（マイクラ版の連鎖ログと同じ文） */
  function lines(g, nm) {
    return Object.entries(g.hunterChain || {}).map(([id, t]) => `ハンター ${nm(id)} は ${nm(t)} を道連れにしました。`);
  }

  /** 実績（マイクラ版 wiki データ / stats.js）: first_hunter「はじめてなった」/ win_hunter「狙いを定めて」/
   *  hunter_chain_kill「死して狩る者」/ hunter_chain_village「死してなお村へ牙を剥く」/ hunter_chain_nonvillage「死してなお人外を狩る」。
   *  マイクラ版の chain_village / chain_nonvillage は道連れ先の「判定上の陣営」を見る。Web版は最終役職の静的な陣営で近似した */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_hunter");
    if (fin !== ID) return out;
    if (won) out.push("win_hunter");
    const t = (g.hunterChain || {})[id];
    if (t) {
      out.push("hunter_chain_kill");
      const tRole = (g.currentRoles || {})[t];
      const tTeam = ((ONW.ROLE_INFO || {})[tRole] || {}).team;
      if (tTeam === ONW.TEAM.VILLAGE) out.push("hunter_chain_village");
      else if (tTeam === ONW.TEAM.THIRD) out.push("hunter_chain_nonvillage");   // 人外 = 第三陣営のみ（人狼陣営の人を連れても付かない。マイクラ版 hasChainTargetTeam "nonwolf" かつ村人以外、の合算条件）
    }
    return out;
  }

  ONW.defineRole(ID, {
    info: { deck: 166, name: "ハンター", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24.2,
      desc: "村人陣営。夜の行動はありません。追放・道連れ以外の死因で死亡したとき、まだ死んでいないプレイヤーから1人を選んで道連れにします。発動する死因は、保安官やヴァニティの執行、番犬や犬の狂人の噛殺、道化の爆弾魔の爆殺、タフガイのとばっちり、無理心中、王国滅亡、心中や後追いなどです。追放、道連れ、従者やマティアスの身代わり、メンタル崩壊、ショック死、押し切り、独裁処刑、呪殺、毒殺では発動しません。道連れ先がタフガイのときは弾かれ、騎士に守られても死にません。" },
    groups: { "transform:light_apostle": 66 },   // 光の使徒の変化先（村人系）のみ。並びはマイクラ版 TRANSFORM_ROLE_GROUPS の順（スクリューガムの次）
    achievements,
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>追放・道連れ以外の死因で死亡したとき、道連れにする相手を選びます。</p>`;
      },
    },
    /** 夜の情報（マイクラ版 night.js のハンター情報。情報確認にも残る） */
    nightMsg(c, p) { return { text: "ハンターは夜行動がありません。追放・道連れ以外の死因で死亡したとき、道連れ先を選びます。" }; },
    cpuClaim(k, g, p, r, i, c) { c.co = ID; },   // ハンター: 結果開示は無いので、必ずハンターCOだけする（早とちりと同じ形）
    cpuLie: { role: ID, weight: 4, order: 66, claim: () => ({ co: ID, result: null }) },   // 騙りで名乗ることもある（COだけ）
  });

  ONW.hunter = { qualifies, lines, achievements, DAY_KINDS, CHAIN_KINDS };
})(window.ONW = window.ONW || {});
