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
  const rc = (r) => `<span class="t-${ONW.roles.getInfo(r).team}">${esc(rn(r))}</span>`;   // 役職名は陣営の色（村人=緑 / 人狼=赤 / 第三=薄い灰色。COのラベルと同じ t-<陣営>）
  const pn = (n) => `<span class="rs-pl">${esc(n)}</span>`;   // プレイヤー名はオレンジ（夜行動結果などの画面と同じ rs-pl）
  const nameOf = (id) => (id && id === ONW.net.myId() ? "自分" : ((G().others || []).find((p) => p.id === id) || {}).name || "?");   // 自分を選べる結果開示（シャッフラー）では「自分」
  const seerLike = (r) => r === "seer" || r === "fake_seer" || r === "mad_seer" || r === "whimsical_seer";
  const graveNeed = () => { const g = G(); return ONW.seerGraveMax(g, seerLike(g.myRole) ? g.myRole : seerLike(g.myCo) ? g.myCo : "seer"); };   // 結果開示で言う墓地の枚数: 自分の役職（占い師・偽・狂は別の設定。気まぐれな占い師は占い師と共通）
  const whimClaim = () => { const g = G(); return g.myRole === "whimsical_seer" || g.myCo === "whimsical_seer"; };   // 気まぐれな占い師を名乗っている（本物・騙り・思い込み）→ 結果開示に「失敗」の選択肢を出す（マイクラ版の結果開示と同じ）

  // 役職COのあとに結果開示が必要な役職 → 結果開示の種類。各役職ファイルの coResult.kind(狂った占い師は like で占い師と同じ形)
  const coOf = (role) => { const d = ONW.roleDef(role); return d && d.coResult ? d.coResult : null; };
  const kindOf = (role) => { const c = coOf(role); return c ? c.kind : undefined; };
  const hookOfKind = (kind) => { for (const id of ONW.roleIds()) { const c = coOf(id); if (c && c.kind === kind) return c; } return null; };   // その種類の結果開示を持つ役職の coResult
  const K = { rn, nameOf };   // 役職ファイルの coResult に渡す道具

  function set(s) { G().co = s; co.render(); }
  function done(text, claim, setRole, flag, short) { ONW.net.sendCo(text, claim, setRole, flag, short); set(null); }   // short: 一覧に出す短い結果（「対象 → 結果」）

  co.open = () => { if (G().muzzled) { set(null); return; } set(G().co ? null : { step: "menu" }); };   // 口封じされている人はCOボタンが使えない
  const releaseIfChain = () => { const s = G().co; if (s && s.chain && ONW.net.releaseCoHold) ONW.net.releaseCoHold(); };   // 役職COのあと結果開示の途中で抜けたら、CPUを待たせない
  co.close = () => { releaseIfChain(); set(null); };
  co.back = () => { releaseIfChain(); set({ step: "menu" }); };

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
    if (role === "cosplayer" || role === "doppelganger" || role === "relic_robber") G().myViaRole = null;   // 変化役を新しくCOしたら、手にした役職の覚えは消す（COし直しで選び直せる）
    if (kindOf(role) && !coOf(role).noChain) {   // noChain: 結果がまだない状態でもCOだけで終われる役職（保安官: 撃つ前にCOする。撃ったあとで「結果開示」を押す）
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
    const via = G().myViaRole;   // コスプレ・ドッペル・墓荒らしで手にした役職があるときは、その役職の結果開示を開く（マイクラ版の resultRole と同じ）
    if ((my === "cosplayer" || my === "doppelganger" || my === "relic_robber") && via && kindOf(via)) return startResult(kindOf(via));
    if (kindOf(my)) return startResult(kindOf(my));
    set({ step: "msg", msg: "あなたがCOしている役職には結果開示が必要ありません。" });
  };
  // 墓荒らし・ドッペルで手にした役職の結果開示（続けて言う）。手にした役職に結果開示があれば、今の結果を「続きあり」で送り、そのまま次の結果開示へ進む（その間CPUは割り込まない）
  //   墓荒らし/ドッペル自身は、ステップ3（ドッペル→墓荒らし→役職 / 墓荒らし→ドッペル→役職）で扱う。結果を伏せたとき・撃つ前でよい保安官(noChain)は続けない
  // via: どちらの結果開示から来たか。墓荒らし(relic)で墓地から手にした役職は roleCanChain の役職だけ続く(墓荒らし自身は続かない=ドッペルだけ)。
  //      ドッペル(doppel)でコピーした役職は、墓荒らしなら続く(ドッペル→墓荒らし→役職)。ドッペルをコピーすると村人になるので続かない
  const chainKindOf = (role, via) => {
    if (!role || role === "hide") return null;
    const c = coOf(role);
    if (!c || c.noChain) return null;
    if (c.kind === "relic") return via === "doppel" || via === "cosplay" ? c.kind : null;   // コスプレイヤーが墓荒らしにコスプレしたときも、墓地の交換結果 → 手にした役職の結果へ続く
    if (c.kind === "doppel") return via === "relic" ? c.kind : null;
    if (c.kind === "bell" || c.kind === "donut" || c.kind === "hokma") return c.kind;   // 夜の結果がその場で分かる役職は、変化で手にしたときも続けて開示できる（鈴の回数・ドーナツの配達・ホクマーの短縮）
    return ONW.cpu && ONW.cpu.hasChainResult && ONW.cpu.hasChainResult(role) ? c.kind : null;
  };
  function doneChain(args, role, via) {   // args: done と同じ [text, claim, setRole, flag, short]。手にした役職 role の結果開示があれば続ける
    const k = chainKindOf(role, via);
    if (role && role !== "hide" && coOf(role)) G().myViaRole = role;   // 手にした役職を覚えておく（あとで「結果開示」を押すと、その役職の結果開示が開く。マイクラ版の resultRole と同じ考え方。続けられる役職も同じ）
    if (!k) return done(...args);
    ONW.net.sendCo(args[0], args[1], args[2], "holddisclose", args[4]);
    return startResult(k, true);
  }
  // ---- シャッフル候補・コスプレ候補（マイクラ版 chooseRoleWithShuffleCosplay と同じ仕組み） ----
  // シャッフラー/コスプレイヤーが初期役職にいる試合では、結果開示の役職選択の一番下に「シャッフル候補」「コスプレ候補」ボタンを足し、
  // 配役にない役職（シャッフラーが変化させた・コスプレした結果として出た役職）も選べるようにする。
  const initialHas = (role) => (G().deck || []).some((x) => (typeof x === "string" ? x : x.r) === role && !(typeof x === "object" && x.cand));   // フォールバック用: 配役の素の1枚にいるか（変化候補としてだけ載っている場合は数えない）
  const candOn = (role, key) => { const cb = G().candBtn; return cb ? !!cb[key] : initialHas(role); };   // ボタンを出す条件はホストが配布時に決める（配役にいるか、光の使徒・銀色の影から出たときだけ。作者決定）
  const candPools = () => {
    const pools = [];
    if (candOn("shuffler", "sh") && ONW.shuffler) pools.push({ key: "shuffle", label: "シャッフル候補", note: "シャッフラーが山札から引いて変化させた役職は、配役にない役職でも選べます。", roles: ONW.shuffler.pool() });
    if (candOn("cosplayer", "co") && ONW.cosplayer) pools.push({ key: "cosplay", label: "コスプレ候補", note: "コスプレイヤーがコスプレした役職は、配役にない役職でも選べます。", roles: ONW.cosplayer.pool() });
    return pools;
  };
  // 詩人・龍の狂人の候補は、夜に対象を選ぶ能力を持つ役職だけに絞る（マイクラ版 shuffleCosplayNarrowFilter と同じ。墓荒らしと自分自身は除く）
  const candNarrow = (roles, caller) => roles.filter((r) => r !== "relic_robber" && r !== caller && (ONW.roleDef(r) || {}).night);
  const candBtns = (apply) => candPools().map((p) => btn(`${p.label}から選ぶ`, `ONW.co.openCand('${p.key}', '${apply}')`)).join("");
  co.openCand = function (key, apply) {
    const p = candPools().find((x) => x.key === key);
    if (!p) return;
    const narrow = apply === "poetRole" ? "poet" : apply === "dragonRole" ? "dragon_madman" : null;
    const base = { pool: key, label: p.label, note: p.note, roles: narrow ? candNarrow(p.roles, narrow) : p.roles, apply, backState: G().co, query: "" };
    set({ ...base, step: key === "shuffle" ? "candteam" : "candlist" });   // シャッフル候補は陣営ごとに分かれる（マイクラ版と同じ: 陣営 → 人狼陣営は人狼系/狂人系 → 役職）
  };
  co.candTeam = function (team) { const s = G().co || {}; if (team === "wolf") return set({ ...s, step: "candkind", query: "" }); return set({ ...s, step: "candlist", team, kind: null, query: "" }); };
  co.candKind = function (kind) { const s = G().co || {}; return set({ ...s, step: "candlist", team: "wolf", kind, query: "" }); };
  co.candBack = () => { const s = G().co || {}; if (s.backState) set(s.backState); };
  co.candListBack = function () { const s = G().co || {}; if (s.pool === "shuffle") return set({ ...s, step: s.kind ? "candkind" : "candteam", query: "" }); return co.candBack(); };   // シャッフル候補の一覧からは陣営選択へ戻る
  co.candSearch = function (q) {   // 検索は再描画せず、その場でボタンを絞り込む（入力のフォーカスを保つため）
    const s = G().co; if (s) s.query = q || "";
    const host = document.getElementById("co-cand-roles"); if (!host) return;
    const query = (q || "").trim();
    host.querySelectorAll("[data-rname]").forEach((b) => { b.style.display = !query || b.getAttribute("data-rname").includes(query) ? "" : "none"; });
    host.querySelectorAll("[data-teamhead]").forEach((h) => {
      const t = h.getAttribute("data-teamhead");
      h.style.display = [...host.querySelectorAll(`[data-rname][data-team="${t}"]`)].some((b) => b.style.display !== "none") ? "" : "none";
    });
  };
  co.candPick = function (role) {
    const s = G().co || {}, apply = s.apply, back = s.backState;
    if (!apply || !back) return;
    G().co = back;   // 選ぶ前の画面の状態（対象・墓地の選択など）に戻してから、その画面の決定処理に役職を渡す
    return co[apply](role);
  };
  /** 結果開示の最初の画面（種類ごと）。seer/robber: 相手を選ぶ / relic: 墓地を選ぶ / tm: 2人選ぶ / insom: 最終役職を選ぶ */
  function startResult(kind, chain) {
    if (kind === "relic") return set({ step: "rgrave", kind, chain });
    if (kind === "cosplay") return set({ step: "crole", kind, chain });   // コスプレイヤー: コスプレした役職を選ぶ（山札の役職 / コスプレしなかった / ロックで失敗）
    if (kind === "bell") return set({ step: "bellcount", kind, chain });   // 鈴の巫女: 夜に鳴った回数を選ぶ → 昼に聞こえたかどうかを選ぶ（マイクラ版の鈴の巫女COフォーム）
    if (kind === "donut") return set({ step: "donut", kind, chain });   // ドーナツ屋: 届けました / 届けられませんでした（マイクラ版のドーナツ屋COフォーム）
    if (kind === "crazydonut") return set({ step: "crazydonut", kind, chain });   // 狂ったドーナツ屋: 粗悪なドーナツを届けました / 届けられませんでした（マイクラ版のCOフォームは名乗った役職で品名が切り替わる）
    if (kind === "screw") return set({ step: "screw", kind, chain });   // スクリューガム: 銀狼がいます / 銀狼がいません（マイクラ版のスクリューガムCOフォーム）
    if (kind === "mp") return set({ step: "mp", kind, chain });   // 多重人格: 今の人格は村人です / 狂人です（マイクラ版の多重人格COフォーム）
    if (kind === "counselor") return set({ step: "counseltgt", kind, chain });   // カウンセラー: 更生させようとした相手を選ぶ → 成功した/失敗したを選ぶ（マイクラ版のカウンセラーCOフォーム）
    if (kind === "psychologist") return set({ step: "psytgt1", kind, chain });   // 心理士: 検査した1人目を選ぶ → 2人目を選ぶ → 適合した/適合しなかったを選ぶ（マイクラ版の心理士COフォーム）
    if (kind === "ren") return set({ step: "rentgt", kind, chain });   // レン: 調べた相手を選ぶ → 変わっていたかどうかを選ぶ → モーゼスだったかどうかを選ぶ（マイクラ版のレンCOフォーム。Web版は1回の開示で1人ぶん）
    if (kind === "trailblazer") return set({ step: "tfate", kind, chain });   // 開拓者: 歩んでいる運命を選ぶ（調和・愉悦はそのあと、カルメン・いたずらっ子の結果開示へ続く）
    if (kind === "mgdark") return set({ step: "mgdark", kind, chain });   // 魔法少女: 闇落ちしているかどうかを選ぶ
    if (kind === "hokma") return set({ step: "hokma", kind, chain });   // ホクマー: 対象を選ばず「昼時間を短縮していました。」の1択
    if (kind === "command") return set({ step: "command", kind, chain });   // 統率の人狼: 対象を選ばず「統率の人狼として人狼陣営の配置を確認していました。」の1択
    if (kind === "sam") return set({ step: "sam", kind, chain });   // サム: 対象を選ばず「サムに変身していました。」の1択
    if (kind === "magician") return set({ step: "magicrole", kind, chain });   // 魔法使い: 奪った役職を選ぶ（マイクラ版の魔法使いCO。ロックで失敗の選択肢つき）
    if (kind === "tm" || kind === "gremlin" || kind === "evil_woman" || kind === "cupid" || kind === "chesed" || kind === "thread_spinner" || kind === "exchanger" || kind === "mad_exchanger" || kind === "libra") return set({ step: "tm", kind, chain, sel: [] });   // chesed: 占い先 → コーヒーを渡した相手の2人 / thread_spinner: ペアにした2人 / exchanger・mad_exchanger: 票数を交換した2人 / libra: 投票対象を制限した2人
    if (kind === "insom") return set({ step: "ikind", kind, chain });
    if (kind === "mason") return set({ step: "mason", kind, chain, sel: [] });
    if (kind === "love") return set({ step: "love", kind, chain });
    if (kind === "poet") return set({ step: "poetrole", kind, chain });
    if (kind === "dragon") return set({ step: "dragonrole", kind, chain });   // 龍の狂人: 使われた役職を選ぶ → 自分以外の参加者を選ぶ
    if (kind === "agent") return set({ step: "agentcmd", kind, chain });   // 代行者: 受けた指令を選ぶ（対象を守れ のときは対象も選ぶ）
    return set({ step: "target", kind, chain });
  }
  // 詩人の結果開示（マイクラ版どおり: 使われていた役職を選ぶ → 対象を選ぶ（2人を対象にする役職は2人）/ 「情報がなかった」）
  const POET_SKIP = ["poet", "relic_robber"];   // 墓荒らしは墓地だけを対象にするので詩人には伝わらない
  const poetRoleList = () => deckList().filter((x) => !POET_SKIP.includes(x.r) && (ONW.roleDef(x.r) || {}).night);   // 夜に対象を選ぶ能力を持つ役職
  co.poetRole = (role) => set({ step: "poettgt", kind: "poet", role, sel: [], chain: (G().co || {}).chain });
  co.poetBack = () => set({ step: "poetrole", kind: "poet", chain: (G().co || {}).chain });
  co.poetNone = () => { const h = hookOfKind("poet"); done(h.noneText, { kind: "poet", none: true }, null, "disclose", "能力の使用なし"); };
  const poetName = (id) => (id && id === ONW.net.myId() ? (G().myName || "?") : nameOf(id));   // 詩人の結果開示は、自分もふつうにプレイヤー名で言う
