/**
 * assign.js — アサイン設定（役職設定 > アサイン設定）
 * ------------------------------------------------------------
 * 配役設定(roleCounts)の枚数を「候補の札」として、試合開始のときに配役数(何人村+墓地)ぶんだけ抽選する仕組み。
 * マイクラ版の「村人／人狼／第三の最小・最大配役人数」(buildLimitedRolePoolForGame) の強化版で、役職ごとの出る確率がある。
 *
 *   ・OFF（初期値）: 従来どおり。配役設定の枚数がそのまま配役になる（枚数がぴったり必要）。
 *   ・ON : 配役設定の枚数は「候補」。陣営ごとの最少人数〜最大人数の範囲で、各陣営の人数をランダムに決め、
 *          その人数ぶんの役職を候補から選ぶ。合計は必ず配役数（何人村+墓地）と同じになる（範囲を全部2までにしても、各1ずつで足りなくならない）。
 *   ・役職ごとの確率: 配役設定で 2枚 にした役職は、1枚目(①)・2枚目(②)…ごとに「出る確率」を決められる（初期値100%）。
 *          例: 光の使徒 ①100% ②50% / 闇の化身 ①100% ②50% → 光2・闇1 になったり 光1・闇2 になったりする。
 *   ・選ばれなかった候補は「欠け」（g.missingRoles）として、結果の役職履歴の下に出る。
 *
 * 状態（ホストの g に持つ。ルーム設定の保存・ルールコード・ロビーの通信に乗る）:
 *   g.assignOn      アサイン設定のON/OFF（初期値 false）
 *   g.assignRange   { village:[最少,最大], wolf:[最少,最大], third:[最少,最大] }（各 0〜10。初期値は 0/0。ON/OFFを切り替えても値は残る）
 *   g.assignChance  { 役職ID: [①の確率, ②の確率, …] }（%。書いていない札は100%）
 *   g.missingRoles  試合の欠け（試合開始のたびに作り直す。OFFのときは空）
 * ------------------------------------------------------------ */
