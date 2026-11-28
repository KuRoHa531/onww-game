/**
 * 煽動者（マイクラ版 AGITATOR を参考）: 村人陣営・夜に1人を煽る役職。煽られた人は投票で得る票数が1票増える。
 * ・マイクラ版の説明文: 「夜に煽るプレイヤーを1人選択します。煽られたプレイヤーは投票される票数が1票加算されます。」（配布時説明は js/role-desc-mc.js の転記が正）
 * ・夜に全参加者の中から1人を選ぶ（**自分も選べる**。墓地は選べない）。本人には「{対象} を煽りました。」が情報確認に残る。
 * ・記録は「人に紐づく状態」: g.agitatorTarget[煽った人のID] = 煽られた人のID。マイクラ版でも agitatorTarget は
 *   transferRoleBoundSpecialData の対象外（交換の白リストに煽動者は入っていない）で、投票の集計では
 *   「煽った人の現在の役職を問わず」数える。つまり役職が入れ替わっても・煽った人が昼に死んでも、加算はそのまま残る。
 *   そのため ONW.ROLE_BOUND_KEYS には登録しない（カードには付いていかない）。狂った煽動者（mad_agitator。第6バッチで移植済み）も
 *   マイクラ版では同じ game.agitatorTarget を使うので、このファイルの集計・背景解決は ROLES の一覧で共通化してある。
 * ・投票への加算（マイクラ版 vote.js effectiveVoteRecords / countVotes）: 集計の最初に「agitator:<煽った人>」という疑似票を
 *   1票として足す。疑似票も実票と同じ書き換えを受ける: ペンギンの滑り（対象がペンギンなら滑る）→ 交換者の入れ替え。
 *   対象が昼中に死亡していれば無効、番犬の飼い主への票は番犬の無効化で消える、妖精さんのバリアも得票数から引かれる。
 *   重みは常に1（市長などの票数増加は疑似票には付かない）。妖狐投票もマイクラ版は同じ countVotes を使うため加算される。
 *   Web版では vote.js の tally が交換者の直後・番犬の無効化より前に ONW.agitator.applyVotes を呼ぶ（ペンギン・交換者は
 *   applyVotes の中で疑似票の最終先を再計算する。結果発表の tallySteps にも最終段として足してある）。
 * ・背景解決（マイクラ版 resolveHackedAgitatorBackgroundTargets / resolveGremlinCopiedAgitatorTargets。どちらも集計時に解決）:
 *   (1) ハッキングされている本物の煽動者は、夜に煽動者として選べなかった代わりに、ランダムな1人を煽った扱いになる（封印中は除く）。
 *   (2) グレムリンに煽動者をコピーされた人は自分では夜能力を使えない代わりに、コピー元と同じ相手を煽った扱いになる
 *       （コピー元がまだ煽っていなければ、煽り次第こちらにも反映される = 集計時に解決するので自動でそうなる）。
 *   どちらも applyVotes / lines / achievements の入口で settleBackground が1回だけ埋める（埋めた先は g.agitatorTarget に残る）。
 * ・演出（作者メモ）: 朝に、煽った相手のカードが 📢 の面（stage.js の AGIT_MARK "__agit"）でめくれる（煽動者本人の画面だけ。
 *   朝の開示 rev "peek"。傭兵の 🛡️・番犬の 🦴 と同じ作り）。マイクラ版に煽動の公開通知は無いため、対象が誰かは他言されない。
 * ・結果情報（第6バッチ共通指示）: 最終役職が煽動者の人について「煽動者 {名前} は {対象} を煽っていました。」
 *   （net.js の res.agitators → ui.js に「煽動者:」行）。煽っていない場合は「煽動者 {名前} は誰も煽りませんでした。」
 *   マイクラ版に結果情報の行は無いが、バッチ共通指示に合わせて Web版の他役職（猪の狂人など）と同じ形で出す。
 * ・結果開示（COボタン）: 煽った相手を選んで「{対象} を煽りました。」（マイクラ版の結果開示フォームと同じ）。
 * ・ハッキング: 煽動者はハッキングの対象にも思い込みの対象にもなる。思い込んだ人は夜に偽の対象を選び
 *   （silver_wolf.js の fakeResult に agitator 分岐。本物の盤面・記録には影響しない。朝の 📢 演出も本物と同じ）。
 *   本物の煽動者がハッキングされている場合は上の背景解決(1)。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（村人陣営）。闇の化身・銀色の影の対象外。
 *   コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に最初から入っている）。シャッフラーの山札には入らない
 *   （マイクラ版 shufflerEligibleRoles の除外どおり。shuffler.js の BLOCKED に追加）。模倣の人狼は模倣できる
 *   （NON_MIMICABLE_ROLES に無い）。ペルソナの仮面候補からも外れていない（persona.js の除外リストに無い）。
 * ・封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。封印されていると夜の選択が共通処理で失敗する。
 *   カルメン・黄泉・鍵師の対象外（マイクラ版の各リストに無い。鍵師の「ロック対象の役職変化系」は役職変化系だけの一覧）。
 *   詩人・観測の人狼の対象（info.observe = "player"）。見張り番・鈴の巫女の対象リストにはマイクラ版で入っている
 *   （見張り番は移植済みで、対象リスト側に最初から入っている。鈴の巫女は第6バッチ後続のため接続はそちらで）。
 * ・酔い覚め: マイクラ版では酔いが覚めた議論中の連鎖でも煽動者を使える（夜能力の昼 dispatch に含まれる）ため、
 *   noDayChain は付けない（見張り番と違う。マイクラ版 ROLE_INFO にも酔い覚め不可の注記は無い）。朝のうちの連鎖（墓荒らし・ドッペル）も使える。
 * ・CPU: 夜は全参加者（自分を含む）から1人をランダムに選ぶ（マイクラ版CPUは game.participants から選ぶ。デバッグ指定があればそれ）。
 *   真COは「{対象}を煽りました」と開示する（マイクラ版CPUの真申告と同じ）。騙りも同じ形で適当な相手を言う。
 * 状態: g.agitatorTarget = { 煽った人のID: 煽られた人のID }（人に紐づく。試合ごとに net.startGame が {} に戻し、ホスト引き継ぎキーにも追加済み）
 */
