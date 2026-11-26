"use strict";
/* 心理士（psychologist）: 村人陣営。wiki order 55 / deck 182。
 * マイクラ版（roles.js ROLE_INFO / main.js の昼能力フロー・psychologistGroupOf / game.js のカルメン付与 /
 * silverWolfFakeRoleResult / cpu.js の真申告・騙り / stats.js の実績）を確認して移植した。
 *
 * ・昼能力（議論中）: 自分以外の生存している参加者から2人を選び、2人の「最終役職の陣営扱い」が
 *   同じ（適合）か別（不適合）かを検査する。結果は本人にだけ通知され、情報確認に残る。
 *   演出（作者メモ）: 選んだ2人のカードが本人の画面でめくれ、適合なら両方に「適合」、
 *   不適合なら両方に「未適合」の面が出る（stage.js の PSY_MATCH_MARK "__psymatch" /
 *   PSY_MISMATCH_MARK "__psymismatch"。「適合」の文字色は緑、「未適合」は赤=助手判断。作者メモで色は一任）。
 * ・適合の定義（マイクラ版 psychologistGroupOf の移植。優先順）:
 *   1. 恋人グループに属していれば、そのグループ（同じ恋人グループどうしは同陣営扱い）
 *   2. 反転が付いていれば「反転:<反転者の集合>」。最終役職が反転者で対象がいれば「反転:<自分>」
 *   3. シャッフラーの印があれば「シャッフラー:<置いたシャッフラーの持ち主>」。最終役職がシャッフラーで
 *      印を置いていれば「シャッフラー:<自分>」
 *   4. 最終役職ベース: 狼憑き・黒子の狂人・昇格した狂人・本物の人狼は「人狼」扱い /
 *      妖狐・狐憑き・狂信者は「妖狐」扱い / 狂人系は「村人」扱い /
 *      第三陣営は役職ごとに別扱い（同じ役職どうしは同陣営扱い）/ それ以外は「村人」扱い
 *   ※マイクラ版は finalRoles（最終役職）だけで判定する（模倣の実効役職では判定しない）。
 *   ※Web版の恋人グループは loverOf（恋人の重なり）・cupidPair（キューピッド）・pureLoverTargets（純愛者）の
 *     ペアの連結成分で近似した（マイクラ版 loverGroupsByPlayer 相当）。
 * ・使用回数: 1日に1回。カルメンに村人陣営として囁かれると+1回（マイクラ版 grantCarmenDayExtraUses に
 *   心理士が含まれる。Web版は ONW.carmen.dayUses で共通化）。
 * ・共通干渉（net.js の hostPsychologist）: 封印中は使えない（seal.dayBlocked）。鍵師に能力ロックされた
 *   対象はマイクラ版どおり検査できる（心理士は鍵師ロックの対象外=能力自体は使える。対象側のロックは無関係）。
 *   兎の狂人の草むら: 対象のどちらかが草むらの人なら全体が失敗して消費される（dayGate）。
 *   罠師の罠: 対象のどちらかが罠対象で罠が発動すれば失敗して消費され、使った人は投票権を失う（dayGate）。
 *   猿凸の対象ではない（保安官・ヴァニティ・独裁者・天秤のみ）。多重人格の反転トリガーに接続（mpDay）。
 *   静観者・龍の狂人・鈴の巫女への「使われた」記録は watcher.touch（成功時のみ。ゲート失敗時は数えない=
 *   罠師移植時の統一解釈どおり）。
 * ・結果の記録: マイクラ版は game.psychologistResult[本人] に最後の1回だけを残す（実績・CPUの真申告が参照）。
 *   Web版はそれに加えて psychologistLog に全回分を残し、結果発表の役職情報（lines）と情報確認に使う
 *   （第6バッチ以降の作者指示「情報確認にちゃんと出るように」）。
 * ・ハッキング: 思い込みの対象にも対象にもなる。思い込んだ人は昼に偽の対象2人を選び、ランダムな
 *   適合/不適合の文だけが返る（silver_wolf.js の DAY テーブル。本物の盤面には影響しない。マイクラ版
 *   silverWolfFakeRoleResult は対象名を含まない文だが、Web版の偽昼能力は天秤と同じく対象名入りの文で統一）。
 *   ハッキングされている本物の心理士は検査できない（canUse の actRole 判定で弾かれる）。
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 光の使徒の変化先にのみ入る（村人陣営）。
 *   闇の化身・銀色の影の対象外。コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に最初から入っている）。
 *   シャッフラーの山札に入る（マイクラ版に除外リストなし）。模倣できる（NON_MIMICABLE_ROLES に無い）。
 *   ペルソナの仮面候補に入る（PERSONA_MASK_EXCLUDED_ROLES に無い）。
 * ・封印対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES）: 対象（115役目）。
 * ・実績（マイクラ版 stats.js）: first / win / loss / match（同陣営扱いの2人を選んだ）/
 *   mismatch（別陣営扱いの2人を選んだ）/ two_masons（2人とも最終役職が共有者）。判定は
 *   game.psychologistResult（最後の検査）で行う=マイクラ版どおり。
 * ・CPU: 自発的には使わない（マイクラ版もデバッグ経路のみ）。真COでは記録した検査結果を開示し、
 *   騙りでは適当な2人とランダムな結果を言う（マイクラ版 cpu.js）。
 */
