"use strict";
/**
* なのか（js/roles/neutral/nanoka.js）— 第三陣営。発案: 狐餅 / 元ネタ: 崩壊スターレイル（役職チェックリストCSV）。
* 形態の三月なのか・長夜月・羅刹も同じ発案・元ネタで、別役職としてこのファイルで定義する（内部専用。娘ちゃんと同じ扱い）。
*
*
* ・夜に、山札からめくれた3枚「長夜月 / 三月なのか / 羅刹」から1枚選んで、その役職に変化する（マイクラ版 night.js openNanokaAction。
* 3枚は固定で、コスプレイヤーのような抽選ではない。提示順はマイクラ版のボタンの順＝長夜月・三月なのか・羅刹）。
* ・鍵師にロックされている・封印されているときは変化に失敗し、変化できなかった場合は勝利できない（マイクラ版 ROLE_INFO の文どおり）。
* ・長夜月: 変化したとき、ランダムな自分以外の参加者1人に「長夜」がつく（マイクラ版 nanokaLongNightTarget）。
* 勝利: その人が自分に投票していて、かつ自分が死亡していれば追加勝利（マイクラ版 vote.js applyThirdSpecials）。
* ・三月なのか: 昼能力「写真撮影」（マイクラ版 main.js）。生きている自分以外の1人を撮ると、その人の
* 「その日の昼能力で見た最終役職（ONW.mimic.actRole）」の陣営（村人陣営 / 人狼陣営 / 第三陣営の3種だけ。
* 狂人系は人狼陣営。マイクラ版 baseTeamOf(currentDayActionRole) と同じ）が分かる。感覚の占い師と違い、
* 恋人・(+シャッフラー)・(+反転)・蜃気狼・闇堕ちなどの特別扱いは無い（マイクラ版の判定そのまま）。
* 勝利: 撮影した相手の「最終役職そのもの（actRole ではない素の最終役職）」が村人陣営なら追加勝利（マイクラ版 vote.js）。
* ・羅刹: 変化したとき、ランダムな自分以外の参加者1人が「愛する人」になる（マイクラ版 nanokaLoveTarget）。
* 勝利: 愛する人が死亡していれば、羅刹と愛する人の両方が追加勝利（マイクラ版 vote.js）。
* ・変化しなかった（選ばなかった・失敗した）なのかには勝利条件が無い（マイクラ版に未変化の勝利分岐が無い）。
*
*
* ・3枚めくりと選択はコスプレイヤーと同じ仕組み（stage.js の c: カード / 朝の演出 stageMorning kind "nanoka"）。
* ・長夜月の対象は ♭ マーク、羅刹の愛する人は ⚰️ マークでめくる（作者指定。マイクラ版にこの演出は無い）。
* Web版ではマティアスの 👧 と同じく「変化した本人の画面だけ」の朝のめくりとして実装した（公開演出かは作者確認ポイント）。
* 情報確認・結果発表の役職情報にも対象を残す。
* ・写真撮影（作者指定）: 能力を使うと、自分の席に 📷 が出て 📸 に変わり（撮影）、撮影した相手のカードが
* 「現像」されて陣営の気配の面で数秒めくれる（stageFlash kind は三月なのかの stageFlash / g.photoFlash）。
* 写真（相手と気配）は情報確認で後から見返せる（photoday を INFO_DAY に登録。文は「写真: ○○ は△△の気配でした。」）。
*
*
* ・なのか: 銀色の影の変化先に入る（groups "transform:silver_shadow": 29）。光の使徒・闇の化身・模倣・コスプレには入らない。
* シャッフラーでは変化させられない（shuffler.js の BLOCKED に追加。マイクラ版 shufflerEligibleRoles の対象外リストに NANOKA）。
* ペルソナ・コピリストの対象外リストにも入っているが、どちらも Web版未実装なので配線なし。
* ・形態3種: 変化候補には入らない（内部専用役職。娘ちゃんと同じ）。ただしシャッフラーの変化先プールには入る
* （マイクラ版の対象外リストに形態は無い）。シャッフラーで形態になった人には、その場で対象を静かに割り当てる
* （マイクラ版 assignSilentNanokaDerivedTarget。state.js の shufflerPlace から呼ぶ）。
* ・酔っ払い・墓荒らし・ドッペルゲンガー経由: 夜に手にした場合は朝の連鎖（morning / chainDraw / cpuNight.chain）で3枚から選ぶ。
* コスプレイヤーの山札は村人陣営だけなので、コスプレでなのか・形態を引くことは無い（逆に、なのかがコスプレ経由で
* 得られることも無い）。模倣の人狼・開拓者の模倣先にも入らない（模倣プールは別管理）。
* ・ハッキング: 対象外には入らない（マイクラ版も対象外にしていない）。なのかと思い込んだ人には偽の結果
* 「○○（形態）になりました。」＋同じ3枚の朝演出を出す（silver_wolf.js fakeResult）。本物のなのかがハッキングされた場合は、
* 本当の変化は裏でCPUが自動で行う（既存の仕組み）。形態そのものは配役・墓地に存在しないため、思い込みの対象にはならない
* （娘ちゃんと同じ構造。マイクラ版の偽・形態の文は Web版では発生しない）。
* ・乞食: マイクラ版 isBeggarSwapExcludedTarget の明示リストに入っているのは長夜月だけ（Web版 beggar.js の
* EXCLUDED_ROLES に登録済みだったので変更なし）。なのか・三月なのか・羅刹は取れる。
* ・黄泉: マイクラ版 yomiCutStates が nanokaLoveTarget / nanokaLongNightTarget を断ち切るので、yomi.js にも追加した。
*
*
* g.nanokaMode[持ち主] = 形態 / g.nanokaLongNightTarget[持ち主] = 長夜の相手 / g.nanokaLoveTarget[持ち主] = 愛する人
* g.nanokaPhotoTarget[持ち主] = 撮影した相手 / g.nanokaPhotoSeen[持ち主] = 写った気配（再入室・観戦用）
*
* 呼び出し: 夜 = defineRole の night / morning / cpuNight。写真 = ONW.nanoka.photo（net.js の dictopen / hostMind / cpuMind が共用）。
* 勝利 = ONW.nanoka.extraWins（vote.js）。結果発表の役職情報 = ONW.nanoka.pairs（net.js buildResultObj）。
*/
(function (ONW) {
const ID = "nanoka", MITSUKI = "mitsuki_nanoka", LONGNIGHT = "long_night_moon", RASETSU = "rasetsu";
const FORMS = [LONGNIGHT, MITSUKI, RASETSU]; // 3枚の提示順（マイクラ版 openNanokaAction のボタンの順）
const TEAM_LABEL = { village: "村人陣営", wolf: "人狼陣営", third: "第三陣営"};
const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
const rn = (r) => (ONW.roles.getInfo(r) || {}).name || "?";
const esc2 = (s) => ONW.utils.esc(s);
const eff = (g, id) => ONW.mimic.actRole(g, id, g.currentRoles[id]);
const isForm = (r) => FORMS.includes(r);
const holdersOf = (g, role) => (g.players || []).filter((p) => g.currentRoles && g.currentRoles[p.id] === role).map((p) => p.id);
const modeOf = (g, id) => (g.nanokaMode || {})[id] || null;
const randomOther = (g, id) => { const o = (g.players || []).map((p) => p.id).filter((x) => x!== id); return o.length? o[Math.floor(Math.random() * o.length)]: null;};
const pickForm = (sel) => (sel && Number.isInteger(sel.pick) && isForm(FORMS[sel.pick]))? FORMS[sel.pick]: null;
const markOf = (form, target) => (target? { id: target, face: form === LONGNIGHT? "flat": "coffin"}: null);

/** 変化した本人への結果文（夜の結果・朝の連鎖・CPU共通） */
function resultText(g, r) {
if (!r) return "変化できませんでした。";
let t = `「${rn(r.form)}」になりました。`;
if (r.form === LONGNIGHT && r.target) t += `\nあなたは${nm(g, r.target)}に長夜をつけました。`; // マイクラ版 night.js の夜情報と同じ文
if (r.form === RASETSU && r.target) t += `\nあなたの愛する人は${nm(g, r.target)}です。`; // 同上
return t;
}
/**
* 形態への変化を適用する: カードの上に形態を置く（ONW.cosplayPlace が、上書きされた役職の記録の掃除・
* 履歴・従者/処刑人/復讐者などの追随まで面倒を見る）→ 形態と対象を役職に紐づく記録として書く。
* 前の形態の記録（長夜・愛する人・写真）は消してから書く（シャッフラーで形態が置き換わった直後などに古い記録が残らないように）。
* 戻り値: { form, target}（target は長夜月・羅刹のときだけ）
*/
function applyTransform(g, id, form) {
if (!isForm(form)) return null;
ONW.cosplayPlace(g, id, form);
["nanokaLongNightTarget", "nanokaLoveTarget", "nanokaPhotoTarget"].forEach((k) => { if (g[k]) delete g[k][id];});
if (g.nanokaPhotoSeen) delete g.nanokaPhotoSeen[id];
ONW.setRoleBound(g, "nanokaMode", id, form);
let target = null;
if (form === LONGNIGHT) { target = randomOther(g, id); if (target) ONW.setRoleBound(g, "nanokaLongNightTarget", id, target);}
if (form === RASETSU) { target = randomOther(g, id); if (target) ONW.setRoleBound(g, "nanokaLoveTarget", id, target);}
if (ONW.magician) ONW.magician.trySteal(g, id, form, "nanoka", "auto"); // 魔法使い: 形態への変化も「自分の役職を変えた」ので奪われる（形態の記録は魔法使いへコピーされ、長夜・愛する人の対象も付いて動く。奪われた人は村人になる。docs/magician.md）
return { form, target};
}
/**
* 静かな変化（シャッフラー）で形態になった人に対象を割り当てる（マイクラ版 assignSilentNanokaDerivedTarget）。
* state.js の shufflerPlace から呼ばれる。すでに記録があるものは触らない。三月なのかは昼能力があるだけなので記録は形態だけ。
*/
function assignDerived(g, id) {
const role = g.currentRoles && g.currentRoles[id];
if (!isForm(role)) return;
if (!modeOf(g, id)) ONW.setRoleBound(g, "nanokaMode", id, role);
if (role === LONGNIGHT &&!(g.nanokaLongNightTarget || {})[id]) { const t = randomOther(g, id); if (t) ONW.setRoleBound(g, "nanokaLongNightTarget", id, t);}
if (role === RASETSU &&!(g.nanokaLoveTarget || {})[id]) { const t = randomOther(g, id); if (t) ONW.setRoleBound(g, "nanokaLoveTarget", id, t);}
}

// ---------------------------------------------------------
// 三月なのかの昼能力「写真撮影」（感覚の占い師・心眼の人狼と入口を共用する。net.js の dictopen / hostMind / cpuMind から呼ばれる）
// ---------------------------------------------------------
const photoUsed = (g, id) => (g.nanokaPhotoTarget || {})[id]!== undefined;
function photoTargets(g, id) { return (g.players || []).map((p) => p.id).filter((x) => x!== id &&!(g.deadIds || []).includes(x));}
function photoCanUse(g, id) {
if (!g || g.dictator || g.allDeadSkip) return false;
if (g.phase!== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false; // 昼のタイマーが動き出す前は使えない（感覚の占い師と同じ）
if (!g.currentRoles || eff(g, id)!== MITSUKI) return false;
if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false; // 封印の狂人に封印されている: 昼能力は使えない
if (ONW.hiddenDrunk(g, id) || (g.deadIds || []).includes(id) || photoUsed(g, id)) return false;
return photoTargets(g, id).length > 0;
}
/** 写真に写る気配（マイクラ版 baseTeamOf(currentDayActionRole(target))）: その日の昼能力で見た最終役職の陣営そのもの（3種だけ。狂人系は人狼陣営に含まれる） */
const photoTeamKey = (g, target) => { const t = (ONW.roles.getInfo(eff(g, target)) || {}).team; return t === ONW.TEAM.WOLF? "wolf": t === ONW.TEAM.THIRD? "third": "village";};
/** 勝利判定の陣営（マイクラ版 baseTeamOf(finalRoles[target])）: 模倣などの解決をしない、素の最終役職の陣営 */
const finalTeamKey = (g, target) => { const t = (ONW.roles.getInfo((g.currentRoles || {})[target]) || {}).team; return t === ONW.TEAM.WOLF? "wolf": t === ONW.TEAM.THIRD? "third": "village";};
const photoText = (g, id) => { const t = (g.nanokaPhotoTarget || {})[id]; return t? `写真: ${nm(g, t)} は${TEAM_LABEL[(g.nanokaPhotoSeen || {})[id] || "village"]}の気配でした。`: null;};
function photoApply(c, id, target) {
const g = c.g;
if (!photoCanUse(g, id) ||!photoTargets(g, id).includes(target)) return null;
const key = photoTeamKey(g, target);
ONW.setRoleBound(g, "nanokaPhotoTarget", id, target);
(g.nanokaPhotoSeen = g.nanokaPhotoSeen || {})[id] = key;
const me = c.byId(id), tp = c.byId(target), text = photoText(g, id);
(g.dayLogsAll = g.dayLogsAll || []).push(`${rn(MITSUKI)} ${me.name} は ${tp.name} を写真撮影し、${TEAM_LABEL[key]}の気配を写していました。`); // 結果発表の昼行動結果
c.hold(id, text); // CPUも人間と同じ文を情報確認に残す（感覚の占い師と同じ）
if (!me.isCpu) c.send(id, { t: "photoday", id: target, by: id, key, text}); // 本人だけ: 📷→📸→現像の演出（stageFlash）と情報確認の写真
else if (ONW.cpu && ONW.cpu.kit) { const ci = ONW.cpu.kit.infoOf(g, id); ci.senseSeen = ci.senseSeen || {}; ci.senseSeen[target] = key;} // CPUが結果を覚える（感覚の占い師の cpuNotice と同じ置き場）
return { target, key};
}
/** 再入室(resync)で本人に戻す写真の文（使っていなければ null）。photoApply が本人に出した文と完全に同じ */
function photoDoneText(g, id) { return photoUsed(g, id)? photoText(g, id): null;}
/** 観戦者向け: 誰が誰を撮影して何の気配だったか */
function photoSpecLines(g, nmf) { return Object.entries(g.nanokaPhotoTarget || {}).map(([by, t]) => ({ by: nmf(by), target: nmf(t), key: (g.nanokaPhotoSeen || {})[by] || null}));}
const photo = { canUse: photoCanUse, targets: photoTargets, apply: photoApply};

// ---------------------------------------------------------
// 勝利（vote.js の set から呼ばれる。マイクラ版 applyThirdSpecials のなのか分）
// ---------------------------------------------------------
function extraWins(g, dead) {
const votes = g.votes || {};
const longNight = holdersOf(g, LONGNIGHT).filter((id) => { const t = (g.nanokaLongNightTarget || {})[id]; return!!t && votes[t] === id && dead.has(id);}); // 長夜の相手が自分に投票していて、自分が死亡
const mitsuki = holdersOf(g, MITSUKI).filter((id) => { const t = (g.nanokaPhotoTarget || {})[id]; return!!t && finalTeamKey(g, t) === "village";}); // 撮影した相手の最終役職が村人陣営
const rasetsu = holdersOf(g, RASETSU).filter((id) => { const b = (g.nanokaLoveTarget || {})[id]; return!!b && dead.has(b);}); // 愛する人が死亡
const rasetsuBeloved = [...new Set(rasetsu.map((id) => g.nanokaLoveTarget[id]))];
return { longNight, mitsuki, rasetsu, rasetsuBeloved};
}
/** 結果発表の役職情報（長夜・愛する人の対応。最終盤面で形態を持っている人だけ） */
function pairs(g) {
return {
longNight: holdersOf(g, LONGNIGHT).filter((id) => (g.nanokaLongNightTarget || {})[id]).map((id) => ({ by: nm(g, id), target: nm(g, g.nanokaLongNightTarget[id])})),
rasetsu: holdersOf(g, RASETSU).filter((id) => (g.nanokaLoveTarget || {})[id]).map((id) => ({ by: nm(g, id), target: nm(g, g.nanokaLoveTarget[id])})),
};
}

ONW.nanoka = { ID, MITSUKI, LONGNIGHT, RASETSU, FORMS, isForm, modeOf, holdersOf, applyTransform, assignDerived, photo, photoCanUse, photoTargets, photoTeamKey, photoDoneText, photoSpecLines, extraWins, pairs};

// ---------------------------------------------------------
// CPU: 夜の形態選択（デバッグ指定 f.nanokaMode があればその形態、なければランダム。マイクラ版 cpu.js と同じ）
// 呼び出しは本番経路 ONW.cpu.runNight の共通シグネチャ cpuNight.run(n, p, label, cur, rid)
// （n = { g, stage, forced, validPlayer, nn, ob, hold, rn, pick, infoOf, nameOf }。コスプレイヤー・ホタルと同じ形）。
// 封印されているCPUは runNight 側の ONW.seal.failIfSealed が先に失敗させるので、ここでは見ない。
// ---------------------------------------------------------
function cpuRun(n, p, label, cur, rid) {
const g = n.g, i = n.infoOf(p.id);
if (modeOf(g, p.id)) return; // すでに変化している
if (ONW.keymaster && ONW.keymaster.gate(g, p.id, [])) { // 鍵師のロック: 変化できない（勝利もできない）
i.nanoka = { failed: true};
n.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "変化", [], `${label} ${p.name}`));
return;
}
const f = n.forced(p) || {};
const form = isForm(f.nanokaMode)? f.nanokaMode: FORMS[Math.floor(Math.random() * FORMS.length)];
const r = applyTransform(g, p.id, form);
i.nanoka = { form: r.form, target: r.target};
(g.nightLogsAll = g.nightLogsAll || []).push(`${label} ${p.name} は 山札から3枚めくり、「${rn(r.form)}」になりました。`); // 人間の night.resolve と同じ夜ログ
n.hold(p.id, resultText(g, r));
if (!cur) n.nn(rid); // 新聞: 夜に能力を使った役職として記録（朝の連鎖・酔い覚めは載らない）
}
/** 墓荒らし・ドッペル・酔い覚めでなのかを手にしたCPUの、続けて言う結果（結果開示なので AI議論OFF でも出る） */
function cpuChainResult(k, g, p, i) {
const x = i.nanoka; if (!x) return null;
if (x.failed) return { text: "変化できませんでした。"};
if (x.form === LONGNIGHT && x.target) return { text: `${nm(g, x.target)}に長夜をつけました。`, claim: { kind: "long_night", target: x.target}};
if (x.form === RASETSU && x.target) return { text: `愛する人は${nm(g, x.target)}です。`, claim: { kind: "rasetsu", target: x.target}};
return { text: `「${rn(x.form)}」になりました。`};
}
/** CPUの三月なのかが写真撮影する相手（デバッグ指定があればその人。なければ、まだ気配の分からない人を優先してランダム） */
function cpuPhotoPick(k, g, p) {
const ts = photoTargets(g, p.id); if (!ts.length) return null;
const f = (ONW.debug && ONW.debug.cpuTarget ? ONW.debug.cpuTarget(g, p.id) : null) || {}; // デバッグ指定（呼び出し側の cpu.kit には forced が無いので、cpu.js の n.forced と同じ読み方をする）
if (f.player && ts.includes(f.player)) return f.player;
const info = k.infoOf(g, p.id), seen = info.senseSeen || {};
const unk = ts.filter((t) => seen[t] === undefined && info.known[t] === undefined);
return k.pick(unk.length? unk: ts);
}

// ---------------------------------------------------------
// なのか本体
// ---------------------------------------------------------
ONW.defineRole(ID, {
info: { observe: "player", sealTarget: true, deck: 126, name: "なのか", team: ONW.TEAM.THIRD, wakeOrder: 55, sort: 52.5,
desc: "第三陣営。夜に、山札からめくれた「長夜月」「三月なのか」「羅刹」の3枚から1枚選んで、その役職に変化します（朝になるまで選び直せます）。鍵師にロックされている・封印されているときは変化できず、変化できなかった場合は勝利できません。長夜月になるとランダムな自分以外の1人に「長夜」がつき、三月なのかは昼能力「写真撮影」が使え、羅刹になるとランダムな自分以外の1人が「愛する人」になります。各形態の勝利条件は、それぞれの役職の説明を見てください。"},
groups: { "transform:silver_shadow": 29}, // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に NANOKA が入る）。光の使徒・闇の化身には入らない
uiNight: {
action(X) {
const { later} = X, g = ONW.game, n = (g.nightSel && Number.isInteger(g.nightSel.pick))? g.nightSel.pick: null;
const cards = g.cosplayCards || [];
const now = n === null? "まだ選んでいません（選ばなければ変化しません）": `${esc2(rn(cards[n]))}`;
return `<p class="night-step__hint">上のテーブルに、<strong>山札から3枚</strong>めくれています。変化したい役職のカードを1枚押してください。${later}<br>朝になると、選ばなかった2枚は山札の一番下に戻り、選んだカードがあなたのカードの上に置かれます。長夜月を選ぶとランダムな1人に「長夜」がつき、羅刹を選ぶとランダムな1人が「愛する人」になります。</p><p class="night-step__hint">選択中: <strong>${now}</strong></p>`;
},
chainReady: (np, ng, sel) =>!!sel && Number.isInteger(sel.pick),
chainHow: () => "<strong>変化したい役職のカード</strong>（山札から3枚めくれています）を1枚押して",
},
stagePick: { players: false, cosplay: true}, // カードを押して行動する: めくれた3枚だけ（プレイヤー・墓地は選べない。コスプレイヤーと同じ）
nightMsg: () => ({ cosplay: { cards: FORMS.slice()}}), // 3枚は固定（コスプレイヤーのような抽選ではない）
nightMsgAct: () => ({ cosplay: { cards: FORMS.slice()}}),
/** 朝の連鎖（墓荒らし・ドッペル・酔い覚め）で本人に送る3枚 */
chainDraw: () => FORMS.slice(),
// 朝の演出（stage.js の playMorning が reveal.kind === "nanoka" のときに呼ぶ。変化した本人の画面だけ）:
// めくれた3枚 → 選ばなかった2枚が裏返って山札へ戻る → 選んだカードが自分の席へ飛び、自分のカードが形態で表になる
// → 長夜月・羅刹のときは、対象のカードが ♭ / ⚰️ のマークでめくれる（作者指定。本人だけに見える）
stageMorning: {
kind: "nanoka", dur: (r) => (r.mark? 3700: 2900),
play(r, SK) {
const { later} = SK, C = SK.cosplay, el = SK.$t(), mine = `p:${ONW.net.myId()}`;
C.keep(true); C.ensure(r.cards, true); SK.paint(SK.G());
const pile = el.querySelector(".tb-pile.tb-card");
const fly = (i, to, ms, shrink) => {
const card = el.querySelector(`[data-k="c:${i}"].tb-card`);
if (!card ||!to ||!card.animate) return;
const a = card.getBoundingClientRect(), b = to.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
card.style.zIndex = 60;
card.animate([{ transform: "translate(0,0) scale(1)"}, { transform: `translate(${dx / 2}px,${dy / 2 - 26}px) scale(1.15)`, offset: 0.5}, { transform: `translate(${dx}px,${dy}px) scale(${shrink? 0.85: 1})`, opacity: shrink? 0.2: 1}], { duration: ms, easing: "ease-in-out", fill: "forwards"});
};
const g0 = SK.G();
r.cards.forEach((_, i) => {
if (i === r.pick) return;
later(() => { delete SK.up[`c:${i}`]; SK.paint(SK.G());}, 400); // 選ばなかったカードが裏返る
later(() => fly(i, pile, 800, true), 1200); // 山札の一番下へ戻る
});
if (Number.isInteger(r.pick) && r.role) {
const dst = el.querySelector(`[data-k="${mine}"].tb-card`);
later(() => fly(r.pick, dst, 900, false), 1200); // 選んだカードが自分の席へ飛ぶ
later(() => { if (ONW.sound) ONW.sound.se("deal"); SK.show(mine, r.role);}, 2100); // 選んだカードが自分の席に置かれる（着地の瞬間。SE: deal）＋自分のカードが形態で表になる
}
if (r.mark) later(() => { SK.show(`p:${r.mark.id}`, r.mark.face === "flat"? SK.FLAT_MARK: SK.COFFIN_MARK, true);}, 2500); // 対象のカードが ♭ / ⚰️ でめくれる
later(() => { C.keep(false); C.clear(); g0.cosAnim = "done"; SK.paint(SK.G());}, r.mark? 3300: 2500);
},
},
night: {
kind: "gremlin", order: 30, // マティアス(order 20)のあと・怪盗(robber 段階)の前（docs/role-process-order.md）
complete: (np, ng, sel) =>!!sel && Number.isInteger(sel.pick),
normalize: (c, players, graves, sel) => ({ players: [], graves: [], pick: sel && Number.isInteger(sel.pick) && sel.pick >= 0 && sel.pick < FORMS.length? sel.pick: null}),
resolve(c, p) {
const g = c.g, sel = c.selOf(p), form = pickForm(sel), label = `${c.rn(ID)} ${p.name}`;
if (ONW.keymaster && ONW.keymaster.gate(g, p.id, [])) { // 鍵師のロック: 自分の席がロック中なら変化に失敗（3枚とも山札に戻る。マイクラ版「ロックで選べなかった場合は勝利できません」）
c.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "変化", [], label));
c.rev[p.id] = { kind: "nanoka", cards: FORMS.slice(), pick: null, role: null};
return;
}
if (!form) { // 選んでいない: 変化しない（勝利条件も無い）
g.nightLogsAll.push(`${label} は 山札から3枚めくりましたが、変化しませんでした。`);
c.rev[p.id] = { kind: "nanoka", cards: FORMS.slice(), pick: null, role: null};
return;
}
const r = applyTransform(g, p.id, form);
g.nightLogsAll.push(`${label} は 山札から3枚めくり、「${rn(form)}」になりました。`);
ONW.newsNote(g, ID);
c.hold(p.id, resultText(g, r));
c.rev[p.id] = { kind: "nanoka", cards: FORMS.slice(), pick: sel.pick, role: form, mark: markOf(form, r.target)};
},
},
/** 朝の連鎖・酔い覚め（墓荒らし/ドッペル経由・酔いが覚めた人）: めくれた3枚から選んで、その場で変化する */
morning: {
run(c) {
const g = c.g, sel = c.sel || {}, form = pickForm(sel);
if (ONW.keymaster && ONW.keymaster.gate(g, c.id, [])) return { lines: [ONW.keymaster.fail(g, c.id, "self", "変化", [], c.label)], reveal: { kind: "nanoka", cards: FORMS.slice(), pick: null, role: null}, failed: true}; // 封印の失敗は net.js の mchain が先に返す
if (!form) return { lines: ["三月なのか・長夜月・羅刹のどれにも変化しませんでした。"], reveal: { kind: "nanoka", cards: FORMS.slice(), pick: null, role: null}};
const r = applyTransform(g, c.id, form);
return { lines: [resultText(g, r)], reveal: { kind: "nanoka", cards: FORMS.slice(), pick: sel.pick, role: form, mark: markOf(form, r.target)}};
},
},
cpuNight: { order: 95, stage: "gremlin", chain: true, run: cpuRun}, // グレムリン(80)・マティアス(90)のあと・怪盗の前
cpuChainResult,
cpuClaim(k, g, p, r, i, c) { // 変化できなかったなのかには開示する結果が無い。変化していれば形態の結果開示に委ねる（本番の発言プランは初期役職の cpuClaim を引くので、ここで委ねないと形態の開示に届かない。コスプレイヤーと同じ考え方）
const form = modeOf(g, p.id);
if (!form) return false;
const h = ONW.roleHook(form, "cpuClaim");
return h ? h(k, g, p, form, i, c) : false;
},
});

