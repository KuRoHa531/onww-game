/**
 * 姫君（マイクラ版 PRINCESS を参考）: 村人陣営。夜・昼の能力はない。
 *   ・本人は自分を「村人」だと思い込んでいる（ONW.SELF_AS_VILLAGER / ONW.shownRole。CPU も同じ自認で動く）。
 *   ・占い師・狂った占い師に占われると「村人」と出る（seerSees。白狼と同じ。マイクラ版 isDisplayedAsVillagerToSeer）。
 *   ・模倣の人狼は模倣できない（NON_MIMICABLE に入っている・済）。
 *
 * 【仕様（2026-10-23 ユーザー指定。docs/princess.md）】
 *   ・昇格するのは待機時間の開始時: 女王が盤面にいなければ（墓地にいる・配役にいないとき）、封印されていない姫君の1人が女王に昇格する（複数いればランダムで1人）。
 *     昇格した姫君は、女王を知らされる人（村人陣営）と同じように、自分のカードが「女王」としてめくれる（queen.js の待機時間の公開）。
 *   ・昼中に女王が死んだとき、生きている姫君がいれば、その場で即座に昇格する（死因は問わない）。全員の画面で、姫君のカードが「女王」としてめくれる。
 *     このとき王国滅亡は起きない（マイクラ版は、女王が直接死んだら姫君がいても王国滅亡。Web版は「姫君がいれば滅亡しない」にした。ユーザー指定）。
 *   ・女王は夜、姫君が誰か分かる（queen.js の nightMsg。夜の始まりに姫君のカードがめくれる）。
 *   ・酔っ払い・墓荒らし・ドッペルゲンガー経由でも同じ判定・演出（酔っ払いは酔いが覚めてから公開。got / soberLines / soberPeek）。
 *
 * 【段階】onww-princess-1of4 〜 4of4（Task Important Rules.txt のとおり、各段階を a〜j に分けて納品）
 *   1of4（登録）: このファイル・index.html の <script>・ロビー/ガイドの並び（js/ui.js / js/wikiview.js）・wiki/js/web-roles.js・ルールコード ONW65（js/settings.js）・闇鍋シナジー（js/roles.js）・docs/princess.md
 *   2of4（昇格）: 待機時間の昇格・昼中の女王死亡での即時昇格と全員向けの演出・王国滅亡を止める
 *   3of4（女王の夜・酔い/墓荒らし/ドッペル）: queen.js の夜の情報と演出・got / 酔い覚め
 *   4of4（周辺・総合）: CPU・結果発表の昇格・追放された女王の継承・勝敗確認・docs
 * 実装の進み具合は docs/princess.md を参照。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const sealed = (g, id) => !!(ONW.seal && ONW.seal.is(g, id));
  /** 鍵師にロックされている席は、役職が変わらない（女王が先代女王に変われないので、姫君の昇格も起こらない） */
  const locked = (g, id) => !!(ONW.keymaster && ONW.keymaster.locked && ONW.keymaster.locked(g, id));
  const dead = (g, id) => (g.deadIds || []).includes(id);
  const nameOf = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

  /** 昇格できる姫君の席: 最終盤面で姫君を持っていて、死んでいなくて、封印されていない人（酔っている人も昇格できる。判定は最終盤面）。gone: 結果発表用の「すでに死んでいる人」の Set */
  function candidates(g, gone) {
    return g.players.map((p) => p.id).filter((id) => g.currentRoles[id] === R().PRINCESS && !sealed(g, id) && !dead(g, id) && !(gone && gone.has(id)));
  }
  /** 姫君 id を女王に昇格させる（カードの上で役職だけが書き換わる。履歴 roleTrail にも残る）。when: "settle"（待機時間）| "day"（昼中に女王が死んだ）| "result"（追放された女王の継承）。queen: 倒れた女王の席 */
  function promote(g, id, when, queen, extra) {
    ONW.promoteRole(g, id, R().QUEEN);
    const qs = [queen, ...(extra || [])].filter(Boolean);
    if (qs.length) {   // 倒れた女王は「先代女王」（結果の役職の流れに表示するだけ。currentRoles は女王のまま）。女王が複数いたときは、継承した瞬間に一斉に先代女王になる（同じ世代）
      const fq = (g.formerQueens = g.formerQueens || {}), fresh = qs.filter((q) => !fq[q]);
      if (fresh.length) { g.formerGen = (g.formerGen || 0) + 1; fresh.forEach((q) => { fq[q] = g.formerGen; }); }   // 世代の番号（1 = 最初に継承された女王）
    }
    (g.princessUp = g.princessUp || {})[id] = { when, queen: queen || null, queens: qs };
  }
  /** 先代女王の呼び名（結果の役職の流れ・めくれる面）。世代が1つだけなら「先代女王」。姫君が続けて継承したときは、一番新しい世代が「先代女王」、それより前は 初代女王 / 二代目女王 / 三代目女王… */
  const NUM = ["", "初代", "二代目", "三代目", "四代目", "五代目", "六代目", "七代目", "八代目", "九代目", "十代目"];
  function formerLabel(g, id) {
    const fq = g.formerQueens || {}, n = fq[id];
    if (!n) return null;
    const max = Math.max(...Object.values(fq).map(Number));
    return n >= max ? "先代女王" : `${NUM[n] || n + "代目"}女王`;
  }
  ONW.princess = {
    candidates, promote, formerLabel,
    /** 結果発表の「先代女王」の見せ方（net.js の res.former）。two: 結果発表で倒れて姫君が継承した女王（一度女王でめくれて、裏に戻ってから先代女王）/ direct: 昼中に継承済みの女王・待機時間に姫君が昇格したときの墓地の女王（最初から先代女王の面でめくれる） */
    formerView(g) {
      const up = g.princessUp || {}, ids = Object.keys(g.formerQueens || {});
      const resQ = new Set(); Object.keys(up).forEach((k) => { if (up[k].when === "result") (up[k].queens || [up[k].queen]).forEach((q) => resQ.add(q)); });
      const two = ids.filter((id) => resQ.has(id));
      const settled = Object.keys(up).some((k) => up[k].when === "settle");   // 待機時間に昇格 = 女王が盤面にいなかった（墓地にいる）
      const graves = settled ? (g.center || []).map((r, i) => (r === R().QUEEN ? i : -1)).filter((i) => i >= 0) : [];
      const labels = {}; ids.forEach((id) => { labels[id] = formerLabel(g, id); });
      return { direct: ids.filter((id) => !two.includes(id)), two, graves, labels };
    },
    /** 女王 queenId の死で王国滅亡を起こさないか: 昇格して継承済み（g.crownShield）か、昇格できる姫君が生きているとき（state.js の deathFollowers / 演出の予定 deathPlan が見る。マイクラ版に戻すときはここを false にする） */
    shields(g, queenId) { return !!(g.crownShield && g.crownShield[queenId]) || (!locked(g, queenId) && candidates(g).length > 0); },   // ロック中の女王は先代女王に変われないので、昇格しない＝王国滅亡は起きる
    /** 結果発表（vote.js の王国滅亡の判定）: 追放・道連れなどで倒れた女王 fell のうち、生きている姫君がいる女王は姫君が継承する（昇格・王国滅亡なし）。戻り値: 継承されなかった（王国滅亡を起こす）女王だけ。gone: 結果発表で死んでいる人の Set */
    succeedFallen(g, fell, gone) {
      const fresh = fell.filter((qid) => !(g.crownShield && g.crownShield[qid]));   // 昼中・前の世代で継承済みの女王は除く
      if (!fresh.length) return [];
      const lockedQs = fresh.filter((qid) => locked(g, qid)), okQs = fresh.filter((qid) => !locked(g, qid));   // 鍵師にロックされた女王: 昇格は起こらず、王国滅亡
      if (!okQs.length) return lockedQs;
      const cand = candidates(g, gone);
      if (!cand.length) return fresh;
      promote(g, ONW.utils.randomChoice(cand), "result", okQs[0], okQs.slice(1));   // 姫君1人が継承し、倒れていた女王は全員いっせいに先代女王になる
      okQs.forEach((qid) => { (g.crownShield = g.crownShield || {})[qid] = true; });
      return lockedQs;
    },
    /** 昼中に女王が死んだ（net.killPlayer が、連鎖の前に呼ぶ）。生きている姫君がいれば即座に昇格して全員へ知らせる。戻り値: 昇格した姫君の席（なければ null） */
    onDayDeath(c, deadId) {
      const g = c.g;
      if (g.currentRoles[deadId] !== R().QUEEN || locked(g, deadId)) return null;
      if (g.players.some((q) => q.id !== deadId && g.currentRoles[q.id] === R().QUEEN && !dead(g, q.id))) return null;   // 生きている女王がほかにいる間は継承しない（最後の女王が死んだときだけ）   // 封印された女王でも昇格は起こる（封印されて困るのは姫君の側。candidates が封印された姫君を除く）
      const cand = candidates(g);
      if (!cand.length) return null;
      const id = ONW.utils.randomChoice(cand);
      const olds = g.players.map((q) => q.id).filter((q) => q !== deadId && g.currentRoles[q] === R().QUEEN && dead(g, q) && !locked(g, q) && !(g.formerQueens || {})[q]);   // 先に倒れていた女王も、継承の瞬間にいっせいに先代女王になる
      promote(g, id, "day", deadId, olds);
      [deadId, ...olds].forEach((q) => { (g.crownShield = g.crownShield || {})[q] = true; });   // この女王の死は王国滅亡にならない
      if (ONW.hiddenDrunk(g, id)) { (g.crownPending = g.crownPending || {})[id] = true; return id; }   // 酔っている姫君: 昇格は済み。本人への通知と全員向けのめくれは、酔いが覚めてから（soberReveal）
      announce(c, [id], true);
      return id;
    },
  };

  /**
   * 全員へ「姫君 X が女王に即位した」を知らせる（昼中の昇格）。ids: 即位した席 / own: 本人に「昇格した」文を出すか（酔い覚めのときは soberExtra が出すので false）
   *   ・全員の画面で姫君のカードが「女王」としてめくれる(crownup)。女王を知らされる村人陣営の人は、昼のうちは queen.js の dayCheck(queenup)で同じカードがめくれるので、こちらでは ids を空にして二重にめくらない。
   *   ・昼でない（投票時間の妖狐投票などで死んだ）ときは queen.js の昼の通知が出ないので、村人陣営の人にもこちらでめくれる。
   *   ・CPU: 女王を知らされるCPUは queen.js の noticeFor が覚える。それ以外のCPUも、公開されたので「女王」として知る。
   */
  function announce(c, ids, own) {
    const g = c.g, day = g.phase === c.PH.ONLINE_DAY;
    ids.forEach((id) => {
      const line = `${nameOf(g, id)} が女王に即位しました。`;
      g.players.forEach((q) => {
        if (q.isCpu) { if (!day || !ONW.isQueenViewer(g, q.id)) { if (ONW.cpu && ONW.cpu.noticeQueens) ONW.cpu.noticeQueens(g, q.id, [id]); } return; }
        const mine = own && q.id === id, text = mine ? "あなたは姫君から女王に昇格しました。" : line;
        c.hold(q.id, text);
        c.send(q.id, { t: "crownup", ids: day && ONW.isQueenViewer(g, q.id) ? [] : [id], logs: [text] });
      });
      c.sendSpec({ t: "crownup", ids: [id], logs: [line] });
    });
    if (day) { const h = ONW.roleHook("queen", "dayCheck"); if (h) h(c); }   // 女王を知らされる村人陣営の人: 新しい女王のカードが表になる（queen.js）
    c.sendSpecInfo();
  }

  ONW.defineRole("princess", {
    info: { deck: 87, name: "姫君", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.97,
      desc: "村人陣営。自認はただの村人で、占われても村人と出ます。朝のあとの待機時間に女王が盤面にいなければ、姫君の1人が女王に昇格します（自分のカードが「女王」としてめくれます）。昼のうちに女王が死んだときも、生きている姫君がいれば、その場で女王に昇格します（全員の画面で女王としてめくれ、王国滅亡は起きません）。女王は夜に、姫君が誰か分かります。" },
    seerSees: "villager",   // 占われたときに見える役職（マイクラ版 isDisplayedAsVillagerToSeer: 白狼と姫君は村人）
    groups: { selfAsVillager: 4, "transform:light_apostle": 32 },   // 自認は村人。光の使徒の変化先（村人系）。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    /** 待機時間の開始時（net.js の toSettle の最初。抹消の人狼（order 1）のあと・ほかの待機時間の準備・女王の通知・呪殺の判定より先。処理順 docs/role-process-order.md の「抹消の人狼 → 姫君」）: 女王が盤面にいなければ、姫君の1人が女王に昇格する。
     *  女王が封印されていても「いる」扱い（マイクラ版 hasLivingQueen）。昇格した姫君が女王を知らされる人なら、queen.js の待機時間の公開で自分のカードが「女王」としてめくれる */
    settlePre: { order: 2, run(c) {   // 抹消の人狼（settlePre order 1）が先。抹消で女王が消えた盤面・姫君が消えた盤面を見て決める
      const g = c.g;
      if (g.players.some((p) => g.currentRoles[p.id] === R().QUEEN)) return;
      const cand = candidates(g);
      if (!cand.length) return;
      promote(g, ONW.utils.randomChoice(cand), "settle");
    } },
    /** 待機時間の通知: 昇格した本人に「昇格した」文（酔っている人は酔いが覚めてから）。再入室(resync)では昼中の昇格の文も復元する */
    settleMsg: { order: 35, run(c, p, mode) {
      const g = c.g, u = (g.princessUp || {})[p.id];
      if (!u || ONW.hiddenDrunk(g, p.id) || (mode === "settle" && u.when !== "settle")) return {};
      return { logs: ["あなたは姫君から女王に昇格しました。"] };
    } },
    /** 酔いが覚めた本人に（すでに昇格していたとき）: 「昇格した」文。カードは queen.js の soberExtra / soberPeek で「女王」がめくれる */
    soberExtra(c, id) {
      const u = (c.g.princessUp || {})[id];
      return u ? { lines: ["あなたは姫君から女王に昇格しています。"] } : {};
    },
    /** 昼中に女王が死んで昇格した酔っ払いの姫君: 酔いが覚めた瞬間に、全員の画面で女王としてめくれる（本人への文は soberExtra） */
    soberReveal: { order: 16, run(c, ids) {
      const g = c.g, ps = ids.filter((id) => g.crownPending && g.crownPending[id] && g.currentRoles[id] === R().QUEEN);
      ps.forEach((id) => { delete g.crownPending[id]; });
      if (ps.length) announce(c, ps, false);
    } },
    // 昼中に昇格した姫君のカード: 全員の画面で「女王」としてめくれ、しばらくして裏に戻る（女王のカードと同じ紫の光・♛の札）
    stageFlash: {
      field: "crownFlash",
      run(ids, SK) {
        ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = "queen"; SK.badge[k] = "♛即位"; SK.queenFlashKeys.push(k); SK.paint(SK.G()); }, 200 + i * 380));
        SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; delete SK.up[k]; delete SK.badge[k]; SK.pull(SK.queenFlashKeys, k); }); SK.paint(SK.G()); }, 200 + ids.length * 380 + 3000);
      },
    },
  });
})(window.ONW);
