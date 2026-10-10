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

  /**
   * 結果画面の文章（夜行動結果・昼行動結果・役職情報）の色分け。
   *   ・役職名 → その役職の陣営の色（村人=緑 / 人狼=赤 / 第三=金。画面は t-village など、PNGは team 色）
   *   ・プレイヤー名 → ひとつの色（画面は rs-pl）。自分の名前だけ別の色（rs-me / self:true）
   *   ・墓地名（墓地1 など）→ 別の色（画面は rs-gv / kind:"grave"）
   * 文章を [{ t, kind: "role"|"player"|null, team }] に分ける。同じ文字が役職名とプレイヤー名の両方なら、プレイヤー名を優先。
   * 「村人陣営」の「村人」のように、役職名のあとに「陣営」が続くときは役職名として色付けしない。
   */
  /** この端末の人の名前（結果画面などで、自分の名前だけ別の色にするため）。観戦者・まだ席がないときは null */
  utils.selfName = function selfName() {
    const g = ONW.game, id = ONW.net && ONW.net.myId ? ONW.net.myId() : "";
    const p = g && id ? (g.players || []).find((x) => x.id === id) : null;
    if (p && p.name) return p.name;
    return g && g.myName && !g.isSpectator ? g.myName : null;   // 席の一覧にまだ載っていなくても、自分の名前(myName)が分かればそれを使う
  };
  utils.isSelf = (name) => { const me = utils.selfName(); return !!me && name === me; };
  /** 画面用: プレイヤー名の HTML。自分の名前だけ rs-me（別の色）。cls は共通のクラス（rs-pl など） */
  utils.nameHtml = function nameHtml(name, cls) {
    const me = utils.selfName(), c = [cls, me && name === me ? "rs-me" : ""].filter(Boolean).join(" ");
    return c ? `<span class="${c}">${utils.esc(name)}</span>` : utils.esc(name);
  };
  utils.tintTokens = function tintTokens(text, res) {
    text = String(text == null ? "" : text);
    const rx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const players = new Set(((res && res.history) || []).map((h) => h.name).filter(Boolean));
    const roles = new Map();
    Object.values(ONW.ROLE_INFO || {}).forEach((r) => { if (r && r.name && !players.has(r.name)) roles.set(r.name, r.team); });
    const all = [...players, ...roles.keys()].sort((a, b) => b.length - a.length);
    if (!all.length) return [{ t: text, kind: null }];
    const re = new RegExp(all.map(rx).concat("墓地[0-9０-９]+").join("|"), "g");   // 墓地名（墓地1 など）も別の色にする
    const out = []; let last = 0, m;
    while ((m = re.exec(text))) {
      const w = m[0];
      if (!players.has(w) && text.startsWith("陣営", m.index + w.length)) continue;
      if (m.index > last) out.push({ t: text.slice(last, m.index), kind: null });
      out.push(players.has(w) ? { t: w, kind: "player" } : roles.has(w) ? { t: w, kind: "role", team: roles.get(w) } : { t: w, kind: "grave" });
      last = m.index + w.length;
    }
    if (last < text.length) out.push({ t: text.slice(last), kind: null });
    // 「自分」= その行の行動した人(文の主語。「A は B を…」の A)。見ている本人ではない。主語だけ self:true にし、その人から見た他者は今までの色のまま
    const si = out.findIndex((k) => k.kind === "player");
    if (si >= 0 && /^\s*[はが]/.test(((out[si + 1] || {}).t) || "")) out[si].self = true;
    return out;
  };
  /** 画面用: HTML の文字の部分（タグの外）だけ色分けする。役職名は t-<陣営>、プレイヤー名は rs-pl */
  utils.tintHtml = function tintHtml(html, res) {
    const un = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
    return String(html).split(/(<[^>]*>)/).map((part) => {
      if (!part || part[0] === "<") return part;
      return utils.tintTokens(un(part), res).map((k) => k.kind === "role" ? `<span class="t-${k.team}">${utils.esc(k.t)}</span>` : k.kind === "player" ? `<span class="rs-pl${k.self ? " rs-me" : ""}">${utils.esc(k.t)}</span>` : k.kind === "grave" ? `<span class="rs-gv">${utils.esc(k.t)}</span>` : utils.esc(k.t)).join("");
    }).join("");
  };

  /**
   * チャット・COボタン画面用: 今いるプレイヤーの名前の一覧（チャットの文章の中の名前をオレンジにするため）。
   * 色分けの対象は boardView / others / 結果画面の履歴 に出てくる名前。
   */
  utils.playerNames = function playerNames() {
    const g = ONW.game || {};
    const set = new Set();
    (g.boardView || []).forEach((p) => p && p.name && set.add(p.name));
    (g.others || []).forEach((p) => p && p.name && set.add(p.name));
    ((g.result && g.result.history) || []).forEach((h) => h && h.name && set.add(h.name));
    (g.players || []).forEach((p) => p && p.name && set.add(p.name));
    const me = utils.selfName(); if (me) set.add(me);   // 自分の名前も色分けの対象（others には自分がいない）
    return [...set];
  };
  /** 画面用: 文章（HTMLエスケープ前の文字）のプレイヤー名だけをオレンジ(rs-pl)にして返す。役職名は色を付けない */
  utils.tintPlayers = function tintPlayers(text, names) {
    names = (names || utils.playerNames()).filter(Boolean);
    return utils.tintTokens(text, { history: names.map((name) => ({ name })) })
      .map((k) => k.kind === "player" ? `<span class="rs-pl${k.self ? " rs-me" : ""}">${utils.esc(k.t)}</span>` : k.kind === "grave" ? `<span class="rs-gv">${utils.esc(k.t)}</span>` : utils.esc(k.t)).join("");
  };

  /**
   * COボタン関連の文章（チャットのCO/結果開示の行・CO履歴の結果行）用の色分け。
   *   ・プレイヤー名 → オレンジ(rs-pl) / 役職名 → 陣営の色(t-village・t-wolf・t-third)
   *   ・「村人陣営CO」などの陣営名も、その陣営の色にする
   */
  /** COの文章を [{ t, kind: "player"|"role"|"grave"|"team"|null, team, self }] に分ける（画面 tintCo とPNGで共通）。先頭の「名前:」の名前だけ self:true（紫） */
  utils.tintCoTokens = function tintCoTokens(text, names, speaker) {
    names = (names || utils.playerNames()).filter(Boolean);
    text = String(text == null ? "" : text);
    // チャットのCO行「名前: 占い師CO」: 発言した人の名前は、誰の画面でも・自分の発言でも必ず紫(self:true)。名前の一覧に載っていなくても、先頭の「名前:」から取る
    let lead = null;
    if (speaker) { const m = text.match(/^([^:：\s][^:：]{0,30}?)\s*[:：]/); if (m) lead = m[1]; }
    if (lead && !names.includes(lead)) names = [...names, lead];
    const TEAM = { "村人": "village", "人狼": "wolf", "第三": "third" };
    // COボタンの発言「名前: 占い師CO」の名前（発言した人＝文の主語）は、紫(rs-me)にする。ほかの人の名前はオレンジ(rs-pl)のまま
    const part = (t, first) => {
      const toks = utils.tintTokens(t, { history: names.map((name) => ({ name })) });
      if (first) { const si = toks.findIndex((k) => k.kind === "player"); if (si === 0 && /^\s*[:：]/.test((toks[1] || {}).t || "")) toks[si].self = true; }
      return toks;
    };
    return text.split(/((?:村人|人狼|第三)陣営)/).flatMap((seg, i) =>
      TEAM[seg.replace("陣営", "")] && seg.endsWith("陣営") && !names.includes(seg) ? [{ t: seg, kind: "team", team: TEAM[seg.replace("陣営", "")] }] : part(seg, i === 0));
  };
  utils.tintCo = function tintCo(text, names, speaker) {
    return utils.tintCoTokens(text, names, speaker).map((k) => k.kind === "team" ? `<span class="t-${k.team}">${utils.esc(k.t)}</span>`
      : k.kind === "player" ? `<span class="rs-pl${k.self ? " rs-me" : ""}">${utils.esc(k.t)}</span>`
      : k.kind === "grave" ? `<span class="rs-gv">${utils.esc(k.t)}</span>`
      : k.kind === "role" ? `<span class="t-${k.team}">${utils.esc(k.t)}</span>` : utils.esc(k.t)).join("");
  };

  /**
   * 最終結果の「情報確認」用: 1人ぶんの受信メッセージ（role / night / morning / settle / sober / 昼の通知）から、
   * その人の情報確認に載る内容を作る。クライアントの受信処理（net.js onMsg）が nightLogs へ足す規則と同じ。
   * 戻り値: { role, from, soberRole, logs[] }（同じ文章の重複は除く）
   */
  utils.infoFromMsgs = function infoFromMsgs(msgs) {
    const out = { role: null, from: null, soberRole: null, logs: [] };
    const add = (...a) => a.flat().forEach((t) => { if (t && !out.logs.includes(String(t))) out.logs.push(String(t)); });
    (msgs || []).forEach((d) => {
      if (!d) return;
      switch (d.t) {
        case "role": out.role = d.role || null; out.from = d.from || null; break;
        case "night": add(d.text, d.text2, d.loveText, d.lines || []); break;
        case "morning": case "settle": case "queenup": add(d.logs || []); break;
        case "sober": out.soberRole = d.role || null; add(d.lines || []); break;
        case "ack": add(d.lines || []); break;
        case "muzzle": add(d.text); break;
        case "observeday": add("【観測通知】", (d.lines && d.lines.length) ? d.lines : ["観測できる夜能力はありませんでした。"]); break;
        case "insomday": case "jobcut": case "servantday": case "jobday": add(d.text); break;
        default: break;
      }
    });
    return out;
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
