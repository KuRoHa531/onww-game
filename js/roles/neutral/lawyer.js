/**
 * 弁護士（マイクラ版 LAWYER を参考）: 第三陣営。
 *   ・夜の始まりに依頼人（人狼判定の者 = 人狼陣営の中からランダムに1人）が分かる。依頼人のカードが「役職名で」めくれる（夜の間ずっと開いたまま）。夜の能力はない。
 *   ・依頼人には、待機時間（朝のあと）に従者通知と同じバナー「あなたに弁護士がついています」が出る（誰が弁護士かは教えない）。
 *   ・待機時間の開始時、依頼人がいない（人狼判定の者が最終盤面にいない・依頼人がいなくなった）弁護士は、オポチュニストに変化する。
 *     本人の画面では、自分のカードが「オポチュニスト」にめくれる（背徳者が狂人になるのと同じ仕組み）。ほかの待機時間の演出と重なるときは、それが終わって裏面に戻ったあと。
 *     鍵師にロックされている弁護士は変化に失敗する（演出もなく、何も起きない）。背徳者と違って発狂はしない。
 *   ・依頼人が勝てば、弁護士が生存していれば単独勝利、死亡していれば追加勝利。ただし保安官の執行で死んだ弁護士は勝てない。勝利優先度は 神 ＞ 弁護士(単独勝利時) ＞ 妖狐（docs/victory-priority.md）。
 *   ・「誰が依頼人か」は g.lawyerClient[持ち主ID]、依頼人の役職は g.lawyerClientRole[持ち主ID]（ONW.ROLE_BOUND_KEYS。役職のカードについていく）。
 *     怪盗などで弁護士のカードが動くと、依頼人の記録も動いた先の持ち主に移る。依頼人が役職交換で動いたときは、依頼人の「役職」を持っている別の人狼陣営に移る（ensure）。
 *   ・酔っ払い・墓荒らし・ドッペルゲンガー経由でも同じ（酔っ払いは酔いが覚めてから依頼人が分かり、そこで変化の判定。墓荒らし・ドッペルは朝のうちに依頼人が分かる）。
 *   ・情報確認: 「あなたの依頼人は〇〇の△△です。」「あなたに弁護士がついています。」「依頼人がいなかったためオポチュニストに変化しました。」が残る。結果発表の役職情報に「弁護士〇〇は…を弁護していました。」。
 * 実装の進み具合は _wip/依頼文_弁護士_*.txt と docs/lawyer.md を参照。
 */
