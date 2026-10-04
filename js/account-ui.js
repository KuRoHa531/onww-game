/**
 * account-ui.js — タイトル画面まわりのアカウント画面
 *   ・右上の小さな「ログイン」/「アイコン+表示名」
 *   ・ログイン / 新規作成 / アカウント(表示名・アイコン) / フレンド の各画面
 * ゲーム進行とは独立。画面の切り替えは既存の game.titleStep を使う
 *   ("login" | "account" | "friends")。フォームの入力途中の値だけここ(s)に持つ。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const esc = (s) => ONW.utils.esc(s);
  const A = () => ONW.account;
  const s = { mode: "login", id: "", busy: false, msg: "", nameDraft: null, bioDraft: null };
  const ui = { s, STEPS: ["login", "account", "friends"] };
  ONW.accountUi = ui;

  const rerender = () => ONW.ui.render(ONW.game);
  const setMsg = (t, ok) => {
    s.msg = t || "";
    const el = document.getElementById("acct-msg");
    if (el) { el.textContent = s.msg; el.className = "acct-msg" + (ok ? " ok" : ""); }
  };
  const val = (id) => (document.getElementById(id) ? document.getElementById(id).value : "");
  const go = (step) => { s.msg = ""; ONW.main.titleStep(step); };

  // ---------------------------------------------------------
  // 右上のチップ（タイトルのメニュー画面だけに出す）
  // ---------------------------------------------------------
  ui.bar = function () {
    const a = A();
    if (!a || !a.enabled || !a.ready) return "";
    if (!a.user) return `<div class="acct-bar"><button class="acct-chip" onclick="ONW.accountUi.openLogin()">ログイン</button></div>`;
    const n = ONW.friends ? ONW.friends.incoming.length : 0;
    return `<div class="acct-bar"><button class="acct-chip acct-chip--me" onclick="ONW.accountUi.openAccount()">
      ${a.myAvatarHtml("av--xs")}<span class="acct-chip__name">${esc(a.user.display_name)}</span>${n ? `<span class="badge">${n}</span>` : ""}</button></div>`;
  };
  // ---------------------------------------------------------
  // トップ以外の画面の右上チップ（ルーム・ゲーム中も自分のアカウントへ）
  // ---------------------------------------------------------
  ui.updateFixed = function () {
    const a = A(), g = ONW.game;
    let el = document.getElementById("acct-fixed");
    if (!el) { el = document.createElement("div"); el.id = "acct-fixed"; el.className = "acct-fixed"; (document.getElementById("top-right") || document.body).appendChild(el); }
    const show = !!(a && a.enabled && a.ready) && g.phase !== ONW.PHASE.TITLE;
    const n = ONW.friends ? ONW.friends.incoming.length : 0;
    const html = !show ? "" : a.user
      ? `<button class="acct-chip acct-chip--me" aria-label="アカウント" onclick="ONW.accountUi.openFromGame()">${a.myAvatarHtml("av--xs")}<span class="acct-chip__name">${esc(a.user.display_name)}</span>${n ? `<span class="badge">${n}</span>` : ""}</button>`
      : `<button class="acct-chip" onclick="ONW.accountUi.openFromGame()">ログイン</button>`;
    if (el.__html === html) return;
    el.__html = html; el.innerHTML = html;
  };
  /** ルーム・ゲーム中: ログイン済みなら自分のプロフィールを重ねて表示（退出しない）/ 未ログインはログイン画面へ（退出の確認あり） */
  ui.openFromGame = function () {
    const a = A();
    if (a && a.user && ONW.profile) { ONW.profile.open(a.user.id, a.user.display_name); return; }
    ui.leaveToAccount("login");
  };
  /** 今のルームを退出してアカウント関連の画面へ */
  ui.leaveToAccount = function (step) {
    if (ONW.game.phase !== ONW.PHASE.TITLE && !window.confirm("今のルームから退出して、アカウント画面へ移動します。よろしいですか？")) return;
    if (ONW.profile) ONW.profile.close();
    ONW.main.goToTitle();
    if (step === "login") ui.openLogin(); else ui.openAccount();
  };

  ui.updateBadge = function () {
    ui.updateFixed();
    const el = document.querySelector(".acct-bar");
    if (el && ONW.game.phase === ONW.PHASE.TITLE) el.outerHTML = ui.bar();
  };

  ui.openLogin = () => { s.mode = "login"; go("login"); };
  ui.openAccount = () => { go("account"); if (ONW.friends) ONW.friends.reload(); };
  ui.openFriends = () => { go("friends"); if (ONW.friends) ONW.friends.reload(); };
  ui.back = () => ONW.main.titleBack();

  // ---------------------------------------------------------
  // 画面本体
  // ---------------------------------------------------------
  ui.render = function (step) {
    const a = A();
    if (!a.enabled) return `<section class="panel title-menu"><p class="lede">アカウント機能は設定されていません。</p>
      <div class="title-btns"><button class="btn btn--wide" onclick="ONW.accountUi.back()">戻る</button></div></section>`;
    if (step === "login" && a.user) step = "account";
    if ((step === "account" || step === "friends") && !a.user) step = "login";
    return { login: loginHtml, account: accountHtml, friends: friendsHtml }[step]();
  };

  function loginHtml() {
    const signup = s.mode === "signup";
    return `
      <section class="panel title-menu acct-panel">
        <div class="acct-tabs">
          <button class="acct-tab ${signup ? "" : "on"}" onclick="ONW.accountUi.tab('login')">ログイン</button>
          <button class="acct-tab ${signup ? "on" : ""}" onclick="ONW.accountUi.tab('signup')">アカウント作成</button>
        </div>
        <div class="field-row"><label>ユーザーID</label>
          <input id="acc-id" class="onw-input" maxlength="16" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" value="${esc(s.id)}" placeholder="半角英数字と _ ／ 3〜16文字"></div>
        <div class="field-row"><label>パスワード</label>
          <input id="acc-pw" class="onw-input" type="password" maxlength="72" autocomplete="${signup ? "new-password" : "current-password"}" placeholder="${signup ? "8文字以上" : ""}" onkeydown="if(event.key==='Enter')ONW.accountUi.submit()"></div>
        ${signup ? `
        <div class="field-row"><label>パスワード（確認）</label>
          <input id="acc-pw2" class="onw-input" type="password" maxlength="72" autocomplete="new-password" onkeydown="if(event.key==='Enter')ONW.accountUi.submit()"></div>
        <div class="acct-warn"><strong>パスワードを忘れると復旧できません。</strong><br>
          メールアドレスを登録しないため、再設定の手段がありません。忘れた場合は新しいIDで作り直しになります。
          IDは後から変更できません（表示名は何度でも変えられます）。</div>` : ""}
        <p id="acct-msg" class="acct-msg">${esc(s.msg)}</p>
        <div class="title-btns">
          <button class="btn btn--primary btn--wide" onclick="ONW.accountUi.submit()">${signup ? "アカウントを作成" : "ログイン"}</button>
          <button class="btn btn--wide" onclick="ONW.accountUi.back()">戻る（ログインせずに遊ぶ）</button>
        </div>
      </section>`;
  }

  function accountHtml() {
    const u = A().user, n = ONW.friends ? ONW.friends.incoming.length : 0;
    const draft = s.nameDraft == null ? u.display_name : s.nameDraft;
    return `
      <section class="panel title-menu acct-panel">
        <div class="acct-me">
          ${A().myAvatarHtml("av--lg")}
          <div><div class="acct-me__name">${esc(u.display_name)}</div><div class="rs-dim">ID: @${esc(u.user_id)}</div></div>
        </div>
        <div class="field-row"><label>表示名（1〜12文字）</label>
          <div class="chat-input"><input id="acc-name" class="onw-input" maxlength="12" value="${esc(draft)}" oninput="ONW.accountUi.s.nameDraft=this.value" onkeydown="if(event.key==='Enter')ONW.accountUi.saveName()">
          <button class="btn" onclick="ONW.accountUi.saveName()">保存</button></div></div>
        <div class="field-row"><label>ひとこと（プロフィールに表示・200文字まで）</label>
          <textarea id="acc-bio" class="onw-input pf-bio-in" maxlength="200" rows="3" placeholder="例: 狼のときは堂々と嘘をつきます" oninput="ONW.accountUi.s.bioDraft=this.value">${esc(s.bioDraft == null ? (u.bio || "") : s.bioDraft)}</textarea>
          <div class="btn-row" style="margin:6px 0 0;justify-content:flex-start;"><button class="btn" onclick="ONW.accountUi.saveBio()">ひとことを保存</button>
          <button class="btn" onclick="ONW.profile.open('${esc(u.id)}','${esc(u.display_name)}')">プロフィール・戦績を見る</button></div></div>
        <div class="field-row"><label>アイコン画像</label>
          <div class="btn-row" style="margin:0;">
            <label class="btn">画像を選ぶ<input id="acc-file" type="file" accept="image/png,image/jpeg,image/webp" hidden onchange="ONW.accountUi.pickAvatar(this)"></label>
            ${u.avatar_updated_at ? `<button class="btn" onclick="ONW.accountUi.removeAvatar()">アイコンを削除</button>` : ""}
          </div></div>
        <p class="night-step__hint">PNG / JPEG / WebP。中央が正方形に切り抜かれ、256×256・100KB以下に縮小されます。不適切な画像は通報の対象です。</p>
        <p id="acct-msg" class="acct-msg">${esc(s.msg)}</p>
        <div class="title-btns">
          <button class="btn btn--primary btn--wide" onclick="ONW.accountUi.openFriends()">フレンド${n ? ` <span class="badge">${n}</span>` : ""}</button>
          <button class="btn btn--wide" onclick="ONW.accountUi.logout()">ログアウト</button>
          <button class="btn btn--wide" onclick="ONW.accountUi.back()">戻る</button>
        </div>
      </section>`;
  }

  function friendsHtml() {
    const fr = ONW.friends;
    return `
      <section class="panel title-menu acct-panel">
        <h2>フレンド申請</h2>
        <div class="chat-input"><input id="fr-id" class="onw-input" maxlength="16" autocapitalize="none" autocorrect="off" spellcheck="false" placeholder="相手のユーザーID" onkeydown="if(event.key==='Enter')ONW.accountUi.addFriend()">
          <button class="btn btn--primary" onclick="ONW.accountUi.addFriend()">申請</button></div>
        <p id="fr-msg" class="acct-msg">${esc(fr.msg)}</p>
        <div id="friends-body">${fr.friendsHtml()}</div>
        <div class="title-btns"><button class="btn btn--wide" onclick="ONW.accountUi.openAccount()">戻る</button></div>
      </section>`;
  }

  // ---------------------------------------------------------
  // 操作
  // ---------------------------------------------------------
  ui.tab = function (mode) { s.id = val("acc-id").trim(); s.mode = mode; s.msg = ""; rerender(); };

  ui.submit = async function () {
    if (s.busy) return;
    const id = val("acc-id").trim(), pw = val("acc-pw");
    s.id = id;
    if (s.mode === "signup" && pw !== val("acc-pw2")) return setMsg("確認用のパスワードが一致しません。");
    s.busy = true; setMsg("処理中…", true);
    const r = s.mode === "signup" ? await A().signUp(id, pw) : await A().signIn(id, pw);
    s.busy = false;
    if (!r.ok) return setMsg(r.msg);
    s.id = ""; s.msg = ""; s.nameDraft = null;
    go("account");
  };

  ui.logout = async function () {
    await A().signOut();
    s.msg = ""; s.nameDraft = null; s.bioDraft = null;
    ONW.main.titleBack();
  };

  ui.saveName = async function () {
    if (s.busy) return;
    s.busy = true;
    const r = await A().setDisplayName(val("acc-name"));
    s.busy = false;
    if (r.ok) { s.nameDraft = null; setMsg("表示名を変更しました。", true); } else setMsg(r.msg);
  };

  ui.saveBio = async function () {
    if (s.busy) return;
    s.busy = true;
    const r = await A().setBio(val("acc-bio"));
    s.busy = false;
    if (r.ok) { s.bioDraft = null; setMsg("ひとことを保存しました。", true); } else setMsg(r.msg);
  };

  ui.pickAvatar = async function (input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file || s.busy) return;
    s.busy = true; setMsg("画像を処理しています…", true);
    const r = await A().uploadAvatar(file);
    s.busy = false;
    if (r.ok) { s.msg = "アイコンを変更しました。"; rerender(); setMsg(s.msg, true); } else setMsg(r.msg);
  };

  ui.removeAvatar = async function () {
    if (s.busy || !window.confirm("アイコン画像を削除しますか？")) return;
    s.busy = true;
    const r = await A().removeAvatar();
    s.busy = false;
    if (r.ok) { s.msg = "アイコンを削除しました。"; rerender(); setMsg(s.msg, true); } else setMsg(r.msg);
  };

  ui.addFriend = async function () {
    if (s.busy) return;
    s.busy = true;
    const el = document.getElementById("fr-id");
    await ONW.friends.sendRequest(el ? el.value : "");
    s.busy = false;
    if (el && /申請しました|承認しました/.test(ONW.friends.msg)) el.value = "";
  };

  // 起動直後・ログイン状態の変化で、タイトルのメニューを描き直す（入力中は邪魔しない）
  A().onChange(() => {
    const t = document.activeElement && document.activeElement.tagName;
    if (t === "INPUT" || t === "TEXTAREA") return;
    if (ONW.game.phase === ONW.PHASE.TITLE) rerender();
  });
})(window.ONW);
