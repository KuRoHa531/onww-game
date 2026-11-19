/**
 * 開拓者（マイクラ版 TRAILBLAZER を参考）: 村人陣営。「運命」を歩み、その運命に応じた別の役職の能力を使う。
 *   壊滅 = 保安官 / 存護 = 騎士 / 調和 = カルメン / 記憶 = 妖精さん / 愉悦 = いたずらっ子
 *   ・運命は試合の開始時（配役のあと）に、カードごとにランダムで決まる（5種・等確率）。墓地の開拓者のカードにも決まっていて、
 *     墓荒らし・怪盗などで手にしたときは「そのカードの運命」を引き継ぐ（マイクラ版 swapTrailblazerFateWithCenter）。
 *   ・ドッペルゲンガー・グレムリンでコピーしたら同じ運命も一緒にコピーする（マイクラ版 copyTrailblazerFate）。
 *     シャッフラー・コスプレイヤーで開拓者のカードが置かれたときは、新しく運命が決まる（マイクラ版 ensureTrailblazerFate）。
 *   ・カードの役職は開拓者のまま（村人陣営・占われても「開拓者」・勝利条件は村人陣営）。能力だけ運命の役職になる。
 *   ・夜に「あなたは○○の運命を歩んでいます。」と本人にだけ伝わる。
 *
 * 【しくみ】「模倣の人狼」と同じ「カードの持ち主が別の役職の能力を使う」仕組み（js/roles/wolf/wolf/mimic_wolf.js の ONW.mimic）に乗せている。
 *   ・運命は g.mimicRole[持ち主ID or "g:墓地番号"] = 運命の役職ID(sheriff / knight / carmen / fairy / troublemaker) として持つ。
 *     mimicRole はカードについて動く（state.js の ROLE_BOUND_KEYS）ので、交換・墓荒らし・ドッペルなどの経路で運命が正しく付いてくる。
 *   ・ONW.mimic.actRole / eff / isAs が、開拓者のカードなら運命の役職を返す。夜・朝・昼の能力と受動効果は、これを見ている役職がそのまま動く。
 *   ・ここ（ONW.trailblazer）には、運命の表・名前・抽選・表示用の値・夜の文を置く。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_開拓者_*of4.txt、詳細は docs/trailblazer.md）:
 *   1of4: 役職の登録・運命の抽選と持ち方・模倣の仕組みへの接続・夜の文・カードの表示・ロビー/wiki/ルールコードの登録【済】
 *   2of4: 運命ごとの能力のつなぎ込み（壊滅=保安官 / 存護=騎士 / 調和=カルメン / 記憶=妖精さん / 愉悦=いたずらっ子）と、酔っ払い・墓荒らし・ドッペルゲンガー経由の確認【済】
 *         カルメンの囁きの名乗りは、調和の開拓者のときは「調和開拓者」（g.carmenFx[].src。村人陣営=「あなたは調和開拓者に囁かれました」/ それ以外=開拓者のカードが運命「調和」の枠付きでめくれる）
 *   3of4: 結果発表でめくれたあとに2回目にめくれて運命が出る演出（下の stageResult）・COボタンの情報開示（いたずらっ子/愉悦開拓者・カルメン/調和開拓者の区別。js/co.js）【済】
 *   4of4-a: CPU（運命ごとの発言・調和/愉悦のCOの騙り・墓荒らし/ドッペル経由）と実績（下の「CPU・実績」）【済】
 *   4of4-b: 役職確認ボタン(📕。js/rolebook.js: 自認の開拓者の説明の下に、歩んでいる運命とその能力の説明)・COボタンの運命開示(下の coResult と js/co.js の trailFate: 運命を選ぶ → 調和はカルメンの結果 / 愉悦はいたずらっ子の結果へ続く)・
 *           デバッグの運命指定(js/debug.js の trailFate / 固定役を開拓者にした席の「運命の固定」)・docs・総合確認【済】
 *
 * 【勝敗の優先度】村人陣営のまま（docs/victory-priority.md の行の追加は不要）。重複役職の優先度（docs/overlay-role-priority.md）も特別扱いなし。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE;

  /** 運命（マイクラ版 TRAILBLAZER_FATES の順） */
  const FATES = ["destruction", "preservation", "harmony", "remembrance", "elation"];
  const NAME = { destruction: "壊滅", preservation: "存護", harmony: "調和", remembrance: "記憶", elation: "愉悦" };
  /** 運命 → 使う能力の役職（マイクラ版 trailblazerFateAbilityRole） */
  const ROLE_OF = { destruction: "sheriff", preservation: "knight", harmony: "carmen", remembrance: "fairy", elation: "troublemaker" };
  const FATE_OF = {}; FATES.forEach((f) => { FATE_OF[ROLE_OF[f]] = f; });
  const VIEW = "fate:";   // 画面に届ける値（カードの下の枠・2回目の面）: "fate:destruction" のように、役職IDと取り違えない形

  const fateName = (fate) => NAME[fate] || "";
  /** 運命の役職ID（g.mimicRole の値）から運命 */
  const fateOfRole = (role) => FATE_OF[role] || null;
  /** 画面に届ける値 "fate:<運命>" ⇔ 運命 / 役職名 */
  const viewOf = (abilityRole) => (FATE_OF[abilityRole] ? VIEW + FATE_OF[abilityRole] : null);
  const isView = (v) => typeof v === "string" && v.startsWith(VIEW);
  const fateOfView = (v) => (isView(v) ? v.slice(VIEW.length) : null);
  const viewName = (v) => (isView(v) ? fateName(v.slice(VIEW.length)) : "");

  /** 「この席・墓地のカード」が開拓者か（key = 持ち主ID または "g:墓地番号"） */
  const cardOf = (g, key) => (String(key).startsWith("g:") ? (g.center || [])[Number(String(key).slice(2))] : (g.currentRoles || {})[key]);
  const isCard = (g, key) => cardOf(g, key) === R_().TRAILBLAZER;

  /** 持ち主 key の運命（開拓者のカードでなければ null。まだ決まっていなければ null） */
  const fateOf = (g, key) => (g && g.mimicRole && isCard(g, key) ? fateOfRole(g.mimicRole[key]) : null);

  /** 持ち主 key の運命を決める（すでに決まっていればそのまま）。デバッグの指定（ONW.debug.trailFate）があればそれ。戻り値: 運命の役職ID */
  function choose(g, key) {
    g.mimicRole = g.mimicRole || {};
    if (g.mimicRole[key] && FATE_OF[g.mimicRole[key]]) return g.mimicRole[key];
    let fate = ONW.debug && ONW.debug.trailFate ? ONW.debug.trailFate(g, key) : null;
    if (!FATES.includes(fate)) fate = FATES[Math.floor(Math.random() * FATES.length)];
    g.mimicRole[key] = ROLE_OF[fate];
    return g.mimicRole[key];
  }
  /** 配役のあと(ONW.mimic.assignAll)に、配られた開拓者と墓地の開拓者すべての運命を決める。g.trailInfo（結果発表の「役職情報」）に積む */
  function assignAll(g) {
    g.trailInfo = [];
    (g.players || []).forEach((p) => {
      if (g.initialRoles[p.id] !== R_().TRAILBLAZER) return;
      g.trailInfo.push({ by: p.name, fate: fateOfRole(choose(g, p.id)) });
    });
    (g.center || []).forEach((r, i) => { if (r === R_().TRAILBLAZER) choose(g, "g:" + i); });   // 墓地のカードにも決めておく（引いたらその運命を引き継ぐ）
  }

  /** 本人に出す文（夜の始まり・酔い覚め・情報確認で完全に一致させる。マイクラ版 night.js） */
  const text = (fate) => `あなたは${fateName(fate)}の運命を歩んでいます。`;
  /** 結果発表の「役職情報」の1行 */
  const infoLine = (x) => `開拓者 ${x.by} は ${fateName(x.fate)}の運命を歩んでいました。`;

  ONW.trailblazer = { FATES, NAME, ROLE_OF, FATE_OF, VIEW, fateName, fateOfRole, viewOf, isView, fateOfView, viewName, cardOf, isCard, fateOf, choose, assignAll, text, infoLine };

  // ---- 夜・酔い覚め・手にしたときの文（模倣の人狼と同じく、運命の役職の夜の情報も合流させる） ----
  /** 運命の役職の夜の画面にある情報（共有者の相方など）を本人の夜の画面に合流させる対象外: 人狼系共通の文・思い込み系は合流させない */
  const skipMerge = (td, fr) => (ONW.SELF_AS_WOLF || []).includes(fr) || (ONW.SELF_AS_VILLAGER || []).includes(fr);


  // ---- CPU・実績（4of4-a。マイクラ版 cpu.js: 「私は○○の運命を歩んでいます」→ 調和は「〇〇に囁いていました」/ 愉悦は「〇〇と△△を交換しました」）----
  const TB = () => R_().TRAILBLAZER;
  /** 配られた開拓者（最初に自分に配られたカード）の運命。g.trailInfo は名前で持っている（配役のとき assignAll が積む）。配られていなければ null */
  const dealtFate = (g, id) => { const p = (g.players || []).find((q) => q.id === id); const x = p && (g.trailInfo || []).find((y) => y.by === p.name); return x ? x.fate : null; };
  /** CPU本人が「歩んでいる」と思っている運命。①夜の行動で覚えた(i.trailFate) ②配られた開拓者の運命（いたずらっ子などで本当のカードが替わっても、本人は通知されないので元のまま）
   *  ③酔いが覚めた・墓荒らし/ドッペルで手にした今のカードの運命。開拓者を持った覚えがなければ null */
  function perceivedFate(g, p, i) {
    if (i && i.trailFate) return i.trailFate;
    const od = !!(g.drunkOverlay && g.drunkOverlay[p.id]);
    if (!od && (g.initialRoles || {})[p.id] === TB()) { const f = dealtFate(g, p.id); if (f) return f; }
    return fateOf(g, p.id);
  }
  /** 運命の発言（COのあとに言う1行）。claim.kind = "trailblazer" */
  const fateClaim = (fate) => ({ short: `${fateName(fate)}の運命`, text: `私は${fateName(fate)}の運命を歩んでいます。`, claim: { kind: "trailblazer", fate } });
  /** 調和・愉悦の続きの結果（本当のこと）: 調和 = 囁いた相手（カルメンの claimOf）/ 愉悦 = 入れ替えた2人（いたずらっ子の cpuClaim。ロックで失敗したときもその文）。なければ null */
  function trueFollow(k, g, p, i, fate) {
    if (fate === "harmony") return i && i.carmenTarget && ONW.carmen ? ONW.carmen.claimOf(k, g, i.carmenTarget) : null;
    if (fate === "elation") { const h = ONW.roleHook("troublemaker", "cpuClaim"), tc = {}; if (h && i) h(k, g, p, "troublemaker", i, tc); return tc.result && tc.result.text ? tc.result : null; }
    return null;
  }
  /** 運命の発言1行目 + 続き(next)。続きは cpuCoFollow が c.extra に移す（本当のCO・騙りのCO・墓荒らし/ドッペル経由の結果で共通） */
  function fateSpeech(k, g, p, i, fate, follow) {
    const res = fateClaim(fate);
    if (follow) res.next = { short: follow.short, text: follow.text, claim: follow.claim, next: null };
    return res;
  }
  /** 本当の開拓者のCPU: 必ず「開拓者CO」→ 運命 →（調和・愉悦なら）結果。運命が分からなければCOだけ */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = "trailblazer";
    const fate = perceivedFate(g, p, i);
    if (!fate) return;
    c.result = fateSpeech(k, g, p, i, fate, trueFollow(k, g, p, i, fate));
  }
  /** 入れ替えたと言う2人が、夜の初めと今で本当に入れ替わった形か（cpu.js の claimIsTrue と同じ見方。人外の騙りは本当にならないように引き直す） */
  const pairIsTrue = (g, a, b) => { const ir = g.initialRoles || {}, cr = g.currentRoles || {}; return !!ir[a] && !!ir[b] && ir[a] !== ir[b] && cr[a] === ir[b] && cr[b] === ir[a]; };
  /** 騙り: 5つの運命からランダムに名乗る。調和なら適当な相手に「囁いていました」、愉悦なら適当な2人を「入れ替えました」（運命だけの3つは結果なし） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const fate = FATES[Math.floor(Math.random() * FATES.length)];
    let follow = null;
    if (fate === "harmony" && ONW.carmen) { const t = k.fakeSeerTarget(g, p); if (t) follow = ONW.carmen.claimOf(k, g, t.id); }
    else if (fate === "elation" && others.length >= 2) {
      let a, b;
      for (let n = 0; n < 30; n++) { a = k.pick(others); b = k.pick(others.filter((q) => q.id !== a.id)); if (!pairIsTrue(g, a.id, b.id)) break; }
      follow = { short: `${a.name} ⇄ ${b.name}`, text: `${a.name} と ${b.name} を入れ替えました。`, claim: { kind: "troublemaker", pair: [a.id, b.id] } };
    }
    return { co, result: fateSpeech(k, g, p, null, fate, follow) };
  }
  /** 実績（マイクラ版 stats.js・wiki の開拓者の10種）。Web版にはまだ実績を保存する仕組みが無いので「この試合で id が満たした実績ID」を返すだけ（初回かどうかは保存側が数える）。
   *  trailblazer_first_<運命> = その運命の開拓者になった（配られた開拓者の運命・最終盤面の今のカードの運命）/ trailblazer_win_<運命> = 最終役職が開拓者で、その運命のまま勝利。
   *  騎士・妖精さん・カルメンの実績は「最終役職がその役職」で数えるので、開拓者が運命の能力を借りているだけでは対象外（模倣の人狼と同じ・マイクラ版と同じ）。 */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id], drunk = !!(g.drunkOverlay && g.drunkOverlay[id]);
    if (!g || !g.currentRoles) return out;
    if ((g.initialRoles || {})[id] === TB() && (!drunk || cur === TB())) { const f = dealtFate(g, id); if (f) out.push("trailblazer_first_" + f); }
    if (cur === TB()) { const f = fateOf(g, id); if (f) { out.push("trailblazer_first_" + f); if (won) out.push("trailblazer_win_" + f); } }
    return out.filter((x, k) => out.indexOf(x) === k);
  }
  Object.assign(ONW.trailblazer, { TB, dealtFate, perceivedFate, fateClaim, trueFollow, fateSpeech, achievements });

  // ---- 結果発表（3of4）: めくれたあと、もう一度裏へ戻り、もう一度めくれて運命（壊滅など）の面になる（呪われし者・猫と同じ要領）----
  //   1回目の面は運命の枠なしの「開拓者」（tbh）、2回目の面は運命の名前（"trailblazer@destruction"。stage.js の face）。
  //   運命は結果の mimicMap（ONW.mimic.pubMap の "fate:<運命>"）→ g.mimicView[席] から読む。
  const UP2 = 1300, EXTRA = 2300;   // 1回目にめくれてから裏に戻るまで / 裏に戻ってからもう一度めくれるまで（猫・呪われし者と同じ長さ）
  const seatFate = (R, id) => T_().fateOfView(((R.g || {}).mimicView || {})[R.P(id)]);
  const T_ = () => ONW.trailblazer;
  const nameOf = (R, id) => { const h = (R.res.history || []).find((x) => x.id === id); return h ? h.name : ""; };
  const CAP = (esc, name, line) => `<div class="res-cap__t t-village">開拓者</div><div>${esc(name)} ${line}</div>`;
  /** めくれた開拓者のカードを at の時刻に裏へ戻し、少しあとでもう一度めくる。noFlip: 演出が重なる（処刑人のギロチンなど）ので、裏返さずに最初から運命の面で見せる */
  function flip2(R, id, at, noFlip) {
    const { later, setCap, esc, paint, G } = R, k = R.P(id), fate = seatFate(R, id), name = nameOf(R, id);
    if (!fate) return;
    if (noFlip) { R.tbv[k] = true; return; }
    later(() => { setCap(CAP(esc, name, "のカードが…")); delete R.up[k]; paint(G()); }, at);
    later(() => { R.tbv[k] = true; R.up[k] = ONW.ROLE.TRAILBLAZER; setCap(CAP(esc, name, `は <span class="t-village">${esc(T_().fateName(fate))}</span> の運命を歩んでいました`)); paint(G()); }, at + EXTRA - 600);
  }
  const stageResult = {
    // めくれる瞬間から、最初から運命の枠つきの面（"trailblazer@destruction"）で出す。「のカードが…」の裏返しはしない
    flipUp: { order: 5, run(R, h) { if (h.role === ONW.ROLE.TRAILBLAZER && seatFate(R, h.id)) R.tbv[R.P(h.id)] = true; } },
    restUp: { order: 5, run(R, k, hid) { if (hid && R.g.mimicView && T_().fateOfView(R.g.mimicView[k]) && (R.rest.find((x) => x[0] === k) || [])[1] === ONW.ROLE.TRAILBLAZER) R.tbv[k] = true; } },
    // スキップ: 演出なしの最終形（運命の面）で見せる
    skip(R) { (R.res.history || []).forEach((h) => { if (h.role === ONW.ROLE.TRAILBLAZER && seatFate(R, h.id)) { R.tbv[R.P(h.id)] = true; delete R.tbh[R.P(h.id)]; } }); },
  };

  ONW.defineRole("trailblazer", {
    stageResult,
    info: { sealTarget: true, deck: 116, name: "開拓者", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.99,
      desc: "村人陣営。試合の開始時に（墓地から引いたときはそのカードの運命を引き継ぎます）、壊滅・存護・調和・記憶・愉悦のいずれかの運命がランダムに決まり、その運命に応じた能力を得ます。壊滅は保安官、存護は騎士、調和はカルメン、記憶は妖精さん、愉悦はいたずらっ子の能力です。どの運命かは夜に本人にだけ伝わります。占い・判定・勝利条件は常に村人陣営の開拓者として扱われます（占われると「開拓者」と出ます）。結果発表では、めくれたあとにもう一度めくれて運命が分かります。" },
    // CPU（4of4-a）
    cpuClaim,
    cpuLie: { role: "trailblazer", weight: 5, order: 21, claim: lieClaim },
    /** 名乗った直後の後処理: 運命の発言に付けた続き（調和=囁いた相手 / 愉悦=入れ替えた2人）を、次の発言（c.extra）に移す */
    cpuCoFollow(k, g, p, r, i, c) {
      const res = c.result;
      if (c.co !== "trailblazer" || !res || !res.next || c.extra) return;
      c.extra = res.next; c.result = { ...res, next: null };
    },
    /** 墓荒らし・ドッペルゲンガーで開拓者を手にしたCPUが、続けて言う結果（運命。調和・愉悦なら結果も1行にまとめる） */
    cpuChainResult(k, g, p, i) {
      const fate = perceivedFate(g, p, i);
      if (!fate) return null;
      const f = fateClaim(fate), ex = trueFollow(k, g, p, i, fate);
      return ex ? { short: `${f.short}・${ex.short}`, text: `${f.text}${ex.text}`, claim: ex.claim } : f;
    },
    // 結果開示（4of4-b。COボタン・co.js が kind で引く）: 役職COのあと、歩んでいる運命を5つから選ぶ →「私は○○の運命を歩んでいます。」（CPUの発言と同じ文・同じ claim）。
    //   調和は続けてカルメンの結果開示（囁いた相手）、愉悦は続けていたずらっ子の結果開示（入れ替えた2人）へ進む（co.js の trailFate）。壊滅・存護・記憶は運命の1行だけ
    coResult: {
      kind: "trailblazer", fateHint: "歩んでいる運命を選んでください。",
      fates: () => FATES.map((f) => ({ fate: f, name: fateName(f) })),
      /** 運命を選んだとき: co.done と同じ並びの [text, claim, setRole, flag, short]。follow = 続けて別の結果開示へ進む種類（調和=carmen / 愉悦=tm。なければ null） */
      pickFate: (fate) => { const c = fateClaim(fate); return { args: [c.text, c.claim, null, "disclose", c.short], follow: fate === "harmony" ? "carmen" : fate === "elation" ? "tm" : null }; },
    },
    groups: { "transform:light_apostle": 54 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 52）で決まる（番号は所属を表すだけ）
    // 夜の始まり: あなたは○○の運命を歩んでいます ＋ 運命の役職の夜の情報（共有者の相方など）
    nightMsg(c, p, r) {
      const g = c.g, fr = g.mimicRole && g.mimicRole[p.id], m = {};
      if (!fr) return m;
      m.text2 = text(fateOfRole(fr));
      const td = ONW.roleDef(fr);
      const tm = td && td.nightMsg && !skipMerge(td, fr) ? td.nightMsg(c, p, fr) || {} : {};
      const extra = [tm.text, tm.text2, ...(tm.lines || [])].filter(Boolean);
      if (extra.length) m.lines = [...(m.lines || []), ...extra];
      { const nt = [].concat(tm.note || []).filter(Boolean); if (nt.length) m.note = nt; }
      Object.keys(tm).forEach((k) => { if (!["t", "text", "text2", "note", "lines", "act", "actRole"].includes(k) && tm[k] != null && m[k] == null) m[k] = tm[k]; });
      return m;
    },
    // 墓荒らし・ドッペル・怪盗などで開拓者を手にしたとき: 運命の文（カードの下の枠は演出データ rev.mimic = ONW.mimic.tag が付ける）＋ 運命の役職の夜の情報
    got(c, p, got, rev, opts) {
      const g = c.g, fr = ONW.mimic.takenMimic(g, p.id, got);
      if (!fr) return;
      c.hold(p.id, text(fateOfRole(fr)));
      const td = ONW.roleDef(fr);
      if (td && td.got && !(ONW.SELF_AS_WOLF || []).includes(fr) && !(ONW.SELF_AS_VILLAGER || []).includes(fr)) ONW.mimic.quietLogs(g, () => td.got(c, p, fr, rev, opts), p.id, got);
    },
    // 酔いが覚めたとき: 運命の文 ＋ 運命の役職の酔い覚めの情報
    soberLines(c, id, fin) {
      const fr = c.g.mimicRole && c.g.mimicRole[id];
      if (!fr) return [];
      const td = ONW.roleDef(fr), tl = td && td.soberLines && !skipMerge(td, fr) ? td.soberLines(c, id, fr) || [] : [];
      return [text(fateOfRole(fr)), ...tl].filter((x, i, a) => a.indexOf(x) === i);
    },
    soberPeek(c, id, fin) {
      const fr = c.g.mimicRole && c.g.mimicRole[id], td = fr && ONW.roleDef(fr);
      return td && td.soberPeek ? td.soberPeek(c, id, fr) || {} : {};
    },
  });
})(window.ONW);
