/**
 * 純愛者（マイクラ版 PURE_LOVER を参考）: 第三陣営（恋人陣営）。
 * 夜に自分以外の1人を選び、自分とその相手が新しい恋人関係になる。
 *   ・選んだ相手は「役職の持ち主」単位で記録（ONW.setRoleBound(g, "pureLoverTargets", 持ち主ID, 相手ID)）。
 *     役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら、記録も移動先の持ち主へついていく（state.js の【必読】メモ）。
 *   ・相手(対象のプレイヤー)はプレイヤー単位のまま。
 *   ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
 *   ・恋人関係(2of4): 朝のあとの待機時間(settlePre)に、最終盤面で純愛者を持っている人(酔いが覚めている人)と、その記録の相手を g.pureLoverPairs に確定する(ONW.pureLover.sync)。
 *     何度呼んでも同じ結果になるよう毎回「最終盤面から」作り直す。ONW.loverMates / loverPairs / isLover が、配布時の恋人(g.loverOf)と合わせて読む。複数の恋人関係を同時に持てる(マイクラ版と同じ)。
 *     役職が選ばれた相手本人の手に渡ったときは、相手を元の持ち主に付け替える(state.js の swapBound)。
 *   ・演出: 朝 = 純愛者目線で選んだ人のカードがハートでめくれる(reveal) / 待機時間 = 選ばれた人の画面で純愛者のカードがめくれる(stageSettle)。墓荒らし・ドッペルで手にした場合も、最終盤面で決まるので待機時間に出る。
 *   ・g.pureLoverSeen[人] = その人が「もう知らされている」純愛者の相手。待機時間に、まだ知らされていない持ち主(怪盗などで受け取った人)にだけ「〇〇と恋人になりました」とハートを出す。
 * 実装の進み具合は _wip/純愛者_依頼文.txt を参照。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.PURE_LOVER;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 最終盤面で純愛者を持っている人(酔いが覚めている人)と、記録の相手 [[持ち主, 相手], ...]（相手が自分自身・不明なものは除く） */
  function pairs(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_() || ONW.hiddenDrunk(g, p.id)) return;
      const t = ONW.getRoleBound(g, "pureLoverTargets", p.id);
      if (!t || t === p.id || !g.players.some((q) => q.id === t)) return;
      out.push([p.id, t]);
    });
    return out;
  }
  /** 恋人の組を最終盤面から作り直す（何度呼んでもよい。朝のあとの待機時間と、あとから役職が動いたとき・酔いが覚めたときに呼ぶ） */
  /** 恋人を作る組すべて: 純愛者の[持ち主, 相手] + 悪女の[持ち主, 本命]（キープは恋人ではないので含めない）。g.pureLoverPairs はこの全部が入る（ONW.loverMates / loverPairs / isLover が読む） */
  function allPairs(g) { return [...pairs(g), ...(ONW.evilWoman ? ONW.evilWoman.pairs(g) : []), ...(ONW.cupid ? ONW.cupid.pairs(g) : [])].filter((pr) => !ONW.isBrokenRel(g, pr)); }   // 破局師に壊された関係は含めない   // キューピッドの組は [A, B, 持ち主]（3つ目で番号を決める）
  function sync(g) { g.pureLoverPairs = allPairs(g); note(g, []); return pairs(g); }   // 戻り値は純愛者の組だけ（純愛者の通知用。悪女の通知は evil_woman.js）
  /** 結果画面の「(+恋人N)」の履歴: 役職が動いたとき・純愛者が選んだとき・組が変わったときに、その時点の恋人の印を人ごとに残す。
   *  g.loveHist[人] = [{ n: その時点の roleTrail の長さ, x: true なら「役職は同じで印だけ変わった段階」, no: [恋人の番号...] }]。
   *  番号は成立した順（g.pureLoverNo["小>大"] = 何組目か。成立後に消えた組も番号は詰めない）。mutated = このとき役職が動いた人 */
  /** 結果画面: 人ごとの役職の段階(segs)に「(+恋人N)」を付ける。配布時の恋人は全段階、純愛者の恋人は loveHist の成立していた段階だけ。
   *  純愛者が選んだ段階・組が変わった段階は、役職が同じでも段階として足す（純愛者→純愛者(+恋人1)）。最後の段階は最終盤面の恋人。hasFrom = 先頭の段階が変化前の役職 */
  function applyMarks(g, id, segs, hasFrom) {
    const dealtTags = [];
    ONW.dealtPairs(g).forEach(([a, b], k) => { if (a === id || b === id) dealtTags.push({ t: `(+恋人${k + 1})`, k: "love", dk: k }); });
    const hist = (g.loveHist || {})[id] || [], base = hasFrom ? 1 : 0, per = segs.map(() => ({ nos: [], extras: [] }));
    hist.forEach((e) => { const j = Math.min(base + e.n, segs.length - 1); if (e.x) per[j].extras.push({ no: e.no, dk: e.dk || [] }); else { per[j].nos = e.no; per[j].dk0 = e.dk || []; } });
    const out = [], lost = new Set();   // lost: 破局で壊された配布時の恋人の番号（壊れた段階から、その (+恋人N) を付けない）
    segs.forEach((sg, j) => { (per[j].dk0 || []).forEach((k) => lost.add(k)); sg.pure = per[j].nos; sg.lost = new Set(lost); out.push(sg); per[j].extras.forEach((ex) => { ex.dk.forEach((k) => lost.add(k)); out.push({ ...sg, pure: ex.no, lost: new Set(lost) }); }); });
    const fin = []; ONW.loverPairs(g, true).forEach(([a, b, o]) => { if (a === id || b === id) fin.push(ONW.loverNo(g, a, b, o)); });
    out[out.length - 1].pure = fin.sort((x, y) => x - y);
    segs.splice(0, segs.length, ...out);
    segs.forEach((sg) => { sg.tags = [...dealtTags.filter((t) => !sg.lost.has(t.dk)).map(({ t, k }) => ({ t, k })), ...(sg.pure || []).map((no) => ({ t: `(+恋人${no})`, k: "love" }))]; delete sg.pure; delete sg.lost; if (!sg.tags.length) delete sg.tags; });
    return segs;
  }
  function note(g, mutated) {
    if (!g || !g.players || !g.currentRoles) return;
    const dealt = ONW.dealtPairs(g), nd = dealt.length, no = (g.pureLoverNo = g.pureLoverNo || {}), hist = (g.loveHist = g.loveHist || {}), last = (g.loveLast = g.loveLast || {});
    const tags = {};
    allPairs(g).forEach(([h, t, o]) => {
      const a = h < t ? h : t, b = h < t ? t : h, u = ONW.pairKey(g, [h, t, o]);
      if (!o && dealt.some((x) => x[0] === a && x[1] === b && !ONW.brokenDealt(g, a, b))) return;   // キューピッドの組(o あり)は、配布時の恋人と同じ2人でも別の恋人関係として数える   // 配布時の恋人と同じ組は、配布時の番号で全段階に付くのでここでは付けない
      // 番号は「純愛者のカード」の関係ごと: 怪盗・いたずらっ子などでカードが人から人へ動いても、同じカードの同じ関係は同じ番号のまま
      // （持ち主が選び直した・グレムリンでコピーされたカードは別の関係=次の番号。g.pureLoverGen[カード] が増える）
      const ck = ONW.cardAt(g, o || h) + "#" + ((g.pureLoverGen || {})[ONW.cardAt(g, o || h)] || 0);
      if (!no[ck]) no[ck] = Object.keys(no).length + 1;
      (g.pureLoverNoU = g.pureLoverNoU || {})[u] = no[ck];
      [h, t].forEach((id) => { (tags[id] = tags[id] || []); if (!tags[id].includes(nd + no[ck])) tags[id].push(nd + no[ck]); });
    });
    const lostNow = {}, lostPrev = (g.loveLostD = g.loveLostD || {});
    dealt.forEach(([a, b], k) => { if (ONW.brokenDealt(g, a, b)) [a, b].forEach((id) => { (lostNow[id] = lostNow[id] || []).push(k); }); });
    g.players.forEach((p) => {
      const nos = (tags[p.id] || []).slice().sort((x, y) => x - y), lk = lostNow[p.id] || [], prev = lostPrev[p.id] || [], newly = lk.filter((k) => !prev.includes(k));
      const sig = nos.join(",") + (lk.length ? "|" + lk.join(",") : ""), mut = (mutated || []).includes(p.id);
      if (!mut && sig === (last[p.id] || "")) return;
      const ent = { n: ((g.roleTrail || {})[p.id] || []).length, x: !mut, no: nos };
      if (newly.length) ent.dk = newly;   // このとき破局で壊れた配布時の恋人（結果画面で (+恋人N) を外す段階）
      (hist[p.id] = hist[p.id] || []).push(ent);
      last[p.id] = sig; lostPrev[p.id] = lk.slice();
    });
  }
  /** その人が「相手を知らされた」ことを記録する */
  function seen(g, id, t) { (g.pureLoverSeen = g.pureLoverSeen || {})[id] = t; }
  const key = (h, t) => h + ">" + t;
  const told = (g, h, t) => !!(g.pureLoverTold || {})[key(h, t)];
  const setTold = (g, h, t) => { (g.pureLoverTold = g.pureLoverTold || {})[key(h, t)] = true; };   // 選ばれた人(t)に、純愛者(h)のことをもう知らせた
  ONW.pureLover = { pairs, allPairs, sync, note, applyMarks, seen, nm, told, setTold };
  const heartReveal = (t) => ({ kind: "peek", items: [{ k: `p:${t}`, role: "__love" }] });   // 朝: 選んだ人のカードがハートでめくれる
  let pureKeys = [];   // 待機時間に札(丸いハート)を付けた席
  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    ONW.setRoleBound(g, "pureLoverTargets", p.id, t.id);   // 役職についていく（移動「あと」に選んでも現在の持ち主に予約される）
    ONW.pureLover.seen(g, p.id, t.id);
    i.mode = "pure_lover"; i.target = t.id;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を恋人に選びました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  ONW.defineRole("pure_lover", {
    info: { deck: 54, name: "純愛者", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 36.5,
      desc: "第三陣営（恋人陣営）。夜に自分以外の1人を選び、自分とその相手が恋人になります。朝、純愛者から見て選んだ人のカードがハートでめくれ、選ばれた人には待機時間に純愛者のカードがめくれます。" },
    groups: { "transform:silver_shadow": 14 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる。ロビーの変化候補・固定役の変化指定・設定のOFF・ガイドはここから自動で出る）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>恋人にする相手</strong>のカードを1人分押してください。（自分以外）<br>あなたとその人が恋人になります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>恋人にする相手</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    cpuNight: { order: 21, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 21,   // 占い師と同じ段階（一目惚れしてるてるの直後）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        ONW.setRoleBound(g, "pureLoverTargets", p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を恋人に選びました。`);
        c.hold(p.id, `${nameOf(t)} を恋人に選びました。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "pure_lover");
        ONW.pureLover.seen(g, p.id, t);
        c.rev[p.id] = heartReveal(t);   // 朝、選んだ人のカードがハートでめくれる
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 恋人にした相手を選ぶ
    coResult: {
      kind: "pure_lover", targetLabel: "恋人にした相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を恋人に選びました。`, { kind: "pure_lover", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    /** CPUの発言: 本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（恋人にした相手を開示）、残りは騙り。相手を知らない（怪盗で奪った等）ときは本当のCOはしない */
    cpuClaim(k, g, p, r, i, c) {
      const { nameOf } = k;
      if (i.mode === "pure_lover" && i.target && k.coTruth(g, p)) {
        c.co = "pure_lover";
        c.result = { short: `→ ${nameOf(g, i.target)}`, text: `${nameOf(g, i.target)} を恋人に選びました。`, claim: { kind: "pure_lover", target: i.target } };
      } else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
    },
    // ---- 恋人の確定と待機時間の演出 ----
    /** 待機時間(朝のあと): 最終盤面から恋人の組を確定する。選ばれた人(酔いが覚めている人)には、純愛者のカードがめくれる。持ち主が相手をまだ知らされていなければ、持ち主にも「恋人になりました」とハートが出る（怪盗・いたずらっ子などで受け取った人）。
     *  墓荒らし・ドッペルで手にした人は朝のうちに選んでいるので、持ち主は知っている（g.pureLoverSeen） */
    settlePre: { order: 15, run(c) {
      const g = c.g, set = (g.pureLoverSettle = {});
      const add = (id, logs, item) => { if (ONW.hiddenDrunk(g, id)) return; const e = (set[id] = set[id] || { logs: [], pure: [] }); e.logs.push(...logs); if (item) e.pure.push(item); };
      ONW.pureLover.sync(g).forEach(([h, t]) => {
        add(t, [`あなたは純愛者の ${ONW.pureLover.nm(g, h)} に選ばれ、恋人になりました。`], { id: h, face: "role" });
        if (!ONW.hiddenDrunk(g, t)) ONW.pureLover.setTold(g, h, t);
        if ((g.pureLoverSeen || {})[h] !== t) add(h, [`あなたは ${ONW.pureLover.nm(g, t)} と恋人になりました。`], { id: t, face: "heart" });
        ONW.pureLover.seen(g, h, t);
        const tp = g.players.find((q) => q.id === t);
        if (tp && tp.isCpu && !ONW.hiddenDrunk(g, t) && ONW.cpu.noticePureLovers) ONW.cpu.noticePureLovers(g, t, [h]);   // 選ばれたCPUも、純愛者が誰か知る
      });
    } },
    settleMsg: { order: 25, run(c, p) { const e = (c.g.pureLoverSettle || {})[p.id]; return e ? { logs: e.logs.slice(), pure: e.pure.map((x) => ({ ...x })) } : {}; } },
    stageSettle: {
      field: "settlePure", shown: "settlePureShown",
      run: { order: 35, run(items, SK) {
        SK.later(() => {
          items.forEach((it, i) => SK.later(() => {
            const k = `p:${it.id}`;
            if (it.face === "heart") SK.show(k, SK.LOVE_MARK, true);
            else { SK.show(k, "pure_lover", true); SK.lov[k] = true; if (!pureKeys.includes(k)) pureKeys.push(k); }   // 純愛者のカードの右上に丸いハート
            SK.paint(SK.G());
          }, i * 380));
        }, 900);
      } },
      end: { order: 35, run(SK) { if (pureKeys.length) { pureKeys.forEach((k) => { delete SK.lov[k]; }); pureKeys = []; SK.paint(SK.G()); } } },
    },
    /** CPU(選ばれたCPU): 待機時間に、純愛者のカードがめくれて誰が純愛者か知る */
    cpuNotice(g, id, hids, k) {
      const i = k.infoOf(g, id);
      i.pureBy = [...new Set([...(i.pureBy || []), ...hids])];
      hids.forEach((h) => { i.known[h] = "pure_lover"; });
    },
    // ---- 昼のうち（酔いが覚めた・役職が動いた・昼に純愛者で選んだ）: 恋人の組を作り直し、新しく成立した組を知らせる ----
    /** 新しく成立した組: 選ばれた人にはカードが数秒だけ表になって知らされ(jobday)、持ち主にもまだ知らされていなければ相手のハートが出る。酔いが覚めた本人には soberExtra でまとめて知らせる（二重に出さない）。
     *  何度呼んでもよい（知らせた記録 g.pureLoverTold / g.pureLoverSeen で重複を防ぐ）。net.js の dayCheck(昼に役職が動いた) と daySober(酔いが覚めた直後) から呼ばれる */
    dayCheck(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      const P = ONW.pureLover;
      P.sync(g).forEach(([h, t]) => {
        const hp = g.players.find((q) => q.id === h), tp = g.players.find((q) => q.id === t);
        if (!P.told(g, h, t) && tp && !ONW.hiddenDrunk(g, t) && !c.isDead(t)) {
          P.setTold(g, h, t);
          if (tp.isCpu) { if (ONW.cpu.noticePureLovers) ONW.cpu.noticePureLovers(g, t, [h]); }
          else { const text = `あなたは純愛者の ${P.nm(g, h)} に選ばれ、恋人になりました。`; g.nightLogsAll.push(`${c.rn(R_())} ${P.nm(g, h)} が ${tp.name} を恋人にしました。`); c.hold(t, text); c.send(t, { t: "jobday", id: h, text, role: R_() }); }
        }
        if (hp && (g.pureLoverSeen || {})[h] !== t && !ONW.hiddenDrunk(g, h) && !c.isDead(h)) {
          P.seen(g, h, t);
          if (!hp.isCpu) { const text = `あなたは ${P.nm(g, t)} と恋人になりました。`; c.hold(h, text); c.send(h, { t: "jobday", id: t, text, role: "__love" }); }
        }
      });
    },
    daySober(c) { ONW.roleDef(R_()).dayCheck(c); },
    /** 酔いが覚めた本人に、恋人の情報をまとめて出す(net.js の soberUp): 純愛者の持ち主なら相手とのハート、純愛者に選ばれていれば純愛者のカード。peek は stageSober の list がめくる */
    soberExtra(c, id) {
      const g = c.g, P = ONW.pureLover, lines = [], peek = { pureMate: [], pureBy: [] };
      P.pairs(g).forEach(([h, t]) => {
        if (h === id) { lines.push(`あなたは ${P.nm(g, t)} と恋人になりました。`); peek.pureMate.push(t); P.seen(g, h, t); }
        if (t === id && !P.told(g, h, t)) { lines.push(`あなたは純愛者の ${P.nm(g, h)} に選ばれ、恋人になりました。`); peek.pureBy.push(h); P.setTold(g, h, t); }
      });
      return { lines, peek: peek.pureMate.length || peek.pureBy.length ? peek : {} };
    },
    stageSober: { list: { order: 96, run(sp, list, SK) {
      (sp.pureMate || []).forEach((t) => list.push([`p:${t}`, SK.LOVE_MARK, true]));
      (sp.pureBy || []).forEach((h) => list.push([`p:${h}`, "pure_lover", true]));
    } } },
    /** 墓荒らし・ドッペルゲンガーで純愛者を手にしたとき: 朝のうちに1人選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        ONW.setRoleBound(g, "pureLoverTargets", id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を恋人に選びました。`);
        ONW.pureLover.seen(g, id, t);
        return { lines: [`${c.nameOf(t)} を恋人に選びました。`], reveal: heartReveal(t), nextChain: null };
      },
    },
  });
})(window.ONW);
