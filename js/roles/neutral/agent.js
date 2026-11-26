/* 代行者（第三陣営・発案: ダイ・元ネタ: ロボトミーカンパニー。マイクラ版 extraRoles.js / main.js / vote.js / cpu.js / state.js 準拠）
* 昼開始時にランダムな指令を1つ受け、指令を達成すると追加勝利する。封印されている場合も指令は下されるが内容は分からない。
* 指令は6種（マイクラ版 AGENT_COMMANDS の並びどおり。昼開始時にランダムに1つ。対象を守れ は対象もランダムに選ばれる）:
* silent 「試合に関わらず静観しろ」 詳細: COや発言をできない。生存した場合追加勝利
* village_win 「狼を追放し村人を勝利させろ」 詳細: 村人陣営が勝利すれば追加勝利
* wolf_win 「村を滅ぼし狼を勝利させろ」 詳細: 人狼陣営が勝利すれば追加勝利
* both_lose 「村も狼もどちらも滅ぼせ」 詳細: 村人陣営と人狼陣営のどちらも勝利しなければ追加勝利
* die 「死ね。期限は500秒以内」 詳細: 死んだら追加勝利
* protect 「対象を守れ」 詳細: 対象が生存していれば追加勝利（対象は自分以外の参加者からランダム）
* 通知（待機時間の settle。詩人・観測者と同じ枠組み）:
* ・ハッキングされている / 酔っ払いで正体が伏せられている → 通知なし・指令も下されない（マイクラ版 notifyAgentCommand のスキップ条件）。
* 指令が無い代行者は判定で silent 相当（マイクラ版 agentCommandInfo のフォールバック）になる。
* ・封印されている → 「あなたは封印の狂人に封印されていたため、どんな指令か分かりませんでした。※指令自体は下されています。」（指令自体は下される）
* ・対象を守れ → 本人に「指令:「○○を守れ」詳細：対象が生存していれば追加勝利」、対象にも「代行者に守られているようです。」（対象への通知は封印されていないときだけ）
* ・昼開始時点で死亡していても指令は下される（マイクラ版は dayStart の finalRoles で判定。死の指令などのため）
* 静観（silent）の制約: COと発言ができない（マイクラ版 isAgentSilentPlayer。封印されている代行者は内容を知らないので発言できる）。
* CPU も発言しない（マイクラ版 cpuCanSpeakNow）。Web では net.js の pump / 発言・CO ハンドラで止める。
* 昼能力: 指令が「対象を守れ」のときだけ、昼に指令対象を再確認できる（マイクラ版 main.js の昼アクション）。
* 「あなたの指令対象は○○です。」（1日1回。マイクラ版 dayActionDone 相当）。それ以外の指令では昼能力は使えない。
* 勝利判定（マイクラ版 vote.js applyThirdSpecials。最終役職ベース）:
* silent → 生存 / village_win → 村人陣営が勝ち組 / wolf_win → 人狼陣営が勝ち組 / both_lose → どちらも勝ち組でない /
* die → 死亡 / protect → 対象が生存。追加勝利は「代行者」として勝ち組に加わる（恋人の心中で負けた人は Web の共通流儀で外す）。
* 保安官まわり（マイクラ版）: 死の指令の代行者は、保安官に撃たれても勝利が残る（sheriffDeathKeepsVictory。vote.js の shotLoseIds で殉教者と同扱い）。
* また、死の指令の代行者が保安官の標的になったとき従者の身代わりは起きない（sheriff.js の substituteOf で除外。ヴァニティの判定も同じ関数を使う）。
* シャッフラー: 死の指令の代行者は「死んで勝った」扱いで乗っ取り可（マイクラ版 shuffler.js の DEATH_WIN 相当。shuffler.js で判定）。
* 変化候補: 銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に AGENT が入る）。光の使徒・闇の化身には入らない。
* 模倣は Web の共通流儀で第三陣営は対象外。コスプレイヤーは村人陣営のみ。シャッフラーはマイクラ版の除外リストに AGENT が無いので山札に入る。
* 乞食: マイクラ版の「取れない対象」に AGENT は入っていないので取れる。指令は昼開始時に下されるものでカードの移動では移らない
* （夜の移動は指令の下される前。乞食が投票で代行者を取った場合は指令が無い＝ silent 相当の判定になる。マイクラ版のフォールバックと同じ）。
* ハッキング: マイクラ版の対象外リストに AGENT は入っていないので対象になる。思い込んだ人は昼に「○○を守る対象にしました。」の偽通知が出る（silver_wolf.js）。
* 神の祝福: マイクラ版では祝福の追加勝利リストに入る。Web の祝福は（神などを除く）全員が勝者になる形なので自動で一致する。
* 実績（Wiki）: agent_loss「絶縁」/ first_agent「神託代行者」/ win_agent「無我夢中、阿鼻叫喚、支離滅裂」（Web版に実績の保存は無いので ID の返却のみ）
* ※マイクラ版との差異: (1) CPU の指令開示でマイクラ版は指令キー（village_win 等）をそのまま文に入れている箇所がある（キー表示バグとみて Web は指令文で出す）。
* (2) 酔い覚めで指令は届かない（マイクラ版に酔い覚め時の通知が無いため。指令なし＝ silent 相当）。
* (3) 読経者で封印が解けたときの指令の再通知は Web に枠組みが無いため未実装（静観の発言ブロックは現在の封印状態で判定するので、解ければ自動で効く）。
* (4) 昼能力のボタンは「対象を守れ」の代行者にだけ出るため、マイクラ版の「現在の指令では昼能力を使用できません。」という文には Web では相当が無い。 */
(function () {
"use strict";
const ONW = window.ONW;

// マイクラ版 AGENT_COMMANDS（並び・文言そのまま）
const COMMANDS = [
{ key: "silent", title: "試合に関わらず静観しろ", detail: "COや発言をできない。生存した場合追加勝利"},
{ key: "village_win", title: "狼を追放し村人を勝利させろ", detail: "村人陣営が勝利すれば追加勝利"},
{ key: "wolf_win", title: "村を滅ぼし狼を勝利させろ", detail: "人狼陣営が勝利すれば追加勝利"},
{ key: "both_lose", title: "村も狼もどちらも滅ぼせ", detail: "村人陣営と人狼陣営のどちらも勝利しなければ追加勝利"},
{ key: "die", title: "死ね。期限は500秒以内", detail: "死んだら追加勝利"},
{ key: "protect", title: "対象を守れ", detail: "対象が生存していれば追加勝利"},
];
const infoOfKey = (key) => COMMANDS.find((c) => c.key === key) || COMMANDS[0];   // マイクラ版 agentCommandInfo: 未設定・不明は silent にフォールバック
const nm = (g, id) => ((g.players || []).find((q) => q.id === id) || {}).name || "?";

const A = (ONW.agent = {
COMMANDS,
holders(g) { return (g.players || []).filter((p) => g.currentRoles && g.currentRoles[p.id] === "agent").map((p) => p.id);},
/** その人の指令キー（下されていない人は null）。判定・演出はすべてこの1か所を見る */
commandOf(g, id) { return (g.agentCommand || {})[id] || null;},
infoOf(g, id) { return infoOfKey(A.commandOf(g, id));},
protectTargetOf(g, id) { return (g.agentProtectTarget || {})[id] || null;},
/** 静観の指令で CO・発言ができないか（マイクラ版 isAgentSilentPlayer。封印されている人は内容を知らないので発言できる） */
isSilent(g, id) {
if (A.commandOf(g, id)!== "silent") return false;
return!(ONW.seal && ONW.seal.is(g, id));
},
/** 指令を下す（昼開始時。マイクラ版 ensureAgentCommand: 既にあればそのまま。対象を守れ は対象も決める） */
ensureCommand(g, id) {
g.agentCommand = g.agentCommand || {}; g.agentProtectTarget = g.agentProtectTarget || {};
if (g.agentCommand[id]) return g.agentCommand[id];
const key = ONW.utils.randomChoice(COMMANDS).key;
g.agentCommand[id] = key;
if (key === "protect") {
const cand = (g.players || []).filter((p) => p.id!== id).map((p) => p.id);
if (cand.length) g.agentProtectTarget[id] = ONW.utils.randomChoice(cand);
}
return key;
},
/** 昼開始時: ハッキングされている人・酔っ払いで正体が伏せられている人には指令を下さない（マイクラ版 notifyAgentCommand のスキップ条件） */
assignAtDayStart(g) {
g.agentProtectTold = g.agentProtectTold || {};
for (const id of A.holders(g)) {
if (ONW.hack && ONW.hack.isHacked(g, id)) continue;
if (ONW.hiddenDrunk && ONW.hiddenDrunk(g, id)) continue;
const key = A.ensureCommand(g, id);
// 対象への通知（「代行者に守られているようです。」）は、封印されていない代行者のときだけ（マイクラ版）
if (key === "protect" &&!(ONW.seal && ONW.seal.is(g, id))) {
const t = A.protectTargetOf(g, id);
if (t) g.agentProtectTold[t] = true;
}
}
},
/** 追加勝利の判定（マイクラ版 applyThirdSpecials の代行者。teams は勝ち組の陣営名、dead は最終的な死亡者） */
extraWins(g, teams, dead) {
const villageWon = (teams || []).includes("村人陣営"), wolfWon = (teams || []).includes("人狼陣営");
const out = [];
for (const id of A.holders(g)) {
const key = A.infoOf(g, id).key; // 指令が無い人は silent 相当（マイクラ版のフォールバック）
let win = false;
if (key === "silent") win =!dead.has(id);
else if (key === "village_win") win = villageWon;
else if (key === "wolf_win") win = wolfWon;
else if (key === "both_lose") win =!villageWon &&!wolfWon;
else if (key === "die") win = dead.has(id);
else if (key === "protect") { const t = A.protectTargetOf(g, id); win =!!t &&!dead.has(t);}
if (win) out.push(id);
}
return out;
},
/** 結果発表の役職情報（マイクラ版の「代行者情報」。最終役職が代行者の人と、指令が下された人を出す） */
lines(g, nm) {
const seen = new Set([...A.holders(g),...Object.keys(g.agentCommand || {})]);
const out = [];
for (const p of g.players || []) {
if (!seen.has(p.id)) continue;
const info = A.infoOf(g, p.id);
if (info.key === "protect") {
const t = A.protectTargetOf(g, p.id);
out.push({ by: nm(p.id), text: `${nm(p.id)} の指令は『${t? nm(t): "？"}を守れ。』でした。`});
} else out.push({ by: nm(p.id), text: `${nm(p.id)} の指令は「${info.title}」でした。`});
}
return out;
},
/** 昼能力（指令対象の再確認）が使えるか: 最終役職が代行者で、指令が「対象を守れ」で、まだ使っていないこと（マイクラ版の昼アクション） */
canUse(g, id) {
if (!g ||!id || g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId === id || g.allDeadSkip || g.dictator || g.libraFlashing) return false;
if (!g.players ||!g.players.some((p) => p.id === id) || (g.deadIds || []).includes(id)) return false;
if (!g.currentRoles || g.currentRoles[id]!== "agent") return false;
if (A.commandOf(g, id)!== "protect") return false;
if ((g.agentDayUsed || {})[id]) return false;
if (ONW.hiddenDrunk && ONW.hiddenDrunk(g, id)) return false;
if (ONW.seal && ONW.seal.dayBlocked(g, id)) return false;
return true;
},
/** 昼能力の結果文（マイクラ版: 「あなたの指令対象は○○です。」） */
doneText(g, id) { const t = A.protectTargetOf(g, id); return `あなたの指令対象は${t? nm(g, t): "？"}です。`;},
/** 再接続時の復元用: 昼能力を使い終わっていたら、その結果文を返す */
doneOf(g, id) { return ((g.agentDayUsed || {})[id]) || null;},
achievements(g, id, won) {
// first_agent / win_agent は collect の汎用判定が付ける（first=なった役職すべて、win=最終役職のみ）。
// ここでは agent_loss だけを、最終役職が代行者のときだけ返す（マイクラ版 finalRole === AGENT && !playerWon）
if ((g.currentRoles || {})[id] === "agent" && !won) return ["agent_loss"];
return [];
},
});

ONW.defineRole("agent", {
    info: { sealTarget: true, deck: 133, name: "代行者", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 53,
desc: "昼開始時にランダムな指令を受けます。指令を達成すると追加勝利します。封印されている場合も指令は下されますが、内容は分かりません。「対象を守れ」の指令のときは、昼に指令対象を再確認できます。"},
groups: { "transform:silver_shadow": 28}, // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に AGENT が入る）
uiNight: { idle: "あなたに夜の行動はありません。昼開始時にランダムな指令が届きます。"},
settlePost(c) { A.assignAtDayStart(c.g);},
settleMsg(c, p, mode) {
const g = c.g, logs = [];
let field = null;
// 本人への指令通知（指令が下された人だけ。ハッキング・酔っ払いには下されていないので何も届かない）
if (g.currentRoles && g.currentRoles[p.id] === "agent" && A.commandOf(g, p.id)) {
const info = A.infoOf(g, p.id);
if (ONW.seal && ONW.seal.is(g, p.id)) {
const sealerName = ONW.seal.byRole && ONW.seal.byRole(g, p.id) === "elfrinde" ? "エルフリンデ" : "封印の狂人";   // 封印した側で文面を変える（マイクラ版 notifyAgentCommand）
logs.push("【指令通知】", `あなたは${sealerName}に封印されていたため、どんな指令か分かりませんでした。`, "※指令自体は下されています。");
} else if (info.key === "protect") {
const t = A.protectTargetOf(g, p.id);
logs.push("【指令通知】", `指令:「${t? nm(g, t): "？"}を守れ」`, "詳細：対象が生存していれば追加勝利");
} else {
logs.push("【指令通知】", `指令:「${info.title}」`, `詳細:${info.detail}`);
}
field = { lines: logs.slice()};
}
// 対象への通知（「対象を守れ」の対象。封印されていない代行者のときだけ assignAtDayStart で印が付く）
if ((g.agentProtectTold || {})[p.id]) logs.push("【代行者通知】", "代行者に守られているようです。");
if (!logs.length) return {};
return { logs, agent: field};
},
stageSettle: { field: "settleAgent", shown: "settleAgentShown",
run: { order: 52, run(lines, SK) { SK.later(() => { if (ONW.stage.observe) ONW.stage.observe(lines, { title: "📜 指令通知"});}, 600);}}},
coResult: {
kind: "agent",
commands: COMMANDS,
/** 指令の開示（対象を守れ以外）。文言はマイクラ版: 「指令は「title」でした。」 */
pickCommand(key, K) {
const info = infoOfKey(key);
return [`指令は「${info.title}」でした。`, { kind: "agent", command: info.key}, null, "disclose", `指令「${info.title}」`];
},
/** 指令の開示（対象を守れ）。文言はマイクラ版: 「指令は「○○を守れ。」でした。」 */
pickTarget(id, K) {
const name = K.nm(id);
return [`指令は「${name}を守れ。」でした。`, { kind: "agent", command: "protect", target: id}, null, "disclose", `指令「${name}を守れ。」`];
},
},
cpuClaim(k, g, p, r, i, c) {
const key = A.commandOf(g, p.id);
if (key === "silent") return; // 静観の CPU は発言自体が止まる（net.js の pump）。ここでも結果は出さない
const info = key? A.infoOf(g, p.id): ONW.utils.randomChoice(COMMANDS); // 指令が無い（ハッキング等）CPU はマイクラ版どおりランダムな指令を名乗る
if (info.key === "protect") {
const t = key? A.protectTargetOf(g, p.id): ONW.utils.randomChoice((g.players || []).filter((q) => q.id!== p.id).map((q) => q.id));
const name = t? nm(g, t): "？";
c.co = "agent";
c.result = { text: `私の指令は「${name}を守れ。」でした。`, short: `指令「${name}を守れ。」`, claim: { kind: "agent", command: "protect", target: t}};
return;
}
c.co = "agent";
c.result = { text: `私の指令は「${info.title}」でした。`, short: `指令「${info.title}」`, claim: { kind: "agent", command: info.key}};
},
});
})();
