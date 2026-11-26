/**
 * サウンド（BGM / SE）: 生成済みサウンドパック（audio/bgm/*.mp3, audio/se/*.mp3）の再生管理。
 *   ・BGM: 2つの Audio 要素でクロスフェード（約1秒）しながら切り替え、ループ再生する。
 *   ・SE: Audio プールで同時再生可。BGM は止めない。
 *   ・音量・ミュートはこの端末だけの設定として localStorage（onw.sound.v1）に保存する（ルーム設定とは別）。
 *   ・ブラウザの自動再生制限: 初回のユーザー操作（タップ / クリック / キー）までは再生を保留し、操作の瞬間に保留中の BGM を流し始める。
 *     SE は操作の瞬間に全要素を音量0で事前再生しておく（primeSe）。タイマー予約で初めて作られる要素（配布 SE など）がモバイルで拒否され無音になるのを防ぐ。
 *   ・音源が無い・再生に失敗してもゲームが止まらないよう、すべての処理を防御的に書く（例外は握りつぶす）。
 * 使い方:
 *   ONW.sound.bgm("night")        … BGM 切替（同じ曲なら継続）
 *   ONW.sound.se("gunshot")       … SE 再生
 *   ONW.sound.seKey("gunshot", k) … 同じ対象には一定時間に1回だけ鳴らす SE（二重配線の防止）
 *   ONW.sound.se("deal")          … カードを配る・置く SE（配布演出は ui.dealPlaceSe が着地時刻に予約。stage の cosEnsure / swap と各役職 stageMorning の着地でも鳴らす）
 *   ONW.sound.syncBgm(game)       … ゲームの状態から BGM を決め直す（ui.render の末尾から呼ばれる）
 *   ONW.sound.hold("transform")   … 演出の間だけ BGM を固定する（syncBgm より優先）
 *   ONW.sound.release()           … hold を解除して状態どおりの曲に戻す
 *   ONW.sound.noteFlip(key, up)   … stage の paint から呼ばれるカードのめくれ検出（SE: card_flip。裏→表／表→裏の双方向）
 *   ONW.sound.resetFlips()        … テーブルの作り直し・破棄時にめくれ記録を消す（stage.sync から）
 *   ONW.sound.forgetFlip(key)     … 席要素が破棄されたときにその席のめくれ記録だけ消す（stage の cosClear 等から）
 *   ONW.sound.togglePanel()       … 左下の 🔊 ボタンから開く音量パネル（BGM/SE 別スライダー＋ミュート）の開閉
 * タップ音: ボタンやカードなどのタップ可能要素を押したとき、委譲リスナーで SE "tap" を鳴らす（このファイル内で配線）。
 * 対応表は docs/sound.md を参照。
 */