// ---------------------------------------------------------
// 三月なのか（形態）: 昼能力「写真撮影」
// ---------------------------------------------------------
ONW.defineRole(MITSUKI, {
info: { deck: 127, name: "三月なのか", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 52.6,
desc: "第三陣営。なのかが変化する形態のひとつ（直接配役はできません）。昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を選んで写真撮影できます（1回だけ）。撮った相手の最終役職（そのときのカード）から、村人陣営・人狼陣営・第三陣営のどの気配かが分かり、写真は情報確認で見返せます。撮影した相手の最終役職が村人陣営なら追加勝利します。"},
// 昼の演出（stage.js の flashes が g.photoFlash を渡す。net.js の photoday が { id: 撮影した人, target, key} を入れる）:
// 自分の席に 📷 が出て 📸 に変わり（撮影）、相手のカードが「現像」されて気配の面で数秒めくれて裏に戻る。本人だけに見える
stageFlash: {
field: "photoFlash", when: "early",
run(list, SK) {
list.forEach((x, i) => {
const mine = `p:${x.id}`, tk = `p:${x.target}`, base = i * 3000;
SK.later(() => { SK.badge[mine] = "📷"; SK.paint(SK.G());}, base + 100); // カメラが出る
SK.later(() => { SK.badge[mine] = "📸"; SK.glow[mine] = true; SK.paint(SK.G());}, base + 900); // 撮影（フラッシュ）
SK.later(() => { SK.up[tk] = SK.senseMark(x.key || "village"); SK.badge[tk] = "📸 写真"; SK.senseKeys[tk] = x.key || "village"; SK.paint(SK.G());}, base + 1500); // 現像: 相手のカードに気配が出る
SK.later(() => { if (!SK.held[mine]) delete SK.badge[mine]; delete SK.glow[mine]; if (!SK.held[tk]) delete SK.up[tk]; delete SK.badge[tk]; delete SK.senseKeys[tk]; SK.paint(SK.G());}, base + 1500 + 3600);
});
},
},
// 結果開示(COボタン)の流れ: 撮影した相手を選ぶ → 写った気配を選ぶ（または伏せる）。使う前にCOだけできる（感覚の占い師と同じ noChain）
coResult: {
kind: "photo", targetLabel: "写真撮影した相手", roleHint: "の気配", noChain: true,
optionList: () => [{ id: "village", label: "村人陣営の気配", team: "village"}, { id: "wolf", label: "人狼陣営の気配", team: "wolf"}, { id: "third", label: "第三陣営の気配", team: "third"}],
pickRole(key, who, s, K) {
if (key === "hide" ||!TEAM_LABEL[key]) return [`${who}を写真撮影しました。結果は伏せます。`, null, null, "disclose", `${who} → 伏せ`];
return [`${who}は${TEAM_LABEL[key]}の気配でした。`, { kind: "photo", target: s.target, key}, null, "disclose", `${who} → ${TEAM_LABEL[key]}の気配`];
},
},
cpuPick: cpuPhotoPick, // CPUが自動で使うとき（ONW.CPU_AUTO_DAY.photo）の相手選び。net.js の cpuMind が roleHook で引く
/** CPUの結果開示「○○を写真撮影しました。」（結果開示なので AI議論OFF でも出る。マイクラ版 cpu.js と同じで、気配は言わない） */
cpuClaim(k, g, p, r, i, c) {
const t = (g.nanokaPhotoTarget || {})[p.id];
if (!t) return false;
c.co = MITSUKI;
c.result = { text: `${nm(g, t)}を写真撮影しました。`, short: `${nm(g, t)}を撮影`, claim: { kind: "photo", target: t}};
},
});

