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

  // 役職COのあとに結果開示が必要な役職 → 結果開示の種類（狂った占い師は占い師と同じ形で開示する）
  const KIND = { seer: "seer", mad_seer: "seer", robber: "robber", relic_robber: "relic", troublemaker: "tm", insomniac: "insom", mason: "mason", love_tanner: "love" };

  function set(s) { G().co = s; co.render(); }
  function done(text, claim, setRole, flag, short) { ONW.net.sendCo(text, claim, setRole, flag, short); set(null); }   // short: 一覧に出す短い結果（「対象 → 結果」）

  co.open = () => set(G().co ? null : { step: "menu" });
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
    if (KIND[role]) {
      // 役職COのあと、同じ人がそのまま結果開示へ続ける（その間CPUは割り込まない）
      ONW.net.sendCo(`${rn(role)}CO`, null, role, "hold");
      return startResult(KIND[role], true);
    }
    done(`${rn(role)}CO`, null, role);
  };
  co.teamCo = (t) => done({ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[t], null, "team:" + t);

  // ---- 結果開示 ----
  co.result = function () {
    const my = G().myCo;
    if (!my || String(my).startsWith("team:")) return set({ step: "msg", msg: "先に役職COをしてください。" });
    if (KIND[my]) return startResult(KIND[my]);
    set({ step: "msg", msg: "あなたがCOしている役職には結果開示が必要ありません。" });
  };
  /** 結果開示の最初の画面（種類ごと）。seer/robber: 相手を選ぶ / relic: 墓地を選ぶ / tm: 2人選ぶ / insom: 最終役職を選ぶ */
  function startResult(kind, chain) {
    if (kind === "relic") return set({ step: "rgrave", kind, chain });
    if (kind === "tm") return set({ step: "tm", kind, chain, sel: [] });
    if (kind === "insom") return set({ step: "irole", kind, chain });
    if (kind === "mason") return set({ step: "mason", kind, chain, sel: [] });
    if (kind === "love") return set({ step: "love", kind, chain });
    return set({ step: "target", kind, chain });
  }
  co.pickLove = (id) => done(`${nameOf(id)} に一目惚れしました`, { kind: "love_tanner", target: id }, null, "disclose", `→ ${nameOf(id)}`);
  co.pickRelicGrave = (i) => set({ step: "rrole", kind: "relic", idx: i });
  co.relicRole = function (role) {
    const s = G().co;
    if (role === "hide") return done(`墓地${s.idx + 1} と役職を交換しました。役職は伏せます。`, null, null, "disclose", `墓地${s.idx + 1} → 伏せ`);
    done(`墓地${s.idx + 1} と役職を交換して ${rn(role)} になりました`, { kind: "relic", role }, null, "disclose", `墓地${s.idx + 1} → ${rn(role)}`);
  };
  co.pickTm = function (id) {
    const s = G().co, sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    if (sel.length < 2) return set({ ...s, sel });
    done(`${nameOf(sel[0])} と ${nameOf(sel[1])} を入れ替えました`, { kind: "troublemaker" }, null, "disclose", `${nameOf(sel[0])} ⇄ ${nameOf(sel[1])}`);
  };
  co.pickMason = function (id) {
    const s = G().co, sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    set({ ...s, sel });
  };
  co.masonDone = function () {
    const sel = G().co.sel || [];
    done(sel.length ? `共有者は 自分と ${sel.map((id) => nameOf(id)).join("、")} でした` : "共有者は 自分だけでした", { kind: "mason" }, null, "disclose", sel.length ? `相方: ${sel.map((id) => nameOf(id)).join("、")}` : "自分だけ");
  };
  co.insomRole = function (role) {
    if (role === "hide") return done("最終的な役職は伏せます。", null, null, "disclose", "→ 伏せ");
    done(`最終的な役職は ${rn(role)} でした`, { kind: "insomniac", role }, null, "disclose", `→ ${rn(role)}`);
  };
  co.pickPlayer = (id) => set({ ...G().co, step: "prole", target: id });
  co.pickGrave = function (i) {
    const sel = [...(G().co.sel || []), i];
    if (sel.length < graveNeed()) set({ ...G().co, step: "gpick", sel });
    else set({ step: "grole", sel, k: 0, results: [], shorts: [] });
  };
  co.pickRole = function (role) {            // role: 役職ID or "hide"
    const s = G().co, who = nameOf(s.target);
    if (s.kind === "seer") {
      if (role === "hide") return done(`${who} を占いました。結果は伏せます。`, null, null, "disclose", `${who} → 伏せ`);
      return done(`${who} を占って ${rn(role)} でした`, { kind: "seer", target: s.target, role }, null, "disclose", `${who} → ${rn(role)}`);
    }
    if (role === "hide") return done(`${who} の役職を奪いました。役職は伏せます。`, null, null, "disclose", `${who} → 伏せ`);
    return done(`${who} の役職を奪って ${rn(role)} になりました`, { kind: "robber", target: s.target, role }, null, "disclose", `${who} → ${rn(role)}`);
  };
  co.graveRole = function (role) {
    const s = G().co, idx = s.sel[s.k];
    const results = [...s.results, `墓地${idx + 1} を見て ${rn(role)}`], shorts = [...(s.shorts || []), `墓地${idx + 1} → ${rn(role)}`];
    if (s.k + 1 < s.sel.length) return set({ ...s, k: s.k + 1, results, shorts });
    done(`${results.join("、")} でした`, null, null, "disclose", shorts.join("、"));
  };

  co.history = () => set({ step: "history" });

  // ---- 描画 ----
  const btn = (label, fn) => `<button class="btn co-btn" onclick="${fn}">${label}</button>`;
  // deck は [{r, cand}]（古い形式の文字列も受け付ける）。変化先の候補には「(変化候補)」を付ける
  const deckList = () => (G().deck || []).map((x) => (typeof x === "string" ? { r: x } : x));
  const roleBtns = (fn, extra = "") => deckList().map((x) => btn(esc(rn(x.r)) + (x.cand ? " (変化候補)" : ""), `ONW.co.${fn}('${x.r}')`)).join("") + extra;

  co.render = function () {
    const el = document.getElementById("co-panel");
    if (!el) return;
    const s = G().co;
    if (!s) { el.innerHTML = ""; return; }
    const back = btn("戻る", "ONW.co.back()"), close = btn("閉じる", "ONW.co.close()");
    let title = "COボタン", body = "";
    if (s.step === "menu") body = btn("役職CO", "ONW.co.roleMenu()") + btn("結果開示", "ONW.co.result()") + btn("CO履歴", "ONW.co.history()") + close;
    else if (s.step === "role") {
      title = "役職CO";
      body = roleBtns("roleCo") + ["village", "wolf", "third"].map((t) => btn({ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[t], `ONW.co.teamCo('${t}')`)).join("") + back;
    } else if (s.step === "msg") body = `<p class="night-step__hint">${esc(s.msg)}</p>` + back;
    else if (s.step === "target") {
      title = "結果開示";
      body = `<p class="night-step__hint">${s.kind === "seer" ? "占い先" : "奪った相手"}を選んでください。</p>` +
        (G().others || []).map((p) => btn(esc(p.name), `ONW.co.pickPlayer('${p.id}')`)).join("") +
        (s.kind === "seer" ? Array.from({ length: G().graveCount || 0 }, (_, i) => btn(`墓地${i + 1}`, `ONW.co.pickGrave(${i})`)).join("") : "") + back;
    } else if (s.step === "gpick") {
      title = "結果開示";
      body = `<p class="night-step__hint">${s.sel.length + 1}枚目の墓地を選んでください。</p>` +
        Array.from({ length: G().graveCount || 0 }, (_, i) => (s.sel.includes(i) ? "" : btn(`墓地${i + 1}`, `ONW.co.pickGrave(${i})`))).join("") + back;
    } else if (s.step === "prole") {
      title = "結果開示";
      body = `<p class="night-step__hint">${esc(nameOf(s.target))} の結果役職を選んでください。</p>` + roleBtns("pickRole", btn("伏せる", "ONW.co.pickRole('hide')")) + back;
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
      body = `<p class="night-step__hint">入れ替えた2人を選んでください。${s.sel.length ? `（選択中: ${s.sel.map((id) => esc(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + esc(p.name), `ONW.co.pickTm('${p.id}')`)).join("") + back;
    } else if (s.step === "mason") {
      title = "結果開示";
      body = `<p class="night-step__hint">他に共有者がいたら選んでください。いなければそのまま確定します。${s.sel.length ? `（選択中: ${s.sel.map((id) => esc(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + esc(p.name), `ONW.co.pickMason('${p.id}')`)).join("") +
        btn(s.sel.length ? "この人たちで確定" : "自分だけで確定", "ONW.co.masonDone()") + back;
    } else if (s.step === "love") {
      title = "結果開示";
      body = `<p class="night-step__hint">一目惚れした相手を選んでください。</p>` + (G().others || []).map((p) => btn(esc(p.name), `ONW.co.pickLove('${p.id}')`)).join("") + back;
    } else if (s.step === "irole") {
      title = "結果開示";
      body = `<p class="night-step__hint">夜が終わったあとの、最終的な役職を選んでください。</p>` + roleBtns("insomRole", btn("伏せる", "ONW.co.insomRole('hide')")) + back;
    } else if (s.step === "history") {
      title = "CO履歴";
      body = `<div class="co-hist">${ONW.ui.coTable()}</div>` + back;
    }
    el.innerHTML = `<div class="co-panel"><div class="co-title">${title}</div><div class="co-grid">${body}</div></div>`;
  };

  ONW.co = co;
})(window.ONW);
