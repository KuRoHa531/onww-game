/**
 * 心眼の人狼（マイクラ版 MIND_WOLF を参考）: 人狼陣営の「人狼系」。夜は人狼と同じく仲間の人狼が分かり、占い・判定・勝利条件も人狼と同じ。
 * 夜の能力はなく、昼の議論中に昼能力ボタン（独裁者・交換者・保安官・再就職フリーターと共用の dictopen）から
 * 自分以外の1人を選ぶと、その人の「最終役職」（そのときのカード = g.currentRoles）が分かる。妖狐を見抜いても呪殺しない。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_心眼の人狼_*of4.txt）:
 *   1of4: 登録（このファイル・index.html・ルールコード ONW46・ロビー/ガイドの並び・夜の説明）【済】
 *   2of4: 昼能力の本体（使える条件・対象・記録・本人への結果・結果発表の「昼行動結果」）【済】
 *         ・状態: g.mindWolfTarget[ID] = 見抜いた相手のID / g.mindWolfSeen[ID] = 見えた最終役職（ID は能力を使った人。マイクラ版 mindWolfTarget / mindWolfSeenRole と同じ。試合ごとに net.startGame が {} に戻す）
 *         ・使えるのは、最終盤面で心眼の人狼を持っていて（酔いが覚めている）・生きていて・まだ使っていない人。昼のタイマーが動いている間だけ（1人1回）。対象は生きている自分以外
 *         ・最終役職 = そのときのカード（g.currentRoles）。夜に占うような初期役職ではない（フリーターの昼の再就職と同じ）
 *         ・呼び出し: net.js の hostMind(ホスト) → ONW.mindWolf.canUse / targets / apply。本人には mindday（カードが数秒表になる jobday と同じ演出）。昼行動結果は g.dayLogsAll
 *   3of4: 演出・COボタン・CPU・情報確認【済】
 *         ・演出: 本人に mindday（net.js）→ g.mindFlash → 下の stageFlash。見抜いた相手のカードが占い師のようにめくれて最終役職が出る（桃紫の光＋「👁 最終役職」の札。数秒で裏に戻る）。見抜かれた側・他の人には何も出ない
 *         ・COボタン: 「心眼の人狼CO」だけで終われる(noChain)。使ったあとに「結果開示」→ 対象 → 最終役職（または伏せる）→「〇〇 の最終役職は △△ でした。」（マイクラ版 main.js の対象選択→役職選択→伏せる）
 *         ・CPU: 結果を覚える(cpuNotice → ONW.cpu.noticeMind)。人狼陣営なので昼は騙る（心眼の人狼COは騙りの候補に入れない=マイクラ版と同じ）。昼能力を自動で使うのは ONW.CPU_AUTO_DAY.mind（既定OFF。デバッグの昼能力タブで発動）
 *         ・最終結果の情報確認: mindday は INFO_DAY に入る（人間）/ CPUは hold
 *   4of4: 端のケースと総合テスト【済】
 *         ・使用済みは「人」についている（g.mindWolfTarget[能力を使った人のID]。マイクラ版 mindWolfTarget[myId] / dayActionDone[myId] と同じ）。カードにはついていかない:
 *           使った人がそのあとカードを手放したら、もう使えない（記録・結果の文はそのまま残る）。再びカードが戻ってきても使用済みのまま（1人1回）。
 *           まだ使っていない人が昼にカードを手にしたら（酔い覚めの能力・昼の入れ替え）、その人が1回使える。手放した人の開いている選択画面は net.js の mindShift が閉じる
 *         ・酔っ払い: 酔い中は使えず、覚めたら（最終役職が心眼の人狼なら）使える。酔い覚めの文に「昼能力ボタンから見抜ける」を足した（soberLines）。CPUは覚めたあとの cpuMind で予約
 *         ・墓荒らし・ドッペル（夜に手にした）/ シャッフラー（置かれたカード）: 最終盤面（g.currentRoles）で見るので、手にした人は使える・取り上げられた/置き換えられた人は使えない。見えるのも最終盤面の役職
 *         ・再接続: 使用済みは g.mindWolfTarget（ホスト引き継ぎ AUTH_KEYS に含む）。再入室した本人には minddone(text) で結果の文を情報確認へ戻す。選択画面(mindOpen)は戻さない（dictopen と同じ。押し直せば使える人にだけ開く）
 *         ・観戦: specInfo の mind（昼の行動欄に「A → B（最終役職）」）
 *
 * 勝敗の優先度: 人狼系は基本勝敗のまま（docs/victory-priority.md の表に新しい行は不要）。人狼として占われ、人狼判定に数えられる。
 */
