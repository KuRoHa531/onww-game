/**
* 鈴の巫女（マイクラ版 BELL_MIKO を参考）: 村人陣営・受動役職（夜の行動はない）。
* ・マイクラ版の説明文: 「昼開始時、自身が夜の間に能力を使われた回数分だけ鈴の音が鳴ります。
* また、自身に昼能力が使われるたびに鈴の音が鳴ります。」（配布時説明は js/role-desc-mc.js の転記が正）
*
*
* ・記録の入口は龍の狂人・モーゼスと同じ ONW.watcher.touch（実際に能力が届いたときだけ通る共通入口）。
* watcher.js の W.touch から ONW.bellMiko.noteTouch が呼ばれる。
* ・夜（と朝のうち）: 対象になった「席」ごとに回数を貯める（g.bellNightCount）。誰が最終的に鈴の巫女になるかは
* 夜の間は確定しないため、対象側の条件（封印・ハッキング・酔い）は見ずに全席ぶん貯め、行使者も記録する
* （g.bellNightActors。実績 bell_miko_multi_ring 用）。同じ能力の複数対象は対象ごとに1回ずつ数える。
* ・昼: その時点で実効役職が鈴の巫女の人に対象が届いたときだけ数える（g.bellDayCount / g.bellDayRung）。
* 自分に使ったときは数えない（マイクラ版の昼ループの targetId!== actorId）。封印されている・
* ハッキングされている鈴の巫女には数えない。酔い覚め後に遅れて使われた夜能力（昼フェーズの朝連鎖）も
* マイクラ版 registerBellMikoLateNightTouchAsDay と同じく「昼の鈴」として数える（Web版では昼フェーズの
* W.touch が同じ入口に来る）。
*
*
* ・待機時間（settleMsg）: 実効役職が鈴の巫女で、ハッキングされておらず、封印されていない持ち主へ、
* 夜の回数ぶんをまとめて1回通知する。文はマイクラ版どおり「鈴の音が聞こえました。」（1回）/
* 「鈴の音がN回聞こえました。」（N回）。情報確認（hold）にも同じ文が残る（第6バッチ共通指示）。
* 演出データ out.bellRing（持ち主の席を回数ぶん並べた配列）→ クライアントの stageSettle で
* ui.showBell(回数) が 🔔 バナーを回数ぶん出し、SE「bell」が回数ぶん鳴る。
* ・酔っ払い中の持ち主には待機時間では出さず、未通知として貯めておき、酔いが覚めた瞬間（soberReveal）に
* まとめて鳴らす（マイクラ版 flushBellMikoRingsForPlayer の酔い覚め経路と同じ）。
* ・昼に能力を使われたら、その場で（net.js の hostBellDay スイープが最大1秒以内に）bellnews で通知し、
* バナー＋SEが1回鳴る。昼の間に鈴の巫女になった人（墓荒らし経由など）は dayNotice で夜の回数を種まきする
* （マイクラ版 notifyBellMikoAtDayStart が昼の複数箇所から呼ばれるのと同じ）。
* ・回数が0のときは通知しない（マイクラ版 flush の count <= 0 と同じ）。結果情報には0回でも載る。
*
*
* ・本物の鈴の巫女がハッキングされている間は通知は出ない（マイクラ版 notifyBellMikoAtDayStart の hack 除外）。
* ・鈴の巫女と思い込んだ人には偽の通知: 回数はマイクラ版 extraRoles の偽鈴カウント
* （1 + random × 上限。上限 = min(参加者数-1, 場にある「夜に対象選択がありうる役職」の種類数)、最低1）。
* 偽の回数は g.hackPub に1回だけ決めて保存し、再入室でも同じ。演出（バナー＋SE）も本物と同じ形で出る。
*
*
* ・光の使徒の変化先にのみ入る（村人陣営）。闇の化身・銀色の影の対象外。
* ・コスプレイヤーの変化先に入る（cosplayer.js の ELIGIBLE に最初から入っている）。
* ・シャッフラーの山札に入る（マイクラ版 shufflerEligibleRoles の除外に無い）。
* ・模倣の人狼は模倣できる（NON_MIMICABLE_ROLES に無い）。ペルソナの仮面候補からも外れていない。
* ・封印対象ではない（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っていない）。カルメン・黄泉・鍵師の対象外。
*
* 鈴の巫女が出る闇鍋には「鈴が鳴りうる役職」（マイクラ版 YAMINABE_BELL_MIKO_TARGET_ROLES、55役）を
* 合わせて最低2枚出す（マイクラ版は 50% で2人以上・50% で3人以上の抽選だが、Web版の個数ルールに確率の
* 仕組みが無いため最低2枚で置き換えた。roles.js の SYNERGY_COUNT_RULES）。
*
* 「鈴の巫女 {名前}は夜に{夜}回、昼に{昼}回鈴の音を聞いていました。」（マイクラ版 vote.js の鈴の巫女情報。
* 最終役職が鈴の巫女の人だけ）。
* マイクラ版の鈴の巫女COフォーム: 夜に鳴った回数（0〜10）を選ぶ → 「夜に鈴の音がN回聞こえました。」、
* 続けて昼に聞こえたかどうかを選ぶ → 「鈴の音が聞こえました。」/「鈴の音が聞こえませんでした。」（co.js の kind "bell"）。
* 結果開示で夜の回数を言う（マイクラ版 cpu.js: 「夜の間にN回鈴が鳴りました」/「夜の間に鈴は鳴りませんでした」）。
* 騙りは回数を [0,0,1,1,2,3] から選ぶ（マイクラ版と同じ）。
* 鈴の巫女には夜・昼の能力が無いので、デバッグの能力先指定（debug.js ABILITY）の対象にはならない。
* 状態: g.bellNightCount / g.bellDayCount / g.bellUnnotified = { 席ID: 回数}、g.bellNightActors = { 席ID: [行使者ID]}、
* g.bellDayRung / g.bellSeeded = { 席ID: true}（すべて人に付く記録。カードには付かない＝マイクラ版と同じ。
* net.startGame が {} に戻し、ホスト引き継ぎキーにも追加済み）
*/
(function (ONW) {
const ID = "bell_miko";
const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
const eff = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);
const DAY = () => ONW.PHASE.ONLINE_DAY;

/** マイクラ版 NIGHT_TARGET_SELECTABLE_ROLES（state.js）: 銀狼の偽鈴カウントの上限計算に使う「夜に対象選択がありうる役職」。
* Web版に未移植の役職（patch / trap_master）も文字列のまま入れてある（場に存在しないので数に影響しない） */
const NIGHT_TARGET_SELECTABLE = new Set([
"seer", "apprentice_seer", "whimsical_seer", "fake_seer", "mad_seer", "robber", "relic_robber",
"troublemaker", "doppelganger", "love_tanner", "freeter", "visitor", "major", "carmen",
"trailblazer", "eraser_wolf", "finger_reader", "matthias", "chesed", "nanoka", "hotaru",
"mercenary", "thread_spinner", "command_wolf", "exposed_madman", "gremlin", "pure_lover",
"evil_woman", "cupid", "heartbreaker", "shuffler", "keymaster", "seal_madman", "dog_madman",
"boar_madman", "elfrinde", "avenger", "watchdog", "prankster", "reverser", "demon_duke",
"profiler", "lawyer", "mapo_wolf", "cosplayer", "mimic_wolf", "patch", "lookout", "trap_master",
]);

const init = (g) => {
g.bellNightCount = g.bellNightCount || {};
g.bellNightActors = g.bellNightActors || {};
g.bellDayCount = g.bellDayCount || {};
g.bellUnnotified = g.bellUnnotified || {};
g.bellDayRung = g.bellDayRung || {};
g.bellSeeded = g.bellSeeded || {};
};
const nightCount = (g, id) => (init(g), Number(g.bellNightCount[id]) || 0);
const dayCount = (g, id) => (init(g), Number(g.bellDayCount[id]) || 0);
/** 通知の文（マイクラ版 鈴通知） */
const ringText = (n) => (n === 1? "鈴の音が聞こえました。": `鈴の音が${n}回聞こえました。`);

/** 能力が届いた記録（ONW.watcher.touch から呼ばれる共通入口。夜=席ごとに貯める / 昼=現在の鈴の巫女だけ数える） */
function noteTouch(g, actor, targets) {
if (!g ||!actor) return;
init(g);
const uniq = [...new Set(targets || [])].filter(Boolean);
if (!uniq.length) return;
if (g.phase === DAY()) {
uniq.forEach((t) => {
if (t === actor) return; // 自分に使ったときは数えない（マイクラ版の昼ループ）
if (eff(g, t)!== ID) return; // その時点で鈴の巫女の人だけ（マイクラ版 registerBellMikoDayTouch）
if (ONW.seal && ONW.seal.is(g, t)) return;
if ((g.hackRole || {})[t]) return; // ハッキングされている鈴の巫女には鳴らない
g.bellDayCount[t] = (Number(g.bellDayCount[t]) || 0) + 1;
g.bellDayRung[t] = true;
g.bellUnnotified[t] = (Number(g.bellUnnotified[t]) || 0) + 1; // 酔っ払い中なら貯めて、覚めたときにまとめて鳴らす（配信側が判定）
});
} else {
uniq.forEach((t) => {
g.bellNightCount[t] = (Number(g.bellNightCount[t]) || 0) + 1; // 席ごとに貯める（誰が鈴の巫女になるかは昼開始時に判定）
const a = g.bellNightActors[t] = Array.isArray(g.bellNightActors[t])? g.bellNightActors[t]: [];
if (!a.includes(actor)) a.push(actor);
});
}
}

/**
* 1人ぶんの「まだ鳴らしていない鈴」を配信できる状態なら配信する。戻り値: 鳴らした回数（0 = 鳴らさなかった）。
* sendFn(id, count) があればその場で送る（昼・酔い覚め・dayNotice）。待機時間は settleMsg が sendFn なしで
* 呼び、戻り値から演出データ（bellRing）を作る。
* ・夜の回数の種まき（bellSeeded）はここで1回だけ。ハッキング中・封印中は種まきもしない（マイクラ版と同じ）。
* ・酔っ払い中は種まきだけして、鳴らすのは酔いが覚めてから。
*/
function deliver(g, id, sendFn) {
init(g);
if (eff(g, id)!== ID) return 0;
if ((g.hackRole || {})[id]) return 0; // ハッキングされている本物の鈴の巫女には出さない
if (ONW.seal && ONW.seal.is(g, id)) return 0; // 封印されていると鳴らない
if (!g.bellSeeded[id]) {
g.bellSeeded[id] = true;
g.bellUnnotified[id] = (Number(g.bellUnnotified[id]) || 0) + nightCount(g, id);
}
if (ONW.hiddenDrunk(g, id)) return 0; // 酔っ払い中は貯めておく（酔い覚めでまとめて）
const n = Number(g.bellUnnotified[id]) || 0;
if (n <= 0) return 0;
g.bellUnnotified[id] = 0;
if (sendFn) sendFn(id, n);
return n;
}
/** 全員ぶんの未配信の鈴を sendFn(id, count) で流す（net.js の hostBellDay スイープ・dayNotice から） */
function deliverAll(g, sendFn) {
(g.players || []).forEach((p) => deliver(g, p.id, sendFn));
}

/** 銀狼の偽鈴カウント（マイクラ版 extraRoles の BELL_MIKO 偽結果） */
function fakeCount(g) {
const inPlay = new Set([...Object.values(g.currentRoles || {}),...(g.center || [])].filter((r) => r && NIGHT_TARGET_SELECTABLE.has(r)));
const upper = Math.max(1, Math.min(Math.max(1, (g.players || []).length - 1), inPlay.size || 1));
return 1 + Math.floor(Math.random() * upper);
}

/** 結果発表の「鈴の巫女情報」の行（マイクラ版 vote.js。最終役職が鈴の巫女の人だけ） */
function lines(g, nm2) {
return (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID)
.map((p) => `鈴の巫女 ${nm2(p.id)} は夜に ${nightCount(g, p.id)} 回、昼に ${dayCount(g, p.id)} 回鈴の音を聞いていました。`);
}

function achievements(g, id, won) {
const out = [], initR = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
if (initR === ID) out.push("first_bell_miko");
if (fin!== ID) return out;
if (won) out.push("win_bell_miko"); else out.push("lose_bell_miko");
if (nightCount(g, id) === 0) out.push("bell_miko_silent_night");
if (((g.bellNightActors || {})[id] || []).length >= 2) out.push("bell_miko_multi_ring");
if ((g.bellDayRung || {})[id]) out.push("bell_miko_day_ring");
return out;
}

const B = (ONW.bellMiko = { noteTouch, deliver, deliverAll, nightCount, dayCount, ringText, fakeCount, lines, achievements, NIGHT_TARGET_SELECTABLE});

/** CPUの結果開示の文（マイクラ版 cpu.js の鈴の巫女） */
const claimOf = (count) => ({
short: count > 0? `夜 ${count}回`: "夜 0回",
text: count > 0? `夜の間に${count}回鈴が鳴りました。`: "夜の間に鈴は鳴りませんでした。",
claim: { kind: "bell", count},
});
function cpuClaim(k, g, p, r, i, c) {
c.co = ID;
c.result = claimOf(nightCount(g, p.id));
}
/** 騙りの結果開示: 回数はマイクラ版と同じ [0,0,1,1,2,3] から選ぶ */
function lieClaim(k, g, p, others, selfRole, co) {
const count = [0, 0, 1, 1, 2, 3][Math.floor(Math.random() * 6)];
return { co, result: claimOf(count)};
}

ONW.defineRole(ID, {
info: { deck: 162, count: 0, name: "鈴の巫女", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 23.8,
desc: "村人陣営。昼開始時、自身が夜の間に能力を使われた回数分だけ鈴の音が鳴ります。また、自身に昼能力が使われるたびに鈴の音が鳴ります。"},
groups: { "transform:light_apostle": 62}, // 光の使徒の変化先（村人系）のみ
achievements,
uiNight: {
idle(X) {
if (X.logs) return null;
return `<p class="night-step__hint">あなたに夜の行動はありません。<br>夜の間に能力を使われた回数ぶん、昼開始時に鈴の音が鳴ります。昼能力を使われたときもその場で鳴ります。</p>`;
},
},
cpuLie: { role: "bell_miko", weight: 20, order: 13, claim: lieClaim}, // 騙りで名乗る確率の重みと、騙りの結果開示
cpuClaim, // CPUの昼の発言（CO・結果開示）
/**
* 待機時間の知らせ: 現在の鈴の巫女の持ち主へ、夜の間に鳴った鈴をまとめて知らせる（マイクラ版 notifyBellMikoAtDayStart）。
* 演出は out.bellRing（持ち主の席×回数）→ stageSettle でバナー＋SEが回数ぶん出る（作者メモ）。
* ハッキングされて鈴の巫女と思い込んでいる人には偽の回数の通知（マイクラ版の偽鈴カウント）。
*/
settleMsg(c, p, mode) {
const g = c.g, out = { logs: []};
if (!p.isCpu && ONW.hack && ONW.hack.isFakeUi(g, p.id)) { // 銀狼にハッキングされた人: 本当の通知は出ず、鈴の巫女と思い込んでいれば偽の通知（その人にだけ）
if ((g.hackRole || {})[p.id]!== ID || (ONW.seal && ONW.seal.is(g, p.id))) return out;
const pub = (g.hackPub = g.hackPub || {}), key = "bellFake:" + p.id;
let f = pub[key];
if (f == null) {
if (mode!== "settle") return out;
f = pub[key] = fakeCount(g);
}
out.logs.push(ringText(f));
out.bellRing = Array.from({ length: f}, () => p.id);
return out;
}
const n = deliver(g, p.id, null); // 種まき＋未通知の消化（酔っ払い中・封印中・ハッキング中は 0）
if (n > 0) {
out.logs.push(ringText(n));
out.bellRing = Array.from({ length: n}, () => p.id);
}
return out;
},
/** 待機時間の演出（作者メモ）: 鈴の巫女本人の画面でだけ、鈴のバナーが回数ぶん出て、SEが回数ぶん鳴る */
stageSettle: {
field: "settleBellRing", shown: "settleBellRingShown",
run: { order: 29, run(ids, SK) {
if (ids && ids.length && ONW.ui && ONW.ui.showBell) ONW.ui.showBell(ids.length);
}},
end(SK) { if (ONW.ui && ONW.ui.clearBell) ONW.ui.clearBell();}, // 昼になったらバナーを消す（保険）
},
/** 酔いが覚めた瞬間: 待機時間に出せなかった鈴（夜の回数＋昼に貯まった分）をまとめて鳴らす */
soberReveal: { order: 30, run(c, ids) {
const g = c.g;
ids.forEach((id) => deliver(g, id, (i, n) => c.send(i, { t: "bellnews", count: n, text: ringText(n)})));
}},
/** 昼の間に鈴の巫女になった人へ: 夜の回数を種まきして、鳴らせればその場で鳴らす（マイクラ版 notifyBellMikoAtDayStart の昼の呼び出し） */
dayNotice(c) {
const g = c.g;
(g.players || []).filter((p) =>!p.isCpu).forEach((p) => deliver(g, p.id, (i, n) => { c.hold(i, ringText(n)); c.send(i, { t: "bellnews", count: n, text: ringText(n)});}));
},
// 結果開示(COボタン)の流れ: 夜に鳴った回数を選ぶ → 昼に聞こえたかどうかを選ぶ（マイクラ版の鈴の巫女COフォーム。co.js の kind "bell"）
coResult: { kind: "bell"},
});
})(window.ONW = window.ONW || {});
