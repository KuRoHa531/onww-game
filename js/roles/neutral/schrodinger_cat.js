/** シュレディンガーの猫 */
(function (ONW) {
  const CAT = "schrodinger_cat";
  // 結果発表: めくれたあと、1票以上入っていれば、もう一度裏返って陣営の色の文字になる（村人陣営=緑 / 人狼陣営=赤 / 第三陣営の役職が参照先=灰色のまま「(+役職名)」/ どの陣営にもなれなければ灰色）
  const CAT_UP2 = 1300, CAT_EXTRA = 2300;   // 1回目にめくれてから裏に戻るまで / 裏に戻ってからもう一度めくれるまで（ここが 0.75秒のフリップより長ければ、ちゃんと裏返って見える）
  const catOf = (res) => new Map((res.cats || []).map((c) => [c.id, c]));
  const catFlips = (res, id) => { const c = catOf(res).get(id); return !!c && c.votes >= 1 && c.team !== "lover"; };   // 2回目に裏返る猫か（恋人の猫は恋人陣営なので裏返らない）
  const catFace = (c) => ({ team: c.team, sfx: c.team === "third" && c.finalRole ? `(+${ONW.roles.getInfo(c.finalRole).name})` : "" });
  const catLine = (c, esc) => c.team === "village" ? `<span class="t-village">村人陣営</span>になりました` : c.team === "wolf" ? `<span class="t-wolf">人狼陣営</span>になりました` : c.team === "third" ? `<span class="t-third">第三陣営（${esc(ONW.roles.getInfo(c.finalRole || "villager").name)}）</span>になりました` : "どの陣営にもなれませんでした";
  /** めくれた猫のカード id を at の時刻に裏へ戻し、少しあとでもう一度めくる。noFlip: 演出が重なる（処刑人のギロチンなど）ので、裏返さずに最初から陣営の色で見せる */
  function catFlip2(R, id, at, noFlip) {
    const { later, setCap, esc, paint, G, P } = R, c = catOf(R.res).get(id), k = P(id);
    if (!c) return;
    if (noFlip) { R.catv[k] = catFace(c); return; }
    later(() => { setCap(`<div class="res-cap__t t-third">シュレディンガーの猫</div><div>${esc(c.name)} に ${c.votes}票 入っていました…</div>`); delete R.up[k]; paint(G()); }, at);
    later(() => { R.catv[k] = catFace(c); R.up[k] = CAT; setCap(`<div class="res-cap__t t-third">シュレディンガーの猫</div><div>${esc(c.name)} は ${catLine(c, esc)}</div>`); paint(G()); }, at + CAT_EXTRA - 600);
  }
  ONW.defineRole("schrodinger_cat", {
    // 結果発表の演出(stage.js の startResult / skipResult が引く)
    //   flipped: 追放・道連れでめくれた猫 / rest: めくられずに残っていた猫（追放されなかった猫）/ skip: スキップ時は2回目の面で見せる
    stageResult: {
      flipped: { order: 20, run(R, hs, at) {
        const cats = hs.filter((h) => h.role === CAT && catFlips(R.res, h.id));
        cats.forEach((h) => catFlip2(R, h.id, at + CAT_UP2 + 200, R.noFlip.has(h.id)));   // ギロチンで割れるカードは裏返さない（最初から陣営の色）
        return cats.some((h) => !R.noFlip.has(h.id)) ? CAT_EXTRA : 0;
      } },
      rest(R) {
        R.rest.forEach(([k, r, hid], i) => {
          if (r !== CAT || !hid || !catFlips(R.res, hid)) return;
          const at = R.t + 500 + i * 320;
          catFlip2(R, hid, at + CAT_UP2 + 200, false);
          R.restEnd = Math.max(R.restEnd, at + CAT_UP2 + 200 + CAT_EXTRA + 400);
        });
      },
      skip(R) { (R.res.cats || []).forEach((c) => { if (c.votes >= 1 && c.team !== "lover") R.catv[`p:${c.id}`] = catFace(c); }); },   // 1票以上入っていれば、2回目の面（陣営の色）で見せる
    },
    info: { deck: 39, name: "シュレディンガーの猫", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 46,
      desc: "第三陣営。夜の能力はありません。投票のあと、自分に投票していた人の中からランダムに1人が選ばれ、その人の陣営になります（村人陣営・人狼陣営・第三陣営のどれか）。その陣営が勝利していれば追加で勝利します。1票も入らなかったときは、どの陣営にもなれず勝利できません。結果発表でカードがめくれたとき、1票以上入っていればもう一度裏返り、村人陣営なら緑、人狼陣営なら赤の文字の「シュレディンガーの猫」になります（第三陣営の役職の人が選ばれたときは灰色のまま、その役職名が付きます）。選ばれた人が別のシュレディンガーの猫なら、その猫の陣営を引き継ぎます（猫同士で選び合って堂々巡りになると、どの陣営にもなれません）。恋人になっている人は恋人陣営として扱われ、この能力は働きません。" },
    groups: { "transform:silver_shadow": 11 },
  });
})(window.ONW);
