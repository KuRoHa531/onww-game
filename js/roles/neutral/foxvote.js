/**
 * 妖狐投票（マイクラ版 foxVotePhase を参考）: 本投票の前に1回だけ行う特別な投票。
 *   ・本投票を開く時点で、最終盤面に「生きている妖狐」（昼中死亡・呪殺のどちらでもない）が1人でもいれば、先に妖狐投票を行う。いなければ今まで通り本投票だけ。
 *   ・投票のやり方は本投票と同じ（カードを押す）。終わったら得票数を全員に出す。
 *   ・最多得票者（同数最多なら全員）のうち、生きている妖狐だけが追放される（従者の身代わりつき）。妖狐が最多でなければ誰も追放されず、票数が出るだけでカードはめくれない。
 *   ・追放された妖狐は昼中死亡と同じ扱い（投票権と勝利条件を失う）。背徳者の後追い・恋人の心中・キューピッドの後追いも続く（2of3）。
 *   ・そのあと票を空にして、本投票が始まる。
 * 実装の進み具合は _wip/妖狐投票_依頼文.txt を参照。
 *  1of3: 妖狐投票フェーズの進行（発動条件・画面・CPU・本投票への切り替え・票数の発表）【済】
 *  2of3: 追放・連鎖・演出（妖狐だけがめくれる。追放なしは票数だけでめくらない）【済】
 *  3of3: 結果画面・勝敗・実績・総合テスト【済】（結果発表の先頭に妖狐投票欄 / 勝敗は既存の妖狐の判定で足りる / 実績フラグ foxTie / _wip/foxvotetest3.js）
 * 状態: g.foxVote = null（行わない）/ { active: 妖狐投票中, completed: 終わった, wait: 結果発表中, votes, counts, topIds, executedIds, subs, view }
 */
