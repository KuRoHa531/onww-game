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
    game.players.forEach((p) => {
      const before = game.initialRoles[p.id];
      const forced = ONW.debug ? ONW.debug.forcedTransform(game, p.id, before) : null;
      if (!G[before] || (!pool(before).length && !forced)) return;
      if (forced) lockedKeys.add(`p:${p.id}`);
      const after = forced || pick(pool(before));
      game.transformFrom[p.id] = before;
      game.initialRoles[p.id] = after; game.currentRoles[p.id] = after;
    });
    game.center = game.center.map((before, i) => {
      const forced = ONW.debug ? ONW.debug.forcedTransform(game, `center:${i}`, before) : null;
      if (!G[before] || (!pool(before).length && !forced)) return before;
      game.centerTransformFrom[i] = before;
      if (forced) lockedKeys.add(`c:${i}`);
      return forced || pick(pool(before));
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
    const set = (slot, role) => {
      slot.role = role; kept.add(slot.key);
      if (slot.id !== undefined) { game.initialRoles[slot.id] = role; game.currentRoles[slot.id] = role; } else game.center[slot.idx] = role;
    };
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
        if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && !locked.has(s.key) && triggers.has(s.role) && s.role !== rule.trigger && can(s));
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
    { trigger: ONW.ROLE.WOLF_DREAMER,   required: [ONW.ROLE.WEREWOLF] },                        // 狼夢人が出る闇鍋には、人狼も最低1枚出す
    { trigger: ONW.ROLE.WOLF_MARKED,    required: [ONW.ROLE.VILLAGER, ONW.ROLE.WEREWOLF] },     // 狼憑きが出る闇鍋には、村人と人狼も最低1枚ずつ出す
    { trigger: ONW.ROLE.MASON,          required: [ONW.ROLE.MASON, ONW.ROLE.MASON] },           // 共有者が出る闇鍋には、光の使徒から変化した共有者を合わせて最低2枚出す（共有者が1人だけにならない）
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
