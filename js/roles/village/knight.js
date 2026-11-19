/**
 * 騎士（マイクラ版 KNIGHT を参考）: 村人陣営。夜の能力はなく、「死から守る」受動の役職。
 *   ・自分以外の「守れる人」が死ぬとき、1回だけ（騎士1人につき1回）その死から守る。守られた人は死なない（めくれない・撃たれない・処刑されない）。
 *   ・守れる人（マイクラ版 canKnightProtectTarget / canKnightProtectDayActionTarget）:
 *       村人陣営（最終盤面の役職の陣営）で、わら人形・猫又でなく、恋人・反転・シャッフラーが付いていない人。
 *       模倣の人狼のカードの人は、模倣先が村人陣営でも守れない。
 *   ・複数の騎士がいても、同じ対象を同時には守らない（1回の死に守る騎士は1人。候補が複数ならランダムに1人）。
 *   ・守った騎士は「使用済み」になり、2回目は守らない（g.knightUsed[騎士のID]）。人（席）についた記録で、役職が移動しても戻らない（保安官の撃った記録と同じ）。
 *   ・守れる騎士: 最終盤面の役職が騎士（模倣の人狼は模倣できない = NON_MIMICABLE）・酔いが覚めている・生きている・同時に死ぬ人（追放・撃たれる人）に入っていない・使用済みでない。
 *       酔っ払い経由（酔いが覚めたあとの騎士）・墓荒らし/ドッペルゲンガーで手にした騎士も、最終盤面（g.currentRoles）で見るので同じに働く。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_騎士_*of4.txt、詳細は docs/knight.md）:
 *   1of4: 役職の登録・守れるかの判定（canProtect）・守る騎士の選び方（pickKnight / protect）・状態の初期化・ロビー/wiki/ルールコードの登録【済】
 *   2of4: 追放（投票・独裁処刑・クーデター）と、身代わり（少佐）・ネコカボチャの道連れでの守り + 結果発表の 🛡️ 演出（めくれずに🛡️）
 *     2of4-a: 守りのロジック【済】= vote.js の applyKnightGuard（追放・独裁処刑・クーデター・身代わりで追放される人）と resolveChain の kill()（道連れ）・net.js の res.knights
 *     2of4-b: 結果発表の 🛡️ 演出（stageResult の intro / flipped / skip / clear。身代わりの従者・少佐の守りは servant.js の intro が stageShield で出す）【済】
 *   3of4: 保安官（模倣保安官・誤爆も）の守り + 撃とうとした人の画面にだけ出る 🛡️ 演出【済】= guardShot / playShield / net.js hostSheriff / sheriff.js lines
 *   4of4: CPU・実績・結果発表の役職情報(res.knightInfo)・docs・確認用スクリプト・総合確認【済】
 *
 * 【状態】（試合ごとに net.startGame が空に戻す・ホスト引き継ぎ AUTH_KEYS に含む）
 *   g.knightUsed[騎士のID] = true               … 守り終えた騎士
 *   g.knightLog = [{ knight, target, kind }]    … 守った記録（守った順。kind: "exec"(追放) / "dictator"(独裁処刑) / "coup"(クーデター) / "sub"(身代わりで死ぬ人) / "chain"(道連れ) / "shot"(保安官)）
 *   g.knightGuards = [{ id, knight, kind, by? }] … 結果発表（追放の演出）で 🛡️ を出す守り（2of4。保安官の守りは昼のうちに撃った人にだけ知らせるので入れない）
 * 【勝敗の優先度】村人陣営のまま（docs/victory-priority.md の行の追加は不要）。重複役職の優先度（docs/overlay-role-priority.md）も特別扱いなし。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const has = (g, id) => (g.players || []).some((p) => p.id === id);

  /** 騎士の能力が働いている人か（最終盤面の役職が騎士・酔いが覚めている）。生死・使用済みは見ない */
  const active = (g, id) => !!g && has(g, id) && ONW.mimic.eff(g, id) === R_().KNIGHT && !ONW.hiddenDrunk(g, id);

  /**
   * 騎士に守れる人か（マイクラ版 canKnightProtectTarget）。
   *   ・カードが模倣の人狼 → 守れない（模倣先が村人陣営でも）
   *   ・最終盤面の役職の陣営が村人陣営でない → 守れない / わら人形・猫又 → 守れない
   *   ・恋人（重複役職）・シャッフラー・反転が付いている → 守れない
   * 酔っ払いの人は、酔いが覚めていなくても、持っているカードで判定する（守られても本人には分からない）。
   */
  function canProtect(g, id) {
    if (!g || !has(g, id) || !g.currentRoles) return false;
    const role = g.currentRoles[id], r = R_();
    if (!role || role === r.MIMIC_WOLF) return false;
    const info = ONW.ROLE_INFO[role];
    if (!info || info.team !== ONW.TEAM.VILLAGE) return false;
    if (role === r.STRAW_DOLL || role === r.CAT_SIDHE) return false;
    if (ONW.isLover(g, id)) return false;
    if (ONW.shuffler && ONW.shuffler.tagged && ONW.shuffler.tagged(g, id)) return false;
    if (ONW.reverse && ONW.reverse.is && ONW.reverse.is(g, id)) return false;
    return true;
  }

  /**
   * 対象を守れる騎士のID（マイクラ版 availableKnightIdsFor）。
   *   target: 守る相手 / simul: 同時に死ぬ人のID（Set か配列。この中の騎士は守れない）
   * 対象本人は守れない・使用済み・死亡・同時に死ぬ人・酔いが覚めていない人は除く。
   */
  function availableKnights(g, target, simul) {
    const s = simul instanceof Set ? simul : new Set(simul || []);
    const used = g.knightUsed || {};
    return (g.players || []).map((p) => p.id).filter((id) => id !== target && active(g, id) && !used[id] && !isDead(g, id) && !s.has(id));
  }

  /**
   * 死から守る（状態を変える）。守れたら守った騎士のID、守れなければ null。
   *   kind: 守る場面（上の g.knightLog の kind）。by: 守る原因の人（道連れした人など。省略可）
   * 守った騎士は使用済みになる。呼び出し側は、戻り値が null でないとき、対象を死なせない処理をすること。
   */
  function protect(g, target, kind, simul, by) {
    if (!canProtect(g, target)) return null;
    const ids = availableKnights(g, target, simul);
    if (!ids.length) return null;
    const knight = ONW.utils.randomChoice(ids);
    (g.knightUsed = g.knightUsed || {})[knight] = true;
    (g.knightLog = g.knightLog || []).push({ knight, target, kind: kind || "exec" });
    return knight;
  }

  /** 結果発表の 🛡️ 演出の予定に足す（2of4 から使う。保安官の守りは足さない） */
  function addGuard(g, id, knight, kind, by) {
    const e = { id, knight, kind };
    if (by) e.by = by;
    if (isTb(g, knight)) e.tb = true;   // 守ったのが存護の開拓者（結果発表で「存護の守り」と出す。誰かは出さない）
    (g.knightGuards = g.knightGuards || []).push(e);
    return e;
  }

  /**
   * 指定した種類(kind)の守りの記録を消して、その守りで使われた騎士を未使用に戻す（2of4）。
   * 追放の決定（resolveElimination）と連鎖（resolveChain）は、同じ試合の中で何度も計算し直されることがあるので、
   * 計算のたびに自分の受け持つ kind だけを戻してからやり直す（ほかの kind の守りは触らない）。
   *   追放の決定: ["exec", "dictator", "coup", "sub"] / 連鎖: ["chain"]
   */
  function reset(g, kinds) {
    const ks = new Set(kinds || []);
    (g.knightLog || []).filter((e) => ks.has(e.kind)).forEach((e) => { if (g.knightUsed) delete g.knightUsed[e.knight]; });
    g.knightLog = (g.knightLog || []).filter((e) => !ks.has(e.kind));
    g.knightGuards = (g.knightGuards || []).filter((e) => !ks.has(e.kind));
  }

  /** この人が守った相手（結果発表の役職情報・実績用） */
  const guardedBy = (g, knight) => (g.knightLog || []).filter((e) => e.knight === knight).map((e) => e.target);

  /** 守った（守る）人のカードが開拓者（運命が存護）か。結果発表の文言を「存護」にするために使う */
  const isTb = (g, id) => !!g && !!g.currentRoles && g.currentRoles[id] === R_().TRAILBLAZER;
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  /** 結果発表の役職情報の文（守った記録ごと） */
  function lines(g) {
    const KIND = { exec: "追放", dictator: "独裁処刑", coup: "クーデター", sub: "身代わりでの死", chain: "道連れ", shot: "保安官の弾" };
    return (g.knightLog || []).map((e) => { const tb = isTb(g, e.knight); return { tb, text: `${tb ? "開拓者" : "騎士"} ${nm(g, e.knight)} は ${nm(g, e.target)} を${KIND[e.kind] || "死"}から守りました。` }; });
  }

  ONW.knight = { active, canProtect, availableKnights, protect, addGuard, reset, guardedBy, lines, stageShield, guardShot, playShield, achievements };

  // ---- 結果発表の 🛡️ 演出（2of4-b。stage.js の startResult / skipResult が引く。人狼王のガード = wolf_king.js と同じ作り）----
  /**
   * 実績（4of4。マイクラ版 stats.js と同じ条件。wiki の「騎士」に定義済みの4つのうち、この試合の結果だけで決まる3つ。first_knight は初回判定（保存側）なのでここでは返さない）。
   *   knight_only_village「誰も守れなくとも」 = 最終役職が騎士で、試合終了時に自分しか村人陣営がいない（最終盤面の役職の陣営で数える）
   *   knight_guard_queen「王家の親衛騎士」   = 最終役職が騎士で、女王（最終役職）を守った（追放・身代わり・道連れ・保安官の弾のどれでも。g.knightLog）
   *   win_knight「鉄壁の守護」              = 最終役職が騎士で勝利
   * Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ。fairy / aa の achievements と同じ形）。won: その人が勝ったか。
   * 最終役職で判定する（酔っ払い・墓荒らし・怪盗・ドッペル経由で騎士になった人も対象。模倣の人狼が模倣しているだけでは対象外）。
   */
  function achievements(g, id, won) {
    const out = [];
    if (!g || !g.currentRoles || g.currentRoles[id] !== R_().KNIGHT) return out;
    const village = (x) => { const i = ONW.ROLE_INFO[g.currentRoles[x]]; return !!i && i.team === ONW.TEAM.VILLAGE; };
    if ((g.players || []).every((p) => p.id === id || !village(p.id))) out.push("knight_only_village");
    if ((g.knightLog || []).some((e) => e.knight === id && g.currentRoles[e.target] === R_().QUEEN)) out.push("knight_guard_queen");
    if (won) out.push("win_knight");
    return out;
  }
  /** 席 k のカードの画面上の位置(中心)。なければ null */
  function center(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  /** 守りの衝撃: 席 k のカードの上に、広がる輪を出す（タフガイ・人狼王と同じ輪。文字は出さない） */
  function burst(R, k) {
    const c = center(R, k);
    if (!c) return;
    const el = document.createElement("div");
    el.className = "tg-burst kn-burst";
    el.style.left = c.x + "px"; el.style.top = c.y + "px";
    el.innerHTML = `<i class="tg-ring"></i><i class="tg-ring tg-ring2"></i>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1400);
  }
  /**
   * 席 id のカードが「めくれそうになって、めくれず 🛡️」の演出（時刻 t から 3000ms。カードは裏のまま・死なない）。
   *   t+0: カードが途中まで回って揺れる → t+1500: 光の輪・🛡️の札・字幕 cap → t+3000: 光を消す（🛡️の札は残る）
   * 身代わりの従者・少佐（servant.js の intro）と、下の intro / flipped が使う。守った騎士が誰かは出さない。
   */
  function stageShield(R, id, t, cap) {
    const { P, later, setCap, paint, G, badge } = R, kk = P(id);
    later(() => { R.alm[kk] = true; paint(G()); }, t);
    later(() => { delete R.alm[kk]; R.gx[kk] = "knightguard"; badge[kk] = "🛡️"; burst(R, kk); if (cap) setCap(cap); paint(G()); }, t + 1500);
    later(() => { delete R.gx[kk]; paint(G()); }, t + 3000);
    return 3000;
  }
  /**
   * 保安官の弾を守る（3of4。マイクラ版 tryKnightProtectDayActionTarget）。net.js の hostSheriff が、ONW.sheriff.judge → record のあとに呼ぶ。
   *   plan（g.sheriffShots に入っているのと同じ物）の victims（撃たれて死ぬ人: 執行された人・誤爆した保安官・ネコカボチャ）と tomo（ネコカボチャの道連れで死ぬ保安官）のうち、
   *   守れる人（canProtect）を、守れる騎士（同時に死ぬ人の騎士は除く）が1回だけ守る。守られた人は plan から外れ（死なない）、plan.knightGuard に入る。
   *   模倣保安官のカード（模倣の人狼）・恋人・シャッフラー・反転の人は守れない。従者（第三陣営）も守れない。
   *   ・守った記録は g.knightLog（kind \"shot\"）のみ。g.knightGuards には入れない（結果発表では 🛡️ を出さない = 撃った人以外には何も見えない）
   *   ・守られた人が死ななくなるので、従者の後追い（plan.followIds）からも外す
   * 戻り値: 守られた人のID（なければ []）
   */
  function guardShot(g, plan) {
    const out = [], simul = new Set([...(plan.victims || []), ...(plan.tomo || [])]);
    ["victims", "tomo"].forEach((key) => {
      (plan[key] || []).slice().forEach((id) => {
        if (!protect(g, id, "shot", simul, plan.by)) return;
        plan[key] = plan[key].filter((x) => x !== id);
        plan.followIds = (plan.followIds || []).filter((x) => x !== id);
        out.push(id);
      });
    });
    if (out.length) plan.knightGuard = out;
    return out;
  }
  /** 撃った人の画面だけに出す 🛡️（net.js の \"sheriffdone\" に knight が付いているとき、撃った瞬間に呼ぶ。再入室では呼ばない）: 撃った相手のカードが光り、🛡️の札が少しのあいだ出る */
  function playShield(targetId) {
    const K = ONW.stage && ONW.stage.kit, g = K && K.G();
    if (!targetId || !g || g.phase !== ONW.PHASE.ONLINE_DAY) return;
    const k = `p:${targetId}`;
    K.gx[k] = "knightguard"; K.badge[k] = "🛡️"; K.paint(g);
    burst(K, k);
    if (K.shake) K.shake(k);
    setTimeout(() => { const k2 = ONW.stage && ONW.stage.kit; if (!k2) return; if (k2.gx[k] === "knightguard") delete k2.gx[k]; if (k2.badge[k] === "🛡️") delete k2.badge[k]; k2.paint(k2.G()); }, 2800);
  }
  const KIND_LAB = { exec: "追放", dictator: "独裁処刑", coup: "クーデター" };


  /** CPU: 本物の騎士は55%で騎士CO、残りは村人騙り（タフガイと同じ。マイクラ版 cpu.js の canClaimRole に騎士が入っている） */
  function cpuClaim(k, g, p, r, i, c) {
    if (Math.random() < 0.55) c.co = "knight";
    else { const pl = k.plainLie(g, p, r); c.co = pl.co; c.result = pl.result; }
  }

  ONW.defineRole("knight", {
    info: { sealTarget: true, deck: 115, name: "騎士", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.98,
      desc: "村人陣営。夜の能力はありません。自分以外の、シャッフラー・反転・恋人が付いていない村人陣営の人が死ぬとき、1回だけ死から守ります（追放・独裁処刑・クーデター・少佐の身代わり・保安官に撃たれるとき・ネコカボチャの道連れなど）。守られた人は死なず、めくれずに🛡️マークが出ます。保安官の弾は、撃った人にだけ守られたことが分かります。複数の騎士がいても、同じ対象を同時には守りません。わら人形・猫又は守れません。" },
    cpuClaim,
    // 結果発表の演出（2of4-b。res.knights = net.js が game.knightGuards から作る）
    //   intro  : 追放・独裁処刑・クーデターで死にそうになった人のカードが、途中まで回って揺れる → 光の輪と 🛡️ の札。カードは裏のまま・追放されない（複数なら1人ずつ順に）
    //            身代わり（sub）で追放されそうになった従者・少佐の守りは servant.js の intro が stageShield で出す
    //   flipped: 道連れ（chain）を受けそうになった人: 道連れした人がめくれたあとに、カードがめくれそうになって 🛡️
    //   skip   : スキップ時の最終形（🛡️ の札。独裁者・反逆の狂人の skip が付ける「処刑対象」より後に付ける） / clear: 光の輪を片付ける
    stageResult: {
      intro: { order: 8, run(R) {
        const { res, P, later, setCap, esc } = R;
        const gs = (res.knights || []).filter((x) => KIND_LAB[x.kind]);
        R.guardN = (R.guardN || 0) + gs.length;   // 人狼王のガード(order 7)のあとに足す（「誰も追放されませんでした」の字幕を出さない）
        gs.forEach((x) => {
          const lab = KIND_LAB[x.kind];
          const kn = x.tb ? "存護" : "騎士";   // 存護の開拓者が守ったときは「存護」
          later(() => { setCap(`<div class="res-cap__t t-village">${kn}</div><div>${esc(x.name)} が${lab}されそうになりました…</div>`); }, R.t);
          stageShield(R, x.id, R.t, `<div class="res-cap__t t-village">${kn}の守り</div><div>${esc(x.name)} は死から守られました</div>`);
          R.t += 4300;
        });
        if (gs.length && !R.exec.length) R.t -= 600;   // 通常の追放がなければ、すぐ次へ
      } },
      flipped: { order: 22, run(R, hs, at) {
        const { res, esc } = R;
        const base = at + 1500 + (res.kings || []).filter((x) => x.kind === "tomo" && hs.some((h) => h.id === x.by)).length * 3000;   // 人狼王のガード(order 21)が同じ時に出るときは、そのあと
        let extra = 0;
        (res.knights || []).filter((x) => x.kind === "chain" && hs.some((h) => h.id === x.by)).forEach((x, i) => {
          const t = base + i * 3300;
          const kn = x.tb ? "存護" : "騎士";
          R.later(() => { R.setCap(`<div class="res-cap__t t-village">${kn}</div><div>${esc(x.byName)} の道連れで ${esc(x.name)} が死にそうになりました…</div>`); }, t);
          stageShield(R, x.id, t, `<div class="res-cap__t t-village">${kn}の守り</div><div>${esc(x.name)} は道連れになりませんでした</div>`);
          extra += 3300;
        });
        return extra;
      } },
      skip: { order: 200, run(R) { (R.res.knights || []).forEach((x) => { R.badge[`p:${x.id}`] = "🛡️"; }); } },
      clear(R) { document.querySelectorAll(".kn-burst").forEach((e) => e.remove()); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "knightguard") delete R.gx[k]; }); },
    },
    groups: { "transform:light_apostle": 53 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 51）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
