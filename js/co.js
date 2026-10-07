/**
 * co.js — チャット送信 と 本家風「COボタン」（役職CO / 結果開示 / CO履歴）
 * メニューの状態は game.co に持ち、#co-panel だけを描き直す（チャット入力を壊さない）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const co = {};
  const G = () => ONW.game;
  const rn = (r) => ONW.roles.getInfo(r).name;
  const esc = (s) => ONW.utils.esc(s);
  const nameOf = (id) => ((G().others || []).find((p) => p.id === id) || {}).name || "?";
  const graveNeed = () => ONW.seerGraveMax(G());

  // 役職COのあとに結果開示が必要な役職 → 結果開示の種類。各役職ファイルの coResult.kind(狂った占い師は like で占い師と同じ形)
  const coOf = (role) => { const d = ONW.roleDef(role); return d && d.coResult ? d.coResult : null; };
  const kindOf = (role) => { const c = coOf(role); return c ? c.kind : undefined; };
  const hookOfKind = (kind) => { for (const id of ONW.roleIds()) { const c = coOf(id); if (c && c.kind === kind) return c; } return null; };   // その種類の結果開示を持つ役職の coResult
  const K = { rn, nameOf };   // 役職ファイルの coResult に渡す道具

  function set(s) { G().co = s; co.render(); }
  function done(text, claim, setRole, flag, short) { ONW.net.sendCo(text, claim, setRole, flag, short); set(null); }   // short: 一覧に出す短い結果（「対象 → 結果」）

  co.open = () => { if (G().muzzled) { set(null); return; } set(G().co ? null : { step: "menu" }); };   // 口封じされている人はCOボタンが使えない
  co.close = () => set(null);
  co.back = () => set({ step: "menu" });

  co.sendChat = function () {
    const el = document.getElementById("chat-in-big") || document.getElementById("chat-in");   // 大きいチャットが開いていればそちらを優先
    if (!el) return;
    ONW.net.sendChat(el.value);
    el.value = "";
    if (el.id === "chat-in-big") el.focus({ preventScroll: true });   // 送信してもキーボードを閉じない（画面がずれない）
  };

  // ---- 役職CO ----
  co.roleMenu = () => set({ step: "role" });
  co.roleCo = function (role) {
    if (kindOf(role)) {
      // 役職COのあと、同じ人がそのまま結果開示へ続ける（その間CPUは割り込まない）
      ONW.net.sendCo(`${rn(role)}CO`, null, role, "hold");
      return startResult(kindOf(role), true);
    }
    done(`${rn(role)}CO`, null, role);
  };
  co.teamCo = (t) => done({ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[t], null, "team:" + t);

  // ---- 結果開示 ----
  co.result = function () {
    const my = G().myCo;
    if (!my || String(my).startsWith("team:")) return set({ step: "msg", msg: "先に役職COをしてください。" });
    if (kindOf(my)) return startResult(kindOf(my));
    set({ step: "msg", msg: "あなたがCOしている役職には結果開示が必要ありません。" });
  };
  /** 結果開示の最初の画面（種類ごと）。seer/robber: 相手を選ぶ / relic: 墓地を選ぶ / tm: 2人選ぶ / insom: 最終役職を選ぶ */
  function startResult(kind, chain) {
    if (kind === "relic") return set({ step: "rgrave", kind, chain });
    if (kind === "tm" || kind === "gremlin") return set({ step: "tm", kind, chain, sel: [] });
    if (kind === "insom") return set({ step: "ikind", kind, chain });
    if (kind === "mason") return set({ step: "mason", kind, chain, sel: [] });
    if (kind === "love") return set({ step: "love", kind, chain });
    return set({ step: "target", kind, chain });
  }
  co.pickLove = (id) => done(...hookOfKind("love").pickLove(id, K));
  co.pickRelicGrave = (i) => set({ step: "rrole", kind: "relic", idx: i });
  co.relicRole = function (role) {
    done(...hookOfKind("relic").relicRole(role, G().co, K));
  };
  co.pickTm = function (id) {
    const s = G().co, sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    if (sel.length < 2) return set({ ...s, sel });
    done(...(hookOfKind(s.kind === "gremlin" ? "gremlin" : "tm")).pickTwo(sel, K));   // グレムリン: 1人目がコピー元、2人目がコピー先
  };
  co.pickMason = function (id) {
    const s = G().co, sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    set({ ...s, sel });
  };
  co.masonDone = function () {
    done(...hookOfKind("mason").masonDone(G().co.sel || [], K));
  };
  // 後覚者の結果開示（本家式）: 結果の種類 →（元々の状態 → 元々の役職）/ 変化後の役職
  co.insomKind = (k) => set({ step: k === "self" ? "iorig" : "ichg", kind: "insom" });
  co.insomOrig = function (o) {
    if (o === "same") return done(...hookOfKind("insom").insomSame());
    set({ step: "iorole", kind: "insom" });
  };
  co.insomOrigRole = (role) => done(...hookOfKind("insom").insomOrigRole(role, K));
  co.insomChanged = (role) => done(...hookOfKind("insom").insomChanged(role, K));
  co.pickPlayer = function (id) {
    { const h = G().co && hookOfKind(G().co.kind); if (h && h.pickPlayer) return done(...h.pickPlayer(id, K)); }   // 訪問者「〇〇を訪問しました。」/ 従者「ご主人は〇〇です。」(CPUの発言と同じ文言)
    set({ ...G().co, step: "prole", target: id });
  };
  co.pickGrave = function (i) {
    const sel = [...(G().co.sel || []), i];
    if (sel.length < graveNeed()) set({ ...G().co, step: "gpick", sel });
    else set({ step: "grole", sel, k: 0, results: [], shorts: [] });
  };
  co.pickRole = function (role) {            // role: 役職ID or "hide"
    const s = G().co, who = nameOf(s.target);
    const h = hookOfKind(s.kind) || hookOfKind("robber");   // 結果役職の文言は種類ごと(占い師・ドッペル・フリーター)。それ以外は怪盗と同じ形
    if (!h.pickRole) return done(...hookOfKind("robber").pickRole(role, who, s, K));
    return done(...h.pickRole(role, who, s, K));
  };
  co.graveRole = function (role) {
    const s = G().co, idx = s.sel[s.k];
    const results = [...s.results, `墓地${idx + 1} を見て ${rn(role)}`], shorts = [...(s.shorts || []), `墓地${idx + 1} → ${rn(role)}`];
    if (s.k + 1 < s.sel.length) return set({ ...s, k: s.k + 1, results, shorts });
    done(`${results.join("、")} でした。`, null, null, "disclose", shorts.join("、"));
  };

  co.history = () => set({ step: "history" });

  // ---- 情報開示 ----（本家の「〜ていたことを伝える」系。訪問された / フリーターに就職されている / 従者がいる。CPUの発言と同じ文言）
  co.info = () => set({ step: "info" });
  co.infoBack = () => set({ step: "info" });
  co.visited = () => set({ step: "visited" });
  co.pickVisitor = (id) => done(...hookOfKind("visitor").infoVisited(id, K));
  // フリーターに就職されている（本家と同じ: 「誰がフリーターか」も伝えるかを選ぶ）
  co.freeterInfo = () => set({ step: "fjob" });
  co.freeterNoName = () => done(...hookOfKind("freeter").infoNoName());
  co.freeterWho = () => set({ step: "fwho" });
  co.pickFreeter = (id) => done(...hookOfKind("freeter").infoWho(id, K));
  // 従者がいる（本家: 「自分の従者がいます。」）
  co.servantInfo = () => done(...hookOfKind("servant").infoHas());

  // ---- 描画 ----
  const btn = (label, fn) => `<button class="btn co-btn" onclick="${fn}">${label}</button>`;
  // deck は [{r, cand}]（古い形式の文字列も受け付ける）。変化先の候補には「(変化候補)」を付ける
  const deckList = () => (G().deck || []).map((x) => (typeof x === "string" ? { r: x } : x)).filter((x) => x.r !== "merlin");   // マーリンはCOボタンに出さない（マーリンCO・マーリンの騙りは禁止）
  const roleBtns = (fn, extra = "", skip = []) => deckList().filter((x) => !skip.includes(x.r)).map((x) => btn(esc(rn(x.r)) + (x.cand ? " (変化候補)" : ""), `ONW.co.${fn}('${x.r}')`)).join("") + extra;

  co.render = function () {
    const el = document.getElementById("co-panel");
    if (!el) return;
    const s = G().co;
    if (!s) { el.innerHTML = ""; return; }
    const back = btn("戻る", "ONW.co.back()");
    let title = "COボタン", body = "";
    if (s.step === "menu") body = btn("役職CO", "ONW.co.roleMenu()") + btn("結果開示", "ONW.co.result()") + btn("情報開示", "ONW.co.info()") + btn("CO履歴", "ONW.co.history()");
    else if (s.step === "role") {
      title = "役職CO";
      body = roleBtns("roleCo") + ["village", "wolf", "third"].map((t) => btn({ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[t], `ONW.co.teamCo('${t}')`)).join("") + back;
    } else if (s.step === "msg") body = `<p class="night-step__hint">${esc(s.msg)}</p>` + back;
    else if (s.step === "target") {
      title = "結果開示";
      body = `<p class="night-step__hint">${(hookOfKind(s.kind) || {}).targetLabel || "奪った相手"}を選んでください。</p>` +
        (G().others || []).map((p) => btn(esc(p.name), `ONW.co.pickPlayer('${p.id}')`)).join("") +
        ((hookOfKind(s.kind) || {}).graves ? Array.from({ length: G().graveCount || 0 }, (_, i) => btn(`墓地${i + 1}`, `ONW.co.pickGrave(${i})`)).join("") : "") + back;
    } else if (s.step === "gpick") {
      title = "結果開示";
      body = `<p class="night-step__hint">${s.sel.length + 1}枚目の墓地を選んでください。</p>` +
        Array.from({ length: G().graveCount || 0 }, (_, i) => (s.sel.includes(i) ? "" : btn(`墓地${i + 1}`, `ONW.co.pickGrave(${i})`))).join("") + back;
    } else if (s.step === "prole") {
      title = "結果開示";
      body = `<p class="night-step__hint">${esc(nameOf(s.target))} ${(hookOfKind(s.kind) || {}).roleHint || "の結果役職"}を選んでください。</p>` + roleBtns("pickRole", btn("伏せる", "ONW.co.pickRole('hide')")) + back;
    } else if (s.step === "grole") {
      title = "結果開示";
      body = `<p class="night-step__hint">墓地${s.sel[s.k] + 1} の役職を選んでください。</p>` + roleBtns("graveRole") + back;
    } else if (s.step === "rgrave") {
      title = "結果開示";
      body = `<p class="night-step__hint">交換した墓地を選んでください。</p>` + Array.from({ length: G().graveCount || 0 }, (_, i) => btn(`墓地${i + 1}`, `ONW.co.pickRelicGrave(${i})`)).join("") + back;
    } else if (s.step === "rrole") {
      title = "結果開示";
      body = `<p class="night-step__hint">墓地${s.idx + 1} と交換して、新しくなった役職を選んでください。</p>` + roleBtns("relicRole", btn("伏せる", "ONW.co.relicRole('hide')")) + back;
    } else if (s.step === "tm") {
      title = "結果開示";
      body = `<p class="night-step__hint">${(hookOfKind(s.kind) || {}).twoHint || "入れ替えた2人を選んでください。"}${s.sel.length ? `（選択中: ${s.sel.map((id) => esc(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + esc(p.name), `ONW.co.pickTm('${p.id}')`)).join("") + back;
    } else if (s.step === "mason") {
      title = "結果開示";
      body = `<p class="night-step__hint">他に共有者がいたら選んでください。いなければそのまま確定します。${s.sel.length ? `（選択中: ${s.sel.map((id) => esc(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + esc(p.name), `ONW.co.pickMason('${p.id}')`)).join("") +
        btn(s.sel.length ? "この人たちで確定" : "自分だけで確定", "ONW.co.masonDone()") + back;
    } else if (s.step === "love") {
      title = "結果開示";
      body = `<p class="night-step__hint">一目惚れした相手を選んでください。</p>` + (G().others || []).map((p) => btn(esc(p.name), `ONW.co.pickLove('${p.id}')`)).join("") + back;
    } else if (s.step === "info") {
      title = "情報開示";
      body = `<p class="night-step__hint">伝える情報を選んでください。</p>` + btn("訪問された", "ONW.co.visited()") + btn("フリーターに就職されている", "ONW.co.freeterInfo()") + btn("従者がいる", "ONW.co.servantInfo()") + back;
    } else if (s.step === "visited") {
      title = "訪問された";
      body = `<p class="night-step__hint">訪問してきた人を選んでください。</p>` + (G().others || []).map((p) => btn(esc(p.name), `ONW.co.pickVisitor('${p.id}')`)).join("") + btn("戻る", "ONW.co.infoBack()");
    } else if (s.step === "fjob") {
      title = "フリーター情報";
      body = `<p class="night-step__hint">誰がフリーターかも伝えますか？</p>` + btn("はい（フリーターも伝える）", "ONW.co.freeterWho()") + btn("いいえ（就職されたことだけ）", "ONW.co.freeterNoName()") + btn("戻る", "ONW.co.infoBack()");
    } else if (s.step === "fwho") {
      title = "フリーター情報";
      body = `<p class="night-step__hint">誰がフリーターですか？</p>` + (G().others || []).map((p) => btn(esc(p.name), `ONW.co.pickFreeter('${p.id}')`)).join("") + btn("戻る", "ONW.co.freeterInfo()");
    } else if (s.step === "ikind") {
      title = "後覚者";
      body = `<p class="night-step__hint">結果の種類を選んでください。</p>` + btn("自身が後覚者である", "ONW.co.insomKind('self')") + btn("後覚者から変わっていた", "ONW.co.insomKind('changed')") + back;
    } else if (s.step === "iorig") {
      title = "後覚者";
      body = `<p class="night-step__hint">元々の状態を選んでください。</p>` + btn("元々後覚者であった", "ONW.co.insomOrig('same')") + btn("別の役職から後覚者になった", "ONW.co.insomOrig('other')") + back;
    } else if (s.step === "iorole") {
      title = "元々の役職";
      body = `<p class="night-step__hint">元々の役職を選んでください。</p>` + roleBtns("insomOrigRole", "", ["insomniac"]) + back;
    } else if (s.step === "ichg") {
      title = "変化後の役職";
      body = `<p class="night-step__hint">変化していた役職を選んでください。</p>` + roleBtns("insomChanged", "", ["insomniac"]) + back;
    } else if (s.step === "history") {
      title = "CO履歴";
      body = `<div class="co-hist">${ONW.ui.coTable()}</div>` + back;
    }
    el.innerHTML = `<div class="co-panel"><div class="co-title"><span>${title}</span><button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.co.close()">✕</button></div><div class="co-grid">${body}</div></div>`;
  };

  ONW.co = co;
})(window.ONW);
