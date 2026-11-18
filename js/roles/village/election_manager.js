/**
 * 選挙管理委員（村人陣営・パッシブ）: 投票の時間中、「だれがだれに投票したか」が、カードからカードへの矢印で見える。
 *   マイクラ版（minecraftver.mcpack の utils.js notifyElectionManagers / state.js ROLE_INFO の「選挙管理委員」ELECTION_MANAGER）に合わせる。
 *
 * 【仕様】
 *   ・夜の能力・昼の能力はない（ボタンも要らない）。投票の時間中だけ、投票した人のカードから投票先のカードへ矢印が出る。
 *     マイクラ版は「[投票] AがBに投票しました」というチャット通知だが、Web版は依頼により「矢印」にする。**チャット・情報確認には何も残さない**（履歴なし）。
 *   ・矢印は「その人の今の投票先」を表す。投票先を変えると矢印が付け替わり、同じ人をもう一度押して未投票に戻すと矢印は消える。変えない限りそのまま残る。
 *     本人（選挙管理委員）の投票も矢印で見える（マイクラ版は本人の投票も通知する）。
 *   ・通常投票・妖狐投票・魔界公爵追放会議のどれでも見える（マイクラ版 electionVotePhaseLabel の3種類）。妖狐投票の結果を発表している間・投票が終わってからは出さない。
 *   ・見える人（active）= 最終盤面で選挙管理委員を持っていて（模倣の人狼が模倣していても可）、酔いが覚めていて（酔い中は見えない）、生きていて、
 *     封印の狂人に封印されていなくて、投票権を失っていない人。マイクラ版 notifyElectionManagers の除外（死亡・呪殺・投票権なし・封印）と同じ。
 *   ・【経由パターン】判定は「最終盤面」（currentRoles）の役職で行う: 墓荒らし・怪盗で選挙管理委員のカードを手にした人、ドッペルゲンガーがコピーした人（2人になる）、
 *     酔いが覚めた酔っ払い（酔い中は見えない）が見える。矢印の中身は g.votes を見るだけなので、どの経由でも同じように動く。
 *   ・マイクラ版の銀色の狼のハッキング（偽の通知）はWeb版に銀色の狼がいないので未対応。入ったら追う。
 *   ・封印の対象（YAMINABE_SEAL_TARGET_ROLES）には入っていない（マイクラ版 roles.js に無い）ので sealTarget は付けない。ただし封印されていると見えなくなる（上のとおり。マイクラ版と同じ）。
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（情報が見えるだけで、票も勝敗も変えない）。重複役職: 特別扱いなし（docs/overlay-role-priority.md）。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に election_manager はすでに入っている（icarus の次）。wiki の order も 47 で一致。末尾追加は不要。
 *
 * 状態（ホストだけが持つ。試合ごとに net.startGame が初期化）:
 *   g.emSnap          = { 投票者ID: 投票先ID }   前回の送信時点の票（変化を数えるため。投票が始まるたびに空に戻す）
 *   g.emSent          = { 席ID: true }           矢印を送った席（見えなくなったら「消して」と送る）
 *   g.emClosed        = true / false             投票が締め切られた（finishVoting の本体に入った）
 *   g.emObserved[id]  = true                     この人は「他の人の投票」を見た（実績 election_manager_change_after_observation 用）
 *   g.emOwnChange[id] = true                     この人は「他の人の投票を見たあとで」自分の投票先を変えた
 *   g.emSawChange[id] = true                     この人は「他の人が投票先を変える瞬間」を見た（実績 election_manager_witness_change 用）
 * 呼び出し: net.js の emSync（ホスト）→ ONW.electionManager.open / observers / view / track。画面側は stage.js の emDraw が g.emVotes を矢印にする。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** 矢印が出ている「投票の時間」か（投票フェーズで、締め切られておらず、妖狐投票の結果発表中でもないとき） */
  function open(g) {
    if (!g || g.phase !== ONW.PHASE.ONLINE_VOTE) return false;
    if (g.emClosed || g.dictator || g.allDeadSkip) return false;
    if (g.foxVote && g.foxVote.wait) return false;   // 妖狐投票の結果を発表している間は、投票を受け付けていない
    return true;
  }

  /** この人が（いま）選挙管理委員の力で投票を見られるか */
  function active(g, id) {
    if (!g || !g.currentRoles || !id) return false;
    if (ONW.mimic.actRole(g, id, g.currentRoles[id]) !== R().ELECTION_MANAGER) return false;   // 模倣の人狼が模倣していても見える
    if (ONW.hiddenDrunk(g, id) || isDead(g, id)) return false;                                  // 酔いが覚めるまでは見えない / 死亡者は見えない
    if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;                                  // 封印の狂人に封印されている
    if (ONW.fanatic && ONW.fanatic.lostBy && ONW.fanatic.lostBy(g, id)) return false;           // 投票権を失った人（鍵師のロックで狂人になれなかった背徳者）
    return true;
  }

  /** 見られる人（人間・CPU どちらも）のID。CPU は画面がないので、送信側が人間だけに絞る */
  function observers(g) { return (g.players || []).map((p) => p.id).filter((id) => active(g, id)); }

  /**
   * 見える票: { 投票者ID: 投票先ID }。投票の時間でなければ null。
   * 生きている人どうしの票だけ（死亡者の票は killPlayer が消す）。魔界公爵追放会議は自分への投票も入る。
   */
  function view(g) {
    if (!open(g)) return null;
    const out = {}, ids = new Set((g.players || []).map((p) => p.id));
    for (const [v, t] of Object.entries(g.votes || {})) { if (t && ids.has(v) && ids.has(t) && !isDead(g, v) && !isDead(t)) out[v] = t; }
    return out;
  }

  /** 矢印の見た目の判定用: 「見えるのは active の人だけ」かつ「投票の時間だけ」。見えない人には null */
  function viewFor(g, id) { return active(g, id) ? view(g) : null; }

  /**
   * 前回の送信から今回までの票の変化を数える（実績用。マイクラ版 notifyElectionManagers の
   * electionManagerObservedOtherVote / SawVoteChange / ChangedOwnVote）。送信のたびに ホストが呼ぶ。投票の時間でなければ何もしない。
   *   他の人の票が入った → その時点で見られる人は「他の人の投票を見た」
   *   他の人の票が別の人に変わった（未投票への取り消しは数えない）→ 見られる人は「投票先が変わる瞬間を見た」
   *   本人の票が別の人に変わった → すでに他の人の投票を見ていれば「見たあとで自分の投票先を変えた」
   */
  function track(g) {
    const cur = view(g);
    if (!cur) return;
    const prev = g.emSnap || {}, obs = observers(g);
    g.emObserved = g.emObserved || {}; g.emOwnChange = g.emOwnChange || {}; g.emSawChange = g.emSawChange || {};
    for (const [v, t] of Object.entries(cur)) {
      const was = prev[v];
      if (was === t) continue;
      const changed = !!was && was !== t;
      for (const o of obs) {
        if (v !== o) { g.emObserved[o] = true; if (changed) g.emSawChange[o] = true; }
        else if (changed && g.emObserved[o]) g.emOwnChange[o] = true;
      }
    }
    g.emSnap = { ...cur };
  }

  /** 実績（マイクラ版 stats.js と同じ条件。wiki「選挙管理委員」の4つのうち、この試合の結果だけで決まる3つ。first_election_manager は保存側）。won: その人が勝ったか */
  function achievements(g, id, won) {
    const out = [], cur = g.currentRoles && g.currentRoles[id];
    if (cur === R().ELECTION_MANAGER && won) out.push("win_election_manager");   // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
    if (cur === R().ELECTION_MANAGER && (g.emOwnChange || {})[id]) out.push("election_manager_change_after_observation");
    if (cur === R().ELECTION_MANAGER && (g.emSawChange || {})[id]) out.push("election_manager_witness_change");
    return out;
  }

  ONW.electionManager = { open, active, observers, view, viewFor, track, achievements };

  ONW.defineRole("election_manager", {
    info: { deck: 111, name: "選挙管理委員", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 16.8,
      desc: "村人陣営。夜と昼の能力はありません。投票の時間中、誰が誰に投票したかが、カードからカードへの矢印で見えます（自分の投票も見えます）。投票先を変えた人の矢印は付け替わり、変えない限りそのまま残ります。チャットや情報確認には残りません。通常の投票・妖狐投票・魔界公爵追放会議のどれでも見えます。見えるのは最終的に選挙管理委員を持っている人で、酔っ払いは酔いが覚めてからです。封印されている間は見えません。" },
    groups: { "transform:light_apostle": 49 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 47）で決まる（番号は所属を表すだけ）
  });
})(window.ONW);
