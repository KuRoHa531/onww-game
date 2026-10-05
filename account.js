/**
 * account.js — アカウント（Supabase Auth / profiles / Storage）
 * ------------------------------------------------------------
 * ・パスワードの保存・照合は Supabase Auth に任せる（このファイルでは何もしない）。
 * ・パスワード/トークンは console にも画面にも出さない。
 * ・設定(URL, anon key)が空なら enabled=false になり、ゲストプレイだけが動く。
 * ・ゲーム側(net.js等)との接点は、このファイルの
 *     ONW.account.displayName / ONW.account.me() / ONW.account.avatarHtml() だけ。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const cfg = ONW.config || {};
  const acc = {
    enabled: false,
    sb: null,            // supabase client
    user: null,          // { id, user_id, display_name, avatar_updated_at } ログイン中のみ
    ready: false,        // 起動時のセッション復元が終わったか
    avatarMap: {},       // ゲーム中の表示用: { 表示名: { uid, v } }（ロビーのたびに入れ替わる）
    listeners: [],       // 状態変化の通知先
  };
  const BUCKET = "avatars";
  const ID_RE = /^[A-Za-z0-9_]{3,16}$/;
  const MAX_BYTES = 100 * 1024;
  const AV_SIZE = 256;

  acc.onChange = (fn) => acc.listeners.push(fn);
  const notify = () => acc.listeners.forEach((fn) => { try { fn(); } catch (e) { /* 表示側の失敗でログイン処理を止めない */ } });

  // ---------------------------------------------------------
  // 初期化
  // ---------------------------------------------------------
  acc.init = async function () {
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase || !window.supabase.createClient) {
      acc.ready = true;
      return;
    }
    acc.enabled = true;
    acc.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // 別タブでのログアウトなどに追従（コールバック内で await するとデッドロックしうるので setTimeout に逃がす）
    acc.sb.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" && acc.user) setTimeout(() => acc._cleared(), 0);
    });
    try {
      const { data } = await acc.sb.auth.getSession();
      if (data && data.session) await acc._loadProfile(data.session.user.id);
    } catch (e) { /* 通信不可でもゲストとして続行 */ }
    acc.ready = true;
    if (acc.user && ONW.friends) ONW.friends.start();
    notify();
  };

  acc._cleared = function () {
    acc.user = null;
    if (ONW.friends) ONW.friends.stop();
    notify();
  };

  acc._loadProfile = async function (uid) {
    let { data, error } = await acc.sb.from("profiles")
      .select("id,user_id,display_name,avatar_updated_at,bio").eq("id", uid).maybeSingle();
    if (error) {   // setup.sql(8)をまだ実行していない場合は bio 列が無い → bio なしで読む
      ({ data, error } = await acc.sb.from("profiles").select("id,user_id,display_name,avatar_updated_at").eq("id", uid).maybeSingle());
    }
    if (error || !data) { acc.user = null; return false; }
    acc.user = data;
    return true;
  };

  // ---------------------------------------------------------
  // ゲーム側が使う小さな窓口
  // ---------------------------------------------------------
  /** ログイン中の表示名（ゲストなら空文字） */
  Object.defineProperty(acc, "displayName", { get: () => (acc.user ? acc.user.display_name : "") });
  /** ルーム参加時にホストへ渡す自己申告（P2Pなので表示用のみ。信用に使わない） */
  acc.me = () => (acc.user ? { uid: acc.user.id, av: avatarVersion(acc.user) } : { uid: null, av: 0 });

  function avatarVersion(p) { return p && p.avatar_updated_at ? new Date(p.avatar_updated_at).getTime() : 0; }

  /** アイコン画像のURL。無ければ null */
  acc.avatarUrl = function (uid, v) {
    if (!acc.enabled || !uid || !v) return null;
    return `${cfg.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}/${encodeURIComponent(uid)}/avatar.png?v=${encodeURIComponent(v)}`;
  };

  /**
   * アイコンのHTML（丸）。画像があれば <img>、無ければ頭文字。
   * name: 表示名 / info: { uid, v }（省略時はロビーで受け取った avatarMap から表示名で引く）
   */
  acc.avatarHtml = function (name, info, cls) {
    const esc = ONW.utils.esc;
    const i = info || acc.avatarMap[name];
    const url = i ? acc.avatarUrl(i.uid, i.v) : null;
    const letter = esc((name || "?").slice(0, 1));
    const c = `av ${cls || ""}`;
    if (!url) return `<span class="${c}"><span class="av__t">${letter}</span></span>`;
    // 読み込み失敗時は頭文字に戻す
    return `<span class="${c}"><span class="av__t">${letter}</span><img src="${esc(url)}" alt="" loading="lazy" decoding="async" onerror="this.remove()"></span>`;
  };

  // P2Pで他人から届く uid/av は偽装・不正な文字列がありうるので、形を確認してから使う
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  acc.cleanMeta = function (m) {
    const uid = m && typeof m.uid === "string" && UUID_RE.test(m.uid) ? m.uid : null;
    const av = m && Number.isFinite(m.av) && m.av > 0 ? Math.floor(m.av) : 0;
    return uid && av ? { uid, av } : { uid: uid, av: 0 };
  };
  acc.sanitizePlayers = (players) => (Array.isArray(players) ? players : []).map((p) => ({ ...p, ...acc.cleanMeta(p) }));

  /** ロビーのプレイヤー一覧(uid, av付き)からアイコン表を作り直す */
  acc.setAvatarMap = function (players) {
    const m = {};
    (players || []).forEach((p) => { if (p && p.name && p.uid && p.av) m[p.name] = { uid: p.uid, v: p.av }; });
    acc.avatarMap = m;
  };

  // ---------------------------------------------------------
  // 入力チェック・エラー文
  // ---------------------------------------------------------
  acc.validateId = (id) => ID_RE.test(id || "");
  const toEmail = (id) => `${String(id).toLowerCase()}@${cfg.EMAIL_DOMAIN || "onw.invalid"}`;

  function errText(err, fallback) {
    const code = (err && (err.code || err.error_code)) || "";
    const msg = String((err && err.message) || "");
    if (code === "user_already_exists" || /already registered/i.test(msg)) return "そのIDはすでに使われています。";
    if (code === "invalid_credentials" || /invalid login credentials/i.test(msg)) return "IDまたはパスワードが違います。";
    if (code === "over_request_rate_limit" || err?.status === 429) return "短時間に操作しすぎました。しばらく待ってからやり直してください。";
    if (code === "weak_password") return "パスワードが弱すぎます（8文字以上にしてください）。";
    if (code === "email_address_invalid" || /email address .* invalid/i.test(msg)) return "このIDは登録できませんでした（管理者向け: メール形式の設定を確認してください）。";
    if (code === "signup_disabled") return "現在、新規登録は停止されています。";
    if (/failed to fetch|network/i.test(msg)) return "通信に失敗しました。ネットワークを確認してください。";
    if (/database error saving new user/i.test(msg)) return "そのIDは登録できませんでした（すでに使われている可能性があります）。";
    return fallback || "うまくいきませんでした。もう一度お試しください。";
  }
  acc.errText = errText;

  // ---------------------------------------------------------
  // アカウント作成 / ログイン / ログアウト
  // ---------------------------------------------------------
  acc.signUp = async function (id, password) {
    if (!acc.enabled) return { ok: false, msg: "アカウント機能は設定されていません。" };
    if (!acc.validateId(id)) return { ok: false, msg: "IDは半角英数字と _ の3〜16文字にしてください。" };
    if (!password || password.length < 8) return { ok: false, msg: "パスワードは8文字以上にしてください。" };
    const uid = id.toLowerCase();
    const { data, error } = await acc.sb.auth.signUp({
      email: toEmail(uid),
      password,
      options: { data: { user_id: uid, display_name: uid.slice(0, 12) } },
    });
    if (error) return { ok: false, msg: errText(error, "アカウントを作成できませんでした。") };
    if (!data.session) {
      // Confirm email が ON のまま → 確認メールを待つ状態になってしまう
      return { ok: false, msg: "管理者向け: Supabase の「Confirm email」がONのままです。OFFにしてください（docs/supabase-setup.md 手順3）。" };
    }
    const ok = await acc._loadProfile(data.session.user.id);
    if (!ok) return { ok: false, msg: "プロフィールの作成に失敗しました。管理者向け: setup.sql が実行済みか確認してください。" };
    if (ONW.friends) ONW.friends.start();
    notify();
    return { ok: true };
  };

  acc.signIn = async function (id, password) {
    if (!acc.enabled) return { ok: false, msg: "アカウント機能は設定されていません。" };
    if (!acc.validateId(id) || !password) return { ok: false, msg: "IDまたはパスワードが違います。" };
    const { data, error } = await acc.sb.auth.signInWithPassword({ email: toEmail(id), password });
    if (error) return { ok: false, msg: errText(error, "ログインできませんでした。") };
    const ok = await acc._loadProfile(data.user.id);
    if (!ok) return { ok: false, msg: "プロフィールを読み込めませんでした。" };
    if (ONW.friends) ONW.friends.start();
    notify();
    return { ok: true };
  };

  acc.signOut = async function () {
    if (!acc.enabled) return;
    if (ONW.friends) ONW.friends.stop();
    try { await acc.sb.auth.signOut(); } catch (e) { /* ローカルのセッションは消えるので続行 */ }
    acc.user = null;
    notify();
  };

  // ---------------------------------------------------------
  // 表示名
  // ---------------------------------------------------------
  acc.setDisplayName = async function (name) {
    name = String(name || "").trim();
    if (!acc.user) return { ok: false, msg: "ログインしてください。" };
    if (name.length < 1 || name.length > 12) return { ok: false, msg: "表示名は1〜12文字にしてください。" };
    const { error } = await acc.sb.from("profiles").update({ display_name: name }).eq("id", acc.user.id);
    if (error) return { ok: false, msg: errText(error, "表示名を変更できませんでした。") };
    acc.user.display_name = name;
    notify();
    return { ok: true };
  };

  // ---------------------------------------------------------
  // ひとこと（プロフィールのコメント）
  // ---------------------------------------------------------
  acc.setBio = async function (text) {
    text = String(text || "").trim().slice(0, 200);
    if (!acc.user) return { ok: false, msg: "ログインしてください。" };
    const { error } = await acc.sb.from("profiles").update({ bio: text }).eq("id", acc.user.id);
    if (error) return { ok: false, msg: errText(error, "保存できませんでした。（管理者向け: setup.sql の「8.」を実行してください）") };
    acc.user.bio = text;
    return { ok: true };
  };

  // ---------------------------------------------------------
  // アイコン画像
  //   選んだ画像 → 中央を正方形に切り抜き → 256x256 → PNG → 100KB以下 → avatars/<uid>/avatar.png
  // ---------------------------------------------------------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }
  const toBlob = (canvas) => new Promise((res) => canvas.toBlob(res, "image/png"));

  /** 色数を減らして PNG を軽くする（levels段階。PNGは可逆圧縮なので色を粗くするのが一番効く） */
  function posterize(ctx, size, levels) {
    const im = ctx.getImageData(0, 0, size, size), d = im.data, step = 255 / (levels - 1);
    for (let i = 0; i < d.length; i += 4) {
      d[i] = Math.round(Math.round(d[i] / step) * step);
      d[i + 1] = Math.round(Math.round(d[i + 1] / step) * step);
      d[i + 2] = Math.round(Math.round(d[i + 2] / step) * step);
    }
    ctx.putImageData(im, 0, 0);
  }

  /** File → 100KB以下の正方形PNG Blob。失敗時は null */
  acc.makeAvatarBlob = async function (file) {
    if (!file || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) return { error: "PNG / JPEG / WebP の画像を選んでください。" };
    if (file.size > 20 * 1024 * 1024) return { error: "画像が大きすぎます（20MBまで）。" };
    let img;
    try { img = await loadImage(file); } catch (e) { return { error: "画像を読み込めませんでした。" }; }
    const w = img.naturalWidth, h = img.naturalHeight, side = Math.min(w, h);
    if (!side) return { error: "画像を読み込めませんでした。" };
    const sx = (w - side) / 2, sy = (h - side) / 2;
    // 256 → だめなら少しずつ小さく。各サイズで 色数を減らしながら試す
    for (const size of [AV_SIZE, 224, 192, 160, 128]) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = size;
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      for (const levels of [256, 64, 32, 16]) {
        if (levels < 256) posterize(ctx, size, levels);
        const blob = await toBlob(cv);
        if (blob && blob.size <= MAX_BYTES) return { blob };
      }
    }
    return { error: "画像を100KB以下にできませんでした。別の画像でお試しください。" };
  };

  acc.uploadAvatar = async function (file) {
    if (!acc.user) return { ok: false, msg: "ログインしてください。" };
    const r = await acc.makeAvatarBlob(file);
    if (r.error) return { ok: false, msg: r.error };
    const path = `${acc.user.id}/avatar.png`;
    const up = await acc.sb.storage.from(BUCKET).upload(path, r.blob, { upsert: true, contentType: "image/png", cacheControl: "3600" });
    if (up.error) return { ok: false, msg: "アップロードに失敗しました。" };
    const now = new Date().toISOString();
    const { error } = await acc.sb.from("profiles").update({ avatar_updated_at: now }).eq("id", acc.user.id);
    if (error) return { ok: false, msg: "アイコンの記録に失敗しました。" };
    acc.user.avatar_updated_at = now;
    notify();
    return { ok: true };
  };

  acc.removeAvatar = async function () {
    if (!acc.user) return { ok: false, msg: "ログインしてください。" };
    await acc.sb.storage.from(BUCKET).remove([`${acc.user.id}/avatar.png`]);
    const { error } = await acc.sb.from("profiles").update({ avatar_updated_at: null }).eq("id", acc.user.id);
    if (error) return { ok: false, msg: "アイコンを削除できませんでした。" };
    acc.user.avatar_updated_at = null;
    notify();
    return { ok: true };
  };

  /** 自分のアイコンHTML */
  acc.myAvatarHtml = (cls) => (acc.user ? acc.avatarHtml(acc.user.display_name, { uid: acc.user.id, v: avatarVersion(acc.user) }, cls) : "");

  // ---------------------------------------------------------
  // 通報（reports に記録するだけ）
  // ---------------------------------------------------------
  acc.report = async function (targetUid, reason) {
    if (!acc.user) return { ok: false, msg: "通報にはログインが必要です。" };
    if (!targetUid || targetUid === acc.user.id) return { ok: false, msg: "通報できません。" };
    const { error } = await acc.sb.from("reports").insert({
      reporter: acc.user.id, target: targetUid, kind: "avatar", reason: String(reason || "").slice(0, 200),
    });
    if (error) return { ok: false, msg: "通報を送れませんでした。" };
    return { ok: true };
  };

  // ---------------------------------------------------------
  // 参加中のルームの記録（room_members）: 回線落ち・タブを閉じた後でも、同じアカウントなら
  // トップ画面から同じ席に再入室できる。席ID と再入室キーは本人だけが読める（RLS）。
  // テーブルが無い（setup.sql の「9.」を未実行）場合は黙って何もしない。
  // ---------------------------------------------------------
  const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
  acc.roomSave = async function (code, seat, key) {
    if (!acc.user || !acc.sb || !code || !seat || !key) return;
    try {
      await acc.sb.from("room_members").upsert(
        { user_id: acc.user.id, room_code: String(code).toUpperCase(), seat_id: String(seat), resume_key: String(key), updated_at: new Date().toISOString() },
        { onConflict: "user_id" });
    } catch (e) { /* 記録できなくてもゲームは続ける */ }
  };
  acc.roomClear = async function () {
    if (!acc.user || !acc.sb) return;
    try { await acc.sb.from("room_members").delete().eq("user_id", acc.user.id); } catch (e) {}
  };
  acc.roomLoad = async function () {
    if (!acc.user || !acc.sb) return null;
    try {
      const { data, error } = await acc.sb.from("room_members").select("room_code,seat_id,resume_key,updated_at").eq("user_id", acc.user.id).maybeSingle();
      if (error || !data) return null;
      if (Date.now() - new Date(data.updated_at).getTime() > ROOM_TTL_MS) { acc.roomClear(); return null; }
      return data;
    } catch (e) { return null; }
  };

  acc.avatarVersion = avatarVersion;
  ONW.account = acc;
})(window.ONW);