(function (ONW) {
  const L_ = () => ONW.ROLE.LAWYER;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const isP = (g, id) => g.players.some((q) => q.id === id);
  const dead = (g, id) => (g.deadIds || []).includes(id);
  const locked = (g, id) => !!(ONW.keymaster && ONW.keymaster.locked && ONW.keymaster.locked(g, id));
  const NOTICE = "あなたに弁護士がついています。";
  const CONV_TEXT = "依頼人がいなかったため、弁護士からオポチュニストに変化しました。";
  const rnm = (r) => (ONW.roles.getInfo(r) || {}).name || r;

  /** roles（initialRoles か currentRoles）で見た「人狼判定の者」= 依頼人になれる席（本物の人狼 + 昇格した狂人。自分以外） */
  function candidates(g, holder, roles) {
    return g.players.map((p) => p.id).filter((id) => id !== holder && (
      (ONW.WOLF_KIND.includes(roles[id]) && !(ONW.mimic && ONW.mimic.notWolfJudge && roles === g.currentRoles && ONW.mimic.notWolfJudge(g, id))) ||
      ((g.promotedWolfIds || []).includes(id) && ONW.MAD_KIND.includes(roles[id]))));
  }
  const rec = (g, holder) => ONW.getRoleBound(g, "lawyerClient", holder);
  const recRole = (g, holder) => ONW.getRoleBound(g, "lawyerClientRole", holder);
  function setRec(g, holder, client, role) {
    if (client) { ONW.setRoleBound(g, "lawyerClient", holder, client); ONW.setRoleBound(g, "lawyerClientRole", holder, role); }
    else { ONW.setRoleBound(g, "lawyerClient", holder, null); ONW.setRoleBound(g, "lawyerClientRole", holder, null); }
  }
  /**
   * 弁護士 holder の依頼人（マイクラ版 ensureLawyerClientFor）。roles = 盤面（initialRoles / currentRoles）。
   *   記録の依頼人がまだ有効（人狼判定の者）ならそのまま / 動いて無効になったら、依頼人だった「役職」を持つ別の候補に移る / 見つからなければ依頼人なし。
   *   まだ一度も決まっていなければ、allowNew のときだけ候補からランダムに決める。戻り値: 依頼人の席 or null
   */
  function ensure(g, holder, roles, allowNew) {
    const cand = candidates(g, holder, roles), cur = rec(g, holder), curRole = recRole(g, holder);
    if (cur && cand.includes(cur)) { if (!curRole) setRec(g, holder, cur, roles[cur]); return cur; }
    if (curRole) {
      const moved = cand.find((id) => roles[id] === curRole);
      if (moved) { setRec(g, holder, moved, curRole); return moved; }
      setRec(g, holder, null); (g.lawyerHad = g.lawyerHad || {})[holder] = true;   // 一度決まった依頼人がいなくなった（もう新しくは決めない）
      return null;
    }
    if ((g.lawyerHad || {})[holder] || !allowNew) return null;
    if (cand.length) { const t = ONW.utils.randomChoice(cand); setRec(g, holder, t, roles[t]); return t; }
    return null;
  }
  /** 最終盤面で弁護士を持っている席の [持ち主, 依頼人]。依頼人がいない人は client が null */
  const holders = (g) => g.players.map((p) => p.id).filter((id) => g.currentRoles[id] === L_());
  function pairs(g) { return holders(g).map((h) => [h, rec(g, h) && ensure(g, h, g.currentRoles, false)]); }
  /** 依頼人 → 弁護士たち（最終盤面。ロックの有無にかかわらず記録どおり） */
  function lawyersOf(g, clientId) { return pairs(g).filter(([, c]) => c === clientId).map(([h]) => h); }

  const clientText = (g, id, roles) => id ? `あなたの依頼人は${rnm((roles || g.initialRoles)[id])}の${nm(g, id)}です。` : "あなたは依頼人がいません。";

  /** 夜の始まり（配布直後）: 弁護士 holder の依頼人を決めて返す（初期役職で見る。すでに決まっていればそのまま） */
  function assignNight(g, holder) { return ensure(g, holder, g.initialRoles, true); }
  /** 墓荒らし・ドッペル・酔い覚めで弁護士を手にしたとき: そのときの盤面で決める */
  function assignNow(g, holder) { return ensure(g, holder, g.currentRoles, true); }

  /**
   * 変化の判定（待機時間の開始時 / 酔いが覚める直前）: 弁護士 id が、依頼人がいない（人狼判定の者が最終盤面にいない）ならオポチュニストに変化する。
   * 鍵師にロックされている弁護士は、変化に失敗する（何も起きない。g.lawyerLockFail に記録するだけ）。酔っている弁護士は酔いが覚めたとき（soberJudge）。
   * 変化したら g.lawyerConv[id] = true を記録して true を返す。
   */
  function judge(g, id) {
    if (!g || g.currentRoles[id] !== L_() || (g.lawyerConv || {})[id]) return false;
    const client = ensure(g, id, g.currentRoles, !locked(g, id));   // ロック中は新しく依頼人を決めない（変化にも失敗する）
    const wolfAlive = g.players.some((q) => q.id !== id && !dead(g, q.id) && candidates(g, id, g.currentRoles).includes(q.id));
    if (client && wolfAlive) return false;
    if (locked(g, id)) { (g.lawyerLockFail = g.lawyerLockFail || {})[id] = true; return false; }   // ロック: 演出もなく失敗
    (g.lawyerConv = g.lawyerConv || {})[id] = true;
    ONW.promoteRole(g, id, ONW.ROLE.OPPORTUNIST);
    setRec(g, id, null);
    return true;
  }

  /** 結果: 依頼人が勝った弁護士。generator: 結果発表の勝者 w（Set）を渡す。alive: 生存している弁護士（単独勝利）/ extra: 死亡した弁護士（追加勝利）。保安官の執行で死んだ弁護士は除く */
  function winners(g, w, deadSet) {
    const shot = (ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(g) : []);
    const alive = [], extra = [];
    pairs(g).forEach(([h, c]) => {
      if (!c || !w.has(c)) return;
      if (!deadSet.has(h)) alive.push(h);
      else if (!shot.includes(h)) extra.push(h);
    });
    return { alive, extra };
  }

  /** 弁護士の単独勝利（vote.js determineWinnersCore が呼ぶ）: 結果が 村人陣営 / 人狼陣営 / 妖狐陣営 の勝ちだけのとき、依頼人が勝者にいる生存した弁護士がいれば、弁護士たちだけの勝利にする */
  function takeover(g) {
    if (g.chickenForce) return null;
    const teams = g.winTeams || [];
    if (!teams.length || !teams.every((t) => ["村人陣営", "人狼陣営", "妖狐陣営"].includes(t))) return null;
    const w = new Set(g.winnerIds || []), r = winners(g, w, ONW.vote.deadSet(g));
    return r.alive.length ? { ids: r.alive } : null;
  }

  ONW.lawyer = { candidates, ensure, assignNight, assignNow, judge, pairs, lawyersOf, winners, takeover, clientText, NOTICE, CONV_TEXT, locked, holders };

  // ---- CPU ----
  /** CPUの弁護士は依頼人（人狼陣営）が誰か知っている: 依頼人には投票しない。自分の役職は名乗らず、他の村役職を騙る */
  function cpuLearn(g, id, k) { const c = rec(g, id) && ensure(g, id, g.currentRoles, false); if (c) k.infoOf(g, id).known[c] = g.initialRoles[c] || g.currentRoles[c]; }
  function cpuClaim(k, g, p, r, i, c) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }

  ONW.defineRole("lawyer", {
    info: { sealTarget: true, deck: 97, name: "弁護士", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.995,
      desc: "第三陣営。夜の始まりに、依頼人（人狼陣営の1人）のカードが役職名でめくれて分かります。依頼人には待機時間に「あなたに弁護士がついています」と知らされます（誰が弁護士かは分かりません）。依頼人が勝利し、弁護士が生存していれば単独勝利、死亡していれば追加勝利します。ただし保安官執行死では勝てません。待機時間の時点で依頼人がいない（人狼陣営が盤面にいない）と、カードが裏返ってオポチュニストに変化します（鍵師にロックされていると失敗します）。" },
    groups: { "transform:silver_shadow": 22 },
    cpuInit: cpuLearn, cpuLearn,
    cpuClaim,
    cpuVoteExclude: (k, g, p, q) => (rec(g, p.id) && ensure(g, p.id, g.currentRoles, false)) === q.id,
    // 夜の演出(stage.js が g.lawyerReveal を受け取って 700ms 後に呼ぶ): 依頼人のカードが役職名でめくれる → 夜時間の間ずっと開いたまま
    stageNight: {
      order: 47, field: "lawyerReveal",
      run(r, SK) {
        const { later, paint, G } = SK;
        later(() => {
          const k = `p:${r.id}`;
          if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
          SK.up[k] = r.role; SK.glow[k] = true;
          if (SK.loveMate && SK.loveMate.id === r.id) SK.lov[k] = true;
          if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k);
          paint(G());
        }, 0);
      },
    },
    nightMsg(c, p) {
      const g = c.g, id = assignNight(g, p.id);
      return { text: clientText(g, id, g.initialRoles), lawyerClient: id ? { id, role: g.initialRoles[id] } : null };
    },
    /** 墓荒らし・ドッペルで弁護士を手にしたとき: 朝のうちに依頼人が分かる（カードも同時にめくれる） */
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g, id = assignNow(g, p.id);
      c.hold(p.id, clientText(g, id, g.currentRoles));
      t.both(t.eff());
      if (id) t.setPeek([{ k: `p:${id}`, role: g.currentRoles[id] }], 380);
    },
    soberLines(c, id) { const cl = assignNow(c.g, id); return [clientText(c.g, cl, c.g.currentRoles)]; },
    soberPeek(c, id) { const cl = rec(c.g, id) && ensure(c.g, id, c.g.currentRoles, false); return cl ? { lawyerClient: { id: cl, role: c.g.currentRoles[cl] } } : {}; },
    stageSober: { list: { order: 30, run(sp, list) { if (sp.lawyerClient) list.push([`p:${sp.lawyerClient.id}`, sp.lawyerClient.role, true]); } } },
    // ---- 待機時間: オポチュニストへの変化（背徳者の狂人化と同じ。弁護士が変化するのは settlePre order 3 = 姫君(2)のあと・背徳者(5)のまえ） ----
    settlePre: { order: 3, run(c) {
      const g = c.g;
      g.lawyerConv = {}; g.lawyerLockFail = {}; g.lawyerNotified = {};
      g.players.forEach((p) => {
        if (ONW.hiddenDrunk(g, p.id) || !judge(g, p.id) || !p.isCpu) return;
        const i = ONW.cpu.kit.infoOf(g, p.id);
        i.known[p.id] = ONW.shownRole(g.currentRoles[p.id]);
        ONW.cpu.learnInfo(g, p.id, g.currentRoles[p.id]);
      });
    } },
    /** 酔いが覚める直前: 覚める弁護士の変化の判定（覚めた本人には soberExtra で知らせ、役職は最終役職のオポチュニストで届く） */
    soberJudge: { order: 4, run(c, ids) { ids.forEach((id) => { if (c.g.currentRoles[id] === L_()) { assignNow(c.g, id); judge(c.g, id); } }); } },
    soberExtra(c, id) {
      const g = c.g, lines = [];
      if ((g.lawyerConv || {})[id]) lines.push(CONV_TEXT);
      if (lawyersOf(g, id).length) { lines.push(NOTICE); (g.lawyerNotified = g.lawyerNotified || {})[id] = true; }   // 酔っていた依頼人: 酔いが覚めたときに知らされる
      return lines.length ? { lines } : {};
    },
    /** 待機時間の通知: 変化した本人（自分のカードがオポチュニストにめくれる = lawyerConv）と、依頼人（従者通知と同じバナー）。酔っている人には届けない（酔いが覚めたとき soberExtra） */
    settleMsg: { order: 36, run(c, p, mode) {
      const g = c.g, out = {}, logs = [];
      if (ONW.hiddenDrunk(g, p.id)) return out;
      if ((g.lawyerConv || {})[p.id] && g.currentRoles[p.id] === ONW.ROLE.OPPORTUNIST) { logs.push(CONV_TEXT); out.lawyerFlip = ONW.shownRole(g.currentRoles[p.id]); }
      if (lawyersOf(g, p.id).length) { logs.push(NOTICE); if (mode === "settle") { out.lawyer = true; (g.lawyerNotified = g.lawyerNotified || {})[p.id] = true; } }
      if (logs.length) out.logs = logs;
      return out;
    } },
    /** 昼: 酔いが覚めた弁護士に依頼人が付いたときなど、まだ通知していない依頼人へ（servant の dayNotice と同じ形） */
    dayNotice(c) {
      const g = c.g; g.lawyerNotified = g.lawyerNotified || {};
      g.players.forEach((q) => {
        if (q.isCpu || g.lawyerNotified[q.id] || ONW.hiddenDrunk(g, q.id) || !lawyersOf(g, q.id).length) return;
        g.lawyerNotified[q.id] = true; c.hold(q.id, NOTICE); c.send(q.id, { t: "lawyerday", text: NOTICE });
      });
    },
    // ---- 本人の画面: 自分のカードが「オポチュニスト」にめくれる（ほかの待機時間の演出があるときは、それが終わって裏面に戻ったあと） ----
    stageSettle: {
      field: "settleLawyer", shown: "settleLawyerShown",
      run: { order: 96, run(list, SK) {
        const g = SK.G(), role = list[0]; if (!role) return;
        const others = ONW.roleHooksIn("stageSettle", "run").some((h) => h.def.stageSettle.field !== "settleLawyer" && g[h.def.stageSettle.field] && g[h.def.stageSettle.field].length) || !!g.settleInsom;
        if (others) { g.lawyerPending = role; return; }
        SK.later(() => SK.show(`p:${ONW.net.myId()}`, role), 700);
      } },
      end(SK) {
        const g = SK.G(); if (!g.lawyerPending) return;
        const role = g.lawyerPending; g.lawyerPending = 0;
        const k = `p:${ONW.net.myId()}`;
        SK.later(() => { SK.up[k] = role; SK.glow[k] = true; SK.paint(SK.G()); }, 1100);
        SK.later(() => { if (SK.held && SK.held[k]) return; delete SK.up[k]; delete SK.glow[k]; SK.paint(SK.G()); }, 1100 + 3600);
      },
    },
  });
})(window.ONW);
