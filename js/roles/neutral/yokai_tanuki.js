/** 妖狸（第三陣営）: 人狼に見え、人狼が見える化け狸。
 *  マイクラ版（scripts/extraRoles.js・roles.js・game.js・vote.js・night.js・cpu.js・state.js）と Wiki（order 161）を正とする。
 *  作者（くろはさん）の依頼メモ（2026-11-25）: 「妖狸目線では、人狼が狼マークに見える」「妖狸も、ほかの人狼やスパイからは狼マークに見える」
 *  ＋追加仕様「妖狸が呪殺されたときは🦊じゃなくてたぬきマーク」。
 *
 *  仕様（マイクラ版で確認）:
 *  ・妖狸の目線: 他の参加者のうち「初期役職」が本物の人狼系（isRealWolfRole = ONW.WOLF_KIND。一匹狼も含む）かスパイの人が、
 *    人狼の気配として見える（夜の知らせ・情報確認）。昇格した狂人は見えない。他の妖狸も見えない。
 *  ・妖狸は wolfLook: true（スパイと同じ仕組み）で、人狼の仲間表示・狂信者・マーリン・魔界公爵からは🐺に見える。
 *    統率の人狼の夜の情報にも「最終役職が妖狸」の行が出るが、統率の人狼は Web 未実装なので配線なし。
 *  ・占い結果は「妖狸」。呪殺可能な占い（占い師・狂った占い師）で占われると呪殺される（妖狐と同じ g.foxInspected の記録を使う）。
 *    ただし狂信者は、呪殺されたのが妖狸だけでは後追いしない（マイクラ版 processFanaticDeaths は妖狐・狐憑きのときだけ）。
 *  ・勝利: 人狼陣営が勝利し、生存していれば単独勝利に化ける（ONW.yokaiTanuki.takeover。妖狐より先に判定する＝マイクラ版の順）。
 *    ただし「最初から人狼系が存在する」ことが条件（初期役職に本物の人狼系がいるか、昇格した人狼がいる）。
 *    神の祝福のときは、呪殺・執行されていなければ（＝生きていれば）勝者に加わる（vote.js の set 側）。
 *    独裁クーデターで勝者なし・生存中の最終人狼系がいる場合も単独勝利（マイクラ版の特例）。
 *  ・呪殺の演出は作者指定で🦊ではなく「たぬきマーク」（stage.js の TANUKI_MARK = 🦝＋「呪殺」）。死亡の種類は妖狐と同じ "fox"
 *    （昼の札は「呪殺」、従者の身代わり対象にも妖狐の呪殺と同じく入る。狂信者の後追いは役職で判定するので妖狸では起きない）。
 *  ・変化候補: 銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW）。光の使徒・闇の化身には入らない。
 *    コスプレイヤーは村人陣営のみ（対象外）。模倣は Web では村人・人狼陣営のみ（対象外。マイクラ版の NON_MIMICABLE には入っていない差異）。
 *    シャッフラーはマイクラ版どおり山札に入る（shufflerEligibleRoles の除外に無い。妖狐と同じ）。ペルソナは Web 未実装（マイクラ版では仮面の対象）。
 *  ・ハッキング: 対象外リストには入れない（マイクラ版どおり）。妖狸だと思い込んだ人は偽の人狼表示（WOLFVIEW）を見て、
 *    本物の妖狸が思い込まされたときは本物の気配ではなく偽の表示になる（銀狼の共通仕組み）。
 *  ・乞食には取れない（beggar.js の EXCLUDED_ROLES に "yokai_tanuki" が登録済み＝マイクラ版 isBeggarSwapExcludedTarget どおり）。
 *  ・シナジー: 妖狸がトリガーのルールはマイクラ版に無いので追加しない。
 *  ・CPU: 人狼の気配を知っている（初期役職の人狼系＋スパイを学習し、その人たちには投票しない＝マイクラ版 cpu.js の回避）。
 *    CO は第三陣営の流儀でカバーストーリー（fox と同じ coverLie）。
 *  並び: js/roleorder.js の ONW.ROLE_ORDER に yokai_tanuki はすでに入っている（wiki の order 161）ので、末尾追加は不要。
 */
