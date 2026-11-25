/**
* hokma.js — ホクマー（村人陣営 / deck 130 / 発案: ダイ / 元ネタ: ロボトミーカンパニー）
*
*
* ・夜の能力はない。昼の議論中に「昼能力」ボタンから、対象を選ばずに議論時間を10秒短縮できる。
* ・何度でも使える（マイクラ版 main.js: 使用済みで止める役職の例外リストに HOKMA が入っている）。
* 使うたびに g.hokmaUseCount[席] += 1 し、昼タイマーの残りが10秒短くなる。
* マイクラ版は「短縮リクエスト」を溜めてタイマーの毎秒処理で残りに反映するが、Web版は
* ホストの g.remain をその場で10秒減らし、tick を送り直して全員へ即時反映する（等価）。
* ・封印されているときは使えない（マイクラ版: 封印中は封印の失敗文が出て、使用にも数えない）。
* → ONW.seal.dayBlocked で判定（dictopen の封印分岐では「使用できません」が出る）。
* ・演出（作者指定）: 使うたびに全員の画面に「時計が薄く浮き出て針が進む」演出が出る（hokmafx / playFx）。
* だれが使ったかは載せない（短縮そのものは全員に見える盤面情報なので、演出も全員向け）。
* ・結果発表の「昼行動結果」に「ホクマー ○○ はN回能力を使っていました。」を出す
* （マイクラ版 vote.js buildDayActionResultLines と同じ。模倣の人狼が使った分はマイクラ版どおり出さない）。
* ・勝利条件は通常の村人陣営（追加勝利・単独勝利なし）。
*
*
* ・使えるのは実効役職がホクマーの人（ONW.mimic.actRole で判定）: 酔っ払い（酔いが覚めてから）・
* 墓荒らし・ドッペルゲンガー・コスプレイヤー経由でホクマーになった人も使える。模倣の人狼が模倣していても使える。
* ・ハッキング対象外には入っていない（マイクラ版に偽の昼能力がある）: 銀狼にハッキングされて
* ホクマーを思い込んだ人は、偽の画面（hokmaok）が開き、使うと偽の文「昼時間を10秒縮めました。」だけが出る
* （silver_wolf.js の DAY.hokma。効果なし・タイマーは動かない）。マイクラ版の偽ガード
* （openSilverWolfFakeDayAction）は繰り返し対象に HOKMA を含まないので、偽は1回だけ（本物は何度でも）。
* ・変化候補: 光の使徒の変化先に入る（マイクラ版 TRANSFORM_ROLE_GROUPS[LIGHT_APOSTLE] に HOKMA）。
* 闇の化身（人狼・狂人系のみ）・銀色の影（第三陣営のみ）には入らない。
* 模倣: マイクラ版 NON_MIMICABLE_ROLES に無いので模倣できる（Web版 ONW.mimic 側も自動で候補に入る）。
* コスプレ: cosplayer.js の ELIGIBLE に登録済み。シャッフラー: マイクラ版 shufflerEligibleRoles の
* 除外に無いので山札に入る（Web版 ONW.shuffler.pool も自動で含む）。ペルソナは Web版未実装。
* ・乞食: マイクラ版 isBeggarSwapExcludedTarget の除外に無いので、死んだホクマーは乞食に取れる
* （Web版 beggar.js の EXCLUDED_ROLES にも無い＝変更なし）。
* ・シナジー: マイクラ版にホクマー固有のシナジールールは無い（ONW.SYNERGY_RULES への追加なし）。
* カルメンの対象リスト（roles.js CARMEN_TARGET_ROLES）には登録済み。
* ・罠師・ペルソナは Web版未実装のため、マイクラ版にある「罠チェック」「ペルソナのめくり」は対象外。
*
*
* ・本物のホクマーCPUは「ホクマーCO」をする（cpuClaim。結果は言わない＝マイクラ版 cpu.js に
* ホクマーの自動使用は無く、Web版も CPU は昼能力を勝手に使わない方針どおり）。
* ・騙りはしない（cpuLie なし）: マイクラ版は昼能力の役職を騙りの候補から外している。
* ・デバッグの「昼能力」タブで使わせたときだけ、net.js hostHokma が cpuSpeak を呼び、
* 「昼時間を短縮していました。」と言う（結果開示の分類。docs/cpu-speech.md）。
* ・COボタンの結果開示は対象を選ばず「昼時間を短縮していました。」の1択（マイクラ版 main.js の
* ホクマーCO結果と同じ文。co.js の step "hokma"）。
* ・実績（マイクラ版 stats.js）: first_hokma「沈黙には対価が求められるのです」/
* win_hokma「過去を受け入れ、未来を創り出す瞳」/ hokma_loss「意味もなく時間を無駄にしないでくだされ」。
* Web版には実績の保存が無いので、判定関数だけ返す（予想屋・イカロスと同じ形）。
*
* 状態: g.hokmaUseCount = { 席ID: 使った回数}（ホスト権威。net.js の AUTH_KEYS / HOST_ONLY_KEYS 登録済み）。
* 呼び出し: net.js の hostHokma → ONW.hokma.canUse / apply。詳細は docs/hochmar.md。
*/
(function (ONW) {
const R = () => ONW.ROLE;
const isDead = (g, id) => (g.deadIds || []).includes(id);

/** 昼能力を使えるか（実効役職がホクマー・生存・封印されていない・酔いが覚めている。回数制限なし） */
function canUse(g, id) {
if (!g || g.allDeadSkip || g.dictator || g.libraFlashing) return false;
if (g.phase!== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false; // 昼のタイマーが動き出す前（変化公開・新聞などの紙を出している間）は使えない
if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id])!== R().HOKMA) return false; // 模倣の人狼がホクマーを模倣していても使える
if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false; // 封印の狂人に封印されている: 昼能力は使えない（使用にも数えない）
if (ONW.hiddenDrunk(g, id) || isDead(g, id)) return false;
return true;
}

