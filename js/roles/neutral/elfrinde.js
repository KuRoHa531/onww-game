/* エルフリンデ（第三陣営・発案: くろは・元ネタ: メメントモリ。マイクラ版 state.js / night.js / extraRoles.js / vote.js / main.js / game.js / cpu.js 準拠）
 * 夜の最初（封印の狂人より先）に自分以外の1人を選び、その人の能力を封印する。封印そのものは封印の狂人と共通の
 * 封印システム（ONW.seal。js/roles/wolf/mad/seal_madman.js）に乗り、エルフリンデ固有の部分だけをここに持つ:
 *   ・封印の見た目: 御札ではなく「鎖と魔法陣」（stage.js の ELFRINDE_MARK 面 "__elfseal"）。封印された側の失敗・通知の文も
 *     封印したのがエルフリンデなら「エルフリンデに…」になる（ONW.seal.byRole / failText / noticeText / dayText）。
 *   ・封印した相手の陣営で勝敗が決まる（マイクラ版 extraRoles.js の勝敗判定）:
 *       人外（村人陣営以外）を封印 → 村人陣営が勝利すれば追加勝利。
 *       村人陣営を封印 → 悪魔に精神を侵食され（侵食されたことは本人には分からない）、村人陣営が敗北すれば追加勝利。
 *       自分が封印されて封印できなかった場合は、村人陣営が勝利すれば追加勝利（マイクラ版 blockedBySeal）。
 *       封印していない（・できなかったのに自分も封印されていない）場合は勝利しない。
 *     「村人陣営の勝利」はヴァニティと同じ物差し（ONW.magicalGirl.teamOf で実際の村人陣営の勝者がいるか）で見る。
 *   ・侵食されたエルフリンデの投票は悪魔に操られる（マイクラ版 vote.js）: 村人陣営以外（てるてる・一目惚れしてるてる・
 *     殉教者・奇数人・偶数人・賞金稼ぎを除く）に投票すると、投票先が生存中の村人陣営の誰かへランダムにずれる
 *     （村人陣営の生存者がいなければ票は消える）。集計（vote.goranshinRun の最初）でだけ効き、元の投票 game.votes は書き換えない。
 *   ・感覚の占い師の気配（マイクラ版 senseSeerMessage）: 侵食されていれば「第三陣営の気配」、いなければ「村人の気配」
 *     （sense_seer.js の classify に接続）。
 *   ・黄泉（マイクラ版 yomiCutStates）: 自分・封印した相手のどちらを断ち切られても敗北する（elfrindeCutByYomi）。
 *     封印の解除そのものは yomi.js の seal ブロックが共通で行う。
 *   ・結果発表の役職情報（マイクラ版 vote.js の「エルフリンデ情報」）: 「○○ は △△ を封印していました。」/
 *     封印できなかった人は「○○ は封印されていたため能力を使えませんでした。」（lines）。
 * 状態（すべて役職に紐づく記録。ONW.ROLE_BOUND_KEYS に登録し、カードが動いたらついていく。マイクラ版
 *   transferRoleBoundSpecialData の ELFRINDE の移転と同じ。ただし乞食の取り込みでは移らない＝マイクラ版
 *   transferImmediateBeggarData にエルフリンデの記録が無いのに合わせ、beggar.js の transferData で除外）:
 *   g.elfrindeTarget[持ち主ID]      = 封印した相手のID
 *   g.elfrindeTargetTeam[持ち主ID]  = 封印した時点の相手の陣営（ROLE_INFO の team）
 *   g.elfrindeCorrupted[持ち主ID]   = 相手が村人陣営で侵食されたか
 *   g.elfrindeCutByYomi[持ち主ID]   = 黄泉に自分・封印した相手を断ち切られたか
 * 変化候補: 銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に ELFRINDE が入る）。
 *   光の使徒・闇の化身・コスプレには入らない。模倣は Web の共通流儀で第三陣営は対象外。
 *   シャッフラーはマイクラ版 shufflerEligibleRoles の除外に入っているので山札に入らない（shuffler.js の BLOCKED）。
 * ハッキング: マイクラ版の対象外（ヴァニティ・ホタルのみ）に入っていないので対象になる。思い込み先にもなる
 *   （silver_wolf.js の fakeResult に偽の結果文あり）。本物のエルフリンデがハッキングされている間は、本当の夜の行動は
 *   裏で自動的に使われる（cpu.js の autoReal。封印の狂人と同じ）。
 * 乞食: マイクラ版 isBeggarSwapExcludedTarget に入っていないので取れる（記録は移らない。上記）。
 * 封印の対象: 自分も封印される（info.sealTarget: true。マイクラ版 YAMINABE_SEAL_TARGET_ROLES に ELFRINDE が入る）。
 * 闇鍋シナジー: エルフリンデが出る闇鍋には、封印の効果を受ける役職（自分を除く）を最低3枚出す
 *   （マイクラ版 YAMINABE_ELFRINDE_TARGET_ROLES。roles.js の SYNERGY_COUNT_RULES）。
 * CPU: 夜は封印の狂人と同じくランダムに1人（デバッグ指定があればそれ）。発言は、封印した相手がいれば五分五分で
 *   エルフリンデCO（封印先を開示）、外れたら通常の騙り（マイクラ版 cpu.js）。
 * 実績（Wiki）: elfrinde_seal_outsider「教皇の使命」/ elfrinde_corrupted「堕ちた教皇」/ first_elfrinde「聖槍の魔女」/
 *   win_elfrinde「Ⅰ.THE LANCE」（Web版に実績の保存は無いので ID の返却のみ）。
 *   sealed_by_elfrinde_village「ほう、貴様、我に気づいてるな。」は封印された村人陣営側の実績なので、ここでは返さない。
 */
