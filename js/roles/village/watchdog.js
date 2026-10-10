/**
 * 番犬（マイクラ版 WATCHDOG を参考）: 村人陣営。
 * 夜に自分以外の1人を「飼い主」に選ぶ。飼い主は（番犬がいる間）追放されなくなり、番犬自身が飼い主に投票すると、飼い主を噛み殺す。
 *   ・飼い主は「役職の持ち主」単位で記録（ONW.setRoleBound(g, "watchdogOwners", 持ち主ID, 飼い主のID)）。
 *     役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。
 *     ・番犬のカードが別の人の手に渡る(入れ替わる)と、飼い主の判定もそのカードについて移動する。
 *     ・番犬のカードが上書きされる(ドッペルのコピー・グレムリンのコピー・シャッフラーの置き換え)と、上書きされた側の飼い主の記録は消える。
 *     ・番犬のカードが飼い主本人の手に渡ったら、飼い主を元の持ち主に付け替える（自分自身は飼い主にならない。純愛者と同じ）。
 *     ・飼い主(対象のプレイヤー)はプレイヤー単位のまま。
 *   ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
 *   ・朝の演出: 番犬から見て、選んだ飼い主のカードが「🦴」でめくれる（reveal = kind:"peek" の "__bone" 面）。選ばれた人には何も伝わらない。
 *   ・「今の飼い主」は最終盤面で番犬を持っている人（酔いが覚めている人）の記録だけ（ONW.watchdog.pairs / ownerOf / protectedIds）。何度呼んでも同じ結果。
 * 実装の進み具合は _wip/番犬_依頼文.txt を参照。
 *  1of3: 登録・夜の選択・役職移動への追従(移動・上書き・本人に渡った)・朝の🦴演出・墓荒らし/ドッペル経由・ルールコード ONW44【済】
 *  2of3: 飼い主を追放できなくする・番犬が飼い主に投票すると噛殺・結果発表/死因/勝敗への反映
 *  3of3: CPU(騙り・投票)・COボタン・ガイド・総合テスト【済】
 *    ・CPUの騙り(cpuLie): 「〇〇を飼い主にしていました」と、自分以外の1人を飼い主に名乗る(結果は嘘。本当のCOと同じ文言・同じ claim 形式)。
 *    ・CPUの投票: 番犬のCPUは飼い主に投票しない(噛み殺してしまうため)。ただし飼い主が人狼だと分かっているときは、あえて投票して噛みに行く(cpuVoteExclude)。
 *    ・他のCPUは、番犬COの飼い主には票を入れにくい(票が無効になるため。cpu.js scoreVote の claim.kind === "watchdog")。
 *    ・COボタン: coResult(kind "watchdog")で「飼い主にした相手」を選んで開示(1of3で実装済み。通しテストで確認)。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.WATCHDOG;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const BONE = "__bone";
  const boneReveal = (t) => ({ kind: "peek", items: [{ k: `p:${t}`, role: BONE }] });   // 朝: 選んだ飼い主のカードが🦴でめくれる

  // ---- 飼い主の判定（最終盤面から） ----
  /** その人（持ち主ID）が番犬を持っていて、飼い主が決まっているときの飼い主ID。酔いが覚めていない持ち主・飼い主が不明な場合は null */
  function ownerOf(g, id) {
    if (!g || !g.currentRoles || g.currentRoles[id] !== R_() || ONW.hiddenDrunk(g, id)) return null;
    const t = ONW.getRoleBound(g, "watchdogOwners", id);
    if (!t || t === id || !g.players.some((q) => q.id === t)) return null;
    return t;
  }
  /** 最終盤面で番犬を持っている人（酔いが覚めている人）と飼い主の組 [[番犬の持ち主, 飼い主], ...]（飼い主が決まっているものだけ） */
  function pairs(g) {
    return (g.players || []).map((p) => [p.id, ownerOf(g, p.id)]).filter(([, o]) => o);
  }
  /** 追放されなくなる人（番犬の飼い主）の集合 */
  function protectedIds(g) { return [...new Set(pairs(g).map(([, o]) => o))]; }

  /** 飼い主を決める（夜・朝のうち共通）。holderId = 番犬のカードの持ち主 */
  function setOwner(g, holderId, t) { ONW.setRoleBound(g, "watchdogOwners", holderId, t); }

  /** 文言（人間のCO・CPUの発言・情報確認で一致させる。マイクラ版: 「〇〇を飼い主にしました。」） */
  const ownerLine = (name) => `${name} を飼い主にしました。`;
  const coText = (name) => `${name}を飼い主にしていました。`;
  const coShort = (name) => `飼い主: ${name}`;

  /**
   * 番犬に噛まれたシュレディンガーの猫が所属する陣営（vote.resolveCats が見る）。by = 噛んだ人のID（game.dogBites の by）。
   *   ・いまは番犬（村人陣営）だけなので "village"。
   *   ・【確定メモ・今後の実装】模倣番犬（模倣の人狼が番犬の能力を使う）・犬の狂人に噛まれた猫は、人狼陣営（"wolf"）に確定する。
   *     これらの役職は役職の陣営が人狼陣営なので、噛んだ人の役職の陣営を見るこの関数のままで "wolf" になる（そのとき確認すること）。docs/シュレ猫の陣営.md を正本にする。
   */
  function biteTeam(g, by) {
    const role = g && g.currentRoles ? g.currentRoles[by] : null;
    if (!role || role === R_()) return "village";
    const info = ONW.ROLE_INFO[role];
    return info && info.team === ONW.TEAM.WOLF ? "wolf" : "village";
  }
  ONW.watchdog = { ownerOf, pairs, protectedIds, setOwner, ownerLine, coText, coShort, nm, biteTeam };

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    setOwner(g, p.id, t.id);   // 役職についていく（移動「あと」に選んでも現在の持ち主に予約される）
    ONW.newsNote(g, "watchdog");
    if (!cur) { i.mode = "watchdog"; i.target = t.id; }
    i.owner = t.id;   // 発言・投票判断(3of3)が使う
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を飼い主にしていました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  /** 騙りの結果開示: 自分以外の1人を適当に飼い主だと名乗る（本当のCOと同じ形） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)];
    return { co, result: { short: coShort(t.name), text: coText(t.name), claim: { kind: "watchdog", target: t.id } } };
  }
  /** CPUの投票先から除く: 本物の番犬(自認)は飼い主に投票しない(噛み殺してしまう)。ただし飼い主が人狼と分かっているときは噛みに行くので除かない */
  function cpuVoteExclude(k, g, p, q, i, me) {
    if (me !== R_() || !i || i.owner !== q.id) return false;
    return !k.WOLF_LIKE().includes(i.known && i.known[q.id]);
  }

  /** 飼い主のカードの上に、絵文字(🦴 / 噛み付く🐕 / 噛み返す🎃)を1つ出す（すでにあればそれを返す）。別のカードは出さない */
  function dogCard(R, k, face) {
    const card = R.$t().querySelector(`[data-k="${k}"] .tb-card`); if (!card) return null;
    let c = card.querySelector(".dg-card");
    if (!c) { c = document.createElement("div"); c.className = "dg-card"; c.textContent = face || "🦴"; card.appendChild(c); }
    return c;
  }
  ONW.defineRole("watchdog", {
    info: { deck: 66, name: "番犬", team: ONW.TEAM.VILLAGE, wakeOrder: 12, sort: 17.95,
      desc: "村人陣営。夜に自分以外の1人を飼い主に選びます。朝、番犬から見て選んだ飼い主のカードが🦴でめくれます。飼い主は追放されなくなりますが、番犬自身が飼い主に投票すると飼い主を噛み殺します。役職が入れ替わると、飼い主の判定もカードについていきます（上書きされると消えます）。" },
    groups: { "transform:light_apostle": 27 },   // 光の使徒の変化先（村人系）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>飼い主にする相手</strong>のカードを1人分押してください。（自分以外）<br>飼い主は追放されなくなりますが、あなたが飼い主に投票すると噛み殺します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>飼い主にする相手</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    cpuLie: { role: "watchdog", weight: 4, order: 11, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)
    cpuVoteExclude,
    cpuNight: { order: 12, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 12,   // 役職変動系より前（処理順メモ: 役職変動系以外の役職 → 純愛者…）。飼い主は役職の持ち主に記録するので、あとで役職が動いても追従する
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        setOwner(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を飼い主にしていました。`);
        c.hold(p.id, ownerLine(nameOf(t)));
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "watchdog");
        c.rev[p.id] = boneReveal(t);   // 朝、選んだ飼い主のカードが🦴でめくれる
      },
    },
    /** 墓荒らし・ドッペルゲンガーで番犬を手にしたとき（朝のうち）: 朝のうちに飼い主を1人選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        setOwner(g, id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を飼い主にしていました。`);
        return { lines: [ownerLine(c.nameOf(t))], reveal: boneReveal(t), nextChain: null };
      },
    },
    /** CPUの発言: 番犬は村人陣営。本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（飼い主を開示）、残りは騙り（cpuLie と同じ coverLie）。飼い主を知らない（怪盗で奪った等）ときは本当のCOはしない */
    cpuClaim(k, g, p, r, i, c) {
      const t = i.owner && g.players.find((q) => q.id === i.owner && q.id !== p.id);
      if (t && k.selfRole(g, p) === "watchdog" && k.coTruth(g, p)) { c.co = "watchdog"; c.result = { short: coShort(t.name), text: coText(t.name), claim: { kind: "watchdog", target: t.id } }; }
      else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    /** 墓荒らし・ドッペルゲンガーで番犬を手にしたCPUが、続けて言う結果: 朝のうちに選んだ飼い主（飼い主を決めていないときは言わない） */
    cpuChainResult(k, g, p, i) {
      const t = i.owner && g.players.find((q) => q.id === i.owner && q.id !== p.id);
      return t ? { short: coShort(t.name), text: coText(t.name), claim: { kind: "watchdog", target: t.id } } : null;
    },
    // 結果発表の演出（stage.js の startResult / skipResult が引く）
    //   extraCounts : 飼い主への票は無効だが、他の人と同じく普通に「N票」と出す（「無効」とは出さない）
    //   intro       : 番犬に守られる演出（守られていなければ追放されていた＝最多得票の飼い主だけ）。飼い主のカードがめくれそうになる(従者と同じ揺れ)→ 🦴が出てきて守る。字幕は「番犬の飼い主 ○○ は守られました」
    //                 （飼い主に票を入れた番犬は噛殺になるので、守る演出ではなく噛み付く演出 = 通常の連鎖(chain)の flipChain / biteFx）
    //   噛殺        : 通常の連鎖(chain)の演出に乗る（kind "bite" → 字幕「噛殺 番犬 → 飼い主」・札「噛殺」。stage.js の flipChain）
    //   skip / clear: スキップ時は「N票」の札だけ最終形で出す / 🦴・🐕を片付ける
    stageResult: {
      extraCounts: { order: 20, run(R) {
        return (R.res.watchdogs || []).filter((x) => x.votes > 0 && !(R.res.counts || []).some((c) => c.id === x.ownerId)).map((x) => ({ id: x.ownerId, c: x.votes }));
      } },
      intro: { order: 20, run(R) {
        const { res, P, later, setCap, esc, paint, G, alm } = R;
        const seen = new Set();
        const gs = (res.watchdogs || []).filter((x) => x.votes > 0 && x.hang && !x.bite && !seen.has(x.ownerId) && seen.add(x.ownerId));   // 守られていなければ追放されていた(最多得票だった)ときだけ。そうでない飼い主は、ただ「N票」が出るだけ
        gs.forEach((x) => {
          const mk = P(x.ownerId);
          later(() => { setCap(`<div class="res-cap__t t-village">番犬の飼い主</div><div>${esc(x.owner)} が追放されそうになりました…</div>`); R.alm[mk] = true; paint(G()); }, R.t);
          later(() => {
            delete R.alm[mk];
            const c = dogCard(R, mk); if (c) c.classList.add("guard");   // 🦴が出てきて守る
            setCap(`<div class="res-cap__t t-village">番犬の飼い主</div><div>${esc(x.owner)} は番犬に守られました</div>`);
            paint(G());
          }, R.t + 1900);
          later(() => { const c = dogCard(R, mk); if (c) c.classList.add("out"); }, R.t + 3300);                        // 守り終わったら🦴は消える（ふわっと消す）
          later(() => { const c = R.$t().querySelector(`[data-k="${mk}"] .dg-card`); if (c) c.remove(); paint(G()); }, R.t + 3700);   // 消えたら片付ける
          R.t += 4000;
        });
        if (gs.length && !R.exec.length) R.t -= 500;   // 通常の追放がなければ、すぐ次へ
      } },
      // 噛み付く演出(stage.js の flipChain が kind "bite" のときに呼ぶ。R.t がその開始時刻。返り値 = 足す待ち時間):
      //   票は普通に「N票」と出たあと、飼い主のカードが震える → 🐕が飛び込んで噛み付く(💥) → そのあと通常の「噛殺」(字幕・カードがめくれる)
      //   ネコカボチャに噛み返されたときは、噛み返した側のカードに🎃が飛び込む
      biteFx: { order: 20, run(R, h) {
        const { later, P, G, paint } = R;
        const w = (R.res.watchdogs || []).find((x) => (x.bite && x.ownerId === h.id) || (x.back && x.byId === h.id));
        if (!w) return 0;
        const k = P(h.id), face = w.back && w.byId === h.id ? "🎃" : "🐕", t0 = R.t;
        const seat = () => R.$t().querySelector(`[data-k="${k}"]`);
        later(() => { const s = seat(); if (s) s.classList.add("gl-shake"); }, t0 + 200);          // 震える
        later(() => { const c = dogCard(R, k, face); if (c) c.classList.add("bite"); }, t0 + 1300);                                  // 噛み付く
        later(() => { const s = seat(); if (s) s.classList.remove("gl-shake"); const c = dogCard(R, k, face); if (c) c.remove(); paint(G()); }, t0 + 2100);       // 片付ける（このあと噛殺でめくれる）
        return 2300;
      } },
      skip(R) {   // スキップ: 飼い主への票の札を最終形で出す（噛殺で死んだ人の札は、そのまま「噛殺」）
        (R.res.watchdogs || []).filter((x) => x.votes > 0).forEach((x) => { if (!R.badge[`p:${x.ownerId}`]) R.badge[`p:${x.ownerId}`] = `${x.votes}票`; });
      },
      clear(SK) { const el = SK.$t(); if (el) el.querySelectorAll(".dg-card").forEach((n) => n.remove()); },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 飼い主にした相手を選ぶ
    coResult: {
      kind: "watchdog", targetLabel: "飼い主にした相手",
      pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "watchdog", target: id }, null, "disclose", coShort(K.nameOf(id))],
    },
  });
})(window.ONW);
