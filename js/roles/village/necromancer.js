/**
 * ネクロマンサー（村人陣営）＋ 死霊（第三陣営・内部専用役職）。
 * マイクラ版 NECROMANCER / WRAITH の移植。仕様はマイクラ版で確認した:
 *   ・受動役職（夜の行動はない）。ネクロマンサー本人が最終盤面で生存し、封印されておらず、
 *     実効役職（模倣込み）がネクロマンサーで、必要な陣営が勝利した場合に、
 *     「敗北している死亡者」の中からランダムに1人が「死霊」になって勝者に加わる
 *     （マイクラ版 vote.js の applyNecromancerWraith）。
 *     - 通常のネクロマンサー: 村人陣営の勝利で発動。
 *     - 模倣の人狼がネクロマンサーを模倣した場合（模倣ネクロマンサー）: 人狼陣営の勝利で発動。
 *   ・対象（候補）: 最終盤面で死亡していて、まだ勝者ではなく、鍵師にロックされておらず、
 *     最終役職が死霊でない人（マイクラ版の候補フィルタそのまま）。
 *   ・死霊化した人: 最終役職が死霊（第三陣営）になり、勝者に加わる。死因による勝利剥奪より優先する
 *     （Web版では勝敗判定の最後に適用するので、剥奪済みの人でも勝者に入る形で同じ結果になる）。
 *     付随状態（恋人・シャッフラー・反転・コピリスト）はマイクラ版 clearWraithOverwrittenStatuses どおり取り除く:
 *       - 恋人はグループから本人だけを外す（相方側の恋人状態は残す。黄泉のように縁ごと断つのではない）。
 *         Web版の純愛者の組は2人1組の配列なので、組ごと外す形で近似した（相方の loverOf は配布時の組なら残る）。
 *       - シャッフラーの印は、本人のカードに置かれた分と、本人が置いた分の両方を消す。
 *       - 反転は、本人についた分と、本人がつけた分の両方を消す。
 *       - コピリストは Web版未移植のため対象なし。
 *   ・コンボ死霊化（マイクラ版 applyNecromancerComboWraith）: ネクロマンサー本人が生存・勝利していて、
 *     恋人1（最初に成立した恋人の組）/ シャッフラー（置いた・置かれた）/ 反転1回以上 / コピリスト の
 *     いずれかの状態を併せ持つ場合、通常の死霊化とは別に、もう1人だけ死霊化する。
 *     各状態の勝敗がすべて確定した後でないと判定できないため、マイクラ版でも finalize の最後の方で判定する。
 *     Web版も勝敗判定の最後（determineWinners の末尾）で通常分と一緒に判定する。
 *     - Web版の「恋人1」は ONW.loverNo === 1 の組（配布時の最初の組。無ければ純愛者の最初の組）で近似した
 *       （マイクラ版の恋人グループの添字は 1 始まりで、最初に作られた組が 1 になる）。
 *   ・死霊の表示色（マイクラ版 utils.js の teamColorOfPlayerRole）: 通常のネクロマンサー由来は村人陣営色（緑）、
 *     模倣ネクロマンサー由来は人狼陣営色（赤）。g.necromancerWraithIsMimic に由来を記録し、
 *     結果発表の役職履歴（segs）と専用演出の面で使う。
 *   ・適用位置: Web版の vote.determineWinners の末尾（チキン逆転・愉快犯・道化の爆弾魔の後）。
 *     マイクラ版では通常分がペルソナ整合より前、コンボが恋人確定より前だが、Web版はペルソナ・恋人の
 *     勝敗処理がすべて determineWinnersCore の内側で終わっているため、末尾にまとめても結果は同じになる
 *     （死霊化した人は勝者として加わるだけで、既存の勝者の再判定は行わない）。
 *     逆に determineWinnersCore の内側に入れると、チキン逆転や乗っ取りの再判定で currentRoles が
 *     書き換わったまま再判定されてしまうため入れない。
 *
 * 演出（作者メモ）: 結果発表で全員がめくれたあと、負けた人のカードが吹っ飛ぶ前にネクロマンスする。
 *   ・stage.js の startResult が、勝負師の紙の直後・勝利の貼り重ね（playLadder）の直前に呼ぶ
 *     stageResult.necromancer フックで実装。死霊化した人のカードに幽霊の気配（gx-wraith）が漂い、
 *     字幕「ネクロマンサー／{名前} が死霊になりました」が出て、カードが一度裏返ってから
 *     死霊の面（由来の陣営色）でめくれる。吹っ飛ぶのは敗者だけなので、勝者になった死霊のカードは残る。
 *   ・汎用のめくりでは死霊化した人は「変化前の役職」でめくれる（net.js が h.role を差し替える。
 *     乞食・魔法使いの投票演出と同じネタバレ防止）。専用演出で初めて死霊の姿を見せる。
 *   ・スキップ時は stageResult.skip フックが最終形（死霊の面＋由来の色）を出す。
 *
 * 変化候補（マイクラ版で確認）: 光の使徒の変化先にのみ入る（TRANSFORM_ROLE_GROUPS[LIGHT_APOSTLE] の67番目）。
 *   闇の化身・銀色の影の対象外。模倣可（NON_MIMICABLE_ROLES に無い。模倣ネクロマンサーは人狼陣営勝利で発動）。
 *   コスプレ可（cosplayerEligibleRoles に入っている）。シャッフラーの山札に入る（除外に無い）。
 *   ペルソナの仮面候補からは外れていない。
 * 封印対象である（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。自動発動系の区分）。
 *   封印されたネクロマンサーは死霊化しない（マイクラ版 isSealedPlayerId）。
 * カルメン・黄泉・鍵師（対象側）・ペルソナ情報役職の対象外。乞食に取れる。ハッキングの対象にも思い込み先にもなる
 *   （思い込みでは発動しない: 判定は実効役職＝最終役職ベースで、思い込みは実効役職を変えない）。
 * 結果情報（情報確認）: 死霊化した人について「ネクロマンサーの能力により {名前} が死霊になりました。」を出す
 *   （マイクラ版の連鎖ログと同じ文。第6バッチ共通指示）。
 * 状態: g.necromancerWraithIds = [死霊化した人のID（通常分→コンボ分の順）]、
 *   g.necromancerWraithIsMimic = { ID: 模倣由来か }、g.necromancerWraithFrom = { ID: 変化前の最終役職 }、
 *   g.necromancerApplied = 適用済みフラグ（determineWinners の再入防止）。
 * 死霊（wraith）は内部専用役職: deck 168（娘ちゃん・サムと同じく連番を消費する）、直接配役はできない
 *   （settings の sanitize で必ず0枚にし、配役の展開でも除く）。
 */
