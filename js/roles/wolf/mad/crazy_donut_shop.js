/**
 * 狂ったドーナツ屋（crazy_donut_shop）: 人狼陣営（狂人系）。マイクラ版 scripts の狂ったドーナツ屋を移植（第6バッチ・15役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / game.js processDonutShopDeliveries / isFunctioningCrazyDonutShop 準拠）:
 *   ・ドーナツ屋とほぼ同じ受動役職。夜の行動はない。昼開始時に、機能している狂ったドーナツ屋が
 *     「ドーナツ屋系全員を除く参加者」の共有プールからランダムな1人へ**粗悪なドーナツ**を届ける。
 *     届いた本人にだけ「粗悪なドーナツが届きました。」と通知される（パン屋と違い全員バナーではない）。
 *   ・配達の解決・共有プール・通知の保留/再送・結果情報は、ドーナツ屋側の共有コア `ONW.donut`
 *     （js/roles/village/donut_shop.js）がそのまま担う。違いは文面の品名だけ（KINDS の kind テーブル:
 *     donut_shop = 通常「ドーナツ」/ crazy_donut_shop = 粗悪「粗悪なドーナツ」）。
 *     昼開始時の解決フック（settlePre / settleMsg / stageSettle / soberReveal / dayNotice）は
 *     ドーナツ屋の役職定義にあり、全役職分が呼ばれる仕組み（ONW.roleHooks）なので、
 *     狂ったドーナツ屋しかいない試合でもドーナツ屋のフックが共有コアを回して届く。
 *   ・機能判定（マイクラ版 isFunctioningCrazyDonutShop）: 最終役職が狂ったドーナツ屋、または
 *     模倣の人狼が狂ったドーナツ屋を模倣している場合だけ機能する。クローンの思い込み・ペルソナの仮面・
 *     ハッキングの思い込みでは届けない。本物の狂ったドーナツ屋がハッキングされていても届ける
 *     （失敗通知だけ出さない）。プールはドーナツ屋と共有で、ドーナツは1人1回まで。送り主同士は受け取れない。
 *   ・封印されている・酔いが覚めていない送り主はその回は見送り、解けたときに遅れて届ける（共有コア側）。
 *   ・失敗通知はマイクラ版 notifyCrazyDonutShopFailure どおり「粗悪なドーナツを届ける相手が居ませんでした。」
 *     （ドーナツ屋の「ドーナツを届ける相手が居ませんでした。」とは文面が違う。共有コアの failText で出し分け）。
 *   ・結果情報（マイクラ版 donutResultLog。第6バッチ共通指示で情報確認にちゃんと出す）:
 *     「狂ったドーナツ屋{名前}は{対象}に粗悪なドーナツを届けていました。」/「…粗悪なドーナツを届けられませんでした。」
 *     （共有コアの lines がラベルを出し分け、res.donuts → ui.js「ドーナツ屋:」行にドーナツ屋と一緒に出る）。
 *   ・配達は詩人にだけ伝わる（共有コアが観測ログへ poetOnly で直接入れる。観測の人狼・鈴の巫女・龍の狂人・
 *     見張り番には伝わらない。ドーナツ屋と同じ）。
 *   ・実績（マイクラ版 stats.js / wiki）: first_crazy_donut_shop「ライバル店を潰せ」/
 *     win_crazy_donut_shop「粗悪品の流通成功」/ crazy_donut_shop_loss「返品はお断りです」の3種のみ
 *     （ドーナツ屋のような失敗・受け取り系の実績はマイクラ版に無い）。
 *   ・カウンセラーの更生対象（狂人系。groups.mad に入るため ONW.MAD_KIND に自動で入る。
 *     マイクラ版 isMadRole に狂ったドーナツ屋が含まれている）。
 * 演出（作者メモ: ドーナツ屋とほぼ同じ、粗悪なドーナツなだけ）: 届いた本人の画面にだけ 🍩 バナー
 *   「粗悪なドーナツが届きました」（ドーナツ屋と共通の stageSettle / ui.showDonut。本人だけ）。
 * 変化候補（マイクラ版で確認）: 闇の化身の変化先にのみ入る（TRANSFORM_ROLE_GROUPS の DARK_AVATAR リストで
 *   黒猫の次。Web版の並びは ROLE_ORDER 準拠で末尾 = 狂った煽動者の次）。光の使徒・銀色の影の対象外。
 *   コスプレイヤーの変化先には**入らない**（マイクラ版 cosplayerEligibleRoles は村人陣営のみで、
 *   ドーナツ屋は入っているが狂ったドーナツ屋は入っていない非対称をそのまま再現）。
 *   シャッフラーの山札に入る（マイクラ版 shufflerEligibleRoles の除外に無い。ドーナツ屋と同じ）。
 *   模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い。模倣した狂ったドーナツ屋も機能する）。
 *   ペルソナの仮面候補からも外れていない（PERSONA_MASK_EXCLUDED_ROLES に無い。被っても届けないのが原則）。
 * 封印対象: **ではない**（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っていない。ドーナツ屋と同じ。
 *   ただし送り主・受け取りの封印判定は共有コア側で効く）。
 *   カルメン・黄泉・鍵師の対象外（マイクラ版の各リストに無い）。
 * ハッキング: 対象にも思い込みの対象にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
 *   思い込んだ人は機能しない（共有コアの機能判定が最終役職ベースのため）。受動役職なので偽の夜結果はない。
 * CPU: 夜の行動はないので cpuNight は無い。配達は待機時間のフックで自動解決されるため CPU でも同じ。
 *   人狼陣営なので真COはしない（cpuClaim なし＝共通の騙り。狂った煽動者と同じ）。
 *   結果開示（COボタン）は人間用に coResult を用意する（マイクラ版のCOフォームは名乗った役職で
 *   品名が切り替わるため、kind は "crazydonut" として「粗悪なドーナツを届けました。」と言う）。
 * 状態: ドーナツ屋と共有（g.donutState / donutDelivered / donutKind / donutBySender / donutStatus /
 *   donutNoticeSent / donutPending / donutFailed / donutFailTold / donutLog。net.startGame の初期化・
 *   ホスト引き継ぎキーはドーナツ屋側で登録済み）
 */
(function (ONW) {
  const ID = "crazy_donut_shop";

  /** 実績（マイクラ版 stats.js / wiki の狂ったドーナツ屋の実績3種） */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID) out.push("first_crazy_donut_shop");
    if (fin === ID) out.push(won ? "win_crazy_donut_shop" : "crazy_donut_shop_loss");
    return out;
  }

  ONW.defineRole(ID, {
    info: { deck: 174, count: 0, name: "狂ったドーナツ屋", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.7008,
      desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。昼開始時に、ドーナツ屋・狂ったドーナツ屋を除くランダムなプレイヤー1人に粗悪なドーナツを届けます。届いた本人にだけ「粗悪なドーナツが届きました。」と通知されます。ドーナツは1人1回までしか受け取れず、ドーナツ屋系自身も受け取ることが出来ないため、届ける相手がいなかった場合は届けられません。封印されている・酔っ払いが覚めていない間は届けられず、解けたときに遅れて届けます。" },
    groups: { mad: 3.009, "transform:dark_avatar": 38 },   // 狂人系・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 121）で決まる
    achievements,
    // 結果開示(COボタン)の流れ: 届けました / 届けられませんでした（マイクラ版のドーナツ屋COフォーム。狂ったドーナツ屋は品名が「粗悪なドーナツ」になる）
    coResult: { kind: "crazydonut" },
  });
  ONW.crazyDonutShop = { achievements };
})(window.ONW = window.ONW || {});
