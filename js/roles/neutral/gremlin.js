/** グレムリン: 夜に2人(コピー元 → コピー先)を選び、その時点のコピー元の役職をコピー先にコピーする */
(function (ONW) {
  // ---- 役職固有の補助関数(もとは state.js にあったもの。中身は変更なし) ----
  /** グレムリンの選択 [コピー元, コピー先]。最終盤面でその人がグレムリンを持っていて、選択が記録されているときだけ（選択は役職の持ち主に記録され、カードについて動く） */
  ONW.gremlinPick = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.GREMLIN && (g.gremlinPicks || {})[id]) || null;
  ONW.gremlinPairs = (g) => (g.players || []).map((p) => [p.id, ONW.gremlinPick(g, p.id)]).filter(([, pk]) => pk && pk.length === 2);
  // ---- ここまで ----


  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  // グレムリン: 2人（コピー元 → コピー先）を選び、その時点のコピー元の役職をコピー先にコピーする。コピー元の役職は本人が知る（朝に分かる）
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const f = n.forced(p), i = n.infoOf(p.id);
    const all = g.players;
    if (all.length < 2) return;
    let pair = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
    if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(g.players.filter((q) => q.id !== p.id && !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
    if (pair.length < 2) return;
    const [a, b] = pair, seen = g.currentRoles[a], got = ONW.gremlinCopy(g, a, b), shown = ONW.shownRole(got), sa = ONW.shownRole(seen);
    ONW.setRoleBound(g, "gremlinPicks", p.id, [a, b]);
    i.mode = "gremlin"; i.gremlin = { from: a, to: b, role: sa };
    i.known[a] = sa; i.known[b] = shown;
    g.nightLogsAll.push(`${label} ${p.name} は ${n.nameOf(a)} の役職を ${n.nameOf(b)} にコピーしました（${n.rn(got)}）。`);
    n.ob(p.id, [a, b]);
    n.nn(rid);
  }

  ONW.defineRole("gremlin", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nm, sel, esc } = X;
        const gl = sel.players.map((id) => esc(nm(id)));
        return `<p class="night-step__hint">上のテーブルから、<strong>コピー元 → コピー先</strong>の順に2人のカードを押してください。（自分以外）<br>朝になると、その時点のコピー元の役職がコピー先にコピーされ、コピー元の役職があなたに分かります。コピー元は変化しません。選んだ2人のどちらかが勝利すれば、あなたも追加で勝利します。${later}</p><p class="night-step__hint">選択中: <strong>コピー元: ${gl[0] || "未選択"} → コピー先: ${gl[1] || "未選択"}</strong></p>`;
      },
      chainReady: (np, ng) => np === 2,
      chainHow: () => "<strong>コピー元 → コピー先</strong>の順に2人のカードを押して（自分以外）",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): コピー元 → コピー先の順に2人を選ぶ(1人目がコピー元、2人目がコピー先)
    coResult: {
      kind: "gremlin", twoHint: "コピー元 → コピー先の順に2人を選んでください。",
      pickTwo: (sel, K) => [`${K.nameOf(sel[0])} の役職を ${K.nameOf(sel[1])} にコピーしました。`, { kind: "gremlin", from: sel[0], to: sel[1] }, null, "disclose", `${K.nameOf(sel[0])} → ${K.nameOf(sel[1])}`],
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人
    stagePick: { players: 2 },
    // 朝の演出(stage.js の playMorning / morningDur が、reveal.kind === "gremlin" のときに呼ぶ): コピー元のカードが表になる → そのコピーがコピー先へ飛んでいく → コピー先のカードが表になる(コピー元は動かない。どちらも朝のあいだ表のまま)
    stageMorning: {
      kind: "gremlin", dur: () => 900 + 950 + 200 + 750,
      play(r, SK) {
        const { later } = SK;
        const from = `p:${r.from}`, to = `p:${r.to}`, el = SK.$t();
        const a = el.querySelector(`[data-k="${from}"] .tb-card`), b = el.querySelector(`[data-k="${to}"] .tb-card`);
        const landed = () => { SK.show(to, r.copied || r.role); };   // コピー先が、コピーされた役職で表になる
        if (!a || !b || !a.animate) { SK.show(from, r.role); landed(); return; }
        SK.show(from, r.role);                                      // コピー元のカードがめくれる
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
            { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 0.6 },
            { transform: `translate(${dx / 2}px,${dy / 2 - 30}px) scale(1.25) rotate(-6deg)`, opacity: 0.95, offset: 0.5 },
            { transform: `translate(${dx}px,${dy}px) scale(1) rotate(0deg)`, opacity: 0.85 },
          ], { duration: 900, easing: "ease-in-out", fill: "forwards" });
          later(() => { A.cancel(); ghost.remove(); landed(); }, 950);
        }, 900);
      },
    },
    cpuNight: { order: 80, stage: "gremlin", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 41, name: "グレムリン", team: ONW.TEAM.THIRD, wakeOrder: 54, sort: 40,
      desc: "第三陣営。夜に2人を「コピー元 → コピー先」の順に選びます。朝の処理（墓荒らし → ドッペルゲンガー → 怪盗 → グレムリン → いたずらっ子の順）で、その時点のコピー元の役職がコピー先にコピーされます（コピー元は変化しません）。コピー元の役職は朝に分かります。フリーター・従者などは就職先・ご主人ごとコピーされ、ドッペルゲンガーをコピーすると村人になります。選んだ2人のどちらかが最終的に勝利すれば、あなたも追加で勝利します。" },
    groups: { "transform:silver_shadow": 13 },
    night: {
      kind: "gremlin", order: 10,
      complete: (np) => np === 2,
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      resolve(c, p) {   // その時点のコピー元の役職を、コピー先にコピーする（コピー元は動かない）。いたずらっ子の前
        const g = c.g, rn = c.rn, nameOf = c.nameOf;
        const [a, b] = c.selOf(p).players; if (!a || !b || a === b) return;
        const seen = g.currentRoles[a], got = ONW.gremlinCopy(g, a, b);
        ONW.setRoleBound(g, "gremlinPicks", p.id, [a, b]);   // 選択は役職の持ち主に記録（カードについていく）
        ONW.observeNote(g, p.id, [a, b]);
        ONW.newsNote(g, "gremlin");
        g.nightLogsAll.push(`${rn(c.eff(p))} ${p.name} は ${nameOf(a)} の役職を ${nameOf(b)} にコピーしました（${rn(got)}）。`);
        c.hold(p.id, `${nameOf(a)} の役職「${rn(ONW.shownRole(seen))}」を ${nameOf(b)} にコピーしました。${seen === "doppelganger" ? "（ドッペルゲンガーをコピーしたので村人になります）" : ""}`);
        c.rev[p.id] = { kind: "gremlin", from: a, to: b, role: ONW.shownRole(seen), copied: ONW.shownRole(got) };   // コピー元のカードが表になり、コピー先にコピーされていく
      },
    },
    morning: {
      run(c) {
        if (c.players.length < 2) return null;
        const g = c.g, rn = c.rn, id = c.id, nameOf = c.nameOf;
        const [a, b] = c.players, seen = g.currentRoles[a], got = ONW.gremlinCopy(g, a, b);   // 朝の時点のコピー元の役職を、コピー先にコピー
        ONW.setRoleBound(g, "gremlinPicks", id, [a, b]);
        const lines = [`${nameOf(a)} の役職「${rn(ONW.shownRole(seen))}」を ${nameOf(b)} にコピーしました。${seen === "doppelganger" ? "（ドッペルゲンガーをコピーしたので村人になります）" : ""}`];
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${nameOf(a)} の役職を ${nameOf(b)} にコピーしました（${rn(got)}）。`);
        return { lines, reveal: { kind: "gremlin", from: a, to: b, role: ONW.shownRole(seen), copied: ONW.shownRole(got) }, nextChain: null };
      },
    },
  });
})(window.ONW);
