/** チキン */
(function (ONW) {
  ONW.defineRole("chicken", {
    // 結果発表の演出(stage.js の startResult が引く): チキンの逆転 — 逆転前の勝敗を先に発表 → チキンが飛び出して覆す
    stageResult: {
      reverse: { order: 10, run(R) {
        const { later, setCap, esc, paint, G, gx, P } = R, rv = R.res.reverse;
        if (!(rv && (rv.ids || []).length)) return;
        later(() => setCap(`<div class="rs-win t-${rv.fromTitle.startsWith("村人") ? "village" : rv.fromTitle.startsWith("人狼") ? "wolf" : "third"}">${esc(rv.fromTitle)}</div>`), R.t);
        R.t += 1000;
        later(() => setCap(`<svg class="rv-burst" viewBox="0 0 100 100" width="150" height="150"><polygon points="50.0,2.0 56.7,20.8 70.8,6.8 68.7,26.5 87.5,20.1 77.0,37.0 96.8,39.3 80.0,50.0 96.8,60.7 77.0,63.0 87.5,79.9 68.7,73.5 70.8,93.2 56.7,79.2 50.0,98.0 43.3,79.2 29.2,93.2 31.3,73.5 12.5,79.9 23.0,63.0 3.2,60.7 20.0,50.0 3.2,39.3 23.0,37.0 12.5,20.1 31.3,26.5 29.2,6.8 43.3,20.8" fill="#ffe14d" stroke="#222" stroke-width="3" stroke-linejoin="miter"/><text x="50" y="68" text-anchor="middle" font-size="58" font-weight="900" fill="#e02020" stroke="#222" stroke-width="1.5">!</text></svg>`), R.t);
        R.t += 1500;
        later(() => {
          rv.ids.forEach((id) => { gx[P(id)] = "chicken"; });
          setCap("");
          paint(G());
        }, R.t);
        R.t += 2800;
        later(() => { rv.ids.forEach((id) => { delete gx[P(id)]; }); setCap(`<div class="res-cap__t t-village">チキンが勝利を逆転させた！</div>`); paint(G()); }, R.t);
        R.t += 1800;
      } },
    },
    info: { deck: 42, name: "チキン", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 11,
      desc: "村人陣営。夜の能力はありません。1票でも入るとショック死（追放扱い）します。最後まで生き残っていると、村人陣営以外が勝つはずの結果を、村人陣営の逆転勝利に変えます（恋人になっている場合は逆転できません）。" },
    groups: { "transform:light_apostle": 15 },
  });
})(window.ONW);
