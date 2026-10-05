/**
 * utils.js
 * ------------------------------------------------------------
 * どのファイルからも使う小さなヘルパー関数だけを置く場所。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const utils = {};

  /** Fisher–Yates シャッフル（破壊的） */
  utils.shuffle = function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  };

  /** 配列からランダムに1つ選ぶ */
  utils.randomChoice = function randomChoice(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
  };

  /** id からプレイヤーを引く */
  utils.playerById = function playerById(game, id) {
    return game.players.find((p) => p.id === id) || null;
  };

  /** HTMLエスケープ（他プレイヤーの名前・発言を安全に表示する） */
  utils.esc = function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  };

  /** 秒数を mm:ss 表示に変換 */
  utils.formatClock = function formatClock(totalSeconds) {
    const total = Math.max(0, Math.ceil(Number(totalSeconds) || 0));   // 小数は切り上げて整数秒にする
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  ONW.utils = utils;

})(window.ONW);
