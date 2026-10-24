/**
 * 道化の爆弾魔（jester_bomber・第三陣営）: 夜の能力なし。吊られると追加勝利し、自分に投票していた人を爆発させて敗北させる。
 *   マイクラ版（minecraftver.mcpack）の vote.js applyJesterBomberResult / includeJesterBomberExplosions を、Web版の勝敗判定・連鎖(vote.js)に合わせたもの。
 *   Web版独自: 爆発する人のカードが結果発表で爆発する演出（stage.js の爆殺の連鎖 + この役職の stageResult.bombFx。3of4）。
 *
 * 【仕様（マイクラ版と同じ）】
 *   ・最終盤面（現世。墓地ではなく誰かの席）で道化の爆弾魔を持っている人が、吊られて死んだ（game.executed に入った）とき、条件成立。
 *     例外: 番犬の噛殺（kind "bite"。追放ではない）で死んだときは爆発しない（マイクラ版でも噛殺は追放の一覧に入らない）。昼中の死亡（呪殺など。game.deadIds だけにいる人）も爆発しない。
 *   ・爆発する人 = 吊られた爆弾魔に投票していた人（game.votes の元の票。ペンギンの滑り・交換者の入れ替えの前の投票先）。
 *     マイクラ版には bomberSourceId（爆発させる相手を固定する記録）があるが、どこにも書き込まれていないので Web版には作らない（常に「投票していた人」）。
 *   ・爆発した人は「爆殺」で死亡し（vote.js resolveChain の kill(... "bomb")）、勝者から外れる（敗北）。爆弾魔本人は追加勝利（勝者に加わる）。
 *   ・爆殺された人は、道連れ・暗殺・賞金稼ぎの指名など連鎖の能力を発動させない（chain=false）。恋人の心中・従者の後追い等は kill() が自動で処理する。
 *
 * 【勝利優先度（正本: docs/victory-priority.md の「道化の爆弾魔の判定メモ」）】
 *   優先度の表には新しい行を作らない（追加勝利＋「爆殺された人は勝利条件を失う」。復讐者・オポチュニストなどの追加勝利と同じ扱い）。
 *   適用の順だけマイクラ版に合わせる: 通常の結果 → チキンの逆転 → 愉快犯 → 道化の爆弾魔（vote.applyBomber。determineWinners の最後）→ 生存したチキンの再逆転は爆殺を見たあとの最終盤面で行う。
 *
 * 【実績（wiki-data.js に定義済みの6つ）】4of4 で判定関数（ONW.bomber.achievements）を作る。
 *
 * 進み具合は docs/jester-bomber.md と _wip/依頼文_道化の爆弾魔_*.txt を参照。
 *   1of4 = 登録（役職ファイル・ルールコード ONW63・ロビー/ガイドの並び・wiki側の一覧）/ 2of4 = 爆殺と勝敗 / 3of4 = 爆発の演出・結果発表 / 4of4 = CPU・COボタン・実績・総合
 */
