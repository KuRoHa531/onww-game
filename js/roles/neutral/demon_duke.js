/**
 * 魔界公爵（マイクラ版 DEMON_DUKE を参考）: 第三陣営。
 *   ・夜に、初期役職の人狼（人狼判定になる人）が誰かを知っている。マーリンと同じく、夜の始まりに人狼のカードが順に表になって🐺が出る（夜時間の間ずっと開いたまま）。
 *   ・人狼が配られていないときは、昇格が決まっている狂人（人狼判定に昇格する人）が人狼として見える。昇格する狂人もいなければ「見える人狼はいません。」
 *   ・投票が終わったとき、最終盤面で人狼判定の人が1人以上死亡している（または、最終盤面に人狼判定の人がいない）と、生存者だけで「魔界公爵追放会議」が始まる。
 *     追放会議で魔界公爵を処刑できなければ魔界公爵の勝利。追放会議開始時の生存者が魔界公爵のみなら即座に勝利。（2of4 以降）
 *   ・封印の対象役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。夜の能力はないので、封印されても夜の情報は変わらない（マイクラ版も同じ）。
 *   ・酔っ払い / 墓荒らし / ドッペルゲンガー経由: 手にしたときの夜の情報（got）と、酔いが覚めたときの情報（soberLines / soberPeek）で、同じ🐺の演出と文章を出す。
 *     追放会議・勝敗は「最終盤面（g.currentRoles）の魔界公爵」で見るので、どの経由で手にしても同じ結果になる（2of4 以降）。
 *
 * 【処理順】夜の能力は無い（night なし）ので docs/role-process-order.md の位置は不要。追放会議は投票終了後（本投票・妖狐投票のあと）。
 * 実装の進み具合は _wip/依頼文_魔界公爵_*.txt と docs/demon-duke.md を参照。
 *  1of4: 登録・夜の🐺（人狼の気配）・墓荒らし/ドッペル/酔い覚めの情報・CPUの基本・ルールコード ONW71・闇鍋/ガイドの並び【このファイル】
 *  2of4: 追放会議の進行（発動条件・生存者の投票・同数のランダム・勝敗・CPU）
 *  3of4: 追放会議の演出（背景の色が変わる・全員の画面）・結果発表・情報確認（結果発表の演出は「結果発表」の前に、票数バッジ(黒)→カードがめくれる/めくれそうで戻る）
 *  4of4: 勝利優先度の docs・戦績/実績・端のケース・総合
 */
