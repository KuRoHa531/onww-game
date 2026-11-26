/**
 * 偽占い師（マイクラ版 FAKE_SEER を参考）: 村人陣営。夜の能力は占い師と同じ（プレイヤー1人か墓地を見る）。
 *   ・本人には「占い師」として表示される（ONW.SELF_AS_SEER / ONW.shownRole。CPU も同じ自認で動く）。
 *   ・見えた結果は、配役（配役直後の全プレイヤー＋墓地）からランダムに選ばれた役職。占い師が1枚しかないときは、結果に占い師は出ない。
 *   ・妖狐を占っても呪殺しない（ONW.foxInspect を呼ばない）。蜃気狼を占うと、必ず蜃気狼と見える。
 *   ・占い師・狂った占い師・心眼の人狼などに占われたときは、本当の役職（偽占い師）が見える。
 *   ・酔っ払い・墓荒らし・ドッペルゲンガー経由でも、演出と判定は占い師と同じ流れで動く（morning / got は占い師の定義を土台にする）。
 *
 * 【段階】onww-fakeseer-1of4 〜 4of4（Task Important Rules.txt のとおり、各段階を a〜j に分けて納品）
 *   1of4（登録）: このファイル・index.html・ロビー/ガイド/wikiの並び・ルールコード ONW67・闇鍋シナジー・封印の対象・自認「占い師」(state.js / base.js)
 *   2of4（夜・朝の能力）【済】: 結果のランダム抽選・妖狐を呪殺しない・蜃気狼・墓荒らし/ドッペル/酔い覚め（このファイルの night.resolve / morning.run / cpuNight.run。抽選は ONW.fakeSeer）
 *   3of4（演出・CPU）: カードの演出・COボタン・CPUの記憶と発言
 *   4of4（周辺・総合）: 蜃気狼の実績・デバッグ・模倣/シャッフラー・docs・全体zip
 * 実装の進み具合は docs/fake-seer.md を参照。
 */
