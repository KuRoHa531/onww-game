/** 新聞配達員: 最終盤面にいると、昼になって変化公開のあと、昨夜能力を使った役職の名前が新聞として全員に知らされる */
(function (ONW) {
  /** 新聞配達員（最終盤面で、酔いが覚めている人）がいるか */
  const holders = (g) => g.players.filter((p) => g.currentRoles[p.id] === ONW.ROLE.NEWSPAPER && !ONW.hiddenDrunk(g, p.id));

  /** 新聞: 昨夜能力を使った役職の名前（誰が使ったかは載らない）。戻り値: 役職名の配列（空 = 目立った動きなし）。新聞配達員がいない・すでに出したときは null */
  function announce(c) {
    const g = c.g;
    if (g.newsAnnounced || !holders(g).length) return null;
    g.newsAnnounced = true;
    g.newsLines = ONW.utils.shuffle([...(g.newsRoles || [])]).map((r) => c.rn(r));   // 順番から使った人が割り出せないよう、並びはランダム
    return g.newsLines;
  }

  ONW.defineRole("newspaper", {
    info: { deck: 43, name: "新聞配達員", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 13,
      desc: "村人陣営。夜の能力はありません。最終盤面に新聞配達員がいると、昼になって変化公開のあと、昨夜能力を使った役職の名前が新聞として全員に知らされます（プレイヤー名は分かりません）。闇の化身・光の使徒・銀色の影は載りません。新聞は「情報確認」からいつでも見返せます。" },
    groups: { "transform:light_apostle": 16 },
    /** 昼の始まり(変化公開のあと): 新聞の紙を出す。戻り値: 紙が出終わるまでの待ち時間(ms)。出さないときは 0 */
    dayAnnounce(c) {
      const news = announce(c);
      if (news) { const m = { t: "news", lines: news }; c.sendAll(m); c.sendSpec({ ...m, quiet: true }); }
      return news && ONW.stage && ONW.stage.newsMs ? ONW.stage.newsMs(news) : 0;
    },
    /** 昼のうちに、酔いの覚めた新聞配達員が最終盤面にいるのに新聞がまだ出ていなければ、その瞬間に新聞を出す（昼のタイマーは止めない） */
    dayNews(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      const news = announce(c);
      if (news) { const m = { t: "news", lines: news, late: true }; c.sendAll(m); c.sendSpec({ ...m, quiet: true }); }
    },
    /** 再入室: 新聞の紙は出さず、情報確認にだけ反映 */
    resyncDay: { order: 20, run(c) {
      return c.g.newsLines ? [{ t: "news", lines: c.g.newsLines, quiet: true }] : [];
    } },
  });
})(window.ONW);
