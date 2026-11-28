/**
 * 見習いの占い師（マイクラ版 APPRENTICE_SEER を参考）: 村人陣営・夜に占う役職。占い師とほぼ同じだが、
 * 見えるのは対象の役職ではなく「人狼かどうか」だけ。結果は役職の面ではなく、白丸（村人側）か黒丸（人狼側）でめくれる（作者メモ）。
 * ・マイクラ版の説明文: 「夜にプレイヤー1人の初期役職が人狼か、そうでないかを占います。墓地を占うことはできません。呪殺することもできません。」（配布時説明は js/role-desc-mc.js の転記が正）
 * ・占えるのは自分以外のプレイヤー1人だけ。墓地は占えない。妖狐・妖狸を占っても呪殺しない（ONW.foxInspect は呼ばない。マイクラ版 openApprenticeSeerAction も呪殺処理を持たない）。
 * ・判定（マイクラ版 isApprenticeSeerWolfResult）: 対象のその時点の役職（finalRoles ?? initialRoles。Web版は夜の段階順に更新される currentRoles が相当）に対して:
 *     蜃気狼（模倣先が蜃気狼の模倣の人狼も）→ ランダムな偽占い結果役職を引いて、その役職が人狼側かどうかで判定。
 *     ペルソナの仮面をかぶっている人 → 仮面の表示役職で判定（以下のチェーンは表示役職に対して効く）。
 *     ホタル → 人狼ではない / 狂人系 → 昇格した狂人だけ人狼 / 魔法少女 → 闇堕ちした人だけ人狼 /
 *     白狼・お嬢様 → 人狼ではない / 狼憑き → 人狼 / 狐憑き → 人狼ではない /
 *     模倣の人狼 → 模倣先が白狼・忘却の人狼・狐憑き・呪われし者・お嬢様のときだけ人狼ではない（それ以外は人狼。マイクラ版は isWolfSideRole(模倣の人狼) に落ちて true）。
 *     それ以外 → 人狼系・狂人系・闇の化身なら人狼（isWolfSideRole）。
 * ・結果の文（マイクラ版 apprenticeSeerResult）: 「○○ は 人狼でした。」/「○○ は 人狼ではありませんでした。」。情報確認（hold）にもこの文が載る（第6バッチ共通指示）。
 *   夜ログは「見習いの占い師 ○○ は △△ を占い、人狼/人狼ではないという結果を得ました。」（マイクラ版の夜ログどおり）。
 * ・記録: g.apprenticeSeerData[本人] = { targetId, isWolfResult }（マイクラ版 game.apprenticeSeerData と同じ形。実績用）。
 * ・夜の行動順・起きる順は占い師と同じ（night.kind "seer"・order 10、like: "seer"）。選び方はプレイヤー専用に差し替え（stagePick graves: false）。
 * ・朝の連鎖（墓荒らし・ドッペルゲンガー・酔い覚め）でも同じ判定（今の役職を見る）。
 * ・ハッキングされて思い込んだ人（銀狼の偽占い）: 対象ランダム・結果は 1/2 で人狼/人狼ではない（silver_wolf.js の fakeResult。本物の盤面には影響しない。マイクラ版の偽見習い占いと同じ）。
 * ・CPU: 真COは「○○ は人狼でした/人狼ではありませんでした」と開示（cpuClaim。マイクラ版CPUの真申告と同じ）。騙りは対象ランダム・25%で人狼と言う（cpuLie。マイクラ版の騙り見習い占いと同じ）。
 *   自分の占い結果は cpuVoteSee と i.known（人狼結果のときだけ werewolf として記録）で投票判断に使う。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（村人陣営）。闇の化身・銀色の影の対象外。
 *   コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に既に含まれている）。シャッフラーの変化先には入らない（マイクラ版 shufflerEligibleRoles の除外どおり。shuffler.js の BLOCKED に追加）。
 *   ペルソナの仮面候補には入らない（マイクラ版 YAMINABE_PERSONA_INFO_ROLES に無い）。模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い）。
 * ・封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。
 * ・闇鍋シナジー: 詩人・観測の人狼の対象（info.observe = "player"）。カルメンの対象外・黄泉の対象外・鍵師の対象外（マイクラ版の各リストに無い）。
 *   見張り番（LOOKOUT）・鈴の巫女の対象リストにはマイクラ版で入っているが、両役職は第6バッチ後続のため接続はそちらの移植時。
 * 状態: g.apprenticeSeerData = { 本人のID: { targetId, isWolfResult } }（試合ごとに net.startGame が {} に戻す。ホスト引き継ぎのキーにも追加済み）
 */