(function (ONW) {
  const R_ = () => ONW.ROLE;

  // ---- 結果の抽選（マイクラ版 fakeSeerResultRolePool / randomFakeSeerResultRoles / night.js の FAKE_SEER 分岐） ----
  /** 結果に出る役職の山: 配役直後の全プレイヤー（g.initialRoles）＋墓地（g.center0）。占い師が1枚しかないときは占い師を除く（2枚以上なら出る） */
  function pool(g) {
    const all = [...Object.values((g && g.initialRoles) || {}), ...(((g && (g.center0 || g.center)) || []))].filter(Boolean);
    const seers = all.filter((r) => r === R_().SEER).length;
    return all.filter((r) => r !== R_().SEER || seers >= 2);
  }
  /** n 個ぶんの結果を山から重複なしで引く（墓地を複数枚見るとき）。山が足りなければ村人 */
  function draw(g, n) {
    const a = pool(g), out = [];
    while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
    while (out.length < n) out.push(R_().VILLAGER);
    return out;
  }
  /** 蜃気狼のカード（模倣先が蜃気狼の模倣の人狼も）を占うと、ランダムにならず必ず蜃気狼と見える。確認の記録は「偽占い師に確認された」(fake_seer) */
  function mirageCard(g, role, key) {
    if (!(ONW.mirage && ONW.mirage.isMirageCard(g, role, key))) return false;
    ONW.mirage.noteInspect(g, key, "fake_seer");
    return true;
  }
  /** プレイヤー1人を占った結果（1回の占いで1回だけ呼ぶ）。妖狐は記録しない（呪殺しない）。role = そのときのカード、key = 席ID */
  function seenPlayer(g, role, key) { return mirageCard(g, role, key) ? R_().MIRAGE_WOLF : draw(g, 1)[0]; }
  /** 墓地を見た結果。idxs = 墓地の番号、cards = その時点の墓地。山から重複なしで引き、蜃気狼の墓地だけ必ず蜃気狼 */
  function seenGraves(g, idxs, cards) {
    const d = draw(g, idxs.length);
    return idxs.map((k, j) => ({ idx: k, role: mirageCard(g, cards[k], "g:" + k) ? R_().MIRAGE_WOLF : d[j] }));
  }
  ONW.fakeSeer = { pool, draw, seenPlayer, seenGraves };

  const base = ONW.roleDef("seer");   // seer.js が先に読み込まれている（index.html の並び）。夜の画面・選び方・COの流れは占い師のまま
  if (!base) throw new Error("fake_seer: seer が先に登録されている必要があります");

  // ---- CPUの夜の行動（seer.js の run と同じ流れ。結果の引き方だけ違う。妖狐は記録しない） ----
  function run(n, p, label, cur, rid) {
    const g = n.g;
    const rolesNow = cur ? g.currentRoles : g.initialRoles, graveNow = cur ? g.center : g.center0;
    const i = n.infoOf(p.id), f = n.forced(p);
    const lim = ONW.seerGraveMax(g, "fake_seer");
    const fg = (f.graves || []).filter((k) => k >= 0 && k < g.center.length).slice(0, lim);
    const fp = n.validPlayer(p, f.player) ? f.player : null;
    i.grave = [];
    if (fg.length || (!fp && lim > 0 && g.center.length >= lim && Math.random() < 0.4)) {
      i.mode = "grave";
      const idxs = fg.slice(0, lim);
      ONW.utils.shuffle([...g.center.keys()].filter((k) => !idxs.includes(k))).forEach((k) => { if (idxs.length < lim) idxs.push(k); });
      seenGraves(g, idxs.slice(0, lim), graveNow).forEach((x) => i.grave.push(x));
      i.grave.forEach((x) => { g.nightLogsAll.push(`${label} ${p.name} は 墓地${x.idx + 1} を確認し、${n.rn(x.role)} でした。`); n.hold(p.id, `墓地${x.idx + 1}枚目は「${n.rn(x.role)}」でした。`); });
      n.ob(p.id, [], i.grave.map((x) => x.idx));
      if (ONW.seerNote) ONW.seerNote(g, p.id, "fake_seer", { mode: "grave", graves: i.grave.map((x) => ({ idx: x.idx, seen: x.role, actualSeen: ONW.mimic.seerSeen(g, graveNow[x.idx], "g:" + x.idx) })) });
    } else {
      const t = fp ? g.players.find((q) => q.id === fp) : n.pick(g.players.filter((q) => q.id !== p.id));
      const seen = seenPlayer(g, rolesNow[t.id], t.id);
      i.mode = "player"; i.target = t.id; i.known[t.id] = seen;   // 妖狐は記録しない（foxInspect を呼ばない）
      g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を占い、${n.rn(seen)} でした。`);
      n.hold(p.id, `${t.name} の役職は「${n.rn(seen)}」でした。`);
      n.ob(p.id, [t.id]);
      if (ONW.seerNote) ONW.seerNote(g, p.id, "fake_seer", { mode: "player", targetId: t.id, seen, actualSeen: ONW.mimic.seerSeen(g, rolesNow[t.id], t.id) });
    }
    n.nn(rid);
  }

  /** 実績（マイクラ版 fakeSeerMatchedReality ほか。見えた結果が「本物の占い師が見たはずの結果（actualSeen）」と一致したかで判定） */
  function achievements(g, id, won) {
    const out = [], ini = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (ini !== "fake_seer" && fin !== "fake_seer") return out;
    const data = (g.seerData || {})[id];
    if (!data || data.role !== "fake_seer") return out;
    const matched = data.mode === "grave" ? (data.graves || []).some((x) => x.seen === x.actualSeen) : (data.targetId ? data.seen === data.actualSeen : false);
    if (matched) out.push("fake_seer_lucky");   // たまたま本当
    const sawFox = data.mode === "grave" ? (data.graves || []).some((x) => x.seen === "fox") : data.seen === "fox";
    if (sawFox) out.push("fake_seer_fox_result");   // 嘘で妖狐を見た
    if (data.targetId && (g.votes || {})[id] === data.targetId) {
      const t = data.seen && ONW.ROLE_INFO[data.seen] && ONW.ROLE_INFO[data.seen].team;
      if (t === ONW.TEAM.VILLAGE) out.push("fake_seer_vote_village_result");   // 村結果に投票
      if (matched && (g.executed || []).includes(data.targetId)) out.push("fake_seer_truth_exiled");   // 本当の結果で追放
    }
    if (data.mode === "grave" && (data.graves || []).filter((x) => x.seen === x.actualSeen).length >= 2) out.push("fake_seer_twice_correct");   // 2回連続で本当
    return out;
  }

  ONW.defineRole("fake_seer", {
    achievements,   // 実績（占い師の定義の継承ではなく、偽占い師専用の判定で上書き）
    like: "seer",   // 夜の画面・選び方・CO・CPUの発言は占い師の定義を土台にする（結果の抽選に関わる night.resolve / morning.run / cpuNight.run は下で差し替え）
    info: { observe: "player", sealTarget: true, deck: 89, count: 0, name: "偽占い師", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 23.1,
      desc: "村人陣営。本人には占い師として表示され、占い師と同じ夜能力（プレイヤー1人か墓地カードを見る）を使えます。ただし結果は配役内からランダムに表示され、妖狐を占っても呪殺しません。" },
    groups: { selfAsSeer: 1, "transform:light_apostle": 34 },   // 自認は占い師。光の使徒の変化先（村人系）。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    cpuNight: Object.assign({}, base.cpuNight, { run }),
    night: Object.assign({}, base.night, {
      // 夜の終わり。選んだ人 or 墓地について、配役からランダムな結果を出す（占い師と同じく順序の影響を受けない）。妖狐は呪殺しない
      resolve(c, p) {
        const g = c.g, rn = c.rn, hold = c.hold, nameOf = c.nameOf, rev = c.rev;
        const sel = c.selOf(p), label = rn(c.eff(p));
        if (sel.players.length === 1) {
          const t = sel.players[0], r = seenPlayer(g, g.initialRoles[t], t);
          g.nightLogsAll.push(`${label} ${p.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
          hold(p.id, `${nameOf(t)} の役職は「${rn(r)}」でした。`);
          if (ONW.seerNote) ONW.seerNote(g, p.id, "fake_seer", { mode: "player", targetId: t, seen: r, actualSeen: ONW.mimic.seerSeen(g, g.initialRoles[t], t) });
          rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
          ONW.observeNote(g, p.id, [t], null, c.eff(p));
          ONW.newsNote(g, c.eff(p));
        } else if (sel.graves.length) {
          const idxs = sel.graves.slice().sort((x, y) => x - y);
          const items = seenGraves(g, idxs, g.center0).map((x) => ({ k: `g:${x.idx}`, role: x.role }));
          items.forEach((it) => { const i = +it.k.slice(2); g.nightLogsAll.push(`${label} ${p.name} は 墓地${i + 1} を確認し、${rn(it.role)} でした。`); hold(p.id, `墓地${i + 1}枚目は「${rn(it.role)}」でした。`); });
          if (ONW.seerNote) ONW.seerNote(g, p.id, "fake_seer", { mode: "grave", graves: items.map((it) => ({ idx: +it.k.slice(2), seen: it.role, actualSeen: ONW.mimic.seerSeen(g, g.center0[+it.k.slice(2)], it.k) })) });
          rev[p.id] = { kind: "peek", items };
          ONW.observeNote(g, p.id, [], items.map((it) => +it.k.slice(2)), c.eff(p));
          ONW.newsNote(g, c.eff(p));
        }
      },
    }),
    // 朝（墓荒らし・ドッペルで手にした後）・昼（酔い覚め後）の占い。流れは占い師と同じで、結果だけランダム・妖狐は呪殺しない
    morning: {
      run(c) {
        const g = c.g, rn = c.rn, nameOf = c.nameOf, me = c.me, label = c.label, players = c.players;
        let graves = c.graves, lines = null, reveal = null;
        if (graves.length) {
          graves = graves.slice(0, ONW.seerGraveMax(g, "fake_seer")).sort((x, y) => x - y);
          const seenG = seenGraves(g, graves, g.center);
          lines = seenG.map((x) => `墓地${x.idx + 1}枚目は「${rn(x.role)}」でした。`);
          seenG.forEach((x) => g.nightLogsAll.push(`${label} ${me.name} は 墓地${x.idx + 1} を確認し、${rn(x.role)} でした。`));
          if (ONW.seerNote) ONW.seerNote(g, me.id, "fake_seer", { mode: "grave", graves: seenG.map((x) => ({ idx: x.idx, seen: x.role, actualSeen: ONW.mimic.seerSeen(g, g.center[x.idx], "g:" + x.idx) })) });
          reveal = { kind: "peek", items: seenG.map((x) => ({ k: `g:${x.idx}`, role: x.role })) };
        } else if (players.length) {
          const t = players[0], r = seenPlayer(g, g.currentRoles[t], t);   // 朝・昼のうちでも妖狐は記録しない
          lines = [`${nameOf(t)} の役職は「${rn(r)}」でした。`];
          g.nightLogsAll.push(`${label} ${me.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
          if (ONW.seerNote) ONW.seerNote(g, me.id, "fake_seer", { mode: "player", targetId: t, seen: r, actualSeen: ONW.mimic.seerSeen(g, g.currentRoles[t], t) });
          reveal = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
        }
        return lines ? { lines, reveal, nextChain: null } : null;
      },
    },
  });
})(window.ONW);
