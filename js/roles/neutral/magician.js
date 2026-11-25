/**
 * 魔法使い（マイクラ版 MAGICIAN を参考）: 第三陣営。夜の能力は無い（自分からは行動しない）。
 * 誰かが「自分の役職を変える」と、その変化後の役職を魔法使いが奪う（変化した人は村人になる）。
 *   ・対象の変化（マイクラ版 tryMagicianStealSelfChange / tryImmediateMagicianStealSelfChange / tryVoteMagicianStealSelfChange の呼び出し元）:
 *     怪盗の交換 / 墓荒らしの交換 / コスプレイヤーのコスプレ / ドッペルゲンガーのコピー / ホタルのサム変身 /
 *     なのかの形態変化 / シャッフラーの自分への配置 / 乞食の交換（即時・投票とも）。
 *     ※グレムリンのコピー・いたずらっ子の入れ替え・フリーターの再就職・抹消など「他人の役職が変わる/自分の役職が上書きされる」変化は対象外（マイクラ版に呼び出しが無い）。
 *   ・盗める魔法使い: 参加者で、変化した人以外、最終役職が魔法使い、封印されていない、鍵師にロックされていない人（マイクラ版 activeMagicianIds）。
 *     死亡していても盗む（マイクラ版の3実装とも死亡チェックは無い）。魔法使いが複数いれば全員が同じ役職を奪う。
 *   ・変化後の役職が魔法使い自身のときは盗まない（ドッペルゲンガーが魔法使いをコピーした場合は、もう1人の魔法使いが普通に生まれる）。
 *   ・盗んだ役職に紐づく記録（ROLE_BOUND_KEYS など）は、変化した人から魔法使いへコピーされる（マイクラ版 copyRoleLinkedData）。
 *     Web版は夜・昼・投票の全経路でコピーする（マイクラ版は夜版だけがコピーするが、昼・投票版でも記録を村人になった人に残すと従者・処刑人などの判定が壊れるため統一した。docs/magician.md）。
 *   ・盗まれた変化者は、その役職の連鎖能力（朝のうちに使う能力）を使えない（マイクラ版でコスプレイヤーだけ明示されている「盗まれたら行動しない」を全役職に統一した解釈）。
 *     結果の文章・演出は取った役職のまま出す（怪盗の robberSeen と同じ「取ったと思う」扱い）。
 *   ・勝利: 最後まで魔法使いのままで、生存していれば追加勝利（マイクラ版 extraRoles.js）。盗んだあとは盗んだ役職として勝敗が決まる。
 * 演出（作者メモ）: 夜・朝の盗みは待機時間（settle）に、昼の変化の盗みは即時（stageFlash）に、魔法使いの画面だけ:
 *   自分の席に魔法陣が出て、表向きの「取る役職のカード」が魔法陣からすぅーと出てきて自分の席に置かれ、数秒後に裏面に戻る。
 *   投票時の乞食経由の盗みは結果発表で出す（乞食のカード移動の直後: 魔法陣→カードが魔法使いの席へ→乞食の席は村人・魔法使いの席は盗んだ役職）。
 * 状態: g.magicianStolenRole[魔法使い] = 奪った役職 / g.magicianStolenFrom[魔法使い] = 奪った相手 /
 *       g.magicianStealLog = [{ magicians:[...], target, role, source, when("night"|"morning"|"day"|"vote"), toldIds?, dayTold? }]
 * 変化候補: 銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS）。光の使徒・闇の化身・コスプレの山札には入らない。
 *   シャッフラーの山札にも入らない（マイクラ版 shufflerEligibleRoles の除外。shuffler.js の BLOCKED）。
 *   模倣の対象外（第三陣営の共通ルール）。ペルソナはWeb版未実装（マイクラ版ではマスク対象外）。
 * ハッキング: 対象にも思い込み先にもなる（マイクラ版の除外リストに無い）。夜の能力が無いので、思い込んだ人の偽の結果は無い（乞食と同じ）。
 *   本物の魔法使いがハッキングされていても、盗みは最終役職で判定するので通常どおり起きる（通知・演出も届く。乞食と同じ）。
 * 闇鍋シナジー: 魔法使いが出る闇鍋には、盗める変化役（怪盗・ドッペルゲンガー・シャッフラー・ホタル・なのか・コスプレイヤー。
 *   マイクラ版 YAMINABE_MAGICIAN_STEAL_ROLES のうちWeb版にあるもの）を合わせて最低2枚出す（roles.js の SYNERGY_COUNT_RULES）。
 * 実績（Wiki）: magician_loss「魔法の失敗」/ first_magician「入れ替えの魔法」/ win_magician「他人の役で取る勝利」
 *   （Web版に実績の保存は無いので ID の返却のみ）。
 * 詳細は docs/magician.md。
 */
