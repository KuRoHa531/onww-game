"use strict";
/**
 * odd_one.js — 奇数人（第三陣営 / deck 176 / wiki order 177 / 発案: しらす・くろは）
 *
 * マイクラ版（scripts/state.js の ROLE_INFO[ODD_ONE]、scripts/vote.js の applyOddOneVoteOutcome /
 * applyCurseWolfExecution / applyThirdSpecials / applyLimitedSingleWinners / applyDemonDukePostMeetingBonusWinners、
 * scripts/roles.js の YAMINABE_SEAL_TARGET_ROLES、scripts/stats.js の実績・戦績ラベル）を正とする。
 * 偶数人（even_one）と仕組みが対なので、判定本体は共通コア ONW.parityOne に置く
 * （偶数人の移植は PARITY 表に even_one が既に入っているので、役職定義と勝敗の呼び出しを足すだけ）。
 *
 * ・投票パリティ（受動・夜の行動なし）: 投票の解決時、最終役職が奇数人の人について、
 *   自分への実効得票数（tally の最終集計。煽動・ペンギン・交換者などの書き換え後の数）を見る。
 *     - 0票: 判定なし（最多得票にもならないので通常どおり生存）。
 *     - 奇数票: 最多得票でも処刑されない（追放集合から外れる）。
 *     - 偶数票（1票以上）: 最多得票でなくても処刑される（追放集合に加わる）。死因は「拒絶」。
 *   判定は vote.js の resolveElimination が、追放フック（タフガイのはじき返し・人狼王の守り）の直後、
 *   呪殺・毒殺より前に呼ぶ（マイクラ版 applyToughGuyAndWolfKingToExecuted の中の位置と同じ）。
 *   拒絶は貫通ではない: 騎士・傭兵の護衛、従者・少佐・マティアスの身代わりで救われうる（通常の追放と同じ流れ）。
 *   逆に、拒絶で死亡が確定した相手は呪術の人狼・蛇の狂人の対象から外れる（死因は拒絶のまま。
 *   curse_wolf.js / snake_madman.js 側で parityRejectIds を見て読み飛ばす。マイクラ版 applyCurseWolfExecution）。
 *   パリティで生存した奇数人を呪術の人狼が最多得票で狙った場合は、通常どおり呪殺される（マイクラ版も同じ）。
 *   封印されている奇数人は判定が発動しない（マイクラ版 applyOddOneVoteOutcome の isSealedPlayerId 除外）。
 *   独裁処刑・クーデターでは判定しない（投票そのものが行われない。マイクラ版でも独裁時は実票が無く判定が走らない）。
 *   昼中に死亡している人は判定しない。妖狐投票（foxvote）では判定しない（本投票だけ。マイクラ版も同じ）。
 * ・追加勝利: 試合終了時の最終死亡者数（追放・連鎖死・昼中死亡・公爵会議の死者すべてを含む）が奇数なら、
 *   最終役職が奇数人の人が追加で勝利する（本人の生死は不問。死亡者0人は偶数なので敗北）。
 *   vote.js の set() が殉職者の直後で ONW.parityOne.extraWins を足す（勝てなかった恋人は除く。他の追加勝利と同じ）。
 *   葱の人狼のメンタル崩壊では勝利を失わない（negi_wolf.js の keepsWin。マイクラ版 protectedFromMentalLoss）。
 *   チキン・鶏の狂人の逆転後も set() を通るので、同じ条件で判定し直される（マイクラ版も保持リスト入り）。
 * ・封印: 封印の対象役職（info.sealTarget。マイクラ版 YAMINABE_SEAL_TARGET_ROLES に ODD_ONE が入っている）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / PERSONA_MASK_EXCLUDED_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   銀色の影 = 入る（groups "transform:silver_shadow": 36。多重人格 35 の次）/ 光の使徒・闇の化身 = 入らない /
 *   模倣 = できない（第三陣営）/ コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入る
 *   （マイクラ版 shufflerEligibleRoles の除外に ODD_ONE は無い）/ ペルソナ = 仮面候補に入る（除外リストに無い）。
 *   酔っ払い・墓荒らし・ドッペルゲンガー・コスプレイヤー（村人系のみなので対象外）・シャッフラー・銀色の影などで
 *   後から奇数人になった人も、最終役職で判定するので通常どおり働く。
 * ・ハッキング: 対象にも思い込み先にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
 *   受動役職で偽の夜情報は無い。思い込んでいるだけの人の票パリティは発動しない（最終役職で判定）。
 *   本物の奇数人が別の役職と思い込まされていても、最終役職が奇数人なら判定は通常どおり発動する。
 * ・見張り番: 夜に行動しないので「行動していない」扱い（lookout.js の PASSIVE_ONLY に登録済み。
 *   マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES）。エルフリンデの侵食票は奇数人から逸れない
 *   （elfrinde.js の EXEMPT に登録済み。マイクラ版 elfrindeVoteExemptRoles）。
 * ・シナジー: 奇数人固有のシナジーはマイクラ版に無いので追加しない。封印シナジーの対象には sealTarget で自動で入る。
 * ・CPU: 夜の行動なし（受動役職）。投票・CO は第三陣営の汎用処理に従う（専用ロジックなし）。
 * ・デバッグ: 選ぶ能力が無い受動役職なので専用の配線は不要（呪術の人狼と同じ扱い）。
 * ・実績（マイクラ版 stats.js / wiki-data.js）: first_odd_one「ただの数字」/ win_odd_one「奇数」。
 *   戦績ラベルは「死亡者が奇数で追加勝利した回数」/「死亡者が偶数で敗北した回数」（Web版は判定関数だけ）。
 * ・結果発表の演出（作者メモで一任された分）: 拒絶で死んだ人のカードは、めくれた直後に大きな赤い
 *   「拒絶」の判子が叩きつけられ、カードが震えて判子が残る（stageResult.flipped / css の gx-reject・gx-rejected。
 *   SE は独裁処刑と同じ se_dictator を打撃音として流用）。バッジ・状態は「拒絶」、字幕も「拒絶」グループで出す。
 *   パリティで生存した奇数人は通常どおりめくれずに残る（情報確認の行で理由が分かる）。
 * ・結果情報（情報確認。第6バッチ共通指示）: 判定が起きた人全員について、マイクラ版 executionOverrideLogs の文で出す
 *   （ONW.parityOne.lines → net.js の res.oddOnes → ui.js の「奇数人:」行）。
 *   拒絶の判定を受けたが護衛・身代わりで救われた人は「…でしたが、処刑されませんでした。」と出す（Web版の補足文）。
 *
 * 状態（vote.js の resolveElimination のたびに決め直す）:
 *   g.parityVote { プレイヤーID: { role, votes, verdict: "die" | "save" } } / g.parityRejectIds [拒絶で死ぬ人のID]
 */
