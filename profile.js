/**
 * profile.js — プロフィール画面（アイコンを押すと開く重ね表示）
 * ------------------------------------------------------------
 * ・ロビーの参加者 / フレンド一覧のアイコンから開く。ログイン中のみ閲覧できる（RLS）
 * ・表示: アイコン・表示名・@ID・ひとこと・戦績（総合 / 陣営別 / 役職別 / 直近10戦）
 * ・#profile-overlay は #app の外なので、ロビーが再描画されても閉じない
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const pf = {};
  const esc = (s) => ONW.utils.esc(s);
  const TEAM = { village: ["村人陣営", "t-village"], wolf: ["人狼陣営", "t-wolf"], third: ["第三陣営", "t-third"] };
  let token = 0, cur = null, frMsg = "";

  const rn = (r) => { try { return ONW.roles.getInfo(r).name; } catch (e) { return r; } };
  const pct = (v) => `${v.toFixed(1)}%`;

  /** フレンド申請の欄（相手と自分の関係に合わせて表示を変える） */
  function friendHtml() {
    if (!cur || !ONW.friends) return "";
    const rel = ONW.friends.relation(cur.id), id = esc(cur.id);
    const body = {
      self: "",
      friend: `<span class="st st-ready">フレンドです</span>`,
      sent: `<span class="st st-wait">フレンド申請中</span>`,
      incoming: `<button class="btn btn--primary" onclick="ONW.profile.addFriend()">申請を承認する</button><span class="rs-dim">この人から申請が届いています</span>`,
      none: `<button class="btn btn--primary" onclick="ONW.profile.addFriend()">フレンド申請</button>`,
    }[rel];
    if (!body && !frMsg) return "";
    return `<div id="pf-fr" class="pf-fr">${body}${frMsg ? `<span class="pf-fr__msg">${esc(frMsg)}</span>` : ""}</div>`;
  }
  function paintFriend() { const el = document.getElementById("pf-fr"); if (el) el.outerHTML = friendHtml() || `<div id="pf-fr"></div>`; }
  pf.addFriend = async function () {
    if (!cur || pf.busy) return;
    pf.busy = true;
    const r = await ONW.friends.requestTo(cur);
    pf.busy = false;
    frMsg = r.msg;
    paintFriend();
  };

  pf.close = function () { token++; cur = null; const w = document.getElementById("profile-overlay"); if (w) w.remove(); };

  function shell(inner) {
    let w = document.getElementById("profile-overlay");
    if (!w) {
      w = document.createElement("div");
      w.id = "profile-overlay";
      w.onclick = (e) => { if (e.target === w) pf.close(); };
      document.body.appendChild(w);
    }
    w.innerHTML = `<div class="pf-card" role="dialog" aria-modal="true"><button class="pf-x" aria-label="閉じる" onclick="ONW.profile.close()">×</button>${inner}</div>`;
  }

  /** uid: 相手のユーザーUUID / name: 表示名（読み込み中の仮表示） */
  pf.open = async function (uid, name) {
    const A = ONW.account, me = ++token;
    if (!A || !A.enabled) return;
    if (!A.user) { shell(`<p class="lede">プロフィールを見るにはログインが必要です。</p>`); return; }
    if (!uid) { shell(`<p class="lede">ゲストのプレイヤーにはプロフィールがありません。</p>`); return; }
    shell(`<div class="pf-head">${A.avatarHtml(name, null, "av--lg")}<div><div class="pf-name">${esc(name || "")}</div></div></div><p class="rs-dim">読み込み中…</p>`);
    const sel = "id,user_id,display_name,avatar_updated_at";
    let r = await A.sb.from("profiles").select(sel + ",bio").eq("id", uid).maybeSingle();
    if (r.error) r = await A.sb.from("profiles").select(sel).eq("id", uid).maybeSingle();   // bio列が無い古いDB
    const [prof, st] = [r.data, await ONW.stats.load(uid)];
    if (me !== token) return;                       // 読み込み中に閉じた / 別の人を開いた
    if (!prof) { shell(`<p class="lede">プロフィールが見つかりませんでした。</p>`); return; }
    const mine = prof.id === A.user.id;
    cur = prof; frMsg = "";
    const av = A.avatarHtml(prof.display_name, { uid: prof.id, v: A.avatarVersion(prof) }, "av--lg");
    shell(`
      <div class="pf-head">${av}<div><div class="pf-name">${esc(prof.display_name)}</div><div class="rs-dim">@${esc(prof.user_id)}</div></div></div>
      ${friendHtml() || `<div id="pf-fr"></div>`}
      <div class="pf-bio ${prof.bio ? "" : "pf-bio--empty"}">${prof.bio ? esc(prof.bio) : "ひとこと未設定"}</div>
      ${statsHtml(st)}
      <div class="btn-row" style="justify-content:center;margin-top:14px;">
        ${mine ? `<button class="btn" onclick="ONW.profile.edit()">プロフィールを編集</button>` : ""}
        ${!mine && prof.avatar_updated_at ? `<button class="btn" onclick="ONW.friends.report('${esc(prof.id)}')">アイコンを通報</button>` : ""}
        <button class="btn btn--primary" onclick="ONW.profile.close()">閉じる</button>
      </div>`);
  };

  // ---------------------------------------------------------
  // ルームを抜けずにその場で編集（表示名・ひとこと・アイコン）
  //  タイトル画面のときだけ、従来どおりアカウント画面へ移動する
  // ---------------------------------------------------------
  const em = { msg: "", ok: false, busy: false };
  const emsg = (t, ok) => {
    em.msg = t || ""; em.ok = !!ok;
    const el = document.getElementById("pfe-msg");
    if (el) { el.textContent = em.msg; el.className = "acct-msg" + (ok ? " ok" : ""); }
  };
  const editVal = (id) => (document.getElementById(id) ? document.getElementById(id).value : "");
  const refreshChip = () => { try { ONW.accountUi.updateFixed(); } catch (e) {} };

  function editHtml() {
    const A = ONW.account, u = A.user;
    return `
      <div class="pf-head">${A.myAvatarHtml("av--lg")}<div><div class="pf-name">${esc(u.display_name)}</div><div class="rs-dim">@${esc(u.user_id)}</div></div></div>
      <div class="field-row"><label>表示名（1〜12文字）</label>
        <div class="chat-input"><input id="pfe-name" class="onw-input" maxlength="12" value="${esc(u.display_name)}" onkeydown="if(event.key==='Enter')ONW.profile.saveName()">
        <button class="btn" onclick="ONW.profile.saveName()">保存</button></div></div>
      <div class="field-row"><label>ひとこと（200文字まで）</label>
        <textarea id="pfe-bio" class="onw-input pf-bio-in" maxlength="200" rows="3">${esc(u.bio || "")}</textarea>
        <div class="btn-row" style="margin:6px 0 0;justify-content:flex-start;"><button class="btn" onclick="ONW.profile.saveBio()">ひとことを保存</button></div></div>
      <div class="field-row"><label>アイコン画像</label>
        <div class="btn-row" style="margin:0;">
          <label class="btn">画像を選ぶ<input type="file" accept="image/png,image/jpeg,image/webp" hidden onchange="ONW.profile.pickAvatar(this)"></label>
          ${u.avatar_updated_at ? `<button class="btn" onclick="ONW.profile.removeAvatar()">アイコンを削除</button>` : ""}
        </div></div>
      <p class="night-step__hint">PNG / JPEG / WebP。中央が正方形に切り抜かれ、256×256・100KB以下に縮小されます。</p>
      <p id="pfe-msg" class="acct-msg${em.ok ? " ok" : ""}">${esc(em.msg)}</p>
      <div class="btn-row" style="justify-content:center;margin-top:14px;">
        <button class="btn btn--primary" onclick="ONW.profile.open('${esc(u.id)}','${esc(u.display_name).replace(/'/g, "&#39;")}')">プロフィールに戻る</button>
      </div>`;
  }

  pf.edit = function () {
    const A = ONW.account;
    if (!A || !A.user) return;
    if (ONW.game.phase === ONW.PHASE.TITLE) { ONW.accountUi.leaveToAccount("account"); return; }   // タイトルなら退出の心配なし
    token++; cur = null; em.msg = ""; em.ok = false;
    shell(editHtml());
  };

  pf.saveName = async function () {
    if (em.busy) return;
    em.busy = true;
    const r = await ONW.account.setDisplayName(editVal("pfe-name"));
    em.busy = false;
    if (r.ok) { refreshChip(); em.msg = "表示名を変更しました。"; em.ok = true; shell(editHtml()); } else emsg(r.msg);
  };
  pf.saveBio = async function () {
    if (em.busy) return;
    em.busy = true;
    const r = await ONW.account.setBio(editVal("pfe-bio"));
    em.busy = false;
    emsg(r.ok ? "ひとことを保存しました。" : r.msg, r.ok);
  };
  pf.pickAvatar = async function (input) {
    const file = input.files && input.files[0];
    input.value = "";
    if (!file || em.busy) return;
    em.busy = true; emsg("画像を処理しています…", true);
    const r = await ONW.account.uploadAvatar(file);
    em.busy = false;
    if (r.ok) { refreshChip(); em.msg = "アイコンを変更しました。"; em.ok = true; shell(editHtml()); } else emsg(r.msg);
  };
  pf.removeAvatar = async function () {
    if (em.busy || !window.confirm("アイコン画像を削除しますか？")) return;
    em.busy = true;
    const r = await ONW.account.removeAvatar();
    em.busy = false;
    if (r.ok) { refreshChip(); em.msg = "アイコンを削除しました。"; em.ok = true; shell(editHtml()); } else emsg(r.msg);
  };

  function statsHtml(st) {
    if (!st || st.error) return `<h2>戦績</h2><p class="night-step__hint">戦績を読み込めませんでした。（管理者向け: setup.sql の「8.」を実行してください）</p>`;
    if (!st.total) return `<h2>戦績</h2><p class="night-step__hint">まだ戦績がありません。</p>`;
    const teams = ["village", "wolf", "third"].filter((t) => st.teams[t]).map((t) => {
      const x = st.teams[t];
      return `<div class="pf-row"><span class="${TEAM[t][1]}">${TEAM[t][0]}</span><span>${x.n}戦 ${x.w}勝</span><b>${pct(st.rateOf(x.w, x.n))}</b></div>`;
    }).join("");
    const roles = Object.entries(st.roles).sort((a, b) => b[1].n - a[1].n).map(([r, x]) => {
      let team = "village"; try { team = ONW.roles.getInfo(r).team; } catch (e) {}
      return `<div class="pf-row"><span class="${TEAM[team][1]}">${esc(rn(r))}</span><span>${x.n}戦 ${x.w}勝</span><b>${pct(st.rateOf(x.w, x.n))}</b></div>`;
    }).join("");
    const recent = st.recent.map((r) => `<span class="pf-chip ${r.won ? "win" : "lose"}" title="${esc(rn(r.initial_role))}">${r.won ? "勝" : "負"}<small>${esc(rn(r.initial_role))}</small></span>`).join("");
    return `
      <h2>戦績</h2>
      <div class="pf-sum">
        <div><b>${st.total}</b><span>試合</span></div><div><b>${st.wins}</b><span>勝利</span></div>
        <div><b>${st.losses}</b><span>敗北</span></div><div><b>${pct(st.rate)}</b><span>勝率</span></div>
      </div>
      <p class="night-step__hint" style="margin:6px 0 0;">追放された回数: ${st.executed}回（直近${st.total}戦・最大500戦）</p>
      <h2>陣営別</h2>${teams}
      <h2>役職別（配られた役職）</h2><div class="pf-roles">${roles}</div>
      <h2>直近の戦い</h2><div class="pf-recent">${recent}</div>`;
  }

  /** アイコン+名前を押せるリンクにして返す（uid が無いゲストは普通の表示） */
  pf.link = (uid, name, inner) => uid
    ? `<span class="pf-link" role="button" tabindex="0" onclick="ONW.profile.open('${esc(uid)}','${esc(name).replace(/'/g, "&#39;")}')">${inner}</span>`
    : inner;

  document.addEventListener("keydown", (e) => { if (e.key === "Escape") pf.close(); });
  ONW.profile = pf;
})(window.ONW);