(function (ONW) {
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const R_ = () => "elfrinde";
  const has = (g, id) => !!id && g.players.some((q) => q.id === id);

  const E = (ONW.elfrinde = {
    /** 最終盤面でエルフリンデを持っている人のID */
    holders(g) { return (g.players || []).filter((p) => g.currentRoles && g.currentRoles[p.id] === R_()).map((p) => p.id); },
    /** 封印した相手（封印できなかった人は null） */
    targetOf(g, id) { return ONW.getRoleBound(g, "elfrindeTarget", id) || null; },
    /** 封印した時点の相手の陣営 */
    targetTeamOf(g, id) { return ONW.getRoleBound(g, "elfrindeTargetTeam", id) || null; },
    /** 村人陣営を封印して悪魔に精神を侵食されたか */
    corrupted(g, id) { return !!ONW.getRoleBound(g, "elfrindeCorrupted", id); },
    /** 黄泉に自分・封印した相手を断ち切られて敗北するか */
    cutByYomi(g, id) { return !!ONW.getRoleBound(g, "elfrindeCutByYomi", id); },
    /** 封印が成功したときに封印システム（ONW.seal.settle / apply）から呼ばれる: 相手の陣営をその場で記録する
     *  （マイクラ版 setElfrindeSeal: baseTeamOf(その時点の相手の役職)。カードが動いても記録はカードについていく） */
    recordSeal(g, holder, target) {
      const role = (g.currentRoles || {})[target];
      const team = ((ONW.ROLE_INFO || {})[role] || {}).team || null;
      ONW.setRoleBound(g, "elfrindeTarget", holder, target);
      ONW.setRoleBound(g, "elfrindeTargetTeam", holder, team);
      ONW.setRoleBound(g, "elfrindeCorrupted", holder, team === ONW.TEAM.VILLAGE);
    },
    /** 追加勝利の判定（マイクラ版 extraRoles.js のエルフリンデ。最終役職ベース） */
    extraWins(g, teams, winners) {
      const out = [];
      for (const id of E.holders(g)) {
        if (E.cutByYomi(g, id)) continue;   // 黄泉で本人・封印した相手のどちらかを断ち切られたエルフリンデは敗北する
        const usedSeal = !!E.targetOf(g, id);
        const blockedBySeal = !!(ONW.seal && ONW.seal.is(g, id)) && !usedSeal;   // 自分が封印されて封印できなかった
        let villageWon = (teams || []).includes("村人陣営");
        if (villageWon && winners) { const cw = g.cursedWolfIds || []; villageWon = [...winners].some((x) => x !== id && !cw.includes(x) && (ONW.hotaru && ONW.hotaru.teamOf ? ONW.hotaru.teamOf(g, x) : ONW.magicalGirl ? ONW.magicalGirl.teamOf(g, x) : ((ONW.ROLE_INFO[(g.currentRoles || {})[x]] || {}).team)) === ONW.TEAM.VILLAGE); }   // ヴァニティと同じ物差し（実際の村人陣営の勝者がいるか。ホタルは村人陣営の勝者に数える）
        const ok = blockedBySeal ? villageWon : (usedSeal && (E.corrupted(g, id) ? !villageWon : villageWon));
        if (ok) out.push(id);
      }
      return out;
    },
    /** 侵食されたエルフリンデの投票先のずれ（マイクラ版 vote.js の baseVotes 加工）。
     *  votes（{ 投票者ID: 投票先ID }）を受けて、ずれたあとの写しを返す（元の game.votes は書き換えない。
     *  誰が誰に投票したかの条件は元の票で見る＝ペンギン・御乱心と同じ）。ずれた先は1回だけ決めて覚える（g.elfrindeVoteShift） */
    shiftVotes(g, votes) {
      const out = { ...(votes || {}) };
      if (!g.currentRoles) return out;
      const dead = g.deadIds || [], EXEMPT = ["tanner", "love_tanner", "martyr", "odd_one", "even_one", "bounty_hunter"];   // マイクラ版 elfrindeVoteExemptRoles
      const teamOf = (id) => ((ONW.ROLE_INFO || {})[(g.currentRoles || {})[id]] || {}).team;
      g.elfrindeVoteShift = g.elfrindeVoteShift || {};
      (g.players || []).forEach((p) => {
        const voter = p.id, target = out[voter];
        if (g.currentRoles[voter] !== R_() || !E.corrupted(g, voter)) return;
        if (!target || dead.includes(voter) || dead.includes(target)) return;
        if (teamOf(target) === ONW.TEAM.VILLAGE || EXEMPT.includes(g.currentRoles[target])) return;   // 村人陣営・対象外の役職への票はそのまま
        let shifted = g.elfrindeVoteShift[voter];
        if (shifted === undefined) {
          const cands = (g.players || []).filter((q) => q.id !== voter && !dead.includes(q.id) && teamOf(q.id) === ONW.TEAM.VILLAGE).map((q) => q.id);
          shifted = cands.length ? cands[Math.floor(Math.random() * cands.length)] : null;   // 村人陣営の生存者がいなければ票は消える
          g.elfrindeVoteShift[voter] = shifted;
        }
        if (shifted && !dead.includes(shifted)) out[voter] = shifted; else delete out[voter];
      });
      return out;
    },
    /** 黄泉が target を断ち切るとき（yomi.js の封印ブロックより前に呼ばれる）:
     *  target が封印された側で封印したのがエルフリンデ / target がエルフリンデ本人で封印がまだ効いている相手がいる
     *  → そのエルフリンデは敗北する（マイクラ版 yomiCutStates。封印の解除そのものは yomi.js が共通で行う） */
    yomiCut(g, target) {
      if (!ONW.seal || !g.sealedBy) return;
      if (g.sealedBy[target] && ONW.seal.byRole(g, target) === R_()) {
        const hs = E.holders(g).filter((h) => E.targetOf(g, h) === target);
        if (hs.length) hs.forEach((h) => ONW.setRoleBound(g, "elfrindeCutByYomi", h, true));
        else if ((g.currentRoles || {})[g.sealedBy[target]] === R_()) ONW.setRoleBound(g, "elfrindeCutByYomi", g.sealedBy[target], true);   // 記録が無い場合の予備（封印した席の現在の持ち主）
      }
      if ((g.currentRoles || {})[target] === R_()) {
        const t = E.targetOf(g, target);
        if (t && g.sealedBy[t]) ONW.setRoleBound(g, "elfrindeCutByYomi", target, true);
      }
    },
    /** 結果発表の役職情報（マイクラ版 vote.js の「エルフリンデ情報」） */
    lines(g, nm) {
      const out = [];
      for (const p of g.players || []) {
        if ((g.currentRoles || {})[p.id] !== R_()) continue;
        const t = E.targetOf(g, p.id);
        if (t) out.push({ by: nm(p.id), text: `${nm(p.id)} は ${nm(t)} を封印していました。` });
        else if (ONW.seal && ONW.seal.is(g, p.id)) out.push({ by: nm(p.id), text: `${nm(p.id)} は封印されていたため能力を使えませんでした。` });
      }
      return out;
    },
    achievements(g, id, won) {
      const out = ["first_elfrinde"];
      if (E.targetOf(g, id)) out.push(E.corrupted(g, id) ? "elfrinde_corrupted" : "elfrinde_seal_outsider");
      if (won) out.push("win_elfrinde");
      return out;
    },
  });

  // ---- CPUの夜の行動: 封印の狂人と同じ（自分以外の1人をランダム。デバッグの指定があればそれ）。夜は控えるだけ（決着は段階の終わり）。朝のうちはその場で封印 ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    i.mode = "seal"; i.target = t.id;
    if (!cur) { ONW.seal.intend(g, p.id, t.id); return; }
    if (ONW.seal.apply(g, p.id, t.id, { hold: n.hold }) === "ok") { n.nn(rid); n.ob(p.id, [t.id]); }
  }

  const uiPick = {
    action(X) {
      const { later, nowSel } = X;
      return `<p class="night-step__hint">上のテーブルから、<strong>能力を封印したい人</strong>のカードを1人分押してください。（自分以外）<br>夜の最初に封印されるので、その人の夜の能力は失敗します。${later}</p>${nowSel("")}`;
    },
    chainReady: (np) => np === 1,
    chainHow: () => "<strong>能力を封印したい人</strong>のカードを押して（自分以外）",
  };

  ONW.defineRole("elfrinde", {
    info: { observe: "player", sealTarget: true, deck: 134, name: "エルフリンデ", team: ONW.TEAM.THIRD, wakeOrder: 0, sort: 53.5,
      desc: "第三陣営。夜の最初（封印の狂人より先）に自分以外の1人を選び、その人の能力を封印します。封印された人は夜の能力が失敗し、夜の能力のない役職でも能力や通知が封印されます。封印した相手が人外だった場合は村人陣営が勝利したときに、村人陣営だった場合は悪魔に精神を侵食され村人陣営が敗北したときに、追加で勝利します。侵食されたことは本人には分かりません（侵食されていると、投票先が村人陣営へずれます）。封印の狂人と封印し合ったときは、エルフリンデの封印が先に決まります。黄泉に自分か封印した相手を断ち切られると敗北します。" },
    groups: { "transform:silver_shadow": 30 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に ELFRINDE が入る）。光の使徒・闇の化身には入らない
    uiNight: uiPick,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 封印した相手を選ぶ →「〇〇 を封印しました。」（封印の狂人と同じ形・kind は "elfrinde"）
    coResult: {
      kind: "elfrinde", targetLabel: "封印した相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を封印しました。`, { kind: "elfrinde", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    cpuNight: { order: 0, stage: "seal", chain: true, run: cpuRun },   // 夜は "seal" 段階（最初）。chain: 墓荒らし・ドッペル・酔い覚めのあと、朝のうちに使える
    // CPUの発言（マイクラ版 cpu.js）: 封印した相手がいれば五分五分でエルフリンデCO（封印先を開示）。外れたら false（通常の騙り）
    cpuClaim(k, g, p, r, i, c) {
      const t = E.targetOf(g, p.id);
      if (!t || Math.random() >= 0.5) return false;
      c.co = R_();
      c.result = { text: `${nm(g, t)} を封印しました。`, short: `→ ${nm(g, t)}`, claim: { kind: "elfrinde", target: t } };
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    night: {
      kind: "seal", order: 0,   // 夜の最初の段階（封印の狂人は同じ段階の order 1）。選んだ相手を控えるだけで、決着は段階の終わりの ONW.seal.settle（エルフリンデが先）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const t = c.selOf(p).players[0];
        if (!t || t === p.id || !has(c.g, t)) return;
        ONW.seal.intend(c.g, p.id, t);
      },
    },
    /** 待機時間の演出: エルフリンデに封印されている本人のカードが、鎖と魔法陣の面でめくれて揺れる
     *  （封印の狂人の stageSettle と同じ作り。面は ELFRINDE_MARK。settleMsg は seal_madman.js が sealer で振り分ける） */
    stageSettle: { field: "settleSealElf", shown: "settleSealElfShown", run: { order: 95, run(ids, SK) {
      const k = `p:${ids[0]}`;
      let tries = 0;
      const go = () => {
        if (SK.up[k] !== undefined && tries++ < 8) { SK.later(go, 300); return; }   // ほかの演出がカードを表にしている間は待つ
        const prev = SK.up[k], prevGlow = SK.glow[k];
        SK.show(k, SK.ELFRINDE_MARK, true);
        SK.later(() => SK.shake(k), 650);
        SK.later(() => { if (SK.up[k] !== SK.ELFRINDE_MARK) return; if (prev === undefined) delete SK.up[k]; else SK.up[k] = prev; if (!prevGlow) delete SK.glow[k]; SK.paint(SK.G()); }, 2200);
      };
      SK.later(go, 600);
    } }, end: { order: 95, run(SK) { Object.keys(SK.up).forEach((k) => { if (SK.up[k] === SK.ELFRINDE_MARK) { delete SK.up[k]; delete SK.glow[k]; } }); SK.paint(SK.G()); } } },   // 昼になったら、鎖と魔法陣が残っていれば外す
    /** 墓荒らし・ドッペルゲンガーでエルフリンデを手にしたとき: 朝のうちに1人選んで、その場で封印できる（昼に酔いが覚めて手にしたときも同じ） */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        const r = ONW.seal.apply(g, id, t, { hold: () => {} });
        if (r === "failed") return { lines: [ONW.seal.failText(g, id)], reveal: ONW.seal.revealFail(id, ONW.seal.byRole(g, id)), nextChain: null, failed: true };   // 封印されていて失敗: 自分のカードに封印（封印した側の見た目）が貼られて揺れる
        return { lines: [ONW.seal.sealLine(g, t)], reveal: ONW.seal.revealPut(t, "elfrinde"), nextChain: null };                                            // その場で封印: 封印した相手のカードに鎖と魔法陣が貼られる
      },
    },
  });
})(window.ONW);
