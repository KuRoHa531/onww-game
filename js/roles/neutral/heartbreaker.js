/**
 * 破局師（マイクラ版 HEARTBREAKER を参考）: 第三陣営（恋人陣営の「破局」側）。
 * 夜に自分以外の1人を選ぶ。選んだ人が恋人関係の中にいたら、その恋人関係を壊す（破局）。破局に成功すると追加勝利（マイクラ版 vote.js と同じ）。
 *   ・選んだ相手は「役職の持ち主」単位で記録（ONW.setRoleBound(g, "breakerTargets", 持ち主ID, 相手ID)）。
 *     役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。相手(対象のプレイヤー)はプレイヤー単位のまま。
 *   ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
 *   ・処理順（_wip/役職の処理順.txt）: 純愛者 → 悪女 → キューピッド → 破局師 → …。破局師は「恋人を作る役職が全員終わったあと」に判定する
 *     （＝あとから恋人になった人=墓荒らし・ドッペル・怪盗などで入れ替わったあとの恋人は破局の対象外）。night.order は 22（純愛者・悪女・キューピッドの21の直後）。
 * 実装の進み具合は _wip/破局師_依頼文.txt を参照。
 *  1of4: 登録・夜の選択・役職移動への追従・ルールコード・処理順メモ【済】 / 2of4: 破局の判定(処理順どおり)・待機時間の💔演出・情報確認・再入室・結果画面の恋人の印【済】 / 3of4: 酔い・昼のうち・墓荒らし/ドッペル経由・追加勝利【済】 / 4of4: CPU(CO・投票)・COボタン・闇鍋シナジー・ガイド・総合テスト【済】
 *  破局の判定は「破局師のカード1枚につき1回だけ」（g.breakerApplied にそのカードの記録があれば、選び直しても二度目は壊さない）。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.HEARTBREAKER;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 最終盤面で破局師を持っている人の [持ち主, 選んだ相手]（相手が自分自身・実在しない記録は除く） */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      const t = ONW.getRoleBound(g, "breakerTargets", p.id);
      if (!t || t === p.id || !g.players.some((q) => q.id === t)) return;
      out.push([p.id, t]);
    });
    return out;
  }
  /** 選んだことの記録（役職についていく。移動「あと」に選んでも現在の持ち主に予約される） */
  function setTarget(g, holderId, t) { ONW.setRoleBound(g, "breakerTargets", holderId, t); }
  /** いま成立している恋人関係（壊れていないもの）: 配布時の組 + 純愛者・悪女・キューピッドの組。key は壊れた印(g.brokenKeys)のキー */
  function relations(g) {
    const out = [];
    ONW.dealtPairs(g).forEach(([a, b]) => { if (!ONW.brokenDealt(g, a, b)) out.push({ key: "d:" + a + ">" + b, a, b }); });
    ONW.pureLover.allPairs(g).forEach((pr) => out.push({ key: ONW.relKey(g, pr), a: pr[0], b: pr[1], o: pr[2] || null }));   // o = キューピッドの持ち主（純愛者・悪女の組は a が持ち主）
    return out;
  }
  /** t が入っている恋人関係すべて（マイクラ版 tryHeartbreakTarget: 悪女本人・本命も、その人が属する恋人関係として含まれる。キープ・恋人でない人は空＝失敗） */
  const plan = (g, t) => relations(g).filter((r) => r.a === t || r.b === t);
  const applied = (g, h, t) => !!(g.breakerApplied || {})[ONW.cardAt(g, h) + ">" + t];
  /** このカードがすでに判定を終えたか（成功・失敗を問わない）。破局の判定はカード1枚につき1回だけ */
  const judged = (g, card) => Object.keys(g.breakerApplied || {}).some((k) => k.startsWith(card + ">"));
  /** 壊す。壊した恋人のペアは、破局師のカード(持ち主ではなくカード)に記録し、待機時間の💔演出で出す。破局師の記録・成功は役職のカードについていく。
   *  すでに判定を終えたカードは（選び直されても）二度目は壊さない。戻り値 = 実際に壊した関係 */
  function commit(g, h, t, rels) {
    const card = ONW.cardAt(g, h);
    if (judged(g, card)) return [];
    (g.brokenKeys = g.brokenKeys || {});
    rels.forEach((r) => { g.brokenKeys[r.key] = true; });
    (g.breakerApplied = g.breakerApplied || {})[card + ">" + t] = true;
    if (!rels.length) return [];
    // CPUは「壊れたこと」を知らされない: 恋人だと知っていた人（配布時の相方・自分で選んだ純愛者/悪女の持ち主）は、壊れたあとも恋人だと思い続ける。投票の相方避けに使う
    const bw = (g.breakerBelief = g.breakerBelief || {}), say = (x, y) => { (bw[x] = bw[x] || []); if (!bw[x].includes(y)) bw[x].push(y); };
    rels.forEach((r) => { if (r.key.startsWith("d:")) { say(r.a, r.b); say(r.b, r.a); } else if (!r.o) say(r.a, r.b); });
    (g.breakerSuccess = g.breakerSuccess || {})[card] = true;
    const L = ((g.breakerShow = g.breakerShow || {})[card] = (g.breakerShow || {})[card] || []);
    rels.forEach((r) => { if (!L.some((x) => (x[0] === r.a && x[1] === r.b) || (x[0] === r.b && x[1] === r.a))) L.push([r.a, r.b]); });
    rels.forEach((r) => g.nightLogsAll.push(`破局師 ${nm(g, h)} が ${nm(g, r.a)} と ${nm(g, r.b)} の恋人関係を破局させました。`));
    return rels;
  }
  // ---- 💔を「もう知らされた」記録: g.breakerSeen["持ち主|小>大"]（持ち主ごと。カードが人から人へ動いたら、新しい持ち主にはまだ知らされていない） ----
  const pkey = (a, b) => (a < b ? a + ">" + b : b + ">" + a);
  const seenK = (h, a, b) => h + "|" + pkey(a, b);
  const isSeen = (g, h, a, b) => !!(g.breakerSeen || {})[seenK(h, a, b)];
  const markSeen = (g, h, a, b) => { (g.breakerSeen = g.breakerSeen || {})[seenK(h, a, b)] = true; };
  const showOf = (g, h) => (g.breakerShow || {})[ONW.cardAt(g, h)] || [];
  /** h がまだ知らされていない、壊したペア */
  const unseen = (g, h) => showOf(g, h).filter(([a, b]) => !isSeen(g, h, a, b));
  const pairText = (g, a, b) => `${nm(g, a)} と ${nm(g, b)} の恋人関係を破局させました。`;
  /** 昼のうちの判定（酔いが覚めた・役職が動いた・昼に選んだ）: まだ判定していないカードを、その時点の盤面でまとめて（同時に）判定する。
   *  酔いが覚めていない持ち主・死んだ持ち主は判定しない。wake = いま覚めた人の id の集合（覚めた瞬間は酔い扱いのまま判定に入れる）。戻り値 = 判定した [持ち主, 相手] */
  function judgeDay(g, isDead, wake) {
    const todo = picks(g).filter(([h]) => (!ONW.hiddenDrunk(g, h) || (wake && wake.has(h))) && !isDead(h) && !judged(g, ONW.cardAt(g, h)));
    if (!todo.length) return [];
    todo.map(([h, t]) => [h, t, plan(g, t)]).forEach(([h, t, rels]) => commit(g, h, t, rels));   // 判定前の盤面で全員ぶん決めてから壊す（同時判定）
    ONW.pureLover.sync(g);   // 壊れた関係を恋人の組から外す（結果画面の恋人の印の履歴もここで残る）
    return todo;
  }
  /** 昼のうち: 酔いが覚めている持ち主（人間）に、まだ知らされていない破局を知らせる。壊したペアのカードが同時に💔でめくれて閉じる（jobday）。CPUは知らされた扱いにするだけ */
  function announce(c) {
    const g = c.g;
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_() || ONW.hiddenDrunk(g, p.id) || c.isDead(p.id)) return;
      const L = unseen(g, p.id); if (!L.length) return;
      L.forEach(([a, b]) => markSeen(g, p.id, a, b));
      if (p.isCpu) return;
      const text = L.map(([a, b]) => pairText(g, a, b)).join(" "), items = [];
      L.forEach(([a, b]) => [a, b].forEach((id) => { if (!items.some((x) => x.id === id)) items.push({ id, role: "__break" }); }));
      c.hold(p.id, text); c.send(p.id, { t: "jobday", id: items[0].id, text, role: "__break", items });
    });
  }
  /** この人が(カードとして)破局に成功したか */
  const succeeded = (g, h) => !!(g.breakerSuccess || {})[ONW.cardAt(g, h)];
  /** CPUが「まだ恋人だ」と思っている相手（破局で壊されたことは知らされない）。恋人として数える ONW.loverMates に入らないぶんだけ返す */
  const believed = (g, id) => ((g.breakerBelief || {})[id] || []).filter((x) => x !== id && !ONW.loverMates(g, id).includes(x));
  ONW.heartbreaker = { nm, picks, setTarget, relations, plan, commit, applied, succeeded, judged, judgeDay, announce, unseen, isSeen, markSeen, believed };
  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    setTarget(g, p.id, t.id);
    i.mode = "heartbreaker"; i.target = t.id;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を破局対象に選びました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  ONW.defineRole("heartbreaker", {
    info: { deck: 57, name: "破局師", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 36.8,
      desc: "第三陣営（破局の側）。夜に自分以外の1人を選びます。選んだ人が恋人関係にあれば、その恋人関係を壊します（破局）。待機時間に、破局させた恋人のペアのカードが💔でめくれます。選ばれた人・恋人の人には何も知らされません。破局に成功すると、あなたも追加で勝利します。（闇鍋で破局師が出るときは、悪女・純愛者・キューピッドのどれかも必ず出ます。）" },
    groups: { "transform:silver_shadow": 17 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>破局させたい相手</strong>のカードを1人分押してください。（自分以外）<br>その人が恋人関係にあれば、恋人関係を壊します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>破局させたい相手</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 破局対象に選んだ相手を選ぶ（マイクラ版と同じ。破局が成功したかどうかは言わない）
    coResult: {
      kind: "heartbreaker", targetLabel: "破局対象に選んだ相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を破局対象に選びました。`, { kind: "heartbreaker", target: id }, null, "disclose", `破局 → ${K.nameOf(id)}`],
    },
    /** CPUの発言: 本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（破局対象に選んだ相手を開示）、残りは騙り。相手を知らない（怪盗で奪った等）ときは本当のCOはしない */
    cpuClaim(k, g, p, r, i, c) {   // 第三陣営の役職は名乗らない: 必ず他の村役職を騙る（本当のCOはしない）
      const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result;
    },
    cpuNight: { order: 22, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 22,   // 占い師と同じ段階。純愛者・悪女・キューピッド(21)の直後（処理順メモ参照）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t || t === p.id) return;
        setTarget(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を破局対象に選びました。`);
        c.hold(p.id, `${nameOf(t)} を破局対象に選びました。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "heartbreaker");
      },
    },
    /** 判定のタイミング(処理順): 夜の「占い師の段階」(純愛者・悪女・キューピッド・破局師)が人間もCPUも終わった時点で、まとめて判定する。
     *  このとき恋人になっている関係だけが壊れる（墓荒らし・ドッペル・怪盗などで、このあとに入れ替わってできた関係は対象外）。
     *  同じ時点の判定なので、破局師が複数いても同時に壊す（先に壊れた関係に邪魔されない）。酔いが覚めていない破局師は判定しない（3of4）。 */
    stageEnd: { order: 22, run(c, kind) {
      if (kind !== "seer") return;
      const g = c.g, todo = picks(g).filter(([h, t]) => !ONW.hiddenDrunk(g, h) && !applied(g, h, t));
      if (!todo.length) return;
      todo.map(([h, t]) => [h, t, plan(g, t)]).forEach(([h, t, rels]) => commit(g, h, t, rels));
      ONW.pureLover.sync(g);   // 壊れた関係を恋人の組から外す（結果画面の恋人の印の履歴もここで残る）
    } },
    // ---- 待機時間の演出（朝のあと）: 破局師(最終盤面でそのカードを持っている人)の画面で、壊した恋人のペアのカードが💔でめくれる。選ばれた人・恋人本人には何も出ない ----
    settlePre: { order: 18, run(c) {
      const g = c.g, set = (g.breakerSettle = {});
      g.players.forEach((p) => {
        if (g.currentRoles[p.id] !== R_() || ONW.hiddenDrunk(g, p.id)) return;
        const L = (g.breakerShow || {})[ONW.cardAt(g, p.id)];
        if (!L || !L.length) return;
        const items = [], logs = [];
        L.forEach(([a, b]) => { logs.push(`${nm(g, a)} と ${nm(g, b)} の恋人関係を破局させました。`); [a, b].forEach((id) => { if (!items.some((x) => x.id === id)) items.push({ id, sim: true }); }); });
        set[p.id] = { logs, items };
        L.forEach(([a, b]) => markSeen(g, p.id, a, b));   // 待機時間に見せた分は「知らされた」。昼のうちに同じ💔を二重に出さない
      });
    } },
    settleMsg: { order: 28, run(c, p) { const e = (c.g.breakerSettle || {})[p.id]; return e ? { logs: e.logs.slice(), breaker: e.items.map((x) => ({ ...x })) } : {}; } },
    stageSettle: {
      field: "settleBreaker", shown: "settleBreakerShown",
      run: { order: 38, run(items, SK) {
        SK.later(() => { items.forEach((it) => SK.show(`p:${it.id}`, SK.BREAK_MARK, true)); SK.paint(SK.G()); }, 900);   // 壊れたペアのカードが同時に💔
      } },
    },
    /** 墓荒らし・ドッペルゲンガーで破局師を手にしたとき（朝のうち）/ 酔いが覚めた破局師が昼に選び直したとき: 1人選べる。
     *  朝のうちは待機時間の💔で、昼のうちは文章（と💔のカード）で知らされる。判定は「その時点の盤面」。すでに判定を終えたカードは二度目は壊さない（選択だけ記録） */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        if (t === id) return null;
        setTarget(g, id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を破局対象に選びました。`);
        const lines = [`${c.nameOf(t)} を破局対象に選びました。`];
        if (!ONW.hiddenDrunk(g, id) && !applied(g, id, t)) {
          const broken = commit(g, id, t, plan(g, t)); ONW.pureLover.sync(g);   // 朝のうちに選んだ分は、その時点（夜の入れ替えが全部終わった盤面）の恋人関係を壊す
          if (c.PH && g.phase === c.PH.ONLINE_DAY) broken.forEach((r) => { lines.push(pairText(g, r.a, r.b)); markSeen(g, id, r.a, r.b); });   // 昼: 結果の文章で知らせる（待機時間の演出はない）
        }
        return { lines, reveal: null, nextChain: null };
      },
    },
    // ---- 昼のうち（酔いが覚めた・役職が動いた・昼に選び直した）----
    /** 酔いが覚める直前（net.js soberUp）: 覚める人の中に破局師(のカード)がいれば、その時点の盤面で判定する。同時に覚める人は全員ぶんまとめて判定（先に壊れた関係に邪魔されない） */
    soberJudge(c, ids) { judgeDay(c.g, c.isDead, new Set(ids)); },
    /** 酔いが覚めた本人に、破局の結果をまとめて出す(net.js soberUp): 破局師の持ち主なら、壊したペアのカードが💔。peek は stageSober の list がめくる。選ばれた人・恋人には何も出ない */
    soberExtra(c, id) {
      const g = c.g;
      if (g.currentRoles[id] !== R_()) return {};
      const L = unseen(g, id); if (!L.length) return {};
      const lines = [], mates = [];
      L.forEach(([a, b]) => { lines.push(pairText(g, a, b)); markSeen(g, id, a, b); [a, b].forEach((x) => { if (!mates.includes(x)) mates.push(x); }); });
      return { lines, peek: { breakMates: mates } };
    },
    stageSober: { list: { order: 99, run(sp, list, SK) {
      (sp.breakMates || []).forEach((t) => { if (!list.some((x) => x[0] === `p:${t}`)) list.push([`p:${t}`, SK.BREAK_MARK, true]); });
    } } },
    /** 昼のうちに役職が動いた・昼に選び直した: まだ判定していないカード（酔いが覚めた持ち主）を判定し、まだ知らされていない持ち主に知らせる（何度呼んでもよい）。net.js の dayCheck から呼ばれる */
    dayCheck(c) {
      if (c.g.phase !== c.PH.ONLINE_DAY) return;
      judgeDay(c.g, c.isDead); announce(c);
    },
    daySober(c) { ONW.roleDef(R_()).dayCheck(c); },
  });
})(window.ONW);
