/**
 * 銀狼（マイクラ版 SILVER_WOLF を参考にした人狼系の役職）。docs/silver-wolf.md
 *   ・試合開始時に、ランダムなプレイヤー1人（自分・愉悦開拓者・ホタルを除く）をハッキングする。
 *   ・ハッキングされた人は、配役直後の墓地にあった役職（光の使徒・闇の化身・銀色の影・ドーターを除く）を自分の役職だと思い込む（思い込みの動作は 2of4 以降）。
 *   ・夜の情報には「〇〇をハッキングしました。」が出る。演出は、ハッキング対象のカードに⚠️マークが出る。
 *     対象が相方（見えている仲間の人狼）のときは、🐺マークが出たあと、いったん裏面に戻ってから⚠️マークが出る。
 *   ・酔っ払いの銀狼は、酔い覚めのときに同じ情報と演出が出る。
 *   ・ハッキングは「対象を選ぶ能力」として観測（ONW.observeNote）に残る。
 */
(function (ONW) {
  const K = ONW.wolfKit;
  const ID = "silver_wolf";
  /** 自分自身をハッキングできるか（マイクラ版は自分も候補。Web版は自分が偽の役職になって銀狼と分からなくなるので外す。docs/silver-wolf.md） */
  const ALLOW_SELF = false;
  /** ハッキングされない役職（Web版にまだ無い役職。入ったら自動で対象外）。候補の除外は初期役職だけでなく、その時点の役職でも見る（マイクラ版 assignSilverWolfHackFromSource が initialRoles と finalRoles の両方でヴァニティ・ホタルを除くのと同じ） */
  const NO_HACK = ["vanity", "hotaru"];
  /** 思い込み先にならない役職 */
  const NO_FAKE = ["light_apostle", "dark_avatar", "silver_shadow", "daughter"];

  const nameOf = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";
  const roleName = (r) => ((ONW.ROLE_INFO || {})[r] || {}).name || "?";
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /** その人が（配役直後の役職で）ハッキングを行う銀狼か。模倣の人狼が銀狼を模倣した場合も含む */
  const isHacker = (g, id) => {
    const r = (g.initialRoles || {})[id];
    return r === ID || (ONW.mimic && ONW.mimic.actRole && ONW.mimic.actRole(g, id, r) === ID);
  };

  const H = (ONW.hack = {
    ALLOW_SELF, NO_HACK, NO_FAKE,
    isHacker,
    /** 銀狼 id が（試合開始時に）ハッキングした相手。いなければ null */
    targetOf: (g, id) => (g.hackTarget || {})[id] || null,
    /** id をハッキングした銀狼。いなければ null */
    sourceOf: (g, id) => (g.hackSource || {})[id] || null,
    /** id が思い込んでいる役職（ハッキングされていなければ null） */
    roleOf: (g, id) => (g.hackRole || {})[id] || null,
    isHacked: (g, id) => !!(g.hackRole || {})[id],
    /** 配役直後に全銀狼のハッキングを決める（net.js の startGame から。模倣の割り当てのあとに呼ぶ） */
    assignAll(g) {
      g.hackRole = {}; g.hackSource = {}; g.hackTarget = {}; g.hackFailed = {}; g.hackFrom = {}; g.hackChain = {}; g.hackDayUsed = {}; g.hackPred = {}; g.hackIcarus = {}; g.hackCut = {}; g.hackCutRole = {}; g.hackDayLog = {}; g.hackCos = {}; g.hackSub = {}; g.hackDepth = {};
      (g.players || []).forEach((p) => { if (isHacker(g, p.id)) H.assign(g, p.id); });
    },
    /** 銀狼 wolfId のハッキングを1回だけ決める。戻り値は対象のID（決まらなければ null） */
    assign(g, wolfId) {
      if ((g.hackTarget || {})[wolfId]) return g.hackTarget[wolfId];
      const cands = (g.players || []).filter((q) => (ALLOW_SELF || q.id !== wolfId) && !NO_HACK.includes((g.initialRoles || {})[q.id]) && !NO_HACK.includes((g.currentRoles || {})[q.id]));   // 初期役職・その時点の役職のどちらがヴァニティ/ホタルでも対象外（マイクラ版の finalRoles 除外に相当。Web版の割り当ては配役直後の一度きりで、その時点では currentRoles = 初期役職）
      if (!cands.length) { g.hackFailed[wolfId] = true; return null; }
      let t = ONW.debug && ONW.debug.randTarget ? ONW.debug.randTarget(g, "hack", wolfId) : null;   // デバッグで対象を指定している場合
      if (!t || !cands.some((q) => q.id === t)) t = pick(cands).id;
      const c0 = g.center0 || g.center || [], tfc = g.centerTransformFrom || {};
      const idx = c0.map((r, i) => i).filter((i) => c0[i] && !NO_FAKE.includes(c0[i]));
      let fake = ONW.debug && ONW.debug.randHackFake ? ONW.debug.randHackFake(g, wolfId) : null;   // デバッグで思い込ませる役職を指定している場合
      let gi = null;   // 思い込み役職を引いた墓地の位置（光の使徒・闇の化身・銀色の影から変化した札なら、その「変化元」も本人のカードに出す）
      if (!fake || NO_FAKE.includes(fake)) { if (idx.length) { gi = pick(idx); fake = c0[gi]; } else fake = "villager"; }
      else { const m = idx.filter((i) => c0[i] === fake); if (m.length) gi = pick(m); }
      g.hackFrom = g.hackFrom || {};
      if (gi !== null && tfc[gi]) g.hackFrom[t] = tfc[gi]; else delete g.hackFrom[t];
      g.hackTarget[wolfId] = t;
      g.hackSource[t] = wolfId;
      g.hackRole[t] = fake;     // 同じ人を2人の銀狼がハッキングしたら、あとのほうが思い込みを上書きする（マイクラ版と同じ）
      if (ONW.observeNote) ONW.observeNote(g, wolfId, [t], null, ID);
      return t;
    },
    /** 夜の情報・酔い覚めの文章 */
    line: (g, wolfId) => { const t = H.targetOf(g, wolfId); return t ? nameOf(g, t) + " をハッキングしました。" : null; },
    /** 銀狼の演出用データ { id, mate（相方=🐺が見えている仲間か）, n（🐺が出る人数） } */
    reveal(g, wolfId, wolves) {
      const t = H.targetOf(g, wolfId); if (!t) return null;
      const w = wolves || [];
      return { id: t, mate: w.includes(t), n: w.length };
    },
    /** 結果画面用: [[銀狼のID, 対象のID, 思い込ませた役職]] */
    pairs: (g) => Object.keys(g.hackTarget || {}).map((a) => [a, g.hackTarget[a], (g.hackRole || {})[g.hackTarget[a]] || (g.hackCutRole || {})[g.hackTarget[a]] || null]),
  });

  /* ===== ハッキングされた人の動作（2of4）=====
   *  ・ハッキングされた人間は、自分の役職を「思い込み役職」だと思う: 配られたカード・夜の画面・夜の操作・夜の結果が思い込み役職のもの（net.js の uiRole / roleMsg / nightMsgBase）。
   *  ・思い込み役職の夜の操作には本当の効果はなく、朝に「それらしい偽の結果」が出る（resolveFake。結果の役職は盤面と墓地からランダム）。
   *  ・本当の役職の夜の能力は、裏で自動的に（CPUと同じ動きで）使われる。怪盗・いたずらっ子は使われない（マイクラ版と同じ）。結果は本人には届かない（cpu.js の hold）。
   *  ・思い込みの夜の情報（仲間の人狼・共有者の相方・大狼の墓地・銀狼のハッキング先）は、本当の情報が漏れないようランダムな偽物にする（H.view で1回だけ決めて保存）。
   *  ・思い込み役職が コスプレイヤー・模倣の人狼・開拓者 のときも、偽の操作画面・偽の演出が出る（コスプレ=山札から偽の3枚 / 模倣の人狼=偽の模倣先の役職 / 開拓者=偽の運命の役職。hackfix_11）。 */
  const UNSUP_UI = [];   // 以前は コスプレイヤー・模倣の人狼・開拓者 だけ操作画面を出さなかった。いまは3役職とも偽の画面・演出が出るので空（互換のために残す）
  const AUTO_SKIP = ["robber", "troublemaker"];
  const WOLFVIEW = ["werewolf", "big_wolf", "white_wolf", "tofu_wolf", "assassin", "wolf_king", "mapo_wolf", "cat_pumpkin", "observer_wolf", "mind_wolf", "mimic_wolf", "eraser_wolf", "mirage_wolf", "silver_wolf", "cultist", "merlin", "demon_duke", "yokai_tanuki"];
  const pool = (g) => [...Object.values(g.initialRoles || {}), ...(g.center0 || g.center || [])].filter((r) => r && !NO_FAKE.includes(r));
  const rnd = (g) => { const p = pool(g); return p.length ? pick(p) : "villager"; };
  const shuf = (a) => a.slice().sort(() => Math.random() - 0.5);
  const shownList = (d) => (d ? d.roles.map((r) => (ONW.shownRole ? ONW.shownRole(r) : r)) : []);   // 山札から偽でめくれた3枚（本物と同じ見せ方。偽占い師は占い師に見える）
  Object.assign(H, {
    UNSUP_UI, AUTO_SKIP,
    /** 人間で、酔っ払い（未覚醒）でなく、ハッキングされている → 偽の役職の画面・結果になる */
    isFakeUi: (g, id) => !!(g.hackRole || {})[id] && !((g.players || []).find((q) => q.id === id) || {}).isCpu && !(ONW.hiddenDrunk && ONW.hiddenDrunk(g, id)),
    /** 夜の操作画面に使う役職。ハッキングされていなければ real（本当の夜の役職）のまま */
    uiRole: (g, id, real) => (H.isFakeUi(g, id) ? H.actOf(g, id) : real),   // 模倣の人狼・開拓者は、偽の模倣先 / 偽の運命の役職が操作画面の役職になる
    /** 本当の役職の夜の能力を、裏で自動的に使うか（cpu.js の runNight が見る） */
    autoReal: (g, p) => H.isFakeUi(g, p.id) && !AUTO_SKIP.includes(ONW.mimic.actRole(g, p.id, g.initialRoles[p.id])),
    /** 本人に配るカードの役職（ハッキングされていなければ real） */
    /** 思い込み役職が、光の使徒・闇の化身・銀色の影から変化して出た札だったときの「変化元」（本人のカードに出す。なければ null） */
    fromOf: (g, id) => { const f = (g.hackFrom || {})[id]; return f ? ONW.roles.shownFrom(g, f, (g.hackRole || {})[id]) : null; },
    seenRole: (g, id, real) => (H.isFakeUi(g, id) ? g.hackRole[id] : real),
    /**
     * 全員向けの公開演出（スター公開・パンが焼けた・人狼王・女王など）を、viewer の画面に出す分に直す。
     * ハッキングされた人（人間）は「思い込んでいる役職」の目線で受け取る:
     *   ・本当にその役職でも、自分は思い込んでいる別の役職なので、自分のぶんは出ない（本当のスターなのに、スターの演出は来ない）
     *   ・思い込んでいる役職がその役職なら、addSelf のとき自分のぶんが出る（スターと思い込んでいれば、自分のカードがスターで表になる）
     * ids: 本当にその役職を持っている人のID / addSelf: 自分が偽のその役職なら自分を足すか（「いま新しくなった人」の一覧では false）
     */
    pubView(g, viewer, role, ids, addSelf) {
      if (!H.isFakeUi(g, viewer)) return ids;
      const out = ids.filter((id) => id !== viewer);
      if (addSelf && (g.hackRole[viewer] === role || H.actOf(g, viewer) === role) && !(ONW.seal && ONW.seal.is(g, viewer))) out.push(viewer);
      return (g.players || []).map((q) => q.id).filter((id) => out.includes(id));
    },
    /** 偽の夜の情報に使うランダムな見え方（1人1回だけ決める） */
    /** この人に見せる偽の情報（1人1回だけ決める）。人数は本物の配役どおり（誰かだけが偽物）: 見える人狼 = 本物の人狼として見える席の数 / 共有者の相方 = 配役の共有者の数-1 / 女王の姫君 = 配役の姫君の数 / 従者のご主人・処刑人のターゲット = 他の参加者から1人 */
    view(g, id) {
      g.hackView = g.hackView || {};
      if (g.hackView[id]) return g.hackView[id];
      const others = (g.players || []).filter((q) => q.id !== id).map((q) => q.id), many = (n) => shuf(others).slice(0, Math.max(0, Math.min(n, others.length)));
      const A = (q) => ONW.mimic.actRole(g, q, g.initialRoles[q]);
      const nW = ONW.wolfLookIds ? ONW.wolfLookIds(g, id).length : 0, nWA = ONW.wolfLookIds ? ONW.wolfLookIds(g, id, true).length : nW;   // 一匹狼も数えるのはマーリン・魔界公爵だけ
      const wolves = many(nW), wolvesAll = many(Math.max(nW, nWA)), masons = many((g.players || []).filter((q) => A(q.id) === "mason").length - 1);
      return (g.hackView[id] = {
        wolves, wolvesAll, masons, mason: masons[0] || null,
        princesses: many(others.filter((q) => A(q) === ONW.ROLE.PRINCESS).length),
        master: others.length ? pick(others) : null,
        target: others.length ? pick(others) : null,
        graves: (g.center0 || g.center || []).map(() => rnd(g)),
        silver: others.length ? pick(others) : null,
      });
    },
    /** 1つの役職ぶんの偽の夜の表示（仲間の人狼・共有者の相方・大狼の墓地・銀狼のハッキング先・コスプレの3枚）。説明文（note）だけは本物の定義から借りる */
    baseView(c, p, fake) {
      const g = c.g, d = ONW.roleDef(fake) || {};
      const m = { t: "night", text: "", text2: "", note: null, lines: null, godPeek: null, bigGraves: null, cultWolves: null, masonMates: null, princessMates: null, lawyerClient: null, master: null };
      let real = null; const sv = g.initialRoles[p.id];
      try { g.initialRoles[p.id] = fake; real = d.nightMsg ? H.guarded(g, () => d.nightMsg(c, p, fake)) : null; } catch (e) { real = null; } finally { g.initialRoles[p.id] = sv; }
      if (real && real.note) m.note = real.note;   // 説明文だけ借りる（仲間・墓地などの本当の情報は使わない）
      const V = H.view(g, p.id), nm = (id) => nameOf(g, id);
      if (WOLFVIEW.includes(fake)) {
        const pre = fake === "cultist" || fake === "demon_duke" || fake === "yokai_tanuki" ? "人狼の気配" : fake === "merlin" ? "人狼" : "仲間の人狼";
        const W = fake === "merlin" || fake === "demon_duke" || fake === "yokai_tanuki" ? V.wolvesAll : V.wolves;   // マーリン・魔界公爵・妖狸には一匹狼も見える（本物と同じ）
        m.text = W.length ? `${pre}: ${W.map(nm).join("、")}` : pre === "仲間の人狼" ? "仲間の人狼はいません。" : "見える人狼はいません。";
        if (W.length) m.cultWolves = W.slice();
        if (fake === "big_wolf") { m.bigGraves = V.graves.slice(); m.text2 = `墓地: ${V.graves.map((cr, i) => `${i + 1}枚目「${c.rn(cr)}」`).join(" ")}`; }
        if (fake === ID && V.silver) { m.text2 = nm(V.silver) + " をハッキングしました。"; m.hack = { id: V.silver, mate: V.wolves.includes(V.silver), n: V.wolves.length }; }
      } else if (fake === "mason") { m.text = V.masons.length ? `もう一人の共有者: ${V.masons.map(nm).join("、")}` : "他の共有者はいません。"; m.masonMates = V.masons.length ? V.masons.slice() : null; }
      else if (fake === "queen") { m.text = V.princesses.length ? `姫君: ${V.princesses.map(nm).join("、")}` : ""; m.princessMates = V.princesses.length ? V.princesses.slice() : null; }   // 姫君がいないときは何も出さない（本物と同じ）
      else if (fake === "servant") { m.text = V.master ? `あなたのご主人は ${nm(V.master)} です。` : "ご主人が見つかりませんでした。"; m.master = V.master ? { id: V.master } : null; }   // ご主人のカードが「👑ご主人」でめくれる
      else if (fake === "executioner") { m.text = V.target ? `あなたのターゲットは ${nm(V.target)} です。` : "ターゲットが見つかりませんでした。"; m.master = V.target ? { id: V.target, mark: "__target" } : null; }   // ターゲットのカードに🎯
      else if (fake === "cosplayer") { m.cosplay = { cards: shownList(H.cosDraw(g, p.id)) }; }   // 山札から偽の3枚がめくれる（選ぶと朝にコスプレの演出が出る）
      return m;
    },
    /** 偽の夜の表示（夜の始まり）。本当の情報は出さない。模倣の人狼・開拓者は、偽の模倣先 / 偽の運命の役職の表示を合流させる（本物の mimic_wolf.js / trailblazer.js と同じ形） */
    nightView(c, p) {
      const g = c.g, fake = g.hackRole[p.id], ui = H.uiRole(g, p.id, null), m = H.baseView(c, p, fake);
      if (H.isBorrowRole(fake)) {
        const sub = H.subOf(g, p.id), T = ONW.trailblazer;
        m.text2 = fake === "trailblazer" ? T.text(T.fateOfRole(sub)) : ONW.mimic.text(c.rn, sub);
        let sm = H.baseView(c, p, sub);
        if (WOLFVIEW.includes(sub)) sm = sub === "big_wolf" ? { text2: sm.text2, note: sm.note, bigGraves: sm.bigGraves } : sub === ID ? { text2: sm.text2, hack: sm.hack } : sub === "observer_wolf" ? { note: sm.note } : {};   // 人狼系共通の文（仲間の人狼）は二重にしない（本物と同じ）
        const extra = [sm.text, sm.text2, ...(sm.lines || [])].filter(Boolean);
        if (extra.length) m.lines = [...(m.lines || []), ...extra];
        const nt = [].concat(m.note || [], sm.note || []).filter(Boolean); if (nt.length) m.note = nt;
        Object.keys(sm).forEach((k) => { if (!["t", "text", "text2", "note", "lines", "act", "actRole"].includes(k) && sm[k] != null && m[k] == null) m[k] = sm[k]; });
      }
      m.act = !!ui && ONW.roleIsActive(ui);
      m.actRole = m.act ? ui : null;
      return m;
    },
    /** 偽の夜の結果の文（Web版の各役職の結果文と同じ言い回し）と、朝のカード演出。戻り値 { text, rev } */
    fakeResult(g, fake, sel, id) {
      const P = sel.players || [], G_ = sel.graves || [], a = P[0], b = P[1], A = a ? nameOf(g, a) : "誰か", B = b ? nameOf(g, b) : "誰か";
      const rn = (r) => roleName(r), R = () => rn(rnd(g)), t = (x) => ({ text: x, rev: null });
      const sh = (r) => (ONW.shownRole ? ONW.shownRole(r) : r);   // 朝のカード演出（rev）に渡す役職の見せ方（本物の演出と同じ）。rev の形は各役職の本物と同じにして、思い込んでいる人にも同じ演出を出す
      if (["seer", "mad_seer", "fake_seer"].includes(fake)) {
        if (a) { const r = rnd(g); return { text: `${A} の役職は「${rn(r)}」でした。`, rev: { kind: "peek", items: [{ k: "p:" + a, role: r }] } }; }
        if (G_.length) { const items = G_.slice().sort((x, y) => x - y).map((i) => ({ k: "g:" + i, role: rnd(g) })); return { text: items.map((it) => `墓地${+it.k.slice(2) + 1}枚目は「${rn(it.role)}」でした。`).join("\n"), rev: { kind: "peek", items } }; }
        return t(null);
      }
      if (fake === "finger_reader") return t(`${A} を占って ${R()} でした。`);
      if (fake === "robber") { const r = rnd(g); return { text: `${A} と役職を交換しました。あなたの新しい役職は「${rn(r)}」です。`, rev: a ? { kind: "swap", target: a, role: sh(r) } : null }; }
      if (fake === "relic_robber") { const r = rnd(g); return { text: `墓地${(G_[0] || 0) + 1}枚目と役職を交換しました。あなたの新しい役職は「${rn(r)}」です。`, rev: { kind: "relic", target: G_[0] || 0, role: sh(r) }, newRole: r }; }   // newRole: 偽の新しい役職（朝の連鎖の偽の画面に使う）。rev: 墓地と入れ替わる演出
      if (fake === "doppelganger") { const r = rnd(g); return { text: `${A} をコピーしました。あなたの新しい役職は「${rn(r)}」です。`, rev: a ? { kind: "doppel", target: a, seen: sh(rnd(g)), role: sh(r) } : null, newRole: r }; }
      if (fake === "troublemaker") return { text: `${A} と ${B} の役職を入れ替えました。`, rev: a && b ? { kind: "tm", a, b } : null };
      if (fake === "gremlin") { const r = rnd(g); return { text: `${A} の役職「${rn(r)}」を ${B} にコピーしました。`, rev: a && b ? { kind: "gremlin", from: a, to: b, role: sh(r), copied: sh(r) } : null }; }
      if (fake === "shuffler") { const r = rnd(g); return { text: `${A} をランダムな役職「${rn(r)}」に変化させました。`, rev: a ? { kind: "shuffler", target: a, role: sh(r) } : null }; }
      if (fake === "freeter") return t(`${A} の初期役職は「${R()}」でした。${A} に就職しました。`);
      if (fake === "cupid") return t(`${A} と ${B} を恋人にしました。`);
      if (fake === "evil_woman") return t(`本命は ${A}、キープは ${B} です。`);
      if (fake === "avenger") return t(`${A} を復讐対象にしました。`);
      if (fake === "heartbreaker") return t(`${A} を破局対象に選びました。`);
      if (fake === "love_tanner") return t(`${A} に一目惚れしました。`);
      if (fake === "prankster") return t(`${A} を対象に選びました。`);
      if (fake === "pure_lover") return t(`${A} を恋人に選びました。`);
      if (fake === "reverser") return t(`${A} を反転させました。`);
      if (fake === "exposed_madman") return t(`${A} を暴露の対象に選びました。`);
      if (fake === "eraser_wolf") return t(`${A} を抹消対象にしました。`);
      if (fake === "visitor") return t(`${A} を訪問しました。`);
      if (fake === "watchdog") return t(`${A} を飼い主にしました。`);
      if (fake === "keymaster") { const lock = Math.random() < 0.5; return { text: lock ? `${A} の役職をロックしました。` : `${A} の役職のロックを解除しました。`, rev: a ? { kind: "key", mode: lock ? "lock" : "unlock", ids: [a] } : null }; }
      if (fake === "major") return t(`${A} を救済しようとしました。`);
      if (fake === "carmen") return t(`${A} に囁きました。`);
      if (fake === "seal_madman") return t(`${A} を封印しました。`);
      if (fake === "mimic_wolf") return t(`あなたは ${R()} の能力を模倣しました。`);
      if (fake === "cosplayer") {   // 山札から偽の3枚 → 選んだ1枚にコスプレ（選んでいなければ3枚とも山札へ戻る）。朝の演出は本物と同じ rev.kind "cosplay"
        const d = id ? H.cosDraw(g, id) : null;
        if (!d) return t(null);
        const cards = shownList(d), pk = sel.pick;
        d.used = true;
        if (!H.cosValid(g, id, pk, d)) return { text: null, rev: { kind: "cosplay", cards, pick: null, role: null } };
        const role = d.roles[pk], s = sh(role);
        return { text: `山札から3枚めくり、「${rn(s)}」にコスプレしました。あなたの新しい役職は「${rn(s)}」です。`, rev: { kind: "cosplay", cards, pick: pk, role: s }, newRole: role };
      }
      if (fake === "chesed") return t(`${A}を占い、${B}にコーヒーを渡しました。`);   // ケセドと思い込んだ人（マイクラ版の偽ケセド文と同じ。本物の記録・コーヒータイムには影響しない）
      if (fake === "nanoka") {   // なのかと思い込んだ人: 選んだ形態に「なった」ことにする（マイクラ版の偽なのか文「○○になりました。」と同じ。朝の演出も本物と同じ rev.kind "nanoka"。本物の盤面・記録には影響しない）
        const FORMS = ["long_night_moon", "mitsuki_nanoka", "rasetsu"], pk = Number.isInteger(sel.pick) && sel.pick >= 0 && sel.pick < 3 ? sel.pick : Math.floor(Math.random() * 3), form = FORMS[pk];
        return { text: `${rn(form)}になりました。`, rev: { kind: "nanoka", cards: FORMS.slice(), pick: pk, role: form } };
      }
      return a ? t(`${A} を選びました。`) : t(null);
    },
    /**
     * ハッキングされた人にだけ出す偽の公開情報（詩人通知・観測通知・新聞）。1人1種類1回だけ決めて g.hackPub に保存（再入室でも同じ内容）。
     * kind: "poet" | "observe" | "news"。create が false なら、すでに決めたものだけ返す（なければ null）
     */
    pub(g, id, kind, create) {
      g.hackPub = g.hackPub || {};
      const key = kind + ":" + id;
      if (g.hackPub[key]) return g.hackPub[key];
      if (!create) return null;
      const ps = (g.players || []).map((q) => q.id), nm = (x) => nameOf(g, x);
      let v;
      if (kind === "poet") {
        v = ps.length ? [`${roleName(rnd(g))}の能力が ${nm(pick(ps))} に使われていました。`] : ["対象を選ぶ夜能力は使われていませんでした。"];
      } else if (kind === "observe") {
        const a = ps.length ? pick(ps) : null, b = a ? pick(ps.filter((x) => x !== a)) : null;
        v = a && b ? [`${nm(a)} は ${nm(b)} に能力を使っていました。`] : [];
      } else {
        const n = Math.floor(Math.random() * 4);   // 0〜3件（0件なら「目立った動きなし」）
        v = Array.from({ length: n }, () => roleName(rnd(g)));
      }
      return (g.hackPub[key] = v);
    },
    /**
     * 愉快犯の笑い声・麻婆豆腐の完成を、思い込んでいる役職の目線で出すか（1人1回）。ハッキングされた人にだけ使う。
     *   kind "mapo": 麻婆の人狼と思い込んでいて、偽の夜の表示で仲間の人狼が見えている人 / kind "prankster": 愉快犯と思い込んで対象を選んだ人
     * 出す時点で印を付ける（再入室でも出さない・戻すときは seen で調べる）。create が false なら印だけ調べる
     */
    fakeBanner(g, id, kind, create) {
      g.hackPub = g.hackPub || {};
      const key = kind + "Banner:" + id;
      if (g.hackPub[key]) return true;
      if (!create || !H.isFakeUi(g, id) || (ONW.seal && ONW.seal.is(g, id))) return false;
      const want = kind === "mapo" ? "mapo_wolf" : "prankster";
      if (g.hackRole[id] !== want && H.actOf(g, id) !== want) return false;
      if (kind === "mapo" ? !H.view(g, id).wolves.length : !(((g.nightSels || {})[id] || {}).players || []).length) return false;
      return (g.hackPub[key] = true);
    },
    /** 偽の暴露狂人が対象を選んだら、昼の始まりにその人の画面にだけ出す偽の暴露（結果の役職は盤面と墓地からランダムに1回だけ決める）。resolveFake・偽の連鎖から呼ぶ */
    fakeExpose(g, id, fake, sel) {
      if (fake !== "exposed_madman" || !((sel || {}).players || [])[0]) return;
      g.hackExpose = g.hackExpose || {}; g.hackExposeShown = g.hackExposeShown || {};
      g.hackExpose[id] = { role: roleName(rnd(g)), extras: [] }; delete g.hackExposeShown[id];
    },
    /** 夜の終わり（最初の段階）: ハッキングされた人間ごとに偽の結果を出す。選んでいなければ「夜の行動をしませんでした。」 */
    resolveFake(g, h) {
      (g.players || []).forEach((p) => {
        if (!H.isFakeUi(g, p.id)) return;
        const ui = H.uiRole(g, p.id, null);   // 夜の操作画面の役職（模倣の人狼・開拓者は偽の模倣先 / 偽の運命の役職）
        if (!ui || !ONW.roleIsActive(ui)) return;
        const sel = (g.nightSels || {})[p.id] || { players: [], graves: [] };
        if (!h.done(p.id)) {
          if (ui === "cosplayer") { const d = H.cosDraw(g, p.id); d.used = true; h.rev[p.id] = { kind: "cosplay", cards: shownList(d), pick: null, role: null }; }   // 選ばなかった: 3枚とも裏返って山札へ戻る
          h.hold(p.id, "夜の行動をしませんでした。"); return;
        }
        const r = H.result(g, p.id, ui, sel);
        H.fakeExpose(g, p.id, ui, sel);
        if (r.text) r.text.split("\n").forEach((x) => h.hold(p.id, x));
        if (r.rev) h.rev[p.id] = r.rev;
        H.fakeChain(g, p.id, ui, r.newRole, r.chainRole);   // 偽の墓荒らし・ドッペル・コスプレで手にした偽の役職に能力があれば、朝のうちに使える（偽の連鎖）
      });
    },
  });

  /* ===== コスプレイヤー・模倣の人狼・開拓者を思い込んでいる人の偽の動作（hackfix_11）=====
   *  ・コスプレイヤー: 夜の始まりに山札から偽の3枚がめくれる（g.hackCos[人] = { roles:[3枚], used }）。1枚選ぶと、朝に本物と同じコスプレの演出（rev.kind "cosplay"）が本人の画面にだけ出る。
   *    選んだ役職が偽の新しい役職になり、夜の能力があれば朝のうちに続けて1回使える（偽の連鎖。コスプレ→墓荒らし→占い師 のような連鎖も本物と同じ）。
   *  ・模倣の人狼 / 開拓者: 偽の模倣先 / 偽の運命の役職（g.hackSub[人]）が、夜の画面・操作・朝の結果・昼能力になる。カードの下の枠（模倣先 / 運命）も偽のものが出る（net.js roleMsg の mimic）。
   *  ・偽の墓荒らし・ドッペル・コスプレで手にした偽の役職の「手にした直後の情報」（仲間の🐺・共有者の相方・大狼の墓地・模倣先 / 運命の文）と、その役職の偽の連鎖・演出も出す。
   *    cosDraw / subOf / drawSub / gotParts / result が担当。盤面は何も動かない。 */
  Object.assign(H, {
    shownList,
    /** 本物の役職定義の nightMsg を借りて呼ぶと、ゲームの状態が書き換わる役職がある（口封じ狂人の対象・弁護士の依頼人を決める・コスプレの本物の山札を引く…）。
     *  偽の表示のために呼ぶときは、終わったあとに状態を元に戻す（ハッキングされた人の思い込みが、本物の試合に影響しないように） */
    guarded(g, fn) {
      const keys = Object.keys(g), snap = {}, prim = {};
      keys.forEach((k) => { const v = g[k]; if (v && typeof v === "object") { try { snap[k] = JSON.stringify(v); } catch (e) { /* 複製できないものは触らない */ } } else prim[k] = v; });
      try { return fn(); } finally {
        Object.keys(g).forEach((k) => { if (!keys.includes(k)) delete g[k]; });
        keys.forEach((k) => {
          if (k in prim) { if (g[k] !== prim[k]) g[k] = prim[k]; return; }
          if (!(k in snap)) return;
          const v = g[k];
          if (v && typeof v === "object" && JSON.stringify(v) === snap[k]) return;
          const old = JSON.parse(snap[k]);
          if (v && typeof v === "object" && Array.isArray(v) === Array.isArray(old)) { if (Array.isArray(v)) { v.length = 0; v.push(...old); } else { Object.keys(v).forEach((x) => delete v[x]); Object.assign(v, old); } }
          else g[k] = old;
        });
      }
    },
    isBorrowRole: (r) => r === "mimic_wolf" || r === "trailblazer",
    /** 偽の模倣先 / 偽の運命の役職を新しく引く（role: mimic_wolf | trailblazer）。模倣は本物と同じ候補（配役直後の盤面と墓地。模倣できない役職を除く） */
    drawSub(g, role) {
      if (role === "trailblazer") { const T = ONW.trailblazer; return T.ROLE_OF[pick(T.FATES)]; }
      const c = ONW.mimic && ONW.mimic.candidates ? ONW.mimic.candidates(g) : [];
      return c.length ? pick(c) : "villager";
    },
    /** 模倣の人狼 / 開拓者と思い込んでいる人の、偽の模倣先 / 偽の運命の役職（1人1回だけ決めて保存）。それ以外は null */
    subOf(g, id) {
      const f = (g.hackRole || {})[id];
      if (!H.isBorrowRole(f)) return null;
      g.hackSub = g.hackSub || {};
      return g.hackSub[id] || (g.hackSub[id] = H.drawSub(g, f));
    },
    /** 夜の操作・朝の結果・昼能力に使う役職（模倣の人狼・開拓者は偽の模倣先 / 運命の役職。それ以外は思い込み役職そのもの） */
    actOf(g, id) { const f = (g.hackRole || {})[id]; return H.isBorrowRole(f) ? H.subOf(g, id) : f || null; },
    /** 本人に配るカードの下の枠: 模倣の人狼は偽の模倣先の役職ID / 開拓者は "fate:<運命>"。それ以外は null */
    cardMimic(g, id) {
      if (!H.isFakeUi(g, id)) return null;
      const f = g.hackRole[id], sub = H.subOf(g, id);
      return !sub ? null : f === "trailblazer" ? ONW.trailblazer.viewOf(sub) : sub;
    },
    /** 偽の山札の3枚（renew=true なら新しくめくり直す。未使用の引きが残っていればそれを返す） */
    cosDraw(g, id, renew) {
      g.hackCos = g.hackCos || {};
      const cur = g.hackCos[id];
      if (cur && !cur.used && !renew) return cur;
      const pl = ONW.cosplayer && ONW.cosplayer.pool ? ONW.cosplayer.pool() : [];
      return (g.hackCos[id] = { roles: shuf(pl).slice(0, 3), used: false });
    },
    cosValid(g, id, pick, d) { const x = d || (g.hackCos || {})[id]; return !!x && Number.isInteger(pick) && pick >= 0 && pick < x.roles.length; },
    /** 偽のコスプレの夜の選択（net.js の sel）。3枚の範囲外は選んでいない扱い */
    cosNormalize(g, id, sel) { const pk = sel && sel.pick; return { players: [], graves: [], pick: H.cosValid(g, id, pk) ? pk : null }; },
    /** 偽の連鎖がコスプレイヤーのとき、画面に出す偽の3枚（なければ null） */
    chainDraw(g, id, role) { const d = (g.hackCos || {})[id]; return role === "cosplayer" && d && !d.used ? shownList(d) : null; },
    /** 手にした偽の役職 role の「手にした直後の情報」の文と、朝にめくれるカード（本物の got と同じ形）。asSub: 模倣の人狼・開拓者が借りている役職（仲間の人狼の文は二重にしない） */
    gotParts(g, id, role, rev, asSub) {
      const V = H.view(g, id), nm = (x) => nameOf(g, x), out = { lines: [], peek: [], both: false };
      const WK = ONW.wolfKit && ONW.wolfKit.got, d = ONW.roleDef(role) || {};
      if (role === "mason") {
        out.both = true;
        if (V.masons.length) { out.lines.push(`もう一人の共有者: ${V.masons.map(nm).join("、")}`); V.masons.forEach((x) => out.peek.push({ k: "p:" + x, role: "mason" })); } else out.lines.push("他の共有者はいません。");
      } else if (role === "queen") {
        out.both = true;
        if (V.princesses.length) { out.lines.push(`姫君: ${V.princesses.map(nm).join("、")}`); V.princesses.forEach((x) => out.peek.push({ k: "p:" + x, role: "princess" })); }
      } else if (role === "servant" || role === "executioner") {
        out.both = true;
        const x = role === "servant" ? V.master : V.target;
        out.lines.push(x ? (role === "servant" ? `あなたのご主人は ${nm(x)} です。` : `あなたのターゲットは ${nm(x)} です。`) : role === "servant" ? "ご主人が見つかりませんでした。" : "ターゲットが見つかりませんでした。");
        if (x) out.peek.push({ k: "p:" + x, role: role === "servant" ? "__master" : "__target" });
      } else if (role === "mimic_wolf" || (WK && d.got === WK)) {
        if (!asSub) {
          if (role === "lone_wolf" || !V.wolves.length) out.lines.push("仲間の人狼はいません。");
          else { out.lines.push(`仲間の人狼: ${V.wolves.map(nm).join("、")}`); out.both = true; V.wolves.forEach((w) => out.peek.push({ k: "p:" + w, role: "__wolf" })); }
        }
        if (role === "big_wolf") {   // 大狼: 交換した墓地以外の墓地がすべて見える
          const skip = rev && rev.kind === "relic" ? rev.target : null, gs = (V.graves || []).map((cr, j) => [j, cr]).filter(([j]) => j !== skip);
          out.both = true;
          out.lines.push(`墓地: ${gs.map(([j, cr]) => `${j + 1}枚目「${roleName(cr)}」`).join(" ")}`);
          gs.forEach(([j, cr]) => out.peek.push({ k: `g:${j}`, role: cr }));
        }
      }
      return out;
    },
    /** 偽の結果（fakeResult）に、手にした偽の役職の「模倣先 / 運命」の文・カードの下の枠・手にした直後の情報を足す。戻り値 { text, rev, newRole, chainRole } */
    result(g, id, act, sel) {
      const r = H.fakeResult(g, act, sel, id), nr = r.newRole;
      if (!nr || !r.rev) return r;
      const lines = [], peek = []; let both = false;
      const eat = (o) => { lines.push(...o.lines); peek.push(...o.peek); both = both || o.both; };
      if (H.isBorrowRole(nr)) {
        const sub = H.drawSub(g, nr), T = ONW.trailblazer;
        r.chainRole = sub;
        r.rev.mimic = nr === "trailblazer" ? T.viewOf(sub) : sub;   // カードの下の枠（模倣先 / 運命）
        if (nr === "mimic_wolf") { eat(H.gotParts(g, id, nr, r.rev, false)); lines.push(ONW.mimic.text(roleName, sub)); }
        else lines.push(T.text(T.fateOfRole(sub)));
        eat(H.gotParts(g, id, sub, r.rev, true));
      } else eat(H.gotParts(g, id, nr, r.rev, false));
      if (peek.length) { const seen = new Set(); r.rev.peek = peek.filter((x) => (seen.has(x.k) ? false : (seen.add(x.k), true))); r.rev.gap = 380; }
      if (both && r.rev.kind === "relic") r.rev.both = { role: r.rev.role };   // 墓荒らし: 自分のカードと交換した墓地のカードが同時に表になる
      r.text = [r.text, ...lines].filter(Boolean).join("\n");
      return r;
    },
  });

  /* ===== 朝の連鎖の偽の画面・昼の偽の能力・酔い覚め（3of4a）=====
   *  ・偽の墓荒らし / ドッペルゲンガーで偽の役職を手にしたら、その役職に夜の能力があれば、本物と同じ「朝のうちに1回」の画面が出る（g.morningAct[人] に偽の役職、g.hackChain[人] に同じ値）。
   *    使うと偽の結果（fakeResult）が出るだけで、盤面は何も動かない（net.js の hostFakeChain）。連鎖の連鎖（偽の墓荒らしがまた偽の墓荒らしを手にした…）は出さない。
   *  ・昼能力ボタンで開く役職（独裁者・交換者・保安官・盗賊・妖精さん・イカロス・御乱心・フリーター・心眼の人狼・感覚の占い師・天秤・予想屋・黄泉）を思い込んでいたら、
   *    本物と同じ画面が開き（dayOk）、使うと偽の結果の文だけが出る（dayAct。効果なし）。1回だけ（予想屋・イカロスは何度でも）。本当の役職の昼能力は使えない（マイクラ版と同じ）。
   *  ・酔っ払いがハッキングされていたら、酔いが覚めたとき（soberUp）に偽の役職・偽の情報・偽の連鎖が出る（本当の役職の能力や情報は出さない）。 */
  const DAY = {
    dictator: { kinds: ["dictate"], n: 1, ok: () => ({ t: "dictok", on: true }), text: (g, A) => `${A} を独裁処刑しました。` },
    exchanger: { kinds: ["exchange"], n: 2, self: true, ok: (f) => ({ t: "exchok", on: true, role: f }), text: (g, A, B) => `${A} と ${B} の票数を入れ替えます。` },
    mad_exchanger: { kinds: ["exchange"], n: 2, self: true, ok: (f) => ({ t: "exchok", on: true, role: f }), text: (g, A, B) => `${A} と ${B} の票数を入れ替えます。` },
    sheriff: { kinds: ["shoot"], n: 1, ok: () => ({ t: "sheriffok", on: true }), text: (g, A) => `${A} を撃ちました。` },
    vanity: { kinds: ["shoot"], n: 1, ok: () => ({ t: "sheriffok", on: true }), text: (g, A) => `${A} を撃ちました。` },   // ヴァニティを思い込んだ人: 本人は保安官だと思い込んでいる（shownRole でも保安官に見える）ので、保安官と同じ偽の撃つ画面・偽の結果文
    thief: { kinds: ["steal"], n: 1, ok: () => ({ t: "thiefok", on: true }), text: (g, A) => `${A} の票数を1票分盗みました。` },
    fairy: { kinds: ["barrier"], n: 1, ok: () => ({ t: "fairyok", on: true }), text: (g, A) => `${A} にバリアを付与しました。` },
    icarus: { kinds: ["icarus"], n: 1, repeat: true, ok: () => ({ t: "icarusok", on: true, max: 1 }), text: (g, A) => `${A} に票を分け与えました。` },
    goranshin: { kinds: ["goranshin"], n: 1, ok: () => ({ t: "goranshinok", on: true }), text: (g, A) => `${A} の投票先をランダムにしました。` },
    freeter: { kinds: ["rejob"], n: 1, ok: () => ({ t: "rejobok", on: true }), text: (g, A) => `${A} に再就職しました。` },
    mind_wolf: { kinds: ["mind"], n: 1, ok: () => ({ t: "mindok", on: true, role: "mind_wolf" }), text: (g, A) => (ONW.mindWolf && ONW.mindWolf.resultText ? ONW.mindWolf.resultText(A, roleName(rnd(g))) : `${A} の最終役職は「${roleName(rnd(g))}」でした。`) },
    sense_seer: { kinds: ["mind"], n: 1, ok: () => ({ t: "mindok", on: true, role: "sense_seer" }), text: (g, A) => { const ks = Object.keys((ONW.senseSeer && ONW.senseSeer.FEEL) || { village: 1, wolf: 1, third: 1 }); return ONW.senseSeer && ONW.senseSeer.resultText ? ONW.senseSeer.resultText(A, pick(ks)) : `${A} から村人の気配を感じました。`; } },
    libra: { kinds: ["libra"], n: 2, self: true, ok: (f) => ({ t: "libraok", on: true, role: f }), text: (g, A, B) => `${A} と ${B} に投票対象を制限しました。` },
    predictor: { kinds: ["predict"], n: 0, repeat: true, ok: (f, g, id) => ({ t: "predok", on: true, sel: ((g.hackPred || {})[id] || []).slice() }) },
    yomi: { kinds: ["yomi"], n: 1, self: true, ok: () => ({ t: "yomiok", on: true }), text: (g, A) => `${A} を断ち切りました。` },
  };
  Object.assign(H, {
    DAY,
    /** 偽の役職が「朝の連鎖」で使える能力か（偽の墓荒らし・ドッペルで手にした偽の役職） */
    chainable: (r, from) => !!r && ONW.roleIsActive(r) && (from === "relic_robber" ? ONW.roleCanChain(r) : true),   // 本物と同じ: 墓荒らしの先は roleCanChain の役職（墓荒らし自身は続かない）、ドッペル・コスプレの先は夜の能力のある役職すべて
    /** 偽の連鎖を仕込む（resolveFake・酔い覚め・偽の連鎖の続きから）。戻り値: 仕込んだ役職（なければ null） */
    fakeChain(g, id, fake, newRole, chainRole) {
      const ar = chainRole || newRole;   // 模倣の人狼・開拓者を手にしたら、偽の模倣先 / 偽の運命の役職の能力が続く
      if (!ar || !["relic_robber", "doppelganger", "cosplayer"].includes(fake) || !H.chainable(ar, fake)) return null;
      g.hackDepth = g.hackDepth || {};
      if ((g.hackDepth[id] || 0) >= 6) return null;   // 連鎖が延々と続かないように（偽の墓荒らし→ドッペル→コスプレ…）
      g.hackDepth[id] = (g.hackDepth[id] || 0) + 1;
      g.morningAct = g.morningAct || {}; g.hackChain = g.hackChain || {};
      g.morningAct[id] = ar; g.hackChain[id] = ar;
      if (ar === "cosplayer") H.cosDraw(g, id, true);   // コスプレイヤーを手にしたら、自動で山札から偽の3枚がめくれる
      return ar;
    },
    /** 偽の連鎖の途中か（まだ使っていない / 使ったあと）。net.js の mchain はこれが true なら本物の処理を通さない */
    isFakeChain: (g, id) => !!(g.hackChain || {})[id] && H.isFakeUi(g, id),
    /** 偽の昼能力の結果の文（再入室で戻す用） */
    dayLogOf: (g, id) => (g.hackDayLog || {})[id] || [],
    /** 昼能力ボタンを押したときに返す「使える」メッセージ（偽の昼能力）。使えない（昼能力のない偽の役職・使用済み・ハッキングされていない）ときは null */
    dayOk(g, id) {
      if (!H.isFakeUi(g, id)) return null;
      const f = H.actOf(g, id), e = DAY[f];
      if (!e || ((g.hackDayUsed || {})[id] && !e.repeat)) return null;
      return e.ok(f, g, id);
    },
    /** 偽の昼能力の実行。d = 受け取った { kind, target / a / b / ids }。戻り値: { text, close, names } / null（受け付けない） */
    dayAct(g, id, d) {
      const ok = H.dayOk(g, id); if (!ok) return null;
      const f = H.actOf(g, id), e = DAY[f];
      if (!e.kinds.includes(d.kind)) return null;
      const valid = (x) => typeof x === "string" && (g.players || []).some((q) => q.id === x) && !(g.deadIds || []).includes(x) && (e.self || x !== id);
      g.hackDayUsed = g.hackDayUsed || {};
      if (f === "predictor") {
        const ids = Array.isArray(d.ids) ? [...new Set(d.ids.filter((x) => typeof x === "string" && (g.players || []).some((q) => q.id === x)))].slice(0, 100) : null;
        if (!ids) return null;
        g.hackPred = g.hackPred || {}; g.hackPred[id] = ids;
        const nm = (x) => nameOf(g, x);
        const text = ONW.predictor && ONW.predictor.doneText ? ONW.predictor.doneText(g, ids, nm) : null;
        g.hackDayLog = g.hackDayLog || {};
        return { predsaved: true, names: ids.map(nm), text, close: !!d.close };
      }
      const ids = e.n === 2 ? [d.a, d.b] : [d.target];
      if (!ids.every(valid) || new Set(ids).size !== ids.length) return null;
      if (f === "icarus") { g.hackIcarus = g.hackIcarus || {}; const u = (g.hackIcarus[id] = g.hackIcarus[id] || []); if (u.includes(ids[0])) return null; u.push(ids[0]); }
      else g.hackDayUsed[id] = true;
      const text = e.text(g, ...ids.map((x) => nameOf(g, x)));
      ((g.hackDayLog = g.hackDayLog || {})[id] = g.hackDayLog[id] || []).push(text);
      return { text };
    },
    /** 酔いが覚めたハッキング中の人（人間）に出す、偽の酔い覚め。戻り値 { role（偽の役職）, lines, chain（偽の連鎖。なければ null） } */
    soberFake(c, p) {
      const g = c.g, fake = g.hackRole[p.id], v = H.nightView(c, p), lines = [`酔いが覚めました。あなたの最終的な役職は「${roleName(fake)}」です。`];
      const t2 = fake === "mimic_wolf" && v.text2 ? ONW.mimic.textNow(roleName, H.subOf(g, p.id)) : v.text2;   // 酔い覚めの文は「模倣しています」（本物と同じ）
      [v.text, t2, ...(v.lines || [])].filter(Boolean).forEach((x) => lines.push(x));
      let chain = null;
      if (v.act && v.actRole && !ONW.roleDef(v.actRole).noDayChain) {   // 夜の能力のある偽の役職: 議論中に1回だけ偽の能力が使える（偽の結果が出る）
        chain = v.actRole; g.morningAct = g.morningAct || {}; g.morningDone = g.morningDone || {}; g.hackChain = g.hackChain || {};
        if (chain === "cosplayer") H.cosDraw(g, p.id, true);   // コスプレイヤー: 酔い覚めに自動で山札から偽の3枚がめくれる
        g.morningAct[p.id] = chain; g.morningDone[p.id] = false; g.hackChain[p.id] = chain;
        lines.push("この能力を、議論中に1回だけ使えます。");
      }
      return { role: ONW.shownRole(fake), lines, chain, v };
    },
  });

  /* ===== 墓荒らし・ドッペルゲンガーが銀狼を手にできない処理（3of4a。マイクラ版: 「銀狼のハッキングに阻まれた」）=====
   *  ・墓荒らし: 選んだ墓地が銀狼なら、交換できない（墓地も自分の役職も動かない）。
   *  ・ドッペルゲンガー: コピーしようとした相手の役職が銀狼なら、コピーできない（役職は変わらない）。
   *  ・本人には朝に失敗の文が届き、選んだカード（墓地 / 相手）が⚠️で弾かれて揺れる（reveal.kind = "hackfail"）。
   *  ・新聞・観測には載らない（鍵師のロックで失敗したときと同じ扱い）。CPUは失敗したことを正直に言う（i.keyFail = { kind: "hack" }）。 */
  Object.assign(H, {
    /** この役職は墓荒らし・ドッペルゲンガーが手にできないか */
    blocks: (role) => role === ID,
    /** 失敗の文（verb: relic = 墓荒らし / doppel = ドッペルゲンガー） */
    failLine: (verb) => (verb === "relic" ? "銀狼のハッキングに阻まれたため盗めませんでした。" : "銀狼のハッキングに阻まれたためコピーに失敗しました。"),
    /** 失敗の演出（朝。本人の画面だけ）。key = 弾かれるカード（"g:墓地番号" / "p:席"） */
    failRev: (key) => ({ kind: "hackfail", key }),
    /** 失敗を夜のログに残して、本人向けの文を返す（label = 「墓荒らし ○○」のような名乗り） */
    fail(g, verb, label, what) {
      (g.nightLogsAll = g.nightLogsAll || []).push(`${label} は ${what} を${verb === "relic" ? "交換しようとしましたが" : "コピーしようとしましたが"}、銀狼のハッキングに阻まれたため失敗しました。`);
      return H.failLine(verb);
    },
  });

  ONW.defineRole(ID, {
    info: {
      observe: "player", deck: 117, name: "銀狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.595,
      desc: "人狼陣営。試合開始時にランダムなプレイヤー1人をハッキングします。ハッキングされた人は、墓地のランダムな役職を自分の役職だと思い込みます。相方や狂信者からは人狼として見えます。",
    },
    groups: { wolf: 8.95, "transform:dark_avatar": 9.45 },
    got: K.got,
    nightMsg(c, p, r) {
      const m = K.nightMsg(c, p, r), g = c.g;
      const l = H.line(g, p.id);
      if (l) { m.text2 = l; m.hack = H.reveal(g, p.id, m.cultWolves); }
      return m;
    },
    /** 模倣の人狼が銀狼を模倣したとき（ハッキングの情報と演出だけを足す） */
    nightMsgAct(c, p, ar) {
      if (ar !== ID) return null;
      const l = H.line(c.g, p.id); if (!l) return null;
      const w = c.g.initialRoles ? (c.g.players || []).filter((q) => q.id !== p.id && ONW.WOLF_LOOK.includes(c.g.initialRoles[q.id])).map((q) => q.id) : [];
      return { text2: l, hack: H.reveal(c.g, p.id, w) };
    },
    soberLines(c, id, fin) {
      const a = K.soberLines ? K.soberLines(c, id, fin) : [];
      const l = fin === ID ? H.line(c.g, id) : null;
      return l ? (a || []).concat(l) : a;
    },
    soberPeek(c, id, fin) {
      const pk = K.soberPeek ? K.soberPeek(c, id, fin) : {};
      if (fin === ID) { const h = H.reveal(c.g, id, (pk && pk.wolves) || []); if (h) pk.hack = h; }
      return pk;
    },
    /** 結果開示(COボタン)の流れ（co.js が kind で引く）: ハッキングした相手を選ぶ →「〇〇 をハッキングしました。」（マイクラ版 main.js と同じ） */
    coResult: {
      kind: "hack", targetLabel: "ハッキングした相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} をハッキングしました。`, null, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    /** 朝の演出（墓荒らし・ドッペルの失敗）: 選んだカードが⚠️で表になり、弾かれるように左右に揺れる */
    stageMorning: {
      kind: "hackfail", dur: () => 1500,
      play(r, SK) {
        const k = r.key; if (!k) return;
        SK.show(k, SK.HACK_MARK, true);
        SK.later(() => SK.shake(k), 300);
      },
    },
    /** 夜の演出: 相方なら🐺→裏面。そのあと、USBメモリが対象のカードに刺さり、ウイルスをインストール → ⚠️ */
    stageNight: {
      order: 35, field: "hackReveal",
      run(r, SK) {
        const k = "p:" + r.id, n = r.n || 0;
        const on = () => SK.G().phase === ONW.PHASE.ONLINE_NIGHT;
        const show = () => { if (!on()) return; SK.up[k] = SK.HACK_MARK; SK.glow[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); SK.paint(SK.G()); };
        const usb = () => { if (!on()) return; if (SK.hackUsb) SK.hackUsb(k, show); else show(); };
        if (r.mate) {
          SK.later(() => { if (!on()) return; delete SK.up[k]; delete SK.glow[k]; SK.paint(SK.G()); }, n * 380 + 1300);
          SK.later(usb, n * 380 + 2200);   // 🐺が裏面に戻ってから
        } else SK.later(usb, n * 380 + 700);   // 仲間の🐺が出終わってから
      },
    },
    /** 酔い覚めの演出（酔っ払いの銀狼）: 夜と同じくUSBメモリ → ⚠️。相方なら🐺→裏面→USB→⚠️ */
    stageSober: {
      list(sp, list, SK) {
        const h = sp && sp.hack; if (!h) return;
        const k = "p:" + h.id, n = (sp.wolves || []).length;
        const show = () => { SK.up[k] = SK.HACK_MARK; SK.glow[k] = true; SK.paint(SK.G()); };
        const usb = () => { if (SK.hackUsb) SK.hackUsb(k, show); else show(); };
        if (h.mate) {
          SK.later(() => { if (SK.held && SK.held[k]) return; delete SK.up[k]; delete SK.glow[k]; SK.paint(SK.G()); }, 300 + n * 380 + 1100);
          SK.later(usb, 300 + n * 380 + 1900);
        } else SK.later(usb, 300 + n * 380 + 500);
      },
    },
  });
})(window.ONW);
