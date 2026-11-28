/* 糸紡ぎ（第三陣営・発案: くろは・元ネタ: オリジナル。マイクラ版 state.js / night.js / vote.js / game.js / utils.js / main.js / cpu.js / extraRoles.js 準拠）
 * 夜に自分以外のプレイヤー2人を選び、ペア状態にする（マイクラ版 ROLE_INFO そのまま）:
 *   ・ペアの片方が死亡すると、もう片方は1/2の確率で後追いし、糸紡ぎも（確率なしで必ず）後追いする。
 *   ・ペアがどちらも生存していれば、糸紡ぎは単独勝利する（糸紡ぎ自身の生死は問わない。vote.js の分岐 2.6 = hit(14)。
 *     処刑人の下・恋人の上。docs/victory-priority.md）。
 *   ・ペアが黄泉や抹消の人狼で消された場合、糸紡ぎは敗北する（ペア消滅 = 勝利条件を失う）。
 * 状態（すべて役職に紐づく記録。ONW.ROLE_BOUND_KEYS に登録し、カードが動いたらついていく。マイクラ版
 * transferRoleBoundSpecialData / transferThreadPairOwner の "move" と同じ。乞食の取り込みでも移る）:
 *   g.threadPair[持ち主ID]   = [A, B]（ペアの2人。プレイヤー単位のまま。対象の役職が動いても変わらない）
 *   g.threadPairNo[持ち主ID] = ペア番号（作られた順に 1, 2, …。マイクラ版 threadPairs の index）
 *   g.threadPairNext          = 次のペア番号（カウンタ。試合ごと）
 *   g.threadRolls             = { "カードID:メンバーID": true/false }（1/2の抽選結果。1回だけ抽選してキャッシュ。
 *                               カード単位なので、役職が動いても同じペアの抽選は変わらない。マイクラ版 threadPairFollowRolls）
 *   g.threadRemovedOwners     = [持ち主ID]（黄泉・抹消・役職の上書きでペアを消された持ち主。敗北扱い。マイクラ版 threadPairRemovedOwners）
 *   g.threadFollowDeaths      = [メンバーID]（ペアの後追いで死んだメンバー。実績 thread_pair_follow_victim 用。糸紡ぎ自身の後追いは含めない。マイクラ版 threadPairFollowDeathIds）
 *   g.threadEvents            = [{ dead, follower, a, b, no, owner, member }]（後追いが起きた記録。結果発表の白い糸の演出用）
 *   g.threadSeen              = { 持ち主ID: "A>B" }（持ち主にペアを知らせた記録。酔い覚め・昼の知らせの重複防止）
 * 演出（作者メモ）:
 *   ・夜の接続: 糸紡ぎ本人の画面でだけ、朝に選んだ2人のカードが 🧵 の印（stage.js の THREAD_MARK 面 "__thread"）で
 *     めくれ、2人を白い糸（SVG の線。stage.threadShow）がつなぐ。選ばれた2人には知らせない（マイクラ版どおり）。
 *   ・後追い: 確率の後追いが起きるときは、全員の画面で白い糸が見えて → 糸が切れて → 後追いする（結果発表の
 *     stage.js flipChain / dayDead の糸の場面。糸紡ぎ自身の後追いでも同じ糸の場面を出す）。
 * 変化候補: 銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に THREAD_SPINNER が入る）。
 *   光の使徒・闇の化身・コスプレには入らない。模倣は Web の共通流儀で第三陣営は対象外。ペルソナは Web版未実装。
 *   シャッフラー: マイクラ版 shufflerEligibleRoles の除外リストに入っていないので山札に入る（BLOCKED に足さない）。
 * ハッキング: マイクラ版の対象外（ヴァニティ・ホタルのみ）に入っていないので対象になる。思い込み先にもなる
 *   （silver_wolf.js の fakeResult に偽の結果文「○○と○○をペア状態にしました。」あり。マイクラ版の偽文と同じ）。
 *   本物の糸紡ぎがハッキングされている間は、本当の夜の行動は裏で自動的に使われる（cpu.js の autoReal。cpuNight がそのまま使われる）。
 * 乞食: マイクラ版 isBeggarSwapExcludedTarget に入っていないので取れる（ペアの記録はカードについて移る）。
 *   糸の後追いで死んだ人は、マイクラ版どおり即時交換・投票交換（死因グループ "follow"）の対象になる（beggar.js の deathReason）。
 * 封印の対象: 自分も封印される（info.sealTarget: true。マイクラ版 YAMINABE_SEAL_TARGET_ROLES に THREAD_SPINNER が入る）。
 *   封印されている糸紡ぎは夜に選べない（共通の failIfSealed）。
 * 黄泉: 対象がペアのメンバーならそのペアを、対象が糸紡ぎ（持ち主）ならそのペアを断ち切る（yomi.js の cuts
 *   "thread_pair" / "thread_pair_owner"。マイクラ版 yomiCutStates と同じ）。消された糸紡ぎは敗北する。
 * 抹消の人狼: 対象がペアのメンバーならそのペアは消える（マイクラ版 removeThreadPairsByPlayer "eraser"）。
 *   対象が糸紡ぎ自身なら、役職の上書きでペアも消える（"owner_lost"）。
 * 解釈点:
 *   ・呪術の人狼の呪殺でペアの片方が死んだ場合は、Web版の貫通ルール（心中・後追いは一切起きない。呪術の人狼の
 *     移植で確立）に合わせて、糸の後追いも起きない（マイクラ版は死者集合ベースで発動しうるが、Web版の流儀を優先）。
 *   ・グレムリンのコピーで糸紡ぎをコピーしたら、マイクラ版の "copy" と同じく、同じ2人の新しいペア（新しい番号）ができる。
 *     ドッペルゲンガーのコピーは引き継がない（キューピッド・マティアスと同じく、朝のうちに自分で選ぶ）。
 *   ・結果履歴のメンバーへの「(+ペア)」札はマイクラ版の結果履歴に合わせた（番号なし。マイクラ版 game.js の (+ペア)）。
 * CPU: 夜は自分以外の2人をランダム（デバッグ指定があればそれ。マイクラ版 cpuSpecifiedAbilityTarget +
 *   cpuSpecifiedSecondTarget と同じ）。発言（マイクラ版 cpu.js）: ペアがいれば糸紡ぎCOし、結果開示
 *   「○○と○○をペアにしていました。」（結果開示なので AI議論OFF でも出る）。
 * 実績（Wiki）: first_thread_spinner / win_thread_spinner / thread_spinner_loss（敗北）/
 *   thread_pair_follow_victim（メンバーが後追い死）/ thread_pair_removed（ペアを黄泉・抹消で消される）
 *   （Web版に実績の保存は無いので ID の返却のみ）。
 */
