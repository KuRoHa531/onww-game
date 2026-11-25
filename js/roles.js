/**
 * roles.js
 * ------------------------------------------------------------
 * 役職の配布や参照に関するロジック。
 * 「箱」段階なので、各役職固有の能力そのもの（占う・交換するetc.）は
 * night.js 側の TODO として空けてあり、ここでは配役の骨組みだけを作る。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const roles = {};

  /** role のカードから表示情報を引く */
  roles.getInfo = function getInfo(role) {
    return ONW.ROLE_INFO[role] || { name: role, team: ONW.TEAM.VILLAGE, wakeOrder: null, desc: "" };
  };

  /** 選択された役職構成が人数(プレイヤー+墓地3枚)と一致しているか検証 */
  roles.validateSetup = function validateSetup(game) {
    const needed = game.playerCount + 3;
    if (game.selectedRoles.length !== needed) {
      return { ok: false, message: `役職の枚数(${game.selectedRoles.length})が人数+3(${needed})と一致していません。` };
    }
    return { ok: true };
  };

  /**
   * 役職カードをシャッフルして配る。
   * プレイヤーに1枚ずつ、残り3枚を墓地に置く。
   */
  roles.dealRoles = function dealRoles(game) {
    const deck = ONW.utils.shuffle([...game.selectedRoles]);
    ONW.roles.dropCoexistingPriest(deck);   // 神官と狂った神官が一緒に配役に入ったら、片方だけにする（マイクラ版 buildRolePool）
    if (ONW.debug) ONW.debug.applyLocks(game, deck);   // デバッグ: 固定役を反映

    game.initialRoles = {};
    game.currentRoles = {};

    game.players.forEach((player, i) => {
      const role = deck[i];
      game.initialRoles[player.id] = role;
      game.currentRoles[player.id] = role;
    });

    game.center = deck.slice(game.players.length);
    ONW.roles.applyTransforms(game);
    ONW.roles.ensurePriestTypesDoNotCoexist(game);   // 光の使徒・闇の化身の変化で、神官と狂った神官が両方出たときも、片方だけにする（マイクラ版 ensurePriestTypesDoNotCoexist）
    ONW.roles.avoidCpuDictator(game);   // 独裁者(昼能力)を CPU が引いたら、人間と入れ替える（マイクラ版 avoidUnfixedCpuDayRoles）
    ONW.roles.assignServants(game);   // 変化のあとに、従者のご主人を決める
    ONW.roles.assignExecutioners(game);   // 処刑人のターゲットを決める
  };

  /**
   * 神官と狂った神官は、同じ試合に一緒に出ない（マイクラ版 buildRolePool / ensurePriestTypesDoNotCoexist）。
   * 両方あるときは、どちらか1種類（50%ずつ）をまるごと、神官なら村人・狂った神官なら狂人に置き換える。
   *   dropCoexistingPriest: 配る前の山札（deck）で。 ensurePriestTypesDoNotCoexist: 変化のあとの盤面（プレイヤー＋墓地）で。
   *   デバッグで固定した席は動かさない（役職を指定してデバッグしているときに勝手に変わらないように）。変化前の記録 transformFrom はそのまま残る。
   */
  roles.dropCoexistingPriest = function dropCoexistingPriest(deck) {
    if (!deck.includes("priest") || !deck.includes("mad_priest")) return null;
    const removed = Math.random() < 0.5 ? "priest" : "mad_priest", rep = removed === "priest" ? "villager" : "madman";
    for (let i = 0; i < deck.length; i++) if (deck[i] === removed) deck[i] = rep;
    return removed;
  };
  roles.ensurePriestTypesDoNotCoexist = function ensurePriestTypesDoNotCoexist(game) {
    const all = [...Object.values(game.initialRoles || {}), ...(game.center || [])];
    if (!all.includes("priest") || !all.includes("mad_priest")) return null;
    const dbg = game.debugOn && game.dbg ? game.dbg : null, fixed = (id) => !!(dbg && (dbg.roles || {})[id]);
    const removed = Math.random() < 0.5 ? "priest" : "mad_priest", rep = removed === "priest" ? "villager" : "madman";
    game.players.forEach((p) => { if (game.initialRoles[p.id] === removed && !fixed(p.id)) { game.initialRoles[p.id] = rep; game.currentRoles[p.id] = rep; } });
    game.center = (game.center || []).map((r) => (r === removed ? rep : r));
    return removed;
  };

  /**
   * CPU は昼能力（独裁者・交換者・狂った交換者・盗賊・妖精さん）を自分では使わないので、固定していない CPU がこれらを引いたら、人間の参加者と役職を入れ替える（マイクラ版 avoidUnfixedCpuDayRoles と同じ）。
   * 「固定している」= デバッグの固定役で指定した席。昼能力はデバッグの「昼能力」タブで、リアルタイムに発動する（ONW.net.debugDayAbility。事前の対象指定は廃止）。
   * 光の使徒などの変化で昼能力の役職になった CPU も同じ（変化前の記録 transformFrom は人間のほうへ付け替える）。人間が1人もいない（全員 CPU）ときは入れ替えない。
   * 入れ替え先の人間は、独裁者・交換者・狂った交換者・盗賊・妖精さんを持っていない人から選ぶ（昼能力の役職を別の CPU へ移さないため）。
   */
  roles.avoidCpuDictator = function avoidCpuDictator(game) {
    const DAY = [[ONW.ROLE.YOMI], [ONW.ROLE.DICTATOR], [ONW.ROLE.EXCHANGER], [ONW.ROLE.MAD_EXCHANGER], [ONW.ROLE.THIEF], [ONW.ROLE.FAIRY], [ONW.ROLE.GORANSHIN], [ONW.ROLE.ICARUS]];   // CPU が自分では使わない昼能力の役職（妖精さんも。マイクラ版 hasDayActionRole / avoidUnfixedCpuDayRoles に入っている）
    const dbg = game.debugOn && game.dbg ? game.dbg : null;
    const fixed = (id) => !!(dbg && (dbg.roles || {})[id]);
    const isDay = (id) => DAY.some(([r]) => game.initialRoles[id] === r);
    const humans = () => game.players.filter((p) => !p.isCpu && !isDay(p.id) && !fixed(p.id)).map((p) => p.id);
    DAY.forEach(([role]) => {
      game.players.filter((p) => p.isCpu && game.initialRoles[p.id] === role && !fixed(p.id)).forEach((p) => {
        const c = humans();
        if (!c.length) return;
        const h = ONW.utils.randomChoice(c);
        [game.initialRoles[p.id], game.initialRoles[h]] = [game.initialRoles[h], game.initialRoles[p.id]];
        [game.currentRoles[p.id], game.currentRoles[h]] = [game.currentRoles[h], game.currentRoles[p.id]];
        const a = game.transformFrom[p.id], b = game.transformFrom[h];
        if (b === undefined) delete game.transformFrom[p.id]; else game.transformFrom[p.id] = b;
        if (a === undefined) delete game.transformFrom[h]; else game.transformFrom[h] = a;
      });
    });
  };

  /**
   * 従者のご主人を決める（本家 assignServants と同じ）。配布(変化のあと)の時点で従者を持っている人それぞれに、
   * 自分以外の参加者（CPU含む・他の従者でもよい）からランダムで1人。墓地にある従者にはご主人はいない
   * （あとで墓荒らしが引いたときに、引いた人に新しいご主人が決まる = ONW.fixServants）。
   * ご主人は「役職の持ち主」に記録する(g.servantMasters[持ち主ID] = ご主人のID)。state.js の【必読】メモのとおり、カードが動けばご主人もついていく。
   */
  roles.assignServants = function assignServants(game) {
    game.servantMasters = {};
    game.servantNotified = {};   // 従者通知(ご主人へ「あなたの従者がいるようです。」)を出したか。従者のカードについていく
    const ids = game.players.map((p) => p.id);
    ids.filter((id) => game.initialRoles[id] === ONW.ROLE.SERVANT).forEach((id) => {
      const c = ids.filter((x) => x !== id);
      const forced = ONW.debug && ONW.debug.servantMaster ? ONW.debug.servantMaster(game, id) : null;   // デバッグ: ご主人の指定
      if (forced && c.includes(forced)) game.servantMasters[id] = forced;
      else if (c.length) game.servantMasters[id] = ONW.utils.randomChoice(c);
    });
  };

  /** 処刑人のターゲットを決める: 配布(変化のあと)の時点で処刑人を持っている人それぞれに、自分以外の参加者（CPU含む）からランダムで1人。ターゲットは役職の持ち主に記録され、カードについて動く */
  roles.assignExecutioners = function assignExecutioners(game) {
    game.execTargets = {};
    const ids = game.players.map((p) => p.id);
    ids.filter((id) => game.initialRoles[id] === ONW.ROLE.EXECUTIONER).forEach((id) => {
      const c = ids.filter((x) => x !== id);
      const forced = ONW.debug && ONW.debug.randTarget ? ONW.debug.randTarget(game, "exec", id) : null;   // デバッグ: ターゲットの指定
      if (forced && c.includes(forced)) game.execTargets[id] = forced;
      else if (c.length) game.execTargets[id] = ONW.utils.randomChoice(c);
    });
  };

  /**
   * 変化役（光の使徒・闇の化身・銀色の影）は試合開始時に、同じ陣営の役職へランダムに変化する。
   * プレイヤーの手札も墓地の札も変化する。変化前は transformFrom / centerTransformFrom に残す。
   */
  /** 変化先の有無設定(OFFのものを除いた変化先)。全部OFFなら空 = 変化しない */
  roles.enabledTargets = function enabledTargets(game, base) {
    const off = game.transformOff || [];
    return (ONW.TRANSFORM_GROUPS[base] || []).filter((t) => !off.includes(`${base}:${t}`));
  };

  // ---- 前の試合の変化先を避ける（連戦で同じ役職が続かないように）----
  // 直近 TF_HIST_GAMES 試合ぶんの「変化して出た役職」を覚えておき、次の試合の変化先では、たまにだけ(TF_REPEAT_RATE)被りを許して、あとは避ける。
  // 覚える場所: このブラウザ(ホスト)の localStorage と、画面を開いている間のメモリ。ルームを作り直しても、同じブラウザなら続く。
  const TF_HIST_GAMES = 2, TF_REPEAT_RATE = 0.2, TF_HIST_KEY = "onw.tfhist.v1";
  roles.tfHistory = null;   // [[役職ID, ...], ...] 古い順。最後が直前の試合
  roles.loadTfHistory = function () {
    if (roles.tfHistory) return roles.tfHistory;
    let a = null;
    try { a = JSON.parse(localStorage.getItem(TF_HIST_KEY)); } catch (e) { a = null; }
    roles.tfHistory = (Array.isArray(a) ? a : []).filter(Array.isArray).map((x) => x.filter((r) => typeof r === "string")).slice(-TF_HIST_GAMES);
    return roles.tfHistory;
  };
  /** 試合の変化結果を記録する（変化して出た役職だけ。シナジーで置き換わったあとの最終の役職） */
  roles.recordTfHistory = function (game) {
    const out = [];
    game.players.forEach((p) => { if (game.transformFrom && game.transformFrom[p.id]) out.push(game.initialRoles[p.id]); });
    (game.center || []).forEach((r, i) => { if (game.centerTransformFrom && game.centerTransformFrom[i]) out.push(r); });
    const h = roles.loadTfHistory(); h.push(out); while (h.length > TF_HIST_GAMES) h.shift();
    try { localStorage.setItem(TF_HIST_KEY, JSON.stringify(h)); } catch (e) { /* 保存できなくてもメモリには残る */ }
  };

  roles.applyTransforms = function applyTransforms(game) {
    const pick = ONW.utils.randomChoice, G = ONW.TRANSFORM_GROUPS;
    const pool = (b) => ONW.roles.enabledTargets(game, b);
    game.transformFrom = {}; game.centerTransformFrom = {};
    const lockedKeys = new Set();   // デバッグで変化先を指定した枠はシナジーで動かさない
    // 人狼陣営(闇の化身)・第三陣営(銀色の影)の変化先は、盤面にすでにある役職と被らないように選ぶ。被るのはたまにだけ(DUP_RATE)。
    // 変化役でないカードは先に数えておく（配役に人狼がいるのに闇の化身も人狼に…を減らす）
    const DUP_RATE = 0.3;
    const VILLAGE_DUP_RATE = 0.15;   // 光の使徒の変化先が、盤面にすでに多い役職と被るのを許す確率
    const used = {};
    const mark = (r) => { used[r] = (used[r] || 0) + 1; };
    const recent = new Set(roles.loadTfHistory().flat());   // 直近の試合で変化して出た役職
    game.players.forEach((p) => { const r = game.initialRoles[p.id]; if (!G[r]) mark(r); });
    game.center.forEach((r) => { if (!G[r]) mark(r); });
    const pickTarget = (base) => {
      const all = pool(base);
      let list = all;
      if (base === ONW.ROLE.DARK_AVATAR || base === ONW.ROLE.SILVER_SHADOW) {
        const fresh = all.filter((t) => !used[t]);
        if (fresh.length && Math.random() >= DUP_RATE) list = fresh;
      }
      if (base === ONW.ROLE.LIGHT_APOSTLE) {
        // 村人陣営（光の使徒）: 同じ役職ばかりに偏らないよう、盤面での枚数がいちばん少ない役職から選ぶ（たまにだけ被りを許す）。
        // ここで選んだあとに闇鍋シナジーが走るので、狼夢人の人狼・共有者2枚などの必要役職は、これまで通り別途足される
        const min = Math.min(...all.map((t) => used[t] || 0));
        const least = all.filter((t) => (used[t] || 0) === min);
        if (least.length && Math.random() >= VILLAGE_DUP_RATE) list = least;
      }
      if (recent.size && Math.random() >= TF_REPEAT_RATE) {   // 直近の試合の変化先は避ける（たまにだけ被りを許す）。避けると候補が無くなるときは避けない
        const fresh2 = list.filter((t) => !recent.has(t)), fresh3 = all.filter((t) => !recent.has(t));
        if (fresh2.length) list = fresh2; else if (fresh3.length) list = fresh3;
      }
      const t = pick(list);
      mark(t);
      return t;
    };
    game.players.forEach((p) => {
      const before = game.initialRoles[p.id];
      const forced = ONW.debug ? ONW.debug.forcedTransform(game, p.id, before) : null;
      if (!G[before] || (!pool(before).length && !forced)) return;
      if (forced) lockedKeys.add(`p:${p.id}`);
      const after = forced || pickTarget(before);
      if (forced) mark(forced);
      game.transformFrom[p.id] = before;
      game.initialRoles[p.id] = after; game.currentRoles[p.id] = after;
    });
    game.center = game.center.map((before, i) => {
      const forced = ONW.debug ? ONW.debug.forcedTransform(game, `center:${i}`, before) : null;
      if (!G[before] || (!pool(before).length && !forced)) return before;
      game.centerTransformFrom[i] = before;
      if (forced) lockedKeys.add(`c:${i}`);
      if (forced) { mark(forced); return forced; }
      return pickTarget(before);
    });
    ONW.roles.applySynergy(game, lockedKeys);
    roles.recordTfHistory(game);
  };

  /** 変化の結果に闇鍋シナジー(SYNERGY_RULES)を適用する */
  roles.applySynergy = function applySynergy(game, lockedKeys) {
    game.synergyLog = [];
    const slots = [];
    const RULES = roles.synergyRules();   // SYNERGY_RULES + 自認村人の役職の自動ルール
    game.players.forEach((p) => slots.push({ key: `p:${p.id}`, id: p.id, role: game.initialRoles[p.id], from: game.transformFrom[p.id] || null }));
    game.center.forEach((r, i) => slots.push({ key: `c:${i}`, idx: i, role: r, from: game.centerTransformFrom[i] || null }));
    const has = (r) => slots.some((s) => s.role === r);
    const triggers = new Set(RULES.map((r) => r.trigger));
    const locked = new Set(lockedKeys || []);
    // 役職固定が最優先: 固定した席(変化先まで指定した枠 + 固定役が変化役でない席)は、シナジーで一切動かさない
    const dbgLocks = (game.debugOn && game.dbg) ? (game.dbg.roles || {}) : {};
    slots.forEach((s) => { if (dbgLocks[s.id !== undefined ? s.id : `center:${s.idx}`] && (!s.from || locked.has(s.key))) locked.add(s.key); });
    const placed = new Set();   // シナジーで置いた枠（以降も守る）
    const countTriggers = new Set(ONW.SYNERGY_COUNT_RULES.map((r) => r.trigger).filter(Boolean));
    const hasLover = Object.keys(game.loverOf || {}).length > 0;
    const active = (r) => (r.always || has(r.trigger)) && (!r.requires || has(r.requires)) && !(r.unlessLover && hasLover);   // requires: trigger に加えて、この役職も盤面にいるときだけ働くルール（スティーブが出ている闇鍋の模倣の人狼）
    // 守る枠を（今の盤面から）計算する。trigger が置き換えで消えたシナジーの必要役職は、守らなくなる
    const computeKept = () => {
      const kept = new Set(locked);
      placed.forEach((k) => kept.add(k));
      // すでに条件を満たしている枠は、置き換えで壊さないよう守る
      RULES.forEach((r) => {
        slots.forEach((s) => { if (s.role === r.trigger) kept.add(s.key); });
        if (!has(r.trigger)) return;   // trigger がいないルールの必要役職は守らない（別のルールの置き換え先にできるように）
        const need = {}; r.required.forEach((q) => { need[q] = (need[q] || 0) + 1; });
        Object.keys(need).forEach((q) => { slots.filter((s) => s.role === q).slice(0, need[q]).forEach((f) => kept.add(f.key)); });   // 必要役職は必要な枚数だけ守る(余りは他の必要役職に回せる)
      });
      // 個数ルール(SYNERGY_COUNT_RULES): trigger がいるとき、すでにいる対象役職の枠(必要枚数まで)は置き換えで壊さないよう守る
      ONW.SYNERGY_COUNT_RULES.forEach((r) => {
        if (!active(r)) return;
        if (r.trigger) slots.forEach((s) => { if (s.role === r.trigger) kept.add(s.key); });   // 後覚者そのものは置き換えない
        slots.filter((s) => r.anyOf.includes(s.role)).slice(0, r.min).forEach((f) => kept.add(f.key));
      });
      return kept;
    };
    let kept = computeKept();
    // ---- デバッグ用のシナジー記録（game.synergyLog。結果画面の「シナジー情報」に出す）----
    const rname = (r) => (ONW.ROLE_INFO[r] || {}).name || r;
    const lbl = (s) => (s.id !== undefined ? ((game.players.find((q) => q.id === s.id) || {}).name || "?") : `墓地${s.idx + 1}`);
    const slog = [];   // 置き換えの記録 { kind: req | count | cap, rule, role, from, base, slot }
    let cur = null;    // いま処理しているルール { kind, rule }
    const note = (slot, role) => { if (cur) slog.push({ kind: cur.kind, rule: cur.rule, role, from: slot.role, base: slot.from, slot: lbl(slot) }); };
    const set = (slot, role) => {
      note(slot, role);
      slot.role = role; kept.add(slot.key); placed.add(slot.key);
      if (slot.id !== undefined) { game.initialRoles[slot.id] = role; game.currentRoles[slot.id] = role; } else game.center[slot.idx] = role;
    };
    const inPair = (s) => (s.role === ONW.ROLE.MERLIN && has(ONW.ROLE.ASSASSIN)) || (s.role === ONW.ROLE.ASSASSIN && has(ONW.ROLE.MERLIN));
    // 支え役: 盤面にいる別の役職(trigger)の必要役職になっている枠。単体でも成り立つので、置き換えるなら先にこちらでなく「依存する側(trigger)」を使う
    //   例: 麻婆の人狼がいるなら豆腐の人狼は支え役(麻婆は豆腐が出ていないと意味がない) / 背徳者がいるなら妖狐は支え役(背徳者はご主人の妖狐が出ていないと意味がない)
    const supports = (s) => RULES.some((q) => q.trigger !== s.role && has(q.trigger) && q.required.includes(s.role));
    // 置き換える枠を選ぶ: 支え役でない枠を先に使い(麻婆・背徳者など)、その中でも trigger でない枠を優先する。支え役しか無いときだけ支え役を使う
    const pickSlot = (cands) => {
      const free = cands.filter((s) => !supports(s));
      const pool = free.length ? free : cands;
      const c = pool.filter((s) => !triggers.has(s.role));
      return ONW.utils.randomChoice(c.length ? c : pool);
    };
    // 上限を先に適用する個数ルール(early: true。マーリン1人まで): 他のシナジーより前に余りを減らして、空いた枠を他のシナジー（独裁者など）に使えるようにする
    //   （アサシンがいるときマーリンは「アサシン↔マーリン」の組として守られ、他のシナジーの置き換えに使えないので、余ったマーリンの枠は先に空けておく）
    ONW.SYNERGY_COUNT_RULES.filter((r) => r.early && r.max && active(r)).forEach((rule) => {
      cur = { kind: "cap", rule };
      const trigAll = new Set([...RULES.map((r) => r.trigger), ...ONW.SYNERGY_COUNT_RULES.map((r) => r.trigger)].filter(Boolean));
      let guard = 8;
      while (slots.filter((s) => rule.anyOf.includes(s.role)).length > rule.max && guard-- > 0) {
        const cands = slots.filter((s) => rule.anyOf.includes(s.role) && s.from && !locked.has(s.key) && ONW.roles.enabledTargets(game, s.from).some((t) => !rule.anyOf.includes(t) && !trigAll.has(t)));
        if (!cands.length) break;
        const slot = ONW.utils.randomChoice(cands);
        const o = ONW.roles.enabledTargets(game, slot.from).filter((t) => !rule.anyOf.includes(t) && !trigAll.has(t));
        const cnt = (r) => slots.filter((s) => s.role === r).length, min = Math.min(...o.map(cnt));
        const pickR = ONW.utils.randomChoice(o.filter((r) => cnt(r) === min));
        note(slot, pickR);
        slot.role = pickR; kept.delete(slot.key); placed.delete(slot.key);   // 変え直した枠は、他のシナジーが使える空き枠にする
        if (slot.id !== undefined) { game.initialRoles[slot.id] = pickR; game.currentRoles[slot.id] = pickR; } else game.center[slot.idx] = pickR;
      }
    });
    // 優先度高めのシナジー(rule.priority の役職): 他のシナジーより先に確保する。空いている枠が無いときは、他のシナジーの枠を置き換えてでも出す
    //   (置き換えるのは、固定していない・変化役から変化した枠のうち、この優先シナジーの trigger/必要役職・アサシン↔マーリンでないもの。先に「どのルールの必要役職でもない枠」を使う)
    {
      const prio = RULES.filter((r) => r.priority && has(r.trigger));
      const prioTrig = new Set(prio.map((r) => r.trigger));
      const prioReq = new Set(prio.flatMap((r) => r.priority));
      const neededByOthers = (role) => RULES.some((q) => has(q.trigger) && q.required.includes(role));
      prio.forEach((rule) => {
        cur = { kind: "req", rule };
        const seen = {};
        rule.priority.forEach((req) => {
          seen[req] = (seen[req] || 0) + 1;
          const need = rule.required.filter((q) => q === req).length || 1;
          if (slots.filter((s) => s.role === req).length >= Math.max(seen[req], need > 1 ? need : 1)) return;
          const can = (s) => s.from && !locked.has(s.key) && ONW.roles.enabledTargets(game, s.from).includes(req);
          const movable = (s) => can(s) && s.role !== req && !prioTrig.has(s.role) && !prioReq.has(s.role) && !inPair(s);
          let cands = slots.filter((s) => !kept.has(s.key) && can(s));
          if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && movable(s) && !triggers.has(s.role) && !neededByOthers(s.role));
          if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && movable(s) && !supports(s));   // 支え役(豆腐の人狼・妖狐など)より先に、依存する側(麻婆の人狼・背徳者など)を置き換える
          if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && movable(s) && !triggers.has(s.role));
          if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && movable(s));
          if (!cands.length) return;
          set(pickSlot(cands), req);
        });
      });
    }
    // 必要役職ルール（trigger がいるなら required も出す）。個数ルールで新しく trigger が出ることがあるので、個数ルールのあとにもう一度呼ぶ（詩人のシナジーで偽占い師が出たのに占い師がいない、を防ぐ）
    const applyRequired = () => RULES.forEach((rule) => {
      if (!has(rule.trigger)) return;
      cur = { kind: "req", rule };
      const seen = {};
      rule.required.forEach((req) => {
        if (!has(rule.trigger)) return;   // trigger が置き換えられて消えたシナジーは、もう満たさなくてよい
        seen[req] = (seen[req] || 0) + 1;   // この役職を何枚必要とするか（共有者2枚など）
        if (slots.filter((s) => s.role === req).length >= seen[req]) return;
        const can = (s) => s.from && ONW.roles.enabledTargets(game, s.from).includes(req);
        let cands = slots.filter((s) => !kept.has(s.key) && can(s));
        // 置き換えられる枠がないときだけ、別の変化役の trigger 枠（この rule の trigger は除く）を置き換える
        // 例: 闇の化身が2枚とも忘却の人狼などに変化していて、狼夢人のための人狼を置く枠がない
        let viaTrigger = false;
        if (!cands.length) { cands = slots.filter((s) => kept.has(s.key) && !locked.has(s.key) && (triggers.has(s.role) || countTriggers.has(s.role)) && s.role !== rule.trigger && !inPair(s) && can(s)); viaTrigger = cands.length > 0; }   // 個数ルールの trigger（封印の狂人など）も置き換えてよい   // アサシン↔マーリンが揃っているときは、その2枚は他のシナジーの置き換えに使わない
        // 固定した枠(デバッグの役職固定)はシナジーより優先: 置き換え先が無ければ、必要役職は足さない（固定を絶対に動かさない）
        if (!cands.length) {
          // 最後の手段: 必要役職の枠がどうしても取れないときは、自分の trigger を別の役職に置き換えて、このシナジー自体を消す
          //   （trigger がいなくなれば「いなければいけない」条件も消える。他のシナジーの必要役職になっている trigger・固定・アサシン↔マーリンは動かさない）
          const neededElsewhere = (r) => RULES.some((q) => q !== rule && has(q.trigger) && q.required.includes(r));
          const own = slots.filter((s) => s.role === rule.trigger && s.from && !locked.has(s.key) && !inPair(s) && !neededElsewhere(s.role));
          const alt = (s) => roles.enabledTargets(game, s.from).filter((t) => t !== rule.trigger && !triggers.has(t) && !countTriggers.has(t));
          const ownOk = own.filter((s) => alt(s).length);
          if (!ownOk.length) return;
          const slot = ONW.utils.randomChoice(ownOk), o = alt(slot);
          const cnt = (r) => slots.filter((s) => s.role === r).length, min = Math.min(...o.map(cnt));
          set(slot, ONW.utils.randomChoice(o.filter((r) => cnt(r) === min)));
          kept = computeKept();
          return;
        }
        set(pickSlot(cands), req);
        if (viaTrigger) kept = computeKept();   // trigger を置き換えたので、そのシナジーが守っていた枠（封印の狂人の対象役職・麻婆の豆腐など）を空き枠に戻す
      });
    });
    applyRequired();
    // 個数ルール: 対象役職(anyOf のどれでもよい)が合計で min 枚以上、盤面に出るようにする。足りない分は、変化役から変化した枠を置き換えて足す
    ONW.SYNERGY_COUNT_RULES.forEach((rule) => {
      if (!active(rule)) return;
      cur = { kind: "count", rule };
      let guard = 8;
      while (slots.filter((s) => rule.anyOf.includes(s.role)).length < rule.min && guard-- > 0) {
        const opts = (s) => s.from ? ONW.roles.enabledTargets(game, s.from).filter((t) => rule.anyOf.includes(t)) : [];
        let cands = slots.filter((s) => !kept.has(s.key) && opts(s).length);
        if (!cands.length && rule.force) {
          // 必ず出したいルール(麻婆の対抗役): 変化役から変化した枠が、他のシナジー役（後覚者・鍵師など）で埋まっているとき、そのシナジー役を置き換える。
          // 置き換えた役のシナジー(必要役職)は要らなくなるだけなので盤面は崩れない。他のシナジーの必要役職・trigger本人・アサシン↔マーリン・デバッグ固定の枠は動かさない
          const needed = (r) => RULES.some((q) => has(q.trigger) && q.trigger !== r && q.required.includes(r));
          cands = slots.filter((s) => kept.has(s.key) && !locked.has(s.key) && s.role !== rule.trigger && s.role !== ONW.ROLE.MASON && (triggers.has(s.role) || ONW.SYNERGY_COUNT_RULES.some((q) => q.trigger === s.role)) && !needed(s.role) && !inPair(s) && opts(s).length);
          if (!cands.length) {   // 共有者2枚が枠を使い切っているとき: 共有者の1枚を置き換え、もう1枚も共有者以外に変えて「共有者が1人だけ」にならないようにする
            const ms = slots.filter((s) => s.role === ONW.ROLE.MASON && s.from && !locked.has(s.key));
            const o2 = ms.length >= 2 ? opts(ms[0]) : [];
            if (o2.length) {
              const other = ms[1], alt = ONW.roles.enabledTargets(game, other.from).filter((t) => t !== ONW.ROLE.MASON && !triggers.has(t) && !rule.anyOf.includes(t));
              if (alt.length) { set(other, ONW.utils.randomChoice(alt)); cands = [ms[0]]; }
            }
          }
        }
        if (!cands.length) break;   // 固定した枠は置き換えない（役職固定が最優先）
        const slot = pickSlot(cands);
        // 対象役職の種類が偏らないよう、盤面での枚数がいちばん少ない役職から選ぶ
        // 偽占い師（占い師が必要）・白狼・アサシン・マーリンなど、必要役職がまだ盤面にいない役職は、ほかに選べる役職があるなら選ばない（詩人などの個数ルールで、必要役職のいない trigger を足さない）
        const unmet = (r) => RULES.some((q) => q.trigger === r && q.required.some((x) => x !== r && !has(x)));
        const o0 = opts(slot), oOk = o0.filter((r) => !unmet(r)), o = oOk.length ? oOk : o0;
        const cnt = (r) => slots.filter((s) => s.role === r).length, min = Math.min(...o.map(cnt));
        set(slot, ONW.utils.randomChoice(o.filter((r) => cnt(r) === min)));
      }
      // 上限(max): 多すぎるときは、変化役から変化した枠の分だけ、対象役職でない役職（シナジーの trigger にならないもの）へ変え直す。最初から配役に入れた枠は動かさない
      const trig = new Set([...RULES.map((r) => r.trigger), ...ONW.SYNERGY_COUNT_RULES.map((r) => r.trigger)].filter(Boolean));
      guard = 8;
      while (rule.max && slots.filter((s) => rule.anyOf.includes(s.role)).length > rule.max && guard-- > 0) {
        const cands = slots.filter((s) => rule.anyOf.includes(s.role) && s.from && !locked.has(s.key) && ONW.roles.enabledTargets(game, s.from).some((t) => !rule.anyOf.includes(t) && !trig.has(t)));
        if (!cands.length) break;
        const slot = ONW.utils.randomChoice(cands);
        const o = ONW.roles.enabledTargets(game, slot.from).filter((t) => !rule.anyOf.includes(t) && !trig.has(t));
        const cnt = (r) => slots.filter((s) => s.role === r).length, min = Math.min(...o.map(cnt));
        const pickR = ONW.utils.randomChoice(o.filter((r) => cnt(r) === min));
        cur = { kind: "cap", rule }; note(slot, pickR);
        slot.role = pickR;
        if (slot.id !== undefined) { game.initialRoles[slot.id] = pickR; game.currentRoles[slot.id] = pickR; } else game.center[slot.idx] = pickR;
      }
    });
    applyRequired();   // 個数ルールで新しく出た役職（偽占い師など）の必要役職（占い師など）を、もう一度確保する
    cur = null;
    // ---- 最終の盤面でシナジーを判定して記録する（デバッグモードの結果画面「シナジー情報」用）----
    const present = (r) => slots.filter((s) => s.role === r).length;
    const canMake = (list) => slots.some((s) => s.from && roles.enabledTargets(game, s.from).some((t) => list.includes(t)));
    const why = () => null;   // 理由の文章は出さない（✘ だけで伝わる）
    const addsOf = (list) => list.map((e) => ({ slot: e.slot, from: rname(e.from), base: e.base ? rname(e.base) : null, role: rname(e.role) }));
    const out = [];
    RULES.forEach((rule) => {
      if (!has(rule.trigger)) return;
      const need = {}; rule.required.forEach((q) => { need[q] = (need[q] || 0) + 1; });
      const items = Object.keys(need).map((q) => {
        const mine = slog.filter((e) => e.rule === rule && e.kind === "req" && e.role === q), have = present(q);
        const other = !mine.length && slog.some((e) => e.kind === "req" && e.role === q);
        return { role: rname(q), need: need[q], have, state: have < need[q] ? "fail" : mine.length ? "added" : other ? "shared" : "already", adds: addsOf(mine), reason: have < need[q] ? why([q]) : null };
      });
      out.push({ trigger: rname(rule.trigger), holders: slots.filter((s) => s.role === rule.trigger).map(lbl), items });
    });
    ONW.SYNERGY_COUNT_RULES.forEach((rule) => {
      if (!active(rule)) return;
      const adds = slog.filter((e) => e.rule === rule && e.kind === "count"), caps = slog.filter((e) => e.rule === rule && e.kind === "cap");
      const found = slots.filter((s) => rule.anyOf.includes(s.role)), have = found.length;
      const over = !!rule.max && have > rule.max;
      if (!rule.min && !caps.length && !over) return;   // 上限だけのルールで何も起きていないなら出さない
      const state = have < rule.min ? "fail" : over ? "over" : adds.length ? "added" : caps.length ? "capped" : "already";
      out.push({
        trigger: rule.trigger ? rname(rule.trigger) : "（常時）", holders: rule.trigger ? slots.filter((s) => s.role === rule.trigger).map(lbl) : [],
        count: { label: rule.label || "", n: rule.anyOf.length, anyOf: rule.anyOf.map(rname), min: rule.min || 0, max: rule.max || null, have, found: found.map((s) => rname(s.role)), state, adds: addsOf(adds), caps: addsOf(caps), reason: state === "fail" ? why(rule.anyOf) : state === "over" ? "減らせる枠がありませんでした（最初から配役に入れた枠・役職固定は動かしません）" : null },
      });
    });
    game.synergyLog = out;
  };

  /**
   * 闇鍋シナジー(本家 YAMINABE_TRANSFORM_SYNERGY_RULES のうち、このWeb版にある役職の分)。
   * 闇鍋 = 光の使徒・闇の化身・銀色の影の変化。変化が終わった盤面(プレイヤー+墓地)に trigger がいるとき、
   * required の役職も最低1枚は盤面に出す。足りなければ「変化役から変化した枠」のうち、
   * その役職に変化できるものを1つ選んで置き換える(変化していない枠は動かさないので、設定した配役の枚数は変わらない)。
   */
  ONW.SYNERGY_RULES = [
    { trigger: ONW.ROLE.WHITE_WOLF,     required: [ONW.ROLE.VILLAGER, ONW.ROLE.SEER] },
    { trigger: ONW.ROLE.FORGETFUL_WOLF, required: [ONW.ROLE.VILLAGER], priority: [ONW.ROLE.VILLAGER] },   // 村人自認の役職(ONW.SELF_AS_VILLAGER)が出るときの村人は優先度高め（applySynergy が他のシナジーより先に確保する。自認村人の役職を足したときは自動で同じ扱い）
    { trigger: ONW.ROLE.ASSASSIN,       required: [ONW.ROLE.MERLIN] },   // アサシンが出る闇鍋には、狙う相手のマーリンも最低1枚出す
    { trigger: ONW.ROLE.MERLIN,         required: [ONW.ROLE.ASSASSIN], priority: [ONW.ROLE.ASSASSIN] }, // マーリンが出る闇鍋には、狙うアサシンも最低1枚出す（アサシン↔マーリンの相互シナジー）
    { trigger: ONW.ROLE.WOLF_DREAMER,   required: [ONW.ROLE.WEREWOLF] },                        // 狼夢人が出る闇鍋には、人狼も最低1枚出す
    { trigger: ONW.ROLE.WOLF_MARKED,    required: [ONW.ROLE.VILLAGER, ONW.ROLE.WEREWOLF, ONW.ROLE.SEER], priority: [ONW.ROLE.VILLAGER] },     // 狼憑きが出る闇鍋には、村人・人狼・占い師も最低1枚ずつ出す（占われて「人狼」と出るのが活きる盤面）
    { trigger: ONW.ROLE.MAPO_WOLF,      required: [ONW.ROLE.TOFU_WOLF] },                        // 麻婆の人狼が出る闇鍋には、豆腐の人狼も必ず出す（豆腐の人狼がいても麻婆が必ず出るわけではない）
    { trigger: ONW.ROLE.NEGI_WOLF,      required: [ONW.ROLE.TOFU_WOLF] },                        // 葱の人狼が出る闇鍋には、豆腐の人狼も必ず出す（豆腐の人狼がいても葱が必ず出るわけではない）
    { trigger: ONW.ROLE.FAKE_SEER,      required: [ONW.ROLE.SEER] },                             // 偽占い師が出る闇鍋には、占い師も最低1枚出す（偽占い師の結果は占い師と見比べて初めて意味が出る。マイクラ版 YAMINABE の偽占い師シナジー）
    { trigger: ONW.ROLE.VANITY,         required: [ONW.ROLE.SHERIFF] },                          // ヴァニティが出る闇鍋には、保安官も最低1枚出す（マイクラ版 YAMINABE_TRANSFORM_SYNERGY_RULES の { trigger: VANITY, required: [SHERIFF] }。変化枠のヴァニティに保安官を確保する ensureLightSheriffForTransformedVanity も、Web版では SYNERGY_RULES が変化枠経由で必須役職を置く仕組みなので、この1行が両方に相当する）
    { trigger: ONW.ROLE.MIRAGE_WOLF,    required: [ONW.ROLE.SEER] },                             // 蜃気狼が出る闇鍋には、占い師も最低1枚出す（占われてランダムな役職に見えるのが活きる盤面。マイクラ版 YAMINABE の蜃気狼シナジー: 占い師・偽占い師・感覚の占い師・指読みのどれか。Web版にあるのは占い師）
    { trigger: ONW.ROLE.REBEL_MADMAN,   required: [ONW.ROLE.DICTATOR] },                       // 反逆の狂人が出る闇鍋には、独裁者も最低1枚出す（反転させるクーデターの相手がいないと活きない。マイクラ版 YAMINABE の反逆の狂人シナジー）
    { trigger: ONW.ROLE.BLACK_WOLF_MADMAN, required: [ONW.ROLE.WEREWOLF, ONW.ROLE.SEER] },   // 黒子の狂人が出る闇鍋には、人狼と占い師も最低1枚ずつ出す（占われて「人狼」と出るのが活きる盤面。マイクラ版 YAMINABE の黒子の狂人シナジー）
    { trigger: ONW.ROLE.MAD_QUEEN,      required: [ONW.ROLE.QUEEN] },                            // 狂った女王が出る闇鍋には、女王も最低1枚出す（村人陣営に「女王」と通知される相手がいないと狂った女王が活きない。マイクラ版 YAMINABE の狂った女王シナジー）
    { trigger: ONW.ROLE.FOX,            required: [ONW.ROLE.SEER] },                             // 妖狐が出る闇鍋には、占い師も最低1枚出す（妖狐は占われて呪殺されるため。マイクラ版 YAMINABE の妖狐シナジー）
    { trigger: ONW.ROLE.FOX_MARKED,     required: [ONW.ROLE.SEER, ONW.ROLE.FOX, ONW.ROLE.VILLAGER], priority: [ONW.ROLE.VILLAGER] },   // 狐憑きが出る闇鍋には、占い師・妖狐・村人も最低1枚ずつ出す（占われて「妖狐」と出る相手と、本物の妖狐。自分を村人だと思い込む狐憑きに、本物の村人が1人は並ぶように）
    { trigger: ONW.ROLE.FANATIC,        required: [ONW.ROLE.FOX, ONW.ROLE.SEER] },               // 背徳者が出る闇鍋には、ご主人の妖狐と占い師も最低1枚ずつ出す（妖狐を呪殺できる占い師がいる盤面にする）
    { trigger: ONW.ROLE.PRINCESS,       required: [ONW.ROLE.VILLAGER, ONW.ROLE.QUEEN], priority: [ONW.ROLE.VILLAGER] },   // 姫君が出る闇鍋には、村人（自認村人の相方）と女王も最低1枚ずつ出す（マイクラ版 YAMINABE の姫君シナジー。昇格する相手・夜に姫君を知る女王がいる盤面）
    { trigger: ONW.ROLE.MAD_PRIEST,     required: [ONW.ROLE.GOD] },                              // 狂った神官が出る闇鍋にも、銀色の影から変化した神を最低1枚出す（マイクラ版 ensureSilverGodForPriest は PRIEST・MAD_PRIEST の両方が対象）
    { trigger: ONW.ROLE.PRIEST,         required: [ONW.ROLE.GOD] },                              // 神官が出る闇鍋には、銀色の影から変化した神も最低1枚出す（神官は神がいてこそ働く。マイクラ版 YAMINABE の ensureSilverGodForPriest）
    { trigger: ONW.ROLE.AA,             required: [ONW.ROLE.KEYMASTER] },                        // A.A.が出る闇鍋には、鍵師も最低1枚出す（A.A.は鍵師にロックされて初めて役職変化が通る。マイクラ版 YAMINABE_TRANSFORM_SYNERGY_RULES）
    { trigger: ONW.ROLE.MASON,          required: [ONW.ROLE.MASON, ONW.ROLE.MASON] },           // 共有者が出る闇鍋には、光の使徒から変化した共有者を合わせて最低2枚出す（共有者が1人だけにならない）
    { trigger: ONW.ROLE.HOTARU,         required: [ONW.ROLE.TRAILBLAZER, ONW.ROLE.SILVER_WOLF] },   // ホタルが出る闇鍋には、開拓者と銀狼も最低1枚ずつ出す（開拓者を知る通知・サムの銀狼への通知が活きる盤面。マイクラ版 YAMINABE_TRANSFORM_SYNERGY_RULES）
  ];
  /** 闇鍋シナジー一覧。SYNERGY_RULES に、自認村人の役職(ONW.SELF_AS_VILLAGER)で村人のルールがまだ無いものを自動で足す（優先度高め）。新しい自認村人の役職を足しても、村人が出るシナジーが自動でつく */
  roles.synergyRules = function () {
    const list = ONW.SYNERGY_RULES.slice();
    (ONW.SELF_AS_VILLAGER || []).forEach((r) => {
      if (!list.some((q) => q.trigger === r && q.required.includes(ONW.ROLE.VILLAGER))) list.push({ trigger: r, required: [ONW.ROLE.VILLAGER], priority: [ONW.ROLE.VILLAGER] });
    });
    return list;
  };
  /**
   * 闇鍋シナジー（個数ルール）: trigger がいるとき、anyOf のどれかの役職が合計 min 枚以上 max 枚以下、盤面(プレイヤー+墓地)に出る（max は変化役から変化した枠だけ減らせる）。
   * 後覚者は「最終的な役職」を知る役職なので、役職を動かす怪盗・いたずらっ子・グレムリン・ドッペルゲンガー・シャッフラーが2枚以上ないと能力が活きない。
   */
  /**
   * 麻婆豆腐(豆腐の人狼の3票)に対抗できる役職の候補。麻婆の人狼が出る闇鍋には、このうちどれか1枚が必ず盤面(プレイヤー+墓地)に出る。
   *   市長=2票で同数まで持っていける / 番犬=票数に関係なく噛み殺せる / 保安官=票数に関係なく執行できる / 交換者=票数を入れ替えて吊れる / 独裁者=票数に関係なく吊れる
   * 今後候補を足すときは、ここに役職を1つ足すだけ（光の使徒の変化先である役職に限る）。
   */
  ONW.MAPO_COUNTER_ROLES = [ONW.ROLE.MAYOR, ONW.ROLE.WATCHDOG, ONW.ROLE.SHERIFF, ONW.ROLE.EXCHANGER, ONW.ROLE.DICTATOR];
  /** 夜（と朝のうち）に能力を使うと ONW.observeNote に記録される役職を、各役職ファイルの info.observe から集める（詩人・観測の人狼の闇鍋シナジー用）。
   *  info.observe = "player"（プレイヤーを対象に選ぶ。詩人にも観測の人狼にも見える）/ "grave"（墓地だけを対象にする。観測の人狼にだけ見える）。
   *  kind = "poet"（"player" だけ）/ "observer"（"player" と "grave"）。役職を足したら、observeNote を呼ぶ役職の info に observe を付けるだけで、シナジー・wikiの一覧に自動で入る */
  ONW.observableRoles = (kind) => ONW.sortByRoleOrder(Object.keys(ONW.ROLE_INFO).filter((r) => {
    const o = (ONW.ROLE_INFO[r] || {}).observe;
    return kind === "poet" ? o === "player" : (o === "player" || o === "grave");
  }));
  /** 封印の効果を受ける役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES のうち、このWeb版にある役職）。各役職ファイルの info.sealTarget: true から自動で作る（ROLE_ORDER 順）。
   *  封印の狂人が出る闇鍋には、このうち最低3枚が盤面(プレイヤー+墓地)に出る。今後Web版に役職を足す・移植するときは、マイクラ版の一覧に入っている役職の info に sealTarget: true を付けるだけでよい（docs/seal-target.md） */
  Object.defineProperty(ONW, "SEAL_TARGET_ROLES", { configurable: true, enumerable: true, get() { return ONW.sortByRoleOrder(Object.keys(ONW.ROLE_INFO || {}).filter((r) => ONW.ROLE_INFO[r].sealTarget === true)); } });
  /** 黄泉が断ち切れる「状態」が付く役職（マイクラ版 YAMINABE_YOMI_TARGET_ROLES のうち Web版にある役職。ない役職は、Web版に入ったときに足す）。黄泉が出る闇鍋に最低3枚 */
  ONW.YOMI_TARGET_ROLES = ["shuffler", "reverser", "pure_lover", "evil_woman", "cupid", "nanoka", "executioner", "avenger", "love_tanner", "exchanger", "mad_exchanger", "goranshin", "icarus", "fairy", "carmen", "muzzle_madman", "servant", "freeter", "silver_wolf", "forgetful_wolf", "wolf_dreamer", "gremlin", "chesed", "thread_spinner", "matthias", "boar_madman", "bartender", "agent", "elfrinde"];   // マイクラ版 YAMINABE_YOMI_TARGET_ROLES を丸ごと（Web版にない役職は下の synergy で自動で除かれ、Web版に入った時点で自動で入る。役職を足したときにここを触る必要はない）
  /** 鍵師・A.A.の闇鍋シナジーの対象（マイクラ版 YAMINABE_KEYMASTER_TARGET_ROLES = YAMINABE_AA_TARGET_ROLES を丸ごと）。Web版にない役職は自動で除かれ、Web版に入った時点で自動で対象になる（役職を足したときにここを触る必要はない）。コスプレイヤーなど後から読み込まれる役職は文字列 */
  ONW.KEYMASTER_TARGET_ROLES = ["troublemaker", "robber", "relic_robber", "cosplayer", "major", "doppelganger", "shuffler", "gremlin", "matthias", "elfrinde", "beggar", "eraser_wolf", "magician", "silver_wolf", "hotaru"];   // 蜃気狼(mirage_wolf)は入れない: 役職変化の能力も鍵師のロックの対象もない（マイクラ版の一覧には入っているが、Web版では対象外）
  /** カルメンの闇鍋シナジーの対象（マイクラ版 YAMINABE_CARMEN_TARGET_ROLES を丸ごと。夜能力・昼能力を持つ村人陣営の役職）。Web版にない役職は自動で除かれ、入った時点で自動で対象になる */
  /** スティーブを倒せる「模倣先」の候補（模倣の人狼がこれを模倣すると、人狼陣営から村人のスティーブを執行・噛殺・独裁処刑できる）。保安官・番犬・独裁者が村人陣営に1人いるだけでは、スティーブを狙う側がいない。
   *  ヴァニティなど、あとからWeb版に入る役職はここに名前を足しておけば、Web版に入った時点で自動で候補に入る。 */
  ONW.STEVE_KILL_TARGETS = ["sheriff", "watchdog", "dictator", "vanity"];
  /** スティーブが出る闇鍋で「スティーブを倒せる側」として数える役職（この中から最低2枚）。模倣の人狼（模倣保安官・模倣番犬・模倣独裁者になる）・番犬・独裁者・道化の爆弾魔。ヴァニティはWeb版に入った時点で自動で入る */
  ONW.STEVE_KILLER_ROLES = ["mimic_wolf", "watchdog", "dictator", "jester_bomber", "vanity"];
  ONW.CARMEN_TARGET_ROLES = ["seer", "whimsical_seer", "robber", "relic_robber", "troublemaker", "doppelganger", "visitor", "major", "finger_reader", "sense_seer", "libra", "sheriff", "dictator", "exchanger", "thief", "freeter", "fairy", "goranshin", "icarus", "knight", "trailblazer", "moses", "psychologist", "medium", "hokma"];
  /** 名前の一覧から、いまWeb版にある役職だけを ROLE_ORDER 順で返す */
  ONW.existingRoles = (names) => ONW.sortByRoleOrder(names.filter((r) => ONW.ROLE_INFO[r]));
  ONW.SYNERGY_COUNT_RULES = [
    { trigger: ONW.ROLE.INSOMNIAC, label: "役職を変える役職", anyOf: [ONW.ROLE.ROBBER, ONW.ROLE.TROUBLEMAKER, ONW.ROLE.GREMLIN, ONW.ROLE.DOPPELGANGER, ONW.ROLE.SHUFFLER], min: 2, max: 2 },   // シャッフラー(役職を変える)も数える（マイクラ版 YAMINABE の後覚者シナジーに SHUFFLER が入っている）
    { trigger: ONW.ROLE.KEYMASTER, label: "ロック対象の役職変化系", get anyOf() { return ONW.existingRoles(ONW.KEYMASTER_TARGET_ROLES); }, min: 2 },   // 鍵師が出る闇鍋には、ロックの対象になる役職変化系（マイクラ版 YAMINABE_KEYMASTER_TARGET_ROLES）を合わせて最低2枚出す。対象は ONW.KEYMASTER_TARGET_ROLES から自動（Web版にある役職だけ・新しく入った役職は自動で入る）   // 鍵師が出る闇鍋には、ロックの対象になる役職変化系（怪盗・いたずらっ子・墓荒らし・コスプレイヤー・ドッペルゲンガー・シャッフラー・グレムリン。コスプレイヤーは役職ファイルが後から読み込まれるので文字列で書く）を合わせて最低2枚出す（マイクラ版 YAMINABE の鍵師シナジー: YAMINABE_KEYMASTER_TARGET_ROLES を2枚。Web版にある役職の分）
    { trigger: ONW.ROLE.AA, label: "A.A.が弾く役職変化系", get anyOf() { return ONW.existingRoles(ONW.KEYMASTER_TARGET_ROLES); }, min: 2 },   // A.A.が出る闇鍋には、A.A.の力（役職変化を弾く）が活きる役職変化系を合わせて最低2枚出す（マイクラ版 YAMINABE_AA_TARGET_ROLES = 鍵師と同じ一覧。自動）   // A.A.が出る闇鍋には、A.A.の力（役職変化を弾く）が活きる役職変化系を合わせて最低2枚出す（マイクラ版 YAMINABE_AA_TARGET_ROLES = 鍵師と同じ一覧を2枚）
    { trigger: ONW.ROLE.POET, label: "詩人が見られる役職", get anyOf() { return ONW.observableRoles("poet"); }, min: 2 },   // 詩人が出る闇鍋には、詩人の通知に出る役職（夜に対象を選ぶ能力を使い ONW.observeNote に記録される役職。墓地だけを対象にする墓荒らしは除く）を合わせて最低2枚。対象は各役職ファイルの info.observe（"player"）から自動で作る＝役職を足すときは observeNote を呼ぶ役職に info.observe を付ける
    { trigger: ONW.ROLE.OBSERVER_WOLF, label: "観測の人狼が見られる役職", get anyOf() { return ONW.observableRoles("observer"); }, min: 2 },   // 観測の人狼が出る闇鍋には、観測結果に出る役職（info.observe が "player" か "grave"。墓荒らしなど墓地だけを対象にする役職も含む）を合わせて最低2枚（詩人と同じ考え方。個数は詩人と同じ2枚）
    { trigger: ONW.ROLE.HEARTBREAKER, label: "恋人系役職", anyOf: [ONW.ROLE.EVIL_WOMAN, ONW.ROLE.PURE_LOVER, ONW.ROLE.CUPID], min: 1, unlessLover: true },   // 恋人(重複役職)が最初から配られているときは足さない（変化候補でOFFの役職は出ない）
    { trigger: ONW.ROLE.MAPO_WOLF, label: "麻婆対抗役", get anyOf() { return ONW.MAPO_COUNTER_ROLES; }, min: 1, force: true },   // 麻婆の人狼が出る闇鍋には、麻婆豆腐(豆腐の人狼の3票)に対抗できる役職を最低1枚出す（現世でも墓地でもよい）。候補は ONW.MAPO_COUNTER_ROLES に足す
    { trigger: ONW.ROLE.SEAL_MADMAN, label: "封印作用のある役職", get anyOf() { return ONW.SEAL_TARGET_ROLES; }, min: 3 },   // 封印の狂人が出る闇鍋には、封印の効果を受ける役職を最低3枚出す（マイクラ版 YAMINABE の封印の狂人シナジー: YAMINABE_SEAL_TARGET_ROLES を3枚。Web版にある役職の分）
    { trigger: "elfrinde", label: "封印作用のある役職", get anyOf() { return ONW.SEAL_TARGET_ROLES.filter((r) => r !== "elfrinde"); }, min: 3 },   // エルフリンデが出る闇鍋にも、封印の効果を受ける役職を最低3枚出す（マイクラ版 YAMINABE_ELFRINDE_TARGET_ROLES = 封印の対象からエルフリンデ自身を除いたもの。自分を数えて条件を満たさないため。エルフリンデは役職ファイルが後から読み込まれるので trigger は文字列）
    { trigger: "moses", label: "能力を使われる役職", get anyOf() { return ONW.SEAL_TARGET_ROLES.filter((r) => r !== "moses"); }, min: 4 },   // モーゼスが出る闇鍋には、能力を使われる（選ばれて票が増える）役職を最低4枚出す（マイクラ版 YAMINABE の優先度なしシナジー: YAMINABE_MOSES_TOUCH_ROLES = 封印の対象からモーゼス自身を除いたものを4枚。Web版にある役職の分。モーゼスは役職ファイルが後から読み込まれるので trigger は文字列で書く。対象は info.sealTarget から自動）
    { trigger: "yomi", label: "状態が付く役職", get anyOf() { return ONW.existingRoles(ONW.YOMI_TARGET_ROLES); }, min: 3 },   // 黄泉が出る闇鍋には、断ち切れる状態（反転・恋人・シャッフラー・各役職の対象・思い込みなど）が付く役職を最低3枚出す（マイクラ版 YAMINABE の黄泉シナジー: YAMINABE_YOMI_TARGET_ROLES を3枚。Web版にある役職の分）。黄泉は役職ファイルが後から読み込まれるので trigger は文字列
    { trigger: "carmen", label: "囁く相手になる役職", get anyOf() { return ONW.existingRoles(ONW.CARMEN_TARGET_ROLES); }, min: 2 },   // カルメンが出る闇鍋には、囁かれて夜能力・昼能力をもう1回使える役職（マイクラ版 YAMINABE_CARMEN_TARGET_ROLES）を合わせて最低2枚出す。カルメンは役職ファイルが後から読み込まれるので trigger は文字列
    { trigger: "steve", label: "スティーブを倒せる役職", get anyOf() { return ONW.existingRoles(ONW.STEVE_KILLER_ROLES); }, min: 2 },   // スティーブが出る闇鍋には、スティーブを倒せる側（模倣の人狼・番犬・独裁者・道化の爆弾魔、今後ヴァニティ）を最低2枚出す。保安官は単体では意味がないので入れず、模倣の人狼が模倣して初めて数える（模倣の人狼の模倣先は、mimic_wolf.js candidates が保安官・番犬・独裁者から選ぶ）。スティーブは役職ファイルが後から読み込まれるので trigger は文字列
    { trigger: "mimic_wolf", requires: "steve", label: "スティーブを倒せる模倣先（模倣の人狼）", get anyOf() { return ONW.existingRoles(ONW.STEVE_KILL_TARGETS); }, min: 1 },   // 別枠: スティーブが出る闇鍋で模倣の人狼が出るときは、模倣先になる保安官・番犬・独裁者（今後ヴァニティ）のどれかを最低1人出す。すでに1枚以上出ていれば新しくは出さない（個数ルールなので足りないときだけ置く）。上の「スティーブを倒せる役職」のあとに処理される
    { trigger: ONW.ROLE.SPY, label: "人狼系（一匹狼以外）", get anyOf() { return ONW.sortByRoleOrder((ONW.VISIBLE_WOLF || []).slice()); }, min: 2 },   // スパイが出る闇鍋には、闇の化身から「一匹狼以外の人狼系」を合計2人以上出す（人狼が1人だけだと、狼マークに見えるスパイが確定してしまうため。一匹狼は誰からも見えないので数えない。マイクラ版 ensureDarkWolvesForLightSpy）。ONW.VISIBLE_WOLF から自動で作る（人狼系を足したら自動で入る）
    { always: true, label: "悪女・純愛者・キューピッド", anyOf: [ONW.ROLE.EVIL_WOMAN, ONW.ROLE.PURE_LOVER, ONW.ROLE.CUPID], min: 0, max: 1 },   // 悪女・純愛者・キューピッドは、合わせて1人まで（変化から出た分だけ減らせる）   // 破局師が出る闇鍋には、壊す相手の恋人を作る役職（悪女・純愛者・キューピッド）も最低1枚出す（マイクラ版 YAMINABE の破局師シナジー）
    { always: true, label: "マーリン", anyOf: [ONW.ROLE.MERLIN], min: 0, max: 1, early: true },   // マーリンは1人まで（光の使徒などの変化から2人目以降が出たときは、変化した枠を別の役職に変え直す。最初から配役に入れた分・デバッグ固定は動かさない）
    { trigger: "magician", label: "魔法使いが奪える役職", anyOf: [ONW.ROLE.ROBBER, ONW.ROLE.DOPPELGANGER, ONW.ROLE.SHUFFLER, ONW.ROLE.HOTARU, "nanoka", "cosplayer"], min: 2 },   // 魔法使いが出る闇鍋には、自分の役職を変える役職（マイクラ版 YAMINABE_MAGICIAN_STEAL_ROLES のうちWeb版にあるもの。コピリストはWeb版に無い）を合わせて最低2枚出す。魔法使いは役職ファイルが後から読み込まれるので trigger は文字列
  ];
  /**
   * 本人に見せる「変化前」の役職。思い込み系（忘却の人狼・狼憑き・狼夢人）は、本当の変化前ではなく
   * 「本人に見せている役職の陣営」の変化役から出たように見せて、変化前から正体が透けないようにする。
   *   ・村人だと思い込む（忘却の人狼・狼憑き）→ 光の使徒から  （忘却の人狼は本当は闇の化身から）
   *   ・人狼だと思い込む（狼夢人）          → 闇の化身から  （狼夢人は本当は光の使徒から）
   *   ・保安官だと思い込む（ヴァニティ）    → 光の使徒から  （ヴァニティは本当は銀色の影から。変化元が銀色の影のままだと、本人に見せる役職（保安官）と組んで「銀色の影 → 保安官」という矛盾した配布テキストになるので、銀色の影の素通しより先にこの分岐で光の使徒に偽装する。作者指定）
   * 変化していない人は変化前なし（null）。
   */
  roles.shownFrom = function shownFrom(game, base, after) {
    if (!base) return null;
    if ((ONW.SELF_AS_SHERIFF || []).includes(after)) return ONW.ROLE.LIGHT_APOSTLE;   // 保安官だと思い込む（ヴァニティ）は、本当の変化元（銀色の影）ではなく光の使徒から出たように見せる
    if (base !== ONW.ROLE.LIGHT_APOSTLE && base !== ONW.ROLE.DARK_AVATAR) return base;
    if (ONW.SELF_AS_WOLF.includes(after)) return ONW.ROLE.DARK_AVATAR;
    if (ONW.SELF_AS_VILLAGER.includes(after)) return ONW.ROLE.LIGHT_APOSTLE;
    return base;
  };

  /** 実際にその回に起きる役職を、起床順に並べたリストを作る */
  roles.buildNightOrder = function buildNightOrder(game) {
    const rolesInPlay = new Set(Object.values(game.initialRoles));
    return Object.keys(ONW.ROLE_INFO)
      .filter((role) => rolesInPlay.has(role) && ONW.ROLE_INFO[role].wakeOrder !== null)
      .sort((a, b) => ONW.ROLE_INFO[a].wakeOrder - ONW.ROLE_INFO[b].wakeOrder);
  };

  ONW.roles = roles;

})(window.ONW);
