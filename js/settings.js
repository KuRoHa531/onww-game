/**
 * settings.js — ルームのルールの保存（localStorage）と「マイルール」プリセット
 * ・ホストが変更するたびに自動保存し、次にルームを作るときに復元する
 * ・名前を付けて何個でも（最大20件）プリセット保存できる
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const KEY = "onw.rules.v1", PKEY = "onw.presets.v1";
  const ROLES_V2 = ["werewolf", "dark_avatar", "madman", "villager", "seer", "robber", "light_apostle", "tanner", "silver_shadow"];   // 旧コード(ONW2)の並び
  const ROLES_V3 = [...ROLES_V2, "big_wolf", "mad_seer", "cultist", "relic_robber", "troublemaker", "insomniac"];                   // 旧コード(ONW3)の並び
  const ROLES_V4 = [...ROLES_V3, "mason"];                                                                                           // 旧コード(ONW4)の並び
  const ROLES_V5 = [...ROLES_V4, "love_tanner", "god", "opportunist"];                                                                // 旧コード(ONW5)の並び
  const ROLES_V6 = [...ROLES_V5, "straw_doll", "cat_sidhe", "black_cat"];                                                            // 旧コード(ONW6)の並び
  const ROLES_V7 = [...ROLES_V6, "amanojaku"];                                                                                      // 旧コード(ONW7)の並び
  const ROLES_V8 = [...ROLES_V7, "lone_wolf", "white_wolf", "tofu_wolf"];                                                       // 旧コード(ONW8)の並び
  const ROLES_V9 = [...ROLES_V8, "forgetful_wolf"];                                                                                  // 旧コード(ONW9)の並び
  const ROLES_V10 = [...ROLES_V9, "merlin", "assassin"];                                                                           // 旧コード(ONW10)の並び
  const ROLES_V11 = [...ROLES_V10, "wolf_dreamer", "wolf_marked"];                                                                 // 旧コード(ONW11)の並び
  const ROLES = [...ROLES_V11, "baker", "star"];                                                                                     // 現在(ONW12)。末尾に足していく
  const ROLES_V1 = ["werewolf", "madman", "villager", "robber", "seer"];   // 旧コード(ONW1)の並び
  const clamp = (v, a, b, d) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.max(a, Math.min(b, Math.round(+v))) : d);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  const S = {};

  S.ROLES = ROLES;
  S.snapshot = (g) => ({ roleCounts: { ...g.roleCounts }, villageSize: g.villageSize, graveCount: g.graveCount, seerGrave: g.seerGraveCount, cpuCount: g.cpuCount, timers: { ...g.timers }, fake: !!g.fakeWolfWhenNoWolf, reveal: g.revealTransforms !== false, cand: g.transformCandidates !== false, off: [...(g.transformOff || [])], cpuNames: [...(g.cpuNames || [])] });

  /** 壊れた/古いデータでも安全な値に直す */
  S.sanitize = function (raw) {
    if (!raw || typeof raw !== "object") return null;
    const rc = {}, t = raw.timers || {};
    ROLES.forEach((r) => { rc[r] = clamp(raw.roleCounts && raw.roleCounts[r], 0, 10, 0); });
    return {
      roleCounts: rc, villageSize: clamp(raw.villageSize ?? (Object.values(rc).reduce((a, b) => a + b, 0) - clamp(raw.graveCount, 0, 10, 2)), 3, 10, 4), graveCount: clamp(raw.graveCount, 0, 10, 2), seerGrave: clamp(raw.seerGrave, 0, 10, 2), cpuCount: clamp(raw.cpuCount, 0, 10, 0), fake: raw.fake !== false, reveal: raw.reveal !== false, cand: raw.cand !== false,
      cpuNames: (Array.isArray(raw.cpuNames) ? raw.cpuNames : []).slice(0, 10).map((n) => (typeof n === "string" ? n.trim().slice(0, 12) : "")),
      off: (Array.isArray(raw.off) ? raw.off : []).filter((k) => typeof k === "string" && Object.keys(ONW.TRANSFORM_GROUPS).some((b) => (ONW.TRANSFORM_GROUPS[b] || []).some((t) => k === `${b}:${t}`))),
      timers: { night: clamp(t.night, 5, 600, 45), morning: clamp(t.morning, 5, 600, 10), day: clamp(t.day, 5, 600, 120), vote: clamp(t.vote, 5, 600, 30) },
    };
  };

  S.apply = function (g, x) {
    g.roleCounts = { ...x.roleCounts }; g.villageSize = x.villageSize; g.graveCount = x.graveCount; g.seerGraveCount = x.seerGrave; g.cpuCount = x.cpuCount;
    g.timers = { ...x.timers }; g.fakeWolfWhenNoWolf = x.fake; g.revealTransforms = x.reveal; g.transformCandidates = x.cand; g.transformOff = [...(x.off || [])]; g.cpuNames = [...(x.cpuNames || [])];
  };

  // ---- ルールコード（共有用の文字列）----
  const b64 = { enc: (s) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), dec: (s) => atob(s.replace(/-/g, "+").replace(/_/g, "/")) };
  const chk = (s) => { let n = 0; for (const c of s) n = (n * 31 + c.charCodeAt(0)) % 1296; return n.toString(36).toUpperCase().padStart(2, "0"); };
  S.encode = function (rules) {
    const r = S.sanitize(rules), t = r.timers;
    const body = b64.enc(JSON.stringify([ROLES.map((k) => r.roleCounts[k]), r.graveCount, r.cpuCount, r.fake ? 1 : 0, [t.night, t.morning, t.day, t.vote], r.reveal ? 1 : 0, r.cand ? 1 : 0, r.off, r.seerGrave, r.villageSize]));
    return `ONW12-${body}-${chk(body)}`;
  };
  /** 正しいコードならルールを返す。壊れていれば null（旧形式 ONW1 も読める） */
  S.decode = function (code) {
    try {
      const m = /^(ONW(?:1[012]|[123456789]))-([A-Za-z0-9_-]+)-([0-9A-Z]{2})$/.exec(String(code || "").replace(/\s+/g, ""));
      if (!m || chk(m[2]) !== m[3]) return null;
      const v2 = m[1] !== "ONW1", names = m[1] === "ONW12" ? ROLES : m[1] === "ONW11" ? ROLES_V11 : m[1] === "ONW10" ? ROLES_V10 : m[1] === "ONW9" ? ROLES_V9 : m[1] === "ONW8" ? ROLES_V8 : m[1] === "ONW7" ? ROLES_V7 : m[1] === "ONW6" ? ROLES_V6 : m[1] === "ONW5" ? ROLES_V5 : m[1] === "ONW4" ? ROLES_V4 : m[1] === "ONW3" ? ROLES_V3 : v2 ? ROLES_V2 : ROLES_V1;
      const a = JSON.parse(b64.dec(m[2]));
      if (!Array.isArray(a) || !Array.isArray(a[0]) || a[0].length !== names.length || !Array.isArray(a[4])) return null;
      const rc = {}; names.forEach((k, i) => { rc[k] = a[0][i]; });
      return S.sanitize({ roleCounts: rc, graveCount: a[1], cpuCount: a[2], fake: a[3] === 1, timers: { night: a[4][0], morning: a[4][1], day: a[4][2], vote: a[4][3] }, reveal: v2 ? a[5] === 1 : true, cand: v2 ? a[6] === 1 : true, off: v2 && Array.isArray(a[7]) ? a[7] : [], seerGrave: a[8], villageSize: a[9] });
    } catch (e) { return null; }
  };

  S.save = (g) => store.set(KEY, S.snapshot(g));
  S.load = () => S.sanitize(store.get(KEY));

  S.listPresets = function () {
    const a = store.get(PKEY);
    return (Array.isArray(a) ? a : []).map((p) => ({ name: String((p && p.name) || "").slice(0, 20), rules: S.sanitize(p && p.rules) })).filter((p) => p.name && p.rules);
  };
  S.addPreset = function (name, g) {
    const list = S.listPresets().filter((p) => p.name !== name);          // 同名は上書き
    list.push({ name, rules: S.snapshot(g) });
    return store.set(PKEY, list.slice(-20));
  };
  S.removePreset = function (i) {
    const list = S.listPresets();
    list.splice(i, 1);
    return store.set(PKEY, list);
  };

  ONW.settings = S;
})(window.ONW);
