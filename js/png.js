/**
 * png.js — 最終結果を画像(PNG)として保存する
 * html2canvas などは使わず、Canvasに直接描く（外部ライブラリ不要・GitHub Pagesでそのまま動く）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const C = { head: "#e8d36a", dim: "#9c99b3", ink: "#e7e4f0", village: "#55ff55", wolf: "#ff5555", third: "#aaaaaa", vote: "#e8d36a", alive: "#6fd3e0", dead: "#e0574d", good: "#7fd47f", info: "#6fd3e0", sep: "#3f6b49", bg: "#12131c" };
  const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
  const team = (t) => C[t] || C.third;
  C.me = "#c792ff";       // 各行の行動した人（文の主語）の名前。その人から見た他者は C.player
  C.grave = "#5aa9ff";    // 墓地名（墓地1 など）
  C.player = "#ffb86b";   // 夜行動結果・昼行動結果・役職情報の文章中のプレイヤー名（役職名は陣営の色）
  C.chatCo = "#7fd3e6"; C.ghost = "#2f7bff"; C.sys = "#f0a85a"; C.death = "#e8685e";   // チャット画面と同じ色（CO=水色 / 霊界=青 / システム=橙 / 死亡=赤）
  const png = {};

  /** 結果データ → 色付きの行リスト（画面の最終結果と同じ並び） */
  png.buildLines = function (res) {
    const L = [], T = (t, c) => ({ t, c: c || C.ink });
    const add = (...segs) => L.push({ segs });
    const tint = (t, base) => ONW.utils.tintTokens(t, res).map((k) => T(k.t, k.kind === "role" ? team(k.team) : k.kind === "player" ? (k.self ? C.me : C.player) : k.kind === "grave" ? C.grave : base));   // 役職名=陣営の色 / プレイヤー名=C.player
    const addTint = (...segs) => add(...segs.flatMap((s) => tint(s.t, s.c)));
    const head = (t) => L.push({ segs: [{ t, c: C.head, b: true }] });
    const sep = () => L.push({ sep: true });
    if (res.dictator) {
      head("独裁処刑");
      add(T(res.dictator.by), T(" → ", C.dim), T(res.dictator.target, C.vote), T("（投票は行いませんでした）", C.dim));
    } else {
      head("投票結果");
      res.votes.forEach((v) => add(T(v.from), T(" → ", C.dim), v.x ? T("投票無効", C.dead) : v.to ? T(v.to, C.vote) : T("未投票", C.dim), ...(v.to ? [T(`(${v.w || 1})`, C.dim)] : [])));
      sep(); head("得票数");
      if (res.counts.length) res.counts.forEach((c) => add(T(c.name), T(" : ", C.dim), T(`${c.c}票`, C.vote)));
      else add(T("得票はありません。", C.dim));
    }
    // 【道連れ・後追い】投票結果のすぐ下（画面の最終結果と同じ）
    const cr = ONW.chainRows(res);
    if (cr.length) { sep(); head("道連れ・後追い"); cr.forEach((r) => r.k === "sub" ? add(T("従者: ", C.info), T(`${r.name} が ${r.master} の身代わりになりました。`)) : r.k === "chainSub" ? add(T("従者: ", C.info), T(`${r.name} が ${r.master} の道連れの身代わりになりました。`)) : add(...(r.by ? [T(r.by), T(" → ", C.dim)] : []), T(r.name), T(" "), T(r.label, C.dead))); }
    sep();
    const wt = res.title.startsWith("村人") ? C.village : res.title.startsWith("人狼") ? C.wolf : C.third;
    L.push({ segs: [{ t: res.title, c: wt, b: true }], big: true });
    add(T("勝利陣営: ", C.info), T(res.teams.join("＆") || "なし"));
    add(T("勝者: ", C.good), T(res.winners.join("、") || "なし"));
    add(T("敗者: ", C.dead), T(res.losers.join("、") || "なし"));
    sep(); head("役職履歴");
    res.history.forEach((h) => {
      const segs = [T(h.name + " ", C.ink)];
      h.segs.forEach((s, i) => { if (i) segs.push(T(" → ", C.dim)); segs.push(T(s.name, team(s.team))); if (s.sfx) segs.push(T(s.sfx, C.wolf)); (s.tags || []).forEach((t) => segs.push(T(t.t, t.k === "love" ? "#ff77dd" : t.k === "keep" ? "#ff9ec9" : t.k === "cat" ? C.third : "#ffaa00"))); });
      segs.push(T(" " + h.status, h.dead || h.day ? C.dead : C.alive));
      L.push({ segs, fit: true });   // 1人ぶんの役職履歴は、長くても1行に収める（画像の横幅を広げる）
    });
    sep();
    res.grave.forEach((c) => { const segs = [T(c.label + " ", C.grave)]; c.segs.forEach((s, i) => { if (i) segs.push(T(" → ", C.dim)); segs.push(T(s.name, team(s.team))); }); L.push({ segs, fit: true }); });
    add(T("欠け: なし", C.dim));
    sep(); head("夜行動結果");
    if (res.nightLogs.length) res.nightLogs.forEach((t) => addTint(T(t))); else add(T("夜行動ログはありません。", C.dim));
    // 【昼行動結果】夜行動結果の下。昼能力（独裁者など）の結果はここに1行ずつ並べる
    if (res.dictator || (res.dayLogs || []).length) { sep(); head("昼行動結果"); if (res.dictator) addTint(T(`独裁者 ${res.dictator.by} は ${res.dictator.target} を独裁処刑対象にしていました。`)); (res.dayLogs || []).forEach((t) => addTint(T(t))); }
    // 【昇格情報】昼行動結果と役職情報の間。今後「姫君 → 女王」などの昇格を足すときも、ここ（昇格情報）に1行ずつ並べる
    if (res.promoted.length) { sep(); head("昇格情報"); add(T("[狂人昇格] 今回は ", C.dim), T(res.promoted.join("、")), T(" が人狼判定になっていました。", C.dim)); }
    // 【役職情報】夜行動結果・昼行動結果・昇格情報の下。賞金稼ぎ・処刑人・従者・口封じの狂人の情報を1つの欄に並べる（画面の最終結果と同じ並び）。1行も無い試合は欄ごと出さない
    const info = [
      ...(res.bounty || []).map((x) => [T("賞金稼ぎ: ", C.info), T(`${x.by} は ${x.target} を人狼判定だと選びました。${x.hit ? "成功です。" : "失敗です。"}`)]),
      ...(res.execs || []).map((x) => [T("処刑人: ", C.info), T(`${x.exec} のターゲットは ${x.target} でした。${x.win ? (x.late ? "賞金稼ぎが追放され、人狼判定を外したので処刑人の勝利です。" : "追放されたので処刑人の勝利です。") : "追放されませんでした。"}`)]),
      ...(res.watchdogs || []).map((x) => [T("番犬: ", C.info), T(`${x.by} の飼い主は ${x.owner} です。${x.bite ? `${x.by} が ${x.owner} を噛み殺しました。` : x.votes ? `${x.owner} への ${x.votes}票は無効でした。` : ""}${x.back ? "ネコカボチャに噛み返されました。" : ""}`)]),
      ...(res.sheriffs || []).filter((x) => x.info).map((x) => [T("保安官: ", C.info), T(`${x.by} が ${x.target} を撃った結果: ${x.info}`)]),
      ...(res.servants || []).map((q) => [T("従者: ", C.info), T(`${q[0]} のご主人は ${q[1]} です。`)]),
      ...(res.muzzles || []).map((x) => [T("口封じの狂人: ", C.info), T(`${x.by} は ${x.target} を口封じしました。`)]),
    ];
    if (info.length) { sep(); head("役職情報"); info.forEach((r) => addTint(...r)); }
    return L;
  };

  /** 幅に収まるよう、色の区切りを保ったまま折り返す */
  function wrap(ctx, segs, maxW, fontFor) {
    const lines = [[]]; let w = 0;
    segs.forEach((s) => {
      ctx.font = fontFor(s);
      for (const ch of s.t) {
        const cw = ctx.measureText(ch).width;
        if (w + cw > maxW && w > 0) { lines.push([]); w = 0; }
        const cur = lines[lines.length - 1], last = cur[cur.length - 1];
        if (last && last.c === s.c && last.b === s.b) last.t += ch; else cur.push({ t: ch, c: s.c, b: s.b });
        w += cw;
      }
    });
    return lines;
  }

  png.render = function (res) { return png.renderLines(png.buildLines(res)); };
  png.renderLines = function (lines, title) {
    const W0 = 720, PAD = 28, LH = 32, SC = 2, W_MAX = 2400;   // W0: 基本の幅 / 1人ぶんの行が長いときは、画像の横幅を広げて1行に収める(上限 W_MAX)
    const fontFor = (s, big) => `${s.b || big ? "700 " : ""}${big ? 28 : 20}px ${FONT}`;
    const probe = document.createElement("canvas").getContext("2d");
    const rows = [];                                  // 描画する行: { segs, center, big } / { sep }
    // 1人ぶんの役職履歴・墓地の行（fit）が1行に収まるよう、いちばん長い行に合わせて画像の横幅を決める（文字の大きさは変えない）
    let W = W0;
    lines.forEach((ln) => {
      if (!ln.fit) return;
      let tw = 0; ln.segs.forEach((sg) => { probe.font = fontFor(sg, ln.big); tw += probe.measureText(sg.t).width; });
      W = Math.max(W, Math.min(W_MAX, Math.ceil(tw + PAD * 2 + 4)));
    });
    lines.forEach((ln) => {
      if (ln.sep) return rows.push({ sep: true, h: 18 });
      wrap(probe, ln.segs, W - PAD * 2, (s) => fontFor(s, ln.big)).forEach((segs) => rows.push({ segs, center: ln.center, big: ln.big, h: ln.big ? 44 : LH }));
    });
    const H = PAD + rows.reduce((a, r) => a + r.h, 0) + 56;
    const cv = document.createElement("canvas");
    cv.width = W * SC; cv.height = H * SC;
    const ctx = cv.getContext("2d");
    ctx.scale(SC, SC);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "middle";
    let y = PAD;
    rows.forEach((r) => {
      if (r.sep) { ctx.fillStyle = C.sep; ctx.fillRect(PAD, y + r.h / 2, W - PAD * 2, 1); y += r.h; return; }
      let total = 0;
      r.segs.forEach((s) => { ctx.font = fontFor(s, r.big); total += ctx.measureText(s.t).width; });
      let x = r.center ? (W - total) / 2 : PAD;
      r.segs.forEach((s) => { ctx.font = fontFor(s, r.big); ctx.fillStyle = s.c; ctx.fillText(s.t, x, y + r.h / 2); x += ctx.measureText(s.t).width; });
      y += r.h;
    });
    ctx.font = `14px ${FONT}`; ctx.fillStyle = C.dim; ctx.textAlign = "right";
    ctx.fillText(`ワンナイト人狼 ${new Date().toLocaleString("ja-JP")}`, W - PAD, H - 26);
    return cv;
  };

  /** canvas をPNGファイルとして保存する（prefix: onw-result / onw-info / onw-chat） */
  png.download = function (cv, prefix) {
    const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
    const name = `${prefix}-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
    cv.toBlob((blob) => {
      if (!blob) {
        const a = document.createElement("a");
        a.href = cv.toDataURL("image/png");
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        return;
      }
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
  };

  png.save = function (res) {
    if (!res) return;
    png.download(png.render(res), "onw-result");
  };

  /** 最終結果の「情報確認」→ 色付きの行リスト（画面の情報確認の重ね表示と同じ並び: プレイヤーごとのカード → 公開された情報 → 混沌新聞） */
  png.buildInfoLines = function (res) {
    const L = [], T = (t, c) => ({ t, c: c || C.ink });
    const add = (...segs) => L.push({ segs });
    const tint = (t) => ONW.utils.tintTokens(t, res).map((k) => T(k.t, k.kind === "role" ? team(k.team) : k.kind === "player" ? (k.self ? C.me : C.player) : k.kind === "grave" ? C.grave : C.ink));
    const head = (t) => L.push({ segs: [{ t, c: C.head, b: true }] });
    const sep = () => L.push({ sep: true });
    const role = (key) => { const r = key ? ONW.roles.getInfo(key) : null; return r ? { t: r.name, c: team(r.team), b: true } : null; };
    head("情報確認（全員）");
    const pp = res.infoPub || {};
    (res.info || []).forEach((q) => {
      sep();
      add({ t: q.name, c: ONW.utils.isSelf && ONW.utils.isSelf(q.name) ? C.me : C.player, b: true }, ...(q.cpu ? [T("  [CPU]", C.dim)] : []));
      const r = role(q.role), f = role(q.from), sr = role(q.soberRole);
      if (r) {
        const segs = [T("配られた役職: ", C.dim)];
        if (f) segs.push(f, T(" → ", C.dim));
        segs.push(r);
        if (q.role === "drunk") { if (sr) segs.push(T("（酔いが覚めたあとの役職: ", C.dim), sr, T("）", C.dim)); else segs.push(T("（酔いが覚める前に試合が終わりました）", C.dim)); }
        add(...segs);
      } else add(T("役職の記録がありません。", C.dim));
      if ((q.logs || []).length) q.logs.forEach((t) => add(...tint(t))); else add(T("得た情報はありませんでした。", C.dim));
    });
    // 全員に公開された情報（画面の「公開された情報」と同じ内容）
    const pub = [];
    if ((pp.stars || []).length) pub.push([T("スター: "), ...pp.stars.flatMap((n, i) => [...(i ? [T("、")] : []), T(n, C.player)])]);
    if ((pp.kings || []).length) pub.push([T("人狼王: "), ...pp.kings.flatMap((n, i) => [...(i ? [T("、")] : []), T(n, C.player)])]);
    (pp.expose || []).forEach((r) => pub.push([T("暴露通知: 暴露された人の最終役職は "), { t: r.role, c: C.head, b: true }, T(`${r.extras && r.extras.length ? `（${r.extras.join("・")}）` : ""} です`)]));
    if (pp.mapo) pub.push([T("麻婆豆腐が完成しました")]);
    if (pp.bread > 0) pub.push([T(pp.bread > 1 ? `パンが${pp.bread}個焼けました` : "パンが焼けました")]);
    (pp.deaths || []).forEach((t) => pub.push(tint(t)));
    if (pub.length) { sep(); L.push({ segs: [{ t: "公開された情報", c: C.player, b: true }] }); pub.forEach((segs) => add(...segs)); }
    if (Array.isArray(pp.news)) {
      sep(); head("混沌新聞");
      if (pp.news.length) { add(T("昨夜、動きのあった役職", C.dim)); pp.news.forEach((t) => add(T(t))); } else add(T("昨夜、目立った能力行使はなかったようです。", C.dim));
    }
    return L;
  };
  /** 「チャットを見る」→ 色付きの行リスト（画面と同じ並び・同じ色。mergedChat の結果を渡す）。発言者=紫 / 本文中の他人=オレンジ / 霊界=青(👻付き) / CO=水色 / システム=橙 / 死亡=赤 */
  png.buildChatLines = function (chat, res) {
    const L = [], T = (t, c, b) => ({ t, c: c || C.ink, b });
    const add = (...segs) => L.push({ segs });
    const names = ONW.utils.playerNames();
    add(T("試合のチャット", C.head, true));
    if (res && res.title) add(T(`結果: ${res.title}`, C.dim));
    L.push({ sep: true });
    (chat || []).forEach((c) => {
      if (c.ghost) add(T("👻 ", C.ghost), T(c.name, C.ghost, true), T(": ", C.dim), T(c.text, C.ghost));
      else if (c.kind === "death") add(T(c.text, C.death));
      else if (c.kind === "sys") add(T(c.text, C.sys));
      else if (c.kind === "co") add(...ONW.utils.tintCoTokens(c.text, names, true).map((k) => T(k.t, k.kind === "team" || k.kind === "role" ? team(k.team) : k.kind === "player" ? (k.self ? C.me : C.player) : k.kind === "grave" ? C.grave : C.chatCo, k.self)));
      else add(T(c.name, C.me, true), T(": ", C.dim), T(c.text));
    });
    if (!(chat || []).length) add(T("（発言はありませんでした）", C.dim));
    return L;
  };
  png.saveChat = function (chat, res) {
    png.download(png.renderLines(png.buildChatLines(chat, res)), "onw-chat");
  };

  png.saveInfo = function (res) {
    if (!res || !(res.info || []).length) return;
    png.download(png.renderLines(png.buildInfoLines(res)), "onw-info");
  };

  ONW.png = png;
})(window.ONW);
