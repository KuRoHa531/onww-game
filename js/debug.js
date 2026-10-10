/**
 * debug.js — 本家(マイクラ版)の「デバッグ」メニュー相当（ホスト専用）
 *   役職確認 / 投票先指定 / 固定役(参加者・墓地・変化後) / CPUの能力先指定 / CPU議論発言ON/OFF / 夜ログ
 * ルーム設定の「デバッグモード」をONにすると有効。ONの間は全員に「デバッグモード中」と表示する。
 * 固定役とCPU能力先は「次の試合」に反映され、「一斉解除」するまで残る（本家と同じ）。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const debug = {};
  const G = () => ONW.game;
  const PH = () => ONW.PHASE;
  const esc = (s) => ONW.utils.esc(s);
  const rn = (r) => ONW.roles.getInfo(r).name;
  const teamCls = (r) => "t-" + ONW.roles.getInfo(r).team;
  const ui = { open: false, tab: "roles", pick: null };

  /** 設定データ（固定役 / 変化後 / CPU能力先 / CPU発言OFF） */
  const data = () => { const g = G(); { const d = (g.dbg = g.dbg || { roles: {}, tf: {}, cpu: {}, cpuTalkOff: false }); d.master = d.master || {}; d.rand = d.rand || {}; ["cat", "freeter", "visitor", "straw", "exec", "muzzle"].forEach((k) => { d.rand[k] = d.rand[k] || {}; }); d.rand.drunk = d.rand.drunk || []; d.rand.lover = d.rand.lover || []; return d; } };

  // ---------------------------------------------------------
  // ゲーム側から呼ばれるフック
  // ---------------------------------------------------------
  /** 配役(シャッフル済みのdeck)に固定役を反映する。deckの並び = プレイヤー順 → 墓地 */
  debug.applyLocks = function (game, deck) {
    game.dbgWarn = [];
    if (!game.debugOn || !game.dbg) return;
    const n = game.players.length;
    const keys = [...game.players.map((p) => p.id), ...Array.from({ length: Math.max(0, deck.length - n) }, (_, i) => `center:${i}`)];
    const nameOfKey = (k) => (k.startsWith("center:") ? `墓地${Number(k.slice(7)) + 1}` : (game.players.find((p) => p.id === k) || {}).name || k);
    // 役職固定は絶対: 配役の枚数(設定の役職数)に関係なく、指定した役職をその席に必ず置く（マイクラ版の nextRoleLocks と同じ。山札に無ければ固定した役職をそのまま配る）。
    // 1) 固定した席を全部先に確定する  2) 山札に同じ役職が余っていれば、固定していない席から入れ替えて持ってくる  3) 余りが無ければ、その席のカードを固定役に差し替える(枚数の超過を許す)
    const lockedIdx = new Set();
    const entries = Object.entries(game.dbg.roles || {}).map(([key, role]) => [keys.indexOf(key), role]).filter(([idx, role]) => idx >= 0 && role && idx < deck.length);   // 参加していない人の固定は無視
    entries.forEach(([idx]) => lockedIdx.add(idx));
    const done = new Set();
    entries.forEach(([idx, role]) => { if (deck[idx] === role) done.add(idx); });   // すでに固定どおりの席は動かさない
    entries.forEach(([idx, role]) => {
      if (done.has(idx)) return;
      const j = deck.findIndex((r, k) => r === role && !lockedIdx.has(k));
      if (j >= 0) { [deck[idx], deck[j]] = [deck[j], deck[idx]]; }   // 枚数は変えず、入れ替えて固定する
      else { deck[idx] = role; }                                      // 枚数が足りなくても固定を優先して差し替える（超過配役）
      done.add(idx);
    });
  };
  /** 変化役の「変化後」固定。固定役が変化役のときだけ有効 */
  debug.forcedTransform = function (game, key, before) {
    if (!game.debugOn || !game.dbg) return null;
    const t = (game.dbg.tf || {})[key];
    if (!t || (game.dbg.roles || {})[key] !== before) return null;
    return (ONW.TRANSFORM_GROUPS[before] || []).includes(t) ? t : null;
  };
  /** 従者のご主人の指定（持ち主のID → ご主人のID）。従者を配られた人にだけ使われる。指定した人が参加していなければ無視（呼び出し側で確認） */
  debug.servantMaster = function (game, id) {
    if (!game.debugOn || !game.dbg) return null;
    return (game.dbg.master || {})[id] || null;
  };
  /** ランダムに決まる対象の指定（全プレイヤー対象）。kind: "cat"=猫又・黒猫の道連れ先 / "freeter"=就職先を選べなかったフリーターの就職先 / "straw"=わら人形の自動選択。
   *  持ち主のID → 対象のID（指定なしなら null。対象が使えない状況なら、呼び出し側でランダムに戻す） */
  debug.randTarget = function (game, kind, id) {
    if (!game.debugOn || !game.dbg || !game.dbg.rand) return null;
    return ((game.dbg.rand[kind] || {})[id]) || null;
  };
  /** 酔っ払いにする人のID一覧（指定なしなら空）。呼び出し側で、指定した人を先に酔わせ、残りの枠はこれまで通りランダム */
  debug.drunkIds = function (game) {
    if (!game.debugOn || !game.dbg || !game.dbg.rand) return [];
    return (game.dbg.rand.drunk || []).filter((id) => game.players.some((p) => p.id === id));
  };
  /** 恋人にする組 [[a,b],...]（2人とも参加している組だけ）。呼び出し側で、指定した組を先に作り、残りの組はこれまで通りランダム */
  debug.loverPairs = function (game) {
    if (!game.debugOn || !game.dbg || !game.dbg.rand) return [];
    const ok = (id) => game.players.some((p) => p.id === id);
    return (game.dbg.rand.lover || []).filter((pr) => Array.isArray(pr) && pr.length === 2 && pr[0] !== pr[1] && ok(pr[0]) && ok(pr[1]));
  };
  /** CPUの夜の能力先指定 { player?, graves? } */
  debug.cpuTarget = function (game, id) {
    if (!game.debugOn || !game.dbg) return null;
    return (game.dbg.cpu || {})[id] || null;
  };

  // ---------------------------------------------------------
  // ON/OFF
  // ---------------------------------------------------------
  debug.toggle = function () {
    const g = G();
    if (!ONW.net.isHost || g.inGame) return;
    if (!g.debugOn && !window.confirm("デバッグモードをONにします。\n参加者全員の画面に「デバッグモード中」と表示されます。")) return;
    g.debugOn = !g.debugOn;
    try { localStorage.setItem("onw.debugOn.v1", g.debugOn ? "1" : "0"); } catch (e) {}   // ブラウザを開き直してもON/OFFを維持（ルーム作成時に復元）
    if (!g.debugOn) { ui.open = false; ui.pick = null; }
    ONW.net.syncLobby();
  };

  // ---------------------------------------------------------
  // 画面（#debug-root に描く。通常の画面の再描画には巻き込まれない）
  // ---------------------------------------------------------
  const attr = (s) => JSON.stringify(String(s)).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const b = (label, fn, args = [], cls = "", dis = false) =>
    `<button class="btn dbg-b ${cls}" ${dis ? "disabled" : ""} onclick="ONW.debug.${fn}(${args.map(attr).join(",")})">${label}</button>`;
  const hint = (t) => `<p class="night-step__hint">${t}</p>`;
  const cpuBadge = ' <small class="cb-cpu">CPU</small>';
  const row = (left, right) => `<div class="dbg-row"><span class="dbg-l">${left}</span><span class="dbg-r">${right}</span></div>`;

  function el(id, cls) {
    let e = document.getElementById(id);
    if (!e) { e = document.createElement("div"); e.id = id; if (cls) e.className = cls; document.body.appendChild(e); }
    return e;
  }
  const inGame = () => { const g = G(); return !!g.inGame && g.players.length > 0; };
  const inLobby = () => { const g = G(); return !g.inGame && g.phase === PH().LOBBY; };

  /** ロビーでの固定対象（参加者 + CPU / 墓地） */
  function slots() {
    const g = G();
    const humans = (g.players || []).filter((p) => !p.isCpu && !p.spectate).map((p) => ({ key: p.id, name: p.name }));
    const cpus = Array.from({ length: g.cpuCount || 0 }, (_, i) => ({ key: `cpu_${i + 1}`, name: (g.cpuNames && g.cpuNames[i]) || `CPU${i + 1}`, cpu: true }));
    const graves = Array.from({ length: g.graveCount || 0 }, (_, i) => ({ key: `center:${i}`, name: `墓地${i + 1}` }));
    return { players: [...humans, ...cpus], graves };
  }

  // ---- 役職確認 ----
  function tabRoles() {
    const g = G();
    if (!inGame() || !Object.keys(g.initialRoles || {}).length) return hint("試合中に、全員の役職と墓地が表示されます。");
    const label = (ini, fin, from) => {
      const a = from ? `${rn(from)}(${rn(ini)})` : rn(ini);
      return `<span class="${teamCls(ini)}">${esc(a)}</span>` + (ini !== fin ? ` → <span class="${teamCls(fin)}">${esc(rn(fin))}</span>` : "");
    };
    const ps = g.players.map((p) => row(esc(p.name) + (p.isCpu ? cpuBadge : ""), label(g.initialRoles[p.id], g.currentRoles[p.id], g.transformFrom[p.id]))).join("");
    const cs = (g.center || []).map((r, i) => row(`墓地${i + 1}`, label(r, r, g.centerTransformFrom[i]))).join("");
    return ps + cs;
  }

  // ---- 投票先指定 ----
  /** 妖狐がいるときだけ、妖狐投票と通常投票を別々に指定できる（妖狐がいなければ、今までどおり通常投票の指定だけ）。
   *  今後、魔界公爵追放会議にも対応する予定（投票の種類ごとに section を足す。net.js の dbgKey / 入れ物 g.dbg〇〇Votes も足す） */
  function tabVotes() {
    const g = G();
    if (!inGame() || ![PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase)) return hint("昼の議論〜投票の間に使えます。指定した票は、妖狐がいるときは妖狐投票と通常投票で別々に指定できます。");
    const nm = (id) => (g.players.find((p) => p.id === id) || {}).name || "?";
    const hasFox = !!(ONW.foxVote && (ONW.foxVote.living(g).length > 0 || (g.foxVote && g.foxVote.active)));
    const foxNow = !!(g.foxVote && g.foxVote.active);
    const targets = (self) => g.players.filter((p) => p.id !== self);
    // kind: "f" = 妖狐投票 / "v" = 通常投票
    const section = (kind) => {
      const fox = kind === "f", forced = (fox ? g.dbgFoxVotes : g.dbgVotes) || {};
      const live = g.phase === PH().ONLINE_VOTE && fox === foxNow;   // いま行われている投票と同じ種類のときだけ「投票済」を出す
      const rows = g.players.map((p) => {
        const cur = forced[p.id] ? `指定: ${esc(nm(forced[p.id]))}` : (live && g.votes[p.id]) ? `投票済: ${esc(nm(g.votes[p.id]))}` : "未指定";
        let h = row(esc(p.name) + (p.isCpu ? cpuBadge : ""), `<span class="dbg-val">${cur}</span> ${b("変更", "pick", [kind + ":" + p.id])}`);
        if (ui.pick === kind + ":" + p.id) h += `<div class="dbg-pick">${targets(p.id).map((t) => b(esc(t.name), "voteSet", [p.id, t.id, kind])).join("")}${b("指定を解除", "voteSet", [p.id, "", kind], "dbg-clear")}</div>`;
        return h;
      }).join("");
      const all = ui.pick === kind + "all" ? `<div class="dbg-pick">${g.players.map((t) => b(esc(t.name), "voteAll", [t.id, kind])).join("")}</div>` : "";
      return rows + `<div class="dbg-actions">${b("全員の投票先を一括指定", "pick", [kind + "all"])}${b("全員の指定を解除", "voteClear", [kind])}</div>${all}`;
    };
    if (!hasFox) return section("v");
    return `<div class="dbg-h">妖狐投票${foxNow ? "（いま行われています）" : ""}</div>${section("f")}<div class="dbg-h">通常投票${g.phase === PH().ONLINE_VOTE && !foxNow ? "（いま行われています）" : ""}</div>${section("v")}`;
  }

  /** 役職ボタンを陣営ごとに見出し付きで並べる。人狼陣営は「変化役 / 人狼系 / 狂人系」に分ける。見出しが1つだけなら見出しは出さない */
  function groupBtns(list, mkBtn) {
    const teamOf = (r) => ONW.roles.getInfo(r).team, T = ONW.TEAM;
    const isMad = (r) => ONW.MAD_KIND.includes(r), isWolfKind = (r) => ONW.WOLF_KIND.includes(r);
    const wolfSide = list.filter((r) => teamOf(r) === T.WOLF);
    const sections = [
      ["村人陣営", "village", list.filter((r) => teamOf(r) === T.VILLAGE)],
      ["人狼陣営 ─ 変化役", "wolf", wolfSide.filter((r) => !isMad(r) && !isWolfKind(r))],
      ["人狼陣営 ─ 人狼系", "wolf", wolfSide.filter((r) => isWolfKind(r) && !isMad(r))],
      ["人狼陣営 ─ 狂人系", "wolf", wolfSide.filter(isMad)],
      ["第三陣営", "third", list.filter((r) => ![T.VILLAGE, T.WOLF].includes(teamOf(r)))],
    ].filter(([, , l]) => l.length);
    if (sections.length <= 1) return list.map(mkBtn).join("");
    return sections.map(([t, c, l]) => `<div class="dbg-grp t-${c}">${t}</div>${l.map(mkBtn).join("")}`).join("");
  }

  // ---- 固定役 ----
  function tabLocks() {
    const g = G(), d = data();
    if (!inLobby()) return hint("固定役はルーム（ロビー）で設定します。次の試合に反映されます。");
    const { players, graves } = slots();
    const valid = new Set([...players, ...graves].map((s) => s.key));
    const nmOf = (k) => (players.find((s) => s.key === k) || {}).name || "?";
    const deckRoles = Object.keys(ONW.ROLE_INFO).filter((r) => (g.roleCounts[r] || 0) > 0);
    const slotRow = (s) => {
      const role = d.roles[s.key];
      const isGrave = s.key.startsWith("center:");
      const myLv = isGrave ? -1 : (d.rand.lover || []).findIndex((pr) => (pr || []).includes(s.key));
      const mateNm = myLv >= 0 ? ((d.rand.lover[myLv] || []).filter((x) => x !== s.key && valid.has(x)).map(nmOf)[0]) : "";
      const dupLab = (!isGrave && (d.rand.drunk || []).includes(s.key) ? "(+酔っ払い)" : "") + (myLv >= 0 ? `(+恋人${myLv + 1})` : "");
      const lab = (role ? esc(rn(role)) + (d.tf[s.key] ? `→${esc(rn(d.tf[s.key]))}` : "") : "固定なし") + dupLab;   // 例: 闇の化身→人狼(+恋人1) / 村人(+酔っ払い)(+恋人2)
      let h = row(esc(s.name) + (s.cpu ? cpuBadge : ""), `<span class="dbg-val">${lab}</span> ${b("変更", "pick", ["l:" + s.key])}`);
      if (ui.pick === "l:" + s.key) {
        const roleBtn = (r) => b(esc(rn(r)), "lockSet", [s.key, r], role === r ? "dbg-on" : "");   // 固定は配役の枚数を超えて指定できる（固定が最優先）
        // 陣営ごとに見出しを付けて並べる。人狼陣営は 変化役 / 人狼系 / 狂人系 に分ける（役職の選択も「変化後」の選択も同じ並べ方）
        const rb = groupBtns(deckRoles, roleBtn);
        const tg = role && ONW.TRANSFORM_GROUPS[role]
          ? `<div class="dbg-sub">変化後</div>${b("ランダム", "tfSet", [s.key, ""], !d.tf[s.key] ? "dbg-on" : "")}${groupBtns(ONW.TRANSFORM_GROUPS[role], (t) => b(esc(rn(t)), "tfSet", [s.key, t], d.tf[s.key] === t ? "dbg-on" : ""))}` : "";
        const maxPairs = Math.min(5, Math.floor(players.length / 2));
        const dup = isGrave ? "" : `<div class="dbg-sub">重複役職（役職とは別に重ねて指定）</div>${b("酔っ払い", "randToggle", ["drunk", s.key], (d.rand.drunk || []).includes(s.key) ? "dbg-on" : "")}${Array.from({ length: maxPairs }, (_, i) => b(`恋人${i + 1}`, "randLover", [String(i), s.key], ((d.rand.lover || [])[i] || []).includes(s.key) ? "dbg-on" : "")).join("")}`;
        h += `<div class="dbg-pick">${rb}${b("固定なし", "lockSet", [s.key, ""], "dbg-clear")}${tg}${dup}${b("閉じる", "pick", ["l:" + s.key])}</div>`;
      }
      return h;
    };
    const warn = (g.dbgWarn || []).length ? `<div class="dbg-warn">前回の開始時の警告:${g.dbgWarn.map((w) => `<div>・${esc(w)}</div>`).join("")}</div>` : "";
    return warn +
      `<div class="dbg-h">参加者</div>${players.map(slotRow).join("") || hint("参加者がいません。")}` +
      `<div class="dbg-h">墓地</div>${graves.map(slotRow).join("") || hint("墓地がありません。")}` +
      `<div class="dbg-actions">${b("一斉解除（固定役・能力先・ランダム対象）", "lockClear", [], "dbg-clear")}</div>`;
  }

  // ---- CPUの能力先指定 ----
  /** そのCPUに固定した役職から、夜の能力で使える指定の種類を判断する（光の使徒などは「変化後」の指定まで見る） */
  const ABILITY = { seer: "seer", mad_seer: "seer", robber: "rob", love_tanner: "rob", pure_lover: "rob", evil_woman: "tm", cupid: "tm", heartbreaker: "rob", keymaster: "rob", watchdog: "rob", shuffler: "rob", freeter: "rob", visitor: "rob", troublemaker: "tm", relic_robber: "rel", doppelganger: "rob", gremlin: "gr" };
  function cpuRoles(key) {   // 固定役 → 変化後の指定があればその役職 / 変化後がランダムなら候補すべて / 固定なしなら null
    const d = data(), r = d.roles[key];
    if (!r) return null;
    const grp = ONW.TRANSFORM_GROUPS[r];
    if (grp) return d.tf[key] ? [d.tf[key]] : grp.slice();
    return [r];
  }
  function cpuKinds(key) {
    const rs = cpuRoles(key), k = { seer: false, rob: false, tm: false, rel: false, gr: false };
    if (!rs) return k;   // 固定なし: 能力先は指定できない
    rs.forEach((r) => { if (ABILITY[r]) k[ABILITY[r]] = true; });
    return k;
  }
  function cpuPart() {
    const g = G(), d = data();
    const { players } = slots();
    const nameOfKey = (k) => (players.find((s) => s.key === k) || {}).name || "?";
    const valid = new Set(players.map((x) => x.key));
    const rows = players.map((s) => {
      const t = d.cpu[s.key] || {}, role = d.roles[s.key], k = cpuKinds(s.key), rs = cpuRoles(s.key);
      const rk = rs ? RAND_KINDS.filter((x) => x.roles.some((r) => rs.includes(r)) && (!x.cpuOnly || s.cpu)) : [];   // 従者のご主人など（人間もCPUも）
      if (!rs) return "";   // 固定役がない人は出さない
      if (!rk.length && (!s.cpu || !Object.values(k).some(Boolean))) return "";   // 指定できるものがない人も出さない
      const parts = [];
      if (t.player) parts.push(esc(nameOfKey(t.player)));
      if ((t.players || []).length) parts.push(t.players.map((id) => esc(nameOfKey(id))).join(k.gr && !k.tm ? " → " : " と "));
      if ((t.graves || []).length) parts.push(t.graves.map((i) => `墓地${i + 1}`).join("・"));
      rk.forEach((x) => { const st = x.kind === "master" ? d.master : d.rand[x.kind], cur = st && st[s.key] && valid.has(st[s.key]) ? st[s.key] : null; if (cur) parts.push(`${esc(x.label)}: ${esc(nameOfKey(cur))}`); });
      const lab = parts.length ? parts.join(" / ") : "指定なし";
      const fixed = role ? ` <small class="dbg-dim">(${esc(rn(role))}${d.tf[s.key] ? " → " + esc(rn(d.tf[s.key])) : ""}固定)</small>` : "";
      let h = row(esc(s.name) + (s.cpu ? cpuBadge : "") + fixed, `<span class="dbg-val">${lab}</span> ${b("変更", "pick", ["c:" + s.key])}`);
      if (ui.pick === "c:" + s.key) {
        const others = players.filter((o) => o.key !== s.key);
        const maxG = k.seer ? ONW.seerGraveMax(g) : 1;   // eslint-disable-line
        const sec = (title, inner) => `<div class="dbg-sub">${title}</div>${inner}`;
        const pb = (fn, sel) => others.map((o) => b(esc(o.name), fn, [s.key, o.key], sel(o.key) ? "dbg-on" : "")).join("");
        const gb = Array.from({ length: g.graveCount || 0 }, (_, i) => b(`墓地${i + 1}`, "cpuGrave", [s.key, String(i)], (t.graves || []).includes(i) ? "dbg-on" : "")).join("");
        let body = "";
        if (!s.cpu) body = "";
        else if (rs && !Object.values(k).some(Boolean) && !rk.length) body = hint(`この役職（${esc(rs.map(rn).join("・"))}）には、指定できる能力先がありません。`);
        else if (s.cpu) {
          if (k.seer || k.rob) body += sec(k.seer && k.rob ? "プレイヤー（占う相手 / 交換・一目惚れの相手）" : k.seer ? "プレイヤー（占う相手）" : "プレイヤー（交換・一目惚れの相手）", pb("cpuPlayer", (id) => t.player === id));
          if (k.tm) body += sec("プレイヤー2人（入れ替える2人）", pb("cpuPlayers", (id) => (t.players || []).includes(id)));
          if (k.gr) body += sec("プレイヤー2人（コピー元 → コピー先の順に押す）", others.map((o) => { const ix = (t.players || []).indexOf(o.key); return b((ix >= 0 ? (ix === 0 ? "①元 " : "②先 ") : "") + esc(o.name), "cpuPlayers", [s.key, o.key], ix >= 0 ? "dbg-on" : ""); }).join(""));
          if (k.seer || k.rel) body += sec(k.seer ? `墓地（${ONW.seerGraveMax(g)}枚まで）` : "墓地（交換する1枚）", gb);
        }
        rk.forEach((x) => {   // 固定した役職（変化後も含む）が従者などなら、同じパネルで対象（ご主人など）を指定できる
          const st = x.kind === "master" ? d.master : d.rand[x.kind], cur = st && st[s.key] && valid.has(st[s.key]) ? st[s.key] : null;
          body += sec(esc(x.label), players.filter((o) => x.self || o.key !== s.key).map((o) => b(esc(o.name) + (o.cpu ? cpuBadge : ""), "randSet", [x.kind, s.key, o.key], cur === o.key ? "dbg-on" : "")).join("") + b("指定なし", "randSet", [x.kind, s.key, ""], "dbg-clear"));
        });
        h += `<div class="dbg-pick">${body}${s.cpu ? b("能力先を全て解除", "cpuClear", [s.key], "dbg-clear") : ""}${b("閉じる", "pick", ["c:" + s.key])}</div>`;
      }
      return h;
    }).join("");
    return (rows || hint("役職を固定した人がいると、ここに出ます。"));
  }

  // ---- ランダムに決まる対象の指定（固定した役職が従者・黒猫などの人だけ。人間もCPUも） ----
  const RAND_KINDS = [   // 役職 → 指定できる対象の種類
    { kind: "master", roles: ["servant"], label: "ご主人" },
    { kind: "freeter", roles: ["freeter"], label: "就職先（自動で決まるとき）" },
    { kind: "visitor", roles: ["visitor"], label: "訪問先（自動で決まるとき）" },
    { kind: "cat", roles: ["cat_sidhe", "black_cat", "cat_pumpkin"], label: "道連れ先" },
    { kind: "straw", roles: ["straw_doll"], label: "道連れ先（自動で選ぶとき）" },
    { kind: "exec", roles: ["executioner"], label: "ターゲット" },
    { kind: "muzzle", roles: ["muzzle_madman"], label: "口封じ先", self: true },   // 自分自身も口封じ先になれる
  ];
  function tabCpu() {
    if (!inLobby()) return hint("能力先・ランダム対象はルーム（ロビー）で設定します。次の試合に反映されます。");
    return `<div class="dbg-h">夜の能力先・ランダムに決まる対象</div>` + cpuPart();
  }

  // ---- 昼能力（CPUをリアルタイムで発動する）----
  /** 昼の議論中に、CPUの昼能力（独裁・交換・保安官・再就職）を「いま」使わせる。事前指定ではなく、押した瞬間に発動する（マイクラ版の能力先指定の昼版と同じ） */
  const DAY_KINDS = [
  ];
  function tabDay() {
    const g = G();
    if (!inGame() || g.phase !== PH().ONLINE_DAY) return hint("昼の議論中に使えます。CPUの昼能力（独裁・交換・保安官・フリーターの再就職）を、押した瞬間に発動します。");
    const nm = (id) => (g.players.find((p) => p.id === id) || {}).name || "?";
    const rows = g.players.filter((p) => p.isCpu).map((p) => {
      const k = DAY_KINDS.find((x) => g.currentRoles[p.id] === x.role);
      if (!k) return "";
      const dead = (g.deadIds || []).includes(p.id), ok = !dead && !!k.can(g, p.id);
      let h = row(esc(p.name) + cpuBadge + ` <small class="dbg-dim">(${esc(rn(k.role))})</small>`, ok ? b(`${k.label}を使う`, "pick", ["d:" + p.id]) : `<span class="dbg-val">${dead ? "死亡" : "今は使えません"}</span>`);
      if (ok && ui.pick === "d:" + p.id) {
        const first = ui.dayFirst && ui.dayFirst.id === p.id ? ui.dayFirst.t : null;
        const lab = k.two ? (first ? `2人目（1人目: ${esc(nm(first))}）` : "1人目") : "対象";
        const ts = k.targets(g, p.id).filter((t) => t !== first);
        h += `<div class="dbg-pick"><div class="dbg-sub">${lab}を選ぶと、すぐに発動します</div>${ts.map((t) => b(esc(nm(t)) + (t === p.id ? "（自分）" : ""), "dayUse", [p.id, k.kind, t])).join("")}${b("やめる", "dayCancel")}</div>`;
      }
      return h;
    }).join("");
    return rows || hint("昼能力を使えるCPU（独裁者・交換者・保安官・再就職できるフリーター）がいません。役職を固定したCPUに配ると出ます。");
  }

  // ---- その他（CPU議論発言 / 夜ログ）----
  function tabMisc() {
    const g = G(), d = data();
    const logs = inGame() ? ((g.nightLogsAll || []).length ? g.nightLogsAll.map((t) => `<div class="dbg-log">${esc(t)}</div>`).join("") : hint("まだ夜のログはありません。")) : hint("試合中に表示されます。");
    const canKill = inGame() && [PH().ONLINE_DAY, PH().ONLINE_VOTE].includes(g.phase);
    const kill = canKill
      ? g.players.map((p) => row(esc(p.name) + (p.isCpu ? cpuBadge : ""), (g.deadIds || []).includes(p.id) ? `<span class="dbg-val">死亡済み</span>` : b("死亡させる", "kill", [p.id]))).join("")
      : hint("昼の議論〜投票の間に使えます。死亡した人は投票・発言ができず、霊界チャットに入ります。");
    return row("CPU議論発言", `<span class="dbg-val">${d.cpuTalkOff ? "OFF" : "ON"}</span> ${b("切り替え", "talkToggle")}`) +
      `<div class="dbg-h">昼中に死亡させる（霊界チャットの確認用）</div>${kill}<div class="dbg-h">夜ログ（GM用）</div>${logs}`;
  }

  const TABS = [["roles", "役職確認", tabRoles], ["votes", "投票先", tabVotes], ["locks", "固定役", tabLocks], ["cpu", "能力先", tabCpu], ["day", "昼能力", tabDay], ["misc", "その他", tabMisc]];

  /** 🛠ボタンは右上の縦並び(アカウント・📖ガイドと同じ列)に置く。重ならないよう、固定位置ではなく列の中に入れる */
  function placeFab(show) {
    let fab = document.getElementById("debug-fab");
    if (!show) { if (fab) fab.remove(); return; }
    if (!fab) {
      fab = document.createElement("button");
      fab.id = "debug-fab"; fab.type = "button"; fab.className = "dbg-fab";
      fab.setAttribute("aria-label", "デバッグ"); fab.title = "デバッグ"; fab.textContent = "🛠";
      fab.addEventListener("click", () => ONW.debug.toggleOpen());
    }
    const slot = document.getElementById("top-right") || document.body;
    if (fab.parentNode !== slot) slot.appendChild(fab);
    fab.classList.toggle("dbg-fab--open", ui.open);
  }

  debug.render = function () {
    const g = G(), badge = el("debug-badge", "dbg-badge"), root = el("debug-root");
    const warn = (g.dbgWarn || []).length;
    const hd = document.querySelector(".onw-header");
    if (hd && badge.previousElementSibling !== hd) hd.after(badge);   // ヘッダーのすぐ下（流れの中）に置く＝タイトルと重ならない
    badge.style.display = g.debugOn ? "" : "none";
    badge.textContent = "🛠 デバッグモード中" + (warn ? " ⚠" : "");
    placeFab(!!g.debugOn && ONW.net.isHost);
    if (!g.debugOn || !ONW.net.isHost) { root.innerHTML = ""; delete root.dataset.sheet; delete root.dataset.tab; return; }
    const tab = TABS.find((t) => t[0] === ui.tab) || TABS[0];
    const sheet = ui.open ? `
      <div class="dbg-sheet">
        <div class="dbg-head"><strong>デバッグ</strong>${b("閉じる", "toggleOpen")}</div>
        <div class="dbg-tabs">${TABS.map((t) => b(t[1], "tab", [t[0]], t[0] === tab[0] ? "dbg-on" : "")).join("")}</div>
        <div class="dbg-body">${tab[2]()}</div>
      </div>` : "";
    // 中身が同じなら描き直さない（描き直すとボタンが入れ替わって、押している最中のタップが無効になる）。描き直すときはスクロール位置を保つ
    if (root.dataset.sheet === sheet) return;
    const bd = root.querySelector(".dbg-body"), keep = bd ? bd.scrollTop : 0, same = bd && root.dataset.tab === tab[0];
    root.dataset.sheet = sheet; root.dataset.tab = tab[0];
    root.innerHTML = sheet;
    if (same && keep) { const nb = root.querySelector(".dbg-body"); if (nb) nb.scrollTop = keep; }
  };

  // ---- 操作 ----
  const refresh = () => debug.render();
  debug.toggleOpen = () => { ui.open = !ui.open; ui.pick = null; refresh(); };
  debug.tab = (t) => { ui.tab = t; ui.pick = null; refresh(); };
  debug.pick = (k) => { ui.pick = ui.pick === k ? null : k; refresh(); };
  debug.talkToggle = () => { const d = data(); d.cpuTalkOff = !d.cpuTalkOff; refresh(); };

  debug.kill = (id) => { ONW.net.killPlayer(id); refresh(); };
  debug.voteSet = (vid, tid, kind) => { ui.pick = null; ONW.net.debugVote(vid, tid || null, kind === "f"); refresh(); };   // kind: "f" = 妖狐投票 / それ以外 = 通常投票
  debug.voteAll = (tid, kind) => { ui.pick = null; ONW.net.debugVoteAll(tid, kind === "f"); refresh(); };
  debug.voteClear = (kind) => { ui.pick = null; ONW.net.debugVoteClearAll(kind === "f"); refresh(); };

  debug.lockSet = (key, role) => {
    const d = data();
    if (!role) { delete d.roles[key]; delete d.tf[key]; ui.pick = null; }
    else {
      d.roles[key] = role;
      if (d.tf[key] && !(ONW.TRANSFORM_GROUPS[role] || []).includes(d.tf[key])) delete d.tf[key];
      if (!ONW.TRANSFORM_GROUPS[role]) ui.pick = null;       // 変化役なら続けて「変化後」を選べるよう開いたまま
    }
    refresh();
  };
  debug.dayUse = (id, kind, t) => {   // 昼能力をいま発動（交換は1人目→2人目の順に選ぶ。選び終えた瞬間に使う）
    const k = DAY_KINDS.find((x) => x.kind === kind);
    if (!k) return;
    if (k.two) {
      if (!ui.dayFirst || ui.dayFirst.id !== id) { ui.dayFirst = { id, t }; refresh(); return; }
      const a = ui.dayFirst.t; ui.dayFirst = null; ui.pick = null;
      ONW.net.debugDayAbility(id, kind, a, t);
    } else { ui.pick = null; ONW.net.debugDayAbility(id, kind, t); }
    refresh();
  };
  debug.dayCancel = () => { ui.pick = null; ui.dayFirst = null; refresh(); };
  debug.masterSet = (key, t) => { const d = data(); if (t) d.master[key] = t; else delete d.master[key]; ui.pick = null; refresh(); };
  debug.randSet = (kind, key, t) => {   // kind: master / freeter / cat / straw / exec / muzzle（持ち主ごとに1人）
    const d = data(), store = kind === "master" ? d.master : d.rand[kind];
    if (!store) return;
    if (t) store[key] = t; else delete store[key];
    ui.pick = null; refresh();
  };
  debug.randToggle = (kind, key) => {   // 酔っ払いにする人（複数）
    const d = data();
    d.rand.drunk = key ? (d.rand.drunk.includes(key) ? d.rand.drunk.filter((x) => x !== key) : [...d.rand.drunk, key]) : [];
    refresh();
  };
  debug.randLover = (idx, key) => {   // 恋人の組idx（2人まで。押し直しで解除・3人目で古い方が外れる）
    const d = data(), i = Number(idx), cur = d.rand.lover[i] || [];
    const next = !key ? [] : cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key].slice(-2);
    // 同じ人が別の組に入っていたら、そちらから外す
    d.rand.lover = d.rand.lover.map((pr, j) => (j === i ? pr : (pr || []).filter((x) => !next.includes(x))));
    d.rand.lover[i] = next;
    refresh();
  };
  debug.tfSet = (key, t) => { const d = data(); if (t) d.tf[key] = t; else delete d.tf[key]; refresh(); };
  debug.lockClear = () => { const d = data(); d.roles = {}; d.tf = {}; d.cpu = {}; d.master = {}; d.rand = { cat: {}, freeter: {}, visitor: {}, straw: {}, exec: {}, muzzle: {}, drunk: [], lover: [] }; G().dbgWarn = []; ui.pick = null; refresh(); };

  // 指定を書き換える（空になったら項目ごと消す）
  const setCpu = (id, f) => { const d = data(), c = { ...(d.cpu[id] || {}), ...f }; Object.keys(c).forEach((k) => { if (c[k] == null || (Array.isArray(c[k]) && !c[k].length)) delete c[k]; }); if (Object.keys(c).length) d.cpu[id] = c; else delete d.cpu[id]; };
  debug.cpuPlayer = (id, target) => {
    const k = cpuKinds(id), cur = data().cpu[id] || {};
    setCpu(id, { player: cur.player === target ? null : target, ...(k.seer && !k.rel ? { graves: null } : {}) });   // 占い師だけならプレイヤーと墓地は同時に指定できない
    refresh();
  };
  debug.cpuPlayers = (id, target) => {   // いたずらっ子: 入れ替える2人（押し直しで解除。3人目を押すと古い方が外れる）
    const cur = (data().cpu[id] || {}).players || [];
    setCpu(id, { players: cur.includes(target) ? cur.filter((x) => x !== target) : [...cur, target].slice(-2) });
    refresh();
  };
  debug.cpuGrave = (id, i) => {
    const k = cpuKinds(id), cur = data().cpu[id] || {}, n = Number(i), max = k.seer ? ONW.seerGraveMax(G()) : 1;
    const gs = (cur.graves || []).includes(n) ? cur.graves.filter((x) => x !== n) : [...(cur.graves || []), n].slice(-max);
    setCpu(id, { graves: gs, ...(k.seer && !k.rob ? { player: null } : {}) });
    refresh();
  };
  debug.cpuClear = (id) => { delete data().cpu[id]; ui.pick = null; refresh(); };

  // 通常の再描画のあとに、デバッグ用の表示も追従させる
  // 設定ウィンドウ・デバッグ画面が開いている間は、右上の列を隠す（✕が覆われて押せなくなるのを防ぐ。:has非対応の古い端末用にクラスで切り替える）
  const syncOverlay = () => document.body.classList.toggle("ovl-open", !!document.querySelector(".settings-modal, .dbg-sheet"));
  const rawDebugRender = debug.render;
  debug.render = function () { const r = rawDebugRender.apply(this, arguments); syncOverlay(); return r; };
  const baseRender = ONW.ui.render;
  ONW.ui.render = function () { const r = baseRender.apply(this, arguments); debug.render(); return r; };

  ONW.debug = debug;
})(window.ONW);
