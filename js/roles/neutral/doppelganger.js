/** ドッペルゲンガー: 夜に1人を選び、朝の処理でその人の「その時点の役職」をコピーする(選ばれた人は変化しない) */
(function (ONW) {

  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  // ドッペルゲンガー: 選んだ人のその時点の役職をコピーする（選ばれた人は動かない）。コピーした役職の夜の情報も、その場で知る（朝に分かる）。能力は朝に使う
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    const seen = g.currentRoles[t.id], got = ONW.copyRole(g, t.id, p.id), shown = ONW.shownRole(got);
    i.mode = "doppel"; i.target = t.id; i.newRole = shown; i.known[p.id] = shown; i.known[t.id] = ONW.shownRole(seen);
    i.doppel = { target: t.id, newRole: shown };
    g.nightLogsAll.push(`${n.rn("doppelganger")} ${p.name} は ${t.name} をコピーし、${n.rn(got)} になりました。`);
    ONW.cpu.learnInfo(g, p.id, got);
    i.pendingChain = ONW.cpu.chainRoles("doppelganger").includes(got) ? got : null;
    n.ob(p.id, [t.id]);
    n.nn("doppelganger");
  }

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  function cpuClaim(k, g, p, r, i, c) {   // ドッペルゲンガー: 選んだ人と、コピーして手にした役職を開示（人外を手にしたら村人役を騙る）
    const { rn, nameOf, isNonVillage, nonVillageLie } = k;
    c.co = "doppelganger";
    if (!i.doppel) return;   // コピー情報なし: COだけする
    const dt = nameOf(g, i.doppel.target), dn = i.doppel.newRole;
    if (isNonVillage(dn)) { const lie = nonVillageLie(g, p, "doppelganger", i, dn); c.co = lie.co; c.result = lie.result; }
    else {
      c.result = { short: `${dt} → ${rn(dn)}`, text: `${dt} をコピーして ${rn(dn)} になりました。`, claim: { kind: "doppel", target: i.doppel.target, role: dn } };
      if ((dn === "seer" || dn === "mad_seer") && i.mode === "player") c.extra = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} を占って ${rn(i.known[i.target])} でした。`, claim: { kind: "seer", target: i.target, role: i.known[i.target] } };   // コピーした占い師の結果も続けて言う
    }
  }
  function fakeGot(k, g, i, role) {
    const { rn, nameOf } = k;
    return { co: "doppelganger", result: { short: `${nameOf(g, i.doppel.target)} → ${rn(role)}`, text: `${nameOf(g, i.doppel.target)} をコピーして ${rn(role)} になりました。`, claim: { kind: "doppel", target: i.doppel.target, role } } };
  }

  ONW.defineRole("doppelganger", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>コピーしたい人</strong>のカードを1人分押してください。<br>朝になると、その人の<strong>その時点の役職</strong>をコピーして、あなたがその役職になります（選んだ人の役職は変わりません）。ドッペルゲンガーをコピーすると村人になります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np, ng) => np === 1,
      chainHow: () => "<strong>コピーしたい人</strong>のカードを押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): コピーした相手を選ぶ → コピーして新しくなった役職を選ぶ
    coResult: {
      kind: "doppel", targetLabel: "コピーした相手", roleHint: "をコピーして、新しくなった役職",
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} をコピーしました。役職は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [`${who} をコピーして ${K.rn(role)} になりました。`, { kind: "doppel", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    stagePick: {},
    // 朝の演出(stage.js の playMorning / morningDur が、reveal.kind === "doppel" のときに呼ぶ): 選んだ人のカードがめくれる → そのコピーが自分の席へ飛ぶ → 自分のカードが新しい役職で表になる(選んだ人のカードは動かない)
    stageMorning: {
      kind: "doppel", dur: () => 900 + 950 + 200 + 750,
      play(r, SK) {
        const { later } = SK;
        const mine = `p:${ONW.net.myId()}`, theirs = `p:${r.target}`, el = SK.$t();
        const a = el.querySelector(`[data-k="${theirs}"] .tb-card`), b = el.querySelector(`[data-k="${mine}"] .tb-card`);
        if (!a || !b || !a.animate) { SK.show(mine, r.role); return; }
        SK.show(theirs, r.seen);                                    // 選ばれた人のカードがめくれる
        later(() => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          const ghost = document.createElement("div");           // めくれたカードのコピー（表向き）
          ghost.className = "tb-seat up";
          ghost.style.cssText = `position:fixed;left:${ra.left}px;top:${ra.top}px;width:${ra.width}px;height:${ra.height}px;margin:0;padding:0;pointer-events:none;z-index:60;`;
          const c = a.cloneNode(true);
          c.style.cssText = `width:${ra.width}px;height:${ra.height}px;`;
          c.classList.remove("pick", "sel");
          ghost.appendChild(c);
          document.body.appendChild(ghost);
          const dx = rb.left - ra.left, dy = rb.top - ra.top;
          const A = ghost.animate([
            { transform: "translate(0,0) scale(1)", opacity: 0.55 },
            { transform: `translate(${dx / 2}px,${dy / 2 - 26}px) scale(1.22)`, opacity: 0.9, offset: 0.5 },
            { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 0.8 },
          ], { duration: 900, easing: "ease-in-out", fill: "forwards" });
          later(() => {
            A.cancel(); ghost.remove();
            delete SK.up[theirs]; delete SK.glow[theirs];              // 選ばれた人のカードは伏せて元のまま
            SK.show(mine, r.role);                                  // 自分のカードが、コピーした役職で表になる
          }, 950);
        }, 900);
      },
    },
    cpuClaim,
    cpuFakeGot: { kind: "doppel", make: fakeGot },
    cpuNight: { order: 60, stage: "doppel", chain: true, chainEnd: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 38, name: "ドッペルゲンガー", team: ONW.TEAM.THIRD, wakeOrder: 52, sort: 45,
      desc: "第三陣営（コピーするまでは無陣営）。夜に1人を選び、朝の処理でその人の「その時点の役職」をコピーして、その役職になります（選ばれた人の役職は変わりません）。ドッペルゲンガーをコピーした場合は村人になります。コピーした役職に夜の能力があれば朝のうちに使え、マーリン・共有者などの夜の情報も朝に分かります。コピーした後の陣営・勝利条件はコピーした役職に従い、誰もコピーできなかったときは勝利できません。恋人はコピーできません（役職ではないため）。悪女・純愛者をコピーしたときも、相手の選択はコピーされず、あなた自身が選びます。" },
    groups: { "transform:silver_shadow": 10 },
    night: {
      kind: "doppel", order: 10,
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      // 墓荒らしのあと・怪盗の前。コピーした役職の夜の能力は朝のうちに使え、マーリン・共有者などの夜の情報も朝に分かる（墓荒らしと同じ）
      resolve(c, p) {
        const g = c.g, rn = c.rn, nameOf = c.nameOf, rev = c.rev;
        const t = c.selOf(p).players[0]; if (!t || t === p.id || !g.players.some((q) => q.id === t)) return;
        const seen = g.currentRoles[t], got = ONW.copyRole(g, t, p.id);   // コピーするのはその時点の役職（墓荒らしの後・怪盗の前）
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "doppelganger");
        g.nightLogsAll.push(`${rn(c.eff(p))} ${p.name} は ${nameOf(t)} をコピーし、${rn(got)} になりました。`);
        c.hold(p.id, `${nameOf(t)} をコピーしました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。${seen === "doppelganger" ? "（ドッペルゲンガーをコピーしたので村人になります）" : ""}`);
        if (ONW.roleIsActive(got)) { g.morningAct[p.id] = got; c.hold(p.id, `新しい役職（${rn(got)}）の能力を、朝のうちに使えます。`); }
        rev[p.id] = { kind: "doppel", target: t, seen: ONW.shownRole(seen), role: ONW.shownRole(got) };   // 選ばれた人のカードがめくれ、自分のところにコピーされていく
        c.gotInfo(g, p, got, rev, { skipGrave: null, both: false, skipKey: `p:${t}`, via: "コピーした従者" });
      },
    },
    morning: {
      run(c) {   // 墓荒らしが墓地から引いたドッペルゲンガー: 朝にコピーする（その時点の役職）
        if (!c.players.length) return null;
        const g = c.g, rn = c.rn, id = c.id, t = c.players[0], seen = g.currentRoles[t], got = ONW.copyRole(g, t, id);
        const lines = [`${c.nameOf(t)} をコピーしました。あなたの新しい役職は「${rn(ONW.shownRole(got))}」です。${seen === "doppelganger" ? "（ドッペルゲンガーをコピーしたので村人になります）" : ""}`];
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} をコピーし、${rn(got)} になりました。`);
        lines.push(...c.soberInfoLines(g, id, got));
        const reveal = { kind: "doppel", target: t, seen: ONW.shownRole(seen), role: ONW.shownRole(got) };   // コピー演出（朝も、昼に酔いが覚めたときも出す）
        return { lines, reveal, nextChain: ONW.roleIsActive(got) ? got : null };
      },
      peek: (c) => c.soberPeek(c.g, c.id, c.g.currentRoles[c.id]),   // 昼に使った(墓荒らしが引いたドッペルを昼にコピーした)とき: コピーして手にした役職の演出（口封じの狂人なら対象のカードにミュートマーク など）
      after(c, res) {
        const g = c.g, id = c.id;
        if (res.nextChain) { g.morningAct[id] = res.nextChain; g.morningDone[id] = false; res.lines.push("この役職の能力も、朝のうちに使えます。"); }
      },
    },
  });
})(window.ONW);