(function (ONW) {
  const B = {};
  const R = () => ONW.ROLE;

  /** 最終盤面で道化の爆弾魔のカードを持っている人のID（席順） */
  B.holders = (g) => (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === R().JESTER_BOMBER);

  /** 爆発のきっかけになる死因（game.chainKind）。直接の追放・処刑・独裁処刑（記録なし）・道連れ。
   *  心中(lovers)・無理心中(love)・番犬の噛殺(bite)・後追い(follow)・王国滅亡(queen)・爆殺(bomb。爆殺された爆弾魔がさらに爆発する連鎖はしない)は、追放ではないので爆発しない（マイクラ版も噛殺・後追いは「処刑された人」に入らない） */
  B.TRIGGER_KINDS = [undefined, "tomo"];   // 追放・処刑・独裁処刑（記録なし）と道連れだけ。心中(lovers)・無理心中(love)で死んだ爆弾魔は自爆しない（2026-10-17 ユーザー指定）

  /**
   * 爆殺（vote.js resolveChain が、連鎖の波がすべて終わったあと・王国滅亡の前に呼ぶ）。
   *   吊られて死んだ（done に入っていて、昼中の死亡 gone ではない）爆弾魔ごとに、その爆弾魔に投票していた人（game.votes の元の票）を kill(... "bomb", false) で爆殺する。
   *   すでに死んでいる人（同時に追放された人・昼中に死んだ人・先の連鎖で死んだ人など）は、爆発しない（爆発した人に数えない＝敗北もしない。2026-10-17 ユーザー指定）。
   * 記録: g.bombs = [{ bomber, ids: 爆発した人（投票していた全員）, killed: 今回新しく爆殺で死んだ人 }]（吊られた爆弾魔の席順。投票者がいなくても爆弾魔の分は入る = 追加勝利のため）
   */
  B.explode = function explode(g, { done, gone, kill, setSimul }) {
    g.bombs = [];
    const ck = g.chainKind || {}, votes = g.votes || {}, all = (g.players || []).map((p) => p.id);
    B.holders(g).forEach((b) => {
      if (!done.has(b) || gone.has(b)) return;                    // 吊られていない / 昼中に死んでいた
      if (!B.TRIGGER_KINDS.includes(ck[b])) return;               // 噛殺・後追い・王国滅亡・爆殺では爆発しない
      // 自爆する死因は「追放・処刑・独裁処刑・道連れ」だけ。メンタル崩壊・ショック死・とばっちり・クーデターは自爆しない（2026-10-17 ユーザー指定）
      const bounced = (g.toughBounces || []).some((t) => (t.to || []).includes(b));
      if ((g.mentalIds || []).includes(b) || (g.shockIds || []).includes(b) || bounced) return;
      if (g.dictator && g.dictator.target === b && g.dictator.coup) return;
      const ids = all.filter((v) => v !== b && votes[v] === b);   // この爆弾魔に投票していた人（元の票）
      if (setSimul) setSimul(new Set(ids));                        // 同じ爆発で同時に爆殺される従者は、ご主人の身代わりにならない（道連れの同時と同じ）
      const killedRaw = ids.filter((v) => kill(v, b, "bomb", false)); // すでに死んでいる人は false（killed に入らない）
      if (setSimul) setSimul(new Set());
      // 従者の身代わり: ご主人が爆殺されるところを従者が代わりに死んだ場合、死因は「身代わり」で、従者もご主人も「爆発した人」ではない（勝利条件は失われない）。
      //   身代わりになった従者は subs に記録する（結果発表の演出で、同時に爆発して「身代わり」でめくれる）
      const cs = g.chainSub || {}, kd = g.chainKind || {};
      const subOf = (v) => Object.keys(cs).find((s) => cs[s] === v && kd[s] === "bomb" && g.chainBy && g.chainBy[s] === b);
      const subs = ids.map(subOf).filter(Boolean);
      const blown = killedRaw.filter((v) => !subOf(v));   // 爆発した人 = 爆殺の時点でまだ生きていて、今回新しく死んだ人だけ（先に死んでいた人・同時に吊られた人は爆発しない＝敗北もしない）
      g.bombs.push({ bomber: b, ids: blown, killed: blown, subs });
    });
  };

  /** 爆発した人（爆殺の時点でまだ生きていて、爆殺で死んだ人。先に死んでいた人は含まない。吊られた爆弾魔自身は除く）: 勝者から外す */
  B.explodedIds = function explodedIds(g) {
    const hanged = (g.bombs || []).map((x) => x.bomber), out = [];
    (g.bombs || []).forEach((x) => x.ids.forEach((id) => { if (!hanged.includes(id) && !out.includes(id)) out.push(id); }));
    return out;
  };

  /** 吊られて追加勝利する爆弾魔（席順） */
  B.hangedIds = (g) => (g.bombs || []).map((x) => x.bomber);

  /** 実績（wiki に定義済みの6つ）。Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（保存側ができたら呼ぶ。抹消の人狼などの achievements と同じ形）。
   *  won: その人が勝ったか。最終盤面の役職で判定する。
   *   ・first_jester_bomber: 配られたカードが道化の爆弾魔（初回かどうかは保存側が数える）
   *   ・win_jester_bomber: 道化の爆弾魔で（吊られて追加勝利して）勝利
   *   ・bomber_with_village / _wolf / _third: 勝った爆弾魔と一緒に、その陣営の勝者（爆弾魔以外）がいる
   *   ・bomber_explode_all_others: 吊られた爆弾魔以外の全員が爆発した（他に最低1人いるとき） */
  B.achievements = function achievements(g, id, won) {
    const out = [];
    if (g.initialRoles && g.initialRoles[id] === R().JESTER_BOMBER) out.push("first_jester_bomber");
    const hanged = B.hangedIds(g);
    if (g.currentRoles && g.currentRoles[id] === R().JESTER_BOMBER && hanged.includes(id) && won) {
      out.push("win_jester_bomber");
      const T = ONW.TEAM, winners = (g.winnerIds || []).filter((w) => !hanged.includes(w));
      const teams = winners.map((w) => (ONW.ROLE_INFO[g.currentRoles[w]] || {}).team);
      if (teams.includes(T.VILLAGE)) out.push("bomber_with_village");
      if (teams.includes(T.WOLF)) out.push("bomber_with_wolf");
      if (teams.includes(T.THIRD)) out.push("bomber_with_third");
      const others = (g.players || []).map((p) => p.id).filter((x) => !hanged.includes(x)), blown = B.explodedIds(g);
      if (others.length && others.every((x) => blown.includes(x))) out.push("bomber_explode_all_others");
    }
    return out.filter((x, k) => out.indexOf(x) === k);
  };

  ONW.bomber = B;

  /** CPUの発言（てるてる坊主と同じ: 第三陣営の役職は名乗らず、必ず他の村役職を騙る） */
  function cpuClaim(k, g, p, r, i, c) {
    const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result;
  }

  ONW.defineRole("jester_bomber", {
    cpuClaim,
    cpuVoteScore: () => 1.0,   // 投票: 爆弾魔は吊られたいので、てるてる坊主と同じく評価点に少し足す
    info: { deck: 85, name: "道化の爆弾魔", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 36,
      desc: "第三陣営。夜の能力はありません。吊られる（追放される）と追加で勝利し、自分に投票していた人を爆発させて敗北させます。爆発した人のカードは、結果発表で爆発します。番犬に噛み殺されたときや、昼中に死んだときは爆発しません。" },
    groups: { "transform:silver_shadow": 25 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる）
  });
})(window.ONW);
