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
    ONW.roles.assignServants(game);   // 変化のあとに、従者のご主人を決める
    ONW.roles.assignExecutioners(game);   // 処刑人のターゲットを決める
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
  };

  /** 変化の結果に闇鍋シナジー(SYNERGY_RULES)を適用する */
  roles.applySynergy = function applySynergy(game, lockedKeys) {
    const slots = [];
    game.players.forEach((p) => slots.push({ key: `p:${p.id}`, id: p.id, role: game.initialRoles[p.id], from: game.transformFrom[p.id] || null }));
    game.center.forEach((r, i) => slots.push({ key: `c:${i}`, idx: i, role: r, from: game.centerTransformFrom[i] || null }));
    const has = (r) => slots.some((s) => s.role === r);
    const triggers = new Set(ONW.SYNERGY_RULES.map((r) => r.trigger));
    const locked = new Set(lockedKeys || []);
    const kept = new Set(locked);
    // すでに条件を満たしている枠は、置き換えで壊さないよう守る
    ONW.SYNERGY_RULES.forEach((r) => {
      slots.forEach((s) => { if (s.role === r.trigger) kept.add(s.key); });
      if (!has(r.trigger)) return;   // trigger がいないルールの必要役職は守らない（別のルールの置き換え先にできるように）
      const need = {}; r.required.forEach((q) => { need[q] = (need[q] || 0) + 1; });
      Object.keys(need).forEach((q) => { slots.filter((s) => s.role === q).slice(0, need[q]).forEach((f) => kept.add(f.key)); });   // 必要役職は必要な枚数だけ守る(余りは他の必要役職に回せる)
    });
    // 個数ルール(SYNERGY_COUNT_RULES): trigger がいるとき、すでにいる対象役職の枠(必要枚数まで)は置き換えで壊さないよう守る
    const hasLover = Object.keys(game.loverOf || {}).length > 0;
    const active = (r) => (r.always || has(r.trigger)) && !(r.unlessLover && hasLover);
    ONW.SYNERGY_COUNT_RULES.forEach((r) => {
      if (!active(r)) return;
      if (r.trigger) slots.forEach((s) => { if (s.role === r.trigger) kept.add(s.key); });   // 後覚者そのものは置き換えない
      slots.filter((s) => r.anyOf.includes(s.role)).slice(0, r.min).forEach((f) => kept.add(f.key));
    });
    const set = (slot, role) => {
      slot.role = role; kept.add(slot.key);
      if (slot.id !== undefined) { game.initialRoles[slot.id] = role; game.currentRoles[slot.id] = role; } else game.center[slot.idx] = role;
    };
    const inPair = (s) => (s.role === ONW.ROLE.MERLIN && has(ONW.ROLE.ASSASSIN)) || (s.role === ONW.ROLE.ASSASSIN && has(ONW.ROLE.MERLIN));
    ONW.SYNERGY_RULES.forEach((rule) => {
      if (!has(rule.trigger)) return;
      const seen = {};
      rule.required.forEach((req) => {
        seen[req] = (seen[req] || 0) + 1;   // この役職を何枚必要とするか（共有者2枚など）
        if (slots.filter((s) => s.role === req).length >= seen[req]) return;
        const can = (s) => s.from && ONW.roles.enabledTargets(game, s.from).includes(req);
        let cands = slots.filter((s) => !kept.has(s.key) && can(s));
        // 置き換えられる枠がないときだけ、別の変化役の trigger 枠（この rule の trigger は除く）を置き換える
        // 例: 闇の化身が2枚とも忘却の人狼などに変化していて、狼夢人のための人狼を置く枠がない
        if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && !locked.has(s.key) && triggers.has(s.role) && s.role !== rule.trigger && !inPair(s) && can(s));   // アサシン↔マーリンが揃っているときは、その2枚は他のシナジーの置き換えに使わない
        // それでもないときは、デバッグで変化先を固定した枠も置き換える（固定した変化でもシナジーを発動させる）。シナジー役の枠と、必要役職の枠は除く
        if (!cands.length) {
          const req1 = new Set(rule.required);
          cands = slots.filter((s) => locked.has(s.key) && !triggers.has(s.role) && !req1.has(s.role) && can(s));   // 固定した別のシナジー役（狼夢人など）は壊さない
          if (cands.length) { const c0 = ONW.utils.randomChoice(cands); (game.dbgWarn = game.dbgWarn || []).push(`変化先の固定が、闇鍋シナジー(${ONW.ROLE_INFO[rule.trigger].name})のため「${ONW.ROLE_INFO[req].name}」に変わりました。`); locked.delete(c0.key); cands = [c0]; }
        }
        if (!cands.length) return;
        const c = cands.filter((s) => !triggers.has(s.role));
        set(ONW.utils.randomChoice(c.length ? c : cands), req);
      });
    });
    // 個数ルール: 対象役職(anyOf のどれでもよい)が合計で min 枚以上、盤面に出るようにする。足りない分は、変化役から変化した枠を置き換えて足す
    ONW.SYNERGY_COUNT_RULES.forEach((rule) => {
      if (!active(rule)) return;
      let guard = 8;
      while (slots.filter((s) => rule.anyOf.includes(s.role)).length < rule.min && guard-- > 0) {
        const opts = (s) => s.from ? ONW.roles.enabledTargets(game, s.from).filter((t) => rule.anyOf.includes(t)) : [];
        let cands = slots.filter((s) => !kept.has(s.key) && opts(s).length);
        if (!cands.length) {   // 置き換えられる枠がないとき: デバッグで変化先を固定した枠も置き換える（トリガー役・他のシナジー役・必要役職は除く）
          const protect = new Set([rule.trigger, ...ONW.SYNERGY_RULES.flatMap((r) => [r.trigger, ...r.required])]);
          cands = slots.filter((s) => locked.has(s.key) && !protect.has(s.role) && !rule.anyOf.includes(s.role) && opts(s).length);
          if (!cands.length) break;
          const c0 = ONW.utils.randomChoice(cands); locked.delete(c0.key); cands = [c0];
          (game.dbgWarn = game.dbgWarn || []).push(`変化先の固定が、闇鍋シナジー(${ONW.ROLE_INFO[rule.trigger].name})のため別の役職に変わりました。`);
        }
        const c = cands.filter((s) => !triggers.has(s.role));
        const slot = ONW.utils.randomChoice(c.length ? c : cands);
        // 対象役職の種類が偏らないよう、盤面での枚数がいちばん少ない役職から選ぶ
        const cnt = (r) => slots.filter((s) => s.role === r).length, o = opts(slot), min = Math.min(...o.map(cnt));
        set(slot, ONW.utils.randomChoice(o.filter((r) => cnt(r) === min)));
      }
      // 上限(max): 多すぎるときは、変化役から変化した枠の分だけ、対象役職でない役職（シナジーの trigger にならないもの）へ変え直す。最初から配役に入れた枠は動かさない
      const trig = new Set([...ONW.SYNERGY_RULES.map((r) => r.trigger), ...ONW.SYNERGY_COUNT_RULES.map((r) => r.trigger)].filter(Boolean));
      guard = 8;
      while (rule.max && slots.filter((s) => rule.anyOf.includes(s.role)).length > rule.max && guard-- > 0) {
        const cands = slots.filter((s) => rule.anyOf.includes(s.role) && s.from && !locked.has(s.key) && ONW.roles.enabledTargets(game, s.from).some((t) => !rule.anyOf.includes(t) && !trig.has(t)));
        if (!cands.length) break;
        const slot = ONW.utils.randomChoice(cands);
        const o = ONW.roles.enabledTargets(game, slot.from).filter((t) => !rule.anyOf.includes(t) && !trig.has(t));
        const cnt = (r) => slots.filter((s) => s.role === r).length, min = Math.min(...o.map(cnt));
        const pickR = ONW.utils.randomChoice(o.filter((r) => cnt(r) === min));
        slot.role = pickR;
        if (slot.id !== undefined) { game.initialRoles[slot.id] = pickR; game.currentRoles[slot.id] = pickR; } else game.center[slot.idx] = pickR;
      }
    });
  };

  /**
   * 闇鍋シナジー(本家 YAMINABE_TRANSFORM_SYNERGY_RULES のうち、このWeb版にある役職の分)。
   * 闇鍋 = 光の使徒・闇の化身・銀色の影の変化。変化が終わった盤面(プレイヤー+墓地)に trigger がいるとき、
   * required の役職も最低1枚は盤面に出す。足りなければ「変化役から変化した枠」のうち、
   * その役職に変化できるものを1つ選んで置き換える(変化していない枠は動かさないので、設定した配役の枚数は変わらない)。
   */
  ONW.SYNERGY_RULES = [
    { trigger: ONW.ROLE.WHITE_WOLF,     required: [ONW.ROLE.VILLAGER, ONW.ROLE.SEER] },
    { trigger: ONW.ROLE.FORGETFUL_WOLF, required: [ONW.ROLE.VILLAGER] },
    { trigger: ONW.ROLE.ASSASSIN,       required: [ONW.ROLE.MERLIN] },   // アサシンが出る闇鍋には、狙う相手のマーリンも最低1枚出す
    { trigger: ONW.ROLE.MERLIN,         required: [ONW.ROLE.ASSASSIN] }, // マーリンが出る闇鍋には、狙うアサシンも最低1枚出す（アサシン↔マーリンの相互シナジー）
    { trigger: ONW.ROLE.WOLF_DREAMER,   required: [ONW.ROLE.WEREWOLF] },                        // 狼夢人が出る闇鍋には、人狼も最低1枚出す
    { trigger: ONW.ROLE.WOLF_MARKED,    required: [ONW.ROLE.VILLAGER, ONW.ROLE.WEREWOLF] },     // 狼憑きが出る闇鍋には、村人と人狼も最低1枚ずつ出す
    { trigger: ONW.ROLE.MAPO_WOLF,      required: [ONW.ROLE.TOFU_WOLF] },                        // 麻婆の人狼が出る闇鍋には、豆腐の人狼も必ず出す（豆腐の人狼がいても麻婆が必ず出るわけではない）
    { trigger: ONW.ROLE.MASON,          required: [ONW.ROLE.MASON, ONW.ROLE.MASON] },           // 共有者が出る闇鍋には、光の使徒から変化した共有者を合わせて最低2枚出す（共有者が1人だけにならない）
  ];
  /**
   * 闇鍋シナジー（個数ルール）: trigger がいるとき、anyOf のどれかの役職が合計 min 枚以上 max 枚以下、盤面(プレイヤー+墓地)に出る（max は変化役から変化した枠だけ減らせる）。
   * 後覚者は「最終的な役職」を知る役職なので、役職を動かす怪盗・いたずらっ子・グレムリン・ドッペルゲンガー・シャッフラーが2枚以上ないと能力が活きない。
   */
  ONW.SYNERGY_COUNT_RULES = [
    { trigger: ONW.ROLE.INSOMNIAC, anyOf: [ONW.ROLE.ROBBER, ONW.ROLE.TROUBLEMAKER, ONW.ROLE.GREMLIN, ONW.ROLE.DOPPELGANGER, ONW.ROLE.SHUFFLER], min: 2, max: 2 },   // シャッフラー(役職を変える)も数える（マイクラ版 YAMINABE の後覚者シナジーに SHUFFLER が入っている）
    { trigger: ONW.ROLE.HEARTBREAKER, anyOf: [ONW.ROLE.EVIL_WOMAN, ONW.ROLE.PURE_LOVER, ONW.ROLE.CUPID], min: 1, unlessLover: true },   // 恋人(重複役職)が最初から配られているときは足さない（変化候補でOFFの役職は出ない）
    { always: true, anyOf: [ONW.ROLE.EVIL_WOMAN, ONW.ROLE.PURE_LOVER, ONW.ROLE.CUPID], min: 0, max: 1 },   // 悪女・純愛者・キューピッドは、合わせて1人まで（変化から出た分だけ減らせる）   // 破局師が出る闇鍋には、壊す相手の恋人を作る役職（悪女・純愛者・キューピッド）も最低1枚出す（マイクラ版 YAMINABE の破局師シナジー）
  ];
  /**
   * 本人に見せる「変化前」の役職。思い込み系（忘却の人狼・狼憑き・狼夢人）は、本当の変化前ではなく
   * 「本人に見せている役職の陣営」の変化役から出たように見せて、変化前から正体が透けないようにする。
   *   ・村人だと思い込む（忘却の人狼・狼憑き）→ 光の使徒から  （忘却の人狼は本当は闇の化身から）
   *   ・人狼だと思い込む（狼夢人）          → 闇の化身から  （狼夢人は本当は光の使徒から）
   * 変化していない人は変化前なし（null）。
   */
  roles.shownFrom = function shownFrom(game, base, after) {
    if (!base) return null;
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
