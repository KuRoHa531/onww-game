/**
 * 背徳者（マイクラ版 FANATIC を参考）: 第三陣営。ご主人は妖狐。
 *   ・夜に妖狐の気配（妖狐のカードに🦊の印）が見える。狂信者の🐺と同じ作り。
 *   ・待機時間の時点で、最終盤面に妖狐も狐憑きもいない（墓地にいる・上書きで消えた）と、カードが裏返って「狂人」になる（狐憑きがいれば妖狐がいなくても狂人にならない）。
 *   ・妖狐が呪殺・追放・昼中死亡などで死ぬと、あとを追って死ぬ（カードが「後追い」にめくれる）。
 *   ・妖狐が生き残って勝利を乗っ取ったとき、いっしょに勝つ。
 *   ・最終盤面に妖狐がおらず狐憑きだけがいるときは、狂人にならず、村人陣営が勝利したら追加で勝利する（妖狐と狐憑きの両方 / 妖狐だけのときは従来どおり妖狐陣営）。
 * ※ wiki の key は FANATIC（マイクラ版の役職ID fanatic）。Web版の「狂信者」は cultist（別の役職）。
 * 実装の進み具合は _wip/背徳者_依頼文.txt を参照。
 *  1of5: 登録・夜の🦊・墓荒らし/ドッペルで手にしたとき・酔い覚めの情報・CPUの基本・ルールコード ONW39・闇鍋シナジー【済】
 *  2of5: 待機時間の狂人化（カードが裏返って「狂人」）・役職入れ替えの判定（最終盤面）・酔っ払いの背徳者（酔い覚めてから本人目線で狂人）【済】
 *  3of5: 妖狐が呪殺されたときの後追い（待機時間にめくれて「後追い」）・恋人/キューピッドの連鎖（心中・後追い）【済】
 *  4of5: 投票時間に妖狐が死んだときの後追い・従者のご主人の連鎖・王国滅亡【済】
 *  5of5: 酔っ払いの背徳者の後追い・勝敗（妖狐の乗っ取りにいっしょに勝つ）・CPU・ガイド・総合テスト【済】
 */
