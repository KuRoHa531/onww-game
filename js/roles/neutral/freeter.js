/** フリーター: 夜に1人を選んで就職し、その人の初期役職がわかる。就職された人には待機時間に通知が出る */
(function (ONW) {
  /** 最終盤面でフリーターを持っていて、就職先がこの人(id)の人たち（待機時間にこの人の画面でカードが表になる） */
  const employers = (g, id) => ONW.hiddenDrunk(g, id) ? [] : g.players.filter((q) => g.currentRoles[q.id] === ONW.ROLE.FREETER && ONW.getRoleBound(g, "freeterTargets", q.id) === id).map((q) => q.id);
  /** 「フリーターに就職されている」の文言（人間の情報開示ボタンとCPUの発言で完全に一致させる。誰がフリーターかも言うほう） */
  ONW.freeterInfoText = (name) => `フリーターに就職されています。フリーターは${name}です。`;
  ONW.freeterInfoShort = (name) => `フリーター: ${name}`;
  const logs = (g, ids) => ids.map((fid) => `あなたのところにフリーターの ${(g.players.find((q) => q.id === fid) || {}).name} が就職しました。`);

  /** 就職先を選べないまま役職だけ受け取ったフリーター（怪盗・いたずらっ子などで受け取り、就職先が決まっていない）には、夜が明ける時点でランダムな就職先を決める（本家と同じ）。元からフリーターだった人・朝に自分で選べる人は対象外 */
  function ensureOrphans(c) {
    const g = c.g;
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== ONW.ROLE.FREETER) return;
      if (ONW.hiddenDrunk(g, p.id)) return;   // 酔いが覚めていない人は、覚めたあとに自分で就職先を選べる
      if (ONW.getRoleBound(g, "freeterTargets", p.id)) return;
      if (g.initialRoles[p.id] === ONW.ROLE.FREETER || (g.morningAct || {})[p.id] === ONW.ROLE.FREETER) return;
      const fid = ONW.debug ? ONW.debug.randTarget(g, "freeter", p.id) : null;   // デバッグ: 就職先の指定
      const t = (fid && fid !== p.id && g.players.find((q) => q.id === fid)) || ONW.utils.randomChoice(g.players.filter((q) => q.id !== p.id));
      if (!t) return;
      ONW.setRoleBound(g, "freeterTargets", p.id, t.id);
      g.nightLogsAll.push(`フリーター ${p.name} は 就職先を選べないまま役職を受け取ったため、ランダムで ${c.rn(g.initialRoles[t.id])} の ${t.name} に就職しました。`);
    });
  }


  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;   // フリーター: 就職先を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の就職先になる）。就職先の初期役職を知る
    const f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    ONW.setRoleBound(g, "freeterTargets", p.id, t.id);
    i.mode = "freeter"; i.target = t.id; i.known[t.id] = g.initialRoles[t.id];
    g.nightLogsAll.push(`${label} ${p.name} は ${n.rn(g.initialRoles[t.id])} の ${t.name} に就職しました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  ONW.defineRole("freeter", {
    // 朝の待機時間(stage.js が g.settleFreeters を受け取って呼ぶ): 就職先になった人の画面で、就職してきたフリーターのカードが表になる（就職先本人だけ。昼になったら札を外して伏せる）
    stageSettle: { field: "settleFreeters", shown: "settleFreeterShown", run: { order: 30, run(ids, SK) { SK.later(() => { ids.forEach((id) => { SK.show(`p:${id}`, "freeter"); }); SK.paint(SK.G()); }, 900); } } },
    // 昼にフリーターが就職してきた就職先: そのときのフリーターのカードが表になり、数秒後に閉じる(酔い覚めの演出より先に始める)
    stageFlash: {
      field: "jobFlash", when: "early",
      run(list, SK) {
        SK.later(() => { list.forEach((x) => { SK.up[`p:${x.id}`] = x.role; }); SK.paint(SK.G()); }, 200);
        SK.later(() => { list.forEach((x) => { delete SK.up[`p:${x.id}`]; }); SK.paint(SK.G()); }, 3700);
      },
    },
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>就職する相手</strong>のカードを1人分押してください。<br>朝になると、そのカードがめくれて<strong>就職先の初期役職</strong>がわかります。就職先が勝利すると、あなたも追加で勝利します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np, ng) => np === 1,
      chainHow: () => "<strong>就職する相手</strong>のカードを押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 就職先を選ぶ → 初期役職を選ぶ / 情報開示「フリーターに就職されている」
    coResult: {
      kind: "freeter", targetLabel: "就職先",
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} に就職しました。初期役職は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [`${who} に就職しました。初期役職は ${K.rn(role)} でした。`, { kind: "freeter", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
      infoNoName: () => ["フリーターに就職されています。", { kind: "employed" }, null, "disclose", "フリーターに就職された"],
      infoWho: (id, K) => [ONW.freeterInfoText(K.nameOf(id)), { kind: "employed", freeter: id }, null, "disclose", ONW.freeterInfoShort(K.nameOf(id))],
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    stagePick: {},
    cpuClaim(k, g, p, r, i, c) {   // フリーター: 本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（就職先と、その初期役職を開示）、残りは騙り。就職先を知らない(怪盗で奪った等)ときは本当のCOはしない
      const { rn, nameOf } = k;
      if (i.mode === "freeter" && k.coTruth(g, p)) {
        c.co = "freeter";
        c.result = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} に就職しました。初期役職は ${rn(i.known[i.target])} でした。`, claim: { kind: "freeter", target: i.target, role: i.known[i.target] } };
      } else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    cpuNotice(g, id, fids, k) {   // CPU(就職されたCPU): 待機時間に、就職してきた人（最終盤面でフリーターのカードを持っている人）を知る。カードが表になるので、その人の役職も分かる
      const i = k.infoOf(g, id);
      i.employedBy = [...new Set([...(i.employedBy || []), ...fids])];
      fids.forEach((f) => { i.known[f] = "freeter"; });
    },
    cpuNight: { order: 30, stage: "seer", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 34, name: "フリーター", team: ONW.TEAM.THIRD, wakeOrder: 6, sort: 37,
      desc: "第三陣営。夜に1人を選んで就職し、その人の初期役職がわかります。就職先が勝利したら自分も追加で勝利します（役職が入れ替わっても、就職先はカードについていきます）。朝のあとの待機時間に、あなたに就職したフリーターのカードが表になります。" },
    groups: { "transform:silver_shadow": 6 },
    night: {
      kind: "seer", order: 30,   // 占い師と同じ段階（占い → 一目惚れ → 就職 → 訪問）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      // 就職先を選んで、就職先の初期役職を知る（占い師と同じ「めくる」演出）。就職先は「役職の持ち主」に記録し、役職が動いたら移動先の人の就職先になる（本家と同じ）
      resolve(c, p) {
        const g = c.g, rn = c.rn, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        const r = g.initialRoles[t];
        ONW.setRoleBound(g, "freeterTargets", p.id, t);
        g.nightLogsAll.push(`${rn(c.eff(p))} ${p.name} は ${rn(r)} の ${nameOf(t)} に就職しました。`);
        c.hold(p.id, `${nameOf(t)} の初期役職は「${rn(r)}」でした。${nameOf(t)} に就職しました。就職先が勝利すると、あなたも追加で勝利します。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "freeter");
        c.rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
      },
    },
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, rn = c.rn, id = c.id, t = c.players[0], r = g.initialRoles[t];
        ONW.setRoleBound(g, "freeterTargets", id, t);   // 朝に選んだ就職先も、その時点の持ち主に予約され、以降の移動にもついていく
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${rn(r)} の ${c.nameOf(t)} に就職しました。`);
        return {
          lines: [`${c.nameOf(t)} の初期役職は「${rn(r)}」でした。${c.nameOf(t)} に就職しました。就職先が勝利すると、あなたも追加で勝利します。`],
          reveal: { kind: "peek", items: [{ k: `p:${t}`, role: r }] }, nextChain: null,
        };
      },
      dayNotify(c) {   // 昼に就職: 就職先の画面でも、その時点のフリーターのカードが表になって、数秒後に閉じる
        if (!c.players.length) return;
        const g = c.g, id = c.id, me = c.me, t = c.players[0], tp = c.byId(t);
        if (tp && !tp.isCpu) { const text = logs(g, [id])[0]; g.nightLogsAll.push(`${c.rn("freeter")} ${me.name} が ${tp.name} のところに就職しました。`); c.hold(t, text); c.send(t, { t: "jobday", id, text, role: ONW.shownRole(g.currentRoles[id]) }); }
        else if (tp && tp.isCpu && !ONW.hiddenDrunk(g, t) && ONW.cpu.noticeEmployers) ONW.cpu.noticeEmployers(g, t, [id]);   // 昼に就職された先がCPUなら、そのCPUも就職してきた人を知る
      },
    },
    settlePre: { order: 10, run(c) {
      ensureOrphans(c);
      const g = c.g;
      g.players.forEach((q) => { if (q.isCpu && ONW.cpu.noticeEmployers) { const fi = employers(g, q.id); if (fi.length) ONW.cpu.noticeEmployers(g, q.id, fi); } });   // 就職されたCPUは、誰が就職してきたかを知る
    } },
    settleMsg: { order: 20, run(c, p) { const fi = employers(c.g, p.id); return { logs: logs(c.g, fi), fids: fi }; } },
  });
})(window.ONW);