window.ONW = window.ONW || {};
(function (ONW) {
  "use strict";
  const A = {};
  const TEAMS = ["village", "wolf", "third"];
  A.TEAMS = TEAMS;
  A.TEAM_NAME = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" };
  A.MAX = 10;            // 陣営ごとの最大人数の上限（配役設定の1役職の枚数の上限と同じ）
  A.MAX_COPIES = 10;     // 1役職の枚数の上限（配役設定）

  const clamp = (v, a, b, d) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.max(a, Math.min(b, Math.round(+v))) : d);

  A.defaults = () => ({ on: false, range: { village: [0, 0], wolf: [0, 0], third: [0, 0] }, chance: {} });   // 初期値は 0/0（最少0・最大0。範囲を決めていない状態＝陣営の人数は候補からランダム）

  /** 壊れた/古いデータでも安全な形に直す。isRole を渡すと、知らない役職IDの確率は捨てる */
  A.sanitize = function (raw, isRole) {
    const o = A.defaults();
    if (!raw || typeof raw !== "object") return o;
    o.on = raw.on === true;
    TEAMS.forEach((t) => {
      const r = raw.r && raw.r[t];
      if (Array.isArray(r)) { const mn = clamp(r[0], 0, A.MAX, 0); o.range[t] = [mn, clamp(r[1], mn, A.MAX, mn)]; }
    });
    const ch = raw.ch && typeof raw.ch === "object" ? raw.ch : {};
    Object.keys(ch).forEach((k) => {
      if (isRole && !isRole(k)) return;
      const arr = Array.isArray(ch[k]) ? ch[k].slice(0, A.MAX_COPIES).map((v) => clamp(v, 0, 100, 100)) : [];
      if (arr.some((v) => v !== 100)) o.chance[k] = arr;   // 全部100%の役職は書かない（初期値と同じ）
    });
    return o;
  };

  /** ゲームの状態 g → 保存・通信用の形 { on, r, ch } */
  A.pack = (g) => ({ on: !!g.assignOn, r: A.ranges(g), ch: JSON.parse(JSON.stringify(g.assignChance || {})) });
  /** 保存・通信の形 → g に反映 */
  A.unpack = function (g, raw, isRole) {
    const a = A.sanitize(raw, isRole);
    g.assignOn = a.on; g.assignRange = a.range; g.assignChance = a.chance;
  };

  // ---- 設定の読み書き（ホストの操作） ----
  /** 陣営の [最少, 最大]（g に無ければ初期値） */
  A.range = function (g, team) {
    const r = (g.assignRange || {})[team];
    const mn = clamp(r && r[0], 0, A.MAX, 0);
    return [mn, clamp(r && r[1], mn, A.MAX, mn)];
  };
  A.ranges = (g) => ({ village: A.range(g, "village"), wolf: A.range(g, "wolf"), third: A.range(g, "third") });
  /** 陣営の最少/最大を delta だけ動かす（which: 0=最少 1=最大）。最少が最大を超えたら最大も上げ、最大が最少を下回ったら最少も下げる */
  A.step = function (g, team, which, delta) {
    if (!TEAMS.includes(team)) return;
    const cur = A.range(g, team); let [mn, mx] = cur;
    if (which === 0) { mn = clamp(mn + delta, 0, A.MAX, mn); if (mx < mn) mx = mn; }
    else { mx = clamp(mx + delta, 0, A.MAX, mx); if (mn > mx) mn = mx; }
    g.assignRange = { ...A.ranges(g), [team]: [mn, mx] };
  };
  /** 役職 role の k枚目(0始まり)の確率 */
  A.chance = (g, role, k) => clamp(((g.assignChance || {})[role] || [])[k], 0, 100, 100);
  /** 役職 role の k枚目の確率を delta(%) 動かす */
  A.stepChance = function (g, role, k, delta) {
    if (!(k >= 0 && k < A.MAX_COPIES)) return;
    const arr = Array.from({ length: Math.max(k + 1, ((g.assignChance || {})[role] || []).length) }, (_, i) => A.chance(g, role, i));
    arr[k] = clamp(arr[k] + delta, 0, 100, arr[k]);
    const next = { ...(g.assignChance || {}) };
    if (arr.every((v) => v === 100)) delete next[role]; else next[role] = arr;
    g.assignChance = next;
  };

  // ---- 抽選 ----
  /** 役職の陣営（village / wolf / third）。陣営が分からない役職は村人陣営 */
  A.teamOf = function (role) {
    const t = ONW.ROLE_INFO && ONW.ROLE_INFO[role] && ONW.ROLE_INFO[role].team;
    return TEAMS.includes(t) ? t : "village";
  };

  /** 候補の札（配役設定の枚数ぶん）。1枚ごとに { role, k(0始まり。何枚目か), team, p(出る確率%) } */
  A.pool = function (g) {
    const out = [];
    Object.entries(g.roleCounts || {}).forEach(([role, n]) => {
      for (let k = 0; k < (n || 0); k++) out.push({ role, k, team: A.teamOf(role), p: A.chance(g, role, k) });
    });
    return out;
  };
  /** 配役数（何人村 + 墓地） */
  A.need = (g) => (g.villageSize || 0) + (g.graveCount || 0);

  /**
   * 陣営ごとの人数の組み合わせを全部数える: { n:{village,wolf,third}, over: 範囲からはみ出した人数の合計, short: 出る札が足りない人数の合計 }
   *   cap = 陣営ごとに選べる札の数（候補の数）、elig = 確率に当たった札の数
   */
  function patterns(g, need, cap, elig) {
    const R = A.ranges(g), out = [];
    for (let v = 0; v <= Math.min(need, cap.village); v++) {
      for (let w = 0; w <= Math.min(need - v, cap.wolf); w++) {
        const t = need - v - w;
        if (t < 0 || t > cap.third) continue;
        const n = { village: v, wolf: w, third: t };
        let over = 0, short = 0;
        TEAMS.forEach((k) => { over += Math.max(0, R[k][0] - n[k]) + Math.max(0, n[k] - R[k][1]); short += Math.max(0, n[k] - elig[k]); });
        out.push({ n, over, short });
      }
    }
    return out;
  }

  /**
   * ロビーの確認用: 今の設定で試合ができるか。
   *   have = 候補の札の数 / need = 配役数 / ok = 候補が足りている（OFFのときは、ぴったり）
   *   fit = 陣営の人数の範囲で、配役数ぴったりに収まる組み合わせがあるか（収まらなくても試合はできるが、範囲からはみ出す）
   */
  A.check = function (g) {
    const need = A.need(g), pool = A.pool(g), have = pool.length;
    const cap = { village: 0, wolf: 0, third: 0 };
    pool.forEach((c) => { cap[c.team]++; });
    if (!g.assignOn) return { on: false, need, have, ok: have === need, fit: true, cap };
    const pats = patterns(g, need, cap, cap);
    const fit = pats.some((p) => p.over === 0);
    return { on: true, need, have, ok: have >= need, fit, cap };
  };

  /**
   * 配役を抽選する。戻り値: { roles: 配役数ぴったりの役職IDの配列, missing: 選ばれなかった候補の役職ID, targets: 陣営ごとの人数, relaxed: 範囲や確率を曲げたか }
   *   1) 候補の札それぞれを、確率で「出る札」か「出ない札」かに決める
   *   2) 陣営ごとの人数の組み合わせから、範囲に収まっていて、出る札で足りるものをランダムに1つ選ぶ（なければ、範囲を守って足りない札を最小にする → それも無理なら範囲をいちばん外れない組み合わせ）
   *   3) 陣営ごとに、出る札からランダムにその人数ぶんを選ぶ（出る札が足りなければ、出ない札から補う）
   *   候補が配役数より少ないときだけ、足りない分を村人で埋める（ロビーで開始できないので、ふつうは起きない）
   * rnd は 0以上1未満の乱数（テスト用に差し替えられる）
   */
  A.draw = function (g, need, rnd) {
    rnd = rnd || Math.random;
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const pool = A.pool(g).map((c) => ({ ...c, up: rnd() * 100 < c.p }));   // 1) 確率で出る札を決める
    const by = { village: [], wolf: [], third: [] };
    pool.forEach((c) => by[c.team].push(c));
    const cap = {}, elig = {};
    TEAMS.forEach((t) => { cap[t] = by[t].length; elig[t] = by[t].filter((c) => c.up).length; });
    // 2) 陣営ごとの人数
    const pats = patterns(g, need, cap, elig);
    let targets = null, relaxed = false;
    if (pats.length) {
      const best = pats.reduce((m, p) => (p.over < m.over || (p.over === m.over && p.short < m.short) ? p : m), pats[0]);
      const ties = pats.filter((p) => p.over === best.over && p.short === best.short);
      targets = pick(ties).n;
      relaxed = best.over > 0 || best.short > 0;
    } else {
      targets = { village: 0, wolf: 0, third: 0 }; relaxed = true;   // 候補が配役数に足りない
    }
    // 3) 陣営ごとに選ぶ
    const chosen = new Set();
    TEAMS.forEach((t) => {
      const up = by[t].filter((c) => c.up), down = by[t].filter((c) => !c.up);
      for (let i = 0; i < targets[t]; i++) {
        const src = up.length ? up : down;
        const c = src.splice(Math.floor(rnd() * src.length), 1)[0];
        if (c) chosen.add(c);
      }
    });
    const roles = pool.filter((c) => chosen.has(c)).map((c) => c.role);
    while (roles.length < need) { roles.push("villager"); relaxed = true; }
    const missing = pool.filter((c) => !chosen.has(c)).map((c) => c.role);
    return { roles, missing: ONW.sortByRoleOrder ? ONW.sortByRoleOrder(missing) : missing, targets, relaxed };
  };

  ONW.assign = A;
})(window.ONW);
