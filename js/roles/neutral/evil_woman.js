/**
 * 悪女（マイクラ版 EVIL_WOMAN を参考）: 第三陣営（恋人陣営）。
 * 夜に「本命」1人と「キープ」1人を選ぶ。自分と本命が新しい恋人関係になる。キープは恋人にはならない。
 *   ・選んだ相手は「役職の持ち主」単位で記録（ONW.setRoleBound(g, "akujoHonmei"/"akujoKeep", 持ち主ID, 相手ID)）。
 *     役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。
 *     役職が「選ばれた相手」本人の手に渡ったら、本命・キープは元の持ち主に付け替える（state.js の swapBound。自分自身は本命にもキープにもなれない）。
 *   ・夜の選択: 上のテーブルから2人を押す。1人目=本命・2人目=キープ。純愛者と同じ占い師の段階（order 21）で記録する。
 *   ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
 * 実装の進み具合は _wip/悪女_依頼文.txt を参照。
 *  1of4: 登録・夜の選択・役職移動への追従(役職入れ替えの判定)・ルールコード / 2of4: 恋人成立(自分と本命)・朝の❤/♡演出・待機時間の演出【済】 / 3of4: 酔っ払い・昼のうちの役職移動・墓荒らし/ドッペル経由(昼に選んだ)の演出【済】 / 4of4: CPU(CO・結果開示)・COボタンの結果開示・ガイド・総合テスト【済】
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.EVIL_WOMAN;
  let evilKeys = [];   // 待機時間に札(丸いハート)を付けた席
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 夜・朝のうちの選択を記録する: 本命・キープとも役職についていく */
  function setPicks(g, holderId, honmei, keep) {
    ONW.setRoleBound(g, "akujoHonmei", holderId, honmei);
    ONW.setRoleBound(g, "akujoKeep", holderId, keep);
  }
  /** 最終盤面で悪女を持っている人の [持ち主, 本命, キープ]。自分自身・存在しない相手・本命と同じ人は無効（その項目だけ null。本命もキープも無効なら載せない）。
   *  墓地を経由して、自分が選ばれていた悪女を引いた場合なども、無効の項目だけが外れる */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      const ok = (t) => (t && t !== p.id && g.players.some((q) => q.id === t) ? t : null);
      const h = ok(ONW.getRoleBound(g, "akujoHonmei", p.id));
      let k = ok(ONW.getRoleBound(g, "akujoKeep", p.id)); if (k === h) k = null;
      if (h || k) out.push([p.id, h, k]);
    });
    return out;
  }
  /** 恋人になる組 [[持ち主, 本命], ...]（酔いが覚めていない持ち主は含めない。キープは恋人ではない）。pure_lover.js の sync が g.pureLoverPairs に混ぜる */
  function pairs(g) { return picks(g).filter(([h, t]) => t && !ONW.hiddenDrunk(g, h)).map(([h, t]) => [h, t]); }
  /** 持ち主が自分の選んだ本命・キープを「知らされている」ことの記録（自分で選んだとき。怪盗などで受け取った人は知らされていない）: g.akujoSeen[持ち主] = "本命>キープ" */
  const sig = (h, k) => (h || "") + ">" + (k || "");
  const seen = (g, id, h, k) => { (g.akujoSeen = g.akujoSeen || {})[id] = sig(h, k); };
  /** 選ばれた人(本命/キープ)に、悪女のことをもう知らせた記録: g.akujoTold["持ち主>相手"] = "honmei" | "keep" */
  const tkey = (hold, t) => hold + ">" + t;
  const told = (g, hold, t, kind) => !!((g.akujoTold || {})[tkey(hold, t)]);   // 本命もキープも同じ文(「選ばれ、恋人になりました」)なので、どちらか一方でも知らせていれば、種類が変わっても同じ通知は出さない
  const setTold = (g, hold, t, kind) => { (g.akujoTold = g.akujoTold || {})[tkey(hold, t)] = kind; };
  ONW.evilWoman = { nm, setPicks, picks, pairs, seen, told, setTold };
  const KEEP = "__keep", HEART = "__love";
  /** 朝: 悪女目線で、本命のカードは❤、キープのカードは♡でめくれる */
  const peekReveal = (h, k) => ({ kind: "peek", items: [{ k: `p:${h}`, role: HEART }, { k: `p:${k}`, role: KEEP }] });
  // ---- CPUの夜の行動: 自分以外の2人をランダムに選ぶ（1人目=本命・2人目=キープ。デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id), others = g.players.filter((q) => q.id !== p.id);
    if (others.length < 2) return;
    let pair = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
    if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(others.filter((q) => !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
    const [h, k] = pair;
    setPicks(g, p.id, h, k);
    seen(g, p.id, h, k);
    i.mode = "evil_woman"; i.honmei = h; i.keep = k;
    g.nightLogsAll.push(`${label} ${p.name} は 本命=${nm(g, h)} キープ=${nm(g, k)} を選びました。`);
    n.ob(p.id, [h, k]);
    n.nn(rid);
  }

  ONW.defineRole("evil_woman", {
    info: { deck: 55, name: "悪女", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 36.6,
      desc: "第三陣営（恋人陣営）。夜に「本命」1人と「キープ」1人を選び、自分と本命が恋人になります。キープは恋人にはなりません。朝、悪女から見て本命のカードは❤、キープのカードは♡でめくれ、選ばれた2人には待機時間に悪女のカードがめくれます。" },
    groups: { "transform:silver_shadow": 15 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>本命</strong>と<strong>キープ</strong>のカードを順に押してください。（自分以外の2人。<strong>1人目が本命・2人目がキープ</strong>）<br>あなたと本命が恋人になります。キープは恋人にはなりません。${later}</p>${nowSel(" ／ ", 2)}`;
      },
      chainReady: (np) => np === 2,
      chainHow: () => "<strong>本命</strong>→<strong>キープ</strong>の順にカードを押して（自分以外の2人）",
    },
    stagePick: { players: 2 },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人
    cpuNight: { order: 21, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 21,   // 占い師と同じ段階（純愛者と同じ）
      complete: (np) => np === 2,
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const [h, k] = c.selOf(p).players; if (!h || !k || h === k) return;
        setPicks(g, p.id, h, k);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は 本命=${nameOf(h)} キープ=${nameOf(k)} を選びました。`);
        c.hold(p.id, `本命は ${nameOf(h)}、キープは ${nameOf(k)} です。`);
        ONW.observeNote(g, p.id, [h, k]);
        ONW.newsNote(g, "evil_woman");
        seen(g, p.id, h, k);
        c.rev[p.id] = peekReveal(h, k);   // 朝、本命のカードが❤・キープのカードが♡でめくれる
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 本命→キープの順に2人を選ぶ
    coResult: {
      kind: "evil_woman", twoHint: "本命 → キープの順に2人を選んでください。",
      pickTwo: (sel, K) => [`本命は ${K.nameOf(sel[0])}、キープは ${K.nameOf(sel[1])} です。`, { kind: "evil_woman", honmei: sel[0], keep: sel[1] }, null, "disclose", `本命 ${K.nameOf(sel[0])} ／ キープ ${K.nameOf(sel[1])}`],
    },
    /** CPUの発言: 本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（本命・キープを開示）、残りは騙り。本命・キープを知らない（怪盗で奪った等）ときは本当のCOはしない */
    cpuClaim(k, g, p, r, i, c) {
      const { nameOf } = k;
      if (i.mode === "evil_woman" && i.honmei && i.keep && k.coTruth(g, p)) {
        c.co = "evil_woman";
        c.result = { short: `本命 ${nameOf(g, i.honmei)} ／ キープ ${nameOf(g, i.keep)}`, text: `本命は ${nameOf(g, i.honmei)}、キープは ${nameOf(g, i.keep)} です。`, claim: { kind: "evil_woman", honmei: i.honmei, keep: i.keep } };
      } else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    // ---- 待機時間の演出（朝のあと）: 最終盤面で決まるので、墓荒らし・ドッペル・怪盗など、どの経由でも同じように出る ----
    /** 選ばれた人（本命・キープ。酔いが覚めている人）の画面で、悪女のカードがめくれる。本命は恋人になったので丸いハート付き、キープは付かない。
     *  持ち主が相手を知らされていなければ（怪盗などでカードを受け取った人）、持ち主にも本命❤・キープ♡がめくれる。
     *  酔いが覚めていない人には出さない（覚めたあとの演出は 3of4）。何度呼んでも同じ結果（知らせた記録で重複を防ぐ） */
    settlePre: { order: 16, run(c) {
      const g = c.g, set = (g.evilSettle = {});
      const add = (id, logs, item) => { if (ONW.hiddenDrunk(g, id)) return; const e = (set[id] = set[id] || { logs: [], items: [] }); e.logs.push(...logs); e.items.push(item); };
      ONW.pureLover.sync(g);   // 恋人の組（悪女の本命を含む）を最終盤面から確定する
      ONW.evilWoman.picks(g).forEach(([hold, h, k]) => {
        if (ONW.hiddenDrunk(g, hold)) return;
        const hn = nm(g, hold);
        if (h) { add(h, [`あなたは悪女の ${hn} に選ばれ、恋人になりました。`], { id: hold, face: "role", love: true }); if (!ONW.hiddenDrunk(g, h)) setTold(g, hold, h, "honmei"); }
        if (k) { add(k, [`あなたは悪女の ${hn} に選ばれ、恋人になりました。`], { id: hold, face: "role", love: false }); if (!ONW.hiddenDrunk(g, k)) setTold(g, hold, k, "keep"); }
        if ((g.akujoSeen || {})[hold] !== sig(h, k)) {
          const logs = [`あなたの本命は ${h ? nm(g, h) : "なし"}、キープは ${k ? nm(g, k) : "なし"} です。`], items = [];
          if (h) items.push({ id: h, face: "heart" }); if (k) items.push({ id: k, face: "keep" });
          items.forEach((it, i) => add(hold, i === 0 ? logs : [], it)); if (!items.length) add(hold, logs, null);
        }
        seen(g, hold, h, k);
        [[h, false], [k, true]].forEach(([id, isKeep]) => { const tp = id && g.players.find((q) => q.id === id); if (tp && tp.isCpu && !ONW.hiddenDrunk(g, id) && ONW.cpu.noticeEvilWomen) ONW.cpu.noticeEvilWomen(g, id, [hold], isKeep); });   // 選ばれたCPUも、悪女が誰か知る
      });
      Object.keys(set).forEach((id) => { set[id].items = set[id].items.filter(Boolean); });
    } },
    settleMsg: { order: 26, run(c, p) { const e = (c.g.evilSettle || {})[p.id]; return e ? { logs: e.logs.slice(), evil: e.items.map((x) => ({ ...x })) } : {}; } },
    stageSettle: {
      field: "settleEvil", shown: "settleEvilShown",
      run: { order: 36, run(items, SK) {
        SK.later(() => {
          items.forEach((it, i) => SK.later(() => {
            const k = `p:${it.id}`;
            if (it.face === "heart") SK.show(k, SK.LOVE_MARK, true);
            else if (it.face === "keep") SK.show(k, SK.KEEP_MARK, true);
            else { SK.show(k, "evil_woman", true); if (it.love) { SK.lov[k] = true; if (!evilKeys.includes(k)) evilKeys.push(k); } }   // 悪女のカード（本命の側は右上に丸いハート）
            SK.paint(SK.G());
          }, i * 380));
        }, 900);
      } },
      end: { order: 36, run(SK) { if (evilKeys.length) { evilKeys.forEach((k) => { delete SK.lov[k]; }); evilKeys = []; SK.paint(SK.G()); } } },
    },
    /** CPU(選ばれたCPU): 待機時間に、悪女のカードがめくれて誰が悪女か知る。keep: キープとして選ばれたか（本命なら恋人の相方、キープは恋人ではない） */
    cpuNotice(g, id, hids, k, keep) {
      const i = k.infoOf(g, id);
      i.evilBy = [...new Set([...(i.evilBy || []), ...hids])];
      if (keep) i.keepOf = [...new Set([...(i.keepOf || []), ...hids])];
      hids.forEach((h) => { i.known[h] = "evil_woman"; });
    },
    // ---- 昼のうち（酔いが覚めた・役職が動いた・昼に悪女で選んだ）: 恋人の組を作り直し、新しく分かった本命・キープを知らせる ----
    /** 新しく成立した本命・キープ: 選ばれた人（酔いが覚めている人）にはカードが数秒だけ表になって知らされ(jobday)、持ち主にもまだ知らされていなければ 本命の❤・キープの♡ が同時に出る。
     *  酔いが覚めた本人には soberExtra でまとめて知らせる（二重に出さない）。何度呼んでもよい（g.akujoTold / g.akujoSeen で重複を防ぐ）。
     *  net.js の dayCheck(昼に役職が動いた・昼に悪女で選んだ) と daySober(酔いが覚めた直後) から呼ばれる */
    dayCheck(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      ONW.pureLover.sync(g);   // 恋人の組（悪女の本命を含む）を最終盤面から作り直す
      picks(g).forEach(([hold, h, k]) => {
        if (ONW.hiddenDrunk(g, hold)) return;   // 酔いが覚めていない持ち主の選択は、覚めたあとに出す
        const hn = nm(g, hold), hp = g.players.find((q) => q.id === hold);
        [[h, "honmei"], [k, "keep"]].forEach(([t, kind]) => {
          const tp = t && g.players.find((q) => q.id === t);
          if (!tp || told(g, hold, t, kind) || ONW.hiddenDrunk(g, t) || c.isDead(t)) return;
          setTold(g, hold, t, kind);
          if (tp.isCpu) { if (ONW.cpu.noticeEvilWomen) ONW.cpu.noticeEvilWomen(g, t, [hold], kind === "keep"); return; }
          const text = kind === "honmei" ? `あなたは悪女の ${hn} に選ばれ、恋人になりました。` : `あなたは悪女の ${hn} に選ばれ、恋人になりました。`;
          g.nightLogsAll.push(`${c.rn(R_())} ${hn} が ${tp.name} を${kind === "honmei" ? "本命" : "キープ"}にしました。`);
          c.hold(t, text); c.send(t, { t: "jobday", id: hold, text, role: R_() });
        });
        if (hp && !hp.isCpu && !c.isDead(hold) && (g.akujoSeen || {})[hold] !== sig(h, k)) {   // 持ち主がまだ知らされていない（怪盗などでカードを受け取った）: 本命❤・キープ♡
          seen(g, hold, h, k);
          const items = []; if (h) items.push({ id: h, role: HEART }); if (k) items.push({ id: k, role: KEEP });
          const text = `あなたの本命は ${h ? nm(g, h) : "なし"}、キープは ${k ? nm(g, k) : "なし"} です。`;
          c.hold(hold, text); c.send(hold, { t: "jobday", id: (items[0] || {}).id, text, role: (items[0] || {}).role, items });
        } else if (hp && hp.isCpu) seen(g, hold, h, k);
      });
    },
    daySober(c) { ONW.roleDef(R_()).dayCheck(c); },
    /** 酔いが覚めた本人に、悪女の情報をまとめて出す(net.js の soberUp):
     *  悪女の持ち主なら 本命の❤・キープの♡、本命/キープに選ばれていれば悪女のカード。peek は stageSober の list がめくる。
     *  持ち主が酔い中の選択は出さない（持ち主が覚めたときに、持ち主→選ばれた人の順で知らされる） */
    soberExtra(c, id) {
      const g = c.g, lines = [], peek = { evilHonmei: [], evilKeep: [], evilBy: [], evilKeepBy: [] };
      ONW.pureLover.sync(g);   // 覚めた人を含めて恋人の組を作り直す
      picks(g).forEach(([hold, h, k]) => {
        if (ONW.hiddenDrunk(g, hold)) return;
        if (hold === id && (g.akujoSeen || {})[hold] !== sig(h, k)) {
          lines.push(`あなたの本命は ${h ? nm(g, h) : "なし"}、キープは ${k ? nm(g, k) : "なし"} です。`);
          if (h) peek.evilHonmei.push(h); if (k) peek.evilKeep.push(k);
          seen(g, hold, h, k);
        }
        if (h === id && !told(g, hold, h, "honmei")) { lines.push(`あなたは悪女の ${nm(g, hold)} に選ばれ、恋人になりました。`); peek.evilBy.push(hold); setTold(g, hold, h, "honmei"); }
        if (k === id && !told(g, hold, k, "keep")) { lines.push(`あなたは悪女の ${nm(g, hold)} に選ばれ、恋人になりました。`); peek.evilKeepBy.push(hold); setTold(g, hold, k, "keep"); }
      });
      const any = peek.evilHonmei.length || peek.evilKeep.length || peek.evilBy.length || peek.evilKeepBy.length;
      return { lines, peek: any ? peek : {} };
    },
    stageSober: { list: { order: 97, run(sp, list, SK) {
      (sp.evilHonmei || []).forEach((t) => list.push([`p:${t}`, SK.LOVE_MARK, true]));
      (sp.evilKeep || []).forEach((t) => list.push([`p:${t}`, SK.KEEP_MARK, true]));
      (sp.evilBy || []).concat(sp.evilKeepBy || []).forEach((h) => list.push([`p:${h}`, "evil_woman", true]));
    } } },
    /** 墓荒らし・ドッペルゲンガーで悪女を手にしたとき: 朝のうちに2人選べる（1人目=本命・2人目=キープ） */
    morning: {
      run(c) {
        if (c.players.length < 2) return null;
        const g = c.g, id = c.id, [h, k] = c.players;
        setPicks(g, id, h, k);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は 本命=${c.nameOf(h)} キープ=${c.nameOf(k)} を選びました。`);
        seen(g, id, h, k);
        return { lines: [`本命は ${c.nameOf(h)}、キープは ${c.nameOf(k)} です。`], reveal: peekReveal(h, k), nextChain: null };
      },
    },
  });
})(window.ONW);
