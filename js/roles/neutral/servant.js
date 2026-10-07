/** 従者: 試合開始時にご主人が決まる。ご主人の身代わりになる(身代わり・勝敗の処理は vote.js の共通処理) */
(function (ONW) {
  // ---- 役職固有の補助関数(もとは state.js にあったもの。中身は変更なし) ----
  /** 従者のご主人(プレイヤーID)。最終盤面でその人が従者を持っていて、ご主人が決まっているときだけ。なければ null
   *  ご主人は「役職の持ち主」に記録されている(g.servantMasters[持ち主ID] = ご主人のID)ので、従者のカードが動けば、ご主人もカードについて動く（本家と同じ） */
  ONW.servantMaster = (g, id) => (g && g.currentRoles && g.currentRoles[id] === ONW.ROLE.SERVANT && (g.servantMasters || {})[id]) || null;
  /** 従者を持っている人(持ち主ID)とご主人の組 [[従者の持ち主, ご主人], ...]（ご主人が決まっているものだけ） */
  ONW.servantPairs = (g) => (g.players || []).map((p) => [p.id, ONW.servantMaster(g, p.id)]).filter(([, m]) => m);
  /** 従者のCO・結果開示の文言（人間のCOボタンとCPUの発言で完全に一致させるため、ここ1か所だけで作る。本家: 「ご主人は〇〇です」） */
  ONW.servantCoText = (name) => `ご主人は${name}です。`;
  ONW.servantCoShort = (name) => `ご主人: ${name}`;
  /** 「自分の従者がいる」の文言（人間の情報開示ボタンとCPUの発言で一致させる）。本家のCPUが騙りで話を合わせるときは「〇〇が自分の従者のようです。」と名前も言う */
  ONW.servantInfoText = "自分の従者がいます。";
  ONW.servantInfoShort = "従者がいる";
  ONW.servantFakeInfoText = (name) => `${name}が自分の従者のようです。`;
  /** 役職が動いたあとの従者の整合を取る（本家の clearServantData / syncSingleRoleLinkedData / assignNewServantMaster 相当）
   *   ・墓地に入った従者はご主人を失う（墓地の役職に主従関係は残らない）
   *   ・従者でない人についたご主人の記録は消す
   *   ・ご主人が決まっていない従者（墓地から引いた従者など）には、自分以外の参加者からランダムで新しいご主人を決める
   *  新しくご主人が決まった人のIDの配列を返す */
  ONW.fixServants = (g) => {
    const m = (g.servantMasters = g.servantMasters || {}), fresh = [], ids = (g.players || []).map((p) => p.id);
    const nt = (g.servantNotified = g.servantNotified || {});   // 従者通知を出し済みか（従者のカードについていく。ご主人が新しく決まったら出し直す）
    Object.keys(m).forEach((k) => { if (String(k).startsWith("g:")) delete m[k]; });
    Object.keys(nt).forEach((k) => { if (String(k).startsWith("g:")) delete nt[k]; });
    ids.forEach((id) => {
      if (g.currentRoles[id] !== ONW.ROLE.SERVANT) { delete m[id]; delete nt[id]; return; }
      if (m[id] && ids.includes(m[id])) return;
      const c = ids.filter((x) => x !== id);
      if (!c.length) { delete m[id]; delete nt[id]; return; }
      m[id] = c[Math.floor(Math.random() * c.length)];
      delete nt[id];
      fresh.push(id);
    });
    ONW.fixExecutioners(g);   // 処刑人のターゲットも、カードについて動く / 新しい処刑人には新しいターゲットを決める
    return fresh;
  };
  // ---- ここまで ----

  /** ご主人への従者通知の文言（本家 game.js の「従者通知」と同じ。誰が従者かは教えない） */
  ONW.SERVANT_NOTICE_TEXT = "あなたの従者がいるようです。";

  /**
   * 従者通知（本家 game.js の「従者通知」）: 最終盤面で従者を持っている人(S)のご主人(M)に「あなたの従者がいるようです。」。誰が従者かは教えない。
   * S か M が酔っ払い中(未覚醒)なら、覚めるまで保留する。従者のカード1枚につき1回（出し済みの印 servantNotified は、カードについて動く）。
   * 人間のご主人は戻り値（今回新しく通知する人）として返し、CPUのご主人はその場で cpuInfo に覚える。死亡したご主人には出さない
   */
  function notices(c) {
    const g = c.g, out = [], nt = (g.servantNotified = g.servantNotified || {});
    ONW.servantPairs(g).forEach(([s, m]) => {
      if (nt[s] || ONW.hiddenDrunk(g, s) || ONW.hiddenDrunk(g, m) || c.isDead(m)) return;
      const mp = g.players.find((q) => q.id === m);
      if (!mp) return;
      nt[s] = true;
      if (mp.isCpu) ONW.cpu.noticeServant(g, m); else out.push(m);
    });
    return out;
  }

  const cpuMaster = (g, id, k) => { const mid = ONW.servantMaster(g, id); if (mid) k.infoOf(g, id).master = mid; };   // 夜のはじめにご主人を知る（known には入れない = 投票の「村人側と分かっている人」扱いにしない）

  // ---- CPUの発言・投票(もとは cpu.js。中身は変更なし) ----
  /** 従者のCPUが知っているご主人（自認が従者で、ご主人を知っているときだけ。怪盗で奪った従者などは知らない） */
  const masterOfServant = (k, g, p) => (k.selfRole(g, p) === "servant" && k.infoOf(g, p.id).master) || null;
  /** 従者のCOと結果開示（本当も騙りも同じ形。文言は人間のCOボタンと同じ ONW.servantCoText / servantCoShort） */
  function servantClaim(g, t) {
    if (!t) return { co: "servant", result: null };
    return { co: "servant", result: { short: ONW.servantCoShort(t.name), text: ONW.servantCoText(t.name), claim: { kind: "servant", target: t.id } } };
  }
  function lieClaim(k, g, p, others, selfRole, co) { return servantClaim(g, k.pick(others)); }   // 従者の騙り: 適当な誰かを「ご主人」と言う（本家の fakeServantMaster）
  function cpuClaim(k, g, p, r, i, c) {   // 従者: 本家「COのみ」ルールで35%（CPUごとに1回だけ抽選）は本当にCO（ご主人を開示）、残りは騙り。ご主人を知らない(怪盗で奪った等)ときは、本当のCOはしない
    const others = g.players.filter((q) => q.id !== p.id);
    const mt = i.master && others.find((q) => q.id === i.master);
    if (mt && k.coTruth(g, p)) { const cl = servantClaim(g, mt); c.co = cl.co; c.result = cl.result; }
    else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result; }
  }

  ONW.defineRole("servant", {
    // 結果発表の演出(stage.js の startResult / skipResult が引く): 従者の身代わり
    //   execExclude: 通常の追放フリップから除く人(身代わりになった従者。二重にめくらない) / intro: ご主人のカードがめくれそうになる(途中まで回って揺れ、また裏のまま戻る) → 従者のカードが表になる。複数あれば1組ずつ順に
    stageResult: {
      execExclude: (res) => (res.servantSubs || []).map((x) => x.servantId),
      intro: { order: 10, run(R) {
        const { res, P, later, setCap, esc, paint, G, up, dead, badge, lovOn } = R;   // alm はスキップで作り直されるので、そのつど R.alm を読む
        const subs = res.servantSubs || [];
        R.subN = subs.length;
        subs.forEach((x) => {
          const mk = P(x.masterId), sk = P(x.servantId), sh = res.history.find((h) => h.id === x.servantId);
          later(() => { setCap(`<div class="res-cap__t t-wolf">従者の身代わり</div><div>${esc(x.master)} が追放されそうになりました…</div>`); R.alm[mk] = true; paint(G()); }, R.t);
          later(() => {
            delete R.alm[mk];
            up[sk] = (sh && sh.role) || "servant"; lovOn(x.servantId); dead[sk] = true; badge[sk] = "身代わり";
            setCap(`<div class="res-cap__t t-wolf">従者の身代わり</div><div>${esc(x.servant)} が ${esc(x.master)} の身代わりになりました</div>`);
            paint(G());
          }, R.t + 1900);
          R.t += 4300;
        });
        if (subs.length && !R.exec.length) R.t -= 600;   // 通常の追放がなければ、すぐ次へ
      } },
    },
    // 昼に酔いが覚めた従者: ご主人のカードがめくれる(stage.js の soberPeek の並び: 共有者 → 処刑人 → 従者 → 女王)
    stageSober: { list: { order: 30, run(sp, list, SK) { if (sp.master) list.push([`p:${sp.master}`, SK.MASTER_MARK, true]); } } },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): ご主人を選ぶ(CPUの発言と同じ文言) / 情報開示「従者がいる」
    coResult: {
      kind: "servant", targetLabel: "ご主人",
      pickPlayer: (id, K) => [ONW.servantCoText(K.nameOf(id)), { kind: "servant", target: id }, null, "disclose", ONW.servantCoShort(K.nameOf(id))],
      infoHas: () => [ONW.servantInfoText, { kind: "has_servant" }, null, "disclose", ONW.servantInfoShort],
    },
    // 夜の演出(stage.js が g.masterReveal を受け取って 700ms 後に呼ぶ): 夜の始まりにご主人のカードが「👑ご主人」でめくれる → 夜時間の間ずっと開いたまま(ご主人が恋人の相方でもあるときは、右上に丸いハート)
    stageNight: {
      order: 10, field: "masterReveal",
      run(r, SK) {
        const { paint, G } = SK;
        const k = `p:${r.id}`;
        if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
        SK.up[k] = r.mark || SK.MASTER_MARK; SK.glow[k] = true; if (SK.loveMate && SK.loveMate.id === r.id) SK.lov[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G());
      },
    },
    cpuLie: { role: "servant", weight: 6, order: 6, claim: lieClaim },   // 従者は村人陣営以外だけが騙れる（本家も配役にいるときだけ、低めの確率）
    cpuClaim,
    // 投票: 従者は自分のご主人には投票しない（ご主人が追放されそうだと身代わりで死ぬため）/ ご主人が投票を予告していれば、それに合わせる（本家: 約7割）
    cpuVoteExclude: (k, g, p, q) => q.id === masterOfServant(k, g, p),
    cpuVoteScore(k, g, p, q, i) {
      const master = masterOfServant(k, g, p);
      if (!master) return 0;
      if (i.followMaster === undefined) i.followMaster = Math.random() < 0.7;
      return i.followMaster && (g.cpuVotePlan || {})[master] === q.id ? 8 : 0;
    },
    cpuInit: cpuMaster, cpuLearn: cpuMaster,   // CPU: ご主人を知る
    cpuNotice(g, id, k) { k.infoOf(g, id).hasServant = true; },   // CPU(ご主人)が従者通知を受けた(誰かは分からない)
    info: { deck: 35, name: "従者", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 38,
      desc: "第三陣営。試合開始時にランダムなご主人（他の参加者）に仕えます。夜のはじめにご主人のカードがめくれて、誰がご主人か分かります。ご主人が追放されそうになったら、ご主人の代わりに追放されます（ご主人が従者・てるてる坊主・一目惚れしてるてるのとき、従者が昼のうちに死亡しているとき、従者自身がご主人のときは身代わりになりません）。ご主人が勝利したら自分も追加で勝利します（追放されていても勝てます）。役職が入れ替わっても、ご主人はカードについていきます。墓地に入ると主従関係は消え、墓荒らしで引いた人には新しいご主人がランダムで決まり、朝に分かります（怪盗で奪った場合は役職名だけ分かり、ご主人は分かりません）。ご主人には昼のはじめに「あなたの従者がいるようです。」と伝わります（誰が従者かは分かりません）。" },
    groups: { "transform:silver_shadow": 7 },
    nightMsg(c, p) {   // 夜のはじめに、ご主人のカードがめくれて誰がご主人か分かる（ご主人はカードについてくる。配布時に決まっている）
      const g = c.g;
      const mid = ONW.servantMaster(g, p.id), mp = mid && g.players.find((q) => q.id === mid);
      return {
        text: mp ? `あなたのご主人は ${mp.name}${mid === p.id ? "（あなた）" : ""} です。` : "ご主人が見つかりませんでした。",
        text2: "ご主人が追放されそうになると、あなたが身代わりになって追放されます。ご主人が道連れで死ぬときも身代わりになります。ご主人が王国滅亡・心中・無理心中で死ぬときは、身代わりできず後追いします。ご主人が勝利したら、あなたも追加で勝利します。",
        master: (mp && mid !== p.id) ? { id: mid } : null,   // 自分自身がご主人のときは、自分のカードはめくらない
      };
    },
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      // 従者: 新しい従者にはご主人がランダムで決まっている(ONW.swapGrave / ONW.copyRole → fixServants)。朝に自分の従者（と墓荒らしなら墓地の墓荒らし）が同時に表になり、ご主人のカードに「ご主人」の印が出る
      const mid = ONW.servantMaster(g, p.id);
      c.hold(p.id, mid ? `あなたのご主人は ${t.nameOf(mid)}${mid === p.id ? "（あなた）" : ""} です。` : "ご主人が見つかりませんでした。");
      if (mid) g.nightLogsAll.push(`従者 ${p.name} のご主人は ${t.nameOf(mid)} になりました（${t.o.via || "引いた従者"}）。`);
      t.both(t.eff());
      if (mid && mid !== p.id) t.setPeek([{ k: `p:${mid}`, role: "__master" }], 380);
    },
    soberLines(c, id) {   // 酔いが覚めた従者: 最終的に持っている従者のご主人
      const g = c.g, nm = (x) => (g.players.find((q) => q.id === x) || {}).name || "?";
      const mid = ONW.servantMaster(g, id);
      return [mid ? `あなたのご主人は ${nm(mid)}${mid === id ? "（あなた）" : ""} です。` : "ご主人が見つかりませんでした。"];
    },
    soberPeek(c, id) {
      const pk = {}, mid = ONW.servantMaster(c.g, id);
      if (mid && mid !== id) pk.master = mid;   // ご主人のカードが「ご主人」の印でめくれる
      return pk;
    },
    /** 朝のあとの待機時間(CPUの通知のあと): 従者通知を決める。人間のご主人にはこの下の settleMsg で送る */
    settlePost: { order: 10, run(c) {
      const sn = notices(c);   // 従者通知（昼のはじめ。酔っ払い中の人が絡むものは覚めてから）
      sn.forEach((m) => c.hold(m, ONW.SERVANT_NOTICE_TEXT));   // 再入室したときは、朝のログとして同じ内容が戻る
      c.tmp.sn = sn;
    } },
    settleMsg: { order: 50, run(c, p, mode) {
      if (mode !== "settle") return {};   // 再入室(resync)のときは、朝のログ(hold)として戻るのでここでは出さない
      return { logs: (c.tmp.sn || []).filter((m) => m === p.id).map(() => ONW.SERVANT_NOTICE_TEXT) };
    } },
    /** 昼に新しく従者通知が出る人へ送る（再入室でも消えないよう hold も記録する） */
    dayNotice(c) {
      notices(c).forEach((m) => { c.hold(m, ONW.SERVANT_NOTICE_TEXT); c.send(m, { t: "servantday", text: ONW.SERVANT_NOTICE_TEXT }); });
    },
  });
})(window.ONW);
