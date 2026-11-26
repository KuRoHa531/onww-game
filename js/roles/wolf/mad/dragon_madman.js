/**
 * 龍の狂人（dragon_madman）: 人狼陣営・干支狂人（wiki order 112 / deck 147 / ルールコード ONW120）。
 * 受動役職で、自分の夜・昼アクションは無い。他人の能力が「実際に」自分に向けられた瞬間、その記録が残る。
 *
 * マイクラ版（scripts/night.js の markWatcherTouchedByAbility / main.js の markWatcherTouchedByDayAbility）準拠の仕様:
 *   - 対象側の条件: 能力が向けられた席の「実効役職」（模倣・クローン込み）が龍の狂人のときだけ記録される。
 *     ただし、その席が封印されている・銀狼にハッキングされている・酔っ払いで未開示のあいだは記録されない。
 *     封印そのもの（封印の狂人/エルフリンデが龍を封印するタッチ）は記録される（封印が付く前の判定。Web版は
 *     ONW.seal.of(target) === 封印した本人 のときだけ封印チェックを素通しして再現する）。
 *   - 行為者側: 記録される役職は行為者の実効役職（模倣の人狼なら模倣先・クローンなら思い込み先。
 *     どちらでもなければ初期役職→村人の順でフォールバック=マイクラ版 actorRoleForWatcherTouched と同じ）。
 *   - 変化役（怪盗・いたずらっ子・グレムリン・シャッフラー・マティアス・ドッペルゲンガー）は、鍵師のロックを
 *     通過したあと・役職が実際に変わる「前」に、変化前の役職で判定して記録する（マイクラ版 markWatcher の呼び出し位置）。
 *     静観者で能力がずれた場合は、実際に効いた席で判定する（静観者のルール。ONW.dragonMadman.before が担う）。
 *   - 兎の狂人の草むらで失敗した能力は記録されない（能力が届いていない。失敗経路は observeNote を通らない）。
 *   - ハッキング思い込みの偽の能力・偽の昼能力は記録されない（本物の能力だけ。銀狼ファイルに龍の偽分岐は無い
 *     =マイクラ版にも無い。本物の龍がハッキングされているあいだは上の条件で記録されない）。
 *
 * Web版の配線:
 *   - 夜・朝の連鎖・昼能力のタッチはすべて ONW.watcher.touch（観測の共通入口）から noteTouch が受ける
 *     （モーゼスと同じ場所。昼能力もマイクラ版どおり対象）。
 *   - 変化役の「前判定」は ONW.moses.before と並べて各変化役ファイルから before を呼ぶ。
 *   - 演出（作者メモ「待機時間に、自身に能力を使ってきた人のカードがめくれる」）: 夜のタッチは待機時間に
 *     龍本人の画面でだけ、使ってきた人のカードが「使ってきた役職の面」でめくれる（stageMorning kind "dragon"。
 *     本人の別の朝演出がある席では、その演出のあとに付け足す形 r.dragon でも出す）。あわせてマイクラ版の
 *     即時通知「逆鱗通知」と同じ文を、龍本人の夜の結果文（情報確認）にも残す。
 *     昼能力のタッチは即時演出の送り先が無いため、記録と結果情報のみ（兎の狂人の昼失敗が文章のみなのと同じ流儀）。
 *   - 結果情報: 「{役職名}{名前}は{龍の名前}の逆鱗に触れていました。」（マイクラ版 vote.js の干支狂人情報と同じ文）。
 *   - 結果開示(CO): 役職を選ぶ → 自分以外の参加者を選ぶ →「{対象}の{役職}に能力を使われました。」（詩人と同じ2段。嘘も言える）。
 *   - CPU: 記録があるCPU龍は結果開示で実記録を言う（マイクラ版 claimDragonMadmanResult）。無ければ通常の扱い（false）。
 *   - 変化候補: 闇の化身○ / 光の使徒× / 銀色の影× / コスプレ×（村人陣営のみ）/ 模倣○ / シャッフラー山札×
 *     （マイクラ版 shufflerEligibleRoles のブロック対象=兎・龍・犬）/ ペルソナはWeb未実装。
 *   - 封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES には龍は入っていないが、2026-11-25 の作者決定
 *     「龍封印対象でいい」で封印対象に変更。info.sealTarget: true）。封印されている間は、封印そのものの
 *     タッチを除き、使われた能力は記録されない（作者指示「龍が封印されて以降に使われた能力は記録しない」。
 *     対象側の条件の封印チェックがそのまま効く）。乞食は取れる。黄泉に切られる龍固有の状態は無い（記録は履歴なので残る）。
 *   - 実績: win_dragon_madman / zodiac_dragon_madman（first_dragon_madman は履歴判定なので先行移植どおり返さない）。
 */