(function (ONW) {
  const K = ONW.wolfKit;
  const R_ = () => ONW.ROLE;
  const dead = (g, id) => (g.deadIds || []).includes(id) || (g.foxCursed || []).includes(id);

  /** この人（能力を使った人）が見抜いた相手のID（まだ使っていなければ null） */
  const targetOf = (g, id) => (g.mindWolfTarget || {})[id] || null;
  /** もう使ったか（1人1回） */
  const used = (g, id) => !!targetOf(g, id);
  /** 見抜ける相手（生きている自分以外） */
  function targets(g, id) { return (g.players || []).map((p) => p.id).filter((x) => x !== id && !dead(g, x)); }
  /** 昼能力を使えるか（心眼の人狼のカードを持つ・酔いが覚めている・生きている・未使用・昼の議論中でタイマーが動いている・独裁処刑や全員死亡スキップ中でない・相手がいる） */
  function canUse(g, id) {
    if (!g || g.dictator || g.allDeadSkip) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞などの紙が出ている間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R_().MIND_WOLF) return false;   // 模倣の人狼が心眼の人狼を模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない（2of4）
    if (ONW.hiddenDrunk(g, id) || dead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** 本人への文（人間の画面・情報確認・CPUの記憶で完全に一致させる） */
  const resultText = (name, roleName) => `${name} の最終役職は「${roleName}」でした。`;
  /** COボタンの結果開示の文（マイクラ版 main.js の「〇〇 の最終役職は △△ でした。」「〇〇 を見抜きました。役職は伏せます。」）。人間のCOボタンはこれだけ。CPUは心眼の人狼COを騙らないので使わない */
  const coText = (name, roleName) => `${name} の最終役職は ${roleName} でした。`;
  const coHideText = (name) => `${name} を見抜きました。役職は伏せます。`;
  /**
   * 見抜く（ホストが検証したあとに呼ぶ。c = net.js の RC()）。
   *   ・記録（mindWolfTarget / mindWolfSeen）→ 昼行動結果（dayLogsAll。マイクラ版と同じ「〇〇の最終役職を見抜いていました」。見えた役職は書かない）
   *   ・本人: 情報確認に「最終役職は○○でした」。人間には mindday（対象のカードが数秒表になる）。CPUは演出なし
   *   ・見抜かれた側には何も伝わらない。妖狐を見抜いても呪殺しない（呪殺の判定は呼ばない）
   * 戻り値: { target, role } / 条件を満たさなければ null
   */
  function apply(c, id, target) {
    const g = c.g;
    if (!canUse(g, id) || !targets(g, id).includes(target)) return null;
    let role = g.currentRoles[target];
    if (ONW.mirage && ONW.mirage.isMirageCard(g, role, target)) { ONW.mirage.noteInspect(g, target, "mind_wolf"); role = ONW.mirage.dayRole(g); }   // 蜃気狼（模倣先が蜃気狼の模倣の人狼も）は、盤面にあり得るランダムな役職に見える
    g.mindWolfTarget = g.mindWolfTarget || {}; g.mindWolfSeen = g.mindWolfSeen || {};
    g.mindWolfTarget[id] = target; g.mindWolfSeen[id] = role;
    const me = c.byId(id), tp = c.byId(target), text = resultText(tp.name, c.rn(role));
    (g.dayLogsAll = g.dayLogsAll || []).push(`${c.rn("mind_wolf")} ${me.name} は ${tp.name} の最終役職を見抜いていました。`);
    c.hold(id, text);   // CPUも人間と同じ文を情報確認に残す
    if (!me.isCpu) c.send(id, { t: "mindday", id: target, text, role, items: [{ id: target, role }] });
    else if (ONW.cpu && ONW.cpu.noticeMind) ONW.cpu.noticeMind(g, id, target, role);   // CPUが結果を覚える（3of4）
    return { target, role };
  }
  /** 再入室(resync)で本人に戻す結果の文（使っていなければ null）。apply が本人に出した文と完全に同じ。ID は能力を使った人なので、使ったあとにカードを手放した人にも戻る */
  function doneText(g, id, nameOf, rn) {
    const t = targetOf(g, id), r = (g.mindWolfSeen || {})[id];
    return t && r ? resultText(nameOf(t), rn(r)) : null;
  }
  /** 観戦者の「昼の行動」欄（specInfo）: 見抜いた順に { by, target, role }（名前と最終役職のID）。観戦者は全員の役職が見えるので、使った事実だけ出す */
  function specLines(g, nm) {
    return Object.entries(g.mindWolfTarget || {}).map(([by, t]) => ({ by: nm(by), target: nm(t), role: (g.mindWolfSeen || {})[by] || null }));
  }
  ONW.mindWolf = { canUse, targets, used, targetOf, apply, resultText, coText, coHideText, doneText, specLines };

  ONW.defineRole("mind_wolf", {
    info: { deck: 68, name: "心眼の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.56,
      desc: "人狼陣営。他の人狼を確認できます。昼の議論中に、昼能力ボタンから対象1人を選ぶと、その人の最終役職（そのときのカード）が分かります。妖狐を見抜いても呪殺しません。占い・判定・勝利条件は常に人狼として扱われます。" },
    groups: { wolf: 8.7, "transform:dark_avatar": 9.2 },
    nightMsg: K.nightMsg, got: K.got, soberPeek: K.soberPeek,
    // 酔い覚め: 仲間の人狼（人狼系共通）＋ 昼能力が使えること（覚めたあとに使える。酔い中は canUse が弾く）
    soberLines: K.soberLines,   // 昼能力が使えることの説明は出さない（心眼の人狼になった時点で昼能力があるのは自明）
    // 昼の演出(stage.js の flashes("early") が g.mindFlash を渡す): 見抜いた相手のカードが占い師のようにめくれ、最終役職の面で数秒開いて裏に戻る。観戦者には出さない
    stageFlash: {
      field: "mindFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = x.role; SK.badge[k] = "👁 最終役職"; if (!SK.mindKeys.includes(k)) SK.mindKeys.push(k);
          SK.paint(SK.G());
        }, 200 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.badge[k]; SK.pull(SK.mindKeys, k); });
          SK.paint(SK.G());
        }, 200 + list.length * 380 + 3800);
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 対象を選ぶ → 最終役職を選ぶ（または伏せる）。使う前にCOだけできる(noChain。保安官と同じ。使ったあとに「結果開示」を押す)
    coResult: {
      kind: "mind", targetLabel: "最終役職を見抜いた相手", roleHint: "の最終役職", noChain: true,
      pickRole(role, who, s, K) {
        if (role === "hide") return [coHideText(who), null, null, "disclose", `${who} → 伏せ`];
        return [coText(who, K.rn(role)), { kind: "mind", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
    },
    // CPU: 見抜いた結果を覚える（cpu.js の noticeMind が呼ぶ）。最終役職が分かった相手は、人間の占い・怪盗の結果と同じく「知っている役職」(known)になる（仲間の人狼と分かれば票を入れない）
    cpuNotice(g, id, target, role, k) {
      const i = k.infoOf(g, id);
      i.mindSeen = i.mindSeen || {}; i.mindSeen[target] = role;
      i.known[target] = role;
    },
    // CPUが見抜く相手（CPU_AUTO_DAY.mind のとき net.js の cpuMind が使う）: まだ役職が分からない人を優先し、仲間の人狼と分かっている人は避ける
    cpuPick(k, g, p) {
      const ts = targets(g, p.id); if (!ts.length) return null;
      const i = k.infoOf(g, p.id);
      const unknown = ts.filter((t) => i.known[t] === undefined), nonMate = ts.filter((t) => !k.isWolf(i.known[t]));
      return k.pick(unknown.length ? unknown : nonMate.length ? nonMate : ts);
    },
    // 夜の画面: 夜の行動がない心眼の人狼向けの説明（仲間の人狼の表示は共通の文言のあとに出る）
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼の議論中に、昼能力ボタンから<strong>対象1人の最終役職</strong>を見抜けます。</p>`;
      },
    },
  });
})(window.ONW);
