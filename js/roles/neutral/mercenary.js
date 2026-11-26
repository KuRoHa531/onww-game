/* 傭兵（第三陣営・発案: くろは・元ネタ: 配信者様の人狼ゲーム。マイクラ版 state.js / night.js / game.js / vote.js / extraRoles.js / main.js / cpu.js 準拠）
 * 夜に自分以外の1人を護衛対象に選ぶ。護衛対象が死亡しそうになったときに、1回だけ死から守れれば追加勝利する。
 * 守りの仕組みは騎士（js/roles/village/knight.js）に乗せるが、騎士との違いは:
 *   ・守れる相手は「夜に選んだ護衛対象」だけ（騎士は村人陣営の誰でも）。陣営・恋人・シャッフラー・反転などの制限は無い。
 *   ・守る順番は騎士より先（マイクラ版 applyMercenaryProtection → applyKnightProtection の順）。
 *   ・複数の傭兵が同じ人を護衛していたら、全員が「守った」ことになる（マイクラ版 tryMercenaryProtect は対象の傭兵全員を記録する。
 *     騎士は1回の死に1人だけ）。
 *   ・連鎖の中で発生する死（道連れ・噛殺・爆殺など）は守らない（マイクラ版でも連鎖処理中の死は騎士だけが守る。
 *     傭兵の守りは「追放・身代わり・保安官の弾」など、死が確定する前の段階でだけ働く。Web版の騎士も噛殺・爆殺は守らないので同じ）。
 *   ・呪術の人狼の呪殺（死因 curse_kill）と毒は貫通して守れない（マイクラ版 isPiercingVoteKillReason = curse_kill / poison。
 *     Web版の毒死は呪殺と同じ game.curseKillIds に乗る）。
 * 守れる傭兵: 最終盤面の役職が傭兵（実効役職。模倣の人狼は第三陣営を模倣できないので対象外）・酔いが覚めている・生きている・
 *   同時に死ぬ人に入っていない・まだ守っていない。護衛対象の選び直しはできない（1試合に1回選択・守りも1回だけ）。
 * 朝の演出（作者メモ「夜に選ぶ朝に🛡️でめくる」）: 夜に選んだ傭兵の画面では、朝に護衛対象のカードが 🛡️ マーク
 *   （stage.js の SHIELD_MARK 面 "__shield"）でめくれる（morning reveal "peek"。選んだ人の画面だけ。マティアスの 👧 と同じ作り）。
 * 守る演出は騎士と同じ（作者メモ「守る演出は騎士みたいな感じ」）: 追放・独裁処刑・クーデターは結果発表で
 *   カードがめくれそうになって 🛡️（ONW.knight.stageShield を共用）、保安官の弾は撃った人の画面にだけ 🛡️。
 * 状態（すべて役職に紐づく記録。ONW.ROLE_BOUND_KEYS に登録し、カードが動いたらついていく。マイクラ版
 *   transferRoleBoundSpecialData / transferImmediateBeggarData の MERCENARY の移転と同じ。乞食の取り込みでも移る）:
 *   g.mercenaryTarget[持ち主ID]       = 護衛対象のID
 *   g.mercenaryProtected[持ち主ID]    = 死から守れたか（追加勝利の条件）
 *   g.mercenaryProtectionLog[持ち主ID] = { targetId, reason }（守った記録。実績用）
 *   g.mercenaryLog  = [{ mercenary, target, kind }]（守った記録すべて。kind: "exec" / "dictator" / "coup" / "sub" / "shot"）
 *   g.mercenaryGuards = [{ id, mercenary, kind }]（結果発表の 🛡️ 演出用。保安官の守りは入れない）
 * 変化候補: 銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に MERCENARY が入る）。
 *   光の使徒・闇の化身・コスプレには入らない。模倣は Web の共通流儀で第三陣営は対象外。ペルソナの仮面の対象外リスト
 *   （マイクラ版 PERSONA_MASK_EXCLUDED_ROLES）にも入っていないが、ペルソナは Web版未実装なので配線なし。
 *   シャッフラー: マイクラ版 shufflerEligibleRoles の除外に入っているので山札に入らない（shuffler.js の BLOCKED）。
 * ハッキング: マイクラ版の対象外（ヴァニティ・ホタルのみ）に入っていないので対象になる。思い込み先にもなる
 *   （silver_wolf.js の fakeResult に偽の結果文「○○を護衛しました。」あり）。本物の傭兵がハッキングされている間は、
 *   本当の夜の行動は裏で自動的に使われる（cpu.js の autoReal。cpuNight がそのまま使われる）。
 * 乞食: マイクラ版 isBeggarSwapExcludedTarget に入っていないので取れる（記録はカードについて移る。上記）。
 * 封印の対象: 自分も封印される（info.sealTarget: true。マイクラ版 YAMINABE_SEAL_TARGET_ROLES に MERCENARY が入る）。
 *   封印されている傭兵は夜に選べない（共通の failIfSealed）。守りの発動そのものは封印では止まらない（マイクラ版
 *   availableMercenaryIdsFor は封印を見ない。騎士も同じ）。
 * 闇鍋シナジー: マイクラ版に傭兵のシナジーは無い（YAMINABE_TRANSFORM_SYNERGY_RULES に入っていない）ので追加なし。
 * CPU: 夜は自分以外の1人をランダム（デバッグ指定があればそれ。マイクラ版 cpuSpecifiedAbilityTarget と同じ）。
 *   発言（マイクラ版 cpu.js）: 護衛対象がいれば傭兵COし、結果開示「○○を護衛していました。」（結果開示なので AI議論OFF でも出る）。
 * 実績（Wiki）: mercenary_no_danger / mercenary_same_time_dead / mercenary_save_queen / mercenary_save_death_wisher /
 *   mercenary_save_executioner_target / mercenary_save_lover / mercenary_save_follower / first_mercenary / win_mercenary
 *   （Web版に実績の保存は無いので ID の返却のみ。save_follower はマイクラ版 stats.js の条件をそのまま写した）。
 */
