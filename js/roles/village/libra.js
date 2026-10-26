/**
 * 天秤（村人陣営・昼能力）: マイクラ版 minecraftver.mcpack の LIBRA（main.js の昼能力 / vote.js の libraVoteTargets）に合わせる。
 *   夜の能力はない。昼の議論中に「昼能力」ボタンから、生きている人（自分を含めてよい）を2人選んで確定すると、
 *   議論をそこで打ち切って【すぐ投票に移り】、その投票では「選んだ2人のどちらか」にしか投票できなくなる。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・使えるのは、最終盤面で天秤を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ（使うとすぐ投票に移るので、試合に1回）。
 *     昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。封印の狂人に封印されていると使えない。
 *   ・選べるのは、生きている人2人（自分を含めてよい）。確定すると取り消せない。
 *   ・投票できる相手は、選ばれた2人のうち【生きている人】だけ。自分に投票できないのは今までどおり（選ばれた2人のうちの1人は、もう1人にしか入れられない）。
 *     投票の時点で2人とも死んでいれば、誰にも投票できない（マイクラ版と同じ）。
 *   ・制限されるのは通常の投票だけ。妖狐投票は制限しない（先に妖狐投票があれば、そのあとの本投票が制限される）。
 *   ・誰が天秤を使ったかは、結果発表まで本人以外にはわからない。ただし【選ばれた2人は、投票が始まるときに全員に知らされる】（マイクラ版の「天秤通知」と同じ。
 *     全員のチャットに「天秤通知: AとBに投票対象が制限されました。」が出る）。結果発表の「昼行動結果」に、誰が使ったか・誰と誰を選んだかが出る。
 *   ・マイクラ版の「猿凸」(猿の狂人がいると対象がランダムになる)は、猿の狂人がWeb版に無いので入れていない（入れるときは apply の a・b を差し替える）。
 *   ・模倣の人狼が天秤を模倣しているときも使える（ONW.mimic.actRole で見る）。模倣の人狼は人狼陣営なので、選ばれた2人の制限は同じ（役職名だけ「模倣の人狼」として扱う）。
 *
 * 【天秤の画面（3of4）】投票が制限されているとき、盤面に「上皿天秤」を出して、選ばれた2人のカードを皿に載せる。皿のカードを押して投票する。
 *   結果発表では、票数のバッジが出たあと、つられたほう（票数が多いほう）の皿だけが下がる。同数なら両方の皿が下がる。この天秤の演出の間は、カードはめくれない（そのあとめくれる）。
 *
 * 状態: g.libra = { by: 使った人のID, a: 1人目のID, b: 2人目のID, role: 使った役職(天秤 or 模倣の人狼) } | null（試合ごとに net.startGame が null に戻す）
 *       ※ 使った時点で昼は終わる（投票に移る）ので、1試合に1つだけ。
 * 呼び出し: net.js の hostLibra(ホスト) → ONW.libra.canUse / targets / apply。投票の検査・CPUの投票・投票画面は ONW.libra.limit / ok / voteTargets を見る。
 *
 * 実装は4段階（依頼文テキストは _wip/依頼文_天秤_*of4-*.txt）:
 *   1of4: 登録（このファイル・index.html・ルールコード ONW66・ロビー/ガイド/wikiの並び・封印の対象・状態キー）と、ロジック（canUse / targets / apply / limit / ok / voteTargets / view）【済】
 *   2of4: 昼能力の本体（昼能力ボタン → 2人を選ぶ画面 → ホストの検証 hostLibra → 投票へ移る・投票の検査・CPUの投票・再入室・封印・デバッグ）
 *   3of4: 天秤の画面（投票画面の上皿天秤・票数バッジ・つられた皿が下がる演出・演出中はカードがめくれない・結果発表の昼行動結果）
 *   4of4: CPU（騙り・投票判断・自動で使う）・COボタン・実績・端のケース（酔っ払い・墓荒らし・ドッペルゲンガー・模倣・再接続・観戦）と総合・docs の仕上げ【4of4-a 済】
 *
 * 勝敗の優先度: 村人陣営の役職。勝敗は村人陣営の基本勝敗のまま（docs/victory-priority.md の表に新しい行は不要）。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE;
  const dead = (g, id) => (g.deadIds || []).includes(id) || (g.foxCursed || []).includes(id);

  /** その人がいま使える天秤の役職（天秤 / 天秤を模倣した模倣の人狼）。どちらでもなければ null */
  const roleOf = (g, id) => {
    const r = g && g.currentRoles ? ONW.mimic.actRole(g, id, g.currentRoles[id]) : null;
    return r === R_().LIBRA ? (g.currentRoles[id] === R_().MIMIC_WOLF ? R_().MIMIC_WOLF : R_().LIBRA) : null;
  };
  /** 天秤が使われたか（使った時点で昼は終わるので、試合に1回） */
  const used = (g) => !!(g && g.libra);

  /** 選べる人（生きている人。自分も含む） */
  function targets(g) {
    return (g.players || []).map((p) => p.id).filter((x) => !dead(g, x));
  }
  /**
   * 天秤の昼能力を使えるか（最終盤面の役職が天秤（模倣も可）・酔いが覚めている・生きている・まだ使われていない・昼の議論中でタイマーが動いている・
   * 独裁処刑や全員死亡スキップ中でない・封印されていない・選べる人が2人以上いる）
   */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!roleOf(g, id)) return false;
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;   // 封印の狂人に封印されている: 昼能力は使えない
    if (ONW.hiddenDrunk(g, id) || dead(g, id) || used(g)) return false;
    return targets(g).length >= 2;
  }
  /**
   * 天秤を使う（ホストが検証したあとに呼ぶ。通信・画面・投票への移行は net.js 側）。a・b は別々の生きている人であること。
   * 戻り値: 記録した { by, a, b, role }。条件を満たさなければ null（何も起きない）
   */
  function apply(g, id, a, b) {
    if (!canUse(g, id) || !a || !b || a === b) return null;
    const ok = targets(g);
    if (!ok.includes(a) || !ok.includes(b)) return null;
    g.libra = { by: id, a, b, role: roleOf(g, id) };
    return g.libra;
  }

  // ---- 投票の制限 ----
  /**
   * いま行われている投票の制限。制限がなければ null（全員に投票できる）。
   * あれば「投票できる相手の候補」＝選ばれた2人のうち生きている人（0〜2人）。妖狐投票のあいだは制限しない（null）
   */
  function limit(g) {
    if (!g || !g.libra) return null;
    if (g.foxVote && g.foxVote.active) return null;   // 妖狐投票は制限しない（そのあとの本投票が制限される）
    return [g.libra.a, g.libra.b].filter((x) => !dead(g, x));
  }
  /** voter が target に投票してよいか（制限がなければ true。あれば、制限の候補の中の自分以外） */
  function ok(g, voter, target) {
    const L = limit(g);
    return !L || (L.includes(target) && target !== voter);
  }
  /** voter が投票できる相手のID（生きている自分以外。天秤の制限があれば、その候補の中だけ） */
  function voteTargets(g, voter) {
    const all = (g.players || []).map((p) => p.id).filter((x) => x !== voter && !dead(g, x));
    const L = limit(g);
    return L ? all.filter((x) => L.includes(x)) : all;
  }

  // ---- 結果発表・観戦者・再入室 ----
  /** 結果発表用: 天秤が使われていれば { byId, by, ids: [a, b], names: [aの名前, bの名前], role }。使われていなければ null。nm = ID → 名前 */
  function view(g, nm) {
    const l = g && g.libra;
    if (!l) return null;
    return { byId: l.by, by: nm(l.by), ids: [l.a, l.b], names: [nm(l.a), nm(l.b)], role: l.role || R_().LIBRA };
  }
  /** 昼行動結果（dayLogsAll）の文 */
  const actText = (rn, by, a, b, role) => `${rn(role || R_().LIBRA)} ${by} は ${a} と ${b} に投票対象を制限していました。`;
  /** 全員のチャットに出す天秤通知（マイクラ版の「天秤通知」と同じ文） */
  const noticeText = (a, b) => `天秤通知: ${a}と${b}に投票対象が制限されました。`;
  /** 本人の情報確認の文 */
  const doneText = (a, b) => `${a} と ${b} に投票対象を制限しました。`;
  /** 観戦者の「昼の行動」欄（specInfo）用: 使われていれば { by, a, b }（名前）。なければ null */
  function specLine(g, nm) {
    const l = g && g.libra;
    return l ? { by: nm(l.by), a: nm(l.a), b: nm(l.b) } : null;
  }

  // ---- 実績（4of4） ----
  /**
   * 実績（wiki の「天秤」に定義済みの5つ）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（感覚の占い師 ONW.senseSeer.achievements と同じ形。保存側ができたら呼ぶ）。
   * won: その人が勝ったか。勝者の一覧は g.winnerIds（勝敗の確定後に vote.js が入れる）。
   *   libra_win        = 天秤（カード）で能力を発動して勝利 / libra_loss = 天秤（カード）で能力を発動したうえで敗北（模倣の人狼が使った分は数えない。どちらも使った本人の分）
   *   first_libra      = 初期役職か最終役職が天秤（初めてかどうかは保存側が数える）
   *   win_libra        = 最終役職が天秤で勝利
   *   libra_chosen_winner = 能力で選んだ2人のうち、生き残った片方だけが勝利（もう片方は死亡していて勝者でない）。使った本人の分
   */
  function achievements(g, id, won) {
    const out = [], L = R_().LIBRA, ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id], l = g.libra;
    const mine = !!(l && l.by === id), card = mine && l.role === L;
    if (card) out.push(won ? "libra_win" : "libra_loss");
    if (ini === L || cur === L) out.push("first_libra");
    if (cur === L && won) out.push("win_libra");
    if (mine) {
      const w = new Set(g.winnerIds || []), alive = [l.a, l.b].filter((x) => !dead(g, x));
      if (alive.length === 1 && w.has(alive[0]) && ![l.a, l.b].filter((x) => x !== alive[0]).some((x) => w.has(x))) out.push("libra_chosen_winner");
    }
    return out.filter((x, k) => out.indexOf(x) === k);
  }

  // ---- CPU（4of4） ----
  /**
   * CPUが天秤で選ぶ2人（CPU_AUTO_DAY.libra が ON のときだけ net.js の cpuLibra が使う。既定はOFFで、デバッグの「昼能力」タブから発動する）。選べなければ null。
   *   ・村人側: 人狼と分かっている人がいれば、その人 + もう1人（村人側と分かっていない人を優先）。分かっていなければ、村人側と分かっていない自分以外の2人
   *   ・人狼側（天秤を模倣した模倣の人狼）: 仲間と分かっている人を避けて、自分以外の2人（仲間に票が入らないようにする）
   *   自分以外で足りなければ自分も含めて選ぶ（村人側のみ。人狼側は足りなければ使わない）
   */
  function cpuPick(k, g, p) {
    const all = targets(g); if (all.length < 2) return null;
    const i = k.infoOf(g, p.id), wolfSide = k.isWolfSide(k.selfRole(g, p));
    const kn = (t) => i.known[t];
    const mate = (t) => k.isWolf(kn(t)), villageKnown = (t) => !!kn(t) && !k.isWolf(kn(t)) && ONW.roles.getInfo(kn(t)).team === "village";
    const others = all.filter((t) => t !== p.id);
    const two = (pool) => { const a = k.pick(pool), rest = pool.filter((t) => t !== a); return rest.length ? [a, k.pick(rest)] : null; };
    if (wolfSide) { const pool = others.filter((t) => !mate(t)); return pool.length >= 2 ? two(pool) : null; }
    const wolves = others.filter(mate);
    if (wolves.length) {
      const a = k.pick(wolves), rest = others.filter((t) => t !== a), pref = rest.filter((t) => !villageKnown(t));
      const pool = pref.length ? pref : rest.length ? rest : all.filter((t) => t !== a);
      return pool.length ? [a, k.pick(pool)] : null;
    }
    const pref = others.filter((t) => !villageKnown(t));
    return two(pref.length >= 2 ? pref : others.length >= 2 ? others : all);
  }
  /**
   * CPUの投票判断（cpu.js の scoreVote が全員の分を足す）: 天秤COをした人 q への加点。
   *   ・天秤が配役（と変化公開）にいないのに名乗る → 嘘（人外）
   *   ・天秤COが、天秤の枚数より多い → このなかに嘘つきがいる
   *   ・それ以外 → 少し村人側に見る（人狼陣営のCPUは、ほぼ何も見ない）
   * 天秤が使われたあとの投票は選ばれた2人のなかだけ（ONW.libra.limit）。天秤を使った人は本人以外にはわからない（通知は2人の名前だけ）ので、使ったことの申告は見ない。
   */
  function cpuVoteSee(k, g, p, q, i, me, wolfSide) {
    if (q.id === p.id) return 0;
    const co = (g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co) || null;
    if (co !== R_().LIBRA) return 0;
    if (!k.roleInSetup(g, R_().LIBRA)) return wolfSide ? 0 : 3.0;
    const n = g.players.filter((x) => (g.coBoard && g.coBoard[x.id] && g.coBoard[x.id].co) === R_().LIBRA).length;
    const cards = Math.max(1, (g.selectedRoles || []).filter((r) => r === R_().LIBRA).length);
    if (n > cards) return wolfSide ? 0 : 1.6;
    return wolfSide ? 0.2 : -0.6;
  }

  ONW.libra = { roleOf, used, targets, canUse, apply, limit, ok, voteTargets, view, actText, noticeText, doneText, specLine, achievements };

  ONW.defineRole("libra", {
    info: { sealTarget: true, deck: 88, name: "天秤", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.991,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている人を2人（自分を含めてよい）選ぶと、議論をそこで打ち切ってすぐ投票に移り、その投票では選んだ2人のどちらかにしか投票できなくなります。選ばれた2人は投票が始まるときに全員に知らされますが、誰が天秤を使ったかは結果発表までわかりません。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に天秤を持っている人が使えます。投票画面には上皿天秤が出て、皿のカードを押して投票します。" },
    // CPU（4of4）: 本物は必ず「天秤CO」。天秤は使うとすぐ投票に移る（結果を言う前に議論が終わる）ので、結果開示はない（COボタンも役職COだけ）。
    //   騙りは「天秤CO」だけ（結果なし。claim を書かないと、村人が配役にいるとき「村人CO」に置き換わってしまう）。自動で使う・投票判断は上の cpuPick / cpuVoteSee
    cpuClaim(k, g, p, r, i, c) { c.co = "libra"; },
    cpuLie: { role: "libra", weight: 4, order: 17, claim: () => ({ co: "libra", result: null }) },
    cpuPick, cpuVoteSee,
    groups: { "transform:light_apostle": 33 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 33）で決まる（番号は所属を表すだけ）
    // 夜の画面: 夜の行動がない天秤向けの説明
    uiNight: {
      idle(X) {
        if (X.logs) return null;
        return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼の議論中に、昼能力ボタンから<strong>投票対象にする2人</strong>を選べます。</p>`;
      },
    },
  });
})(window.ONW);
