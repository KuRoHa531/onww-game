/**
 * シャッフラー（マイクラ版 SHUFFLER を参考）: 第三陣営。
 * 夜に「自分を含む」プレイヤー1人を選ぶ。朝に山札から1枚を引いてめくり、選んだ人のカードの上に置く（＝その人の役職が引いたカードの役職に変わる）。
 *   ・山札 = 「一部を除いたランダムな役職」（マイクラ版 shufflerEligibleRoles と同じ考え方。除外は ONW.shuffler.BLOCKED）。
 *   ・「カードの上に置いた」記録は g.shufflerMarks[置かれたカードのID] = { by: シャッフラーのカードID, role: 引いた役職 }（カード単位）。
 *     カードが怪盗・いたずらっ子・墓荒らし・グレムリンなどで人から人へ動いても、カードIDで追うので、記録は自然についていく（ONW.cardAt / state.js の cards）。
 *     選んだ「人」ではなく「置かれたカード」で追うので、置いたあとにそのカードが別の人の手に渡れば、渡った先の人がシャッフラーの対象になる（本家は選んだプレイヤー単位。カードが動いた場合だけ違う）。
 *     自分自身も選べる: 自分のカードの上に置く（by = そのカード自身）。役職は変わるのでシャッフラーではなくなるが、カードの印で「自分を変化させたシャッフラー」と分かる。
 *     上書きされた（ドッペル・グレムリンのコピー・別のシャッフラーが上に置いた）カードの印は消える。陣営の乗っ取りは 3of4。
 *     結果画面の「(+シャッフラー)」は g.shufflerStamp（置かれた段階と、印の付いたカードが動いたあとの段階。state.js ONW.shufflerStamp）で付く。印の記録には置かれる前の役職(from)と置かれた時点の持ち主(to)も残す。
 *   ・処理順（_wip/役職の処理順.txt）: … → ドッペルゲンガー → シャッフラー → グレムリン → (マティアス) → 怪盗 → いたずらっ子 …。Web版の夜の段階は seer → relic → doppel → shuffler → gremlin → robber → tm。
 *   ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
 *   ・夜の能力は「夜に配られた役職の持ち主(人間)」が使う。そのときカードが怪盗などで別の人に移っていても、記録は「いまそのカードを持っている人」に書く（ONW.shuffler.holderOf）。
 * 実装の進み具合は _wip/シャッフラー_依頼文.txt を参照。
 *  1of4: 登録・夜の選択(自分も可)・山札から引いて上に置く確定ロジック・役職移動への追従・ルールコード・処理順メモ【済】 / 2of4: 朝の演出(山札→めくる→カードの上に置く)・選ばれた人の通知と演出(待機時間)・情報確認・再入室・結果画面の「(+シャッフラー)」【済】 / 3of4: 酔い(覚めたあと)・昼のうち(昼に選ぶ演出と、選ばれた人への通知)・陣営の乗っ取りと勝敗(失敗条件)【済】 / 4of4: CPU(選ばれたときの認識・発言/CO・投票判断)・COボタンの結果開示・闇鍋シナジー(後覚者)・wiki・総合テスト【済】
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.SHUFFLER;
  const LIFT = 550, FLIP = 800, FLY = 950, LAND = 750, HOLD = 1600;   // 朝の演出の長さ(ms): 山札から浮く → めくれる → 飛んで重なる → 片づける
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 山札に入らない役職（マイクラ版 shufflerEligibleRoles の除外を、Web版にある役職に当てはめたもの）。
   *  変化役・夜に誰かを選ぶ/入れ替える役職(占い・怪盗・墓荒らし・いたずらっ子・ドッペル・グレムリン・恋人系・シャッフラー自身など)・マーリン・アサシン・共有者・狂信者は引かれない。
   *  口封じの狂人は、引いたときのターゲット決めと演出を 3of4 で作るまで山札から外す（マイクラ版は入る）。 */
  const BLOCKED = [
    "light_apostle", "dark_avatar", "silver_shadow",
    "seer", "mad_seer", "robber", "relic_robber", "troublemaker",
    "doppelganger", "love_tanner", "freeter", "visitor", "exposed_madman",
    "gremlin", "pure_lover", "evil_woman", "cupid", "heartbreaker", "shuffler",
    "assassin", "merlin", "mason", "cultist",
    "muzzle_madman",
  ];
  /** 山札（引ける役職の一覧）。重複役職（酔っ払い・恋人）は役職ではないので入らない */
  function pool() {
    return Object.keys(ONW.ROLE_INFO || {}).filter((r) => !BLOCKED.includes(r) && r !== ONW.ROLE.DRUNK && r !== ONW.ROLE.LOVER);
  }
  /** 山札から1枚引く（乱数は ONW.utils.randomChoice。テストでは差し替える） */
  function draw() {
    const p = pool();
    return p.length ? ONW.utils.randomChoice(p) : ONW.ROLE.VILLAGER;
  }
  /** カードID("P:ID" / 墓地 "G:番号")を、いま持っている人（墓地にあるなら "g:番号"）。役職が動いていなければ本人 */
  function holderOfCard(g, cardId) {
    if (!g.cards) return String(cardId).slice(2);
    const k = Object.keys(g.cards.at).find((x) => g.cards.at[x] === cardId);
    return k || String(cardId).slice(2);
  }
  /** 夜に配られた役職(人間 id が最初に持っていたカード)を、いま持っている人 */
  const holderOf = (g, id) => holderOfCard(g, "P:" + id);
  /** 最終盤面のシャッフラーの [持ち主, 対象(置かれたカードをいま持っている人), 引いた役職, 自分自身か]。
   *  他人に置いたシャッフラーは、最終盤面でシャッフラーのカードが役職「シャッフラー」のままのときだけ（上書きされたら無効）。自分に置いたシャッフラーは印があるかぎり有効 */
  function picks(g) {
    const out = [], m = g.shufflerMarks || {}, isP = (id) => g.players.some((q) => q.id === id);
    Object.keys(m).forEach((card) => {
      const e = m[card], th = holderOfCard(g, card), sh = holderOfCard(g, e.by), self = card === e.by;
      if (!isP(th) || !isP(sh)) return;
      if (!self && g.currentRoles[sh] !== R_()) return;
      out.push([sh, th, e.role || null, self]);
    });
    return out;
  }
  /** h(持ち主)が置いたシャッフラーの記録（なければ null） */
  const picksOf = (g, h) => picks(g).find((x) => x[0] === h) || null;
  /** 実行: 山札から1枚引いて、t のカードの上に置く（t の役職が引いた役職になる）。holder = いまシャッフラーのカードを持っている人。戻り値 = { target, role, from }
   *  元の役職(from)は結果画面の役職の流れ（roleTrail）にも残る。 */
  function shuffle(g, holder, t) {
    const role = draw(), by = ONW.cardAt(g, holder), from = g.currentRoles[t];
    ONW.shufflerPlace(g, t, role, by);
    return { target: t, role, from };
  }
  /** 結果画面の役職の流れ: shuf の付いた段階（net.js が g.shufflerStamp から付ける）に「(+シャッフラー)」を付ける。恋人の印のあとに並べる */
  function tagSegs(segs) {
    segs.forEach((sg) => { if (sg.shuf) sg.tags = [...(sg.tags || []), { t: "(+シャッフラー)", k: "shuffler" }]; delete sg.shuf; });
    return segs;
  }
  const rnOf = (r) => ONW.roles.getInfo(r).name;
  /** 選ばれた人 th に出す通知（置かれた時点の持ち主 mark.to が、いまもそのカードを持っているときだけ。自分に置いた本人・入れ替わって別の人の手に渡ったカードには出さない）。なければ null。
   *  from は置かれる前の役職（酔っていた期間に置かれた分も mark.from を使う）。 */
  function notice(g, th) {
    const hit = picks(g).find((x) => x[1] === th && !x[3]); if (!hit) return null;
    const e = (g.shufflerMarks || {})[ONW.cardAt(g, th)];
    if (!e || e.to !== th) return null;
    const B = ONW.shownRole(hit[2]);
    return { from: e.from || null, role: B, text: e.from ? `あなたは ${rnOf(ONW.shownRole(e.from))} から ${rnOf(B)}(+シャッフラー) になりました。` : `あなたは ${rnOf(B)}(+シャッフラー) になりました。` };
  }

  // ---- 勝敗（マイクラ版 vote.js の shufflerFailsByDeathRule / enforceShufflerFailureRules / 乗っ取り勝利 を、Web版のカード単位の印(picks)に当てはめたもの）----
  //  ・失敗条件: 追放・死亡しないと勝てない役職（てるてる・一目惚れしてるてる）以外に変化させたのに、変化させた対象が死亡したら、シャッフラー陣営（シャッフラーと対象）は勝てない。
  //    村人陣営・人狼陣営の役職に変化させた場合は、シャッフラー本人が死亡しても失敗。自分に変化させた場合は、自分が変化後の役職として死亡すれば失敗。
  //  ・乗っ取り勝利: 失敗していない組で、対象が（変化後の役職として）勝利していれば、シャッフラーと対象が「シャッフラー勝利」。元の勝者のうち、この2人以外は敗北（追加勝利の役職・勝ち組などは通常どおり）。
  //  ・勝ち組に変化させた場合は、勝ち組は必ず勝つので乗っ取りにはせず、シャッフラーが（本人も対象も死亡していなければ）追加で勝利する。
  //  ・恋人（重複役職）の人が絡む組は乗っ取らない。チキンの逆転（chickenForce）のときも乗っ取らない。
  //  すべてカードの印（picks）で追従するので、昼のうちに怪盗などでカードが動いても、最終盤面のカードの持ち主で判定される。
  const DEATH_WIN = () => [ONW.ROLE.TANNER, ONW.ROLE.LOVE_TANNER];   // 追放・死亡しないと勝てない役職
  const teamOfRole = (r) => (ONW.roles.getInfo(r) || {}).team;
  const isLv = (g, id) => !!(ONW.isLover && ONW.isLover(g, id));
  /** この組が失敗か。w = 勝者の集合（てるてる系は勝者に入っていれば死亡しても可） */
  function pairFails(g, [sh, th, , self], w, dead) {
    const asg = g.currentRoles[th];
    if (asg === ONW.ROLE.WINNER) return !self && (dead.has(sh) || dead.has(th));   // 勝ち組: 対象は必ず勝つ。シャッフラーだけが死亡条件を見る
    const allowDeath = DEATH_WIN().includes(asg) && w.has(th);
    if (self) return dead.has(th) && !allowDeath;
    if ([ONW.TEAM.VILLAGE, ONW.TEAM.WOLF].includes(teamOfRole(asg)) && dead.has(sh)) return true;
    return dead.has(th) && !allowDeath;
  }
  /** 勝者の集合 w（追加勝利を足す前）に対して、失敗した組の シャッフラー・対象 を返す（勝ち組の対象は除く）。game.shufflerBan に残す */
  function failed(g, w, dead) {
    const ban = new Set();
    picks(g).forEach((pk) => {
      if (!pairFails(g, pk, w, dead)) return;
      ban.add(pk[0]); if (!pk[3] && g.currentRoles[pk[1]] !== ONW.ROLE.WINNER) ban.add(pk[1]);
    });
    g.shufflerBan = [...ban];
    return ban;
  }
  /** 乗っ取り勝利: 追加勝利まで足した最終の勝者 game.winnerIds を見て、成立する組の ID（シャッフラーと対象）を返す。なければ null。game.shufflerBan は失敗した人 */
  function takeover(g) {
    if (g.chickenForce) return null;
    const w = new Set(g.winnerIds || []), ban = new Set(g.shufflerBan || []), ids = new Set(), pairs = [];
    picks(g).forEach(([sh, th, role, self]) => {
      if (ban.has(sh) || ban.has(th) || isLv(g, sh) || isLv(g, th)) return;
      if (g.currentRoles[th] === ONW.ROLE.WINNER || !w.has(th)) return;
      ids.add(sh); ids.add(th); pairs.push({ sh, th, role: g.currentRoles[th], self });
    });
    return pairs.length ? { ids: [...ids], pairs } : null;
  }
  /** 勝ち組に変化させた組: 失敗していなければ、シャッフラーも追加で勝利（勝者の集合 w に足す）。足した人を返す */
  function addWinnerPairs(g, w) {
    const ban = new Set(g.shufflerBan || []), add = [];
    picks(g).forEach(([sh, th, , self]) => {
      if (self || g.currentRoles[th] !== ONW.ROLE.WINNER || ban.has(sh) || isLv(g, sh)) return;
      if (!w.has(sh)) { w.add(sh); add.push(sh); }
    });
    return add;
  }
  /** 結果の説明文（乗っ取り勝利） */
  function takeoverText(g, tk, base) {
    const nm2 = (id) => nm(g, id);
    const parts = tk.pairs.map((x) => x.self ? `${nm2(x.sh)} は自分を「${rnOf(x.role)}」に変化させ、その役職として勝利しました。` : `シャッフラー ${nm2(x.sh)} が ${nm2(x.th)} を「${rnOf(x.role)}」に変化させ、${nm2(x.th)} が勝利条件を満たしました。`);
    return `${parts.join(" ")}シャッフラーと変化させた人の勝利です。${base ? `（元の勝敗: ${base}）` : ""}`;
  }
  function failText(g, ban) { return ban.length ? `シャッフラーの陣営の ${ban.map((id) => nm(g, id)).join("、")} は、死亡条件を満たせず勝利できませんでした。` : ""; }

  ONW.shuffler = { BLOCKED, pool, draw, holderOf, holderOfCard, picks, picksOf, shuffle, tagSegs, notice, failed, takeover, addWinnerPairs, takeoverText, failText };

  // ---- CPUの夜の行動: 自分を含む1人をランダムに選ぶ（デバッグの指定があればそれ。自分も指定できる） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const ok = (id) => id && g.players.some((q) => q.id === id);
    const t = ok(f.player) ? f.player : n.pick(g.players).id;
    const r = shuffle(g, holderOf(g, p.id), t), shown = ONW.shownRole(r.role);
    i.shuffle = { target: t, role: shown };   // 発言(cpuClaim)・投票(cpuVoteScore)が使う。朝に墓荒らし・ドッペルで手にした連鎖(cur)でも、本人の怪盗などの記録(mode / target)は上書きしない
    if (!cur) { i.mode = "shuffler"; i.target = t; }
    i.known[t] = shown;   // 引いたカードを見たので、その人の役職（いまの役職）を知っている
    if (t === p.id) i.shuffledTo = shown;   // 自分に置いたとき: 自分はもうその役職（発言・投票はその役職として行う。cpu.js の plan / selfRole）
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, t)} をランダムな役職「${n.rn(r.role)}」に変化させました。`);
    n.ob(p.id, [t]);
    n.nn(rid);
  }
  /** CPUが選ばれたことを知る（人間の「あなたは A から B(+シャッフラー) になりました。」と同じ。知るのは新しい役職だけ。仲間の人狼やターゲットなど、役職ごとの情報は人間にも知らされないのでCPUも知らない）。
   *  待機時間(settlePre)・昼に使われた(dayNotify / dayCheck)・酔いが覚めたとき(cpu.sober は最終役職を知る)で呼ばれる。発言・投票は cpu.js の plan / selfRole が i.shuffledTo / i.known[自分] を見る */
  function cpuNotice(g, id, role, k) {
    g.cpuInfo = g.cpuInfo || {};
    const i = k.infoOf(g, id), shown = ONW.shownRole(role);
    i.shuffledTo = shown; i.known[id] = shown;
    i.mode = null; i.target = null; i.shuffle = null;   // 元の役職の夜の行動の記録は、もう自分の役職のものではない
  }
  /** CPUのシャッフラーの発言: 本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（「〇〇 を △△ に変化させました。」）、残りは騙り。選んだ結果を知らない（怪盗で奪った等）ときは本当のCOはしない。
   *  自分に置いたCPUは、もうその役職なので cpu.js の plan が置いた役職として振る舞う（このフックは呼ばれない） */
  function cpuClaim(k, g, p, r, i, c) {
    const { nameOf, rn } = k;
    if (i.shuffle && i.shuffle.target && i.shuffle.target !== p.id && k.coTruth(g, p)) {
      const w = nameOf(g, i.shuffle.target);
      c.co = "shuffler";
      c.result = { short: `${w} → ${rn(i.shuffle.role)}`, text: `${w} を ${rn(i.shuffle.role)} に変化させました。`, claim: { kind: "shuffler", target: i.shuffle.target, role: i.shuffle.role } };
    } else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
  }
  /** CPUのシャッフラーの投票（マイクラ版 cpu.js の shufflerTarget の加点に合わせる）: 変化させた相手は、追放・死亡しないと勝てない役職（てるてる・一目惚れしてるてる）に変化させたときだけ狙い、
   *  それ以外は死亡すると失敗なので票を入れない（ONW.shuffler.failed の条件と同じ） */
  function cpuVoteScore(k, g, p, q, i) {
    if (!i.shuffle || i.shuffle.target !== q.id || q.id === p.id) return 0;
    return [ONW.ROLE.TANNER, ONW.ROLE.LOVE_TANNER].includes(i.shuffle.role) ? 100 : -100;
  }

  ONW.defineRole("shuffler", {
    info: { deck: 58, name: "シャッフラー", team: ONW.TEAM.THIRD, wakeOrder: 55, sort: 40.5,
      desc: "第三陣営。夜に自分を含むプレイヤーを1人選びます。朝に山札から1枚引いてめくり、選んだ人のカードの上に置きます（その人の役職が、引いたカードの役職に変わります）。引いた役職はあなたに分かります。山札には、変化役・夜に誰かを選ぶ役職・マーリン・アサシン・共有者・狂信者などは入っていません。変化させられた人には「あなたは A から B(+シャッフラー) になりました。」と知らされます。自分を変化させたときは変化後の役職として勝利すれば単独勝利、他人を変化させたときは変化させた人が変化後の役職として勝利すれば、シャッフラーと一緒に乗っ取り勝利です。ただし、追放・死亡しないと勝てない役職（てるてる・一目惚れしてるてる）以外に変化させたのに対象が死亡すると失敗、村人陣営・人狼陣営の役職に変化させたときはシャッフラー本人が死亡しても失敗です。（処理順: 墓荒らし → ドッペルゲンガー → シャッフラー → グレムリン → 怪盗 → いたずらっ子）" },
    groups: { "transform:silver_shadow": 18 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>山札から引いたカードを上に置きたい人</strong>のカードを1人分押してください。（<strong>自分も選べます</strong>）<br>朝になると、山札から1枚引いてめくり、選んだ人のカードの上に置きます。その人の役職が引いたカードの役職に変わり、引いた役職があなたに分かります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>カードを上に置きたい人</strong>のカードを押して（自分も選べます）",
    },
    stagePick: { self: true },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分も選べる）
    cpuNight: { order: 90, stage: "shuffler", chain: true, run: cpuRun },
    cpuClaim, cpuVoteScore, cpuNotice,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 変化させた相手(自分も選べる)を選ぶ → 山札から引いて置いた役職を選ぶ（マイクラ版の「〇〇を△△に変化させました」）
    coResult: {
      kind: "shuffler", targetLabel: "カードの上に置いた相手", roleHint: "のカードの上に置いた（山札から引いた）役職", self: true,
      roleList: () => pool(),   // 山札に入る役職だけを選べる（配役にいない役職も引けるので、配役の一覧ではなく山札）
      pickRole(role, who, s, K) {
        const w = who === "自分" ? "自分を" : `${who} を`;
        if (role === "hide") return [`${w}変化させました。役職は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [`${w} ${K.rn(role)} に変化させました。`, { kind: "shuffler", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
    },
    night: {
      kind: "shuffler", order: 10,   // ドッペルゲンガーの次の段階（グレムリンの前）。処理順メモ参照
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        const r = shuffle(g, holderOf(g, p.id), t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} をランダムな役職「${c.rn(r.role)}」に変化させました。`);
        c.hold(p.id, `${nameOf(t)} をランダムな役職「${c.rn(ONW.shownRole(r.role))}」に変化させました。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "shuffler");
        c.rev[p.id] = { kind: "shuffler", target: t, role: ONW.shownRole(r.role) };   // 朝の演出用（2of4 で山札からめくって置く演出にする）
      },
    },
    /** 墓荒らし・ドッペルゲンガーでシャッフラーを手にしたとき（朝のうち）: 自分を含む1人を選べる。朝の時点の盤面で山札から引いて置く */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        const r = shuffle(g, id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} をランダムな役職「${c.rn(r.role)}」に変化させました。`);
        const lines = [`${c.nameOf(t)} をランダムな役職「${c.rn(ONW.shownRole(r.role))}」に変化させました。`];
        return { lines, reveal: { kind: "shuffler", target: t, role: ONW.shownRole(r.role) }, nextChain: null };
      },
      /** 昼に使った（酔いが覚めてから使う・昼の連鎖）: 選ばれた人（人間・酔いが覚めている）の画面でも、その場で自分のカードが新しい役職で数秒だけ表になり、「あなたは A から B(+シャッフラー) になりました。」が出る（jobday）。
       *  自分に置いたとき・まだ酔っている人（覚めたとき soberExtra で出す）には出さない。CPUは新しい役職を知るだけ。 */
      dayNotify(c) {
        const g = c.g, t = c.players[0]; if (!t || t === c.id) return;
        const tp = c.byId(t); if (!tp || ONW.hiddenDrunk(g, t)) return;
        const n = notice(g, t); if (!n) return;
        (g.shufflerTold = g.shufflerTold || {})[t] = true;
        if (tp.isCpu) { cpuNotice(g, t, g.currentRoles[t], ONW.cpu.kit); return; }   // CPUは新しい役職を知るだけ
        c.hold(t, n.text); c.send(t, { t: "jobday", id: t, text: n.text, role: n.role });
      },
    },
    // ---- 朝の演出（stage.js の playMorning / morningDur が reveal.kind === "shuffler" のときに呼ぶ。シャッフラー本人の画面）----
    // テーブル中央の山札の一番上のカードが浮く → その場でめくれて引いた役職が見える → 選んだ人のカードの上へ飛んで重なる → 選んだ人のカードが引いた役職で表になる（朝のあいだ表のまま）。
    // 墓荒らし・ドッペルゲンガー経由で朝のうちに選んだとき（stage.onAck）も同じ演出。自分を選んだときは、自分のカードの上に置かれる。
    stageMorning: {
      kind: "shuffler", dur: () => LIFT + FLIP + FLY + LAND + HOLD,
      play(r, SK) {
        const { later } = SK, el = SK.$t(), to = `p:${r.target}`;
        const pile = el.querySelector(".tb-pile .tb-card"), dst = el.querySelector(`[data-k="${to}"] .tb-card`);
        const hide = () => { delete SK.up[to]; delete SK.glow[to]; SK.paint(SK.G()); };   // 置いたカードを裏面に戻す
        if (!pile || !dst || !pile.animate) { SK.show(to, r.role); later(hide, HOLD + 900); return; }   // 山札や席が見つからない・アニメ非対応: 結果だけ出す
        const rp = pile.getBoundingClientRect(), rd = dst.getBoundingClientRect();
        const info = ONW.roles.getInfo(r.role), team = info.team === ONW.TEAM.VILLAGE ? "village" : info.team === ONW.TEAM.WOLF ? "wolf" : "third";
        const ghost = document.createElement("div");   // 山札から引いたカード（裏向きで始まり、めくれて表になる）
        ghost.className = "tb-seat";
        ghost.style.cssText = `position:fixed;left:${rp.left}px;top:${rp.top}px;width:${rp.width}px;height:${rp.height}px;--cw:${rp.width}px;--ch:${rp.height}px;margin:0;padding:0;pointer-events:none;z-index:60;`;
        ghost.innerHTML = `<div class="tb-card" style="width:100%;height:100%"><div class="tb-inner"><div class="tb-back"></div><div class="tb-front tb-team-${team}">${SK.face(r.role)}</div></div></div>`;
        document.body.appendChild(ghost);
        const dx = rd.left - rp.left, dy = rd.top - rp.top;
        ghost.animate([{ transform: "translate(0,0) scale(1)" }, { transform: "translate(0,-14px) scale(1.12)" }], { duration: LIFT, easing: "ease-out", fill: "forwards" });   // ① 山札の一番上が浮く
        later(() => ghost.classList.add("up"), LIFT);                                                                                                    // ② その場でめくれる（引いた役職が見える）
        later(() => {                                                                                                                                  // ③ 選んだ人のカードの上へ飛んで重なる
          ghost.animate([
            { transform: "translate(0,-14px) scale(1.12) rotate(0deg)" },
            { transform: `translate(${dx / 2}px,${dy / 2 - 34}px) scale(1.3) rotate(-5deg)`, offset: 0.5 },
            { transform: `translate(${dx}px,${dy}px) scale(1) rotate(0deg)` },
          ], { duration: FLY, easing: "ease-in-out", fill: "forwards" });
        }, LIFT + FLIP);
        later(() => { SK.show(to, r.role); }, LIFT + FLIP + FLY);                 // ④ 重なったところで、選んだ人のカードが引いた役職で表になる
        later(() => ghost.remove(), LIFT + FLIP + FLY + LAND);
        later(hide, LIFT + FLIP + FLY + LAND + HOLD - 200);                       // ⑥ 少し見せたあと、置いたカードが裏面に戻る                    // ⑤ 重ねたカードを片づける（下のカードがすでに同じ役職で表になっている）
      },
    },
    // ---- 選ばれた人の目線（待機時間 = 朝のあと）----
    // 山札から置かれたカードをいま持っている人(人間)の画面で、自分のカードが新しい役職でめくれて光る（昼になったら伏せる）。「あなたは A から B(+シャッフラー) になりました。」が情報確認に載る。
    //   ・自分に置いたシャッフラー本人には出さない（自分の朝の演出で知っている）。置かれたカードが怪盗などで別の人の手に渡っていたら、渡った先の人には出さない（入れ替わりは知らされない）。
    //   ・酔っ払い（未覚醒）の人にはここでは出さない（酔いが覚めたとき = 3of4）。CPUは画面がないので、新しい役職を知るだけ（cpuNotice）。
    settlePre: { order: 19, run(c) {
      const g = c.g, set = (g.shufflerSettle = {});
      picks(g).forEach(([sh, th, role, self]) => {
        if (self) return;
        const e = (g.shufflerMarks || {})[ONW.cardAt(g, th)];
        if (!e || e.to !== th || ONW.hiddenDrunk(g, th)) return;
        const q = g.players.find((x) => x.id === th); if (!q) return;
        (g.shufflerTold = g.shufflerTold || {})[th] = true;   // 待機時間に知らせた（酔い覚めで二重に出さない）
        if (q.isCpu) { cpuNotice(g, th, role, ONW.cpu.kit); return; }   // CPUも、自分が変えられたことを知る（人間と同じ。新しい役職だけ）
        set[th] = { from: e.from || null, role };
      });
    } },
    settleMsg: { order: 29, run(c, p) {
      const e = (c.g.shufflerSettle || {})[p.id]; if (!e) return {};
      const B = ONW.shownRole(e.role), line = e.from ? `あなたは ${c.rn(ONW.shownRole(e.from))} から ${c.rn(B)}(+シャッフラー) になりました。` : `あなたは ${c.rn(B)}(+シャッフラー) になりました。`;
      return { logs: [line], shuffled: [{ role: B }] };
    } },
    /** 昼のうちの取りこぼし（酔いが覚めたCPUのシャッフラーが昼に選んだ・昼に怪盗などで役職が動いた）: まだ知らされていない、置かれた時点の持ち主（起きている・生きている）に知らせる。
     *  人間には jobday の通知、CPUには新しい役職を知らせる。net.js の dayCheck から呼ばれる（何度呼んでもよい。g.shufflerTold で重複を防ぐ） */
    dayCheck(c) {
      const g = c.g; if (g.phase !== c.PH.ONLINE_DAY) return;
      picks(g).forEach(([, th, , self]) => {
        if (self || (g.shufflerTold || {})[th] || ONW.hiddenDrunk(g, th) || c.isDead(th)) return;
        const tp = c.byId(th), n = notice(g, th); if (!tp || !n) return;
        (g.shufflerTold = g.shufflerTold || {})[th] = true;
        if (tp.isCpu) { cpuNotice(g, th, g.currentRoles[th], ONW.cpu.kit); return; }
        c.hold(th, n.text); c.send(th, { t: "jobday", id: th, text: n.text, role: n.role });
      });
    },
    // ---- 酔いが覚めたとき（昼）: 酔っている間に選ばれた人（置かれた時点の持ち主のまま）に、覚めた瞬間にまとめて知らせる。破局師の soberExtra / stageSober が手本 ----
    //   文章「あなたは A から B(+シャッフラー) になりました。」は「酔いが覚めました。…最終的な役職は B です」のあとに続き、自分のカードが新しい役職で（最終役職として直接）めくれて光る。
    //   A は酔っていた期間に置かれた分も mark.from（置かれる前の役職）。待機時間にすでに知らせた人・自分に置いた本人・カードが別の人の手に渡った人には出さない。
    soberExtra(c, id) {
      const g = c.g; g.shufflerTold = g.shufflerTold || {};
      if (g.shufflerTold[id]) return {};
      const n = notice(g, id); if (!n) return {};
      g.shufflerTold[id] = true;
      return { lines: [n.text], peek: { shuffled: n.role } };
    },
    stageSober: { list: { order: 98, run(sp, list, SK) {
      if (!sp.shuffled) return;
      const k = `p:${ONW.net.myId()}`;   // 自分のカードは soberFlash がめくる。ここでは光らせるだけ
      SK.later(() => { SK.glow[k] = true; SK.paint(SK.G()); }, 300);
      SK.later(() => { delete SK.glow[k]; SK.paint(SK.G()); }, 4300);
    } } },
    stageSettle: {
      field: "settleShuffled", shown: "settleShuffledShown",
      run: { order: 42, run(items, SK) {
        SK.later(() => { items.forEach((it) => SK.show(`p:${ONW.net.myId()}`, it.role, true)); SK.paint(SK.G()); }, 900);   // 自分のカードが新しい役職でめくれて光る
      } },
    },
  });
})(window.ONW);