(function (ONW) {
  const ID = "agitator";
  const AGIT_MARK = "__agit";   // stage.js の AGIT_MARK と同じ文字列。📢 の面（朝に煽動者本人の画面でだけめくれる）
  /** この加算の仕組みを使う役職（マイクラ版では煽動者と狂った煽動者が同じ game.agitatorTarget を使う） */
  const ROLES = ["agitator", "mad_agitator"];
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
  const labelOf = (r) => (r === "mad_agitator" ? "狂った煽動者" : "煽動者");
  const pickText = (name) => `${name} を煽りました。`;
  const logText = (label, p, nameOf, t) => `${label} ${p.name} は ${nameOf(t)} を煽りました（投票+1）。`;

  /** その人が煽った相手（決まっていなければ null。人に紐づく記録なので、最終盤面でも「煽った人」で引く） */
  function targetOf(g, id) {
    const t = (g && g.agitatorTarget || {})[id];
    return t && (g.players || []).some((q) => q.id === t) ? t : null;
  }
  function setTarget(g, id, t) { (g.agitatorTarget = g.agitatorTarget || {})[id] = t; }

  /**
   * 背景解決（マイクラ版 resolveHackedAgitatorBackgroundTargets / resolveGremlinCopiedAgitatorTargets）:
   * 集計・結果情報・実績の入口で呼び、未確定の分だけ g.agitatorTarget に埋める（1回埋めたら残るので結果は安定する）。
   * (1) ハッキングされている本物の煽動者（煽動者と思い込めなかった人）: ランダムな1人を煽った扱いにする（封印中は除く）。
   * (2) グレムリンのコピー先が煽動者で、コピー元が煽っていれば、コピー先も同じ相手を煽った扱いにする。
   */
  function settleBackground(g) {
    if (!g || !g.currentRoles) return;
    const map = (g.agitatorTarget = g.agitatorTarget || {});
    (g.players || []).forEach((p) => {
      if (!ROLES.includes((g.currentRoles || {})[p.id]) || map[p.id]) return;
      const hack = (g.hackRole || {})[p.id];
      if (!hack || hack === (g.currentRoles || {})[p.id]) return;   // ハッキングされていない（または思い込み先が本物と同じ）なら対象外
      if (ONW.seal && ONW.seal.is(g, p.id)) return;   // 封印されている煽動者は背景でも煽らない（マイクラ版どおり）
      const cand = (g.players || []).map((q) => q.id);
      if (cand.length) map[p.id] = cand[Math.floor(Math.random() * cand.length)];
    });
    Object.values(g.gremlinPicks || {}).forEach((pair) => {
      if (!Array.isArray(pair)) return;
      const src = pair[0], dst = pair[1];
      if (!src || !dst || src === dst) return;
      if (!ROLES.includes((g.currentRoles || {})[dst]) || map[dst]) return;   // コピー先が今も煽動者で、まだ煽っていないときだけ
      if (map[src]) map[dst] = map[src];   // コピー元が煽っていれば同じ相手（コピー元がまだなら、次に集計する時に埋まる）
    });
  }

  /**
   * 疑似票の最終的な投票先（マイクラ版 effectiveVoteRecords の中での疑似票の動きを再現）:
   * ペンギンの滑り（実票と同じ順・同じ規則で、疑似票だけをもう1票として通す）→ 交換者の入れ替え（使った順）。
   * 御乱心・羊の狂人は「投票者本人の票」を書き換える処理なので、疑似票（投票者ではない）には効かない（マイクラ版も同じ）。
   */
  function effectiveTarget(g, t0) {
    let t = t0;
    if (ONW.vote && ONW.vote.sheepRun && ONW.vote.penguinOn) {
      const KEY = "agitator:__x", votes = { ...ONW.vote.sheepRun(g).votes, [KEY]: t0 };
      (g.players || []).forEach((p) => {
        if (!ONW.vote.penguinOn(g, p.id)) return;
        const to = votes[p.id];
        if (!to) return;   // ペンギンが投票していなければ何も起きない（実票の penguinRun と同じ）
        Object.keys(votes).forEach((vid) => { if (vid !== p.id && votes[vid] === p.id) votes[vid] = to; });
      });
      t = votes[KEY];
    }
    if (ONW.vote && ONW.vote.exchangeLive) (g.exchanges || []).filter((e) => ONW.vote.exchangeLive(g, e)).forEach((e) => { if (t === e.a) t = e.b; else if (t === e.b) t = e.a; });
    return t;
  }

  /**
   * 投票への加算（vote.js の tally が、交換者の入れ替えのあと・番犬の無効化より前に呼ぶ。counts はその場で書き換える）。
   * ・煽った人の現在の役職・生死は問わない（マイクラ版: 疑似票の投票者は noVoteIds / deadIds の対象にならない）。
   * ・最終先が昼中に死亡していれば足さない（マイクラ版 invalidTarget）。番犬の飼い主への加算は、このあとの番犬の無効化で消える。
   * ・妖狐投票も同じ tally を使うため、そのまま加算される（マイクラ版も妖狐投票は countVotes で数える）。
   */
  function applyVotes(g, counts) {
    if (!g || !g.currentRoles) return counts;
    settleBackground(g);
    Object.entries(g.agitatorTarget || {}).forEach(([, t0]) => {
      if (!t0) return;
      const t = effectiveTarget(g, t0);
      if (!t || (g.deadIds || []).includes(t)) return;
      counts[t] = (counts[t] || 0) + 1;
    });
    return counts;
  }

  /** 結果発表の「役職情報」の行（最終役職が煽動者の人だけ。背景解決もここで確定させる） */
  function lines(g, nm2) {
    settleBackground(g);
    return (g.players || []).filter((p) => ROLES.includes((g.currentRoles || {})[p.id])).map((p) => {
      const label = labelOf((g.currentRoles || {})[p.id]), t = targetOf(g, p.id);
      return t ? `${label} ${nm2(p.id)} は ${nm2(t)} を煽っていました。` : `${label} ${nm2(p.id)} は誰も煽りませんでした。`;
    });
  }

  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_agitator");
    settleBackground(g);
    const t = targetOf(g, id);
    if (t) {
      const executed = g.executed || [];
      // 独裁の裏で、もう一人（マイクラ版 agitatorCausedExtraExile）: 独裁処刑が実行された試合で、煽動先（独裁先とは別人）も死亡者に入った。役職ゲートなし
      if (g.dictator && !g.dictator.coup && t !== g.dictator.target && executed.includes(t)) out.push("agitator_extra_exile");
      // クーデターの鎮圧（マイクラ版 agitatorSuppressedCoup）: 独裁者がいる試合でクーデターが起きず、煽動先の反逆の狂人が死亡者に入った。役職ゲートなし
      const dictatorInGame = !!g.dictator || (g.players || []).some((p) => (g.initialRoles || {})[p.id] === "dictator" || (g.currentRoles || {})[p.id] === "dictator");
      if (dictatorInGame && !(g.dictator && g.dictator.coup) && (g.currentRoles || {})[t] === "rebel_madman" && executed.includes(t)) out.push("agitator_coup_suppressed");
    }
    if (fin !== ID) return out;
    if (won) out.push("win_agitator"); else out.push("agitator_loss");
    if (t) {
      // 双極の煽動: 煽動者と狂った煽動者がお互いに煽動する（マイクラ版 hasMutualAgitation。狂った煽動者側の実績でも同じ判定をする）
      if ((g.currentRoles || {})[t] === "mad_agitator" && (g.agitatorTarget || {})[t] === id) out.push("agitator_mutual");
    }
    return out;
  }

  const H = (ONW.agitator = { targetOf, setTarget, settleBackground, effectiveTarget, applyVotes, lines, achievements, AGIT_MARK, ROLES });

  // ---- CPUの夜の行動: 全参加者（自分を含む）から1人をランダムに選ぶ（デバッグの指定があればそれ。マイクラ版CPUは game.participants から選ぶ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const hidden = ONW.rabbitMadman && ONW.rabbitMadman.hiddenId ? ONW.rabbitMadman.hiddenId(g) : null;
    const cand = g.players.filter((q) => !(g.deadIds || []).includes(q.id) && q.id !== hidden);
    const t = (f.player && cand.some((q) => q.id === f.player)) ? g.players.find((q) => q.id === f.player) : n.pick(cand);
    if (!t) return;
    setTarget(g, p.id, t.id);
    i.agitatorTarget = t.id;   // 発言（結果開示）が使う
    g.nightLogsAll.push(logText(label, p, n.nameOf, t.id));
    n.hold(p.id, pickText(t.name));
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }
  /** 本物の煽動者の発言: 煽った相手を開示する（マイクラ版CPUの真申告「○○を煽りました」と同じ） */
  function cpuClaim(k, g, p, r, i, c) {
    const tid = (i && i.agitatorTarget) || targetOf(g, p.id);
    if (!tid) return;
    c.co = ID;
    c.result = { short: `${nm(g, tid)} を煽りました`, text: `${nm(g, tid)} を煽りました。`, claim: { kind: ID, target: tid } };
  }
  /** 騙りの結果開示: 適当な相手を煽ったことにする（マイクラ版の騙り煽動と同じ形） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)];
    return { co, result: { short: `${t.name} を煽りました`, text: `${t.name} を煽りました。`, claim: { kind: ID, target: t.id } } };
  }

  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 161, count: 0, name: "煽動者", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 23.7,
      desc: "村人陣営。夜に煽るプレイヤーを1人選択します。煽られたプレイヤーは投票される票数が1票加算されます。" },
    groups: { "transform:light_apostle": 61 },   // 光の使徒の変化先（村人系）のみ。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    achievements,
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>煽る相手</strong>のカードを1人分押してください。（<strong>自分も選べます</strong>）<br>煽られた人は、投票で<strong>得る票数が1票増えます</strong>。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>煽る相手</strong>のカードを押して（自分も選べます）",
    },
    stagePick: { self: true },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分も選べる。鍵師と同じ）
    cpuLie: { role: "agitator", weight: 20, order: 13, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    /** 墓荒らし・ドッペルゲンガーで煽動者を手にしたCPUが、続けて言う結果 */
    cpuChainResult(k, g, p, i) {
      const c = {}; cpuClaim(k, g, p, ID, i, c); return c.result || null;
    },
    cpuNight: { order: 14, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 14,   // 占い師(10)・番犬(12)・見張り番(13)のあと。役職変動系より前に選ぶ
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        setTarget(g, p.id, t);
        g.nightLogsAll.push(logText(c.rn(c.eff(p)), p, nameOf, t));
        c.hold(p.id, pickText(nameOf(t)));
        c.rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: AGIT_MARK }] };   // 朝: 煽った相手のカードが 📢 の面でめくれる（煽動者本人の画面だけ。作者メモ）
        ONW.observeNote(g, p.id, [t], null, c.eff(p));
        ONW.newsNote(g, c.eff(p));
      },
    },
    /** 墓荒らし・ドッペルゲンガーで煽動者を手にしたとき（朝のうち）と、酔い覚め（昼）: 煽る相手を1人選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        setTarget(g, id, t);
        g.nightLogsAll.push(logText(c.label, c.me, c.nameOf, t));
        ONW.observeNote(g, id, [t], null, ID);
        ONW.newsNote(g, ID);
        return { lines: [pickText(c.nameOf(t))], reveal: { kind: "peek", items: [{ k: `p:${t}`, role: AGIT_MARK }] }, nextChain: null };
      },
    },
    // 結果開示(COボタン)の流れ: 煽った相手を選ぶと、そのまま「○○ を煽りました。」を開示する（マイクラ版の結果開示フォームと同じ。猪の狂人の pickPlayer と同じ形）
    coResult: {
      kind: ID, targetLabel: "煽った相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を煽りました。`, { kind: ID, target: id }, null, "disclose", `${K.nameOf(id)} を煽りました`],
    },
  });
})(window.ONW = window.ONW || {});
