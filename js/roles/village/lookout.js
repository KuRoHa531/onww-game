/**
 * 見張り番（マイクラ版 LOOKOUT を参考）: 村人陣営・夜に1人を見張る役職。
 * ・マイクラ版の説明文: 「夜に自分以外のプレイヤー1人を選び、その人が夜に何か行動したかどうかを昼開始時に知ることができます。
 *   役職が入れ替わった場合、選んだ対象の情報は現在見張り番になっているプレイヤーへ引き継がれます。
 *   酔っぱらっていた場合は酔いが覚めても夜能力を使えません。」（配布時説明は js/role-desc-mc.js の転記が正）
 * ・夜に自分以外のプレイヤー1人を選ぶ（墓地は選べない）。結果はその場では分からず、待機時間に現在の見張り番の持ち主へ通知される。
 * ・記録は「役職に紐づく状態」: g.lookoutTarget[持ち主] = 見張った相手 / g.lookoutBy[持ち主] = 最初に選んだ人のID。
 *   ONW.ROLE_BOUND_KEYS に登録してあるので、怪盗・いたずらっ子・墓荒らし・グレムリンなどで役職が動くと記録もカードについて移る
 *   （マイクラ版 transferRoleBoundSpecialData の lookoutTarget の "move" と同じ。グレムリンのコピーは "copy" で対象だけ複製し、
 *   lookoutBy は複製しない = マイクラ版で lookoutRoleMoved がコピーでは立たないのと同じ）。
 * ・「行動していた」判定（マイクラ版 lookoutTargetActed）: 対象が夜（と朝のうち）に能力を使った記録があり、かつ対象の実効役職が
 *   「情報を見るだけ・完全自動」の役職（下の PASSIVE_ONLY。マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES）でないこと。
 *   Web版の「使った記録」は ONW.observeNote の観測ログ（詩人・観測の人狼と同じ物差し）が本線。対象を選ばない行動
 *   （ホタルの変身選択・なのかの形態変化・コスプレイヤーのコスプレ）は観測ログに載らないので、各役職の記録で補う。
 *   実効役職はマイクラ版 roleForMimicEffect と同じ（クローンは思い込み先・模倣の人狼は模倣先・ドッペルはコピー先で判定）。
 * ・通知（マイクラ版 announceLookoutNotificationsAtDayStart）: 待機時間に、実効役職が見張り番で、酔いが覚めていて、
 *   ハッキングされておらず、封印されていない持ち主へ1回だけ。「{対象}は行動していました。」/「{対象}は行動していませんでした。」
 *   情報確認（hold）にも同じ文が残る（第6バッチ共通指示）。
 * ・演出（作者メモ）: 待機時間に、対象が動いていたら対象のカードが踊りだして数秒後に止まる（見張り番本人の画面だけ。
 *   settleMsg の lookoutDance → stageSettle "settleLookoutDance"、CSS の .tb-dance）。動いていなければ演出なしで、情報確認にだけ載る。
 * ・酔っぱらっていた見張り番は、酔いが覚めても夜能力を使えない（マイクラ版 ROLE_INFO 明記）: noDayChain = true で
 *   酔い覚めの議論中連鎖には出さない。墓荒らし・ドッペルゲンガーで手にした朝のうちの連鎖は使える（morning）。
 *   対象を選べなかった場合の結果情報は、マイクラ版どおり「酔っ払っていたため見張るのを忘れていました。」の文になる。
 * ・ハッキング: 見張り番はハッキングの対象にも思い込みの対象にもなる。本物の見張り番がハッキングされている間は本物の通知は出ない。
 *   見張り番と思い込んだ人は、夜に偽の対象を選び（silver_wolf.js の fakeResult が「見張ることにしました」の文を返す）、
 *   待機時間に 1/2 で「行動していました」になる偽の通知を受け取る（マイクラ版 announceSilverWolfFakeDayNotifications の LOOKOUT 分岐。
 *   偽の結果は g.hackPub に1回だけ決めて保存し、再入室でも同じ内容。動いていた偽結果では本物と同じく対象のカードが踊る）。
 * ・変化候補（マイクラ版で確認）: 光の使徒の変化先にのみ入る（村人陣営）。闇の化身・銀色の影の対象外。
 *   コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に最初から入っている）。シャッフラーの山札には入らない
 *   （マイクラ版 shufflerEligibleRoles の除外どおり。shuffler.js の BLOCKED に追加）。模倣の人狼は模倣できる
 *   （NON_MIMICABLE_ROLES に無い）。ペルソナの仮面候補からも外れていない（persona.js の除外リストに無い）。
 * ・封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。封印されていると夜の選択が共通処理で失敗する。
 *   カルメン・黄泉・鍵師の対象外（マイクラ版の各リストに無い）。鈴の巫女の対象リストにはマイクラ版で入っているが、
 *   鈴の巫女は第6バッチ後続のため接続はそちらの移植時。
 * ・闇鍋シナジー: 見張り番が出る闇鍋には「夜に行動できる役職」（マイクラ版 YAMINABE_LOOKOUT_TARGET_ROLES、45役）を合わせて
 *   最低2枚出す（マイクラ版は 50% で2枚・50% で3枚の抽選だが、Web版の個数ルールに確率の仕組みが無いため最低2枚で置き換えた。
 *   roles.js の SYNERGY_COUNT_RULES）。
 * ・CPU: 夜は自分以外の1人をランダムに選ぶ（デバッグ指定があればそれ）。発言は結果開示で、見張った相手と
 *   行動していたかどうかを開示する（マイクラ版の結果開示フォーム・CPUの「○○を見張っていました」と同じ情報）。
 * 状態: g.lookoutTarget / g.lookoutBy = { 持ち主ID: 対象ID / 選んだ人のID }（カードに付いて動く。net.startGame が {} に戻し、ホスト引き継ぎキーにも追加済み）
 *       g.lookoutNotified = { 持ち主ID: true }（通知済み。人に付く記録で、カードには付かない。マイクラ版 lookoutNotified と同じ）
 */