(function (ONW) {
  const ID = "odd_one";

  /** 奇数人・偶数人の共通表（偶数人の役職定義は js/roles/neutral/even_one.js） */
  const PARITY = {
    odd_one: { name: "奇数人", dieOnEven: true, dieWord: "偶数", saveWord: "奇数" },    // 偶数票で拒絶死 / 奇数票で生存
    even_one: { name: "偶数人", dieOnEven: false, dieWord: "奇数", saveWord: "偶数" },  // 奇数票で拒絶死 / 偶数票で生存
  };

  function ensure(g) {
    if (!g.parityVote) g.parityVote = {};
    if (!g.parityRejectIds) g.parityRejectIds = [];
    return g;
  }

  const holders = (g, roleId) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === roleId).map((p) => p.id);

  /**
   * 投票パリティの確定（マイクラ版 applyOddOneVoteOutcome / applyEvenOneVoteOutcome）。
   * vote.js の resolveElimination が、最多得票と追放フックのあと・呪殺/毒殺より前に呼ぶ。
   * counts は tally の最終集計（書き換え後の実効得票数）。game.eliminated を直接書き換える。
   * 戻り値: game.parityRejectIds（拒絶で死ぬ人のID。呪殺・毒殺の読み飛ばし用）。
   */
  function applyVoteOutcome(g, counts) {
    ensure(g);
    g.parityVote = {}; g.parityRejectIds = [];
    if (!g || !g.players || !g.currentRoles || !counts) return g.parityRejectIds;
    if (g.dictator) return g.parityRejectIds;   // 独裁処刑・クーデターは投票ではない（判定しない）
    const gone = new Set(g.deadIds || []);      // 昼中に死亡している人は判定しない
    g.eliminated = g.eliminated || [];
    for (const roleId of Object.keys(PARITY)) {
      if (!ONW.ROLE_INFO || !ONW.ROLE_INFO[roleId]) continue;   // 移植済みの役職だけ（偶数人は移植後に自動で効く）
      const cfg = PARITY[roleId];
      (g.players || []).forEach((p) => {
        if (g.currentRoles[p.id] !== roleId) return;                       // 最終役職で判定
        if (gone.has(p.id)) return;
        if (ONW.seal && ONW.seal.is(g, p.id)) return;                      // 封印されている場合は発動しない
        const votes = counts[p.id] || 0;
        if (votes < 1) return;                                             // 0票は判定なし
        const die = (votes % 2 === 0) === cfg.dieOnEven;
        g.parityVote[p.id] = { role: roleId, votes, verdict: die ? "die" : "save" };
        if (die) {
          if (!g.eliminated.includes(p.id)) g.eliminated.push(p.id);
          if (!g.parityRejectIds.includes(p.id)) g.parityRejectIds.push(p.id);
        } else {
          g.eliminated = g.eliminated.filter((x) => x !== p.id);           // 最多得票でも処刑されない
        }
      });
    }
    return g.parityRejectIds;
  }

  /**
   * 追加勝利の判定（マイクラ版 applyThirdSpecials ほか）。
   * 奇数人: 最終死亡者数が奇数 / 偶数人: 生存者が偶数かつ1人以上。本人の生死は不問。
   */
  function extraWinsFor(g, roleId, deadSet) {
    const deadCount = deadSet ? deadSet.size : 0;
    if (roleId === "odd_one") {
      if (deadCount % 2 !== 1) return [];
    } else if (roleId === "even_one") {
      const alive = (g.players || []).length - deadCount;
      if (!(alive > 0 && alive % 2 === 0)) return [];
    } else return [];
    return holders(g, roleId);
  }
  const extraWins = (g, deadSet) => extraWinsFor(g, ID, deadSet);

  /** 結果情報（情報確認）。マイクラ版 executionOverrideLogs の文。nm は id → 名前。roleId を渡すとその役職の分だけ */
  function lines(g, nm, roleId) {
    const out = [];
    const rec = (g && g.parityVote) || {};
    (g.players || []).forEach((p) => {
      const r = rec[p.id]; if (!r) return;
      if (roleId && r.role !== roleId) return;
      const cfg = PARITY[r.role]; if (!cfg) return;
      const name = nm ? nm(p.id) : p.id;
      if (r.verdict === "die") {
        if ((g.eliminated || []).includes(p.id)) out.push(`${cfg.name} ${name} は自分への票数が${cfg.dieWord}だったため処刑されました。`);
        else out.push(`${cfg.name} ${name} は自分への票数が${cfg.dieWord}でしたが、処刑されませんでした。`);   // 護衛・身代わりで救われた場合（Web版の補足文）
      } else {
        out.push(`${cfg.name} ${name} は自分への票数が${cfg.saveWord}だったため処刑されませんでした。`);
      }
    });
    return out;
  }

  /** 実績（マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_odd_one");
    if (cur === ID && won) out.push("win_odd_one");
    return out;
  }

  const linesFor = (g, roleId, nm) => lines(g, nm, roleId);

  ONW.parityOne = { PARITY, ensure, holders, applyVoteOutcome, extraWins, extraWinsFor, lines, linesFor, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 176, name: "奇数人", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 61,
      desc: "自分への票が奇数だと票数にかかわらず生存し、自分への票が偶数だと票数にかかわらず死亡します（拒絶）。試合終了時の死亡者が奇数だと追加勝利です。" },
    groups: { "transform:silver_shadow": 36 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS。多重人格 35 の次）。光の使徒・闇の化身からは変化しない
    // 結果発表の演出: 拒絶で死んだカードに、大きな赤い「拒絶」の判子が叩きつけられる（めくれた直後、カードが震えて判子が残る）
    stageResult: {
      flipped: { order: 31, run(R, hs, at) {
        const hit = (hs || []).filter((h) => h.reject);
        if (!hit.length) return 0;
        const { later, paint, G, gx, P } = R;
        hit.forEach((h) => {
          later(() => { gx[P(h.id)] = "reject"; if (ONW.sound) ONW.sound.se("dictator"); paint(G()); }, at + 350);   // SE: 判子を叩く音（独裁処刑の打撃音を流用）
          later(() => { if (gx[P(h.id)] === "reject") { gx[P(h.id)] = "rejected"; paint(G()); } }, at + 1150);        // 判子が押されたまま残る
        });
        return 900;
      } },
      skip(R) { (R.res.history || []).forEach((h) => { if (h.reject) R.gx[`p:${h.id}`] = "rejected"; }); },   // スキップ時: 最初から判子が押された状態で見せる
    },
    achievements(g, id, won) { return achievements(g, id, won); },
  });
})(window.ONW);
