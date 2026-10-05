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
    if (role === ONW.AMBIG_FROM) return { name: "光の使徒／闇の化身", team: ONW.TEAM.THIRD, wakeOrder: null, desc: "光の使徒か闇の化身のどちらかです。" };
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
      r.required.forEach((q) => { const f = slots.find((s) => s.role === q); if (f) kept.add(f.key); });   // 必要役職は1枚だけ守る(余りは他の必要役職に回せる)
    });
    const set = (slot, role) => {
      slot.role = role; kept.add(slot.key);
      if (slot.id !== undefined) { game.initialRoles[slot.id] = role; game.currentRoles[slot.id] = role; } else game.center[slot.idx] = role;
    };
    ONW.SYNERGY_RULES.forEach((rule) => {
      if (!has(rule.trigger)) return;
      rule.required.forEach((req) => {
        if (has(req)) return;
        const can = (s) => s.from && ONW.roles.enabledTargets(game, s.from).includes(req);
        let cands = slots.filter((s) => !kept.has(s.key) && can(s));
        // 置き換えられる枠がないときだけ、別の変化役の trigger 枠（デバッグで固定した枠・この rule の trigger は除く）を置き換える
        // 例: 闇の化身が2枚とも忘却の人狼などに変化していて、狼夢人のための人狼を置く枠がない
        if (!cands.length) cands = slots.filter((s) => kept.has(s.key) && !locked.has(s.key) && triggers.has(s.role) && s.role !== rule.trigger && can(s));
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
  ];
  /**
   * 本人に見せる「変化前」の役職。光の使徒→村人 / 闇の化身→忘却の人狼 のとき、
   * 忘却の人狼になった人が変化前から正体を推理できないよう、両方書かれたカードにする
   * (忘却の人狼が闇の化身の変化先に有効で、闇の化身が配役に入っているときだけ)。
   */
  roles.shownFrom = function shownFrom(game, base, after) {
    // 縦2段にするのは、闇の化身が配役に入っていて、思い込み系(ONW.AMBIG_TRIGGERS)が実際にいる(プレイヤーか墓地)ときだけ。いなければ普通の演出
    // ・村人自認(村人・忘却の人狼・狼憑き)になるとき: 忘却の人狼か狼夢人がいる
    // ・人狼自認(人狼・狼夢人)になるとき: 狼夢人がいる(光の使徒から狼夢人になった人が、変化前から正体を推理できないように)
    const present = [...Object.values(game.initialRoles || {}), ...(game.center || [])];
    const dark = (game.selectedRoles || []).includes(ONW.ROLE.DARK_AVATAR);
    const shown = ONW.shownRole(after), T = ONW.AMBIG_TRIGGERS;
    const amb = dark && ((shown === ONW.ROLE.VILLAGER && T.villager.some((r) => present.includes(r))) || (shown === ONW.ROLE.WEREWOLF && T.wolf.some((r) => present.includes(r))));
    // 変化していない普通の村人・人狼・最初から配られた思い込み系も、同じ「光の使徒／闇の化身」カードにする(変化の有無で正体がばれないように)
    if (!base) return amb ? ONW.AMBIG_FROM : null;
    if (amb && (base === ONW.ROLE.LIGHT_APOSTLE || base === ONW.ROLE.DARK_AVATAR)) return ONW.AMBIG_FROM;
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