(function (ONW) {
  const base = ONW.roleDef("seer");
  if (!base) throw new Error("apprentice_seer requires seer");
  const APPW_MARK = "__appwhite";   // stage.js の APPW_MARK と同じ文字列。村人側（白丸）の面
  const APPB_MARK = "__appblack";   // stage.js の APPB_MARK と同じ文字列。人狼側（黒丸）の面

  /** マイクラ版 isWolfSideRole: 人狼系・狂人系・闇の化身 */
  const isWolfSideRole = (r) => !!r && ((ONW.WOLF_KIND || []).includes(r) || (ONW.MAD_KIND || []).includes(r) || r === "dark_avatar");

  /** 見習いの占い判定（マイクラ版 isApprenticeSeerWolfResult）。true = 人狼だった（黒丸） */
  function wolfResult(g, targetId) {
    const role = (g.currentRoles || {})[targetId];
    if (ONW.mirage && ONW.mirage.isMirageCard(g, role, targetId)) return isWolfSideRole(ONW.mirage.seerRole(g));   // 蜃気狼: ランダムな役職を引いて、その役職の陣営で判定
    let baseRole = role;
    const mask = ONW.persona ? ONW.persona.maskOf(g, targetId) : null;
    if (mask) baseRole = ONW.persona.displayedRole(mask);   // ペルソナ: 仮面の表示役職で判定
    if (!baseRole) return false;
    if (baseRole === "hotaru") return false;   // ホタル（変身前）は村人の気配
    if ((ONW.MAD_KIND || []).includes(baseRole)) return (g.promotedWolfIds || []).includes(targetId);   // 狂人系は昇格した人だけ人狼
    if (baseRole === "magical_girl") return (g.mgDarkFallen || []).includes(targetId);   // 魔法少女は闇堕ちした人だけ人狼
    if (baseRole === "white_wolf" || baseRole === "princess") return false;
    if (baseRole === "wolf_marked") return true;
    if (baseRole === "fox_marked") return false;
    if (baseRole === "mimic_wolf") {
      const mr = ONW.mimic ? ONW.mimic.roleOf(g, targetId) : null;
      if (mr && ["white_wolf", "forgetful_wolf", "fox_marked", "cursed_one", "princess"].includes(mr)) return false;
      return true;   // 模倣先が狼夢人・狼憑き・その他のとき（と模倣先が無いとき）は人狼（マイクラ版のフォールスルー）
    }
    return isWolfSideRole(baseRole);
  }

  const record = (g, id, targetId, wolf) => { (g.apprenticeSeerData = g.apprenticeSeerData || {})[id] = { targetId, isWolfResult: wolf }; };
  const resultText = (nameOf, t, wolf) => `${nameOf(t)} は${wolf ? "人狼でした" : "人狼ではありませんでした"}。`;
  const logText = (label, p, nameOf, t, wolf) => `${label} ${p.name} は ${nameOf(t)} を占い、${wolf ? "人狼" : "人狼ではない"}という結果を得ました。`;

  // ---- CPUの夜の行動（プレイヤー1人だけ。墓地は占えない） ----
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const i = n.infoOf(p.id), f = n.forced(p);
    const fp = n.validPlayer(p, f.player) ? f.player : null;
    const t = fp ? g.players.find((q) => q.id === fp) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    const wolf = wolfResult(g, t.id);
    i.mode = "player"; i.target = t.id;
    i.appSeen = i.appSeen || {}; i.appSeen[t.id] = wolf;   // 自分の占い結果（cpuVoteSee が使う）
    if (wolf && i.known[t.id] === undefined) i.known[t.id] = "werewolf";   // 人狼と分かった人は人狼として覚える（感覚の占い師の cpuNotice と同じ扱い）
    record(g, p.id, t.id, wolf);
    g.nightLogsAll.push(logText(label, p, n.nameOf, t.id, wolf));
    n.hold(p.id, resultText(n.nameOf, t.id, wolf));
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  // ---- CPUの発言 ----
  /** 騙り見習い占い: 対象はランダム、結果は25%で人狼と言う（マイクラ版の騙り見習い占いと同じ） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const { fakeSeerTarget, bareCo } = k;
    const t = fakeSeerTarget(g, p);
    if (!t) return { co: bareCo(g, co), result: null };
    const wolf = Math.random() < 0.25;
    return { co, result: { short: `${t.name} → ${wolf ? "人狼" : "人狼ではない"}`, text: `${t.name} は${wolf ? "人狼でした" : "人狼ではありませんでした"}。`, claim: { kind: "apprentice", target: t.id, wolf } } };
  }
  /** 本物の見習いの占い師の発言: 占った結果（人狼だったかどうか）を開示する */
  function cpuClaim(k, g, p, r, i, c) {
    const { nameOf } = k;
    c.co = "apprentice_seer";
    if (i.mode === "player" && i.target && i.appSeen && i.appSeen[i.target] !== undefined) {
      const wolf = i.appSeen[i.target], nm = nameOf(g, i.target);
      c.result = { short: `${nm} → ${wolf ? "人狼" : "人狼ではない"}`, text: `${nm} は${wolf ? "人狼でした" : "人狼ではありませんでした"}。`, claim: { kind: "apprentice", target: i.target, wolf } };
    }
  }

  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === "apprentice_seer" || fin === "apprentice_seer") out.push("first_apprentice_seer");
    if (fin === "apprentice_seer" && won) out.push("win_apprentice_seer");
    if (fin === "apprentice_seer" && !won) out.push("lose_apprentice_seer");
    const d = (g.apprenticeSeerData || {})[id];
    if (d && d.targetId) {
      // 占い師と同じ人を占った（マイクラ版 apprenticeSeerSameTargetAsSeer。Web版は観測ログの「占い師が使われた記録」で判定）
      const seerTargets = new Set((g.observeLog || []).filter((e) => e.role === "seer" && e.from !== id).flatMap((e) => e.players || []));
      if (seerTargets.has(d.targetId)) out.push("apprentice_seer_same_target_as_seer");
      if (d.isWolfResult && ONW.vote.isVoteExiled(g, d.targetId) && won) out.push("apprentice_seer_black_result_exiled");   // 人狼と占った人が追放されて勝利（マイクラ版 isVoteExiledForAchievement 相当。道連れ死は追放に数えない）
    }
    return out;
  }

  ONW.defineRole("apprentice_seer", {
    like: "seer",   // 夜の処理の枠組み（night.kind "seer"・order 10）は占い師の定義を土台にする（結果の出し方に関わる night.resolve / morning.run / cpuNight.run と、選び方・夜画面・CO・発言は下で差し替え）
    info: { observe: "player", sealTarget: true, deck: 159, count: 0, name: "見習いの占い師", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 23.5,
      desc: "村人陣営。プレイヤー1人の初期役職が人狼かどうかを占います。結果は白丸（村人側）か黒丸（人狼側）で分かります。墓地は占えず、呪殺もできません。" },
    groups: { "transform:light_apostle": 36 },   // 光の使徒の変化先（村人系）のみ。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    achievements,
    // 夜の画面: 墓地は占えないのでプレイヤー専用の文にする
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>プレイヤー1人</strong>を押してください。<br>結果は役職ではなく、<strong>白丸（村人側）か黒丸（人狼側）</strong>で分かります。${later}</p>${nowSel("、")}`;
      },
      chainReady: (np, ng) => np === 1,
      chainHow: () => `<strong>プレイヤー1人</strong>を押して`,
    },
    // 結果開示(COボタン)の流れ: 占い先を選ぶ → 「人狼だった / 人狼ではなかった」を選ぶ（墓地は選べない）
    coResult: {
      kind: "apprentice", targetLabel: "占い先", graves: false, roleHint: "の占い結果",
      optionList: () => [{ id: "wolf", label: "人狼だった", team: "wolf" }, { id: "notwolf", label: "人狼ではなかった", team: "village" }],
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} を占いました。結果は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        const wolf = role === "wolf";
        return [`${who} は${wolf ? "人狼でした" : "人狼ではありませんでした"}。`, { kind: "apprentice", target: s.target, wolf }, null, "disclose", `${who} → ${wolf ? "人狼" : "人狼ではない"}`];
      },
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人だけ（墓地は選べない）
    stagePick: { graves: false, exclusive: true },
    cpuLie: { role: "apprentice_seer", weight: 20, order: 3, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    /** 墓荒らし・ドッペルゲンガーで見習いの占い師を手にしたCPUが、続けて言う結果 */
    cpuChainResult(k, g, p, i) {
      const c = {}; if (!(i.mode === "player" && i.target && i.appSeen && i.appSeen[i.target] !== undefined)) return null;
      cpuClaim(k, g, p, "apprentice_seer", i, c); return c.result || null;
    },
    /** CPUの投票判断: 他の人の見習い占い申告と、自分の占い結果を評価に足す（感覚の占い師の cpuVoteSee と同じ形） */
    cpuVoteSee(k, g, p, q, i, me, wolfSide) {
      let s = 0;
      (g.cpuClaims || []).filter((c) => c.kind === "apprentice" && c.target === q.id && c.from !== p.id).forEach((c) => {
        if (c.wolf) s += wolfSide ? 0.8 : 2.8;   // 「人狼だった」と言われた人
        else s += wolfSide ? -0.4 : -1.0;   // 「人狼ではなかった」と言われた人
      });
      if (i && i.appSeen && i.appSeen[q.id] !== undefined) {   // 自分が占った結果には従う
        if (i.appSeen[q.id]) s += 12; else s -= 6;
      }
      return s;
    },
    cpuNight: Object.assign({}, base.cpuNight, { run }),
    night: Object.assign({}, base.night, {
      complete: (np, ng) => np === 1,
      normalize(c, players, graves, sel, id, role) { return { players: players.slice(0, 1), graves: [] }; },   // プレイヤー1人だけ（墓地は選べない）
      // 夜の終わり。対象が人狼かどうかだけが分かり、白丸/黒丸の面でめくれる。呪殺はしない
      resolve(c, p) {
        const g = c.g, rn = c.rn, hold = c.hold, nameOf = c.nameOf, rev = c.rev;
        const sel = c.selOf(p), label = rn(c.eff(p));
        if (sel.players.length === 1) {
          const t = sel.players[0], wolf = wolfResult(g, t);
          record(g, p.id, t, wolf);
          g.nightLogsAll.push(logText(label, p, nameOf, t, wolf));
          hold(p.id, resultText(nameOf, t, wolf));
          rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: wolf ? APPB_MARK : APPW_MARK }] };   // 役職の面ではなく白丸/黒丸でめくれる（作者メモ）
          ONW.observeNote(g, p.id, [t], null, c.eff(p));
          ONW.newsNote(g, c.eff(p));
        }
      },
    }),
    // 朝（墓荒らし・ドッペルで手にした後）・昼（酔い覚め後）に使う占い。今の役職で判定する
    morning: {
      run(c) {
        const g = c.g, nameOf = c.nameOf, me = c.me, label = c.label, players = c.players;
        if (!players.length) return null;
        const t = players[0], wolf = wolfResult(g, t);
        record(g, me.id, t, wolf);
        g.nightLogsAll.push(logText(label, me, nameOf, t, wolf));
        return { lines: [resultText(nameOf, t, wolf)], reveal: { kind: "peek", items: [{ k: `p:${t}`, role: wolf ? APPB_MARK : APPW_MARK }] }, nextChain: null };
      },
    },
  });
  ONW.apprenticeSeer = { wolfResult, APPW_MARK, APPB_MARK };
})(window.ONW);
