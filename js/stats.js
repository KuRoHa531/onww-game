/**
 * stats.js — 戦績（match_results）の記録と集計
 * ------------------------------------------------------------
 * ・試合の結果が届いたとき、ログイン中の人だけが「自分の分」を1行保存する（ゲストは保存しない）
 * ・P2P対戦なので記録は自己申告。部屋コード+開始時刻で二重登録を防ぐ
 * ・集計は Supabase 側のカウンタ（user_stats: 1ユーザー1行）を読むだけ。読み込みは常に定数オーダーで、
 *   試合数に上限はない。カウンタは match_results のトリガーで差分更新される（setup.sql「11.」）
 * ・setup.sql「11.」が未実行のDBでは、カウンタが無いので従来方式（最新500戦をブラウザ側で集計）に
 *   フォールバックする。その間は死因別の集計は出ない（death_reason 列自体が無いため）
 * ・死因の分類はマイクラ版 stats.js の deathReasonKey / DEFAULT_DEATH_REASONS と同じ22種（docs/stats.md）
 * ・役職別の集計は最終役職ベース（勝利は最終役職で見る）＋「なった回数」（その試合でなった役職すべて。
 *   結果の history.became を match_results.roles_became に保存する）。直近の戦いの役職表示も最終役職
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const stats = {};
  const done = new Set();
  const teamOf = (role) => { try { return ONW.roles.getInfo(role).team; } catch (e) { return "village"; } };
  const rate = (w, n) => (n ? Math.round((w * 1000) / n) / 10 : 0);
  /** 役職別カウンタの形を {play, fin, w} にそろえる（旧形式 {n,w,ex} = 配られた役職で数えた分は、なった回数・最終回数とも n として近似する） */
  const normRoles = (m) => {
    const out = {};
    Object.entries(m || {}).forEach(([r, x]) => {
      if (!x) return;
      out[r] = typeof x.fin === "number"
        ? { play: x.play || 0, fin: x.fin || 0, w: x.w || 0 }
        : { play: x.n || 0, fin: x.n || 0, w: x.w || 0 };
    });
    return out;
  };
  stats.normRoles = normRoles;

  /** マイクラ版 DEFAULT_DEATH_REASONS と同じ並びの死因ラベル */
  const DEATH_REASONS = [
    "追放", "執行", "誤爆", "噛殺", "心中", "後追い", "王国滅亡", "道連れ", "メンタル崩壊", "ショック死",
    "とばっちり", "身代わり", "犠牲", "呪殺", "毒殺", "爆殺", "無理心中", "独裁処刑", "クーデター", "魔界断罪",
    "拒絶", "恨殺",
  ];
  stats.DEATH_REASONS = DEATH_REASONS;

  const lastStatusToken = (h) => {
    const toks = (String((h && h.status) || "").match(/［([^］]+)］/g) || [])
      .map((s) => s.slice(1, -1)).filter((t) => t !== "復活");
    return toks.length ? toks[toks.length - 1] : null;
  };

  /**
   * 結果履歴の自分の行から、マイクラ版方式の死因ラベルを返す（生存なら null）。
   * 優先順は結果発表の死因表示（buildResultObj の status 組み立て）とマイクラ版 deathReasonKey に合わせる。
   * マイクラ版に無い表示（処刑・押し切り・相打ち）は、マイクラ版の既定どおり「追放」に寄せる。
   */
  function deathReasonOf(h) {
    if (!h || (!h.dead && !h.day)) return null;                    // 最終的に死んでいない（スティーブの復活を含む）
    if (h.mental) return "メンタル崩壊";
    if (h.dukeDead || h.duke) return "魔界断罪";
    if (h.sub) return "身代わり";                       // 連鎖で身代わりになった従者
    if (h.cause === "chain" || h.kind) {
      const m = {
        tomo: "道連れ", bite: "噛殺", bomb: "爆殺", grudge: "恨殺", lovers: "心中", queen: "王国滅亡",
        follow: "後追い", thread: "後追い", sacrifice: "犠牲", love: "無理心中",
      };
      return m[h.kind] || "無理心中";                   // sacrifice（マティアスの娘の犠牲）は表示が「身代わり」でもマイクラ版の死因は「犠牲」
    }
    if (h.shock) return "ショック死";
    if (h.reject) return "拒絶";
    if (h.poisonKill) return "毒殺";
    if (h.curseKill) return "呪殺";
    if (h.bounce) return "とばっちり";
    if (h.dict) return h.coup ? "クーデター" : "独裁処刑";
    if (h.day) {
      const dm = {
        fox: "呪殺", foxvote: "追放", queen: "王国滅亡", lovers: "心中", cupid: "後追い", fanatic: "後追い",
        follow: "後追い", thread: "後追い", tomo: "道連れ", bite: "噛殺", bomb: "爆殺", grudge: "恨殺", sacrifice: "犠牲",
      };
      if (h.dayKind === "shot") { const t = lastStatusToken(h); return DEATH_REASONS.includes(t) ? t : "執行"; }
      if (dm[h.dayKind]) return dm[h.dayKind];
    }
    const t = lastStatusToken(h);
    if (t === "身代わり") return "身代わり";            // 投票での身代わり（従者・マティアス）
    if (t && DEATH_REASONS.includes(t)) return t;
    return "追放";
  }
  stats.deathReasonOf = deathReasonOf;

  let deathCol = true;   // death_reason 列があるか（setup.sql「11.」未実行のDBには無いので、失敗したら列なしで保存する）
  let becameCol = true;   // roles_became 列があるか（同上）

  /** result: ホストから届いた結果 / key: 試合の識別子 */
  stats.record = async function (result, key) {
    const A = ONW.account;
    try {
      if (ONW.game && ONW.game.debugOn) return;                // デバッグモード中の試合は戦績に残さない
      if (!A || !A.enabled || !A.user || !result || !Array.isArray(result.history) || done.has(key)) return;
      const me = result.history.find((h) => h.id === ONW.net.myId());
      if (!me || !me.ini) return;                       // 観戦中などで自分の行が無ければ保存しない
      done.add(key);
      const turned = (result.cursed || []).some((c) => c.id === me.id);   // 呪われし者: 吊られて人狼陣営になった人の戦績は、最終役職（村人陣営）ではなく人狼陣営で数える
      const became = [...new Set((Array.isArray(me.became) && me.became.length ? me.became : [me.ini, me.role]).filter((r) => typeof r === "string" && r))];   // この試合で「なった」役職すべて（マイクラ版の「なった回数」用）
      const row = {
        user_id: A.user.id, match_key: String(key).slice(0, 64), initial_role: me.ini, final_role: me.role,
        team: turned ? "wolf" : teamOf(me.role), won: !!me.win, executed: !!me.dead, players: Math.max(1, Math.min(30, result.history.length)),
      };
      if (deathCol) row.death_reason = deathReasonOf(me);
      if (becameCol) row.roles_became = became;
      let { error } = await A.sb.from("match_results").insert(row);
      if (error && (error.code === "PGRST204" || error.code === "42703")) {
        // 列が無い古いDB: まず新しい roles_became だけ外して再試行し、それでもダメなら death_reason も外す（戦績自体は残す）
        if (becameCol) { becameCol = false; delete row.roles_became; ({ error } = await A.sb.from("match_results").insert(row)); }
        if (error && (error.code === "PGRST204" || error.code === "42703") && deathCol) {
          deathCol = false; delete row.death_reason;
          ({ error } = await A.sb.from("match_results").insert(row));
        }
      }
      if (error && error.code !== "23505") done.delete(key);   // 重複(23505)以外の失敗は次回また試せる
    } catch (e) { /* 戦績の保存に失敗してもゲームは止めない */ }
  };

  /** 従来方式の集計（最新500戦をブラウザ側で数える）。カウンタが無いDB向けのフォールバック */
  async function legacyLoad(A, uid) {
    const { data, error } = await A.sb.from("match_results")
      .select("initial_role,final_role,team,won,executed,played_at,players").eq("user_id", uid)
      .order("played_at", { ascending: false }).limit(500);
    if (error) return { error: true };
    const rows = data || [];
    const tally = (keyFn) => {
      const m = {};
      rows.forEach((r) => { const k = keyFn(r), x = (m[k] = m[k] || { n: 0, w: 0, ex: 0 }); x.n++; if (r.won) x.w++; if (r.executed) x.ex++; });
      return m;
    };
    const total = rows.length, wins = rows.filter((r) => r.won).length;
    // 役職別は最終役職ベース（勝利は最終役職で見る）。なった回数は過去分には記録が無いので初期・最終の2役で近似する
    const roles = {};
    rows.forEach((r) => {
      [...new Set([r.initial_role, r.final_role].filter(Boolean))].forEach((role) => {
        const x = (roles[role] = roles[role] || { play: 0, fin: 0, w: 0 }); x.play++;
      });
      const f = r.final_role || r.initial_role;
      if (f) { const x = (roles[f] = roles[f] || { play: 0, fin: 0, w: 0 }); x.fin++; if (r.won) x.w++; }
    });
    return {
      total, wins, losses: total - wins, rate: rate(wins, total), executed: rows.filter((r) => r.executed).length,
      teams: tally((r) => r.team), roles, recent: rows.slice(0, 10), rateOf: rate,
      deaths: null, counted: false,
    };
  }

  /** 指定ユーザーの戦績を取得して集計する。失敗時は { error: true } */
  stats.load = async function (uid) {
    const A = ONW.account;
    if (!A || !A.enabled) return { error: true };
    // 集計カウンタ（user_stats）: 1行だけ読む。上限なし・定数オーダー
    try {
      const { data, error } = await A.sb.from("user_stats")
        .select("total,wins,executed,deaths,survive,teams,roles,death_reasons").eq("user_id", uid).maybeSingle();
      if (!error && data) {
        let recent = [];
        const rr = await A.sb.from("match_results")
          .select("final_role,won").eq("user_id", uid)
          .order("played_at", { ascending: false }).limit(10);
        if (!rr.error) recent = rr.data || [];
        const total = data.total || 0, wins = data.wins || 0;
        return {
          total, wins, losses: total - wins, rate: rate(wins, total), executed: data.executed || 0,
          teams: data.teams || {}, roles: normRoles(data.roles), recent, rateOf: rate,
          deaths: { total: data.deaths || 0, survive: data.survive || 0, reasons: data.death_reasons || {} },
          counted: true,
        };
      }
    } catch (e) { /* カウンタが無いDBでは従来方式へ */ }
    return legacyLoad(A, uid);
  };

  /** 自分の戦績を全部消す（カウンタは DELETE トリガーで自動的に差し引かれる） */
  stats.reset = async function () {
    const A = ONW.account;
    if (!A || !A.user) return false;
    const { error } = await A.sb.from("match_results").delete().eq("user_id", A.user.id);
    return !error;
  };

  ONW.stats = stats;
})(window.ONW);
