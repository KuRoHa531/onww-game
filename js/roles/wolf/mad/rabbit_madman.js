/**
 * rabbit_madman.js — 兎の狂人（人狼陣営・狂人系 / deck 146 / wiki order 111 / 発案: くろは / 元ネタ: 人狼ゲーム 狸の系列ではなく干支狂人）
 *
 * マイクラ版（scripts/state.js ROLE_INFO[RABBIT_MADMAN] / game.js / night.js / main.js / vote.js / cpu.js）準拠:
 * ・夜の選択はない。ゲーム開始時に、参加者の中からランダムな1人（兎の狂人自身も含む）が
 *   「草むらに隠れた人」になる（マイクラ版 initializeRabbitMadmanHiddenTarget。兎の狂人が複数いても対象は1人だけ）。
 *   決まるのは「初期役職または最終役職が兎の狂人」の人が現世にいるときだけ。対象は人に付く記録で、
 *   その後カードが入れ替わっても動かない。墓荒らし・ドッペルゲンガー・シャッフラーなどで後から
 *   兎の狂人になっても、新しい対象は決まらない（マイクラ版に代入経路が無い）。
 * ・兎の狂人本人への通知は夜情報の「○○が警戒して草むらに隠れたようです。」（マイクラ版 notifyRabbitMadmanHiddenTarget）。
 *   通知を受けるのは「初期役職が兎の狂人」の人だけ（配役時の変化で兎になった人も初期役職=兎なので受ける）。
 *   模倣の人狼・クローンが思い込んでいても通知は無い（マイクラ版は初期/最終の判定のみ）。
 *   酔っ払い（未覚醒）の間は通知されず、酔いが覚めた時点で届く（soberLines。マイクラ版は60tick後に再送）。
 *   銀狼にハッキングされている人は通知されない（マイクラ版: 通知済みにして出さない）。
 * ・隠れた本人は気づかない。隠れた人に対して夜能力・昼能力を使うと、その能力は失敗する:
 *   - 夜: 対象選択（sel.players）に隠れた人が含まれていたら行動全体が失敗（マイクラ版 failRabbitHiddenNightTarget。
 *     複数対象の能力も、1人でも含まれれば全部失敗。ケセドは占い先・コーヒー先のどちらでも失敗）。
 *     使った人には「対象は草むらに隠れていたため失敗しました。」が届き、夜ログに
 *     「<役職> <名前> は草むらに隠れていた <相手> を選んだため失敗しました。」が残る。
 *     朝の演出は、使った人の画面でだけ、対象のカードが草むらの面（__grass）でめくれて揺れる（作者メモの演出）。
 *     朝の連鎖（墓荒らし・ドッペルゲンガーで手にした役職の能力）も同じく失敗する。
 *   - 昼: 昼能力（保安官・ヴァニティ・盗賊・妖精さん・鼠の逃げ込み・黄泉・イカロス・御乱心・心眼/感覚/写真・
 *     交換・天秤・独裁・再就職・予想屋。マイクラ版 hasDayActionRole のうちWeb版にあるもの）の対象に
 *     隠れた人が含まれていたら失敗し、昼能力は消費される（マイクラ版 failRabbitHiddenDayTarget は dayActionDone を立てる）。
 *     失敗したことは使った本人にだけ sealday と同じ形で届く（「対象は草むらに隠れていたため失敗しました。」）。
 *     ※解釈点: 草むらで失敗した人は、その日の昼能力を完全に消費したものとする（カルメンで2回使える人でも残らない。
 *       マイクラ版の dayActionDone は1回分のフラグなので、この読みが近い）。
 *     ※予想屋はWeb版ではタップのたびに保存する形なので、隠れた人を含む提出は丸ごと失敗扱いにして保存しない（解釈点）。
 *   - CPU: マイクラ版CPUは隠れた人を選ぶと失敗するが、Web版ではCPUの対象候補から隠れた人を外すことで
 *     「能力が発動しない」という結果だけを一致させた（CPU専用の解釈点。失敗ログは残らない）。
 *     ハッキングされた人間の本当の能力（裏でCPUが自動使用）も同じ経路なので、隠れた人は選ばれない。
 *   - 静観者（watcher）の「能力を使われた」には、失敗した能力は数えない（マイクラ版の失敗ヘルパーは数えない）。
 * ・システム側の自動決定では、隠れた人は候補から外れる（マイクラ版 excludeRabbitHiddenParticipants）:
 *   銀狼のハッキング対象 / バーテンダーのカクテル対象 / 口封じの狂人の対象（Web版で候補除外が要るものはこの3つ）。
 *   従者のご主人は、マイクラ版でも配役時の割り当て（assignServants）は除外しておらず（除外は試合途中で
 *   新しく従者になったときだけ）、Web版ではご主人の記録がカードに付いて動くため新規のランダム割り当てが無く、配線なし。
 *   フリーターの自動就職（選べないまま役職を受け取ったとき）も、Web版では朝の連鎖で自分で選ぶ形なので配線なし。
 *   ※Web版では隠れた人の決定をハッキングより前に置いたため、ハッキングの候補除外が実際に効く
 *     （マイクラ版は初期化順の都合で初回のハッキング割り当て時点では対象が未決定だが、仕組みとしては除外が正）。
 * ・結果発表の「役職情報」に「兎の狂人○○は○○に警戒心を共有していました。」（マイクラ版 vote.js。
 *   対象は初期/最終が兎の狂人の人と、模倣で兎の狂人を模倣している人）。
 * ・作者メモの演出:
 *   - 夜に隠すカードに草むらが生い茂る: 兎の狂人本人の待機時間（朝の演出）で、隠れた人のカードが
 *     草むらの面（__grass）でめくれる（本人の画面だけ。stageMorning kind "rabbit" mode "hide"）。
 *   - 隠されてる人に能力を使うと草むらが生い茂り始めて失敗: 使った人の画面で、対象のカードが
 *     草むらの面でめくれて揺れる（mode "fail"）。昼能力の失敗は文章のみ（既存の昼能力失敗と同じ形）。
 *
 * ・変化候補（マイクラ版で確認）:
 *   - 光の使徒: 入らない（人狼系）。闇の化身: 入る（狂人系）。銀色の影: 入らない（第三陣営専用）。
 *   - 模倣: できる（NON_MIMICABLE_ROLES に無い。ただし模倣しても対象は決まらず通知も無い）。
 *   - コスプレ: 入らない（cosplayerEligibleRoles に無い）。
 *   - シャッフラー: 山札に入らない（マイクラ版 shufflerEligibleRoles の除外に兎・龍・犬が含まれる。shuffler.js の BLOCKED に追加）。
 *   - ペルソナ: マイクラ版では仮面候補（除外リストに無い）が、Web版はペルソナ未実装のため配線なし。
 * ・封印の対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入る。info.sealTarget）。夜の選択が無いので実効は通知まわりだけ。
 * ・ハッキング: 対象外には入っていない（本物もハッキングされる。対象決定はハッキングより前なので影響なし）。
 *   思い込んだ人には偽の夜表示「○○が警戒して草むらに隠れたようです。」（silver_wolf.js の baseView。
 *   ○○は銀狼側の安定したランダムな相手で、本物の対象は漏らさない。マイクラ版 openSilverWolfFakeNightAction の RABBIT_MADMAN）。
 * ・黄泉: 隠れた状態は人に付く記録で、黄泉の断ち切り対象には入っていない（マイクラ版 yomiCutStates に無い）ので何も起きない。
 * ・乞食: 「取れない対象」に兎の狂人は入っていないので、死んだ兎の狂人は乞食に取れる（隠れた人の記録はそのまま残る）。
 * ・シナジー: マイクラ版に兎の狂人固有のシナジーは無い（干支シナジーはWeb版に確率の仕組みが無いため未実装。鼠・牛・虎と同じ）。
 * ・CO: 結果開示は1人を選んで「○○を草むらに隠しました。」（マイクラ版 main.js の兎CO。嘘もつける）。
 *   隠れた本人は隠れていることを自覚できないので、本人の情報開示「草むらに隠れていました。」は無い（2026-11-28 作者指摘で削除）。
 * ・CPU: 本物は「兎の狂人CO」＋結果開示「○○に警戒心を共有していました。」（cpuClaim。マイクラ版 cpu.js）。
 * ・実績（マイクラ版 stats.js）: win_rabbit_madman「脱兎のごとく」/ zodiac_rabbit_madman「卯年」/
 *   first_rabbit_madman「草むらの住人」。Web版には実績の保存が無いので、判定関数だけ返す
 *   （first_ は履歴判定なので返さない。虎の狂人と同じ流儀）。
 * ・デバッグ: 「能力先」タブのランダム対象指定に「隠れる相手」（debug.randTarget(g, "rabbit", 持ち主ID)）を追加。
 *
 * 状態: g.rabbitHiddenTarget = 隠れた人のID（いなければ null。人に付く記録で、カードには付かない）
 *       g.rabbitNoticeDone = { 通知済みの兎の狂人のID: true }
 *       g.rabbitDayFails = [{ by, targets }]（昼能力が草むらで失敗した記録。消費判定に使う）
 * 呼び出し: 配役 = net.js startGame → ONW.rabbitMadman.assignAll（クローンのあと・ハッキングとバーテンダーより前）。
 *   夜情報 = nightMsg / 酔い覚め = soberLines。夜の失敗 = net.js humanNightPlan・朝の連鎖。昼の失敗 = net.js の各 host 関数。
 *   CPU = cpu.js runNight の候補除外。詳細は docs/rabbit-madman.md。
 */