(function (ONW) {
  const ID = "lookout";
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
  const eff = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);

  /** マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES: 夜に「選択を伴う能力行使」を一切行わず、情報を見るだけ・完全自動処理の役職。
   *  これらは見張り番から見て「行動していた」とは扱わない（マイクラ版 vote.js / extraRoles.js の同名リストをそのまま転記） */
  const PASSIVE_ONLY = new Set([
    "werewolf", "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf",
    "negi_wolf", "mapo_wolf", "assassin", "wolf_dreamer", "wolf_king",
    "observer_wolf", "forgetful_wolf", "yokai_tanuki", "silver_wolf",
    "mirage_wolf", "curse_wolf", "sam", "command_wolf",
    "merlin", "cultist", "demon_duke", "fanatic", "lawyer", "clone",
    "poet", "newspaper", "mayor", "mad_mayor", "tough_guy", "penguin",
    "chicken", "wolf_marked", "fox_marked", "cursed_one", "tenacious_madman",
    "jester_madman", "black_cat", "cat_pumpkin", "straw_doll", "hunter",
    "necromancer", "ren", "insomniac", "tanner", "cat_sidhe", "villager",
    "opportunist", "amanojaku", "baker", "star", "winner", "loser",
    "bounty_hunter", "fox", "sense_seer", "princess", "martyr",
    "odd_one", "libra", "predictor", "queen",
    "madman", "rebel_madman", "black_wolf_madman", "mad_exchanger", "mad_queen",
    "profiler", "muzzle_madman", "mason", "god", "executioner", "servant",
    "multi_personality",   // 多重人格: 夜能力は無く受動のみ（マイクラ版 LOOKOUT_PASSIVE_ONLY_ROLES と同じ扱い）
  ]);

  /** 対象が夜（と朝のうち）に「行動していた」か（マイクラ版 lookoutTargetActed） */
  function targetActed(g, targetId) {
    if (!g || !targetId) return false;
    if (PASSIVE_ONLY.has(eff(g, targetId))) return false;   // 情報を見るだけ・自動の役職は、記録があっても「行動していない」
    if ((g.observeLog || []).some((e) => e.from === targetId && !e.poetOnly)) return true;   // 対象を選ぶ能力を使った記録（夜・朝のうち）。poetOnly（ドーナツ配達のような自動処理）は数えない
    const hc = (g.hotaruChoice || {})[targetId];   // ホタル: 変身する/しないを選んだ（hotaru_failed = 夜の途中で役職が変わって変身できなかった場合は除く）
    if (hc === "sam" || hc === "hotaru") return true;
    if ((g.nanokaMode || {})[targetId]) return true;   // なのか: 形態を選んで変化した（選ばなかった場合はマイクラ版でも actionDone が立たない）
    const cd = (g.cosplayDraw || {})[targetId];   // コスプレイヤー: 夜に山札から選んでコスプレした（配役時コスプレイヤーで、今はコスプレイヤーでない）
    if (cd && cd.at === "night" && (g.initialRoles || {})[targetId] === "cosplayer" && (g.currentRoles || {})[targetId] !== "cosplayer") return true;
    const cp = (g.copylistDraw || {})[targetId];   // コピリスト: 夜に候補から選んでコピーした（配役時コピリストで、今はコピー先の役職。コスプレイヤーと同じ考え方）
    if (cp && cp.at === "night" && (g.initialRoles || {})[targetId] === "copylist" && (g.currentRoles || {})[targetId] !== "copylist") return true;
    return false;
  }

  /** 見張る対象を記録する（カードに付いて動く。holderId = 見張り番のカードの持ち主、byId = 実際に選んだ人） */
  function setTarget(g, holderId, targetId, byId) {
    ONW.setRoleBound(g, "lookoutTarget", holderId, targetId);
    ONW.setRoleBound(g, "lookoutBy", holderId, byId || holderId);
  }
  /** 最終盤面の持ち主が見張った相手（決まっていなければ null） */
  function targetOf(g, holderId) {
    const t = ONW.getRoleBound(g, "lookoutTarget", holderId);
    if (!t || !(g.players || []).some((q) => q.id === t)) return null;
    return t;
  }
  /** 通知の文（マイクラ版の見張り通知どおり） */
  const noticeText = (name, acted) => acted ? `${name}は行動していました。` : `${name}は行動していませんでした。`;
  const pickText = (name) => `あなたは ${name} を見張ることにしました。結果は昼開始時に通知されます。`;
  const logText = (label, p, nameOf, t) => `${label} ${p.name} は ${nameOf(t)} を見張ることにしていました。`;

  /** 結果発表の「役職情報」の行（マイクラ版 vote.js の見張り情報。最終役職が見張り番の人だけ） */
  function lines(g, nm2) {
    return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => {
      const t = targetOf(g, p.id);
      if (!t) return `見張り番 ${nm2(p.id)} は酔っ払っていたため見張るのを忘れていました。`;
      return targetActed(g, t)
        ? `見張り番 ${nm2(p.id)} は夜に ${nm2(t)} が行動していたと知っていました。`
        : `見張り番 ${nm2(p.id)} は夜に ${nm2(t)} が行動していなかったと知っていました。`;
    });
  }

  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_lookout");
    if (fin !== ID) return out;
    if (won) out.push("win_lookout"); else out.push("lose_lookout");
    const t = targetOf(g, id);
    if (t) {
      const by = ONW.getRoleBound(g, "lookoutBy", id);   // 記録がカードについて移ってきた（選んだのが今の持ち主でない）= 引き継がれた
      if (by && by !== id) out.push("lookout_role_moved");
      if (!targetActed(g, t)) out.push("lookout_target_no_action");
    }
    return out;
  }

  const H = (ONW.lookout = { targetActed, targetOf, setTarget, lines, achievements, PASSIVE_ONLY, noticeText });

  // ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ） ----
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
    const t = n.validPlayer(p, f.player) ? g.players.find((q) => q.id === f.player) : n.pick(g.players.filter((q) => q.id !== p.id));
    if (!t) return;
    setTarget(g, p.id, t.id, p.id);
    i.lookoutTarget = t.id;   // 発言（結果開示）が使う
    g.nightLogsAll.push(logText(label, p, n.nameOf, t.id));
    n.hold(p.id, pickText(t.name));
    n.ob(p.id, [t.id]);
    n.nn(rid);
  }
  /** CPUの結果開示の文（マイクラ版の結果開示フォームと同じ） */
  function claimOf(g, p, tid) {
    const acted = targetActed(g, tid), name = nm(g, tid);
    return { short: `${name} → ${acted ? "行動していた" : "行動していなかった"}`, text: `${name} は夜に${acted ? "行動していました" : "行動していませんでした"}。`, claim: { kind: "lookout", target: tid, acted } };
  }
  /** 本物の見張り番の発言: 見張った相手と、行動していたかどうかを開示する */
  function cpuClaim(k, g, p, r, i, c) {
    const tid = (i && i.lookoutTarget) || targetOf(g, p.id);
    if (!tid) return;
    c.co = ID;
    c.result = claimOf(g, p, tid);
  }
  /** 騙りの結果開示: 自分以外の1人を適当に見張ったことにして、結果は 1/2 で「行動していた」と言う（マイクラ版の偽見張り通知と同じ確率） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const cand = (others || []).filter((q) => q.id !== p.id && !(g.deadIds || []).includes(q.id));
    if (!cand.length) return { co: k.bareCo(g, co), result: null };
    const t = cand[Math.floor(Math.random() * cand.length)], acted = Math.random() < 0.5;
    return { co, result: { short: `${t.name} → ${acted ? "行動していた" : "行動していなかった"}`, text: `${t.name} は夜に${acted ? "行動していました" : "行動していませんでした"}。`, claim: { kind: "lookout", target: t.id, acted } } };
  }

  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 160, count: 0, name: "見張り番", team: ONW.TEAM.VILLAGE, wakeOrder: 40, sort: 23.6,
      desc: "村人陣営。夜に自分以外のプレイヤー1人を選び、その人が夜に何か行動したかどうかを昼開始時に知ることができます。役職が入れ替わった場合、選んだ対象の情報は現在見張り番になっているプレイヤーへ引き継がれます。酔っぱらっていた場合は酔いが覚めても夜能力を使えません。" },
    groups: { "transform:light_apostle": 59 },   // 光の使徒の変化先（村人系）のみ。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    achievements,
    noDayChain: true,   // 酔いが覚めても夜能力は使えない（マイクラ版 ROLE_INFO 明記）。墓荒らし・ドッペルの朝のうちの連鎖は使える（major・抹消の人狼と同じ扱い）
    uiNight: {
      action(X) {
        const { later, nowSel } = X;
        return `<p class="night-step__hint">上のテーブルから、<strong>見張る相手</strong>のカードを1人分押してください。（自分以外）<br>その人が夜に行動したかどうかは、<strong>昼開始時</strong>に分かります。${later}</p>${nowSel("")}`;
      },
      chainReady: (np) => np === 1,
      chainHow: () => "<strong>見張る相手</strong>のカードを押して（自分以外）",
    },
    stagePick: {},   // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
    cpuLie: { role: "lookout", weight: 20, order: 12, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    /** 墓荒らし・ドッペルゲンガーで見張り番を手にしたCPUが、続けて言う結果 */
    cpuChainResult(k, g, p, i) {
      const tid = (i && i.lookoutTarget) || targetOf(g, p.id);
      return tid ? claimOf(g, p, tid) : null;
    },
    cpuNight: { order: 13, stage: "seer", chain: true, run: cpuRun },
    night: {
      kind: "seer", order: 13,   // 占い師(10)・番犬(12)のあと。役職変動系（怪盗・いたずらっ子など）より前に選ぶので、記録は ROLE_BOUND で移動に追従する
      complete: (np) => np === 1,
      normalize: (c, players) => ({ players: players.slice(0, 1), graves: [] }),
      resolve(c, p) {
        const g = c.g, nameOf = c.nameOf;
        const t = c.selOf(p).players[0]; if (!t) return;
        setTarget(g, p.id, t, p.id);
        g.nightLogsAll.push(logText(c.rn(c.eff(p)), p, nameOf, t));
        c.hold(p.id, pickText(nameOf(t)));
        ONW.observeNote(g, p.id, [t], null, c.eff(p));
        ONW.newsNote(g, ID);
      },
    },
    /** 墓荒らし・ドッペルゲンガーで見張り番を手にしたとき（朝のうち）: 朝のうちに見張る相手を1人選べる。結果は待機時間に通知される */
    morning: {
      run(c) {
        if (!c.players.length) return null;
        const g = c.g, id = c.id, t = c.players[0];
        setTarget(g, id, t, id);
        g.nightLogsAll.push(logText(c.label, c.me, c.nameOf, t));
        ONW.observeNote(g, id, [t], null, ID);
        ONW.newsNote(g, ID);
        return { lines: [pickText(c.nameOf(t))], reveal: null, nextChain: null };
      },
    },
    /** 待機時間の知らせ: 現在の見張り番の持ち主へ、見張った相手が行動していたかどうかを伝える（マイクラ版 announceLookoutNotificationsAtDayStart）。
     *  対象が動いていたら、本人の画面でだけ対象のカードが踊る（stageSettle "settleLookoutDance"。作者メモ）。
     *  ハッキングされて見張り番と思い込んでいる人には、偽の通知（1/2で「行動していました」。詩人と同じ作り） */
    settleMsg(c, p, mode) {
      const g = c.g, out = { logs: [] };
      if (!p.isCpu && ONW.hack && ONW.hack.isFakeUi(g, p.id)) {   // 銀狼にハッキングされた人: 本当の通知は出ず、見張り番と思い込んでいれば偽の通知（その人にだけ）
        if ((g.hackRole || {})[p.id] !== ID || (ONW.seal && ONW.seal.is(g, p.id))) return out;
        const pub = (g.hackPub = g.hackPub || {}), key = "lookoutFake:" + p.id;
        let f = pub[key];
        if (!f) {
          if (mode !== "settle") return out;
          const t = (((g.nightSels || {})[p.id] || {}).players || [])[0];
          if (!t) return out;
          f = pub[key] = { target: t, acted: Math.random() < 0.5 };   // マイクラ版の偽見張り通知: 対象は夜に選んだ（つもりの）相手、結果は 1/2
        }
        out.logs.push(noticeText(nm(g, f.target), f.acted));
        if (f.acted) out.lookoutDance = [f.target];
        return out;
      }
      if (eff(g, p.id) !== ID) return out;
      if (ONW.hiddenDrunk(g, p.id)) return out;   // 酔っ払い中は出さない（酔っていた見張り番はそもそも選べていない）
      if ((g.hackRole || {})[p.id]) return out;   // ハッキングされている本物の見張り番には出さない（マイクラ版と同じ）
      if (ONW.seal && ONW.seal.is(g, p.id)) return out;   // 封印されていると知ることができない
      const t = targetOf(g, p.id);
      if (!t) return out;
      const acted = targetActed(g, t);
      if (acted) out.lookoutDance = [t];   // 動いていたら対象のカードが踊る（再入室の再送でも届くが、クライアント側は quiet / shown で再演を抑える）
      if (!(g.lookoutNotified || {})[p.id]) {
        (g.lookoutNotified = g.lookoutNotified || {})[p.id] = true;
        out.logs.push(noticeText(nm(g, t), acted));
      }
      return out;
    },
    /** 待機時間の演出（作者メモ）: 見張り番本人の画面でだけ、動いていた対象のカードが踊りだして数秒後に止まる（カードはめくれない） */
    stageSettle: {
      field: "settleLookoutDance", shown: "settleLookoutDanceShown",
      run: { order: 28, run(ids, SK) {
        const el = SK.$t(); if (!el) return;
        ids.forEach((id) => {
          const seat = el.querySelector(`.tb-seat[data-k="p:${id}"]`); if (!seat) return;
          const card = seat.querySelector(".tb-card") || seat;
          card.classList.add("tb-dance");
          SK.later(() => card.classList.remove("tb-dance"), 3200);
        });
      } },
      end(SK) { const el = SK.$t(); if (el) el.querySelectorAll(".tb-dance").forEach((n) => n.classList.remove("tb-dance")); },   // 昼になったら踊りを止める（保険）
    },
    // 結果開示(COボタン)の流れ: 見張った相手を選ぶ → 「行動していた / 行動していなかった」を選ぶ（マイクラ版の結果開示フォームと同じ）
    coResult: {
      kind: "lookout", targetLabel: "見張った相手", roleHint: "の見張り結果",
      optionList: () => [{ id: "acted", label: "行動していた" }, { id: "notacted", label: "行動していなかった" }],
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who} を見張っていました。結果は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        const acted = role === "acted";
        return [`${who} は夜に${acted ? "行動していました" : "行動していませんでした"}。`, { kind: "lookout", target: s.target, acted }, null, "disclose", `${who} → ${acted ? "行動していた" : "行動していなかった"}`];
      },
    },
  });
})(window.ONW = window.ONW || {});
