/**
 * 霊媒師（medium）: 村人陣営。マイクラ版 scripts の霊媒師を移植（第5バッチ・2役目）。
 * 仕様（マイクラ版 state.js ROLE_INFO / main.js の昼能力 / vote.js 準拠）:
 *   ・夜の能力は無い。昼能力で、昼議論中に死亡したプレイヤー1人の「最終役職」を調べる（1回だけ。カルメンに囁かれたら2回目も使え、対象・結果は上書き＝マイクラ版のマップ方式）。
 *   ・対象にできない人: 自分 / 昼議論中に死んでいない人（夜・待機時間の時点で既に死んでいた人は対象外）/ 呪殺で死亡した人。
 *     マイクラ版の対象は preVoteDeadIds（昼のはじめの呪殺とその連鎖を含む、投票前に死んだ人）から死因 curse / curse_kill / 呪殺 を除いたもの。
 *     Web版では、昼（ONLINE_DAY）に net.killPlayer で死んだ人を g.dayDeathIds に記録して同等にする（昼のはじめの呪殺 dayCurse も ONLINE_DAY に起きる）。
 *     呪殺の死因は Web版では deadKind "fox"（妖狐・妖狸共通。結果発表の dayLabel でも「呪殺」）。
 *   ・対象が1人もいないときは使っても消費されない（マイクラ版「霊媒できる死亡者がいません。」）。Web版は操作欄に同じ文を出して選べないようにする。
 *   ・結果は本人だけに通知される（「○○の役職は△△でした。」）。情報確認に残る（mediumdone は INFO_DAY）。結果発表の情報行には出ない（マイクラ版 vote.js に霊媒師の情報が無いため）。
 *   ・封印されていると使えない（封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。封印対象は 99 → 100 役）。
 *   ・兎の狂人: 草むらに隠れた人（死亡していても）を対象に選ぶと失敗して消費される（マイクラ版も chooseParticipant の共通ゲート failRabbitHiddenDayTarget で霊媒も失敗する）。Web版は hostMedium が ONW.rabbitMadman.dayGate を通す（羊・独裁と同じ）。
 *   ・トラップマスター（罠師）: 罠師の移植時に接続済み（hostMedium が ONW.trapMaster.dayGate を通す。罠を張られた人を霊媒しようとすると失敗して消費され、投票権を失う）。
 * 演出（作者メモ）: 死んだ人のカードから幽霊が出てきて、役職名の書かれた木の札を持って現れ、数秒後に戻る。
 *   ・出すのは霊媒師本人の画面だけ（結果が秘密情報のため。番犬の🦴・傭兵の🛡️と同じ本人だけの見せ方。解釈点として docs/medium.md に明記）。
 *   ・木の札の役職名は、役職カードと同じ改行で出す（ONW.ui.nameBr = 配布カードの役職名レンダリングそのもの。stage.js の NAME_BREAKS を通す）。
 * 変化候補（マイクラ版で確認）: 光の使徒の変化先にのみ入る（村人陣営）。闇の化身・銀色の影の対象外。
 *   コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に既存で含まれていて、移植と同時に有効化）。
 *   シャッフラーの山札に入る（除外リストに無い）。模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い）。
 *   ペルソナの仮面候補には入らない（マイクラ版 YAMINABE_PERSONA_INFO_ROLES = 占い師・感覚の占い師・指読み師・気まぐれな占い師のみ。
 *   霊媒師は最終役職をそのまま見るので、ペルソナが仮面を被っていても最終役職＝ペルソナと分かる。ペルソナ本体は第5バッチ3役目で移植）。
 * シナジー: カルメンの対象（roles.js の CARMEN_TARGET_ROLES に既存で含まれていて自動で有効化）。
 *   闇鍋シナジー（マイクラ版 YAMINABE_MEDIUM_DEATH_PACKS）: 霊媒師が出る闇鍋で、開拓者・保安官・ヴァニティ・模倣の人狼が
 *   1つも無いときだけ重み付きパックが足される。Web版は SYNERGY_COUNT_RULES の個数ルール（最低1枚）で保証条件を置き換えた。
 *   黄泉の対象外・鍵師の対象外（マイクラ版の各リストに無い）。
 * ハッキング: 銀狼にハッキングされて霊媒師だと思い込んだ人は、偽の昼能力（対象は本物と同じ死亡者から選び、結果はランダムな役職の偽通知。
 *   マイクラ版の偽通知「霊媒通知: ○○の役職は△△でした。」）。silver_wolf.js の DAY に medium を追加し、dayAct は死亡者を対象にできるよう専用分岐にした。
 * CPU: マイクラ版でも CPU は霊媒師の昼能力を自分からは使わない（Web版も羊・鼠と同じ。デバッグの昼能力でのみ使わせる）。
 *   真CO（cpuClaim）は名乗り＋結果があれば開示。騙り（cpuLie）はマイクラ版で霊媒師が騙り候補から外されていない（dayRoles に MEDIUM は無い）ため用意する。
 * デバッグ: デバッグの昼能力（kind: "medium"）で対象を指定して使える。
 * 状態: g.mediumTarget = { 本人: 対象 } / g.mediumResult = { 本人: 見た最終役職 } / g.mediumLog = [{ by, target, role }]（使った回数=カルメン判定用）
 *       g.dayDeathIds = [昼に死んだ人のID]（net.js の killPlayer が ONLINE_DAY のときだけ記録。スティーブの復活で外れる。ホスト引き継ぎキーにも追加済み）
 */