(function (ONW) {
  const ID = "rabbit_madman";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const FAIL_TEXT = "対象は草むらに隠れていたため失敗しました。";
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"]; // 兎以外の干支狂人

  /** 草むらに隠れた人のID（いなければ null）。ゲーム開始時に1人だけ決まり、試合中は動かない */
  function hiddenOf(g) { return (g && g.rabbitHiddenTarget) || null; }
  function isHidden(g, id) { return !!id && hiddenOf(g) === id; }
  /** 配役時点で兎の狂人だった人（初期役職または最終役職が兎の狂人） */
  function holders(g) {
    return (g.players || []).filter((p) => (g.initialRoles || {})[p.id] === ID || (g.currentRoles || {})[p.id] === ID).map((p) => p.id);
  }
  /** 兎の狂人本人への通知文（隠れた人がいなければ null） */
  function noticeText(g) { const h = hiddenOf(g); return h ? `${nm(g, h)}が警戒して草むらに隠れたようです。` : null; }
  /** 朝の演出データ（草むらの面でめくれる）。mode: "hide"=兎本人の画面で隠れた人のカード / "fail"=能力を使った人の画面で対象のカード */
  function reveal(g, mode) { const h = hiddenOf(g); return h ? { kind: "rabbit", mode, ids: [h] } : null; }

  /**
   * 配役時の一括処理（net.js startGame から、クローンの割り当てのあと・ハッキングより前に呼ぶ。ホストのみ）:
   * 兎の狂人（初期/最終）がいれば、参加者全員（兎自身も含む）からランダムに1人を隠れた人にする。
   * ハッキング・バーテンダーの候補除外が効くよう、どちらよりも先に決める。
   */
  function assignAll(g) {
    if (!g) return;
    g.rabbitHiddenTarget = null; g.rabbitNoticeDone = {}; g.rabbitDayFails = [];
    const hs = holders(g);
    if (!hs.length) return;
    const ids = (g.players || []).map((p) => p.id);
    if (!ids.length) return;
    let t = null;
    if (ONW.debug && ONW.debug.randTarget) {   // デバッグ: 隠れる相手の指定（兎の狂人の持ち主IDで引く）
      for (const h of hs) { const d = ONW.debug.randTarget(g, "rabbit", h); if (d && ids.includes(d)) { t = d; break; } }
    }
    if (!t) t = ONW.utils.shuffle(ids.slice())[0];
    g.rabbitHiddenTarget = t;
    if (Array.isArray(g.nightLogsAll)) g.nightLogsAll.push(`兎の狂人 ${hs.map((h) => nm(g, h)).join("・")} は ${nm(g, t)} を草むらに隠しました。`);
  }

  /**
   * 夜能力の失敗判定（net.js humanNightPlan・朝の連鎖・CPU以外の夜解決から呼ぶ）。
   * 選択した人（selPlayers）に隠れた人が含まれていたら、夜ログを残して true を返す（行動は失敗・消費）。
   * label: 夜ログに出す役職名（マイクラ版のログは能力の役職名で出る）。
   */
  function failIfHidden(g, actorId, selPlayers, label) {
    const h = hiddenOf(g);
    if (!h || !(selPlayers || []).includes(h)) return false;
    if (Array.isArray(g.nightLogsAll)) g.nightLogsAll.push(`${label} ${nm(g, actorId)} は草むらに隠れていた ${nm(g, h)} を選んだため失敗しました。`);
    return true;
  }

  /**
   * 昼能力の失敗ゲート（net.js の各 host 関数が、検証のあと・適用の前に呼ぶ）。
   * 戻り値: 0=そのまま進めてよい / 1=すでに草むらで失敗して消費済み（何もせず戻る） / 2=今回の対象が隠れた人（失敗として記録。本人に FAIL_TEXT を届ける）
   */
  function dayGate(g, id, targets) {
    const h = hiddenOf(g);
    if (!h) return 0;
    if (((g.rabbitDayFails || []).filter((e) => e.by === id)).length) return 1;
    if (!(targets || []).includes(h)) return 0;
    (g.rabbitDayFails = g.rabbitDayFails || []).push({ by: id, targets: (targets || []).slice() });
    return 2;
  }

  /** 結果発表の「役職情報」の行（マイクラ版 vote.js の兎情報） */
  function lines(g, nameOf) {
    const h = hiddenOf(g);
    if (!h) return [];
    return (g.players || []).filter((p) =>
      (g.initialRoles || {})[p.id] === ID || (g.currentRoles || {})[p.id] === ID ||
      (ONW.mimic && ONW.mimic.actRole && ONW.mimic.actRole(g, p.id, (g.initialRoles || {})[p.id]) === ID)
    ).map((p) => ({ text: `${nameOf(p.id)}は${nameOf(h)}に警戒心を共有していました。` }));   // 表示側（ui.js）が「兎の狂人:」を付ける
  }
  const coText = (name) => `${name}を草むらに隠しました。`;
  const coShort = (name) => `→ ${name}`;
  /** 実績（マイクラ版 stats.js と同じ条件。Web版に保存が無いので判定だけ。虎の狂人と同じ流儀） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;   // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    if (won) out.push("win_rabbit_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_rabbit_madman");
    return out;
  }

  const RB = (ONW.rabbitMadman = { hiddenOf, isHidden, holders, noticeText, reveal, assignAll, failIfHidden, dayGate, lines, coText, coShort, achievements, FAIL_TEXT });

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 146, name: "兎の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.6998,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。ゲーム開始時に、参加者の中からランダムな1人（自分も含む）が草むらに隠れます。誰が隠れたかは兎の狂人だけが夜の情報で知ることができ、隠れた本人は気づきません。隠れた人に対して夜能力・昼能力を使うと、その能力は失敗します（複数人を選ぶ能力は、1人でも含まれれば全体が失敗します）。銀狼のハッキングやバーテンダーのカクテルのような自動で決まる対象には、隠れた人は選ばれません。隠れた状態はその人に付いたまま、カードが入れ替わっても動きません。" },
    groups: { mad: 2.999, "transform:dark_avatar": 28 }, // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 111）で決まる
    // 夜の始まり: 本人への通知（対象は配役で確定済み。ここでは読むだけ+朝の草むら演出を予約する）
    //   呼ばれるのは本物・未覚醒でない・ハッキングされていない本人だけ（酔っ払いは net.js が先に返す／思い込みは銀狼の偽表示になる）
    nightMsg(c, p) {
      const g = c.g;
      if (ONW.hack && ONW.hack.isHacked(g, p.id)) return {};   // 銀狼の偽表示を作るときに初期役職を差し替えて呼ばれる経路でも、本物の対象を漏らさない
      if ((g.initialRoles || {})[p.id] !== ID) return {};   // 通知は配役時点の持ち主だけ（模倣・クローン・後から手にした人は対象外）
      const t = noticeText(g);
      if (!t) return {};
      (g.rabbitNoticeDone = g.rabbitNoticeDone || {})[p.id] = true;
      if (g.phase === ONW.PHASE.ONLINE_NIGHT) (g.morningReveals = g.morningReveals || {})[p.id] = reveal(g, "hide");   // 待機時間に、隠れた人のカードが草むらの面でめくれる（本人の画面だけ）
      return { lines: [t] };
    },
    // 酔いが覚めた時点で兎の狂人だった人: 遅れていた通知がその場で届く（マイクラ版は60tick後に再送される）
    soberLines(c, id) {
      const g = c.g;
      if ((g.initialRoles || {})[id] !== ID) return [];   // 配役時点の持ち主だけ（墓荒らしなどで後から手にした人には届かない）
      if ((g.rabbitNoticeDone || {})[id]) return [];
      (g.rabbitNoticeDone = g.rabbitNoticeDone || {})[id] = true;
      if (ONW.hack && ONW.hack.isHacked(g, id)) return [];   // ハッキングされている人には知らせない（マイクラ版: 通知済みにして出さない）
      const t = noticeText(g);
      return t ? [t] : [];
    },
    // CPU: 本物は「兎の狂人CO」＋結果開示（隠れた相手。マイクラ版 cpu.js の文）
    cpuClaim(k, g, p, r, i, c) {
      c.co = ID;
      const h = hiddenOf(g);
      if (h) c.result = { text: `${nm(g, h)}に警戒心を共有していました。`, short: coShort(nm(g, h)), claim: { kind: ID, target: h } };
    },
    // 結果開示（COボタン）: 1人を選んで「○○を草むらに隠しました。」（マイクラ版 main.js の兎CO。嘘もつける）
    coResult: {
      kind: ID, targetLabel: "草むらに隠した相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: ID, target: id }, null, "disclose", coShort(K.nameOf(id))],
    },
    // 朝の演出（stage.js の playMorning / morningDur が reveal.kind === "rabbit" のときに呼ぶ）
    //   mode "hide": 兎の狂人本人の画面。隠れた人のカードが草むらの面でめくれる（草が生い茂る）
    //   mode "fail": 隠れた人に能力を使った人の画面。対象のカードが草むらの面でめくれて揺れる
    stageMorning: {
      kind: "rabbit",
      dur: () => 1500,
      play(r, SK) {
        (r.ids || []).forEach((id, i) => SK.later(() => {
          const k = `p:${id}`;
          SK.show(k, SK.GRASS_MARK, true);
          if (r.mode === "fail") SK.later(() => SK.shake(k), 650);
        }, i * 300));
      },
    },
  });
})(window.ONW);
