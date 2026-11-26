/**
 * cpu-ai.js — 「CPU AI議論(β版)」: ホストの端末(ブラウザ)の中で動く小型AIの、対応判定・インストール・動作確認。
 *
 * 方針(docs/cpu-ai.md): 何をCOするか・誰に投票するか・どこで嘘をつくかは js/cpu.js が決める。AIは「言い方」を自然にするだけ（3of4）。
 * AIが動くのはホストの端末だけ。AIが使えない・遅い・失敗したときは、決まった文(js/cpu-talk.js)のままで、ゲームは止めない。
 *
 * このファイル(2of4)は「ONにしてよいか」の確認までを担当する:
 *   ・supported(): この端末で動かせそうか（WebGPU・メモリ。理由つき）
 *   ・install(opts): WebLLM の読み込み → モデルのダウンロード → 読み込み → 動作テスト。全部成功したときだけ state="ready"。
 *     失敗・中断・ダウンロードをやめたときは ready にならない（=システム設定はONにならない）
 *   ・statusText(): 設定画面に出す状態の文
 * 外のサーバーに送るのは、ライブラリとモデルの取得だけ。ゲームの内容は外に出さない（AIはブラウザの中で動く）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const A = { state: "none", progress: 0, error: "" };   // state: "none"(未) / "loading" / "ready" / "error"

  // ---- 差し替え用の定数 ----
  // WebLLM はバージョンを固定して読み込む（最新タグ指定は禁止。公開直後の版に不具合や悪意のある変更が入るのを避けるため）。
  // 上げるときは、公開から2週間以上たった版を選び、docs/cpu-ai.md の表も直すこと。
  const WEBLLM_VERSION = "0.2.79";
  const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@" + WEBLLM_VERSION + "/+esm";
  // 日本語が比較的得意な 1.5B 前後の量子化モデル。WebLLM の prebuilt 一覧にあるID（上のバージョンの一覧と合っているか、差し替えるときに確認する）
  const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
  const MODEL_LABEL = "Qwen2.5 1.5B";
  const MODEL_SIZE_MB = 1000;                  // ダウンロードの目安（案内文と空き容量の確認に使う）
  const MARK_KEY = "onw.cpuAi.installed.v1";   // インストール済みの印（ホストの端末のlocalStorage。ONの状態は持ち越さない）
  const TEST_TIMEOUT_MS = 90000;               // 動作テストの待ち時間

  let token = 0;       // install の世代。中断・やり直しで古い install の結果を捨てるために使う
  let engine = null;   // WebLLM のエンジン（3of4 の rephrase が使う）

  A.MODEL_ID = MODEL_ID; A.MODEL_LABEL = MODEL_LABEL; A.MODEL_SIZE_MB = MODEL_SIZE_MB; A.WEBLLM_VERSION = WEBLLM_VERSION;
  A.getEngine = () => engine;
  A._setEngineForTest = (e) => { engine = e; };   // 確認用スクリプトが偽のエンジンを入れる

  /** WebLLM の読み込み（確認用スクリプトが差し替える）。外のサーバーから取得するのはライブラリ(固定バージョン)だけ */
  A._loadModule = () => import(WEBLLM_URL);

  /** この端末で動かせそうか。ok:false のときは reason を画面に出し、ONにできない */
  A.supported = function () {
    if (typeof navigator === "undefined") return { ok: false, reason: "この環境では使えません" };
    if (typeof window !== "undefined" && window.isSecureContext === false) return { ok: false, reason: "https のページでだけ使えます" };
    if (!navigator.gpu) return { ok: false, reason: "この端末（ブラウザ）はWebGPUに対応していません" };
    const mem = navigator.deviceMemory;   // 取れる端末だけ判定（取れないブラウザは通す）
    if (typeof mem === "number" && mem < 4) return { ok: false, reason: "この端末はメモリが少なく、AIを動かせません" };
    return { ok: true, reason: "" };
  };

  /** このブラウザに、前にインストールした印があるか（画面の説明文用。ダウンロードが必要かの本当の判定は install の中でキャッシュを見る） */
  A.installedBefore = function () { try { return localStorage.getItem(MARK_KEY) === MODEL_ID; } catch (e) { return false; } };

  /** 設定画面に出す状態の文 */
  A.statusText = function () {
    if (A.state === "loading") return "準備中… " + A.progress + "%";
    if (A.state === "ready") return "準備OK（" + MODEL_LABEL + "）";
    if (A.state === "error") return "使えませんでした: " + A.error;
    const sup = A.supported();
    if (!sup.ok) return "この端末では使えません: " + sup.reason;
    return A.installedBefore() ? "インストール済み（ONにすると読み込みます）" : "未インストール（ONにするとインストールします）";
  };

  /** 画面を更新する。full: 設定画面を描き直す（状態が変わったとき） / そうでなければ進捗の文字だけ書き換える */
  function emit(full) {
    try {
      const g = ONW.game;
      if (full && g && ONW.PHASE && g.phase === ONW.PHASE.LOBBY && ONW.ui && ONW.ui.render) ONW.ui.render(g);
      const el = typeof document !== "undefined" && document.getElementById ? document.getElementById("cpuai-prog") : null;
      if (el) el.textContent = A.statusText();
    } catch (e) { /* 画面の更新に失敗しても、AIの準備は続ける */ }
  }
  function fail(reason) { A.state = "error"; A.error = String(reason || "不明なエラー").slice(0, 120); A.progress = 0; emit(true); return false; }
  const withTimeout = (p, ms, msg) => new Promise((resolve, reject) => { const id = setTimeout(() => reject(new Error(msg)), ms); p.then((v) => { clearTimeout(id); resolve(v); }, (e) => { clearTimeout(id); reject(e); }); });

  /**
   * インストール(読み込み)して、動作テストに通ったときだけ ready にする。成功 true / 失敗・中断・やめた false。
   * opts.confirmDownload: ダウンロードが必要なとき、始める前に呼ぶ（async。false を返したらやめる）
   */
  A.install = async function (opts) {
    opts = opts || {};
    if (A.state === "loading") return false;
    if (A.state === "ready" && engine) return true;
    const sup = A.supported();
    if (!sup.ok) return fail(sup.reason);
    const my = ++token;
    A.state = "loading"; A.progress = 0; A.error = ""; emit(true);
    let eng = null;
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) throw new Error("この端末のGPUを使えませんでした（WebGPU）");
      const mod = await A._loadModule();
      if (my !== token) return false;   // 中断された
      let cached = false;
      try { cached = !!(await mod.hasModelInCache(MODEL_ID)); } catch (e) { cached = false; }
      if (!cached) {
        const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
        if (est && est.quota && est.quota - (est.usage || 0) < MODEL_SIZE_MB * 1.5 * 1048576) throw new Error("空き容量が足りません（約" + Math.ceil(MODEL_SIZE_MB * 1.5) + "MB必要）");
        if (opts.confirmDownload && !(await opts.confirmDownload())) { A.state = "none"; A.progress = 0; emit(true); return false; }   // 「やめる」はエラーではない
        if (my !== token) return false;
      }
      eng = await mod.CreateMLCEngine(MODEL_ID, { initProgressCallback: (r) => { if (my !== token) return; A.progress = Math.max(0, Math.min(100, Math.round(((r && r.progress) || 0) * 100))); emit(false); } });
      if (my !== token) { try { await eng.unload(); } catch (e) {} return false; }   // 読み込み中に中断された: 捨てる
      // 動作テスト: 短い日本語を1回だけ作らせて、空でなければ成功
      const res = await withTimeout(eng.chat.completions.create({ messages: [{ role: "system", content: "日本語で短く答えてください。" }, { role: "user", content: "こんにちは、と一言だけ返してください。" }], max_tokens: 24, temperature: 0.3 }), TEST_TIMEOUT_MS, "動作テストが終わりませんでした");
      const out = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
      if (!out || !String(out).trim()) throw new Error("動作テストの返事が空でした");
      if (my !== token) { try { await eng.unload(); } catch (e) {} return false; }
      engine = eng; A.state = "ready"; A.progress = 100; A.error = ""; A.resetStats();
      try { localStorage.setItem(MARK_KEY, MODEL_ID); } catch (e) {}
      emit(true);
      return true;
    } catch (e) {
      if (eng) { try { await eng.unload(); } catch (e2) {} }
      if (my !== token) return false;   // 中断のあとに出たエラーは表に出さない
      return fail((e && e.message) || e);
    }
  };

  /** インストール中の「中断」。ready なら何もしない。途中のダウンロードはブラウザ側に残ることがある（次回の続きに使われる） */
  A.cancel = function () {
    if (A.state !== "loading") return;
    token += 1;
    A.state = engine ? "ready" : "none"; A.progress = 0; A.error = "";
    emit(true);
  };

  /** 作者指示（2026-11-26）で「CPU AI議論(β版)」は設定から廃止。内部実装は残すが ON にはできない: 保存・引き継ぎ・配布のどこから ON が来ても、ここで必ず OFF に戻す（ホストの設定を配る前・引き継ぎ直後に呼ばれる） */
  A.sanitize = function (g) { if (g) g.cpuAi = false; };

  /** エンジンを手放す（3of4: ロビーに戻る・ホスト交代のとき） */
  A.unload = async function () {
    const e = engine; engine = null; A.state = "none"; A.progress = 0; A.resetStats();
    if (e) { try { await e.unload(); } catch (x) {} }
  };


  // =========================================================
  // 3of4-a: 言い換え(rephrase)と出力チェック(validate)
  //   ・中身(誰に投票する・何をCOする・嘘をつく)は js/cpu.js・js/cpu-talk.js が決めた文のまま。AIは「言い方」だけを変える。
  //   ・AIの出力が元の文と食い違う(名前・役職名・数字・否定が変わる/増える)ときは捨てて、決まった文のまま話す(validate)。
  //   ・遅い(REPHRASE_TIMEOUT_MS)・失敗・待ちが詰まっているときも、決まった文のまま話す。ゲームは止めない。
  //   ・連続で失敗(FAIL_LIMIT回)したら、PAUSE_MS のあいだAIを使わず決まった文だけにする(そのあと自動で再開)。
  // =========================================================
  const REPHRASE_TIMEOUT_MS = 7000;   // 1発言の言い換えの待ち時間。これを過ぎたら決まった文のまま話す
  const MAX_PENDING = 2;              // 言い換えの順番待ちの上限(エンジンは1つ)。これ以上たまったら待たずに決まった文
  const FAIL_LIMIT = 3;               // 連続でこれだけ失敗したら一時停止
  const PAUSE_MS = 90000;             // 一時停止の長さ
  const MAX_OUT = 110;                // 言い換え後の最大文字数
  const TONES = [                     // CPUごとの口調のヒント(名前から決まる。同じCPUはいつも同じ口調)
    "丁寧でおだやかな話し方", "はきはきした話し方", "少しくだけた話し方", "落ち着いた慎重な話し方", "やわらかく親しみやすい話し方",
  ];
  const _st = { ok: 0, fail: 0, timeout: 0, invalid: 0, skipped: 0, streak: 0, pausedUntil: 0, lastMs: 0, lastReason: "", pending: 0 };
  A.stats = _st;
  A._now = () => Date.now();         // 確認用スクリプトが差し替える
  let chain = Promise.resolve();      // 言い換えは1つずつ順番に(エンジンは同時に1つしか動かせない)

  /** 一時停止中か */
  A.paused = () => A._now() < _st.pausedUntil;
  /** AIを使えるか(ready・エンジンあり・一時停止中でない)。使えないときは決まった文のまま */
  A.usable = () => A.state === "ready" && !!engine && !A.paused();
  /** 失敗の記録をまっさらにする(インストール成功・一時停止明け・ホスト交代のとき) */
  A.resetStats = function () { _st.streak = 0; _st.pausedUntil = 0; _st.pending = 0; };
  function noteFail(kind, reason) {
    _st[kind] = (_st[kind] || 0) + 1; _st.streak += 1; _st.lastReason = String(reason || kind).slice(0, 80);
    if (_st.streak >= FAIL_LIMIT) { _st.pausedUntil = A._now() + PAUSE_MS; _st.streak = 0; _st.lastReason = "連続失敗のため一時停止: " + _st.lastReason; }
  }
  function noteOk(ms) { _st.ok += 1; _st.streak = 0; _st.lastMs = ms; _st.lastReason = ""; }

  const toneFor = (name) => { let h = 0; String(name || "").split("").forEach((c) => { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return TONES[h % TONES.length]; };
  const esc = (s) => String(s || "").replace(/[\r\n]+/g, " ").trim();

  /** AIに渡す指示。名前・役職名・数字・否定を変えない／新しい情報を足さない、を最優先にする */
  A.buildMessages = function (text, ctx) {
    ctx = ctx || {};
    const sys = "あなたは人狼ゲームの議論に参加しているプレイヤー「" + esc(ctx.name || "CPU") + "」です。" + toneFor(ctx.name) + "をします。\n"
      + "渡された【元の発言】を、同じ意味のまま、自然な話し言葉に言い換えてください。\n"
      + "守ること:\n"
      + "・プレイヤー名・役職名・数字・「〜ではない」などの否定を、そのまま残す（変えない・消さない）。\n"
      + "・元の発言にない名前・役職・結果・投票先・事実を足さない。\n"
      + "・1〜2文、80字以内。発言だけを出力し、説明・前置き・かぎかっこ・記号は付けない。";
    return [{ role: "system", content: sys }, { role: "user", content: "【元の発言】\n" + esc(text) }];
  };

  const NEG = /ない|ません|ぬ|否/;
  const BAD_WORDS = /AI|ＡＩ|言語モデル|アシスタント|申し訳|assistant|ChatGPT|プロンプト|指示/i;
  /** AIの出力を整える(前置き・かぎかっこ・改行を取る) */
  A.clean = function (out, ctx) {
    let t = esc(out);
    t = t.replace(/^(【?元の発言】?|言い換え(後)?|発言|出力)\s*[:：]\s*/, "");
    if (ctx && ctx.name) { const n = String(ctx.name); if (t.startsWith(n + ":") || t.startsWith(n + "：")) t = t.slice(n.length + 1).trim(); }
    t = t.replace(/^[「『"'“]+/, "").replace(/[」』"'”]+$/, "").trim();
    return t;
  };
  /**
   * 出力チェック。元の文と食い違うAIの文は捨てる(ok:false)。
   * ctx.names: 全プレイヤー名 / ctx.roleNames: 全役職名。
   *  ・元の文にある名前・役職名は、出力にも残っていること／元の文にない名前・役職名が出力に増えていないこと
   *  ・数字が同じ・否定の有無が同じ・日本語であること・長さ・AIの自己言及がないこと
   */
  A.validate = function (orig, out, ctx) {
    ctx = ctx || {};
    const o = String(orig || ""), t = A.clean(out, ctx);
    if (!t) return { ok: false, reason: "空" };
    if (t.length < 4) return { ok: false, reason: "短すぎる" };
    if (t.length > MAX_OUT || t.length > o.length * 2 + 30) return { ok: false, reason: "長すぎる" };
    const jp = (t.match(/[\u3040-\u30ff\u4e00-\u9fff]/g) || []).length;
    if (jp / t.length < 0.5) return { ok: false, reason: "日本語でない" };
    if (BAD_WORDS.test(t) && !BAD_WORDS.test(o)) return { ok: false, reason: "AIの自己言及" };
    if (/[\u0000-\u001f]|[*#`\[\]{}<>]/.test(t)) return { ok: false, reason: "記号" };
    const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
    const nums = (s) => (String(s).match(/[0-9０-９]+/g) || []).map((x) => x.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 65248)));
    if (!sameSet(nums(o), nums(t))) return { ok: false, reason: "数字が違う" };
    if (NEG.test(o) !== NEG.test(t)) return { ok: false, reason: "否定が違う" };
    const names = (ctx.names || []).filter((n) => n && String(n).length >= 1);
    for (const n of names) {
      const inO = o.includes(n), inT = t.includes(n);
      if (inO && !inT) return { ok: false, reason: "名前が消えた: " + n };
      if (!inO && inT && String(n).length >= 2) return { ok: false, reason: "名前が増えた: " + n };
    }
    for (const r of (ctx.roleNames || []).filter((r) => r && String(r).length >= 2)) {
      const inO = o.includes(r), inT = t.includes(r);
      if (inO && !inT) return { ok: false, reason: "役職名が消えた: " + r };
      if (!inO && inT) return { ok: false, reason: "役職名が増えた: " + r };
    }
    return { ok: true, text: t };
  };

  /**
   * 1発言を言い換える。常に解決する(reject しない): { ok:true, text } か { ok:false, reason }。
   * ok:false のときは、呼んだ側が元の決まった文のまま話す(フォールバック)。
   */
  A.rephrase = function (text, ctx) {
    const orig = String(text || "");
    if (!orig.trim()) return Promise.resolve({ ok: false, reason: "空の発言" });
    if (!A.usable()) { _st.skipped += 1; return Promise.resolve({ ok: false, reason: A.paused() ? "一時停止中" : "AIが使えない" }); }
    if (_st.pending >= MAX_PENDING) { _st.skipped += 1; return Promise.resolve({ ok: false, reason: "順番待ちが多い" }); }
    _st.pending += 1;
    const job = async () => {
      if (!A.usable()) return { ok: false, reason: "AIが使えない" };   // 順番待ちのあいだに、一時停止・OFF・ホスト交代になった
      const t0 = A._now(), eng = engine;
      let res;
      try {
        res = await withTimeout(eng.chat.completions.create({ messages: A.buildMessages(orig, ctx), max_tokens: 90, temperature: 0.6 }), REPHRASE_TIMEOUT_MS, "言い換えが間に合わなかった");
      } catch (e) {
        try { if (eng.interruptGenerate) eng.interruptGenerate(); } catch (x) {}   // 遅れた生成は止める(次の言い換えを詰まらせない)
        const slow = /間に合わなかった/.test(String((e && e.message) || e));
        noteFail(slow ? "timeout" : "fail", (e && e.message) || e);
        return { ok: false, reason: slow ? "タイムアウト" : "失敗: " + String((e && e.message) || e).slice(0, 60) };
      }
      const raw = res && res.choices && res.choices[0] && res.choices[0].message && res.choices[0].message.content;
      const v = A.validate(orig, raw, ctx);
      if (!v.ok) { noteFail("invalid", v.reason); return { ok: false, reason: "出力チェックで不合格: " + v.reason }; }
      noteOk(A._now() - t0);
      return { ok: true, text: v.text };
    };
    const p = chain.then(job, job).then((r) => { _st.pending = Math.max(0, _st.pending - 1); return r; }, () => { _st.pending = Math.max(0, _st.pending - 1); return { ok: false, reason: "例外" }; });
    chain = p;
    return p;
  };

  /** デバッグ画面用: AIの状態と成功/失敗の数（3of4-c）。ホストの端末だけで意味がある */
  A.debugLines = function () {
    const sec = (ms) => Math.max(0, Math.ceil(ms / 1000));
    const lines = [];
    lines.push("状態: " + (A.state === "ready" ? "準備OK" : A.state === "loading" ? "準備中" : A.state === "error" ? "失敗" : "未インストール") + (A.paused() ? "（一時停止中・あと" + sec(_st.pausedUntil - A._now()) + "秒）" : ""));
    lines.push("成功 " + _st.ok + " / 失敗 " + _st.fail + " / 遅すぎ " + _st.timeout + " / 不合格 " + _st.invalid + " / 使わず " + _st.skipped);
    lines.push("連続失敗 " + _st.streak + "/" + FAIL_LIMIT + "・順番待ち " + _st.pending + "・直近の所要 " + (_st.lastMs ? _st.lastMs + "ms" : "-"));
    if (_st.lastReason) lines.push("直近の理由: " + _st.lastReason);
    return lines;
  };
  /** 統計をまっさらにする(デバッグ用)。AIの状態そのものは変えない */
  A.clearStats = function () { Object.assign(_st, { ok: 0, fail: 0, timeout: 0, invalid: 0, skipped: 0, streak: 0, pausedUntil: 0, lastMs: 0, lastReason: "" }); };

  ONW.cpuAi = A;
})(window.ONW);
