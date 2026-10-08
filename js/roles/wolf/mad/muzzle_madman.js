/**
 * 口封じの狂人（マイクラ版 MUZZLE_MADMAN を参考）: 人狼陣営の「狂人系」（人狼が誰かは分からない）。夜の行動はなく、夜の始まりに自動で
 * 「自分を含む全員」からランダムな1人を口封じする。口封じされた人は、昼のチャット・COボタン（結果開示も）が使えない。
 *   ・夜の始まりに本人のカードの上で、口封じの対象のカードがめくれてミュートマーク(🤐・口にチャックの顔)が出る（js/stage.js の MUTE_MARK / 3段階のうち2段階目で実装）
 *   ・墓荒らし・ドッペルゲンガーで手にしたときは、朝に「口封じの狂人を取った」と分かったあと、ターゲットのカードが裏返ってミュートマークが出る
 *   ・口封じされた人は、待機時間（朝のあと・昼の前）に「口封じ演出」（でかいミュートマーク＋「あなたは口封じされました。」）が出る
 *   ・対象の記録: g.muzzleTargets[口封じの狂人の持ち主ID] = 口封じされた人のID（役職カードについて動く: state.js の ROLE_BOUND_KEYS）。
 *     有効なのは「最終盤面で口封じの狂人になっていて、酔いが覚めている人」の分だけ（ONW.muzzle.mutedIds）。
 *   ・酔っ払いの口封じの狂人は、酔いが覚めたときに対象が決まる（ONW.muzzle.ensure が足りない分をランダムで決める）
 * 実装の進み具合は _wip/口封じの狂人_依頼文.txt を参照。
 */
