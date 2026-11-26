"use strict";
/**
 * 多重人格（第三陣営）— マイクラ版準拠の移植。
 *
 * 仕様（マイクラ版 state.js ROLE_INFO / game.js の multiPersona 系）:
 *  ・他のプレイヤーが「GUIで対象を選ぶ式」の夜能力・昼能力を使うたびに、盤面の全多重人格の人格が
 *    村人 ⇔ 狂人 に入れ替わる（全体反転カウンタ g.mpFlips）。各保持者は「初期人格＋自分が多重人格に
 *    なった時点の反転回数（base）」を持ち、現在の人格 = (全体反転 − base) の偶奇で決まる。
 *  ・初期人格はランダム（配布時・銀色の影系の変身でなったとき）。墓荒らし・いたずらっ子・シャッフラー・
 *    コスプレ・パッチ等で後からなったときは村人固定（forceVillager）。グレムリンのコピーはコピー元の
 *    現在の人格を引き継ぐ。
 *  ・反転が起きるのは「多重人格の保持者か、銀狼に多重人格と思い込まされている人」が1人でもいるときだけ
 *    （どちらもいなければ全体反転は増えない。マイクラ版 onAbilityCompletedForMultiPersonality）。
 *  ・対象外の夜能力（情報のみ）: プロファイラー・統率の人狼・魔界公爵・弁護士・麻婆の人狼。
 *    昼は全てのGUI選択式が対象（代行者の指令・勝負師の予想はマイクラ版で dayActionDone が立たないため対象外）。
 *  ・封印された多重人格は、その時点の人格で凍結する（以後の反転に付いていかない）。
 *  ・死んだ多重人格も人格が凍結する。ただし保安官・ヴァニティに直接撃たれて死んだ場合は、
 *    その発砲で起きた反転はその人については巻き戻してから凍結する（マイクラ版 excludeMultiPersonaFromJustFiredFlipAndFreeze）。
 *  ・勝敗は「投票開始時点の人格」で判定: 村人人格なら村人陣営と一緒に勝ち、狂人人格なら人狼陣営と一緒に勝つ。
 *  ・多重人格から別の役職になったとき、1回だけ「あなたは{役職名}になりました。」と分かる。
 *    後から多重人格になったときも「あなたの初期人格は{村人|狂人}でした。」と分かる
 *    （封印中・煙幕中は通知なし。酔っ払い中は酔い覚めまで保留。銀狼にハッキングされている人は除く）。
 *  ・銀狼に多重人格と思い込まされている人には、反転のたびに「推測の人格」の通知が届く
 *    （全体反転が偶数=村人・奇数=狂人。マイクラ版の fakeBelievers 処理）。
 *
 * 演出（作者メモ）:
 *  ・配布画面・夜は、自分のカードが初期人格（村人/狂人）の面でめくれて常に見えている。
 *  ・朝（待機時間）は、夜に反転した回数だけ自分のカードが1枚ずつ裏返る（村人→狂人→村人…）。
 *  ・昼に能力が使われたら、その場でリアルタイムに裏返る。
 *  ・後から多重人格になった場合: その時点で「多重人格」の面でめくれてから、人格の面にめくれる。
 *  ・多重人格から別の役職になった場合: その役職の面だけ見えて、分かったら裏に戻る。
 *
 * 状態（すべて人に紐づく。カードが動いても人は変わらない）:
 *  g.mpFlips 全体反転回数 / g.mpRecord {id:{init, base, gone, fresh, awayPending}} /
 *  g.mpSeen {id: 自分が保持者として経験した反転回数} / g.mpShown {id: 演出で見せ済みの反転回数} /
 *  g.mpFrozen {id: 凍結した人格} / g.mpAwayTold {id: true}（別の役職になった通知は1回だけ） /
 *  g.mpPending {id: true}（酔い覚め待ちの通知） / g.mpFakeSeq {id: [思い込みの人の反転列]} /
 *  g.mpFakeFace {id: 思い込みの人の現在の推測人格} / g.mpFinal {id: 投票開始時点の人格スナップショット} /
 *  g.mpLive [{id, kind, face}]（昼のリアルタイム演出キュー。net.js が flush する）
 */
