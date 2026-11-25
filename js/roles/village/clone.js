/**
 * clone.js — クローン（村人陣営 / deck 139 / 発案: くろは / 元ネタ: オリジナル）
 *
 * ・配役時点で、他の参加者の初期役職のうち村人陣営（クローン以外）の役職をランダムに1つ「思い込む」
 *   （マイクラ版 roles.js assignCloneThoughtRoles）。他の参加者に思い込める村人役職が無ければ、
 *   参加者全員の初期役職の村人陣営から選び、それも無ければ村人と思い込む。
 * ・クローン本人には思い込んだ役職のカードが見え、その役職の能力・通知をそのまま使う
 *   （夜の能力・昼能力・酔い覚め・CPUの行動もすべて思い込み役職として処理される。
 *   実装は ONW.mimic.actRole が clone → 思い込み役職 を返すことで全体に効かせている）。
 * ・実際の役職はクローンのまま: 占い結果は「クローン」、勝敗は村人陣営（カード基準）。
 * ・思い込み（g.cloneThoughtRole）は「カードに付いて動く」記録（ONW.ROLE_BOUND_KEYS）:
 *   怪盗・いたずらっ子の交換ではカードと一緒に移り、墓地との交換では墓地キー（"g:番号"）と
 *   入れ替わる（マイクラ版 swapCloneThoughtRoleWithCenter）。コピー（ドッペルゲンガー・
 *   グレムリン）ではコピー元の思い込みがそのまま移る（マイクラ版 copyCloneThoughtRole）。
 *   別の役職に上書きされると消える（マイクラ版 syncSingleRoleLinkedData）。
 * ・模倣の人狼との違い: 模倣は「人狼陣営のまま、村人・人狼・狂人系の能力だけを借りる」役職で、
 *   本人も周囲も模倣の人狼だと分かり、占い・勝敗は人狼として扱われる。クローンは「村人陣営の
 *   役職そのものだと思い込む」役職で、本人は自分がクローンだと知らず（後覚者の通知だけが例外）、
 *   思い込めるのは村人陣営だけ。勝敗・占いはあくまでクローン（村人陣営）として扱われる。
 *
 * ・結果発表の演出（作者メモ）: 特殊な演出はなし。結果発表でカードがめくれるとき、模倣や
 *   開拓者と同じく、思い込んでいる役職のブロック（枠）がカードの下に付く（stage.js の
 *   tb-mimic / tb-clone。枠の中の役職名には余分な改行を足さず、その役職の通常の改行の
 *   仕方（breakHtml）で出す）。観戦者には配役時点から見える（模倣と同じ pubMap 方式）。
 * ・後覚者との特殊ケース（マイクラ版 game.js）: 初期役職がクローンで後覚者を思い込んでいた
 *   人は、朝の後覚者通知で真実を知る（最終的にもクローンなら「あなたはクローンでした。」、
 *   クローンから変わっていたら「クローンからXになっていました」）。Web版では後覚者の
 *   results が actRole 経由でクローンを拾い、文面は通常の後覚者の文（最終役職は「クローン」）
 *   になる（実質は同じ。文面の差は解釈点として docs/clone.md に記録）。
 *
 * ・酔っ払い・墓荒らし・ドッペルゲンガー・コスプレイヤー経由:
 *   - 酔っ払いのクローンは通常の酔っ払いと同じ（自分の役職は分からない）。酔いが覚めたら
 *     思い込み役職が見え（net.js soberUp の shown 差し替え）、思い込み役職の昼能力・連鎖が使える。
 *   - 墓荒らし・ドッペルゲンガーでクローンを手にしたら、その場で思い込みを決めて（got）、
 *     思い込み役職の got（手にした直後の情報）に委譲する。
 *   - コスプレイヤーの山札には入らない（マイクラ版 cosplayerEligibleRoles に無い）。
 * ・ハッキング（銀狼）: 対象外には入っていない（本物のクローンもハッキングされる。
 *   その場合も本当の能力は actRole 経由で裏で自動的に使われる）。思い込み先にもなる:
 *   クローンと思い込んだ人は、クローンの思い込み役職（g.cloneThoughtRole に ensure で決める）
 *   の役職だと思い込み、その役職の偽の夜表示・偽の結果・偽の昼能力が出る
 *   （silver_wolf.js の actOf / baseView / result の clone 分岐。マイクラ版と同じく、
 *   思い込んだ人の思い込み役職は配役時点のプールから決まる）。
 * ・バーテンダー連携: バーテンダーと思い込んだクローンは「認識されるバーテンダー」になり、
 *   本物のカクテルを渡す（bartender.js perceivedIds が g.cloneThoughtRole を読む。
 *   人間は nightMsgAct の合流、CPUは bartender の cpuNight で対象が確定する）。
 *
 * ・光の使徒: 変化候補に入る（マイクラ版 TRANSFORM_ROLE_GROUPS の LIGHT_APOSTLE）。
 *   闇の化身・銀色の影: 入らない。模倣: 模倣できない（マイクラ版 NON_MIMICABLE_ROLES。
 *   Web版 mimic_wolf.js の NON_MIMICABLE に登録済み）。コスプレ: 入らない（上記）。
 *   シャッフラー: 山札に入らない（マイクラ版 shufflerEligibleRoles の除外どおり。
 *   shuffler.js の BLOCKED に追加）。ペルソナ: マイクラ版では仮面候補（除外リストに無い）が、
 *   Web版はペルソナ未実装のため配線なし。
 * ・封印・読切・カルメンの対象リストには入っていない（マイクラ版の各対象リストに無い）。
 * ・乞食: 「取れない対象」に入っていないので取れる（思い込み記録は ROLE_BOUND_KEYS で移る）。
 * ・シナジー: マイクラ版にクローン固有のシナジーは無い（ONW.SYNERGY_RULES への追加なし）。
 * ・デバッグ: 思い込み役職の指定 = ONW.debug.cloneRole（game.dbg.clone[ID]）と
 *   マイクラ版と同じ game.nextCloneThoughtRoles[ID] の両方を見る（村人陣営・クローン以外のみ有効）。
 * ・実績（マイクラ版 stats.js / wiki）: clone_vote_original「本物は僕だっ…！」
 *   （クローンの履歴があり、思い込んでいる役職が最終役職のプレイヤーに投票した）、
 *   first_clone「遺伝子複製」、win_clone「完全なる複製」。Web版には実績の保存が無いので判定関数だけ返す。
 * ・CPU: 夜行動は思い込み役職の cpuNight が本番経路（ONW.cpu.runNight の act 解決）で動く。
 *   CO・結果開示は cpuClaim で思い込み役職に委譲する（後覚者のときだけ、最終役職の認識を
 *   思い込み役職に読み替える。マイクラ版CPUの perceived final と同じ）。
 *
 * 状態: g.cloneThoughtRole = { 持ち主ID（または墓地キー "g:番号"）: 思い込み役職ID }（カードに付いて動く）
 *       g.initialCloneThoughtRole = { 持ち主ID: 思い込み役職ID }（初期クローンの記録。後覚者の判定用）
 *       g.cloneInfo = [{ by: 名前, role: 思い込み役職ID, grave: bool }]（結果発表・観戦の役職情報用）
 * 呼び出し: 配役 = net.js startOnlineGame → ONW.clone.assignAll（模倣のあと・ハッキングより前）。
 * 詳細は docs/clone.md。
 */
