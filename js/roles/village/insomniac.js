/** 後覚者: 夜行動がすべて終わったあと、自分の最終的な役職を確認できる */
(function (ONW) {
  /** 朝が終わった直後に、後覚者へ最終的な役職を伝える（id → 通知文） */
  function results(c) {
    const g = c.g, out = {};
    g.players.filter((p) => !p.isCpu && !(g.drunkOverlay && g.drunkOverlay[p.id]) && (g.initialRoles[p.id] === "insomniac" || g.currentRoles[p.id] === "insomniac")).forEach((p) => {
      // 元々の後覚者 / 後から後覚者になった人（怪盗・いたずらっ子などで最終役職が後覚者）の両方に、そのときの最終的な役職を伝える
      out[p.id] = `夜の行動がすべて終わりました。あなたの最終的な役職は「${c.rn(ONW.shownRole(g.currentRoles[p.id]))}」です。`;
    });
    return out;
  }

  const cpuFinal = (g, id, k) => { const i = k.infoOf(g, id), fin = ONW.shownRole(g.currentRoles[id]); i.mode = "insomniac"; i.finalRole = fin; i.known[id] = fin; };

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  /** 後覚者の結果開示（本家式）。fin = 最終的な役職。後覚者のままなら「元々後覚者でした。」、変わっていたら「〇〇に役職が変わっていました。」 */
  function insomResult(k, fin) {
    const { rn } = k;
    if (fin === "insomniac") return { short: "元々後覚者", text: "元々後覚者でした。", claim: { kind: "insomniac", role: "insomniac", orig: "insomniac" } };
    return { short: `→ ${rn(fin)}`, text: `${rn(fin)}に役職が変わっていました。`, claim: { kind: "insomniac", role: fin } };
  }
  /** 後覚者を騙るときの嘘の結果開示（結果を言わないと騙りだと透けるので、必ず何か言う） */
  function insomLie(k, g) {
    const { rn, fakeVillageRole } = k;
    const r = Math.random();
    if (r < 0.5) return insomResult(k, "insomniac");                                              // 元々後覚者でした
    const role = fakeVillageRole(g, (x) => x !== "insomniac");
    if (r < 0.8) return insomResult(k, role);                                                     // 〇〇に役職が変わっていました
    return { short: `元々${rn(role)}`, text: `元々${rn(role)}でした。`, claim: { kind: "insomniac", role: "insomniac", orig: role } };   // 別の役職から後覚者になった
  }
  function cpuClaim(k, g, p, r, i, c) {
    const { isNonVillage, nonVillageLie } = k;
    c.co = "insomniac";
    if (!i.finalRole) return;   // 後覚者（情報なし）: COだけする
    if (isNonVillage(i.finalRole)) { const lie = nonVillageLie(g, p, "insomniac", i, i.finalRole); c.co = lie.co; c.result = lie.result; }
    else c.result = insomResult(k, i.finalRole);
  }
  function fakeGot(k, g, i, role) { return { co: "insomniac", result: insomResult(k, role) }; }

  ONW.defineRole("insomniac", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜の行動がないときの説明文(idle。null なら共通の文言)
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼になる直前に、その時点での<strong>最終的な役職</strong>が分かります。</p>`;
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 結果の種類(自身が後覚者 / 変わっていた)→ 元々の役職 / 変化後の役職を選ぶ
    coResult: {
      kind: "insom",
      insomSame: () => ["元々後覚者でした。", { kind: "insomniac", role: "insomniac", orig: "insomniac" }, null, "disclose", "元々後覚者"],
      insomOrigRole: (role, K) => [`元々${K.rn(role)}でした。`, { kind: "insomniac", role: "insomniac", orig: role }, null, "disclose", `元々${K.rn(role)}`],
      insomChanged: (role, K) => [`${K.rn(role)}に役職が変わっていました。`, { kind: "insomniac", role }, null, "disclose", `→ ${K.rn(role)}`],
    },
    cpuClaim,
    cpuFakeGot: { kind: "insomniac", make: fakeGot },
    /** 墓荒らし・ドッペルゲンガーで後覚者を手にしたCPUが、続けて言う結果（マイクラ版 _cpuCoOnlyMaybeInsomniacResult と同じ）:
     *  最終的な役職が後覚者のまま → 「元々〇〇でした」(〇〇 = 手にする前の役職)、変わっていた → 「△△に役職が変わっていました」。
     *  最終役職が人外のときは、後覚者CO(cpuClaim)と同じく本当のことは言わず、嘘の結果にする */
    cpuChainLie: (k, g, p, i) => insomLie(k, g),   // 人外が「後覚者を手にした」と騙るときも、結果を言わないと透けるので嘘の結果を続ける
    cpuChainResult(k, g, p, i) {
      const fin = ONW.shownRole(g.currentRoles[p.id]), ini = ONW.shownRole(g.initialRoles[p.id]);
      if (k.isNonVillage(fin)) return insomLie(k, g);
      if (fin === "insomniac") return { short: `元々${k.rn(ini)}`, text: `元々${k.rn(ini)}でした。`, claim: { kind: "insomniac", role: "insomniac", orig: ini } };
      return insomResult(k, fin);
    },
    cpuCoFollow(k, g, p, r, i, c) { if (!c.result && (r !== "insomniac" || i.finalRole)) c.result = insomLie(k, g); },   // 後覚者を騙るのに結果を言わないと透けるので、嘘の結果開示もする
    // CPU: 最終役職を知る(酔い覚め直後 sober / 夜が終わったあと after / 昼に動いたとき notice)
    cpuSober(g, id, i, shown) { i.mode = "insomniac"; i.finalRole = shown; },
    cpuAfter: cpuFinal, cpuNotice: cpuFinal,
    info: { deck: 12, name: "後覚者", team: ONW.TEAM.VILLAGE, wakeOrder: 70, sort: 28,
      desc: "村人陣営。夜行動がすべて終わったあと、自分の最終役職を確認できます。" },
    groups: { "transform:light_apostle": 6 },
    settleMsg: { order: 10, run(c, p, mode) {
      const g = c.g, tx = results(c)[p.id];
      // ※既存の挙動を保持: 通常は insom に「生の役職」、再入室(resync)は「本人に見える役職(shownRole)」を入れる
      return { logs: tx ? [tx] : [], insom: tx ? (mode === "settle" ? g.currentRoles[p.id] : ONW.shownRole(g.currentRoles[p.id])) : null };
    } },
    /** 昼に役職が入れ替わって、後覚者から別の役職になった / 別の役職から後覚者になった人は、その瞬間に後覚者の能力が発動し、最終的な役職を知る */
    dayShift(c, before) {
      const g = c.g;
      g.players.forEach((p) => {
        const b = before[p.id], a = g.currentRoles[p.id];
        if (b === a || (b !== "insomniac" && a !== "insomniac")) return;
        if (c.isDead(p.id) || ONW.hiddenDrunk(g, p.id)) return;   // 酔いが覚める前の人は、覚めたときに最終役職を知る
        const shown = ONW.shownRole(a);
        if (p.isCpu) { ONW.cpu.notifyInsom(g, p.id); return; }
        const text = `後覚者の能力が発動しました。昼に役職が入れ替わり、あなたの最終的な役職は「${c.rn(shown)}」になりました。`;
        c.hold(p.id, text);
        if (g.soberLines && g.soberLines[p.id]) g.soberLines[p.id].push(text);
        c.send(p.id, { t: "insomday", text, role: shown });
      });
    },
  });
})(window.ONW);
