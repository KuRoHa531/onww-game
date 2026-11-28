/**
 * 暴露狂人（マイクラ版 EXPOSED_MADMAN を参考）: 人狼陣営の「狂人系」（人狼が誰かは分からない）。
 * 夜に自分以外の1人を選ぶ。昼になって、変化公開のあと（新聞のあと・麻婆豆腐の前）に、選ばれた人の「最終役職」だけが全員に公開される（暴露狂人本人・選んだ相手の名前は公開されない）。
 * 公開が終わってから昼のタイマーが始まる。順番: 変化公開 → 新聞 → 暴露 → 麻婆豆腐 → パン屋(昼タイマー開始)
 *   ・暴露する相手は夜の終わりに記録（g.exposeTargets[暴露狂人のID] = 選ばれた人のID）。公開は昼の始まりに最終盤面の役職で行う（このファイルの dayAnnounce / 3段階目で実装）
 *   ・夜の能力なので新聞に載る（ONW.newsNote）
 *   ・墓荒らし・ドッペルゲンガーで手にした場合は、朝のうちに使える（morning）
 *   ・公開は「誰かは出さず、最終役職だけ」。紙に「暴露狂人に暴露された人の最終役職は ○○ です」と出る（めくれる演出はない）。酔っ払い・恋人なら「であり、酔っ払い・恋人でした」と付く
 *   ・暴露するのは、最終盤面で暴露狂人になっていて、酔いが覚めている人だけ。1人1回（g.exposeAnnounced）。酔いが覚めたとき・昼に暴露狂人を手にして選んだときは、その瞬間に出す（昼のタイマーは止めない）
 *   ・公開した内容は g.exposeLines に残り、情報確認から見返せる。再入室では演出なしで情報確認にだけ反映
 * 実装の進み具合は _wip/暴露狂人_依頼文.txt を参照。
 */
