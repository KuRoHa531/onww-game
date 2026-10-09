/**
 * 鍵師（マイクラ版 KEYMASTER を参考）: 村人陣営。
 * 夜に「自分を含む全プレイヤー」から1人を選び、その人の役職にロック（鍵）をかける。
 * ロックされた人は、役職変化系（怪盗・いたずらっ子・墓荒らし・ドッペルゲンガー・シャッフラー・グレムリンなど）の影響を受けない。
 *   ・自分の役職がロックされている変化役は、能力が「🔒に弾かれて」失敗する。
 *   ・ロックされた人を対象にした変化も、「🔒に弾かれて」失敗する。
 *   ・同じ人に鍵師が2人（奇数・偶数）かけると、2回目は「ロック解除」になる（マイクラ版 lockRoleTarget と同じ：1回目=ロック／2回目=解除…）。
 *
 * 【処理順】（_wip/役職の処理順.txt）: 純愛者 → 悪女 → キューピッド → 破局師 → 鍵師 → … → 墓荒らし → ドッペル → … → 怪盗 …
 *   鍵師は夜の「占い師の段階」(seer)で、破局師(22)の直後(23)に処理する。ほかの役職変化はすべてそのあと（relic 以降の段階）なので、
 *   ロックは役職変化の「前に」必ず完了している。Web版は夜の選択を朝にまとめて解決するので、マイクラ版のように
 *   「鍵師が終わるまで他の人の能力GUIが開かない」ことはなく、鍵師がいることは透けない。
 *
 * ロックは「プレイヤー（席）」についている（g.keyLocks[プレイヤーID] = 回数。奇数 = ロック中）。役職カードが動いてもロックは席に残る。
 * 「誰を選んだか」は役職の持ち主単位で記録（ONW.setRoleBound(g, "keyTargets", 持ち主ID, 相手ID)。state.js の【必読】メモ）。
 * 実装の進み具合は _wip/鍵師_依頼文.txt を参照。
 *  1of4: 登録・夜の選択(自分も可)・ロックの記録(切り替え)・役職移動への追従・ルールコード・処理順・CPUの夜の行動・闇鍋シナジー【済】
 *  2of4: ロックの効果【済】= 2of4a(怪盗・いたずらっ子・墓荒らし・ドッペル。共通部品 gate / failLine / fail) + 2of4b(シャッフラー・グレムリン・背徳者・情報確認・新聞)
 *  3of4: 朝の演出(🔓→🔑→🔒)・失敗の演出(🔒に弾かれる)・酔い・昼のうち【済】
 *  4of4: CPU(発言=本当の鍵師は鍵をかけた相手をCO・人外は鍵師の騙り / 投票の加点)・COボタンの結果開示(鍵をかけた相手 / 情報開示「ロックされて失敗した」)・ガイド・総合テスト【済】
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.KEYMASTER;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

  // ---- ロックの状態（席ごと。回数が奇数ならロック中） ----
  /** その席の役職がいまロックされているか */
  const locked = (g, id) => (((g && g.keyLocks) || {})[id] || 0) % 2 === 1;
  /** ロック中の席すべて */
  const lockedIds = (g) => g.players.filter((p) => locked(g, p.id)).map((p) => p.id);
  /** 鍵をかける（もう一度かけると解除）。holderId = 鍵師のカードの持ち主、t = 対象の席。戻り値 = "lock" | "unlock"（かけたあとの状態） */
  function toggle(g, holderId, t) {
    (g.keyLocks = g.keyLocks || {})[t] = ((g.keyLocks || {})[t] || 0) + 1;
    const act = locked(g, t) ? "lock" : "unlock";
    ONW.setRoleBound(g, "keyTargets", holderId, t);
    (g.keyActs = g.keyActs || {})[ONW.cardAt(g, holderId)] = { target: t, action: act };   // カード単位（朝の演出・結果開示用）
    (g.keyLog = g.keyLog || []).push({ by: holderId, target: t, action: act });
    return act;
  }
  /** 最終盤面で鍵師のカードを持っている人の [持ち主, 選んだ相手]（記録のない人は除く） */
  function picks(g) {
    const out = [];
    g.players.forEach((p) => {
      if (g.currentRoles[p.id] !== R_()) return;
      const t = ONW.getRoleBound(g, "keyTargets", p.id);
      if (!t || !g.players.some((q) => q.id === t)) return;
      out.push([p.id, t]);
    });
    return out;
  }
  // ---- ロックの効果（2of4）: 役職変化系は「ロックに弾かれて」失敗する ----
  /** 変化できるか。actor = 能力を使う人の席、targets = 変化の対象にする席（墓荒らしの墓地・ドッペルのコピー元など、役職が動かない相手は渡さない）
   *  戻り値: null = できる / "self" = 自分の席の役職がロックされている / "target" = 対象の席のどれかがロックされている（自分が先） */
  function gate(g, actor, targets) {
    if (locked(g, actor)) return "self";
    if ((targets || []).some((t) => locked(g, t))) return "target";
    return null;
  }
  /** 失敗の文章（本人に朝に届く）。verb = 交換 / 入れ替え / コピー、two = 対象が2人（いたずらっ子） */
  function failLine(kind, verb, two) {
    if (kind === "self") return `自身の役職がロックされていたため${verb}に失敗しました。`;
    if (verb === "コピー") return "選んだプレイヤーの役職がロックされていたためコピーに失敗しました。";
    return two ? "選んだプレイヤーのどちらかの役職を変更できませんでした。" : "選んだプレイヤーの役職を変更できませんでした。";
  }
  /** 失敗を記録して、本人向けの文章を返す。g.keyFails[カードID] = { kind, verb, targets, locked }（3of4の「🔒に弾かれる」演出・結果開示が使う）。
   *  ログは g.nightLogsAll に積む（label = 「怪盗 ○○」のような名乗り） */
  function fail(g, actor, kind, verb, targets, label, two) {
    const line = failLine(kind, verb, two);
    (g.keyFails = g.keyFails || {})[ONW.cardAt(g, actor)] = { kind, verb, targets: [...(targets || [])], locked: kind === "self" ? [actor] : (targets || []).filter((t) => locked(g, t)) };
    const tn = (targets || []).map((t) => nm(g, t)).join(" と ");
    g.nightLogsAll.push(kind === "self" ? `${label} は 自身の役職がロックされていたため${verb}に失敗しました。` : `${label} は ${tn} の役職がロックされていたため${verb}に失敗しました。`);
    return line;
  }
  /** 失敗の演出（朝。本人の画面だけ）: g.keyFails から作る。actor = fail に渡した席、viewer = 演出を見る人の席。
   *  自分の席がロック中 → 自分のカードが🔒に弾かれる / 対象がロック中 → ロック中の対象のカードが🔒に弾かれる。
   *  対象が2人（いたずらっ子）でどちらか片方だけがロック中のときは、文章と同じく「どちらか」のままにして、2人のカードを（🔒を出さずに）揺らすだけにする */
  function failRev(g, actor, viewer) {
    const f = (g.keyFails || {})[ONW.cardAt(g, actor)];
    if (!f) return null;
    if (f.kind === "self") return { kind: "key", mode: "fail", ids: [viewer], lock: true };
    const lk = f.locked || [], tg = f.targets || [];
    if (tg.length > 1 && lk.length < tg.length) return { kind: "key", mode: "fail", ids: tg.slice(), lock: false };
    return { kind: "key", mode: "fail", ids: lk.slice(), lock: true };
  }
  const verb = (act) => (act === "unlock" ? "のロックを解除" : "の役職をロック");
  const lineOf = (g, t, act) => `${nm(g, t)}${verb(act)}しました。`;
  ONW.keymaster = { locked, lockedIds, toggle, picks, lineOf, verb, nm, gate, failLine, fail, failRev };

  // ---- CPUの夜の行動: 自分を含む全員からランダムに1人（デバッグの指定があればそれ。自分も指定できる） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const ok = (id) => id && g.players.some((q) => q.id === id);
    const t = ok(f.player) ? f.player : n.pick(g.players).id;
    const act = toggle(g, p.id, t);
    if (!cur) { i.mode = "keymaster"; i.target = t; }
    i.keyLock = { target: t, action: act };   // 発言(4of4)・投票判断が使う
    g.nightLogsAll.push(`${label} ${p.name} は ${lineOf(g, t, act)}`);
    n.ob(p.id, [t]);
    n.nn(rid);
  }

  // ---- CPUの発言・投票（4of4） ----
  const claimOf = (k, g, t, act) => ({ short: `${nm(g, t)} → ${act === "unlock" ? "ロック解除" : "ロック"}`, text: lineOf(g, t, act), claim: { kind: "keymaster", target: t, action: act } });
  /** 本当の鍵師のCPU: 夜に鍵をかけた相手を正直にCOする（役職が動いて鍵師でなくなっていたら通常の扱い） */
  function cpuClaim(k, g, p, r, i, c) {
    if (!i.keyLock) return false;
    c.co = "keymaster"; c.result = claimOf(k, g, i.keyLock.target, i.keyLock.action);
  }
  /** 騙り: 鍵師を名乗る人外は、適当な相手に「鍵をかけた」と言う */
  function lieClaim(k, g, p, others, selfRole, co) {
    const t = k.fakeSeerTarget(g, p);
    return { co, result: claimOf(k, g, t.id, "lock") };
  }
  /** 投票の加点: 自分が本当の鍵師(夜に鍵をかけた)なのに、ほかにも鍵師COをしている人がいれば怪しい。
   *  自分がロックした人は役職が変わっていない（変化役の能力が弾かれている）ので、その人が「変化役の能力が成功した」と言っていたら嘘 */
  function cpuVoteScore(k, g, p, q, i) {
    let s = 0;
    const co = (g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co) || null;
    if (i.keyLock && co === "keymaster" && q.id !== p.id) s += 2.5;
    if (i.keyLock && i.keyLock.action === "lock" && q.id === i.keyLock.target) {
      const claims = g.cpuClaims || [];
      if (claims.some((c) => c.from === q.id && ["robber", "relic", "troublemaker", "doppel"].includes(c.kind))) s += 1.2;
    }
    return s;
  }
  ONW.defineRole("keymaster", {
    info: { deck: 63, name: "鍵師", team: ONW.TEAM.VILLAGE, wakeOrder: 45, sort: 24,
      desc: "村人陣営。夜に自分を含むプレイヤーを1人選び、その人の役職にロック（鍵）をかけます。ロックされた役職は、怪盗・いたずらっ子・墓荒らし・ドッペルゲンガー・シャッフラー・グレムリンなどの役職変化系の影響を受けません。ロックされた人の変化も、ロックされた人が使う変化も、🔒に弾かれて失敗します。鍵師は変化役より先に処理されるので、他の人の夜の画面に影響せず、鍵師がいることは透けません。朝、鍵師から見て選んだ人のカードが🔓から🔑で鍵がかかって🔒になり、ロックされて失敗した人のカードは🔒に弾かれます。同じ人に鍵師が2人かけると、2回目はロック解除になります。ご主人のいない背徳者がロックされると、狂人に変化できず勝利条件と投票権を失います。" },
    groups: { "transform:light_apostle": 4.5 },   // 光の使徒の変化先（墓荒らしの次・いたずらっ子の前あたり）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>ロック（鍵）をかけたい人</strong>のカードを1人分押してください。（<strong>自分も選べます</strong>）<br>その人の役職は、怪盗・いたずらっ子・墓荒らし・ドッペルゲンガー・シャッフラー・グレムリンなどの変化の影響を受けなくなります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>ロックをかけたい人</strong>のカードを押して（自分も選べます）",
    },
    // 朝の演出(stage.js の playMorning / morningDur が reveal.kind === "key" のときに呼ぶ)
    //   mode "lock": 🔓のカードが表になる → 🔑が差し込まれてまわる → 🔒（鍵がかかる）
    //   mode "unlock": 🔒 → 🔑 → 🔓（鍵師が2人で同じ人を選んだとき）
    //   mode "fail": 失敗した変化役の画面。カードが（🔒に）弾かれて揺れる。lock が false のときは🔒を出さず揺れるだけ（どちらがロック中か分からないまま）
    stageMorning: {
      kind: "key",
      dur: (r) => (r.mode === "fail" ? 1500 : 2500),
      play(r, SK) {
        const { later, show, paint, up, G } = SK;
        const ids = r.ids || [];
        if (r.mode === "fail") {
          ids.forEach((id, i) => later(() => {
            const k = `p:${id}`;
            if (r.lock) show(k, SK.KEYLOCK_MARK, true);
            later(() => { const el = SK.$t(), card = el && el.querySelector(`[data-k="${k}"] .tb-card`); if (card && card.animate) card.animate([{ transform: "translateX(0)" }, { transform: "translateX(-9px) rotate(-4deg)" }, { transform: "translateX(9px) rotate(4deg)" }, { transform: "translateX(-6px) rotate(-2deg)" }, { transform: "translateX(0)" }], { duration: 520, easing: "ease-in-out" }); }, 650);
          }, i * 250));
          return;
        }
        const lock = r.mode !== "unlock", [A, T, B] = lock ? [SK.KEYOPEN_MARK, SK.KEYTURN_MARK, SK.KEYLOCK_MARK] : [SK.KEYLOCK_MARK, SK.KEYTURNU_MARK, SK.KEYOPEN_MARK];
        ids.forEach((id) => {
          const k = `p:${id}`;
          show(k, A, true);                                       // まず、いまの鍵の状態でカードがめくれる
          later(() => { up[k] = T; paint(G()); }, 900);           // 🔑が差し込まれてまわる
          later(() => { up[k] = B; paint(G()); }, 1800);          // 鍵がかかる（はずれる）
        });
      },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 鍵をかけた相手を選ぶ（自分も選べる）
    coResult: {
      kind: "keymaster", targetLabel: "鍵をかけた相手", self: true,
      pickPlayer: (id, K) => [`${K.nameOf(id)} の役職にロックをかけました。`, { kind: "keymaster", target: id, action: "lock" }, null, "disclose", `${K.nameOf(id)} → ロック`],
    },
    cpuLie: { role: "keymaster", weight: 6, order: 4, claim: lieClaim },
    cpuClaim,
    cpuVoteScore,
    stagePick: { self: true },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分も選べる）
    cpuNight: { order: 23, stage: "seer", chain: true, run: cpuRun },   // 占い師の段階(破局師22の直後)。変化役より前
    night: {
      kind: "seer", order: 23,   // 純愛者・悪女・キューピッド(21)→破局師(22)→鍵師(23)。墓荒らし・ドッペル・シャッフラー・グレムリン・怪盗・いたずらっ子はすべてこのあとの段階
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        const act = toggle(g, p.id, t);
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${lineOf(g, t, act)}`);
        c.hold(p.id, lineOf(g, t, act));
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "keymaster");
        void nameOf;
        c.rev[p.id] = { kind: "key", mode: act, ids: [t] };   // 朝: 選んだ人のカードが 🔓→🔑→🔒（解除は 🔒→🔑→🔓）でめくれる
      },
    },
    /** 墓荒らし・ドッペルゲンガーで鍵師を手にしたとき（朝のうち）/ 酔いが覚めた鍵師が昼に使うとき: 自分を含む1人を選べる。朝の時点の盤面で鍵をかける
     *  （このあと朝のうちに動く変化役にも、ロックは効く） */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, t = c.players[0];
        const act = toggle(g, c.id, t);
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${lineOf(g, t, act)}`);
        return { lines: [lineOf(g, t, act)], reveal: { kind: "key", mode: act, ids: [t] }, nextChain: null };
      },
    },
  });
})(window.ONW);
