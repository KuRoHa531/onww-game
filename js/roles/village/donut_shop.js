/**
 * ドーナツ屋（マイクラ版 DONUT_SHOP を参考）: 村人陣営。夜の行動はない受動役職。
 * 昼開始時、機能しているドーナツ屋（最終役職がドーナツ屋の人＋ドーナツ屋を模倣した模倣の人狼）が、
 * 「ドーナツ屋系全員を除く参加者」の共有プールからランダムな1人へドーナツを届ける（パン屋とほぼ同じ仕組みだが、
 * パン屋と違い届ける先はランダムで、届いた本人にだけ通知が来る）。
 *   ・ドーナツは1人1回までしか受け取れない。ドーナツ屋系の人は受け取れない。届ける相手がいなければ失敗する
 *   ・プールはドーナツ屋と狂ったドーナツ屋（crazy_donut_shop）で共有する（マイクラ版 processDonutShopDeliveries）。
 *     共通処理は ONW.donut に置き、狂ったドーナツ屋は同じ解決を使う（違いは文面の「粗悪なドーナツ」だけ）
 *   ・届ける処理は昼開始時（settlePre）に1回だけ走る。封印されている・酔いが覚めていない送り主はその回は見送り、
 *     酔い覚め（soberReveal）・昼の役職変化後（dayNotice）にもう一度走って遅れて届ける（マイクラ版の再実行タイミング）
 *   ・受け取った人の通知「ドーナツが届きました。」は本人の情報確認に残る。酔っ払い中の受け取りは保留して酔い覚めで届け、
 *     封印されている受け取りは封印が解けるまで出さない（マイクラ版の保留・再送の仕組み）
 *   ・失敗した送り主には「ドーナツを届ける相手が居ませんでした。」（狂ったドーナツ屋の送り主には
 *     「粗悪なドーナツを届ける相手が居ませんでした。」。マイクラ版 notifyCrazyDonutShopFailure 準拠。
 *     ハッキングされている送り主には出さない。マイクラ版準拠）
 *   ・思い込み（クローン・ペルソナ・ハッキング）では届けない（機能判定は最終役職ベース。マイクラ版の明記どおり）。
 *     ただし本物のドーナツ屋がハッキングされていても届ける（失敗通知だけ出さない）
 *   ・詩人には届けたことが伝わる（マイクラ版 poetNightTargetEvents）。観測の人狼・鈴の巫女・龍の狂人・見張り番には伝わらない
 *     （観測ログには poetOnly の印を付けて直接入れ、観測系の消費側で除外する）
 *   ・結果情報: 「ドーナツ屋〇〇は△△にドーナツを届けていました。」/「ドーナツ屋〇〇はドーナツを届けられませんでした。」
 *   ・演出（作者メモ: パン屋とほぼ同じ）: 届いた本人の画面にだけ 🍩 バナー「ドーナツが届きました」が出る
 */