const ID = "multi_personality";
const VILLAGER = "villager", MADMAN = "madman";

/** 人格 → 役職ID（面の表示用） */
const roleOfPersona = (persona) => (persona === "madman" ? "madman" : "villager");
/** 人格 → 日本語 */
const labelOf = (persona) => (persona === "madman" ? "狂人" : "村人");
/** n 回反転したあとの人格 */
const afterFlips = (init, n) => (n % 2 === 1 ? (init === "madman" ? "villager" : "madman") : init);

/** 夜能力のうち「GUIで対象を選ぶ式」ではない（情報のみ）役職。これらが動いても反転しない（マイクラ版 MULTI_PERSONA_INFO_ONLY_NIGHT_ROLES） */
const INFO_ONLY_NIGHT = ["profiler", "command_wolf", "demon_duke", "lawyer", "mapo_wolf"];
/** 夜に「対象を選ぶ式」の能力を持つ役職（マイクラ版 canUseNightAction の一覧。未移植役職も文字列で入れておき、移植されたら自動で効く） */
const GUI_NIGHT = [
  "seer", "apprentice_seer", "whimsical_seer", "fake_seer", "mad_seer", "robber", "relic_robber",
  "troublemaker", "doppelganger", "love_tanner", "freeter", "visitor", "major", "carmen",
  "trailblazer", "eraser_wolf", "finger_reader", "matthias", "chesed", "nanoka", "hotaru",
  "mercenary", "thread_spinner", "exposed_madman", "gremlin", "pure_lover", "evil_woman",
  "cupid", "heartbreaker", "shuffler", "keymaster", "seal_madman", "dog_madman", "boar_madman",
  "elfrinde", "avenger", "jester_ghost", "watchdog", "prankster", "reverser", "cosplayer",
  "mimic_wolf", "lookout", "agitator", "mad_agitator", "patch", "telepathist", "copylist", "trap_master",
];

