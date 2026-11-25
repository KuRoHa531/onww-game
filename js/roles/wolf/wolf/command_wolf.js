/**
 * command_wolf.js — 統率の人狼（人狼陣営 / deck 131 / 発案: くろは / 元ネタ: オリジナル）
 *
 * マイクラ版（scripts/night.js の commandWolfVisibleInfo / openCommandWolfAction、state.js の ROLE_INFO、
 * utils.js の isRealWolfRole / isMadRole）と Wiki（order 88）を正とする。作者（くろはさん）の依頼メモ（2026-11-25）:
 * 「夜に相方がめくれるタイミングで、狂人や他の人狼・妖狸・スパイなどが一斉にめくれる。相方も狼マークではなく、ちゃんと役名で」。
 *
 * ・夜の能力は「見るだけ」（対象選択なし）。夜の始まりに、他の参加者のうち
 *     - 最終役職が本物の人狼系（ONW.WOLF_KIND。一匹狼・模倣の人狼も含む）
 *     - 初期役職が一匹狼
 *     - 初期役職が狂人系（ONW.MAD_KIND）
 *     - 最終役職がスパイ / 妖狸
 *   の人が「統率情報」として分かり、そのカードが役職名の面で一斉にめくれる（相方の人狼も🐺ではなく役名）。
 *   表示する役職名は、狂人系と一匹狼は「初期役職」、それ以外は「最終役職」（マイクラ版 commandWolfVisibleInfo どおり）。
 *   墓地の役職は見えない。自分のカードは対象外。
 *   ※Web版は夜の始まりに全員ぶんの夜情報を作る構造なので、その時点では最終役職＝初期役職。
 *     朝の連鎖（墓荒らし・ドッペル）で手にしたときと、昼の酔い覚めでは、その時点の最終役職で組み直す。
 * ・勝利条件は通常の人狼陣営（追加勝利・単独勝利なし）。占い結果は「統率の人狼」。
 * ・封印: マイクラ版は封印されていると統率情報を見られないが、Web版は夜情報が封印の成否より先に届く構造
 *   （魔界公爵の夜情報と同じ扱い）のため、封印されていても統率情報は表示される（解釈判断。docs/command-wolf.md）。
 *   封印の対象役職（info.sealTarget）にはマイクラ版 YAMINABE_SEAL_TARGET_ROLES どおり入る。
 * ・ハッキング: 対象外には入っていない（マイクラ版の除外はヴァニティ・ホタルのみ）。
 *   統率の人狼と思い込んだ人には、銀狼の共通仕組みで偽の統率情報（ランダムな相手がランダムな役職名でめくれる）が出る
 *   （silver_wolf.js の baseView の command_wolf 分岐。マイクラ版 openSilverWolfFakeNightAction の COMMAND_WOLF と同じ考え方）。
 *   本物の統率の人狼が思い込まされたときは、本物の情報ではなく偽の表示になる（共通仕組み）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / NON_MIMICABLE_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
 *   闇の化身 = 入る（人狼系）/ 光の使徒・銀色の影 = 入らない / 模倣 = できる（模倣した人は統率情報も得る。
 *   マイクラ版 night.js の模倣分岐どおり）/ コスプレ = 入らない（村人陣営のみ）/
 *   シャッフラー = 山札に入らない（マイクラ版の除外に COMMAND_WOLF がある → shuffler.js の BLOCKED に登録）/
 *   ペルソナ = Web版未実装。
 * ・乞食: 本物の人狼系は構造的に取れない（beggar.js が WOLF_KIND を除外）ので変更なし。
 * ・シナジー: 統率の人狼がトリガーのルールはマイクラ版に無いので追加しない。封印シナジーの対象には sealTarget で自動で入る。
 * ・見張り番・詩人・観測の人狼: 対象を選ばないので「行動した」扱いにならない（マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES どおり）。新聞にも載らない。
 * ・CPU: 統率情報で知った役職をそのまま覚える（cpuInit / cpuLearn）。人狼陣営なので CO は共通の騙り（cpuClaim なし）。
 * ・COボタンの結果開示: 対象を選ばず「統率の人狼として人狼陣営の配置を確認していました。」の1択
 *   （マイクラ版 main.js の統率の人狼CO結果と同じ文。co.js の step "command"）。
 * ・実績（マイクラ版 stats.js。Web版には保存が無いので判定関数だけ）:
 *   first_command_wolf「狼を束ねる者」/ win_command_wolf「群れを束ねる牙」/
 *   command_wolf_checked_mad「全員、配置につけ。」（統率情報に狂人系がいた）/
 *   command_wolf_checked_lone「孤高の牙も戦力だ。」（統率情報に一匹狼がいた）/
 *   command_wolf_checked_fake「偽りは見逃さない」（統率情報にスパイか妖狸がいた）。
 *   確認系は「夜の始まりに見たはずの行」（初期役職どうしで組み直した行）で判定する。
 */
