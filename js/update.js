/**
 * update.js — サイトの更新お知らせ
 * ------------------------------------------------------------
 * ページを開いている間に GitHub Pages 側が更新されたら、右上に
 * 「🔄 更新があります」ボタンを出す。ただし試合中は出さない
 * （検知だけしておき、ロビーに戻ったら出す）。
 * ボタンを押すと再読み込みするが、部屋にいる場合は再読み込みの
 * 直前に部屋の控えを作り、戻ってきたら自動で同じ部屋へ戻る
 * （ホスト: 端末保存のスナップショットから部屋ごと復元する。
 *   ゲスト: 既存の再入室の仕組みで同じ席に戻る）。
 * ------------------------------------------------------------
 */
(function () {
  "use strict";
  const VER_RE = /\?v=(\d{8}-\d+)/;
  const FLAG_KEY = "onw.updReturn.v1";     // sessionStorage: 再読み込み後に部屋へ戻る合図
  const HOST_KEY = "onw.updHostSnap.v1";   // localStorage: ホスト復元用スナップショットの控え
  const GUEST_KEY = "onw.updGuest.v1";     // localStorage: ゲスト再入室用の控え（ログイン記録が無い人用）
  const GAME_SNAP_KEY = "onw.hostSnap.v1"; // js/net.js の LOCAL_SNAP と同じキー
  const POLL_MS = 45000;

  const btn = document.getElementById("upd-btn");
  if (!btn) return;

  // いま動いている版（このページが読み込んだファイルの ?v=）
  const myVer = (() => {
    const el = document.querySelector('script[src*="?v="], link[href*="?v="]');
    const m = el && (el.src || el.href || "").match(VER_RE);
    return m ? m[1] : null;
  })();
  if (!myVer) return;

  let updateFound = false;
  const game = () => ONW.game || null;

  /** 試合中か（観戦で試合を見ている間も含む）。この間は更新ボタンを出さない */
  function inMatch() {
    const g = game();
    if (!g) return false;
    if (g.inGame) return true;
    const P = ONW.PHASE || {}, p = g.phase;
    if ([P.ONLINE_ROLE, P.ONLINE_NIGHT, P.ONLINE_MORNING, P.ONLINE_DAY, P.ONLINE_VOTE, P.ONLINE_RESULT].includes(p)) return true;
    if (p === P.ONLINE_SPECTATE) { const s = g.specPhase; if (s && s !== P.LOBBY && s !== P.TITLE) return true; }
    return false;
  }
  function syncBtn() { btn.hidden = !(updateFound && !inMatch()); }
  setInterval(syncBtn, 1000);

  /** サーバー側の index.html を取り直して、版が変わっていないか見る */
  async function check() {
    try {
      const base = location.pathname.endsWith("/") ? location.pathname : location.pathname.replace(/[^/]*$/, "");
      const res = await fetch(base + "index.html?__upd=" + Date.now(), { cache: "no-store" });
      if (!res.ok) return;
      const m = (await res.text()).match(VER_RE);
      if (m && m[1] !== myVer && !updateFound) { updateFound = true; syncBtn(); }
    } catch (e) { /* 通信できないときは黙って次回に回す */ }
  }
  setInterval(check, POLL_MS);
  setTimeout(check, 8000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });

  // ---- 押したとき: 部屋の控えを作ってから再読み込み ----
  btn.addEventListener("click", () => {
    try {
      sessionStorage.removeItem(FLAG_KEY);
      const net = ONW.net;
      const inRoom = !!(net && net.code && net.peer);
      if (inRoom && net.isHost && net.makeSnapshot) {
        localStorage.setItem(HOST_KEY, JSON.stringify({ code: net.code, seat: net.selfSeat, key: net.myKey, name: net.myName, at: Date.now(), snap: net.makeSnapshot() }));
        sessionStorage.setItem(FLAG_KEY, JSON.stringify({ at: Date.now(), host: true, code: net.code }));
      } else if (inRoom) {
        localStorage.setItem(GUEST_KEY, JSON.stringify({ code: net.code, seat: net.selfSeat, key: net.myKey, at: Date.now() }));
        sessionStorage.setItem(FLAG_KEY, JSON.stringify({ at: Date.now(), host: false, code: net.code }));
      }
    } catch (e) { /* 控えが作れなくても、再読み込み自体は行う */ }
    location.reload();
  });

  // ---- 再読み込み直後: 合図があれば、ゲートを抜けたあと自動で部屋へ戻る ----
  let flag = null;
  try { flag = JSON.parse(sessionStorage.getItem(FLAG_KEY) || "null"); } catch (e) {}
  if (!flag || Date.now() - flag.at > 5 * 60 * 1000) return;

  const startedAt = Date.now();
  const timer = setInterval(() => {
    const net = ONW.net;
    const elapsed = Date.now() - startedAt;
    const giveUp = () => { clearInterval(timer); try { sessionStorage.removeItem(FLAG_KEY); } catch (e) {} };
    if (!net || !ONW.main) { if (elapsed > 30000) giveUp(); return; }
    if (net.peer || net.rec) { giveUp(); return; }  // 既にどこかの部屋へ入っている
    const gate = document.getElementById("start-gate");
    if (gate && !gate.classList.contains("gate-done")) { if (elapsed > 120000) giveUp(); return; }  // 「ゲームを始める」を押すまでは待つ
    if (elapsed > 30000) { giveUp(); return; }

    if (flag.host) {
      let rec = null;
      try { rec = JSON.parse(localStorage.getItem(HOST_KEY) || "null"); } catch (e) {}
      if (rec && rec.snap && rec.code === flag.code) {
        clearInterval(timer);
        try {
          sessionStorage.removeItem(FLAG_KEY);
          localStorage.removeItem(HOST_KEY);
          localStorage.setItem(GAME_SNAP_KEY, JSON.stringify(rec));  // net.resumeHost が読む場所へ戻す
        } catch (e) {}
        ONW.main.resumeHost();
      } else giveUp();
      return;
    }
    // ゲスト: まず通常の再入室情報（ログイン中のサーバー記録）を使う
    if (net.rejoinInfo) {
      clearInterval(timer);
      try { sessionStorage.removeItem(FLAG_KEY); } catch (e) {}
      ONW.main.rejoin();
      return;
    }
    if (elapsed > 12000) {
      // 記録が出てこない場合は、押す前に控えた情報で同じ席に戻る
      clearInterval(timer);
      try { sessionStorage.removeItem(FLAG_KEY); } catch (e) {}
      let rec = null;
      try { rec = JSON.parse(localStorage.getItem(GUEST_KEY) || "null"); } catch (e) {}
      try { localStorage.removeItem(GUEST_KEY); } catch (e) {}
      if (rec && rec.code === flag.code && rec.seat && rec.key) {
        net.rejoinInfo = { code: rec.code, seat: rec.seat, key: rec.key };
        ONW.main.rejoin();
      }
    }
  }, 400);
})();