const M = (ONW.multiPersona = {
  ID, VILLAGER, MADMAN, roleOfPersona, labelOf, afterFlips, GUI_NIGHT, INFO_ONLY_NIGHT,

  /** 状態の初期化（net.js の startGame からも呼ばれるが、単体利用でも壊れないように） */
  ensure(g) {
    if (g.mpFlips == null) g.mpFlips = 0;
    g.mpRecord = g.mpRecord || {}; g.mpSeen = g.mpSeen || {}; g.mpShown = g.mpShown || {};
    g.mpFrozen = g.mpFrozen || {}; g.mpAwayTold = g.mpAwayTold || {}; g.mpPending = g.mpPending || {};
    g.mpFakeSeq = g.mpFakeSeq || {}; g.mpFakeFace = g.mpFakeFace || {}; g.mpLive = g.mpLive || [];
    if (g.mpFinal === undefined) g.mpFinal = null;
    return g;
  },

  isHolder(g, id) { return !!g && g.currentRoles && g.currentRoles[id] === ID; },
  record(g, id) { M.ensure(g); return g.mpRecord[id] || null; },

  /** 現在の人格（"villager" | "madman"）。保持者でなければ null */
  personaOf(g, id) {
    M.ensure(g);
    if (g.mpFrozen[id]) return g.mpFrozen[id];
    const rec = g.mpRecord[id];
    if (!rec || rec.gone) {
      if (!M.isHolder(g, id)) return null;
      // 登録を経由しない経路へのフォールバック（マイクラ版 multiPersonaOf と同じ。村人固定・通知なし）
      g.mpRecord[id] = { init: "villager", base: g.mpFlips, gone: false, silent: true };
      if (g.mpSeen[id] == null) g.mpSeen[id] = 0;
      return "villager";
    }
    return afterFlips(rec.init, g.mpFlips - rec.base);
  },

  /** 配布直後の一括登録: 初期役職が多重人格の人（変身で確定した人も含む）をランダムな初期人格で登録する */
  assignAll(g) {
    M.ensure(g);
    (g.players || []).forEach((p) => {
      if (g.initialRoles && g.initialRoles[p.id] === ID) M.register(g, p.id, { route: "deal" });
    });
  },

  /**
   * 保持者の登録。opts: { route, initial, forceVillager, silent }
   * route: "deal"=配布（ランダム） / "gremlin"=コピー元の人格を引き継ぐ / それ以外は村人固定（マイクラ版の各登録点どおり）。
   * なったことの通知（人格通知）はここでは積むだけ: 夜は nightResults、昼は mpLive キュー（net.js が送る）。
   */
  register(g, id, opts) {
    M.ensure(g);
    opts = opts || {};
    const dbg = (ONW.debug && ONW.debug.mpPersona) ? ONW.debug.mpPersona(g, id) : null;
    let init = opts.initial || null;
    if (!init && opts.route !== "gremlin") init = opts.forceVillager || opts.route !== "deal" ? "villager" : (Math.random() < 0.5 ? "villager" : "madman");
    if (dbg === "villager" || dbg === "madman") init = dbg;   // デバッグ指定が最優先
    if (init !== "villager" && init !== "madman") init = "villager";
    g.mpRecord[id] = { init, base: g.mpFlips, gone: false, fresh: opts.route !== "deal", awayPending: null };
    if (g.mpSeen[id] == null) g.mpSeen[id] = 0;
    if (g.mpShown[id] == null) g.mpShown[id] = g.mpSeen[id];
    delete g.mpFrozen[id];
    if (!opts.silent) M.noticeBecame(g, id);
    return g.mpRecord[id];
  },

  /** 「なった」通知を積む（夜: nightResults / 昼: mpLive）。封印中・ハッキング中は送らない。酔っ払い中は保留 */
  noticeBecame(g, id) {
    const rec = g.mpRecord[id]; if (!rec) return;
    if (ONW.seal && ONW.seal.is(g, id)) return;                       // 封印されている間は分からない（マイクラ版）
    if (g.hackRole && g.hackRole[id]) return;                        // 銀狼にハッキングされている人は除く（マイクラ版の開始チェック）
    if (g.drunkOverlay && g.drunkOverlay[id]) { g.mpPending[id] = true; return; }   // 酔いが覚めるまで保留
    const text = `あなたの初期人格は${labelOf(rec.init)}でした。`;
    if (g.phase === "ONLINE_DAY" || g.phase === "day") {
      g.mpLive.push({ id, kind: "became", face: roleOfPersona(rec.init), text });
    } else if (g.nightResults) {
      (g.nightResults[id] = g.nightResults[id] || []).push({ title: "人格通知", lines: [text] });
    }
  },

  /** 「別の役職になった」通知（1人1回だけ。マイクラ版 announceMultiPersonalityTransformAway） */
  noticeAway(g, id, newRole) {
    M.ensure(g);
    if (g.mpAwayTold[id]) return;
    g.mpAwayTold[id] = true;
    const rec = g.mpRecord[id]; if (rec) rec.awayPending = newRole;
    if (g.smokeOn) return;                                            // 煙幕中は分からない（マイクラ版）
    if (ONW.seal && ONW.seal.is(g, id)) return;                       // 封印中は分からない（マイクラ版）
    if (g.drunkOverlay && g.drunkOverlay[id]) return;                 // 酔っ払い中は通知なし（マイクラ版に保留の仕組みなし）
    const text = `あなたは${(ONW.ROLE_INFO[newRole] || {}).name || newRole}になりました。`;
    if (g.phase === "ONLINE_DAY" || g.phase === "day") {
      g.mpLive.push({ id, kind: "away", face: newRole, text });
    } else if (g.nightResults) {
      (g.nightResults[id] = g.nightResults[id] || []).push({ title: "人格通知", lines: [text] });
    }
  },

  /**
   * カードの動きに合わせて1人ぶん同期する（state.js の付け替えフック・各段階の終わりから呼ばれる）。
   * route: 登録のされ方（"gremlin" はコピー元の人格を引き継ぐ。それ以外は村人固定）。
   * srcId: gremlin のコピー元。
   */
  syncOne(g, id, route, srcId) {
    M.ensure(g);
    if (!g.currentRoles) return;
    const rec = g.mpRecord[id];
    const holder = g.currentRoles[id] === ID;
    if (holder && (!rec || rec.gone)) {
      if (route === "gremlin" && srcId && srcId !== id) {
        const srcPersona = M.personaOf(g, srcId);
        M.register(g, id, { route: "gremlin", initial: srcPersona || "villager" });
      } else {
        M.register(g, id, { route: route || "late", forceVillager: true });
      }
    } else if (!holder && rec && !rec.gone) {
      rec.gone = true;
      M.noticeAway(g, id, g.currentRoles[id]);
    }
  },

  /** 全員ぶん同期（段階の終わり・待機時間の直前・勝敗判定の入口の安全網） */
  syncAll(g, route) {
    M.ensure(g);
    (g.players || []).forEach((p) => M.syncOne(g, p.id, route));
    // 墓地のカードが多重人格かどうかは人ではないので対象外。センターは syncOne の対象にしない
  },

  /** 凍結（封印・死亡）。現在の人格で固定する */
  freeze(g, id) {
    M.ensure(g);
    if (g.mpFrozen[id]) return;
    if (!M.isHolder(g, id)) return;
    const persona = M.personaOf(g, id);
    if (persona) g.mpFrozen[id] = persona;
  },
  /** 封印されている保持者をまとめて凍結 */
  freezeSealed(g) {
    if (!ONW.seal) return;
    (g.players || []).forEach((p) => { if (M.isHolder(g, p.id) && ONW.seal.is(g, p.id)) M.freeze(g, p.id); });
  },
  /** 死んでいる保持者をまとめて凍結 */
  freezeDead(g) {
    const dead = g.deadIds || [];
    (g.players || []).forEach((p) => { if (dead.includes(p.id)) M.freeze(g, p.id); });
  },

  /**
   * 保安官・ヴァニティに直接撃たれて死んだ場合: その発砲で起きた反転をその人についてだけ巻き戻して凍結する
   * （マイクラ版 excludeMultiPersonaFromJustFiredFlipAndFreeze）。発砲の反転は「その人の seen が最新の全体反転と一致」
   * しているときだけ巻き戻せる（= 直前の反転がこの発砲によるもの）。
   */
  excludeJustFlip(g, id) {
    M.ensure(g);
    if (g.mpFrozen[id]) return;
    const rec = g.mpRecord[id];
    if (rec && !rec.gone && (g.mpSeen[id] || 0) > 0 && g.mpFlips - rec.base === g.mpSeen[id]) {
      rec.base += 1;                       // 基準を1つ進める = その人の人格だけ1反転戻る
      g.mpSeen[id] -= 1;
      if ((g.mpShown[id] || 0) > g.mpSeen[id]) g.mpShown[id] = g.mpSeen[id];
    }
    M.freeze(g, id);
  },

  /** 次の1回だけ、指定した人の能力使用で反転させない（マイクラ版 multiPersonaSuppressIds。イカロス・レン・コスプレ封じ等） */
  suppressNext(g, id) {
    M.ensure(g);
    g.mpSuppress = g.mpSuppress || {};
    g.mpSuppress[id] = true;
  },

  /**
   * 能力が1つ完了した（反転トリガーの本体）。net.js / cpu.js の実行チョークポイントから呼ばれる。
   * actorId: 使った人 / roleUsed: 使った（と思っている）役職 / when: "night"（夜・朝の連鎖は待機時間にまとめて演出）
   *   | "day"（昼はリアルタイム演出。mpLive に積み、net.js が flush する）。
   */
  onAbility(g, actorId, roleUsed, when) {
    M.ensure(g);
    if (g.mpSuppress && g.mpSuppress[actorId]) { delete g.mpSuppress[actorId]; return; }   // 抑制は1回で消費
    if (when === "night") {
      if (!roleUsed || !GUI_NIGHT.includes(roleUsed) || INFO_ONLY_NIGHT.includes(roleUsed)) return;
      // 例外（マイクラ版）: 鍵師にロックされたコスプレイヤー / 夜能力として使えない運命の開拓者は反転しない
      if (roleUsed === "cosplayer" && (g.keyLocks || []).includes(actorId)) return;
      if (roleUsed === "trailblazer" && ONW.trailblazer && ONW.trailblazer.fateOf) {
        const fate = ONW.trailblazer.fateOf(g, actorId);
        if (!fate || fate === "none") return;
      }
    }
    const dead = g.deadIds || [];
    const holders = (g.players || []).filter((p) => M.isHolder(g, p.id) && !dead.includes(p.id)).map((p) => p.id);
    const believers = (g.players || []).filter((p) => !M.isHolder(g, p.id) && g.hackRole && g.hackRole[p.id] === ID && !dead.includes(p.id)).map((p) => p.id);
    if (!holders.length && !believers.length) return;               // 誰もいなければ全体反転は増えない（マイクラ版）
    // 封印された保持者は、この反転の直前の人格で凍結して反転に付いていかない
    holders.forEach((id) => { if (ONW.seal && ONW.seal.is(g, id) && !g.mpFrozen[id]) M.freeze(g, id); });
    g.mpFlips += 1;
    holders.forEach((id) => {
      if (g.mpFrozen[id]) return;                                   // 凍結した人は反転しない・通知も止まる
      g.mpSeen[id] = (g.mpSeen[id] || 0) + 1;
      const persona = M.personaOf(g, id);
      if (g.hackRole && g.hackRole[id]) return;                     // ハッキングされている保持者には通知しない（反転自体はする）
      if (g.drunkOverlay && g.drunkOverlay[id]) { g.mpPending[id] = true; return; }   // 酔い覚めまで保留
      const text = `あなたは${labelOf(persona)}になりました。`;
      if (when === "day") {
        g.mpShown[id] = g.mpSeen[id];
        g.mpLive.push({ id, kind: "flip", face: roleOfPersona(persona), text });
      } else if (g.nightResults) {
        (g.nightResults[id] = g.nightResults[id] || []).push({ title: "人格通知", lines: [text] });
      }
    });
    believers.forEach((id) => {
      const guessed = g.mpFlips % 2 === 0 ? "villager" : "madman";   // 推測の人格（マイクラ版: 全体反転の偶奇）
      g.mpFakeFace[id] = guessed;
      (g.mpFakeSeq[id] = g.mpFakeSeq[id] || []).push(guessed);
    });
  },

  /** 投票開始時点の人格スナップショット（勝敗判定用。マイクラ版 snapshotMultiPersonaFinalStates） */
  snapshotFinal(g) {
    M.ensure(g);
    const out = {};
    (g.players || []).forEach((p) => { if (M.isHolder(g, p.id)) out[p.id] = M.personaOf(g, p.id) || "villager"; });
    g.mpFinal = out;
    return out;
  },
  /** 最終人格（スナップショット優先。マイクラ版 finalMultiPersonaState） */
  finalState(g, id) {
    M.ensure(g);
    if (g.mpFinal && g.mpFinal[id]) return g.mpFinal[id];
    return M.personaOf(g, id) || "villager";
  },
  /** その陣営の人格で最終状態の多重人格のID一覧（勝敗判定の基本分岐に足す用） */
  teamWinners(g, team) {
    M.ensure(g);
    const want = team === ONW.TEAM.WOLF ? "madman" : "villager";
    return (g.players || []).filter((p) => M.isHolder(g, p.id) && M.finalState(g, p.id) === want).map((p) => p.id);
  },

  /** 結果情報（情報確認）。マイクラ版 vote.js の「多重人格情報」と同じ文 */
  lines(g, nm) {
    M.ensure(g);
    const out = [];
    for (const p of g.players || []) {
      if (!M.isHolder(g, p.id)) continue;
      const rec = g.mpRecord[p.id];
      const init = rec ? rec.init : "villager";
      out.push(`多重人格${nm(p.id)}の初期人格は ${labelOf(init)}、最終人格は ${labelOf(M.finalState(g, p.id))} でした。（入れ替わり回数 ${g.mpSeen[p.id] || 0}回）`);
    }
    return out;
  },

  /** 実績（マイクラ版 stats.js） */
  achievements(g, id, won) {
    M.ensure(g);
    const out = [];
    const trail = (g.roleTrail && g.roleTrail[id]) || [];
    const was = g.initialRoles && g.initialRoles[id] === ID || trail.includes(ID);
    const is = M.isHolder(g, id);
    if (was || is) out.push("multi_personality_first");
    if (is && won) out.push(M.finalState(g, id) === "madman" ? "multi_personality_win_wolf" : "multi_personality_win_village");
    if (is && !won) out.push("multi_personality_loss");
    if ((g.mpSeen[id] || 0) >= 3) out.push("multi_personality_flip3");
    return out;
  },

  /** 思い込みの人の現在の推測人格の面（反転が1回もなければ null） */
  faceForFake(g, id) {
    M.ensure(g);
    return g.mpFakeFace[id] ? roleOfPersona(g.mpFakeFace[id]) : null;
  },

  /** 現在表示すべき人格の面（roleMsg / settle 用）。保持者でなく・酔っ払い中なら null */
  faceFor(g, id) {
    M.ensure(g);
    if (!M.isHolder(g, id)) return null;
    if (g.drunkOverlay && g.drunkOverlay[id]) return null;
    const rec = g.mpRecord[id];
    if (!rec) return "villager";
    return roleOfPersona(afterFlips(rec.init, g.mpShown[id] || 0));
  },
});

