/**
 * backhost.js — 「ホストを取り戻す」ボタン
 * ------------------------------------------------------------
 * 最初のホストが接続切れの間に別の参加者がホストを引き継ぎ、
 * 戻ってきた最初のホストが参加者になっていたら、右上に
 * 「↩ ホストを取り戻す」ボタンを出す（ロビーでも試合中でも）。
 * 押すと、いまのホストへ返却のお願いを送り、ホスト側が
 * 返却処理（maybeHandBack）をやり直す。
 * ------------------------------------------------------------
 */
(function () {
  "use strict";
  const btn = document.getElementById("backhost-btn");
  if (!btn) return;
  let busyUntil = 0;
  function sync() {
    let ok = false;
    try { ok = !!(ONW.net && ONW.net.canTakeBack && ONW.net.canTakeBack()); } catch (e) {}
    btn.hidden = !ok;
    if (!ok) return;
    if (Date.now() < busyUntil) { btn.disabled = true; btn.textContent = "↩ 取り戻し中…"; }
    else { btn.disabled = false; btn.textContent = "↩ ホストを取り戻す"; }
  }
  btn.addEventListener("click", () => {
    let sent = false;
    try { sent = !!(ONW.net && ONW.net.takeBack && ONW.net.takeBack()); } catch (e) {}
    if (sent) busyUntil = Date.now() + 6000;
    sync();
  });
  setInterval(sync, 1000);
  sync();
})();
