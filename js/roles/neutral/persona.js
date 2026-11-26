/**
 * persona.js — ペルソナ（第三陣営 / deck 158 / wiki order 175 / 発案: 未確認）
 *
 * ・配役時点で、現世にいる（参加者の最終＝初期役職の）ランダムな役職の「仮面」を被る
 *   （マイクラ版 roles.js assignPersonaMasks）。仮面の候補プールは参加者全員の最終（無ければ初期）
 *   役職から、除外リスト（ペルソナ・なのか・ドッペルゲンガー・魔法使い・負け組・墓荒らし・乞食・
 *   ホタル・シャッフラー・姫君）を除いたもの。重複はそのまま（持っている人が多い役職ほど出やすい）。
 *   墓地のペルソナにも仮面が付く。仮面を被れる候補が無ければ仮面なし。
 * ・仮面は「見た目だけ」: 演じた役職の能力は使えない（夜の行動なし・昼能力なし）。
 *   占い系には仮面の役職として見える（下の「既存役職への接続」）。勝利条件だけが仮面に連動する。
 * ・勝利条件（マイクラ版 vote.js applyPersonaMaskWinnerConsistency。vote.js の set の最後で適用）:
 *   最終役職がペルソナの人は、「最終役職が仮面役職の勝者」が1人でもいれば追加勝利（勝利陣営に
 *   「ペルソナ」が加わる）。いなければ敗北（勝者に入っていても外れる。仮面役職が上書きで
 *   盤面から消えていた場合も敗北）。
 * ・仮面（g.personaMaskRole）は「カードに付いて動く」記録（ONW.ROLE_BOUND_KEYS）:
 *   怪盗・いたずらっ子の交換ではカードと一緒に移り、墓地との交換では墓地キー（"g:番号"）と
 *   入れ替わる（マイクラ版 swapPersonaMaskRoleWithCenter）。コピー（ドッペルゲンガー・
 *   グレムリン）ではコピー元の仮面がそのまま移る（マイクラ版 copyPersonaMaskRole）。
 *   魔法使いに盗まれたときも LINK_KEYS（ROLE_BOUND_KEYS）経由で仮面ごと移る。
 *   別の役職に上書きされると消え、ペルソナでなくなった人の仮面は残らない。
 *   ペルソナになったのに仮面が無い場合は、その場で新しく決める（マイクラ版
 *   randomPersonaMaskRole の都度割り当て）。
 *
 * ・演出（作者メモ）: 配布時、ペルソナとしてめくれたあと、仮面をかぶる役職名が書かれた仮面が
 *   出てきて、ペルソナの役職名のところに被り、役職名がその役職になる（ui.js renderOnlineRole /
 *   renderSpecDeal の .dl-mask。stage.js のテーブル面でも .tb-mask で同じ見せ方）。
 *   銀色の影→ペルソナの変化表示は「ペルソナ（+役職名）」の形にする（作者の明示指定）:
 *   変化公開の文（net.js announceTransforms）と結果発表の役職の流れ（buildResultObj の segs の札）、
 *   配布画面の「銀色の影 → ペルソナ（+仮面役職） に変化しました」に反映する。
 *   マイクラ版の状態ラベル currentRoleStateLabel（ペルソナ(+仮面役職名)・仮面役職の陣営色）と同じ形。
 *
 * ・既存役職への接続（マイクラ版の定義どおり）:
 *   - 占い師・狂った占い師・ケセド: ONW.mimic.seerSeen（mimic_wolf.js）にペルソナ分岐を追加。
 *     見えるのは「表示用の仮面役職」（personaDisplayedRole: 狼憑き・黒狼の狂人→人狼 / 狐憑き→妖狐 /
 *     白狼→村人 / それ以外は仮面そのまま）を ONW.seerSees に通したもの。仮面が蜃気狼なら
 *     盤面にあり得るランダムな役職（ONW.mirage.seerRole。蜃気狼本人への確認記録は付けない＝
 *     マイクラ版 roleForPlayerSeerResult どおり）。
 *   - 感覚の占い師: sense_seer.js judge にペルソナ分岐（仮面の表示役職の気配。恋人・蜃気狼より先に
 *     見る＝マイクラ版 senseSeerMessage の順）。分類はマイクラ版の分岐どおり baseTeamOf 基準
 *     （人狼系→人狼 / 狂人系→狂人 / 第三陣営→第三 / それ以外→村人）。
 *   - 心眼の人狼: mind_wolf.js apply にペルソナ分岐（見抜く最終役職 = 表示用の仮面役職。
 *     蜃気狼の仮面なら ONW.mirage.dayRole）。
 *   - なのかの写真撮影: nanoka.js photoTeamKey にペルソナ分岐（気配は表示用の仮面役職の陣営。
 *     マイクラ版 main.js の写真判定どおり。勝利判定は従来どおり対象の素の最終役職）。
 *   - 気まぐれな占い師: 仮面を見抜く（本当の初期役職＝ペルソナが見える。whimsical_seer.js は
 *     実装済みで変更なし）。指読み: 初期役職をそのまま見るのでペルソナが見える（変更なし）。
 *     霊媒師: 最終役職をそのまま見るのでペルソナが見える（変更なし）。
 *   - 妖狐の呪殺: 最終役職で判定するので、仮面が妖狐でもペルソナは呪殺されない（変更なし）。
 *   - 銀狼のハッキング: 思い込み先になる。ペルソナと思い込んだ人には偽の仮面（1回だけ決めて
 *     g.personaFakeMask に保存。silver_wolf.js baseView の persona 分岐と配布カードの仮面表示）。
 *     本物のペルソナがハッキングされた場合は通常の偽UI（本当の夜情報は出ない）。
 *
 * ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS で確認）: 銀色の影の変化先に**入る**。
 *   光の使徒・闇の化身には入らない。コスプレイヤーの山札には入らない（cosplayerEligibleRoles に無い）。
 *   シャッフラーの山札には**入る**（shufflerEligibleRoles の除外に無い。Web版 BLOCKED にも無いので
 *   登録だけで自動で入る。置かれたら state.js shufflerPlace が仮面を決める）。
 *   模倣の人狼は第三陣営を模倣できない（Web版の共通ルール。勝負師と同じ）。
 * ・封印対象では**ない**（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っていない。封印対象は100役のまま）。
 * ・闇鍋シナジー（マイクラ版 YAMINABE_PERSONA_INFO_ROLES = 占い師・感覚の占い師・指読み・
 *   気まぐれな占い師）: ペルソナが出る闇鍋には、この情報役職が合わせて最低1枚出る
 *   （roles.js の SYNERGY_COUNT_RULES に追加。wiki/js/synergy-data.js の控えにも追加）。
 * ・カルメン・黄泉・鍵師の対象リストには入っていない（マイクラ版の各対象リストに無い）。
 * ・乞食: 「取れない対象」に入っていないので取れる（仮面は ROLE_BOUND_KEYS で移る）。
 * ・デバッグ: 仮面役職の指定 = ONW.debug.personaMask（game.dbg.persona[ID]）。
 *   変化先の指定（銀色の影→ペルソナ）は TRANSFORM_GROUPS 経由で自動。
 * ・実績（マイクラ版 stats.js / wiki）: first_persona「もう一人の自分」/ win_persona「我は汝、汝は我」/
 *   persona_stolen_by_robber「心の怪盗団」（怪盗にペルソナを盗まれる）。Web版には実績の保存が
 *   無いので判定関数だけ返す（盗まれ判定は roleTrail で「ペルソナ → 別役職」に変わり、かつ
 *   誰かの履歴に「怪盗 → ペルソナ」があれば、の近似）。
 * ・CPU: 夜の行動なし。COは仮面役職を名乗る（cpuClaim。能力は使えないので結果開示はしない。
 *   マイクラ版CPUにペルソナ固有の騙り生成は無く、仮面を演じるのが役職の性質に合う）。
 *   投票は第三陣営の通常の動き。
 *
 * 状態: g.personaMaskRole = { 持ち主ID（または墓地キー "g:番号"）: 仮面役職ID }（カードに付いて動く）
 *       g.personaFakeMask = { ハッキングされた人のID: 偽の仮面役職ID }（銀狼の偽UI用。1回だけ決める）
 * 呼び出し: 配役 = net.js startOnlineGame → ONW.persona.assignAll（クローンのあと・ハッキングより前）。
 * 詳細は docs/persona.md。
 */
