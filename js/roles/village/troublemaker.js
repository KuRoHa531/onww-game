/** いたずらっ子: 自分以外2人の役職を入れ替える(入れ替えは夜の終わりにまとめて反映) */
(function (ONW) {

  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const i = n.infoOf(p.id), others = g.players.filter((q) => q.id !== p.id), f = n.forced(p);
    if (others.length < 2) return;
    // デバッグ: 入れ替える2人の指定（1人だけ指定なら、もう1人はランダム）
    let pair = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
    if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(others.filter((q) => !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
    const [a, b] = pair.map((id) => g.players.find((q) => q.id === id));
    const sp = ONW.watcher.shiftPair(g, p.id, a.id, b.id);   // 静観者を選んだら、実際に入れ替える席は別の人（選んだ本人には静観者を選んだように見える。docs/watcher.md）
    if (!sp.ok) {   // 入れ替える相手が足りなければ入れ替わらない（静観者を選んだことは「能力を使われた」に数える）
      i.mode = "tm"; i.keyFail = { kind: "shift", pair: [a.id, b.id] };
      n.hold(p.id, ONW.watcher.noneLine("入れ替え"));
      return;
    }
    const why = ONW.keymaster.gate(g, p.id, [sp.a, sp.b]);   // 鍵師のロック: 自分か選んだどちらかの席がロック中なら🔒に弾かれて失敗（入れ替えはキューに積まない）
    if (why) {
      i.mode = "tm"; i.keyFail = { kind: why, pair: [a.id, b.id] };
      n.hold(p.id, ONW.keymaster.fail(g, p.id, why, "入れ替え", [a.id, b.id], `${label} ${p.name}`, true));
      ONW.watcher.keyFailShown(g, p.id, [a.id, b.id], [sp.a, sp.b]);
      return;
    }
    g.tmQueue.push({ id: p.id, a: sp.a, b: sp.b });     // 反映は夜の終わり（net.js）
    i.mode = "tm"; i.pair = [a.id, b.id];
    g.nightLogsAll.push(ONW.watcher.pairLine(sp, `${label} ${p.name}`, (id) => (g.players.find((q) => q.id === id) || {}).name || "?", a.id, b.id, (x, y) => `${x} と ${y} の役職を入れ替えよう`, (x, y) => `${x} と ${y} の役職を入れ替えました。`) || `${label} ${p.name} は ${a.name} と ${b.name} の役職を入れ替えました。`);   // 静観者にずれたときは「〇〇と△△の役職を入れ替えようとしましたが、〇〇は静観者だったため□□に変わり、…を入れ替えました。」
    n.hold(p.id, `${a.name} と ${b.name} の役職を入れ替えました。`);
    n.ob(p.id, [a.id, b.id]);
    n.nn(rid);
  }

  // ---- CPUの発言(もとは cpu.js。中身は変更なし) ----
  function lieClaim(k, g, p, others, selfRole, co) {
    if (others.length < 2) return null;
    const { pick } = k;
    const a = pick(others), b = pick(others.filter((q) => q.id !== a.id));
    return { co, result: { short: `${a.name} ⇄ ${b.name}`, text: `${a.name} と ${b.name} を入れ替えました。`, claim: { kind: "troublemaker" } } };
  }
  function cpuClaim(k, g, p, r, i, c) {
    const { nameOf } = k;
    c.co = "troublemaker";
    if (i.keyFail) {   // ロックされて入れ替えに失敗した: 正直に「失敗した」と言う
      const [x, y] = (i.keyFail.pair || []).map((id) => nameOf(g, id));
      c.result = i.keyFail.kind === "shift"
        ? { short: `${x} ⇄ ${y} 変化なし`, text: `${x} と ${y} を選びましたが、入れ替える相手が足りず役職は変化しませんでした。`, claim: null }
        : i.keyFail.kind === "self"
        ? { short: "ロックで失敗", text: "自身の役職がロックされていたため入れ替えに失敗しました。", claim: null }
        : { short: `${x} ⇄ ${y} ロックで失敗`, text: `${x} と ${y} を選びましたが、どちらかの役職がロックされていたため入れ替えできませんでした。`, claim: null };
      return;
    }
    if (!i.pair) return;   // いたずらっ子（入れ替え情報なし）: COだけする
    c.result = { short: `${nameOf(g, i.pair[0])} ⇄ ${nameOf(g, i.pair[1])}`, text: `${nameOf(g, i.pair[0])} と ${nameOf(g, i.pair[1])} を入れ替えました。`, claim: { kind: "troublemaker" } };
  }

  ONW.defineRole("troublemaker", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、役職を入れ替えたい<strong>2人のカード</strong>を押してください。（自分以外）${later}</p>${nowSel(" と ", 2)}`;
      },
      chainReady: (np, ng) => np === 2,
      chainHow: () => "役職を入れ替えたい<strong>2人のカード</strong>を押して（自分以外）",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 入れ替えた2人を選ぶ
    coResult: {
      kind: "tm", twoHint: "入れ替えた2人を選んでください。",
      pickTwo: (sel, K) => [`${K.nameOf(sel[0])} と ${K.nameOf(sel[1])} を入れ替えました。`, { kind: "troublemaker" }, null, "disclose", `${K.nameOf(sel[0])} ⇄ ${K.nameOf(sel[1])}`],
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人
    stagePick: { players: 2 },
    // 朝の演出(stage.js の playMorning / morningDur が、reveal.kind === "tm" のときに呼ぶ): 選んだ2人のカードが(裏向きのまま)空中で交差して入れ替わる
    stageMorning: {
      kind: "tm", dur: () => 1250 + 500,
      play(r, SK) {
        const { later } = SK;
        const el = SK.$t(), a = el.querySelector(`[data-k="p:${r.a}"] .tb-card`), b = el.querySelector(`[data-k="p:${r.b}"] .tb-card`);
        if (!a || !b || !a.animate) return;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const dx = rb.left - ra.left, dy = rb.top - ra.top;
        const path = (x, y, lift, tilt) => [
          { transform: "translate(0,0) scale(1) rotate(0deg)" },
          { transform: `translate(${x * 0.3}px,${y * 0.3 + lift}px) scale(1.18) rotate(${tilt}deg)`, offset: 0.3 },
          { transform: `translate(${x * 0.7}px,${y * 0.7 + lift}px) scale(1.18) rotate(${-tilt}deg)`, offset: 0.7 },
          { transform: `translate(${x}px,${y}px) scale(1) rotate(0deg)` },
        ];
        a.style.zIndex = 6; b.style.zIndex = 5;
        const opt = { duration: 1200, easing: "ease-in-out", fill: "forwards" };
        const A = a.animate(path(dx, dy, -26, -8), opt), B = b.animate(path(-dx, -dy, 26, 8), opt);
        later(() => { A.cancel(); B.cancel(); a.style.zIndex = b.style.zIndex = ""; }, 1250);   // 裏面は同じなので、元の席に戻すと入れ替わったまま見える
      },
    },
    cpuLie: { role: "troublemaker", weight: 12, order: 3, claim: lieClaim },
    cpuClaim,
    /** 墓荒らし・ドッペルゲンガーでいたずらっ子を手にしたCPUが、続けて言う結果: 朝のうちに入れ替えた2人 */
    cpuChainResult(k, g, p, i) { if (i.mode !== "tm" || !i.pair || i.keyFail) return null; const c = {}; cpuClaim(k, g, p, "troublemaker", i, c); return c.result || null; },
    cpuNight: { order: 90, stage: "tm", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { observe: "player", sealTarget: true, deck: 11, name: "いたずらっ子", team: ONW.TEAM.VILLAGE, wakeOrder: 60, sort: 27,
      desc: "村人陣営。自分以外2人の役職を入れ替えます。" },
    groups: { "transform:light_apostle": 5 },
    night: {
      kind: "tm", order: 10,
      complete: (np) => np === 2,
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      resolve(c, p) {
        const g = c.g, rn = c.rn, nameOf = c.nameOf;
        const [a, b] = c.selOf(p).players; if (!a || !b) return;   // a, b = 選んだ2人（文章・演出・ログはこの2人で出す）
        const sp = ONW.watcher.shiftPair(g, p.id, a, b);   // 静観者を選んだら、実際に入れ替える席は別の人（選んだ本人には静観者を選んだように見える。docs/watcher.md）
        if (!sp.ok) { c.hold(p.id, ONW.watcher.noneLine("入れ替え")); return; }   // 入れ替える相手が足りなければ入れ替わらない（新聞・観測にも載らない）
        const why = ONW.keymaster.gate(g, p.id, [sp.a, sp.b]);   // 鍵師のロック（先の段階で済んでいる）: 自分かどちらかの席がロック中なら失敗。入れ替えず、新聞・観測にも載らない
        if (why) { c.hold(p.id, ONW.keymaster.fail(g, p.id, why, "入れ替え", [a, b], `${rn(c.eff(p))} ${p.name}`, true)); ONW.watcher.keyFailShown(g, p.id, [a, b], [sp.a, sp.b]); c.rev[p.id] = ONW.keymaster.failRev(g, p.id, p.id); return; }
        g.tmQueue.push({ id: p.id, a: sp.a, b: sp.b });
        ONW.observeNote(g, p.id, [a, b], null, "troublemaker");
        ONW.newsNote(g, "troublemaker");
        g.nightLogsAll.push(ONW.watcher.pairLine(sp, `${rn(c.eff(p))} ${p.name}`, nameOf, a, b, (x, y) => `${x} と ${y} の役職を入れ替えよう`, (x, y) => `${x} と ${y} の役職を入れ替えました。`) || `${rn(c.eff(p))} ${p.name} は ${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`);
        c.hold(p.id, `${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`);
        c.rev[p.id] = { kind: "tm", a, b };
      },
    },
    morning: {
      run(c) {
        if (c.players.length < 2) return null;
        const g = c.g, id = c.id, nameOf = c.nameOf;
        const [a, b] = c.players;   // a, b = 選んだ2人（文章・演出はこの2人）
        const sp = ONW.watcher.shiftPair(g, id, a, b);   // 静観者を選んだら、実際に入れ替える席は別の人（墓荒らし・ドッペル・酔い覚め経由でも同じ）
        if (!sp.ok) return { lines: [ONW.watcher.noneLine("入れ替え")], reveal: null, nextChain: null, failed: true };
        const why = ONW.keymaster.gate(g, id, [sp.a, sp.b]);   // 朝のうち・酔い覚めの入れ替えにもロックは効く
        if (why) { const fl = ONW.keymaster.fail(g, id, why, "入れ替え", [a, b], `${c.label} ${c.me.name}`, true); ONW.watcher.keyFailShown(g, id, [a, b], [sp.a, sp.b]); return { lines: [fl], reveal: ONW.keymaster.failRev(g, id, id), nextChain: null, failed: true }; }
        ONW.swapPlayers(g, sp.a, sp.b);
        g.nightLogsAll.push(ONW.watcher.pairLine(sp, `${c.label} ${c.me.name}`, nameOf, a, b, (x, y) => `${x} と ${y} の役職を入れ替えよう`, (x, y) => `${x} と ${y} の役職を入れ替えました。`) || `${c.label} ${c.me.name} は ${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`);
        return { lines: [`${nameOf(a)} と ${nameOf(b)} の役職を入れ替えました。`], reveal: { kind: "tm", a, b }, nextChain: null };
      },
    },
  });
})(window.ONW);