co.poetPick = function (id) {
    const s = G().co, h = hookOfKind("poet"), need = h.twoRoles.includes(s.role) ? 2 : 1;
    const sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    if (sel.length < need) return set({ ...s, sel });
    const names = sel.map(poetName);
    done(h.coText(s.role, names), { kind: "poet", role: s.role, targets: sel }, null, "disclose", `${rn(s.role)} → ${names.join("・")}`);
  };
  // 龍の狂人の結果開示（マイクラ版どおり: 使われた役職を選ぶ → 自分以外の参加者を選ぶ。「○○の△△に能力を使われました。」嘘も言える）
  const DRAGON_SKIP = ["dragon_madman", "relic_robber"];   // 龍の狂人自身は候補から外す（マイクラ版の候補除外）。墓荒らしは墓地だけを対象にするので詩人と同じく外す
  const dragonRoleList = () => deckList().filter((x) => !DRAGON_SKIP.includes(x.r) && (ONW.roleDef(x.r) || {}).night);   // 夜に対象を選ぶ能力を持つ役職
  co.dragonRole = (role) => set({ step: "dragontgt", kind: "dragon", role, chain: (G().co || {}).chain });
  co.dragonBack = () => set({ step: "dragonrole", kind: "dragon", chain: (G().co || {}).chain });
  co.dragonPick = function (id) {
    const s = G().co, h = hookOfKind("dragon");
    done(h.coText(s.role, [nameOf(id)]), { kind: "dragon", role: s.role, target: id }, null, "disclose", `${rn(s.role)} → ${nameOf(id)}`);
  };
  co.pickLove = (id) => done(...hookOfKind("love").pickLove(id, K));
  co.pickRelicGrave = (i) => set({ step: "rrole", kind: "relic", idx: i, chain: (G().co || {}).chain });
  co.relicRole = function (role) {
    doneChain(hookOfKind("relic").relicRole(role, G().co, K), role, "relic");   // 墓荒らし → 手にした役職の結果（占い師なら占い結果 など）
  };
  // コスプレイヤーの結果開示: 山札から3枚めくってコスプレした役職を選ぶ → コスプレ先に結果開示があれば続ける（コスプレ→占い師→占い結果、コスプレ→墓荒らし→墓地の交換結果）。「コスプレしなかった」・ロックで失敗・伏せるも言える（CPUの発言と同じ文言）
  co.cosRole = function (role) { doneChain(hookOfKind("cosplay").cosRole(role, K), role, "cosplay"); };
  co.cosNone = () => { const h = hookOfKind("cosplay"); done(h.noneText, null, null, "disclose", "コスプレなし"); };
  // 開拓者の結果開示（4of4-b。マイクラ版・CPUの発言と同じ文「私は○○の運命を歩んでいます。」）: 運命を5つから選ぶ。
  //   壊滅・存護・記憶はこの1行で終わり。調和は続けてカルメンの結果開示（囁いた相手）、愉悦は続けていたずらっ子の結果開示（入れ替えた2人）へ進む（その間CPUは割り込まない）。
  //   続きの結果は、カルメン・いたずらっ子本人の結果開示と同じ文・同じ claim（kind: carmen / troublemaker）で送られる
  co.trailFate = function (fate) {
    const h = hookOfKind("trailblazer");
    if (!h || !h.pickFate) return;
    const r = h.pickFate(fate), a = r.args;
    if (!r.follow) return done(...a);
    ONW.net.sendCo(a[0], a[1], a[2], "holddisclose", a[4]);   // 運命の発言を残しつつ、次の結果開示へ続ける
    startResult(r.follow, true);
  };
  // 魔法少女の結果開示（マイクラ版のCOフォームと同じ2択）: 闇落ちしていません / 闇落ちしています
  co.pickMgDark = function (dark) { const h = hookOfKind("mgdark"); if (h && h.pickDark) return done(...h.pickDark(dark, K).args); };
  co.pickHokma = function () { const h = hookOfKind("hokma"); if (h && h.fixedText) return done(h.fixedText, { kind: "hokma" }, null, "disclose", h.fixedShort); };   // ホクマーの結果開示: 固定文（マイクラ版のホクマーCO結果）をそのまま言う
  // 鈴の巫女の結果開示（マイクラ版の鈴の巫女COフォーム）: 1段目=夜に鳴った回数（0〜10）を言い、2段目=昼に聞こえたかどうかを言う。2つのCO履歴に分かれる（マイクラ版と同じ）
  co.pickBellCount = function (n) { ONW.net.sendCo(`夜に鈴の音が${n}回聞こえました。`, { kind: "bell", night: n }, null, "holddisclose", `夜 ${n}回`); return set({ step: "bellday", kind: "bell", night: n, chain: (G().co || {}).chain }); };
  co.pickBellDay = function (heard) { const s = G().co || {}; done(heard ? "鈴の音が聞こえました。" : "鈴の音が聞こえませんでした。", { kind: "bell", night: s.night, day: heard }, null, "disclose", heard ? "昼 鈴が鳴った" : "昼 鈴は鳴らなかった"); };
  co.bellBack = () => set({ step: "bellcount", kind: "bell", chain: (G().co || {}).chain });
  // ドーナツ屋の結果開示（マイクラ版のドーナツ屋COフォーム: 届けました / 届けられませんでした）
  co.pickDonut = function (delivered) { done(delivered ? "ドーナツを届けました。" : "ドーナツを届けられませんでした。", { kind: "donut", delivered }, null, "disclose", delivered ? "ドーナツを届けた" : "ドーナツを届けられなかった"); };
  // 狂ったドーナツ屋の結果開示（マイクラ版のCOフォーム: 品名が「粗悪なドーナツ」になる）
  co.pickCrazyDonut = function (delivered) { done(delivered ? "粗悪なドーナツを届けました。" : "粗悪なドーナツを届けられませんでした。", { kind: "crazydonut", delivered }, null, "disclose", delivered ? "粗悪なドーナツを届けた" : "粗悪なドーナツを届けられなかった"); };
  // スクリューガムの結果開示（マイクラ版のスクリューガムCOフォーム: 銀狼がいます / 銀狼がいません）
  co.pickScrew = function (has) { done(has ? "銀狼がいます。" : "銀狼がいません。", { kind: "screw", has }, null, "disclose", has ? "銀狼がいる" : "銀狼がいない"); };
  co.pickMp = function (mad) { done(mad ? "今の人格は狂人です。" : "今の人格は村人です。", { kind: "mp", mad: !!mad }, null, "disclose", mad ? "人格は狂人" : "人格は村人"); };   // 多重人格: 今の人格を選ぶ
  // カウンセラーの結果開示（マイクラ版のカウンセラーCOフォーム: 更生させようとした相手を選ぶ → 成功した/失敗したを選ぶ）
  co.counselTarget = function (id) { set({ step: "counselres", kind: "counselor", target: id, chain: (G().co || {}).chain }); };
  co.counselBack = () => set({ step: "counseltgt", kind: "counselor", chain: (G().co || {}).chain });
  co.pickCounsel = function (ok) { const s = G().co, who = nameOf(s.target), h = hookOfKind("counselor"); done(h && h.coText ? h.coText(who, ok) : (ok ? `${who} の更生に成功しました。` : `${who} の更生に失敗しました。`), { kind: "counselor", target: s.target, ok }, null, "disclose", h && h.coShort ? h.coShort(who, ok) : `${who} → ${ok ? "更生成功" : "更生失敗"}`); };
  // 心理士の結果開示（マイクラ版の心理士COフォーム: 検査した1人目を選ぶ → 2人目を選ぶ → 適合した/適合しなかったを選ぶ）
  co.psyTarget1 = function (id) { set({ step: "psytgt2", kind: "psychologist", first: id, chain: (G().co || {}).chain }); };
  co.psyTarget2 = function (id) { const s = G().co; set({ step: "psyres", kind: "psychologist", first: s.first, second: id, chain: s.chain }); };
  co.psyBack1 = () => set({ step: "psytgt1", kind: "psychologist", chain: (G().co || {}).chain });
  co.psyBack2 = () => { const s = G().co; set({ step: "psytgt2", kind: "psychologist", first: s.first, chain: s.chain }); };
  co.pickPsy = function (m) { const s = G().co, A = nameOf(s.first), B = nameOf(s.second), h = hookOfKind("psychologist"); done(h && h.coText ? h.coText(A, B, m) : `${A}と${B}の検査結果は${m ? "適合しました" : "適合しませんでした"}。`, { kind: "psychologist", first: s.first, second: s.second, matched: !!m }, null, "disclose", h && h.coShort ? h.coShort(A, B, m) : `${A}と${B} → ${m ? "適合" : "不適合"}`); };
  // レンの結果開示（マイクラ版のレンCOフォーム: 調べた相手を選ぶ → 役職が変わっていたかどうかを選ぶ → モーゼスだったかどうかを選ぶ（伏せるも選べる））
  co.renTarget = function (id) { set({ step: "renres", kind: "ren", target: id, chain: (G().co || {}).chain }); };
  co.renBack = () => set({ step: "rentgt", kind: "ren", chain: (G().co || {}).chain });
  co.pickRenChanged = function (changed) { const s = G().co; set({ step: "renmoses", kind: "ren", target: s.target, changed, chain: s.chain }); };
  co.pickRenMoses = function (m) { const s = G().co, who = nameOf(s.target), h = hookOfKind("ren"); const base = h && h.coText ? h.coText(who, s.changed) : (s.changed ? `${who}の役職は変わっていました。` : `${who}の役職は変わっていませんでした。`); const extra = m === null ? "" : (h && h.coMosesText ? h.coMosesText(who, m) : (m ? `そして、${who}はモーゼスでした。` : `そして、${who}はモーゼスではありませんでした。`)); done(base + extra, { kind: "ren", target: s.target, changed: !!s.changed, moses: m === true }, null, "disclose", h && h.coShort ? h.coShort(who, s.changed, m === null ? null : m) : `${who} → ${s.changed ? "変化あり" : "変化なし"}`); };
  co.pickCommand = function () { const h = hookOfKind("command"); if (h && h.fixedText) return done(h.fixedText, { kind: "command" }, null, "disclose", h.fixedShort); };   // 統率の人狼の結果開示: 固定文（マイクラ版の統率の人狼CO結果）をそのまま言う
  co.pickSam = function () { const h = hookOfKind("sam"); if (h && h.fixedText) return done(h.fixedText, { kind: "sam" }, null, "disclose", h.fixedShort); };   // サムの結果開示: 固定文（マイクラ版のサムCO結果）をそのまま言う
  co.magicRole = function (role) { const h = hookOfKind("magician"); if (h && h.pickRole) return done(...h.pickRole(role, K)); };   // 魔法使いの結果開示: 奪った役職を選ぶ（マイクラ版「○○を奪いました。」）
  co.magicFail = function () { return done("ロックされていて失敗しました。", null, null, "disclose", "ロックで失敗"); };   // 魔法使いの結果開示: 封印・ロックで盗めなかった場合（マイクラ版の選択肢どおりの文面）
  // 代行者の結果開示（マイクラ版どおり: 指令を6種から選ぶ → 「対象を守れ」のときは対象を選ぶ。嘘もつける）
  co.pickAgentCmd = function (key) { if (key === "protect") return set({ step: "agenttgt", kind: "agent", chain: (G().co || {}).chain }); const h = hookOfKind("agent"); if (h && h.pickCommand) return done(...h.pickCommand(key, K)); };
  co.pickAgentTarget = function (id) { const h = hookOfKind("agent"); if (h && h.pickTarget) return done(...h.pickTarget(id, K)); };
  co.agentBack = () => set({ step: "agentcmd", kind: "agent", chain: (G().co || {}).chain });
  co.pickTm = function (id) {
    const s = G().co, sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    if (sel.length < 2) return set({ ...s, sel });
    if (s.kind === "gremlin") return set({ step: "gcopy", kind: "gremlin", chain: s.chain, sel });   // グレムリン: 2人(コピー元 → コピー先)を選んだら、コピーした役職を選ぶ
    done(...(hookOfKind(["gremlin", "evil_woman", "cupid", "chesed", "thread_spinner", "exchanger", "mad_exchanger", "libra"].includes(s.kind) ? s.kind : "tm")).pickTwo(sel, K));   // グレムリン: 1人目がコピー元、2人目がコピー先 / 悪女: 1人目が本命、2人目がキープ / キューピッド: 恋人にした2人 / ケセド: 1人目が占い先、2人目がコーヒーを渡した相手 / 糸紡ぎ: ペアにした2人 / 交換者・狂った交換者: 票数を交換した2人 / 天秤: 投票対象を制限した2人
  };
  co.gremlinRole = (role) => done(...hookOfKind("gremlin").pickRole(role, (G().co || {}).sel || [], K));   // コピーした役職（または「伏せる」）
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
    else if (whimClaim()) set({ step: "gfail", sel });   // 気まぐれな占い師: 墓地を選び終わったら、まず成功したかどうかを聞く（マイクラ版の墓地開示と同じ）
    else set({ step: "grole", sel, k: 0, results: [], shorts: [] });
  };
  co.graveOk = function () { const s = G().co; set({ step: "grole", sel: s.sel || [], k: 0, results: [], shorts: [], chain: s.chain, again: s.again }); };   // 気まぐれな占い師の墓地開示: 成功 → 役職を選ぶ
  co.graveFail = function () { ONW.net.sendCo("墓地を占いましたが失敗しました。", null, null, "holddisclose", "墓地 → 失敗"); return seerAgain(); };   // 気まぐれな占い師の墓地開示: 失敗（言い終わっても対象選択に戻る）
  // 占い師系の開示は「対象を選ぶ」に戻って続けられる（プレイヤーの結果と墓地の結果を1回の流れで両方言える）。終わるときは「開示を終わる」
  const seerAgain = () => set({ step: "target", kind: "seer", chain: true, again: true });
  co.seerDone = () => { if (ONW.net.releaseCoHold) ONW.net.releaseCoHold(); set(null); };
  co.pickRole = function (role) {            // role: 役職ID or "hide" or "fail"（気まぐれな占い師の失敗）
    const s = G().co, who = nameOf(s.target);
    if (role === "fail") {   // 気まぐれな占い師の結果開示: 失敗（マイクラ版の文面と同じ）
      if (s.kind === "seer") { ONW.net.sendCo(`${who} を占いましたが失敗しました。`, null, null, "holddisclose", `${who} → 失敗`); return seerAgain(); }
      return done(`${who} を占いましたが失敗しました。`, null, null, "disclose", `${who} → 失敗`);
    }
    const h = hookOfKind(s.kind) || hookOfKind("robber");   // 結果役職の文言は種類ごと(占い師・ドッペル・フリーター)。それ以外は怪盗と同じ形
    if (!h.pickRole) return done(...hookOfKind("robber").pickRole(role, who, s, K));
    if (s.kind === "doppel") return doneChain(h.pickRole(role, who, s, K), role, "doppel");   // ドッペル → コピーして手にした役職の結果
    if (s.kind === "seer") { const a = h.pickRole(role, who, s, K); ONW.net.sendCo(a[0], a[1], a[2], "holddisclose", a[4]); return seerAgain(); }   // 占い師系: 言い終わっても対象選択に戻る（墓地の結果も続けて言える）
    return done(...h.pickRole(role, who, s, K));
  };
  co.graveRole = function (role) {
    const s = G().co, idx = s.sel[s.k];
    const results = [...s.results, `墓地${idx + 1} を見て ${rn(role)}`], shorts = [...(s.shorts || []), `墓地${idx + 1} → ${rn(role)}`];
    if (s.k + 1 < s.sel.length) return set({ ...s, k: s.k + 1, results, shorts });
    ONW.net.sendCo(`${results.join("、")} でした。`, null, null, "holddisclose", shorts.join("、"));   // 墓地の結果を言い終わっても対象選択に戻る（プレイヤーの結果も続けて言える）
    return seerAgain();
  };

  co.history = () => set({ step: "history" });

  // ---- 情報開示 ----（本家の「〜ていたことを伝える」系。訪問された / フリーターに就職されている / 従者がいる。CPUの発言と同じ文言）
  co.info = () => set({ step: "info" });
  co.infoBack = () => set({ step: "info" });
  co.visited = () => set({ step: "visited" });
  co.pickVisitor = (id) => done(...hookOfKind("visitor").infoVisited(id, K));
  // カクテルを渡されたことを伝える（情報開示。マイクラ版 main.js のカクテル情報CO「カクテルが渡されてました。」。誰からかは言わない）
  co.cocktailInfo = () => done("カクテルが渡されてました。", null, null, "disclose", "カクテルを渡された");
  // ドーナツが届いたことを伝える（情報開示。マイクラ版 openDonutInfoCoMenu: ドーナツ / 粗悪なドーナツ を選ぶ。誰からかは言わない）
  co.donutInfo = () => set({ step: "donutinfo" });
  // テレパシストに接続されたことを伝える（情報開示。マイクラ版 openTelepathistConnectedInfoCoMenu: 誰に接続されたか言える。伏せると「テレパシストに接続されました。」）
  co.telepathistInfo = () => set({ step: "tpinfo" });
  co.pickTelepathist = (id) => done(`テレパシストの${K.nameOf(id)}に接続されました。`, null, null, "disclose", `${K.nameOf(id)}に接続された`);
  co.telepathistNoName = () => done("テレパシストに接続されました。", null, null, "disclose", "テレパシストに接続された");
  co.pickDonutInfo = (defective) => done(defective ? "粗悪なドーナツが届いていました。" : "ドーナツが届いていました。", null, null, "disclose", defective ? "粗悪なドーナツが届いた" : "ドーナツが届いた");
  // フリーターに就職されている（本家と同じ: 「誰がフリーターか」も伝えるかを選ぶ）
  co.freeterInfo = () => set({ step: "fjob" });
  co.freeterNoName = () => done(...hookOfKind("freeter").infoNoName());
  co.freeterWho = () => set({ step: "fwho" });
  co.pickFreeter = (id) => done(...hookOfKind("freeter").infoWho(id, K));
  // 従者がいる（本家: 「自分の従者がいます。」）
  co.reversedInfo = () => done(...hookOfKind("reverser").infoReversed(K));   // 反転されている（情報開示）
  co.servantInfo = () => done(...hookOfKind("servant").infoHas());
  // 囁かれていた（情報開示。マイクラ版 openCarmenWhisperInfoCoMenu）: 誰に囁かれていたか = カルメン / 調和開拓者（運命が調和の開拓者）。文は「〇〇に囁かれていました。」
  const WHISPER_SRC = [["carmen", "カルメン"], ["harmony", "調和開拓者"]];
  co.whisperInfo = () => set({ step: "whisper" });
  co.pickWhisper = (i) => { const x = WHISPER_SRC[i]; if (x) done(`${x[1]}に囁かれていました。`, null, null, "disclose", `${x[1]}に囁かれていた`); };

  // 役職が変わっていることを伝える（本家 openChangedRoleInfoCoMenu のうち、Web版にある役職の分。文言は本家のまま）
  const CHANGED_LINES = [
    ["eraser_wolf", "抹消に消されていそうです。", "抹消に消された"],   // マイクラ版の並びは先頭が抹消
    ["robber", "怪盗に交換されていそうです。", "怪盗に交換された"],
    ["troublemaker", "いたずらっ子に交換されていそうです。", "いたずらっ子に交換された"],
    ["trailblazer", "愉悦開拓者に交換されていそうです。", "愉悦開拓者に交換された"],   // 運命が愉悦の開拓者（いたずらっ子の能力）に交換された。いたずらっ子と区別して伝える（マイクラ版の並びどおり いたずらっ子の次）
    ["shuffler", "シャッフラーに変えられていそうです。", "シャッフラーに変えられた"],
    ["gremlin", "グレムリンに上書きされていそうです。", "グレムリンに上書きされた"],
    ["silver_wolf", "銀狼にハッキングされていそうです。", "銀狼にハッキングされた"],   // マイクラ版の並びはグレムリン・魔法使いの次（魔法使いはWeb版にない）
  ];
  co.changedInfo = () => set({ step: "chg" });
  // 鍵師のロックで変化役の能力が弾かれた（怪盗・いたずらっ子・墓荒らし・ドッペル・シャッフラー・グレムリン・抹消の人狼）。
  //   「誰を選んで失敗したか」も言える: 墓荒らし(墓地を選ぶだけ)は従来どおり1回で送る / 1人を選ぶ役職は lock1 / 2人を選ぶ役職(いたずらっ子・グレムリン)は lock2 で選ぶ。
  //   文言はCPUの発言(robber.js / troublemaker.js)と同じ形。相手を言わずに失敗とだけ伝えることもできる(co.lockPlain)
  const LOCK_VERB = { robber: "交換", doppel: "コピー", shuffler: "交換", eraser: "抹消", tm: "入れ替え", gremlin: "上書き" };
  co.lockPlain = () => done("役職がロックされていて、能力に失敗しました。", null, null, "disclose", "ロックされて失敗");
  co.lockFailed = function () {
    const s = G().co || {}, kind = s.kind;
    if (kind === "relic" || kind === "cosplay") return co.lockPlain();   // 墓地・山札のカードを選ぶだけで、ロックされるのは自分の役職だけ
    if (kind === "tm" || kind === "gremlin") return set({ step: "lock2", kind, chain: s.chain, sel: [] });
    set({ step: "lock1", kind, chain: s.chain });
  };
  co.lockBack = () => { const s = G().co || {}; startResult(s.kind, s.chain); };   // 選び直す（相手を選ぶ画面に戻る）
  co.lockPick1 = function (id) {
    const s = G().co, who = nameOf(id), v = LOCK_VERB[s.kind] || "変更";
    const text = s.kind === "eraser" ? `${who} を抹消対象にしましたが、役職がロックされていたため抹消できませんでした。` : `${who} を選びましたが、役職がロックされていたため${v}できませんでした。`;
    done(text, null, null, "disclose", `${who} → ロックで失敗`);
  };
  co.lockPick2 = function (id) {
    const s = G().co, sel = s.sel.includes(id) ? s.sel.filter((x) => x !== id) : [...s.sel, id];
    if (sel.length < 2) return set({ ...s, sel });
    const a = nameOf(sel[0]), b = nameOf(sel[1]), v = LOCK_VERB[s.kind] || "変更";
    if (s.kind === "gremlin") return done(`${a} → ${b} を選びましたが、どちらかの役職がロックされていたため${v}できませんでした。`, null, null, "disclose", `${a} → ${b} ロックで失敗`);   // グレムリン: 1人目がコピー元・2人目がコピー先
    done(`${a} と ${b} を選びましたが、どちらかの役職がロックされていたため${v}できませんでした。`, null, null, "disclose", `${a} ⇄ ${b} ロックで失敗`);
  };
  // 封印の狂人に封印されていたことを伝える（情報開示。封印された人のCO）。封印の狂人のCOは役職CO → 結果開示（封印した相手）
  co.sealedInfo = () => done("封印の狂人に封印されていました。", { kind: "sealed", by: "seal_madman" }, null, "disclose", "封印の狂人に封印されていた");   // 2026-11-07: 必ず「封印の狂人に」を付ける（封印通知と同じ）   // 4of4: claim を付けて、CPUの投票判断が真偽を見られるようにする
  co.sealedInfoElf = () => done("エルフリンデに封印されていました。", { kind: "sealed", by: "elfrinde" }, null, "disclose", "エルフリンデに封印されていた");   // エルフリンデに封印されていた（マイクラ版 openSealedInfoCoMenu: どちらに封印されていたかを選ぶ）
  co.sealedMenu = () => set({ step: "sealedby" });
  co.pickChanged = (i) => { const x = CHANGED_LINES[i]; if (x) done(x[1], null, null, "disclose", x[2]); };

  // 情報開示のページは、戻るボタンを上（見出しの横）に置く。下まで押し下げてスクロールしなくても戻れる
  const INFO_BACK = { info: "back", visited: "info", fjob: "info", fwho: "freeterInfo", chg: "info", whisper: "info" };
  const infoBackFn = (step) => ({ back: "ONW.co.back()", info: "ONW.co.info()", freeterInfo: "ONW.co.freeterInfo()" }[INFO_BACK[step]]);

  // ---- 描画 ----
  const LOCKABLE = ["robber", "relic", "cosplay", "tm", "doppel", "shuffler", "gremlin", "eraser"];   // 鍵師のロックで能力が弾かれることがある役職（結果開示の最初の画面に「ロックされて失敗」を出す）
  const lockBtn = (kind) => (LOCKABLE.includes(kind) ? btn("ロックされて失敗", "ONW.co.lockFailed()") : "");
  const btn = (label, fn) => `<button class="btn co-btn" onclick="${fn}">${label}</button>`;
  // deck は [{r, cand}]（古い形式の文字列も受け付ける）。変化先の候補には「(変化候補)」を付ける
  const TEAM_ORDER = { village: 0, wolf: 1, third: 2 };   // COボタンの並び: 村人陣営 → 人狼陣営 → 第三陣営（同じ陣営の中は、基準の並び ONW.ROLE_ORDER=wikiの順。同じ役職どうしはもとの並び）
  const teamRank = (r) => { const t = (ONW.roles.getInfo(r) || {}).team; return t in TEAM_ORDER ? TEAM_ORDER[t] : 3; };
  const deckList = (noCo) => { const base = (G().deck || []).map((x) => (typeof x === "string" ? { r: x } : x)); if (noCo && base.some((x) => x.r === "matthias") && !base.some((x) => x.r === "daughter")) base.push({ r: "daughter" }); if (noCo && (base.some((x) => x.r === "nanoka") || base.some((x) => x.r === "shuffler"))) ["mitsuki_nanoka", "long_night_moon", "rasetsu"].forEach((r) => { if (!base.some((x) => x.r === r)) base.push({ r }); }); return base.filter((x) => x.r !== "merlin" && !(noCo && (x.r === "finger_reader" || x.r === "vanity"))).map((x, i) => ({ x, i })).sort((a, b) => teamRank(a.x.r) - teamRank(b.x.r) || ONW.roleRank(a.x.r) - ONW.roleRank(b.x.r) || a.i - b.i).map((o) => o.x); };   // マーリンはCOボタンに出さない（マーリンCO・マーリンの騙りは禁止）。指読みは役職COボタン(noCo)にだけ出さない（指読みCO禁止）が、占い師などの結果役職の一覧には出す（マイクラ版 availableCoRoles / availableSeerResultRoles）。ヴァニティも役職COボタンにだけ出さない（本人は保安官だと思い込んでいるので、COは保安官でする。マイクラ版 availableCoRoles でヴァニティは保安官に置き換わる。結果役職の一覧には出す）。娘ちゃんは配役に無い内部専用役職だが、マティアスが配役にいるときだけ役職COの一覧に出す（マイクラ版 availableCoRoles と同じ）。なのかの形態3種も配役に無い内部専用役職だが、なのか（またはシャッフラー＝形態になりうる）が配役にいるときだけ役職COの一覧に出す（マイクラ版 availableCoRoles と同じ。実際に形態が出たかでは判断しない＝情報漏れ防止）
  const roleBtns = (fn, extra = "", skip = []) => deckList(fn === "roleCo").filter((x) => !skip.includes(x.r)).map((x) => btn(rc(x.r) + (x.cand ? " (変化候補)" : ""), `ONW.co.${fn}('${x.r}')`)).join("") + extra;

  /** COパネルの高さを、ボタンの上の「見える範囲」に収める（2026-11-07）。
   *  パネルはボタンの上に重ねて上へ伸びる（#co-panel は bottom:100%）。役職の一覧が長い（コスプレイヤーの結果開示など）と、
   *  画面の上・ヘッダー・overflow:hidden の外へはみ出して、上の役職が見切れて押せなかった。
   *  上へ伸びられる高さ（ボタンの上端 − はみ出しを切る親の上端）に max-height を合わせ、中だけスクロールさせる。 */
  function fitPanel() {
    const host = document.getElementById("co-panel"), panel = host && host.querySelector(".co-panel");
    if (!panel) return;
    panel.style.maxHeight = "";
    const dock = host.parentElement; if (!dock) return;
    let top = 0;   // 見える範囲の上端（画面の上。親に overflow を切るものがあれば、その上端）
    for (let n = dock.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const o = getComputedStyle(n);
      if (/(hidden|auto|scroll|clip)/.test(o.overflowY)) { top = Math.max(top, n.getBoundingClientRect().top); }
    }
    const hd = document.querySelector(".onw-header"); if (hd) top = Math.max(top, hd.getBoundingClientRect().bottom);   // ヘッダーの下まで
    const room = Math.floor(dock.getBoundingClientRect().top - top - 8);
    if (room > 120 && panel.getBoundingClientRect().height > room) panel.style.maxHeight = room + "px";
    else if (room <= 120 && room > 0) panel.style.maxHeight = Math.max(room, 80) + "px";
  }
  window.addEventListener("resize", () => { try { fitPanel(); } catch (e) { /* 画面の大きさが変わったとき、開いているパネルだけ合わせ直す */ } });

  co.render = function () {
    const el = document.getElementById("co-panel");
    if (!el) return;
    const s = G().co;
    if (!s) { el.innerHTML = ""; return; }
    const back = btn("戻る", "ONW.co.back()");
    let title = "COボタン", body = "";
    if (s.step === "menu") { const mb = (label, desc, fn) => `<button class="btn co-btn" onclick="${fn}">${label}<span class="co-btn__d">${desc}</span></button>`; body = mb("役職CO", "自分の役職を名乗る", "ONW.co.roleMenu()") + mb("結果開示", "能力の結果を言う", "ONW.co.result()") + mb("情報開示", "自分が受けたことを伝える", "ONW.co.info()") + mb("CO履歴", "みんなのCOを見る", "ONW.co.history()"); }
    else if (s.step === "role") {
      title = "役職CO";
      body = roleBtns("roleCo") + ["village", "wolf", "third"].map((t) => btn(`<span class="t-${t}">${{ village: "村人陣営CO", wolf: "人狼陣営CO", third: "第三陣営CO" }[t]}</span>`, `ONW.co.teamCo('${t}')`)).join("") + back;
    } else if (s.step === "msg") body = `<p class="night-step__hint">${esc(s.msg)}</p>` + back;
    else if (s.step === "target") {
      title = "結果開示";
      body = `<p class="night-step__hint">${s.again ? "続けて開示できます。終わるときは「開示を終わる」を押してください。" : `${(hookOfKind(s.kind) || {}).targetLabel || "奪った相手"}を選んでください。`}</p>` +
        ((hookOfKind(s.kind) || {}).self ? btn("自分", `ONW.co.pickPlayer('${ONW.net.myId()}')`) : "") +   // 自分も選べる結果開示（シャッフラー）
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.pickPlayer('${p.id}')`)).join("") +
        ((hookOfKind(s.kind) || {}).graves ? Array.from({ length: G().graveCount || 0 }, (_, i) => btn(`墓地${i + 1}`, `ONW.co.pickGrave(${i})`)).join("") : "") + lockBtn(s.kind) + (s.again ? btn("開示を終わる", "ONW.co.seerDone()") : "") + back;
    } else if (s.step === "gpick") {
      title = "結果開示";
      body = `<p class="night-step__hint">${s.sel.length + 1}枚目の墓地を選んでください。</p>` +
        Array.from({ length: G().graveCount || 0 }, (_, i) => (s.sel.includes(i) ? "" : btn(`墓地${i + 1}`, `ONW.co.pickGrave(${i})`))).join("") + back;
    } else if (s.step === "gfail") {
      title = "結果開示";
      body = `<p class="night-step__hint">墓地の占いは成功しましたか？</p>` + btn("成功", "ONW.co.graveOk()") + btn("失敗", "ONW.co.graveFail()") + back;   // 気まぐれな占い師の墓地開示だけ、役職の前に成功/失敗を聞く
    } else if (s.step === "prole") {
      title = "結果開示";
      body = `<p class="night-step__hint">${pn(nameOf(s.target))} ${(hookOfKind(s.kind) || {}).roleHint || "の結果役職"}を選んでください。</p>` + (((hookOfKind(s.kind) || {}).optionList) ? hookOfKind(s.kind).optionList().map((o) => btn(`<span class="t-${o.team}">${esc(o.label)}</span>`, `ONW.co.pickRole('${o.id}')`)).join("") + btn("伏せる", "ONW.co.pickRole('hide')") : ((hookOfKind(s.kind) || {}).roleList) ? hookOfKind(s.kind).roleList().map((r) => btn(rc(r), `ONW.co.pickRole('${r}')`)).join("") + btn("伏せる", "ONW.co.pickRole('hide')") : roleBtns("pickRole", btn("伏せる", "ONW.co.pickRole('hide')"))) + (whimClaim() ? btn("失敗", "ONW.co.pickRole('fail')") : "") + candBtns("pickRole") + back;   // roleList: 配役ではなく、その役職固有の一覧から選ぶ結果開示（シャッフラーの山札）。気まぐれな占い師を名乗っているときは「失敗」も選べる
    } else if (s.step === "grole") {
      title = "結果開示";
      body = `<p class="night-step__hint">墓地${s.sel[s.k] + 1} の役職を選んでください。</p>` + roleBtns("graveRole") + candBtns("graveRole") + back;
    } else if (s.step === "rgrave") {
      title = "結果開示";
      body = `<p class="night-step__hint">交換した墓地を選んでください。</p>` + Array.from({ length: G().graveCount || 0 }, (_, i) => btn(`墓地${i + 1}`, `ONW.co.pickRelicGrave(${i})`)).join("") + lockBtn(s.kind) + back;
    } else if (s.step === "rrole") {
      title = "結果開示";
      body = `<p class="night-step__hint">墓地${s.idx + 1} と交換して、新しくなった役職を選んでください。</p>` + roleBtns("relicRole", btn("伏せる", "ONW.co.relicRole('hide')")) + candBtns("relicRole") + back;
    } else if (s.step === "crole") {
      title = "結果開示";
      const hc = hookOfKind("cosplay") || {};
      body = `<p class="night-step__hint">山札から3枚めくって、コスプレした役職を選んでください。</p>` + (hc.roleList ? hc.roleList().map((r) => btn(rc(r), `ONW.co.cosRole('${r}')`)).join("") : "") + btn("コスプレしなかった", "ONW.co.cosNone()") + lockBtn(s.kind) + btn("伏せる", "ONW.co.cosRole('hide')") + back;   // 一覧は配役ではなく山札(ELIGIBLE)の役職
    } else if (s.step === "tfate") {
      title = "結果開示";
      const hf = hookOfKind("trailblazer") || {};
      body = `<p class="night-step__hint">${esc(hf.fateHint || "歩んでいる運命を選んでください。")}（調和ならカルメン、愉悦ならいたずらっ子の結果へ続きます）</p>` +
        (hf.fates ? hf.fates().map((x) => btn(`<span class="t-village">${esc(x.name)}</span>`, `ONW.co.trailFate('${x.fate}')`)).join("") : "") + back;
    } else if (s.step === "mgdark") {
      title = "結果開示";
      body = `<p class="night-step__hint">闇落ちしているかどうかを選んでください。</p>` + btn("闇落ちしていません", "ONW.co.pickMgDark(false)") + btn("闇落ちしています", "ONW.co.pickMgDark(true)") + back;
    } else if (s.step === "hokma") {
      title = "結果開示";
      body = `<p class="night-step__hint">結果を選んでください。</p>` + btn("昼時間を短縮していました", "ONW.co.pickHokma()") + back;
    } else if (s.step === "bellcount") {
      title = "結果開示";
      body = `<p class="night-step__hint">夜に鈴の音が何回聞こえたか選んでください。</p>` + Array.from({ length: 11 }, (_, n) => btn(`${n}回`, `ONW.co.pickBellCount(${n})`)).join("") + back;
    } else if (s.step === "bellday") {
      title = "結果開示";
      body = `<p class="night-step__hint">昼に鈴の音が聞こえたか選んでください。</p>` + btn("鈴の音が聞こえました", "ONW.co.pickBellDay(true)") + btn("鈴の音が聞こえませんでした", "ONW.co.pickBellDay(false)") + btn("回数を選び直す", "ONW.co.bellBack()");
    } else if (s.step === "donut") {
      title = "結果開示";
      body = `<p class="night-step__hint">ドーナツを届けられたか選んでください。</p>` + btn("ドーナツを届けました", "ONW.co.pickDonut(true)") + btn("ドーナツを届けられませんでした", "ONW.co.pickDonut(false)") + back;
    } else if (s.step === "crazydonut") {
      title = "結果開示";
      body = `<p class="night-step__hint">粗悪なドーナツを届けられたか選んでください。</p>` + btn("粗悪なドーナツを届けました", "ONW.co.pickCrazyDonut(true)") + btn("粗悪なドーナツを届けられませんでした", "ONW.co.pickCrazyDonut(false)") + back;
    } else if (s.step === "screw") {
      title = "結果開示";
      body = `<p class="night-step__hint">銀狼がいるか選んでください。</p>` + btn("銀狼がいます", "ONW.co.pickScrew(true)") + btn("銀狼がいません", "ONW.co.pickScrew(false)") + back;
    } else if (s.step === "mp") {
      title = "結果開示";
      body = `<p class="night-step__hint">今の人格を選んでください。</p>` + btn("今の人格は村人です", "ONW.co.pickMp(false)") + btn("今の人格は狂人です", "ONW.co.pickMp(true)") + back;
    } else if (s.step === "counseltgt") {
      title = "結果開示";
      body = `<p class="night-step__hint">更生させようとした相手を選んでください。</p>` +
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.counselTarget('${p.id}')`)).join("") + back;
    } else if (s.step === "counselres") {
      title = "結果開示";
      body = `<p class="night-step__hint">${pn(nameOf(s.target))} の更生は成功しましたか？</p>` + btn("成功した", "ONW.co.pickCounsel(true)") + btn("失敗した", "ONW.co.pickCounsel(false)") + btn("相手を選び直す", "ONW.co.counselBack()");
    } else if (s.step === "psytgt1") {
      title = "結果開示";
      body = `<p class="night-step__hint">検査した1人目を選んでください。</p>` +
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.psyTarget1('${p.id}')`)).join("") + back;
    } else if (s.step === "psytgt2") {
      title = "結果開示";
      body = `<p class="night-step__hint">検査した2人目を選んでください。</p>` +
        (G().others || []).filter((p) => p.id !== s.first).map((p) => btn(pn(p.name), `ONW.co.psyTarget2('${p.id}')`)).join("") + btn("1人目を選び直す", "ONW.co.psyBack1()");
    } else if (s.step === "psyres") {
      title = "結果開示";
      body = `<p class="night-step__hint">${pn(nameOf(s.first))} と ${pn(nameOf(s.second))} の検査結果は適合しましたか？</p>` + btn("適合した", "ONW.co.pickPsy(true)") + btn("適合しなかった", "ONW.co.pickPsy(false)") + btn("2人目を選び直す", "ONW.co.psyBack2()");
    } else if (s.step === "rentgt") {
      title = "結果開示";
      body = `<p class="night-step__hint">調べた相手を選んでください。</p>` +
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.renTarget('${p.id}')`)).join("") + back;
    } else if (s.step === "renres") {
      title = "結果開示";
      body = `<p class="night-step__hint">${pn(nameOf(s.target))} の役職は変わっていましたか？</p>` + btn("変わっていません", "ONW.co.pickRenChanged(false)") + btn("変わっています", "ONW.co.pickRenChanged(true)") + btn("相手を選び直す", "ONW.co.renBack()");
    } else if (s.step === "renmoses") {
      title = "結果開示";
      body = `<p class="night-step__hint">${pn(nameOf(s.target))} はモーゼスでしたか？</p>` + btn("モーゼスだった", "ONW.co.pickRenMoses(true)") + btn("モーゼスではなかった", "ONW.co.pickRenMoses(false)") + btn("伏せる", "ONW.co.pickRenMoses(null)");
    } else if (s.step === "sam") {
      title = "結果開示";
      body = `<p class="night-step__hint">結果を選んでください。</p>` + btn("サムに変身していました", "ONW.co.pickSam()") + back;
    } else if (s.step === "magicrole") {
      title = "結果開示";
      body = `<p class="night-step__hint">奪った役職を選んでください。</p>` + roleBtns("magicRole", btn("伏せる", "ONW.co.magicRole('hide')")) + candBtns("magicRole") + btn("ロックされていて失敗しました", "ONW.co.magicFail()") + back;
    } else if (s.step === "command") {
      title = "結果開示";
      body = `<p class="night-step__hint">結果を選んでください。</p>` + btn("統率の人狼として人狼陣営の配置を確認していました", "ONW.co.pickCommand()") + back;
    } else if (s.step === "agentcmd") {
      title = "結果開示";
      body = `<p class="night-step__hint">受けた指令を選んでください。</p>` + ((hookOfKind("agent") || {}).commands || []).map((c) => btn(c.title, `ONW.co.pickAgentCmd('${c.key}')`)).join("") + back;
    } else if (s.step === "agenttgt") {
      title = "結果開示";
      body = `<p class="night-step__hint">守る対象を選んでください。</p>` +
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.pickAgentTarget('${p.id}')`)).join("") + btn("指令を選び直す", "ONW.co.agentBack()") + back;
    } else if (s.step === "tm") {
      title = "結果開示";
      body = `<p class="night-step__hint">${(hookOfKind(s.kind) || {}).twoHint || "入れ替えた2人を選んでください。"}${s.sel.length ? `（選択中: ${s.sel.map((id) => pn(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + pn(p.name), `ONW.co.pickTm('${p.id}')`)).join("") + (s.sel.length ? "" : lockBtn(s.kind)) + back;
    } else if (s.step === "gcopy") {
      title = "結果開示";
      body = `<p class="night-step__hint">${pn(nameOf(s.sel[0]))} の役職を ${pn(nameOf(s.sel[1]))} にコピーして、コピーした役職を選んでください。</p>` + roleBtns("gremlinRole", btn("伏せる", "ONW.co.gremlinRole('hide')")) + candBtns("gremlinRole") + btn("2人を選び直す", "ONW.co.lockBack()") + back;
    } else if (s.step === "lock1") {
      title = "ロックされて失敗";
      const sf = (hookOfKind(s.kind) || {}).self;   // 自分も選べる結果開示（シャッフラー）
      body = `<p class="night-step__hint">ロックされて失敗したとき、選んでいた相手を選んでください。</p>` +
        (sf ? btn("自分", `ONW.co.lockPick1('${ONW.net.myId()}')`) : "") +
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.lockPick1('${p.id}')`)).join("") +
        btn("相手は言わずに失敗とだけ伝える", "ONW.co.lockPlain()") + btn("戻る", "ONW.co.lockBack()");
    } else if (s.step === "lock2") {
      title = "ロックされて失敗";
      body = `<p class="night-step__hint">${s.kind === "gremlin" ? "ロックされて失敗したとき、選んでいた2人を選んでください（1人目がコピー元・2人目がコピー先）。" : "ロックされて失敗したとき、選んでいた2人を選んでください。"}${s.sel.length ? `（選択中: ${s.sel.map((id) => pn(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + pn(p.name), `ONW.co.lockPick2('${p.id}')`)).join("") +
        btn("相手は言わずに失敗とだけ伝える", "ONW.co.lockPlain()") + btn("戻る", "ONW.co.lockBack()");
    } else if (s.step === "mason") {
      title = "結果開示";
      body = `<p class="night-step__hint">他に共有者がいたら選んでください。いなければそのまま確定します。${s.sel.length ? `（選択中: ${s.sel.map((id) => pn(nameOf(id))).join("、")}）` : ""}</p>` +
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + pn(p.name), `ONW.co.pickMason('${p.id}')`)).join("") +
        btn(s.sel.length ? "この人たちで確定" : "自分だけで確定", "ONW.co.masonDone()") + back;
    } else if (s.step === "poetrole") {
      title = "結果開示";
      body = `<p class="night-step__hint">能力を使われていた役職を選んでください。</p>` + poetRoleList().map((x) => btn(rc(x.r) + (x.cand ? " (変化候補)" : ""), `ONW.co.poetRole('${x.r}')`)).join("") + candBtns("poetRole") + btn("情報がなかった", "ONW.co.poetNone()") + back;
    } else if (s.step === "poettgt") {
      title = "結果開示";
      const two = (hookOfKind("poet") || { twoRoles: [] }).twoRoles.includes(s.role);
      body = `<p class="night-step__hint">${rc(s.role)} の能力を使われていた${two ? "2人" : "対象"}を選んでください。${s.sel.length ? `（選択中: ${s.sel.map((id) => pn(poetName(id))).join("、")}）` : ""}</p>` +
        btn((s.sel.includes(ONW.net.myId()) ? "✓ " : "") + pn(G().myName || "自分"), `ONW.co.poetPick('${ONW.net.myId()}')`) +   // 自分に使われていた結果も言える
        (G().others || []).map((p) => btn((s.sel.includes(p.id) ? "✓ " : "") + pn(p.name), `ONW.co.poetPick('${p.id}')`)).join("") + btn("役職を選び直す", "ONW.co.poetBack()") + back;
    } else if (s.step === "dragonrole") {
      title = "結果開示";
      body = `<p class="night-step__hint">能力を使われていた役職を選んでください。</p>` + dragonRoleList().map((x) => btn(rc(x.r) + (x.cand ? " (変化候補)" : ""), `ONW.co.dragonRole('${x.r}')`)).join("") + candBtns("dragonRole") + back;
    } else if (s.step === "dragontgt") {
      title = "結果開示";
      body = `<p class="night-step__hint">${rc(s.role)} の能力をあなたに使っていた人を選んでください。</p>` +
        (G().others || []).map((p) => btn(pn(p.name), `ONW.co.dragonPick('${p.id}')`)).join("") + btn("役職を選び直す", "ONW.co.dragonBack()") + back;
    } else if (s.step === "love") {
      title = "結果開示";
      body = `<p class="night-step__hint">一目惚れした相手を選んでください。</p>` + (G().others || []).map((p) => btn(pn(p.name), `ONW.co.pickLove('${p.id}')`)).join("") + back;
    } else if (s.step === "info") {
      title = "情報開示";
      body = `<p class="night-step__hint">伝える情報を選んでください。</p>` +
        `<div class="co-sub">自分が受けたこと</div>` + btn("訪問された", "ONW.co.visited()") + btn("フリーターに就職されている", "ONW.co.freeterInfo()") + btn("従者がいる", "ONW.co.servantInfo()") + btn("囁かれていた", "ONW.co.whisperInfo()") + btn("カクテルを渡された", "ONW.co.cocktailInfo()") + btn("ドーナツが届いた", "ONW.co.donutInfo()") + btn("テレパシストに接続された", "ONW.co.telepathistInfo()") +
        `<div class="co-sub">自分の役職への影響</div>` + btn("役職が変わっている", "ONW.co.changedInfo()") + btn("ロックされて失敗した", "ONW.co.lockFailed()") + btn("封印されていた", "ONW.co.sealedMenu()") + btn("反転されている", "ONW.co.reversedInfo()");
    } else if (s.step === "sealedby") {
      title = "封印されていた";
      body = `<p class="night-step__hint">どちらに封印されていましたか？</p>` + btn("封印の狂人に封印されていた", "ONW.co.sealedInfo()") + btn("エルフリンデに封印されていた", "ONW.co.sealedInfoElf()") + back;
    } else if (s.step === "visited") {
      title = "訪問された";
      body = `<p class="night-step__hint">訪問してきた人を選んでください。</p>` + (G().others || []).map((p) => btn(pn(p.name), `ONW.co.pickVisitor('${p.id}')`)).join("");
    } else if (s.step === "fjob") {
      title = "フリーター情報";
      body = `<p class="night-step__hint">誰がフリーターかも伝えますか？</p>` + btn("はい（フリーターも伝える）", "ONW.co.freeterWho()") + btn("いいえ（就職されたことだけ）", "ONW.co.freeterNoName()");
    } else if (s.step === "fwho") {
      title = "フリーター情報";
      body = `<p class="night-step__hint">誰がフリーターですか？</p>` + (G().others || []).map((p) => btn(pn(p.name), `ONW.co.pickFreeter('${p.id}')`)).join("");
    } else if (s.step === "whisper") {
      title = "囁き情報";
      body = `<p class="night-step__hint">誰に囁かれていましたか？</p>` + WHISPER_SRC.map((x, i) => btn(ONW.utils.tintCo(`${x[1]}に囁かれていた`, []), `ONW.co.pickWhisper(${i})`)).join("");
    } else if (s.step === "tpinfo") {
      title = "テレパシー情報";
      body = `<p class="night-step__hint">誰に接続されていましたか？</p>` + (G().others || []).map((p) => btn(pn(p.name), `ONW.co.pickTelepathist('${p.id}')`)).join("") + btn("伏せる", "ONW.co.telepathistNoName()") + back;
    } else if (s.step === "donutinfo") {
      title = "ドーナツ情報";
      body = `<p class="night-step__hint">届いていたドーナツの種類を選んでください。</p>` + btn("ドーナツ", "ONW.co.pickDonutInfo(false)") + btn("粗悪なドーナツ", "ONW.co.pickDonutInfo(true)") + back;
    } else if (s.step === "chg") {
      title = "役職が変わっている";
      body = `<p class="night-step__hint">誰に変えられたと思いますか？（伝える内容を選んでください）</p>` + CHANGED_LINES.map((x, i) => btn(ONW.utils.tintCo(x[2], []), `ONW.co.pickChanged(${i})`)).join("");
    } else if (s.step === "ikind") {
      title = "後覚者";
      body = `<p class="night-step__hint">結果の種類を選んでください。</p>` + btn("自身が後覚者である", "ONW.co.insomKind('self')") + btn("後覚者から変わっていた", "ONW.co.insomKind('changed')") + back;
    } else if (s.step === "iorig") {
      title = "後覚者";
      body = `<p class="night-step__hint">元々の状態を選んでください。</p>` + btn("元々後覚者であった", "ONW.co.insomOrig('same')") + btn("別の役職から後覚者になった", "ONW.co.insomOrig('other')") + back;
    } else if (s.step === "iorole") {
      title = "元々の役職";
      body = `<p class="night-step__hint">元々の役職を選んでください。</p>` + roleBtns("insomOrigRole", "", ["insomniac"]) + candBtns("insomOrigRole") + back;
    } else if (s.step === "ichg") {
      title = "変化後の役職";
      body = `<p class="night-step__hint">変化していた役職を選んでください。</p>` + roleBtns("insomChanged", "", ["insomniac"]) + candBtns("insomChanged") + back;
    } else if (s.step === "candteam") {
      title = s.label || "候補";
      body = `<p class="night-step__hint">${esc(s.note || "")}まず陣営を選んでください。</p>` + btn("村人陣営", "ONW.co.candTeam('village')") + btn("人狼陣営", "ONW.co.candTeam('wolf')") + btn("第三陣営", "ONW.co.candTeam('third')") + btn("戻る", "ONW.co.candBack()");
    } else if (s.step === "candkind") {
      title = s.label || "候補";
      body = `<p class="night-step__hint">人狼系か狂人系を選んでください。</p>` + btn("人狼系", "ONW.co.candKind('wolf')") + btn("狂人系", "ONW.co.candKind('mad')") + btn("陣営を選び直す", "ONW.co.candListBack()");
    } else if (s.step === "candlist") {
      title = s.label || "候補";
      let rs = [...(s.roles || [])];
      if (s.pool === "shuffle" && s.team) {   // シャッフル候補: 選んだ陣営（人狼陣営は人狼系/狂人系）だけに絞った一覧
        rs = rs.filter((r) => (ONW.roles.getInfo(r) || {}).team === s.team);
        if (s.team === "wolf") rs = rs.filter((r) => (s.kind === "mad") === (ONW.MAD_KIND || []).includes(r));
        rs.sort((a, b) => ONW.roleRank(a) - ONW.roleRank(b));
      } else rs.sort((a, b) => teamRank(a) - teamRank(b) || ONW.roleRank(a) - ONW.roleRank(b));
      const rbtn = (r) => `<button class="btn co-btn" data-rname="${esc(rn(r))}" data-team="${(ONW.roles.getInfo(r) || {}).team}" onclick="ONW.co.candPick('${r}')">${rc(r)}</button>`;
      const list = s.pool === "shuffle"
        ? rs.map(rbtn).join("")
        : [["village", "村人陣営"], ["wolf", "人狼陣営"], ["third", "第三陣営"]].map(([t, tn]) => { const gr = rs.filter((r) => (ONW.roles.getInfo(r) || {}).team === t); return gr.length ? `<div class="co-sub" data-teamhead="${t}">${tn}</div>` + gr.map(rbtn).join("") : ""; }).join("");
      body = `<p class="night-step__hint">${esc(s.note || "")}</p>` +
        `<input class="onw-input co-search" type="text" placeholder="役職名で検索" value="${esc(s.query || "")}" oninput="ONW.co.candSearch(this.value)">` +
        `<div id="co-cand-roles" style="display:contents">${list}</div>` +
        (rs.length ? "" : `<p class="night-step__hint">候補となる役職がありません。</p>`) + btn("戻る", "ONW.co.candListBack()");
    } else if (s.step === "history") {
      title = "CO履歴";
      body = `<div class="co-hist">${ONW.ui.coTable()}</div>` + back;
    }
    const isInfo = !!INFO_BACK[s.step];
    const backBtn = isInfo ? `<button class="co-back" type="button" onclick="${infoBackFn(s.step)}">← 戻る</button>` : "";
    el.innerHTML = `<div class="co-panel${isInfo ? " co-panel--info" : ""}"><div class="co-title">${backBtn}<span class="co-title__t">${title}</span><button class="x-close" type="button" aria-label="閉じる" title="閉じる" onclick="ONW.co.close()">✕</button></div><div class="co-grid${isInfo ? " co-grid--2" : ""}">${body}</div></div>`;
    try { fitPanel(); } catch (e) { /* 高さ合わせに失敗してもパネルは出す */ }
  };

  ONW.co = co;
})(window.ONW);
