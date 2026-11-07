/**
 * コスプレイヤー（マイクラ版 COSPLAYER を参考）: 村人陣営。
 * 夜になると山札から3枚をめくり（本人にだけ見える）、1枚選ぶ。朝になるまで何度でも選び直せる（同じカードをもう一度押すと解除）。選んでいなければコスプレしない。
 *   ・朝（夜が明けるとき）: 選ばなかった2枚は裏面に戻して山札の一番下へ、選んだカードを自分のカードの上に置く（＝自分の役職が選んだ役職に変わる）。
 *   ・鍵師にロックされている席・封印されている人は失敗（選んだカードは置かれない）。
 *   ・コスプレした役職に夜の能力があれば、墓荒らし・ドッペルと同じく朝のうちに使える（コスプレイヤー→墓荒らし→占い師 のような連鎖も可）。
 *   ・墓荒らし/ドッペルでコスプレイヤーを手にしたとき・酔いが覚めて最終役職がコスプレイヤーのとき: めくれた時点で自動で山札から3枚めくる（朝の連鎖 / 昼能力。選んで「確定」）。
 *   ・ドッペルがコスプレイヤーをコピーするのは、コスプレが失敗した/選び忘れたときだけ（コスプレのほうが先に動くため）。それでも連鎖できる。
 *   ・処理順（docs/role-process-order.md）: 鍵師 → … → コスプレイヤー → 墓荒らし → ドッペル。Web版の夜の段階は relic の先頭（night.order 5。墓荒らしは 10）。
 * 山札 = ONW.cosplayer.ELIGIBLE（マイクラ版 cosplayerEligibleRoles）のうち、Web版にある役職。重複しない3枚。偽占い師は占い師として見える（ONW.shownRole）。
 * 状態: g.cosplayDraw[席ID] = { roles:[3枚(本当の役職)], at:"night"|"morning"|"day", used:bool }。夜の選択は g.nightSels[席ID].pick（0〜2 / null）。
 * 詳細は docs/cosplayer.md。
 */
