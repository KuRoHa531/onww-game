/**
* 猪の狂人（boar_madman）: 人狼陣営（狂人系・干支狂人）。マイクラ版 scripts の猪の狂人を移植（第4バッチ・干支狂人の12役目）。
* 作者メモ: 「夜に選んで🐗マークでめくり」「投票数が出る前に、全員目線で猪のカードから投票者へ🐗が突進する演出」。
*
*
* ・夜に自分以外のプレイヤー1人を選ぶ（突進先）。記録は役職紐づけキー "boarMadmanTarget"（ONW.setRoleBound。
* 役職が入れ替わると記録もカードについていき、上書きされると消える。マイクラ版の役職紐づけ移転リストにも入っている）。
* ・投票では、その猪の狂人の票は「どこに投票しても必ず突進先への票」になる。マイクラ版 vote.js の
* effectiveVoteRecords で一番最後に働く強制なので、御乱心・羊の狂人の書き換え、ペンギンの滑り、
* 交換者の入れ替えがすべて終わったあとの投票先を、突進先で上書きする（ペンギンや交換者でも変わらない）。
* Web版は vote.js の tally の中で、交換者の入れ替えのあと・番犬の飼い主への票の無効化より前に
* ONW.boarMadman.applyForcing が得票数を組み替える（結果表示の swappedTarget も同じ最終先を返す）。
* 妖狐投票も tally を使うので、マイクラ版（妖狐投票も effectiveVoteRecords を使う）と同じく強制が働く。
* 魔界公爵会議は effectiveVoteRecords を使わないので対象外（馬の狂人の投票ロックと同じ）。
* ・強制の無効条件（マイクラ版の record.invalid の再計算と同じ）: 突進先が死亡している場合はその票は無効になる
* （元の投票先が死亡していて無効だった票も、突進先が生きていれば有効な票として数え直される）。
* 突進先が番犬の飼い主の場合は、番犬の無効化（tally の guardedIds）があとから効くので結果として無効になる。
* 票の重み（メイヤーなど）は投票者のもののまま。猪の狂人が投票していない・票の重みが0のときは何も起きない。
* ・封印されている猪の狂人は、夜に選べず、投票の強制も働かない（マイクラ版: sealed の猪は effectiveVoteRecords の対象外。
* 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っているため sealTarget: true）。
* ・夜に選べなかった猪の狂人（シャッフラーで置かれた等）は、マイクラ版 ensureBoarMadmanTargetsBeforeDay と同じく、
* 待機時間のはじめ（settlePre）にランダムな相手が突進先として補完され、本人にだけ「あなたは○○に突進します。」と届く。
* 補完の対象外はマイクラ版どおり: ハッキングされている本物の猪・酔いが覚めていない猪・封印されている猪。
* カルメンに囁かれて夜能力をもう1回使える場合も、突進先が無ければ選び直せるのがマイクラ版だが、
* Web版ではこの補完が同じ状態（突進先なしでは昼を迎えない）を保証する。
* ・朝の演出（作者メモ「夜に選んで🐗マークでめくり」）: 猪の狂人から見て、選んだ相手のカードが「🐗」の面
* （"__boar"）でめくれる（reveal = kind:"peek"。番犬の🦴と同じ作り）。選ばれた人には何も伝わらない。
* ・結果発表の演出（作者メモ）: 票数が出る前（stageResult の preCounts）に、全員の画面で、猪の狂人のカードから
* 突進先のカードへ 🐗 が突進する（stage.js の ONW.stage.boarCharge）。「猪のカードから投票者へ」は、
* 突進先＝猪の票が実際に入る相手（投票者ではなく投票先）と解釈した（マイクラ版の仕組み上、猪の票は突進先に入る）。
* 実際に強制が働いた（投票していて票の重みがある）猪の分だけ出す。
* ・夜の能力なので新聞に載る（ONW.newsNote）。静観者の観測対象にも入る（ONW.observeNote。マイクラ版の観測リストに
* boarMadmanTarget が入っている）。墓荒らし・ドッペルゲンガーで手にした場合は朝のうちに選べる（morning）。
* ・結果情報（マイクラ版 vote.js の「猪情報」）: 「猪の狂人○○は△△に突進していました。」を最終盤面の猪の分だけ出す。
* ・CO（マイクラ版 main.js）: 突進した相手を選ぶと「○○に突進します。」。CPUの結果開示（マイクラ版 cpu.js）は
* 「○○にしか投票できませんでした。」。
* ・変化候補（マイクラ版で確認）: 闇の化身の変化候補（TRANSFORM_ROLE_GROUPS の DARK_AVATAR）のみ。
* 光の使徒（村人陣営のみ）・銀色の影（第三陣営のみ）・コスプレイヤー（cosplayerEligibleRoles に無い）の候補ではない。
* 模倣の人狼はなれる（模倣した猪の狂人も夜に選び、投票が強制される。判定は roleForMimicEffect 相当 = ONW.mimic.eff）。
* シャッフラーの山札には入る（マイクラ版の除外は兎・龍・犬だけ）。ペルソナは Web版未実装。
* ・ハッキング: 対象外には入っていない（本物の猪の狂人もハッキングされる。思い込んだ人の偽の夜結果文
* 「あなたは○○にしか投票できません。」は銀狼側に用意。思い込みでは強制は働かない＝実効役職で判定するため。
* ハッキングされている本物の猪は補完の対象外＝マイクラ版どおり）。
* ・乞食: 取れる（マイクラ版の除外リストに無い。取られると記録は役職紐づけでカードについていく）。
* ・黄泉: マイクラ版の yomiCutStates に猪の狂人の記録を断ち切る処理は無いので、黄泉では断ち切られない
* （YAMINABE_YOMI_TARGET_ROLES は闇鍋シナジーの組み合わせ用リストで、断ち切り対象とは別。番犬・犬の狂人と同じ扱い）。
* ・トラップマスター（罠師）: 罠師の移植時に確認済み。猪の狂人は夜能力＋受動（投票の強制）で昼能力が無いため、
* 罠の干渉は無い（罠は昼能力への共通ゲートでのみ発動する）。ハンターの闇鍋シナジーはハンターの移植時に接続済み。
* ・干支シナジーの確率ルール（闇鍋で干支役職が75%で2枚以上）は Web版のシナジーに確率の仕組みが無いため未実装（他の干支狂人と同じ）。
* ・CPU: 夜の行動は自分以外の1人をランダム（デバッグ指定があればそれ）。CO は人狼陣営の共通の扱い
* （cpuClaim なし＝必ず騙る。犬の狂人と同じ）。CPUの投票先に突進先への配慮は無い（強制は集計で働く）。
* ・デバッグ: debug.js の ABILITY で "rob"（突進先を1人指定。犬の狂人と同じ）。
*/
(function (ONW) {
const R_ = () => ONW.ROLE.BOAR_MADMAN;
const ID = "boar_madman";
const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
const BOAR = "__boar";
const boarReveal = (t) => ({ kind: "peek", items: [{ k: `p:${t}`, role: BOAR}]}); // 朝: 選んだ相手のカードが🐗でめくれる（猪の狂人の画面だけ）

// ---- 突進先の判定（最終盤面から。犬の狂人の ownerOf と同じ考え方） ----
/** その人（持ち主ID）が猪の狂人を持っていて、突進先が決まっているときの突進先ID。酔いが覚めていない持ち主・突進先が不明な場合は null */
function targetOf(g, id) {
if (!g ||!g.currentRoles || ONW.mimic.eff(g, id)!== R_() || ONW.hiddenDrunk(g, id)) return null; // 模倣の人狼が猪の狂人を模倣していても数える
const t = ONW.getRoleBound(g, "boarMadmanTarget", id);
if (!t || t === id ||!g.players.some((q) => q.id === t)) return null;
return t;
}
/** 最終盤面で猪の狂人を持っている人（酔いが覚めている人）と突進先の組 [[猪の狂人の持ち主, 突進先],...]（決まっているものだけ。情報・CO用） */
function pairs(g) {
return (g.players || []).map((p) => [p.id, targetOf(g, p.id)]).filter(([, t]) => t);
}
/** 投票を強制する猪の狂人の組（封印されている猪の狂人は強制しない。情報・CO用の pairs は変えない。犬の狂人の activePairs と同じ） */
function activePairs(g) { return pairs(g).filter(([b]) =>!(ONW.seal && ONW.seal.is(g, b)));}
/** その投票者の票が強制される先（強制されなければ null）。結果表示の swappedTarget が使う */
function forcedTarget(g, voterId) {
const hit = activePairs(g).find(([b]) => b === voterId);
return hit? hit[1]: null;
}

/** 突進先を決める（夜・朝のうち共通）。holderId = 猪の狂人のカードの持ち主 */
function setTarget(g, holderId, t) { ONW.setRoleBound(g, "boarMadmanTarget", holderId, t);}

/** 文言（マイクラ版: 夜の結果・ハッキングの偽結果は「あなたは○○にしか投票できません。」、補完の通知とCOは「あなたは○○に突進します。」／「○○に突進します。」、CPUの結果開示は「○○にしか投票できませんでした。」） */
const nightLine = (name) => `あなたは${name}にしか投票できません。`;
const coText = (name) => `${name}に突進します。`;
const coShort = (name) => `突進先: ${name}`;

/**
* 投票先の強制（マイクラ版 vote.js effectiveVoteRecords の猪の狂人ブロック。一番最後に働く）。
* vote.js の tally が、ペンギンの滑り・交換者の入れ替えを反映した counts に対して、番犬の無効化より前に呼ぶ。
* counts はその場で書き換える（戻り値も同じ counts）。
* ・猪の狂人の現在の実効先（ペンギン→交換者を反映した先）から票の重みを引いて、突進先に足し直す。
* ・突進先が死亡していれば足さない（＝その票は無効。マイクラ版の invalidTarget と同じ再計算）。
* 突進先が番犬の飼い主のときは、このあとの番犬の無効化で消える（マイクラ版の protectedOwnerIds と同じ結果）。
* ・猪の狂人が投票していない・票の重みが0のときは何もしない（マイクラ版: record が無い／weight <= 0 は invalid）。
*/
function applyForcing(game, counts) {
if (!game ||!game.votes ||!ONW.vote) return counts;
const eff = ONW.vote.effectiveVotes? ONW.vote.effectiveVotes(game): {};
const swaps = (game.exchanges || []).filter((e) => ONW.vote.exchangeLive(game, e));
activePairs(game).forEach(([b, t]) => {
if (game.votes[b] == null) return; // 投票していない猪は何も起きない
const w = ONW.vote.weightOf(game, b);
if (!(w > 0)) return;
let cur = eff[b];
swaps.forEach((e) => { if (cur === e.a) cur = e.b; else if (cur === e.b) cur = e.a;}); // 交換者は強制より先（マイクラ版の順）
if (cur && counts[cur]) { const left = counts[cur] - w; if (left > 0) counts[cur] = left; else delete counts[cur];}
if ((game.deadIds || []).includes(t)) return; // 突進先が死亡していれば、その票は無効になる
counts[t] = (counts[t] || 0) + w;
});
return counts;
}

/**
* 夜に選べなかった猪の狂人への補完（マイクラ版 ensureBoarMadmanTargetsBeforeDay。待機時間のはじめ settlePre で呼ぶ）。
* 最終盤面で猪の狂人を持ち、突進先が無く、ハッキングされておらず・酔いが覚めていなくもなく・封印もされていない人に、
* ランダムな自分以外の参加者を突進先にする。本人への通知文は g.boarMadmanAuto[持ち主] = 突進先 に残し、settleMsg が届ける。
*/
function ensureTargets(c) {
const g = c.g;
if (!g ||!g.currentRoles) return;
(g.players || []).forEach((p) => {
if (ONW.mimic.eff(g, p.id)!== R_()) return;
if (targetOf(g, p.id)) return; // すでに突進先がある（酔いが覚めていない人は targetOf が null を返すので下の条件でも弾く）
if (ONW.hiddenDrunk(g, p.id)) return; // 酔いが覚めていない猪は補完しない（マイクラ版どおり）
if (ONW.seal && ONW.seal.is(g, p.id)) return; // 封印されている猪は補完しない（マイクラ版どおり）
if (g.hackRole && g.hackRole[p.id]) return; // ハッキングされている本物の猪は補完しない（マイクラ版どおり）
const others = (g.players || []).filter((q) => q.id!== p.id);
if (!others.length) return;
const t = others[Math.floor(Math.random() * others.length)].id;
setTarget(g, p.id, t);
(g.boarMadmanAuto = g.boarMadmanAuto || {})[p.id] = t;
if (g.nightLogsAll) g.nightLogsAll.push(`猪の狂人 ${p.name} は ${nm(g, t)} に突進します。`);
});
}

/** 結果発表の突進演出用（実際に強制が働いた猪の分だけ）: { list: [{ byId, by, toId, to}]} */
function resultData(g, nm2) {
if (!g ||!ONW.vote) return null;
const list = activePairs(g)
.filter(([b]) => (g.votes || {})[b]!= null && ONW.vote.weightOf(g, b) > 0)
.map(([b, t]) => ({ byId: b, by: nm2(b), toId: t, to: nm2(t)}));
return list.length? { list}: null;
}
/** 結果情報の行（マイクラ版の「猪情報」）: 「猪の狂人○○は△△に突進していました。」（最終盤面の猪の分だけ） */
function lines(g, nm2) {
return pairs(g).map(([b, t]) => `猪の狂人${nm2(b)}は${nm2(t)}に突進していました。`);
}

const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "dog_madman"]; // 猪以外の干支狂人
/**
* 実績（マイクラ版 stats.js / wiki と同じ条件）:
* win_boar_madman「一直線の勝利」 = 最終役職が猪の狂人で勝利 /
* zodiac_boar_madman「亥年」 = 試合終了時に猪以外の干支狂人が現世にいる /
* boar_madman_charge_wolf_judge「俺を止められるやつはどこにもいない」 = 最終役職が猪の狂人で、突進先の最終役職が
* 人狼判定（本物の人狼系・模倣の人狼・狼憑き、または昇格した狂人）。
* first_boar_madman「猪突猛進」（初めて猪の狂人になる）は履歴判定のため返さない（他の干支狂人と同じ）。
*/
function achievements(g, id, won) {
const out = [], cur = (g.currentRoles || {})[id];
if (cur!== ID) return out; // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外＝マイクラ版と同じ）
if (won) out.push("win_boar_madman");
if ((g.players || []).some((p) => p.id!== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_boar_madman");
const t = targetOf(g, id);
if (t) {
const tr = (g.currentRoles || {})[t];
if ((ONW.WOLF_KIND || []).includes(tr) || tr === "wolf_marked" || (g.promotedWolfIds || []).includes(t)) out.push("boar_madman_charge_wolf_judge");
}
return out;
}

ONW.boarMadman = { targetOf, pairs, activePairs, forcedTarget, setTarget, nightLine, coText, coShort, applyForcing, ensureTargets, resultData, lines, achievements};

// ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ。犬の狂人の cpuRun と同じ） ----
function cpuRun(n, p, label, cur, rid) {
const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
const t = n.validPlayer(p, f.player)? g.players.find((q) => q.id === f.player): n.pick(g.players.filter((q) => q.id!== p.id));
if (!t) return;
setTarget(g, p.id, t.id); // 役職についていく（移動「あと」に選んでも現在の持ち主に予約される）
ONW.newsNote(g, "boar_madman");
if (!cur) { i.mode = "boar_madman"; i.target = t.id;}
i.target = t.id; // 結果開示（cpuChainResult）が使う
g.nightLogsAll.push(`${label} ${p.name} は ${t.name} に突進します。`);
n.hold(p.id, nightLine(t.name));
n.ob(p.id, [t.id]);
n.nn(rid);
}

ONW.defineRole(ID, {
info: { observe: "player", sealTarget: true, deck: 154, name: "猪の狂人", team: ONW.TEAM.WOLF, wakeOrder: 12, sort: 1.7006,
desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜に自分以外の1人を選びます（突進先）。朝、猪の狂人から見て選んだ相手のカードが🐗でめくれます。投票では、どこに投票しても必ず突進先への票になります（御乱心や羊の狂人の書き換え・ペンギンの滑り・交換者の入れ替えでも変わりません）。突進先が死亡していると、その票は無効になります。封印されている間は、夜に選べず投票の強制も働きません。夜に選べなかった場合は、昼の始まりにランダムな相手が突進先になります。役職が入れ替わると、突進先の判定もカードについていきます（上書きされると消えます）。"},
groups: { mad: 3.007, "transform:dark_avatar": 36}, // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 119）で決まる
achievements,
uiNight: {
action(X) {
const { later, nowSel} = X;
return `<p class="night-step__hint">上のテーブルから、<strong>突進する相手</strong>のカードを1人分押してください。（自分以外）<br>投票では、どこに投票してもその相手への票になります。${later}</p>${nowSel("")}`;
},
chainReady: (np) => np === 1,
chainHow: () => "<strong>突進する相手</strong>のカードを押して（自分以外）",
},
stagePick: {}, // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
cpuNight: { order: 12, stage: "seer", chain: true, run: cpuRun},
night: {
kind: "seer", order: 12, // 犬の狂人と同じ（役職変動系より前）。突進先は役職の持ち主に記録するので、あとで役職が動いても追従する
complete: (np) => np === 1,
normalize: (c, players) => ({ players: players.slice(0, 1), graves: []}),
resolve(c, p) {
const g = c.g, nameOf = c.nameOf;
const t = c.selOf(p).players[0]; if (!t) return;
setTarget(g, p.id, t);
g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} に突進します。`);
c.hold(p.id, nightLine(nameOf(t)));
ONW.observeNote(g, p.id, [t], null, "boar_madman");
ONW.newsNote(g, "boar_madman");
c.rev[p.id] = boarReveal(t); // 朝、選んだ相手のカードが🐗でめくれる
},
},
/** 墓荒らし・ドッペルゲンガーで猪の狂人を手にしたとき（朝のうち）: 朝のうちに突進先を1人選べる（犬の狂人と同じ） */
morning: {
run(c) {
if (!c.players.length) return null;
const g = c.g, id = c.id, t = c.players[0];
setTarget(g, id, t);
g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} に突進します。`);
return { lines: [nightLine(c.nameOf(t))], reveal: boarReveal(t), nextChain: null};
},
},
/** 墓荒らし・ドッペルゲンガーで猪の狂人を手にしたCPUが、続けて言う結果: 朝のうちに選んだ突進先（決めていないときは言わない。マイクラ版 cpu.js の文） */
cpuChainResult(k, g, p, i) {
const t = i.target && g.players.find((q) => q.id === i.target && q.id!== p.id);
return t? { short: coShort(t.name), text: `${t.name}にしか投票できませんでした。`, claim: { kind: ID, target: t.id}}: null;
},
// 結果開示(COボタン)の流れ(co.js が kind で引く): 突進した相手を選ぶ（文はマイクラ版 main.js の CO 文）
coResult: {
kind: ID, targetLabel: "突進した相手",
pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: ID, target: id}, null, "disclose", coShort(K.nameOf(id))],
},
/** 待機時間のはじめ: 夜に選べなかった猪の狂人に、ランダムな突進先を補完する（マイクラ版 ensureBoarMadmanTargetsBeforeDay） */
settlePre: { order: 20, run(c) { ONW.boarMadman.ensureTargets(c);}},
/** 待機時間: 補完で突進先が決まった猪の狂人にだけ、その相手を知らせる（マイクラ版の tell「あなたは○○に突進します。」） */
settleMsg: { order: 20, run(c, p, mode) {
const g = c.g, t = (g.boarMadmanAuto || {})[p.id];
if (mode!== "settle" ||!t) return {};
return { logs: [`あなたは${nm(g, t)}に突進します。`]};
}},
/** 結果発表: 票数が出る前に、全員の画面で猪の狂人のカードから突進先へ 🐗 が突進する（作者メモ） */
stageResult: {
preCounts: { order: 1, run(R) {
const F = R.res.boarCharges;
if (!F ||!F.list ||!F.list.length) return;
F.list.forEach((x, i) => {
R.later(() => {
R.setCap(`<div class="res-cap__t t-wolf">猪の狂人</div><div>${R.esc(x.by)} の票は ${R.esc(x.to)} へ！</div>`);
if (ONW.stage && ONW.stage.boarCharge) ONW.stage.boarCharge(x.byId, x.toId);
if (ONW.sound) ONW.sound.se("vote_move");
}, R.t + i * 550);
});
R.t += F.list.length * 550 + 1000;
}},
},
});
})(window.ONW = window.ONW || {});
