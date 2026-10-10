/**
 * 保安官（村人陣営・昼能力）: 独裁者・交換者に続く「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を撃つ（1日1回）。
 *   マイクラ版（minecraftver.mcpack の main.js「保安官」）に合わせる。
 *
 * 【仕様（マイクラ版どおり。Web版にある役職の範囲）】
 *   ・夜の能力はない。使えるのは、最終盤面で保安官を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
 *   ・撃てるのは、生きている自分以外の人。
 *   ・撃った相手が「人外」（村人陣営でない / 狼憑き・狐憑き / 恋人がいる人 / シャッフラーつきの村人陣営）なら【執行】= 相手が死ぬ（勝利条件と投票権を失う）。
 *   ・村人陣営（白狼もここに含める）を撃つと【誤爆】= 保安官自身が死ぬ。
 *   ・執行と誤爆は、昼のあいだは死に方（kind "shot" 1つだけ）・札・チャット・情報確認・演出がすべて同じ（区別できない。カードには文字も札も付けず、銃痕とひびだけ）。結果発表のバッジ・字幕・履歴だけ「執行」「誤爆」「身代わり」を出す（ONW.sheriff.labelOf）。
 *   ・後追い・心中・王国滅亡などの連鎖は、本来発動すべきときに必ず発動する（net.killPlayer の連鎖 = ONW.deathFollowers に任せる）。
 *   ・【従者】執行されそうな人に、生きている従者がいれば、従者が身代わりに撃たれる（死に方は執行・誤爆と同じ "shot"）。従者本人を撃つときは身代わりなし。
 *     誤爆のときは従者は身代わりせず、保安官の従者は保安官の死を後追いする（ONW.sheriff.followsShot → state.js の deathFollowers）。
 *   ・人狼王: 他に生きている人狼判定がいれば、撃っても何も起きない（ガード）。
 *   ・ネコカボチャ: 撃つとネコカボチャが死に（shot）、そのあと保安官がネコカボチャの「道連れ」で死ぬ（kind "tomo"・身代わりなし）。**同時ではなく連鎖**（段 step 0 → 1）。
 *   ・シュレディンガーの猫（6of6）: 誰も死なない。最初に撃たれた猫は村人陣営に固定される（vote.resolveCats が g.sheriffCatFix を見る。マイクラ版 sheriffSpecialCatTeam）。固定済みなら何も起きない。
 *
 * 【段階】onww-sheriff-1of6 〜 6of6（_wip/保安官_依頼文_1of6.txt）
 *   1of6: 登録・ルールコード ONW45・判定の仕組み（ONW.sheriff.judge / record / followsShot）【済】
 *   2of6: 昼能力の操作（昼能力ボタン→カード選択→「撃つ」）・ホスト処理 hostSheriff・死亡 killPlayer "shot" と連鎖・再入室/ホスト引き継ぎ【済】
 *   3of6: 演出（撃たれたカードに銃痕とひび。カードはめくらない。昼中は裏面のまま。結果発表でめくれたあとも残る）【済】
 *   4of6: 結果発表・死因表示「撃たれた」・勝敗（撃たれた人は勝利条件を失う）・PNG・昼行動結果・役職情報【済】
 *   5of6a: CPU（撃つ判断・保安官の騙り・撃った後の発言・デバッグ指定）【済】
 *   5of6b: COボタン（保安官CO・結果開示「〇〇 を撃ちました。」）・CPUの投票判断（保安官COと撃ったという申告の真偽・撃たれて死んだ人の扱い）【済】
 *   6of6: ガイド/wiki・デバッグ指定・細かい例外・総合テスト（未着手）
 * 【4of6→変更】死因の文字は ONW.deathMarkOf("shot") = ONW.sheriff.labelOf = 「執行」/「誤爆」/「身代わり」（結果発表のバッジ・字幕・履歴の［執行］など。昼の札には出さない。「撃たれた」という文字・札はどこにも付けない）。
 *   勝敗: ONW.sheriff.lostIds(g)（死因 shot で、身代わりでない人）を vote.js の set() が基本勝敗・追加勝利のどちらからも外す。撃たれて死んだ神は神降臨にならない。
 *   結果発表: 昼行動結果に「保安官 A は B を撃ちました。」（hostSheriff が g.dayLogsAll へ） / 役職情報に撃った結果の文（res.sheriffs[].info。ONW.sheriff.flags.showOutcome=false で消せる）
 * 演出の仕組み（3of6）: net.js boardView() の各人に shot（deadKind が "shot"）→ 全員・観戦者・再入室に coboard で届く → stage.js sync が shot[k] / shotAnim[k] を決める
 *   → paint が席に class "shot"（銃痕とひびを常時表示。.tb-shot は tb-inner の外の兄弟要素なのでめくれても動かない）/ "shot-fire"（撃たれた瞬間だけ: 閃光・揺れ・銃痕が付く・ひびが走る）を付ける。
 *   shot-fire は stage が動き出したあとに新しく撃たれた席だけ（最初の同期＝再入室・観戦の途中参加は shot だけ）。連鎖で死ぬ人（心中・後追い・王国滅亡）は shot にならず従来の見た目。
 *
 * 状態: g.sheriffShots = [{ by, target, mode, victims, sub, followIds, keepVictory }, ...]（撃った順。試合ごとに net.startGame が [] に戻す）
 *   mode: "execute"(執行) | "misfire"(誤爆) | "pumpkin"(ネコカボチャ) | "guarded"(人狼王にガードされた) | "cat"(シュレディンガーの猫: 誰も死なず猫が村人陣営に固定) | "none"(固定済みの猫: 何も起きない)
 *   victims: 撃たれて死ぬ人のID（kind "shot"）。execute で従者が身代わりなら [従者]、misfire なら [保安官]、pumpkin なら [ネコカボチャ]。guarded / none は []。
 *   tomo: 撃たれた人の「道連れ」で、そのあとに死ぬ人のID（kind "tomo"。pumpkin のときだけ [保安官]）。勝利条件は撃たれた人と同じく失う（lostIds）。
 *   sub: 身代わりになった従者のID（なければ null） / keepVictory: 撃たれて死んでも勝利条件を失わない人（身代わりの従者）
 *   followIds: その死に従者が後追いする人（誤爆の保安官 / ネコカボチャの2人）。state.js の deathFollowers が followsShot() で見る。
 * 呼び出し: net.js の hostSheriff(ホスト・2of6) → ONW.sheriff.canUse / targets / judge / record。
 *   通信: クライアント act "dictopen"(昼能力ボタン) → ホストが canUse なら "sheriffok" → カード選択(stage.js mode "shoot") → ui.shootConfirm → net.shoot → act "shoot" → hostSheriff。
 *         撃ったら本人にだけ "sheriffdone"（画面を閉じて「使用済み」。執行か誤爆かは本人にも伝えない）。再入室は resyncMsgs が used なら sheriffdone を戻す。
 *   死ぬ順: record（followIds を先に記録）→ plan.victims を順に net.killPlayer(id, null, "shot")。死亡の知らせは情報確認だけ（NOTE.shot）で、チャットには出さない。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** この人が（もう）撃ったか */
  const used = (g, id) => (g.sheriffShots || []).some((e) => e.by === id);
  /** 保安官の昼能力を使える人か（最終盤面の役職が保安官・酔いが覚めている・生きている・まだ撃っていない・昼の議論中でタイマーが動いている・撃てる人がいる） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || g.currentRoles[id] !== R().SHERIFF) return false;
    if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
    return targets(g, id).length > 0;
  }
  /** 撃てる人（生きている自分以外） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => x !== id && !isDead(g, x));
  }

  /** シャッフラーのカードが乗っている人か（マイクラ版 hasShufflerBadge。シャッフラーつきの村人陣営は執行される） */
  const shufflerTagged = (g, id) => !!(g.shufflerMarks && g.shufflerMarks[ONW.cardAt(g, id)]);
  /** 撃たれたら執行される「人外」か（false なら誤爆）。順番はマイクラ版どおり: 狼憑き・狐憑き → 恋人がいる人 → シャッフラーつきの村人陣営 → 白狼は村人陣営扱い → 村人陣営でなければ人外 */
  function isHit(g, id) {
    const r = R(), role = g.currentRoles[id], info = ONW.ROLE_INFO[role];
    if (!info) return false;
    if (role === r.WOLF_MARKED || role === r.FOX_MARKED) return true;
    if (ONW.isLover(g, id)) return true;
    if (shufflerTagged(g, id) && info.team === ONW.TEAM.VILLAGE) return true;
    if (role === r.WHITE_WOLF) return false;   // 白狼は村人陣営と同じ扱い（誤爆。マイクラ版 targetIsSheriffFailureRole）
    return info.team !== ONW.TEAM.VILLAGE;
  }
  /** 執行されそうな人の身代わりになる従者のID（なければ null）。従者本人を撃つときは身代わりなし。生きている・恋人でない従者だけ（追放の身代わり vote.applyServantSubstitution と同じ条件） */
  function substituteOf(g, target) {
    const r = R();
    if (g.currentRoles[target] === r.SERVANT) return null;
    const pair = ONW.servantPairs(g).find(([s, m]) => m === target && s !== target && !isDead(g, s) && !ONW.isLover(g, s));
    return pair ? pair[0] : null;
  }

  /**
   * 撃った結果を決める（状態は変えない）。by が target を撃ったとき、誰がどう死ぬか。
   * 戻り値: { by, target, mode, victims, sub, followIds, keepVictory }（意味は上の「状態」を見ること）
   *   mode と victims だけ見れば、執行(execute)と誤爆(misfire)の違いが分かる。画面・チャット・情報確認では区別しないこと。
   */
  function judge(g, by, target) {
    const r = R(), role = g.currentRoles[target];
    const out = { by, target, mode: "none", victims: [], tomo: [], sub: null, followIds: [], keepVictory: [] };
    // 人狼王: 他に生きている人狼判定がいればガード（追放と同じ ONW.kingProtected）。撃っても何も起きない
    if (ONW.kingActive && ONW.kingActive(g, target) && ONW.kingProtected(g, target, new Set(g.deadIds || []), new Set([target]))) { out.mode = "guarded"; return out; }
    // ネコカボチャ: 撃つと保安官もネコカボチャも死ぬ（身代わりなし）
    // 【連鎖化】同時には死なない: ネコカボチャが撃たれて死ぬ(shot) → 保安官はネコカボチャの「道連れ」で、そのあとに死ぬ(tomo。net.js hostSheriff が段をずらして殺す)。保安官の従者はこれまでどおり後追いする
    if (role === r.CAT_PUMPKIN && !ONW.hiddenDrunk(g, target)) { out.mode = "pumpkin"; out.victims = [target]; out.tomo = [by]; out.followIds = [target, by]; return out; }
    // シュレディンガーの猫（6of6・マイクラ版 sheriffSpecialCatTeam）: 誰も死なない。1回目に撃つと、猫は村人陣営に固定される（投票した人の陣営に決まる通常の仕組みより優先。恋人の猫は恋人陣営のまま）。固定済みの猫を撃っても何も起きない
    if (role === r.SCHRODINGER_CAT) { if (!catFixed(g, target)) { out.mode = "cat"; out.catFix = true; } return out; }
    if (isHit(g, target)) {
      out.mode = "execute";
      const sub = substituteOf(g, target);
      if (sub) { out.sub = sub; out.victims = [sub]; out.keepVictory = [sub]; }   // 従者が身代わりに撃たれる（勝利条件は失わない）。ご主人は無傷
      else out.victims = [target];
      return out;
    }
    out.mode = "misfire";            // 村人陣営（白狼含む）を撃った: 保安官が死ぬ。従者は身代わりせず、保安官の従者が後追いする
    out.victims = [by]; out.followIds = [by];
    return out;
  }
  /** 保安官に撃たれて陣営が村人陣営に固定された猫か（g.sheriffCatFix[猫の持ち主] = 撃った保安官のID。vote.resolveCats が見る） */
  const catFixed = (g, id) => !!(g.sheriffCatFix && g.sheriffCatFix[id]);
  /** 撃ったことを記録する（net.js の hostSheriff が judge の結果を渡す）。同じ保安官が2回は記録しない。戻り値: 記録した e（すでに撃っていれば null） */
  function record(g, plan) {
    if (!plan || used(g, plan.by)) return null;
    (g.sheriffShots = g.sheriffShots || []).push(plan);
    if (plan.catFix) (g.sheriffCatFix = g.sheriffCatFix || {})[plan.target] = plan.by;   // 猫の陣営固定（撃たれた猫は村人陣営）
    return plan;
  }
  /** 保安官の死に従者が後追いするか（state.js の deathFollowers が kind "shot" / ネコカボチャの道連れ "tomo" のとき呼ぶ）。誤爆の保安官・ネコカボチャで死んだ2人だけ。執行された人は身代わりが立つので後追いしない */
  function followsShot(g, id) {
    return (g.sheriffShots || []).some((e) => (e.followIds || []).includes(id));
  }
  /** 結果発表用（4of6）: 撃った順 [{byId, by, targetId, target, mode, victims, subId, sub}] */
  function view(g, nm) {
    return (g.sheriffShots || []).map((e) => ({ byId: e.by, by: nm(e.by), targetId: e.target, target: nm(e.target), mode: e.mode, victims: e.victims.slice(), subId: e.sub, sub: e.sub ? nm(e.sub) : null }));
  }

  /**
   * 【勝敗・4of6】撃たれて死んで「勝利条件を失う」人のID（マイクラ版 noVictoryIds）。死因が kind shot の人（執行された人・誤爆した保安官・ネコカボチャの2人）。
   *   身代わりで撃たれた従者（keepVictory）は勝利条件を失わない（マイクラ版 preserveVictoryIds）ので含めない。
   *   vote.js の determineWinnersCoreBase が、この人たちを基本勝敗・追加勝利のどれでも勝者から外す（優先度の表に新しい行は作らない）。
   */
  function lostIds(g) {
    const keep = new Set((g.sheriffShots || []).flatMap((e) => e.keepVictory || []));
    const tomo = new Set((g.sheriffShots || []).flatMap((e) => e.tomo || []));   // ネコカボチャを撃った保安官（道連れで死ぬ）も、撃たれたときと同じく勝利条件を失う
    return Object.keys(g.deadKind || {}).filter((id) => (g.deadIds || []).includes(id) && !keep.has(id) && (g.deadKind[id] === "shot" || (g.deadKind[id] === "tomo" && tomo.has(id))));
  }
  /** 結果発表「昼行動結果」の1行（撃った瞬間に net.js hostSheriff が g.dayLogsAll へ足す。誰が誰を撃ったかだけ。執行か誤爆かは書かない） */
  function actText(byName, targetName) {
    return `${ONW.roles.getInfo(R().SHERIFF).name} ${byName} は ${targetName} を撃ちました。`;
  }
  /** 結果発表の「役職情報」に出す、撃った結果の文（ゲームが終わったあとの情報）。false にすると役職情報の行を出さない（昼行動結果の「撃ちました」だけが残る） */
  const flags = { showOutcome: true };
  /** 結果発表用（4of6）: 撃った順 [{ by, target, act, info }]。act = 昼行動結果と同じ文 / info = 役職情報の文（flags.showOutcome が false なら空） */
  function lines(g, nm) {
    return (g.sheriffShots || []).map((e) => {
      const by = nm(e.by), tg = nm(e.target), sub = e.sub ? nm(e.sub) : "";
      const lose = "勝利条件と投票権を失いました";
      let info = "";
      if (e.mode === "execute" && e.sub) info = `${tg} は村人陣営ではない人でしたが、従者 ${sub} が身代わりに撃たれました（${tg} は無傷・${sub} は勝利条件を失いません）。`;
      else if (e.mode === "execute") info = `${tg} は村人陣営ではない人でした。${tg} が撃たれ、${lose}。`;
      else if (e.mode === "misfire") info = `${tg} は村人陣営でした。${by} が撃たれ、${lose}。`;
      else if (e.mode === "pumpkin") info = `${tg} はネコカボチャでした。${tg} が撃たれ、道連れで ${by} も死に、2人とも${lose}。`;
      else if (e.mode === "guarded") info = `${tg} は他に人狼判定の人がいる人狼王だったため、何も起きませんでした。`;
      else if (e.mode === "cat") info = `${tg} はシュレディンガーの猫でした。誰も死なず、${tg} は村人陣営に固定されました。`;
      else info = `${tg} はシュレディンガーの猫でしたが、すでに村人陣営に固定されていたため、何も起きませんでした。`;
      return { by, target: tg, act: actText(by, tg), info: flags.showOutcome ? info : "" };
    });
  }

  /** 結果発表（ゲームが終わったあと）に出す死因の文字（マイクラ版 vote.js の [執行] / [誤爆] / [身代わり] に合わせる）。
   *  撃たれた相手（人外・ネコカボチャ）= 「執行」 / 誤爆した保安官・ネコカボチャを撃った保安官 = 「誤爆」 / 身代わりになった従者 = 「身代わり」。
   *  昼のあいだはカードに文字も札も出さない（銃痕とひびだけ）。この文字が出るのは結果発表のバッジ・字幕・履歴だけ。 */
  function labelOf(g, id) {
    const shots = g.sheriffShots || [];
    if (shots.some((e) => e.sub === id)) return "身代わり";
    const hit = shots.find((e) => (e.victims || []).includes(id));
    if (!hit) return "執行";
    return hit.by === id ? "誤爆" : "執行";
  }
  ONW.sheriff = { canUse, targets, used, catFixed, isHit, substituteOf, judge, record, followsShot, view, lostIds, actText, lines, flags, labelOf };

  // ======================================================================
  // 【CPU・5of6a】マイクラ版 main.js / cpu.js の保安官CPU（撃った相手を「〇〇を撃ちました」と言う）に合わせる。
  //   ・本物の保安官CPU: 昼に必ず「保安官CO」（cpuClaim）。
  //   ・撃つ判断（cpuPick）: 自分が見て「確実に人外」と分かっている人（夜に知った役職が村人陣営でない）がいるときだけ撃つ。分からないまま撃つと村人陣営に当たって自分が死ぬ（誤爆）ので、
  //     手がかりがなければ撃たない（誤爆の怖さ）。撃つ時刻は昼の途中でばらける（net.js cpuSheriff）。デバッグで今すぐ撃たせたいときは「昼能力」タブでリアルタイムに発動する（ONW.net.debugDayAbility。事前指定は廃止）。
  //   ・撃った後（cpuSpeak）: 死んでいなければ「〇〇を撃ちました。」と言う（誤爆・ネコカボチャで自分が死ぬときは言わない）。
  //   ・騙り（cpuLie）: 人外のCPUが、ごくまれに「保安官CO」だけする（結果は言わない。撃ったと嘘をつくと、誰も撃たれていないのですぐ分かるため）。
  // ======================================================================
  /** 「〇〇を撃ちました。」（CPUの発言・5of6b の COボタンの結果開示と同じ文言） */
  const shotText = (name) => `${name} を撃ちました。`;
  /** CO一覧に出す短い結果 */
  const shotShort = (name) => `${name} を撃った`;
  /** 撃てば執行される人外と、役職から言えるか（CPUが知っている役職で判断する）。白狼は村人陣営扱い・ネコカボチャ（保安官も死ぬ）・シュレディンガーの猫（何も起きない）・人狼王（ガードされることがある）は、撃っても効果がないか危ないので狙わない */
  function cpuKnownHit(role) {
    const r = R(), info = role && ONW.ROLE_INFO[role];
    if (!info) return false;
    if ([r.WHITE_WOLF, r.CAT_PUMPKIN, r.SCHRODINGER_CAT, r.WOLF_KING].includes(role)) return false;
    return info.team !== ONW.TEAM.VILLAGE;
  }
  /** CPUの保安官が、いま撃つ相手のID（なければ null）。撃てるか（canUse）・自分を保安官だと思っているか・確実に人外と分かっている人がいるか。人狼と分かっている人を先に狙う */
  function cpuPick(k, g, p) {
    if (!canUse(g, p.id)) return null;
    const me = g.drunkOverlay && g.drunkOverlay[p.id] ? ONW.shownRole(g.currentRoles[p.id]) : k.selfRole(g, p);   // 酔いが覚めたCPUは、最終役職を保安官だと分かっている
    if (me !== R().SHERIFF) return null;
    const i = k.infoOf(g, p.id), mates = ONW.loverMates(g, p.id);
    const sure = targets(g, p.id).filter((t) => !mates.includes(t) && cpuKnownHit(i.known[t]));   // 恋人の相方は撃たない（自分の勝利条件に響く）
    if (!sure.length) return null;
    const wolves = sure.filter((t) => k.isWolf(i.known[t]));
    return k.pick(wolves.length ? wolves : sure);
  }
  /** 撃ったあとのCPUの発言（net.js hostSheriff が、撃ったのがCPUで生きているときに呼ぶ）。[{ p, text, short, result, claim, gap }]（CPUの発言キュー形式） */
  function cpuSpeak(k, g, p, plan) {
    if (!plan || (plan.victims || []).includes(p.id) || (plan.tomo || []).includes(p.id)) return [];   // 誤爆・ネコカボチャ（道連れ）で自分が死ぬときは話さない
    const nm = k.nameOf(g, plan.target);
    return [{ p, text: shotText(nm), short: shotShort(nm), result: true, claim: { kind: "sheriff", target: plan.target }, gap: 3500 }];
  }
  Object.assign(ONW.sheriff = ONW.sheriff || {}, { shotText, shotShort, cpuKnownHit, cpuPick, cpuSpeak });

  // ======================================================================
  // 【COボタン・投票判断・5of6b】
  //   ・COボタン: 「役職CO」で保安官を選ぶと「保安官CO」だけで終わる（撃つ前にCOできる。coResult.noChain）。撃ったあとに「結果開示」を押すと、撃った相手を1人選んで「〇〇 を撃ちました。」
  //     （CPUの cpuSpeak と同じ文言・同じ claim { kind:"sheriff", target }。net.js hostRecv "co" が cpuClaims に残す）。
  //   ・CPUの投票判断（cpuVoteSee: cpu.js scoreVote が全員の分を足す）: 「撃ちました」という申告は、撃たれた人が全員に見えている（情報確認の「〇〇 が撃たれました」）ので真偽が分かる。
  //       本物らしい = 申告の相手が撃たれて死んでいる（執行された）→ 村人側は票を避ける（-3） / 嘘らしい = 相手が撃たれて死んでおらず別の死に方・保安官COしていた人（誤爆した本物かもしれない）・
  //       生きている（ガード・猫・従者の身代わりの可能性もあるので弱め） → 村人側は票を寄せる。
  //       保安官COだけで結果がない人: 誰かが撃たれたあとなら少し疑う（本物なら言うはず）。まだ誰も撃たれていなければ少し避ける。
  //       自分が本物の保安官のCPUは、保安官のカードが1枚だけの配役なら、ほかの保安官COは偽物として強く狙う。
  //       撃たれて死んだ（執行された）ことが本物らしい人は人外なので、その人が占い師COで出した結果は嘘 → 「人狼」と言われた人は疑いを弱め、「村人側」と言われた人は少し疑う。
  //     人外側（人狼・狂人など）のCPUは重みを小さくする（本物の保安官を狙うほどの理由はない）。
  // ======================================================================
  const coOfPlayer = (g, id) => (g.coBoard && g.coBoard[id] && g.coBoard[id].co) || null;
  const isShotDead = (g, id) => (g.deadIds || []).includes(id) && (g.deadKind || {})[id] === "shot";
  /** 公開された「撃ちました」の申告 [{ from, target }]（人間のCOボタン・CPUの発言） */
  const shotClaims = (g) => (g.cpuClaims || []).filter((c) => c.kind === "sheriff" && c.target);
  /** 申告の真偽: "ok"(相手が撃たれて死んだ=本物らしい) / "lie"(別の死に方・撃たれて死んだ人が自分も保安官COしていた=誤爆した本物かも) / "doubt"(相手は生きていて、ほかに撃たれた人がいる) / "unknown"(誰も撃たれていない: ガード・猫の可能性) */
  function claimJudge(g, c) {
    const t = c.target;
    if (isShotDead(g, t)) return coOfPlayer(g, t) === "sheriff" ? "lie" : "ok";
    if ((g.deadIds || []).includes(t)) return "lie";
    return (g.deadIds || []).some((id) => isShotDead(g, id)) ? "doubt" : "unknown";
  }
  /** 撃たれて執行されたことが本物らしい人のID（"ok" の申告の相手） */
  const confirmedHits = (g) => new Set(shotClaims(g).filter((c) => claimJudge(g, c) === "ok").map((c) => c.target));
  /** 配役にある保安官のカード枚数（配られた分 + 墓地） */
  const sheriffCards = (g) => [...Object.values(g.initialRoles || {}), ...(g.center0 || g.center || [])].filter((r) => r === R().SHERIFF).length;
  /** CPUの投票の評価点への加点（q = 投票先の候補。p = 投票するCPU。wolfSide = p が人外側）。保安官に関係がなければ 0 */
  function cpuVoteSee(k, g, p, q, i, me, wolfSide) {
    const claims = shotClaims(g), co = coOfPlayer(g, q.id);
    if (!claims.length && co !== "sheriff") return 0;
    let s = 0;
    const anyShot = (g.deadIds || []).some((id) => isShotDead(g, id));
    if (co === "sheriff") {
      const mine = claims.filter((c) => c.from === q.id);
      if (me === R().SHERIFF && q.id !== p.id && sheriffCards(g) < 2) s += 12;   // 自分が本物（カードは1枚だけ）なので、ほかの保安官COは偽物
      else if (!mine.length) s += anyShot ? (wolfSide ? 0.3 : 1.2) : (wolfSide ? -0.2 : -0.6);
      else mine.forEach((c) => {
        const j = claimJudge(g, c);
        s += j === "ok" ? (wolfSide ? 0 : -3.0) : j === "lie" ? (wolfSide ? 0.4 : 3.5) : j === "doubt" ? (wolfSide ? 0.2 : 1.0) : (wolfSide ? 0 : 0.5);
      });
    }
    const hits = confirmedHits(g);
    if (hits.size) (g.cpuClaims || []).filter((c) => c.kind === "seer" && hits.has(c.from) && c.target === q.id).forEach((c) => {   // 執行された人は人外 → その人の占い結果は嘘
      if (k.WOLF_LIKE().includes(c.role)) s -= wolfSide ? 0.3 : 2.0;
      else s += wolfSide ? -0.2 : 0.8;
    });
    return s;
  }
  Object.assign(ONW.sheriff, { shotClaims, claimJudge, confirmedHits, cpuVoteSee });

  ONW.defineRole("sheriff", {
    info: { deck: 67, name: "保安官", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.97,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を撃ちます。村人陣営でない人を撃つと、その人は死に、勝利条件と投票権を失います。村人陣営を撃ってしまうと、死ぬのは保安官自身です。どちらの場合も、昼のあいだは周りからは同じ「撃たれた」としか見えません（カードには銃痕とひびだけ）。結果発表で「執行」か「誤爆」かが分かります。シュレディンガーの猫を撃っても誰も死にませんが、その猫は村人陣営に固定されます（人狼王にガードされた場合などは何も起きません）。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に保安官を持っている人が使えます。" },
    groups: { "transform:light_apostle": 28 },   // 光の使徒の変化先（村人系）
    // CPU（5of6a）: 本物は必ず「保安官CO」。騙りは低い確率で「保安官CO」だけ（結果なし。claim を書かないと、村人が配役にいるとき「村人CO」に置き換わってしまう）
    cpuClaim(k, g, p, r, i, c) { c.co = "sheriff"; },
    cpuLie: { role: "sheriff", weight: 2, order: 12, claim: () => ({ co: "sheriff", result: null }) },
    cpuPick,
    cpuSpeak,
    cpuVoteSee,   // CPUの投票判断（cpu.js scoreVote が全役職のフックを足す）
    // 結果開示(COボタン・co.js が kind で引く): 「保安官CO」だけで終わらせられる(noChain)。結果開示で撃った相手を選ぶ → 「〇〇 を撃ちました。」
    coResult: {
      kind: "sheriff", targetLabel: "撃った相手", noChain: true,
      pickPlayer: (id, K) => [shotText(K.nameOf(id)), { kind: "sheriff", target: id }, null, "disclose", shotShort(K.nameOf(id))],
    },
  });
})(window.ONW);