ONW.defineRole(ID, {
  info: { deck: 175, name: "多重人格", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 60,
    desc: "他のプレイヤーが能力を使うたびに村人と狂人の人格が入れ替わります。投票開始時点での人格の陣営が勝利条件です。" },
  groups: { "transform:silver_shadow": 35 },   // 銀色の影からの変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS）。光の使徒・闇の化身からは変化しない。封印対象ではない
  nightMsg(c, p) {
    const g = c.g;
    if (g.initialRoles[p.id] !== ID) return { text: "" };
    const rec = M.record(g, p.id);
    // 思い込み（ハッキング）の画面では銀狼側が文を作る。ここは本物の保持者だけ
    if (g.hackRole && g.hackRole[p.id]) return { text: "" };
    if (!rec) return { text: "" };
    return { text: `あなたの初期人格は${labelOf(rec.init)}です。` };
  },
  settleMsg(c, p, mode) {
    const g = c.g, out = {};
    // 銀狼に多重人格と思い込まされている人: 夜の間に届いた「推測の人格」の通知と、朝の反転演出（本物と同じ形）
    if (c.isFakeUi && c.isFakeUi(p.id) && g.hackRole && g.hackRole[p.id] === ID) {
      if (mode === "settle") {
        const seq = (g.mpFakeSeq[p.id] || []).slice();
        if (seq.length) {
          out.logs = seq.map((persona) => `あなたは${labelOf(persona)}になりました。`);
          out.mpSettle = { faces: seq.map(roleOfPersona), became: false, away: null, fake: true };
        }
        if (g.mpFakeFace[p.id]) out.mpFace = roleOfPersona(g.mpFakeFace[p.id]);
      }
      return out;
    }
    if (g.initialRoles[p.id] !== ID && !M.isHolder(g, p.id) && !(g.mpRecord[p.id] && !g.mpRecord[p.id].gone)) {
      // 多重人格だったことがある人（朝のうちに別の役職になった等）の「なった先」演出だけ拾う
      const rec0 = g.mpRecord[p.id];
      if (rec0 && rec0.awayPending) { out.mpSettle = { faces: [], became: false, away: rec0.awayPending }; out.mpFace = null; rec0.awayPending = null; }
      return out;
    }
    if (c.dr) return out;                                            // 酔っ払い中は演出なし（通知は保留され、酔い覚めで届く）
    if (!M.isHolder(g, p.id)) {
      const rec0 = g.mpRecord[p.id];
      if (rec0 && rec0.awayPending) { out.mpSettle = { faces: [], became: false, away: rec0.awayPending }; out.mpFace = null; rec0.awayPending = null; }
      return out;
    }
    const rec = M.record(g, p.id);
    if (!rec) return out;
    const seen = g.mpSeen[p.id] || 0, shown = g.mpShown[p.id] || 0;
    const faces = [];
    for (let n = shown + 1; n <= seen; n++) faces.push(roleOfPersona(afterFlips(rec.init, n)));
    const became = !!rec.fresh;
    const away = rec.awayPending || null;
    if (faces.length || became || away) out.mpSettle = { faces, became, away };
    out.mpFace = roleOfPersona(afterFlips(rec.init, seen));
    if (mode === "settle") { g.mpShown[p.id] = seen; rec.fresh = false; rec.awayPending = null; }
    return out;
  },
  stageSettle: { field: "settleMp", shown: "settleMpShown", run: {
    order: 32,
    run(data, SK) {
      const d = data[0]; if (!d) return;
      const g = SK.G(), k = "p:" + ONW.net.myId();
      const kit = SK;
      const flipTo = (role, holdMs) => { delete kit.up[k]; SK.paint(g); SK.later(() => { kit.up[k] = role; SK.paint(g); }, 260); return holdMs; };
      let t = 0;
      if (d.away) {           // 別の役職になった: その役職の面だけ見せて、裏に戻る
        flipTo(d.away, 0);
        SK.later(() => { delete kit.up[k]; delete kit.held[k]; SK.paint(g); }, 2700);
        return;
      }
      const seq = [];
      if (d.became) seq.push(ID);                                     // 後からなった: まず多重人格の面
      (d.faces || []).forEach((f) => seq.push(f));
      if (d.became && g.myMp && seq[seq.length - 1] !== g.myMp) seq.push(g.myMp);   // 人格の面で終わる
      if (!seq.length && g.myMp) seq.push(g.myMp);
      seq.forEach((role, i) => {
        SK.later(() => { delete kit.up[k]; SK.paint(g); }, t);
        SK.later(() => { kit.up[k] = role; kit.held[k] = true; SK.paint(g); }, t + 260);
        t += 900;
      });
      const last = seq[seq.length - 1];
      if (last && last !== ID) g.myMp = last;
    },
    end(SK) { const g = SK.G(), k = "p:" + ONW.net.myId(); if (g.myMp) { SK.up[k] = g.myMp; SK.held[k] = true; } },
  } },
  soberReveal: { order: 31, run(c, ids) {   // 酔い覚め: 保留していた通知を「現在の人格」で1通だけ届け、面も合わせる
    const g = c.g;
    ids.forEach((id) => {
      if (!g.mpPending || !g.mpPending[id]) return;
      delete g.mpPending[id];
      if (!M.isHolder(g, id)) return;
      if (ONW.seal && ONW.seal.is(g, id)) return;                     // 封印されていたら届かない（マイクラ版 flush の条件）
      const rec = M.record(g, id); if (!rec) return;
      const persona = M.personaOf(g, id);
      g.mpShown[id] = g.mpSeen[id] || 0;
      c.hold(id, `あなたは${labelOf(persona)}になりました。`);
      c.send(id, { t: "mpnews", text: `あなたは${labelOf(persona)}になりました。`, face: roleOfPersona(persona) });
    });
  } },
  stageEnd: { run(c, kind) {   // 各段階の終わり: カードの動きへの追随（なった/離れた）＋封印の凍結
    const g = c.g;
    M.syncAll(g);
    if (kind === "seal") M.freezeSealed(g);
    M.freezeDead(g);
  } },
  settlePre: { run(c) { const g = c.g; M.syncAll(g); M.freezeSealed(g); M.freezeDead(g); } },
  dayShift: { run(c) { const g = c.g; M.syncAll(g); M.freezeDead(g); } },   // 昼のカード移動（酔い覚め・朝の連鎖）でも追随する
  achievements(g, id, won) { return M.achievements(g, id, won); },
  coResult: { kind: "mp" },   // COの結果開示: 今の人格は村人です / 狂人です（マイクラ版のCOフォーム）
  cpuClaim(k, g, p, r, i, c) {   // CPUのCO: 多重人格と名乗り、今の人格を開示する
    const persona = M.personaOf(g, p.id) || "villager";
    return { role: ID, result: `今の人格は${labelOf(persona)}です。` };
  },
});
