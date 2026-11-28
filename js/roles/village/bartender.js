/**
* bartender.js — バーテンダー（村人陣営 / deck 138 / 発案: しらす / 元ネタ: オリジナル）
*
*
* ・夜の選択はない。配役（開始時）に、バーテンダーと認識される人（下記）がそれぞれランダムな1人へ
* カクテルを渡し、その人を酔っぱらい状態（drunkOverlay）にする。すでに酔っている人・別のカクテルを
* 渡された人には渡らない（元々酔っぱらいがいる場合は別の人を酔わせる）。バーテンダー自身は酔わない。
* ・「バーテンダーと認識される人」= 最終役職がバーテンダー / 銀狼にハッキングされてバーテンダーを
* 思い込んでいる人（マイクラ版 assignRoles の perceived 集合。クローンがバーテンダーと思い込んでいる
* 場合も入る: g.cloneThoughtRole を読む。クローン本体は clone.js で配線済み）。
* 思い込んでいる人には本物の対象記録（bartenderTarget）は付かない（渡した相手は偽の表示だけ）。
* 本物のバーテンダーがハッキングされている場合も、カクテルは通常どおり渡る。
* ・設定の酔っぱらい（drunkCount 枠）はカクテルより先に付く。設定で酔った人が「認識されるバーテンダー」
* だった場合は酔いが外れる（マイクラ版 excludeHackedBartendersFromDrunkState と同じ考え方。
* Web版では配役順が ハッキング → カクテル の一括処理なので、assignAll の中で外してから渡す）。
* ・カクテルで酔った人は、通常の酔っ払いとまったく同じ機構で酔う（偽の役職を見る・夜の情報なし・
* 議論時間の半分で覚める）。違いは目線の演出だけ（作者メモ）:
* - 配布画面の自分のカードは 🍸 面（ライム色。dl-face--cocktail）
* - 昼の自分の席の裏面はライム×白の縞＋🍸＋カウントダウン（通常の酔っ払いは黄×白＋🍺）
* - 夜情報の注記に「バーテンダーからカクテルが来ました。」が付く（マイクラ版の酔っぱらい通知）
* - 結果発表でその人のカードに付く酔っ払いバッジが 🍸 になる
* ・バーテンダー本人への通知は夜情報の「カクテルをXに渡しました。」（マイクラ版 roles.js の夜情報）。
* マイクラ版にある朝の全体告知（announceBartenderInformationAtDayStart）と夜終わりの通知
* （notifyBartendersAtNightEnd）はどちらも未使用のデッドコードなので、Web版にも入れない。
* ・結果発表の「役職情報」に「バーテンダーXはYにカクテルを渡していました。」（マイクラ版 vote.js）。
* 記録は「配役時点でバーテンダーだった人」に付いて動く（その後カードが入れ替わっても動かない。
* カクテル自体が配役時点で渡されているため。マイクラ版の bartenderTarget と同じ）。
*
*
* ・模倣の人狼がバーテンダーを模倣するとカクテルを渡す（マイクラ版 ensureBartenderTargetForMimic。
* 人間は nightMsgAct、CPUは cpuNight で対象を確定させる）。模倣の人狼自身がカクテルの対象に
* なることもある（マイクラ版の配役時候補から模倣は外れていない）。
* ・酔っ払いが覚めた時点で最終役職がバーテンダーだった人は、その場でカクテルを渡す
* （マイクラ版 showSoberedRoleNightInfo の BARTENDER 分岐 → ensureBartenderTargetForMimic）。
* ただし夜は終わっているので、対象の酔いは「記録だけ」にする（drunkRevealed も立てて、
* 昼の盤面・再入室時の表示が壊れないようにする。解釈点）。
* ・墓荒らし・ドッペルゲンガーでバーテンダーを手にしても、カクテルは渡らない
* （マイクラ版に代入経路が無い。got フック自体を定義しない）。コスプレイヤーは候補外（下記）。
* シャッフラーでバーテンダーになっても同様に渡らない（マイクラ版どおり）。
* ・ハッキング: 対象外には入っていない（本物もハッキングされる）。思い込んだ人には偽の夜表示
* 「カクテルをXに渡しました。」（silver_wolf.js の baseView。Xは銀狼側の安定したランダムな相手）と、
* 偽の結果文「カクテルをXに渡しました。」は無い（バーテンダーは夜に選ばない役職なので
* resolveFake の対象外。マイクラ版の偽文は夜情報側だけ）。
*
*
* ・光の使徒: 入る（村人系）。闇の化身・銀色の影: 入らない。
* ・模倣: できる（NON_MIMICABLE_ROLES に無い）。
* ・コスプレ: 入らない（cosplayerEligibleRoles に無い）。
* ・シャッフラー: 山札に入る（shufflerEligibleRoles に含まれる）。
* ・ペルソナ: マイクラ版では仮面候補（除外リストに無い）が、Web版はペルソナ未実装のため配線なし。
*
*
* ・封印の対象（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入る）。ただし夜の選択が無いので実効は無い。
* ・読切（ヨミ）の対象リスト（roles.js YOMI_TARGET_ROLES）に最初から入っている（移植で自動的に効く）。
* カルメンの対象リストには入っていない（マイクラ版 YAMINABE_CARMEN_TARGET_ROLES に無い）。
* ・乞食: 「取れない対象」にバーテンダーは入っていないので、死んだバーテンダーは乞食に取れる。
* ・シナジー: マイクラ版にバーテンダー固有のシナジーは無い（ONW.SYNERGY_RULES への追加なし）。
* ・CO: 結果開示は1人を選んで「Xにカクテルを渡していました。」（マイクラ版 main.js のバーテンダーCO）。
* 渡された側の情報開示「カクテルが渡されてました。」も co.js に追加（マイクラ版 main.js の
* カクテル情報CO / CPU の情報開示にも同じ文がある）。
* ・CPU: 本物は「バーテンダーCO」＋結果開示「Xにカクテルを渡していました。」（cpuClaim）。
* 渡されたCPUは酔いが覚めたあと情報開示で言うことがある（cpu.js 側）。
* ・実績（マイクラ版 stats.js）: bartender_loss「閉店」/ first_bartender「ようこそ、バーへ」/
* win_bartender「おいしい美酒を」。Web版には実績の保存が無いので、判定関数だけ返す。
*
* 状態: g.bartenderTarget = { バーテンダーのID: 渡した相手のID}（配役時点の人に付く）
* g.cocktailDrunk = { カクテルで酔った人のID: true}（🍸 演出と結果バッジ用。通常の酔いは drunkOverlay）
* 呼び出し: 配役 = net.js startOnlineGame → ONW.bartender.assignAll。夜情報 = nightMsg / nightMsgAct。
* 酔い覚め = soberLines。CPU = cpuNight / cpuClaim。詳細は docs/bartender.md。
*/
(function (ONW) {
const ID = "bartender";
const R = () => ONW.ROLE;
const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";

/** バーテンダーと「認識される」人のID（マイクラ版 assignRoles の perceived 集合） */
function perceivedIds(g) {
const cur = g.currentRoles || {}, hack = g.hackRole || {}, clone = g.cloneThoughtRole || {};
return (g.players || []).filter((p) => cur[p.id] === ID || hack[p.id] === ID || clone[p.id] === ID).map((p) => p.id);
}
/** その人が渡した相手（記録が無ければ null）。記録は配役時点の人に付く */
function targetOf(g, id) { return ((g && g.bartenderTarget) || {})[id] || null;}
/** カクテルで酔った人か（🍸 演出・結果バッジ用） */
function isCocktailDrunk(g, id) { return!!((g && g.cocktailDrunk) || {})[id];}

/** カクテルの候補（マイクラ版 ensureBartenderTargetForMimic の候補条件） */
function candidates(g, selfId, perceived) {
return (g.players || []).filter((p) => p.id!== selfId &&!perceived.includes(p.id) &&!(g.drunkOverlay && g.drunkOverlay[p.id]) &&!(ONW.rabbitMadman && ONW.rabbitMadman.isHidden(g, p.id))).map((p) => p.id);   // 兎の狂人: 草むらに隠れた人はカクテルの対象にならない（マイクラ版 excludeRabbitHiddenParticipants）
}
/**
* 対象を確定させる（無ければランダムに1人選んで酔わせる）。戻り値は対象のID（選べなければ null）。
* opts.late: 夜が終わったあとの代入（酔い覚め時）。対象の酔いは記録だけにして、昼の盤面を壊さない。
*/
function ensureTarget(g, id, opts) {
if (!g ||!id) return null;
const cur = targetOf(g, id);
if (cur) return cur;
const perceived = perceivedIds(g);
const cand = ONW.utils.shuffle(candidates(g, id, perceived));
if (!cand.length) return null;
const t = cand[0];
g.bartenderTarget = g.bartenderTarget || {};
g.bartenderTarget[id] = t;
g.drunkOverlay = g.drunkOverlay || {};
g.drunkOverlay[t] = true;
g.cocktailDrunk = g.cocktailDrunk || {};
g.cocktailDrunk[t] = true;
if (opts && opts.late) { g.drunkRevealed = g.drunkRevealed || {}; g.drunkRevealed[t] = true;}
if (Array.isArray(g.nightLogsAll)) g.nightLogsAll.push(`バーテンダー ${nm(g, id)} は ${nm(g, t)} にカクテルを渡しました。`);
return t;
}
/**
* 配役時の一括処理（net.js startOnlineGame から、模倣・ハッキングの割り当てのあとに呼ぶ。ホストのみ）:
* 1) 認識されるバーテンダーは酔わない（設定の酔いを外す）
* 2) 本物のバーテンダー（最終役職）だけが対象を持つ。思い込んでいる人には付けない
*/
function assignAll(g) {
if (!g) return;
const perceived = perceivedIds(g);
g.drunkOverlay = g.drunkOverlay || {};
perceived.forEach((id) => { if (g.drunkOverlay[id]) delete g.drunkOverlay[id];});
(g.players || []).forEach((p) => { if ((g.currentRoles || {})[p.id] === ID) ensureTarget(g, p.id);});
}
/** 結果発表の「役職情報」の行（マイクラ版 vote.js のバーテンダー情報） */
function lines(g, nameOf) {
const bt = (g && g.bartenderTarget) || {};
return Object.keys(bt).map((id) => ({ text: `${nameOf(id)}は${nameOf(bt[id])}にカクテルを渡していました。`}));   // 表示側（ui.js）が「バーテンダー:」を付けるので、文はマイクラ版の行から役職名を除いた形
}
const coText = (name) => `${name}にカクテルを渡していました。`;
const coShort = (name) => `→ ${name}`;
/** 実績（マイクラ版 stats.js と同じ条件。Web版に保存が無いので判定だけ） */
function achievements(g, id, won) {
const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
if (ini === ID || cur === ID) out.push("first_bartender");
if (cur === ID) out.push(won? "win_bartender": "bartender_loss");
return out;
}
/** CPUの夜: 模倣の人狼がバーテンダーを模倣したとき（と、酔い覚めでバーテンダーになったCPU）に対象を確定させる。
* 本物のCPUバーテンダーは配役で確定済み（ensureTarget は何もしない）。墓荒らし・ドッペル経由はマイクラ版に経路が無いので対象にしない */
function cpuRun(n, p, label, cur, rid) {
const g = n.g, ini = (g.initialRoles || {})[p.id];
if (ini!== ID && ini!== R().MIMIC_WOLF && ini!== "clone" && n.stage!== "late") return;   // クローンがバーテンダーと思い込んでいる場合も対象を確定させる（actRole 経由で呼ばれる）
const t = ensureTarget(g, p.id, n.stage === "late"? { late: true}: null);
if (t) n.hold(p.id, `カクテルを${n.nameOf(t)}に渡しました。`);
}

const B = (ONW.bartender = { perceivedIds, targetOf, isCocktailDrunk, ensureTarget, assignAll, lines, coText, coShort, achievements});

ONW.defineRole(ID, {
info: { sealTarget: true, deck: 138, name: "バーテンダー", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.01,
desc: "村人陣営。開始時にランダムな1人へカクテルを渡し、酔っぱらい状態にします（自分で選ぶことはありません）。元々酔っぱらいがいる場合は別の人を酔わせます。バーテンダー自身は酔っぱらいになりません。カクテルで酔った人は🍸の面でめくれ、カードの色もライム色になります（酔いの効果そのものは通常の酔っ払いと同じです）。"},
groups: { "transform:light_apostle": 56}, // 光の使徒の変化先（村人系）。並びは ROLE_ORDER（wiki の order 54）で決まる
// 夜の始まり: 本人への通知（対象は配役で確定済み。ここでは読むだけ）
nightMsg(c, p) {
const t = targetOf(c.g, p.id);
return t? { lines: [`カクテルを${c.nameOf(t)}に渡しました。`]}: {};
},
// 模倣の人狼がバーテンダーを模倣しているとき: 対象を確定させて同じ通知を出す（マイクラ版 ensureBartenderTargetForMimic）
nightMsgAct(c, p) {
const t = ensureTarget(c.g, p.id);
return t? { lines: [`カクテルを${c.nameOf(t)}に渡しました。`]}: {};
},
// 酔いが覚めた時点でバーテンダーだった人: その場でカクテルを渡す（マイクラ版 showSoberedRoleNightInfo）
soberLines(c, id) {
const t = ensureTarget(c.g, id, { late: true});
return t? [`カクテルを${c.nameOf(t)}に渡しました。`]: [];
},
cpuNight: { order: 35, stage: "seer", chain: true, run: cpuRun},
// CPU: 本物は「バーテンダーCO」＋結果（渡した相手）。対象が無い（思い込み・手にしただけ）ときはCOだけ
cpuClaim(k, g, p, r, i, c) {
c.co = ID;
const t = targetOf(g, p.id);
if (t) c.result = { text: coText(nm(g, t)), short: coShort(nm(g, t)), claim: { kind: "bartender", target: t}};
},
// 結果開示（COボタン）: 1人を選んで「Xにカクテルを渡していました。」
coResult: {
kind: "bartender", targetLabel: "カクテルを渡した相手",
pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "bartender", target: id}, null, "disclose", coShort(K.nameOf(id))],
},
// 夜の画面: 夜の行動がないバーテンダー向けの説明
uiNight: {
idle(X) {
if (X.logs) return null;
return `<p class="night-step__hint">あなたに夜の行動はありません。<br>カクテルは開始時に自動で渡されています（夜の情報で渡した相手が分かります）。</p>`;
},
},
});
})(window.ONW);
