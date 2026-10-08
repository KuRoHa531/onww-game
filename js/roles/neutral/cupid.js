/**
 * キューピッド（マイクラ版 CUPID を参考）: 第三陣営（恋人陣営）。
 * 夜に自分以外の2人を選び、その2人が新しい恋人関係になる（キューピッド本人は恋人にならない。純愛者・悪女と違う点）。
 *   ・選んだ2人は「役職の持ち主」単位で記録（ONW.setRoleBound(g, "cupidPair", 持ち主ID, [A, B])）。
 *     役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。
 *   ・役職の入れ替え: キューピッドのカードが動いたときだけ記録が動く。選ばれた2人は「恋人の組」そのものなので、
 *     カードが選ばれた人の手に渡っても組は変わらない（純愛者・悪女のように「相手を元の持ち主に付け替える」ことはしない）。
 *   ・夜の選択: 上のテーブルから2人を押す。純愛者・悪女と同じ占い師の段階（order 21）で記録する。
 *   ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
 * 実装の進み具合は _wip/キューピッド_依頼文.txt を参照。
 *  1of4: 登録・夜の選択・役職移動への追従・ルールコード【済】 / 2of4: 恋人成立・朝の❤❤演出・待機時間の演出(自分と相方が同時に❤)・情報確認・再入室【済】 / 3of4: 酔っ払い・昼のうち・墓荒らし/ドッペル経由・後追い(vote.js kill / net.js killPlayer)・勝敗(vote.js 追加勝利)【済】 / 4of4: CPU(CO・投票)・COボタン・説明文・総合テスト【済】
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.CUPID;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 夜・朝のうちの選択を記録する（役職についていく）。配列は共有しないようコピーして持つ */
  function setPair(g, holderId, a, b) { ONW.setRoleBound(g, "cupidPair", holderId, [a, b]); }
  /** 最終盤面でキューピッドを持っている人の [持ち主, A, B]。2人とも実在し、別々で、持ち主自身でない記録だけ有効
   *  （墓地を経由して、自分が選ばれていたキューピッドを引いた場合などは、無効＝載せない） */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      const pr = ONW.getRoleBound(g, "cupidPair", p.id);
      if (!Array.isArray(pr) || pr.length !== 2) return;
      const [a, b] = pr, ok = (t) => t && g.players.some((q) => q.id === t);
      if (!ok(a) || !ok(b) || a === b) return;
      out.push([p.id, a, b]);
    });
    return out;
  }
  /** 恋人になる組 [[A, B, 持ち主], ...]（酔いが覚めていない持ち主は含めない）。3つ目の持ち主は、番号付け（キューピッドのカード単位）と
   *  「同じ組でも別のキューピッドなら別の恋人関係（恋人1と恋人2）」のために付ける。pure_lover.js の sync が g.pureLoverPairs に混ぜる */
  function pairs(g) { return picks(g).filter(([h]) => !ONW.hiddenDrunk(g, h)).map(([h, a, b]) => [a, b, h]).filter((pr) => !ONW.isBrokenRel(g, pr)); }   // 破局師に壊された組は含めない（後追い・追加勝利・恋人の組から外れる）
  /** 持ち主が自分の選んだ2人を「知らされている」ことの記録（自分で選んだとき。怪盗などでカードを受け取った人は知らされていない）: g.cupidSeen[持ち主] = "A>B" */
  const sig = (a, b) => a + ">" + b;
  const seen = (g, id, a, b) => { (g.cupidSeen = g.cupidSeen || {})[id] = sig(a, b); };
  /** 選ばれた人に、恋人になったことをもう知らせた記録: g.cupidTold["持ち主>選ばれた人"] = true */
  /** 「同じ恋人関係」の目印: キューピッドのカード（世代つき）＋選んだ2人。カードが怪盗などで別の持ち主へ動いても同じなので、選ばれた人に二度知らせない（コピーされたカードは別の関係＝また知らせる） */
  const relKey = (g, hold) => { const pr = ONW.getRoleBound(g, "cupidPair", hold); return Array.isArray(pr) && pr.length === 2 && ONW.pairKey ? "@" + ONW.pairKey(g, [pr[0], pr[1], hold]) : null; };
  const told = (g, hold, t) => { const T = g.cupidTold || {}, rk = relKey(g, hold); return !!T[hold + ">" + t] || !!(rk && T[rk + ">" + t]); };
  const setTold = (g, hold, t) => { const T = (g.cupidTold = g.cupidTold || {}), rk = relKey(g, hold); T[hold + ">" + t] = true; if (rk) T[rk + ">" + t] = true; };
  ONW.cupid = { nm, setPair, picks, pairs, seen, told, setTold, sig };
  const HEART = "__cupid";   // 💘（stage.js の CUPID_MARK）
  /** 朝: キューピッド目線で、選んだ2人のカードが❤でめくれる */
  const heartReveal = (a, b) => ({ kind: "peek", items: [{ k: `p:${a}`, role: HEART }, { k: `p:${b}`, role: HEART }] });
  // ---- CPUの夜の行動: 自分以外の2人をランダムに選ぶ（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id), others = g.players.filter((q) => q.id !== p.id);
    if (others.length < 2) return;
    let pair = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
    if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(others.filter((q) => !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
    const [a, b] = pair;
    setPair(g, p.id, a, b);
    seen(g, p.id, a, b);
    i.mode = "cupid"; i.pair = [a, b];
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, a)} と ${nm(g, b)} を恋人にしました。`);
    n.ob(p.id, [a, b]);
    n.nn(rid);
  }

  ONW.defineRole("cupid", {
    info: { deck: 56, name: "キューピッド", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 36.7,
      desc: "第三陣営（恋人陣営）。夜に自分以外の2人を選び、その2人を恋人にします（自分は恋人になりません）。朝、キューピッドから見て選んだ2人のカードが❤でめくれ、選ばれた2人は待機時間に自分と相方のカードが同時に❤でめくれます。恋人にした人が死ぬと、キューピッドも後を追います。選んだ2人がどちらも死なずに勝利したときは、あなたが吊られていても追加で勝利します。" },
    groups: { "transform:silver_shadow": 16 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる。ロビーの変化候補・固定役の変化指定・設定のOFF・ガイドはここから自動で出る）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>恋人にする2人</strong>のカードを押してください。（自分以外の2人）<br>選んだ2人が恋人になります。あなた自身は恋人になりません。${later}</p>${nowSel(" ／ ", 2)}`;
      },
      chainReady: (np) => np === 2,
      chainHow: () => "<strong>恋人にする2人</strong>のカードを押して（自分以外の2人）",
    },
    stagePick: { players: 2 },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人
    cpuNight: { order: 21, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 21,   // 占い師と同じ段階（純愛者・悪女と同じ）
      complete: (np) => np === 2,
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const [a, b] = c.selOf(p).players; if (!a || !b || a === b) return;
        setPair(g, p.id, a, b);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(a)} と ${nameOf(b)} を恋人にしました。`);
        c.hold(p.id, `${nameOf(a)} と ${nameOf(b)} を恋人にしました。`);
        ONW.observeNote(g, p.id, [a, b]);
        ONW.newsNote(g, "cupid");
        seen(g, p.id, a, b);
        c.rev[p.id] = heartReveal(a, b);   // 朝、選んだ2人のカードが❤でめくれる
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 恋人にした2人を選ぶ（2人の順序に意味はない）
    coResult: {
      kind: "cupid", twoHint: "恋人にした2人を選んでください。",
      pickTwo: (sel, K) => [`恋人にした2人は ${K.nameOf(sel[0])} と ${K.nameOf(sel[1])} です。`, { kind: "cupid", pair: [sel[0], sel[1]] }, null, "disclose", `${K.nameOf(sel[0])} ❤ ${K.nameOf(sel[1])}`],
    },
    /** CPUの発言: キューピッドのCPUは本当のCOをしない（恋人にした2人を開示しない）。必ず別の役職を騙る（天邪鬼と同じ扱い）。
     *  夜に恋人にした2人は覚えているので、投票では避ける（cpuVoteExclude） */
    cpuClaim(k, g, p, r, i, c) {
      const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result;
    },
    /** CPUの投票: キューピッドは、自分が恋人にした2人には投票しない（追放されると心中・後追いで巻き込まれるため）。2人を知っているときだけ */
    cpuVoteExclude: (k, g, p, q, i) => i.mode === "cupid" && (i.pair || []).includes(q.id),
    // ---- 待機時間の演出（朝のあと）: 最終盤面で決まるので、墓荒らし・ドッペル・怪盗など、どの経由でも同じように出る ----
    /** 選ばれた2人（酔いが覚めている人）の画面で、自分と相方のカードが同時に❤でめくれる（スターなどの役職の演出のあと）。
     *  持ち主が選んだ2人をまだ知らされていなければ（怪盗などでカードを受け取った人）、持ち主にも2人のカードが❤でめくれる。
     *  酔いが覚めていない人には出さない（覚めたあとの演出は 3of4）。何度呼んでも同じ結果（知らせた記録で重複を防ぐ） */
    settlePre: { order: 17, run(c) {
      const g = c.g, set = (g.cupidSettle = {});
      const add = (id, logs, items) => { if (ONW.hiddenDrunk(g, id)) return; const e = (set[id] = set[id] || { logs: [], items: [] }); e.logs.push(...logs); items.forEach((it) => { if (!e.items.some((x) => x.id === it.id)) e.items.push(it); }); };
      ONW.pureLover.sync(g);   // 恋人の組（キューピッドの2人を含む）を最終盤面から確定する
      picks(g).forEach(([hold, a, b]) => {
        if (ONW.hiddenDrunk(g, hold)) return;
        [[a, b], [b, a]].forEach(([x, y]) => {
          add(x, [`あなたはキューピッドに選ばれ、${nm(g, y)} と恋人になりました。`], [{ id: x, sim: true }, { id: y, sim: true }]);
          if (!ONW.hiddenDrunk(g, x)) setTold(g, hold, x);
        });
        if (hold !== a && hold !== b && (g.cupidSeen || {})[hold] !== sig(a, b)) add(hold, [`あなたの恋人にした2人は ${nm(g, a)} と ${nm(g, b)} です。`], [{ id: a, sim: true }, { id: b, sim: true }]);
        seen(g, hold, a, b);
      });
    } },
    settleMsg: { order: 27, run(c, p) { const e = (c.g.cupidSettle || {})[p.id]; return e ? { logs: e.logs.slice(), cupid: e.items.map((x) => ({ ...x })) } : {}; } },
    stageSettle: {
      field: "settleCupid", shown: "settleCupidShown",
      run: { order: 37, run(items, SK) {
        SK.later(() => {
          items.forEach((it, i) => SK.later(() => { SK.show(`p:${it.id}`, SK.CUPID_MARK, true); SK.paint(SK.G()); }, it.sim ? 0 : i * 380));   // 自分と相方は同時に❤
        }, 900);
      } },
    },
    // ---- 昼のうち（酔いが覚めた・役職が動いた・昼に墓荒らし/ドッペルで選んだ）: 恋人の組を作り直し、新しく成立した組を知らせる（3of4）----
    /** 新しく成立した組: 選ばれた人（酔いが覚めている人）の画面では、自分と相方のカードが同時に❤でめくれ（jobday の items）、持ち主にもまだ知らされていなければ選んだ2人のカードが同時に❤で出る。
     *  酔いが覚めた本人には soberExtra でまとめて知らせる（二重に出さない）。何度呼んでもよい（知らせた記録 g.cupidTold / g.cupidSeen で重複を防ぐ）。
     *  net.js の dayCheck(昼に役職が動いた・昼に選んだ) と daySober(酔いが覚めた直後) から呼ばれる */
    dayCheck(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      ONW.pureLover.sync(g);   // 恋人の組（キューピッドの2人を含む）を最終盤面から作り直す
      picks(g).forEach(([hold, a, b]) => {
        if (ONW.hiddenDrunk(g, hold)) return;   // 酔いが覚めていない持ち主の選択は、覚めたあとに出す
        const hn = nm(g, hold), hp = g.players.find((q) => q.id === hold);
        [[a, b], [b, a]].forEach(([x, y]) => {
          const xp = g.players.find((q) => q.id === x);
          if (!xp || told(g, hold, x) || ONW.hiddenDrunk(g, x) || c.isDead(x)) return;
          setTold(g, hold, x);
          if (xp.isCpu) return;
          const text = `あなたはキューピッドに選ばれ、${nm(g, y)} と恋人になりました。`;
          g.nightLogsAll.push(`${c.rn(R_())} ${hn} が ${xp.name} と ${nm(g, y)} を恋人にしました。`);
          c.hold(x, text); c.send(x, { t: "jobday", id: y, text, role: HEART, items: [{ id: x, role: HEART }, { id: y, role: HEART }] });   // 自分と相方が同時に❤
        });
        if (hold !== a && hold !== b && hp && (g.cupidSeen || {})[hold] !== sig(a, b) && !c.isDead(hold)) {   // 持ち主がまだ知らされていない（怪盗などでカードを受け取った）: 選んだ2人のカードが同時に❤
          seen(g, hold, a, b);
          if (!hp.isCpu) { const text = `あなたの恋人にした2人は ${nm(g, a)} と ${nm(g, b)} です。`; c.hold(hold, text); c.send(hold, { t: "jobday", id: a, text, role: HEART, items: [{ id: a, role: HEART }, { id: b, role: HEART }] }); }
        }
      });
    },
    daySober(c) { ONW.roleDef(R_()).dayCheck(c); },
    /** 酔いが覚めた本人に、キューピッドの情報をまとめて出す(net.js の soberUp): キューピッドの持ち主なら選んだ2人のカードの❤、選ばれていれば自分と相方の❤。peek は stageSober の list がめくる。
     *  持ち主が酔い中の選択は出さない（持ち主が覚めたときに、持ち主→選ばれた人の順で知らされる） */
    soberExtra(c, id) {
      const g = c.g, lines = [], peek = { cupidMates: [], cupidBy: [] };
      ONW.pureLover.sync(g);   // 覚めた人を含めて恋人の組を作り直す
      picks(g).forEach(([hold, a, b]) => {
        if (ONW.hiddenDrunk(g, hold)) return;
        if (hold === id && hold !== a && hold !== b && (g.cupidSeen || {})[hold] !== sig(a, b)) {
          lines.push(`あなたの恋人にした2人は ${nm(g, a)} と ${nm(g, b)} です。`);
          peek.cupidMates.push(a, b);
          seen(g, hold, a, b);
        }
        [[a, b], [b, a]].forEach(([x, y]) => {
          if (x === id && !told(g, hold, x)) { lines.push(`あなたはキューピッドに選ばれ、${nm(g, y)} と恋人になりました。`); peek.cupidBy.push(y); setTold(g, hold, x); }
        });
      });
      const any = peek.cupidMates.length || peek.cupidBy.length;
      return { lines, peek: any ? peek : {} };
    },
    /** 酔いが覚めた画面: 持ち主なら選んだ2人のカードが❤でめくれる。選ばれた人は、自分が「恋人」にめくれるのと同時に相方のカードが❤（stage.js の恋人の演出と同じ流れ）で出る */
    stageSober: { list: { order: 98, run(sp, list, SK) {
      (sp.cupidMates || []).forEach((t) => { if (!list.some((x) => x[0] === `p:${t}`)) list.push([`p:${t}`, SK.CUPID_MARK, true]); });
      (sp.cupidBy || []).forEach((t) => { if (t !== sp.love && !list.some((x) => x[0] === `p:${t}`)) list.push([`p:${t}`, SK.CUPID_MARK, true]); });
    } } },
    /** 墓荒らし・ドッペルゲンガーでキューピッドを手にしたとき: 朝のうちに2人選べる */
    morning: {
      run(c) {
        if (c.players.length < 2) return null;
        const g = c.g, id = c.id, [a, b] = c.players;
        setPair(g, id, a, b);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(a)} と ${c.nameOf(b)} を恋人にしました。`);
        seen(g, id, a, b);
        return { lines: [`${c.nameOf(a)} と ${c.nameOf(b)} を恋人にしました。`], reveal: heartReveal(a, b), nextChain: null };
      },
    },
  });
})(window.ONW);
