/**
 * main.js
 * ------------------------------------------------------------
 * 画面から呼ばれるハンドラをまとめ、状態(ONW.game)を更新してから
 * ONW.ui.render() を呼び直す、という一方通行の流れを作るファイル。
 * 「箱」段階のゴールはここまで: タイトル→設定→配役→夜→昼→投票→結果
 * が一通りループすること。各役職の能力そのものは night.js の
 * TODO に留めてある。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {

  const game = ONW.game;
  let dayTimerHandle = null;

  const main = {};

  function rerender() {
    ONW.ui.render(game);
  }

  // ---------------------------------------------------------
  // タイトル / セットアップ
  // ---------------------------------------------------------
  main.goToTitle = function goToTitle() {
    stopDayTimer();
    ONW.net.leave();
    Object.assign(game, ONW.createInitialState());
    rerender();
  };

  function readInputs() {
    const name = (document.getElementById("in-name")?.value || "").trim();
    const code = (document.getElementById("in-code")?.value || "").trim();
    game.draft = { name, code };
    if (name) { try { localStorage.setItem("onw.playerName.v1", name); } catch (e) {} }   // 次回以降の入力を省略
    game.error = "";
    return { name, code };
  }
  function fail(msg) { Object.assign(game, { phase: ONW.PHASE.TITLE, error: msg }); rerender(); }

  main.titleStep = function (step) { readInputs(); game.titleStep = step; rerender(); };
  main.titleBack = function () { readInputs(); game.titleStep = "menu"; rerender(); };

  main.createRoom = function createRoom() {
    const { name } = readInputs();
    if (!name) return fail("名前を入力してください。");
    ONW.net.createRoom(name, fail);
  };

  main.joinRoom = function joinRoom() {
    const { name, code } = readInputs();
    if (!name) return fail("名前を入力してください。");
    if (code.length !== 4) return fail("部屋コード（4文字）を入力してください。");
    ONW.net.joinRoom(code, name, fail);
  };

  main.goToSetup = function goToSetup() {
    game.phase = ONW.PHASE.SETUP;
    rerender();
  };

  main.changePlayerCount = function changePlayerCount(delta) {
    game.playerCount = Math.max(3, Math.min(10, game.playerCount + delta));
    rerender();
  };

  main.toggleRole = function toggleRole(role) {
    game.selectedRoles.push(role);
    rerender();
  };

  main.handleRoleRightClick = function handleRoleRightClick(event) {
    event.preventDefault();
    const chip = event.target.closest(".role-chip");
    if (!chip) return;
    const role = Object.keys(ONW.ROLE_INFO).find(
      (r) => ONW.roles.getInfo(r).name === chip.querySelector(".role-chip__name").textContent.replace(/\s×\d+$/, "")
    );
    const idx = game.selectedRoles.lastIndexOf(role);
    if (idx >= 0) game.selectedRoles.splice(idx, 1);
    rerender();
  };

  main.startGame = function startGame() {
    const check = ONW.roles.validateSetup(game);
    if (!check.ok) {
      alert(check.message);
      return;
    }

    game.players = Array.from({ length: game.playerCount }, (_, i) => ({
      id: `p${i + 1}`,
      name: `プレイヤー${i + 1}`,
      isCpu: false, // TODO: CPU参加のオン/オフをセットアップ画面に追加する
    }));

    ONW.roles.dealRoles(game);

    game.phase = ONW.PHASE.REVEAL;
    game.revealIndex = 0;
    game.revealShown = false;
    rerender();
  };

  // ---------------------------------------------------------
  // 配役確認（パス&プレイ）
  // ---------------------------------------------------------
  main.showReveal = function showReveal() {
    game.revealShown = true;
    rerender();
  };

  main.nextReveal = function nextReveal() {
    game.revealIndex += 1;
    game.revealShown = false;
    rerender();
  };

  main.beginNight = function beginNight() {
    ONW.night.start(game);
    rerender();
  };

  // ---------------------------------------------------------
  // 夜フェーズ
  // ---------------------------------------------------------
  main.advanceNight = function advanceNight() {
    const role = ONW.night.currentRole(game);
    if (role) {
      ONW.night.currentActors(game).forEach((player) => {
        const payload = player.isCpu
          ? ONW.cpu.decideNightAction(game, player, role)
          : null; // TODO: 人間プレイヤーの実際の操作結果をここに渡す
        ONW.night.resolveNightAction(game, player, role, payload);
      });
    }
    ONW.night.advance(game);
    rerender();
  };

  main.beginDay = function beginDay() {
    ONW.vote.startDiscussion(game);
    startDayTimer();
    rerender();
  };

  // ---------------------------------------------------------
  // 昼タイマー
  // ---------------------------------------------------------
  function startDayTimer() {
    stopDayTimer();
    if (!game.discussionSecondsLeft) return; // 0なら無制限（タイマーなし）
    dayTimerHandle = setInterval(() => {
      if (game.phase !== ONW.PHASE.DAY || game.votePhaseStarted) {
        stopDayTimer();
        return;
      }
      game.discussionSecondsLeft = Math.max(0, game.discussionSecondsLeft - 1);
      if (game.discussionSecondsLeft === 0) {
        stopDayTimer();
        main.goToVote();
        return;
      }
      rerender();
    }, 1000);
  }

  function stopDayTimer() {
    if (dayTimerHandle) clearInterval(dayTimerHandle);
    dayTimerHandle = null;
  }

  // ---------------------------------------------------------
  // 投票フェーズ
  // ---------------------------------------------------------
  main.goToVote = function goToVote() {
    stopDayTimer();
    ONW.vote.startVoting(game);
    game.activeVoterId = game.players[0]?.id ?? null;
    rerender();
  };

  main.selectVoteTarget = function selectVoteTarget(targetId) {
    if (!game.activeVoterId) return;
    ONW.vote.castVote(game, game.activeVoterId, targetId);
    rerender();
  };

  main.confirmVote = function confirmVote() {
    const currentIndex = game.players.findIndex((p) => p.id === game.activeVoterId);
    const next = game.players[currentIndex + 1];
    game.activeVoterId = next ? next.id : null;
    rerender();
  };

  main.finishVoting = function finishVoting() {
    ONW.vote.resolveElimination(game);
    ONW.vote.determineWinners(game);
    game.phase = ONW.PHASE.RESULT;
    rerender();
  };

  ONW.main = main;

  // ---------------------------------------------------------
  // 起動
  // ---------------------------------------------------------
  // ゲーム内の文字のコピー・選択・右クリックメニューを止める（入力欄の中だけは普通に使える）
  const inField = (e) => { const t = e.target; return !!(t && t.closest && t.closest("input, textarea, [contenteditable='true']")); };
  ["copy", "cut", "selectstart", "dragstart"].forEach((ev) => document.addEventListener(ev, (e) => { if (!inField(e)) e.preventDefault(); }));
  document.addEventListener("contextmenu", (e) => { if (!inField(e)) e.preventDefault(); });
  document.addEventListener("DOMContentLoaded", () => {
    rerender();
    // アカウント機能の初期化（セッション復元）。失敗してもゲームには影響しない
    if (ONW.account) ONW.account.init().catch(() => {});
  });

})(window.ONW);