(function (ONW) {
  // ---- CPUの夜の行動: 自分以外の1人をランダムに選んで暴露の対象にする（デバッグの指定があればそれ。公開は昼の始まりに他の人と同じ流れで出る） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    g.exposeTargets = g.exposeTargets || {};
    g.exposeTargets[p.id] = t.id;
    if (g.exposeAnnounced) delete g.exposeAnnounced[p.id];
    i.mode = "expose"; i.target = t.id;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を暴露の対象に選びました。`);
    n.hold(p.id, `${t.name} を暴露の対象に選びました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  /** 暴露する分(まだ出していない・最終盤面で暴露狂人・酔いが覚めている)を集めて、出した印をつけて返す。戻り値: [{ role, extras }]（並びはランダム。誰が暴露したかは並びから分からない） */
  function collect(c) {
    const g = c.g;
    g.exposeTargets = g.exposeTargets || {}; g.exposeAnnounced = g.exposeAnnounced || {}; g.exposeLines = g.exposeLines || [];
    const rows = [], by = [];   // by: 各行を出した暴露狂人（ハッキングされた本人の画面から、自分の本当の暴露を外すため。クライアントには送らない）
    g.players.forEach((p) => {
      const t = g.exposeTargets[p.id];
      if (!t || g.exposeAnnounced[p.id] || ONW.mimic.eff(g, p.id) !== ONW.ROLE.EXPOSED_MADMAN || ONW.hiddenDrunk(g, p.id) || ONW.seal.is(g, p.id) || c.isDead(p.id)) return;
      if (!g.players.some((q) => q.id === t)) return;
      g.exposeAnnounced[p.id] = true;
      (g.exposeRevealed = g.exposeRevealed || {})[p.id] = g.currentRoles[t];   // 実績用: 公開された時点の役職（最終役職ではなく公開時の役職で判定する。マイクラ版 exposedMadmanRevealedRole 相当）
      const extras = [];
      if (g.drunkOverlay && g.drunkOverlay[t]) extras.push("酔っ払い");   // 本家: 酔っぱらい・恋人なら付加情報も公開
      if (ONW.isLover(g, t)) extras.push("恋人");
      rows.push({ role: c.rn(g.currentRoles[t]), extras }); by.push(p.id);
    });
    const ord = ONW.utils.shuffle(rows.map((r, i) => i));   // 並びはランダム（行と出した人の組を同じ並びにする）
    const rs = ord.map((i) => rows[i]); rows.length = 0; rows.push(...rs); rows.by = ord.map((i) => by[i]);
    g.exposeLines.push(...rows); g.exposeBy = g.exposeBy || []; g.exposeBy.push(...rows.by);
    return rows;
  }
  /** 公開した1回分を全員(と観戦者)へ送る */
  /** 銀狼にハッキングされた人の偽の暴露（暴露狂人と思い込んで対象を選んでいた人。出す時点で1回だけ、その人の画面にだけ出る） */
  function fakeRows(g, pending) {
    const out = {};
    g.players.forEach((p) => {
      const f = (g.hackExpose || {})[p.id];
      if (!f || (g.hackExposeShown || {})[p.id] || !ONW.hack || !ONW.hack.isFakeUi(g, p.id) || ONW.seal.is(g, p.id)) return;
      if (pending) g.hackExposeShown = Object.assign(g.hackExposeShown || {}, { [p.id]: true });
      out[p.id] = { role: f.role, extras: f.extras || [] };
    });
    return out;
  }
  /** 公開した1回分を全員(と観戦者)へ送る。ハッキングされた人には、思い込んでいる役職の目線（自分の本当の暴露は出ず、偽の暴露は自分にだけ出る） */
  function sendRows(c, rows, late, fakes) {
    const g = c.g, by = rows.by || [];
    c.sendAll((p) => {
      let rs = rows;
      if (ONW.hack && ONW.hack.isFakeUi(g, p.id)) { rs = rows.filter((r, i) => by[i] !== p.id); if (fakes[p.id]) rs = ONW.utils.shuffle([...rs, fakes[p.id]]); }
      const m = { t: "expose", rows: rs }; if (late) m.late = true;
      return rs.length ? m : { t: "noop" };
    });
    if (rows.length) c.sendSpec({ t: "expose", rows, ...(late ? { late: true } : {}), quiet: true });
  }

  const uiPick = {
    action(X) {
      const { later, nowSel } = X;
      return `<p class="night-step__hint">上のテーブルから、役職を暴露したい人の<strong>カード</strong>を押してください。（自分以外）<br>昼の始まりに、その人の最終役職だけが全員に公開されます。${later}</p>${nowSel("")}`;
    },
    chainReady: (np) => np === 1,
    chainHow: () => "役職を暴露したい人の<strong>カード</strong>を押して（自分以外）",
  };

    /** 実績（マイクラ版 stats.js の判定に合わせる） */
  function achievements(g, id, won) {
    const out = [], ini = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    const has = (r) => ini === r || fin === r;
    const roleOf = (pid) => (g.currentRoles || {})[pid] ?? (g.initialRoles || {})[pid];
    const teamKey = (r) => { if (r === "doppelganger") return "third"; const t = r && ONW.ROLE_INFO[r] && ONW.ROLE_INFO[r].team; return t === ONW.TEAM.WOLF ? "wolf" : t === ONW.TEAM.THIRD ? "third" : "village"; };
    const teamOfP = (pid) => teamKey(roleOf(pid));
    const exiled = (pid) => (g.executed || []).includes(pid);
    const dead = ONW.vote && ONW.vote.deadSet ? ONW.vote.deadSet(g) : new Set(g.deadIds || []);
    const players = g.players || [];
    const wolfPartners = (pid) => players.filter((q) => q.id !== pid && (teamOfP(q.id) === "wolf" || (g.promotedWolfIds || []).includes(q.id))).map((q) => q.id);
    const voteTeam = () => { const t = (g.votes || {})[id]; return t ? teamOfP(t) : null; };
    const chainTargets = (pid) => Object.keys(g.chainBy || {}).filter((v) => (g.chainBy || {})[v] === pid && (g.chainKind || {})[v] === "tomo");
    if (fin === "exposed_madman") {
      const t = (g.exposeTargets || {})[id], rev = (g.exposeRevealed || {})[id];
      if (t && rev) {   // 実際に公開された役職で判定（マイクラ版準拠）
        out.push("exposed_reveal_" + teamKey(rev));
        if (ONW.isLover && ONW.isLover(g, t)) out.push("exposed_reveal_lover");
        if (rev === "queen") out.push("exposed_reveal_queen");
      }
    }
    return out;
  }

  ONW.defineRole("exposed_madman", {
    achievements,   // 実績
    info: { observe: "player", sealTarget: true, deck: 52, name: "暴露狂人", team: ONW.TEAM.WOLF, wakeOrder: 42, sort: 1.8,
      desc: "人狼陣営。夜に1人を選びます。昼の始まりに、その人の最終役職だけが全員に公開されます（選んだ相手の名前や暴露狂人本人は公開されません）。恋人や酔っ払いなどの付加情報も一緒に公開されます。人狼が誰かは分かりません。人狼を勝たせるのが目的です。" },
    groups: { mad: 2.5, "transform:dark_avatar": 14 },
    uiNight: uiPick,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 暴露した相手を選ぶ → その人の最終役職を選ぶ（「伏せる」も言える。マイクラ版 main.js の暴露狂人CO と同じ）
    coResult: {
      kind: "expose", targetLabel: "暴露した相手", roleHint: "の最終役職",
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} を暴露しました。役職は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [`${who} を暴露して ${K.rn(role)} でした。`, { kind: "expose", target: s.target, role }, null, "disclose", `${who} → ${K.rn(role)}`];
      },
    },
    cpuNight: { order: 60, stage: "seer", chain: true, run: cpuRun },   // CPUの夜の行動(chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    /** 昼の始まり(変化公開 → 新聞 のあと、麻婆豆腐の前): 暴露の紙を出す。戻り値: 紙が出終わるまでの待ち時間(ms)。出さないときは 0 */
    dayAnnounce: { order: 105, run(c) {
      const rows = collect(c), fakes = fakeRows(c.g, true);
      if (!rows.length && !Object.keys(fakes).length) return 0;
      sendRows(c, rows, false, fakes);
      return rows.length && ONW.stage && ONW.stage.exposeMs ? ONW.stage.exposeMs(rows) : 0;   // 待ち時間は本物の暴露があるときだけ（偽の暴露だけなら、他の人の昼を止めない）
    } },
    /** 昼のうちに、酔いが覚めた / 昼に暴露狂人を手にして選んだ人がいれば、その瞬間に出す（昼のタイマーは止めない） */
    dayNews: { order: 105, run(c) {
      if (c.g.phase !== c.PH.ONLINE_DAY) return;
      const rows = collect(c), fakes = fakeRows(c.g, true);
      if (rows.length || Object.keys(fakes).length) sendRows(c, rows, true, fakes);
    } },
    /** 再入室: 紙は出さず、情報確認にだけ反映 */
    resyncDay: { order: 16, run(c, seat) {
      const g = c.g, fake = seat && ONW.hack && ONW.hack.isFakeUi(g, seat);
      let rows = g.exposeLines || [];
      if (fake) { const by = g.exposeBy || []; rows = rows.filter((r, i) => by[i] !== seat); const f = (g.hackExpose || {})[seat]; if (f && (g.hackExposeShown || {})[seat]) rows = [...rows, { role: f.role, extras: f.extras || [] }]; }
      return rows.length ? [{ t: "expose", rows, quiet: true }] : [];
    } },
    night: {
      kind: "seer", order: 60,   // 暴露の対象を記録するだけ（カードは動かさない）。公開は昼の始まりの最終盤面で
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, rn = c.rn;
        const t = c.selOf(p).players[0]; if (!t) return;
        g.exposeTargets = g.exposeTargets || {};
        g.exposeTargets[p.id] = t;
        delete (g.exposeAnnounced || {})[p.id];
        g.nightLogsAll.push(`${rn(c.eff(p))} ${p.name} は ${c.nameOf(t)} を暴露の対象に選びました。`);
        c.hold(p.id, `${c.nameOf(t)} を暴露の対象に選びました。`);
        ONW.observeNote(g, p.id, [t], null, "exposed_madman");
        ONW.newsNote(g, "exposed_madman");
      },
    },
    /** 墓荒らし・ドッペルゲンガーで暴露狂人を手にしたとき: 朝のうちに1人選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        g.exposeTargets = g.exposeTargets || {};
        g.exposeTargets[id] = t;
        delete (g.exposeAnnounced || {})[id];
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を暴露の対象に選びました。`);
        return { lines: [`${c.nameOf(t)} を暴露の対象に選びました。`], reveal: null, nextChain: null };
      },
    },
  });
})(window.ONW);
