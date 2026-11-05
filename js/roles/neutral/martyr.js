/**
 * 殉職者（マイクラ版 MARTYR を参考）: 第三陣営。
 *   ・マイクラ版の説明文: 「第三陣営。最終的に死亡していれば追加勝利します。」
 *   ・夜・昼の能力なし（night / morning なし）。封印の対象役職ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っていない → info.sealTarget なし）。
 *   ・夜の情報（ONW.observeNote）も呼ばない → info.observe なし。
 *
 * 【1of4-a】箱（登録・陣営・説明文・並び・ルールコード）。【2of4-a】追加勝利の判定（下）を js/vote.js に実装した。
 *   実装の場所: vote.js determineWinnersCoreBase の set() 内 martyrWin（オポチュニストの次）/ 撃たれても失わない shotLoseIds / 神の祝福の勝者 martyrDirectExec / applyBomber・applyPrankster の例外
 *   従者の身代わり禁止: vote.js applyServantSubstitution・resolveChain の kill()、wolf_king.js、demon_duke.js、sheriff.js substituteOf。シャッフラー: DEATH_WIN・CPUの点数に追加
 *
 * 【仕様（マイクラ版。★は2of4-aで実装済み。依頼文 _wip/依頼文_殉職者_*.txt に詳細）】
 *   ・追加勝利: 最終盤面で殉職者を持っている人が、最終的に死亡していれば追加勝利（追放・夜の死・番犬の噛殺・道化の爆弾魔の爆殺・保安官の執行 など死因は問わない。マイクラ版 finalDeadIds）
 *   ・★ユーザー指定: 保安官の執行（kind "shot"）と、道化の爆弾魔の爆殺（kind "bomb"）で死んでも、勝利条件を失わず勝てる
 *       （普通の役職は撃たれる/爆殺されると勝利条件を失う。マイクラ版 sheriffDeathKeepsVictory / noVictoryIds の例外）
 *   ・神の祝福: 追放された殉職者でなければ（死んでいても）神の祝福では勝てない／神の祝福で敗北（実績「祝福に届かぬ殉職」）
 *   ・恨殺(執念の怨霊系)で死んだ殉職者は敗北しない（マイクラ版 grudge_kill の除外）
 *   ・保安官に撃たれる対象のとき、従者は殉職者の身代わりにならない（マイクラ版 servantSubstituteForSheriffTarget）
 *   ・CPU: マイクラ版では、てるてる坊主・一目惚れしてるてる・賞金稼ぎと同じ「死にたい役職」として扱う
 *
 * 【処理順】夜の能力は無い（night なし）ので docs/role-process-order.md の位置は不要。
 * 【勝利優先度】追加勝利（優先度の表の対象外。オポチュニスト・天邪鬼などと同じく、どの結果でも足される）。docs/victory-priority.md の履歴・docs/martyr.md を参照。
 * 実装の進み具合は _wip/依頼文_殉職者_*.txt と docs/martyr.md を参照。
 *  1of4: 登録・説明文・ロビー/ガイドの並び・ルールコード ONW72【このファイル。箱だけ】
 *  2of4-a: 追加勝利の判定（執行・爆殺でも勝てる）・神の祝福・従者の身代わり禁止・シャッフラーの扱い【vote.js ほか。_wip/martyrWinTest.js】
 *  3of4-a: CPU（js/cpu.js の AVOID_RESULT など）・結果発表の爆殺の文（vote.js applyBomber の loseNames/keepNames → ui.js / png.js）。恨殺はWeb版に恨み殺す役職が無いので未実装
 *  4of4-a: 実績ID（下の ONW.martyr.achievements）・端のケース（恋人・チキン）・総合。これで殉職者は一通り完了（残り: 恨殺 = Web版に恨み殺す役職が入ったとき）
 */
(function (ONW) {
  ONW.defineRole("martyr", {
    info: { deck: 94, name: "殉職者", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.97,
      desc: "第三陣営。最終的に死亡していれば追加勝利します。" },
    groups: { "transform:silver_shadow": 27 },   // 銀色の影の変化先（第三陣営の役職は必ずここに入れる）
  });

  /** 実績（wiki に定義済みの4つ。マイクラ版 stats.js と同じ条件）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ
   *  （保存側ができたら呼ぶ。道化の爆弾魔 ONW.bomber.achievements と同じ形）。won: その人が勝ったか。最終盤面の役職で判定する（first_martyr だけ最初に配られたカード）。
   *   ・first_martyr: 配られたカードが殉職者（初回かどうかは保存側が数える）  ・win_martyr: 殉職者で勝利
   *   ・martyr_survived: 殉職者で死なずに試合を終える  ・martyr_god_loss: 殉職者で神の祝福により敗北（神の祝福が起きて、勝てなかった） */
  ONW.martyr = {
    achievements(g, id, won) {
      const R = ONW.ROLE, out = [];
      if (g.initialRoles && g.initialRoles[id] === R.MARTYR) out.push("first_martyr");
      if (g.currentRoles && g.currentRoles[id] === R.MARTYR) {
        if (won) out.push("win_martyr");
        if (!ONW.vote.deadSet(g).has(id)) out.push("martyr_survived");
        if (g.godMode === "bless" && !won) out.push("martyr_god_loss");
      }
      return out;
    },
  };
})(window.ONW);