(function (ONW) {
  const ID = "clone";
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
  const isVillageRole = (r) => !!r && r !== ID && ((ONW.ROLE_INFO[r] || {}).team === ONW.TEAM.VILLAGE);

  /** その持ち主（プレイヤーID / 墓地キー）の思い込み役職（無ければ null） */
  function thoughtOf(g, id) { return ((g && g.cloneThoughtRole) || {})[id] || null; }

  /** 思い込みの候補プール（マイクラ版 assignCloneThoughtRoles: 他の参加者の初期役職 → 無ければ参加者全員の初期役職。どちらも村人陣営・クローン以外） */
  function pool(g, id) {
    const ini = (g && g.initialRoles) || {};
    const others = (g.players || []).filter((p) => p.id !== id).map((p) => ini[p.id]).filter(isVillageRole);
    if (others.length) return others;
    return (g.players || []).map((p) => ini[p.id]).filter(isVillageRole);
  }

  /** 思い込みを決める（決まっていればそれを返す。マイクラ版 ensureCloneThoughtRole）。デバッグ指定があれば優先 */
  function ensure(g, id) {
    if (!g || !id) return null;
    g.cloneThoughtRole = g.cloneThoughtRole || {};
    if (g.cloneThoughtRole[id]) return g.cloneThoughtRole[id];
    let t = null;
    const spec = ONW.debug && ONW.debug.cloneRole ? ONW.debug.cloneRole(g, id) : null;
    const nxt = (g.nextCloneThoughtRoles || {})[id];
    if (isVillageRole(spec)) t = spec; else if (isVillageRole(nxt)) t = nxt;
    if (!t) { const pl = pool(g, id); t = pl.length ? pl[Math.floor(Math.random() * pl.length)] : "villager"; }
    g.cloneThoughtRole[id] = t;
    return t;
  }

  /** 配役時の一括割り当て（マイクラ版 assignCloneThoughtRoles。初期・最終のどちらかがクローンの参加者全員） */
  function assignAll(g) {
    if (!g) return;
    g.cloneThoughtRole = {}; g.initialCloneThoughtRole = {}; g.cloneInfo = [];
    (g.players || []).forEach((p) => {
      const ini = (g.initialRoles || {})[p.id], cur = (g.currentRoles || {})[p.id];
      if (ini !== ID && cur !== ID) return;
      const t = ensure(g, p.id);
      if (ini === ID) g.initialCloneThoughtRole[p.id] = t;
      g.cloneInfo.push({ by: p.name, role: t, grave: false });
    });
  }

  /** 墓地からクローンを引いたあと（state.js ONW.swapGrave から。カードに付いてきた思い込みが無ければ決める） */
  function afterGrave(g, id) { return ensure(g, id); }

  /** 結果発表・観戦者に出す「席キー → 思い込み役職ID」（模倣の pubMap と同じ形）。final=true: 最終役職がクローンの席と墓地 / false: 初期役職がクローンの席 */
  function pubMap(g, final) {
    const out = {}, roles = final ? (g.currentRoles || {}) : (g.initialRoles || {});
    (g.players || []).forEach((p) => { if (roles[p.id] === ID) { const t = thoughtOf(g, p.id); if (t) out["p:" + p.id] = t; } });
    if (final) (g.center || []).forEach((r, i) => { if (r === ID) { const t = thoughtOf(g, "g:" + i); if (t) out["g:" + i] = t; } });
    return out;
  }

  /** 結果発表の「役職情報」の行（buildResultObj が role を役職名に変えてから ui.js が出す） */
  function infoLines(g) { return (g.cloneInfo || []).map((x) => ({ by: x.by, role: x.role, grave: !!x.grave })); }

  /** 思い込んでいる役職のプレイヤーに投票したか（実績 clone_vote_original。マイクラ版 stats.js cloneVotedThoughtRole: 投票先の最終役職が思い込み役職と一致） */
  function votedOriginal(g, id) {
    const t = thoughtOf(g, id); if (!t) return false;
    const v = ((g.votes || {})[id]) || ((g.mainVotes || {})[id]);
    return !!v && typeof v === "string" && (g.currentRoles || {})[v] === t;
  }

  /** 実績（マイクラ版 stats.js と同じ条件。Web版に保存が無いので判定だけ） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    const trail = (g.roleTrail || {})[id] || [];
    if (ini === ID || cur === ID) out.push("first_clone");
    if (cur === ID && won) out.push("win_clone");
    if ((ini === ID || trail.includes(ID)) && votedOriginal(g, id)) out.push("clone_vote_original");
    return out;
  }

  const C = (ONW.clone = { thoughtOf, pool, ensure, assignAll, afterGrave, pubMap, infoLines, votedOriginal, achievements });

  ONW.defineRole(ID, {
    info: { deck: 139, name: "クローン", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.02,
      desc: "村人陣営。配役時点で現世にいる村人陣営の役職を思い込みます。現世に思い込める村人役職がいなかった場合村人と思い込みます。実際の役職はクローンですが、思い込んだ役職の能力や通知を使用できます。占い結果はクローンです。" },
    groups: { "transform:light_apostle": 58 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 56）で決まる
    // 夜の始まり: 思い込んだ役職の夜の表示をそのまま出す（本人はその役職だと思っている）
    nightMsg(c, p) {
      const t = thoughtOf(c.g, p.id) || ensure(c.g, p.id);
      const d = t && ONW.roleDef(t);
      return d && d.nightMsg ? d.nightMsg(c, p, t) : {};
    },
    // 墓荒らし・ドッペルゲンガー・怪盗などでクローンを手にしたとき: 思い込みを決めて、思い込み役職の「手にした直後の情報」に委譲する
    got(c, p, got, rev, opts) {
      const g = c.g, t = ensure(g, p.id);
      g.cloneInfo = g.cloneInfo || [];
      g.cloneInfo.push({ by: p.name, role: t, grave: !!(opts && opts.skipGrave != null) });
      const d = t && ONW.roleDef(t);
      if (d && d.got) d.got(c, p, t, rev, opts);
    },
    // 酔いが覚めたとき: 思い込んだ役職の酔い覚めの情報を出す（最終役職の表示そのものは net.js soberUp が思い込み役職に差し替える）
    soberLines(c, id) {
      const t = thoughtOf(c.g, id);
      const d = t && ONW.roleDef(t);
      return d && d.soberLines ? d.soberLines(c, id) || [] : [];
    },
    // CPU: CO・結果開示は思い込んだ役職に委譲する（夜行動は actRole 解決で思い込み役職の cpuNight が本番経路で動く）
    cpuClaim(k, g, p, r, i, c) {
      const t = thoughtOf(g, p.id) || "villager";
      const h = ONW.roleHook(t, "cpuClaim");
      if (t === "insomniac" && i && i.finalRole === ID) {   // 後覚者と思い込んだクローン: 最終役職の認識は思い込み役職（マイクラ版CPUの perceived final と同じ）
        const sv = i.finalRole; i.finalRole = t;
        try { if (h) h(k, g, p, t, i, c); } finally { i.finalRole = sv; }
      } else if (h) {
        h(k, g, p, t, i, c);
      }
      if (!c.co) c.co = t;   // 思い込み役職に結果開示が無い役職（村人・スターなど）は、その役職のCOだけする
    },
  });
})(window.ONW);
