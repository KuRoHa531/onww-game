/**
 * friends.js — フレンド / オンライン状態(Presence) / ルーム招待
 * ------------------------------------------------------------
 * ・ログイン中だけ動く（account.js が start()/stop() を呼ぶ）。
 * ・フレンド申請・招待の受信は Realtime(Postgres Changes)。RLS が効くので自分宛てしか届かない。
 *   （DELETE は RLS で絞れず全員に飛んでしまうので購読しない。削除は画面を開いた時に反映）
 * ・オンライン状態は Presence。キーは自分のuid、中身は空に近い（個人情報を載せない）。
 * ・部屋コードは invites テーブルに10分だけ入る。招待を受けた本人にしか見えない。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const esc = (s) => ONW.utils.esc(s);
  const INVITE_TTL_MS = 10 * 60 * 1000;
  const sb = () => ONW.account.sb;
  const me = () => ONW.account.user;

  const f = {
    friends: [],     // 成立済み [{ fid, uid, user_id, display_name, avatar_updated_at }]
    incoming: [],    // 受けた申請 [{ fid, ...profile }]
    outgoing: [],    // 送った申請 [{ fid, ...profile }]
    online: new Set(),
    invites: [],     // 届いている招待 [{ id, from, name, code, at }]
    sent: new Set(), // 送った招待 `${code}:${uid}`
    msg: "",
    chPresence: null,
    chDb: null,
    timers: {},
    refreshTimer: null,
  };
  ONW.friends = f;

  // ---------------------------------------------------------
  // 開始 / 停止
  // ---------------------------------------------------------
  f.start = async function () {
    f.stop(true);
    if (!ONW.account.enabled || !me()) return;
    const uid = me().id;
    ensureToastBox();

    // オンライン状態: 全員が同じチャンネルに入り、自分のuidをキーに登録するだけ
    f.chPresence = sb().channel("onw-online", { config: { presence: { key: uid } } });
    f.chPresence.on("presence", { event: "sync" }, () => {
      f.online = new Set(Object.keys(f.chPresence.presenceState()));
      f.refreshViews();
    });
    f.chPresence.subscribe((status) => {
      if (status === "SUBSCRIBED") f.chPresence.track({ on: 1 });   // track は一度だけ（頻繁に呼ぶと制限にかかる）
    });

    // 自分宛ての申請・承認・招待
    f.chDb = sb().channel("onw-db-" + uid)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "friendships" }, () => f.scheduleRefresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "friendships" }, () => f.scheduleRefresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "invites", filter: `to_user=eq.${uid}` }, (p) => onInvite(p.new))
      .subscribe();

    await f.refresh();
    loadPendingInvites();
  };

  f.stop = function (keepToasts) {
    try { if (f.chPresence) sb().removeChannel(f.chPresence); } catch (e) { /* 無視 */ }
    try { if (f.chDb) sb().removeChannel(f.chDb); } catch (e) { /* 無視 */ }
    f.chPresence = f.chDb = null;
    Object.assign(f, { friends: [], incoming: [], outgoing: [], online: new Set(), sent: new Set(), msg: "" });
    Object.values(f.timers).forEach(clearTimeout); f.timers = {};
    if (!keepToasts) { f.invites = []; renderToasts(); }
  };

  f.scheduleRefresh = function () {
    clearTimeout(f.refreshTimer);
    f.refreshTimer = setTimeout(() => f.refresh(), 300);
  };

  // ---------------------------------------------------------
  // 一覧の取得
  // ---------------------------------------------------------
  f.refresh = async function () {
    if (!me()) return;
    const myId = me().id;
    const { data: rows, error } = await sb().from("friendships").select("id,requester,addressee,status");
    if (error) return;
    const ids = [...new Set(rows.map((r) => (r.requester === myId ? r.addressee : r.requester)))];
    let profs = {};
    if (ids.length) {
      const { data } = await sb().from("profiles").select("id,user_id,display_name,avatar_updated_at").in("id", ids);
      (data || []).forEach((p) => { profs[p.id] = p; });
    }
    const mk = (r) => { const pid = r.requester === myId ? r.addressee : r.requester; const p = profs[pid]; return p ? { fid: r.id, uid: pid, ...p } : null; };
    const byName = (a, b) => a.display_name.localeCompare(b.display_name, "ja");
    f.friends = rows.filter((r) => r.status === "accepted").map(mk).filter(Boolean).sort(byName);
    f.incoming = rows.filter((r) => r.status === "pending" && r.addressee === myId).map(mk).filter(Boolean);
    f.outgoing = rows.filter((r) => r.status === "pending" && r.requester === myId).map(mk).filter(Boolean);
    f.refreshViews();
    ONW.accountUi && ONW.accountUi.updateBadge();
  };

  // ---------------------------------------------------------
  // フレンド申請・承認・拒否・削除
  // ---------------------------------------------------------
  f.sendRequest = async function (rawId) {
    const id = String(rawId || "").trim().toLowerCase();
    if (!ONW.account.validateId(id)) return say("IDは半角英数字と _ の3〜16文字です。");
    if (id === me().user_id) return say("自分自身には申請できません。");
    const { data: target, error } = await sb().from("profiles").select("id,user_id,display_name").eq("user_id", id).maybeSingle();
    if (error) return say("検索に失敗しました。");
    if (!target) return say("そのIDのユーザーは見つかりません。");
    if (f.friends.some((x) => x.uid === target.id)) return say("すでにフレンドです。");
    if (f.outgoing.some((x) => x.uid === target.id)) return say("すでに申請済みです。");
    const rev = f.incoming.find((x) => x.uid === target.id);
    if (rev) { await f.accept(rev.fid); return say(`${target.display_name} さんからの申請を承認しました。`, true); }
    const ins = await sb().from("friendships").insert({ requester: me().id, addressee: target.id, status: "pending" });
    if (ins.error) return say("申請できませんでした。");
    await f.refresh();
    say(`${target.display_name} さんに申請しました。`, true);
  };

  f.accept = async function (fid) {
    const { error } = await sb().from("friendships").update({ status: "accepted" }).eq("id", fid);
    if (error) return say("承認できませんでした。");
    await f.refresh();
  };
  /** 拒否 / 申請の取消 / フレンド削除はどれも「行を消す」 */
  f.remove = async function (fid, ask) {
    if (ask && !window.confirm(ask)) return;
    const { error } = await sb().from("friendships").delete().eq("id", fid);
    if (error) return say("操作できませんでした。");
    await f.refresh();
  };

  f.removeFriend = function (fid) {
    const p = f.friends.find((x) => x.fid === fid);
    return f.remove(fid, `${p ? p.display_name : "この人"} さんをフレンドから削除しますか？`);
  };

  f.report = async function (uid) {
    if (!me()) return;
    const reason = window.prompt("通報の理由を書いてください（アイコン画像が不適切、など。200文字まで）", "不適切なアイコン画像");
    if (reason === null) return;
    const r = await ONW.account.report(uid, reason);
    window.alert(r.ok ? "通報を受け付けました。" : r.msg);
  };

  function say(text, ok) {
    f.msg = text;
    const el = document.getElementById("fr-msg");
    if (el) { el.textContent = text; el.className = "acct-msg" + (ok ? " ok" : ""); }
  }

  // ---------------------------------------------------------
  // 招待を送る（ロビーのホスト）
  // ---------------------------------------------------------
  f.invite = async function (uid) {
    const code = ONW.net.code;
    if (!me() || !ONW.net.isHost || !code) return;
    const key = `${code}:${uid}`;
    const { error } = await sb().from("invites").insert({ from_user: me().id, to_user: uid, room_code: code });
    const el = document.getElementById("inv-msg");
    if (error) { if (el) { el.textContent = "招待できませんでした（連続で送りすぎかもしれません）。"; el.className = "acct-msg"; } return; }
    f.sent.add(key);
    if (el) { el.textContent = "招待を送りました（10分間有効）。"; el.className = "acct-msg ok"; }
    f.refreshViews();
  };

  // ---------------------------------------------------------
  // 招待を受ける
  // ---------------------------------------------------------
  async function loadPendingInvites() {
    const { data } = await sb().from("invites").select("id,from_user,room_code,created_at").eq("to_user", me().id);
    (data || []).forEach((r) => onInvite(r));
  }

  async function onInvite(r) {
    if (!r || f.invites.some((x) => x.id === r.id)) return;
    const age = Date.now() - new Date(r.created_at).getTime();
    if (age > INVITE_TTL_MS) return;
    let name = (f.friends.find((x) => x.uid === r.from_user) || {}).display_name;
    if (!name) {
      const { data } = await sb().from("profiles").select("display_name").eq("id", r.from_user).maybeSingle();
      name = data ? data.display_name : "誰か";
    }
    f.invites.push({ id: r.id, from: r.from_user, name, code: r.room_code, at: r.created_at });
    f.timers[r.id] = setTimeout(() => dropInvite(r.id), Math.max(5000, INVITE_TTL_MS - Math.max(0, age)));
    renderToasts();
  }

  function dropInvite(id) {
    f.invites = f.invites.filter((x) => x.id !== id);
    clearTimeout(f.timers[id]); delete f.timers[id];
    renderToasts();
  }

  f.ignoreInvite = async function (id) {
    dropInvite(id);
    try { await sb().from("invites").delete().eq("id", id); } catch (e) { /* 10分で消えるので無視 */ }
  };

  f.acceptInvite = async function (id) {
    const inv = f.invites.find((x) => x.id === id);
    if (!inv) return;
    const g = ONW.game;
    if (g.phase !== ONW.PHASE.TITLE && !window.confirm("今の部屋を退出して、招待された部屋に参加しますか？")) return;
    dropInvite(id);
    try { sb().from("invites").delete().eq("id", id).then(() => {}); } catch (e) { /* 無視 */ }
    // 退出 → 参加画面に部屋コードと表示名を入れて、そのまま参加する
    ONW.main.goToTitle();
    Object.assign(ONW.game, { draft: { name: ONW.account.displayName, code: inv.code }, titleStep: "join", error: "" });
    ONW.ui.render(ONW.game);
    ONW.main.joinRoom();
  };

  // ---------------------------------------------------------
  // 画面パーツ
  // ---------------------------------------------------------
  function ensureToastBox() {
    if (document.getElementById("onw-toasts")) return;
    const d = document.createElement("div");
    d.id = "onw-toasts";
    d.setAttribute("aria-live", "polite");
    document.body.appendChild(d);
  }
  function renderToasts() {
    const box = document.getElementById("onw-toasts");
    if (!box) return;
    box.innerHTML = f.invites.map((i) => `
      <div class="toast">
        <div class="toast__text"><strong>${esc(i.name)}</strong> さんから招待が届きました</div>
        <div class="toast__btns">
          <button class="btn btn--primary" onclick="ONW.friends.acceptInvite('${esc(i.id)}')">参加</button>
          <button class="btn" onclick="ONW.friends.ignoreInvite('${esc(i.id)}')">無視</button>
        </div>
      </div>`).join("");
  }

  const dot = (on) => `<span class="dot ${on ? "dot--on" : ""}" title="${on ? "オンライン" : "オフライン"}"></span>`;
  const who = (p) => `${ONW.account.avatarHtml(p.display_name, { uid: p.uid, v: ONW.account.avatarVersion(p) }, "av--sm")}
    <span class="fr-name">${esc(p.display_name)}<small>@${esc(p.user_id)}</small></span>`;

  /** フレンド画面の中身（申請 / 一覧） */
  f.friendsHtml = function () {
    const inc = f.incoming.map((p) => `
      <div class="fr-row">${who(p)}
        <span class="fr-btns"><button class="btn btn--primary" onclick="ONW.friends.accept('${esc(p.fid)}')">承認</button>
        <button class="btn" onclick="ONW.friends.remove('${esc(p.fid)}')">拒否</button></span></div>`).join("");
    const out = f.outgoing.map((p) => `
      <div class="fr-row">${who(p)}
        <span class="fr-btns"><span class="st st-wait">申請中</span>
        <button class="btn" onclick="ONW.friends.remove('${esc(p.fid)}')">取消</button></span></div>`).join("");
    const list = f.friends.map((p) => `
      <div class="fr-row">${dot(f.online.has(p.uid))}${who(p)}
        <span class="fr-btns">${p.avatar_updated_at ? `<button class="btn tf-chip" title="アイコンを通報" onclick="ONW.friends.report('${esc(p.uid)}')">通報</button>` : ""}
        <button class="btn tf-chip" onclick="ONW.friends.removeFriend('${esc(p.fid)}')">削除</button></span></div>`).join("");
    return `
      ${inc ? `<h2>届いた申請</h2>${inc}` : ""}
      <h2>フレンド ${f.friends.length}人 <small class="rs-dim">（オンライン ${f.friends.filter((p) => f.online.has(p.uid)).length}）</small></h2>
      ${list || `<p class="night-step__hint">まだフレンドがいません。上の欄にIDを入れて申請しましょう。</p>`}
      ${out ? `<h2>送った申請</h2>${out}` : ""}`;
  };

  /** ロビーの「フレンドを招待」リスト */
  f.inviteListHtml = function () {
    const code = ONW.net.code;
    if (!f.friends.length) return `<p class="night-step__hint">フレンドがいません。タイトル画面の「アカウント」から追加できます。</p>`;
    const rows = [...f.friends].sort((a, b) => (f.online.has(b.uid) ? 1 : 0) - (f.online.has(a.uid) ? 1 : 0)).map((p) => {
      const sent = f.sent.has(`${code}:${p.uid}`);
      return `<div class="fr-row">${dot(f.online.has(p.uid))}${who(p)}
        <span class="fr-btns"><button class="btn ${sent ? "" : "btn--primary"}" onclick="ONW.friends.invite('${esc(p.uid)}')">${sent ? "再招待" : "招待"}</button></span></div>`;
    }).join("");
    return rows;
  };

  /** 表示中の一覧だけを差し替える（入力欄を壊さない） */
  f.refreshViews = function () {
    const a = document.getElementById("friends-body");
    if (a) a.innerHTML = f.friendsHtml();
    const b = document.getElementById("inv-list");
    if (b) b.innerHTML = f.inviteListHtml();
  };

  // 画面を開くたびに最新化したいとき用
  f.reload = () => f.refresh();
})(window.ONW);