(function (ONW) {
  const ID = "command_wolf";
  const K = ONW.wolfKit;
  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);
  const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

  /** 統率情報の行 [{ id, role }]（マイクラ版 commandWolfVisibleInfo）。
   *  finMap を渡すと最終役職の代わりにそれを使う（実績判定: 夜の始まりに見た行 = 初期役職どうしで組み直す） */
  function visibleRows(g, selfId, finMap) {
    const ini = g.initialRoles || {}, fin = finMap || g.currentRoles || {};
    const rows = [];
    (g.players || []).forEach((q) => {
      if (q.id === selfId) return;
      const i = ini[q.id], f = fin[q.id] || i;
      const madIni = (ONW.MAD_KIND || []).includes(i), loneIni = i === "lone_wolf";
      if ((ONW.WOLF_KIND || []).includes(f) || loneIni || madIni || f === "spy" || f === "yokai_tanuki") {
        rows.push({ id: q.id, role: madIni || loneIni ? i : f });
      }
    });
    return rows;
  }
  /** 統率情報の文（マイクラ版の「統率情報」ブロックを1行に） */
  const infoText = (g, selfId, nameOf, rn, finMap) => {
    const rows = visibleRows(g, selfId, finMap);
    return rows.length ? `統率情報: ${rows.map((r) => `${nameOf(r.id)}：${rn(r.role)}`).join("、")}` : "統率情報: 対象はいません。";
  };
  /** 実績（マイクラ版 stats.js と同じ条件。確認系は夜の始まりに見たはずの行で判定） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_command_wolf");
    if (cur === ID && won) out.push("win_command_wolf");
    if (ini === ID || cur === ID) {
      const rows = visibleRows(g, id, g.initialRoles);
      if (rows.some((r) => (ONW.MAD_KIND || []).includes(r.role))) out.push("command_wolf_checked_mad");
      if (rows.some((r) => r.role === "lone_wolf")) out.push("command_wolf_checked_lone");
      if (rows.some((r) => r.role === "spy" || r.role === "yokai_tanuki")) out.push("command_wolf_checked_fake");
    }
    return out;
  }
  const cpuLearn = (g, id, k) => { visibleRows(g, id).forEach((r) => { k.infoOf(g, id).known[r.id] = r.role; }); };

  ONW.commandWolf = { holders, visibleRows, infoText, achievements };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 131, name: "統率の人狼", team: ONW.TEAM.WOLF, wakeOrder: 10, sort: 1.596,
      desc: "人狼陣営。夜に、墓地以外の人狼系・初期役職の狂人系・一匹狼・スパイ・妖狸が誰か分かります。見える相手のカードは役職名でめくれます（相方の人狼も狼マークではなく役職名です）。狂人系と一匹狼は初期役職、それ以外は最終役職で見分けます。墓地の役職は見えません。" },
    groups: { wolf: 8.97, "transform:dark_avatar": 9.47 },   // 人狼系（闇の化身の変化先。並びは ROLE_ORDER = wiki の order 88）
    // 夜の演出(stage.js が g.cmdReveal を受け取って 700ms 後に呼ぶ): 統率情報の相手のカードが順に役職名の面でめくれる → 夜時間の間ずっと開いたまま。
    // 狂信者の🐺（order 30）よりあとにし、模倣の人狼が統率を模倣したときは役名の面が最後に残るようにする
    stageNight: {
      order: 32, field: "cmdReveal",
      run(rows, SK) {
        const { later, paint, G } = SK;
        rows.forEach((r, i) => later(() => { const k = `p:${r.id}`; if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return; SK.up[k] = r.role; SK.glow[k] = true; if (SK.loveMate && SK.loveMate.id === r.id) SK.lov[k] = true; if (!SK.nightKeys.includes(k)) SK.nightKeys.push(k); paint(G()); }, i * 380));
      },
    },
    // 昼に酔いが覚めたときの演出: 統率情報の相手が役職名の面でめくれる（stage.js の soberPeek の並びに足す）
    stageSober: { list: { order: 45, run(sp, list) { (sp.cmd || []).forEach((r) => list.push([`p:${r.id}`, r.role, true])); } } },
    // 夜の始まり: 仲間の人狼の文（人狼系共通）＋ 統率情報。相方は🐺ではなく役名でめくれるので cultWolves は返さない
    nightMsg(c, p) {
      const g = c.g, base = K.nightMsg(c, p, ID);
      const rows = visibleRows(g, p.id);
      return { text: base.text, lines: [infoText(g, p.id, (x) => nm(g, x), c.rn)], cmdReveal: rows.length ? rows : null };
    },
    // 墓荒らし・ドッペルゲンガーで統率の人狼を手にしたとき: その時点の最終役職で統率情報を知る
    got(c, p, got, rev, opts) {
      const t = ONW.roleKit.gotTools(c, p, rev, opts), g = c.g;
      const rows = visibleRows(g, p.id);
      const mates = t.wolfIds(p.id);
      c.hold(p.id, mates.length ? `仲間の人狼: ${t.names(mates)}` : "仲間の人狼はいません。");
      c.hold(p.id, infoText(g, p.id, t.nameOf, c.rn));
      t.both(t.eff());
      t.setPeek(rows.map((r) => ({ k: `p:${r.id}`, role: r.role })), 380);
    },
    // 酔い覚め: 仲間の人狼（人狼系共通）＋ 統率情報（その時点の最終役職で組み直す）
    soberLines(c, id) {
      const g = c.g;
      return [...K.soberLines(c, id, ID), infoText(g, id, (x) => nm(g, x), c.rn)];
    },
    soberPeek(c, id) {
      const rows = visibleRows(c.g, id);
      return rows.length ? { cmd: rows } : {};
    },
    cpuInit: cpuLearn,   // CPU: 統率情報の役職をそのまま覚える（汎用の相方学習より正確な役職で上書きされる）
    cpuLearn,
    // 結果開示(COボタン・co.js が kind で引く): 対象を選ばず固定文を言うだけ（マイクラ版 main.js の統率の人狼CO結果）
    coResult: { kind: "command", fixedText: "統率の人狼として人狼陣営の配置を確認していました。", fixedShort: "人狼陣営の配置を確認" },
  });
})(window.ONW);
