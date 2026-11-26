/**
 * 気まぐれな占い師（マイクラ版 WHIMSICAL_SEER を参考）: 村人陣営・夜に占う役職。占い師とほぼ同じだが、
 * 行動ごとに1回だけ引く 1/2 の抽選に外れると「失敗」になる。
 * ・マイクラ版の説明文: 「夜にプレイヤー1人または設定枚数の墓地を占います。占いは1/2の確率で失敗し、失敗した場合は役職を確認できません。成功した場合は対象の本当の初期役職を知ります。妖狐・妖狸の占いに成功すると呪殺します。狐憑きでは呪殺は発生しません。」（配布時説明は js/role-desc-mc.js の転記が正）
 * ・成功したとき見えるのは対象の「本当の初期役職」（そのままの initialRoles / center0）。占い師の ONW.mimic.seerSeen は通さない
 *   ＝白狼は白狼のまま見え、蜃気狼も化けずに本当の役職が見え、ペルソナの仮面も見抜く（マイクラ版 roleForWhimsicalSeerResult）。
 * ・失敗したとき: 本人には「○○ の占いに失敗し、役職を確認できませんでした。」（墓地は「占いに失敗し、墓地の役職を確認できませんでした。」）だけが見え、
 *   対象のカード（または選んだ墓地全部）が「失敗」の面（stage.js の FAIL_MARK "__seerfail"）でめくれる。めくれる瞬間にパリンのSE（glass_break）が鳴る。
 *   妖狐・妖狸の呪殺は発生しない（ONW.foxInspect は成功したときだけ呼ぶ。狐憑きでは占い師と同じく元々呪殺しない）。
 *   失敗の記録は g.whimsicalSeerFailed[本人] = true（実績 whimsical_seer_fail「今日は星が見えない」用。マイクラ版 game.whimsicalSeerFailed と同じ）。
 * ・墓地の枚数は占い師と共通設定（ONW.seerGraveKey は fake/mad 以外を seerGraveCount に寄せる。マイクラ版も seerCenterCount 共通）。
 * ・夜の行動順・起きる順・選び方（stagePick）・夜画面（uiNight）・COの種類（coResult kind "seer"）は占い師と共通（like: "seer"）。
 *   結果開示の「失敗」の選択肢は co.js 側（気まぐれな占い師を名乗っているときだけ プレイヤー結果に「失敗」ボタン、墓地は成功/失敗の確認ステップ）。
 * ・朝の連鎖（墓荒らし・ドッペルゲンガー・酔い覚め）でも同じく 1/2 で失敗する（マイクラ版も同じ占い処理を共用）。その場合は今の役職（currentRoles / center）を見る。
 * ・ハッキングされて思い込んだ人（銀狼の偽占い）: 1/2 で偽の失敗（文＋「失敗」の面）が出る（silver_wolf.js の fakeResult。本物の盤面・呪殺には影響しない。マイクラ版の偽気まぐれ占いと同じ）。
 * ・CPU: 真COは失敗なら「○○ を占いましたが失敗しました。」と言う（cpuClaim）。騙りは 1/2 で失敗をでっち上げる（cpuLie。マイクラ版はCPUごとに失敗のでっち上げを固定するが、Web版の騙り生成は1回きりなので都度抽選）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（村人陣営）。闇の化身・銀色の影の対象外。
 *   コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に既に含まれている）。シャッフラーの変化先にも入る（除外リストに無い）。
 *   模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い）。ペルソナの仮面候補にも入る（マイクラ版 YAMINABE_PERSONA_INFO_ROLES。ペルソナ本体は第5バッチで移植）。
 * ・封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。
 * ・闇鍋シナジー: カルメンの対象（roles.js の CARMEN_TARGET_ROLES に既に含まれている）。黄泉の対象外・鍵師の対象外（マイクラ版の各リストに無い）。
 *   マイクラ版闇鍋の「占い師が必須枠で気まぐれに40%で置き換わる」処理は Web版のシナジーに同等の仕組みが無いため未実装（解釈点。docs/whimsical-seer.md）。
 * 状態: g.whimsicalSeerFailed = { 失敗した本人のID: true }（試合ごとに net.startGame が {} に戻す。ホスト引き継ぎのキーにも追加済み）
 */
