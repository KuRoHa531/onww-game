/**
* 勝負師（マイクラ版 WAGERER を参考）: 第三陣営・昼能力。
* ・マイクラ版の説明文: 「昼能力で、どの陣営または単独第三陣営が勝利するかを予想します。村人陣営か人狼陣営を当てると追加勝利し、単独第三陣営を当てると乗っ取り単独勝利します。昼時間中なら予想を何度でも変更できます。」
* ・夜の能力なし（night なし）。昼の議論中に「昼能力」ボタンから、勝利すると思う陣営を1つ選ぶ。昼時間中なら何度でも選び直せる（使用回数の制限なし）。
* 選択肢はマイクラ版 WAGERER_PREDICTION_OPTIONS と同じ: 村人陣営・人狼陣営は常時。単独第三陣営の選択肢は、対応する役職が
* 初期役職か中央カード（墓地）に含まれるときだけ出る（妖狐陣営=妖狐/狂信者、恋人陣営=純粋な恋人/悪女/キューピッド、神、バランサー、
* 名探偵、予想屋、処刑人、てるてる、一目惚れしてるてる、糸紡ぎ、妖狸、魔界公爵、弁護士、シャッフラー、静観者）。
* 選ぶと本人にだけ「{選択肢}勝利を予想しました。」と通知される。
* ・封印の対象役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っている。info.sealTarget）。封印されていると昼能力は使えない（失敗して消費）。
* また、封印されている勝負師は予想していても的中扱いにならない（マイクラ版 applyWagererOutcome の outcome "none"）。
* ・変化候補（マイクラ版で確認）: 銀色の影の変化先に入る（TRANSFORM_ROLE_GROUPS の SILVER_SHADOW）。光の使徒（村人陣営のみ）・
* 闇の化身（人狼陣営のみ）の対象外。コスプレイヤーの変化先には入らない（マイクラ版 cosplayerEligibleRoles に無い）。
* シャッフラーの変化先には入らない（マイクラ版の除外リスト）。模倣の人狼は第三陣営を模倣できない（Web版の共通ルール）。
* ・闇鍋シナジー（マイクラ版 YAMINABE_WAGERER_SOLO_ROLES）: 勝負師がいるとき、単独勝利できる役職が最低1枚入る（roles.js の SYNERGY_COUNT_RULES）。
* ・ハッキング: 対象にも思い込みの対象にもなる（銀狼の偽昼能力で同じ選択肢UIが出て、偽の通知「{選択肢}勝利を予想しました。」が残る。何度でも選び直せる）。
*
*
* ・対象は「最終盤面で勝負師のカードを持っている人」だけ（予想の記録は人に紐づく。カードが動いて最終的に勝負師でなくなった人の予想は数えない）。
* ・予想していない / 封印されている → 的中なし。
* ・村人陣営・人狼陣営の予想が当たった → 追加勝利（勝者に追加され、勝利陣営に「勝負師」が加わる。タイトルは変わらない）。
* ・単独第三陣営の予想が当たった → 乗っ取り単独勝利: 勝者は的中した勝負師だけ（恋人になっている勝負師は除く）＋通常の便乗系
* （フリーター・従者・グレムリン・シャッフラー。vote.js の set が通常どおり足す）。勝利タイトル「勝負師勝利」。
* ただし、その勝負師に反転（逆転者）が奇数回かかっていると単独予想は失敗する（マイクラ版 reversalStacks の奇数チェック）。
* ・弁護士の特例（マイクラ版 wagererPredictionSucceeded）: 「弁護士」が勝利陣営に入っていて、村人陣営・人狼陣営・神の祝福の
* どれも入っていないときだけ的中。
* ・勝負師が複数いて全員が当たれば、全員が追加勝利 / 全員が乗っ取り勝者になる（マイクラ版も複数同時）。
*
*
* チキン ＞ 模倣チキン ＞ 愉快犯 ＞ 神の祝福 ＞ 勝負師 ＞ シャッフラー ＞ 静観者 ＞ 名探偵 ＞ 予想屋 ＞ …
* 乗っ取りは vote.js の determineWinnersCore で、シャッフラーの便乗のあとに判定する（チキンの逆転 chickenForce の再判定では乗っ取らない。
* 追加勝利は再判定後の陣営で計算し直される＝マイクラ版の「チキン適用後に outcome を見る」と同じ）。
* バランサーの演出を出さない勝利タイトル（ONW.balancer.HIGHER_TITLES）には「勝負師勝利」を入れない（チキンと同じく、
* バランサー勝利を先に出してから覆す逆転として扱う）。
* ※愉快犯との相互作用: Web版の他の乗っ取り役職（妖狐・シャッフラー等）と同じく、勝負師の判定はコア判定（愉快犯の適用前）で行い、
* 愉快犯が成立すればその上から結果を書き換える（優先度どおり）。マイクラ版は愉快犯のあとに勝負師を見る点だけが違う（解釈点。docs/wagerer.md）。
*
*
* ・結果発表: 全員のカードがめくれたあと・勝利陣営が出る前（stage.js の playLadder の直前）に、予想した勝負師の数だけ紙が横に並んで出て、
* 「勝負師{名前}は・・・{選択肢}の勝利を望みました！」の文字が全紙同時に1文字ずつ出る（se_reveal_text のSEが鳴る。変化公開の紙と同じ見た目）。
* 紙は「最終盤面で勝負師で、予想を決めていた人」の分だけ（的中したかどうかは問わない）。
* ・追加勝利の演出は既存の追加勝利チップ（res.extraWin）、乗っ取りの演出は既存の勝利の貼り重ね（ladder の "wagerer" 段）を使う。
*
* 状態: g.wagererPrediction = { 勝負師のID: 選択肢キー}（人に紐づく。マイクラ版 wagererPrediction と同じ。試合ごとに net.startGame が {} に戻す。
* ホスト引き継ぎのキー（AUTH_KEYS / HOST_ONLY_KEYS）に追加済み）
*/
(function (ONW) {
const R = () => ONW.ROLE;
const W = {};
const esc = (s) => ONW.utils.esc(s);
const deadNow = (g, id) => (g.deadIds || []).includes(id);

// ---- 選択肢（マイクラ版 WAGERER_PREDICTION_OPTIONS / WAGERER_TEAM_BY_KEY）----
// label = 選択肢の表示名（通知・紙・結果情報で使う）。team = 的中判定で見る勝利陣営の文字列（マイクラ版 WAGERER_TEAM_BY_KEY）。
// roles = 出現条件（初期役職か中央カードにどれか1つでもあれば出る）。null は常時。
// ※ラベルと team が違うものがある: 恋人陣営→勝利陣営は「恋人」、てるてる→「てるてる坊主」（マイクラ版どおり）
const OPTIONS = [
{ key: "village", label: "村人陣営", team: "村人陣営", roles: null},
{ key: "wolf", label: "人狼陣営", team: "人狼陣営", roles: null},
{ key: "fox", label: "妖狐陣営", team: "妖狐陣営", roles: ["fox", "fanatic"]},
{ key: "lover", label: "恋人陣営", team: "恋人", roles: ["pure_lover", "evil_woman", "cupid"]},
{ key: "god", label: "神", team: "神", roles: ["god"]},
{ key: "balancer", label: "バランサー", team: "バランサー", roles: ["balancer"]},
{ key: "detective", label: "名探偵", team: "名探偵", roles: ["detective"]},
{ key: "predictor", label: "予想屋", team: "予想屋", roles: ["predictor"]},
{ key: "executioner", label: "処刑人", team: "処刑人", roles: ["executioner"]},
{ key: "tanner", label: "てるてる", team: "てるてる坊主", roles: ["tanner"]},
{ key: "love_tanner", label: "一目惚れしてるてる", team: "一目惚れしてるてる", roles: ["love_tanner"]},
{ key: "thread_spinner", label: "糸紡ぎ", team: "糸紡ぎ", roles: ["thread_spinner"]},
{ key: "yokai_tanuki", label: "妖狸", team: "妖狸", roles: ["yokai_tanuki"]},
{ key: "demon_duke", label: "魔界公爵", team: "魔界公爵", roles: ["demon_duke"]},
{ key: "lawyer", label: "弁護士", team: "弁護士", roles: ["lawyer"]},
{ key: "shuffler", label: "シャッフラー", team: "シャッフラー", roles: ["shuffler"]},
{ key: "watcher", label: "静観者", team: "静観者", roles: ["watcher"]},
];
const optOf = (key) => OPTIONS.find((o) => o.key === key) || null;
W.labelOf = (key) => (optOf(key) || {}).label || "";
W.teamOfKey = (key) => (optOf(key) || {}).team || "";

/** 今の試合で選べる選択肢 [{ key, label}]（マイクラ版 buildWagererPredictionOptions: 初期役職＋中央カードを見る） */
W.options = function options(g) {
const have = new Set(Object.values((g && g.initialRoles) || {}));
((g && (g.center || g.center0)) || []).forEach((r) => have.add(r));
return OPTIONS.filter((o) =>!o.roles || o.roles.some((r) => have.has(r))).map((o) => ({ key: o.key, label: o.label}));
};

/** 最終盤面で勝負師を持っている人のID（席順）。生死は問わない（マイクラ版 applyWagererOutcome は finalRoles だけを見る） */
W.holders = function holders(g) {
return (g.players || []).map((p) => p.id).filter((id) => g.currentRoles && g.currentRoles[id] === R().WAGERER);
};
/** 記録されている予想キー。決めていなければ null */
W.predictionOf = function predictionOf(g, id) {
const k = g && g.wagererPrediction && g.wagererPrediction[id];
return typeof k === "string" && optOf(k)? k: null;
};

/**
* 勝負師の昼能力を使えるか（最終盤面で勝負師・酔いが覚めている・生きている・昼の議論中でタイマーが動いている・
* 独裁処刑や全員死亡スキップ中でない・天秤の発動中でない・封印されていない）。何度でも使える（使用済みという状態はない）
*/
W.canUse = function canUse(g, id) {
if (!g || g.allDeadSkip || g.dictator || g.libraFlashing) return false;
if (g.phase!== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;
if (!g.currentRoles || g.currentRoles[id]!== R().WAGERER) return false;
if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false; // 封印されている: 昼能力は使えない
if (ONW.hiddenDrunk(g, id) || deadNow(g, id)) return false;
return true;
};

/** 予想を記録する（ホストが検証したあとに呼ぶ）。戻り値: { key, label}。使えない・選択肢に無いキーなら null */
W.apply = function apply(g, id, key) {
if (!W.canUse(g, id)) return null;
if (!W.options(g).some((o) => o.key === key)) return null;
(g.wagererPrediction = g.wagererPrediction || {})[id] = key;
return { key, label: W.labelOf(key)};
};

// ---- 文言（マイクラ版と同じ）----
/** 本人への通知: 「{選択肢}勝利を予想しました。」（マイクラ版の勝負師通知） */
W.noticeText = (key) => `${W.labelOf(key)}勝利を予想しました。`;
/** 再入室・再同期で本人に出し直す通知文（予想キーを渡す） */
W.doneText = (key) => (key? W.noticeText(key): null);

// ---- 勝敗 ----
/** 予想が当たったか（マイクラ版 wagererPredictionSucceeded）。teams = 勝利陣営の文字列の配列。弁護士は特例 */
W.succeeded = function succeeded(g, key, teams) {
const o = optOf(key); if (!o) return false;
const t = teams || [];
if (key === "lawyer") return t.includes("弁護士") &&!t.includes("村人陣営") &&!t.includes("人狼陣営") &&!t.includes("神の祝福");
return t.includes(o.team);
};
/**
* その勝負師の結果（マイクラ版 applyWagererOutcome の outcome）: "additional" | "solo" | "fail" | "none"
* none = 最終盤面で勝負師でない / 予想していない / 封印されている
*/
W.outcomeOf = function outcomeOf(g, id, teams) {
if (!g.currentRoles || g.currentRoles[id]!== R().WAGERER) return "none";
const key = W.predictionOf(g, id);
if (!key) return "none";
if (ONW.seal && ONW.seal.is(g, id)) return "none"; // 封印されている勝負師は的中しない（マイクラ版）
if (!W.succeeded(g, key, teams || g.winTeams || [])) return "fail";
if (key === "village" || key === "wolf") return "additional";
if (ONW.reverser && ONW.reverser.odd(g, id)) return "fail"; // 単独予想は、その人に反転が奇数回かかっていると失敗（マイクラ版）
return "solo";
};
/** 村人陣営/人狼陣営の予想が当たって追加勝利する勝負師（vote.js の set が使う。teams はその時点の勝利陣営） */
W.additionalWins = function additionalWins(g, teams) {
return W.holders(g).filter((id) => W.outcomeOf(g, id, teams) === "additional");
};
/**
* 乗っ取り（vote.js の determineWinnersCore が使う）: 単独第三陣営の予想が当たった勝負師がいれば { ids}、いなければ null。
* 恋人になっている勝負師は乗っ取り勝者に入れない（マイクラ版 applyLimitedSingleWinners が恋人を外すのと同じ）
*/
W.takeover = function takeover(g) {
const ids = W.holders(g).filter((id) => W.outcomeOf(g, id, g.winTeams || []) === "solo" &&!ONW.isLover(g, id));
return ids.length? { ids}: null;
};

// ---- 結果発表 ----
/** 結果発表の「勝負師情報」の行（マイクラ版 vote.js の勝負師情報と同じ文言・同じ分岐） */
W.lines = function lines(g, nm) {
const out = [];
(g.players || []).forEach((p) => {
const isW = g.currentRoles && g.currentRoles[p.id] === R().WAGERER, key = W.predictionOf(g, p.id);
if (!isW &&!key) return;
const oc = isW? W.outcomeOf(g, p.id, g.winTeams || []): undefined; // 予想だけ残って勝負師でなくなった人は、マイクラ版では outcome が無く「失敗」の行になる
if (!key || oc === "none") out.push(`勝負師${nm(p.id)}はそもそも勝負しようとしてませんでした…`);
else if (oc === "solo") out.push(`勝負師${nm(p.id)}は${W.labelOf(key)}勝利の予想に成功し乗っ取り勝利しました。`);
else if (oc === "additional") out.push(`勝負師${nm(p.id)}は${W.labelOf(key)}勝利の予想に成功し追加勝利しました。`);
else out.push(`勝負師${nm(p.id)}は${W.labelOf(key)}勝利を予想し失敗していました。`);
});
return out;
};
/** 結果発表の紙のデータ: 最終盤面で勝負師で、予想を決めていた人 [{ id, name, key, label}]（席順） */
W.paperData = function paperData(g, nm) {
return W.holders(g).map((id) => ({ id, name: nm(id), key: W.predictionOf(g, id), label: W.labelOf(W.predictionOf(g, id))})).filter((x) => x.key);
};
/** 観戦パネル「昼の行動（勝負師）」: 予想を決めた勝負師（最終盤面）ごとの { by, text} */
W.specLines = function specLines(g, nm) {
return W.holders(g).filter((id) => W.predictionOf(g, id)).map((id) => ({ by: nm(id), text: `${W.labelOf(W.predictionOf(g, id))}勝利を予想`}));
};

// ---- 実績（wiki-data.js の「勝負師」に定義済み。マイクラ版と同じ条件）----
/**
* wagerer_additional_win = 村人陣営/人狼陣営の勝利を的中させて追加勝利 / wagerer_solo_win = 単独第三陣営の勝利を的中させて乗っ取り単独勝利
* first_wagerer（初めて勝負師になる）は履歴依存なので返さない（道化の爆弾魔・猪の狂人と同じ）
*/
W.achievements = function achievements(g, id, won) {
const out = [];
if (won && g.currentRoles && g.currentRoles[id] === R().WAGERER) {
const oc = W.outcomeOf(g, id, g.winTeams || []);
if (oc === "additional") out.push("wagerer_additional_win");
if (oc === "solo") out.push("wagerer_solo_win");
}
return out;
};

// ---- CPU ----
/** CPUの勝負師が選ぶ予想キー（CPU_AUTO_DAY.wagerer が ON のときだけ net.js の cpuWagerer が使う。既定はOFF。マイクラ版のCPUは通常プレイでは予想を決めない） */
function cpuPick(k, g, p) {
const opts = W.options(g), pool = [];
opts.forEach((o) => { const n = o.key === "village" || o.key === "wolf"? 3: 1; for (let i = 0; i < n; i++) pool.push(o.key);});
return k.pick(pool.length? pool: ["village"]);
}
/** CPUが勝負師の昼能力を使ったあとの発言（結果開示。マイクラ版のCPU開示「{選択肢}勝利を予想していました。」） */
function cpuSpeak(k, g, p, e) {
if (!e ||!e.key) return [];
return [{ p, text: `${W.labelOf(e.key)}勝利を予想していました。`, short: `${W.labelOf(e.key)}勝利を予想`, result: true, claim: { kind: "wagerer"}, gap: 3500}];
}

ONW.wagerer = W;

ONW.defineRole("wagerer", {
info: { sealTarget: true, deck: 155, name: "勝負師", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 58,
desc: "第三陣営。昼の議論中に、勝利すると思う陣営を1つ予想できます（昼時間中なら何度でも選び直せます）。村人陣営と人狼陣営は常に選べて、単独勝利する第三陣営の選択肢は、その役職が初期役職か中央カードに含まれるときだけ出ます。村人陣営か人狼陣営の勝利を当てると追加勝利し、単独第三陣営の勝利を当てると、その勝利を乗っ取って単独勝利します（恋人になっているときは乗っ取れません）。予想は最終盤面で勝負師のカードを持っている人だけが数えられ、封印されていると予想しても当たりません。"},
groups: { "transform:silver_shadow": 33}, // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW。第三陣営の役職は必ずここに入れる）
achievements: W.achievements,
// CPU: 本物は半分の確率で「勝負師CO」（予想の中身は結果発表の勝負師情報で分かる。予想屋と同じ形）。しないときは村人などを騙る（cpu.js の既定）
cpuClaim(k, g, p, r, i, c) { if (Math.random() < 0.5) { c.co = "wagerer"; return true;} return false;},
cpuLie: { role: "wagerer", weight: 3, order: 19, claim: () => ({ co: "wagerer", result: null})},
cpuPick, cpuSpeak,
// 夜の画面: 夜の行動がない勝負師向けの説明
uiNight: {
idle(X) {
if (X.logs) return null;
return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼の議論中に、昼能力ボタンから<strong>勝利すると思う陣営</strong>を予想できます（昼時間中なら何度でも選び直せます）。</p>`;
},
},
stageResult: {
// 作者メモ: 全員がめくれたあと・勝利陣営が出る前に、予想した勝負師の紙が横に並んで出て、文字が同時に1文字ずつ出る
// （stage.js の startResult が playLadder の直前に呼ぶ。紙の見た目は変化公開の紙 tfp-paper と同じ。1文字ごとに se_reveal_text が鳴る）
wagerer: { order: 1, run(R) {
const res = R.res, papers = res.wagererPapers || [];
if (!papers.length || res.abandoned) return;
const texts = papers.map((x) => `勝負師${x.name}は・・・${x.label}の勝利を望みました！`);
const maxLen = Math.max(...texts.map((t) => [...t].length));
const STEP = 45, HOLD = 1500, t0 = R.t;
R.later(() => {
document.querySelectorAll(".wgr-wrap").forEach((e) => e.remove());
const wrap = document.createElement("div"); wrap.className = "wgr-wrap";
wrap.innerHTML = `<div class="wgr-dim"></div><div class="wgr-papers">${papers.map((x, i) => `<div class="tfp-paper wgr-paper"><div class="wgr-paper__h">勝負師</div><div class="wgr-paper__t" data-wgr="${i}"></div></div>`).join("")}</div>`;
document.body.appendChild(wrap);
}, t0);
for (let s = 0; s < maxLen; s++) { // 全紙同時に1文字ずつ（長い文の紙が終わるまで続く）
R.later(() => {
document.querySelectorAll("[data-wgr]").forEach((el) => { const full = texts[+el.getAttribute("data-wgr")]; if (full) el.textContent = [...full].slice(0, s + 1).join("");});
if (ONW.sound && s % 3 === 0) ONW.sound.se("reveal_text"); // SE: 紙に文字が出る音（変化公開と同じ。3文字に1回）
}, t0 + 350 + s * STEP);
}
const end = t0 + 350 + maxLen * STEP + HOLD;
R.later(() => { const w = document.querySelector(".wgr-wrap"); if (w) w.classList.add("wgr-out");}, end);
R.later(() => { document.querySelectorAll(".wgr-wrap").forEach((e) => e.remove());}, end + 650);
R.t = end + 650;
}},
clear: () => { if (typeof document!== "undefined") document.querySelectorAll(".wgr-wrap").forEach((e) => e.remove());}, // スキップ時: 紙を消す
},
});
})(window.ONW);