(function (ONW) {
  const SELF = "cosplayer";
  /** マイクラ版 cosplayerEligibleRoles（wiki.js の COSPLAY_CANDIDATE_KEYS）。Web版に無い役職は pool() で自動で外れる */
  const ELIGIBLE = ["seer", "apprentice_seer", "lookout", "bell_miko", "whimsical_seer", "robber", "relic_robber", "troublemaker", "insomniac", "baker", "donut_shop", "agitator", "star", "newspaper", "mayor", "visitor", "queen", "tough_guy", "dictator", "exchanger", "penguin", "watchdog", "sheriff", "thief", "sense_seer", "princess", "major", "finger_reader", "gambler", "fairy", "libra", "fake_seer", "poet", "aa", "goranshin", "steve", "icarus", "election_manager", "moses", "yomi", "carmen", "knight", "trailblazer", "hokma", "psychologist", "medium", "hayatochiri", "necromancer", "counselor", "ren", "trap_master"];
  const rn = (r) => ONW.roles.getInfo(r).name;
  const pool = () => ELIGIBLE.filter((r) => r !== SELF && (ONW.ROLE_INFO || {})[r]);
  const store = (g) => (g.cosplayDraw = g.cosplayDraw || {});
  /** 山札から3枚めくる（重複なし）。未使用の引きが残っていればそれを返す（再入室・再送でも同じ3枚） */
  function ensureDraw(g, id, at) {
    const cur = store(g)[id];
    if (cur && !cur.used) return cur;
    const roles = ONW.utils.shuffle(pool()).slice(0, 3);
    return (store(g)[id] = { roles, at: at || "night", used: false });
  }
  const shownOf = (d) => (d ? d.roles.map((r) => ONW.shownRole(r)) : []);
  const validPick = (d, pick) => !!d && !d.used && Number.isInteger(pick) && pick >= 0 && pick < d.roles.length;
  const namesOf = (d) => shownOf(d).map(rn).join("・");
  /** 実行（夜・朝の連鎖・昼能力で共通）: d の pick 番目をカードの上に置く。戻り値 { role, shown } */
  function place(g, id, d, pick) {
    const role = d.roles[pick];
    d.used = true;
    ONW.cosplayPlace(g, id, role);
    return { role, shown: ONW.shownRole(role) };
  }
  ONW.cosplayer = { ELIGIBLE, pool, ensureDraw, shownOf, validPick, namesOf, place, draw: (g, id) => store(g)[id] || null };

  const cardsMsg = (c, p) => { const d = ensureDraw(c.g, p.id, "night"); return { cosplay: { cards: shownOf(d) } }; };

  // ---- CPU（4of4-a）----
  /** CPUが3枚から選ぶ。夜に能力がある役職（朝のうちに続けて使える）を好み、約8%は選ばない（コスプレしない）。デバッグ指定: n.forced(p).cosRole（役職ID=その役職にコスプレ / "none"=選ばない）、pick（0〜2 / -1=選ばない） */
  function cpuChoose(n, p, d) {
    const f = n.forced(p) || {}, fp = f.pick;
    if (f.cosRole === "none") return null;   // デバッグ: コスプレしない
    if (f.cosRole && pool().includes(f.cosRole)) {   // デバッグ: この役職にコスプレする（3枚に入っていなければ、1枚をこの役職に差し替えて選ぶ）
      let ix = d.roles.indexOf(f.cosRole);
      if (ix < 0) { ix = Math.floor(Math.random() * d.roles.length); d.roles[ix] = f.cosRole; }
      return ix;
    }
    if (fp === -1) return null;
    if (Number.isInteger(fp) && fp >= 0 && fp < d.roles.length) return fp;
    if (Math.random() < 0.08) return null;
    const chain = ONW.cpu ? ONW.cpu.chainRoles(SELF) : [];
    const w = d.roles.map((r) => (chain.includes(r) ? 3 : 1));
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < w.length; k++) { x -= w[k]; if (x <= 0) return k; }
    return w.length - 1;
  }
  /** CPUの夜の行動（夜のコスプレ・朝の連鎖・酔い覚めで共通）。人間の night.resolve / morning.run と同じ順で、鍵師 → 選ぶ → 置く → 連鎖。
   *  記憶は i.cosplay = { cards:[見える3枚], pick, role(見える役職), failed(鍵師のロック), skipped(選ばない) }。ロックで失敗した夜の直接のコスプレだけ i.keyFail も立てる（他の役職の騙り・投票判断と同じ見え方） */
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, i = n.infoOf(p.id), nm = `${label} ${p.name}`;
    const at = n.stage === "late" ? "day" : cur ? "morning" : "night";
    const d = ensureDraw(g, p.id, at), cards = shownOf(d);
    i.mode = "cosplay"; i.cosplay = { cards, pick: null, role: null, failed: false, skipped: false };
    const pick = cpuChoose(n, p, d);
    if (pick === null) {   // 選ばない: コスプレしない（3枚とも山札の一番下に戻る）
      d.used = true; i.cosplay.skipped = true;
      g.nightLogsAll.push(`${nm} は 山札から3枚めくりましたが、コスプレしませんでした。`);
      return;
    }
    if (ONW.keymaster.gate(g, p.id, [])) {   // 鍵師のロック: 自分の席がロック中なら失敗（3枚とも山札へ。役職はそのまま）
      d.used = true; i.cosplay.failed = true; if (!cur) i.keyFail = { kind: "self" };
      n.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "コスプレ", [], nm));
      return;
    }
    const r = place(g, p.id, d, pick);
    i.cosplay.pick = pick; i.cosplay.role = r.shown; i.known[p.id] = r.shown;
    g.nightLogsAll.push(`${nm} は 山札から ${namesOf(d)} をめくり、${n.rn(r.role)} にコスプレしました。`);
    n.hold(p.id, `山札から3枚めくり、「${n.rn(r.shown)}」にコスプレしました。あなたの新しい役職は「${n.rn(r.shown)}」です。`);
    ONW.cpu.learnInfo(g, p.id, r.role);   // コスプレ先の「夜の始まりに見える情報」（共有者の相方・人狼の仲間など）も知る
    const ga = ONW.mimic.gotAct(g, p.id, r.role);   // 模倣の人狼になったら模倣先の能力
    i.pendingChain = ONW.cpu.chainRoles(SELF).includes(ga) ? ga : null;   // コスプレ先に夜の行動があれば、朝のうちに続けて使う（コスプレイヤー→墓荒らし→占い師）
    if (!cur) n.nn(SELF);
  }
  const cpuFail = { short: "ロックで失敗", text: "自身の役職がロックされていたためコスプレに失敗しました。", claim: null };
  const cpuNone = { short: "コスプレなし", text: "コスプレしませんでした。", claim: null };
  /** コスプレの結果の発言（本当）: 「山札から3枚めくり、〇〇にコスプレしました。」 */
  const cosResult = (k, role) => ({ short: `コスプレ → ${k.rn(role)}`, text: `山札から3枚めくり、${k.rn(role)} にコスプレしました。`, claim: { kind: "cosplay", role } });
  /** 本物のコスプレイヤーの発言: コスプレした役職（鍵師で失敗 / 選ばなかったも正直に）。コスプレ先の結果は cpu.js の plan が chainedResult で続けて言う */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = SELF;
    const x = i.cosplay;
    if (!x) return;   // 夜の情報なし: COだけする
    if (x.failed) c.result = cpuFail;
    else if (x.skipped) c.result = cpuNone;
    else if (x.role) c.result = cosResult(k, x.role);
  }
  /** コスプレイヤーを騙る（人狼側など）: 山札から3枚めくって「村人側の役職にコスプレした」と言う。実在する村人役を優先し、なければ山札の役職から。結果のあとの続きは cpu.js の chainedResult が偽の結果にする */
  function cpuLieClaim(k, g, p, others, selfRole, co) {
    const pl = pool(), role0 = k.fakeVillageRole(g, (r) => pl.includes(r));
    const role = pl.includes(role0) ? role0 : k.pick(pl);
    return { co: SELF, result: cosResult(k, role) };
  }
  /** コスプレして手にした役職 role の「続けて言う結果」（占い師なら占い結果）。墓荒らしにコスプレしたときは、墓地と交換した結果（墓荒らし自身は cpuChainResult を持たないのでここで補う） */
  function afterResult(k, g, p, i, role) {
    if (role === "relic_robber") { const x = i.relic; return x && x.newRole ? { short: `墓地${x.graveIdx + 1} → ${k.rn(x.newRole)}`, text: `墓地${x.graveIdx + 1} と役職を交換して ${k.rn(x.newRole)} になりました。`, claim: { kind: "relic", role: x.newRole } } : null; }
    const h = ONW.roleHook(role, "cpuChainResult");
    return h ? (h(k, g, p, i) || null) : null;
  }
  ONW.cosplayer.afterResult = afterResult;
  /** 墓荒らし・ドッペル・酔い覚めでコスプレイヤーを手にしたCPUが、続けて言う結果（コスプレした役職 → さらにその役職の結果） */
  function cpuChainResult(k, g, p, i) {
    const x = i.cosplay;
    if (!x) return null;
    if (x.failed) return { ...cpuFail };
    if (x.skipped) return { ...cpuNone };
    if (!x.role) return null;
    const res = cosResult(k, x.role);
    const nx = afterResult(k, g, p, i, x.role);   // コスプレ先の結果（占い師なら占い結果）
    if (nx) res.next = nx;
    return res;
  }
  ONW.cosplayer.cpuClaim = cpuClaim; ONW.cosplayer.cpuRun = cpuRun;

  ONW.defineRole(SELF, {
    info: { sealTarget: true, deck: 99, name: "コスプレイヤー", team: ONW.TEAM.VILLAGE, wakeOrder: 47, sort: 23.4,
      desc: "村人陣営。夜になると山札から3枚のカードがめくれ、1枚選んでその役職になります（朝になるまで何度でも選び直せ、同じカードをもう一度押すと解除。選ばなければコスプレしません）。選ばなかった2枚は山札の一番下に戻ります。コスプレした役職に夜の能力があれば、朝のうちに使えます。鍵師にロックされている・封印されているときは失敗します。村人・スパイ・狼憑き・狐憑き・狼夢人・鍵師・マーリン・共有者などは山札に入っていません。偽占い師は占い師として見えます。" },
    groups: { "transform:light_apostle": 37 },
    uiNight: {
      action(X) {
        const { later } = X, g = ONW.game, n = (g.nightSel && Number.isInteger(g.nightSel.pick)) ? g.nightSel.pick : null;
        const cards = g.cosplayCards || [];
        const now = n === null ? "まだ選んでいません（選ばなければコスプレしません）" : `${esc2(rn(cards[n]))}`;
        return `<p class="night-step__hint">上のテーブルに、<strong>山札から3枚</strong>めくれています。コスプレしたい役職のカードを1枚押してください。${later}<br>朝になると、選ばなかった2枚は山札の一番下に戻り、選んだカードがあなたのカードの上に置かれます。</p><p class="night-step__hint">選択中: <strong>${now}</strong></p>`;
      },
      chainReady: (np, ng, sel) => !!sel && Number.isInteger(sel.pick),
      chainHow: () => "<strong>コスプレしたい役職のカード</strong>（山札から3枚めくれています）を1枚押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): コスプレした役職を選ぶ（山札の役職から。配役にいない役職もめくれるので配役の一覧ではない）/ コスプレしなかった / ロックで失敗 / 伏せる。コスプレ先に結果開示があれば続けて言う
    coResult: {
      kind: "cosplay",
      roleList: () => ONW.sortByRoleOrder(pool()),
      noneText: "コスプレしませんでした。",
      cosRole(role, K) {
        if (role === "hide") return ["山札から3枚めくり、コスプレしました。役職は伏せます。", null, null, "disclose", "コスプレ → 伏せ"];
        return [`山札から3枚めくり、${K.rn(role)} にコスプレしました。`, { kind: "cosplay", role }, null, "disclose", `コスプレ → ${K.rn(role)}`];
      },
    },
    stagePick: { players: false, cosplay: true },   // カードを押して行動する: 山札から出た3枚だけ（プレイヤー・墓地は選べない）
    nightStart: { order: 40, run(c) {   // 夜の始まり: コスプレイヤーの人（模倣先を含む・酔っ払いは除く）は山札から3枚めくる
      const g = c.g;
      g.players.forEach((p) => { if (!ONW.hiddenDrunk(g, p.id) && !(g.drunkOverlay && g.drunkOverlay[p.id]) && ONW.mimic.actRole(g, p.id, g.initialRoles[p.id]) === SELF) ensureDraw(g, p.id, "night"); });
    } },
    // 朝の演出（stage.js の playMorning / morningDur が reveal.kind === "cosplay" のときに呼ぶ。コスプレした本人の画面）
    // 山札から出ていた3枚がそのまま見える → 選ばなかった2枚が裏返って山札の一番下へ戻る → 選んだカードが自分の席へ飛んで置かれ、自分のカードが新しい役職で表になる。
    // 選んでいなかった・鍵師/封印で失敗したとき(pick が null)は、3枚とも裏返って山札へ戻るだけ。墓荒らし・ドッペル・酔い覚め経由（朝の連鎖・昼能力）も同じ演出。
    stageMorning: {
      kind: "cosplay", dur: () => 2900,
      play(r, SK) {
        const { later } = SK, C = SK.cosplay, el = SK.$t(), mine = `p:${ONW.net.myId()}`;
        C.keep(true); C.ensure(r.cards, true); SK.paint(SK.G());
        const pile = el.querySelector(".tb-pile .tb-card");
        const fly = (i, to, ms, shrink) => {   // i 枚目のカードを to（要素）の位置へ飛ばす
          const card = el.querySelector(`[data-k="c:${i}"] .tb-card`);
          if (!card || !to || !card.animate) return;
          const a = card.getBoundingClientRect(), b = to.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
          card.style.zIndex = 60;
          card.animate([{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx / 2}px,${dy / 2 - 26}px) scale(1.15)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(${shrink ? 0.85 : 1})`, opacity: shrink ? 0.2 : 1 }], { duration: ms, easing: "ease-in-out", fill: "forwards" });
        };
        const g0 = SK.G();
        r.cards.forEach((_, i) => {
          if (i === r.pick) return;
          later(() => { delete SK.up[`c:${i}`]; SK.paint(SK.G()); }, 400);        // ① 選ばなかったカードが裏返る
          later(() => fly(i, pile, 800, true), 1200);                              // ② 山札の一番下へ戻る
        });
        if (Number.isInteger(r.pick)) {
          const dst = el.querySelector(`[data-k="${mine}"] .tb-card`);
          later(() => fly(r.pick, dst, 900, false), 1200);                         // ③ 選んだカードが自分の席へ飛ぶ
          later(() => { SK.show(mine, r.role); }, 1200 + 900);                     // ④ 置かれて、自分のカードが新しい役職で表になる
        }
        later(() => { C.keep(false); C.clear(); g0.cosAnim = "done"; SK.paint(SK.G()); }, 2500);
      },
    },
    stageEnd(c, kind) {   // コスプレの段階(relic)が終わったら、夜に引いた3枚は使い終わり（選び忘れ・封印で残った引きも閉じる。連鎖では引き直す）
      if (kind !== "relic") return;
      Object.values(c.g.cosplayDraw || {}).forEach((d) => { if (d.at === "night") d.used = true; });
    },
    nightMsg: cardsMsg,
    nightMsgAct: cardsMsg,   // 模倣の人狼が模倣先として使うとき
    // CPU（4of4-a）: 夜の行動 / 発言(CO・結果) / 騙り / 墓荒らし・ドッペル・酔い覚めで手にしたときの続きの結果
    cpuNight: { order: 5, stage: "relic", chain: true, chainEnd: true, run: cpuRun },   // 鍵師(seer段階 23)のあと・墓荒らし(50)の前。chain/chainEnd: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使え、次の連鎖は自分で立てる
    cpuClaim,
    cpuLie: { role: SELF, weight: 4, order: 19, claim: cpuLieClaim },
    cpuChainResult,
    /** 朝の連鎖・酔い覚めの昼能力が始まるとき（墓荒らし/ドッペル経由・酔い覚め）、自動で山札から3枚めくる。本人に送る3枚（見える役職） */
    chainDraw(c, id) { return shownOf(ensureDraw(c.g, id, c.g.phase === c.PH.ONLINE_DAY ? "day" : "morning")); },
    night: {
      kind: "relic", order: 5,   // 鍵師(23)のあと・墓荒らし(10)の前
      complete: (np, ng, sel) => !!sel && Number.isInteger(sel.pick),
      normalize: (c, players, graves, sel, id) => {
        const d = (c.g.cosplayDraw || {})[id], pick = sel && sel.pick;
        return { players: [], graves: [], pick: validPick(d, pick) ? pick : null };
      },
      resolve(c, p) {
        const g = c.g, rn2 = c.rn, d = (g.cosplayDraw || {})[p.id];
        if (!d || d.used) return;
        const pick = (c.selOf(p) || {}).pick, cards = shownOf(d), label = `${rn2(c.eff(p))} ${p.name}`;
        if (!validPick(d, pick)) {   // 選んでいない: コスプレしない（3枚とも山札の一番下に戻る）
          d.used = true;
          g.nightLogsAll.push(`${label} は 山札から3枚めくりましたが、コスプレしませんでした。`);
          c.rev[p.id] = { kind: "cosplay", cards, pick: null, role: null };
          return;
        }
        if (ONW.keymaster.gate(g, p.id, [])) {   // 鍵師のロック: 自分の席がロック中ならコスプレに失敗（3枚とも山札に戻る）
          d.used = true;
          c.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "コスプレ", [], label));
          c.rev[p.id] = ONW.keymaster.failRev(g, p.id, p.id);
          return;
        }
        const r = place(g, p.id, d, pick);
        g.nightLogsAll.push(`${label} は 山札から ${namesOf(d)} をめくり、${rn2(r.role)} にコスプレしました。`);
        c.hold(p.id, `山札から3枚めくり、「${rn2(r.shown)}」にコスプレしました。あなたの新しい役職は「${rn2(r.shown)}」です。`);
        ONW.newsNote(g, SELF);
        const ga = ONW.mimic.gotAct(g, p.id, r.role);   // 模倣の人狼になったら模倣先の能力
        if (ONW.roleIsActive(ga)) g.morningAct[p.id] = ga;   // 夜能力があれば朝のうちに使える（墓荒らし・占い師など。連鎖OK）
        c.rev[p.id] = ONW.mimic.tag(g, p.id, r.role, { kind: "cosplay", cards, pick, role: r.shown });
        c.gotInfo(g, p, r.role, c.rev, { skipGrave: null, both: false, via: "コスプレした従者" });
      },
    },
    morning: {
      run(c) {   // 墓荒らし/ドッペルで手にしたコスプレイヤー・酔い覚めのコスプレイヤー: 自動でめくれた3枚から選んで確定
        const g = c.g, id = c.id, d = (g.cosplayDraw || {})[id], pick = c.sel && c.sel.pick;
        if (!validPick(d, pick)) return null;
        const cards = shownOf(d);
        if (ONW.keymaster.gate(g, id, [])) { d.used = true; return { lines: [ONW.keymaster.fail(g, id, "self", "コスプレ", [], `${c.label} ${c.me.name}`)], reveal: ONW.keymaster.failRev(g, id, id), nextChain: null, failed: true }; }
        const r = place(g, id, d, pick);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は 山札から ${namesOf(d)} をめくり、${c.rn(r.role)} にコスプレしました。`);
        const lines = [`山札から3枚めくり、「${c.rn(r.shown)}」にコスプレしました。あなたの新しい役職は「${c.rn(r.shown)}」です。`];
        lines.push(...c.soberInfoLines(g, id, r.role));
        return { lines, reveal: ONW.mimic.tag(g, id, r.role, { kind: "cosplay", cards, pick, role: r.shown }), nextChain: null };
      },
      after(c, res) {   // コスプレ先にも夜の能力があれば続けて1回使える（コスプレイヤー→墓荒らし→占い師）
        const g = c.g, id = c.id, ga = ONW.mimic.gotAct(g, id, g.currentRoles[id]);
        if (ONW.roleIsActive(ga)) { res.nextChain = ga; g.morningAct[id] = ga; g.morningDone[id] = false; res.lines.push(g.phase === c.PH.ONLINE_DAY ? "この役職の能力も、議論中に1回だけ使えます。" : "この役職の能力も、朝のうちに1回だけ使えます。"); }
      },
      peek: (c) => c.soberPeek(c.g, c.id, c.g.currentRoles[c.id]),
    },
  });
  function esc2(s) { return ONW.utils.esc(s); }
})(window.ONW);