(function (ONW) {
  const base = ONW.roleDef("seer");
  if (!base) throw new Error("whimsical_seer requires seer");
  const FAIL_MARK = "__seerfail";   // stage.js の FAIL_MARK と同じ文字列。失敗した占いで対象のカードがこの面でめくれる
  const succeed = () => Math.random() < 0.5;   // マイクラ版 shouldWhimsicalSeerSucceed（行動ごとに1回だけ引く）
  const markFailed = (g, id) => { (g.whimsicalSeerFailed = g.whimsicalSeerFailed || {})[id] = true; };

  // ---- CPUの夜の行動（占い師の run が土台。結果は本当の役職・失敗抽選つき） ----
  function run(n, p, label, cur, rid) {
    const g = n.g;   // cur: 朝に使うとき（朝の時点の実際のカードを見る）
    const rolesNow = cur ? g.currentRoles : g.initialRoles, graveNow = cur ? g.center : g.center0;
    const i = n.infoOf(p.id), f = n.forced(p);
    const lim = ONW.seerGraveMax(g, rid);   // 墓地の枚数は占い師と共通設定
    const fg = (f.graves || []).filter((k) => k >= 0 && k < g.center.length).slice(0, lim);
    const fp = n.validPlayer(p, f.player) ? f.player : null;
    i.grave = []; i.failed = false;
    const ok = succeed();
    if (fg.length || (!fp && lim > 0 && g.center.length >= lim && Math.random() < 0.4)) {
      i.mode = "grave";
      const idxs = fg.slice(0, lim);
      ONW.utils.shuffle([...g.center.keys()].filter((k) => !idxs.includes(k))).forEach((k) => { if (idxs.length < lim) idxs.push(k); });
      const picked = idxs.slice(0, lim);
      if (ok) {
        picked.forEach((k) => i.grave.push({ idx: k, role: graveNow[k] }));   // 本当の初期役職（化けを見抜く）
        i.grave.forEach((x) => { g.nightLogsAll.push(`${label} ${p.name} は 墓地${x.idx + 1} を確認し、${n.rn(x.role)} でした。`); n.hold(p.id, `墓地${x.idx + 1}枚目は「${n.rn(x.role)}」でした。`); });
      } else {
        i.failed = true; markFailed(g, p.id);
        g.nightLogsAll.push(`${label} ${p.name} は墓地占いに失敗していました。`);
        n.hold(p.id, "占いに失敗し、墓地の役職を確認できませんでした。");
      }
      n.ob(p.id, [], picked);
    } else {
      const t = fp ? g.players.find((q) => q.id === fp) : n.pick(g.players.filter((q) => q.id !== p.id));
      i.mode = "player"; i.target = t.id;
      if (ok) {
        const seen = rolesNow[t.id];   // 本当の役職（ONW.mimic.seerSeen を通さない）
        i.known[t.id] = seen;
        if (ONW.foxInspect) ONW.foxInspect(g, t.id);   // 妖狐・妖狸の呪殺は成功したときだけ
        g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を占い、${n.rn(seen)} でした。`);
        n.hold(p.id, `${t.name} の役職は「${n.rn(seen)}」でした。`);
      } else {
        i.failed = true; markFailed(g, p.id);
        g.nightLogsAll.push(`${label} ${p.name} は ${t.name} の占いに失敗していました。`);
        n.hold(p.id, `${t.name} の占いに失敗し、役職を確認できませんでした。`);
      }
      n.ob(p.id, [t.id]);
    }
    n.nn(rid);
  }

  // ---- CPUの発言 ----
  /** 騙り気まぐれ占い: 1/2で失敗をでっち上げ、残りは偽の占い結果を言う（マイクラ版の騙り気まぐれ占いと同じ） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const { rn, fakeSeerTarget, fakeSeerResult, bareCo } = k;
    const t = fakeSeerTarget(g, p);
    if (!t) return { co: bareCo(g, co), result: null };
    if (Math.random() < 0.5) return { co, result: { short: `${t.name} → 失敗`, text: `${t.name} を占いましたが失敗しました。`, claim: null } };
    const role = fakeSeerResult(g, p, t, selfRole);
    return { co, result: { short: `${t.name} → ${rn(role)}`, text: `${t.name} を占って ${rn(role)} でした。`, claim: { kind: "seer", target: t.id, role } } };
  }
  /** 本物の気まぐれな占い師の発言: 成功なら結果を、失敗なら失敗したことを開示する */
  function cpuClaim(k, g, p, r, i, c) {
    const { rn, nameOf } = k;
    c.co = "whimsical_seer";
    if (i.failed) {
      c.result = i.mode === "grave"
        ? { short: "墓地 → 失敗", text: "墓地を占いましたが失敗しました。", claim: null }
        : { short: `${nameOf(g, i.target)} → 失敗`, text: `${nameOf(g, i.target)} を占いましたが失敗しました。`, claim: null };
    } else if (i.mode === "player") c.result = { short: `${nameOf(g, i.target)} → ${rn(i.known[i.target])}`, text: `${nameOf(g, i.target)} を占って ${rn(i.known[i.target])} でした。`, claim: { kind: "seer", target: i.target, role: i.known[i.target] } };
    else c.result = { short: i.grave.map((x) => `墓地${x.idx + 1} → ${rn(x.role)}`).join("、"), text: i.grave.map((x) => `墓地${x.idx + 1} を見て ${rn(x.role)}`).join("、") + " でした。", claim: { kind: "seer-grave" } };
  }

  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === "whimsical_seer" || fin === "whimsical_seer") out.push("first_whimsical_seer");
    if (fin === "whimsical_seer" && won) out.push("win_whimsical_seer");
    if ((g.whimsicalSeerFailed || {})[id]) out.push("whimsical_seer_fail");   // 占いに失敗したことがある（マイクラ版 whimsicalSeerFailed / seerData.failed）
    return out;
  }

  ONW.defineRole("whimsical_seer", {
    like: "seer",   // 夜の画面・選び方・COの種類・夜の処理の枠組みは占い師の定義を土台にする（結果の出し方に関わる night.resolve / morning.run / cpuNight.run と、発言の cpuClaim / cpuLie は下で差し替え）
    info: { observe: "player", sealTarget: true, deck: 156, count: 0, name: "気まぐれな占い師", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 23.2,
      desc: "村人陣営。プレイヤー1人を見るか、墓地カードを確認できます。ただし占いは半分の確率で失敗し、成功すれば対象の本当の初期役職が分かります。" },
    groups: { "transform:light_apostle": 35 },   // 光の使徒の変化先（村人系）のみ。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    achievements,
    cpuLie: { role: "whimsical_seer", weight: 20, order: 2, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    /** 墓荒らし・ドッペルゲンガーで気まぐれな占い師を手にしたCPUが、続けて言う結果 */
    cpuChainResult(k, g, p, i) {
      const c = {}; if (!i.failed && !(i.mode === "player" ? i.target && i.known && i.known[i.target] : i.mode === "grave" && i.grave && i.grave.length)) return null;
      cpuClaim(k, g, p, "whimsical_seer", i, c); return c.result || null;
    },
    cpuNight: Object.assign({}, base.cpuNight, { run }),
    night: Object.assign({}, base.night, {
      // 夜の終わり。成功すれば本当の初期役職が見え、失敗すれば対象（または墓地全部）が「失敗」の面でめくれる
      resolve(c, p) {
        const g = c.g, rn = c.rn, hold = c.hold, nameOf = c.nameOf, rev = c.rev;
        const sel = c.selOf(p), label = rn(c.eff(p)), ok = succeed();
        if (sel.players.length === 1) {
          const t = sel.players[0];
          if (ok) {
            const r = g.initialRoles[t];   // 本当の初期役職（白狼・蜃気狼の化け、ペルソナの仮面も見抜く）
            if (ONW.foxInspect) ONW.foxInspect(g, t);   // 妖狐: 占われた席を記録（成功したときだけ呪殺の対象になる）
            g.nightLogsAll.push(`${label} ${p.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
            hold(p.id, `${nameOf(t)} の役職は「${rn(r)}」でした。`);
            rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
          } else {
            markFailed(g, p.id);
            g.nightLogsAll.push(`${label} ${p.name} は ${nameOf(t)} の占いに失敗していました。`);
            hold(p.id, `${nameOf(t)} の占いに失敗し、役職を確認できませんでした。`);
            rev[p.id] = { kind: "peek", items: [{ k: `p:${t}`, role: FAIL_MARK }] };   // 「失敗」の文字でめくれる（パリンのSEは stage.js が面の変化で鳴らす）
          }
          ONW.observeNote(g, p.id, [t], null, c.eff(p));
          ONW.newsNote(g, c.eff(p));
        } else if (sel.graves.length) {
          const idxs = sel.graves.slice().sort((x, y) => x - y);
          if (ok) {
            const items = idxs.map((i) => ({ k: `g:${i}`, role: g.center0[i] }));   // 本当の初期役職
            items.forEach((it) => { const i = +it.k.slice(2); g.nightLogsAll.push(`${label} ${p.name} は 墓地${i + 1} を確認し、${rn(it.role)} でした。`); hold(p.id, `墓地${i + 1}枚目は「${rn(it.role)}」でした。`); });
            rev[p.id] = { kind: "peek", items };
          } else {
            markFailed(g, p.id);
            g.nightLogsAll.push(`${label} ${p.name} は墓地占いに失敗していました。`);
            hold(p.id, "占いに失敗し、墓地の役職を確認できませんでした。");
            rev[p.id] = { kind: "peek", items: idxs.map((i) => ({ k: `g:${i}`, role: FAIL_MARK })) };
          }
          ONW.observeNote(g, p.id, [], idxs, c.eff(p));
          ONW.newsNote(g, c.eff(p));
        }
      },
    }),
    // 朝（墓荒らし・ドッペルで手にした後）・昼（酔い覚め後）に使う占い。今の役職を見る。失敗の扱いは夜と同じ
    morning: {
      run(c) {
        const g = c.g, rn = c.rn, nameOf = c.nameOf, me = c.me, label = c.label, players = c.players;
        let graves = c.graves, lines = null, reveal = null;
        const ok = succeed();
        if (graves.length) {
          graves = graves.slice(0, ONW.seerGraveMax(g, c.ar)).sort((x, y) => x - y);
          if (ok) {
            const seenG = graves.map((i) => ({ i, role: g.center[i] }));   // 本当の役職
            lines = seenG.map((x) => `墓地${x.i + 1}枚目は「${rn(x.role)}」でした。`);
            seenG.forEach((x) => g.nightLogsAll.push(`${label} ${me.name} は 墓地${x.i + 1} を確認し、${rn(x.role)} でした。`));
            reveal = { kind: "peek", items: seenG.map((x) => ({ k: `g:${x.i}`, role: x.role })) };
          } else {
            markFailed(g, me.id);
            lines = ["占いに失敗し、墓地の役職を確認できませんでした。"];
            g.nightLogsAll.push(`${label} ${me.name} は墓地占いに失敗していました。`);
            reveal = { kind: "peek", items: graves.map((i) => ({ k: `g:${i}`, role: FAIL_MARK })) };
          }
        } else if (players.length) {
          const t = players[0];
          if (ok) {
            const r = g.currentRoles[t];   // 本当の役職
            if (ONW.foxInspect) ONW.foxInspect(g, t);   // 妖狐: 占われた席を記録（成功したときだけ）
            lines = [`${nameOf(t)} の役職は「${rn(r)}」でした。`];
            g.nightLogsAll.push(`${label} ${me.name} は ${nameOf(t)} を占い、${rn(r)} でした。`);
            reveal = { kind: "peek", items: [{ k: `p:${t}`, role: r }] };
          } else {
            markFailed(g, me.id);
            lines = [`${nameOf(t)} の占いに失敗し、役職を確認できませんでした。`];
            g.nightLogsAll.push(`${label} ${me.name} は ${nameOf(t)} の占いに失敗していました。`);
            reveal = { kind: "peek", items: [{ k: `p:${t}`, role: FAIL_MARK }] };
          }
        }
        return lines ? { lines, reveal, nextChain: null } : null;
      },
    },
  });
  ONW.whimsicalSeer = { FAIL_MARK, succeed };
})(window.ONW);
