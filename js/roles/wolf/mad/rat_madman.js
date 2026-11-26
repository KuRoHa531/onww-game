/**
* 鼠の狂人（人狼陣営・狂人系・干支狂人）: 妖精さん・御乱心に続く「昼能力」の役職（人狼陣営では初の昼能力）。
* 昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選ぶと、その人のカードの裏に「逃げ込む」（1日1回）。
* マイクラ版（minecraftver.mcpack の main.js / vote.js / night.js / state.js の RAT_MADMAN）に合わせる。
*
*
* ・夜の能力はない。使えるのは、最終盤面で鼠の狂人を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ
* （カルメンに囁かれた人は2回まで。その場合、あとに逃げ込んだ先が有効）。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
* ・選べるのは、生きている自分以外の人。封印されていると使えない（使おうとしても失敗し、使用済みになる）。
* ・逃げ込んでいる鼠は、逃げ込んだ先が死亡しない限り、投票の追放・噛殺・爆殺などでは死亡しない。
* 投票では「傭兵の護衛 → 騎士の護衛 → 鼠の保護 → 従者/少佐/マティアスの身代わり」の順で判定され（マイクラ版 applyRatAndDogMadmanProtection の位置）、
* 追放が決まっても取り消される。ただし呪術の人狼の呪殺は貫通する（マイクラ版 isPiercingVoteKillReason）。
* ・昼間に保安官やヴァニティに撃たれた場合は、ふつうに執行される（保護は投票の解決だけ。マイクラ版も昼の死亡は投票まで持ち越しでなく即死）。
* ・逃げ込んだ先が死亡した場合は後追いする（投票・連鎖・昼の死亡すべて。死因は「後追い」）。
* 逃げ込んだ先が第三陣営だった場合は、その人が生きていても、投票の終了時に無条件で後追いする（陣営は最終役職の静的な陣営で判定。マイクラ版 baseTeamOf）。
* ・逃げたことは本人以外には結果発表まで分からない。結果発表の役職情報に「鼠の狂人○○は○○に逃げ込んでいました。」が出る。
* ・記録は「持ち主ID → 逃げ込んだ先のID」（g.ratHideTarget。ONW.ROLE_BOUND_KEYS）。
* カードが動けば記録も新しい持ち主へ移る。逃げるのは昼（夜の移動がすべて終わったあと）なので、コピー系（グレムリン・ドッペル）が
* 記録を複製する場面は実際には起きない（マイクラ版も transferRoleBoundSpecialData の対象だが、夜の時点では常に空）。
* ・判定は「最終盤面」の役職（ONW.mimic.actRole）で行う: 墓荒らし・怪盗で鼠の狂人のカードを手にした人、
* ドッペルゲンガーが鼠の狂人をコピーした人、酔いが覚めた酔っ払い（酔い中は使えない）が使える。模倣の人狼が鼠の狂人を模倣していても使える。
* ・黄泉は逃げ込みの状態を断ち切らない（マイクラ版 yomiCutStates に鼠の狂人の項目は無い）。
* ・乞食は鼠の狂人を取れる（マイクラ版 isBeggarSwapExcludedTarget に鼠の狂人は入っていない）。
*
*
* ・使うとき（本人の画面だけ。逃げたことは秘密）: 自分のカードが鼠の狂人でめくれる → 鼠のカードが逃げた人のカードの裏へ移動する → 元の場所は空白のカードになる（play）。
* ・結果発表: 逃げ込んだ鼠の席は、汎用のめくりでは「空白のカード」でめくれる（net.js の buildResultObj が res.history の role を差し替える。乞食のネタバレ修正と同じ考え方）。
* 後追いが発生する場合は、逃げた人のカードがめくれたあと、そのカードがズレて裏から鼠のカードが出てきて、元の人の場所に戻って後追いでめくれる（stage.js の flipChain の専用場面）。
* 後追いしなかった鼠は、全員めくれたあと（afterRest）に、鼠のカードが逃げ先の裏から元の席に戻ってきて正体が明かされる。
*
* 状態: g.ratHideTarget = { 持ち主ID: 逃げ込んだ先のID}（現在の逃げ先。試合ごとに net.startGame が {} に戻す）
* g.ratHideLog = [{ by, target},...]（使った順。使用回数・結果発表の文用）
* g.ratProtected = [守られた鼠のID]（vote.resolveElimination のたびに決め直す）
* 呼び出し: net.js の hostRat(ホスト) → ONW.ratMadman.canUse / targets / apply。投票の保護は vote.js の resolveElimination が
* ONW.ratMadman.applyVoteProtection を呼び、後追いは resolveChain が followersOf / thirdFollowers を呼ぶ。
*/
(function (ONW) {
const R = () => ONW.ROLE;
const ID = "rat_madman";
const isDead = (g, id) => (g.deadIds || []).includes(id);
const act = (g, id) => ONW.mimic.actRole(g, id, (g.currentRoles || {})[id]);

/** 現在の逃げ先（持ち主IDで引く。逃げていない・記録が無ければ null） */
const hideTargetOf = (g, id) => (g && g.ratHideTarget && g.ratHideTarget[id]) || null;
/** この人が（もう）逃げたか（カルメンに囁かれた人は2回まで。2回目は逃げ先の上書き） */
const used = (g, id) => (g.ratHideLog || []).filter((e) => e.by === id).length >= (ONW.carmen? ONW.carmen.dayUses(g, id): 1);
/** 鼠の狂人の昼能力を使える人か（最終盤面の役職が鼠の狂人・酔いが覚めている・生きている・まだ使っていない・昼の議論中でタイマーが動いている・選べる人がいる） */
function canUse(g, id) {
if (!g || g.allDeadSkip || g.dictator) return false;
if (g.phase!== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false; // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
if (!g.currentRoles || act(g, id)!== ID) return false; // 模倣の人狼が鼠の狂人を模倣していても使える
if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false; // 封印の狂人に封印されている: 昼能力は使えない
if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
return targets(g, id).length > 0;
}
/** 逃げ込む相手として選べる人（生きている自分以外。マイクラ版 participantOptionsForDay(myId, false)） */
function targets(g, id) {
return (g.players || []).map((p) => p.id).filter((x) => x!== id &&!isDead(g, x));
}
/**
* 逃げ込みを記録する（通信・画面の処理は net.js 側）。
* 戻り値: 記録した { by, target}。条件を満たさなければ null（何も起きない）
*/
function apply(g, id, target) {
if (!target ||!targets(g, id).includes(target)) return null;
(g.ratHideTarget = g.ratHideTarget || {})[id] = target;
(g.ratHideLog = g.ratHideLog || []).push({ by: id, target});
return { by: id, target};
}
/** いま鼠の狂人として判定される人（最終盤面の役職が鼠の狂人・封印されていない。マイクラ版 roleForMimicEffect + isRoleSealed） */
function holders(g) {
return (g.players || []).map((p) => p.id).filter((id) => act(g, id) === ID &&!(ONW.seal && ONW.seal.is(g, id)));
}

// ======================================================================
//
// ======================================================================
/**
* 追放が決まった鼠を、逃げ込んでいる限り死から免れさせる（game.eliminated から外す）。
* vote.resolveElimination が「傭兵の護衛 → 騎士の護衛」のあと・「従者/少佐の身代わり」の前に呼ぶ（マイクラ版の順）。
* ・呪術の人狼の呪殺（game.curseKillIds）は貫通する: 免れない。
* ・昼中にすでに死んでいる鼠（保安官の執行など）は対象外（game.eliminated には入っていない）。
* ・後追いの内、逃げ先がこの時点で既に死んでいる分は、マイクラ版どおりここで確定させて game.ratFollowPending に積む
* （resolveChain の開始時に実行される）。判定は「この時点の死者（追放・昼の死亡・呪殺）」で行い、鼠自身がその死者に
* 含まれている場合は後追いしない（保護が優先する: 鼠と逃げ先が両方とも追放されるときは、鼠は生き残る）。
* game.ratWasExecuted（この時点で追放が決まっていた鼠）は、resolveChain 開始時の再計算でも後追いから除くために残す。
* ・逃げ先が連鎖の途中で死ぬ場合の後追いは、resolveChain の kill() 内の followersOf が処理する（そちらは保護と無関係に起きる）。
*/
function applyVoteProtection(game) {
game.ratProtected = [];
game.ratFollowPending = [];
game.ratWasExecuted = [];
if (!game.eliminated) game.eliminated = [];
const deadSet = new Set([...(game.eliminated || []), ...(game.deadIds || []), ...(game.curseKillIds || [])]); // この時点の死者（マイクラ版 applyRatAndDogMadmanProtection の deadSet）
holders(game).forEach((id) => {
const t = hideTargetOf(game, id);
if (!t) return;
if (game.eliminated.includes(id)) game.ratWasExecuted.push(id);
if (deadSet.has(t) && !deadSet.has(id)) { game.ratFollowPending.push({ rat: id, target: t }); return; } // 逃げ先が既に死んでいて、自分は死なない → 後追い（resolveChain で実行）
if (!game.eliminated.includes(id)) return;
if ((game.curseKillIds || []).includes(id)) return; // 呪殺は貫通する
game.eliminated = game.eliminated.filter((x) => x!== id);
game.mentalIds = (game.mentalIds || []).filter((x) => x!== id);
game.shockIds = (game.shockIds || []).filter((x) => x!== id);
game.ratProtected.push(id);
});
}
/** deadId が死んだことで後追いする鼠（逃げ込んだ先が deadId の鼠）。resolveChain の kill() と開始時の一括処理から呼ぶ */
function followersOf(game, deadId) {
return holders(game).filter((id) => id!== deadId && hideTargetOf(game, id) === deadId);
}
/** 第三陣営の人の裏に逃げ込んだ鼠（投票終了時に、逃げ先の生死にかかわらず無条件で後追いする。マイクラ版 baseTeamOf = 静的な陣営） */
function thirdFollowers(game) {
return holders(game).filter((id) => {
const t = hideTargetOf(game, id);
if (!t) return false;
const info = ONW.ROLE_INFO[act(game, t)];
return!!info && info.team === ONW.TEAM.THIRD;
});
}

/** 使った本人に出す文（情報確認）。マイクラ版: 「〇〇に逃げ込みました。」 */
function doneText(name) { return `${name} に逃げ込みました。`;}
/** 結果発表の「役職情報」用（マイクラ版 vote.js の干支狂人情報: 「鼠の狂人○○は○○に逃げ込んでいました。」）。逃げた人ごとに1行（最後に逃げ込んだ先） */
function lines(g, nm) {
const last = {};
(g.ratHideLog || []).forEach((e) => { last[e.by] = e.target;});
return (g.players || []).map((p) => p.id).filter((id) => last[id]).map((id) => `鼠の狂人${nm(id)}は${nm(last[id])}に逃げ込んでいました。`);
}
/**
* 結果発表用のデータ（net.js が res.ratHides として渡す）: 逃げ込んだ鼠ごとに
* { rat, target, ratName, targetName, followed: 逃げ先の後追いで死んだか, direct: 最終盤面で鼠の狂人のカードを持っているか}
* 汎用のめくりで空白カードにするのは direct の鼠だけ（模倣の人狼が模倣して逃げた場合は、カードは模倣の人狼のまま）。
*/
function resultData(g, nm) {
const last = {};
(g.ratHideLog || []).forEach((e) => { last[e.by] = e.target;});
return (g.players || []).map((p) => p.id).filter((id) => last[id] && act(g, id) === ID).map((id) => {
const target = last[id];
return { rat: id, target, ratName: nm(id), targetName: nm(target), followed: (g.chainKind || {})[id] === "follow" && (g.chainBy || {})[id] === target, direct: (g.currentRoles || {})[id] === ID};
});
}

// ======================================================================
// マイクラ版 cpu.js / main.js / stats.js の鼠の狂人に合わせる（妖精さんと同じ形）
// ・本物の鼠の狂人CPUは、昼能力を自分では使わない（マイクラ版 cpu.js の昼能力の対象に RAT_MADMAN は入っていない。
// avoidUnfixedCpuDayRoles の対象でもないので、人間との入れ替えもしない）。デバッグの「昼能力」タブで逃げさせたときは、
// net.js hostRat が cpuSpeak を呼び、「〇〇 に逃げ込んでいました。」と言う（マイクラ版 cpu.js の結果開示の文と同じ）。
// ・COは人狼陣営の共通の扱い（cpuClaim なし。統率の人狼と同じ）。結果開示（coResult）はマイクラ版 main.js の文。
// ======================================================================
const hideText = (name) => `${name} に逃げ込んでいました。`;
const hideShort = (name) => `${name} に逃げ込んだ`;
/** 逃げ込んだあとのCPUの発言（net.js hostRat が、使ったのがCPUで生きているときに呼ぶ）。[{ p, text, short, result, claim, gap}] */
function cpuSpeak(k, g, p, e) {
if (!e) return [];
const nm = k.nameOf(g, e.target);
return [{ p, text: hideText(nm), short: hideShort(nm), result: true, claim: { kind: ID, target: e.target}, gap: 3500}];
}
/** COボタンの結果開示の文。マイクラ版 main.js: 「〇〇に逃げました。」（Web版は名前のあとに空白を入れる） */
const coText = (name) => `${name} に逃げました。`;
const coShort = (name) => `${name} に逃げた`;
const CAT_ROLES = ["cat_sidhe", "black_cat", "cat_pumpkin", "schrodinger_cat"]; // 猫又・黒猫・ネコカボチャ・シュレディンガーの猫（マイクラ版 stats.js の hide_cat 判定）
const ZODIAC_MADMEN = ["ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman", "boar_madman"]; // 鼠以外の干支狂人（Web版では今後移植される。現時点では存在しないので zodiac_rat_madman は発動しない）
/**
* 実績（マイクラ版 stats.js と同じ条件。wiki の「鼠の狂人」に定義済みのもの）:
* win_rat_madman「一鼠報いる」 = 最終役職が鼠の狂人で勝利 / rat_madman_hide_target_dead「袋の鼠」 = 逃げ込んだ先が死亡した /
* rat_madman_hide_cat「窮鼠、猫を噛む」 = 猫系の役職の人に逃げ込んだ / zodiac_rat_madman「子年」 = 試合終了時に鼠以外の干支狂人が現世にいる。
* first_rat_madman「屋根裏の住人」は「いままでに鼠の狂人になった」履歴の判定（保存側）なのでここでは返さない（御乱心の first_goranshin と同じ）。
* Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（妖精さんの achievements と同じ形）。won: その人が勝ったか
*/
function achievements(g, id, won) {
const out = [], cur = (g.currentRoles || {})[id];
if (cur!== ID) return out; // 最終役職で判定（酔っ払い・墓荒らし・怪盗・ドッペル経由で鼠の狂人になった人も対象。模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
if (won) out.push("win_rat_madman");
const last = {};
(g.ratHideLog || []).forEach((e) => { last[e.by] = e.target;});
const t = hideTargetOf(g, id) || last[id];
if (t) {
if ((g.eliminated || []).includes(t) || isDead(g, t) || (g.chainIds || []).includes(t)) out.push("rat_madman_hide_target_dead");
if (CAT_ROLES.includes((g.currentRoles || {})[t])) out.push("rat_madman_hide_cat");
}
if ((g.players || []).some((p) => p.id!== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_rat_madman");
return out;
}

ONW.ratMadman = { canUse, targets, used, apply, hideTargetOf, holders, applyVoteProtection, followersOf, thirdFollowers, doneText, lines, resultData, cpuSpeak, coText, achievements, play, followFx};

ONW.defineRole(ID, {
info: { sealTarget: true, deck: 143, name: "鼠の狂人", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 1.6995,
desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜の能力はありません。昼の議論中に「昼能力」ボタンから生きている自分以外の1人を選ぶと、その人のカードの裏に逃げ込みます（1日1回）。逃げ込んでいる間は、逃げ込んだ先が死亡しない限り、投票の追放などでは死亡しません。ただし保安官やヴァニティに撃たれた場合は執行され、呪術の人狼の呪殺は防げません。逃げ込んだ先が死亡した場合は後追いします。第三陣営の人の裏に逃げ込んでいた場合は、投票の終了時に無条件で後追いします。逃げたことは結果発表まで分かりません。最終的に鼠の狂人を持っている人が使えます。"},
cpuSpeak,
// 結果開示(COボタン・co.js が kind で引く): 「鼠の狂人CO」だけで終わらせられる(noChain)。結果開示で逃げ込んだ相手を選ぶ → 「〇〇 に逃げました。」（妖精さんと同じ形）
coResult: {
kind: ID, targetLabel: "逃げ込んだ相手", noChain: true,
pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: ID, target: id}, null, "disclose", coShort(K.nameOf(id))],
},
groups: { mad: 2.996, "transform:dark_avatar": 25}, // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 108）で決まる

// 結果発表の演出（stage.js の startResult / skipResult が引く。使うデータは res.ratHides（net.js が ONW.ratMadman.resultData で作る））
// 後追いの場面は stage.js の flipChain（逃げ先のカードがズレて、裏から鼠が出てくる）。ここは後追いしなかった鼠の「戻る」場面:
// 全員めくれたあと（afterRest）に、逃げ先のカードがズレて裏から鼠のカードが出てきて、元の席に戻って鼠の狂人の面でめくれる。
// 汎用のめくりでは空白のカードでめくれている（net.js の buildResultObj が res.history の role を差し替える）ので、ここで初めて正体が見える。
// skip: 空白でめくれた鼠を、最終形（鼠の狂人）で出す
stageResult: {
afterRest(R) {
((R.res && R.res.ratHides) || []).filter((s) => s.direct &&!s.followed).forEach((s) => {
const kr = R.P(s.rat), kt = R.P(s.target), t0 = R.t;
R.later(() => {
R.setCap(`<div class="res-cap__t t-wolf">鼠の狂人</div><div>${R.esc(s.targetName)} のカードの裏に隠れていた ${R.esc(s.ratName)} が戻ってきました</div>`);
followFx(R, kt, kr);
}, t0);
R.later(() => { R.up[kr] = ID; R.glow[kr] = true; R.paint(R.G());}, t0 + 1750); // 鼠のカードが元の席に着いたら、鼠の狂人の面でめくれる
R.later(() => { delete R.glow[kr]; R.paint(R.G());}, t0 + 2550);
R.t = t0 + 2850;
});
},
skip(R) { ((R.res && R.res.ratHides) || []).forEach((s) => { if (s.direct) R.up[R.P(s.rat)] = ID;}); removeFx();},
clear(R) { removeFx();},
},
});

// ======================================================================
// カードがズレて、裏から鼠のカードが出てきて飛ぶ（乞食の flyCard と同じ作り方: 画面の上に重ねる DOM アニメーション）
// ======================================================================
const reduceMotion = () => typeof window!== "undefined" &&!!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
function removeFx() { if (typeof document!== "undefined" && document.querySelectorAll) document.querySelectorAll(".rt-fx").forEach((e) => e.remove());}
function anchorOf(R, k) {
const t = R && R.$t && R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"].tb-card`);
if (!c) return null;
const r = c.getBoundingClientRect();
return r.width > 0? r: null;
}
/** 鼠のカード（🐀＋「鼠の狂人」）が fromK の位置から toK の席へ飛ぶ。tuck = 最後に小さく・薄くなって裏へ潜り込む（使うときの演出） */
function flyRat(fromK, toK, tuck, R) {
const A = anchorOf(R || (ONW.stage && ONW.stage.kit), fromK), B = anchorOf(R || (ONW.stage && ONW.stage.kit), toK);
if (!A ||!B || typeof document === "undefined") return;
const el = document.createElement("div");
el.className = "rt-fx";
el.style.cssText = `position:fixed;left:${A.left}px;top:${A.top}px;width:${A.width}px;height:${A.height}px;border-radius:10px;background:linear-gradient(160deg,#f6d9d9,#d98c8c);border:2px solid #a33;box-shadow:0 10px 28px rgba(0,0,0,.45);z-index:900;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:left 1.05s cubic-bezier(.45,.05,.35,1),top 1.05s cubic-bezier(.45,.05,.35,1),transform 1.05s cubic-bezier(.45,.05,.35,1),opacity.35s ease;`;
el.innerHTML = `<span style="font-size:${Math.round(A.height * 0.34)}px;line-height:1">🐀</span><b style="color:#7a1f1f;font-size:${Math.max(11, Math.round(A.width * 0.16))}px">鼠の狂人</b>`;
document.body.appendChild(el);
requestAnimationFrame(() => requestAnimationFrame(() => {
el.style.left = `${B.left}px`; el.style.top = `${B.top}px`;
el.style.transform = tuck? "scale(.45)": "scale(1.04)";
if (tuck) setTimeout(() => { el.style.opacity = "0";}, 800);
}));
setTimeout(() => el.remove(), 1500);
}
/**
* 逃げ先のカードがズレて、裏から鼠のカードが出てくる場面（結果発表用。R = stage.js の結果発表の道具箱）。
* fromK = 逃げ先の席（カードがズレる） / toK = 鼠の席（鼠のカードが戻る先）。カードが表でも裏でも動く（逃げ先がめくれる順は場面によって違うため）。
*/
function followFx(R, fromK, toK) {
if (!R) return;
const t = R.$t && R.$t(), card = t && t.querySelector(`.tb-seat[data-k="${fromK}"].tb-card`);
if (card && card.animate &&!reduceMotion()) {
card.animate([{ transform: "translateX(0)"}, { transform: "translateX(42%) rotate(2.5deg)", offset: 0.3}, { transform: "translateX(42%) rotate(2.5deg)", offset: 0.72}, { transform: "translateX(0)"}], { duration: 2100, easing: "ease-in-out"});
}
setTimeout(() => flyRat(fromK, toK, false, R), reduceMotion()? 0: 420); // ズレたカードの裏から、鼠のカードが出てくる
}
/**
* 使った瞬間の演出（鼠本人の画面だけ。net.js が本人にだけ送る "ratdone"（target つき）を受け取ったら呼ぶ）。
* 自分のカードが鼠の狂人でめくれる → 鼠のカードが逃げ先のカードの裏へ移動する → 元の場所は空白のカードになる。
* 再入室で戻すときは quiet（target はあるが演出はせず、空白のカードだけ戻す）。ほかの人の画面には何も届かない（逃げたことは秘密）。
*/
function play(targetId, quiet) {
if (!targetId) return;
const K = ONW.stage && ONW.stage.kit, g = K && K.G();
if (!g || g.phase!== ONW.PHASE.ONLINE_DAY) return;
const me = ONW.net && ONW.net.myId();
if (!me) return;
const kb = `p:${me}`, kt = `p:${targetId}`;
const setBlank = () => { const K2 = ONW.stage && ONW.stage.kit; if (K2 && K2.up) { K2.up[kb] = K2.BLANK_MARK; if (K2.glow) delete K2.glow[kb]; K2.paint(K2.G());}};
if (quiet || reduceMotion()) { setBlank(); return;}
removeFx();
if (K.up) { K.up[kb] = ID; if (K.glow) K.glow[kb] = true; K.paint(g);} // 自分のカードが鼠の狂人でめくれる
if (typeof document!== "undefined") {
const card = document.querySelector(`.tb-seat[data-k="${kb}"].tb-card`);
if (card && card.animate) card.animate([{ transform: "rotateY(0deg)"}, { transform: "rotateY(180deg)"}, { transform: "rotateY(360deg)"}], { duration: 700, easing: "ease-in-out"});
}
setTimeout(() => flyRat(kb, kt, true, null), 750); // 鼠のカードが逃げ先のカードの裏へ
setTimeout(setBlank, 750 + 1200); // 元の場所は空白のカードになる
}
})(window.ONW);