// ---------------------------------------------------------
// 長夜月（形態）: 長夜の相手が自分に投票して、自分が死ねば追加勝利
// ---------------------------------------------------------
ONW.defineRole(LONGNIGHT, {
info: { deck: 128, name: "長夜月", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 52.7,
desc: "第三陣営。なのかが変化する形態のひとつ（直接配役はできません）。変化したとき、ランダムな自分以外の1人に「長夜」がつきます。その人があなたに投票し、あなたが死亡していれば追加勝利します。"},
coResult: {
kind: "long_night", targetLabel: "長夜をつけた相手",
pickPlayer: (id, K) => [`${K.nameOf(id)}に長夜をつけました。`, { kind: "long_night", target: id}, null, "disclose", `${K.nameOf(id)}に長夜`],
},
/** CPUの結果開示「○○に長夜をつけました。」（マイクラ版 cpu.js と同じ） */
cpuClaim(k, g, p, r, i, c) {
const t = (g.nanokaLongNightTarget || {})[p.id];
if (!t) return false;
c.co = LONGNIGHT;
c.result = { text: `${nm(g, t)}に長夜をつけました。`, short: `${nm(g, t)}に長夜`, claim: { kind: "long_night", target: t}};
},
});

// ---------------------------------------------------------
// 羅刹（形態）: 愛する人が死ねば、羅刹と愛する人の両方が追加勝利
// ---------------------------------------------------------
ONW.defineRole(RASETSU, {
info: { deck: 129, name: "羅刹", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 52.8,
desc: "第三陣営。なのかが変化する形態のひとつ（直接配役はできません）。変化したとき、ランダムな自分以外の1人が「愛する人」になります。愛する人が死亡していれば、あなたと愛する人の両方が追加勝利します。"},
coResult: {
kind: "rasetsu", targetLabel: "愛する人",
pickPlayer: (id, K) => [`愛する人は${K.nameOf(id)}です。`, { kind: "rasetsu", target: id}, null, "disclose", `愛する人は${K.nameOf(id)}`],
},
/** CPUの結果開示「愛する人は○○です。」（マイクラ版 cpu.js と同じ） */
cpuClaim(k, g, p, r, i, c) {
const t = (g.nanokaLoveTarget || {})[p.id];
if (!t) return false;
c.co = RASETSU;
c.result = { text: `愛する人は${nm(g, t)}です。`, short: `愛する人は${nm(g, t)}`, claim: { kind: "rasetsu", target: t}};
},
});
})(window.ONW);