(function (ONW) {
  const ID = "necromancer", WRAITH = "wraith";

  const nmOf = (g, id) => ((ONW.utils.playerById(g, id) || {}).name || "?");

  /** 死霊化した人から、陣営を変化させる付随状態を取り除く（マイクラ版 clearWraithOverwrittenStatuses） */
  function clearStatuses(g, id) {
    if (g.loverOf) delete g.loverOf[id];   // 恋人: 本人だけを外す（相方の loverOf は残す）
    if (Array.isArray(g.pureLoverPairs)) g.pureLoverPairs = g.pureLoverPairs.filter((pr) => pr[0] !== id && pr[1] !== id);   // 純愛者の組は2人1組の配列なので組ごと外す（近似）
    if (g.shufflerMarks) {   // シャッフラー: 本人のカードに置かれた印と、本人が置いた印の両方を消す
      const card = ONW.cardAt(g, id);
      delete g.shufflerMarks[card];
      Object.keys(g.shufflerMarks).forEach((c) => {
        const cur = g.shufflerMarks[c], arr = Array.isArray(cur) ? cur : [cur];
        const rest = arr.filter((e) => e && e.by !== card);
        if (rest.length === arr.length) return;
        if (!rest.length) delete g.shufflerMarks[c];
        else g.shufflerMarks[c] = Array.isArray(cur) ? rest : rest[0];
      });
    }
    if (g.reverserTarget) {   // 反転: 本人についた分と、本人がつけた分の両方を消す
      Object.keys(g.reverserTarget).forEach((h) => { if (g.reverserTarget[h] === id) delete g.reverserTarget[h]; });
      delete g.reverserTarget[id];
    }
    if (g.copylistTarget) delete g.copylistTarget[id];   // コピリストのコピーの記録も消える（マイクラ版 clearWraithOverwrittenStatuses）
  }

  /** 死霊化の候補（マイクラ版の候補フィルタ: 最終盤面で死亡・未勝利・ロックされていない・最終役職が死霊でない） */
  function candidates(g, winners) {
    const dead = ONW.vote.deadSet(g);
    return g.players.map((p) => p.id).filter((id) =>
      dead.has(id) && !winners.has(id) &&
      !(ONW.keymaster && ONW.keymaster.locked(g, id)) &&
      g.currentRoles[id] !== WRAITH);
  }

  /** 候補からランダムに1人を死霊化して勝者に加える。死霊化できたら true */
  function convert(g, winners, mimic) {
    const cands = candidates(g, winners);
    if (!cands.length) return false;
    const picked = ONW.utils.randomChoice(cands);
    (g.necromancerWraithFrom = g.necromancerWraithFrom || {})[picked] = g.currentRoles[picked];
    g.currentRoles[picked] = WRAITH;
    (g.roleTrail[picked] = g.roleTrail[picked] || []).push(WRAITH);   // 結果画面の役職の流れに死霊を積む（マイクラ版 pushResultRoleHistory）
    clearStatuses(g, picked);
    (g.necromancerWraithIsMimic = g.necromancerWraithIsMimic || {})[picked] = !!mimic;
    const ids = (g.necromancerWraithIds = g.necromancerWraithIds || []);
    if (!ids.includes(picked)) ids.push(picked);
    winners.add(picked);   // 死霊化は死因による勝利剥奪より優先する（適用が勝敗判定の最後なので、加えるだけでよい）
    return true;
  }

  /** コンボ条件の状態を持っているか（マイクラ版 applyNecromancerComboWraith の hasLover1 / hasShuffler / hasReversal1 / hasCopyist） */
  function hasComboState(g, id) {
    const lover1 = (ONW.loverPairs ? ONW.loverPairs(g) : []).some(([a, b, o]) => (a === id || b === id) && ONW.loverNo(g, a, b, o) === 1);   // 恋人1 = 最初に成立した恋人の組（マイクラ版のグループ添字1）
    if (lover1) return true;
    if (ONW.shuffler && ONW.shuffler.picks) {   // シャッフラー: 自分が置いた組・自分が置かれた組のどちらかに入っている
      const ps = ONW.shuffler.picks(g);
      if (ps.some(([sh, th]) => sh === id || th === id)) return true;
    }
    if (ONW.reverser && ONW.reverser.count(g, id) > 0) return true;   // 反転が1回以上ついている
    if ((g.copylistTarget || {})[id]) return true;   // コピリストのコピーの記録がある（マイクラ版 hasCopyist）
    return false;
  }

  /**
   * 死霊化の適用（vote.determineWinners の末尾から呼ばれる。マイクラ版 applyNecromancerWraith + applyNecromancerComboWraith）。
   * 通常分: 生存・未封印・実効役職ネクロマンサーで、通常は村人陣営勝利 / 模倣は人狼陣営勝利のときに1人。
   * コンボ分: 生存・勝利・未封印・実効役職ネクロマンサーで、コンボ状態を持つ人がいれば、さらにもう1人。
   */
  function apply(g) {
    if (!g || g.abandoned || g.necromancerApplied) return;
    g.necromancerApplied = true;
    const dead = ONW.vote.deadSet(g);
    const winners = new Set(g.winnerIds || []);
    const teams = g.winTeams || [];
    const aliveNecro = (id) => !dead.has(id) && ONW.mimic.eff(g, id) === ID && !(ONW.seal && ONW.seal.is(g, id));
    // 通常分（発動するネクロマンサーは最初の1人だけ。マイクラ版も find で1人）
    const base = g.players.map((p) => p.id).find((id) => {
      if (!aliveNecro(id)) return false;
      const mimic = g.currentRoles[id] === ONW.ROLE.MIMIC_WOLF;
      return teams.includes(mimic ? "人狼陣営" : "村人陣営");
    });
    if (base) convert(g, winners, g.currentRoles[base] === ONW.ROLE.MIMIC_WOLF);
    // コンボ分（通常分とは別にもう1人。発動するネクロマンサーは最初の1人だけ）
    const combo = g.players.map((p) => p.id).find((id) => aliveNecro(id) && winners.has(id) && hasComboState(g, id));
    if (combo) convert(g, winners, g.currentRoles[combo] === ONW.ROLE.MIMIC_WOLF);
    g.winnerIds = [...winners];
  }

  /** 結果情報（情報確認）: 死霊化した人の行（マイクラ版の連鎖ログと同じ文） */
  function lines(g, nm) {
    return (g.necromancerWraithIds || []).map((id) => `ネクロマンサーの能力により ${nm(id)} が死霊になりました。`);
  }

  /** 結果発表の専用演出用データ（死霊化した順）: [{ id, name, mimic }] */
  function stageData(g, nm) {
    return (g.necromancerWraithIds || []).map((id) => ({ id, name: nm(id), mimic: !!(g.necromancerWraithIsMimic || {})[id] }));
  }

  /** 実績（マイクラ版 wiki データ / stats.js）: first_necromancer「死霊術師」/ win_necromancer「死者への手向け」の2種だけ（死霊側の実績は無い） */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_necromancer");
    if (fin === ID && won) out.push("win_necromancer");
    return out;
  }

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 167, name: "ネクロマンサー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24.3,
      desc: "村人陣営。夜の行動はありません。自分が生存した状態で村人陣営が勝利した場合、敗北している死亡者の中からランダムに1人を「死霊」にして勝者に加えます。模倣の人狼が模倣した場合は、人狼陣営が勝利したときに発動します。封印されている場合は発動しません。" },
    groups: { "transform:light_apostle": 67 },   // 光の使徒の変化先（村人系）のみ。並びはマイクラ版 TRANSFORM_ROLE_GROUPS の順（ハンターの次）
    achievements,
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>生存した状態で村人陣営が勝利すると、敗北した死亡者の1人が死霊として勝者に加わります。</p>`;
      },
    },
    /** 夜の情報（マイクラ版 night.js のネクロマンサー情報。情報確認にも残る） */
    nightMsg(c, p) { return { text: "ネクロマンサーは夜行動がありません。生存した状態で村人陣営が勝利すると、敗北した死亡者の1人が死霊として勝者に加わります。" }; },
    cpuClaim(k, g, p, r, i, c) { c.co = ID; },   // ネクロマンサー: 結果開示は無いので、必ずネクロマンサーCOだけする（ハンターと同じ形）
    cpuLie: { role: ID, weight: 4, order: 67, claim: () => ({ co: ID, result: null }) },   // 騙りで名乗ることもある（COだけ）
    stageResult: {
      // 作者メモ: 全員がめくれたあと、負けた人のカードが吹っ飛ぶ前にネクロマンスする（stage.js の startResult が
      // 勝負師の紙の直後・playLadder の直前に呼ぶ）。幽霊の気配が漂い、カードが裏返ってから死霊の面でめくれる
      necromancer: { order: 1, run(R) {
        const res = R.res, list = res.necromancerWraith || [];
        if (!list.length || res.abandoned) return;
        const P = (id) => `p:${id}`;
        list.forEach((w, i) => {
          const k = P(w.id), t0 = R.t + i * 2900;
          R.later(() => { R.setCap(`<div class="res-cap__t">ネクロマンサー</div><div>${R.esc(w.name)} が死霊になりました</div>`); R.gx[k] = "wraith"; R.paint(R.G()); }, t0);
          R.later(() => { delete R.up[k]; R.paint(R.G()); }, t0 + 1500);   // 一度裏返って…
          R.later(() => { R.wraithv[k] = w.mimic ? "wolf" : "village"; R.up[k] = WRAITH; delete R.gx[k]; R.paint(R.G()); }, t0 + 2100);   // …死霊の面（由来の陣営色）でめくれる
        });
        R.t += list.length * 2900;
      } },
      skip(R) {   // スキップ時: 死霊化した人のカードは死霊の面（由来の陣営色）で出す
        ((R.res && R.res.necromancerWraith) || []).forEach((w) => { const k = `p:${w.id}`; R.wraithv[k] = w.mimic ? "wolf" : "village"; if (R.up[k]) R.up[k] = WRAITH; });
      },
    },
  });

  ONW.defineRole(WRAITH, {
    info: { deck: 168, name: "死霊", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 42.5,
      desc: "第三陣営。ネクロマンサーの能力によって、敗北していた死亡者から変化する役職です。変化した時点で勝者に加わります。" },
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。</p>`;
      },
    },
    nightMsg(c, p) { return { text: "死霊は夜行動がありません。" }; },
  });

  ONW.necromancer = { apply, lines, stageData, achievements, candidates, hasComboState, clearStatuses };
})(window.ONW = window.ONW || {});