(function (ONW) {
  const ROLE_ID = "muzzle_madman";
  const nameOf = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const isMuzzler = (g, id) => g.currentRoles[id] === ROLE_ID && !ONW.hiddenDrunk(g, id);

  ONW.muzzle = {
    /** この口封じの狂人(ID)の対象を決める(すでにあればそのまま)。自分を含む全員からランダム。戻り値: 対象のID */
    assign(g, id, force) {
      g.muzzleTargets = g.muzzleTargets || {};
      const cur = g.muzzleTargets[id];
      if (!force && cur && g.players.some((q) => q.id === cur)) return cur;
      if (!g.players.length) return null;
      const f = ONW.debug && ONW.debug.randTarget ? ONW.debug.randTarget(g, "muzzle", id) : null;   // デバッグ: 口封じ先の指定（自分自身も可。いなければランダムに戻す）
      const t = f && g.players.some((q) => q.id === f) ? f : g.players[Math.floor(Math.random() * g.players.length)].id;
      g.muzzleTargets[id] = t;
      return t;
    },
    /** 最終盤面で口封じの狂人になっている人(酔いが覚めている)のうち、対象が決まっていない人に対象を決める。新しく決まった [{ from, to }] を返す */
    ensure(g) {
      const out = [];
      g.muzzleTargets = g.muzzleTargets || {};
      g.players.forEach((p) => {
        if (!isMuzzler(g, p.id)) return;
        const had = g.muzzleTargets[p.id] && g.players.some((q) => q.id === g.muzzleTargets[p.id]);
        if (had) return;
        out.push({ from: p.id, to: ONW.muzzle.ensureOne(g, p.id) });
      });
      return out;
    },
    /** 対象がまだ決まっていない口封じの狂人(ID)の対象を決め、夜ログ(GM用)に残す(CPUがドッペル/墓荒らしで手にした・酔いが覚めた、など本人への通知を通らない経路用)。決まっていればそのまま。戻り値: 対象のID */
    ensureOne(g, id) {
      const had = (g.muzzleTargets || {})[id] && g.players.some((q) => q.id === g.muzzleTargets[id]);
      const t = ONW.muzzle.assign(g, id);
      if (!had && t) {
        const me = g.players.find((q) => q.id === id) || {};
        (g.nightLogsAll = g.nightLogsAll || []).push(`${ONW.ROLE_INFO[ROLE_ID].name} ${me.name} は ${nameOf(g, t)} を口封じしました。`);
      }
      return t;
    },
    /** 口封じされている人のID一覧(重複なし)。口封じの狂人が最終盤面で口封じの狂人のままで、酔いが覚めている分だけ */
    mutedIds(g) {
      const t = g.muzzleTargets || {};
      return [...new Set(g.players.filter((p) => isMuzzler(g, p.id)).map((p) => t[p.id]).filter((x) => x && g.players.some((q) => q.id === x)))];
    },
    isMuzzled(g, id) { return ONW.muzzle.mutedIds(g).includes(id); },
    /** 口封じの狂人本人が、自分の対象を知るための文章 */
    lineOf(g, id) { const t = (g.muzzleTargets || {})[id]; return t ? `あなたは${nameOf(g, t)}を口封じしました。` : ""; },
  };

  ONW.defineRole(ROLE_ID, {
    info: { deck: 53, name: "口封じの狂人", team: ONW.TEAM.WOLF, wakeOrder: 43, sort: 1.85,
      desc: "人狼陣営。夜の始まりに、自分を含む全員からランダムな1人を口封じします。口封じされた人は、昼のチャットとCOボタン（結果開示も）が使えません。人狼が誰かは分かりません。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.6, "transform:dark_avatar": 15 },
    // 夜の画面: 夜の行動はない
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>夜の始まりに、自分を含む全員から<strong>ランダムな1人</strong>が口封じされます。</p>`;
      },
    },
    /** 夜の始まり(net.js toNight が、夜の画面を送る前に呼ぶ): 最初から口封じの狂人の人(CPU含む・酔っていない人)の対象をランダムで決める */
    nightStart: { order: 50, run(c) {
      const g = c.g;
      g.players.forEach((p) => {
        if (g.initialRoles[p.id] !== ROLE_ID || ONW.hiddenDrunk(g, p.id)) return;
        const had = (g.muzzleTargets || {})[p.id];
        const t = ONW.muzzle.assign(g, p.id);
        if (!had && t) g.nightLogsAll.push(`${c.rn(ROLE_ID)} ${p.name} は ${nameOf(g, t)} を口封じしました。`);
      });
    } },
    /** 夜の始まり(本人の画面): 対象を伝え、対象のカードがめくれてミュートマーク(muzzle)が出る */
    nightMsg(c, p, r) {
      const g = c.g, t = ONW.muzzle.assign(g, p.id);
      return { text: t ? `あなたは${nameOf(g, t)}を口封じしました。` : "", text2: "口封じされた人は、昼のチャットとCOボタンが使えません。", muzzle: t || null };
    },
    /** 墓荒らし・ドッペルゲンガーで口封じの狂人を手にしたとき: 朝のうちに対象がランダムで決まる。本人に伝え、朝の演出で対象のカードがミュートマークでめくれる(rev.muzzle) */
    got(c, p, got, rev, opts) {
      const g = c.g, t = ONW.muzzle.assign(g, p.id);   // すでに対象がカードについてきていればそのまま、なければランダム
      if (!t) return;
      c.hold(p.id, `あなたは${nameOf(g, t)}を口封じしました。`);
      g.nightLogsAll.push(`${c.rn(ROLE_ID)} ${p.name} は ${nameOf(g, t)} を口封じしました。`);
      if (rev && rev[p.id]) rev[p.id].muzzle = t;
    },
    // 夜の演出(stage.js が g.muzzleReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに、口封じの対象（自分を含む）のカードがめくれてミュートマーク(🤐・口にチャックの顔)が出る → 夜時間の間ずっと開いたまま
    stageNight: {
      order: 20, field: "muzzleReveal",
      run(r, SK) {
        const { paint, G } = SK;
        const k = `p:${r.id}`;
        if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
        SK.up[k] = SK.MUTE_MARK; SK.glow[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G());
      },
    },
    /** 待機時間の前: 墓荒らし・ドッペル・酔い覚めで口封じの狂人になった人(CPU含む)の対象を決めておき、口封じされた人を「通知済み」として記録する */
    settlePre: { order: 60, run(c) {
      const g = c.g;
      ONW.muzzle.ensure(g);
      g.muzzleNotified = g.muzzleNotified || {};
      ONW.muzzle.mutedIds(g).forEach((id) => { g.muzzleNotified[id] = true; });
    } },
    /** 待機時間: 口封じされた人にだけ「口封じ演出」を出す(muzzled: true)。情報確認にも載る。再入室でも同じ内容を返す */
    settleMsg: { order: 60, run(c, p, mode) {
      const g = c.g;
      if (p.isCpu || !ONW.muzzle.isMuzzled(g, p.id)) return {};
      return { logs: ["【口封じ通知】あなたは口封じされました。昼のチャットとCOボタンは使えません。"], muzzled: true };
    } },
    /** 昼のうちに口封じが変わったとき(酔い覚め・昼の能力で口封じの狂人になった/やめた)、新しく口封じされた人へ演出、解かれた人へ通知（昼のタイマーは止めない） */
    dayNews: { order: 110, run(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      ONW.muzzle.ensure(g);
      g.muzzleNotified = g.muzzleNotified || {};
      const now = ONW.muzzle.mutedIds(g);
      now.forEach((id) => {
        if (g.muzzleNotified[id]) return;
        g.muzzleNotified[id] = true;
        const p = g.players.find((q) => q.id === id);
        if (!p || p.isCpu) return;
        const text = "【口封じ通知】あなたは口封じされました。昼のチャットとCOボタンは使えません。";
        c.hold(id, text);
        c.send(id, { t: "muzzle", on: true, text });
      });
      Object.keys(g.muzzleNotified).forEach((id) => {
        if (now.includes(id)) return;
        delete g.muzzleNotified[id];
        const p = g.players.find((q) => q.id === id);
        if (!p || p.isCpu) return;
        const text = "【口封じ通知】口封じが解かれました。";
        c.hold(id, text);
        c.send(id, { t: "muzzle", on: false, text });
      });
    } },
    // 待機時間の口封じ演出(stage.js が g.settleMuzzled を受け取って呼ぶ): 口封じされた人の画面だけに、でかいミュートマークと「あなたは口封じされました。」。昼になったら消える
    stageSettle: {
      field: "settleMuzzled", shown: "settleMuzzledShown",
      run: { order: 5, run(flag, SK) { SK.later(() => { if (ONW.stage.muzzled) ONW.stage.muzzled(); }, 600); } },
      end: { order: 5, run(SK) { if (ONW.stage.muzzledEnd) ONW.stage.muzzledEnd(); } },
    },
    /** 酔いが覚めた口封じの狂人の演出: 対象のカードがめくれてミュートマーク(自分が対象のときは出さない) */
    soberPeek(c, id, fin) {
      const g = c.g; ONW.muzzle.ensureOne(g, id);
      return { muzzle: g.muzzleTargets[id] };
    },
    stageSober: { list: { order: 95, run(sp, list, SK) { if (sp.muzzle) list.push([`p:${sp.muzzle}`, SK.MUTE_MARK, true]); } } },
    /** 酔いが覚めた口封じの狂人: 対象が決まっていなければ決めて、本人に伝える */
    soberLines(c, id, fin) {
      const g = c.g;
      ONW.muzzle.ensureOne(g, id);
      const l = ONW.muzzle.lineOf(g, id);
      return l ? [l] : [];
    },
  });
})(window.ONW);
