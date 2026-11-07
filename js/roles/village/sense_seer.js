/**
 * 感覚の占い師（村人陣営・昼能力。マイクラ版 minecraftver.mcpack の SENSE_SEER を参考。心眼の人狼の昼能力の仕組みをもとにしている）:
 *   夜の能力はない。昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選ぶと、その人の「最終役職（そのときのカード）」から
 *   陣営の気配（村人 / 人狼 / 狂っている / 第三陣営 / 恋人陣営）を感じ取る。1人1回。妖狐を占っても呪殺しない。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_感覚の占い師_*of4-*.txt）:
 *   1of4: 登録（このファイル・index.html・ルールコード ONW64・ロビー/ガイド/wikiの並び・夜の説明・状態キーの登録）と、気配の判定（judge）【済】
 *   2of4: 昼能力の本体（使える条件 canUse・対象 targets・記録 apply・本人への結果・結果発表の「昼行動結果」・ホストの検証 hostMind・昼能力ボタンの振り分け・選択画面）【済】
 *         ・状態: g.senseSeerTarget[ID] = 感じ取った相手のID / g.senseSeerSeen[ID] = 感じた気配の種類（ID は能力を使った人。試合ごとに net.startGame が {} に戻す）
 *         ・通信は心眼の人狼と同じ入口を共用: 昼能力ボタン dictopen → mindok(role:"sense_seer") → 相手のカードを選ぶ（stage.js type:"mind"）→「感じ取る」→ act kind:"mind" → hostMind（canUse の方を実行）→ senseday（本人の情報確認）/ minddone
 *   3of4: 演出・COボタン・CPU・情報確認
 *     a【済】演出（感じ取った相手のカードがめくれ、気配の色の光と「👁 気配」の札。stageFlash / stage.js の senseKeys・面 "__sense@気配"・CSS）・
 *            情報確認の文のタイミング（net.js senseday も holdLogs で、カードがめくれてから文を出す）・COボタン（coResult kind "sense": 対象 → 気配を選ぶ or 伏せる。co.js の optionList）・
 *            封印の狂人の結果申告に "sense" を追加・CO申告 { kind:"sense", target, key } を g.cpuClaims に記録
 *     b【済】CPU（結果を覚える cpu.noticeSense → cpuNotice・騙り cpuLie / cpuClaim・自動で使う net.js cpuMind と ONW.CPU_AUTO_DAY.sense（cpuPick）・投票判断 cpuVoteSee）
 *   4of4: 端のケース（酔っ払い・墓荒らし・ドッペルゲンガー・シャッフラー・蜃気狼・再接続・観戦）と総合テスト・docs の仕上げ
 *
 * 【気配の判定（マイクラ版 main.js senseSeerMessage と同じ順）】対象の最終役職（g.currentRoles）で決める:
 *   1. 蜃気狼（模倣先が蜃気狼の模倣の人狼も）: 盤面にあり得るランダムな役職（ONW.mirage.dayRole。心眼の人狼と同じ）の気配に見える（1回の能力につき1回だけ引く）。恋人の判定は飛ばす
 *   2. (+恋人) がついている人 → 「恋人陣営の気配」（(+反転) は Web版に無い。入れるときは 反転 ＞ 恋人 の順 = docs/overlay-role-priority.md）
 *   3. 昇格した狂人（g.promotedWolfIds）・人狼系 → 「人狼の気配」 / 狂人系 → 「狂っている気配」 / 第三陣営（ドッペルゲンガー含む）→ 「第三陣営の気配」 / それ以外 → 「村人の気配」
 *      ・白狼・忘却の人狼・模倣の人狼も、カード自体が人狼系なので「人狼の気配」（占い師の見え方とは違う。マイクラ版の isRealWolfRole）
 *      ・闇の化身・狼憑き・狐憑き・呪われし者・お姫様は、マイクラ版の分類どおり「村人の気配」
 *   酔っ払い(+酔っ払い) は気配に影響しない（最終役職のカードだけを見る）。
 *
 * 勝敗の優先度: 村人陣営の役職。勝敗は村人陣営の基本勝敗のまま（docs/victory-priority.md の表に新しい行は不要）。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE;

  /** 気配の種類 → 文に入る言い方（マイクラ版 senseSeerMessage の「〇〇から△△を感じました。」の△△） */
  const FEEL = { village: "村人の気配", wolf: "人狼の気配", mad: "狂っている気配", third: "第三陣営の気配", lover: "恋人陣営の気配" };
  /** 人狼系（マイクラ版 isRealWolfRole のうち Web版にある役職。白狼・忘却の人狼・模倣の人狼も含む。闇の化身は含まない） */
  const WOLF_ROLES = new Set(["werewolf", "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf", "forgetful_wolf", "assassin", "wolf_king", "mapo_wolf",
    "cat_pumpkin", "observer_wolf", "mind_wolf", "mimic_wolf", "eraser_wolf", "mirage_wolf"]);
  /** 狂人系（マイクラ版 isMadRole のうち Web版にある役職） */
  const MAD_ROLES = new Set(["madman", "mad_seer", "cultist", "black_cat", "exposed_madman", "muzzle_madman", "rebel_madman", "mad_queen",
    "black_wolf_madman", "mad_mayor", "seal_madman", "mad_exchanger", "tenacious_madman", "jester_madman", "smoke_madman"]);

  /** 役職 role（持ち主 id）の気配の種類（蜃気狼・恋人は見ない。そこは judge）。昇格した狂人は人狼 */
  function classify(g, role, id) {
    if (id && (g.promotedWolfIds || []).includes(id) && MAD_ROLES.has(role)) return "wolf";
    if (WOLF_ROLES.has(role)) return "wolf";
    if (MAD_ROLES.has(role)) return "mad";
    const info = ONW.ROLE_INFO[role];
    if (info && info.team !== ONW.TEAM.VILLAGE && info.team !== ONW.TEAM.WOLF) return "third";   // 第三陣営（ドッペルゲンガーなど）
    return "village";
  }
  /**
   * target の気配を決める（最終盤面 g.currentRoles で）。戻り値: { key, mirage }。
   * 蜃気狼のときは「ランダムな役職」を1回だけ引き、その役職の気配（心眼の人狼と同じ ONW.mirage.dayRole）。1回の能力につき1回だけ呼ぶこと。
   */
  function judge(g, target) {
    const role = (g.currentRoles || {})[target];
    if (ONW.mirage && ONW.mirage.isMirageCard(g, role, target)) {
      ONW.mirage.noteInspect(g, target, "sense_seer");   // 蜃気狼に確認された記録（実績 mirage_wolf_inspected 用）
      return { key: classify(g, ONW.mirage.dayRole(g), null), mirage: true };
    }
    if (ONW.isLover(g, target)) return { key: "lover", mirage: false };
    return { key: classify(g, role, target), mirage: false };
  }
  /** 本人への文（人間の画面・情報確認・CPUの記憶で完全に一致させる）: 「〇〇 から人狼の気配を感じました。」 */
  const resultText = (name, key) => `${name} から${FEEL[key] || FEEL.village}を感じました。`;
  /** 気配を感じた気配の言い方（札や結果開示で使う） */
  const feelLabel = (key) => FEEL[key] || FEEL.village;
  /** COボタンの結果開示の文（本人の文 resultText と同じ言い方。マイクラ版の「〇〇から△△を感じました。」）。伏せるときは気配を言わない */
  const coText = (name, key) => resultText(name, key);
  const coHideText = (name) => `${name} の気配を感じ取りました。気配は伏せます。`;
  /** COボタンで選べる気配（陣営の色つき。順は 村人・人狼・狂っている・第三陣営・恋人陣営） */
  const COLOR = { village: "village", wolf: "wolf", mad: "wolf", third: "third", lover: "third" };   // ボタンの色クラス（t-village=緑 / t-wolf=赤 / t-third=灰）
  const coOptions = () => ["village", "wolf", "mad", "third", "lover"].map((k) => ({ id: k, label: FEEL[k], team: COLOR[k] }));

  const dead = (g, id) => (g.deadIds || []).includes(id) || (g.foxCursed || []).includes(id);
  /** この人（能力を使った人）が感じ取った相手のID（まだ使っていなければ null）。使用済みは「人」についている（心眼の人狼と同じ） */
  const targetOf = (g, id) => (g.senseSeerTarget || {})[id] || null;
  /** もう使ったか（1人1回） */
  const used = (g, id) => !!targetOf(g, id);
  /** 感じ取れる相手（生きている自分以外） */
  function targets(g, id) { return (g.players || []).map((p) => p.id).filter((x) => x !== id && !dead(g, x)); }
  /** 昼能力を使えるか（感覚の占い師のカードを持つ・酔いが覚めている・生きている・未使用・昼の議論中でタイマーが動いている・独裁処刑や全員死亡スキップ中でない・相手がいる） */
  function canUse(g, id) {
    if (!g || g.dictator || g.allDeadSkip) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞などの紙が出ている間）は使えない
    if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R_().SENSE_SEER) return false;   // 模倣の人狼が感覚の占い師を模倣していても使える
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || dead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /**
   * 感じ取る（ホストが検証したあとに呼ぶ。c = net.js の RC()）。
   *   ・記録（senseSeerTarget / senseSeerSeen）→ 昼行動結果（dayLogsAll。マイクラ版 vote.js と同じ「〇〇の気配を感じ取っていました」。見えた気配は書かない）
   *   ・本人: 情報確認に「〇〇 から△△の気配を感じました。」。人間には senseday。CPUは演出なし
   *   ・感じ取られた側には何も伝わらない。妖狐を感じ取っても呪殺しない（呪殺の判定は呼ばない）
   * 戻り値: { target, key } / 条件を満たさなければ null
   */
  function apply(c, id, target) {
    const g = c.g;
    if (!canUse(g, id) || !targets(g, id).includes(target)) return null;
    const j = judge(g, target);   // 蜃気狼のランダムは、ここで1回だけ引く
    g.senseSeerTarget = g.senseSeerTarget || {}; g.senseSeerSeen = g.senseSeerSeen || {};
    g.senseSeerTarget[id] = target; g.senseSeerSeen[id] = j.key;
    const me = c.byId(id), tp = c.byId(target), text = resultText(tp.name, j.key);
    (g.dayLogsAll = g.dayLogsAll || []).push(`${c.rn("sense_seer")} ${me.name} は ${tp.name} を占い、${FEEL[j.key] || FEEL.village}を感じ取っていました。`);   // 結果発表の昼行動結果: 誰を占い、どんな気配だったか（夜行動結果の占いと同じく、結果発表なので結果も出す）
    c.hold(id, text);   // CPUも人間と同じ文を情報確認に残す
    if (!me.isCpu) c.send(id, { t: "senseday", id: target, text, key: j.key });
    else if (ONW.cpu && ONW.cpu.noticeSense) ONW.cpu.noticeSense(g, id, target, j.key);   // CPUが結果を覚える（3of4）
    return { target, key: j.key };
  }
  /** 再入室(resync)で本人に戻す結果の文（使っていなければ null）。apply が本人に出した文と完全に同じ */
  function doneText(g, id, nameOf) {
    const t = targetOf(g, id), k = (g.senseSeerSeen || {})[id];
    return t && k ? resultText(nameOf(t), k) : null;
  }
  /** 観戦者の「昼の行動」欄（specInfo）: 使った順に { by, target, key }（名前と気配の種類） */
  function specLines(g, nm) {
    return Object.entries(g.senseSeerTarget || {}).map(([by, t]) => ({ by: nm(by), target: nm(t), key: (g.senseSeerSeen || {})[by] || null }));
  }

  // ---- CPU（3of4-b） ----
  /** 騙り感覚の占い師: 偽の気配を言う。人狼陣営は仲間（本物の人狼）を村人と言い、それ以外は72%で人狼と告発。非人狼の騙りは半々 */
  function lieClaim(k, g, p, others, selfRole, co) {
    const { fakeSeerTarget, bareCo, isWolfSide } = k;
    const t = fakeSeerTarget(g, p);
    if (!t) return { co: bareCo(g, co), result: null };
    const real = classify(g, g.currentRoles[t.id], t.id);
    let key;
    if (isWolfSide(selfRole)) key = real === "wolf" ? "village" : Math.random() < 0.72 ? "wolf" : "village";
    else key = Math.random() < 0.5 ? "wolf" : "village";
    return { co, result: { short: `${t.name} → ${FEEL[key]}`, text: coText(t.name, key), claim: { kind: "sense", target: t.id, key } } };
  }
  /** 本物の感覚の占い師のCPUの発言: 感じ取っていればその結果を開示、まだなら「感覚の占い師CO」だけ */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = "sense_seer";
    const seen = i.senseSeen || {}, ts = Object.keys(seen);
    if (!ts.length) return;
    const t = ts[ts.length - 1], nm = k.nameOf(g, t), key = seen[t];
    c.result = { short: `${nm} → ${FEEL[key] || FEEL.village}`, text: coText(nm, key), claim: { kind: "sense", target: t, key } };
  }

  /** 実績（wiki の「感覚の占い師」に定義済みの sense_seer_used / first_sense_seer / win_sense_seer）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で満たした実績ID」を返すだけ（蜃気狼の ONW.mirage.achievements と同じ）。won: その人が勝ったか */
  function achievements(g, id, won) {
    const out = [], S = R_().SENSE_SEER, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (used(g, id)) out.push("sense_seer_used");   // 気配を感じ取った（使った人についている記録。カードを手放した人も）
    if (ini === S || cur === S) out.push("first_sense_seer");   // 初めて感覚の占い師になる（初回かどうかは保存側が数える）
    if (cur === S && won) out.push("win_sense_seer");   // 最終的に感覚の占い師で勝つ
    return out.filter((x, k) => out.indexOf(x) === k);
  }

  ONW.senseSeer = { achievements, FEEL, classify, judge, resultText, feelLabel, coText, coHideText, coOptions, canUse, targets, used, targetOf, apply, doneText, specLines };

  ONW.defineRole("sense_seer", {
    info: { sealTarget: true, deck: 86, name: "感覚の占い師", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.98,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選ぶと、その人の最終役職（そのときのカード）から「村人・人狼・狂っている・第三陣営・恋人陣営」のどの気配かを感じ取れます。妖狐を占っても呪殺しません。蜃気狼は、盤面にあり得るランダムな役職の気配に感じられます。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に感覚の占い師を持っている人が使えます。" },
    groups: { "transform:light_apostle": 31 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 31）で決まる（番号は所属を表すだけ）
    // 昼の演出(stage.js の flashes("early") が g.senseFlash を渡す。net.js の senseday が items [{ id, key }] を入れる): 感じ取った相手のカードがめくれ、気配の色の光と「👁 気配」の札で数秒開いて裏に戻る。
    //   めくれた面は役職名ではなく気配の印（🌿村人 / 🐺人狼 / 🌀狂気 / ✨第三陣営 / ❤恋人）。感じ取られた側・他の人・観戦者には何も出ない（心眼の人狼 mindFlash と同じ）
    stageFlash: {
      field: "senseFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = SK.senseMark(x.key || "village"); SK.badge[k] = "👁 気配"; SK.senseKeys[k] = x.key || "village";
          SK.paint(SK.G());
        }, 200 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.badge[k]; delete SK.senseKeys[k]; });
          SK.paint(SK.G());
        }, 200 + list.length * 380 + 3800);
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 対象を選ぶ → 感じた気配を選ぶ（または伏せる）。使う前にCOだけできる(noChain。心眼の人狼・保安官と同じ。使ったあとに「結果開示」を押す)
    coResult: {
      kind: "sense", targetLabel: "気配を感じ取った相手", roleHint: "から感じた気配", noChain: true,
      optionList: coOptions,   // 役職ではなく、気配の種類から選ぶ（co.js の optionList）
      pickRole(key, who, s, K) {
        if (key === "hide") return [coHideText(who), null, null, "disclose", `${who} → 伏せ`];
        if (!FEEL[key]) return [coHideText(who), null, null, "disclose", `${who} → 伏せ`];
        return [coText(who, key), { kind: "sense", target: s.target, key }, null, "disclose", `${who} → ${FEEL[key]}`];
      },
    },
    cpuLie: { role: "sense_seer", weight: 8, order: 16, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    // CPU: 感じ取った結果を覚える（cpu.js の noticeSense が呼ぶ）。人狼の気配なら「知っている役職」(known)として人狼扱い（仲間でなければ票が入る）。それ以外の気配は役職が決まらないので senseSeen だけ
    cpuNotice(g, id, target, key, k) {
      const i = k.infoOf(g, id);
      i.senseSeen = i.senseSeen || {}; i.senseSeen[target] = key;
      if (key === "wolf" && i.known[target] === undefined) i.known[target] = "werewolf";
    },
    // CPUが感じ取る相手（CPU_AUTO_DAY.sense のとき net.js の cpuMind が使う）: まだ役職も気配も分かっていない人を優先し、仲間の人狼と分かっている人は避ける
    cpuPick(k, g, p) {
      const ts = targets(g, p.id); if (!ts.length) return null;
      const i = k.infoOf(g, p.id);
      const unknown = ts.filter((t) => i.known[t] === undefined), nonMate = ts.filter((t) => !k.isWolf(i.known[t]));
      return k.pick(unknown.length ? unknown : nonMate.length ? nonMate : ts);
    },
    // CPUの投票判断: 他の人が「〇〇から△△の気配を感じた」と申告していたら、その人（q）の評価に足す（自分の申告は別: 自分で感じたことは known で見る）
    cpuVoteSee(k, g, p, q, i, me, wolfSide) {
      let s = 0;
      (g.cpuClaims || []).filter((c) => c.kind === "sense" && c.target === q.id && c.from !== p.id).forEach((c) => {
        if (c.key === "wolf") s += wolfSide ? 0.8 : 2.6;
        else if (c.key === "mad") s += wolfSide ? -0.2 : 1.0;
        else if (c.key === "village") s += wolfSide ? -0.4 : -0.9;
        else s += wolfSide ? -0.2 : -0.5;   // 恋人陣営・第三陣営
      });
      return s;
    },
    // 夜の画面: 夜の行動がない感覚の占い師向けの説明
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼の議論中に、昼能力ボタンから<strong>対象1人の気配</strong>を感じ取れます。</p>`;
      },
    },
  });
})(window.ONW);
