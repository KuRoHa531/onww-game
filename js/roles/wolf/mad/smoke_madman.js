/**
 * 煙幕の狂人（マイクラ版 SMOKE_MADMAN を参考）: 人狼陣営の「狂人系」。夜の能力はなく、人狼が誰かも分からない（狂人と同じ）。
 *   ・効果はひとつ: 待機時間の時点で、現世にいる（死亡していない）煙幕の狂人がいると、煙幕が焚かれる。
 *       - 画面がもくもくしはじめて、白い半透明の画面になる（カード・プレイヤー名の光る飾りは廃止）。
 *       - 待機時間の演出（スター・女王・フリーター・訪問者・観測・後覚者の公開など）が出なくなる。
 *       - 変化公開は出るが、それよりあとの演出（新聞・暴露・愉快犯の笑い声・麻婆豆腐・パン）は出ない。
 *       - 隠された基本情報（スター・人狼王・暴露・愉快犯・麻婆豆腐・パン・混沌新聞）は、情報確認にも載らない（「煙幕通知」の1行だけ載る。2026-11-07 変更）。
 *   ・封印されている煙幕の狂人は発動しない（マイクラ版 hasActiveSmokeAtDayStart の isSealedPlayerId）。
 *   ・酔っ払い（酔いが覚めていない）の煙幕の狂人は発動しない。昼に酔いが覚めたとき、その時点から煙幕が焚かれる（マイクラ版: 酔い覚め後の昼通知の再判定）。
 *   ・墓荒らし・ドッペルゲンガーで手にした煙幕の狂人は、最終盤面で持っていれば待機時間の時点で発動する。模倣の人狼が模倣している場合も発動する（マイクラ版 roleForMimicEffect）。
 *   ・人狼判定には数えない（狂人系の基本のまま）。勝敗は狂人系の基本のまま（勝利優先度に新しい行は要らない）。
 *
 * 実装の場所:
 *   ・登録: このファイル（info / groups）と index.html の <script>（1of4）
 *   ・煙幕の判定: このファイルの ONW.smoke（holders / settle / late）。待機時間の最後（settlePost）で判定し、酔っ払いの煙幕の狂人は酔い覚め（net.js の soberUp）で判定する（2of4）
 *   ・待機時間・昼の演出を飛ばす: js/net.js の toSettle（settle を quiet にして smoke を送る）・toDay（紙の待ち時間なし）・onMsg（news / expose / prankster / mapo / bread / starup / kingup / crownup / queenup は g.smokeOn のとき演出なしで情報だけ反映）（2of4）
 *   ・見た目（もくもく・白い半透明・縁と名前の光）: js/stage.js の stage.smoke / smokeSync と css/style.css の .smk-* / body.smoke-on（3of4）
 *   ・情報確認の「煙幕通知」: js/ui.js（2of4）
 *   ・ルールコード: js/settings.js（ONW78）
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない。重複役職: 特別な扱いなし。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に smoke_madman はすでに入っている（wiki の order 106）ので、末尾追加は不要。
 * 実装の進み具合は docs/smoke-madman.md を参照（1of4=登録 / 2of4=判定・演出を飛ばす / 3of4=見た目 / 4of4=総合・docs）。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE.SMOKE_MADMAN;
  /** 昼のはじめに死ぬことが決まっている席（すでに死亡・妖狐の呪殺とその連鎖・背徳者の発狂とその連鎖）。マイクラ版 preVoteDeadIds と同じ扱い: この席の煙幕の狂人は発動しない */
  function doomed(g) {
    const s = new Set(g.deadIds || []);
    [...(g.foxSettleIds || []), ...(g.foxPending || []), ...(g.madSettleIds || []), ...(g.madPending || [])].forEach((id) => s.add(id));
    [...(g.foxChainSettle || []), ...(g.madChainSettle || [])].forEach((e) => { if (e && e.id) s.add(e.id); });
    return s;
  }
  /** いま煙幕を焚ける煙幕の狂人（最終盤面で持っている・模倣の人狼の模倣先でもよい・酔いが覚めている・封印されていない・昼のはじめに死なない） */
  function holders(g) {
    const dead = doomed(g);
    return (g.players || []).filter((p) => ONW.mimic.eff(g, p.id) === R_() && !ONW.hiddenDrunk(g, p.id) && !(ONW.seal && ONW.seal.is(g, p.id)) && !dead.has(p.id));
  }
  const TEXT = "煙幕の狂人に煙幕を投げられたため、変化公開以外の昼の通知や演出が見えなくなりました。";
  ONW.smoke = {
    TEXT, holders,
    /** 煙幕が焚かれているか（待機時間の最後に決まる。酔っ払いの煙幕の狂人は酔い覚めから） */
    on: (g) => !!(g && g.smokeOn),
    /** 待機時間の最後（net.js の toSettle の settlePost）: 最終盤面で判定して g.smokeOn に入れる。戻り値: 煙幕が焚かれるか */
    settle(g) { g.smokeLate = false; g.smokeOn = holders(g).length > 0; return g.smokeOn; },
    /** クライアントへ送る「煙幕が焚かれた」メッセージ。hide = 詳細設定 [能力対象名隠し, 投票対象名隠し]（初期値OFF。クライアントが g.smokeHideAbility / g.smokeHideVote に入れる。js/stage.js の名前隠し・席のシャッフルが使う） */
    msg: (g, extra) => ({ t: "smoke", on: true, hide: [g.smokeHideAbility === true ? 1 : 0, g.smokeHideVote === true ? 1 : 0], ...(extra || {}) }),
    /** 昼のうち（酔いが覚めた直後）: まだ焚かれていなければ判定し、焚かれるなら全員へ smoke を送る（煙幕は一度焚かれたら昼のあいだ続く）。戻り値: 新しく焚かれたか */
    late(c) {
      const g = c.g;
      if (g.smokeOn || g.phase !== c.PH.ONLINE_DAY || !holders(g).length) return false;
      g.smokeOn = true; g.smokeLate = true;
      const m = ONW.smoke.msg(g, { late: true }); c.sendAll(m); c.sendSpec({ ...m, quiet: true });
      return true;
    },
  };
  ONW.defineRole("smoke_madman", {
    info: { sealTarget: true, deck: 100, name: "煙幕の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.698,
      desc: "人狼陣営（狂人系）。夜の能力はなく、人狼が誰かも分かりません。待機時間の時点で現世にいると煙幕を投げ、画面が白い煙に包まれます。変化公開以外の昼の演出・通知が見えなくなります（隠された基本情報は情報確認にも載りません）。封印されているときは発動しません。" },
    groups: { mad: 2.99, "transform:dark_avatar": 23 },
    /** 待機時間の最後（変化・模倣・CPUの後覚者がそろったあと）: 煙幕が焚かれるか決める。net.js の toSettle が、焚かれるなら settle を quiet にして smoke を送る */
    settlePost: { order: 90, run(c) { ONW.smoke.settle(c.g); } },
  });
})(window.ONW);
