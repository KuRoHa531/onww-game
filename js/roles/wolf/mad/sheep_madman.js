/**
 * 羊の狂人（sheep_madman）: 人狼陣営（狂人系）。マイクラ版 scripts の羊の狂人を移植（第4バッチ・干支狂人の8役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / main.js の昼能力 / vote.js の effectiveVoteRecords・isSheepMadmanWolfSideTarget 準拠）:
 *   ・夜の能力は無い。昼の議論中に「昼能力」で生きている自分以外の1人を選び、その人を「迷える子羊」状態にする。
 *     迷える子羊にされた人の投票先は、集計のときに生きている全員（本人・羊自身も含む）の中からランダムに1人へ書き換わる
 *     （御乱心の書き換えの直後・エルフリンデ／ペンギンより前。ランダム先は人ごとに覚えておき、集計のたびに同じになる）。
 *   ・人狼陣営側の人に使った場合は、羊自身の投票先もランダムになる（羊ごとのメモキー "self:<羊>"）。
 *     「人狼陣営側」の判定（マイクラ版 isSheepMadmanWolfSideTarget）:
 *       恋人である / シャッフラーの印で運命が結ばれている / 逆転の印が付いている人は対象外（false）。
 *       実効役職が人狼陣営（本物の人狼・狂人系・サム・闇の化身・思い込み中の模倣の人狼など）なら true。
 *       シュレディンガーの猫は保安官で「人狼陣営」に固定された場合のみ true。魔法少女は闇堕ちしている場合のみ true。
 *   ・使えるのは1回だけ（カルメンに囁かれたら2回目も使える。2回目は対象を上書きする＝マイクラ版のマップ方式）。
 *     能力を使った瞬間、その対象に付いていた御乱心のランダム結果のメモは消える（マイクラ版の仕様どおり）。
 *   ・封印されていると使えない（Web版の昼能力の共通仕様。封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に羊の狂人が入っている）。
 *   ・結果発表では、御乱心の演出の直後に 🐏 の演出で票数が動く（作者メモ: 御乱心の 🍄 じゃなくて 🐏）。
 *     結果情報には「羊の狂人○○は△△を迷える子羊にしていました。」が出る。
 * 演出（作者メモ）: 結果発表で対象の票が 🐏 の数字とともに新しい投票先へ飛ぶ。御乱心（🍄）と同じ動きでマークだけ 🐏。
 * 変化候補（マイクラ版で確認）: 闇の化身の変化候補（DARK_AVATAR の候補リストに羊の狂人が入っている）。光の使徒（村人陣営のみ）・
 *   銀色の影（第三陣営のみ）・コスプレイヤー（村人陣営のみ）の候補ではない。模倣の人狼はなれる（NON_MIMICABLE_ROLES に無い）。
 *   シャッフラーの山札に入る（除外リストに無い）。ペルソナは Web版未実装。
 * ハッキング: 対象外には入っていない（思い込んだ人の昼能力は偽で、効果なし＝銀狼の共通処理。羊の狂人と思い込んだ人の通知文は
 *   マイクラ版どおり「○○を迷える子羊状態にしました。」）。本物の羊の狂人が別の役職を思い込んでいても、羊の効果は実効役職で判定する。
 * 記録の持ち方（解釈点）: マイクラ版では sheepMadmanTarget は役職に紐づくデータ（カードと一緒に動く）だが、Web版では昼能力は
 *   夜のカード移動が全て終わったあとの昼に使うため、御乱心（g.goranshins）と同じく「使った人」に紐づけて記録する（実質的な差は無い）。
 *   シャッフラーの印の判定は、マイクラ版 hasShufflerBadge（自分に置いた印／引き継いだ印）の Web版相当として
 *   ONW.shuffler.picks（有効な印の一覧）で「その印を置いたカードの現在の持ち主」または「自分に置かれた印の対象」かを判定する。
 * CPU: マイクラ版でも CPU は羊の狂人の昼能力を自分からは使わない（Web版も御乱心・鼠の狂人と同じ）。結果開示の文だけ用意する。
 * デバッグ: デバッグの昼能力（kind: "sheep"）で対象を指定して使える。
 * 黄泉: マイクラ版の yomiCutStates に羊の狂人の記録は無いので、黄泉では断ち切られない（鼠の狂人と同じ）。
 * トラップマスター（罠師）: 罠師の移植時に接続済み（hostSheep が ONW.trapMaster.dayGate を通す。罠を張られた人を迷える子羊にしようとすると失敗して消費され、投票権を失う。シナジー YAMINABE_TRAP_MASTER_TARGET_ROLES にも羊の狂人が含まれる）。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const ID = "sheep_madman";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
  const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"];

  const targetOf = (g, id) => (g && g.sheepTarget && g.sheepTarget[id]) || null;
  const used = (g, id) => (g.sheepLog || []).filter((e) => e.by === id).length >= (ONW.carmen ? ONW.carmen.dayUses(g, id) : 1);
  /** 昼能力を使えるか（御乱心・鼠の狂人と同じ条件。封印されていると開けない） */
  function canUse(g, id) {
    return !!(g && g.phase === ONW.PHASE.ONLINE_DAY && !g.dayStartId && !g.dictator && !g.allDeadSkip && !isDead(g, id) && act(g, id) === ID && !used(g, id) && !ONW.seal.dayBlocked(g, id) && !ONW.hiddenDrunk(g, id));
  }
  /** 選べる相手: 生きている自分以外の参加者 */
  function targets(g, id) {
    if (!canUse(g, id)) return [];
    return (g.players || []).filter((p) => p.id !== id && !isDead(g, p.id)).map((p) => p.id);
  }
  /** 迷える子羊状態にする（対象は上書き。御乱心のメモはマイクラ版どおり消す） */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    (g.sheepTarget = g.sheepTarget || {})[id] = target;
    (g.sheepLog = g.sheepLog || []).push({ by: id, target });
    if (g.goranshinRandom) delete g.goranshinRandom[target];
    return { by: id, target };
  }
  const doneText = (name) => `${name}を迷える子羊状態にしました。`;

  const rand = { next: () => Math.random() };
  function randomFor(g, key, alive) {
    const memo = (g.sheepRandom = g.sheepRandom || {});
    let to = memo[key];
    if (!alive.includes(to)) { to = alive[Math.floor(rand.next() * alive.length) % alive.length]; memo[key] = to; }
    return to;
  }
  /** シャッフラーの印で運命が結ばれているか（マイクラ版 hasShufflerBadge の Web版相当） */
  function shufflerBound(g, id) {
    if (!ONW.shuffler || !ONW.shuffler.picks) return false;
    return ONW.shuffler.picks(g).some(([holder, target, role, self]) => holder === id || (self && target === id));
  }
  /** 対象が「人狼陣営側」か（マイクラ版 isSheepMadmanWolfSideTarget）: true なら羊自身の票もランダムになる */
  function wolfSideTarget(g, id) {
    if (!id) return false;
    if (ONW.isLover && ONW.isLover(g, id)) return false;
    if (shufflerBound(g, id)) return false;
    if (ONW.reverser && ONW.reverser.count(g, id) > 0) return false;
    const role = act(g, id);
    if (!role) return false;
    if (role === R().SCHRODINGER_CAT) return (g.sheriffCatTeam || {})[id] === "wolf";   // 保安官に撃たれて人狼陣営に固定された猫だけ
    if (role === R().MAGICAL_GIRL) return !!(ONW.magicalGirl && ONW.magicalGirl.isDark(g, id));   // 闇堕ちした魔法少女だけ
    const info = ONW.roles.getInfo(role);
    return !!info && info.team === ONW.TEAM.WOLF;   // 本物の人狼・狂人系・サム・闇の化身・模倣の人狼（思い込み中）など
  }
  /**
   * 投票の書き換え（マイクラ版 vote.js の羊の狂人の処理）: 御乱心のあとの votes を受け取り、
   * { votes, list: [{ by, voterId, fromId, toId, w, self }] } を返す（list は使った順）。
   * 対象が投票していない・死んでいる場合は何もしない。羊自身の票の書き換えは、対象が人狼陣営側で、羊が投票していて生きているときだけ。
   */
  function run(g, votes) {
    const out = { ...(votes || {}) }, list = [];
    if (!g || g.dictator || !g.sheepTarget || !Object.keys(g.sheepTarget).length) return { votes: out, list };
    const dead = new Set(g.deadIds || []);
    const alive = (g.players || []).map((p) => p.id).filter((x) => !dead.has(x));
    if (!alive.length) return { votes: out, list };
    Object.entries(g.sheepTarget).forEach(([by, target]) => {
      if (!target || !out[target] || dead.has(target)) return;
      const from = out[target], to = randomFor(g, target, alive);
      out[target] = to;
      list.push({ by, voterId: target, fromId: from, toId: to, w: ONW.vote.weightOf(g, target), self: false });
      if (!out[by] || dead.has(by) || !wolfSideTarget(g, target)) return;
      const from2 = out[by], to2 = randomFor(g, "self:" + by, alive);
      out[by] = to2;
      list.push({ by, voterId: by, fromId: from2, toId: to2, w: ONW.vote.weightOf(g, by), self: true });
    });
    return { votes: out, list };
  }
  /** 結果発表用（票数つき）: { list: [{ byId, by, voterId, voter, fromId, from, toId, to, w, self, ok }], steps } */
  function resultData(g, nm) {
    if (!g || !g.sheepTarget || !Object.keys(g.sheepTarget).length || !ONW.vote || !ONW.vote.sheepSteps) return null;
    const ss = ONW.vote.sheepSteps(g);
    if (!ss.list.length) return null;
    return {
      list: ss.list.map((x) => ({ byId: x.by, by: nm(x.by), voterId: x.voterId, voter: nm(x.voterId), fromId: x.fromId, from: nm(x.fromId), toId: x.toId, to: nm(x.toId), w: x.w, self: !!x.self, ok: x.fromId !== x.toId && x.w > 0 })),
      steps: ss.steps.map((st) => Object.entries(st).map(([id, c]) => ({ id, c }))),
    };
  }
  /** 結果情報の行（マイクラ版の干支狂人情報）: 「羊の狂人○○は△△を迷える子羊にしていました。」（最終的な対象ぶん） */
  function lines(g, nm) {
    return Object.entries((g && g.sheepTarget) || {}).filter(([by, t]) => by && t).map(([by, t]) => `羊の狂人${nm(by)}は${nm(t)}を迷える子羊にしていました。`);
  }

  // ---- 結果発表の演出（御乱心の runGoranshin と同じ動き。マークは 🐏） ----
  function runSheep(R2, F, cap) {
    if (!F || !F.list || !F.list.length) return 0;
    const seat = (id) => R2.P(id), nm = (id) => R2.nm(id);
    const shown = (step) => { const o = {}; (step || []).forEach((c) => { if (c.c > 0) o[c.id] = c.c; }); return o; };
    const txt = (c) => R2.disp ? R2.disp(c) : c;
    let t = R2.t;
    F.list.forEach((x, i) => {
      const step = F.steps[i + 1]; if (!step) return;
      const fromId = x.fromId, toId = x.toId, w = x.w, voterId = x.voterId;
      if (x.ok) {   // 実際に票が動いたときだけ飛ばす
        R2.later(() => { R2.setCap(cap ? `<div class="res-cap__t t-wolf">羊の狂人</div><div>${R2.esc(nm(voterId))} の投票先が 🐏 で変わります…</div>` : R2.CAP_FX_SUB); R2.gx[seat(voterId)] = "sheepsel"; R2.paint(R2.G()); }, t);
        R2.later(() => {
          const a = R2.els[seat(fromId)], b = R2.els[seat(toId)], host = R2.els[seat(voterId)];
          if (a && b && host) {
            const hr = host.getBoundingClientRect(), ar = a.getBoundingClientRect(), br = b.getBoundingClientRect();
            const mk = (r1, r2, delay) => { const el = document.createElement("div"); el.className = "gr-fly"; el.textContent = `🐏${txt(w)}`; el.style.left = (r1.left + r1.width / 2) + "px"; el.style.top = (r1.top + r1.height / 2) + "px"; document.body.appendChild(el); requestAnimationFrame(() => { el.style.transform = `translate(${r2.left + r2.width / 2 - (r1.left + r1.width / 2)}px, ${r2.top + r2.height / 2 - (r1.top + r1.height / 2)}px)`; el.style.opacity = "0.25"; }); setTimeout(() => el.remove(), 950 + delay); };
            mk(ar, hr, 0); setTimeout(() => mk(hr, br, 0), 420);
          }
          if (ONW.sound) ONW.sound.se("vote_move");
        }, t + 350);
        R2.later(() => { R2.counts = shown(step); delete R2.gx[seat(voterId)]; R2.paint(R2.G()); }, t + 1100);
        t += 1600;
      } else { R2.later(() => { R2.counts = shown(step); R2.paint(R2.G()); }, t); t += 150; }
    });
    const used = t - R2.t; R2.t = t; return used;
  }
  const countsMs = (F) => (F && F.list ? F.list.reduce((n, x) => n + (x.ok ? 1600 : 150), 0) : 0);

  /** 実績（wiki/js/wiki-data.js の羊の狂人の実績。first_ は履歴系なので返さない＝他の役職と同じ） */
  function achievements(g, id, won) {
    const out = [], cur = (g.currentRoles || {})[id];
    if (cur !== ID) return out;
    if (won) out.push("win_sheep_madman");
    if ((g.players || []).some((p) => p.id !== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_sheep_madman");
    return out;
  }

  ONW.defineRole(ID, {
    info: {
      sealTarget: true,   // マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている
      deck: 150, name: "羊の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.7002,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。昼の議論中に「昼能力」ボタンから生きている自分以外の1人を選ぶと、その人を迷える子羊状態にして、その人の投票先を生きている全員の中からランダムに変更します（自分自身や羊の狂人本人になることもあります）。人狼陣営の人に使った場合は、自分の投票先もランダムになります。恋人・シャッフラーの印が付いた人・逆転の印が付いた人に使っても、自分の票はランダムになりません。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に羊の狂人を持っている人が使えます。使ったことは結果発表まで分かりません。",
    },
    groups: { mad: 3.003, "transform:dark_avatar": 32 },
    achievements,
    coText: (name) => `${name}を迷える子羊にしました。`,
    coShort: (name) => `${name}を迷える子羊にした`,
    coResult: { kind: ID, targetLabel: "迷える子羊にした相手", noChain: true, pickPlayer: (g, id) => targetOf(g, id) },
    cpuSpeak: (g, id, nm) => { const t = targetOf(g, id); return t ? { text: `${nm(t)}を迷える子羊にしていました。`, short: `${nm(t)}を迷える子羊にした`, claim: { kind: ID, target: t } } : null; },
    stageResult: {
      counts: { order: 3, run(R2) { runSheep(R2, R2.res.sheep, true); } },   // 御乱心(order 2)の直後・ペンギン(order 5)より前
      clear(R2) { document.querySelectorAll(".gr-fly").forEach((e) => e.remove()); Object.keys(R2.gx).forEach((k) => { if (R2.gx[k] === "sheepsel") delete R2.gx[k]; }); },
    },
  });
  ONW.sheepMadman = { canUse, targets, apply, targetOf, used, doneText, applyToVotes: run, resultData, lines, wolfSideTarget, achievements, run: runSheep, run2: (R2, F, cap) => runSheep(R2, F, cap), ms: countsMs };
})(window.ONW = window.ONW || {});