(function (ONW) {
  const ID = "medium";
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
  const rn = (r) => ONW.roles.getInfo(r).name;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const targetOf = (g, id) => (g && g.mediumTarget && g.mediumTarget[id]) || null;
  const resultOf = (g, id) => (g && g.mediumResult && g.mediumResult[id]) || null;
  const used = (g, id) => (g.mediumLog || []).filter((e) => e.by === id).length >= (ONW.carmen ? ONW.carmen.dayUses(g, id) : 1);
  /** 呪殺で死亡した人か（マイクラ版の死因 curse 相当。Web版の昼の呪殺は deadKind "fox" で記録される） */
  const isCurseDeath = (g, id) => (g.deadKind || {})[id] === "fox";
  /** 昼能力を使えるか（羊の狂人・鼠の狂人と同じ条件。封印されていると開けない） */
  function canUse(g, id) {
    return !!(g && g.phase === ONW.PHASE.ONLINE_DAY && !g.dayStartId && !g.dictator && !g.allDeadSkip && !isDead(g, id) && act(g, id) === ID && !used(g, id) && !ONW.seal.dayBlocked(g, id) && !ONW.hiddenDrunk(g, id));
  }
  /** 対象の候補そのもの（使えるかは見ない）: 昼議論中に死亡した自分以外の参加者（呪殺で死亡した人は除く。マイクラ版 preVoteDeadIds − 死因呪殺）。銀狼にハッキングされて思い込んだ人の偽UIも、対象の見た目を本物に合わせるためこれを使う */
  function targetList(g, id) {
    const day = new Set((g && g.dayDeathIds) || []);
    return ((g && g.players) || []).filter((p) => p.id !== id && isDead(g, p.id) && day.has(p.id) && !isCurseDeath(g, p.id)).map((p) => p.id);
  }
  /** 選べる相手: 使えるときだけ対象の候補を返す */
  function targets(g, id) {
    if (!canUse(g, id)) return [];
    return targetList(g, id);
  }
  /** 霊媒する: 対象の最終役職を記録する（2回目は対象・結果とも上書き＝マイクラ版のマップ方式） */
  function apply(g, id, target) {
    if (!target || !targets(g, id).includes(target)) return null;
    const role = (g.currentRoles || {})[target] || (g.initialRoles || {})[target] || "villager";
    (g.mediumTarget = g.mediumTarget || {})[id] = target;
    (g.mediumResult = g.mediumResult || {})[id] = role;
    (g.mediumLog = g.mediumLog || []).push({ by: id, target, role });
    return { by: id, target, role };
  }
  const doneText = (name, role) => `${name}の役職は${rn(role)}でした。`;
  const coText = doneText;
  const coShort = (name, role) => `${name} → ${rn(role)}`;

  // ---- CPUの発言 ----
  /** 霊媒師の騙り: 死亡した人（いなければ他の参加者）の役職を適当に言う（マイクラ版のCPU結果報告 kind "medium" と同じ形） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const dead = others.filter((q) => (g.deadIds || []).includes(q.id));
    const pool = dead.length ? dead : others;
    if (!pool.length) return null;
    const t = k.pick(pool);
    const roles = ONW.roleIds().filter((r) => r !== ID && k.roleInSetup(g, r));
    const role = roles.length ? k.pick(roles) : "villager";
    return { co, result: { short: coShort(t.name, role), text: coText(t.name, role), claim: { kind: ID, target: t.id, role } } };
  }
  /** 本物の霊媒師の発言: 名乗りは必ずする。結果（デバッグ等で使った分）があれば開示する（マイクラ版の結果報告と同じ文） */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = ID;
    const t = targetOf(g, p.id), role = resultOf(g, p.id);
    if (t && role) { const nm = k.nameOf(g, t); c.result = { short: coShort(nm, role), text: coText(nm, role), claim: { kind: ID, target: t, role } }; }
  }
  /** 霊媒したあとのCPUの発言（net.js hostMedium が、使ったのがCPUで生きているときに呼ぶ。デバッグで使わせたときだけ） */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const nm = k.nameOf(g, e.target);
    return [{ p, text: doneText(nm, e.role), short: coShort(nm, e.role), result: true, claim: { kind: ID, target: e.target, role: e.role }, gap: 3500 }];
  }

  /** 実績（マイクラ版 stats.js / wiki の実績定義と同じ条件） */
  function achievements(g, id, won) {
    const out = [], init = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
    if (init === ID || fin === ID) out.push("first_medium");
    if (fin === ID && won) out.push("win_medium");
    return out;
  }

  // ---- 演出（作者メモ）: 死んだ人のカードから幽霊が出て、役職名の書かれた木の札を持って現れ、数秒後に戻る ----
  const reduceMotion = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function removeFx() { if (typeof document !== "undefined") document.querySelectorAll(".md-fx").forEach((e) => e.remove()); }
  /** 役職名の HTML（役職カードと同じ改行: 配布カードの ui.nameBr をそのまま使う。無ければ stage.breakHtml） */
  function nameHtml(role) {
    const name = rn(role);
    if (ONW.ui && ONW.ui.nameBr) return ONW.ui.nameBr(name);
    if (ONW.stage && ONW.stage.breakHtml) return ONW.stage.breakHtml(name);
    return esc(name);
  }
  /**
   * 幽霊の演出（霊媒師本人の画面だけ。mediumdone を受けたクライアントが呼ぶ）。
   * target の席のカードから 👻 が木の札（役職名入り）を持って浮かび上がり、数秒いてから沈んで戻る。
   * quiet（再入室の復元）では出さない（結果の文だけ情報確認に戻る）。
   */
  function play(target, role, quiet) {
    if (!target || !role || quiet || typeof document === "undefined") return;
    const g = ONW.game;
    if (!g || g.phase !== ONW.PHASE.ONLINE_DAY || g.isSpectator) return;
    removeFx();
    const seat = document.querySelector(`.tb-seat[data-k="p:${target}"]`);
    if (!seat) return;
    const r = seat.getBoundingClientRect();
    if (!r.width) return;
    const el = document.createElement("div");
    el.className = "md-fx";
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top}px`;
    el.style.width = `${Math.max(r.width, 64)}px`;
    el.innerHTML = `<div class="md-ghost">👻</div><div class="md-tag"><span class="md-tag-hole"></span><b class="md-tag-name">${nameHtml(role)}</b></div>`;
    document.body.appendChild(el);
    const kill = setTimeout(() => el.remove(), 4200);
    if (el.animate && !reduceMotion()) {
      const a = el.animate([
        { opacity: 0, transform: "translate(-50%, 10px) scale(.7)" },
        { opacity: 1, transform: "translate(-50%, -34px) scale(1)", offset: 0.16 },
        { opacity: 1, transform: "translate(-50%, -40px) scale(1.02)", offset: 0.55 },
        { opacity: 1, transform: "translate(-50%, -36px) scale(1)", offset: 0.8 },
        { opacity: 0, transform: "translate(-50%, 4px) scale(.85)" },
      ], { duration: 3400, easing: "ease-in-out" });
      if (a && a.finished) a.finished.then(() => { clearTimeout(kill); el.remove(); }).catch(() => {});
    } else {
      el.style.opacity = "1";
      el.style.transform = "translate(-50%, -36px)";
      setTimeout(() => { clearTimeout(kill); el.remove(); }, 2600);
    }
  }

  ONW.defineRole(ID, {
    info: {
      sealTarget: true,   // マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている
      deck: 157, name: "霊媒師", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.03,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、昼議論中に死亡したプレイヤー1人を選ぶと、その人の最終役職が分かります（結果は自分だけに伝わります）。呪殺で死亡したプレイヤーは対象にできません。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に霊媒師を持っている人が使えます。",
    },
    groups: { "transform:light_apostle": 36 },   // 光の使徒の変化先（村人系）のみ。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）
    achievements,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 霊媒した相手を選ぶ → その人の役職を選ぶ（マイクラ版 main.js の霊媒COと同じ。「伏せる」も選べる）
    coResult: {
      kind: ID, targetLabel: "霊媒した相手", roleHint: "の役職", noChain: true,
      pickRole(role, who, s, K) {
        if (role === "hide") return [`${who}を霊媒しました。結果は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
        return [coText(who, role), { kind: ID, target: s.target, role }, null, "disclose", coShort(who, role)];
      },
    },
    cpuLie: { role: ID, weight: 20, order: 2, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示（マイクラ版は霊媒師を騙り候補から外していない）
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    cpuSpeak,   // デバッグで使わせたCPUが、その場で結果を言う
  });
  ONW.medium = { canUse, targets, targetList, apply, targetOf, resultOf, used, isCurseDeath, doneText, coText, coShort, achievements, play };
})(window.ONW = window.ONW || {});
