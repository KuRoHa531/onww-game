/** 新聞配達員: 最終盤面にいると、昼になって変化公開のあと、昨夜能力を使った役職の名前が新聞として全員に知らされる */
(function (ONW) {
  /** 新聞配達員（最終盤面で、酔いが覚めている人）がいるか */
  const holders = (g) => g.players.filter((p) => ONW.mimic.eff(g, p.id) === ONW.ROLE.NEWSPAPER && !ONW.hiddenDrunk(g, p.id) && !ONW.seal.is(g, p.id));

  /** 新聞: 昨夜能力を使った役職の名前（誰が使ったかは載らない）。戻り値: 役職名の配列（空 = 目立った動きなし）。新聞配達員がいない・すでに出したときは null */
  function announce(c) {
    const g = c.g;
    if (g.newsAnnounced || !holders(g).length) return null;
    g.newsAnnounced = true;
    g.newsLines = g.newsReal = ONW.utils.shuffle([...(g.newsRoles || [])]).map((r) => c.rn(r));   // 順番から使った人が割り出せないよう、並びはランダム（newsReal: ホスト自身の画面の newsLines が偽の新聞で上書きされても、本物を残す）
    return g.newsLines;
  }
  /** viewer の画面に出す新聞（銀狼にハッキングされた人の目線）。real: 本物の新聞の行（なければ null）。create: 偽の新聞を新しく出してよいか
   *  ・ハッキングされていない人: 本物のまま
   *  ・ハッキングされた人: 自分以外に本物の新聞配達員がいれば本物 / いなければ、新聞配達員と思い込んでいる人にだけ偽の新聞（1回だけ） / それ以外は何も出ない */
  function linesFor(g, viewer, real, create) {
    if (!ONW.hack || !ONW.hack.isFakeUi(g, viewer)) return real || null;
    if (real && holders(g).some((q) => q.id !== viewer)) return real;
    if (g.hackRole[viewer] !== ONW.ROLE.NEWSPAPER || ONW.seal.is(g, viewer)) return null;
    return ONW.hack.pub(g, viewer, "news", create);
  }
  /** 新聞を全員へ送る（ハッキングされた人にはその人の目線。偽の新聞だけなら他の人には何も出さず、昼も待たせない） */
  function sendNews(c, real, late) {
    const g = c.g;
    c.sendAll((p) => {
      const had = ONW.hack && ONW.hack.isFakeUi(g, p.id) && !!ONW.hack.pub(g, p.id, "news", false);
      const lines = linesFor(g, p.id, real, true);
      if (!lines || (had && !real)) return { t: "noop" };   // 偽の新聞は1回だけ
      return late ? { t: "news", lines, late: true } : { t: "news", lines };
    });
    if (real) c.sendSpec({ t: "news", lines: real, ...(late ? { late: true } : {}), quiet: true });
  }

  ONW.defineRole("newspaper", {
    info: { sealTarget: true, deck: 43, name: "新聞配達員", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 13,
      desc: "村人陣営。夜の能力はありません。最終盤面に新聞配達員がいると、昼になって変化公開のあと、昨夜能力を使った役職の名前が新聞として全員に知らされます（プレイヤー名は分かりません）。闇の化身・光の使徒・銀色の影は載りません。新聞は「情報確認」からいつでも見返せます。" },
    groups: { "transform:light_apostle": 16 },
    /** 昼の始まり(変化公開のあと): 新聞の紙を出す。戻り値: 紙が出終わるまでの待ち時間(ms)。出さないときは 0 */
    dayAnnounce(c) {
      const news = announce(c);
      sendNews(c, news, false);
      return news && ONW.stage && ONW.stage.newsMs ? ONW.stage.newsMs(news) : 0;
    },
    /** 昼のうちに、酔いの覚めた新聞配達員が最終盤面にいるのに新聞がまだ出ていなければ、その瞬間に新聞を出す（昼のタイマーは止めない） */
    dayNews(c) {
      const g = c.g;
      if (g.phase !== c.PH.ONLINE_DAY) return;
      sendNews(c, announce(c), true);
    },
    /** 再入室: 新聞の紙は出さず、情報確認にだけ反映 */
    resyncDay: { order: 20, run(c, seat) {
      const lines = linesFor(c.g, seat, c.g.newsReal, false);
      return lines ? [{ t: "news", lines, quiet: true }] : [];
    } },
  });
})(window.ONW);
