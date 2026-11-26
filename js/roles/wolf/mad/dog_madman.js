/**
* 犬の狂人（dog_madman）: 人狼陣営（狂人系・干支狂人）。マイクラ版 scripts の犬の狂人を移植（第4バッチ・干支狂人の11役目）。
* 作者メモ「番犬とほぼ同じ」: 夜に飼い主を選び、飼い主を追放から守り、自分が飼い主に投票すると噛み殺す。
* 番犬（js/roles/village/watchdog.js）と仕組みを共有し、違うのは次の点（いずれもマイクラ版準拠）:
* ・陣営が人狼陣営（狂人系）。人狼が誰かは分からない。
* ・飼い主への票は（普通に数える。番犬は票そのものが無効）。
* 代わりに、犬が飼い主に投票しなかった場合に、飼い主が追放されそうになると犬が守って追放を取り消す
* （マイクラ版 applyRatAndDogMadmanProtection。Web版は vote.js の resolveElimination で鼠の狂人の保護と
* 同じ位置＝騎士・傭兵の護衛のあと、従者・少佐・マティアスの身代わりより前に判定する）。
* 守る対象は game.eliminated に入った飼い主すべて（最多得票の追放だけでなく、メンタル崩壊・ショック死・
* 呪殺・毒殺で死ぬはずだった飼い主も。マイクラ版の保護には呪殺の貫通例外が無いため、Web版の他の保護と
* 違い呪殺・毒殺も救う。救った飼い主は game.dogMadmanSaved に記録し、結果発表の守り演出に使う）。
* ・噛殺の条件は「自分の票が飼い主に入っていたこと」。元の票だけでなく、御乱心・羊の狂人・ペンギンなどで
* 書き換わったあとの実効票が飼い主でも噛み殺す（マイクラ版 applyDogMadmanBites の effectiveVoteRecords 判定。
* ただし実効票の先が番犬の飼い主で票が無効になる場合は、マイクラ版の record.invalid に合わせて数えない）。
* 飼い主が最多得票で追放される場合も、死因は追放ではなく噛殺に上書きされる（マイクラ版は死因を
* "watchdog" に上書きする。Web版は resolveChain の噛殺処理で game.eliminated から外して噛殺として殺す）。
* ・噛殺そのもの（死因 kind "bite"・道連れなどの能力を発動しない・ネコカボチャの噛み返し・同時噛み・
* スティーブの復活対象）は番犬と完全に共通で、game.dogBites に番犬と一緒に入る。
* 番犬と犬の狂人が同じ人を飼い主にしていて両方が投票した場合は、同時に噛み殺す（マイクラ版は
* watchdogBiteKills に両方を記録する。Web版も game.dogBites に両方入れて simul にする）。
* 噛まれたシュレディンガーの猫は人狼陣営に確定する（ONW.watchdog.biteTeam が噛んだ人の役職の陣営を
* 返すので、犬の狂人に噛まれた猫は "wolf"。docs/schrodinger-cat-team.md のどおり）。
* ・騎士・傭兵の守りは噛殺には働かない（Web版の番犬の噛殺と同じ扱い。マイクラ版は噛殺のあとに
* 傭兵・騎士の保護を入れるが、Web版は番犬の既存実装に合わせた）。
* 記録は番犬と別の役職紐づけキー "dogMadmanOwners"（ONW.setRoleBound。役職が動くと記録もついていく。
* 上書きされると消える。番犬のカードが飼い主本人の手に渡った場合の付け替えも state.js が共通で処理する）。
* ・夜の能力なので新聞に載る（ONW.newsNote）。墓荒らし・ドッペルで手にした場合は朝のうちに選べる（morning）。
* ・朝の演出は番犬と同じ: 犬の狂人から見て、選んだ飼い主のカードが「🦴」でめくれる（reveal = kind:"peek" の
* "__bone" 面を番犬と共用）。選ばれた人には何も伝わらない。
* ・「今の飼い主」は最終盤面で犬の狂人を持っている人（酔いが覚めていない人）の記録だけ（ONW.dogMadman.pairs /
* ownerOf / activePairs）。封印されている犬の狂人は守らず噛まない（情報・CO用の pairs は変えない。番犬と同じ）。
* 封印対象: マイクラ版 YAMINABE_SEAL_TARGET_ROLES に入っているため sealTarget: true（封印されると夜能力が
* 使えず、守り・噛殺も発動しない）。
* 変化候補（マイクラ版で確認）: 闇の化身の変化候補（TRANSFORM_ROLE_GROUPS の DARK_AVATAR に入っている）。
* 光の使徒（村人陣営のみ）・銀色の影（第三陣営のみ）・コスプレイヤー（村人陣営のみ）の候補ではない。
* 模倣の人狼はなれる（模倣した犬の狂人も飼い主を選び、守り・噛殺が発動する。噛まれた猫は人狼陣営）。
* シャッフラーの山札には（マイクラ版 shufflerEligibleRoles の除外。干支狂人のうち兎・龍・犬が除外）。
* ペルソナは Web版未実装。
* ハッキング: 対象外には入っていない（本物の犬の狂人もハッキングされる。思い込んだ人の偽の夜結果文は
* 銀狼側に用意済み。思い込みでは守り・噛殺は発動しない＝実効役職で判定するため）。
* 乞食: 取れる（マイクラ版の除外リストに無い）。
* 黄泉: マイクラ版の yomiCutStates に犬の狂人の記録は無いので、黄泉では断ち切られない（番犬と同じ）。
* トラップマスター（罠師）: 罠師の移植時に確認済み。犬の狂人には昼能力が無いため罠を踏むことはなく、マイクラ版 YAMINABE_TRAP_MASTER_TARGET_ROLES にも入っていない（詳細は docs/dog-madman.md）。
* ハンターの闇鍋シナジー（マイクラ版 YAMINABE_HUNTER_KILL_SOURCE_WEIGHTS で犬の狂人は重み16）: ハンターが
* Web版未移植のため未接続。
* CPU: 夜の行動は番犬と同じ（自分以外の1人をランダム。デバッグ指定があればそれ）。
* CO は人狼陣営の共通の扱い（cpuClaim なし＝必ず騙る。鼠・羊の狂人と同じ）。結果開示は coResult（人間のCOボタン）と
* cpuChainResult（墓荒らし・ドッペルで手にしたCPU用）で、文はマイクラ版 main.js / cpu.js のもの。
* CPUの投票に飼い主への配慮は無い（マイクラ版 cpu に犬の狂人の投票調整は無い）。
* デバッグ: debug.js の ABILITY で "rob"（飼い主にする相手を1人指定。番犬と同じ）。
* 結果発表の演出は番犬の stageResult を共用する（net.js が res.watchdogs に role: "dog_madman" の項目を
* 足し、番犬側の intro が役職名と色を切り替える。噛殺の演出 biteFx は共通）。
*/
(function (ONW) {
const R_ = () => ONW.ROLE.DOG_MADMAN;
const ID = "dog_madman";
const nm = (g, id) => (g.players.find((q) => q.id === id) || {}).name || "?";
const BONE = "__bone";
const boneReveal = (t) => ({ kind: "peek", items: [{ k: `p:${t}`, role: BONE}]}); // 朝: 選んだ飼い主のカードが🦴でめくれる（番犬と共用）

// ---- 飼い主の判定（最終盤面から。番犬の ownerOf と同じ考え方で、役職とキーだけが違う） ----
/** その人（持ち主ID）が犬の狂人を持っていて、飼い主が決まっているときの飼い主ID。酔いが覚めていない持ち主・飼い主が不明な場合は null */
function ownerOf(g, id) {
if (!g ||!g.currentRoles || ONW.mimic.eff(g, id)!== R_() || ONW.hiddenDrunk(g, id)) return null; // 模倣の人狼が犬の狂人を模倣していても飼い主を守る
const t = ONW.getRoleBound(g, "dogMadmanOwners", id);
if (!t || t === id ||!g.players.some((q) => q.id === t)) return null;
return t;
}
/** 最終盤面で犬の狂人を持っている人（酔いが覚めている人）と飼い主の組 [[犬の狂人の持ち主, 飼い主],...]（飼い主が決まっているものだけ） */
function pairs(g) {
return (g.players || []).map((p) => [p.id, ownerOf(g, p.id)]).filter(([, o]) => o);
}
/** 守る・噛む犬の狂人の組（封印されている犬の狂人は守らず噛まない。情報・CO用の pairs は変えない。番犬の activePairs と同じ） */
function activePairs(g) { return pairs(g).filter(([d]) =>!(ONW.seal && ONW.seal.is(g, d)));}

/** 飼い主を決める（夜・朝のうち共通）。holderId = 犬の狂人のカードの持ち主 */
function setOwner(g, holderId, t) { ONW.setRoleBound(g, "dogMadmanOwners", holderId, t);}

/** 文言（マイクラ版: 夜の結果は「〇〇を飼い主にしました。」、CO は main.js の「〇〇を飼い主に選びました。」、CPUの結果開示は cpu.js の「〇〇を飼い主にしていました。」） */
const ownerLine = (name) => `${name} を飼い主にしました。`;
const coText = (name) => `${name}を飼い主に選びました。`;
const coShort = (name) => `飼い主: ${name}`;

/**
* 投票の保護（マイクラ版 applyRatAndDogMadmanProtection の犬の狂人部分）: 飼い主に投票しなかった犬の狂人の
* 飼い主は、追放されそうになっても死なない。vote.js の resolveElimination が、騎士・傭兵の護衛のあと・
* 身代わりより前に呼ぶ（鼠の狂人の applyVoteProtection の直後）。
* ・判定は元の票（game.votes）だけ（マイクラ版も game.votes を見る。実効票が飼い主でも守る）。
* ・game.eliminated に入った理由は問わない（最多得票・メンタル崩壊・ショック死・呪殺・毒殺すべて。
* マイクラ版の保護には呪殺の貫通例外が無い）。呪殺・毒殺で死ぬはずだった飼い主を救った場合は、
* curseKillIds などからも外す（死因の記録を残さない）。
* ・犬の狂人自身が昼中に死んでいても守る（マイクラ版は死亡を見ていない。番犬の票無効も同じ扱い）。
* 戻り値: 守った飼い主のID（守った順）。game.dogMadmanSaved にも同じものを入れる（結果発表の演出・情報用）
*/
function applyVoteProtection(game) {
game.dogMadmanSaved = [];
if (!game.eliminated) game.eliminated = [];
activePairs(game).forEach(([d, o]) => {
if ((game.votes || {})[d] === o) return; // 飼い主に投票した犬は守らない（噛殺になる）
if (!game.eliminated.includes(o)) return;
game.eliminated = game.eliminated.filter((x) => x!== o);
game.mentalIds = (game.mentalIds || []).filter((x) => x!== o);
game.shockIds = (game.shockIds || []).filter((x) => x!== o);
if ((game.curseKillIds || []).includes(o)) {
game.curseKillIds = game.curseKillIds.filter((x) => x!== o);
Object.keys(game.curseWolfKills || {}).forEach((k) => { if (game.curseWolfKills[k] === o) delete game.curseWolfKills[k]; }); // 呪殺の記録は { 呪術の人狼: 対象 } のマップ
Object.keys(game.snakeMadmanKills || {}).forEach((k) => { if (game.snakeMadmanKills[k] === o) delete game.snakeMadmanKills[k]; }); // 毒殺の記録も同じ形のマップ
game.poisonKillIds = (game.poisonKillIds || []).filter((x) => x!== o);
}
game.dogMadmanSaved.push(o);
});
return game.dogMadmanSaved;
}

const ZODIAC_MADMEN = ["rat_madman", "ox_madman", "tiger_madman", "rabbit_madman", "dragon_madman", "snake_madman", "horse_madman", "sheep_madman", "monkey_madman", "rooster_madman", "boar_madman"]; // 犬以外の干支狂人
/**
* 実績（マイクラ版 stats.js / wiki と同じ条件）:
* win_dog_madman「犬も歩けば狂ってる」 = 最終役職が犬の狂人で勝利 / zodiac_dog_madman「戌年」 = 試合終了時に犬以外の干支狂人が現世にいる。
* first_dog_madman「狂犬注意」（初めて犬の狂人になる）は履歴判定のため返さない（他の干支狂人と同じ）。
*/
function achievements(g, id, won) {
const out = [], cur = (g.currentRoles || {})[id];
if (cur!== ID) return out; // 最終役職で判定（模倣の人狼が模倣しているだけでは対象外=マイクラ版と同じ）
if (won) out.push("win_dog_madman");
if ((g.players || []).some((p) => p.id!== id && ZODIAC_MADMEN.includes((g.currentRoles || {})[p.id]))) out.push("zodiac_dog_madman");
return out;
}

ONW.dogMadman = { ownerOf, pairs, activePairs, setOwner, ownerLine, coText, coShort, nm, applyVoteProtection, achievements};

// ---- CPUの夜の行動: 自分以外の1人をランダムに選ぶ（デバッグの指定があればそれ。番犬の cpuRun と同じ） ----
function cpuRun(n, p, label, cur, rid) {
const g = n.g, f = n.forced(p), i = n.infoOf(p.id);
const t = n.validPlayer(p, f.player)? g.players.find((q) => q.id === f.player): n.pick(g.players.filter((q) => q.id!== p.id));
if (!t) return;
setOwner(g, p.id, t.id); // 役職についていく（移動「あと」に選んでも現在の持ち主に予約される）
ONW.newsNote(g, "dog_madman");
if (!cur) { i.mode = "dog_madman"; i.target = t.id;}
i.owner = t.id; // 結果開示（cpuChainResult）が使う
g.nightLogsAll.push(`${label} ${p.name} は ${t.name} を飼い主にしていました。`);
n.hold(p.id, ownerLine(t.name));
n.ob(p.id, [t.id]);
n.nn(rid);
}

ONW.defineRole(ID, {
info: { observe: "player", sealTarget: true, deck: 153, name: "犬の狂人", team: ONW.TEAM.WOLF, wakeOrder: 12, sort: 1.7005,
desc: "人狼陣営（狂人系）。人狼が誰かは分かりません。夜に自分以外の1人を飼い主に選びます。朝、犬の狂人から見て選んだ飼い主のカードが🦴でめくれます。飼い主への票は普通に数えられますが、犬の狂人が飼い主に投票していない限り、飼い主は追放されません。犬の狂人自身が飼い主に投票すると、飼い主を噛み殺します。役職が入れ替わると、飼い主の判定もカードについていきます（上書きされると消えます）。"},
groups: { mad: 3.006, "transform:dark_avatar": 35}, // 狂人系（人狼判定には数えない）・闇の化身の変化先。並びは ROLE_ORDER（wiki の order 118）で決まる
achievements,
uiNight: {
action(X) {
const { later, nowSel} = X;
return `<p class="night-step__hint">上のテーブルから、<strong>飼い主にする相手</strong>のカードを1人分押してください。（自分以外）<br>飼い主は、あなたが投票しない限り追放されませんが、あなたが飼い主に投票すると噛み殺します。${later}</p>${nowSel("")}`;
},
chainReady: (np) => np === 1,
chainHow: () => "<strong>飼い主にする相手</strong>のカードを押して（自分以外）",
},
stagePick: {}, // 夜(と朝の連鎖)にカードを押して行動する: プレイヤー1人
cpuNight: { order: 12, stage: "seer", chain: true, run: cpuRun},
night: {
kind: "seer", order: 12, // 番犬と同じ（役職変動系より前）。飼い主は役職の持ち主に記録するので、あとで役職が動いても追従する
complete: (np) => np === 1,
normalize: (c, players) => ({ players: players.slice(0, 1), graves: []}),
resolve(c, p) {
const g = c.g, nameOf = c.nameOf;
const t = c.selOf(p).players[0]; if (!t) return;
setOwner(g, p.id, t);
g.nightLogsAll.push(`${c.rn(c.eff(p))} ${p.name} は ${nameOf(t)} を飼い主にしていました。`);
c.hold(p.id, ownerLine(nameOf(t)));
ONW.observeNote(g, p.id, [t], null, "dog_madman");
ONW.newsNote(g, "dog_madman");
c.rev[p.id] = boneReveal(t); // 朝、選んだ飼い主のカードが🦴でめくれる
},
},
/** 墓荒らし・ドッペルゲンガーで犬の狂人を手にしたとき（朝のうち）: 朝のうちに飼い主を1人選べる（番犬と同じ） */
morning: {
run(c) {
if (!c.players.length) return null;
const g = c.g, id = c.id, t = c.players[0];
setOwner(g, id, t);
g.nightLogsAll.push(`${c.label} ${c.me.name} は ${c.nameOf(t)} を飼い主にしていました。`);
return { lines: [ownerLine(c.nameOf(t))], reveal: boneReveal(t), nextChain: null};
},
},
/** 墓荒らし・ドッペルゲンガーで犬の狂人を手にしたCPUが、続けて言う結果: 朝のうちに選んだ飼い主（飼い主を決めていないときは言わない。番犬と同じ） */
cpuChainResult(k, g, p, i) {
const t = i.owner && g.players.find((q) => q.id === i.owner && q.id!== p.id);
return t? { short: coShort(t.name), text: `${t.name}を飼い主にしていました。`, claim: { kind: ID, target: t.id}}: null;
},
// 結果発表の演出は番犬の stageResult を共用する（net.js が res.watchdogs に role: "dog_madman" の項目を足し、
// 番犬側の intro が「犬の狂人の飼い主」の字幕と人狼陣営色に切り替える。噛殺の biteFx・🦴の守り演出は共通）。
// 結果開示(COボタン)の流れ(co.js が kind で引く): 飼い主にした相手を選ぶ（文はマイクラ版 main.js の CO 文）
coResult: {
kind: ID, targetLabel: "飼い主にした相手",
pickPlayer: (id, K) => [coText(K.nameOf(id)), { kind: ID, target: id}, null, "disclose", coShort(K.nameOf(id))],
},
});
})(window.ONW = window.ONW || {});