/** 使った回数 */
function useCountOf(g, id) { return ((g && g.hokmaUseCount) || {})[id] || 0;}

/**
* 昼能力を使う（ホストのみ）: 回数を +1 し、昼タイマーの残り（g.remain）を10秒短くする。
* 戻り値 { count} / 使えなければ null。
*/
function apply(g, id) {
if (!canUse(g, id)) return null;
const counts = g.hokmaUseCount = g.hokmaUseCount || {};
counts[id] = (counts[id] || 0) + 1;
if (typeof g.remain === "number") g.remain = Math.max(0, g.remain - 10);
return { count: counts[id]};
}

/** 本人に出す文（マイクラ版の通知「ホクマー通知 / 昼時間を10秒短縮しました。」の本文） */
const doneText = () => "昼時間を10秒短縮しました。";

/** 結果発表の「昼行動結果」の行（マイクラ版 buildDayActionResultLines と同じ。模倣の人狼が使った分は出さない） */
function resultLines(g, nm, rn) {
const counts = (g && g.hokmaUseCount) || {}, out = [];
(g.players || []).forEach((p) => {
const n = counts[p.id] || 0;
if (!n) return;
if ((g.currentRoles || {})[p.id] === R().MIMIC_WOLF) return; // マイクラ版: isMimicWolfId の持ち主は結果行から除く
out.push(`${rn(R().HOKMA)} ${nm(p.id)} は${n}回能力を使っていました。`);
});
return out;
}

