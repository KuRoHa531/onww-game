/**
 * 狂った煽動者（mad_agitator）: 人狼陣営（狂人系）。マイクラ版 scripts の狂った煽動者を移植（第6バッチ・14役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / night.js openAgitatorLikeAction / vote.js の集計 準拠）:
 *   ・煽動者とほぼ同じ。夜に全参加者の中から1人を選ぶ（**自分も選べる**。墓地は選べない）。
 *     煽られた人は投票で得る票数が1票増える。本人には「{対象} を煽りました。」が情報確認に残る。
 *   ・記録は煽動者と**共有**の `g.agitatorTarget`（人に紐づく状態。マイクラ版でも煽動者・狂った煽動者は
 *     同じ game.agitatorTarget を使う）。集計への加算・背景解決（ハッキングされている本物の煽動者系は
 *     ランダムな1人を煽った扱い / グレムリンのコピー先はコピー元と同じ相手）・結果情報の行は、
 *     煽動者側の共有コア `ONW.agitator`（ROLES に "mad_agitator" を追加済み）がそのまま担う。
 *     そのため投票の集計では、煽った人の現在の役職を問わず、煽動者と狂った煽動者の分が両方とも加算される。
 *   ・結果情報（第6バッチ共通指示）: 最終役職が狂った煽動者の人について「狂った煽動者 {名前} は {対象} を煽っていました。」
 *     （共有コアの lines がラベルを出し分ける。net.js の res.agitators → ui.js の「煽動者:」行に一緒に出る）。
 *   ・実績（マイクラ版 stats.js / wiki）: first_mad_agitator「純粋な狂気」/ win_mad_agitator「狂気の誘導」/
 *     mad_agitator_loss「虚ろな演説」/ mad_agitator_self_play「自作自演」（初期も最終も狂った煽動者で、
 *     自分自身を煽動し、人狼判定に昇格して勝利）/ agitator_mutual「双極の煽動」（煽動者と煽り合う。煽動者側と共通）。
 *   ・カウンセラーの更生対象（狂人系。groups.mad に入るため ONW.MAD_KIND に自動で入る）。
 * 演出（作者メモ: 煽動者とほぼ同じ）: 朝に、煽った相手のカードが 📢 の面（stage.js の AGIT_MARK "__agit"）で
 *   めくれる（狂った煽動者本人の画面だけ。朝の開示 rev "peek"。煽動者と同じ作り）。
 * 変化候補（マイクラ版で確認）: 闇の化身の変化先にのみ入る（TRANSFORM_ROLE_GROUPS の DARK_AVATAR リストの
 *   末尾 = 猪の狂人の次）。光の使徒・銀色の影の対象外。コスプレイヤーの変化先には**入らない**
 *   （マイクラ版 cosplayerEligibleRoles は村人陣営のみで、煽動者は入っているが狂った煽動者は入っていない）。
 *   シャッフラーの山札には入らない（マイクラ版 shufflerEligibleRoles の除外どおり。shuffler.js の BLOCKED に追加）。
 *   模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い）。ペルソナの仮面候補からも外れていない
 *   （PERSONA_MASK_EXCLUDED_ROLES に無い）。
 * 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている（info.sealTarget。封印対象は 108 → 109 役）。
 *   封印されていると夜の選択が共通処理で失敗する。
 *   カルメン・黄泉・鍵師の対象外（マイクラ版の各リストに無い）。詩人・観測の人狼の対象（info.observe = "player"）。
 *   見張り番・鈴の巫女の対象リストにはマイクラ版で入っている（Web版の本体・wiki控えとも先行登録済みで自動で有効化）。
 * ハッキング: 対象にも思い込みの対象にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
 *   狂った煽動者と思い込んだ人は、夜に偽の対象を選び「{対象} を煽りました。」の文＋朝に 📢 の面でめくれる
 *   （silver_wolf.js の fakeResult の agitator 分岐を mad_agitator にも効くようにした。本物の盤面・投票には影響しない）。
 *   本物の狂った煽動者がハッキングされている場合は、共有コアの背景解決でランダムな1人を煽った扱いになる。
 * 酔い覚め: 煽動者と同じく、マイクラ版では酔いが覚めた議論中の連鎖でも使えるため noDayChain は付けない。
 *   朝のうちの連鎖（墓荒らし・ドッペルゲンガー）も使える。
 * CPU: 夜は全参加者（自分を含む）から1人をランダムに選ぶ（煽動者の cpuRun と同じ。デバッグ指定があればそれ）。
 *   人狼陣営なので真COはしない（cpuClaim なし＝共通の騙り。猪の狂人・犬の狂人と同じ）。
 *   結果開示（COボタン）の coResult は人間用に用意する（煽動者と同じ pickPlayer 形式）。
 * 状態: g.agitatorTarget（煽動者と共有。人に紐づく。net.startGame の初期化・ホスト引き継ぎキーは煽動者側で登録済み）
 */