(function (ONW) {
  const ID = "mercenary";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const has = (g, id) => !!id && (g.players || []).some((q) => q.id === id);
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  const M = (ONW.mercenary = {
    /** 最終盤面で傭兵を持っている人のID */
    holders(g) { return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id); },
    /** 護衛対象（選んでいない人は null）。記録は役職（カード）について動く */
    targetOf(g, id) { return ONW.getRoleBound(g, "mercenaryTarget", id) || null; },
    /** 死から守れたか（追加勝利の条件） */
    protectedFlag(g, id) { return !!ONW.getRoleBound(g, "mercenaryProtected", id); },
    /** 守った記録 { targetId, reason }（実績用） */
    protectionLog(g, id) { return ONW.getRoleBound(g, "mercenaryProtectionLog", id) || null; },
    /** 傭兵の能力が働いている人か（最終盤面の役職が傭兵・酔いが覚めている）。生死・使用済みは見ない（騎士の active と同じ） */
    active(g, id) { return !!g && has(g, id) && ONW.mimic.eff(g, id) === ID && !ONW.hiddenDrunk(g, id); },
    /** 護衛対象を選ぶ（夜・朝の連鎖・CPU・裏の自動行動の共通入口）。選び直しはできない */
    act(g, id, target) {
      if (!has(g, target) || target === id || M.targetOf(g, id)) return false;
      ONW.setRoleBound(g, "mercenaryTarget", id, target);
      return true;
    },
    /**
     * 死から守る（状態を変える）。守れたら守った傭兵のIDの配列、守れなければ null。
     *   kind: 守る場面（"exec" / "dictator" / "coup" / "sub" / "shot"）。simul: 同時に死ぬ人のID（Set か配列。この中の傭兵は守れない）
     * 対象を護衛している傭兵全員が「守った」ことになり、それぞれ使用済みになる（マイクラ版 tryMercenaryProtect）。
     * 呪術の人狼の呪殺（game.curseKillIds）は貫通して守れない。
     */
    protect(g, target, kind, simul) {
      if (!g || !target || !has(g, target)) return null;
      if ((g.curseKillIds || []).includes(target)) return null;   // 貫通する死（マイクラ版 isPiercingVoteKillReason の curse_kill / poison。Web版の毒は curseKillIds に乗る）
      const s = simul instanceof Set ? simul : new Set(simul || []);
      const ids = (g.players || []).map((p) => p.id).filter((id) => id !== target && M.active(g, id) && M.targetOf(g, id) === target && !M.protectedFlag(g, id) && !isDead(g, id) && !s.has(id));
      if (!ids.length) return null;
      ids.forEach((id) => {
        ONW.setRoleBound(g, "mercenaryProtected", id, true);
        ONW.setRoleBound(g, "mercenaryProtectionLog", id, { targetId: target, reason: kind || "exec" });
        (g.mercenaryLog = g.mercenaryLog || []).push({ mercenary: id, target, kind: kind || "exec" });
      });
      return ids;
    },
    /** 結果発表の 🛡️ 演出の予定に足す（保安官の守りは足さない = 撃った人にだけ知らせる） */
    addGuard(g, id, mercenary, kind) {
      const e = { id, mercenary, kind };
      (g.mercenaryGuards = g.mercenaryGuards || []).push(e);
      return e;
    },
    /**
     * 指定した種類(kind)の守りの記録を消して、その守りで使われた傭兵を未使用に戻す（騎士の reset と同じ）。
     * 追放の決定（resolveElimination）は同じ試合の中で何度も計算し直されるので、計算のたびに自分の受け持つ kind だけを戻す。
     */
    reset(g, kinds) {
      const ks = new Set(kinds || []);
      (g.mercenaryLog || []).filter((e) => ks.has(e.kind)).forEach((e) => {
        if (g.mercenaryProtected) delete g.mercenaryProtected[e.mercenary];
        if (g.mercenaryProtectionLog) delete g.mercenaryProtectionLog[e.mercenary];
      });
      g.mercenaryLog = (g.mercenaryLog || []).filter((e) => !ks.has(e.kind));
      g.mercenaryGuards = (g.mercenaryGuards || []).filter((e) => !ks.has(e.kind));
    },
    /**
     * 保安官の弾を守る（net.js の hostSheriff / hostVanity が、騎士の guardShot より先に呼ぶ。マイクラ版では昼の死は
     * preVoteDead として投票解決の applyMercenaryProtection で守られるが、Web版は昼の死が即時なので騎士と同じく plan の段階で守る）。
     *   plan の victims（執行された人・誤爆した保安官・ネコカボチャ）と tomo（ネコカボチャの道連れ）のうち、護衛対象を守る。
     *   守られた人は plan から外れ（死なない）、plan.mercGuard に入る。従者の後追い（plan.followIds）からも外す。
     *   記録は g.mercenaryLog（kind "shot"）のみ。g.mercenaryGuards には入れない（撃った人以外には何も見えない）。
     * 戻り値: 守られた人のID（なければ []）
     */
    guardShot(g, plan) {
      const out = [], simul = new Set([...(plan.victims || []), ...(plan.tomo || [])]);
      ["victims", "tomo"].forEach((key) => {
        (plan[key] || []).slice().forEach((id) => {
          if (!M.protect(g, id, "shot", simul)) return;
          plan[key] = plan[key].filter((x) => x !== id);
          plan.followIds = (plan.followIds || []).filter((x) => x !== id);
          out.push(id);
        });
      });
      if (out.length) plan.mercGuard = out;
      return out;
    },
    /** 追加勝利の判定（マイクラ版 extraRoles.js の傭兵。最終役職ベース）: 守れていて、自分が死亡していない人 */
    extraWins(g, dead) {
      const d = dead instanceof Set ? dead : new Set(dead || []);
      return M.holders(g).filter((id) => M.protectedFlag(g, id) && !d.has(id));
    },
    /** 結果発表の役職情報（マイクラ版 game.js の傭兵情報） */
    lines(g, nameOf) {
      const n = nameOf || ((id) => nm(g, id)), out = [];
      for (const p of g.players || []) {
        if ((g.currentRoles || {})[p.id] !== ID) continue;
        const t = M.targetOf(g, p.id);
        if (!t) continue;
        out.push({ by: n(p.id), text: M.protectedFlag(g, p.id) ? `${n(p.id)} は ${n(t)} を死から守りました。` : `${n(p.id)} は ${n(t)} を護衛していました。` });
      }
      return out;
    },
    /** 実績（マイクラ版 stats.js と同じ条件。最終役職で判定する） */
    achievements(g, id, won) {
      if (!g || (g.currentRoles || {})[id] !== ID) return [];
      const out = ["first_mercenary"];
      const dead = new Set([...(g.deadIds || []), ...(g.executed || []), ...(g.chainIds || [])]);
      const t = M.targetOf(g, id), log = M.protectionLog(g, id);
      if (t && !M.protectedFlag(g, id) && !dead.has(id) && !dead.has(t)) out.push("mercenary_no_danger");
      if (t && dead.has(id) && dead.has(t)) out.push("mercenary_same_time_dead");
      if (log) {
        const tr = (g.currentRoles || {})[log.targetId];
        if (tr === "queen") out.push("mercenary_save_queen");
        if (["tanner", "love_tanner", "bounty_hunter", "martyr"].includes(tr)) out.push("mercenary_save_death_wisher");
        if (ONW.execPairs && ONW.execPairs(g).some(([, x]) => x === log.targetId)) out.push("mercenary_save_executioner_target");
        if (ONW.loverMates && ONW.loverMates(g, id).includes(log.targetId)) out.push("mercenary_save_lover");
        if ((g.servantMasters || {})[id] === log.targetId || ONW.getRoleBound(g, "freeterTargets", id) === log.targetId) out.push("mercenary_save_follower");   // マイクラ版 stats.js の条件そのまま（servantMaster[本人] = ご主人 / freeterTarget[本人] = 就職先）
      }
      if (won) out.push("win_mercenary");
      return out;
    },
  });

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ。マイクラ版 cpuSpecifiedAbilityTarget と同じ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    if (!M.act(g, p.id, t.id)) return;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を護衛対象にしました。`);
    n.hold(p.id, `${t.name} を護衛対象にしました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  const uiPick = {
    action(X) {
      const { later, nowSel } = X;
      return `<p class="night-step__hint">上のテーブルから、<strong>護衛したい人</strong>のカードを1人分押してください。（自分以外）<br>選んだ人が死にそうになったとき、1回だけ死から守ります。守れれば追加勝利です。${later}</p>${nowSel("")}`;
    },
    chainReady: (np) => np === 1,
    chainHow: () => "<strong>護衛したい人</strong>のカードを押して（自分以外）",
  };

  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 137, name: "傭兵", team: ONW.TEAM.THIRD, wakeOrder: 46, sort: 55,
      desc: "第三陣営。夜に自分以外のプレイヤー1人を護衛対象に選びます。朝、選んだ人のカードが🛡️マークでめくれます。護衛対象が死亡しそうになったとき（保安官の執行・投票の追放・独裁処刑・クーデター・身代わりで追放される場合）に1回だけ死から守り、守れた場合は追加で勝利します（呪術の人狼の呪殺は守れません）。護衛対象が死にそうにならなかった場合や、自身が死亡した場合は敗北します。騎士と違い、守れるのは選んだ1人だけですが、陣営は問いません。守る順番は騎士より先です。" },
    groups: { "transform:silver_shadow": 30 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に MERCENARY が入る）。光の使徒・闇の化身には入らない
    uiNight: uiPick,
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    night: {
      kind: "seer", order: 17,   // 占い師の段階（愉快犯16のあと・一目惚れしてるてる20より前。対象を記録するだけ。docs/role-process-order.md）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0];
        if (!t || t === p.id || !has(g, t)) return;
        const real = ONW.watcher && ONW.watcher.shift ? ONW.watcher.shift(g, p.id, t, g.players.map((q) => q.id).filter((x) => x !== p.id)) : t;   // 静観者を選んだら、実際に護衛対象になる席は別の人（選んだ本人には静観者を選んだように見える。マティアスと同じ）
        if (!real || real === p.id) { c.hold(p.id, ONW.watcher ? ONW.watcher.noneLine("護衛する") : "護衛できる人がいませんでした。"); return; }
        if (!M.act(g, p.id, real)) return;
        ONW.observeNote(g, p.id, [t], null, ID);
        ONW.newsNote(g, ID);
        g.nightLogsAll.push(`${c.rn(ID)} ${p.name} は ${nameOf(real)} を護衛対象にしました。`);
        c.hold(p.id, `${nameOf(t)} を護衛対象にしました。`);
        c.rev[p.id] = { kind: "peek", items: [{ k: `p:${real}`, role: "__shield" }] };   // 朝: 選んだ人のカードが 🛡️ マークでめくれる（選んだ人の画面だけ）
      },
    },
    /** 墓荒らし・ドッペルゲンガーで傭兵を手にしたとき: 朝のうちに1人選んで護衛対象にできる（昼に酔いが覚めて手にしたときも同じ） */
    morning: {
      run(c) {
        const g = c.g, nameOf = c.nameOf, id = c.id;
        const t = (c.players || [])[0];
        if (!t || t === id) return null;
        if (!M.act(g, id, t)) return null;
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${nameOf(t)} を護衛対象にしました。`);
        return { lines: [`${nameOf(t)} を護衛対象にしました。`], reveal: { kind: "peek", items: [{ k: `p:${t}`, role: "__shield" }] }, nextChain: null };
      },
    },
    cpuNight: { order: 17, stage: "seer", chain: true, run: cpuRun },   // 夜は "seer" 段階（17）。chain: 墓荒らし・ドッペル・酔い覚めのあと、朝のうちに使える
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 護衛した相手を選ぶ →「○○を護衛していました。」（マイクラ版の傭兵COと同じ）
    coResult: {
      kind: "mercenary", targetLabel: "護衛した相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)}を護衛していました。`, { kind: "mercenary", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    /** CPUの発言（マイクラ版 cpu.js）: 護衛対象がいれば傭兵CO + 結果開示「○○を護衛していました。」（結果開示なので AI議論OFF でも出る）。いなければ通常の騙り */
    cpuClaim(k, g, p, r, i, c) {
      const t = M.targetOf(g, p.id);
      if (!t) return false;
      c.co = ID;
      c.result = { text: `${nm(g, t)}を護衛していました。`, short: `→ ${nm(g, t)}`, claim: { kind: "mercenary", target: t } };
    },
    // 結果発表の演出（stage.js の startResult / skipResult が引く。res.mercGuards = net.js が game.mercenaryGuards から作る）:
    //   intro: 追放・独裁処刑・クーデターで死にそうになった護衛対象のカードが、途中まで回って揺れる → 光の輪と 🛡️ の札（騎士の stageShield を共用。カードは裏のまま・死なない）
    //   skip : スキップ時の最終形（🛡️ の札） / clear: 光の輪を片付ける
    stageResult: {
      intro: { order: 9, run(R) {   // 騎士(order 8)のあと・従者の身代わり(order 10)の前
        const { res, later, setCap, esc } = R;
        const KIND_LAB = { exec: "追放", dictator: "独裁処刑", coup: "クーデター" };
        const gs = (res.mercGuards || []).filter((x) => KIND_LAB[x.kind]);
        R.guardN = (R.guardN || 0) + gs.length;   // 騎士と同じ（「誰も追放されませんでした」の字幕を出さない）
        gs.forEach((x) => {
          const lab = KIND_LAB[x.kind];
          later(() => { setCap(`<div class="res-cap__t t-third">傭兵</div><div>${esc(x.name)} が${lab}されそうになりました…</div>`); }, R.t);
          if (ONW.knight && ONW.knight.stageShield) ONW.knight.stageShield(R, x.id, R.t, `<div class="res-cap__t t-third">傭兵の守り</div><div>${esc(x.name)} は死から守られました</div>`);
          R.t += 4300;
        });
        if (gs.length && !R.exec.length) R.t -= 600;   // 通常の追放がなければ、すぐ次へ（騎士と同じ）
      } },
      skip: { order: 201, run(R) { (R.res.mercGuards || []).forEach((x) => { R.badge[`p:${x.id}`] = "🛡️"; }); } },   // order 201: 騎士の skip(order 200) と同居せず、騎士→傭兵の順を一意に保つ（従来は登録順で同じ実効順だった）
      clear(R) { document.querySelectorAll(".kn-burst").forEach((e) => e.remove()); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "knightguard") delete R.gx[k]; }); },
    },
    achievements(g, id, won) { return M.achievements(g, id, won); },
  });
})(window.ONW = window.ONW || {});
