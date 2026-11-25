/**
 * 魔法少女（第三陣営・受動）: 昼開始時点で人狼系・狂人系がいなければ闇堕ちして人狼判定になる役職。マイクラ版 MAGICAL_GIRL / Wiki の説明が正。
 *
 * ・昼開始時点（Web版では朝のあとの待機時間の開始 = settlePost）で、最終盤面で魔法少女を持っている人を調べる。
 *   自分以外のプレイヤーの中に、実効役職が人狼系（ONW.WOLF_KIND）・狂人系（ONW.MAD_KIND）の人が1人もいなければ闇堕ちする。
 *   候補が複数いれば、そのうちランダムに1人だけが闇堕ちする（マイクラ版 resolveMagicalGirlDarkFallAtDayStart の randomChoice）。
 *   対象外: 酔いが覚めていない人（覚めた瞬間に再判定する）/ 封印されている人 / すでに死亡している人。
 *   人狼・狂人の有無の走査では、死亡している人は数えない（封印されている人は数える。マイクラ版 magicalGirlHasWolfOrMadAtDayStart）。
 * ・闇堕ちした人は「人狼判定」になり（vote.js の wolfJudgeIds に数える）、人狼陣営として勝利する。
 *   闇堕ちしていない魔法少女は村人陣営として勝利する（勝敗の振り分けは ONW.magicalGirl.teamOf を vote.js が使う）。
 * ・通知と演出（本人だけ）: 待機時間に、本人の画面で自分のカードが黒い背景に赤い「闇落ち」の文字でめくれる
 *   （stageSettle "settleMgDark" / stage.js の面 "__darkfall"。作者メモの演出）。情報確認には「あなたは闇堕ちしました。」が残る。
 *   銀狼にハッキングされている人には通知・演出を出さない（闇堕ち自体はする。マイクラ版 announceMagicalGirlDarkFallNotificationsAtDayStart）。
 *   煙幕のときは settle が quiet で届くので演出は出ないが、文章は情報確認に残る（Web版の待機時間演出の共通の扱い）。
 * ・酔いが覚めた瞬間の再判定（マイクラ版の酔い覚め後の呼び出し）: soberReveal で、覚めた人だけを対象に同じ判定をする。
 *   闇堕ちしたら本人にだけ "mgdarknews" が届き、昼の画面で自分のカードが同じ「闇落ち」の面でめくれて裏に戻る（stageFlash "mgDarkFlash"）。
 * ・感覚の占い師: 闇堕ちしていれば「人狼の気配」、していなければ「村人の気配」（sense_seer.js の classify が見る。マイクラ版 senseSeerMessage）。
 * ・結果発表の役職履歴: 最終役職が魔法少女の人には「(+人狼)」（闇堕ち・赤）/「(+村人)」（闇堕ちしていない・緑）の札が付く（net.js buildResultObj。マイクラ版の結果履歴）。
 *
 * g.mgDarkFallen = [闇堕ちした人のID]（net.startGame が [] に戻す）
 * 呼び出し: net.js の toSettle → settlePost フック（昼開始の判定）/ net.js の soberUp → soberReveal フック（酔い覚めの再判定）。
 * 銀狼ハッキング: 魔法少女はハッキング対象から外れない（マイクラ版の除外はヴァニティ・ホタルのみ。Web版 NO_HACK にも追加しない）。
 *   魔法少女を思い込んだ人は、実効役職が魔法少女ではないので闇堕ちしない（COは通常の魔法少女COとしてできる）。
 * シナジー: マイクラ版に魔法少女をトリガーとする闇鍋シナジーは無いので、ONW.SYNERGY_RULES への追加はなし。
 * 乞食: 闇堕ちした魔法少女だけが乞食に取れない（マイクラ版準拠）。当初 Web版の乞食は魔法少女を一律に取れない対象に含めていたが、
 *   2026-11-25 に作者が「マイクラ版に揃えて乞食側を直す」と決定し、beggar.js 側で修正済み（闇堕ちしていない魔法少女は取れる）。詳細は docs/magical-girl.md。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const ID = "magical_girl";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  /** 最終盤面での実効役職（模倣の人狼の模倣を解決したもの。マイクラ版 roleForMimicEffect 相当） */
  const eff = (g, id) => (ONW.mimic && ONW.mimic.eff ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const NOTICE = "あなたは闇堕ちしました。";

  /** 最終盤面で魔法少女を持っている人（模倣の人狼が魔法少女を模倣している場合も含む。マイクラ版は roleForMimicEffect === MAGICAL_GIRL で見る） */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => eff(g, id) === ID);
  /** 闇堕ちしているか（最終盤面で魔法少女を持っていて、闇堕ち記録にいる人だけ） */
  const isDark = (g, id) => !!g && eff(g, id) === ID && ((g.mgDarkFallen || []).includes(id));
  /**
   * 勝敗の振り分けで使う陣営（vote.js の基本勝敗・道化の狂人・王国滅亡・神降臨の村人/人狼フィルタが使う）。
   * 魔法少女を持っている人: 闇堕ち → 人狼陣営 / 闇堕ちしていない → 村人陣営。それ以外の人はカードの陣営そのまま。
   */
  function teamOf(g, id) {
    if (eff(g, id) === ID) return isDark(g, id) ? ONW.TEAM.WOLF : ONW.TEAM.VILLAGE;
    return ONW.roles.getInfo((g.currentRoles || {})[id]).team;
  }
  /**
   * 自分以外のプレイヤーの中に、人狼系・狂人系がいるか（実効役職で見る。マイクラ版 magicalGirlHasWolfOrMadAtDayStart）。
   * 死亡している人は数えない。封印されている人・酔いが覚めていない人は数える（マイクラ版は最終役職で見るため）。
   */
  function hasWolfOrMad(g, selfId) {
    return (g.players || []).some((p) => {
      if (p.id === selfId || isDead(g, p.id)) return false;
      const r = eff(g, p.id);
      return (ONW.WOLF_KIND || []).includes(r) || (ONW.MAD_KIND || []).includes(r);
    });
  }
  /**
   * 闇堕ちの判定（マイクラ版 resolveMagicalGirlDarkFallAtDayStart）。eligibleIds を渡すと、その人たちだけが候補になる（酔い覚め用）。
   * 候補: 魔法少女を持っていて、酔いが覚めていて、封印されておらず、死亡しておらず、まだ闇堕ちしておらず、
   * 自分以外の人狼系・狂人系がいない人。その中からランダムに1人だけが闇堕ちする。
   * 戻り値: 今回新しく闇堕ちした人のID配列（0人か1人）
   */
  function resolveDarkFall(g, eligibleIds) {
    if (!g || !g.players || !g.currentRoles) return [];
    g.mgDarkFallen = g.mgDarkFallen || [];
    const elig = Array.isArray(eligibleIds) ? new Set(eligibleIds) : null;
    const cands = holders(g).filter((id) =>
      (!elig || elig.has(id)) &&
      !ONW.hiddenDrunk(g, id) &&
      !(ONW.seal && ONW.seal.is(g, id)) &&
      !isDead(g, id) &&
      !g.mgDarkFallen.includes(id) &&
      !hasWolfOrMad(g, id));
    if (!cands.length) return [];
    const picked = cands[Math.floor(Math.random() * cands.length)];
    g.mgDarkFallen.push(picked);
    return [picked];
  }
  /** 本人への通知文（マイクラ版の「魔法少女通知」の文面） */
  const noticeText = () => NOTICE;

  /**
   * 実績（wiki-data.js の「魔法少女」に定義済みの5つ）。Web版にはまだ実績を保存する仕組みが無いので、
   * 「この試合で id が満たした実績ID」を返すだけ（ヴァニティ・乞食などと同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], r = R();
    if (g.initialRoles && (g.initialRoles[id] === r.MAGICAL_GIRL || (g.currentRoles || {})[id] === r.MAGICAL_GIRL)) out.push("first_magical_girl");   // 初めて魔法少女になる
    if (eff(g, id) === ID) {
      const dark = isDark(g, id);
      if (dark && won) out.push("magical_girl_dark_win");          // 闇堕ちして勝利する
      if (dark && !won) out.push("magical_girl_dark_loss");        // 闇堕ちして敗北する
      if (!dark && won) out.push("magical_girl_village_win");      // 闇堕ちせずに勝利する
      if (!dark && !won) out.push("magical_girl_village_loss");    // 闇堕ちせずに敗北する
    }
    return out;
  }

  ONW.magicalGirl = { holders, isDark, teamOf, hasWolfOrMad, resolveDarkFall, noticeText, achievements };

  ONW.defineRole("magical_girl", {
    info: { sealTarget: true, deck: 121, name: "魔法少女", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 49,
      desc: "第三陣営。夜の能力はありません。昼開始時点で、自分以外のプレイヤーの中に人狼系・狂人系が1人もいない場合は闇堕ちして人狼判定になり、人狼陣営として勝利します（魔法少女が複数いる場合は、そのうち1人だけが闇堕ちします）。人狼系・狂人系がいる場合は闇堕ちせず、村人陣営として勝利します。闇堕ちしたときは、待機時間に自分のカードが黒い背景に赤い「闇落ち」の文字でめくれて知らされます。酔っ払いで重なっていた場合は、酔いが覚めた時点で改めて判定されます。最終的に魔法少女を持っている人が対象です。" },
    groups: { "transform:silver_shadow": 25 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる）

    // 昼開始の闇堕ち判定（待機時間の開始 = settlePost。模倣の人狼の模倣先が確定したあとに、最終盤面の実効役職で判定する）
    settlePost(c) { resolveDarkFall(c.g); },

    // 本人への通知と演出の材料（待機時間）。闇堕ちした本人にだけ、情報確認の文と「自分のカードがめくれる」ための印を返す。
    // 銀狼にハッキングされている人には出さない（マイクラ版の通知スキップ）。再入室（resync）でも同じ内容を返し、演出は quiet で抑えられる
    settleMsg(c, p, mode) {
      const g = c.g;
      if (!isDark(g, p.id)) return {};
      if (ONW.hack && ONW.hack.isHacked(g, p.id)) return {};
      return { logs: [NOTICE], mgDark: [p.id] };
    },

    // 待機時間の演出（stage.js の stageSettle が g.settleMgDark を受け取って呼ぶ。本人の画面にしか届かない）:
    // 自分のカードが、黒い背景に赤い「闇落ち」の文字の面（stage.js の "__darkfall"）でめくれる。昼になったら裏に戻る（スター公開と同じ仕組み）
    stageSettle: {
      field: "settleMgDark", shown: "settleMgDarkShown",
      run: { order: 20, run(ids, SK) { SK.later(() => { ids.forEach((id) => SK.show(`p:${id}`, SK.DARKFALL_MARK)); }, 300); } },
    },

    // 酔いが覚めた瞬間の再判定（マイクラ版の酔い覚め後の呼び出し）: 覚めた人だけを対象に判定し、闇堕ちしたら本人にだけ知らせる
    soberReveal: { order: 50, run(c, ids) {
      const g = c.g;
      resolveDarkFall(g, ids).forEach((id) => {
        if (ONW.hack && ONW.hack.isHacked(g, id)) return;   // ハッキングされている人には通知しない（闇堕ち自体はしている）
        c.send(id, { t: "mgdarknews", text: NOTICE });
      });
    } },

    // 酔い覚めで闇堕ちしたときの演出（stage.js の flashes("late") が g.mgDarkFlash を渡す。本人だけに届く "mgdarknews" で積まれる）:
    // 自分のカードが「闇落ち」の面でめくれ、数秒後に裏に戻る（ヴァニティの気づき演出と同じ仕組み）
    stageFlash: {
      field: "mgDarkFlash", when: "late",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = SK.DARKFALL_MARK; SK.glow[k] = true;
          SK.paint(SK.G());
        }, 200 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 200 + list.length * 380 + 3200);
      },
    },

    // 人間のCO: 魔法少女COのあとの結果開示は「闇落ちしていません / 闇落ちしています」の2択（マイクラ版のCOフォーム。co.js の kind "mgdark"）
    coResult: {
      kind: "mgdark",
      pickDark(dark, K) {
        return { args: [dark ? "闇落ちしています。" : "闇落ちしていません。", { kind: "magical_girl", dark: !!dark }, null, "disclose", dark ? "闇落ちしている" : "闇落ちしていない"] };
      },
    },

    // CPU（マイクラ版 cpu.js の魔法少女）: 闇堕ちしていなければ必ず魔法少女CO + 結果開示「闇落ちしていません。」。
    // 闇堕ちしている場合は半分は同じ（闇堕ちしていないふり）、半分は通常の第三陣営の騙り（村人を騙る。false を返して通常処理へ）
    cpuClaim(k, g, p, r, i, c) {
      if (!isDark(g, p.id) || Math.random() < 0.5) {
        c.co = ID;
        c.result = { text: "闇落ちしていません。", short: "闇落ちしていません", claim: { kind: "magical_girl", dark: false } };
        return;
      }
      return false;
    },
  });
})(window.ONW);
