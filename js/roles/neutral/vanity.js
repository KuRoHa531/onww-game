/**
* ヴァニティ（第三陣営・昼能力）: 自分を保安官だと思い込んでいる役職。マイクラ版 VANITY / Wiki の説明が正。
* 昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を保安官のように撃てる（1日1回）。
*
*
* ・本人は自分を保安官だと思い込んでいる: 配られるカード・酔い覚め・墓荒らし/ドッペルで手にしたときの表示はすべて「保安官」
* （groups.selfAsSheriff → ONW.SELF_AS_SHERIFF / ONW.shownRole。偽占い師の selfAsSeer と同じ仕組み）。
* ・人外（村人陣営でない相手。保安官の ONW.sheriff.isHit と同じ判定）を撃った場合: その人は保安官の執行と同じく死に（kind "shot"・勝利条件と投票権を失う）、
* ヴァニティは村人陣営が勝てば追加勝利する。
* ・村人陣営を撃った場合（作者確認済みの仕様）: **対象は死ぬ（保安官の執行と同じ死）。ヴァニティ自身は死なず、それによって自分の正体（ヴァニティ）に気づく。**
* 保安官なら誤爆で自分が死ぬはずなのに死ななかったことで気づく、という筋。気づいた瞬間に、本人の画面で自分のカードがヴァニティとしてめくれて数秒後に裏に戻る
* （stageFlash "vanityFlash"・本人だけに届く "vanityaware"）。気づいたことは情報確認にも載り、役職確認（📕）の自認の流れにも「ヴァニティ」が足される。
* 村人陣営が敗北すれば追加勝利する。
* ・撃たなかった場合は敗北する（追加勝利なし）。
* ・人狼王のガード / シュレディンガーの猫（ヴァニティ陣営に固定。マイクラ版 sheriffSpecialCatTeam "ヴァニティ"）/ ネコカボチャ（道連れ）/ 従者の身代わり / 騎士の守りは、保安官と同じ扱い（judge が保安官の部品を流用）。
* ネコカボチャを撃ったときだけ、ヴァニティも道連れで死ぬ（その場合も「人外を撃った」記録は残る）。
* ・使えるのは、最終盤面でヴァニティを持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ（保安官の canUse と同じ流儀。配役直後の役職には依存しない）。
* 模倣の人狼がヴァニティを模倣した場合も撃てる（模倣保安官と同じ。ただし気づき演出・追加勝利は本物のヴァニティだけ）。
*
*
* g.vanityShots = [{ by, target, mode, kind, victims, tomo, sub, followIds, keepVictory, knightGuard, mimic}]（撃った順。net.startGame が [] に戻す）
* mode: "hit"(人外を撃った) | "aware"(村人陣営を撃った) | "pumpkin"(ネコカボチャ) | "guarded"(人狼王にガードされた) | "cat"(猫を固定) | "none"(固定済みの猫)
* kind: "outsider"(人外を撃った) | "village"(村人陣営を撃った)。追加勝利の判定（wins）はこれだけを見る。
* g.vanityAware = { [id]: true}（村人陣営を撃って正体に気づいた人）
* 呼び出し: net.js の hostVanity（ホスト）→ ONW.vanity.canUse / targets / judge / record。
* 通信は保安官と共用: act "dictopen" → "sheriffok" → カード選択(stage.js mode "shoot") → act "shoot" → ホストがヴァニティなら hostVanity に振り分ける。
* 撃った本人には "sheriffdone"（保安官と同じ文言）＋気づいたときだけ "vanityaware"。
* 勝敗: vote.js の set() が ONW.vanity.wins を見て追加勝利に足す（優先度の表に新しい行は作らない。追加勝利は対象外）。
* 撃たれて死んだ人は ONW.vanity.lostIds を保安官の lostIds と合算して勝利条件を失う（vote.js / state.js の deathFollowers は followsShot も見る）。
* 銀狼ハッキング: 初期役職ヴァニティは NO_HACK でハッキングされない（silver_wolf.js に登録済み）。
* ハッキングで「ヴァニティ」を思い込んだ人は、shownRole で「保安官」と見える（思い込みの二重構造が保安官に畳まれる）ので、
* 偽の昼能力は silver_wolf.js の DAY.vanity（保安官と同じ sheriffok 画面・偽の結果文）で処理される。
*/
(function (ONW) {
const R = () => ONW.ROLE;
const ID = "vanity";
const isDead = (g, id) => (g.deadIds || []).includes(id);

/** この人が（もう）撃ったか */
const used = (g, id) => (g.vanityShots || []).filter((e) => e.by === id).length >= (ONW.carmen? ONW.carmen.dayUses(g, id): 1); // カルメンに囁かれた人は昼能力を2回使える（保安官と同じ）
/** ヴァニティの昼能力を使える人か（最終盤面の役職がヴァニティ・酔いが覚めている・生きている・まだ撃っていない・昼の議論中でタイマーが動いている・撃てる人がいる。保安官の canUse と同じ条件） */
function canUse(g, id) {
if (!g || g.allDeadSkip || g.dictator) return false;
if (g.phase!== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false; // 昼のタイマーが動き出す前は使えない（保安官と同じ）
if (!g.currentRoles || ONW.mimic.actRole(g, id, g.currentRoles[id])!== R().VANITY) return false; // 模倣の人狼がヴァニティを模倣していても使える（模倣保安官と同じ）
if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false; // 封印の狂人に封印されている: 昼能力は使えない
if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
return targets(g, id).length > 0;
}
/** 撃てる人（生きている自分以外。保安官と同じ） */
function targets(g, id) {
return (g.players || []).map((p) => p.id).filter((x) => x!== id &&!isDead(g, x));
}
/** 正体に気づいているか */
const aware = (g, id) =>!!((g.vanityAware || {})[id]);

/**
* 撃った結果を決める（状態は変えない）。保安官の judge と同じ部品（isHit・substituteOf・人狼王ガード・ネコカボチャ・猫の固定）を使い、
* 違いは「村人陣営を撃ったとき」だけ: 保安官は誤爆で自分が死ぬが、ヴァニティは対象が死に（執行と同じ）、自分は死なずに正体に気づく（mode "aware"）。
*/
function judge(g, by, target) {
const r = R(), role = g.currentRoles[target];
const out = { by, target, mode: "none", kind: null, victims: [], tomo: [], sub: null, followIds: [], keepVictory: []};
if (ONW.mimic.actRole(g, by, g.currentRoles[by]) === r.VANITY && g.currentRoles[by]!== r.VANITY) out.mimic = true; // 模倣の人狼が模倣したヴァニティ（気づき・追加勝利の対象外）
// 人狼王: 他に生きている人狼判定がいればガード（保安官と同じ）
if (ONW.kingActive && ONW.kingActive(g, target) && ONW.kingProtected(g, target, new Set(g.deadIds || []), new Set([target]))) { out.mode = "guarded"; out.kind = "outsider"; return out;}
// ネコカボチャ: 撃つとネコカボチャが死に、ヴァニティは道連れで死ぬ（保安官と同じ連鎖）
if (ONW.mimic.isAs(g, target, r.CAT_PUMPKIN) &&!ONW.hiddenDrunk(g, target) &&!ONW.seal.is(g, target)) { out.mode = "pumpkin"; out.kind = "outsider"; out.victims = [target]; out.tomo = [by]; out.followIds = [target, by]; return out;}
// シュレディンガーの猫: 誰も死なない。猫はヴァニティ陣営に固定される（マイクラ版 sheriffCatTeam。模倣ヴァニティなら模倣保安官と同じ人狼陣営）
if (role === r.SCHRODINGER_CAT) { if (!ONW.sheriff.catFixed(g, target)) { out.mode = "cat"; out.kind = "outsider"; out.catFix = true; out.catTeam = out.mimic ? "wolf" : "vanity";} return out;}
const msub = ONW.matthias ? ONW.matthias.daughterSubForShot(g, target) : null; // マティアス: 娘ちゃんの犠牲が従者の身代わりより先（マイクラ版）
const sub = msub || ONW.sheriff.substituteOf(g, target); // 従者の身代わり（執行と同じ条件）
if (ONW.sheriff.isHit(g, target)) {
out.mode = "hit"; out.kind = "outsider";
if (sub) { out.sub = sub; if (msub) out.msub = msub; out.victims = [sub]; out.keepVictory = msub ? [] : [sub];} // 従者が身代わりに撃たれる（勝利条件は失わない）。娘ちゃんが犠牲のときは撃たれた人として勝利条件を失う
else out.victims = [target];
return out;
}
// 村人陣営を撃った: 対象が死に（執行と同じ）、ヴァニティは死なずに正体に気づく（作者確認済みの仕様）
out.mode = "aware"; out.kind = "village";
if (sub) { out.sub = sub; if (msub) out.msub = msub; out.victims = [sub]; out.keepVictory = msub ? [] : [sub];}
else out.victims = [target];
return out;
}
/** 撃ったことを記録する（net.js の hostVanity が judge の結果を渡す）。戻り値: 記録した e（すでに撃っていれば null） */
function record(g, plan) {
if (!plan || used(g, plan.by)) return null;
(g.vanityShots = g.vanityShots || []).push(plan);
if (plan.catFix) { (g.sheriffCatFix = g.sheriffCatFix || {})[plan.target] = plan.by; if (plan.catTeam) (g.sheriffCatTeam = g.sheriffCatTeam || {})[plan.target] = plan.catTeam;} // 猫の陣営固定は保安官と共用（vote.resolveCats が見る）
return plan;
}
/** 正体に気づいたことにする（村人陣営を撃って、実際に誰かが撃たれて死んだとき。騎士に守られて誰も死ななかったときは気づかない） */
function becomeAware(g, id) {
(g.vanityAware = g.vanityAware || {})[id] = true;
}
/** ヴァニティの死に従者が後追いするか（state.js の deathFollowers が kind "shot" / "tomo" のとき保安官と並んで見る）。ネコカボチャで死んだ2人だけ */
function followsShot(g, id) {
return (g.vanityShots || []).some((e) => (e.followIds || []).includes(id));
}
/** ヴァニティに撃たれて死んで「勝利条件を失う」人のID（保安官の lostIds と同じ規則。vote.js が保安官の分と合算する） */
function lostIds(g) {
const keep = new Set((g.vanityShots || []).flatMap((e) => e.keepVictory || []));
const tomo = new Set((g.vanityShots || []).flatMap((e) => e.tomo || []));
return Object.keys(g.deadKind || {}).filter((id) => (g.deadIds || []).includes(id) &&!keep.has(id) && (g.deadKind[id] === "shot" || (g.deadKind[id] === "tomo" && tomo.has(id))));
}
/**
* 追加勝利するか（vote.js の set() が、最終盤面でヴァニティを持つ人について呼ぶ）。
* 人外を撃った → 村人陣営が勝てば勝利 / 村人陣営を撃った → 村人陣営が勝たなければ勝利 / 撃っていない → 敗北。
* teams は set() が決めた勝利陣営の表示名（「村人陣営」が含まれるかで村人陣営の勝ちを見る。神の祝福など陣営名に村人陣営が無い結果は「村人陣営の勝利ではない」として扱う）。
* winners（set() の勝者集合）が渡されたときは、マイクラ版 resultHasActualVillageWinner と同じく、「村人陣営」が勝ちに含まれていても
* 実際に村人陣営の役職の勝者が1人もいなければ村人陣営の勝利と数えない（例: 唯一の村人陣営の勝者が保安官に撃たれて勝利条件を失った場合）。
* 「村人陣営の勝者」かどうかは、vote.js の基本勝敗が勝者を振り分けるときと同じ物差し（ONW.magicalGirl.teamOf）で見ること。
* ROLE_INFO の静的な team だけで見ると、闇堕ちしていない魔法少女（ROLE_INFO は第三陣営だが、勝敗では村人陣営側）が
* 唯一の村人側勝者のときに「村人陣営の勝者がいない」と誤判定し、村人を撃ったヴァニティが村人陣営勝利で追加勝利してしまう
* （逆に人外を撃ったヴァニティが村人陣営勝利で勝てなくなる）。吊られた呪われし者（人狼陣営側に数える）も vote.js と同じく除く。
*/
function wins(g, id, teams, winners) {
const e = (g.vanityShots || []).find((x) => x.by === id);
if (!e ||!e.kind) return false;
let villageWon = (teams || []).includes("村人陣営");
if (villageWon && winners) { const cw = g.cursedWolfIds || []; villageWon = [...winners].some((x) => x !== id && !cw.includes(x) && (ONW.hotaru && ONW.hotaru.teamOf ? ONW.hotaru.teamOf(g, x) : ONW.magicalGirl ? ONW.magicalGirl.teamOf(g, x) : ((ONW.ROLE_INFO[(g.currentRoles || {})[x]] || {}).team)) === ONW.TEAM.VILLAGE); }
return e.kind === "outsider"? villageWon:!villageWon;
}
/** 結果発表「昼行動結果」の1行（保安官と同じ言い回し。誰が誰を撃ったかだけ） */
function actText(byName, targetName) {
return `${ONW.roles.getInfo(R().VANITY).name} ${byName} は ${targetName} を撃ちました。`;
}
/** 撃った本人の情報確認の文（保安官と同じ。騎士に守られたときだけ 🛡️ を足す） */
const doneText = (e, name) => ONW.sheriff.doneText(e, name);
/** 正体に気づいたときに本人へ届く文（情報確認・結果発表の情報確認に載る） */
const awareText = () => "あなたは保安官ではなく、ヴァニティでした。";
/** 結果発表用: 撃った順 [{ by, target, act, info}]（保安官の lines と同じ形。ui.js が「ヴァニティ:」の行で出す） */
function lines(g, nm) {
return (g.vanityShots || []).map((e) => {
const by = nm(e.by), tg = nm(e.target), sub = e.sub? nm(e.sub): "";
let info = "";
if (e.mode === "hit" && e.msub) info = `${by} はヴァニティです。${tg} はマティアスでしたが、娘ちゃん ${sub} が犠牲になって執行を回避しました（${tg} は無傷）。`;
else if (e.mode === "hit" && e.sub) info = `${by} はヴァニティです。${tg} は村人陣営ではない人でしたが、従者 ${sub} が身代わりに撃たれました（${tg} は無傷・${sub} は勝利条件を失いません）。`;
else if (e.mode === "hit") info = `${by} はヴァニティです。${tg} は村人陣営ではない人でした。${tg} が撃たれ、勝利条件と投票権を失いました。`;
else if (e.mode === "aware" && e.sub) info = `${by} はヴァニティです。${tg} は村人陣営でしたが、従者 ${sub} が身代わりに撃たれました。${by} は自分の正体がヴァニティだと気づきました。`;
else if (e.mode === "aware") info = `${by} はヴァニティです。${tg} は村人陣営でした。${tg} が撃たれ、${by} は自分の正体がヴァニティだと気づきました。`;
else if (e.mode === "pumpkin") info = `${tg} はネコカボチャでした。${tg} が撃たれ、道連れで ${by} も死に、2人とも勝利条件と投票権を失いました。`;
else if (e.mode === "guarded") info = `${tg} は他に人狼判定の人がいる人狼王だったため、何も起きませんでした。`;
else if (e.mode === "cat") info = `${tg} はシュレディンガーの猫でした。誰も死なず、${tg} は${e.catTeam === "wolf"? "人狼陣営": e.catTeam === "vanity"? "ヴァニティ陣営": "村人陣営"}に固定されました。`;
else info = `${tg} はシュレディンガーの猫でしたが、すでに陣営が固定されていたため、何も起きませんでした。`;
if (e.knightGuard && e.knightGuard.length) {
if (e.mode === "hit" && e.msub) info = `${by} はヴァニティです。${tg} はマティアスでした。娘ちゃん ${sub} が犠牲になろうとしましたが、騎士に守られ、死にませんでした。`;
else if (e.mode === "hit") info = `${by} はヴァニティです。${tg} は村人陣営ではない人でしたが、騎士に守られ、死にませんでした。`;
else if (e.mode === "aware") info = `${by} はヴァニティです。${tg} は村人陣営でしたが、騎士に守られ、死にませんでした。`;
else info = `${tg} はネコカボチャでした。${tg} が撃たれ、道連れの ${e.knightGuard.map(nm).join("、")} は騎士に守られ、死にませんでした。`;
}
return { by, target: tg, act: actText(by, tg), info};
});
}
/**
* 実績（wiki-data.js の「ヴァニティ」に定義済みの4つ）。Web版にはまだ実績を保存する仕組みが無いので、
* 「この試合で id が満たした実績ID」を返すだけ（殉職者・バランサーなどと同じ形。保存側ができたら呼ぶ）。won: その人が勝ったか
*/
function achievements(g, id, won) {
const out = [], r = R();
if (g.initialRoles && (g.initialRoles[id] === r.VANITY || (g.currentRoles || {})[id] === r.VANITY)) out.push("first_vanity"); // 初めてヴァニティになる（配られたカード・最終盤面のどちらかでヴァニティだった）
const e = (g.vanityShots || []).find((x) => x.by === id);
if (e && (g.currentRoles || {})[id] === r.VANITY) {   // 3実績とも最終役職がヴァニティのときだけ（マイクラ版準拠）
if ((g.currentRoles || {})[e.target] === r.SHERIFF) out.push("vanity_shoot_sheriff"); // ヴァニティで保安官を撃つ
const rawTeam = (ONW.ROLE_INFO[(g.currentRoles || {})[e.target]] || {}).team;   // 分類は標的の素の陣営（保安官の人狼判定ではない。恋人・シャッフラー印の村人は村人陣営、人狼判定される白い人狼は人狼陣営）
if (won && rawTeam === ONW.TEAM.VILLAGE) out.push("vanity_fake_justice"); // 村人陣営を撃ち、村人陣営が敗北して勝利する
if (won && rawTeam && rawTeam !== ONW.TEAM.VILLAGE) out.push("vanity_second_sheriff"); // 人外を撃ち、村人陣営と共に勝利する
}
return out;
}
ONW.vanity = { canUse, targets, used, aware, judge, record, becomeAware, followsShot, lostIds, wins, actText, doneText, awareText, lines, achievements};

// ======================================================================
// 保安官のCPUと同じ考え方（自分を保安官だと思い込んでいるので、発言・COも保安官そのまま）。
// ・撃つ判断（cpuPick）: 自分が見て「確実に人外」と分かっている人がいるときだけ撃つ（保安官の cpuKnownHit を流用）。
// 村人陣営に当たっても自分は死なないが、CPUは自分を保安官だと思っているので、誤爆（=自分が死ぬ）を怖がる動きのままにする。
// ・撃った後（cpuSpeak）: 死んでいなければ「〇〇を撃ちました。」と言う（保安官と同じ文言・同じ claim）。
// ======================================================================
function cpuPick(k, g, p) {
if (!canUse(g, p.id)) return null;
const me = g.drunkOverlay && g.drunkOverlay[p.id]? ONW.shownRole(g.currentRoles[p.id]): k.selfRole(g, p); // 酔いが覚めたCPUは最終役職を保安官だと思っている（shownRole が保安官に畳む）
if (me!== R().SHERIFF) return null;
const i = k.infoOf(g, p.id), mates = ONW.loverMates(g, p.id);
const sure = targets(g, p.id).filter((t) =>!mates.includes(t) && ONW.sheriff.cpuKnownHit(i.known[t])); // 恋人の相方は撃たない（保安官と同じ）
if (!sure.length) return null;
const wolves = sure.filter((t) => k.isWolf(i.known[t]));
return k.pick(wolves.length? wolves: sure);
}
function cpuSpeak(k, g, p, plan) {
if (!plan || (plan.victims || []).includes(p.id) || (plan.tomo || []).includes(p.id)) return []; // ネコカボチャの道連れで自分が死ぬときは話さない
const nm = k.nameOf(g, plan.target);
return [{ p, text: ONW.sheriff.shotText(nm), short: ONW.sheriff.shotShort(nm), result: true, claim: { kind: "sheriff", target: plan.target}, gap: 3500}];
}
Object.assign(ONW.vanity, { cpuPick, cpuSpeak});

ONW.defineRole("vanity", {
info: { sealTarget: true, deck: 119, name: "ヴァニティ", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 47,
desc: "第三陣営。自分を保安官だと思い込んでいます。夜の能力はありません。昼の議論中に「昼能力」ボタンから、生きている自分以外の1人を保安官のように撃ちます。人外（村人陣営でない人）を撃つと、その人は死に、村人陣営が勝てば追加で勝利します。村人陣営を撃つと、その人は死に、自分は死なない代わりに自分の正体がヴァニティだと気づきます（自分のカードがヴァニティとしてめくれます）。その場合は、村人陣営が敗北すれば追加で勝利します。撃たなかった場合は敗北します。使えるのは酔いが覚めたあとの昼に1回だけで、最終的にヴァニティを持っている人が使えます。"},
groups: { "transform:silver_shadow": 30, selfAsSheriff: 1}, // 銀色の影の変化先（第三陣営の役職は必ず入れる）/ 本人は保安官だと思い込む（ONW.SELF_AS_SHERIFF）
// CPU: 本物は自分を保安官だと思い込んでいるので、必ず「保安官CO」（保安官の cpuClaim と同じ）
cpuClaim(k, g, p, r, i, c) { c.co = "sheriff";},
cpuPick,
cpuSpeak,
// 結果開示(COボタン・co.js が kind で引く): 「ヴァニティCO」だけで終わらせられる(noChain)。結果開示で執行した相手を選ぶ → 「〇〇 を執行しました。」（マイクラ版 main.js のヴァニティの結果開示と同じ。本人は保安官だと思い込むので通常は保安官COから保安官の結果開示を使う）
coResult: {
kind: "vanity", targetLabel: "執行した相手", noChain: true,
pickPlayer: (id, K) => [`${K.nameOf(id)} を執行しました。`, { kind: "vanity", target: id }, null, "disclose", `${K.nameOf(id)} を執行した`],
},
// 昼の気づき演出（stage.js の flashes("early") が g.vanityFlash を渡す。本人だけに届く "vanityaware" で積まれる）:
// 自分のカードがヴァニティとしてめくれ、数秒後に裏に戻る（心眼の人狼の stageFlash と同じ仕組み）。観戦者・他の人には届かない
stageFlash: {
field: "vanityFlash", when: "early",
run(list, SK) {
list.forEach((x, i) => SK.later(() => {
const k = `p:${x.id}`;
SK.up[k] = "vanity"; SK.glow[k] = true;
SK.paint(SK.G());
}, 200 + i * 380));
SK.later(() => {
list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k];});
SK.paint(SK.G());
}, 200 + list.length * 380 + 3200);
},
},
});
})(window.ONW);
