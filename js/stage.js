/**
 * stage.js — ゲーム中ずっと出ている「カードのテーブル」と、その演出
 * ------------------------------------------------------------
 * #table は #app の外にあるので、画面が再描画されてもカードは作り直されず、
 * 裏返しや入れ替えのアニメが途切れない。ここで扱うもの:
 *   ・山札 / 墓地 / 各プレイヤーのカード（夜〜結果までずっと表示）
 *   ・占い師・怪盗: カードの裏面を選ぶ → 表になる / 実際に入れ替わる
 *   ・投票: カードを押して選び、「投票する」で確定
 *   ・結果: 票数 → つられた人のカードが表に → 全員のカードが表に → 結果発表
 *   ・変化公開: 古びた紙に書かれ、下の固定欄へ移動する
 * 進行ロジックは持たない（表示と操作の受け口だけ）。
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const stage = {};
  const G = () => ONW.game;
  const esc = (s) => ONW.utils.esc(s);
  const $t = () => document.getElementById("table");

  let key = null;                     // 試合が変わったらテーブルを作り直す目印
  let deathMarks = [];                 // 「死亡」の札を付けた席（結果では外す）
  let dayKeys = [];
  let up = {}, dead = {}, badge = {}, glow = {}; // 表向きの役職 / 追放された席 / 票数などの札 / 光らせる札(大狼の目)
  const pickOf = (role) => { const d = ONW.roleDef(role); return d && d.stagePick ? d.stagePick : null; };   // 夜にカードを押して行動する役職の「選び方」(各役職ファイルの stagePick。なければ押して行動しない役職)
  let starKeys = [];                   // スター公開で札を付けた席
  let flashKeys = [];                  // 昼に酔いが覚めたスターを一時的に表にしている席
  let queenKeys = [];                  // 女王公開（待機時間）で札を付けた席
  let kingKeys = [];                   // 人狼王公開で札を付けた席
  let kingFlashKeys = [];              // 昼に新しく人狼王になった人を一時的に表にしている席
  let queenFlashKeys = [];             // 昼に新しく分かった女王を一時的に表にしている席
  let jobKeys = [];                    // 就職先の画面で、フリーターのカードに札を付けた席
  let asn = {};                        // アサシンの演出: by(暗殺者) / aim(狙う) / slash(斬る) / hit(マーリン) / miss(外れ)
  let alm = {};                        // 従者の身代わり: ご主人のカードが「めくれそうになる」席（絶対に表にならない）
  let shin = {};                       // 無理心中で道連れになった席（死因の演出用）
  let gx = {};                         // 神の演出: 席 → "descend"（神降臨）/ "spark"（祝福: 神のキラキラ）/ "blow"（吹き飛ばされる）/ "win"（祝福で勝つ人）
  let catv = {};                       // シュレディンガーの猫: 2回目に裏返ったあとの面（席 → { team: village / wolf / third / none / loop, sfx: "(+役職名)" }）。あれば、猫のカードがその陣営の色の文字になる
  const CAT = "schrodinger_cat";   // シュレディンガーの猫
  const WOLF_MARK = "__wolf";
  const CUPID_MARK = "__cupid";   // キューピッドの演出に出る「💘」の印（役職名は出さない）
  const LOVE_MARK = "__love";   // 恋人の相方に見える「❤️」の印（役職名は出さない）
  const BREAK_MARK = "__break";   // 破局師に見える「💔」の印（壊した恋人のペアのカード。役職名は出さない）
  const KEEP_MARK = "__keep";   // 悪女に見えるキープの「♡」の印（役職名は出さない。恋人ではない）
  const SELF_LOVE = "__selflove";   // 酔いが覚めた恋人本人のカードが「恋人」へめくれた面
  const DUO_MARK = "__duo";     // 人狼の🐺と恋人の❤️の両方が付く人（上に🐺、下に❤️）
  const TARGET_MARK = "__target";   // 処刑人に見えるターゲットの「🎯ターゲット」の印（役職名は出さない）
  const MUTE_MARK = "__mute";   // 口封じの狂人に見える、口封じされた人の「🤐」の印（役職名は出さない）
  const MASTER_MARK = "__master";   // 従者に見えるご主人の「👑ご主人」の印（役職名は出さない）
  let lov = {}, shuf = {};                       // 結果でめくれた恋人のカードに付ける、右上の丸いハート（夜は共有者・神のカードに付ける）
  let loveMate = null;                // 夜: 自分の恋人の相方 { id, mode }
  const UNK_MARK = "__unk";   // アサシンが選んでいる間、めくれた人のカードに出す「？」（役職は見せない）
  let nightKeys = [];                  // 夜の始まりに開いたカード（神・大狼）。夜時間が終わるまで裏に戻さない
  let busy = false;                   // 演出中は操作を受け付けない
  let seq = false;                    // 結果演出を開始済みか
  let specShown = {}, specBusy = false; // 観戦者: 各席に今見せている役職 / 入れ替え演出中
  let timers = [], paperTimers = [];
  const later = (fn, ms) => { const h = setTimeout(fn, ms); timers.push(h); return h; };
  const clearAll = () => { timers.forEach(clearTimeout); timers = []; document.querySelectorAll(".gx-screen").forEach((n) => n.remove()); };
  // 神の祝福: 画面全体に、星形のキラキラが降りそそぐ（結果が終わるまで）
  function gxStars() {
    if (document.querySelector(".gx-screen")) return;
    const box = document.createElement("div"); box.className = "gx-screen";
    const GLY = ["✦", "✧", "✦", "★", "✧", "✶"], COL = ["#fff6c8", "#ffe28a", "#ffffff", "#ffd45e", "#fff0a8"];
    for (let i = 0; i < 70; i++) {
      const s = document.createElement("span"); s.className = "gx-star"; s.textContent = GLY[i % GLY.length];
      s.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;font-size:${10 + Math.random() * 26}px;color:${COL[i % COL.length]};--d:${1.2 + Math.random() * 1.8}s;--r:${Math.random() * 120 - 60}deg;animation-delay:${(Math.random() * 2.4).toFixed(2)}s;`;
      box.appendChild(s);
    }
    document.body.appendChild(box);
  }

  const VISIBLE = () => [ONW.PHASE.ONLINE_NIGHT, ONW.PHASE.ONLINE_MORNING, ONW.PHASE.ONLINE_DAY, ONW.PHASE.ONLINE_VOTE, ONW.PHASE.ONLINE_RESULT];
  const ph = (g) => (g.phase === ONW.PHASE.ONLINE_SPECTATE ? g.specPhase : g.phase);   // 観戦者は本当のフェーズで判断する
  const graveN = (g) => ((g.isSpectator || hostWatching(g)) && g.specInfo ? g.specInfo.center.length : g.graveCount || 0);
  const hostWatching = (g) => !!(g.hostSpec && ONW.net.isHost);

  /** 席の一覧。自分が先頭。観戦のホストは全員、観戦者はCO欄の名簿から */
  function roster(g) {
    if (hostWatching(g)) return (g.others || []).map((p) => ({ id: p.id, name: p.name }));
    if (g.others && !g.isSpectator) return [{ id: ONW.net.myId(), name: g.myName || "あなた", me: true }, ...g.others];
    return (g.boardView || []).map((p) => ({ id: p.id, name: p.name }));
  }
  stage.hasTable = (g) => VISIBLE().includes(ph(g)) && roster(g).length > 0;

  // ---------------------------------------------------------
  // 土台（一度だけ作る）
  // ---------------------------------------------------------
  const seatHtml = (k, label, cls) => `
    <div class="tb-seat ${cls || ""}" data-k="${k}">
      <div class="tb-card"><div class="tb-inner"><div class="tb-back"></div><div class="tb-front"></div></div><div class="tb-drunk"><span class="tb-beer">🍺</span><span class="tb-drunk-n"></span></div><div class="tb-lov">❤</div><div class="tb-shuf">🔀</div></div>
      <div class="tb-name">${label}</div><div class="tb-badge"></div>
    </div>`;
  function build(g, list) {
    const av = (n) => (ONW.account.avatarMap[n] ? ONW.account.avatarHtml(n, null, "av--xs") : "");
    const graves = Array.from({ length: graveN(g) }, (_, i) => seatHtml(`g:${i}`, `墓地${i + 1}`, "tb-grave")).join("");
    const players = list.map((p) => seatHtml(`p:${p.id}`, `${av(p.name)}${esc(p.name)}`, p.me ? "me" : "")).join("");
    const el = $t();
    el.innerHTML = `<div class="tb-table">
      <div class="tb-row tb-center">
        <div class="tb-seat tb-pile"><div class="tb-card"><i></i><i></i><i></i></div><div class="tb-name">山札</div></div>
        ${graves}
      </div>
      <div class="tb-row tb-players">${players}</div>
    </div>`;
    let dtK = null, dtAt = 0;   // デバッグ: ホストが酔っ払い(未覚醒)のカードをダブルタップすると、その人の酔いが即座に覚める
    el.onclick = (e) => {
      const s = e.target.closest(".tb-seat[data-k]"); if (!s) return;
      const k = s.dataset.k, now = Date.now(), g = G();
      if (k.startsWith("p:") && ONW.net.isHost && g.debugOn && g.phase === ONW.PHASE.ONLINE_DAY) {
        if (dtK === k && now - dtAt < 450) { dtK = null; if (ONW.net.debugSober(k.slice(2))) return; } else { dtK = k; dtAt = now; }
      }
      stage.click(k);
    };
  }

  // ---------------------------------------------------------
  // 今の操作モード（夜に選ぶ / 投票で選ぶ / なし）
  // ---------------------------------------------------------
  function mode(g) {
    if (busy || g.isSpectator || g.isDead || hostWatching(g)) return null;
    if (g.phase === ONW.PHASE.ONLINE_NIGHT && !g.nightDone && !!pickOf(g.actRole)) return { type: "night", role: g.actRole };
    if ((g.phase === ONW.PHASE.ONLINE_MORNING || (g.phase === ONW.PHASE.ONLINE_DAY && g.abilityOpen)) && g.morningChain && g.morningChainReady && !g.morningChainDone) return { type: "morning", role: g.morningChain };   // 墓荒らしが交換した後の役職の能力を朝に使う
    if (g.phase === ONW.PHASE.ONLINE_VOTE && g.strawPick) return { type: "straw" };   // わら人形: めくれた瞬間に、道連れにする相手を選ぶ
    if (g.phase === ONW.PHASE.ONLINE_VOTE && !g.voted) return { type: "vote" };
    return null;
  }
  function pickable(k, m, g) {
    if (!m) return false;
    const me = ONW.net.myId(), isP = k.startsWith("p:");
    if (m.type === "straw") return isP && g.strawPick.some((c) => c.id === k.slice(2));   // 選べるのは、まだめくれていない人だけ
    if (isP && dead[k]) return false;   // 死亡した人には投票できない
    const pk = pickOf(m.role);
    if (isP) return (k.slice(2) !== me || !!(pk && pk.self)) && !(pk && pk.players === false);   // シャッフラーだけは自分のカードも選べる(stagePick.self)   // 墓荒らしが選べるのは墓地だけ(stagePick.players === false)
    if (m.type === "vote") return false;
    // 墓地: 占い師・狂った占い師(設定枚数まで) / 墓荒らし(1枚) = stagePick.graves
    return !!(pk && pk.graves);
  }

  // ---------------------------------------------------------
  // 描画の反映（再描画のたびに呼ばれる。DOMは作り直さずクラスだけ更新）
  // ---------------------------------------------------------
  function faceHtml(role) {
    if (role === UNK_MARK) return `<div class="tb-wolfmark tb-unk">？</div>`;
    if (role === BREAK_MARK) return `<div class="tb-wolfmark tb-love tb-break">💔</div>`;
    if (role === LOVE_MARK) return `<div class="tb-wolfmark tb-love">❤️</div>`;
    if (role === CUPID_MARK) return `<div class="tb-wolfmark tb-love">💘</div>`;
    if (role === KEEP_MARK) return `<div class="tb-wolfmark tb-love tb-keep">♡</div>`;
    if (role === SELF_LOVE) return `<div class="tb-wolfmark tb-master tb-love"><span>❤️</span><small>恋人</small></div>`;
    if (role === TARGET_MARK) return `<div class="tb-wolfmark tb-target"><span>🎯</span><small>ターゲット</small></div>`;
    if (role === MUTE_MARK) return `<div class="tb-wolfmark tb-mute"><span>🤐</span><small>口封じ</small></div>`;
    if (role === MASTER_MARK) return `<div class="tb-wolfmark tb-master"><span>👑</span><small>ご主人</small></div>`;
    if (role === DUO_MARK) return `<div class="tb-wolfmark tb-duo"><span>🐺</span><span>❤️</span></div>`;
    if (role === WOLF_MARK) return `<div class="tb-wolfmark">🐺</div>`;   // 狂信者に見える「人狼」の印（役職名は出さない）
    if (String(role).startsWith(CAT + "@")) {   // 2回目に裏返ったシュレディンガーの猫: 陣営の色の文字（第三陣営の役職が参照先なら、灰色のまま「(+役職名)」が付く）
      const [, team, sfx] = String(role).split("@");
      return `${ONW.ui.roleIcon(CAT, "role-icon--face")}<b>${esc(ONW.roles.getInfo(CAT).name)}${sfx ? `<span class="tb-catsfx">${esc(sfx)}</span>` : ""}</b>`;
    }
    const info = ONW.roles.getInfo(role);
    return `${ONW.ui.roleIcon(role, "role-icon--face")}<b>${esc(info.name)}</b>`;
  }
  /** 酔いが覚めるまでの残り秒数（本家の「酔いが覚めるまで: N秒」）。出さない状況なら null。
   *  覚めるのは昼タイマーが半分になった瞬間なので、残り - 半分 で数える。本人の画面だけ・昼の間だけ */
  function drunkLeft(g) {
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.myRole !== "drunk" || g.soberRole || g.isDead || g.isSpectator || hostWatching(g)) return null;
    const day = g.timers && g.timers.day;
    if (g.remain == null || !day) return null;
    const n = g.remain - Math.floor(day / 2);
    return n > 0 ? n : null;
  }
  /** 毎秒のタイマー更新で、自分のカードの数字だけを書き換える（全体の再描画はしない） */
  stage.drunkTick = function () {
    const g = G(), el = $t();
    if (!el) return;
    const s = el.querySelector(`.tb-seat[data-k="p:${ONW.net.myId()}"]`);
    if (!s) return;
    const n = drunkLeft(g);
    s.classList.toggle("drunk", n !== null);
    const t = s.querySelector(".tb-drunk-n");
    if (t) t.textContent = n === null ? "" : String(n);
  };
  function paint(g) {
    const el = $t(), m = mode(g), me = ONW.net.myId();
    const hideOthers = !!(g.strawPick && g.strawKind === "assassin");
    const hold = !hideOthers ? g.asnHold : null;   // アサシンが選び終わったあとも、結果の演出でめくれるまでは、選んでいる間の見た目のまま（裏に戻さない）
    const rec = {};   // アサシンが暗殺先を選ぶまで、自分以外のカード（死亡者を含む）は表にしない（マーリンと見えてしまわないように）
    el.querySelectorAll(".tb-seat[data-k]").forEach((s) => {
      const k = s.dataset.k, isP = k.startsWith("p:");
      // アサシンが選んでいる間: すでにめくれた人（自分を含む）は全員同じ「？」のカードで表に、まだの人は裏のまま（役職もマーリンも見せない）
      const flipped = hideOthers && isP && (g.strawFlipped || []).includes(k.slice(2));
      const mine = hideOthers && isP && k.slice(2) === me;   // 選んでいるアサシン本人のカードだけは、自分の役職で表に見える
      const h = hold && isP ? hold[k] : null;
      let role = mine ? ONW.ROLE.ASSASSIN : hideOthers && isP ? (flipped ? UNK_MARK : undefined) : (up[k] || (h && h.role));
      if (role === CAT && catv[k]) role = `${CAT}@${catv[k].team}${catv[k].sfx ? "@" + catv[k].sfx : ""}`;   // 2回目の面（陣営の色）
      if (hideOthers && isP && role) rec[k] = { role, dead: !!flipped };
      if (role && s.dataset.role !== role) {
        s.dataset.role = role;
        const f = s.querySelector(".tb-front");
        f.innerHTML = faceHtml(role);
        f.className = `tb-front tb-team-${String(role).startsWith(CAT + "@") ? (["village", "wolf"].includes(String(role).split("@")[1]) ? String(role).split("@")[1] : "third") : role === UNK_MARK ? "third" : role === WOLF_MARK || role === DUO_MARK ? "wolf" : role === LOVE_MARK || role === CUPID_MARK || role === KEEP_MARK || role === BREAK_MARK ? "love" : role === TARGET_MARK ? "target" : role === MUTE_MARK ? "mute" : role === MASTER_MARK || role === SELF_LOVE ? "master" : ONW.roles.getInfo(role).team}`;
      }
      const sel = (m && m.type === "vote" && g.voteSel === k.slice(2) && isP) || (m && (m.type === "night" || m.type === "morning") && (isP ? (g.nightSel && g.nightSel.players || []).includes(k.slice(2)) : (g.nightSel && g.nightSel.graves || []).includes(+k.slice(2)))) || (g.voted && g.myVote && k === `p:${g.myVote}`);
      s.classList.toggle("up", !!role);
      s.classList.toggle("pick", pickable(k, m, g));
      s.classList.toggle("sel", !!sel);
      s.classList.toggle("dead", !!dead[k] || flipped || !!(h && h.dead));
      s.classList.toggle("gone", !!(m && m.type === "straw" && g.strawKind !== "assassin" && isP && !g.strawPick.some((c) => c.id === k.slice(2))));   // わら人形の選択中: すでにめくれた人（選べない人）のカードは黒と灰色
      s.classList.toggle("glow", !!glow[k]);
      s.classList.toggle("glow-master", role === MASTER_MARK);   // ご主人のカードは紫に光る
      // 道連れ・暗殺を選んでいる人のカードは、選び終わるまで揺れ続ける（選んでいるアサシン本人の画面では、同時に選んでいる他の人の「？」は揺らさない）
      s.classList.toggle("choosing", !!(isP && (g.strawShake || []).includes(k.slice(2)) && (!hideOthers || k.slice(2) === me)));
      s.classList.toggle("drunk", isP && k.slice(2) === me && drunkLeft(g) !== null);   // 酔っ払い（未覚醒）本人の画面だけ: 自分のカードが黄×白のしまになり、🍺と「酔いが覚めるまで」の秒数が出る
      s.classList.toggle("jobup", jobKeys.includes(k));   // 就職先の画面でめくれたフリーターの青い光と札
      s.classList.toggle("starup", starKeys.includes(k) || flashKeys.includes(k));   // スター公開中の金色の光と札
      s.classList.toggle("kingup", kingKeys.includes(k) || kingFlashKeys.includes(k));   // 人狼王公開中の赤い光と札
      s.classList.toggle("queenup", queenKeys.includes(k) || queenFlashKeys.includes(k));   // 女王公開中の紫の光と札
      s.classList.toggle("shinju", !!shin[k]);
      s.classList.toggle("lov", !!lov[k]); s.classList.toggle("shuf", !!shuf[k]);   // 結果発表: シャッフラーつきのカードの左上に🔀
      { const lv = s.querySelector(".tb-lov"); if (lv) { const t = typeof lov[k] === "number" ? `<span>❤</span><span>${lov[k]}</span>` : "<span>❤</span>"; if (lv.dataset.t !== t) { lv.dataset.t = t; lv.innerHTML = t; } } }   // 結果発表: 丸の中にハートと恋人番号
      s.classList.toggle("almost", !!alm[k]);
      ["descend", "spark", "blow", "win", "chicken", "toughclang", "toughrecv", "kingguard"].forEach((c) => s.classList.toggle("gx-" + c, gx[k] === c));   // 神降臨・神の祝福の演出
      const baseRole = role && String(role).startsWith(CAT + "@") ? CAT : role;
      if (gx[k] === "blow" && baseRole && ONW.roles.getInfo(baseRole)) s.dataset.ghost = ONW.roles.getInfo(baseRole).name; else delete s.dataset.ghost;   // 吹き飛んだあとの点線のカードに書く役職名   // 従者の身代わり: ご主人のカードがめくれそうになって戻る
      ["by", "aim", "slash", "hit", "miss"].forEach((c) => s.classList.toggle("asn-" + c, asn[k] === c));   // アサシンの演出
      const b = s.querySelector(".tb-badge");
      const text = badge[k] || (g.voted && g.myVote && k === `p:${g.myVote}` && g.phase === ONW.PHASE.ONLINE_VOTE ? "投票" : "");
      if (b.textContent !== text) { b.textContent = text; b.classList.toggle("tb-badge--dead", !!dead[k]); }
    });
    if (hideOthers) g.asnHold = rec;
    stage.drunkTick();
  }

  // ---------------------------------------------------------
  // 観戦者: 全員のカードを表にして見せる。夜が明けて役職が入れ替わったら、
  //   いったん伏せる → 空中で入れ替わる → 新しい役職で表になる（表のまま中身が切り替わる「点滅」はしない）
  // ---------------------------------------------------------
  function specWant(g) {
    const w = {};
    g.specInfo.players.forEach((p) => { w[`p:${p.id}`] = p.cur || p.ini; });
    g.specInfo.center.forEach((c, i) => { w[`g:${i}`] = c.cur || c.ini; });
    return w;
  }
  function arcPair(ka, kb) {
    const el = $t(), a = el.querySelector(`[data-k="${ka}"] .tb-card`), b = el.querySelector(`[data-k="${kb}"] .tb-card`);
    if (!a || !b || !a.animate) return;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(), dx = rb.left - ra.left, dy = rb.top - ra.top;
    const path = (x, y, lift) => [
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${x / 2}px,${y / 2 + lift}px) scale(1.2)`, offset: 0.5 },
      { transform: `translate(${x}px,${y}px) scale(1)` },
    ];
    a.style.zIndex = 6; b.style.zIndex = 5;
    const opt = { duration: 1000, easing: "ease-in-out", fill: "forwards" };
    const A = a.animate(path(dx, dy, -22), opt), B = b.animate(path(-dx, -dy, 22), opt);
    later(() => { A.cancel(); B.cancel(); a.style.zIndex = b.style.zIndex = ""; }, 1050);   // 裏面は同じなので、元の席に戻すと入れ替わったまま見える
  }
  function hop(k) {   // 入れ替えが3枚以上にまたがるときの、その席のカードの小さな跳ね
    const c = $t().querySelector(`[data-k="${k}"] .tb-card`);
    if (!c || !c.animate) return;
    c.animate([{ transform: "translateY(0) scale(1)" }, { transform: "translateY(-16px) scale(1.12)", offset: 0.5 }, { transform: "translateY(0) scale(1)" }], { duration: 800, easing: "ease-in-out" });
  }
  function specSync(g) {
    if (specBusy) return;                       // 演出中は触らない（終わってから最新を反映）
    const want = specWant(g);
    const changed = Object.keys(want).filter((k) => specShown[k] && specShown[k] !== want[k]);
    if (!changed.length) { Object.keys(want).forEach((k) => { specShown[k] = want[k]; up[k] = want[k]; }); return; }
    specBusy = true;
    const old = { ...specShown };
    changed.forEach((k) => { delete up[k]; });  // ① 全部伏せる
    const done = new Set(), pairs = [];
    changed.forEach((a) => {                    // 互いに役職を交換した2枚は組にする
      if (done.has(a)) return;
      const b = changed.find((x) => x !== a && !done.has(x) && old[a] === want[x] && old[x] === want[a]);
      if (b) { done.add(a); done.add(b); pairs.push([a, b]); }
    });
    const rest = changed.filter((k) => !done.has(k));
    later(() => { pairs.forEach(([a, b]) => arcPair(a, b)); rest.forEach(hop); }, 850);        // ② 空中で入れ替わる
    const flipAt = 850 + (pairs.length ? 1100 : 0) + (rest.length ? 850 : 0);
    changed.forEach((k, i) => later(() => { const w = G().specInfo ? specWant(G()) : want; up[k] = w[k] || want[k]; paint(G()); }, flipAt + i * 140));   // ③ 新しい役職で表に
    later(() => { specShown = G().specInfo ? specWant(G()) : want; specBusy = false; stage.sync(G()); }, flipAt + changed.length * 140 + 900);
  }

  stage.sync = function (g) {
    const el = $t();
    if (!el) return;
    const list = roster(g);
    if (!VISIBLE().includes(ph(g)) || !list.length) {
      if (key !== null) { clearAll(); key = null; specShown = {}; specBusy = false; g.asnHold = null; up = {}; dead = {}; deathMarks = []; badge = {}; glow = {}; shin = {}; lov = {}; shuf = {}; loveMate = null; asn = {}; alm = {}; gx = {}; catv = {}; starKeys = []; flashKeys = []; queenKeys = []; queenFlashKeys = []; kingKeys = []; kingFlashKeys = []; jobKeys = []; nightKeys = []; busy = false; seq = false; el.innerHTML = ""; }
      el.classList.remove("on");
      return;
    }
    const k = `${g.dealStart || 0}|${list.map((p) => p.id).join(",")}|${graveN(g)}`;
    if (k !== key) { clearAll(); key = k; specShown = {}; specBusy = false; g.asnHold = null; up = {}; dead = {}; deathMarks = []; badge = {}; glow = {}; shin = {}; lov = {}; shuf = {}; loveMate = null; asn = {}; alm = {}; gx = {}; catv = {}; starKeys = []; flashKeys = []; queenKeys = []; queenFlashKeys = []; kingKeys = []; kingFlashKeys = []; jobKeys = []; nightKeys = []; busy = false; seq = false; build(g, list); }
    el.classList.add("on");
    // 観戦者（観戦ONのホスト含む）: 全員のカードを表にして見せる（結果の演出中は除く）
    if ((g.isSpectator || hostWatching(g)) && g.specInfo && g.phase !== ONW.PHASE.ONLINE_RESULT) specSync(g);
    // 昼中に死亡した席には「死亡」の札（結果発表では外す）
    if (g.phase === ONW.PHASE.ONLINE_RESULT) {
      deathMarks.forEach((k) => { delete dead[k]; if (badge[k] === "死亡") delete badge[k]; });
      deathMarks = [];
    } else {
      (g.boardView || []).filter((p) => p.dead).forEach((p) => { const k = `p:${p.id}`; if (!dead[k]) { dead[k] = true; badge[k] = "死亡"; deathMarks.push(k); } });
    }
    paint(g);
    // 朝になったら、夜の選択が実行される演出（占い=表に / 怪盗・墓荒らし=入れ替わって表に / いたずらっ子=入れ替わる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && (g.morningReveal || g.morningInsom) && !g.morningShown && !g.isSpectator) {
      g.morningShown = true; const r = g.morningReveal, ins = g.morningInsom;
      ONW.ui.releaseLogs(g); ONW.ui.holdLogs(g, morningTextDelay(r, ins));   // 演出が終わってから「あなたは〇〇になりました」などの文章を出す
      if (r) later(() => playMorning(r), 700);
      // 墓荒らしが交換した後の役職の能力は、朝の演出が終わってから使える
      if (g.morningChain) later(() => { g.morningChainReady = true; ONW.ui.render(G()); }, (r ? 700 + morningDur(r) : 300) + 300);
      // 後覚者（元々 / 後から）: 夜能力の演出があればその後に、なければ朝になってすぐ、自分のカードが最終役職で表になる
      if (ins) later(() => show(`p:${ONW.net.myId()}`, ins), r ? 700 + morningDur(r) : 300);
    }
    // 朝が終わった直後の待機時間: 後覚者の最終役職がここで表になる
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settleInsom && !g.settleShown && !g.isSpectator) { g.settleShown = true; show(`p:${ONW.net.myId()}`, g.settleInsom); }
    // 朝が終わった直後の待機時間の公開演出(スター・女王・フリーター・訪問者): 各役職ファイルの stageSettle(order 順)。g[field] が届いていたら、1回だけ run を呼ぶ
    //   スター: 最終盤面でスターを持っている人のカードが全員の画面で同時に表になる / 女王: 女王を知らされる人の画面で女王のカードが表になる
    //   フリーター: 就職先本人の画面で就職してきたフリーターのカードが表になる / 訪問者: 訪問された本人の画面で訪問者のカードが表になる（いずれも昼になったら札を外して伏せる）
    if (g.phase === ONW.PHASE.ONLINE_MORNING && g.settling && !g.isSpectator && !hostWatching(g)) {
      ONW.roleHooksIn("stageSettle", "run").forEach((h) => { const o = h.def.stageSettle; if (g[o.field] && g[o.field].length && !g[o.shown]) { g[o.shown] = true; h.fn(g[o.field], stage.kit); } });
    }
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && jobKeys.length) { jobKeys.forEach((k) => { delete badge[k]; }); jobKeys = []; paint(G()); }
    // 昼に酔いが覚めた本人: 自分のカードが、変化前の役職を経由せず、最終的な役職として直接めくれる（しばらくして裏に戻る）
    if (g.soberFlash) {
      const role = g.soberFlash; g.soberFlash = null;
      if (!g.isSpectator && !hostWatching(g)) {
        const k = `p:${ONW.net.myId()}`;
        const sl = !!(g.soberPeek && g.soberPeek.love);   // 酔い覚め＋恋人: 最終役職がめくれたあと、「恋人」にめくれる（相方のハートも同じタイミング）
        later(() => { up[k] = role; paint(G()); }, 300);
        if (sl) {
          later(() => { delete up[k]; paint(G()); }, 1900);              // 役職の面をいったん裏返してから…
          later(() => { up[k] = SELF_LOVE; paint(G()); }, 2700);         // …「恋人」の面でもう一度めくる（相方のハートも同じタイミング）
          later(() => { delete up[k]; paint(G()); }, 5600);
        } else later(() => { delete up[k]; paint(G()); }, 4300);
      }
    }
    // 昼の公開演出(フリーター・スター・女王): 各役職ファイルの stageFlash。g[field] が届いていたら、受け取って run を呼ぶ（観戦者には出さない）。when:"early" は酔い覚めの演出より先、それ以外はあと
    const flashes = (when) => ONW.roleHooksIn("stageFlash", "run").filter((h) => (h.def.stageFlash.when || "late") === when).forEach((h) => {
      const f = h.def.stageFlash.field;
      if (g[f] && g[f].length) { const ids = g[f]; g[f] = []; if (!g.isSpectator && !hostWatching(g)) h.fn(ids, stage.kit); } else if (g[f]) g[f] = [];
    });
    flashes("early");
    // 昼に酔いが覚めた本人: 夜と同じように、見える人のカード（人狼なら🐺・共有者・墓地・神は全員）がめくれ、しばらくして裏に戻る
    if (g.soberPeek) {
      const sp = g.soberPeek; g.soberPeek = null;
      if (!g.isSpectator && !hostWatching(g)) {
        const list = [];
        const fx = [];   // めくれ方を足すフック { up(k, role), down(k) }（役職ファイルの stageSober が足す。女王の札など）
        (sp.wolves || []).forEach((id) => list.push([`p:${id}`, WOLF_MARK, true]));
        ONW.roleHooksIn("stageSober", "list").forEach((h) => h.fn(sp, list, stage.kit, fx));   // 共有者 / 処刑人のターゲット / 従者のご主人 / 女王 のカード（この順にめくれる）
        let mateK = null, mateWolf = false;
        if (sp.love) {   // 酔いが覚めた恋人: 自分が「恋人」にめくれるのと同時に、相方のカードがハートでめくれる（人狼の🐺と重なるときは🐺と❤️）
          mateK = `p:${sp.love}`; mateWolf = list.some((x) => x[0] === mateK && x[1] === WOLF_MARK);
        }
        (sp.graves || []).forEach((c, i) => list.push([`g:${i}`, c, true]));
        ONW.roleHooksIn("stageSober", "listLate").forEach((h) => h.fn(sp, list, stage.kit, fx));   // 神: 全員と墓地のカード
        const me = `p:${ONW.net.myId()}`;
        list.forEach(([k, role], i) => later(() => { if (k === me) return; up[k] = role; glow[k] = true; fx.forEach((f) => f.up && f.up(k, role)); paint(G()); }, 300 + i * 380));
        if (mateK && mateK !== me) {
          const inList = list.some((x) => x[0] === mateK);
          if (inList) later(() => { delete up[mateK]; paint(G()); }, 1900);   // すでに開いている相方（🐺など）もいったん裏返す
          later(() => { if (mateWolf) up[mateK] = DUO_MARK; else if (inList) { up[mateK] = list.find((x) => x[0] === mateK)[1]; lov[mateK] = true; } else up[mateK] = LOVE_MARK; glow[mateK] = true; paint(G()); }, 2700);
          later(() => { delete up[mateK]; delete glow[mateK]; delete lov[mateK]; paint(G()); }, 5600);
        }
        later(() => { list.forEach(([k]) => { if (k === me || k === mateK) return; delete up[k]; delete glow[k]; delete lov[k]; fx.forEach((f) => f.down && f.down(k)); }); paint(G()); }, 300 + list.length * 380 + 3500);
      }
    }
    flashes("late");   // 昼に酔いが覚めたスター / 昼に新しく女王が分かった村人陣営の人: カードがめくれ、しばらくして裏に戻る
    if (g.phase !== ONW.PHASE.ONLINE_MORNING) ONW.roleHooksIn("stageSettle", "end").forEach((h) => h.fn(stage.kit));   // 昼になったら、待機時間の札を外す（カードは下の行で伏せる）
    if (g.phase !== ONW.PHASE.ONLINE_MORNING && g.morningUp && g.morningUp.length) { g.morningUp.forEach((k) => { delete up[k]; delete glow[k]; }); g.morningUp = []; paint(G()); }   // 占い結果などは朝時間の間ずっと表のまま。昼になったら伏せる
    if (g.phase !== ONW.PHASE.ONLINE_NIGHT && nightKeys.length) { nightKeys.forEach((k) => { delete up[k]; delete glow[k]; delete lov[k]; }); nightKeys = []; loveMate = null; paint(G()); }   // 神・大狼のカードは夜時間が終わったら伏せる   // 昼になったら伏せる
    if (g.loveReveal && g.phase === ONW.PHASE.ONLINE_NIGHT) { const r = g.loveReveal; g.loveReveal = null; loveMate = r; if (r.mode === "solo") later(() => lovePeek(r), 700); }   // 恋人: 夜の始まりに相方のカードが❤️でめくれる（人狼の🐺・共有者・神と重なるときは、それぞれの演出の中で出す）
    // 夜の始まりの演出(従者・神・狂信者・共有者・大狼): 各役職ファイルの stageNight(order 順)。g.<field> が届いていたら、受け取って 700ms 後に開く
    if (g.phase === ONW.PHASE.ONLINE_NIGHT) ONW.roleHooks("stageNight").forEach((h) => { const f = h.def.stageNight.field; if (g[f]) { const r = g[f]; g[f] = null; later(() => h.fn(r, stage.kit), 700); } });
    if (g.phase === ONW.PHASE.ONLINE_RESULT && g.result && g.resultStage !== "sheet" && !seq) startResult(g);
  };

  // ---------------------------------------------------------
  // カードを押したとき
  // ---------------------------------------------------------
  stage.click = function (k) {
    const g = G();
    if ((g.isSpectator || hostWatching(g)) && g.specInfo && ONW.ui.showRoleHistory) { ONW.ui.showRoleHistory(k); return; }   // 観戦: カードを押すと、その役職の変化がわかる
    const m = mode(g);
    if (!pickable(k, m, g)) return;
    const id = k.slice(2);
    if (m.type === "straw") { ONW.net.strawPick(id); ONW.stage.sync(g); ONW.ui.render(g); return; }
    if (m.type === "night" || m.type === "morning") {
      // 夜: 朝になるまで何度でも選び直せる（同じカードをもう一度押すと解除）。朝: 選んで「能力を使う」で確定
      const sel = g.nightSel = g.nightSel || { players: [], graves: [] }, isP = k.startsWith("p:"), pk = pickOf(m.role);
      const toggle = (arr, v, max) => { const at = arr.indexOf(v); if (at >= 0) arr.splice(at, 1); else { if (arr.length >= max) arr.shift(); arr.push(v); } };
      if (isP) {
        const max = (pk && pk.players) || 1;     // いたずらっ子・グレムリンは2人(stagePick.players)
        toggle(sel.players, id, max);
        if (pk && pk.exclusive) sel.graves = [];     // 墓地とプレイヤーは同時に占えない(占い師・狂った占い師)
      } else {
        const max = pk && pk.graveMax ? pk.graveMax(g) : 1;
        if (max <= 0) return;
        toggle(sel.graves, +id, max);
        sel.players = [];
      }
      if (m.type === "night") ONW.net.setSel(sel);
      ONW.ui.render(g);
    } else {
      g.voteSel = g.voteSel === id ? null : id;     // 同じ人をもう一度押すと未投票に戻る
      ONW.net.vote(g.voteSel);                      // 変えるたびにホストへ送る（確定はタイマー終了時）
      ONW.ui.render(g);
    }
  };
  // ---------------------------------------------------------
  // 朝: 夜の選択が実行され、入れ替わる演出 → 自分のカードが表に（昼になるまで見える）
  // ---------------------------------------------------------
  /** 朝・昼に使った能力の演出(playMorning)が終わって、結果の文章を出してよくなるまでの時間(ms) */
  stage.ackDelay = function (r) { return r ? Math.max(0, morningTextDelay(r, null) - 700) : 0; };
  stage.onAck = function (d) {      // 朝に使った能力は、結果が返った瞬間に演出する
    busy = false;
    if (d.chain && G().phase === ONW.PHASE.ONLINE_MORNING) {   // 朝: 取った役職の能力へ続く。交換・コピーの演出が終わってから使えるようにする
      later(() => { const g = G(); if (g.morningChain === d.chain && !g.morningChainDone) { g.morningChainReady = true; ONW.ui.render(g); } }, (d.reveal ? morningDur(d.reveal) : 0) + 500);
    }
    if (d.reveal) {
      playMorning(d.reveal);
      if (G().phase === ONW.PHASE.ONLINE_DAY) {
        const r = d.reveal;
        later(() => { dayKeys.forEach((k) => { delete up[k]; delete glow[k]; }); dayKeys = []; paint(G()); }, morningDur(r) + (r.items ? 0 : 0) + 3500);
      }
    }
  };
  function show(k, role, lit) {
    const g = G();
    up[k] = role; if (lit) glow[k] = true;
    if (g.phase === ONW.PHASE.ONLINE_DAY) dayKeys.push(k); else (g.morningUp = g.morningUp || []).push(k);   // 昼に使った能力: 朝のように出しっぱなしにせず、数秒後に閉じる
    paint(g);
  }
  const morningHook = (kind) => { for (const id of ONW.roleIds()) { const d = ONW.roleDef(id); if (d && d.stageMorning && d.stageMorning.kind === kind) return d.stageMorning; } return null; };   // 朝の演出を持つ役職(各役職ファイルの stageMorning)
  function morningDur(r) {   // 朝の演出（playMorning）が終わるまでのおおよその時間(ms)
    if (r.kind === "peek") return (r.items.length - 1) * 450 + 1000;
    const h = morningHook(r.kind);
    return h ? h.dur(r) : 1000;
  }
  /** 朝の演出(playMorning と 後覚者の表)が終わって、結果の文章を出してよくなるまでの時間(ms) */
  function morningTextDelay(r, ins) {
    let end = 0;
    if (r) {
      const d = 700 + morningDur(r);
      end = d;
      if (r.muzzle) end = Math.max(end, d + 700 + 700);
      if (r.mates) end = Math.max(end, d + 200 + r.mates.ids.length * 380 + 500);
      if (r.peek) end = Math.max(end, d + 200 + r.peek.length * (r.gap || 340) + 500);
    }
    if (ins) end = Math.max(end, (r ? 700 + morningDur(r) : 300) + 700);
    return end + 500;   // めくれ終わって少し間をあけてから
  }
  function playMorning(r) {
    if (r.kind === "peek") r.items.forEach((it, i) => later(() => show(it.k, it.role), i * 450));
    else { const h = morningHook(r.kind); if (h) h.play(r, stage.kit); }
    // 墓荒らしで人狼系・狂信者・共有者を取ったとき: 交換の演出のあと、相方のカードが表になる（昼になるまで）
    // 墓荒らし・ドッペルゲンガーで口封じの狂人を手にしたとき: 交換・コピーの演出のあと（取ったと分かったあと）、ターゲットのカードが裏返ってミュートマークが出る（昼になるまで）
    if (r.muzzle) later(() => show(`p:${r.muzzle}`, MUTE_MARK, true), morningDur(r) + 700);
    if (r.mates) later(() => r.mates.ids.forEach((id, i) => later(() => show(`p:${id}`, r.mates.role), i * 380)), morningDur(r) + 200);
    // 墓荒らしで神・人狼系を取ったとき（見える系の共通形）: 交換のあと、夜の始まりに見えるはずの初期役職のカードが順に表になって光る（昼になるまで）
    if (r.peek) later(() => r.peek.forEach((it, i) => later(() => show(it.k, it.role, true), i * (r.gap || 340))), morningDur(r) + 200);
  }
  function swap(r, temp) {
    const mine = `p:${ONW.net.myId()}`, theirs = r.kind === "relic" ? `g:${r.target}` : `p:${r.target}`, el = $t();
    const a = el.querySelector(`[data-k="${mine}"] .tb-card`), b = el.querySelector(`[data-k="${theirs}"] .tb-card`);
    const reveal = () => {
      if (!temp) { show(mine, r.role); if (r.both) show(theirs, r.both.role); return; }   // 朝: 自分のカード（と、both のときは入れ替わった墓地のカードも同時に）表にする。temp は夜: 数秒だけ表にして伏せる
      up[mine] = r.role; paint(G());
      later(() => { delete up[mine]; paint(G()); }, 3000);
      later(() => { busy = false; paint(G()); }, 3700);
    };
    if (!a || !b || !a.animate) { reveal(); return; }
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    const dx = rb.left - ra.left, dy = rb.top - ra.top;
    const path = (x, y, lift) => [
      { transform: "translate(0,0) scale(1)" },
      { transform: `translate(${x / 2}px,${y / 2 + lift}px) scale(1.2)`, offset: 0.5 },
      { transform: `translate(${x}px,${y}px) scale(1)` },
    ];
    a.style.zIndex = 6; b.style.zIndex = 5;
    const opt = { duration: 1000, easing: "ease-in-out", fill: "forwards" };
    const A = a.animate(path(dx, dy, -22), opt), B = b.animate(path(-dx, -dy, 22), opt);
    later(() => {                                   // 裏面は同じなので、元の席に戻すと入れ替わったまま見える
      A.cancel(); B.cancel(); a.style.zIndex = b.style.zIndex = "";
      reveal();                                     // 新しい自分のカードが表に
    }, 1050);
  }

  // ---------------------------------------------------------
  // 役職ファイルの演出(stageNight / stageMorning)に渡す道具。up / glow などは試合ごとに作り直されるので、getter で「今の値」を返す
  // ---------------------------------------------------------
  stage.kit = {
    get up() { return up; }, get glow() { return glow; }, get lov() { return lov; },
    get loveMate() { return loveMate; }, get nightKeys() { return nightKeys; },
    // 結果発表・昼の公開演出(stageResult / stageSettle / stageFlash / stageSober)用
    get dead() { return dead; }, get badge() { return badge; }, get shin() { return shin; }, get gx() { return gx; },
    get asn() { return asn; }, get alm() { return alm; }, get catv() { return catv; },
    get starKeys() { return starKeys; }, get queenKeys() { return queenKeys; }, get flashKeys() { return flashKeys; }, get queenFlashKeys() { return queenFlashKeys; }, get kingKeys() { return kingKeys; }, get kingFlashKeys() { return kingFlashKeys; },
    WOLF_MARK, DUO_MARK, MASTER_MARK, TARGET_MARK, MUTE_MARK, LOVE_MARK, CUPID_MARK, BREAK_MARK, KEEP_MARK,
    later, paint, show, swap, G, $t, esc, setCap, gxStars, face: faceHtml,
    /** 札を付けた席の一覧(starKeys など)から、席 k を取り除く(その場で書き換える) */
    pull(arr, k) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] === k) arr.splice(i, 1); },
  };

  // ---- 恋人: 夜の始まりに相方のカードが❤️でめくれる → 夜時間の間ずっと開いたまま ----
  function lovePeek(r) {
    const k = `p:${r.id}`;
    if (G().phase !== ONW.PHASE.ONLINE_NIGHT) return;
    up[k] = LOVE_MARK; glow[k] = true; if (!nightKeys.includes(k)) nightKeys.push(k); paint(G());
  }

  // ---------------------------------------------------------
  // 結果: 票数 → つられた人が表に → 全員が表に → 結果発表
  // ---------------------------------------------------------
  function setCap(html) {
    const g = G(); g.resultCap = html;
    const c = document.getElementById("res-cap");
    if (c) { c.innerHTML = html; c.classList.remove("res-pop"); void c.offsetWidth; c.classList.add("res-pop"); }
  }
  function winHtml(res) {
    const team = res.title.startsWith("村人") ? "village" : res.title.startsWith("人狼") ? "wolf" : res.title.startsWith("恋人") ? "lover" : "third";
    return `<div class="rs-win t-${team}">${esc(res.title)}</div>`;
  }
  /** 結果発表の骨組み。役職ごとの演出は各役職ファイルの stageResult(下の hk(...) で呼ぶ)。R.t = 演出の現在時刻(ms)で、フックが進める */
  function startResult(g) {
    seq = true;
    const res = g.result, P = (id) => `p:${id}`;
    const order = res.chainOrder || [];
    const HK = {}, hk = (key) => HK[key] || (HK[key] = ONW.roleHooksIn("stageResult", key));
    const skipIds = new Set(); hk("execExclude").forEach((h) => (h.fn(res) || []).forEach((id) => skipIds.add(id)));   // 通常の追放フリップから除く人（身代わりになった従者: 二重にめくらない）
    const exec = res.history.filter((h) => h.dead && h.cause !== "chain" && !skipIds.has(h.id));
    const chain = res.history.filter((h) => h.cause === "chain" && h.kind !== "queen" && !h.late).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    const lateDeaths = res.history.filter((h) => h.cause === "chain" && h.kind !== "queen" && h.late).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));   // 王国滅亡のあとで死んだ人（心中など）
    const kingdom = res.history.filter((h) => h.cause === "chain" && h.kind === "queen");   // 王国滅亡: 女王が倒れて、一斉にめくれる村人陣営
    const loverNo = {}; res.history.forEach((h) => { if (h.lover) loverNo[h.id] = h.loverNo || true; });
    const shufNo = {}; res.history.forEach((h) => { if (h.shuf) shufNo[h.id] = true; });
    const lovOn = (id) => { if (loverNo[id]) lov[P(id)] = loverNo[id]; if (shufNo[id]) shuf[P(id)] = true; };   // 結果でめくれる恋人のカードは、右上に丸いハート
    const rest = [...res.history.filter((h) => !h.dead).map((h) => [P(h.id), h.role, h.id]), ...res.grave.map((c, i) => [`g:${i}`, c.role])];
    // 役職ファイルに渡す道具箱(stage.kit に、この結果の情報を足したもの)
    //   t = 演出の現在時刻 / subN = 身代わりの数 / noFlip = ほかの演出が重なるので2回目の裏返しをしない席(flipped フックが書く) / restEnd = 全員めくれ終わる時刻 / noBlow = 負けた人のカードを吹き飛ばさない
    const R = Object.create(stage.kit);
    Object.assign(R, { g, res, P, exec, chain, lateDeaths, kingdom, rest, lovOn, t: 600, subN: 0, guardN: 0, noFlip: new Set(), restEnd: 0, noBlow: false });
    const flipped = (hs, at, kind) => { R.noFlip = new Set(); return hk("flipped").reduce((n, h) => n + (h.fn(R, hs, at, kind) || 0), 0); };   // 追放・道連れでめくれた人に重なる演出(処刑人のギロチン・猫の裏返し)。返り値 = 足す待ち時間
    setCap(`<div class="res-cap__t">投票の結果</div>`);
    res.counts.forEach((c, i) => later(() => { badge[P(c.id)] = `${c.c}票`; paint(G()); }, R.t + i * 350));
    R.t += res.counts.length * 350 + 1000;
    hk("intro").forEach((h) => h.fn(R));   // 従者の身代わり: ご主人のカードがめくれそうになる → 従者のカードが表になる
    later(() => {
      if ((R.subN || R.guardN) && !exec.length) return;   // 追放されたのが身代わりの従者だけなら、字幕はそのまま（「誰も追放されませんでした」にしない）
      exec.forEach((h) => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); dead[P(h.id)] = true; badge[P(h.id)] = h.mental ? "メンタル崩壊" : h.shock ? "ショック死" : h.execTg ? "処刑" : h.bounce ? "とばっちり" : "追放"; });
      const execN = exec.filter((h) => !h.mental && !h.shock), mentalN = exec.filter((h) => h.mental), shockN = exec.filter((h) => h.shock);
      setCap(exec.length ? `${execN.length ? `<div class="res-cap__t t-wolf">追放</div><div>${execN.map((h) => esc(h.name)).join("、")}</div>` : ""}${mentalN.length ? `<div class="res-cap__t t-wolf">メンタル崩壊</div><div>${mentalN.map((h) => esc(h.name)).join("、")}</div>` : ""}${shockN.length ? `<div class="res-cap__t t-wolf">ショック死</div><div>${shockN.map((h) => esc(h.name)).join("、")}</div>` : ""}` : `<div class="res-cap__t">誰も追放されませんでした</div>`);
      paint(G());
    }, R.t);
    const exFx = flipped(exec, R.t, "exec");
    R.t += (exec.length ? 3200 : R.subN || R.guardN ? 300 : 1500) + exFx;
    // 一目惚れしてるてるが先にめくれ、そのあとで道連れにされた人が1人ずつ無理心中でめくれる
    // わら人形・猫又・黒猫・ネコカボチャが追放された場合も同じ演出で、めくれた順(連鎖の順)に1人ずつ「道連れ」でめくれる
    const flipChain = (h) => {
      const lab = h.sub ? "身代わり" : h.kind === "tomo" ? "道連れ" : h.kind === "lovers" ? "心中" : h.kind === "follow" ? "後追い" : "無理心中";
      later(() => {
        setCap(`<div class="res-cap__t t-wolf">${lab}</div><div>${h.sub ? `${esc(h.by)} → ${esc(h.sub)} の身代わり: ` : (h.kind === "tomo" || h.kind === "follow") && h.by ? `${esc(h.by)} → ` : h.kind === "lovers" && h.by ? `${esc(h.by)} ❤ ` : ""}${esc(h.name)}</div>`);
        shin[P(h.id)] = true; dead[P(h.id)] = true; badge[P(h.id)] = lab; paint(G());
      }, R.t);
      later(() => { hk("flipUp").forEach((x) => x.fn(R, h)); up[P(h.id)] = h.role; lovOn(h.id); paint(G()); }, R.t + 1300);   // 演出のあとでカードが表に（神の祝福なら、めくれたときからキラキラ）
      const fx = flipped([h], R.t + 1300, "chain");   // 道連れ・心中で死んだターゲット(処刑人)・めくれた猫も、追放された人と同じ扱い
      R.t += 3400 + fx;
    };
    chain.forEach(flipChain);
    hk("kingdom").forEach((h) => h.fn(R));   // 王国滅亡: 女王が追放・道連れで倒れたあと、他の村人陣営のカードが全員同時にめくれる
    lateDeaths.forEach(flipChain);   // 王国滅亡で倒れた人の相方など、王国滅亡のあとで死んだ人（心中）
    hk("assassin").forEach((h) => h.fn(R));   // アサシン: 暗殺者のカードが光り、狙われた相手に照準 → 斬撃 → カードが表になってマーリンかどうかが分かる
    later(() => setCap(`<div class="res-cap__t">結果発表</div>`), R.t);
    rest.forEach(([k, r, hid], i) => later(() => {
      up[k] = r; if (hid) lovOn(hid);
      hk("restUp").forEach((x) => x.fn(R, k, hid));   // 生存している神がめくれると、ファーンと神が降臨する
      paint(G());
    }, R.t + 500 + i * 320));
    R.restEnd = R.t + 500 + rest.length * 320 + 700;
    hk("rest").forEach((h) => h.fn(R));   // めくられずに残っていた猫（追放されなかった猫）も、1票以上入っていれば、めくれたあとにもう一度裏返る
    R.t = R.restEnd;
    hk("afterRest").forEach((h) => h.fn(R));   // 神降臨の余韻 / 神の祝福（全員めくれたあと、負けた人が吹き飛ばされ、残りの人が祝福で勝つ）
    hk("reverse").forEach((h) => h.fn(R));   // チキンの逆転演出: 逆転前の勝敗を先に発表 → チキンが飛び出して覆す
    later(() => setCap(winHtml(res)), R.t);
    const losersN = R.noBlow ? [] : res.history.filter((h) => !h.win);   // 神の祝福以外: 結果の字幕のあと、負けた人のカードが吹き飛ぶ
    if (losersN.length) later(() => { losersN.forEach((h) => { gx[P(h.id)] = "blow"; }); paint(G()); }, R.t + 1300);
    later(toSheet, R.t + (losersN.length ? 3800 : 2800));
  }
  function toSheet() {
    const g = G(); clearAll(); g.asnHold = null;
    g.resultStage = "sheet";
    ONW.ui.render(g);
  }
  stage.skipResult = function () {
    const g = G(), res = g.result;
    if (!res) return;
    const hk = (key) => ONW.roleHooksIn("stageResult", key);
    clearAll(); alm = {}; hk("clear").forEach((h) => h.fn(stage.kit));   // 身代わりの「めくれそう」演出・処刑人の演出も止める
    const skipIds = new Set(); hk("execExclude").forEach((h) => (h.fn(res) || []).forEach((id) => skipIds.add(id)));
    res.history.forEach((h) => { up[`p:${h.id}`] = h.role; if (h.lover) lov[`p:${h.id}`] = h.loverNo || true; if (h.shuf) shuf[`p:${h.id}`] = true; if (h.dead) { dead[`p:${h.id}`] = true; badge[`p:${h.id}`] = skipIds.has(h.id) || h.sub ? "身代わり" : h.cause === "chain" ? (h.kind === "tomo" ? "道連れ" : h.kind === "lovers" ? "心中" : h.kind === "queen" ? "王国滅亡" : h.kind === "follow" ? "後追い" : "無理心中") : h.mental ? "メンタル崩壊" : h.shock ? "ショック死" : h.execTg ? "処刑" : h.bounce ? "とばっちり" : "追放"; if (h.cause === "chain") shin[`p:${h.id}`] = true; } });
    res.grave.forEach((c, i) => { up[`g:${i}`] = c.role; });
    const R = Object.create(stage.kit); R.res = res;
    hk("skip").forEach((h) => h.fn(R));   // 猫(2回目の面)・神の祝福・処刑人のターゲット(割れた状態)・アサシンに選ばれた人 を、演出なしの最終形で見せる
    res.counts.forEach((c) => { if (!badge[`p:${c.id}`]) badge[`p:${c.id}`] = `${c.c}票`; });
    toSheet();
  };

  // ---------------------------------------------------------
  // 変化公開: 画面いっぱいの古びた紙に書かれ、下の固定欄へ移動する
  // ---------------------------------------------------------
  function finishPaper(wrap) {
    paperTimers.forEach(clearTimeout); paperTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
    const g = G(); g.tfIntro = false;
    ONW.ui.updateBoard();
    runNews();   // 新聞配達員がいれば、変化公開の紙のあとに新聞の紙が出る
    runMapo();   // 麻婆豆腐の演出は新聞のあと（新聞が出ているときはまだ待つ）
  }
  function fly(wrap) {
    if (wrap.dataset.flying) return;
    wrap.dataset.flying = "1";
    paperTimers.forEach(clearTimeout); paperTimers = [];
    const paper = wrap.querySelector(".tfp-paper"), tgt = document.querySelector("#co-board .cb-tf");
    if (!tgt) { finishPaper(wrap); return; }
    const pr = paper.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
    const s = Math.min(tr.width / pr.width, tr.height / pr.height, 1);
    const dx = tr.left + tr.width / 2 - (pr.left + pr.width / 2), dy = tr.top + tr.height / 2 - (pr.top + pr.height / 2);
    wrap.querySelector(".tfp-dim").style.opacity = "0";
    paper.style.transition = "transform .95s cubic-bezier(.55,0,.25,1), opacity .35s ease .65s";
    paper.style.transform = `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`;
    paper.style.opacity = "0";
    paperTimers.push(setTimeout(() => finishPaper(wrap), 1050));
  }
  /** 変化公開の文字を、改行されない範囲で一番大きくする（画面の幅が変わっても合わせ直す） */
  function fitPaper(wrap) {
    const paper = wrap.querySelector(".tfp-paper");
    if (!paper || !wrap.isConnected) return;
    const BASE = 26, MIN = 10;
    const cs = getComputedStyle(paper);
    // 紙のふちはギザギザに切り抜かれているので、その分(左右6pxずつ)も余白として引く
    const avail = paper.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 12;
    paper.style.setProperty("--tfp-fs", BASE + "px");
    let ratio = 1;
    wrap.querySelectorAll(".tfp-line span").forEach((sp) => { const w = sp.offsetWidth; if (w > avail && w > 0) ratio = Math.min(ratio, avail / w); });
    paper.style.setProperty("--tfp-fs", Math.max(MIN, Math.floor(BASE * ratio * 10 * 0.95) / 10) + "px");   // 全行で同じ大きさにそろえる（文字が途切れないよう少し余裕を持たせる）
  }
  /** ホストのスキップが届いた: 紙を今すぐ下の欄へ飛ばす（まだ紙が出ていなければ、これから出さない） */
  stage.skipPaper = function () {
    const g = G();
    g.newsSkip = true;   // ホストのスキップは、このあとに出る新聞の紙も飛ばす（新聞は情報確認から見られる）
    g.mapoSkip = true;   // 麻婆豆腐の演出も同じく飛ばす（完成は情報確認から見られる）
    g.exposeSkip = true;   // 暴露の紙も同じく飛ばす（暴露された役職は情報確認から見られる）
    const ex = document.querySelector(".exp-wrap"); if (ex) finishExpose(ex);
    const mp = document.querySelector(".mpo-wrap"); if (mp) finishMapo(mp);
    const nw = document.querySelector(".nwp-wrap");
    if (nw) flyNews(nw);
    const w = document.querySelector(".tfp-wrap");
    if (w) { fly(w); return; }
    if (nw) return;
    if (!g.tfShown) { g.tfShown = true; g.tfIntro = false; ONW.ui.updateBoard(); }
    runNews();
  };
  /** 変化公開の紙が出始めてから下の欄に収まるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める */
  stage.paperMs = function (lines) {
    if (!lines || !lines.length) return 0;
    const dur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05)), last = lines[lines.length - 1];
    return Math.round((0.55 + (lines.length - 1) * 0.75 + dur(last) + 1.3 + 1.05 + 0.3) * 1000);
  };
  stage.paper = function (lines) {
    document.querySelectorAll(".tfp-wrap").forEach((w) => w.remove());
    paperTimers.forEach(clearTimeout); paperTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "tfp-wrap";
    const dur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05));
    const start = (i) => 0.55 + i * 0.75;
    const canSkipPaper = !!(ONW.net && ONW.net.isHost);   // スキップできるのはホストだけ（表示も出さない）。ダブルタップで全員ぶん飛ばす
    wrap.style.cursor = "default";
    wrap.innerHTML = `<div class="tfp-dim"></div>
      <div class="tfp-paper">
        <div class="tfp-title"><span style="--n:4;--d:.1s;--dur:.35s">変化公開</span></div>
        ${lines.map((t, i) => `<div class="tfp-line"><span style="--n:${[...t].length};--d:${start(i).toFixed(2)}s;--dur:${dur(t).toFixed(2)}s">${esc(t)}</span></div>`).join("")}
        ${canSkipPaper ? `<div class="tfp-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    fitPaper(wrap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitPaper(wrap));   // フォントの読み込み後にも合わせ直す
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener("loadingdone", () => fitPaper(wrap));   // 書き出しの途中でフォントが入れ替わったときも合わせ直す
    [60, 300, 900].forEach((ms) => paperTimers.push(setTimeout(() => fitPaper(wrap), ms)));   // 描画が落ち着いたあとにも念のため
    const onResize = () => fitPaper(wrap);
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(() => { if (!wrap.isConnected) { window.removeEventListener("resize", onResize); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    if (canSkipPaper) {
      let last = 0, lx = 0, ly = 0;   // dblclick はスマホで不安定なので、自前でダブルタップを判定する
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    const endAt = start(lines.length - 1) + dur(lines[lines.length - 1]) + 1.3;   // 書き終えて少し読ませてから下へ
    paperTimers.push(setTimeout(() => fly(wrap), endAt * 1000));
  };

  // ---------------------------------------------------------
  // 新聞配達員: 変化公開の紙が収まったあと、新聞紙のような紙に「昨夜、動きのあった役職」が書き出される。
  // 書き終えたら「情報確認」のボタンへ縮んで消える（新聞は情報確認からいつでも見返せる）。昼のタイマーは新聞が終わってから始まる
  // ---------------------------------------------------------
  let newsTimers = [];
  const newsDur = (t) => Math.min(0.7, Math.max(0.3, [...t].length * 0.05));
  const newsStart = (i) => 1.0 + i * 0.75;   // 題字のあと、1行ずつ書き出す
  /** 新聞に書く行（動きがあった役職 / 動きがなかったときの2行） */
  const newsRows = (lines) => (lines && lines.length ? ["昨夜、動きのあった役職", ...lines] : ["昨夜、目立った能力行使は", "なかったようです。"]);
  /** 新聞の紙が出始めてから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める */
  stage.newsMs = function (lines) {
    const rows = newsRows(lines);
    return Math.round((newsStart(rows.length - 1) + newsDur(rows[rows.length - 1]) + 1.6 + 1.05 + 0.3) * 1000);
  };
  function finishNews(wrap) {
    newsTimers.forEach(clearTimeout); newsTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
    runMapo();   // 新聞が終わったら、麻婆豆腐の演出へ
  }
  function flyNews(wrap) {
    if (wrap.dataset.flying) return;
    wrap.dataset.flying = "1";
    newsTimers.forEach(clearTimeout); newsTimers = [];
    const paper = wrap.querySelector(".nwp-paper"), tgt = document.querySelector(".co-bar .btn");   // 先頭のボタン = 情報確認
    wrap.querySelector(".nwp-dim").style.opacity = "0";
    paper.style.animation = "none";   // 出現のアニメが残っていると、縮む動きを上書きしてしまう
    if (!tgt) { paper.style.transition = "opacity .5s ease"; paper.style.opacity = "0"; newsTimers.push(setTimeout(() => finishNews(wrap), 600)); return; }
    void paper.offsetWidth;
    const pr = paper.getBoundingClientRect(), tr = tgt.getBoundingClientRect();
    const s = Math.min(tr.width / pr.width, tr.height / pr.height, 1);
    const dx = tr.left + tr.width / 2 - (pr.left + pr.width / 2), dy = tr.top + tr.height / 2 - (pr.top + pr.height / 2);
    paper.style.transition = "transform .95s cubic-bezier(.55,0,.25,1), opacity .35s ease .65s";
    paper.style.transform = `translate(${dx}px,${dy}px) scale(${s}) rotate(0deg)`;
    paper.style.opacity = "0";
    newsTimers.push(setTimeout(() => finishNews(wrap), 1050));
  }
  /** 新聞の文字を、改行されない範囲で一番大きくする（画面の幅が変わっても合わせ直す） */
  function fitNews(wrap) {
    const paper = wrap.querySelector(".nwp-paper");
    if (!paper || !wrap.isConnected) return;
    const BASE = 24, MIN = 10, cs = getComputedStyle(paper);
    const avail = paper.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 4;
    paper.style.setProperty("--nwp-fs", BASE + "px");
    let ratio = 1;
    wrap.querySelectorAll(".nwp-line span").forEach((sp) => { const w = sp.offsetWidth; if (w > avail && w > 0) ratio = Math.min(ratio, avail / w); });
    paper.style.setProperty("--nwp-fs", Math.max(MIN, Math.floor(BASE * ratio * 10 * 0.95) / 10) + "px");
  }
  function drawNews(lines) {
    document.querySelectorAll(".nwp-wrap").forEach((w) => w.remove());
    newsTimers.forEach(clearTimeout); newsTimers = [];
    const rows = newsRows(lines), hasInfo = !!(lines && lines.length);
    const wrap = document.createElement("div");
    wrap.className = "nwp-wrap";
    const canSkip = !!(ONW.net && ONW.net.isHost);   // スキップできるのはホストだけ。変化公開の紙と同じダブルタップで、全員ぶん飛ばす
    wrap.innerHTML = `<div class="nwp-dim"></div>
      <div class="nwp-paper">
        <div class="nwp-masthead"><span style="--n:4;--d:.1s;--dur:.4s">混沌新聞</span></div>
        <div class="nwp-edition">号外　昨夜の動き</div>
        ${rows.map((t, i) => `<div class="nwp-line ${hasInfo && i === 0 ? "nwp-line--head" : ""}"><span style="--n:${[...t].length};--d:${newsStart(i).toFixed(2)}s;--dur:${newsDur(t).toFixed(2)}s">${esc(t)}</span></div>`).join("")}
        ${canSkip ? `<div class="nwp-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    fitNews(wrap);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitNews(wrap));
    [60, 300, 900].forEach((ms) => newsTimers.push(setTimeout(() => fitNews(wrap), ms)));
    const onResize = () => fitNews(wrap);
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(() => { if (!wrap.isConnected) { window.removeEventListener("resize", onResize); mo.disconnect(); } });
    mo.observe(document.body, { childList: true });
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    newsTimers.push(setTimeout(() => flyNews(wrap), (newsStart(rows.length - 1) + newsDur(rows[rows.length - 1]) + 1.6) * 1000));   // 書き終えて少し読ませてから「情報確認」へ
  }
  /** 変化公開の紙がこれから出る・出ている最中か（新聞はその後に出す） */
  function tfBusy(g) {
    const tv = g.tfView;
    return !!(g.tfIntro || document.querySelector(".tfp-wrap") || (tv && tv.mode === "reveal" && tv.lines && tv.lines.length && !g.tfShown));
  }
  /** 待っている新聞を、出せるなら出す（変化公開の紙が終わったとき・ホストのスキップのときにも呼ばれる） */
  function runNews() {
    const g = G();
    if (!g.newsPending) return;
    if (!g.newsForce && tfBusy(g)) return;
    g.newsPending = false;
    if (g.newsSkip || g.isSpectator) return;   // ホストがスキップした / 観戦中: 紙は出さない（情報確認には載る）
    drawNews(g.newsLines);
  }
  /** 新聞が届いた: 変化公開の紙が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼に新聞配達員の酔いが覚めたとき（すぐ出す） */
  stage.news = function (lines, late) {
    const g = G();
    g.newsLines = lines || [];
    g.newsPending = true; g.newsForce = !!late; if (late) g.newsSkip = false;
    newsTimers.push(setTimeout(() => { const gg = G(); if (gg.newsPending && !document.querySelector(".tfp-wrap")) { gg.newsForce = true; runNews(); } }, 3000));   // 変化公開の紙が何かの都合で出ないときの保険
    runNews();
  };

  // ---------------------------------------------------------
  // 暴露狂人: 昼の始まりに「暴露された人の最終役職」の紙が出る（誰が暴露されたかは出さない。カードはめくれない）
  // 順番: 変化公開の紙 → 新聞 → 暴露の紙 → 麻婆豆腐の演出 → 昼のタイマー開始(パン屋)。暴露の内容は「情報確認」からいつでも見返せる
  // ---------------------------------------------------------
  let exposeTimers = [], exposePoll = null;
  /** 暴露の紙が出始めてから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める（1件ごとに少し延びる） */
  stage.exposeMs = function (rows) { return 3200 + Math.max(0, ((rows && rows.length) || 1) - 1) * 1300; };
  const exposeText = (r) => (r.extras && r.extras.length ? `であり、${r.extras.join("であり、")}でした。` : "");
  function finishExpose(wrap) {
    exposeTimers.forEach(clearTimeout); exposeTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
  }
  function drawExpose(rows, late) {
    document.querySelectorAll(".exp-wrap").forEach((w) => w.remove());
    exposeTimers.forEach(clearTimeout); exposeTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "exp-wrap" + (late ? " exp-wrap--late" : "");   // late = 昼の途中に出た（操作は止めない）
    const canSkip = !!(ONW.net && ONW.net.isHost) && !late;   // スキップできるのはホストだけ。変化公開・新聞と同じダブルタップで、全員ぶん飛ばす
    const total = stage.exposeMs(rows);
    wrap.innerHTML = `<div class="exp-dim"></div>
      <div class="exp-paper">
        <div class="exp-title">🔎 暴露通知</div>
        ${rows.map((r, i) => `<div class="exp-item" style="--i:${i}">
          <div class="exp-lead">暴露狂人に暴露された人の最終役職は</div>
          <div class="exp-role">${esc(r.role)}</div>
          ${exposeText(r) ? `<div class="exp-extra">${esc(exposeText(r))}</div>` : `<div class="exp-extra">です。</div>`}
        </div>`).join("")}
        ${canSkip ? `<div class="exp-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    wrap.style.setProperty("--exp-total", (total - 150) / 1000 + "s");
    document.body.appendChild(wrap);
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    exposeTimers.push(setTimeout(() => { finishExpose(wrap); runMapo(); }, total - 150));
  }
  /** 待っている暴露の紙を、出せるなら出す（変化公開の紙・新聞が終わるのを待つ。最大15秒でやめる） */
  function runExpose() {
    const g = G();
    if (!g.exposePending) return;
    if (!g.exposeForce && !g.exposeSkip && (tfBusy(g) || g.newsPending || document.querySelector(".tfp-wrap, .nwp-wrap")) && Date.now() < (g.exposeWaitUntil || 0)) {
      if (!exposePoll) exposePoll = setTimeout(() => { exposePoll = null; runExpose(); }, 250);
      return;
    }
    g.exposePending = false;
    const rows = g.exposeShow || []; g.exposeShow = [];
    if (g.exposeSkip || g.isSpectator || !rows.length) { runMapo(); return; }   // ホストがスキップした / 観戦中: 紙は出さない（情報確認には載る）
    drawExpose(rows, !!g.exposeLate);
  }
  /** 暴露が届いた: 変化公開の紙・新聞が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼の途中に出たとき（すぐ出す） */
  stage.expose = function (rows, late) {
    const g = G();
    g.exposeShow = [...(g.exposePending ? g.exposeShow || [] : []), ...(rows || [])];
    g.exposePending = true; g.exposeForce = !!late; g.exposeLate = !!late; g.exposeWaitUntil = Date.now() + 15000;
    if (late) g.exposeSkip = false;
    runExpose();
  };

  // ---------------------------------------------------------
  // 麻婆の人狼: 麻婆の人狼と豆腐の人狼が両方いるとき、昼の始まりに「麻婆豆腐 完成！」の演出が出る
  // 順番: 変化公開の紙 → 新聞 → 麻婆豆腐の演出 → 昼のタイマー開始(パン屋)。完成は「情報確認」からいつでも確認できる
  // ---------------------------------------------------------
  const MAPO_MS = 3800;   // 演出が出始めてから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める
  let mapoTimers = [], mapoPoll = null;
  stage.mapoMs = function () { return MAPO_MS; };
  function finishMapo(wrap) {
    mapoTimers.forEach(clearTimeout); mapoTimers = [];
    if (wrap && wrap.parentNode) wrap.remove();
  }
  function drawMapo(late) {
    document.querySelectorAll(".mpo-wrap").forEach((w) => w.remove());
    mapoTimers.forEach(clearTimeout); mapoTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "mpo-wrap" + (late ? " mpo-wrap--late" : "");   // late = 昼の途中に完成した（操作は止めない）
    const canSkip = !!(ONW.net && ONW.net.isHost) && !late;   // スキップできるのはホストだけ。変化公開・新聞と同じダブルタップで、全員ぶん飛ばす
    wrap.innerHTML = `<div class="mpo-dim"></div>
      <div class="mpo-stage">
        <div class="mpo-item mpo-chili"><em>🌶️</em><span>麻婆の人狼</span></div>
        <div class="mpo-item mpo-tofu"><i class="mpo-cube"></i><span>豆腐の人狼</span></div>
        <div class="mpo-flash"></div>
        <div class="mpo-pot">🍲</div>
        <div class="mpo-steam"><b></b><b></b><b></b></div>
        <div class="mpo-title">麻婆豆腐 完成！</div>
        ${canSkip ? `<div class="mpo-hint">ダブルタップでスキップ</div>` : ""}
      </div>`;
    document.body.appendChild(wrap);
    if (canSkip) {
      let last = 0, lx = 0, ly = 0;
      wrap.addEventListener("pointerup", (e) => {
        const now = Date.now();
        if (now - last < 400 && Math.abs(e.clientX - lx) < 40 && Math.abs(e.clientY - ly) < 40) { last = 0; ONW.net.skipPaper(); }
        else { last = now; lx = e.clientX; ly = e.clientY; }
      });
    }
    mapoTimers.push(setTimeout(() => finishMapo(wrap), MAPO_MS - 150));
  }
  /** 変化公開の紙・新聞が出ている(出る)最中か。麻婆豆腐の演出はその後に出す */
  function mapoBusy(g) { return tfBusy(g) || g.newsPending || g.exposePending || !!document.querySelector(".tfp-wrap, .nwp-wrap, .exp-wrap"); }
  /** パンのバナーは、変化公開・新聞・暴露・麻婆豆腐がすべて終わってから */
  function breadBusy(g) { return mapoBusy(g) || g.mapoPending || !!document.querySelector(".mpo-wrap"); }
  /** 待っている麻婆豆腐の演出を、出せるなら出す（変化公開の紙・新聞が終わったとき・ホストのスキップのときにも呼ばれる） */
  function runMapo() {
    const g = G();
    if (!g.mapoPending) return;
    if (!g.mapoForce && !g.mapoSkip && mapoBusy(g) && Date.now() < (g.mapoWaitUntil || 0)) {   // 紙と新聞が終わるのを待つ（念のため最大15秒でやめる）
      if (!mapoPoll) mapoPoll = setTimeout(() => { mapoPoll = null; runMapo(); }, 250);
      return;
    }
    g.mapoPending = false;
    if (g.mapoSkip || g.isSpectator) return;   // ホストがスキップした / 観戦中: 演出は出さない（情報確認には載る）
    drawMapo(!!g.mapoLate);
  }
  /** 麻婆豆腐の完成が届いた: 紙と新聞が終わっていれば今すぐ、終わっていなければその後に出す。late = 昼の途中に完成したとき（すぐ出す） */
  stage.mapo = function (late) {
    const g = G();
    g.mapoPending = true; g.mapoForce = !!late; g.mapoLate = !!late; g.mapoWaitUntil = Date.now() + 15000;
    if (late) g.mapoSkip = false;
    runMapo();
  };

  // ---------------------------------------------------------
  // パン屋: 昼の始まりの最後（変化公開 → 新聞 → 暴露 → 麻婆豆腐 のあと）、昼のタイマーが始まる前に「パンが焼けました」のバナーが出る
  // ---------------------------------------------------------
  const BREAD_MS = 3600;   // バナーが出てから消えるまでの時間(ms)。昼のタイマー・CPUの発言はこの後に始める
  let breadPoll = null;
  stage.breadMs = function () { return BREAD_MS; };
  function runBread() {
    const g = G();
    if (!g.breadPending) return;
    if (breadBusy(g) && Date.now() < (g.breadWaitUntil || 0)) {   // 紙・暴露・麻婆豆腐が終わるのを待つ（念のため最大25秒でやめる）
      if (!breadPoll) breadPoll = setTimeout(() => { breadPoll = null; runBread(); }, 250);
      return;
    }
    g.breadPending = false;
    if (ONW.ui && ONW.ui.showBread) ONW.ui.showBread(g.breadShowN || 1);
  }
  stage.bread = function (n) {
    const g = G();
    g.breadPending = true; g.breadShowN = n || 1; g.breadWaitUntil = Date.now() + 25000;
    runBread();
  };

  // ---------------------------------------------------------
  // 観測の人狼: 待機時間に、自分のカードが「観測の人狼」でめくれたあと、観測結果が飛び出す（本人の画面だけ）
  // 結果は「情報確認」の文章にも載るので、見逃してもあとから見返せる。待機時間(5秒)の中で収まる長さにしてある
  // ---------------------------------------------------------
  let obsTimers = [];
  const OBS_MS = 3000;   // 飛び出してから閉じ始めるまで(ms)
  function closeObserve(wrap) {
    obsTimers.forEach(clearTimeout); obsTimers = [];
    if (!wrap || !wrap.parentNode) return;
    wrap.classList.add("obs-out");
    setTimeout(() => { if (wrap.parentNode) wrap.remove(); }, 450);
  }
  stage.observe = function (lines) {
    const g = G();
    if (g.isSpectator || hostWatching(g)) return;
    document.querySelectorAll(".obs-wrap").forEach((w) => w.remove());
    obsTimers.forEach(clearTimeout); obsTimers = [];
    const rows = (lines && lines.length ? lines : ["観測できる夜能力はありませんでした。"]).slice(0, 8);
    const wrap = document.createElement("div");
    wrap.className = "obs-wrap";
    wrap.innerHTML = `<div class="obs-pop"><div class="obs-title">🔭 観測通知</div>${rows.map((t, i) => `<div class="obs-line" style="--i:${i}">${esc(t)}</div>`).join("")}</div>`;
    wrap.addEventListener("pointerup", () => closeObserve(wrap));   // タップですぐ閉じる
    document.body.appendChild(wrap);
    obsTimers.push(setTimeout(() => closeObserve(wrap), OBS_MS + Math.min(rows.length, 5) * 150));
  };
  stage.observeMs = function () { return OBS_MS; };

  // ---------------------------------------------------------
  // 口封じされた人の画面: 待機時間に、でかいミュートマーク🤐と「あなたは口封じされました。」が出る（タップで閉じる。昼になったら消える）
  // ---------------------------------------------------------
  const MUTE_MS = 4200;
  let muteTimers = [];
  function closeMuzzle(wrap) {
    if (!wrap || !wrap.parentNode) return;
    wrap.classList.add("mute-out");
    setTimeout(() => wrap.remove(), 450);
  }
  stage.muzzled = function () {
    const g = G();
    if (g.isSpectator || hostWatching(g)) return;
    document.querySelectorAll(".mute-wrap").forEach((w) => w.remove());
    muteTimers.forEach(clearTimeout); muteTimers = [];
    const wrap = document.createElement("div");
    wrap.className = "mute-wrap";
    wrap.innerHTML = `<div class="mute-dim"></div><div class="mute-body"><div class="mute-icon">🤐</div><div class="mute-text">あなたは口封じされました。</div><div class="mute-sub">昼のチャットとCOボタンは使えません</div></div>`;
    wrap.addEventListener("pointerup", () => closeMuzzle(wrap));
    document.body.appendChild(wrap);
    muteTimers.push(setTimeout(() => closeMuzzle(wrap), MUTE_MS));
  };
  stage.muzzledEnd = function () { muteTimers.forEach(clearTimeout); muteTimers = []; document.querySelectorAll(".mute-wrap").forEach((w) => w.remove()); };
  stage.muzzledMs = function () { return MUTE_MS; };

  ONW.stage = stage;
})(window.ONW);
