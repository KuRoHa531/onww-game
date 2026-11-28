/**
* テレパシスト（マイクラ版 TELEPATHIST を正とする）: 第三陣営 / deck 179 / wiki order 180 / 発案: くろは / 元ネタ: 人狼ジャッジメント。
*
* ・夜の行動: 自分以外の参加者1人を選んで「接続」する（マイクラ版 openTelepathistAction）。
* 記録は役職に紐づく（g.telepathistTarget[持ち主ID] = 対象のプレイヤーID。ONW.setRoleBound）。
* 役職が怪盗・いたずらっ子・墓荒らし・グレムリンなどで動いたら記録もカードについて動く（state.js の ROLE_BOUND_KEYS）。
* グレムリンのコピー = コピー先に接続先を複製（マイクラ版 night.js の copiedRole 再選択リストに TELEPATHIST）。
* ドッペルのコピー = 引き継がない（朝のうちに選ぶ）。役職が上書きされた席の古い記録は消える。
* 自己参照は補正しない（マイクラ版 PRESERVE_RAW_SELF_REFERENCE_FIELDS 相当。追加勝利の条件で弾く）。
* ウサギの狂人の草むらに隠れた対象は選んでも失敗（Web版の夜解決の共通処理が担う）。
* 封印されているテレパシストは夜に選べない（Web版は封印中は夜の resolve が呼ばれない）。
* 新聞屋に役職が記録される（ONW.newsNote）。詩人は接続先を知る（poetNightTargetEvents。観測ログ経由）。
* 本人の夜の知らせ（マイクラ版 tell）: 「あなたは {対象} に接続しました。」。夜ログ: 「テレパシスト {名前} は {対象} に接続しました。」（リザルトの夜行動結果では「接続していました。」に変換して出す）。
* ・待機時間の知らせ（作者メモ）: 接続された側へ「テレパシストに接続されました。」を知らせる。
* その人の画面でだけ、テレパシスト本人のカードがテレパシストの面でめくれる（マイクラ版は文だけ。めくりは作者メモ）。
* 接続された側が酔っ払い中（未覚醒）のときは知らせない（酔いが覚めたときに届く。マイクラ版 isHiddenDrunkPlayer の除外）。
* テレパシストのカードを新しく手にした持ち主には、接続先を文章で知らせる（復讐者・道化の怨霊と同じ作り）。
* ・テレパシーチャット（作者メモ: 人狼ジャッジメントみたいにチャット切り替え）: 昼の間、接続の連結成分どうしで会話できる。
* マイクラ版 main.js のテレパシー送信（sendCustomChat の分岐）を Web版のチャット基盤に載せた:
* - 辺は「持ち主の最終役職がテレパシスト・封印されていない・両者生存」のときだけ有効（連結成分が1つのチャットになる）。
* - 送信は昼画面の入力欄の切り替え（全体チャット / テレパシー）。届いた発言はタグつきで同じ欄に流れる
* （霊界チャットと同じ「タブ分けせずタグで出す」Web版の流儀。成分の外の人には届かない）。
* - 未覚醒の酔っ払いは送受信できない。口封じ・コーヒーの沈黙・代行者の沈黙はテレパシーには効かない（マイクラ版準拠）。
* - 観戦者（GM）には全部届く。CPUはテレパシーで発言しない（マイクラ版のCPUも使わない）。
* - オフライン（CPU戦）にはチャット自体が無いので、テレパシーチャットはオンライン専用。
* ・後追い: 接続先が死ぬとテレパシストも後追いする（死因 "follow"。マイクラ版 applyTelepathistFollowFor /
* applyTelepathistDayFollow）。投票の連鎖は vote.js の kill と事前死亡バッチ、昼中の死は state.js の
* ONW.deathFollowers 経由で net.killPlayer がその場で後追いさせる。封印中でも後追いする（マイクラ版に封印条件なし）。
* ただし投票時の呪殺・毒殺（貫通）で接続先が死んだ場合は、Web版の他の後追いと同じく後追いしない
* （昼の始めの呪殺は昼中死亡として後追いする。マイクラ版の preVoteDeadIds 経由の後追いに合わせた）。
* ・追加勝利（マイクラ版 applyTelepathistExtraWins）: 最終役職がテレパシストで、恋人でなく、黄泉で切断されておらず、
* 接続先が勝者に入っていて、かつ（接続先が生存 / 接続先が「死なないと勝てない役職」で死んで勝利 /
* 接続先が死ね命令の代行者で死んで勝利）のとき追加勝利。相互接続（相手もテレパシストで自分を接続）は対象外。
* 自分への接続（自己参照）も対象外。適用位置は vote.js の set() の復讐者の直後。
* ・黄泉: 接続のどちらかが黄泉に切られると接続が消え、切断されたテレパシストは追加勝利できなくなる
* （マイクラ版は noVictoryIds。Web版は g.telepathistDisconnected で追加勝利だけを止める）。
* 両者に「接続が切断されました。」を知らせる（yomi.js に接続済み）。
* ・封印: 封印の対象役職（マイクラ版 YAMINABE_SEAL_TARGET_ROLES に TELEPATHIST が入っている。113役目）。
* 封印されたテレパシストは夜に接続できず、テレパシーの辺も切れる（後追いはする）。
* ・変化候補（マイクラ版 TRANSFORM_ROLE_GROUPS / PERSONA_MASK_EXCLUDED_ROLES / shufflerEligibleRoles / cosplayerEligibleRoles）:
* 銀色の影 = 入る（groups "transform:silver_shadow": 39。道化の怨霊 38 の次）/ 光の使徒・闇の化身 = 入らない /
* 模倣 = できない（第三陣営）/ コスプレ = 入らない（村人陣営のみ）/ シャッフラー = 山札に入らない
* （マイクラ版 shufflerEligibleRoles の除外リストに TELEPATHIST がある → shuffler.js の BLOCKED に登録）/
* ペルソナ = 仮面候補に入る（除外リストに無い）。
* ・ハッキング: 対象にも思い込み先にもなる（銀狼の NO_HACK / NO_FAKE に入っていない）。
* 思い込んだ人の偽の夜結果は「{対象}に接続しました。」（silver_wolf.js に接続済み。チャット・後追い・追加勝利は本物だけ）。
* 本物のテレパシストが別の役職と思い込まされていても、最終役職で判定は通常どおり。
* ・シナジー: 見張り番・鈴の巫女の対象リスト（マイクラ版 YAMINABE_LOOKOUT_TARGET_ROLES / YAMINABE_BELL_MIKO_TARGET_ROLES）に
* すでに入っている（roles.js の文字列のまま自動で効く）。多重人格の反転リストにも入っている（GUI選択の夜能力）。
* 封印シナジーの対象には sealTarget で自動で入る（wiki/js/synergy-data.js の3リストにも追加済み）。
* ・CPU: 夜は自分以外の1人をランダムに選ぶ。投票では接続先を避ける（接続先が勝たないと追加勝利できないため）。
* ・デバッグ: 能力先の指定は debug.js の ABILITY に telepathist: "rob"（1人指定）を登録。
* ・実績（マイクラ版 stats.js / wiki-data.js）: first_telepathist「一念通天」/ win_telepathist「以心伝心」/
* telepathist_follow_death「一心同体」（テレパシストとして後追い死した）。
* ・結果情報（情報確認。第6バッチ共通指示）: net.js の res.telepathists → ui.js の「テレパシスト:」行。
* 接続の行は Web版の補足文、後追いの行はマイクラ版の連鎖ログ文「テレパシスト {名前} は接続先の後を追って死亡しました。」。
* ・接続された人のCO（マイクラ版 openTelepathistConnectedInfoCoMenu）: 「テレパシストの{名前}に接続されました。」/
* 伏せる場合は「テレパシストに接続されました。」を言える。co.js の情報開示（kind "telepathist-connected"）に接続済み。
*/
(function (ONW) {
const T = "telepathist";
const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
const R_ = () => ONW.ROLE.TELEPATHIST;
/** 夜・朝のうちの選択を記録する（役職についていく）。持ち主 holderId のカードの接続先 = targetId */
function setTarget(g, holderId, targetId) { ONW.setRoleBound(g, "telepathistTarget", holderId, targetId);}
/** 持ち主 holderId のカードの接続先（記録がなければ undefined）。自己参照も補正せずそのまま返す */
function targetOf(g, holderId) { return ONW.getRoleBound(g, "telepathistTarget", holderId);}
/** 記録の持ち主（プレイヤーID、または墓地の "g:番号"）が、いまテレパシストのカードを持っているか */
function holdsCard(g, key) {
if (String(key).startsWith("g:")) return (g.center || [])[+String(key).slice(2)] === R_();
return g.currentRoles[key] === R_();
}
/** テレパシストのカードを持っていない持ち主の記録を消す（役職が動く・上書きされるたびに state.js から呼ぶ）。
* カードが人から人へ動くときの記録の移動は swapBound（ROLE_BOUND_KEYS）が済ませている。自己参照の補正はしない */
function fix(g) {
const m = g && g.telepathistTarget;
if (!m) return;
Object.keys(m).forEach((k) => { if (!holdsCard(g, k) || m[k] === undefined) delete m[k];});
}
/** 最終盤面でテレパシストのカードを持っている人の [持ち主, 接続先]。接続先が実在する記録だけ。
* 自己参照（接続先が持ち主自身）の記録は含めない（マイクラ版の追加勝利・後追い・チャットのどれも自己参照を扱わない） */
function picks(g) {
const out = [];
g.players.forEach((p) => {
if (g.currentRoles[p.id]!== T) return;
const t = targetOf(g, p.id);
if (!t || t === p.id ||!g.players.some((q) => q.id === t)) return;
out.push([p.id, t]);
});
return out;
}
/** 知らせた記録（持ち主側）: g.telepathistSeen[持ち主ID] = その人が「接続先を知っている」接続先のID */
const seen = (g, id, t) => { (g.telepathistSeen = g.telepathistSeen || {})[id] = t;};
const seenOf = (g, id) => (g.telepathistSeen || {})[id];
/** 知らせた記録（接続された側）: g.telepathistTold[接続先ID] = 知らせたテレパシストのID */
const toldOf = (g, id) => (g.telepathistTold || {})[id];
/** CPUの記憶（投票判断 cpuVoteScore が使う i.telepathistTarget）に、いま持っている接続先を入れる */
function cpuLearn(g, id, t) { if (ONW.cpu && ONW.cpu.kit) ONW.cpu.kit.infoOf(g, id).telepathistTarget = t;}
const isDead = (g, id) => (g.deadIds || []).includes(id) || (g.eliminated || []).includes(id);
/** 接続先 deadId の後を追うテレパシスト（現在の持ち主）。すでに死んでいる人は含めない（呼び出し側の kill が守る） */
function followersOf(g, deadId) {
return picks(g).filter(([, t]) => t === deadId).map(([h]) => h).filter((h) =>!isDead(g, h));
}
/** 後追いしたことを記録する（結果情報・実績用） */
function noteFollow(g, h, t) {
(g.telepathistFollows = g.telepathistFollows || []);
if (!g.telepathistFollows.some((f) => f.tp === h)) g.telepathistFollows.push({ tp: h, target: t});
}
/**
* テレパシーの連結成分（id を含むメンバー一覧）。辺は「持ち主の最終役職がテレパシスト・両者生存」のときだけ有効で、
* 封印された持ち主の辺は切れる（opts.ignoreSeal で無効化できる）。未覚醒の酔っ払いは送受信できないので、
* id 自身が未覚醒なら null。辺が無ければ null。相手が未覚醒でも成分には入る（届ける側で除外する）
*/
function component(g, id, opts) {
if (ONW.hiddenDrunk(g, id)) return null;
const adj = {};
picks(g).forEach(([h, t]) => {
if (isDead(g, h) || isDead(g, t)) return;
if (!(opts && opts.ignoreSeal) && ONW.seal && ONW.seal.is(g, h)) return;
(adj[h] = adj[h] || []).push(t); (adj[t] = adj[t] || []).push(h);
});
if (!adj[id]) return null;
const seenSet = new Set([id]), q = [id];
while (q.length) { const x = q.shift(); (adj[x] || []).forEach((y) => { if (!seenSet.has(y)) { seenSet.add(y); q.push(y);}});}
return [...seenSet];
}
/** 死なないと勝てない役職（マイクラ版 DEATH_REQUIRED_TO_WIN_ROLES。探偵の亡霊は未移植だが文字列のまま入れておくと移植時に自動で効く。長夜月は nanoka の形態役職ID） */
const DEATH_REQUIRED = ["tanner", "love_tanner", "jester_bomber", "jester_ghost", "bounty_hunter", "beggar", "martyr", "detective_ghost", "long_night_moon"];
/** 追加勝利するテレパシスト（マイクラ版 applyTelepathistExtraWins）。w = 勝者の Set。恋人・切断・相互接続は対象外 */
function extraWins(g, w) {
const out = [];
picks(g).forEach(([h, t]) => {
if (!w.has(t)) return;
if (ONW.isLover && ONW.isLover(g, h)) return;
if ((g.telepathistDisconnected || {})[h]) return;
if (g.currentRoles[t] === T && targetOf(g, t) === h) return; // 相互接続
if (!isDead(g, t)) { out.push(h); return;}
if (DEATH_REQUIRED.includes(g.currentRoles[t])) { out.push(h); return;}
if (ONW.agent && ONW.agent.commandOf && ONW.agent.commandOf(g, t) === "die") out.push(h);
});
return out;
}
/** 結果情報（情報確認）の行。接続の行は Web版の補足文、後追いはマイクラ版の連鎖ログ文 */
function lines(g, nmf) {
const n = nmf || ((id) => nm(g, id));
const out = [];
picks(g).forEach(([h, t]) => out.push(`テレパシスト ${n(h)} は ${n(t)} に接続していました。`));
(g.telepathistFollows || []).forEach((f) => out.push(`テレパシスト ${n(f.tp)} は接続先の後を追って死亡しました。`));
Object.keys(g.telepathistDisconnected || {}).forEach((h) => { if (g.players.some((q) => q.id === h)) out.push(`テレパシスト ${n(h)} は接続が切断されていました。`);});
return out;
}
/** 実績（マイクラ版 stats.js と同じ条件） */
function achievements(g, id, won) {
const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
if (ini === T || cur === T) out.push("first_telepathist");
if (cur === T && won) out.push("win_telepathist");
if (cur === T && ((g.telepathistFollows || []).some((f) => f.tp === id) || ["follow", "lovers"].includes((g.chainKind || {})[id]) || ["follow", "lovers"].includes((g.deadKind || {})[id]))) out.push("telepathist_follow_death");   // 自分の接続先への後追い以外に、恋人・キューピッド等の後追い/心中で死んだ場合も含む（マイクラ版 followDeathIds 準拠）
return out;
}
ONW.telepathist = { nm, setTarget, targetOf, holdsCard, fix, picks, seen, seenOf, toldOf, cpuLearn, followersOf, noteFollow, component, extraWins, lines, achievements};

// ---- COの文・結果: 「{対象}に接続しました。」（マイクラ版 main.js の CO の文）。claim は { kind: "telepathist", target} ----
const coText = (name) => `${name}に接続しました。`;
const coShort = (name) => `接続先: ${name}`;
const claimOf = (name, id) => ({ short: coShort(name), text: coText(name), claim: { kind: "telepathist", target: id}});
/** CPUの騙り（人狼・狂人などがテレパシストを名乗る）: 生きている他の人をランダムに「接続した」と言う */
function lieClaim(k, g, p, others, selfRole, co) {
const cand = (others || []).filter((q) => q.id!== p.id &&!(g.deadIds || []).includes(q.id));
if (!cand.length) return { co: k.bareCo(g, co), result: null};
const t = cand[Math.floor(Math.random() * cand.length)];
return { co, result: claimOf(t.name, t.id)};
}
// ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ） ----
function cpuRun(n, p, label, cur, rid) {
const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
const others = g.players.filter((q) => q.id!== p.id);
if (!others.length) return;
const t = f.player && f.player!== p.id && n.validPlayer(p, f.player)? f.player: n.pick(others).id;
setTarget(g, p.id, t); seen(g, p.id, t);
if (!cur) { i.mode = "telepathist"; i.target = t;}
i.telepathistTarget = t;
g.nightLogsAll.push(`${label} ${p.name} は ${nm(g, t)} に接続しました。`);
n.hold(p.id, `あなたは ${nm(g, t)} に接続しました。`);
n.ob(p.id, [t]);
n.nn(rid);
}

ONW.defineRole(T, {
info: { observe: "player", sealTarget: true, deck: 179, name: "テレパシスト", team: ONW.TEAM.THIRD, wakeOrder: 5, sort: 64,
desc: "第三陣営。夜に自分以外のプレイヤーを1人選び、接続します。接続した相手とは昼のあいだテレパシーで会話ができ、相手が死亡すると後追いします。接続した相手が生存したうえで勝利すれば追加勝利です。死なないと勝てない役職に接続していた場合は、相手が死亡して勝利しても追加勝利できます。"},
groups: { "transform:silver_shadow": 39}, // 銀色の影の変化先（第三陣営の役職は必ず入れる。道化の怨霊 38 の次）。光の使徒・闇の化身からは変化しない
uiNight: {
action(X) {
const { later, nowSel} = X;
return `<p class="night-step__hint">上のテーブルから、<strong>接続する相手</strong>のカードを1人分押してください。（自分以外）<br>接続した相手とは昼のあいだテレパシーで会話できます。${later}</p>${nowSel("")}`;
},
chainReady: (np) => np === 1,
chainHow: () => "<strong>接続する相手</strong>のカードを押して（自分以外）",
},
stagePick: {}, // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人（自分以外）
/** CPUの発言: 本物のテレパシストは、確率（k.coTruth）で本当にCOして「〇〇に接続しました。」と言う。それ以外は他の役職を騙る */
cpuClaim(k, g, p, r, i, c) {
const t = i.telepathistTarget && g.players.find((q) => q.id === i.telepathistTarget && q.id!== p.id);
if (t && k.selfRole(g, p) === T && k.coTruth(g, p)) { c.co = T; c.result = claimOf(t.name, t.id);}
else { const pl = k.coverLie(g, p, r); c.co = pl.co; c.result = pl.result;}
},
cpuLie: { role: T, weight: 3, order: 16, claim: lieClaim},
/** 墓荒らし・ドッペルゲンガーでテレパシストを手にしたCPUが、朝のうちに選んだ接続先を、連鎖のCOで伝える */
cpuChainResult(k, g, p, i) {
const t = i.telepathistTarget && g.players.find((q) => q.id === i.telepathistTarget && q.id!== p.id);
return t? claimOf(t.name, t.id): null;
},
/** CPUの投票: 接続先が勝たないと追加勝利できないので、その人への投票は避ける */
cpuVoteScore: (k, g, p, q, i) => (i && i.telepathistTarget === q.id? -15: 0),
cpuNight: { order: 15, stage: "seer", chain: true, run: cpuRun}, // 占い師の段階。「役職変動系以外の役職」（復讐者・道化の怨霊と同じ位置）
night: {
kind: "seer", order: 15,
complete: (np) => np === 1,
normalize: (c, players) => ({ players: players.slice(0, 1), graves: []}),
resolve(c, p) {
const g = c.g, nameOf = c.nameOf;
const t = c.selOf(p).players[0]; if (!t || t === p.id) return; // 自分自身は選べない（自己参照になるのは役職交換・コピーの結果だけ）
setTarget(g, p.id, t); seen(g, p.id, t);
g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} に接続しました。`);
c.hold(p.id, `あなたは ${nameOf(t)} に接続しました。`);
ONW.observeNote(g, p.id, [t], null, "telepathist");
ONW.newsNote(g, "telepathist");
},
},
// ---- 待機時間: 接続された側への知らせ（本人の画面でテレパシストのカードがめくれる。作者メモ）と、持ち主への接続先の知らせ ----
/** 待機時間（朝のあと）: 最終盤面の接続を確定し、まだ知らされていない人へ知らせる。
* 接続された側: 「テレパシストに接続されました。」+ 本人のカードがテレパシストの面でめくれる（settleMsg の telepathy）。
* 接続された側が未覚醒の酔っ払いなら知らせない（酔い覚めで dayCheck が届ける）。
* 持ち主: カードが動いて手にした人がまだ接続先を知らなければ、文章で知らせる（CPUは記憶に入れる） */
settlePre: { order: 16, run(c) {
const g = c.g, set = (g.telepathistSettle = {});
picks(g).forEach(([h, t]) => {
const hp = g.players.find((q) => q.id === h), tp = g.players.find((q) => q.id === t);
if (seenOf(g, h)!== t &&!ONW.hiddenDrunk(g, h)) {
seen(g, h, t);
const text = `あなたの接続先は ${nm(g, t)} です。`;
if (hp.isCpu) { cpuLearn(g, h, t); c.hold(h, text);}
else (set[h] = set[h] || { logs: []}).logs.push(text);
}
if (toldOf(g, t)!== h &&!ONW.hiddenDrunk(g, t)) {
(g.telepathistTold = g.telepathistTold || {})[t] = h;
if (!tp.isCpu) {
const e = (set[t] = set[t] || { logs: [], items: []});
e.logs.push("テレパシストに接続されました。");
e.items.push(h);
}
}
});
}},
settleMsg: { order: 26, run(c, p) {
const g = c.g, e = (g.telepathistSettle || {})[p.id], out = {};
if (e) { if (e.logs && e.logs.length) out.logs = e.logs.slice(); if (e.items && e.items.length) out.telepathy = e.items.slice();}
const comp = component(g, p.id);
if (comp && comp.length > 1) out.telepathyWith = comp;
return out;
}},
/** 待機時間の演出: 接続された側の画面でだけ、テレパシスト本人のカードがテレパシストの面でめくれて数秒後に裏に戻る（作者メモ。サムの銀狼向け演出と同じ作り） */
stageSettle: {
field: "settleTelepathy", shown: "settleTelepathyShown",
run: { order: 38, run(ids, SK) {
ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = T; SK.glow[k] = true; SK.paint(SK.G());}, 300 + i * 380));
SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; if (!SK.held[k] && SK.up[k] === T) delete SK.up[k]; delete SK.glow[k];}); SK.paint(SK.G());}, 300 + ids.length * 380 + 3200);
}},
end(SK) { const g = SK.G(); if (g.phase!== ONW.PHASE.ONLINE_DAY) return; (g.settleTelepathy || []).forEach((id) => { const k = `p:${id}`; if (SK.up[k] === T) delete SK.up[k]; delete SK.glow[k];});},
},
/** 昼のうち（酔いが覚めた・昼に役職が動いた）: まだ知らされていない接続へ知らせる。
* 接続された側へは jobday（テレパシスト本人のカードがテレパシストでめくれる）+ 成分の更新（telepathyset）。
* net.js の dayCheck（昼に役職が動いた）と daySober（酔いが覚めた直後）から呼ばれる。何度呼んでもよい（記録で重複を防ぐ） */
dayCheck(c) {
const g = c.g;
if (g.phase!== c.PH.ONLINE_DAY) return;
picks(g).forEach(([h, t]) => {
const hp = g.players.find((q) => q.id === h), tp = g.players.find((q) => q.id === t);
if (!hp ||!tp) return;
if (seenOf(g, h)!== t &&!ONW.hiddenDrunk(g, h) &&!c.isDead(h)) {
seen(g, h, t);
const text = `あなたの接続先は ${nm(g, t)} です。`;
if (hp.isCpu) { cpuLearn(g, h, t); c.hold(h, text);}
else { c.hold(h, text); const comp = component(g, h); if (comp) c.send(h, { t: "telepathyset", members: comp});}
}
if (toldOf(g, t) === h || ONW.hiddenDrunk(g, t) || c.isDead(t)) return;
(g.telepathistTold = g.telepathistTold || {})[t] = h;
if (!tp.isCpu) c.send(t, { t: "jobday", id: h, text: "テレパシストに接続されました。", role: T});
const comp = component(g, t);
if (comp) { if (!tp.isCpu) c.send(t, { t: "telepathyset", members: comp}); if (!hp.isCpu) c.send(h, { t: "telepathyset", members: comp});}
});
},
daySober(c) { ONW.roleDef(T).dayCheck(c);},
/** 酔いが覚めた本人（最終役職がテレパシストで、カードについてきた接続先がある人）に、接続先を文章で知らせる */
soberExtra(c, id) {
const g = c.g;
if (g.currentRoles[id]!== T) return {};
const t = targetOf(g, id);
if (!t || t === id ||!g.players.some((q) => q.id === t)) return {};
seen(g, id, t);
return { lines: [`あなたの接続先は ${nm(g, t)} です。`]};
},
/** 墓荒らし・ドッペルゲンガーでテレパシストを手にしたとき（朝のうち）: 自分以外の1人を選んで接続する。
* 接続された側への知らせは待機時間の settlePre が行う（この時点ではまだ知らせない） */
morning: {
run(c) {
if (!c.players.length) return null;
const g = c.g, id = c.id, t = c.players[0];
if (t === id) return null; // 自分自身は選べない
setTarget(g, id, t); seen(g, id, t);
g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} に接続しました。`);
return { lines: [`あなたは ${c.nameOf(t)} に接続しました。`], nextChain: null};
},
},
// COボタン（co.js が kind で呼ぶ）: 接続した相手を1人選んでCO・結果を言う
coResult: {
kind: "telepathist", targetLabel: "接続した相手",
pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: "telepathist", target: id}, null, "disclose", coShort(K.nameOf(id))],
},
achievements(g, id, won) { return achievements(g, id, won);},
});
})(window.ONW);