(function (ONW) {
  const VILLAGE = ONW.TEAM.VILLAGE;
  const sealed = (g, id) => !!(ONW.seal && ONW.seal.is(g, id));

  /** ドーナツ屋系の種類（狂ったドーナツ屋と共有。kind: 記録に残す種別、label: 文面の品名、roleName: 文面の役職名） */
  const KINDS = {
    donut_shop: { kind: "normal", label: "ドーナツ", roleName: "ドーナツ屋" },
    crazy_donut_shop: { kind: "defective", label: "粗悪なドーナツ", roleName: "狂ったドーナツ屋" },
  };
  const KIND_OF = { normal: "donut_shop", defective: "crazy_donut_shop" };

  /** この人が「機能しているドーナツ屋系」か。機能していればその役職キー、そうでなければ null。
   *  マイクラ版 isFunctioningDonutShop: 最終役職がドーナツ屋系、または模倣の人狼がドーナツ屋系を模倣している場合だけ。
   *  クローンの思い込み・ペルソナの仮面・ハッキングの思い込みでは機能しない（ONW.mimic.eff はクローンの思い込み先を返すので使わない） */
  function functioningKind(g, id) {
    const cur = (g.currentRoles || {})[id];
    if (KINDS[cur]) return cur;
    if (cur === "mimic_wolf") {
      const m = ONW.mimic && ONW.mimic.roleOf ? ONW.mimic.roleOf(g, id) : (g.mimicRole || {})[id];
      if (KINDS[m]) return m;
    }
    return null;
  }
  const functioningSenders = (g) => (g.players || []).filter((p) => functioningKind(g, p.id));

  /** 状態の初期化（net.js の startGame でも初期化するが、単体利用・検証でも壊れないように） */
  function ensure(g) {
    g.donutState = g.donutState || { resolved: false, pool: [] };
    g.donutDelivered = g.donutDelivered || {};   // 受け取った人 -> true（1人1回まで）
    g.donutKind = g.donutKind || {};             // 受け取った人 -> "normal" | "defective"
    g.donutBySender = g.donutBySender || {};     // 送り主 -> 受け取った人
    g.donutStatus = g.donutStatus || {};         // 送り主 -> "delivered" | "failed"
    g.donutNoticeSent = g.donutNoticeSent || {}; // 受け取った人 -> 通知済み
    g.donutPending = g.donutPending || [];       // 酔っ払いで通知を保留している受け取り
    g.donutFailed = g.donutFailed || {};         // 失敗した送り主 -> 種別（実績用）
    g.donutFailTold = g.donutFailTold || {};     // 失敗通知を出した送り主
    g.donutLog = g.donutLog || [];               // 処理順の記録 { sender, recipient|null, kind }（結果情報用）
    return g;
  }

  const noticeText = (kind) => kind === "defective" ? "粗悪なドーナツが届きました。" : "ドーナツが届きました。";
  const FAIL_TEXT = "ドーナツを届ける相手が居ませんでした。";
  // 失敗通知はマイクラ版では送り主の種類で文面が違う（notifyDonutShopFailure / notifyCrazyDonutShopFailure）
  const failText = (kind) => kind === "defective" ? "粗悪なドーナツを届ける相手が居ませんでした。" : FAIL_TEXT;

  /** 受け取り通知を試みる。酔っ払い中なら保留、封印中なら未送信のまま（後で再送される）。notify(id, {t, kind, text}) があればその場で送る */
  function attemptNotice(g, rid, notify) {
    ensure(g);
    if (!g.donutDelivered[rid] || g.donutNoticeSent[rid]) return false;
    if (ONW.hiddenDrunk(g, rid)) { if (!g.donutPending.includes(rid)) g.donutPending.push(rid); return false; }
    if (sealed(g, rid)) return false;
    g.donutNoticeSent[rid] = true;
    if (notify) notify(rid, { t: "donutnews", kind: g.donutKind[rid], text: noticeText(g.donutKind[rid]) });
    return true;
  }

  /** 届ける処理本体（マイクラ版 processDonutShopDeliveries）。notify は即時通知用（酔い覚め・昼の再実行のときだけ渡す。
   *  昼開始時（settlePre）は通知を settleMsg がまとめて出すので渡さない） */
  function resolve(g, notify) {
    ensure(g);
    const senders = functioningSenders(g);
    if (!senders.length) return;   // 機能しているドーナツ屋系がいなければ何もしない（プールも作らない。マイクラ版準拠）
    const st = g.donutState;
    if (!st.resolved) {   // プールは最初の処理で1回だけ作る: ドーナツ屋系全員を除く参加者全員（生存は問わない。マイクラ版の実装どおり）
      const senderIds = new Set(senders.map((p) => p.id));
      st.pool = ONW.utils.shuffle((g.players || []).map((p) => p.id).filter((id) => !senderIds.has(id)));
      st.resolved = true;
    }
    const ready = ONW.utils.shuffle(senders.filter((p) => !g.donutStatus[p.id] && !sealed(g, p.id) && !ONW.hiddenDrunk(g, p.id)));
    for (const s of ready) {
      const kind = KINDS[functioningKind(g, s.id)].kind;
      const rid = st.pool.shift();
      if (rid === undefined || g.donutDelivered[rid]) {   // 届ける相手がいない（プール切れ。受け取り済みの人はプールに残らないので通常は起きない）
        g.donutStatus[s.id] = "failed";
        g.donutFailed[s.id] = kind;
        g.donutLog.push({ sender: s.id, recipient: null, kind });
        // 失敗通知はハッキングされている送り主には出さない（マイクラ版 notifyDonutShopFailure）。settleMsg 側でも同じ条件で出す
        if (notify && !(g.hackRole || {})[s.id] && !g.donutFailTold[s.id]) { g.donutFailTold[s.id] = true; notify(s.id, { t: "donutnews", kind: null, text: failText(kind) }); }
        continue;
      }
      g.donutDelivered[rid] = true;
      g.donutKind[rid] = kind;
      g.donutBySender[s.id] = rid;
      g.donutStatus[s.id] = "delivered";
      g.donutLog.push({ sender: s.id, recipient: rid, kind });
      // 詩人への通知イベント（マイクラ版 poetNightTargetEvents）。観測の人狼・鈴・龍・見張り番には伝わらないよう、
      // ONW.observeNote（watcher.touch を叩く）を通さず、poetOnly の印を付けて観測ログへ直接入れる
      (g.observeLog = g.observeLog || []).push({ from: s.id, players: [rid], graves: [], role: functioningKind(g, s.id), poetOnly: true });
      attemptNotice(g, rid, notify);
    }
  }

  /** 保留・未送信の受け取り通知を再送する（封印が解けたあとの dayNotice など） */
  function sweepNotices(g, notify) {
    ensure(g);
    Object.keys(g.donutDelivered).forEach((rid) => attemptNotice(g, rid, notify));
  }

  /** 結果情報（マイクラ版 donutResultLog）: 処理順に、届けた/届けられなかった行 */
  function lines(g, nm) {
    ensure(g);
    return (g.donutLog || []).map((e) => {
      const k = KINDS[KIND_OF[e.kind]] || KINDS.donut_shop;
      return e.recipient
        ? `${k.roleName}${nm(e.sender)}は${nm(e.recipient)}に${k.label}を届けていました。`
        : `${k.roleName}${nm(e.sender)}は${k.label}を届けられませんでした。`;
    });
  }

  /** 実績（マイクラ版 stats.js）: IDだけ返す（名前・説明は wiki データ側） */
  function achievements(g, id, won) {
    ensure(g);
    const out = [];
    const init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === "donut_shop") out.push("first_donut_shop");
    if (fin === "donut_shop") out.push(won ? "win_donut_shop" : "donut_shop_loss");
    if (g.donutFailed[id]) out.push("donut_shop_no_recipient");   // マイクラ版は最終役職の条件なし
    if (init === "donut_shop" && fin !== "donut_shop" && g.donutDelivered[id]) out.push("donut_shop_omakanai");
    const believes = (g.hackRole || {})[id] === "donut_shop" || (fin === "clone" && (g.cloneThoughtRole || {})[id] === "donut_shop");
    if (believes && g.donutDelivered[id]) out.push("donut_shop_should_be");
    if (g.donutDelivered[id] && Object.values(g.chesedRecipient || {}).includes(id)) out.push("donut_shop_with_coffee");
    return out;
  }

  ONW.donut = { KINDS, KIND_OF, functioningKind, functioningSenders, resolve, sweepNotices, attemptNotice, noticeText, FAIL_TEXT, failText, lines, achievements };

  ONW.defineRole("donut_shop", {
    info: { deck: 163, count: 0, name: "ドーナツ屋", team: VILLAGE, wakeOrder: null, sort: 23.9,
      desc: "村人陣営。昼開始時に、ドーナツ屋（と狂ったドーナツ屋）を除くランダムなプレイヤー1人にドーナツを届けます。届いた本人にだけ「ドーナツが届きました。」と通知されます。ドーナツは1人1回までしか受け取れず、ドーナツ屋自身も受け取れないため、届ける相手がいなかった場合は届けられません。封印されている・酔っ払いが覚めていない間は届けられず、解けたときに遅れて届けます。" },
    groups: { "transform:light_apostle": 63 },   // マイクラ版の変化候補リスト: 光の使徒のみ（闇の化身・銀色の影には入らない）
    coResult: { kind: "donut" },   // 結果開示: 届けました / 届けられませんでした（マイクラ版のドーナツ屋COフォーム）

    /** 昼開始時の届け処理（待機時間の演出データが作られる前に1回。詩人の待機時間通知より先に届ける＝マイクラ版 startDay の順序） */
    settlePre: { order: 16, run(c) { resolve(c.g, null); } },

    /** 待機時間の通知: 届いた本人には通知文＋🍩バナーの演出データ、失敗した送り主には失敗文（ハッキング時を除く） */
    settleMsg(c, p, mode) {
      const g = c.g, out = { logs: [] };
      ensure(g);
      if (g.donutDelivered[p.id] && g.donutNoticeSent[p.id] && !ONW.hiddenDrunk(g, p.id)) {
        out.logs.push(noticeText(g.donutKind[p.id]));   // 情報確認に残す（再入室の作り直しでも同じ文が入る）
        if (mode === "settle") { out.donut = [p.id]; out.donutKind = g.donutKind[p.id]; }   // 演出は待機時間の初回だけ
      }
      if (g.donutStatus[p.id] === "failed" && !(g.hackRole || {})[p.id] && !g.donutFailTold[p.id]) {
        g.donutFailTold[p.id] = true;
        out.logs.push(failText(g.donutFailed[p.id]));   // 狂ったドーナツ屋の送り主には粗悪なドーナツの文面（マイクラ版 notifyCrazyDonutShopFailure）
      }
      return out;
    },

    /** 待機時間の演出: 届いた本人の画面に 🍩 バナー（パン屋のバナーと同じ仕組み。本人だけ） */
    stageSettle: { field: "settleDonut", shown: "settleDonutShown", order: 30, run(ids, SK) { if (ONW.ui && ONW.ui.showDonut) { const g = SK.G(); ONW.ui.showDonut(g ? g.settleDonutKind : null); } } },

    /** 酔い覚め: 保留していた受け取り通知を届け、覚めた送り主がいれば届け処理を再実行する（マイクラ版の酔い覚め後処理） */
    soberReveal: { run(c, ids) { const notify = (id, m) => c.send(id, m); ids.forEach((id) => { if ((c.g.donutPending || []).includes(id)) { c.g.donutPending = c.g.donutPending.filter((x) => x !== id); attemptNotice(c.g, id, notify); } }); resolve(c.g, notify); } },

    /** 昼の役職変化のあと: 封印が解けた受け取りの再送と、遅れて機能し始めた送り主の再実行（マイクラ版の封印解除スイープ相当） */
    dayNotice(c) { const notify = (id, m) => c.send(id, m); sweepNotices(c.g, notify); resolve(c.g, notify); },

    cpuClaim(k, g, p, i, n, c) {
      c.co = "donut_shop";
      const st = (g.donutStatus || {})[p.id];
      const delivered = st !== "failed";   // 記録が無い場合も「届けました」側で言う（マイクラ版CPUに専用分岐は無い）
      c.result = { text: delivered ? "ドーナツを届けました。" : "ドーナツを届けられませんでした。", claim: { kind: "donut", delivered } };
    },
    cpuLie: { claim(k, g, p, claims, fake, role) { const delivered = Math.random() < 0.5; return { text: delivered ? "ドーナツを届けました。" : "ドーナツを届けられませんでした。", claim: { kind: "donut", delivered } }; } },
  });
})(ONW);