(function (ONW) {
  const ID = "magician";
  const rn = (r) => (ONW.roles.getInfo(r) || {}).name || "?";
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";

  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);
  /** 盗める魔法使い（マイクラ版 activeMagicianIds: 変化した人以外・封印なし・ロックなし。死亡は不問） */
  const activeMagicians = (g, changedId) => holders(g).filter((id) => id !== changedId
    && !(ONW.seal && ONW.seal.is(g, id)) && !(ONW.keymaster && ONW.keymaster.locked(g, id)));

  /** 役職に紐づく記録のキー（乞食の transferData と同じ集合。コピー元→コピー先へ写す対象） */
  const LINK_KEYS = () => [...(ONW.ROLE_BOUND_KEYS || []), "sheriffCatFix", "sheriffCatTeam", "catSources", "catInfo", "catBitePick"];
  const cloneVal = (v) => (Array.isArray(v) ? v.slice() : (v && typeof v === "object" ? { ...v } : v));
  function copyLinked(g, fromId, toId) { LINK_KEYS().forEach((k) => { const m = g[k]; if (m && typeof m === "object" && fromId in m) m[toId] = cloneVal(m[fromId]); }); }
  function clearLinked(g, id) { LINK_KEYS().forEach((k) => { const m = g[k]; if (m && typeof m === "object") delete m[id]; }); }
  /** 役職の書き換え（履歴つき。copyRole と同じ積み方） */
  function setRole(g, id, role) {
    g.currentRoles[id] = role;
    const t = (g.roleTrail = g.roleTrail || {}); (t[id] = t[id] || []).push(role);
    if (g.cards && g.cards.at) { const cd = g.cards; (cd.trail[id] = cd.trail[id] || []).push(cd.at[id]); }
  }
  /** when の自動判定（呼び出し側が "auto" のとき: 昼フェーズ=即時 / 朝フェーズ=待機時間 / 投票フェーズ=結果発表 / それ以外=夜） */
  function autoWhen(g) {
    const P = ONW.PHASE || {};
    if (g.phase === P.ONLINE_DAY) return "day";
    if (g.phase === P.ONLINE_MORNING) return "morning";
    if (g.phase === P.ONLINE_VOTE) return "vote";
    return "night";
  }

  /**
   * 盗みの本体（変化役職の各ファイルから、自分の役職が変わった直後に呼ばれる）。
   * changedId: 変化した人 / changedRole: 変化後の役職（呼び出し時点で currentRoles[changedId] になっていること）/
   * source: 変化の種類（"robber" | "relic_robber" | "cosplayer" | "doppelganger" | "sam" | "nanoka" | "shuffler" | "beggar"）/
   * when: "night" | "morning" | "day" | "vote" | "auto"。戻り値: 盗みが起きたら true（呼び出し側は連鎖能力を止める）。
   */
  function trySteal(g, changedId, changedRole, source, when) {
    if (!g || !g.players || !changedId || !changedRole || changedRole === ID) return false;
    if ((g.currentRoles || {})[changedId] !== changedRole) return false;   // すでに別の変化が入っている（二重盗みの防止）
    const ms = activeMagicians(g, changedId);
    if (!ms.length) return false;
    const w = (!when || when === "auto") ? autoWhen(g) : when;
    ms.forEach((m) => {
      clearLinked(g, m);              // 魔法使いの席に残っていた古い記録は消す（上書きと同じ）
      copyLinked(g, changedId, m);    // 盗んだ役職に紐づく記録は魔法使いへ（マイクラ版 copyRoleLinkedData）
      setRole(g, m, changedRole);
      (g.magicianStolenRole = g.magicianStolenRole || {})[m] = changedRole;
      (g.magicianStolenFrom = g.magicianStolenFrom || {})[m] = changedId;
    });
    clearLinked(g, changedId);        // 変化した人は村人になる（記録は魔法使いへ渡したので消す）
    { const t = (g.roleTrail = g.roleTrail || {})[changedId] || []; if (t[t.length - 1] !== changedRole) { t.push(changedRole); (g.roleTrail[changedId] = t); if (g.cards && g.cards.at) (g.cards.trail[changedId] = g.cards.trail[changedId] || []).push(g.cards.at[changedId]); } }   // 変化自体の履歴が無い経路（乞食の交換は roleTrail を積まない）では、変化→村人の順で履歴を補う
    setRole(g, changedId, "villager");
    (g.magicianStealLog = g.magicianStealLog || []).push({ magicians: ms.slice(), target: changedId, role: changedRole, source: source || "", when: w });
    if (ONW.fixServants) ONW.fixServants(g);
    if (ONW.avenger && ONW.avenger.fix) ONW.avenger.fix(g);
    if (ONW.prankster && ONW.prankster.fix) ONW.prankster.fix(g);
    if (ONW.fixExecutioners) ONW.fixExecutioners(g);
    if (ONW.pureLover && ONW.pureLover.note) ONW.pureLover.note(g, [changedId, ...ms]);
    if (ONW.newsNote) ONW.newsNote(g, ID);   // 新聞: 実際に盗んだときだけ「魔法使いが動いた」と記録（マイクラ版 recordNewspaperRole）
    return true;
  }

  /** 追加勝利（vote.js の set() が呼ぶ。dead は死亡者の集合）: 魔法使いのままで生存している人 */
  const extraWins = (g, dead) => holders(g).filter((id) => !(dead && dead.has(id)));
  /** 結果発表用: 盗んだ順 [{ by, target, role, when, info }]（ui.js が「魔法使い:」の行で出す） */
  function lines(g, nameOf) {
    const out = [];
    (g.magicianStealLog || []).forEach((e) => (e.magicians || []).forEach((m) => out.push({
      by: nameOf(m), target: nameOf(e.target), role: e.role, when: e.when,
      info: `${nameOf(m)} は魔法使いです。${nameOf(e.target)} の「${rn(e.role)}」を奪いました（${nameOf(e.target)} は村人になりました）。`,
    })));
    return out;
  }
  /** 結果発表の演出用: 投票で盗んだ分 [{ byId, targetId, role }]（targetId = 盗まれた乞食） */
  const voteSteals = (g) => (g.magicianStealLog || []).filter((e) => e.when === "vote").map((e) => (e.magicians || []).map((m) => ({ byId: m, targetId: e.target, role: e.role }))).flat();
  /** 本人への通知文（マイクラ版の「魔法使い通知」の文面） */
  const noticeText = (g, e) => (e ? `あなたは${rn(e.role)}になりました。` : "");
  /** 実績（wiki-data.js の「魔法使い」に定義済みの3つ）。won: その人が勝ったか */
  function achievements(g, id, won) {
    const out = [];
    if ((g.initialRoles || {})[id] === ID || (g.currentRoles || {})[id] === ID) out.push("first_magician");   // 初めて魔法使いになる
    if (won && (g.magicianStolenRole || {})[id]) out.push("win_magician");   // 他人の役で取る勝利（盗んだ役職で勝利）
    if (!won && (g.currentRoles || {})[id] === ID) out.push("magician_loss");   // 魔法の失敗（魔法使いのまま敗北）
    return out;
  }

  ONW.magician = { trySteal, holders, activeMagicians, extraWins, lines, voteSteals, noticeText, achievements, stolenRoleOf: (g, id) => (g.magicianStolenRole || {})[id] || null };

  // ---------------------------------------------------------
  // 演出部品: 自分の席に魔法陣が出て、表向きのカードが魔法陣から出てきて席に置かれ、数秒後に裏に戻る
  // ---------------------------------------------------------
  const CIRCLE_SVG = `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="50" cy="50" r="47" opacity=".9"/><circle cx="50" cy="50" r="39" opacity=".55"/><polygon points="50,13 85,74 15,74" opacity=".8"/><polygon points="50,87 15,26 85,26" opacity=".8"/><circle cx="50" cy="50" r="12" opacity=".9"/><circle cx="50" cy="5" r="2.6"/><circle cx="95" cy="50" r="2.6"/><circle cx="50" cy="95" r="2.6"/><circle cx="5" cy="50" r="2.6"/></svg>`;
  /** 魔法陣+出現カードの演出（待機時間と昼の即時で共用）。SK = stage.kit、role = 盗んだ役職、delay = 開始までの遅延ms */
  function playCircle(SK, role, delay) {
    const k = `p:${ONW.net.myId()}`;
    const showSeat = () => SK.show(k, role);
    const hideSeat = () => { if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; SK.paint(SK.G()); };
    const el = SK.$t(), card = el && el.querySelector(`[data-k="${k}"] .tb-card`);
    if (!card || !card.animate) { SK.later(() => { showSeat(); SK.later(hideSeat, 2600); }, delay || 0); return; }   // 席が見つからない・アニメ非対応: 結果だけ出す
    SK.later(() => {
      const r = card.getBoundingClientRect();
      if (!r.width) { showSeat(); SK.later(hideSeat, 2600); return; }
      const size = Math.max(r.width, r.height) * 2.0;
      const circle = document.createElement("div");
      circle.className = "mg-circle";
      circle.style.cssText = `left:${r.left + r.width / 2 - size / 2}px;top:${r.top + r.height / 2 - size / 2}px;width:${size}px;height:${size}px;`;
      circle.innerHTML = CIRCLE_SVG;
      document.body.appendChild(circle);
      const info = ONW.roles.getInfo(role), team = info.team === ONW.TEAM.VILLAGE ? "village" : info.team === ONW.TEAM.WOLF ? "wolf" : "third";
      const ghost = document.createElement("div");   // 魔法陣から出てくる表向きのカード（盗んだ役職）
      ghost.className = "tb-seat up mg-ghost";
      ghost.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--cw:${r.width}px;--ch:${r.height}px;margin:0;padding:0;pointer-events:none;z-index:66;`;
      ghost.innerHTML = `<div class="tb-card" style="width:100%;height:100%"><div class="tb-inner"><div class="tb-back"></div><div class="tb-front tb-team-${team}">${SK.face(role)}</div></div></div>`;
      document.body.appendChild(ghost);
      ghost.animate([{ transform: "scale(.2) rotate(-8deg)", opacity: 0 }, { transform: "scale(1.07) rotate(1deg)", opacity: 1, offset: .72 }, { transform: "scale(1) rotate(0deg)", opacity: 1 }], { duration: 950, easing: "ease-out", fill: "forwards" });   // ① 魔法陣の中心から、すぅーと大きくなって出てくる
      SK.later(() => { if (ONW.sound) ONW.sound.se("deal"); showSeat(); ghost.remove(); }, 980);   // ② 自分の席に置かれる（自分のカードが盗んだ役職で表になる）
      SK.later(() => circle.classList.add("mg-circle--out"), 3050);                                 // ③ 魔法陣が消えていく
      SK.later(hideSeat, 3450);                                                                     // ④ 数秒後に裏面に戻る
      setTimeout(() => { circle.remove(); ghost.remove(); }, 4200);                                 // 試合が切り替わっても残らないように
    }, delay || 0);
  }
  // ---- 結果発表でカードを飛ばす部品（乞食の flyCard と同じ流儀。クラスは mg-fx で分ける） ----
  function removeFx() { document.querySelectorAll(".mg-fx").forEach((e) => e.remove()); }
  function anchorOf(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function flyCard(R, fromK, toK, role) {
    const A = anchorOf(R, fromK), B = anchorOf(R, toK);
    if (!A || !B || typeof document === "undefined") return;
    const info = ONW.roles.getInfo(role), team = info.team === ONW.TEAM.VILLAGE ? "village" : info.team === ONW.TEAM.WOLF ? "wolf" : "third";
    const el = document.createElement("div");
    el.className = "mg-fx tb-seat up";
    el.style.cssText = `position:fixed;left:${A.x}px;top:${A.y}px;width:${A.w}px;height:${A.h}px;--cw:${A.w}px;--ch:${A.h}px;margin:0;padding:0;pointer-events:none;z-index:900;transition:left 1.05s cubic-bezier(.45,.05,.35,1),top 1.05s cubic-bezier(.45,.05,.35,1),transform 1.05s cubic-bezier(.45,.05,.35,1);`;
    el.innerHTML = `<div class="tb-card" style="width:100%;height:100%"><div class="tb-inner"><div class="tb-back"></div><div class="tb-front tb-team-${team}">${R.face ? R.face(role) : ""}</div></div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => { el.style.left = `${B.x}px`; el.style.top = `${B.y}px`; el.style.transform = "scale(1.06)"; }));
    setTimeout(() => el.remove(), 1250);
  }
  function circleAt(R, k) {
    const A = anchorOf(R, k);
    if (!A || typeof document === "undefined") return null;
    const size = Math.max(A.w, A.h) * 2.0;
    const el = document.createElement("div");
    el.className = "mg-circle mg-fx";
    el.style.cssText = `left:${A.x + A.w / 2 - size / 2}px;top:${A.y + A.h / 2 - size / 2}px;width:${size}px;height:${size}px;`;
    el.innerHTML = CIRCLE_SVG;
    document.body.appendChild(el);
    return el;
  }

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 142, name: "魔法使い", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 57,
      desc: "第三陣営。夜の能力はありません。怪盗・墓荒らし・コスプレイヤー・ドッペルゲンガー・乞食・サム・シャッフラーなど、誰かが自分の役職を変えると、その変化後の役職を奪います（奪われた相手は村人になります）。封印されている・鍵師にロックされているときは奪えません。魔法使いが複数いれば全員が奪います。盗んだあとは、その役職の人として勝敗が決まります。最後まで魔法使いのままだった場合でも、生存していれば追加勝利します。" },
    groups: { "transform:silver_shadow": 32 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に MAGICIAN が入る。糸紡ぎの次）。光の使徒・闇の化身には入らない

    // 待機時間の知らせ（夜・朝の盗み）: 本人だけに「あなたは○○になりました。」+ 魔法陣の演出材料を返す。
    // 酔っ払い中（思い込み中）は演出・文章を出さない（キューピッドの待機時間演出と同じ。盗み自体は起きている）
    settleMsg(c, p, mode) {
      const g = c.g;
      const mine = (g.magicianStealLog || []).filter((e) => (e.when === "night" || e.when === "morning") && (e.magicians || []).includes(p.id));
      if (!mine.length) return {};
      if (ONW.hiddenDrunk(g, p.id)) return {};
      const out = { magician: mine.map((e) => ({ role: e.role, from: e.target })) };
      const logs = [];
      mine.forEach((e) => {
        e.toldIds = e.toldIds || [];
        if (e.toldIds.includes(p.id)) return;   // 再入室では文章を二重に出さない（演出材料だけ戻す）
        e.toldIds.push(p.id);
        logs.push(noticeText(g, e));
      });
      if (logs.length) out.logs = logs;
      return out;
    },
    // 待機時間の演出（stage.js の stageSettle が g.settleMagician を受け取って呼ぶ。魔法使いの画面にしか届かない）:
    // order 60 = 指令通知(52)より後・封印(95)より前。朝のめくり系（〜52）と重ならない遅い位置で、魔法陣→カード出現→裏戻し
    stageSettle: {
      field: "settleMagician", shown: "settleMagicianShown",
      run: { order: 60, run(items, SK) { items.forEach((it, i) => playCircle(SK, it.role, 200 + i * 3900)); } },
    },
    // 昼の変化の盗み（stage.js の flashes("late") が g.magicianFlash を渡す。本人だけに届く "magiciannews" で積まれる）: 即時に魔法陣の演出
    stageFlash: {
      field: "magicianFlash", when: "late",
      run(list, SK) { list.forEach((x, i) => playCircle(SK, x.role, 150 + i * 3900)); },
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 奪った役職を選ぶ（マイクラ版の魔法使いCO: 「○○を奪いました。」/ ロックで失敗の選択肢つき）
    coResult: {
      kind: "magician",
      pickRole(role, K) {
        if (role === "hide") return ["役職を奪いました。役職は伏せます。", null, null, "disclose", "奪った（伏せ）"];
        return [`${K.rn(role)}を奪いました。`, { kind: "magician", role }, null, "disclose", `${K.rn(role)} を奪った`];
      },
    },
    /** CPU（マイクラ版 cpu.js）: 盗んだ役職を結果開示する「○○を奪っていました」（結果開示なので AI議論OFF でも出る）。盗んでいなければ通常の発言へ */
    cpuClaim(k, g, p, r, i, c) {
      const stolen = (g.magicianStolenRole || {})[p.id];
      if (!stolen) return false;
      c.co = ID;
      c.result = { text: `${k.rn(stolen)}を奪っていました`, short: `${k.rn(stolen)} を奪った`, claim: { kind: "magician", role: stolen } };
    },
    // 結果発表の演出（stage.js の startResult が引く）: 投票で乞食から盗んだ分。乞食のカード移動（beggar.js の afterRest）の直後に出す
    // （読み込み順が乞食→魔法使いなので、R.t は乞食の場面のあとを引き継ぐ）。汎用の結果めくりでは魔法使いの席は魔法使いのまま、
    // 乞食の席は乞食の場面で取った役職になっている（net.js の buildResultObj が魔法使いの席を盗む前に差し替える）。
    // 字幕 → 魔法使いの席に魔法陣 → 乞食の席のカードが魔法使いの席へ飛ぶ → 着地で乞食の席は村人・魔法使いの席は盗んだ役職にめくれる
    stageResult: {
      afterRest(R) {
        const sw = (R.res && R.res.magicianSteals) || [];
        if (!sw.length) return;
        sw.forEach((s) => {
          const kt = R.P(s.targetId), kb = R.P(s.byId), t0 = R.t;
          let circle = null;
          R.later(() => {
            R.setCap(`<div class="res-cap__t t-third">${R.esc("魔法使い")}</div><div>${R.esc(s.by)} は ${R.esc(s.target)} の「${R.esc(rn(s.role))}」を奪いました</div>`);
            circle = circleAt(R, kb);
            R.up[kt] = s.role; R.glow[kt] = true; R.paint(R.G());   // 乞食の席は取った役職でめくれている（念のため同じ面を出し直して光らせる）
          }, t0);
          R.later(() => flyCard(R, kt, kb, s.role), t0 + 900);   // カードが魔法使いの席へ飛ぶ
          R.later(() => {   // 着地: 乞食の席には村人のカードが残り、魔法使いの席が盗んだ役職にめくれて光る
            R.up[kt] = "villager"; delete R.glow[kt];
            R.up[kb] = s.role; R.glow[kb] = true; R.paint(R.G());
            if (circle) circle.classList.add("mg-circle--out");
          }, t0 + 900 + 1100);
          R.later(() => { delete R.glow[kb]; R.paint(R.G()); removeFx(); }, t0 + 900 + 1100 + 700);
          R.t = t0 + 900 + 1100 + 900;
        });
      },
      skip(R) {   // スキップ時: 最終形（乞食は村人・魔法使いは盗んだ役職）を出し、魔法陣・飛ぶカードの残骸も片付ける
        ((R.res && R.res.magicianSteals) || []).forEach((s) => { R.up[R.P(s.targetId)] = "villager"; R.up[R.P(s.byId)] = s.role; });
        removeFx();
      },
      clear(R) { removeFx(); },
    },
  });
})(window.ONW);