(function (ONW) {
  const FOX = () => ONW.ROLE.FOX, FAN = () => ONW.ROLE.FANATIC;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 配布直後（初期役職）に妖狐か狐憑きだった席。夜に背徳者が🦊で見るのはこれ（墓荒らし・怪盗などで動く前）。
   *  背徳者から見て、狐憑きも妖狐と区別がつかない（占い結果と同じく「妖狐」に見える）。妖狐の乗っ取りでは本物の妖狐だけを数える（狂人化の判定は、最終盤面に狐憑きがいれば妖狐がいなくても狂人にならない） */
  const initialFoxIds = (g, self) => g.players.filter((q) => q.id !== self && (g.initialRoles[q.id] === FOX() || g.initialRoles[q.id] === ONW.ROLE.FOX_MARKED)).map((q) => q.id);
  /** 最終盤面（いま）に妖狐を持っている席。墓地にいる妖狐・上書きで消えた妖狐は含まれない */
  const finalFoxIds = (g) => g.players.filter((q) => g.currentRoles[q.id] === FOX()).map((q) => q.id);

  /** 背徳者の狂人化の判定（マイクラ版 processFoxAndFanaticAtDayStart の「妖狐がいなければ狂人」）。
   *  最終盤面（g.currentRoles）に妖狐も狐憑きも1枚もない（墓地にいる・上書きで消えた）のに、席の役職が背徳者のままなら、その席を狂人にする。
   *  最終盤面で見るので、墓荒らし・ドッペル・怪盗・シャッフラーなどどの経由で入れ替わっても同じ結果になる。
   *  妖狐が「死んでいる（呪殺・追放など）」のは変化ではなく後追い（3of5）なので、カードが盤面にあれば変化しない。
   *  変化したら g.fanaticConv[席ID] = true を記録して true を返す（二重には変化しない） */
  function judge(g, id) {
    if (!g || g.currentRoles[id] !== FAN() || (g.fanaticConv || {})[id]) return false;
    if (finalFoxIds(g).length || g.players.some((q) => g.currentRoles[q.id] === ONW.ROLE.FOX_MARKED)) return false;   // 妖狐がいなくても、最終盤面に狐憑きがいれば狂人にならない（狐憑きも妖狐に見えるため）
    if (ONW.keymaster && ONW.keymaster.locked(g, id)) { (g.fanaticLocked = g.fanaticLocked || {})[id] = true; return false; }   // 鍵師のロック: ご主人のいない背徳者がロックされていると、狂人に変化できない（背徳者のまま。投票権と勝利条件を失う）
    g.fanaticConv = g.fanaticConv || {};
    g.fanaticConv[id] = true;
    g.currentRoles[id] = ONW.ROLE.MADMAN;
    return true;
  }
  /** ロックされて狂人になれなかった背徳者（投票権と勝利条件を失っている席）。いまも背徳者を持っている席だけ */
  const lostBy = (g, id) => !!((g && g.fanaticLocked) || {})[id] && g.currentRoles[id] === FAN();
  const LOCK_TEXT = "ご主人のいない背徳者は、役職がロックされていたため狂人に変化できず、勝利条件と投票権を失いました。";
  /** 妖狐が死んだとき後を追う背徳者の席（最終盤面。酔いが覚めていない背徳者は、覚めたときに扱う 5of5） */
  const followersOf = (g) => g.players.filter((q) => g.currentRoles[q.id] === FAN() && !ONW.hiddenDrunk(g, q.id)).map((q) => q.id);
  const CONV_TEXT = "妖狐がいなかったため、背徳者から狂人になりました。";
  /** 妖狐の乗っ取り勝利のとき、いっしょに勝つ背徳者（最終盤面の背徳者のうち、死んでいない人。後追いで死んだ背徳者・狂人になった元背徳者は含まない）。dead: ONW.vote.deadSet(g) */
  const partners = (g, dead) => g.players.filter((q) => g.currentRoles[q.id] === FAN() && !lostBy(g, q.id) && !(dead || ONW.vote.deadSet(g)).has(q.id)).map((q) => q.id);

  /** 狐憑きだけがご主人の背徳者（最終盤面に妖狐がおらず、狐憑きがいる）。このときの背徳者は妖狐陣営ではなく、村人陣営が勝利したら追加で勝利する。
   *  妖狐がいる（狐憑きとどちらもいる・妖狐だけ）ときは従来どおり（妖狐の乗っ取りにいっしょに勝つ）。最終盤面で見る（judge の狂人化の判定と同じ基準） */
  const foxMarkedOnly = (g) => !finalFoxIds(g).length && g.players.some((q) => g.currentRoles[q.id] === ONW.ROLE.FOX_MARKED);
  /** 村人陣営の勝利に追加で勝つ背徳者（foxMarkedOnly のときの、最終盤面の背徳者のうち、死んでいない人・ロックで勝利条件を失っていない人） */
  const villageWinners = (g, dead) => foxMarkedOnly(g) ? partners(g, dead) : [];

  /** 昼のうちの後追い（5of5）: 妖狐がすでに昼中に死んでいるのに、いま生きている背徳者（酔いが覚めたばかりの背徳者・昼の入れ替わりで背徳者になった人）が、
   *  本人のカードが背徳者とめくれ終わってから（delay ms）全員の画面で「後追い」にめくれ、死亡する（killPlayer が心中・従者・キューピッドの連鎖まで面倒を見る）。何度呼んでも二重にならない。
   *  妖狐の呪殺がまだ保留中(g.foxPending)なら、その呪殺(curseNow → killPlayer)の連鎖で死ぬのでここでは扱わない */
  function lateFollow(c, delay) {
    const g = c.g;
    if (g.phase !== ONW.PHASE.ONLINE_DAY) return;
    const dead = new Set(g.deadIds || []), by = finalFoxIds(g).find((id) => dead.has(id));
    if (!by) return;
    g.fanFollowPending = g.fanFollowPending || [];
    const ids = followersOf(g).filter((id) => !dead.has(id) && !g.fanFollowPending.includes(id));
    if (!ids.length) return;
    g.fanFollowPending.push(...ids);
    const chain = [...ids.map((id) => ({ id, label: "後追い", depth: 0 })), ...ONW.fox.chainView(g, ids, "fanatic")];
    const m = { t: "fanfollow", chain, delay: delay || 0 };
    c.sendAll(m); c.sendSpec(m);
    setTimeout(() => {   // 演出（めくれ → 灰色）が終わってから死亡にする
      const cur = ONW.game;
      if (!cur || cur !== g || ![ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE].includes(g.phase)) return;
      ids.forEach((id) => ONW.net.killPlayer(id, nm(g, by), "fanatic"));
    }, (delay || 0) + 3200);
  }
  ONW.fanatic = { initialFoxIds, finalFoxIds, followersOf, judge, nm, CONV_TEXT, LOCK_TEXT, lostBy, partners, foxMarkedOnly, villageWinners, lateFollow };

  const cpuLearn = (g, id, k) => initialFoxIds(g, id).forEach((fid) => { k.infoOf(g, id).known[fid] = "fox"; });   // CPU: 妖狐（ご主人）を知っている

  const NONE_TEXT = "妖狐の気配はありません。待機時間に妖狐（狐憑きを含む）がいなければ狂人になります。";

  ONW.defineRole("fanatic", {
    // 夜の演出(stage.js が g.foxReveal を受け取って 700ms 後に呼ぶ): 夜の始まりに妖狐のカードが順に表になり、🦊が出る → 夜時間の間ずっと開いたまま（狂信者の🐺と同じ）
    stageNight: {
      order: 31, field: "foxReveal",
      run(ids, SK) {
        const { later, paint, G } = SK;
        ids.forEach((id, i) => later(() => {
          const k = `p:${id}`;
          if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
          SK.up[k] = SK.FOXSEE_MARK; SK.glow[k] = true;
          if (SK.loveMate && SK.loveMate.id === id) SK.lov[k] = true;   // 妖狐が恋人の相方でもあるときは、右上に丸いハート
          if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k);
          paint(G());
        }, i * 380));
      },
    },
    // 昼に酔いが覚めた背徳者: 妖狐のカードに🦊が出て、しばらくして裏に戻る（stage.js の soberPeek の並び: 人狼🐺 → 共有者 → …）
    stageSober: { list: { order: 5, run(sp, list, SK) { (sp.foxes || []).forEach((id) => list.push([`p:${id}`, SK.FOXSEE_MARK, true])); } } },
    // CPU: 妖狐を知っている（投票では、知った妖狐に入れない: cpu.js AVOID_RESULT）。自分の役職は名乗らず、他の村役職を騙る
    cpuInit: cpuLearn, cpuLearn,
    cpuClaim(k, g, p, r, i, c) { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; },
    info: { deck: 61, name: "背徳者", team: ONW.TEAM.THIRD, wakeOrder: 21, sort: 36.9,
      desc: "第三陣営。夜に妖狐の気配（妖狐のカードに🦊）が見えます。待機時間の時点で妖狐がいない（墓地にいる・役職が上書きで消えた）と、カードが裏返って狂人になります。妖狐が死ぬとあとを追って死にます。妖狐が生き残って勝利を乗っ取ったとき、いっしょに勝利します。ご主人が狐憑きだけ（妖狐がいない）のときは、狂人にならず、妖狐陣営ではなく、村人陣営が勝利したら追加で勝利します。" },
    // ---- 2of5: 待機時間の狂人化 ----
    /** 待機時間(朝のあと): 酔っていない背徳者は、最終盤面に妖狐がいなければ狂人になる。ほかの待機時間の判定より先に、最終盤面を確定させる。CPUはここで狂人としての情報を知る */
    settlePre: { order: 5, run(c) {
      const g = c.g;
      g.fanaticConv = {}; g.fanaticLocked = {};
      g.players.forEach((p) => {
        if (ONW.hiddenDrunk(g, p.id) || !judge(g, p.id) || !p.isCpu) return;
        const i = ONW.cpu.kit.infoOf(g, p.id);
        i.known[p.id] = ONW.shownRole(g.currentRoles[p.id]);
        ONW.cpu.learnInfo(g, p.id, g.currentRoles[p.id]);
      });
    } },
    /** 本人の画面へ: 自分のカードが裏返って「狂人」（後覚者の最終役職と同じ insom の表示）と、文章。再入室でも同じものを送る */
    settleMsg: { order: 12, run(c, p) {
      const g = c.g;
      if (!p.isCpu && lostBy(g, p.id) && !ONW.hiddenDrunk(g, p.id)) return { logs: [LOCK_TEXT], keylock: [p.id] };   // ロックで狂人になれなかった本人へ（他の人には知らせない）
      if (p.isCpu || !(g.fanaticConv || {})[p.id] || ONW.hiddenDrunk(g, p.id) || g.currentRoles[p.id] !== ONW.ROLE.MADMAN) return {};
      return { logs: [CONV_TEXT], insom: ONW.shownRole(g.currentRoles[p.id]) };
    } },
    /** 待機時間の演出（鍵師）: ロックで狂人になれなかった背徳者の本人の画面で、自分のカードが🔒に弾かれる（他の人には出さない） */
    stageSettle: { field: "settleKeyLock", shown: "settleKeyLockShown", run: { order: 46, run(ids, SK) {
      SK.later(() => ids.forEach((id) => {
        const k = `p:${id}`; SK.show(k, SK.KEYLOCK_MARK, true);
        SK.later(() => { const el = SK.$t(), card = el && el.querySelector(`[data-k="${k}"] .tb-card`); if (card && card.animate) card.animate([{ transform: "translateX(0)" }, { transform: "translateX(-9px) rotate(-4deg)" }, { transform: "translateX(9px) rotate(4deg)" }, { transform: "translateX(-6px) rotate(-2deg)" }, { transform: "translateX(0)" }], { duration: 520, easing: "ease-in-out" }); }, 650);
      }), 900);
    } } },
    /** 酔いが覚める直前: 覚める背徳者の判定（その時点の盤面。覚めた本人には soberExtra で「狂人になった」と知らせ、役職は最終役職の狂人で届く） */
    soberJudge: { order: 5, run(c, ids) { ids.forEach((id) => judge(c.g, id)); } },
    soberExtra(c, id) { return (c.g.fanaticConv || {})[id] ? { lines: [CONV_TEXT] } : lostBy(c.g, id) ? { lines: [LOCK_TEXT] } : {}; },
    // ---- 5of5: 昼のうちの後追い ----
    /** 酔いが覚めた背徳者: 妖狐がもう死んでいれば、本人のカードが背徳者とめくれ終わってから（約4秒後）全員の画面で「後追い」 */
    daySober(c) { lateFollow(c, 4000); },
    /** 昼に役職が動いて背徳者になった人（妖狐がすでに死んでいるとき）もすぐ後追い */
    dayCheck(c) { lateFollow(c, 300); },
    // 昼の後追い演出(fanfollow): 「後追い」の面に裏返って灰色になる。連鎖で死ぬ人（心中・キューピッドの後追い）は同じ深さごとに続けてめくれる
    stageFlash: {
      field: "dayFollow", when: "late",
      run(chain, SK) { ONW.fox.playChain(chain, (SK.G().dayFollowDelay || 0) + 700, SK); },
    },
    groups: { "transform:silver_shadow": 21 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    nightMsg(c, p) {
      const g = c.g, ids = initialFoxIds(g, p.id);
      return { text: ids.length ? `妖狐の気配: ${ids.map((id) => nm(g, id)).join("、")}` : NONE_TEXT, foxMates: ids.length ? ids : null };   // 夜の始まりに、妖狐のカードが表になって🦊が出る
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g, ids = initialFoxIds(g, p.id);
      c.hold(p.id, ids.length ? `妖狐の気配: ${t.names(ids)}` : NONE_TEXT);
      t.both(t.eff());
      t.setPeek(ids.map((id) => ({ k: `p:${id}`, role: "__foxsee" })), 380);
    },
    soberLines(c, id) {
      const ids = initialFoxIds(c.g, id);
      return [ids.length ? `妖狐の気配: ${ids.map((x) => nm(c.g, x)).join("、")}` : "妖狐の気配はありません。"];
    },
    soberPeek(c, id) {
      const ids = initialFoxIds(c.g, id);
      return ids.length ? { foxes: ids } : {};
    },
  });
})(window.ONW);