(function (ONW) {
  const FOX = () => ONW.ROLE.FOX;
  /** 生きている妖狐・狐憑きの席（最終盤面で妖狐か狐憑き・昼中死亡も呪殺もされていない）。狐憑きも妖狐と同じく、最多得票（同数最多も）なら追放される。
   *  追放されても勝利条件を失うのは妖狐だけ（狐憑きは村人陣営のまま勝敗に参加する） */
  const living = (g) => g.players.map((p) => p.id).filter((id) => ONW.fox.isFoxLike(g, id) && !(g.deadIds || []).includes(id) && !(g.foxCursed || []).includes(id) && !(g.foxPending || []).includes(id));   // 呪殺が決まっている（保留中）の妖狐も、生きている妖狐に数えない
  /** 妖狐投票を行うか（まだ行っていなくて、生きている妖狐がいる） */
  const needed = (g) => !(g.foxVote && g.foxVote.completed) && living(g).length > 0;

  /** いまの票(g.votes)から妖狐投票の結果を決める（状態は変えない）。
   *  counts: 得票数 / topIds: 最多得票者 / executed: 追放される人（最多得票者のうち生きている妖狐。従者の身代わりつき）/ subs: 身代わりの記録 [{ servant, master }] */
  function resolve(g) {
    const counts = ONW.vote.tally(g);
    const max = Math.max(0, ...Object.values(counts));
    const topIds = max > 0 ? Object.keys(counts).filter((id) => counts[id] === max) : [];
    const alive = new Set(living(g)), foxTop = topIds.filter((id) => alive.has(id));
    let executed = [], subs = [];
    if (foxTop.length) {
      const keep = { e: g.eliminated, m: g.mentalIds, s: g.shockIds, sub: g.servantSubs };   // 従者の身代わりは本投票の判定を借りる（終わったら元に戻す）
      g.eliminated = foxTop.slice(); g.mentalIds = []; g.shockIds = [];
      ONW.vote.applyServantSubstitution(g);
      executed = g.eliminated.slice(); subs = (g.servantSubs || []).slice();
      g.eliminated = keep.e || []; g.mentalIds = keep.m || []; g.shockIds = keep.s || []; g.servantSubs = keep.sub || [];
    }
    return { counts, topIds, executed, subs };
  }
  /** 全員に見せる「妖狐投票の結果」: 得票数（多い順）と追放された人 */
  function view(g, r) {
    const nm = (id) => (g.players.find((p) => p.id === id) || {}).name || "?";
    return {
      counts: Object.entries(r.counts).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, name: nm(id), n })),
      executed: r.executed.map((id) => ({ id, name: nm(id), sub: r.subs.some((x) => x.servant === id) })),
    };
  }
  /** 妖狐投票での CPU の投票先。妖狐だと分かっている人・占い師が妖狐と報告した人に入れ、いなければ生きている他の人からランダム。
   *  背徳者は知っている妖狐には入れない（妖狐が生き残れば乗っ取りでいっしょに勝てる） */
  function cpuTarget(g, p) {
    const dead = new Set(g.deadIds || []), others = g.players.map((q) => q.id).filter((id) => id !== p.id && !dead.has(id));
    if (!others.length) return null;
    const known = ((g.cpuInfo || {})[p.id] || {}).known || {};
    const asFox = others.filter((id) => known[id] === "fox" || (g.cpuClaims || []).some((c) => c.role === "fox" && c.target === id && c.from !== p.id));
    const mine = g.currentRoles[p.id] === ONW.ROLE.FANATIC;
    const pool = mine ? others.filter((id) => known[id] !== "fox") : others;
    const cand = mine ? pool : (asFox.length ? asFox : pool);
    return cand.length ? ONW.utils.randomChoice(cand) : null;
  }
  /** 追放された人の札の文字: 身代わりになった従者は「身代わり」、それ以外（妖狐）は「追放」 */
  const labelOf = (g, id) => ((g.foxVote && g.foxVote.subs) || []).some((x) => x.servant === id) ? "身代わり" : "追放";

  /** 追放の演出の予定（全員の画面に送る）: ids = 追放される人 / subs = 身代わり / chain = 連鎖で死ぬ人（恋人の心中・キューピッドと背徳者の後追い。ONW.deathPlan = 昼中死亡と同じ連鎖）/ ms = 演出が終わるまでの時間。
   *  追放された人が誰もいなければ null（票数だけ出てカードはめくれない） */
  function plan(g, r) {
    const ids = (r.executed || []).slice();
    if (!ids.length) return null;
    const chain = ONW.fox.chainView(g, ids, "foxvote");
    const depth = Math.max(0, ...chain.map((e) => e.depth || 1));
    const ms = (( r.subs || []).length ? 2200 : 0) + 700 + ids.length * 380 + 1400 + depth * 2200 + 900;   // 身代わりがあるときは、先にご主人のカードがめくれそうになる分(2.2秒)が足される   // 札が🦊にめくれる → 灰色 → 連鎖の段ごとにめくれる（ONW.fox.playChain と同じ間隔）
    return { ids, subs: (r.subs || []).map((x) => ({ servant: x.servant, master: x.master, role: g.currentRoles[x.servant] })), chain, ms };
  }
  /** 追放を実行する（昼中死亡と同じ扱い: net.killPlayer が 霊界・恋人の心中・従者・キューピッド・背徳者の後追い まで面倒を見る）。
   *  追放された妖狐は投票権と勝利条件を失い、そのあとの本投票の候補にも入らない（killPlayer が票を消す） */
  function execute(g, pl) {
    (pl ? pl.ids : []).forEach((id) => { if (!(g.deadIds || []).includes(id)) ONW.net.killPlayer(id, null, "foxvote"); });
  }
  /** 全員の画面で: 追放された人のカードが🦊（身代わりは「身代わり」）にめくれて灰色になり、連鎖で死ぬ人が同じ深さごとに「心中」「後追い」にめくれる。
   *  カードのめくれ方は 呪殺（待機時間・昼の呪殺 = ONW.fox）と同じ作り */
  function play(f, SK) {
    const ids = f.ids || [], subs = f.subs || [], off = subs.length ? 2200 : 0;
    const subOf = (id) => subs.find((x) => x.servant === id);
    // 従者の身代わり（本投票の結果発表と同じ見せ方）: ご主人のカードがめくれそうになって揺れる → 従者のカードが本当の役職（従者）で表になる。ご主人のカードはめくれない
    subs.forEach((x) => {
      const mk = `p:${x.master}`, sk = `p:${x.servant}`;
      SK.later(() => { SK.alm[mk] = true; SK.paint(SK.G()); }, 300);
      SK.later(() => { delete SK.alm[mk]; SK.up[sk] = x.role || "servant"; SK.glow[sk] = true; SK.paint(SK.G()); }, 2200);
      SK.later(() => { SK.dead[sk] = true; SK.badge[sk] = "身代わり"; delete SK.glow[sk]; SK.paint(SK.G()); }, 2200 + 1400);
    });
    ONW.fox.playChain(f.chain || [], off + 700 + ids.filter((id) => !subOf(id)).length * 380 + 1400, SK);
    ids.filter((id) => !subOf(id)).forEach((id, i) => {   // 追放された妖狐: 🦊の面にめくれて灰色
      const k = `p:${id}`;
      SK.later(() => { SK.up[k] = SK.FOXX_MARK; SK.glow[k] = true; SK.paint(SK.G()); }, off + 700 + i * 380);
      SK.later(() => { SK.curse[k] = SK.FOXX_MARK; SK.badge[k] = "追放"; delete SK.glow[k]; SK.paint(SK.G()); }, off + 700 + i * 380 + 1400);
    });
  }
  /**
   * 妖狐投票の票数の演出（追放の演出より前に流す。全員の画面）。fx = { first, pg, ex }:
   *   first = 最初に出す票数（ペンギンが滑る前）[{id,c}] / pg = { slides, steps }（ペンギンの滑り。なければ null）/ ex = { exchanges, steps }（交換者の入れ替え。なければ null）
   * 流れ: 「N票」が1枚ずつ出る → ペンギンが滑る → 交換者が入れ替える（本投票の結果発表と同じ順・同じ動き。字幕なし）→ 票数の札を外す。戻り値 = かかる時間(ms)
   */
  const SHOW_MS = 350, HOLD_MS = 1000, END_MS = 1000;   // 票数を1枚ずつ出す間隔 / 出し終えてから動き出すまで / 動き終えて札を外すまで
  function playCounts(fx, SK) {
    const R = Object.create(SK);
    R.P = (id) => `p:${id}`; R.t = 0;
    const first = (fx.first || []).filter((c) => c.c > 0).sort((a, b) => b.c - a.c);
    first.forEach((c, i) => R.later(() => { R.badge[`p:${c.id}`] = `${c.c}票`; R.paint(R.G()); }, i * SHOW_MS));
    R.t = first.length * SHOW_MS + HOLD_MS;
    if (fx.pg) ONW.penguin.run(R, fx.pg.slides || [], fx.pg.steps || [], false);
    if (fx.ex) ONW.exchanger.run(R, fx.ex.exchanges || [], fx.ex.steps || [], false);
    const ids = new Set();
    [fx.first || [], ...((fx.pg && fx.pg.steps) || []), ...((fx.ex && fx.ex.steps) || [])].forEach((st) => (Array.isArray(st) ? st : []).forEach((c) => ids.add(c.id)));
    if (fx.pg) (fx.pg.steps || []).forEach((st) => st.forEach((c) => ids.add(c.id)));
    R.later(() => { ids.forEach((id) => { if (/^\d+票$/.test(R.badge[`p:${id}`] || "")) delete R.badge[`p:${id}`]; }); R.paint(R.G()); }, R.t + 700);
    return R.t + END_MS;
  }
  /** playCounts にかかる時間(ms。動きを減らさない場合)。ホストが追放までの待ち時間に足す */
  const countsMs = (fx) => (fx.first || []).filter((c) => c.c > 0).length * SHOW_MS + HOLD_MS + (fx.pg ? ONW.penguin.ms(fx.pg.slides) : 0) + (fx.ex ? ONW.exchanger.ms(fx.ex.exchanges) : 0) + END_MS;
  ONW.foxVote = { living, needed, resolve, view, cpuTarget, labelOf, plan, execute, play, playCounts, countsMs };
})(window.ONW);
