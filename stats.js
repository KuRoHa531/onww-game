/**
 * stats.js — 戦績（match_results）の記録と集計
 * ------------------------------------------------------------
 * ・試合の結果が届いたとき、ログイン中の人だけが「自分の分」を1行保存する（ゲストは保存しない）
 * ・P2P対戦なので記録は自己申告。部屋コード+開始時刻で二重登録を防ぐ
 * ・集計は取得した行（最新500戦）をブラウザ側で数える
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const stats = {};
  const done = new Set();
  const teamOf = (role) => { try { return ONW.roles.getInfo(role).team; } catch (e) { return "village"; } };

  /** result: ホストから届いた結果 / key: 試合の識別子 */
  stats.record = async function (result, key) {
    const A = ONW.account;
    try {
      if (ONW.game && ONW.game.debugOn) return;                // デバッグモード中の試合は戦績に残さない
      if (!A || !A.enabled || !A.user || !result || !Array.isArray(result.history) || done.has(key)) return;
      const me = result.history.find((h) => h.id === ONW.net.myId());
      if (!me || !me.ini) return;                       // 観戦中などで自分の行が無ければ保存しない
      done.add(key);
      const row = {
        user_id: A.user.id, match_key: String(key).slice(0, 64), initial_role: me.ini, final_role: me.role,
        team: teamOf(me.role), won: !!me.win, executed: !!me.dead, players: Math.max(1, Math.min(30, result.history.length)),
      };
      const { error } = await A.sb.from("match_results").insert(row);
      if (error && error.code !== "23505") done.delete(key);   // 重複(23505)以外の失敗は次回また試せる
    } catch (e) { /* 戦績の保存に失敗してもゲームは止めない */ }
  };

  /** 指定ユーザーの戦績を取得して集計する。失敗時は { error: true } */
  stats.load = async function (uid) {
    const A = ONW.account;
    if (!A || !A.enabled) return { error: true };
    const { data, error } = await A.sb.from("match_results")
      .select("initial_role,final_role,team,won,executed,played_at,players").eq("user_id", uid)
      .order("played_at", { ascending: false }).limit(500);
    if (error) return { error: true };
    const rows = data || [], rate = (w, n) => (n ? Math.round((w * 1000) / n) / 10 : 0);
    const tally = (keyFn) => {
      const m = {};
      rows.forEach((r) => { const k = keyFn(r), x = (m[k] = m[k] || { n: 0, w: 0, ex: 0 }); x.n++; if (r.won) x.w++; if (r.executed) x.ex++; });
      return m;
    };
    const total = rows.length, wins = rows.filter((r) => r.won).length;
    return {
      total, wins, losses: total - wins, rate: rate(wins, total), executed: rows.filter((r) => r.executed).length,
      teams: tally((r) => r.team), roles: tally((r) => r.initial_role), recent: rows.slice(0, 10), rateOf: rate,
    };
  };

  /** 自分の戦績を全部消す */
  stats.reset = async function () {
    const A = ONW.account;
    if (!A || !A.user) return false;
    const { error } = await A.sb.from("match_results").delete().eq("user_id", A.user.id);
    return !error;
  };

  ONW.stats = stats;
})(window.ONW);