// ======================================================================
// 使うたびに全員の画面に出る（hokmafx を受けた画面が playFx を呼ぶ）。
// 薄く浮き出た時計の針が、短い間にぐるっと進む（分針2周・時針60度）。だれが使ったかは出さない。
// ======================================================================
let fxUntil = 0;
function playFx() {
if (typeof document === "undefined" ||!document.body || document.hidden) return 0;
const now = Date.now(); if (now < fxUntil) return 0; fxUntil = now + 1900; // 連続使用でも演出が重ならないようにする
const wrap = document.createElement("div");
wrap.className = "hk-fx";
wrap.innerHTML = `<div class="hk-clock"><div class="hk-face"></div><div class="hk-hand hk-hour"></div><div class="hk-hand hk-min"></div><div class="hk-pin"></div></div>`;
document.body.appendChild(wrap);
const opt = { duration: 1500, easing: "cubic-bezier(.3,.6,.4,1)", fill: "forwards"};
const min = wrap.querySelector(".hk-min"), hour = wrap.querySelector(".hk-hour");
if (min && min.animate) min.animate([{ transform: "rotate(0deg)"}, { transform: "rotate(720deg)"}], opt);
if (hour && hour.animate) hour.animate([{ transform: "rotate(0deg)"}, { transform: "rotate(60deg)"}], opt);
if (wrap.animate) wrap.animate([{ opacity: 0}, { opacity: 1, offset: 0.18}, { opacity: 1, offset: 0.75}, { opacity: 0}], { duration: 1900, easing: "ease-out", fill: "forwards"});
setTimeout(() => wrap.remove(), 2000);
return 1900;
}

// ======================================================================
// マイクラ版 cpu.js / main.js / stats.js のホクマーに合わせる。
// ======================================================================
const coText = () => "昼時間を短縮していました。"; // マイクラ版 main.js: ホクマーCOの結果（対象なし・固定文）
const coShort = () => "昼時間を短縮した";
/** 昼能力を使ったあとのCPUの発言（net.js hostHokma が、使ったのがCPUで生きているときに呼ぶ。結果開示の分類） */
function cpuSpeak(k, g, p, e) {
if (!e) return [];
return [{ p, text: coText(), short: coShort(), result: true, claim: { kind: "hokma"}, gap: 3500}];
}
/**
* 実績（マイクラ版 stats.js と同じ条件）:
* first_hokma = 初期役職か最終役職がホクマー（マイクラ版は「いままでにホクマーになった」履歴判定。
* Web版に保存が無いので、この試合の初期・最終で判定する。予想屋の first_predictor と同じ形）/
* win_hokma = 最終役職がホクマーで勝利 / hokma_loss = 最終役職がホクマーで敗北。
*/
function achievements(g, id, won) {
const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
if (ini === R().HOKMA || cur === R().HOKMA) out.push("first_hokma");
if (cur === R().HOKMA) out.push(won? "win_hokma": "hokma_loss");
return out;
}

ONW.hokma = { canUse, useCountOf, apply, doneText, resultLines, achievements, coText, playFx};

ONW.defineRole("hokma", {
info: { sealTarget: true, deck: 130, name: "ホクマー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17,
desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから、議論時間を10秒短縮できます。何度でも使えます（使うたびに10秒ずつ短くなります）。封印されているときは使えません。使うと全員の画面に時計が薄く浮き出て針が進む演出が出ます（だれが使ったかは分かりません）。使えるのは最終的にホクマーを持っている人で、酔っ払いは酔いが覚めてからです。"},
// CPU: 本物は必ず「ホクマーCO」（結果なし）。騙りはしない。使わせたときの発言は cpuSpeak
cpuClaim(k, g, p, r, i, c) { c.co = "hokma";},
cpuSpeak,
// 結果開示(COボタン・co.js が kind で引く): 対象を選ばず「昼時間を短縮していました。」を言うだけ（co.js の step "hokma" が fixedText を出す）
coResult: { kind: "hokma", fixedText: coText(), fixedShort: coShort()},
groups: { "transform:light_apostle": 55}, // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 53）で決まる（番号は所属を表すだけ）
// 夜の画面: 夜の行動がないホクマー向けの説明
uiNight: {
idle(X) {
if (X.logs) return null;
return `<p class="night-step__hint">あなたに夜の行動はありません。<br>昼の議論中に、昼能力ボタンから<strong>議論時間を10秒短縮</strong>できます（何度でも使えます）。</p>`;
},
},
});
})(window.ONW);
