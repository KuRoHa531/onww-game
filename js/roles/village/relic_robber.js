/** 墓荒らし: 夜に墓地カード1枚と自分の役職を交換する。交換後の役職に夜行動があれば朝のうちに使える */
(function (ONW) {

  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const i = n.infoOf(p.id);
    if (!g.center.length) return;
    if (ONW.keymaster.gate(g, p.id, [])) {   // 鍵師のロック: 自分の席がロック中なら🔒に弾かれて失敗（墓地とは交換しない）
      i.mode = "relic"; i.keyFail = { kind: "self" };
      ONW.keymaster.fail(g, p.id, "self", "交換", [], `${label} ${p.name}`);
      return;
    }
    const fg = (n.forced(p).graves || []).filter((k) => k >= 0 && k < g.center.length);   // デバッグ: 交換する墓地の指定
    const idx = fg.length ? fg[0] : n.pick([...g.center.keys()]), got = g.center[idx], seen = ONW.shownRole(got);   // seen: 本人が思う新しい役職（忘却の人狼・狼憑きは村人、狼夢人は人狼）
    ONW.swapGrave(g, p.id, idx);
    i.mode = "relic"; i.graveIdx = idx; i.newRole = seen; i.known[p.id] = seen;
    g.nightLogsAll.push(`${n.rn("relic_robber")} ${p.name} は 墓地${idx + 1} と役職を交換し、${n.rn(got)} になりました。`);
    i.relic = { graveIdx: idx, newRole: seen };
    if (got === ONW.ROLE.EXECUTIONER) { const tid = ONW.execTarget(g, p.id); if (tid) i.execTarget = tid; }   // 墓地から引いた処刑人: 新しいターゲットが決まっていて、引いた本人は朝に知る
    if (got === ONW.ROLE.SERVANT) { const mid = ONW.servantMaster(g, p.id); if (mid) i.master = mid; }   // 墓地から引いた従者: 新しいご主人が決まっていて、引いた本人は朝に知る（怪盗で奪った場合は役職名だけ）
    // 交換後の役職に夜行動があれば、朝に使う（runNight の "morning" 段階）
    i.pendingChain = ONW.cpu.chainRoles("relic_robber").includes(got) ? got : null;
    n.ob(p.id, [], [idx]);
    n.nn("relic_robber");
  }

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  function cpuClaim(k, g, p, r, i, c) {
    const { rn, isNonVillage, nonVillageLie } = k;
    c.co = "relic_robber";
    if (i.keyFail) { c.result = { short: "ロックで失敗", text: "自身の役職がロックされていたため交換に失敗しました。", claim: null }; return; }   // ロックされて交換に失敗した: 正直に言う
    if (!i.relic) return;   // 墓荒らし（交換情報なし）: COだけする
    if (isNonVillage(i.relic.newRole) && !ONW.cpu.relicDoppelHonest(i)) { const lie = nonVillageLie(g, p, "relic_robber", i, i.relic.newRole); c.co = lie.co; c.result = lie.result; }
    else c.result = { short: `墓地${i.relic.graveIdx + 1} → ${rn(i.relic.newRole)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(i.relic.newRole)} になりました。`, claim: { kind: "relic", role: i.relic.newRole } };
  }
  function fakeGot(k, g, i, role) {
    const { rn } = k;
    return { co: "relic_robber", result: { short: `墓地${i.relic.graveIdx + 1} → ${rn(role)}`, text: `墓地${i.relic.graveIdx + 1} と役職を交換して ${rn(role)} になりました。`, claim: { kind: "relic", role } } };
  }

  ONW.defineRole("relic_robber", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、役職を交換したい<strong>墓地のカード</strong>を1枚押してください。${later}<br>朝になると交換され、新しい役職に夜の能力があれば、朝のうちに即座に使えます。</p>${nowSel("")}`;
      },
      chainReady: (np, ng) => ng === 1,
      chainHow: () => "役職を交換したい<strong>墓地のカード</strong>を1枚押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 交換した墓地を選ぶ → 新しくなった役職を選ぶ
    coResult: {
      kind: "relic",
      relicRole(role, s, K) {
        if (role === "hide") return [`墓地${s.idx + 1} と役職を交換しました。役職は伏せます。`, null, null, "disclose", `墓地${s.idx + 1} → 伏せ`];
        return [`墓地${s.idx + 1} と役職を交換して ${K.rn(role)} になりました。`, { kind: "relic", role }, null, "disclose", `墓地${s.idx + 1} → ${K.rn(role)}`];
      },
    },
    // 夜(と朝の連鎖)にカードを押して行動する: 選べるのは墓地(1枚)だけ
    stagePick: { players: false, graves: true },
    // 朝の演出(stage.js の playMorning / morningDur が、reveal.kind === "relic" のときに呼ぶ): 墓地のカードがガタッと掘り起こされ、自分のカードと入れ替わる → 新しい自分のカードが表に(入れ替えの動き自体は共通部品 SK.swap)
    stageMorning: {
      kind: "relic", dur: () => 540 + 1050 + 700,
      play(r, SK, temp) {
        const { later } = SK;
        const el = SK.$t(), grave = el.querySelector(`[data-k="g:${r.target}"] .tb-card`);
        if (!grave || !grave.animate) { SK.swap(r, temp); return; }
        const w = grave.animate(
          [{ transform: "translate(0,0) rotate(0)" }, { transform: "translate(-3px,-12px) rotate(-7deg)" }, { transform: "translate(3px,-8px) rotate(6deg)" }, { transform: "translate(-2px,-14px) rotate(-4deg)" }, { transform: "translate(0,-6px) rotate(0)" }],
          { duration: 520, easing: "ease-in-out" });
        later(() => { w.cancel(); SK.swap(r, temp); }, 540);     // 揺れ終わったら、自分のカードと弧を描いて入れ替わる
      },
    },
    cpuClaim,
    /** 墓荒らしを騙るとき（人外のCPUなど）も、COだけで終わらず「墓地N と役職を交換して ○○ になりました」と結果を言う */
    cpuLieResult(k, g, p, selfRole, co) {
      if (!g.center || !g.center.length) return null;
      const idx = k.pick ? k.pick([...g.center.keys()]) : Math.floor(Math.random() * g.center.length);
      return fakeGot(k, g, { relic: { graveIdx: idx } }, k.fakeVillageRole(g, (r) => k.canGetByClaim(g, "relic", r)));
    },
    cpuFakeGot: { kind: "relic", make: fakeGot },
    cpuNight: { order: 50, stage: "relic", chain: true, chainEnd: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 10, name: "墓荒らし", team: ONW.TEAM.VILLAGE, wakeOrder: 50, sort: 26,
      desc: "村人陣営。夜に墓地カード1枚と自分の役職を交換します。交換後の役職に夜行動があればその能力も使えます。" },
    groups: { "transform:light_apostle": 4 },
    night: {
      kind: "relic", order: 10, chain: false,   // chain:false = 自分自身は「交換後にそのまま使える能力」には入らない
      complete: (np, ng) => ng === 1,
      normalize: (c, players, graves) => ({ players: [], graves: graves.slice(0, 1) }),
      resolve(c, p) {   // 選んだ墓地と役職を交換（起床順。交換後の役職の能力は朝に使う）
        const g = c.g, rn = c.rn, hold = c.hold, rev = c.rev;
        const i = c.selOf(p).graves[0]; if (i === undefined || i < 0 || i >= g.center.length) return;
        if (ONW.keymaster.gate(g, p.id, [])) { c.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "交換", [], `${rn(c.eff(p))} ${p.name}`)); c.rev[p.id] = ONW.keymaster.failRev(g, p.id, p.id); return; }   // 鍵師のロック: 自分の席がロック中なら失敗。墓地は動かず、新聞・観測にも載らない
        const got = g.center[i];
        ONW.swapGrave(g, p.id, i);
        g.nightLogsAll.push(`${rn(c.eff(p))} ${p.name} は 墓地${i + 1} と役職を交換し、${rn(got)} になりました。`);
        hold(p.id, `墓地${i + 1}枚目と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`);
        if (ONW.roleCanChain(got)) { g.morningAct[p.id] = got; hold(p.id, `新しい役職（${rn(got)}）の能力を、朝のうちに使えます。`); }
        rev[p.id] = { kind: "relic", target: i, role: ONW.shownRole(got) };
        ONW.observeNote(g, p.id, [], [i]);
        ONW.newsNote(g, "relic_robber");
        c.gotInfo(g, p, got, rev, { skipGrave: i, both: true, via: `墓地${i + 1} から引いた従者` });
      },
    },
    morning: {
      run(c) {   // ドッペルゲンガーがコピーした墓荒らし / 昼に酔いが覚めた墓荒らし
        if (!c.graves.length) return null;
        const g = c.g, rn = c.rn, id = c.id, idx = c.graves[0];
        if (ONW.keymaster.gate(g, id, [])) return { lines: [ONW.keymaster.fail(g, id, "self", "交換", [], `${c.label} ${c.me.name}`)], reveal: ONW.keymaster.failRev(g, id, id), nextChain: null, failed: true };   // 朝のうち・酔い覚めにもロックは効く
        ONW.swapGrave(g, id, idx);
        const got = g.currentRoles[id];
        const lines = [`墓地${idx + 1}枚目と役職を交換しました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。`];
        g.nightLogsAll.push(`${c.label} ${c.me.name} は 墓地${idx + 1} と役職を交換し、${rn(got)} になりました。`);
        lines.push(...c.soberInfoLines(g, id, got));
        const reveal = { kind: "relic", target: idx, role: ONW.shownRole(got) };   // 墓地と入れ替わる演出（朝も、昼に酔いが覚めたときも出す。昼は hostRecv が reveal.day を立て、数秒後に閉じる）
        return { lines, reveal, nextChain: null };
      },
      after(c, res) {   // 昼に墓地と交換した先の役職にも能力があれば、続けて1回使える
        const g = c.g, id = c.id;
        if (ONW.roleCanChain(g.currentRoles[id])) { res.nextChain = g.currentRoles[id]; g.morningAct[id] = res.nextChain; g.morningDone[id] = false; res.lines.push("この役職の能力も、議論中に1回だけ使えます。"); }
      },
      peek: (c) => c.soberPeek(c.g, c.id, c.g.currentRoles[c.id]),   // 昼に使った墓荒らし: 交換後の役職の演出
    },
  });
})(window.ONW);