(function (ONW) {
  const ID = "mad_agitator";
  const AGIT_MARK = "__agit";   // stage.js の AGIT_MARK と同じ文字列。📢 の面（煽動者と共通）
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
  const pickText = (name) => `${name} を煽りました。`;
  const logText = (label, p, nameOf, t) => `${label} ${p.name} は ${nameOf(t)} を煽りました（投票+1）。`;

  /** 実績（マイクラ版 stats.js / wiki の狂った煽動者の実績） */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_mad_agitator");
    if (fin !== ID) return out;
    if (won) out.push("win_mad_agitator"); else out.push("mad_agitator_loss");
    if (ONW.agitator) ONW.agitator.settleBackground(g);
    const t = ONW.agitator ? ONW.agitator.targetOf(g, id) : null;
    if (t) {
      // 双極の煽動: 煽動者と狂った煽動者がお互いに煽動する（マイクラ版 hasMutualAgitation。煽動者側の実績と共通）
      if ((g.currentRoles || {})[t] === "agitator" && (g.agitatorTarget || {})[t] === id) out.push("agitator_mutual");
      // 自作自演: 初期も最終も狂った煽動者で、自分自身を煽動し、人狼判定に昇格して勝利（マイクラ版 stats.js の条件どおり）
      if (t === id && init === ID && (g.promotedWolfIds || []).includes(id) && won) out.push("mad_agitator_self_play");
    }
    return out;
  }

  // ---- CPUの夜の行動: 全参加者（自分を含む）から1人をランダムに選ぶ（煽動者の cpuRun と同じ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const hidden = ONW.rabbitMadman && ONW.rabbitMadman.hiddenId ? ONW.rabbitMadman.hiddenId(g) : null;
    const cand = g.players.filter((q) => !(g.deadIds || []).includes(q.id) && q.id !== hidden);
    const t = (f.player && cand.some((q) => q.id === f.player)) ? g.players.find((q) => q.id === f.player) : n.pick(cand);
    if (!t) return;
    ONW.agitator.setTarget(g, p.id, t.id);
    i.agitatorTarget = t.id;   // 発言（結果開示）が使う
    g.nightLogsAll.push(logText(label, p, n.nameOf, t.id));
    n.hold(p.id, pickText(t.name));
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 173, count: 0, name: "狂った煽動者", team: ONW.TEAM.WOLF, wakeOrder: 40, sort: 1.7007,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜に煽るプレイヤーを1人選択します。煽られたプレイヤーは投票される票数が1票加算されます。" },
    groups: { mad: 3.008, "transform:dark_avatar": 37 },   // 狂人系・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 120）で決まる
    achievements,
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>煽る相手</strong>のカードを1人分押してください。（<strong>自分も選べます</strong>）<br>煽られた人は、投票で<strong>得る票数が1票増えます</strong>。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>煽る相手</strong>のカードを押して（自分も選べます）",
    },
    stagePick: { self: true },   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分も選べる。煽動者と同じ）
    cpuNight: { order: 14, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 14,   // 煽動者と同じ段（占い師(10)・番犬(12)・見張り番(13)のあと。役職変動系より前に選ぶ）
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        ONW.agitator.setTarget(g, p.id, t);
        g.nightLogsAll.push(logText(c.rn(c.eff(p)), p, nameOf, t));
        c.hold(p.id, pickText(nameOf(t)));
        c.rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: AGIT_MARK }] };   // 朝: 煽った相手のカードが 📢 の面でめくれる（狂った煽動者本人の画面だけ。作者メモ）
        ONW.observeNote(g, p.id, [t], null, c.eff(p));
        ONW.newsNote(g, c.eff(p));
      },
    },
    /** 墓荒らし・ドッペルゲンガーで狂った煽動者を手にしたとき（朝のうち）と、酔い覚め（昼）: 煽る相手を1人選べる */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        ONW.agitator.setTarget(g, id, t);
        g.nightLogsAll.push(logText(c.label, c.me, c.nameOf, t));
        ONW.observeNote(g, id, [t], null, ID);
        ONW.newsNote(g, ID);
        return { lines: [pickText(c.nameOf(t))], reveal: { kind: "peek", items: [{ k: `p:${t}`, role: AGIT_MARK }] }, nextChain: null };
      },
    },
    // 結果開示(COボタン)の流れ: 煽った相手を選ぶと、そのまま「○○ を煽りました。」を開示する（煽動者と同じ）
    coResult: {
      kind: ID, targetLabel: "煽った相手",
      pickPlayer: (id, K) => [`${K.nameOf(id)} を煽りました。`, { kind: ID, target: id }, null, "disclose", `${K.nameOf(id)} を煽りました`],
    },
  });
  ONW.madAgitator = { achievements };
})(window.ONW = window.ONW || {});