(function (ONW) {
  "use strict";
  const BGM_DIR = "audio/bgm/", SE_DIR = "audio/se/";
  // 同じ音源ファイルを使う曲名: 昼（生存）は変化公開と同じ曲（魔王魂 ピアノ32「脈動」）を流す指定のため、
  // day_alive は bgm_transform.mp3 を読む。曲名が違っても同じファイルに解決される間は「同じ曲」として
  // 継続し、変化公開の hold が解けて昼に戻るときも頭から再生し直さない。
  const BGM_FILE = { day_alive: "transform" };
  const bgmFile = (name) => BGM_FILE[name] || name;
  const LS_KEY = "onw.sound.v1";
  const FADE_MS = 1000;          // BGM クロスフェードの長さ
  const HOLD_MS = 120000;        // hold の有効期限（解除し忘れても2分で状態どおりに戻る）
  const FLIP_GAP_MS = 180;       // カードめくれ SE の最小間隔（同時に何枚もめくれても1回にまとめる）

  let cfg = { bgm: 0.7, se: 0.9, mute: false };
  try {
    const raw = window.localStorage && localStorage.getItem(LS_KEY);
    if (raw) { const p = JSON.parse(raw); if (p && typeof p === "object") cfg = Object.assign(cfg, p); }
  } catch (e) { /* 保存が無くても既定値で動く */ }
  const save = () => { try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) { /* 保存できなくてもよい */ } };
  const bgmVol = () => (cfg.mute ? 0 : Math.max(0, Math.min(1, +cfg.bgm || 0)));
  const seVol = () => (cfg.mute ? 0 : Math.max(0, Math.min(1, +cfg.se || 0)));

  // ---------------- BGM（2要素クロスフェード） ----------------
  let els = [], active = 0, cur = null, pending = null, unlocked = false, fadeTimer = null;
  try { els = [new Audio(), new Audio()]; els.forEach((el) => { el.loop = true; el.preload = "auto"; }); } catch (e) { els = []; }
  function tryPlay(el) { try { const p = el.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 自動再生制限などは無視 */ } }
  function crossfadeTo(name) {
    if (!els.length) return;
    const from = els[active], to = els[1 - active]; active = 1 - active;
    try {
      to.pause(); to.src = BGM_DIR + "bgm_" + bgmFile(name) + ".mp3"; to.loop = true;
      try { to.currentTime = 0; } catch (e) {}
      to.volume = 0; tryPlay(to);
    } catch (e) { return; }
    if (fadeTimer) clearInterval(fadeTimer);
    const fromVol = Math.max(0, Math.min(1, +from.volume || 0)), t0 = Date.now();
    fadeTimer = setInterval(() => {
      const r = Math.min(1, (Date.now() - t0) / FADE_MS);
      try { to.volume = bgmVol() * r; from.volume = fromVol * (1 - r); } catch (e) {}
      if (r >= 1) { clearInterval(fadeTimer); fadeTimer = null; try { from.pause(); } catch (e) {} }
    }, 50);
  }
  function bgm(name) {
    try {
      if (!name) return stopBgm();
      if (cur && bgmFile(name) === bgmFile(cur)) {   // 同じ曲（同じ音源ファイル）: 再生中なら継続する。止まっていたら流し直す
        cur = name;
        if (unlocked && els.length && els[active].paused) { els[active].volume = bgmVol(); tryPlay(els[active]); }
        return;
      }
      cur = name;
      if (!unlocked) { pending = name; return; }   // 初回操作までは保留
      crossfadeTo(name);
    } catch (e) { /* 音でゲームを止めない */ }
  }
  function stopBgm() {
    try {
      cur = null; pending = null;
      if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
      els.forEach((el) => { try { el.pause(); } catch (e) {} });
    } catch (e) {}
  }
  // 初回のユーザー操作でロック解除: 保留中の BGM を流し始める。
  // あわせて SE の全要素をこのタップの中で無音で事前再生しておく（primeSe）。
  // モバイルブラウザは「ユーザー操作の中で一度も再生されていない Audio 要素」の後からの再生を
  // 拒否することがあり、setTimeout 予約で初めて作られる配布 SE（deal）などが無音になっていた。
  function unlock() {
    try { primeSe(); } catch (e) {}
    if (unlocked) return; unlocked = true;
    try { if (pending) { const n = pending; pending = null; crossfadeTo(n); } } catch (e) {}
  }
  try {
    ["pointerdown", "click", "keydown", "touchend"].forEach((ev) => window.addEventListener(ev, unlock, { passive: true }));
  } catch (e) {}

  // ---------------- SE（プール再生） ----------------
  const pool = {}, lastPlay = {}, keySeen = {};
  // 音源ファイルのある SE 名の一覧（audio/se/se_<名前>.mp3）。primeSe が事前生成の対象にする
  const SE_NAMES = ["bakery", "bell", "bomb", "bounty_success", "card_flip", "card_fly", "chain", "chicken_reverse", "curse_kill", "deal", "dictator", "executioner_success", "expose", "follow_death", "glass_break", "gunshot", "libra", "newspaper", "reveal_text", "smoke", "steve_revive", "tap", "tick", "chatpop"];
  // ---------------- SE の事前再生（モバイルの自動再生制限対策） ----------------
  // ブラウザ（特にモバイル）は、ユーザー操作のタイミングで作られていない Audio 要素や、
  // 一度も操作中に再生されていない要素の、タイマー等からの再生を拒否する場合がある。
  // 配布 SE のように setTimeout 予約で初めて要素が作られる音は、その拒否に当たって無音になっていた。
  // そこでロック解除のタップの瞬間に、全 SE の要素を作って音量0で一瞬だけ再生し、
  // ブラウザに「再生済みの要素」として覚えさせる。以後の se() は覚えた要素を再利用するので鳴るようになる。
  const primedEls = new Set();
  function primeEl(el) {
    if (!el || primedEls.has(el)) return;
    if (el.paused === false) { primedEls.add(el); return; }   // 再生できている要素は覚えたも同然（止めない）
    primedEls.add(el);
    try {
      const v = el.volume;
      el.volume = 0;
      const p = el.play();
      const done = () => { try { el.pause(); try { el.currentTime = 0; } catch (e) {} el.volume = v; } catch (e) {} };
      if (p && p.then) { p.then(done, () => { primedEls.delete(el); done(); }); }   // 拒否されたら覚えたことにせず、次のタップでやり直す
      else done();
    } catch (e) { primedEls.delete(el); }
  }
  function primeSe() {
    try {
      SE_NAMES.forEach((name) => {
        const list = pool[name] || (pool[name] = []);
        if (!list.length) { try { list.push(new Audio(SE_DIR + "se_" + name + ".mp3")); } catch (e) { return; } }
        primeEl(list[0]);
      });
      Object.keys(pool).forEach((name) => pool[name].forEach(primeEl));   // 先に se() で作られた要素も覚えさせる
    } catch (e) { /* 音でゲームを止めない */ }
  }
  function se(name) {
    try {
      if (!name || seVol() <= 0) return;
      const now = Date.now();
      if (lastPlay[name] && now - lastPlay[name] < 45) return;   // 同じ音の重なりすぎ防止
      lastPlay[name] = now;
      const list = pool[name] || (pool[name] = []);
      let el = null;
      for (let i = 0; i < list.length; i++) if (list[i].paused || list[i].ended) { el = list[i]; break; }
      if (!el) {
        if (list.length >= 4) el = list[0];
        else { try { el = new Audio(SE_DIR + "se_" + name + ".mp3"); } catch (e) { return; } list.push(el); }
      }
      el.volume = seVol();
      try { el.currentTime = 0; } catch (e) {}
      tryPlay(el);
    } catch (e) { /* 音でゲームを止めない */ }
  }
  /** 同じ対象（key）には windowMs の間1回だけ鳴らす。複数の配線経路が同じ出来事を拾っても二重に鳴らさない */
  function seKey(name, key, windowMs) {
    try {
      const k = name + "|" + key, now = Date.now(), w = windowMs || 20000;
      if (keySeen[k] && now - keySeen[k] < w) return;
      keySeen[k] = now;
      const ks = Object.keys(keySeen);   // たまり続けないよう古いものを間引く
      if (ks.length > 400) ks.forEach((x) => { if (now - keySeen[x] > 120000) delete keySeen[x]; });
      se(name);
    } catch (e) {}
  }

  // ---------------- カードのめくれ検出（stage.paint から） ----------------
  // 席ごとに「前回見た表/裏」を覚え、裏→表（めくれる）・表→裏（裏に戻る）のどちらの変化でも鳴らす。
  // 初めて見る席は鳴らさない（途中参加・再入室で最初から表になっているカードで鳴らないように）。
  // テーブルの作り直し・破棄では stage 側が resetFlips、席要素だけが破棄されるときは forgetFlip を呼び、
  // 消えた席の記録が次の表示で「裏戻り」と誤検出されないようにする。
  const flipPrev = {};
  let lastFlip = 0;
  function noteFlip(k, isUp) {
    try {
      const was = flipPrev[k];
      flipPrev[k] = !!isUp;
      if (was === undefined || was === !!isUp) return;
      const now = Date.now();
      if (now - lastFlip >= FLIP_GAP_MS) { lastFlip = now; se("card_flip"); }
    } catch (e) {}
  }
  /** テーブル全体の作り直し・破棄のときにめくれ記録を全部消す（次の paint は初見として、音なしで基準だけ覚える） */
  function resetFlips() { try { Object.keys(flipPrev).forEach((k) => delete flipPrev[k]); } catch (e) {} }
  /** 席要素が破棄されたときに、その席のめくれ記録だけ消す（コスプレイヤーの3枚など） */
  function forgetFlip(k) { try { delete flipPrev[k]; } catch (e) {} }

  // ---------------- フェーズ → BGM ----------------
  let holdName = null, holdUntil = 0;
  function hold(name) { try { holdName = name; holdUntil = Date.now() + HOLD_MS; bgm(name); } catch (e) {} }
  function release() { try { holdName = null; holdUntil = 0; if (ONW.game) syncBgm(ONW.game); } catch (e) {} }
  function pickBgm(g) {
    const P = ONW.PHASE; if (!P || !g) return null;
    switch (g.phase) {
      case P.TITLE: case P.SETUP: return "title";
      case P.LOBBY: return g.viewResult ? "result_screen" : "lobby";
      case P.ONLINE_ROLE: case P.REVEAL: return "night";   // 配役確認は専用曲が無いので夜の曲で近似
      case P.ONLINE_NIGHT: case P.NIGHT: return "night";
      case P.ONLINE_MORNING: return "morning";
      case P.ONLINE_DAY: case P.DAY: return g.isDead ? "day_dead" : "day_alive";
      case P.ONLINE_VOTE: case P.VOTE: return g.dukeIds && g.dukeIds.length ? "duke" : "vote";
      case P.ONLINE_RESULT: return g.resultStage === "sheet" ? "result_screen" : "result_reveal";
      case P.RESULT: return "result_screen";   // オフラインの結果は最終表示のみ
      case P.ONLINE_SPECTATE: {
        const sp = g.specPhase;
        if (sp === P.ONLINE_NIGHT) return "night";
        if (sp === P.ONLINE_MORNING) return "morning";
        if (sp === P.ONLINE_DAY) return "day_dead";   // 観戦者は死亡時側の曲
        if (sp === P.ONLINE_VOTE) return g.dukeIds && g.dukeIds.length ? "duke" : "vote";
        if (sp === P.ONLINE_RESULT) return g.resultStage === "sheet" ? "result_screen" : "result_reveal";
        if (sp === P.ONLINE_ROLE) return "night";
        return "lobby";
      }
      default: return null;
    }
  }
  function syncBgm(g) {
    try {
      if (!g) return;
      if (holdName && Date.now() < holdUntil) { bgm(holdName); return; }
      holdName = null;
      const name = pickBgm(g);
      if (name) bgm(name); else stopBgm();
    } catch (e) { /* 音でゲームを止めない */ }
  }

  // ---------------- 設定（音量・ミュート） ----------------
  function refreshBtn() {
    try { const b = document.getElementById("snd-btn"); if (b) { b.textContent = cfg.mute ? "🔇" : "🔊"; b.title = cfg.mute ? "サウンド: ミュート中（タップで音量設定）" : "サウンド設定（タップで開く）"; } } catch (e) {}
  }
  function applyBgmVol() { try { if (els.length && !fadeTimer) els[active].volume = bgmVol(); } catch (e) {} }
  function rerender() { try { if (ONW.ui && ONW.ui.render && ONW.game) ONW.ui.render(ONW.game); } catch (e) {} refreshBtn(); }
  function setBgmVol(v) { try { cfg.bgm = Math.max(0, Math.min(100, +v || 0)) / 100; save(); applyBgmVol(); syncPanel(); } catch (e) {} }
  function setSeVol(v) { try { cfg.se = Math.max(0, Math.min(100, +v || 0)) / 100; save(); syncPanel(); } catch (e) {} }
  function toggleMute() { try { cfg.mute = !cfg.mute; save(); applyBgmVol(); if (!cfg.mute) se("card_flip"); syncPanel(); rerender(); } catch (e) {} }

  // ---------------- タップ音（ボタンを押したときのクリック） ----------------
  // document への委譲で、ボタン・カード（.tb-seat）・ボタン相当要素のタップを拾う。
  // スライダー操作中・無効なボタンでは鳴らさない。同時多発は TAP_GAP_MS で間引く（se 自体の間引きも併用）。
  const TAP_SEL = "button, .tb-seat[data-k], [role=\"button\"], #chat-log";
  const TAP_GAP_MS = 70;
  let lastTap = 0;
  function onTapSound(e) {
    try {
      if (!e || !e.target || !e.target.closest) return;
      if (e.target.closest("input[type=\"range\"]")) return;   // スライダーを掴んだ・動かしたときは鳴らさない
      const btn = e.target.closest("button");
      if (btn && btn.disabled) return;                          // 無効なボタンは鳴らさない
      if (!e.target.closest(TAP_SEL)) return;
      const now = Date.now();
      if (now - lastTap < TAP_GAP_MS) return;
      lastTap = now;
      unlock();        // ロック解除のきっかけになったタップ自体から鳴ってよい
      se("tap");       // ミュート / SE音量0 のときは se 側で鳴らない
    } catch (e) { /* 音でゲームを止めない */ }
  }
  try { document.addEventListener("click", onTapSound, true); } catch (e) {}

  // ---------------- 音量パネル（左下の 🔊 から開く） ----------------
  // index.html の #snd-panel（BGM/SE 別スライダー＋ミュート）。状態は cfg が唯一の正で、
  // ルーム設定モーダルのスライダーとも同じ setter を使うため、どちらを操作しても連動する。
  let panel = null, pBgm = null, pSe = null, pBgmVal = null, pSeVal = null, pMute = null, panelOpen = false;
  function syncPanel() {
    try {
      const b = Math.round((+cfg.bgm || 0) * 100), s = Math.round((+cfg.se || 0) * 100);
      if (pBgm && document.activeElement !== pBgm) pBgm.value = b;
      if (pSe && document.activeElement !== pSe) pSe.value = s;
      if (pBgmVal) pBgmVal.textContent = b + "%";
      if (pSeVal) pSeVal.textContent = s + "%";
      if (pMute) pMute.textContent = cfg.mute ? "ミュート中" : "ミュート";
    } catch (e) {}
  }
  function setPanel(open) {
    panelOpen = !!open;
    try { if (panel) panel.hidden = !panelOpen; if (panelOpen) syncPanel(); } catch (e) {}
  }
  function togglePanel() { try { unlock(); setPanel(!panelOpen); } catch (e) {} }
  function bindPanel() {
    try {
      panel = document.getElementById("snd-panel");
      if (!panel) return;
      pBgm = document.getElementById("snd-bgm-range");
      pSe = document.getElementById("snd-se-range");
      pBgmVal = document.getElementById("snd-bgm-val");
      pSeVal = document.getElementById("snd-se-val");
      pMute = document.getElementById("snd-mute-btn");
      if (pBgm) pBgm.addEventListener("input", () => { setBgmVol(pBgm.value); syncPanel(); });   // 再生中の BGM に即反映
      if (pSe) {
        pSe.addEventListener("input", () => { setSeVol(pSe.value); syncPanel(); });
        pSe.addEventListener("change", () => { se("tap"); });   // 離したときにプレビューを1回鳴らす
      }
      if (pMute) pMute.addEventListener("click", () => { toggleMute(); });
      // 画面外タップで閉じる（パネル内と 🔊 ボタン自体は除く。閉じるだけで、タップ先の操作は妨げない）
      document.addEventListener("pointerdown", (e) => {
        if (!panelOpen || !e || !e.target) return;
        const t = e.target;
        if ((panel && panel.contains(t)) || (t.closest && t.closest("#snd-btn"))) return;
        setPanel(false);
      }, true);
      syncPanel();
    } catch (e) {}
  }

  ONW.sound = {
    bgm, se, seKey, stopBgm, syncBgm, hold, release, noteFlip, resetFlips, forgetFlip,
    muted() { return !!cfg.mute; },
    bgmVol() { return Math.round((+cfg.bgm || 0) * 100); },
    seVol() { return Math.round((+cfg.se || 0) * 100); },
    setBgmVol, setSeVol, toggleMute, togglePanel,
    _refreshBtn: refreshBtn,
    _syncPanel: syncPanel,
    _panelOpen() { return panelOpen; },
  };
  try { if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => { refreshBtn(); bindPanel(); }); else { refreshBtn(); bindPanel(); } } catch (e) {}
})(window.ONW = window.ONW || {});
