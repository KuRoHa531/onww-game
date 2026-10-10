/** 訪問者: 夜に1人を訪問する(相手の役職は分からない)。訪問された人には待機時間に「訪問してきた人」のカードが表になる */
(function (ONW) {
  // ---- 役職固有の補助関数(もとは state.js にあったもの。中身は変更なし) ----
  /** 訪問者の訪問先(プレイヤーID)。最終盤面でその人が訪問者を持っていて、訪問先が決まっているときだけ。なければ null。
   *  訪問先は「役職の持ち主」に記録されている(g.visitorTargets[持ち主ID] = 訪問先のID)ので、訪問者のカードが動けば、訪問先もカードについて動く */
  ONW.visitorTarget = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.VISITOR && (g.visitorTargets || {})[id]) || null;
  /** 最終盤面で訪問者を持っていて、訪問先が id の人たち（持ち主IDの配列）。訪問先が自分自身になった訪問者（入れ替わりの結果）は数えない。
   *  訪問された人の待機時間の演出・通知に使う。酔いが覚めていない人には届けない */
  ONW.visitorsOf = (g, id) => (!g || !g.players || ONW.hiddenDrunk(g, id)) ? [] : g.players.filter((q) => q.id !== id && g.currentRoles[q.id] === ONW.ROLE.VISITOR && (g.visitorTargets || {})[q.id] === id).map((q) => q.id);
  // ---- ここまで ----

  const logs = (g, ids) => ids.map((vid) => `あなたのところに訪問者の ${(g.players.find((q) => q.id === vid) || {}).name} が訪問してきました。`);

  /** 訪問先を選べないまま役職だけ受け取った訪問者（怪盗・いたずらっ子などで受け取り、訪問先が決まっていない）には、夜が明ける時点でランダムな訪問先を決める（フリーターと同じ）。元から訪問者だった人・朝に自分で選べる人は対象外 */
  function ensureOrphans(c) {
    const g = c.g;
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== ONW.ROLE.VISITOR) return;
      if (ONW.hiddenDrunk(g, p.id)) return;   // 酔いが覚めていない人は、覚めたあとに自分で訪問先を選べる
      if (ONW.getRoleBound(g, "visitorTargets", p.id)) return;
      if (g.initialRoles[p.id] === ONW.ROLE.VISITOR || (g.morningAct || {})[p.id] === ONW.ROLE.VISITOR) return;
      const vid = ONW.debug ? ONW.debug.randTarget(g, "visitor", p.id) : null;   // デバッグ: 訪問先の指定
      const t = (vid && vid !== p.id && g.players.find((q) => q.id === vid)) || ONW.utils.randomChoice(g.players.filter((q) => q.id !== p.id));
      if (!t) return;
      ONW.setRoleBound(g, "visitorTargets", p.id, t.id);
      g.nightLogsAll.push(`訪問者 ${p.name} は 訪問先を選べないまま役職を受け取ったため、ランダムで ${t.name} を訪問しました。`);
    });
  }


  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;   // 訪問者: 訪問する相手を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の訪問先になる）。相手の役職は分からない
    const f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    ONW.setRoleBound(g, "visitorTargets", p.id, t.id);
    i.mode = "visitor"; i.target = t.id;
    if (n.stage === "late") (ONW.cpu.lateVisits = ONW.cpu.lateVisits || []).push({ from: p.id, to: t.id });   // 昼（酔い覚め後）の訪問: 訪問された人への通知用
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を訪問しました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  function lieClaim(k, g, p, others, selfRole, co) {   // 訪問者の騙り: 適当な誰かを訪問したと言う
    if (!others.length) return null;
    const t = k.pick(others);
    return { co, result: { short: `→ ${t.name}`, text: `${t.name} を訪問しました。`, claim: { kind: "visitor", target: t.id } } };
  }
  function cpuClaim(k, g, p, r, i, c) {   // 訪問者: 必ず訪問者COして、訪問先を開示する(訪問先が決まっていないときは通常の村人陣営の扱い)
    if (!(i.mode === "visitor" && i.target)) return false;
    const { nameOf } = k;
    c.co = "visitor";
    c.result = { short: `→ ${nameOf(g, i.target)}`, text: `${nameOf(g, i.target)} を訪問しました。`, claim: { kind: "visitor", target: i.target } };
  }

  ONW.defineRole("visitor", {
    // 朝の待機時間(stage.js が g.settleVisitors を受け取って呼ぶ): 訪問された人の画面で、訪問してきた訪問者のカードが表になる（訪問された本人だけ。昼になったら伏せる）。入れ替わりで訪問者のカードが動いていれば、いまの持ち主のカードが表になる
    stageSettle: { field: "settleVisitors", shown: "settleVisitorShown", run: { order: 40, run(ids, SK) { SK.later(() => { ids.forEach((id) => { SK.show(`p:${id}`, "visitor"); }); SK.paint(SK.G()); }, 900); } } },
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>訪問する相手</strong>のカードを1人分押してください。<br>訪問した相手の役職は分かりません。相手には、朝のあとの待機時間に<strong>訪問してきた人（訪問者のカード）</strong>が知らされます。${later}</p>${nowSel("")}`;
      },
      chainReady: (np, ng) => np === 1,
      chainHow: () => "<strong>訪問する相手</strong>のカードを押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 訪問先を選ぶ / 情報開示「訪問された」(CPUの発言と同じ文言)
    coResult: {
      kind: "visitor", targetLabel: "訪問先",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を訪問しました。`, { kind: "visitor", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
      infoVisited: (id, K) => [`${K.nameOf(id)} が訪問してきました。`, { kind: "visited", from: id }, null, "disclose", `${K.nameOf(id)} が訪問`],
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    stagePick: {},
    cpuLie: { role: "visitor", weight: 5, order: 7, claim: lieClaim },
    cpuClaim,
    /** 墓荒らし・ドッペルゲンガーで訪問者を手にしたCPUが、続けて言う結果: 朝のうちに訪問した相手 */
    cpuChainResult(k, g, p, i) { const c = {}; return cpuClaim(k, g, p, "visitor", i, c) === false ? null : (c.result || null); },
    cpuNight: { order: 40, stage: "seer", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    cpuNotice(g, id, visitorIds, k) {   // CPU(訪問されたCPU): 待機時間に、訪問してきた人（最終盤面で訪問者のカードを持っている人）を知る
      const i = k.infoOf(g, id);
      i.visitedBy = [...new Set([...(i.visitedBy || []), ...visitorIds])];
      visitorIds.forEach((v) => { i.known[v] = "visitor"; });
    },
    info: { deck: 45, name: "訪問者", team: ONW.TEAM.VILLAGE, wakeOrder: 7, sort: 15,
      desc: "村人陣営。夜に自分以外の1人を訪問します。訪問した相手の役職は分かりません。相手には、朝のあとの待機時間に「訪問してきた人」のカードが表になって知らされます（訪問先は役職のカードについていくので、役職が入れ替わると、訪問してきた人も入れ替わります）。" },
    groups: { "transform:light_apostle": 18 },
    night: {
      kind: "seer", order: 40,   // 占い師と同じ段階の、最後
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      // 訪問する相手を選ぶ（相手の役職は分からない）。訪問先は「役職の持ち主」に記録し、役職が動いたら移動先の人の訪問先になる。訪問されたことは、朝のあとの待機時間に相手へ知らされる
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        ONW.setRoleBound(g, "visitorTargets", p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を訪問しました。`);
        c.hold(p.id, `${nameOf(t)} を訪問しました。相手の役職は分かりません。訪問されたことは、朝のあとの待機時間に ${nameOf(t)} へ知らされます。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "visitor");
      },
    },
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        ONW.setRoleBound(g, "visitorTargets", id, t);   // 朝に選んだ訪問先も、その時点の持ち主に予約され、以降の移動にもついていく
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を訪問しました。`);
        return { lines: [`${c.nameOf(t)} を訪問しました。相手の役職は分かりません。訪問されたことは、${c.nameOf(t)} に知らされます。`], reveal: null, nextChain: null };
      },
      dayNotify(c) {   // 昼に訪問: 訪問された人の画面でも、その時点の訪問者のカードが表になって、数秒後に閉じる
        if (!c.players.length) return;
        const g = c.g, id = c.id, me = c.me, t = c.players[0], tp = c.byId(t);
        if (tp && !tp.isCpu && !ONW.hiddenDrunk(g, t)) { const text = logs(g, [id])[0]; g.nightLogsAll.push(`${c.rn("visitor")} ${me.name} が ${tp.name} を訪問しました。`); c.hold(t, text); c.send(t, { t: "jobday", id, text, role: ONW.shownRole(g.currentRoles[id]) }); }
        else if (tp && tp.isCpu && ONW.cpu.noticeVisitors) ONW.cpu.noticeVisitors(g, t, [id]);
      },
    },
    settlePre: { order: 20, run(c) {
      const g = c.g;
      ensureOrphans(c);
      g.players.forEach((q) => { if (q.isCpu && ONW.cpu.noticeVisitors) { const vs = ONW.visitorsOf(g, q.id); if (vs.length) ONW.cpu.noticeVisitors(g, q.id, vs); } });   // 訪問されたCPUは、誰が訪問してきたかを知る
    } },
    settleMsg: { order: 30, run(c, p) { const vi = ONW.visitorsOf(c.g, p.id); return { logs: logs(c.g, vi), vids: vi }; } },
    // 酔いが覚めたCPUの訪問者が昼に訪問した: 訪問された人へも通知（人間の訪問者が昼に訪問したときと同じ）
    cpuLateVisits(c) {
      const g = c.g;
      (ONW.cpu.lateVisits || []).forEach(({ from, to }) => {
        // ※既存の挙動を保持: 元のコード(net.js soberUp)では byId がこの場所に定義されておらず、訪問が発生すると ReferenceError になる。仕様変更しないためそのまま残す
        const tp = byId(to), me = byId(from);
        if (!tp || !me || ONW.hiddenDrunk(g, to)) return;
        if (tp.isCpu) { if (ONW.cpu.noticeVisitors) ONW.cpu.noticeVisitors(g, to, [from]); return; }
        const text = logs(g, [from])[0]; g.nightLogsAll.push(`${c.rn("visitor")} ${me.name} が ${tp.name} を訪問しました。`); c.hold(to, text); c.send(to, { t: "jobday", id: from, text, role: ONW.shownRole(g.currentRoles[from]) });
      });
    },
  });
})(window.ONW);
