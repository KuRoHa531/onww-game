/**
 * 反転者（マイクラ版 REVERSER を参考）: 第三陣営。
 * 夜に自分以外のプレイヤー1人を選び、その人に「反転」を付与する（重複役職 (+反転)）。
 *   ・反転は選ばれた「人」についている。反転が奇数回ついていれば「元の役職として敗北」、偶数回なら「元の役職として勝利」すれば、
 *     反転をつけた反転者と反転をつけられた人が追加勝利する（判定は 3of4。docs/reverser.md / docs/victory-priority.md / docs/overlay-role-priority.md）。
 *   ・「誰が誰に付けたか」は g.reverserTarget[持ち主ID] = 反転をつけた相手のID（ONW.ROLE_BOUND_KEYS。役職のカードについていく）。
 *     怪盗・いたずらっ子・墓荒らし・グレムリンなどで反転者のカードが動いたら、反転をつけた人の判定は動いた先の持ち主に移る（選ばれた相手は動かない）。
 *     最終盤面で役職「反転者」を持っている人の記録だけが有効（ONW.reverser.pairs）。上書き（ドッペル・グレムリンのコピー・シャッフラー・抹消）された席の記録は消える。
 *   ・反転がついたことは、反転された本人に待機時間（朝のあと）に知らされる。2of4 の演出: 待機時間に入ると、反転された人の自分のカードが「裏面のまま180度回転」する
 *     （他の待機時間の演出があるときは、それが終わって裏面に戻ったあと）。結果発表でめくれるときも、反転された人のカードは180度回転した状態で公開される。
 *   ・酔っ払い・墓荒らし・ドッペルゲンガー経由: 墓荒らし・ドッペルは朝のうちに選べる（morning.run）、酔っ払いは酔いが覚めてから選べる（昼。反転された人には昼のうちに通知 = revday）。
 *     反転された人が酔っ払いのときは、酔いが覚めた瞬間に知らされる（soberExtra）。
 *   ・処理順（docs/role-process-order.md）: 全役職の一番最後。Web版の夜の段階は tm（いたずらっ子・抹消の人狼のあと）の night.order 200。
 *   ・情報確認: 本人の結果（「〇〇 を反転させました。」）と、反転された人の通知が情報確認に残る。
 * 実装の進み具合は _wip/依頼文_反転者_*.txt を参照。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.REVERSER;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const isP = (g, id) => g.players.some((q) => q.id === id);

  /** カード持ち主の鍵（墓地なら "g:番号"）。夜に配られた役職(人間 id が最初に持っていたカード)を、いま持っている人 */
  function holderOfCard(g, cardId) {
    if (!g.cards) return String(cardId).slice(2);
    const k = Object.keys(g.cards.at).find((x) => g.cards.at[x] === cardId);
    return k || String(cardId).slice(2);
  }
  const holderOf = (g, id) => holderOfCard(g, "P:" + id);

  /** 有効な反転の組 [反転者の持ち主, 反転された人] を全部返す（最終盤面で役職「反転者」を持っている人の記録だけ。重ねて同じ人に付けたら同じ対象の組が複数並ぶ）。
   *  抹消の人狼・ドッペル・グレムリン・シャッフラーで上書きされて反転者でなくなった席の記録は無効（役職が変わっている）。 */
  function pairs(g) {
    const out = [], m = g.reverserTarget || {};
    Object.keys(m).forEach((h) => {
      if (String(h).startsWith("g:") || !isP(g, h)) return;
      if (g.currentRoles[h] !== R_()) return;
      const t = m[h];
      if (!t || !isP(g, t)) return;
      out.push([h, t]);
    });
    return out;
  }
  /** 反転された人 → 反転をつけた人たち { 対象ID: [持ち主ID, ...] } */
  function stacks(g) {
    const st = {};
    pairs(g).forEach(([h, t]) => { (st[t] = st[t] || []).push(h); });
    return st;
  }
  /** id に反転が何回ついているか */
  const count = (g, id) => (stacks(g)[id] || []).length;
  /** 反転が奇数回ついている（元の役職として敗北すれば勝ち）か */
  const odd = (g, id) => count(g, id) % 2 === 1;
  /** 反転者どうしがお互いを反転させている組（どちらも最終役職が反転者）。返り値: 対象 id → 互いに反転させている反転者の持ち主たち */
  function mutual(g) {
    const st = stacks(g), out = {};
    Object.keys(st).forEach((p) => {
      const ms = st[p].filter((h) => g.currentRoles[p] === R_() && g.currentRoles[h] === R_() && (st[h] || []).includes(p));
      if (ms.length) out[p] = ms;
    });
    return out;
  }

  const condText = (n) => (n % 2 === 1 ? "元の役職として敗北すれば" : "元の役職として勝利すれば");
  /** 反転された人への通知文（マイクラ版 notifyReversalStackTarget と同じ文言） */
  function noticeLines(g, id) {
    const n = count(g, id);
    return n > 0 ? [`あなたは反転者に選ばれたため、勝利条件が反転しました。${condText(n)}、反転者と共に勝利することができます。${n >= 2 ? `（反転は${n}回ついています）` : ""}`] : [];
  }

  /** 反転を付与する（人間の夜・朝のうち・酔い覚めの昼・CPU 共通）。持ち主 holder のカードに「target に付けた」と記録する（カードが動いたらついていく） */
  function assign(g, holder, target) {
    ONW.setRoleBound(g, "reverserTarget", holder, target);
    const h = (g.reverserHist = g.reverserHist || {});   // 結果画面の役職の流れ用: 反転がついた時点の roleTrail の長さ（g.reverserHist[相手ID] = [n, n, ...]）
    (h[target] = h[target] || []).push((((g.roleTrail || {})[target]) || []).length);
    return count(g, target);
  }

  /** 結果画面の役職の流れ: 反転は「人」についているので、ついた後の段階すべてに「(+反転1)」「(+反転2)」…を付ける（恋人・シャッフラーの印のあとに並べる）。
   *  反転がついた瞬間は、役職が同じでも1段階として足す（銀色の影 → 弁護士 → 弁護士(+反転1) → オポチュニスト(+反転1)）。
   *  ついた時期は g.reverserHist（assign が積む）。分からない分（カードの移動などで増えた分）は全段階につける。各段階の sg.stage = そのときの roleTrail の長さ（net.js が付ける。変化前の役職は -1） */
  function tagSegs(segs, g, id) {
    const n = count(g, id);
    segs.forEach((sg) => { if (sg.stage == null) sg.stage = Infinity; });
    if (!n) { segs.forEach((sg) => { delete sg.stage; }); return segs; }
    const ns = (((g.reverserHist || {})[id]) || []).slice(-n);
    while (ns.length < n) ns.unshift(-2);   // 時期が分からない分は、変化前の段階も含めて全段階
    ns.sort((a, b) => a - b);
    const mk = (c) => Array.from({ length: c }, (_, i) => ({ t: `(+反転${i + 1})`, k: "reverse" }));
    const before = (s) => ns.filter((x) => x < s).length;   // 段階 s の手前でついていた数
    const out = [];
    segs.forEach((sg, j) => {
      out.push({ ...sg, tags: [...(sg.tags || []), ...mk(before(sg.stage))] });
      const last = j === segs.length - 1 || segs[j + 1].stage !== sg.stage;   // この段階の最後の段（恋人の印の段が続くときは、その後ろに足す）
      if (!last) return;
      const here = ns.filter((x) => x === sg.stage).length;
      for (let k = 1; k <= here; k++) out.push({ ...sg, tags: [...(sg.tags || []), ...mk(before(sg.stage) + k)] });
    });
    // 最後の段階は最終の反転の数（ついた時期がこの段階より後ろにあって取りこぼした分も合わせる）
    const lastSg = out[out.length - 1];
    lastSg.tags = [...(lastSg.tags || []).filter((t) => t.k !== "reverse"), ...mk(n)];
    out.forEach((sg) => { delete sg.stage; });
    segs.splice(0, segs.length, ...out);
    return segs;
  }

  /** 勝敗（3of4 で中身を入れる）: 基本の勝者 w（Set。追加勝利を足したあと）に反転を適用する。docs/reverser.md */
  function apply(g, w, teams) {
    const st = stacks(g), mu = mutual(g), base = new Set(w), add = new Set(), del = new Set(), done = [];
    Object.keys(st).forEach((p) => {
      if (mu[p]) { del.add(p); mu[p].forEach((h) => del.add(h)); return; }   // 反転者どうしがお互いを反転させている: どちらも敗北
      const baseWon = base.has(p), ok = st[p].length % 2 === 1 ? !baseWon : baseWon;
      if (ok) { add.add(p); st[p].forEach((h) => add.add(h)); done.push(p); } else del.add(p);
    });
    add.forEach((id) => { if (!mu[id]) w.add(id); });
    del.forEach((id) => w.delete(id));
    if (done.length && teams && !teams.includes("反転者")) teams.push("反転者");
    g.reversalWinIds = [...add].filter((id) => w.has(id));
    g.reversalAddIds = g.reversalWinIds.filter((id) => !base.has(id));   // 反転のおかげで新しく勝った人（反転者・反転された人）。結果発表の「追加勝利」には出さない（反転者陣営として勝たせてもらったので。vote.js が winBaseIds に足す）
    return g.reversalWinIds;
  }

  ONW.reverser = { holderOf, holderOfCard, pairs, stacks, count, odd, mutual, noticeLines, assign, tagSegs, apply, condText };

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選んで反転を付与（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    assign(g, holderOf(g, p.id), t.id);
    if (!cur) { i.mode = "reverser"; i.target = t.id; }
    i.reverse = { target: t.id };   // 発言(cpuClaim)が使う。朝に墓荒らし・ドッペルで手にした連鎖(cur)でも、本人の怪盗などの記録(mode / target)は上書きしない
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を反転させました。`);
    n.hold(p.id, `${t.name} を反転させました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }
  /** CPUの反転者の発言: 第三陣営の役職は名乗らない（必ず他の村役職を騙る）。シャッフラーと同じ扱い */
  function cpuClaim(k, g, p, r, i, c) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }

  ONW.defineRole("reverser", {
    info: { observe: "player", sealTarget: true, deck: 96, name: "反転者", team: ONW.TEAM.THIRD, wakeOrder: 70, sort: 35.99,
      desc: "第三陣営。夜に自分以外のプレイヤーを1人選び、反転を付与します。反転がついたことは、その人にも待機時間に知らされます（その人のカードは裏面のまま180度回転します）。反転が奇数回ついている場合は元の役職として敗北すれば、偶数回ついている場合は元の役職として勝利すれば、その反転者と反転をつけられたプレイヤーが追加勝利します。反転者どうしがお互いを反転させている場合は、どちらも敗北します。" },
    groups: { "transform:silver_shadow": 19 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>反転を付与する相手</strong>のカードを1人分押してください。（自分以外）<br>相手には、朝のあとの待機時間に<strong>反転されたこと</strong>が知らされ、相手のカードが裏面のまま180度回転します。相手が元の役職として敗北（反転が偶数回なら勝利）すれば、あなたと相手が追加勝利します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>反転を付与する相手</strong>のカードを押して",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分以外）
    cpuNight: { order: 200, stage: "tm", chain: true, run: cpuRun },
    cpuClaim,
    /** 反転者のCPU: 自分が反転をつけた相手の陣営が分かっているときの投票。奇数回なら相手の陣営が負ければ勝ち、偶数回なら勝てば勝ち（回数は他の反転者の分も含めて数える）。
     *  相手が村人なら「村人側が負ける = 村人側を吊る/人狼を避ける」、人狼なら逆。分からないときは何もしない（相手本人には票を入れない） */
    cpuVoteExclude: (k, g, p, q, i) => !!(i.reverse && i.reverse.target === q.id),
    cpuVoteScore: (k, g, p, q, i) => {
      const t = i.reverse && i.reverse.target; if (!t) return 0;
      const tr = i.known[t], tv = tr && ONW.roles.getInfo(tr).team === "village", tw = tr && (k.isWolfSide(tr));
      if (!tv && !tw) return 0;
      const wantTeamWin = ONW.reverser.count(g, t) % 2 === 0, villageShouldWin = tv ? wantTeamWin : !wantTeamWin;
      const qr = i.known[q.id];
      if (villageShouldWin) return qr && k.isWolfSide(qr) ? 6 : 0;   // 村人側を勝たせたい: 分かっている人狼に入れる
      return qr && ONW.roles.getInfo(qr).team === "village" ? 4 : 0;  // 村人側を負けさせたい: 分かっている村人側に入れる
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 反転させた相手を選ぶ / 情報開示「反転されている」
    coResult: {
      kind: "reverser", targetLabel: "反転させた相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を反転させました。`, { kind: "reverser", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
      infoReversed: () => ["反転されています。", { kind: "reversed" }, null, "disclose", "反転されている"],
    },
    night: {
      kind: "tm", order: 200,   // 全役職の一番最後（docs/role-process-order.md: … → 背徳者 → 反転者）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        const holder = holderOf(g, p.id);   // 夜の能力は「夜に配られた役職の持ち主」が使う。カードが怪盗などで動いていても、記録はいまそのカードを持っている人に書く
        assign(g, holder, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を反転させました。`);
        c.hold(p.id, `${nameOf(t)} を反転させました。`);
        ONW.observeNote(g, p.id, [t], null, "reverser");
        ONW.newsNote(g, "reverser");
      },
    },
    /** 墓荒らし・ドッペルゲンガーで反転者を手にしたとき（朝のうち）、酔いが覚めたとき（昼）: 自分以外の1人を選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        assign(g, id, t);   // 朝に選んだ反転も、その時点の持ち主に予約され、以降の移動にもついていく
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を反転させました。`);
        return { lines: [`${c.nameOf(t)} を反転させました。`], reveal: null, nextChain: null };
      },
      dayNotify(c) {   // 昼（酔い覚めの反転者）に反転を付与: 反転された人にその場で知らせる（カードが裏面のまま180度回転）。酔っ払い中の人には、酔いが覚めたときに知らせる（soberExtra）
        if (!c.players.length) return;
        const g = c.g, t = c.players[0], tp = c.byId(t);
        if (!tp || tp.isCpu || ONW.hiddenDrunk(g, t)) return;
        const text = noticeLines(g, t)[0]; if (!text) return;
        c.hold(t, text);
        c.send(t, { t: "revday", text, rev: count(g, t) });
      },
    },
    /** 待機時間（朝のあと）: 反転された人へ通知（情報確認に残る）と、カードを回す回数 rev。酔っ払い（未覚醒）の人には届けない（酔いが覚めたときに知らされる） */
    settleMsg: { order: 33, run(c, p) {
      const g = c.g;
      if (ONW.hiddenDrunk(g, p.id)) return {};
      const n = count(g, p.id);
      return n > 0 ? { logs: noticeLines(g, p.id), rev: n } : {};
    } },
    /** 酔いが覚めた人が反転されていたら、その瞬間に知らせる（情報確認に残る。カードも回る: peek.rev） */
    soberExtra: { order: 60, run(c, id) {
      const n = count(c.g, id);
      return n > 0 ? { lines: noticeLines(c.g, id), peek: { rev: n } } : {};
    } },
    // ---- 反転された人の目線（2of4）: 待機時間に入ったら、自分のカードが裏面のまま180度回転 ----
    // 他の待機時間の演出（スター・女王・フリーター・訪問者・後覚者など）があるときは、それが終わって裏面に戻ったあと（昼に入ってから）に回る。
    // 回転は昼の議論中も続き、結果発表でめくれるときも回ったまま公開される（stage.js の paint が g.revShown / g.revRes を見て .rev を付ける）。
    stageSettle: {
      field: "settleRevs", shown: "settleRevShown",
      run: { order: 95, run(list, SK) {
        const g = SK.G(), n = list[0] || 0;
        if (!n) return;
        const others = ONW.roleHooksIn("stageSettle", "run").some((h) => h.def.stageSettle.field !== "settleRevs" && g[h.def.stageSettle.field] && g[h.def.stageSettle.field].length) || !!g.settleInsom;
        if (others) { g.revPending = n; return; }   // ほかの演出が終わって裏面に戻ったあと（昼の始まり）に回す
        SK.later(() => { g.revShown = n; SK.paint(SK.G()); }, 700);
      } },
      end(SK) {   // 昼に入った: 待たせていた回転を、ほかの演出のカードが裏面に戻る（めくり戻し）のを待ってから始める
        const g = SK.G();
        if (!g.revPending) return;
        const n = g.revPending; g.revPending = 0;
        SK.later(() => { g.revShown = n; SK.paint(SK.G()); }, 1100);
      },
    },
  });
})(window.ONW);
