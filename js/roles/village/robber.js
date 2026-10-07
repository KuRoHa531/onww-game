/** 怪盗: 自分以外1人と役職を交換し、新しい自分の役職だけ確認する */
(function (ONW) {

  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    ONW.swapPlayers(g, p.id, t.id);
    i.mode = "robber"; i.target = t.id; i.newRole = ONW.shownRole(g.currentRoles[p.id]);
    i.known[p.id] = i.newRole; i.known[t.id] = "robber";
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} と役職を交換し、${n.rn(i.newRole)} になりました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  function lieClaim(k, g, p, others, selfRole, co) {
    const { rn, pick, roleInSetup, fakeSeerTarget, villageLikeResult, canGetByClaim } = k;
    const t = fakeSeerTarget(g, p);
    const pool = ["villager", "mason", "insomniac", "troublemaker"].filter((r) => roleInSetup(g, r));   // 村人がいない配役で「村人を奪った」とは言わない
    const role = pool.length ? pick(pool) : villageLikeResult(g, (r) => canGetByClaim(g, "robber", r));   // 怪盗が1枚しかないのに「怪盗を奪った」とは言わない
    return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} の役職を奪って ${rn(role)} になりました。`, claim: { kind: "robber", target: t.id, role } } };
  }
  function cpuClaim(k, g, p, r, i, c) {
    const { rn, nameOf, isNonVillage, nonVillageLie } = k;
    c.co = "robber";
    if (isNonVillage(i.newRole)) { const lie = nonVillageLie(g, p, "robber", i, i.newRole); c.co = lie.co; c.result = lie.result; }   // 人外を手にした: 村人役を騙る
    else c.result = { short: `${nameOf(g, i.target)} → ${rn(i.newRole)}`, text: `${nameOf(g, i.target)} の役職を奪って ${rn(i.newRole)} になりました。`, claim: { kind: "robber", target: i.target, role: i.newRole } };
  }
  /** 人外を手にしたときの「村人役を手にした」という嘘 */
  function fakeGot(k, g, i, role) {
    const { rn, nameOf } = k;
    return { co: "robber", result: { short: `${nameOf(g, i.target)} → ${rn(role)}`, text: `${nameOf(g, i.target)} の役職を奪って ${rn(role)} になりました。`, claim: { kind: "robber", target: i.target, role } } };
  }

  ONW.defineRole("robber", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、役職を交換したい人の<strong>カード</strong>を押してください。${later}</p>${nowSel("")}`;
      },
      chainReady: (np, ng) => np === 1,
      chainHow: () => "役職を交換したい人の<strong>カード</strong>を押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 奪った相手を選ぶ → 結果役職を選ぶ(結果開示の標準の形。種類が不明なときもこの文言)
    coResult: {
      kind: "robber", targetLabel: "奪った相手",
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} の役職を奪いました。役職は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [`${who} の役職を奪って ${K.rn(role)} になりました。`, { kind: "robber", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    stagePick: {},
    // 朝の演出(stage.js の playMorning / morningDur が、reveal.kind === "swap" のときに呼ぶ): 自分のカードと相手のカードが弧を描いて入れ替わる → 新しい自分のカードが表に
    // (入れ替えの動き本体は 墓荒らしとも共通なので stage.js の共通部品 SK.swap)
    stageMorning: { kind: "swap", dur: () => 1050 + 700, play(r, SK) { SK.swap(r); } },
    cpuLie: { role: "robber", weight: 12, order: 4, claim: lieClaim },
    cpuClaim,
    cpuFakeGot: { kind: "robber", make: fakeGot },   // 夜のあとに人外の役職を手にしたときの嘘(kind: 「手にした」と言える役職かの判定に使う)
    cpuNight: { order: 70, stage: "robber", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 9, count: 1, name: "怪盗", team: ONW.TEAM.VILLAGE, wakeOrder: 55, sort: 25,
      desc: "村人陣営。自分以外1人と役職を交換し、新しい自分の役職だけ確認できます。" },
    groups: { "transform:light_apostle": 3 },
    night: {
      kind: "robber", order: 10,
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {   // 怪盗 → いたずらっ子（起床順）。いたずらっ子の入れ替えは最後にまとめて反映
        const g = c.g, rn = c.rn;
        const t = c.selOf(p).players[0]; if (!t) return;
        ONW.swapPlayers(g, p.id, t);
        const got = g.currentRoles[p.id];
        g.nightLogsAll.push(`${rn(c.eff(p))} ${p.name} は ${c.nameOf(t)} と役職を交換し、${rn(got)} になりました。`);
        c.hold(p.id, `${c.nameOf(t)} と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`);
        c.rev[p.id] = { kind: "swap", target: t, role: ONW.shownRole(got) };
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "robber");
      },
    },
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, rn = c.rn, id = c.id, t = c.players[0];
        ONW.swapPlayers(g, id, t);
        const got = g.currentRoles[id];
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} と役職を交換し、${rn(got)} になりました。`);
        return {
          lines: [`${c.nameOf(t)} と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`],
          reveal: { kind: "swap", target: t, role: ONW.shownRole(got) }, nextChain: null,
        };
      },
    },
  });
})(window.ONW);
