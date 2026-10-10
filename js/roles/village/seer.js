/** 占い師: プレイヤー1人か、墓地カード(設定枚数まで)を見る */
(function (ONW) {

  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;   // cur: 朝に使うとき（朝の時点の実際のカードを見る）
    const rolesNow = cur ? g.currentRoles : g.initialRoles, graveNow = cur ? g.center : g.center0;
    const i = n.infoOf(p.id), f = n.forced(p);
    const lim = ONW.seerGraveMax(g);   // 設定された「占える墓地の枚数」
    const fg = (f.graves || []).filter((k) => k >= 0 && k < g.center.length).slice(0, lim);
    const fp = n.validPlayer(p, f.player) ? f.player : null;
    i.grave = [];
    if (fg.length || (!fp && lim > 0 && g.center.length >= lim && Math.random() < 0.4)) {
      i.mode = "grave";
      const idxs = fg.slice(0, lim);
      ONW.utils.shuffle([...g.center.keys()].filter((k) => !idxs.includes(k))).forEach((k) => { if (idxs.length < lim) idxs.push(k); });
      idxs.slice(0, lim).forEach((k) => i.grave.push({ idx: k, role: ONW.seerSees(graveNow[k]) }));   // 墓地の白狼も村人と出る
      i.grave.forEach((x) => g.nightLogsAll.push(`${label} ${p.name} は 墓地${x.idx + 1} を確認し、${n.rn(x.role)} でした。`));
      n.ob(p.id, [], i.grave.map((x) => x.idx));
    } else {
      const t = fp ? g.players.find((q) => q.id === fp) : n.pick(g.players.filter((q) => q.id !== p.id));
      i.mode = "player"; i.target = t.id; i.known[t.id] = ONW.seerSees(rolesNow[t.id]);
      if (ONW.foxInspect) ONW.foxInspect(g, t.id);   // 妖狐: 占われた席を記録（呪殺の判定は最終盤面で）
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を占い、${n.rn(ONW.seerSees(rolesNow[t.id]))} でした。`);
      n.ob(p.id, [t.id]);
    }
    n.nn(rid);
  }

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  /** 騙り占い: 偽の占い結果を言う(本家 chooseFakeSeerTarget / chooseFakeSeerResult) */
  function lieClaim(k, g, p, others, selfRole, co) {
    const { rn, fakeSeerTarget, fakeSeerResult, bareCo } = k;
    const t = fakeSeerTarget(g, p);
    if (!t) return { co: bareCo(g, co), result: null };
    const role = fakeSeerResult(g, p, t, selfRole);
    return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
  }
  /** 本物の占い師の発言: 占った結果(人 or 墓地)を開示する */
  function cpuClaim(k, g, p, r, i, c) {
    const { rn, nameOf } = k;
    c.co = "seer";
    if (i.mode === "player") c.result = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} を占って ${rn(i.known[i.target])} でした。`, claim: { kind: "seer", target: i.target, role: i.known[i.target] } };
    else c.result = { short: i.grave.map((x) => `墓地${x.idx + 1} → ${rn(x.role)}`).join("、"), text: i.grave.map((x) => `墓地${x.idx + 1} を見て ${rn(x.role)}`).join("、") + " でした。", claim: { kind: "seer-grave" } };
  }

  ONW.defineRole("seer", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel, gmax } = X;
        return `<p class="night-step__hint">上のテーブルから、${gmax > 0 ? `<strong>プレイヤー1人</strong>か<strong>墓地のカード（${gmax}枚まで）</strong>` : "<strong>プレイヤー1人</strong>"}を押してください。${gmax > 0 ? "<br>プレイヤーと墓地を同時に占うことはできません。" : ""}${later}</p>${nowSel("、")}`;
      },
      chainReady: (np, ng) => np === 1 || ng >= 1,
      chainHow: (gmax) => `${gmax > 0 ? `<strong>プレイヤー1人</strong>か<strong>墓地のカード（${gmax}枚まで）</strong>` : "<strong>プレイヤー1人</strong>"}を押して`,
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 占い先を選ぶ → 結果役職を選ぶ(墓地も選べる)。狂った占い師も like で同じ
    coResult: {
      kind: "seer", targetLabel: "占い先", graves: true,
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} を占いました。結果は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [`${who} を占って ${K.rn(role)} でした。`, { kind: "seer", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
    },
    // 夜(と朝の連鎖)にカードを押して行動する: 墓地も選べる(設定枚数まで)。プレイヤーを選ぶと墓地の選択は外れる(狂った占い師も同じ)
    stagePick: { graves: true, exclusive: true, graveMax: (g) => ONW.seerGraveMax(g) },
    cpuLie: { role: "seer", weight: 40, order: 1, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    /** 墓荒らし・ドッペルゲンガーで占い師を手にしたCPUが、続けて言う結果: 朝のうちに占った相手（人 or 墓地） */
    cpuChainResult(k, g, p, i) {
      const c = {}; if (!(i.mode === "player" ? i.target && i.known && i.known[i.target] : i.mode === "grave" && i.grave && i.grave.length)) return null;
      cpuClaim(k, g, p, "seer", i, c); return c.result || null;
    },
    cpuNight: { order: 10, stage: "seer", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 8, count: 1, name: "占い師", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 23,
      desc: "村人陣営。プレイヤー1人を見るか、墓地カードを確認できます。" },
    groups: { "transform:light_apostle": 2 },
    night: {
      kind: "seer", order: 10,
      complete: (np, ng) => np === 1 || ng >= 1,
      normalize(c, players, graves) {   // プレイヤー1人 か 墓地(設定枚数まで)。同時には選べない
        if (graves.length) { players = []; graves = graves.slice(0, ONW.seerGraveMax(c.g)); if (!graves.length) players = []; }
        else players = players.slice(0, 1);
        return { players, graves };
      },
      // 初期役職・配役直後の墓地を見る。順序の影響を受けない（占い師・狂った占い師の共通処理）
      resolve(c, p) {
        const g = c.g, rn = c.rn, hold = c.hold, nameOf = c.nameOf, rev = c.rev;
        const sel = c.selOf(p), label = rn(c.eff(p));
        if (sel.players.length === 1) {
          const t = sel.players[0], r = ONW.seerSees(g.initialRoles[t]);
          if (ONW.foxInspect) ONW.foxInspect(g, t);   // 妖狐: 占われた席を記録
          g.nightLogsAll.push(`${label} ${p.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
          hold(p.id, `${nameOf(t)} の役職は「${rn(r)}」でした。`);
          rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
          ONW.observeNote(g, p.id, [t]);
          ONW.newsNote(g, c.eff(p));
        } else if (sel.graves.length) {
          const items = sel.graves.slice().sort((x, y) => x - y).map((i) => ({ k: `g:${i}`, role: ONW.seerSees(g.center0[i]) }));   // 墓地の白狼も村人と出る
          items.forEach((it) => { const i = +it.k.slice(2); g.nightLogsAll.push(`${label} ${p.name} は 墓地${i + 1} を確認し、${rn(it.role)} でした。`); hold(p.id, `墓地${i + 1}枚目は「${rn(it.role)}」でした。`); });
          rev[p.id] = { kind: "peek", items };
          ONW.observeNote(g, p.id, [], items.map((it) => +it.k.slice(2)));
          ONW.newsNote(g, c.eff(p));
        }
      },
    },
    // 朝(墓荒らし・ドッペルで手にした後)・昼(酔い覚め後)に使う占い
    morning: {
      run(c) {
        const g = c.g, rn = c.rn, nameOf = c.nameOf, me = c.me, label = c.label, players = c.players;
        let graves = c.graves, lines = null, reveal = null;
        if (graves.length) {
          graves = graves.slice(0, ONW.seerGraveMax(g)).sort((x, y) => x - y);
          lines = graves.map((i) => `墓地${i + 1}枚目は「${rn(ONW.seerSees(g.center[i]))}」でした。`);   // 墓地の白狼も村人と出る
          graves.forEach((i) => g.nightLogsAll.push(`${label} ${me.name} は 墓地${i + 1} を確認し、${rn(ONW.seerSees(g.center[i]))} でした。`));
          reveal = { kind: "peek", items: graves.map((i) => ({ k: `g:${i}`, role: ONW.seerSees(g.center[i]) })) };
        } else if (players.length) {
          const t = players[0], r = ONW.seerSees(g.currentRoles[t]);
          if (ONW.foxInspect) ONW.foxInspect(g, t);   // 妖狐: 占われた席を記録（朝・昼のうちの占い）
          lines = [`${nameOf(t)} の役職は「${rn(r)}」でした。`];
          g.nightLogsAll.push(`${label} ${me.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
          reveal = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
        }
        return lines ? { lines, reveal, nextChain: null } : null;
      },
    },
  });
})(window.ONW);
