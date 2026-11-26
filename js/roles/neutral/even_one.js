"use strict";
/**
 * even_one.js — 偶数人（第三陣営 / deck 177 / wiki order 178 / 発案: しらす・くろは）
 *
 * マイクラ版（scripts/state.js の ROLE_INFO[EVEN_ONE]、scripts/vote.js の applyEvenOneVoteOutcome /
 * evenOneSurvivorWinConditionMet / applyCurseWolfExecution / applyThirdSpecials ほか、
 * scripts/roles.js の YAMINABE_SEAL_TARGET_ROLES、scripts/stats.js の実績・戦績ラベル）を正とする。
 * 奇数人（odd_one）と仕組みが対なので、判定本体は共通コア ONW.parityOne（js/roles/neutral/odd_one.js）にあり、
 * このファイルは役職定義と実績だけを持つ（票パリティはコアが ROLE_INFO の登録を見て自動で判定する）。
 *
 * ・投票パリティ（受動・夜の行動なし）: 投票の解決時、最終役職が偶数人の人について、
 *   自分への実効得票数（tally の最終集計。煽動・ペンギン・交換者などの書き換え後の数）を見る。
 *     - 0票: 判定なし（通常の処刑結果に従う）。
 *     - 偶数票: 最多得票でも処刑されない（追放集合から外れる）。
 *     - 奇数票: 最多得票でなくても処刑される（追放集合に加わる）。死因は「拒絶」。
 *   処理位置・貫通しないこと・拒絶で死亡確定した相手が呪殺/毒殺の対象から外れること・
 *   封印中は発動しないこと・独裁処刑では判定しないこと・妖狐投票では判定しないことは、すべて奇数人と同じ
 *   （共通コア ONW.parityOne.applyVoteOutcome。vote.js の resolveElimination が呼ぶ）。
 * ・追加勝利: 試合終了時の生存者数が偶数（かつ1人以上）なら、最終役職が偶数人の人が追加で勝利する
 *   （本人の生死は不問。生存者0人は偶数だが敗北。マイクラ版 evenOneSurvivorWinConditionMet）。
 *   vote.js の set() が奇数人の直後で ONW.parityOne.extraWinsFor(game, "even_one", dead) を足す
 *   （勝てなかった恋人は追加勝利しない。他の追加勝利と同じ）。
 *   葱の人狼のメンタル崩壊では勝利を失わない（negi_wolf.js の keepsWin に登録済み。マイクラ版 protectedFromMentalLoss）。
 *   チキン・鶏の狂人の逆転後も set() を通るので、同じ条件で判定し直される（マイクラ版も保持リスト入り）。
 * ・封印: 封印の対象役職（info.sealTarget。マイクラ版 YAMINABE_SEAL_TARGET_ROLES に EVEN_ONE が入っている）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / PERSONA_MASK_EXCLUDED_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   銀色の影 = 入る（groups "transform:silver_shadow": 37。奇数人 36 の次）/ 光の使徒・闇の化身 = 入らない /
 *   模倣 = できない（第三陣営）/ コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入る
 *   （マイクラ版 shufflerEligibleRoles の除外に EVEN_ONE は無い）/ ペルソナ = 仮面候補に入る（除外リストに無い）。
 *   酔っ払い・墓荒らし・ドッペルゲンガー・シャッフラー・銀色の影などで後から偶数人になった人も、
 *   最終役職で判定するので通常どおり働く。
 * ・ハッキング: 対象にも思い込み先にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
 *   受動役職で偽の夜情報は無い。思い込んでいるだけの人の票パリティは発動しない（最終役職で判定）。
 *   本物の偶数人が別の役職と思い込まされていても、最終役職が偶数人なら判定は通常どおり発動する。
 * ・見張り番: マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES には奇数人は入っているが偶数人は入っていない（マイクラ版の非対称）。
 *   ただし偶数人は夜に行動しないので actionDone が付かず、結果として「行動していない」扱いになる（Web版も登録しないで一致）。
 *   エルフリンデの侵食票は偶数人から逸れない（elfrinde.js の EXEMPT に登録済み。マイクラ版 elfrindeVoteExemptRoles）。
 * ・シナジー: 偶数人固有のシナジーはマイクラ版に無いので追加しない。封印シナジーの対象には sealTarget で自動で入る。
 * ・CPU: 夜の行動なし（受動役職）。投票・CO は第三陣営の汎用処理に従う（専用ロジックなし）。
 * ・デバッグ: 選ぶ能力が無い受動役職なので専用の配線は不要（奇数人・呪術の人狼と同じ扱い）。
 * ・実績（マイクラ版 stats.js / wiki-data.js）: first_even_one「2人分の命」/ win_even_one「偶数」。
 *   戦績ラベルは「生存者が偶数(1人以上)で追加勝利した回数」/「生存者が奇数または0人で敗北した回数」（Web版は判定関数だけ）。
 * ・結果発表の演出: 奇数人と同じ判子演出を共有する。拒絶で死んだ人のカードは、めくれた直後に大きな赤い
 *   「拒絶」の判子が叩きつけられる（odd_one.js の stageResult フックが h.reject を見て全役職分を処理するので、
 *   このファイルに stageResult は持たない＝二重に鳴らさない）。バッジ・状態は「拒絶」、字幕も「拒絶」グループで出す。
 * ・結果情報（情報確認。第6バッチ共通指示）: 判定が起きた人全員について、マイクラ版 executionOverrideLogs の文で出す
 *   （ONW.parityOne.linesFor(g, "even_one", nm) → net.js の res.evenOnes → ui.js の「偶数人:」行）。
 *   拒絶の判定を受けたが護衛・身代わりで救われた人は「…でしたが、処刑されませんでした。」と出す（Web版の補足文。奇数人と同じ）。
 */
(function (ONW) {
  const ID = "even_one";

  /** 実績（マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_even_one");
    if (cur === ID && won) out.push("win_even_one");
    return out;
  }

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 177, name: "偶数人", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 62,
      desc: "自分への票数が偶数だと票数にかかわらず生存し、自分への票数が奇数だと票数にかかわらず死亡します（拒絶）。試合終了時の生存者が偶数だと追加勝利です。" },
    groups: { "transform:silver_shadow": 37 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS。奇数人 36 の次）。光の使徒・闇の化身からは変化しない
    // 拒絶の判子演出は odd_one.js の stageResult フック（h.reject で判定・役職不問）が担当するので、ここには持たない
    achievements(g, id, won) { return achievements(g, id, won); },
  });
})(window.ONW);