(function (ONW) {
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

  /** 魔界公爵に見える人狼判定の席（配布直後=初期役職の人狼系。一匹狼・忘却の人狼も含む。マイクラ版 assignDemonDukeVision の wolfJudgeIds）。
   *  人狼系が誰にも配られていなければ、人狼判定に昇格する狂人（ONW.vote.certainPromotion。人狼王だけがいるときの昇格を含む）。自分自身は含めない */
  function sees(g, selfId) {
    const ids = ONW.wolfLookIds(g, selfId, true);   // スパイも🐺として見える（WOLF_LOOK_ALL）
    if (ids.length) return ids;
    const mid = ONW.vote.certainPromotion(g);
    return mid && mid !== selfId ? [mid] : [];
  }
  const NONE_TEXT = "見える人狼はいません。";
  const textOf = (g, ids) => (ids.length ? `人狼の気配: ${ids.map((id) => nm(g, id)).join("、")}` : NONE_TEXT);
  ONW.demonDuke = { sees, textOf, NONE_TEXT };

  // CPU: 人狼が誰か分かっている（マーリンと同じ。人狼不在で昇格が決まっている狂人は、人狼側の仲間として扱う）
  const cpuLearn = (g, id, k) => g.players.forEach((q) => { if (q.id !== id && k.isLookAll(g.initialRoles[q.id])) k.infoOf(g, id).known[q.id] = k.seenAs(g.initialRoles[q.id]); });


  // ================= 2of4: 魔界公爵追放会議の進行（マイクラ版 runDemonDukeMeetingIfNeeded）=================
  //  呼ぶ場所: js/net.js の startDukeMeeting（わら人形・アサシン・名探偵のあと、結果の勝敗判定の前）。勝敗は vote.js の分岐 1.65。
  //  記録: g.dukeResult = { kind: "skip"|"immediate"|"vote", rawVotes, counts, topIds, pickedId, success, dukeIds, tie }
  //        g.dukeJudged = 魔界断罪で死んだ公爵 / g.dukeDead = 追放会議で死んだ人（公爵か身代わりの従者。g.eliminated にも入る。処刑人などの「追放」には数えない）
  const D = ONW.demonDuke;
  const R = () => ONW.ROLE;
  const rand = (a) => a[Math.floor(Math.random() * a.length)];

  /** 追放会議に参加できる魔界公爵（最終盤面の公爵・生存・恋人でない・保安官に撃たれていない） */
  D.aliveDukes = function aliveDukes(g, dead) {
    const shot = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(g) : [];
    return g.players.map((p) => p.id).filter((id) => g.currentRoles[id] === R().DEMON_DUKE && !dead.has(id) && !ONW.isLover(g, id) && !shot.includes(id));
  };

  /** 追放会議を行うか決める。{ run:false, skipped?:true } / { run:true, immediate, dukeIds, aliveIds } */
  D.plan = function plan(g) {
    ONW.vote.updatePromotion(g);
    g.executed = ONW.vote.resolveChain(g, true);   // 追放・連鎖・昼中の死亡をすべて反映した死者
    const dead = ONW.vote.deadSet(g);
    const hasDuke = g.players.some((p) => g.currentRoles[p.id] === R().DEMON_DUKE);
    if (!hasDuke) return { run: false };
    // 発動条件（最終盤面で見る）: 人狼判定の人が1人以上死亡 / 最終盤面にそもそも人狼判定の人がいない（途中で役職が変わって人狼判定でなくなった人は数えない）
    const wolfJ = ONW.vote.wolfJudgeIds(g), deadWolf = wolfJ.filter((id) => dead.has(id));
    if (!deadWolf.length && wolfJ.length > 0) return { run: false, skipped: true };   // 人狼判定の人が最終盤面にいて、1人も死んでいない
    const dukeIds = D.aliveDukes(g, dead);
    if (!dukeIds.length) return { run: false };
    const aliveIds = g.players.map((p) => p.id).filter((id) => !dead.has(id));
    if (!aliveIds.length) return { run: false };
    return { run: true, dukeIds, aliveIds, immediate: aliveIds.every((id) => g.currentRoles[id] === R().DEMON_DUKE) };
  };

  /** CPUの追放会議の票: 自分以外の生存者からランダム（マイクラ版と同じ。魔界公爵のCPUは自分に入れない）。誰もいなければ自分 */
  D.cpuTarget = function cpuTarget(g, p, aliveIds) {
    const c = aliveIds.filter((id) => id !== p.id);
    return c.length ? rand(c) : p.id;
  };

  /** 追放会議の票を数えて結果を確定する（g.eliminated・g.dukeJudged・g.dukeResult を更新）。ペンギン・交換者・メイヤーなどは効かない（1人1票） */
  D.resolve = function resolve(g, rawVotes, plan) {
    const counts = {};
    Object.values(rawVotes).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
    const max = Math.max(0, ...Object.values(counts));
    const topIds = Object.keys(counts).filter((id) => counts[id] === max);
    const pickedId = rand(topIds) || null;
    const success = !!pickedId && g.currentRoles[pickedId] === R().DEMON_DUKE;
    g.eliminated = g.eliminated || [];
    // 追放会議で死ぬのは「選ばれた魔界公爵」か、その「身代わりの従者」だけ（チキン・豆腐の人狼などは、票が入っても何も起きない）
    g.dukeJudged = []; g.dukeDead = []; const subs = [];
    if (success) {
      const dead = ONW.vote.deadSet(g), blocked = [R().SERVANT, R().TANNER, R().LOVE_TANNER, R().BOUNTY_HUNTER, R().JESTER_BOMBER, R().MARTYR];
      let cur = pickedId;
      if (!g.eliminated.includes(cur)) g.eliminated.push(cur);
      for (let guard = 0; guard < 20; guard++) {   // 従者の身代わり（vote.js applyServantSubstitution と同じ条件。従者の従者も続けて身代わりになる）
        if (blocked.includes(g.currentRoles[cur]) || ONW.vote.jesterSubBlocked(g, cur)) break;
        const pr = ONW.servantSubPairs(g).find(([s, m]) => m === cur && s !== m && !g.eliminated.includes(s) && !dead.has(s) && !ONW.isLover(g, s));
        if (!pr) break;
        g.eliminated = g.eliminated.filter((x) => x !== cur); g.eliminated.push(pr[0]);
        g.servantSubs = g.servantSubs || []; g.servantSubs.push({ servant: pr[0], master: cur, duke: true });
        subs.push({ servant: pr[0], master: cur });
        cur = pr[0];
      }
      g.dukeDead = [cur];
      if (cur === pickedId) g.dukeJudged = [pickedId];   // 身代わりがいなければ、公爵本人が魔界断罪で死ぬ
    }
    g.dukeResult = { kind: "vote", none: !pickedId, rawVotes: { ...rawVotes }, counts, topIds, pickedId, success, tie: topIds.length >= 2, dukeIds: plan.dukeIds.slice(), extra: [], subs, win: !success };
    return g.dukeResult;
  };

  D.finishImmediate = function finishImmediate(g, plan) {
    g.dukeJudged = []; g.dukeDead = [];
    g.dukeResult = { kind: "immediate", rawVotes: {}, counts: {}, topIds: [], pickedId: null, success: false, dukeIds: plan.dukeIds.slice(), extra: [], win: true };
  };
  D.finishSkip = function finishSkip(g) { g.dukeJudged = []; g.dukeDead = []; g.dukeResult = { kind: "skip", dukeIds: [], win: false }; };

  /** 魔界公爵の勝利者（追放会議で公爵を処刑できなかった / 開始時の生存者が公爵のみ） */
  D.winIds = function winIds(g) {
    const r = g.dukeResult;
    return r && r.win && r.dukeIds ? r.dukeIds.filter((id) => g.currentRoles[id] === R().DEMON_DUKE) : [];
  };
  D.winText = function winText(g, ids, nm) {
    const r = g.dukeResult || {};
    if (r.none) return `魔界公爵追放会議で誰も投票しなかったため、誰も選ばれませんでした。魔界公爵 ${nm(ids)} の勝利です。`;
    return r.kind === "immediate"
      ? `追放会議開始時の生存者が魔界公爵 ${nm(ids)} のみだったため、投票なしで魔界公爵の勝利です。`
      : `魔界公爵追放会議で、魔界公爵ではない ${nm([r.pickedId])} が選ばれました。魔界公爵 ${nm(ids)} の勝利です。`;
  };

  /** 結果発表用のデータ（3of4 の演出・結果欄が使う） */
  D.view = function view(g, nm) {
    const r = g.dukeResult;
    if (!r) return null;
    return { kind: r.kind, none: !!r.none, votes: Object.entries(r.rawVotes || {}).map(([a, b]) => ({ from: nm(a), to: nm(b) })), counts: Object.entries(r.counts || {}).map(([id, c]) => ({ id, name: nm(id), c })),
      topIds: r.topIds || [], pickedId: r.pickedId || null, picked: r.pickedId ? nm(r.pickedId) : null, subs: (r.subs || []).map((x) => ({ servant: nm(x.servant), master: nm(x.master) })), success: !!r.success, tie: !!r.tie, dukeIds: r.dukeIds || [], extra: (r.extra || []).map((x) => ({ id: x.id, name: nm(x.id), kind: x.kind })) };
  };

  /** 結果の文章（結果欄・情報確認で共通）。res.duke（D.view）から作る */
  D.lines = function lines(v) {
    if (!v) return [];
    if (v.kind === "immediate") return ["追放会議開始時の生存者が魔界公爵のみだったため、投票なしで魔界公爵が勝利しました。"];
    if (v.none) return ["誰も投票しなかったため、誰も選ばれませんでした。魔界公爵の勝利です。"];
    const out = [];
    (v.votes || []).forEach((x) => out.push(`${x.from} → ${x.to}`));
    out.push(`最多得票: ${(v.topIds || []).map((id) => (v.counts.find((c) => c.id === id) || {}).name).join("、") || "なし"}${v.tie ? "（同数のためランダム）" : ""}`);
    (v.subs || []).forEach((x) => out.push(`従者 ${x.servant} が ${x.master} の身代わりになりました。`));
    out.push(v.success ? ((v.subs || []).length ? `魔界公爵である ${v.picked} が選ばれましたが、従者が身代わりになりました。` : `魔界公爵である ${v.picked} の追放に成功しました（魔界断罪）。`) : `${v.picked} は魔界公爵ではなかったため、追放に失敗しました。魔界公爵の勝利です。`);
    return out;
  };

  // 結果発表の演出（stage.js startResult の hk("duke")。追放・連鎖・昼の死亡のあと、生存者が一斉にめくれる「結果発表」の前）
  //   普通の投票の結果と同じ作り: 票数がカードのバッジ(黒)で順に出る →
  //   成功: 選ばれたカードがめくれて魔界公爵になる（バッジ［魔界断罪］）/ 従者がいれば、ご主人がめくれそうになって従者が身代わりでめくれる（［身代わり］）
  //   失敗: 選ばれたカードがめくれそうになって、めくれない（そのまま裏。「結果発表」で他の生存者と一緒にめくれる）
  const bodyOff = () => document.body.classList.remove("dk-result");
  ONW.demonDuke.fx = function fx(R, v) {
    const { later, esc, res, P, setCap, paint, G } = R, hkF = (k) => ONW.roleHooksIn("stageResult", k);
    const reduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const step = reduce ? 120 : 350, imm = v.kind === "immediate", cap = (t, b) => setCap(`<div class="res-cap__t t-wolf">${t}</div><div>${b}</div>`);
    const counts = (v.counts || []).filter((c) => c.c > 0).sort((a, b) => b.c - a.c), pickedId = v.pickedId, pk = pickedId ? P(pickedId) : null;
    const subs = (res.servantSubs || []).filter((x) => x.duke);
    const t0 = R.t; let snap = {}, t = t0;
    later(() => { document.body.classList.add("dk-result"); snap = Object.assign({}, R.badge); cap("魔界公爵追放会議", imm ? "追放会議開始時の生存者が魔界公爵のみです" : "魔界公爵だと思う人への票"); paint(G()); }, t0);
    t += 1200;
    counts.forEach((c, i) => later(() => { R.badge[P(c.id)] = `${c.c}票`; R.dkb[P(c.id)] = true; paint(G()); }, t + i * step));   // 票数バッジは黒
    t += counts.length * step + 1000;
    if (!imm && v.tie && (v.topIds || []).length >= 2 && pickedId) {   // 同数: ○票のバッジが交互に光って、だんだんゆっくりになり、選ばれた人のバッジで止まる
      const tops = v.topIds, n = tops.length, N = reduce ? 4 : 9, pIdx = tops.indexOf(pickedId);
      const names = tops.map((id) => esc((v.counts.find((c) => c.id === id) || {}).name || "")).join("、");
      later(() => cap("同数のため抽選", `${names} が同数最多です`), t);
      t += 700;
      for (let j = 0; j < N; j++) {
        const id = tops[(((pIdx - (N - 1 - j)) % n) + n) % n];
        later(() => { tops.forEach((x) => { R.dkb[P(x)] = true; }); R.dkb[P(id)] = "lit"; paint(G()); }, t);
        t += reduce ? 150 : Math.round(280 + j * j * 9);
      }
      t += 700;
    }
    const flip = (id, label) => {   // カードをめくる（連鎖などで先にめくれていれば、ラベルだけ）
      const h = res.history.find((x) => x.id === id) || {}, k = P(id), done = !!R.dead[k];
      if (!done) { hkF("flipUp").forEach((x) => x.fn(R, h)); R.up[k] = h.role; R.lovOn(id); R.dead[k] = true; }
      delete R.dkb[k]; R.badge[k] = label; paint(G());
    };
    if (v.none) { later(() => cap("誰も選ばれず", "誰も投票しなかったため、魔界公爵の勝利です"), t0 + 1200); t = t0 + 3400; }
    else if (imm) { later(() => cap("魔界公爵の勝利", "生存者が魔界公爵のみのため、投票はありません"), t0 + 1200); t = t0 + 3400; }
    else if (v.success && !subs.length) {
      later(() => { cap("魔界断罪", `${esc(v.picked)} は魔界公爵でした`); flip(pickedId, "魔界断罪"); }, t);
      const h = res.history.find((x) => x.id === pickedId), fx = h && R.flipped ? R.flipped([h], t, "exec") : 0;   // 処刑人のギロチン・猫の裏返しなど、追放でめくれた人に重なる演出
      t += 3200 + fx;
    } else if (v.success) {   // 従者の身代わり: ご主人のカードがめくれそうになる → （従者の従者もいれば順に）最後の従者のカードが表になる
      subs.forEach((x, i) => {
        const mk = P(x.masterId), last = i === subs.length - 1;
        later(() => { cap("従者の身代わり", `${esc(x.master)} が追放されそうになりました…`); R.alm[mk] = true; paint(G()); }, t);
        later(() => { delete R.alm[mk]; if (last) flip(x.servantId, "身代わり"); cap("従者の身代わり", `${esc(x.servant)} が ${esc(x.master)} の身代わりになりました`); paint(G()); }, t + 1900);
        t += 3600;
      });
    } else {   // 失敗: めくれそうになって、めくれない
      later(() => { cap("追放失敗", `${esc(v.picked || "")} は魔界公爵ではありませんでした`); if (pk) R.alm[pk] = true; paint(G()); }, t);
      later(() => { if (pk) delete R.alm[pk]; paint(G()); }, t + 1900);
      t += 3600;
    }
    later(() => { bodyOff(); Object.keys(R.dkb).forEach((k) => { delete R.dkb[k]; if (snap[k] !== undefined) R.badge[k] = snap[k]; else delete R.badge[k]; }); paint(G()); }, t);   // 黒い票数バッジは消して、本投票の票数に戻す
    R.t = t + 400;
  };

  ONW.defineRole("demon_duke", {
    stageResult: {
      duke: { order: 5, run(R) { const v = R.res.duke; if (v) ONW.demonDuke.fx(R, v); } },
      clear(K) { bodyOff(); if (K && K.dkb) Object.keys(K.dkb).forEach((k) => delete K.dkb[k]); },   // 結果をスキップしたとき: 背景と黒いバッジを戻す
    },
    cpuInit(g, id, k) {
      cpuLearn(g, id, k);
      const mid = g.players.some((q) => k.isWolf(g.initialRoles[q.id])) ? null : ONW.vote.certainPromotion(g);
      if (mid && mid !== id) k.infoOf(g, id).known[mid] = "werewolf";
    },
    cpuLearn,   // CPU: 墓荒らし・ドッペル・酔い覚めで手にしたときも、人狼を知る
    // CPU: 自分の役職は名乗らない（名乗ると追放会議で真っ先に狙われる）。他の村役職を騙る
    cpuClaim(k, g, p, r, i, c) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; },
    info: { sealTarget: true, deck: 93, name: "魔界公爵", team: ONW.TEAM.THIRD, wakeOrder: 22, sort: 35.95,
      desc: "第三陣営。初期役職の人狼が誰かを知っています（夜に人狼のカードに🐺が出ます）。投票終了後の最終盤面で、魔界公爵が生存していて、人狼判定の人が1人以上死亡している、または人狼判定の人がいないと、魔界公爵追放会議が始まり、魔界公爵を処刑できなければ魔界公爵の勝利になります。追放会議に参加できるのは生存者のみです。追放会議開始時の生存者が魔界公爵のみだった場合は即座に勝利します。" },
    groups: { "transform:silver_shadow": 26 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    // 夜の始まり: 人狼のカードが順に表になって🐺が出る（stage.js が cultWolves を受け取って演出。狂信者・マーリンと同じ作り）
    nightMsg(c, p) {
      const g = c.g, ids = sees(g, p.id);
      return { text: textOf(g, ids), cultWolves: ids.length ? ids : null };
    },
    // 墓荒らし・ドッペルで魔界公爵を手にしたとき: 配布直後（初期役職）の人狼に🐺（マーリンと同じ。手にした本人は自分を人狼として見ない）
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g, ids = sees(g, p.id);
      c.hold(p.id, textOf(g, ids));
      t.both(t.eff());
      t.setPeek(ids.map((id) => ({ k: `p:${id}`, role: "__wolf" })), 380);
    },
    // 昼に酔いが覚めた魔界公爵: 夜に見えるはずだった人狼の文章と🐺（しばらくして裏に戻る）
    soberLines(c, id) { return [textOf(c.g, sees(c.g, id))]; },
    soberPeek(c, id) {
      const ids = sees(c.g, id);
      return ids.length ? { wolves: ids } : {};
    },
  });
})(window.ONW);