(() => {
  const ID = "psychologist";
  const fin = (g, id) => (g.currentRoles || {})[id];
  const ini = (g, id) => (g.initialRoles || {})[id];
  const nm = (g, id) => { const p = (g.players || []).find((x) => x.id === id); return p ? p.name : id; };
  const eff = (g, id) => ONW.mimic.actRole(g, id, fin(g, id));   // 模倣の人狼が心理士を模倣しているときも使える

  /** 恋人グループのキー（同じグループなら同じ文字列）。恋人でなければ null */
  function loverGroupKey(g, id) {
    const pairs = [];
    const lo = g.loverOf || {};
    for (const a of Object.keys(lo)) if (lo[a]) pairs.push([a, lo[a]]);
    const cp = g.cupidPair || {};
    for (const h of Object.keys(cp)) { const v = cp[h]; if (Array.isArray(v)) { if (v[0] && v[1]) pairs.push([v[0], v[1]]); } else if (v) pairs.push([h, v]); }
    const pl = g.pureLoverTargets || {};
    for (const h of Object.keys(pl)) if (pl[h]) pairs.push([h, pl[h]]);
    const adj = {};
    pairs.forEach(([a, b]) => { if (!a || !b || a === b) return; (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); });
    if (!adj[id]) return null;
    const seen = new Set([id]), st = [id];
    while (st.length) { const x = st.pop(); for (const y of adj[x] || []) if (!seen.has(y)) { seen.add(y); st.push(y); } }
    return "lover:" + [...seen].sort().join(",");
  }

  /** マイクラ版 psychologistGroupOf: その人の「陣営扱い」を表す文字列。同じ文字列どうしが適合 */
  function groupOf(g, id) {
    if (!id) return "village";
    const lk = loverGroupKey(g, id);
    if (lk) return lk;
    if (ONW.reverser && ONW.reverser.stacks) {
      const st = (ONW.reverser.stacks(g) || {})[id] || [];
      if (st.length) return "reversal:" + [...new Set(st)].sort().join(",");
      if (fin(g, id) === "reverser" && (g.reverserTarget || {})[id]) return "reversal:" + id;
    }
    const card = ONW.cardAt ? ONW.cardAt(g, id) : id;
    const raw = (g.shufflerMarks || {})[card];
    const marks = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const mk of marks) {
      if (mk && mk.by) { const owner = ONW.shuffler && ONW.shuffler.holderOfCard ? ONW.shuffler.holderOfCard(g, mk.by) : null; if (owner) return "shuffler:" + owner; }
    }
    if (fin(g, id) === "shuffler" && ONW.cardAt) {
      const own = ONW.cardAt(g, id);
      const placed = Object.values(g.shufflerMarks || {}).some((v) => (Array.isArray(v) ? v : [v]).some((mk) => mk && mk.by === own));
      if (placed) return "shuffler:" + id;
    }
    const role = fin(g, id);
    if (role === "wolf_marked" || role === "black_wolf_madman") return "wolf";
    if ((g.promotedWolfIds || []).includes(id)) return "wolf";
    if (role === "fox" || role === "fox_marked" || role === "fanatic") return "fox";
    const team = role ? (ONW.roles.getInfo(role) || {}).team : null;
    const isMad = !!role && !!ONW.MAD_KIND && (typeof ONW.MAD_KIND.has === "function" ? ONW.MAD_KIND.has(role) : ONW.MAD_KIND.includes(role));
    if (team === ONW.TEAM.WOLF && !isMad) return "wolf";   // 本物の人狼（狂人系を除く）
    if (isMad) return "village";
    if (team === ONW.TEAM.THIRD) return "third:" + role;
    if (team === ONW.TEAM.WOLF) return "wolf";
    return "village";
  }
  const matched = (g, a, b) => groupOf(g, a) === groupOf(g, b);

  const usedCount = (g, id) => ((g && g.psychologistLog) || []).filter((e) => e.by === id).length;
  const limit = (g, id) => (ONW.carmen && ONW.carmen.dayUses) ? ONW.carmen.dayUses(g, id) : 1;

  function canUse(g, id) {
    if (!g || g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId || g.dictatorId || g.allDeadSkip) return false;
    const me = (g.players || []).find((p) => p.id === id);
    if (!me || (g.deadIds || []).includes(id)) return false;
    if (eff(g, id) !== ID) return false;
    if (usedCount(g, id) >= limit(g, id)) return false;
    if (ONW.seal && ONW.seal.dayBlocked && ONW.seal.dayBlocked(g, id)) return false;   // 封印中は使えない
    if (ONW.hiddenDrunk && ONW.hiddenDrunk(g, id)) return false;                        // 酔い未覚醒
    return true;
  }
  /** 対象: 自分以外の生存している参加者（マイクラ版 participantOptionsForDay(myId, false)） */
  function targets(g, id) {
    return (g.players || []).filter((p) => p.id !== id && !(g.deadIds || []).includes(p.id)).map((p) => p.id);
  }
  /** 検査を実行して記録する（検証済みの2人が前提。呼び出し側でゲートを通すこと） */
  function apply(g, id, a, b) {
    const m = matched(g, a, b);
    (g.psychologistResult = g.psychologistResult || {})[id] = { firstId: a, secondId: b, matched: m };   // マイクラ版と同じ形（最後の1回）
    (g.psychologistLog = g.psychologistLog || []).push({ by: id, firstId: a, secondId: b, matched: m });
    return m;
  }

  const attemptText = (g, a, b) => `あなたは ${nm(g, a)} と ${nm(g, b)} を検査しました。`;
  const resultText = (m) => m ? "二人の検査結果は適合しました。" : "二人の検査結果は適合しませんでした。";
  const doneText = (A, B, m) => `${A}と${B}の検査結果は${m ? "適合しました" : "適合しませんでした"}。`;
  const coText = doneText;
  const coShort = (A, B, m) => `${A}と${B} → ${m ? "適合" : "不適合"}`;

  /** 結果発表の「役職情報」の行（Web版独自文: 第6バッチ以降の作者指示で情報確認・結果に残す） */
  function lines(g, nameOf) {
    return ((g && g.psychologistLog) || []).map((e) => ({ text: `${nameOf(e.by)} は ${nameOf(e.firstId)} と ${nameOf(e.secondId)} を検査し、${e.matched ? "適合" : "不適合"}でした。` }));   // 表示側（ui.js）が「心理士:」を付ける
  }

  /** 実績（マイクラ版 stats.js と同じ条件） */
  function achievements(g, id, won) {
    const out = [];
    if (ini(g, id) === ID || fin(g, id) === ID) out.push("first_psychologist");
    if (fin(g, id) === ID) out.push(won ? "psychologist_win" : "psychologist_loss");
    const r = (g.psychologistResult || {})[id];
    if (r) {
      out.push(r.matched ? "psychologist_match" : "psychologist_mismatch");
      if (fin(g, r.firstId) === "mason" && fin(g, r.secondId) === "mason") out.push("psychologist_two_masons");
    }
    return out;
  }

  /** 本物の心理士のCPU発言: 名乗りは必ずする。結果（デバッグ等で使った分）があれば開示する */
  function cpuClaim(k, g, p, r, i, c) {
    c.co = ID;
    const e = (g.psychologistResult || {})[p.id];
    if (e) { const A = k.nameOf(g, e.firstId), B = k.nameOf(g, e.secondId); c.result = { short: coShort(A, B, e.matched), text: coText(A, B, e.matched), claim: { kind: ID, first: e.firstId, second: e.secondId, matched: e.matched } }; }
  }
  /** 検査したあとのCPUの発言（net.js hostPsychologist が、使ったのがCPUで生きているときに呼ぶ。デバッグで使わせたときだけ） */
  function cpuSpeak(k, g, p, e) {
    if (!e) return [];
    const A = k.nameOf(g, e.firstId), B = k.nameOf(g, e.secondId);
    return [{ p, text: coText(A, B, e.matched), short: coShort(A, B, e.matched), result: true, claim: { kind: ID, first: e.firstId, second: e.secondId, matched: e.matched }, gap: 3500 }];
  }
  /** 騙り: 適当な2人とランダムな結果をでっち上げる（マイクラ版 cpu.js の騙り） */
  function lieClaim(k, g, p, others, selfRole, co) {
    const pool = (others || []).filter((q) => !(g.deadIds || []).includes(q.id));
    if (pool.length < 2) return null;
    const a = k.pick(pool);
    let b = k.pick(pool);
    if (b.id === a.id) b = pool[(pool.indexOf(a) + 1) % pool.length];
    const m = Math.random() < 0.5;
    return { co, result: { short: coShort(a.name, b.name, m), text: coText(a.name, b.name, m), claim: { kind: ID, first: a.id, second: b.id, matched: m } } };
  }

  ONW.psychologist = { canUse, targets, apply, groupOf, matched, usedCount, limit, attemptText, resultText, doneText, lines, achievements, coText, coShort };

  ONW.defineRole(ID, {
    info: { sealTarget: true, deck: 182, name: "心理士", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 24.7,
      desc: "昼に2人を選び、2人の最終役職が同じ陣営扱いかどうかを検査します。\n同じ陣営扱いなら適合、別陣営扱いなら不適合と分かります。" },
    groups: { "transform:light_apostle": 57 },   // 変化候補は光の使徒のみ（マイクラ版 TRANSFORM_ROLE_GROUPS）
    achievements,
    // 結果開示(COボタン)の流れ(co.js が kind で引く): 検査した1人目を選ぶ → 2人目を選ぶ → 適合した/適合しなかったを選ぶ（マイクラ版 main.js の心理士COと同じ）
    coResult: { kind: ID, noChain: true, coText, coShort },
    cpuLie: { role: ID, weight: 4, order: 55, claim: lieClaim },   // 騙りで名乗る確率の重み(order 順に抽選)と、騙りの結果開示（マイクラ版は心理士を騙り候補から外していない）
    cpuClaim,   // CPUの昼の発言(CO・結果開示)
    cpuSpeak,   // デバッグで使わせたCPUが、その場で結果を言う
    // 演出（作者メモ）: 心理士本人の画面で、選んだ2人のカードが「適合」（適合したとき）/「未適合」（しなかったとき）の面でめくれて裏に戻る
    stageFlash: {
      field: "psyFlash", when: "early",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => {
          const k = `p:${x.id}`;
          SK.up[k] = x.matched ? "__psymatch" : "__psymismatch"; SK.glow[k] = true;
          SK.paint(SK.G());
        }, 150 + i * 380));
        SK.later(() => {
          list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; });
          SK.paint(SK.G());
        }, 150 + list.length * 380 + 2600);
      },
    },
  });
})();