(function (ONW) {
  const ID = "persona";
  /** 仮面の候補から外れる役職（マイクラ版 PERSONA_MASK_EXCLUDED_ROLES） */
  const EXCLUDED = new Set([ID, "nanoka", "doppelganger", "magician", "loser", "relic_robber", "beggar", "hotaru", "shuffler", "princess"]);
  const rn = (r) => (ONW.ROLE_INFO[r] || {}).name || "?";

  /** その持ち主（プレイヤーID / 墓地キー）の仮面役職（無ければ null） */
  function maskOf(g, key) { return ((g && g.personaMaskRole) || {})[key] || null; }

  /** 仮面の候補プール（マイクラ版 personaMaskCandidates: 参加者の最終＝初期役職から除外リストを除く。重複あり） */
  function candidates(g) {
    const cur = (g && g.currentRoles) || {}, ini = (g && g.initialRoles) || {};
    return (g.players || []).map((p) => (cur[p.id] !== undefined ? cur[p.id] : ini[p.id])).filter((r) => r && !EXCLUDED.has(r));
  }

  /** 仮面を1つ引く（デバッグ指定があれば優先。候補が無ければ null） */
  function drawMask(g, key) {
    const spec = ONW.debug && ONW.debug.personaMask ? ONW.debug.personaMask(g, key) : null;
    if (spec && !EXCLUDED.has(spec) && ONW.ROLE_INFO[spec]) return spec;
    const pool = candidates(g);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  /** 仮面を決める（決まっていればそれを返す。マイクラ版の都度割り当て randomPersonaMaskRole） */
  function ensure(g, key) {
    if (!g || !key) return null;
    g.personaMaskRole = g.personaMaskRole || {};
    if (g.personaMaskRole[key]) return g.personaMaskRole[key];
    const m = drawMask(g, key);
    if (m) g.personaMaskRole[key] = m;
    return m;
  }

  /** 配役時の一括割り当て（マイクラ版 assignPersonaMasks。初期・最終のどちらかがペルソナの参加者全員＋墓地のペルソナ） */
  function assignAll(g) {
    if (!g) return;
    g.personaMaskRole = g.personaMaskRole || {};   // 既に決まっている仮面は変えない（マイクラ版の都度割り当てと同じ get-or-assign）
    (g.players || []).forEach((p) => {
      const ini = (g.initialRoles || {})[p.id], cur = (g.currentRoles || {})[p.id];
      if (ini === ID || cur === ID) ensure(g, p.id);
    });
    (g.center || []).forEach((r, i) => { if (r === ID) ensure(g, "g:" + i); });
  }

  /** 墓地からペルソナを引いたあと（state.js ONW.swapGrave から。カードに付いてきた仮面が無ければ決める） */
  function afterGrave(g, id) { return ensure(g, id); }

  /** 表示用の仮面役職（マイクラ版 personaDisplayedRole: 狼憑き・黒狼の狂人→人狼 / 狐憑き→妖狐 / 白狼→村人。仮面が無ければペルソナ） */
  function displayedRole(mask) {
    if (!mask) return ID;
    if (mask === "wolf_marked" || mask === "black_wolf_madman") return "werewolf";
    if (mask === "fox_marked") return "fox";
    if (mask === "white_wolf") return "villager";
    return mask;
  }

  /** 持ち主 key の「占い系に見える役職」の元（表示用の仮面役職）。仮面が無ければ null（呼び出し側は通常の見え方に落とす） */
  function displayFor(g, key) {
    const m = maskOf(g, key);
    return m ? displayedRole(m) : null;
  }

  /** 銀狼にペルソナと思い込まされた人の偽の仮面（1回だけ決めて保存。マイクラ版 showSilverWolfFakeNightInfo の都度ランダムに相当するが、配布カードと夜情報で同じ仮面に見えるよう保存する） */
  function fakeMask(g, id) {
    if (!g || !id) return null;
    g.personaFakeMask = g.personaFakeMask || {};
    if (g.personaFakeMask[id]) return g.personaFakeMask[id];
    const pool = candidates(g);
    const m = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
    if (m) g.personaFakeMask[id] = m;
    return m;
  }

  /** 結果発表・観戦者に出す「席キー → 仮面役職ID」（模倣・クローンの pubMap と同じ形）。final=true: 最終役職がペルソナの席 / false: 初期役職がペルソナの席。墓地のペルソナの仮面はどちらの場合も出す（仮面は配布時からカードに付いている） */
  function pubMap(g, final) {
    const out = {}, roles = final ? (g.currentRoles || {}) : (g.initialRoles || {});
    (g.players || []).forEach((p) => { if (roles[p.id] === ID) { const m = maskOf(g, p.id); if (m) out["p:" + p.id] = m; } });
    (g.center || []).forEach((r, i) => { if (r === ID) { const m = maskOf(g, "g:" + i); if (m) out["g:" + i] = m; } });
    return out;
  }

  /** 結果発表の「役職情報」の行（マイクラ版 vote.js の「ペルソナ {名前} は {仮面役職} の仮面を被っていました。」。最終役職がペルソナの参加者だけ） */
  function infoLines(g) {
    return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => ({ by: p.name, role: maskOf(g, p.id) }));
  }

  /** 勝利の整合（マイクラ版 applyPersonaMaskWinnerConsistency）。vote.js の set の最後（勝者が確定したあと）に呼ぶ。
   *  最終役職がペルソナの人: 最終役職が仮面役職の勝者がいれば勝者に入れ（追加勝利）、いなければ勝者から外す。
   *  1人でも追加勝利したら teams に「ペルソナ」を足す。戻り値: 追加勝利したペルソナのID配列 */
  function applyWinners(g, w, teams) {
    const won = [];
    (g.players || []).forEach((p) => {
      if ((g.currentRoles || {})[p.id] !== ID) return;
      const mask = maskOf(g, p.id);
      const has = !!mask && [...w].some((id) => (g.currentRoles || {})[id] === mask);
      if (has) { w.add(p.id); won.push(p.id); } else w.delete(p.id);
    });
    if (won.length && teams && !teams.includes("ペルソナ")) teams.push("ペルソナ");
    return won;
  }

  /** 実績（マイクラ版 stats.js と同じ条件。Web版に保存が無いので判定だけ） */
  function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === ID || cur === ID) out.push("first_persona");
    if (cur === ID && won) out.push("win_persona");
    const trail = (g.roleTrail || {})[id] || [];
    if (ini === ID && cur !== ID && trail.length) {   // 怪盗にペルソナを盗まれた（近似: 自分はペルソナから変わり、誰かの履歴に「怪盗 → ペルソナ」がある）
      const stolen = (g.players || []).some((q) => { const t = (g.roleTrail || {})[q.id] || []; return t.some((r, k) => r === ID && k > 0 && t[k - 1] === "robber") || ((g.initialRoles || {})[q.id] === "robber" && (g.currentRoles || {})[q.id] === ID); });
      if (stolen) out.push("persona_stolen_by_robber");
    }
    return out;
  }

  const P = (ONW.persona = { EXCLUDED, maskOf, candidates, ensure, assignAll, afterGrave, displayedRole, displayFor, fakeMask, pubMap, infoLines, applyWinners, achievements, rn });

  ONW.defineRole(ID, {
    info: { deck: 158, name: "ペルソナ", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 59,
      desc: "第三陣営。現世にいるランダムな役職の仮面を被りその役職を演じます。占われるとその演じた役職として見えます。演じた役職の能力は使えません。演じた役職のプレイヤーが勝利していれば追加勝利します。演じている役職が上書きによりいなくなっていた場合敗北します。" },
    groups: { "transform:silver_shadow": 34 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW）。光の使徒・闇の化身には入らない
    // 夜の始まり: 仮面の通知だけ（能力はない。マイクラ版 night.js のペルソナの夜情報）
    nightMsg(c, p) {
      const m = maskOf(c.g, p.id);
      return { text: m ? `あなたは${rn(m)}の仮面を被りました。` : "仮面を見つけられませんでした。" };
    },
    // CPU: 仮面役職を名乗って演じる（能力は使えないので結果開示はしない）。仮面が無ければ通常の騙り
    cpuClaim(k, g, p, r, i, c) {
      const m = maskOf(g, p.id);
      if (!m) return false;
      c.co = m; c.result = null;
      return true;
    },
  });
})(window.ONW);