(function (ONW) {
  const ID = "thread_spinner";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const has = (g, id) => !!id && (g.players || []).some((q) => q.id === id);
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const MARK = "__thread";   // 🧵（stage.js の THREAD_MARK）

  const T = (ONW.threadSpinner = {
    /** 最終盤面で糸紡ぎを持っている人のID */
    holders(g) { return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id); },
    /** その持ち主のペア [A, B]（無ければ null）。記録は役職（カード）について動く */
    pairOf(g, holderId) {
      const pr = ONW.getRoleBound(g, "threadPair", holderId);
      return Array.isArray(pr) && pr.length === 2 && pr[0] !== pr[1] && has(g, pr[0]) && has(g, pr[1]) ? [pr[0], pr[1]] : null;
    },
    /** その持ち主のペア番号（無ければ null） */
    pairNoOf(g, holderId) { const n = ONW.getRoleBound(g, "threadPairNo", holderId); return Number.isFinite(+n) && +n > 0 ? +n : null; },
    /** 成立しているペアすべて [{ holder, a, b, no, card }]（最終盤面の持ち主ごと。ペアを消された持ち主は含めない） */
    pairs(g) {
      const out = [];
      (g.players || []).forEach((p) => {
        if ((g.currentRoles || {})[p.id] !== ID) return;
        const pr = T.pairOf(g, p.id);
        if (!pr) return;
        out.push({ holder: p.id, a: pr[0], b: pr[1], no: T.pairNoOf(g, p.id) || 0, card: ONW.cardAt(g, p.id) });
      });
      return out;
    },
    /** ペアを作る（夜・朝の連鎖・CPU・裏の自動行動の共通入口）。作り直しはできない（1試合に1回。マイクラ版は threadPairByOwner で1人1組） */
    act(g, holderId, a, b) {
      if (!has(g, a) || !has(g, b) || a === b || a === holderId || b === holderId) return false;
      if (T.pairOf(g, holderId)) return false;
      const no = Math.max(1, (g.threadPairNext = (g.threadPairNext || 1)));
      g.threadPairNext = no + 1;
      ONW.setRoleBound(g, "threadPair", holderId, [a, b]);
      ONW.setRoleBound(g, "threadPairNo", holderId, no);
      return true;
    },
    /** 1/2の抽選（ペアのカード＋メンバーごとに1回だけ。マイクラ版 rollThreadPairFollow）。true = 後追いする */
    roll(g, pair, memberId) {
      const rolls = (g.threadRolls = g.threadRolls || {}), key = pair.card + ":" + memberId;
      if (!(key in rolls)) rolls[key] = Math.random() < 0.5;
      return rolls[key];
    },
    /**
     * deadId（ペアのメンバー）が死んだときに後を追う人。戻り値: [{ id, kind: "thread", dead, a, b, no, owner, member }]
     *   ・もう片方のメンバー: 抽選に当たれば後追い（member: true）。
     *   ・糸紡ぎ（持ち主）: メンバーのどちらかが死んでいれば必ず後追い（member: false）。持ち主が死ねば
     *     それ以上は出てこないので、2人目のメンバーが死んだときに再び出てきても、呼び出し側が「すでに死んでいる」で弾く。
     * isDeadFn(id): 呼び出し側の「死んでいる」判定（投票解決は done/gone、昼中は g.deadIds）。
     * すでに死んでいる人・死んだ本人は含めない。呼び出し側（vote.js kill / state.js deathFollowers）が実際の死亡処理をする。
     * 注意: この関数は演出の予定計算（ONW.deathPlan）からも呼ばれるので、抽選のキャッシュ以外の状態は変えない。
     */
    followers(g, deadId, isDeadFn) {
      const dead = isDeadFn || ((id) => isDead(g, id));
      const out = [];
      T.pairs(g).forEach((pr) => {
        if (pr.a !== deadId && pr.b !== deadId) return;
        const other = pr.a === deadId ? pr.b : pr.a;
        if (other !== deadId && !dead(other) && T.roll(g, pr, other)) out.push({ id: other, kind: "thread", dead: deadId, a: pr.a, b: pr.b, no: pr.no, owner: pr.holder, member: true });
        if (pr.holder !== deadId && !dead(pr.holder)) out.push({ id: pr.holder, kind: "thread", dead: deadId, a: pr.a, b: pr.b, no: pr.no, owner: pr.holder, member: false });
      });
      return out;
    },
    /** 後追いが実際に起きたことを記録する（結果発表の白い糸の演出・実績用。実際に死んだときだけ呼ぶ） */
    noteEvent(g, f) {
      if (!f) return;
      (g.threadEvents = g.threadEvents || []).push({ dead: f.dead, follower: f.id, a: f.a, b: f.b, no: f.no || 0, owner: f.owner, member: !!f.member });
      if (f.member) { const d = (g.threadFollowDeaths = g.threadFollowDeaths || []); if (!d.includes(f.id)) d.push(f.id); }
    },
    /**
     * ペアを消す（マイクラ版 removeThreadPair）。reason: "eraser" | "yomi" | "owner_lost"。
     * 消された持ち主は g.threadRemovedOwners に記録され、単独勝利できなくなる（敗北）。
     */
    removePair(g, holderId, reason) {
      if (!T.pairOf(g, holderId)) return false;
      if (g.threadPair) delete g.threadPair[holderId];
      if (g.threadPairNo) delete g.threadPairNo[holderId];
      const r = (g.threadRemovedOwners = g.threadRemovedOwners || []);
      if (!r.includes(holderId)) r.push(holderId);
      return true;
    },
    /** メンバーとして target を含むペアをすべて消す（黄泉・抹消の人狼。マイクラ版 removeThreadPairsByPlayer） */
    removeByPlayer(g, targetId, reason) {
      let n = 0;
      T.pairs(g).filter((pr) => pr.a === targetId || pr.b === targetId).forEach((pr) => { if (T.removePair(g, pr.holder, reason)) n++; });
      return n;
    },
    /** 持ち主のペアを消す（黄泉で糸紡ぎ自身が対象になったとき。マイクラ版 removeThreadPairsByOwner） */
    removeByOwner(g, holderId, reason) { return T.removePair(g, holderId, reason) ? 1 : 0; },
    /** 役職が上書きされて糸紡ぎでなくなった人のペアを消す（state.js の copyRole / shufflerPlace / cosplayPlace、抹消の overwrite から呼ぶ。"owner_lost"） */
    losePair(g, id) { return T.removePair(g, id, "owner_lost"); },
    /**
     * グレムリンのコピー（マイクラ版 transferRoleBoundSpecialData の "copy"）: 糸紡ぎをコピーしたら、
     * コピー元のペアと同じ2人の、新しいペア（新しい番号）がコピー先にできる。state.js の gremlinCopy から呼ばれる。
     * ドッペルゲンガーのコピーでは呼ばない（引き継がず、朝のうちに自分で選ぶ）。
     */
    copyPair(g, srcId, dstId, role) {
      if (role !== ID || srcId === dstId) return;
      const pr = T.pairOf(g, srcId);
      if (!pr) return;
      if (T.pairOf(g, dstId)) T.removePair(g, dstId, "owner_lost");
      const no = Math.max(1, (g.threadPairNext = (g.threadPairNext || 1)));
      g.threadPairNext = no + 1;
      ONW.setRoleBound(g, "threadPair", dstId, [pr[0], pr[1]]);
      ONW.setRoleBound(g, "threadPairNo", dstId, no);
    },
    /** 黄泉で断ち切る（yomi.js の cut から呼ぶ）。戻り値: 断ち切った状態のID（"thread_pair" = メンバーとして / "thread_pair_owner" = 持ち主として） */
    yomiCut(g, target) {
      const cuts = [];
      if (T.removeByPlayer(g, target, "yomi")) cuts.push("thread_pair");
      if (T.removeByOwner(g, target, "yomi")) cuts.push("thread_pair_owner");
      return cuts;
    },
    /** 単独勝利できる糸紡ぎ（vote.js の分岐 2.6 が呼ぶ。dead = vote.deadSet）: ペアが残っていて、2人とも死亡していない。
     *  糸紡ぎ自身の生死は問わない。ペアを消された持ち主・恋人になっている糸紡ぎは対象外（マイクラ版の limited winners と同じく恋人は単独勝利の枠から外れる） */
    winIds(g, dead) {
      const d = dead instanceof Set ? dead : new Set(dead || []);
      return T.pairs(g)
        .filter((pr) => !(g.threadRemovedOwners || []).includes(pr.holder))
        .filter((pr) => !d.has(pr.a) && !d.has(pr.b))
        .filter((pr) => !(ONW.isLover && ONW.isLover(g, pr.holder)))
        .map((pr) => pr.holder);
    },
    /** 結果発表の役職情報（マイクラ版 buildThreadSpinnerResultLines + ペアの開示） */
    lines(g, nameOf) {
      const n = nameOf || ((id) => nm(g, id)), out = [];
      T.pairs(g).forEach((pr) => {
        out.push({ by: n(pr.holder), text: `${n(pr.holder)} は ${n(pr.a)} と ${n(pr.b)} をペアにしていました。` });
        [pr.a, pr.b].forEach((m) => {
          const key = pr.card + ":" + m, rolls = g.threadRolls || {};
          if (key in rolls) out.push({ by: n(pr.holder), text: `ペア${pr.no}の${n(m)}は1/2の確率で${rolls[key] ? "後追いしました" : "生き残りました"}。` });
        });
      });
      return out;
    },
    /** 実績（マイクラ版 stats.js と同じ条件。最終役職で判定する） */
    achievements(g, id, won) {
      if (!g) return [];
      const out = [];
      if ((g.threadFollowDeaths || []).includes(id)) out.push("thread_pair_follow_victim");   // ペアにされた状態で後追い死亡した
      if ((g.threadRemovedOwners || []).includes(id)) out.push("thread_pair_removed");   // 作ったペアを黄泉または抹消の人狼に消された（最終役職は不問。マイクラ版準拠）
      if ((g.currentRoles || {})[id] !== ID) return out;
      out.push("first_thread_spinner");
      if (won) out.push("win_thread_spinner");
      else out.push("thread_spinner_loss");   // 糸紡ぎで敗北する
      return out;
    },
  });

  // ---- CPUの夜の行動: 自分以外の2人をランダムに選ぶ（デバッグの指定があればそれ。マイクラ版 cpuSpecifiedAbilityTarget + cpuSpecifiedSecondTarget） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id), others = g.players.filter((q) => q.id !== p.id);
    if (others.length < 2) return;
    let pair = (f.players || []).filter((id, k, arr) => n.validPlayer(p, id) && arr.indexOf(id) === k).slice(0, 2);
    if (pair.length < 2) pair = [...pair, ...ONW.utils.shuffle(others.filter((q) => !pair.includes(q.id))).slice(0, 2 - pair.length).map((q) => q.id)];
    const [a, b] = pair;
    if (!T.act(g, p.id, a, b)) return;
    (g.threadSeen = g.threadSeen || {})[p.id] = a + ">" + b;
    i.mode = "thread"; i.pair = [a, b];
    g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, a)} と ${nm(g, b)} をペアにしました。`);
    n.hold(p.id, `${nm(g, a)} と ${nm(g, b)} をペアにしました。`);
    n.ob(p.id, [a, b]);
    n.nn(rid);
  }

  /** 朝の演出: 糸紡ぎ本人の画面で、選んだ2人のカードが 🧵 でめくれ、白い糸でつながる（選ばれた人には出ない） */
  const pairReveal = (a, b) => ({ kind: "peek", items: [{ k: `p:${a}`, role: MARK }, { k: `p:${b}`, role: MARK }], thread: [a, b] });
  /** ペアを記録する共通処理（夜の解決・朝の連鎖）。戻り値: 朝の演出（作れなければ null） */
  function doAct(g, holderId, a, b) {
    if (!T.act(g, holderId, a, b)) return null;
    (g.threadSeen = g.threadSeen || {})[holderId] = a + ">" + b;
    return pairReveal(a, b);
  }

  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 141, name: "糸紡ぎ", team: ONW.TEAM.THIRD, wakeOrder: 47, sort: 56,
      desc: "第三陣営。夜に自分以外のプレイヤー2人を選び、ペア状態にします。ペアの片方が死亡すると、もう片方は1/2の確率で後追いし、糸紡ぎも後追いします。ペアがどちらも生存していれば、糸紡ぎは単独勝利します。ペアが黄泉や抹消の人狼で消された場合、糸紡ぎは敗北します。" },
    groups: { "transform:silver_shadow": 31 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に THREAD_SPINNER が入る）。光の使徒・闇の化身には入らない
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>ペアにする2人</strong>のカードを押してください。（自分以外の2人）<br>ペアの片方が死亡すると、もう片方は1/2の確率で後追いし、あなたも後追いします。2人とも生存していれば、あなたの単独勝利です。${later}</p>${nowSel(" ／ ", 2)}`;
      },
      chainReady: (np) => np === 2,
      chainHow: () => "<strong>ペアにする2人</strong>のカードを押して（自分以外の2人）",
    },
    stagePick: { players: 2 },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー2人
    cpuNight: { order: 21, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 21,   // 占い師と同じ段階（キューピッド・純愛者・悪女と同じ2人選択。マイクラ版も占い師段階の2人選択役職）
      complete: (np) => np === 2,
      normalize: (c, players) => ({ players: players.slice(0, 2), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const [a, b] = c.selOf(p).players; if (!a || !b || a === b) return;
        const rev = doAct(g, p.id, a, b);
        if (!rev) return;
        g.nightLogsAll.push(`${c.rn(ID)} ${p.name} は ${nameOf(a)} と ${nameOf(b)} をペアにしました。`);
        c.hold(p.id, `${nameOf(a)} と ${nameOf(b)} をペアにしました。`);
        ONW.observeNote(g, p.id, [a, b], null, ID);
        ONW.newsNote(g, ID);
        c.rev[p.id] = rev;   // 朝、選んだ2人のカードが 🧵 でめくれて白い糸でつながる（選んだ人の画面だけ）
      },
    },
    /** 墓荒らし・ドッペルゲンガーで糸紡ぎを手にしたとき: 朝のうちに2人選んでペアにできる（昼に酔いが覚めて手にしたときも同じ） */
    morning: {
      run(c) {
        if (c.players.length < 2) return null;
        const g = c.g, id = c.id, [a, b] = c.players;
        const rev = doAct(g, id, a, b);
        if (!rev) return null;
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(a)} と ${c.nameOf(b)} をペアにしました。`);
        return { lines: [`${c.nameOf(a)} と ${c.nameOf(b)} をペアにしました。`], reveal: rev, nextChain: null };
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): ペアにした2人を選ぶ（2人の順序に意味はない）
    coResult: {
      kind: "thread_spinner", twoHint: "ペアにした2人を選んでください。",
      pickTwo: (sel, K) => [`ペアにした2人は ${K.nameOf(sel[0])} と ${K.nameOf(sel[1])} です。`, { kind: "thread_spinner", pair: [sel[0], sel[1]] }, null, "disclose", `${K.nameOf(sel[0])} 🧵 ${K.nameOf(sel[1])}`],
    },
    /** CPUの発言（マイクラ版 cpu.js）: ペアがいれば糸紡ぎCO + 結果開示「○○と○○をペアにしていました。」（結果開示なので AI議論OFF でも出る）。いなければ通常の騙り */
    cpuClaim(k, g, p, r, i, c) {
      const pr = T.pairOf(g, p.id) || (i && i.pair);
      if (!pr) return false;
      c.co = ID;
      c.result = { text: `${nm(g, pr[0])}と${nm(g, pr[1])}をペアにしていました。`, short: `${nm(g, pr[0])} 🧵 ${nm(g, pr[1])}`, claim: { kind: "thread_spinner", pair: [pr[0], pr[1]] } };
    },
    /** 酔いが覚めた本人に、糸紡ぎの情報をまとめて出す（net.js の soberUp）: 持ち主なら選んだ2人のカードが 🧵 でめくれる */
    soberExtra(c, id) {
      const g = c.g, lines = [], peek = {};
      const pr = (g.currentRoles || {})[id] === ID ? T.pairOf(g, id) : null;
      if (pr && (g.threadSeen || {})[id] !== pr[0] + ">" + pr[1]) {
        (g.threadSeen = g.threadSeen || {})[id] = pr[0] + ">" + pr[1];
        lines.push(`あなたのペアは ${nm(g, pr[0])} と ${nm(g, pr[1])} です。`);
        peek.threadMates = pr.slice();
      }
      return { lines, peek: peek.threadMates ? peek : {} };
    },
    /** 酔いが覚めた画面: 選んだ2人のカードが 🧵 でめくれる */
    stageSober: { list: { order: 99, run(sp, list, SK) {
      (sp.threadMates || []).forEach((t) => { if (!list.some((x) => x[0] === `p:${t}`)) list.push([`p:${t}`, SK.THREAD_MARK, true]); });
    } } },
    /** 昼のうちに役職が動いて糸紡ぎを手にした人へ、ペアをまだ知らされていなければ知らせる（net.js の dayCheck から呼ばれる） */
    dayCheck(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      T.holders(g).forEach((hold) => {
        const pr = T.pairOf(g, hold), hp = g.players.find((q) => q.id === hold);
        if (!pr || !hp || hp.isCpu || c.isDead(hold)) return;
        if ((g.threadSeen || {})[hold] === pr[0] + ">" + pr[1]) return;
        (g.threadSeen = g.threadSeen || {})[hold] = pr[0] + ">" + pr[1];
        const text = `あなたのペアは ${nm(g, pr[0])} と ${nm(g, pr[1])} です。`;
        c.hold(hold, text);
        c.send(hold, { t: "jobday", id: pr[0], text, role: MARK, items: [{ id: pr[0], role: MARK }, { id: pr[1], role: MARK }] });
      });
    },
    // 結果発表の演出（stage.js の startResult / skipResult が引く）: 白い糸の場面は stage.js の flipChain / dayDead が
    //   res.history の thread 情報で出す（全員目線）。ここはスキップ・中断時に糸の描画を片付けるだけ
    stageResult: {
      clear(R) { document.querySelectorAll(".th-arrows").forEach((e) => e.remove()); },
    },
    achievements(g, id, won) { return T.achievements(g, id, won); },
  });
})(window.ONW = window.ONW || {});