(function (ONW) {
  const ID = "dragon_madman";
  const rn = (r) => (ONW.ROLE_INFO[r] || {}).name || r;
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
  const actRoleOf = (g, id) => (ONW.mimic && ONW.mimic.actRole ? ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]) : (g.currentRoles || {})[id]);
  const isDragon = (g, id) => actRoleOf(g, id) === ID;
  const holders = (g) => (g.players || []).filter((p) => isDragon(g, p.id)).map((p) => p.id);
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"]; // 龍以外の干支狂人

  /** 行為者の「使ってきた役職」: 実効役職（模倣先・思い込み先）→ 初期役職 → 村人（マイクラ版 actorRoleForWatcherTouched） */
  function actorRoleOf(g, actor) {
    return actRoleOf(g, actor) || (g.initialRoles || {})[actor] || "villager";
  }
  /** 対象側の記録条件（マイクラ版 markWatcher の対象側チェック）: 龍である・封印されていない・ハッキングされていない・酔い未開示でない。
   *  封印そのもののタッチ（封印した本人が行為者で、封印元がその本人）だけは、封印が付く前の判定として素通しする */
  function touchable(g, actor, t) {
    if (!isDragon(g, t)) return false;
    if (ONW.seal && ONW.seal.is(g, t)) {
      const bySeal = (actRoleOf(g, actor) === "seal_madman" || actRoleOf(g, actor) === "elfrinde") && ONW.seal.of(g, t) === actor;
      if (!bySeal) return false;
    }
    if (ONW.hack && ONW.hack.isHacked(g, t)) return false;
    if (g.drunkOverlay && g.drunkOverlay[t] && !(g.drunkRevealed && g.drunkRevealed[t])) return false;
    return true;
  }
  /** 記録の本体: ログに積み、夜のあいだは待機時間の演出（龍本人の画面だけ）と即時通知文を用意する */
  function record(g, actor, target, role) {
    (g.dragonTouchedLog = g.dragonTouchedLog || []).push({ actor, target, role });
    if (!g.nightResolved) {
      const rev = (g.morningReveals = g.morningReveals || {}), cur = rev[target], ent = { actor, role };
      if (cur && cur.kind === "dragon") cur.entries.push(ent);
      else if (cur) (cur.dragon = cur.dragon || []).push(ent);   // 本人の別の朝演出がある席: その演出のあとに付け足して出す（stage.js playMorning）
      else rev[target] = { kind: "dragon", entries: [ent] };
      (g.nightResults = g.nightResults || {})[target] = (g.nightResults[target] || []);
      g.nightResults[target].push(`${rn(role)}の${nm(g, actor)}があなたの逆鱗に触れました。`);   // マイクラ版の即時通知「逆鱗通知」と同じ文
    }
  }
  /**
   * 能力が実際に届いたときの記録（ONW.watcher.touch から呼ばれる。夜・朝の連鎖・昼能力の共通入口）。
   * targets は「使った人が選んだ席」のことがあるので、変化役が before で先に記録した分は dragonTok の印で二重に数えない。
   */
  function noteTouch(g, actor, targets) {
    if (!g || !actor || !targets || !targets.length) return;
    (targets || []).forEach((t) => {
      if (!t || t === "grave" || !(g.players || []).some((p) => p.id === t)) return;
      const tok = `${actor}|${t}`;
      if ((g.dragonTok || []).includes(tok)) { g.dragonTok = g.dragonTok.filter((x) => x !== tok); return; }   // before で記録済み
      if (!touchable(g, actor, t)) return;
      record(g, actor, t, actorRoleOf(g, actor));
    });
  }
  /**
   * 変化役の「前判定」（ONW.moses.before と並べて呼ぶ）: 役職が変わる前に、実際に効く席(actual)で判定して記録し、
   * あとから observeNote 経由で来る noteTouch（選んだ席 seen で来る）を二重に数えないよう印を付ける。
   */
  function before(g, actor, actualTargets, seenTargets) {
    if (!g || !actor) return;
    (actualTargets || []).forEach((t) => { if (t && touchable(g, actor, t)) record(g, actor, t, actorRoleOf(g, actor)); });
    (seenTargets || []).forEach((s) => { if (s) (g.dragonTok = g.dragonTok || []).push(`${actor}|${s}`); });
  }
  /** 結果情報の行（マイクラ版 vote.js の干支狂人情報）: 「{役職名}{名前}は{龍の名前}の逆鱗に触れていました。」 */
  function lines(g, nameOf) {
    const nf = nameOf || ((id) => nm(g, id));
    return (g.dragonTouchedLog || []).map((e) => ({ text: `${rn(e.role)}${nf(e.actor)}は${nf(e.target)}の逆鱗に触れていました。` }));
  }
  /** 実績（wiki-data.js の「龍の狂人」に定義済み。履歴判定の first_dragon_madman は返さない=先行移植と同じ） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;   // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    if (won) out.push("win_dragon_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_dragon_madman");
    return out;
  }

  ONW.dragonMadman = { noteTouch, before, lines, holders, isDragon, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 147, name: "龍の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.6999,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。他のプレイヤーが夜能力または昼能力をあなたに使うと、その瞬間に「誰の・どの役職の能力が自分の逆鱗に触れたか」が分かります（待機時間に、使ってきた人のカードがその役職の姿でめくれて見えます）。封印されている間・ハッキングされている間・酔っ払いで正体が伏せられている間は分かりません。草むら（兎の狂人）で失敗した能力や、ハッキングの思い込みによる偽の能力では分かりません。" },
    groups: { mad: 3, "transform:dark_avatar": 29 },   // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 112）で決まる
    // 待機時間の演出（龍本人の画面だけ）: 能力を使ってきた人のカードが、使ってきた役職の面で順にめくれる
    stageMorning: {
      kind: "dragon",
      dur: (r) => ((r.entries || []).length - 1) * 450 + 1300,
      play(r, SK) {
        (r.entries || []).forEach((e, i) => SK.later(() => SK.show(`p:${e.actor}`, e.role, true), i * 450));
      },
    },
    // 結果開示(COボタン)の流れ（co.js が kind で引く）: 使われた役職を選ぶ → 自分以外の参加者を選ぶ（マイクラ版の「○○の△△に能力を使われました。」嘘も言える）
    coResult: {
      kind: "dragon",
      coText: (role, names) => `${names[0]}の${rn(role)}に能力を使われました。`,
    },
    /** CPU（マイクラ版 cpu.js の claimDragonMadmanResult）: 逆鱗の記録があれば結果開示でそのまま言う。無ければ通常の扱い（false） */
    cpuClaim(k, g, p, r, i, c) {
      const rows = (g.dragonTouchedLog || []).filter((e) => e.target === p.id);
      if (!rows.length) return false;
      c.co = ID;
      const text = rows.map((e) => `${rn(e.role)}の${nm(g, e.actor)}`).join("、") + "が逆鱗に触れていました。";
      c.result = { short: `逆鱗: ${rn(rows[0].role)}`, text, claim: { kind: "dragon", role: rows[0].role, target: rows[0].actor } };
    },
  });
})(window.ONW);
