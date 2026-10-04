/**
 * png.js — 最終結果を画像(PNG)として保存する
 * html2canvas などは使わず、Canvasに直接描く（外部ライブラリ不要・GitHub Pagesでそのまま動く）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const C = { head: "#e8d36a", dim: "#9c99b3", ink: "#e7e4f0", village: "#55ff55", wolf: "#ff5555", third: "#aaaaaa", vote: "#e8d36a", alive: "#6fd3e0", dead: "#e0574d", good: "#7fd47f", info: "#6fd3e0", sep: "#3f6b49", bg: "#12131c" };
  const FONT = '"Hiragino Sans","Noto Sans JP","Yu Gothic","Meiryo",sans-serif';
  const team = (t) => C[t] || C.third;
  const png = {};

  /** 結果データ → 色付きの行リスト（画面の最終結果と同じ並び） */
  png.buildLines = function (res) {
    const L = [], T = (t, c) => ({ t, c: c || C.ink });
    const add = (...segs) => L.push({ segs });
    const head = (t) => L.push({ segs: [{ t, c: C.head, b: true }] });
    const sep = () => L.push({ sep: true });
    head("投票結果");
    res.votes.forEach((v) => add(T(v.from), T(" → ", C.dim), v.to ? T(v.to, C.vote) : T("未投票", C.dim)));
    sep(); head("得票数");
    if (res.counts.length) res.counts.forEach((c) => add(T(c.name), T(" : ", C.dim), T(`${c.c}票`, C.vote)));
    else add(T("得票はありません。", C.dim));
    if (res.promoted.length) { sep(); add(T("[狂人昇格] 今回は ", C.dim), T(res.promoted.join("、")), T(" が人狼判定になっていました。", C.dim)); }
    sep();
    const wt = res.title.startsWith("村人") ? C.village : res.title.startsWith("人狼") ? C.wolf : C.third;
    L.push({ segs: [{ t: res.title, c: wt, b: true }], big: true });
    add(T(res.detail, C.dim));
    add(T("勝利陣営: ", C.info), T(res.teams.join("＆") || "なし"));
    add(T("勝者: ", C.good), T(res.winners.join("、") || "なし"));
    add(T("敗者: ", C.dead), T(res.losers.join("、") || "なし"));
    sep(); head("役職履歴");
    res.history.forEach((h) => {
      const segs = [T(h.name + " ")];
      h.segs.forEach((s, i) => { if (i) segs.push(T(" → ", C.dim)); segs.push(T(s.name, team(s.team))); if (s.sfx) segs.push(T(s.sfx, C.wolf)); });
      segs.push(T(" " + h.status, h.dead ? C.dead : C.alive));
      add(...segs);
    });
    sep();
    res.grave.forEach((c) => { const segs = [T(c.label + " ")]; c.segs.forEach((s, i) => { if (i) segs.push(T(" → ", C.dim)); segs.push(T(s.name, team(s.team))); }); add(...segs); });
    add(T("欠け: なし", C.dim));
    sep(); head("夜行動結果");
    if (res.nightLogs.length) res.nightLogs.forEach((t) => add(T(t))); else add(T("夜行動ログはありません。", C.dim));
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

  png.render = function (res) {
    const W = 720, PAD = 28, LH = 32, SC = 2;
    const fontFor = (s, big) => `${s.b || big ? "700 " : ""}${big ? 28 : 20}px ${FONT}`;
    const lines = png.buildLines(res);
    const probe = document.createElement("canvas").getContext("2d");
    const rows = [];                                  // 描画する行: { segs, center, big } / { sep }
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

  png.save = function (res) {
    if (!res) return;
    const cv = png.render(res);
    const d = new Date(), p2 = (n) => String(n).padStart(2, "0");
    const name = `onw-result-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
    cv.toBlob((blob) => {
      if (!blob) { window.open(cv.toDataURL("image/png")); return; }
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }, "image/png");
  };

  ONW.png = png;
})(window.ONW);
