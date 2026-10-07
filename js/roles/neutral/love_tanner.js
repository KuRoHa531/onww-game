/** 一目惚れしてるてる: 夜に1人選び、自分が追放されたらその相手も一緒に追放扱いになる(追放連動は vote.js の共通処理) */
(function (ONW) {

  // ---- CPUの夜の行動(もとは cpu.js の runNight にあったもの。中身は変更なし) ----
  function run(n, p, label, cur, rid) {
    const g = n.g;   // 一目惚れしてるてる: 一目惚れする相手を選ぶ（記録は「役職の持ち主」単位。役職が動いたら移動先の人の選択になる）
    const f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    ONW.setRoleBound(g, "loveTargets", p.id, t.id);   // 役職についていく（state.js の【必読】メモ参照）。移動「あと」に選んでも現在の持ち主に予約される
    i.mode = "love"; i.target = t.id;
    g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を選んでいました。`);
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }

  ONW.defineRole("love_tanner", {
    // 夜の画面(ui.js の renderOnlineNight / chainBlock が引く): 夜に選ぶときの説明文(action)と、朝/昼の連鎖で「確定」できる条件(chainReady)・「押して」の文言(chainHow)
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>一目惚れする相手</strong>のカードを1人分押してください。<br>あなたが追放されると、その人も一緒に追放扱いになり、あなたと相手が勝利します。${later}</p>${nowSel("")}`;
      },
      chainReady: (np, ng) => np === 1,
      chainHow: () => "<strong>一目惚れする相手</strong>のカードを押して",
    },
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 一目惚れした相手を選ぶ
    coResult: {
      kind: "love",
      pickLove: (id, K) => [`${K.nameOf(id)} に一目惚れしました。`, { kind: "love_tanner", target: id }, null, "disclose", `→ ${K.nameOf(id)}`],
    },
    // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    stagePick: {},
    cpuClaim: (...a) => ONW.roleHook("tanner", "cpuClaim")(...a),   // てるてる系の発言・投票は tanner.js と同じ
    cpuVoteScore: (...a) => ONW.roleHook("tanner", "cpuVoteScore")(...a),
    cpuNight: { order: 20, stage: "seer", chain: true, run },   // CPUの夜の行動(order が小さいほど先 / chain: 墓荒らし・ドッペル・酔い覚めの後に朝のうちに使える)
    info: { deck: 17, name: "一目惚れしてるてる", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 35,
      desc: "第三陣営。夜に1人選び、自分が追放されたらその相手も一緒に追放扱いになり、自分と相手が勝利します。" },
    groups: { "transform:silver_shadow": 2 },
    night: {
      kind: "seer", order: 20,   // 占い師と同じ段階の、占いのあと
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      // 選んだ相手を「役職の持ち主」に記録（役職が動いたら移動先の人の選択になる。state.js の【必読】メモ参照）
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        ONW.setRoleBound(g, "loveTargets", p.id, t);   // 役職についていく（以降に役職が動いたら、移動先の人の選択になる）
        g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を選んでいました。`);
        c.hold(p.id, `${nameOf(t)} に一目惚れしました。あなたが追放されると、${nameOf(t)} も一緒に追放扱いになります。`);
        ONW.observeNote(g, p.id, [t]);
        ONW.newsNote(g, "love_tanner");
      },
    },
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        ONW.setRoleBound(g, "loveTargets", id, t);   // 移動「あと」の選択も、その時点の持ち主に予約され、以降の移動にもついていく
        g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を選んでいました。`);
        return { lines: [`${c.nameOf(t)} に一目惚れしました。あなたが追放されると、${c.nameOf(t)} も一緒に追放扱いになります。`], reveal: null, nextChain: null };
      },
    },
  });
})(window.ONW);