(function (ONW) {
  const ID = "yokai_tanuki";
  const holders = (g) => g.players.filter((p) => g.currentRoles[p.id] === ID).map((p) => p.id);
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 妖狸から「人狼」として見える席（初期役職が本物の人狼系＝WOLF_KIND（一匹狼含む）かスパイ。自分は除く。昇格狂人・他の妖狸は見えない） */
  const visibleWolfIds = (g, selfId) => g.players.filter((q) => q.id !== selfId && (ONW.WOLF_KIND.includes(g.initialRoles[q.id]) || g.initialRoles[q.id] === ONW.ROLE.SPY)).map((q) => q.id);
  const isTanuki = (g, id) => g.currentRoles[id] === ID;

  /** 占いで呪殺される妖狸（占い師・狂った占い師が占った席＝g.foxInspected のうち、現在の役職が妖狸で、酔っ払いに隠れていない人。
   *  opts.hidden=true のときは逆に「隠れている人」だけ。妖狐の curseTargets と同じ判定） */
  function curseTargets(g, opts) {
    const o = opts || {}, done = new Set([...(g.tanukiCursed || []), ...(g.deadIds || [])]);
    return g.players.map((p) => p.id).filter((id) => isTanuki(g, id) && (g.foxInspected || {})[id] && !done.has(id) && (o.hidden ? ONW.hiddenDrunk(g, id) : !ONW.hiddenDrunk(g, id)));
  }
  /** 保留中の妖狸を呪殺する（only を渡すとその人だけ）。死亡の種類は妖狐と同じ "fox"（札は「呪殺」） */
  function curseNow(c, only) {
    const g = c.g, all = (g.tanukiPending || []).slice(), ids = only ? all.filter((id) => only.includes(id)) : all;
    g.tanukiPending = all.filter((id) => !ids.includes(id));
    ids.forEach((id) => { if (!(g.tanukiCursed || []).includes(id)) (g.tanukiCursed = g.tanukiCursed || []).push(id); });
    ids.forEach((id) => {
      if ((g.deadIds || []).includes(id)) { if (!(g.deadKind || {})[id] || ["follow", "lovers", "cupid", "fanatic"].includes(g.deadKind[id])) (g.deadKind = g.deadKind || {})[id] = "fox"; return; }   // 連鎖で先に死んでいたら、呪殺として扱う（妖狐と同じ）
      ONW.net.killPlayer(id, null, "fox");
    });
  }
  /** 昼のうちの呪殺: 酔いが覚めた妖狸／昼に役職が動いて・昼に占われて新しく「占われた席に妖狸」になった席。
   *  全員の画面でたぬきマークに裏返って灰色になる演出（tanukicurse）のあと、昼中死亡にする。妖狐の lateCurse と同じ流れ */
  function lateCurse(c, delay) {
    const g = c.g;
    if (g.phase !== ONW.PHASE.ONLINE_DAY) return;
    const pend = new Set(g.tanukiPending || []), ids = curseTargets(g).filter((id) => !pend.has(id));
    if (!ids.length) return;
    g.tanukiPending = [...(g.tanukiPending || []), ...ids];
    const m = { t: "tanukicurse", ids: ids.slice(), chain: ONW.fox.chainView(g, ids), delay: delay || 0 };
    c.sendAll(m); c.sendSpec(m);
    setTimeout(() => {   // 演出（めくれ → 灰色）が終わってから死亡にする。その間に投票へ進んでいても、結果が出るまでなら呪殺できる
      const cur = ONW.game;
      if (!cur || cur !== g || ![ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE].includes(g.phase)) return;
      curseNow(c, ids);
    }, (delay || 0) + 3200);
  }
  /** 人狼陣営の勝利に紛れる単独勝利の判定（マイクラ版 applyYokaiTanukiOverride）。発動したら { ids }、しなければ null。
   *  神の祝福のときは発動しない（勝者への追加は vote.js の set 側で「生きている妖狸」を入れる）。 */
  function takeover(game) {
    const dead = ONW.vote.deadSet(game);
    const lost = new Set([...(ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(game) : []), ...(ONW.vanity && ONW.vanity.lostIds ? ONW.vanity.lostIds(game) : [])]);   // 勝利条件を失った人（保安官・ヴァニティに撃たれた人）は化けられない（マイクラ版 noVictoryIds）
    const living = holders(game).filter((id) => !dead.has(id) && !lost.has(id) && !(game.tanukiCursed || []).includes(id));
    if (!living.length) return null;
    const teams = game.winTeams || [];
    if (teams.includes("神の祝福")) return null;
    if (teams.includes("人狼陣営")) {
      const hasInitialRealWolf = game.players.some((p) => ONW.WOLF_KIND.includes((game.initialRoles || {})[p.id]));   // 最初から人狼系が存在する（マイクラ版 hasAnyInitialRealWolfRole）
      const hasPromotedWolf = (game.promotedWolfIds || []).length > 0;
      if (!hasInitialRealWolf && !hasPromotedWolf) return null;
      return { ids: living };
    }
    // 独裁クーデターの特例: 独裁者が自分を処刑対象に反転されて処刑され、勝者チームが無く、生存中の最終人狼系がいれば化ける
    const d = game.dictator;
    if (!teams.length && d && d.coup && d.target === d.by && (game.executed || []).includes(d.by) && game.players.some((p) => ONW.WOLF_KIND.includes(game.currentRoles[p.id]) && !dead.has(p.id))) return { ids: living };
    return null;
  }
  function achievements(g, id, won) {
    const out = ["first_yokai_tanuki", won ? "win_yokai_tanuki" : "lose_yokai_tanuki"];
    const gone = new Set([...(g.deadIds || []), ...(g.executed || []), ...(g.eliminated || [])]);
    if (!won && !((ONW.vote && ONW.vote.wolfJudgeIds ? ONW.vote.wolfJudgeIds(g) : []) || []).some((wid) => !gone.has(wid))) out.push("yokai_tanuki_no_living_wolf");   // 人狼系も昇格狂人も生存者にいない状態で敗北（マイクラ版 stats.js）
    if ((g.tanukiCursed || []).includes(id)) out.push("yokai_tanuki_cursed");
    return out;
  }
  ONW.yokaiTanuki = { holders, visibleWolfIds, curseTargets, curseNow, lateCurse, takeover, achievements, nm };

  /** 待機時間の呪殺演出: 妖狸のカードが「たぬきマーク」でめくれる（作者指定。🦊ではない）。連鎖は妖狐の playChain を使う。
   *  灰色の印は SK.curse[k] = SK.TANUKI_MARK（妖狐は true）にして、stage.js が TANUKI_MARK の面で描き直せるようにする */
  function playTanukiCurse(ids, chain, d, SK) {
    if (ONW.sound && ids && ids.length) { const g0 = SK.G(), ds0 = (g0 && g0.dealStart) || 0; ids.forEach((id) => SK.later(() => ONW.sound.seKey("curse_kill", ds0 + ":curse:" + id, 60000), d + 700)); }   // SE: 呪殺（妖狐と共有。キーは stage 側の盤面検出と共通で二重に鳴らさない）
    let left = ids.length;
    const next = () => { if (--left <= 0) ONW.fox.playChain(chain || [], 380, SK); };
    ids.forEach((id, i) => {
      const k = `p:${id}`;
      SK.later(() => ONW.fox.flipUp(SK, k, SK.TANUKI_MARK, () => SK.later(() => { SK.curse[k] = SK.TANUKI_MARK; SK.badge[k] = "呪殺"; delete SK.glow[k]; SK.paint(SK.G()); next(); }, 1400)), d + 700 + i * 380);
    });
  }

  const cpuLearn = (g, id, k) => { const vis = visibleWolfIds(g, id); g.players.forEach((q) => { if (vis.includes(q.id)) k.infoOf(g, id).known[q.id] = k.seenAs(g.initialRoles[q.id]); }); };

  ONW.defineRole(ID, {
    info: { deck: 125, name: "妖狸", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 51.5,
      desc: "第三陣営。人狼・狂信者・マーリン・魔界公爵から人狼に見え、自分は初期役職の人狼系とスパイを知ります。昇格狂人は分かりません。占い結果は妖狸で、呪殺可能な占いにより呪殺されます（呪殺されるとたぬきマークで表示されます）。最初から人狼系が存在し、人狼陣営勝利時に生存していれば単独勝利します。神の祝福では呪殺・執行されていなければ勝利できます。" },
    wolfLook: true,   // 人狼・狂信者・マーリン・魔界公爵からは🐺に見える（スパイと同じ仕組み。ONW.WOLF_LOOK / WOLF_LOOK_ALL へ自動で入る）
    groups: { "transform:silver_shadow": 28 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に YOKAI_TANUKI が入る。光の使徒・闇の化身には入らない）
    // 夜の知らせ: 人狼の気配（初期役職の人狼系＋スパイ）。カードのめくりは狂信者と共通の cultWolves 経路（🐺マーク）を使う
    nightMsg(c, p) {
      const g = c.g, ids = visibleWolfIds(g, p.id);
      const text = ids.length ? `人狼の気配: ${ids.map((x) => nm(g, x)).join("、")}` : "見える人狼はいません。";
      return { text, cultWolves: ids.length ? ids : null };
    },
    // 墓荒らし・ドッペルゲンガーで妖狸を手にしたとき: その時点の初期役職で人狼の気配を知る
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      const ids = visibleWolfIds(g, p.id);
      c.hold(p.id, ids.length ? `人狼の気配: ${t.names(ids)}` : "見える人狼はいません。");
      t.both(t.eff());
      t.setPeek(ids.map((x) => ({ k: `p:${x}`, role: "__wolf" })), 380);
    },
    // 酔い覚め（妖狸だと思い込んでいた／妖狸を手にしていた人）: 人狼の気配を改めて知る
    soberLines(c, id) {
      const g = c.g, ids = visibleWolfIds(g, id);
      return [ids.length ? `人狼の気配: ${ids.map((x) => nm(g, x)).join("、")}` : "見える人狼はいません。"];
    },
    soberPeek(c, id) {
      const ids = visibleWolfIds(c.g, id), pk = {};
      if (ids.length) pk.wolves = ids;
      return pk;
    },
    cpuInit(g, id, k) { cpuLearn(g, id, k); },   // CPU: 人狼の気配を知っている（その人たちには投票しない）
    cpuLearn,
    cpuClaim(k, g, p, r, i, c) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; },   // 第三陣営: CO はカバーストーリー（妖狐と同じ）
    // 待機時間の前処理: 占われた妖狸を呪殺候補にする（妖狐の order 18 の次。狂信者の変換 order 5 より後）
    settlePre: { order: 19, run(c) { const g = c.g, ids = curseTargets(g); if (ids.length) { g.tanukiPending = ids; g.tanukiSettleIds = ids.slice(); g.tanukiChainSettle = ONW.fox.chainView(g, ids); } } },
    // 待機時間の知らせ: 呪殺される妖狸がいることだけ全員へ（誰かは伏せる。妖狐と同じ）
    settleMsg: { order: 29, run(c) { const ids = c.g.tanukiSettleIds || []; return ids.length ? { tanukiCurse: ids, tanukiChain: c.g.tanukiChainSettle || [], quiet: !!c.g.smokeOn } : null; } },
    // 待機時間の演出: たぬきマークでめくる（作者指定）
    stageSettle: { field: "settleTanuki", shown: "settleTanukiShown", order: 39, run(ids, SK, d) { playTanukiCurse(ids, SK.G().settleTanukiChain || [], d, SK); } },
    // 昼の開始: 保留中の妖狸を呪殺する（net.js の toDay が dayCurse フックを呼ぶ）
    dayCurse(c) { curseNow(c); },
    /** 昼に酔いが覚めた妖狸: 本人のカードが妖狸とめくれ終わってから（約4秒後）、全員で同時に呪殺演出 → 死亡 → 後追い心中（妖狐と同じ） */
    daySober(c) { lateCurse(c, 4000); },
    /** 昼に役職が動いた・昼に占った: 占われた席に妖狸が来たら、すぐ呪殺演出 → 死亡 → 後追い心中（妖狐と同じ） */
    dayCheck(c) { lateCurse(c, 300); },
    // 昼の遅れ呪殺の演出（クライアントが tanukicurse を受けて g.dayTanuki を立てる）
    stageFlash: { field: "dayTanuki", when: "late", order: 39, run(ids, SK, d) { playTanukiCurse(ids, SK.G().dayTanukiChain || [], d, SK); } },
  });
})(window.ONW);
