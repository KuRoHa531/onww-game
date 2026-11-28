/**
 * 乞食（第三陣営・受動）: 最初に死亡したプレイヤーの役職を盗む（交換する）役職。マイクラ版 BEGGAR / Wiki の説明が正。
 *
 * ・誰かが死亡したとき、生存している乞食は（1回だけ）その死者の役職と自分の役職（乞食）を交換する。
 *   交換した相手（死者）は村人になる。乞食は取った役職の人として、そのままその役職の勝敗で判定される。
 * ・取れない役職（生存または死亡が勝利条件に含まれる役職・本物の人狼・妖狐など。EXCLUDED_ROLES と構造的な除外）はスルーする。
 * ・魔法少女は、闇堕ちしている場合のみ取れない（マイクラ版 isBeggarSwapExcludedTarget が magicalGirlDarkFallenIds にいる人だけを
 *   対象外にしているのと同じ。2026-11-25 の作者決定で乞食側をマイクラ版に合わせて修正）。闇堕ちの判定は昼開始時点
 *   （Web版では待機時間の開始）なので、朝の即時交換の時点ではまだ誰も闇堕ちしておらず、夜に死んだ魔法少女は取れる。
 *   昼開始後に闇堕ちした魔法少女が昼中・投票で死亡した場合は取れない。
 * ・交換の試行は1回だけ（失敗しても消費する。マイクラ版 beggarUsedIds）。
 * ・昼中に死んだ人からは、その場で交換する（即時交換）。投票で死んだ人からは、投票の解決中（連鎖が確定したあと・猫の解決より前）に交換する。
 * ・乞食のまま死亡した場合は追加勝利する。ただし保安官・ヴァニティの執行（死因 "shot"）や道化の爆弾魔の爆殺で死んだ場合は勝てない
 *   （マイクラ版 beggarDeathBlocksWin: 死因 sheriff / sheriff_failure / bomb、または爆弾魔自身の自爆）。
 *
 * g.beggarResults = [{ by, target, role, when } | { by, target?, failed, when }]（試行した順。net.startGame が [] に戻す）
 *   when: "day"（昼中・朝の即時交換）| "vote"（投票の解決中の交換）
 *   failed: "sealed"（封印されていた）| "self_locked"（自分の役職が鍵師にロックされていた）| "no_target"（交換できる死亡者がいなかった）
 *         | "aa_blocked"（対象が A.A. の力で守られていた。即時交換のみ）| "target_locked"（対象の役職がロックされていた）| "dead"（投票の時点で乞食自身が死亡していた）
 * g.beggarUsedIds = [試行済みの乞食のID] / g.beggarUsedTargets = [取られた人のID]
 * 呼び出し: net.js の killPlayer（昼中の死亡）/ toMorning（朝の死亡）→ ONW.beggar.resolveDay、vote.js の determineWinnersCoreBase → ONW.beggar.resolveVote。
 * 交換の通知は本人だけに届く "beggarnews"（情報確認に載る）。昼の即時交換は、本人の画面でだけ死亡者のカードが取った役職でめくれて
 * 乞食の席に置かれる演出（stageFlash "beggarFlash"）。投票の交換は結果発表で全員に開示され、カードが乞食の席へ移動する演出が出る（stageResult）。
 * 勝敗: vote.js の set() が ONW.beggar.staysBeggarWin を見て「乞食のまま死んだ人」を追加勝利に足す。
 * 銀狼ハッキング: 乞食はハッキング対象から外れない（マイクラ版 assignSilverWolfHackFromSource の除外はヴァニティ・ホタルのみ）。
 *   思い込みは「人」につくので、交換しても思い込みは移らない。乞食を思い込んだ人には能動能力が無いため、偽の昼能力フローは無い
 *   （スワップ判定はすべて最終役職ベースなので、思い込んだだけの人は乞食として扱われない）。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const ID = "beggar";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  /** 最終盤面での実効役職（模倣の人狼の模倣を解決したもの。マイクラ版 roleForMimicEffect 相当） */
  const eff = (g, id) => (ONW.mimic && ONW.mimic.eff ? ONW.mimic.eff(g, id) : (g.currentRoles || {})[id]);
  const roleName = (r) => ((ONW.ROLE_INFO || {})[r] || {}).name || "?";
  const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

  /** 最終盤面で乞食を持っている人（模倣の人狼が乞食を模倣している場合も含む。マイクラ版は finalRoles === BEGGAR で見る） */
  const holders = (g) => (g.players || []).map((p) => p.id).filter((id) => eff(g, id) === ID);

  /**
   * 取れない役職（マイクラ版 isBeggarSwapExcludedTarget の明示リスト。即時版と投票版の和集合）。
   * 生存または死亡が勝利条件に含まれる役職が中心。Web版にまだ無い役職（detective_ghost 等）も、入ったときに自動で効くよう含めてある。
   * 魔法少女はマイクラ版の明示リストには無く、「闇堕ちした人だけ」が別枠で対象外になる（excludedTarget で判定する）。
   */
  const EXCLUDED_ROLES = [
    "opportunist", "tanner", "love_tanner", "matthias", "daughter", "pure_lover", "evil_woman",
    "bounty_hunter", "detective_ghost", "yokai_tanuki", "beggar", "long_night_moon", "watcher",
    "lawyer", "jester_bomber", "jester_ghost", "god", "shuffler", "martyr", "demon_duke",
    "fox", "tenacious_madman", "jester_madman",
  ];
  /** その人（死者）の役職が取れるか。マイクラ版 isBeggarSwapExcludedTarget: 実効役職で判定する */
  function excludedTarget(g, targetId) {
    const r = eff(g, targetId);
    if (!r) return true;
    if (EXCLUDED_ROLES.includes(r)) return true;
    if (r === "magical_girl" && ONW.magicalGirl && ONW.magicalGirl.isDark(g, targetId)) return true;   // 魔法少女は闇堕ちしている場合のみ取れない（マイクラ版: magicalGirlDarkFallenIds にいる人だけ除外。闇堕ち判定は昼開始時点なので、朝の即時交換では未確定＝取れる）
    if ((ONW.WOLF_KIND || []).includes(r)) return true;                       // 本物の人狼の役職は取れない
    if ((g.promotedWolfIds || []).includes(targetId)) return true;           // 昇格して人狼になった人も取れない
    if (ONW.isLover && ONW.isLover(g, targetId)) return true;                // 恋人になっている人は取れない
    const card = ONW.cardAt ? ONW.cardAt(g, targetId) : null;                // シャッフラーの印が付いたカードの人は取れない
    const mk = card ? (g.shufflerMarks || {})[card] : null;
    if (mk && (!Array.isArray(mk) || mk.length)) return true;
    return false;
  }

  /** 役職に紐づくデータ（ONW.ROLE_BOUND_KEYS）と猫の固定・参照を、取られた人から乞食へ移す（マイクラ版 transferImmediateBeggarData / transferBeggarLinkedData 相当） */
  function transferData(g, fromId, toId) {
    // エルフリンデの記録（封印した相手・侵食・黄泉の敗北）は移さない（マイクラ版 transferImmediateBeggarData にエルフリンデの記録が無い。取った乞食は記録なしのエルフリンデとして判定される）
    const keys = [...(ONW.ROLE_BOUND_KEYS || []), "sheriffCatFix", "sheriffCatTeam", "catSources", "catInfo", "catBitePick"].filter((k) => !["elfrindeTarget", "elfrindeTargetTeam", "elfrindeCorrupted", "elfrindeCutByYomi"].includes(k));
    keys.forEach((k) => {
      const m = g[k];
      if (m && typeof m === "object" && fromId in m) { m[toId] = m[fromId]; delete m[fromId]; }
    });
  }

  /** 交換を実行する（currentRoles の書き換えとデータ移転）。戻り値: 記録した結果 */
  function doSwap(g, beggarId, targetId, when) {
    const role = (g.currentRoles || {})[targetId];
    const prevByRole = (g.currentRoles || {})[beggarId];   // 交換前に乞食の席にあった役職（通常は乞食。模倣の人狼が乞食を模倣していた場合は模倣の人狼）。結果発表で「演出前に交換前の姿でめくる」ために記録する
    transferData(g, targetId, beggarId);
    g.currentRoles[targetId] = R().VILLAGER;
    g.currentRoles[beggarId] = role;
    if (ONW.magician) ONW.magician.trySteal(g, beggarId, role, "beggar", when === "vote" ? "vote" : "auto");   // 魔法使い: 乞食の交換も「自分の役職を変えた」ので、取った役職を奪われる（乞食は村人になる。交換の記録・通知文は取った役職のまま=マイクラ版どおり。docs/magician.md）
    (g.beggarUsedTargets = g.beggarUsedTargets || []).push(targetId);
    const e = { by: beggarId, target: targetId, role, when, prevByRole };
    (g.beggarResults = g.beggarResults || []).push(e);
    return e;
  }

  /**
   * 交換の試行（1回ぶん。試行した時点で消費する）。candidates は優先順の死者のID列。
   * voteMode: 投票版は A.A. のブロックが効かず、対象のロックだけを見る（マイクラ版 resolveBeggarSwaps）。
   * 即時版は A.A.（ロックされていない A.A.）が対象だと "aa_blocked" で失敗する（マイクラ版 runImmediateBeggarSwaps）。
   */
  function trySwap(g, beggarId, candidates, when, voteMode) {
    g.beggarResults = g.beggarResults || []; g.beggarUsedIds = g.beggarUsedIds || []; g.beggarUsedTargets = g.beggarUsedTargets || [];
    g.beggarUsedIds.push(beggarId);
    const fail = (failed, target) => { const e = { by: beggarId, failed, when }; if (target) e.target = target; g.beggarResults.push(e); return e; };
    if (ONW.seal && ONW.seal.is(g, beggarId)) return fail("sealed");
    if (ONW.keymaster && ONW.keymaster.locked(g, beggarId)) return fail("self_locked");
    const target = (candidates || []).find((t) => t !== beggarId && !g.beggarUsedTargets.includes(t) && !excludedTarget(g, t));
    if (!target) return fail("no_target");
    if (!voteMode && ONW.keymaster && ONW.keymaster.aaBlocks(g, target)) return fail("aa_blocked", target);
    const lockedT = ONW.keymaster ? (voteMode ? ONW.keymaster.locked(g, target) : ONW.keymaster.lockBlocked(g, target)) : false;
    if (lockedT) return fail("target_locked", target);
    return doSwap(g, beggarId, target, when);
  }

  /**
   * 即時交換（昼中に死んだ人・朝に死んだ人が対象。マイクラ版 runImmediateBeggarSwaps）。
   * sourceIds: 今回死んだ人のID（順序がそのまま候補の優先順）。生存していて未試行の乞食が、ランダムな順に1回ずつ試行する。
   * 戻り値: 今回記録した結果の配列（net.js が本人への通知に使う）
   */
  function resolveDay(g, sourceIds) {
    const out = [];
    if (!g || !g.players || !g.currentRoles) return out;
    const src = [...new Set((sourceIds || []).filter((id) => id && isDead(g, id)))];
    if (!src.length) return out;
    const before = (g.beggarResults || []).length;
    shuffle(holders(g).filter((id) => !isDead(g, id) && !((g.beggarUsedIds || []).includes(id))))
      .forEach((b) => { trySwap(g, b, src, "day", false); });
    return (g.beggarResults || []).slice(before);
  }

  /** 投票で死んだ人の死因（候補グループ分け用。マイクラ版 beggarDeathCandidateGroups の死因に対応させる） */
  function deathReason(g, id, executedSet) {
    if ((g.foxCursed || []).includes(id)) return "curse";
    if ((g.curseKillIds || []).includes(id)) return "curse_kill";   // 呪術の人狼の呪殺: マイクラ版 beggarDeathCandidateGroups のグループ分けでは、どの候補グループにも入らない（取れない）
    if (g.dictator && (g.dictator.chosen || g.dictator.target) === id && executedSet.has(id)) return g.dictator.coup ? "coup" : "dictator";
    const dk = (g.deadKind || {})[id];
    if (dk === "fox" || dk === "foxvote") return "curse";
    if (dk === "shot") return "sheriff";
    if (dk === "follow" || dk === "cupid" || dk === "fanatic" || dk === "thread") return "follow";   // 糸紡ぎの後追いも「後追い」グループ（マイクラ版 markThreadPairFollowDeath の scheduleImmediateBeggarSwaps と同じ）
    if (dk === "dead") return "daytime";   // その他の昼中の死亡（即時交換の対象だった人。投票の時点で残っていれば最優先グループ）
    if (dk) return dk;   // tomo / bite / bomb / lovers / queen など（グループに無い死因は候補にならない）
    const ck = (g.chainKind || {})[id];
    if (ck === "bite") return "watchdog";
    if (ck === "follow" || ck === "lovers" || ck === "love" || ck === "cupid" || ck === "fanatic" || ck === "thread") return "follow";
    if (ck) return ck;   // bomb / tomo / queen など
    if ((g.mentalIds || []).includes(id)) return "mental";
    if ((g.shockIds || []).includes(id)) return "shock";
    if ((g.servantSubs || []).some((x) => x.servant === id)) return "servant";
    if ((g.toughBounces || []).some((t) => (t.to || []).includes(id))) return "tough_substitute";
    if (executedSet.has(id)) return "execute";
    if ((g.deadIds || []).includes(id)) return "daytime";   // 死因の記録が無い昼中の死亡も、昼の死として扱う
    return null;
  }
  const GROUP_OF = (reason) =>
    ["curse", "sheriff", "sheriff_failure", "dictator", "coup", "daytime"].includes(reason) ? 0 :
    ["mental", "shock"].includes(reason) ? 1 :
    ["execute", "watchdog", "bomb", "tough_substitute", "servant"].includes(reason) ? 2 :
    ["follow", "cupid_follow", "fanatic_follow"].includes(reason) ? 3 : -1;

  /**
   * 投票時の交換（マイクラ版 resolveBeggarSwaps）。determineWinnersCoreBase の連鎖解決（resolveChain）の直後、
   * 猫の解決（resolveCats）より前に呼ばれる前提。死亡した乞食は "dead" の失敗を記録する（乞食のまま死亡した扱いで勝敗判定される）。
   */
  function resolveVote(g) {
    const out = [];
    if (!g || !g.players || !g.currentRoles) return out;
    g.beggarResults = g.beggarResults || []; g.beggarUsedIds = g.beggarUsedIds || [];
    const before = g.beggarResults.length;
    const deadSetV = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set(g.deadIds || []);   // 投票解決時点の「死んだ人」= 追放された人 + 昼中に死んだ人
    holders(g).forEach((b) => {
      if (deadSetV.has(b) && !g.beggarUsedIds.includes(b)) { g.beggarUsedIds.push(b); g.beggarResults.push({ by: b, failed: "dead", when: "vote" }); }
    });
    const executedSet = new Set(g.executed || []);
    const deadAll = [...deadSetV];
    const groups = [[], [], [], []];
    deadAll.forEach((id) => { const gi = GROUP_OF(deathReason(g, id, executedSet)); if (gi >= 0) groups[gi].push(id); });
    const cands = [...groups[0], ...groups[1], ...groups[2], ...groups[3]];
    shuffle(holders(g).filter((id) => !deadSetV.has(id) && !g.beggarUsedIds.includes(id)))
      .forEach((b) => { trySwap(g, b, cands, "vote", true); });
    return g.beggarResults.slice(before);
  }

  /** 乞食のまま死んだ人が勝てない死因か（マイクラ版 beggarDeathBlocksWin） */
  function deathBlocksWin(g, id) {
    if ((g.deadKind || {})[id] === "shot") return true;                    // 保安官・ヴァニティの執行（Web版は執行も誤爆も "shot"）
    if ((g.chainKind || {})[id] === "bomb") return true;                   // 道化の爆弾魔の爆殺
    if ((g.bombs || []).some((x) => x.bomber === id)) return true;         // 爆弾魔自身の自爆
    return false;
  }
  /** 乞食のまま死亡して追加勝利するか（vote.js の set() が呼ぶ。deadSet は set() の死者集合。省略時は deadIds + executed で判定する） */
  const staysBeggarWin = (g, id, deadSet) => {
    const dead = deadSet ? deadSet.has(id) : (isDead(g, id) || (g.executed || []).includes(id));
    return eff(g, id) === ID && dead && !deathBlocksWin(g, id);
  };

  /** 本人への通知文（マイクラ版の「乞食通知」の文面） */
  function noticeText(g, e, nm) {
    if (!e) return "";
    if (e.failed === "sealed") return "あなたは封印されていたため、役職を拾えませんでした。";
    if (e.failed === "self_locked") return "自身の役職がロックされていたため失敗しました。";
    if (e.failed === "aa_blocked") return "対象の特殊な力により役職交換に失敗しました。";
    if (e.failed === "target_locked") return "対象の役職がロックされていたため失敗しました。";
    if (e.failed === "no_target") return "交換できる死亡者がいなかったため失敗しました。";
    if (e.failed) return "";
    return `あなたは${roleName(e.role)}になりました。`;
  }

  /** 結果発表用: 交換した順 [{ by, target, role, when, info }]（ui.js が「乞食:」の行で出す） */
  function lines(g, nm) {
    return (g.beggarResults || []).filter((e) => !e.failed).map((e) => ({
      by: nm(e.by), target: nm(e.target), role: e.role, when: e.when,
      info: `${nm(e.by)} は乞食です。${nm(e.target)} の「${roleName(e.role)}」をいただきました（${nm(e.target)} は村人になりました）。`,
    }));
  }
  /** 結果発表のカード移動演出用: 投票で交換した分 [{ byId, targetId, role, prevByRole }]（prevByRole = 交換前に乞食の席にあった役職。汎用めくりで交換前の姿を出すために net.js も使う） */
  const voteSwaps = (g) => (g.beggarResults || []).filter((e) => !e.failed && e.when === "vote").map((e) => ({ byId: e.by, targetId: e.target, role: e.role, prevByRole: e.prevByRole || ID }));

  /**
   * 実績（wiki-data.js の「乞食」に定義済みの6つ）。Web版にはまだ実績を保存する仕組みが無いので、
   * 「この試合で id が満たした実績ID」を返すだけ（ヴァニティ・殉職者などと同じ形）。won: その人が勝ったか
   */
  function achievements(g, id, won) {
    const out = [], r = R();
    if (g.initialRoles && (g.initialRoles[id] === r.BEGGAR || (g.currentRoles || {})[id] === r.BEGGAR)) out.push("first_beggar");   // 初めて乞食になる
    const e = (g.beggarResults || []).find((x) => x.by === id);
    if (e) {
      if (e.failed) out.push("beggar_failed");   // 乞食の交換に失敗する（乞食のまま死んだ場合も含む。マイクラ版準拠）
      if (e.role && e.role !== "doppelganger") {   // ドッペルゲンガーは素の陣営なし（マイクラ版 baseTeamOf）なので陣営系は付かない
        const team = (ONW.ROLE_INFO[e.role] || {}).team;
        if (team === ONW.TEAM.VILLAGE) out.push("beggar_become_village");   // 村人陣営の役職と交換する
        if (team === ONW.TEAM.WOLF) out.push("beggar_become_wolf");         // 人狼陣営の役職と交換する
        if (team === ONW.TEAM.THIRD) out.push("beggar_become_third");       // 第三陣営の役職と交換する
      }
    }
    if (won && (eff(g, id) === ID || e)) out.push("win_beggar");   // 乞食で勝利する（乞食のまま・取った役職で勝利した場合）
    return out;
  }

  ONW.beggar = { holders, excludedTarget, resolveDay, resolveVote, deathReason, deathBlocksWin, staysBeggarWin, noticeText, lines, voteSwaps, achievements, EXCLUDED_ROLES, transferData };

  ONW.defineRole("beggar", {
    info: { sealTarget: true, deck: 120, name: "乞食", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 48,
      desc: "第三陣営。夜の能力はありません。最初に誰かが死亡したとき、生きている乞食はその人の役職を盗みます（自分の役職と交換し、盗まれた人は村人になります）。交換は1回だけで、失敗しても終わります。盗んだあとは、その役職の人として勝敗が決まります。人狼・妖狐・恋人・生存や死亡が勝利条件に含まれる役職などは盗めません。誰の役職も盗めずに乞食のまま死亡した場合は追加で勝利しますが、保安官やヴァニティに撃たれて死んだ場合と、道化の爆弾魔に爆殺された場合は勝利できません。最終的に乞食を持っている人が対象です。" },
    groups: { "transform:silver_shadow": 20 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる）

    // 昼の即時交換の演出（stage.js の flashes("late") が g.beggarFlash を渡す。本人だけに届く "beggarnews" で積まれる）:
    // 死亡者のカードが取った役職でめくれ、乞食自分の席に置かれる（自分のカードも同じ役職でめくれる）→ どちらも裏に戻る。観戦者・他の人には届かない
    stageFlash: {
      field: "beggarFlash", when: "late",
      run(list, SK) {
        list.forEach((x, i) => {
          const kt = `p:${x.id}`, kb = `p:${x.by}`;
          SK.later(() => { if (!SK.held[kt]) { SK.up[kt] = x.role; SK.glow[kt] = true; SK.paint(SK.G()); } }, 200 + i * 600);
          SK.later(() => { SK.up[kb] = x.role; SK.glow[kb] = true; SK.paint(SK.G()); }, 200 + i * 600 + 1000);
        });
        SK.later(() => {
          list.forEach((x) => { [`p:${x.id}`, `p:${x.by}`].forEach((k) => { if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; }); });
          SK.paint(SK.G());
        }, 200 + list.length * 600 + 3400);
      },
    },

    // 結果発表の演出（stage.js の startResult が引く）: 投票で交換した分。全員がめくれ終わったあと（afterRest）に出す。
    // 汎用の結果めくりでは、関係する2席は交換前の姿でめくれている（乞食の席 = 乞食、取られた人の席 = 元の役職。
    // net.js の buildResultObj が res.history の role を交換前に差し替える。演出前に交換後が見えるネタバレの修正。2026-11-25 作者報告）。
    // この演出で初めて交換後を表示する: 字幕 → カードが乞食の席へ飛ぶ → 着地で元の席は村人・乞食の席は取った役職にめくれる。
    // res.beggarSwaps は net.js が作る（名前つき）。
    stageResult: {
      afterRest(R) {
        const sw = (R.res && R.res.beggarSwaps) || [];
        if (!sw.length) return;
        sw.forEach((s) => {
          const kt = R.P(s.targetId), kb = R.P(s.byId), t0 = R.t;
          R.later(() => {   // 取られた人のカードは交換前の姿（元の役職）でめくれている。念のため同じ面を出し直して光らせる
            R.setCap(`<div class="res-cap__t t-third">${R.esc("乞食")}</div><div>${R.esc(s.target)} の「${R.esc(roleName(s.role))}」を ${R.esc(s.by)} がいただきました</div>`);
            R.up[kt] = s.role; R.glow[kt] = true; R.paint(R.G());
          }, t0);
          R.later(() => flyCard(R, kt, kb), t0 + 900);   // カードが乞食の席へ飛ぶ
          R.later(() => {   // 着地: 元の席には村人のカードが残り、乞食の席が取った役職にめくれて光る（ここで初めて交換後が見える）
            R.up[kt] = "villager"; delete R.glow[kt];
            R.up[kb] = s.role; R.glow[kb] = true; R.paint(R.G());
          }, t0 + 900 + 1100);
          R.later(() => { delete R.glow[kb]; R.paint(R.G()); }, t0 + 900 + 1100 + 700);
          R.t = t0 + 900 + 1100 + 900;
        });
      },
      skip(R) {   // スキップ時: 汎用めくりは交換前の姿なので、最終形（取られた人は村人・乞食は取った役職）をここで出し、飛ぶカードの残骸も片付ける
        ((R.res && R.res.beggarSwaps) || []).forEach((s) => { R.up[R.P(s.targetId)] = "villager"; R.up[R.P(s.byId)] = s.role; });
        removeFly();
      },
      clear(R) { removeFly(); },
    },
  });

  // ---- 結果発表でカードを飛ばす部品（交換者のバッジ飛行と同じ流儀: 画面の上に重ねる DOM アニメーション） ----
  function removeFly() { document.querySelectorAll(".bg-fx").forEach((e) => e.remove()); }
  function anchorOf(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function flyCard(R, fromK, toK) {
    const A = anchorOf(R, fromK), B = anchorOf(R, toK);
    if (!A || !B || typeof document === "undefined") return;
    const el = document.createElement("div");
    el.className = "bg-fx";
    el.style.cssText = `position:fixed;left:${A.x}px;top:${A.y}px;width:${A.w}px;height:${A.h}px;border-radius:10px;background:linear-gradient(160deg,#fdf6d8,#e8cf8f);border:2px solid #b98a2f;box-shadow:0 10px 28px rgba(0,0,0,.45);z-index:900;pointer-events:none;transition:left 1.05s cubic-bezier(.45,.05,.35,1),top 1.05s cubic-bezier(.45,.05,.35,1),transform 1.05s cubic-bezier(.45,.05,.35,1);`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.left = `${B.x}px`; el.style.top = `${B.y}px`; el.style.transform = "scale(1.06)";
    }));
    setTimeout(() => el.remove(), 1250);
  }
})(window.ONW);
