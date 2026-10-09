/**
 * 人狼王: 人狼陣営。最終盤面で人狼王を持っている人のカードは、朝のあとの待機時間に全員の画面で表になる(女王と同じタイミング)。
 * 追放・とばっちり・道連れで死ぬのは、他に人狼判定の人がいない / 先に全員死亡している / 他の人狼判定が全員同時に死ぬときだけ（ONW.kingProtected。道連れは vote.js の flushTomo）。心中・無理心中は無条件で死ぬ。
 * 勝敗判定は常に人狼陣営(groups.wolf に入れてあるので、人狼判定・占い・勝利条件は人狼と同じ扱い)。
 */
(function (ONW) {
  const K = ONW.wolfKit;
  /** 最終盤面で人狼王を持っている人のID（酔いが覚めていない人は、覚めた瞬間に公開されるので除く） */
  const holders = (g) => g.players.filter((p) => g.currentRoles[p.id] === ONW.ROLE.WOLF_KING && !ONW.hiddenDrunk(g, p.id)).map((p) => p.id);
  const nameList = (g, ids) => ids.map((id) => (g.players.find((q) => q.id === id) || {}).name);
  ONW.kingHolders = holders;
  /** 効果が働いている人狼王か（酔いが覚めていない酔っ払いは、まだ人狼王の能力を使えない） */
  const active = (g, id) => g.currentRoles[id] === ONW.ROLE.WOLF_KING && !ONW.hiddenDrunk(g, id);
  ONW.kingActive = active;
  /**
   * 人狼王が「追放・道連れ・とばっちり」で死なずにすむか（ガードされるか）。
   *   ・他に人狼判定の人が1人でも生き残るなら、ガードされる
   *   ・他に人狼判定の人がいない / 先に全員死亡している / 他の人狼判定が全員この人狼王と同時に死ぬなら、ガードされず死ぬ
   *   ・心中・無理心中は、この判定を通さず無条件で死ぬ（kill() が呼ばない）
   * gone: すでに死んでいる人の Set / dying: 人狼王と同時に死ぬ人の Set（人狼王本人を含んでよい）
   * 人狼王が複数いるときは互いを守り合う（人狼王どうしだけが同時に追放・道連れにされても死なない）。ただし人狼王以外の人狼判定も同時に死ぬなら、人狼王も全員死ぬ。
   * 他の人狼判定の人が「同時に死ぬ」場合でも、その人に従者の身代わりが付く（従者が同時に死なない・先に死んでいない）なら、その人は生き残る
   */
  ONW.kingProtected = function kingProtected(g, kid, gone, dying) {
    const R = ONW.ROLE, blocked = [R.SERVANT, R.TANNER, R.LOVE_TANNER, R.BOUNTY_HUNTER];
    const subbed = (w) => !blocked.includes(g.currentRoles[w]) && ONW.servantPairs(g).some(([s, m]) => m === w && s !== w && !dying.has(s) && !gone.has(s) && !ONW.isLover(g, s));
    const others = ONW.vote.wolfJudgeIds(g).filter((w) => w !== kid && !gone.has(w));
    if (others.some((w) => !dying.has(w) || subbed(w))) return true;                       // 同時に死なない人狼判定が生き残る
    // 生き残る人がいないとき: 人狼王どうしが同時に追放・道連れにされるだけなら、互いを守り合って死なない。人狼王以外の人狼判定も同時に死ぬなら、全員死ぬ
    const kingsDying = others.filter((w) => active(g, w));
    return kingsDying.length > 0 && others.every((w) => active(g, w));
  };

  /** 席 k のカードの画面上の位置(中心)。なければ null */
  function center(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /** ガードの衝撃: 席 k のカードの上に、広がる輪を出す（タフガイの「ガキン!」と同じ輪。文字は出さない） */
  function guardBurst(R, k) {
    const c = center(R, k);
    if (!c) return;
    const el = document.createElement("div");
    el.className = "tg-burst";
    el.style.left = c.x + "px"; el.style.top = c.y + "px";
    el.innerHTML = `<i class="tg-ring"></i><i class="tg-ring tg-ring2"></i>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }

  /**
   * CPU: 待機時間(昼のうちに新しく分かったときも)に、公開された人狼王を「人狼王」として知る。
   * 村人側のCPUは「他に人狼がいるかもしれない」ので、人狼王に票を入れるかどうかを半々で賭ける(kingBet)。
   * 賭けに乗らないCPUは人狼王を避け、乗るCPUは人狼として狙う(守られたら追放なし)。cpu.js の scoreVote が kingBet を見る
   */
  function cpuLearn(g, kingIds) {
    const k = ONW.cpu && ONW.cpu.kit;
    if (!k) return;
    kingIds.forEach((kid) => g.players.forEach((q) => {
      if (!q.isCpu || q.id === kid) return;
      const i = k.infoOf(g, q.id);
      i.known[kid] = "wolf_king";
      if (i.kingBet === undefined) i.kingBet = Math.random() < 0.5;
    }));
  }

  ONW.defineRole("wolf_king", {
    // CPUの発言: 待機時間に全員へ公開済みなので、本当に人狼王COする(嘘をついても意味がない)
    cpuFirst: (k, g, p) => [{ p, text: `${k.rn("wolf_king")}CO`, co: "wolf_king", claim: null, gap: 3500 }],
    /** 待機時間: CPUは公開された人狼王を知る */
    settlePost: { order: 30, run(c) { cpuLearn(c.g, holders(c.g)); } },
    // 朝の待機時間(stage.js が g.settleKings を受け取って呼ぶ): 人狼王のカードが全員の画面で同時に表になる（「👑人狼王」の札つき。昼になったら札を外して伏せる）
    stageSettle: {
      field: "settleKings", shown: "settleKingShown",
      run: { order: 25, run(ids, SK) { SK.later(() => { ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.show(k, "wolf_king"); SK.badge[k] = "👑人狼王"; SK.kingKeys.push(k); SK.paint(SK.G()); }, i * 380)); }, 500); } },
      end: { order: 15, run(SK) { if (SK.kingKeys.length) { SK.kingKeys.forEach((k) => { delete SK.badge[k]; }); SK.kingKeys.length = 0; SK.paint(SK.G()); } } },
    },
    // 昼に新しく人狼王になった（酔いが覚めた・役職が動いた）人: 全員の画面でカードがめくれ、しばらくして裏に戻る
    stageFlash: {
      field: "kingFlash",
      run(ids, SK) {
        ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = "wolf_king"; SK.badge[k] = "👑人狼王"; SK.kingFlashKeys.push(k); SK.paint(SK.G()); }, 200 + i * 380));
        SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; delete SK.up[k]; delete SK.badge[k]; SK.pull(SK.kingFlashKeys, k); }); SK.paint(SK.G()); }, 200 + ids.length * 380 + 3000);
      },
    },
    /**
     * 追放の決定(vote.js の resolveElimination が呼ぶ。タフガイ(order 10)のあと)。ctx.eliminated(配列)をその場で書き換える。
     * 追放される人のうち、効果が働いている人狼王で、自分以外に人狼判定の人がいる人は、追放されない(本家 applyToughGuyAndWolfKingToExecuted と同じ考え方)。
     *   ・人狼判定 = 本物の人狼系 + 昇格した狂人(ONW.vote.wolfJudgeIds)。人狼王が複数いるときは互いを他の人狼として数える（同時に追放されても守り合う）
     *   ・他に人狼判定がいない / 昼中に先に全員死亡している / 他の人狼判定が全員同時に追放される(豆腐のメンタル崩壊も同時)ときは保護されず、そのまま追放される
     * 結果: game.kingGuards = [{ id: 人狼王, votes: 得票数 }]（resolveElimination の先頭で空に戻る）
     */
    elimination: { order: 20, run(g, ctx) {
      const kings = ctx.eliminated.filter((id) => active(g, id));
      if (!kings.length) return;
      ONW.vote.updatePromotion(g);   // 昇格した狂人も人狼判定に入れる(通常は勝敗判定の入口で行う処理。ここでも同じ結果になる)
      // 同時に死ぬ人 = 追放される人 + 1票以上入った豆腐の人狼（メンタル崩壊。麻婆の人狼がいる間は崩壊しない）。昼中に死んだ人は「先に死亡」
      const gone = new Set(g.deadIds || []);
      const dying = new Set(ctx.eliminated);
      ONW.vote.mentalIds(g, ctx.counts, ctx.eliminated, gone).forEach((id) => dying.add(id));
      const guarded = kings.filter((id) => ONW.kingProtected(g, id, gone, dying));
      if (!guarded.length) return;
      g.kingGuards = g.kingGuards || [];
      ctx.eliminated = ctx.eliminated.filter((id) => !guarded.includes(id));
      guarded.forEach((id) => g.kingGuards.push({ id, votes: ctx.counts[id] || 0 }));
    } },
    // 結果発表の演出(stage.js の startResult / skipResult が引く)
    //   intro: 人狼王のカードがめくれそうになる(途中まで回って揺れる) → 他の人狼に守られてガード(光の輪)。カードは裏のまま・追放されない。複数いれば1人ずつ順に
    //   skip : スキップ時の最終形(「ガード!」の札) / clear: 光の輪を片付ける
    stageResult: {
      intro: { order: 7, run(R) {
        const { res, P, later, setCap, esc, paint, G, badge } = R;   // alm / gx はスキップで作り直されるので、そのつど R.alm / R.gx を読む
        const gs = (res.kings || []).filter((x) => x.kind !== "tomo");   // 道連れのガードは、道連れした人がめくれたあと(flipped)に出す
        R.guardN = gs.length;
        gs.forEach((x) => {
          const kk = P(x.id);
          later(() => { setCap(`<div class="res-cap__t t-wolf">人狼王</div><div>${esc(x.name)} が追放されそうになりました…</div>`); R.alm[kk] = true; paint(G()); }, R.t);
          later(() => {
            delete R.alm[kk];
            R.gx[kk] = "kingguard"; badge[kk] = "ガード!"; guardBurst(R, kk);
            setCap(`<div class="res-cap__t t-wolf">人狼王のガード</div><div>他に人狼判定の人がいるため、${esc(x.name)} は追放されませんでした</div>`);
            paint(G());
          }, R.t + 1900);
          later(() => { delete R.gx[kk]; paint(G()); }, R.t + 1900 + 1500);
          R.t += 4300;
        });
        if (gs.length && !R.exec.length) R.t -= 600;   // 通常の追放がなければ、すぐ次へ
      } },
      // 道連れ(わら人形・猫又・黒猫・ネコカボチャ)を受けそうになった人狼王: 道連れした人がめくれたあとに、カードがめくれそうになってガードされる
      flipped: { order: 21, run(R, hs, at) {
        const { res, P, later, setCap, esc, paint, G, up, gx, badge } = R;
        let extra = 0;
        (res.kings || []).filter((x) => x.kind === "tomo" && hs.some((h) => h.id === x.by)).forEach((x, i) => {
          const kk = P(x.id), t = at + 1500 + i * 3000;
          later(() => { setCap(`<div class="res-cap__t t-wolf">人狼王</div><div>${esc(x.byName)} の道連れで ${esc(x.name)} が死にそうになりました…</div>`); R.alm[kk] = true; paint(G()); }, t);
          later(() => {
            delete R.alm[kk];
            R.gx[kk] = "kingguard"; badge[kk] = "ガード!"; guardBurst(R, kk);
            setCap(`<div class="res-cap__t t-wolf">人狼王のガード</div><div>他に人狼判定の人がいるため、${esc(x.name)} は道連れになりませんでした</div>`);
            paint(G());
          }, t + 1500);
          later(() => { delete R.gx[kk]; paint(G()); }, t + 1500 + 1300);
          extra += 3000;
        });
        return extra;
      } },
      skip(R) { (R.res.kings || []).forEach((x) => { R.badge[`p:${x.id}`] = "ガード!"; }); },
      clear(R) { document.querySelectorAll(".tg-burst").forEach((e) => e.remove()); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "kingguard") delete R.gx[k]; }); },
    },
    info: { deck: 48, name: "人狼王", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.4,
      desc: "人狼陣営。他の人狼を確認できます。最終盤面で人狼王を持っている人のカードは、朝のあとの待機時間に全員の画面で表になり、誰が人狼王か公開されます。占い・判定・勝利条件は常に人狼として扱われます。他に人狼系がいないときは、設定に関係なく狂人系の1人が昇格して人狼判定になります。追放・とばっちり・道連れでは、他に人狼判定の人が生き残るときだけ追放されず（死なず）、カードがめくれそうになってガードされます（他に人狼判定がいない・先に全員死亡している・他の人狼判定が全員同時に死ぬときは死にます。人狼王どうしだけが同時に追放・道連れにされるときは互いを守り合って死にませんが、人狼王以外の人狼判定も同時に死ぬときは全員死にます）。心中・無理心中では無条件で死にます。" },
    groups: { wolf: 8, "transform:dark_avatar": 8 },
    nightMsg: K.nightMsg, got: K.got, soberLines: K.soberLines, soberPeek: K.soberPeek,
    settleMsg: { order: 55, run(c) {
      const kings = holders(c.g);
      return { kings, kingNames: nameList(c.g, kings) };
    } },
    /** 昼のうちに役職が動いて、新しく人狼王を持った人（酔いが覚めている人）がいたら、その瞬間に全員の画面でカードが表になって裏に戻る。before: 動く前の g.currentRoles */
    dayCheck(c, before) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      const ids = holders(g).filter((id) => before[id] !== ONW.ROLE.WOLF_KING);
      if (!ids.length) return;
      const m = { t: "kingup", ids, names: nameList(g, holders(g)) };
      cpuLearn(g, ids);
      c.sendAll(m); c.sendSpec(m);
    },
    /** 酔いが覚めた瞬間に全員へ公開（全員の画面でカードがめくれて裏に戻る） */
    soberReveal: { order: 15, run(c, ids) {
      const g = c.g;
      const nk = ids.filter((id) => g.currentRoles[id] === ONW.ROLE.WOLF_KING);
      if (nk.length) cpuLearn(g, nk);
      if (nk.length) { const m = { t: "kingup", ids: nk, names: nameList(g, holders(g)) }; c.sendAll(m); c.sendSpec(m); }
    } },
  });
})(window.ONW);
