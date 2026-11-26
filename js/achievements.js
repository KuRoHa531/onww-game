/**
* achievements.js — 実績システム（解除判定・保存・装備・表示）
* ------------------------------------------------------------
* ・マスターは js/achievements-data.js（全805件。生成元は _wip/genAchievementsData.js）
* ・解除判定はホストが試合終了時に全員ぶん計算し、結果オブジェクトの achvMatch に載せる。
* 各役職ファイルの ONW.<役職>.achievements(g, id, won) フック + 全役職共通の first/win +
* 基本実績（このファイルの basicJudge）を集める（ONW.achievements.collect）。
* ・「新規解除」は各クライアントが自分の保存済みと比べて割り出す（自己申告方式。戦績と同じ）。
* ログイン中は Supabase の achievements テーブルへ保存し、装備は profiles.equipped_achievement。
* ゲストは localStorage に端末保存する。観戦では保存しない。
* デバッグモード中（g.debugOn。戦績と同じ判定）は、保存しないだけでなく解除そのものが発生しない:
* ホストは achvMatch を生成・配布せず、achvreport 申告も受け付けず、リザルトの解除行・モーダルも出さない。
* 実績処理が走るのは、結果オブジェクトが正規の結果発表フローで確定した試合だけ:
* 廃村（result.abandoned）の試合では collect・保存・申告・表示のすべてを行わず、
* 途中でロビーに戻って終わった試合（net.abandonToLobby）は結果自体が作られないので処理は走らない。
* ・新規解除は結果フェーズでホストへ報告され（achvreport）、ホストが全員へ配り直す（achvupdate）。
* リザルト画面の下に「〇〇が実績を〇個解除しました。」と 🏆 ボタンを出す。
* ・CPU は保存せず、試合開始時にランダムな実績1個を「装備中」として表示用に持つ（マイクラ版と同じ）。
*/
window.ONW = window.ONW || {};
(function (ONW) {
const achv = {};
const DATA = (typeof window!== "undefined" && window.ONW_ACHIEVEMENTS) || [];
const DEFS = new Map(DATA.map((e) => [e.i, e]));
const FIRST_BY_ROLE = {}, WIN_BY_ROLE = {};
DATA.forEach((e) => {
if (e.k === "first" && e.r) (FIRST_BY_ROLE[e.r] = FIRST_BY_ROLE[e.r] || []).push(e);
if (e.k === "win" && e.r) (WIN_BY_ROLE[e.r] = WIN_BY_ROLE[e.r] || []).push(e);
});
const esc = (s) => (ONW.utils? ONW.utils.esc(s): String(s == null? "": s));
const teamOf = (r) => { try { return ONW.roles.getInfo(r).team;} catch (e) { return null;}};

achv.def = (id) => DEFS.get(id) || null;
achv.nameOf = (id) => (DEFS.get(id) || {}).n || "";
achv.all = () => DATA;
achv.total = () => DATA.length;

// ---------------------------------------------------------
// 自分の状態（解除済み・装備中・累計カウンタ）
// ---------------------------------------------------------
const GUEST_KEY = "onw.achievements.v1";
const blank = () => ({ unlocked: new Set(), equipped: null, counters: { play: 0, win: 0, lose: 0, survive: 0, death: 0}, doneKeys: new Set(), loaded: false, sbOk: false});
let mine = blank();

function guestLoad() {
try {
const j = JSON.parse(localStorage.getItem(GUEST_KEY) || "{}");
mine.unlocked = new Set((j.unlocked || []).filter((id) => DEFS.has(id)));
mine.equipped = j.equipped && mine.unlocked.has(j.equipped)? j.equipped: null;
mine.counters = {...blank().counters,...(j.counters || {})};
mine.doneKeys = new Set(j.doneKeys || []);
} catch (e) { /* 壊れた保存は初期状態から */}
mine.loaded = true;
}
function guestSave() {
try {
localStorage.setItem(GUEST_KEY, JSON.stringify({
unlocked: [...mine.unlocked], equipped: mine.equipped, counters: mine.counters,
doneKeys: [...mine.doneKeys].slice(-50),
}));
} catch (e) { /* 保存できなくてもゲームは止めない */}
}
const counterKey = (uid) => `onw.achievements.counters.${uid}`;
function countersLoad(uid) {
try {
const j = JSON.parse(localStorage.getItem(counterKey(uid)) || "{}");
mine.counters = {...blank().counters,...(j.counters || {})};
mine.doneKeys = new Set(j.doneKeys || []);
} catch (e) {}
}
function countersSave(uid) {
try { localStorage.setItem(counterKey(uid), JSON.stringify({ counters: mine.counters, doneKeys: [...mine.doneKeys].slice(-50)}));} catch (e) {}
}

/** ログイン状態に合わせて自分の実績を読み直す（アカウントの変化通知から呼ばれる） */
let syncing = null;
achv.syncUser = function () {
if (syncing) return syncing;
syncing = (async () => {
const A = ONW.account;
mine = blank();
if (A && A.enabled && A.user && A.sb) {
countersLoad(A.user.id);
try {
const { data, error} = await A.sb.from("achievements").select("achievement_id").eq("user_id", A.user.id);
if (error) throw error;
mine.unlocked = new Set((data || []).map((r) => r.achievement_id).filter((id) => DEFS.has(id)));
mine.sbOk = true;
const eq = A.user.equipped_achievement || null;
mine.equipped = eq && mine.unlocked.has(eq)? eq: null;
} catch (e) { guestLoad(); mine.sbOk = false;} // setup.sql 未実行など: 端末保存に倒す（表示だけは動く）
mine.loaded = true;
} else {
guestLoad();
}
await achv.grantWelcome();
})().catch(() => {}).finally(() => { syncing = null; });
return syncing;
};

/** welcome_onw: 初めて接続したら解除（マイクラ版の「ワールドに接続」相当を、初回読み込みに読み替え） */
achv.grantWelcome = async function () {
if (!mine.loaded || mine.unlocked.has("welcome_onw")) return;
await achv.saveNew(["welcome_onw"]);
};

/** 新規解除分を保存する（ログイン中は Supabase、ダメなら/ゲストは端末保存）。失敗しても投げない */
achv.saveNew = async function (ids) {
const fresh = (ids || []).filter((id) => DEFS.has(id) &&!mine.unlocked.has(id));
if (!fresh.length) return [];
fresh.forEach((id) => mine.unlocked.add(id));
const A = ONW.account;
if (A && A.enabled && A.user && A.sb && mine.sbOk) {
try {
const rows = fresh.map((id) => ({ user_id: A.user.id, achievement_id: id}));
const { error} = await A.sb.from("achievements").upsert(rows, { onConflict: "user_id,achievement_id", ignoreDuplicates: true });   // 既に保存済みの分は無視（別端末で先に保存されていても残りを保存する）
if (error) throw error;
} catch (e) { guestSave();} // 失敗時は端末にも控える
} else {
guestSave();
}
return fresh;
};

achv.unlockedSet = () => mine.unlocked;
achv.equipped = () => (mine.equipped && mine.unlocked.has(mine.equipped)? mine.equipped: null);

/** 実績を装備する（id = null で外す）。プロフィール画面から呼ばれる */
achv.equip = async function (id) {
if (id!= null &&!mine.unlocked.has(id)) return { ok: false, msg: "まだ解除していない実績です。"};
const A = ONW.account;
if (A && A.enabled && A.user && A.sb) {
const { error} = await A.sb.from("profiles").update({ equipped_achievement: id}).eq("id", A.user.id);
if (error) return { ok: false, msg: "保存できませんでした。（管理者向け: setup.sql の「10.」を実行してください）"};
A.user.equipped_achievement = id;
}
mine.equipped = id;
if (!A ||!A.user) guestSave();
return { ok: true};
};

/** 他の人の解除済みと装備中を読む（プロフィール表示用） */
achv.loadFor = async function (uid) {
const A = ONW.account;
if (A && A.user && uid === A.user.id && mine.loaded) return { unlocked: mine.unlocked, equipped: achv.equipped()};
if (!A ||!A.enabled ||!A.sb) return { error: true};
try {
const [r1, r2] = await Promise.all([
A.sb.from("achievements").select("achievement_id").eq("user_id", uid),
A.sb.from("profiles").select("equipped_achievement").eq("id", uid).maybeSingle(),
]);
if (r1.error) return { error: true};
const unlocked = new Set((r1.data || []).map((r) => r.achievement_id).filter((id) => DEFS.has(id)));
const eq = r2.data && r2.data.equipped_achievement;
return { unlocked, equipped: eq && unlocked.has(eq)? eq: null};
} catch (e) { return { error: true};}
};

// ---------------------------------------------------------
// 解除判定（ホスト側・純粋関数）: collect(g, winIds) → { プレイヤーID: [実績ID...]}
// ---------------------------------------------------------
function hookList() {
const out = [], seen = new Set();
const push = (fn) => { if (typeof fn === "function" &&!seen.has(fn)) { seen.add(fn); out.push(fn);}};
for (const k of Object.keys(ONW)) {
const ns = ONW[k];
if (ns && typeof ns === "object") push(ns.achievements);
}
// 名前空間を持たない旧役職は defineRole の定義側に achievements を持つので、そちらも拾う（like 継承で同じ関数が重なる場合は同一性で除く）
if (ONW.roleDef && ONW.ROLE_INFO) for (const rid of Object.keys(ONW.ROLE_INFO)) { try { const d = ONW.roleDef(rid); if (d) push(d.achievements);} catch (e) {}}
return out;
}

achv.collect = function (g, winIds) {
const out = {};
if (!g ||!Array.isArray(g.players) || g.debugOn || g.abandoned) return out;   // デバッグモード中・廃村では実績の解除そのものが発生しない（戦績と同じ g.debugOn 判定。廃村は結果が正規フローで確定していない）
const won = new Set(winIds || []);
const add = (pid, aid) => { if (aid && DEFS.has(aid)) (out[pid] = out[pid] || new Set()).add(aid);};
// 1) 各役職ファイルの判定フック
const hooks = hookList();
for (const p of g.players) {
for (const h of hooks) {
try { (h(g, p.id, won.has(p.id)) || []).forEach((aid) => add(p.id, aid));} catch (e) { /* 1役職の失敗で全体を止めない */}
}
}
// 2) 全役職共通: 初めてその役職になる（初期・最終どちらの役職でも） / その役職で勝利（最終役職）
for (const p of g.players) {
const ini = (g.initialRoles || {})[p.id], fin = (g.currentRoles || {})[p.id];
[ini, fin].forEach((r) => { if (r) (FIRST_BY_ROLE[r] || []).forEach((e) => add(p.id, e.i));});
if (won.has(p.id) && fin) (WIN_BY_ROLE[fin] || []).forEach((e) => add(p.id, e.i));
}
// 3) 基本実績（試合内容からの判定）と、結果データだけで分かる横断実績
basicJudge(g, won, add);
const res = {};
Object.keys(out).forEach((k) => { res[k] = [...out[k]];});
return res;
};

function basicJudge(g, won, add) {
const players = g.players || [], ids = players.map((p) => p.id);
const dead = new Set([...(g.eliminated || []),...(g.deadIds || []),...(g.dukeDead || [])]);
let counts = {};
try { counts = ONW.vote.tally(g) || {};} catch (e) { counts = {};}
const top = Math.max(0,...ids.map((id) => counts[id] || 0));
const topIds = ids.filter((id) => top > 0 && (counts[id] || 0) === top);
const votes = g.votes || {};
const castTargets = Object.values(votes).filter(Boolean);
const trailOf = (id) => {
const t = [g.initialRoles && g.initialRoles[id],...(((g.roleTrail || {})[id]) || [])];
const fin = g.currentRoles && g.currentRoles[id];
if (fin && t[t.length - 1]!== fin) t.push(fin);
return t.filter(Boolean);
};
const ANIMALS = new Set(["chicken", "penguin", "watchdog", "cat_sidhe", "black_cat", "schrodinger_cat", "cat_pumpkin", "fox", "werewolf", "yokai_tanuki"]);
const CATS = new Set(["cat_sidhe", "black_cat", "schrodinger_cat", "cat_pumpkin"]);
const animalCount = players.filter((p) => ANIMALS.has((g.currentRoles || {})[p.id])).length;
let roleLost = false, kittenMoves = 0;
for (const p of players) {
const h = trailOf(p.id); let changes = 0;
for (let i = 1; i < h.length; i++) if (h[i]!== h[i - 1]) { changes++; if (CATS.has(h[i])) kittenMoves++;}
if (changes >= 3) roleLost = true;
}
const onlyBases = players.length > 0 && players.every((p) => ["light_apostle", "dark_avatar", "silver_shadow"].includes((g.initialRoles || {})[p.id]));
const loverPartners = (id) => {
if (!ONW.loverPairs) return [];
const s = new Set();
ONW.loverPairs(g).forEach((q) => { if (q[0] === id || q[1] === id) { s.add(q[0]); s.add(q[1]);}});
s.delete(id);
return [...s];
};

for (const p of players) {
const id = p.id, w = won.has(id), alive =!dead.has(id);
const ini = (g.initialRoles || {})[id], fin = (g.currentRoles || {})[id];
add(id, "first_participation");
if (w) add(id, "first_win"); else add(id, "first_loss");
if (votes[id]) add(id, "first_vote");
if ((g.eliminated || []).includes(id)) add(id, "first_exile");
if (alive) add(id, "first_survive"); else add(id, "first_death");
if ((g.sheriffShots || []).some((e) => e && e.mode === "execute" && ((e.victims || []).includes(id) || e.target === id))) add(id, "executed_by_sheriff");
if (topIds.length >= 2) add(id, "vote_close_game");
if (castTargets.length && castTargets.every((t) => t === id)) add(id, "unanimous_target");
if ((counts[id] || 0) >= 3) add(id, "suspected");
if (alive && (counts[id] || 0) <= 0) add(id, "no_vote_survive");
const myT = votes[id];
if (myT && topIds.length === 1 && topIds[0] === myT && (g.eliminated || []).includes(myT)) {
let myW = 1; try { myW = ONW.vote.weightOf(g, id);} catch (e) {}
const maxRest = Math.max(0,...ids.filter((x) => x!== myT).map((x) => counts[x] || 0));
if ((counts[myT] || 0) - myW <= maxRest) add(id, "deciding_vote");
}
if (!dead.size) add(id, "peaceful_morning"); // 説明文どおり「誰も死亡せず」（MC版は追放者だけで判定していたのを修正）
if (dead.size >= 3) add(id, "catastrophe");
if (onlyBases) add(id, "only_transform_bases");
if (animalCount >= 4) add(id, "animal_zoo");
if (roleLost) add(id, "role_lost");
if (kittenMoves >= 2) add(id, "lost_kittens");
// 酔っ払い
if (g.drunkOverlay && g.drunkOverlay[id]) {
add(id, "first_drunk");
if (w) add(id, "win_drunk");
if (g.drunkRevealed && g.drunkRevealed[id]) {
if (w) add(id, "drunk_reveal_win");
if ((g.actionDone && g.actionDone[id]) || (g.dayActionDone && g.dayActionDone[id])) add(id, "drunk_reveal_use_ability");
}
}
// 恋人
if (ONW.isLover && ONW.isLover(g, id)) {
add(id, "first_lover");
if (w) add(id, "win_lover");
const kind = (g.chainKind || {})[id], partners = loverPartners(id);
if (!alive && (kind === "follow" || kind === "lovers")) add(id, "lover_follow_death");
if (!alive && partners.some((x) => dead.has(x))) add(id, "lover_both_same_time_dead");
if (w) {
const teams = new Set([teamOf(fin),...partners.map((x) => teamOf((g.currentRoles || {})[x]))]);
if (teams.has("village") && teams.has("wolf")) add(id, "lover_forbidden_love");
}
if (alive && players.filter((q) =>!dead.has(q.id)).every((q) => ONW.isLover(g, q.id))) add(id, "lover_only_world");
}
// 妖狐投票の同数最多追放（結果オブジェクトの history.foxTie と同じ条件）
if (fin === "fox" && g.foxVote && (g.foxVote.executedIds || []).includes(id) && (g.foxVote.topIds || []).length >= 2 && (g.foxVote.topIds || []).includes(id)) add(id, "fox_vote_tie_exile");
// 反転された回数
const rev = ONW.reverser? ONW.reverser.count(g, id): 0;
if (rev > 0) add(id, "reversed_once");
if (rev >= 2 && rev % 2 === 0) add(id, "reversed_even");
// 狂信者が狂人になる
if (ini === "fanatic" && fin === "madman") add(id, "fanatic_to_madman");
// シュレディンガーの猫
if (fin === "schrodinger_cat") {
const ci = (g.catInfo || {})[id];
const hasTeam =!!(ci && ((ci.votes || 0) >= 1 || ci.fixed) && ci.team && ci.team!== "lover");
if (!hasTeam) add(id, "schrodinger_no_team"); else if (!w) add(id, "schrodinger_team_lost");
}
// 女王が2人とも生存勝利 / 名探偵が2人以上同時勝利 / 番犬の飼い主が女王で勝利
if (fin === "queen" && w && players.filter((q) => (g.currentRoles || {})[q.id] === "queen" &&!dead.has(q.id)).length >= 2) add(id, "queen_two_crowns");
if (fin === "detective" && w && players.filter((q) => (g.currentRoles || {})[q.id] === "detective" && won.has(q.id)).length >= 2) add(id, "detective_duo_win");
if (fin === "watchdog" && w && ONW.watchdog && ONW.watchdog.pairs(g).some(([wd, ow]) => wd === id && (g.currentRoles || {})[ow] === "queen")) add(id, "watchdog_queen_win");
// 道化の爆弾魔: どの陣営と勝ったか
if (fin === "jester_bomber" && w) {
const wt = new Set(g.winners || []);
if (wt.has("village")) add(id, "bomber_with_village");
if (wt.has("wolf")) add(id, "bomber_with_wolf");
if (wt.has("third")) add(id, "bomber_with_third");
}
// ドッペルゲンガーのコピー実績は、コピー時点の記録 g.doppelCopy で doppelganger.js のフックが正確に判定する（最終役職での近似は廃止）
}
}

// ---------------------------------------------------------
// 試合後の処理（各クライアントが自分の分だけ）
// ---------------------------------------------------------
const COUNT_RULES = [
["play", [["play_5", 5], ["play_20", 20], ["play_50", 50], ["play_100", 100], ["play_200", 200], ["play_300", 300], ["play_500", 500], ["play_1000", 1000]]],
["win", [["win_5", 5], ["win_10", 10], ["win_30", 30], ["win_50", 50], ["win_100", 100], ["win_200", 200], ["win_300", 300]]],
["lose", [["lose_10", 10], ["lose_50", 50], ["lose_100", 100]]],
["survive", [["survive_10", 10], ["survive_50", 50], ["survive_100", 100]]],
["death", [["death_10", 10], ["death_50", 50], ["death_100", 100]]],
];
const COLLECT_RULES = [["achievement_1", 1], ["achievement_10", 10], ["achievement_30", 30], ["achievement_50", 50], ["achievement_100", 100], ["achievement_200", 200], ["achievement_300", 300], ["achievement_400", 400]];

/** result: 結果オブジェクト / key: 試合の識別子（戦績と同じ）。戻り値: 今回新規解除した実績ID */
achv.onResult = async function (result, key) {
try {
const G = ONW.game;
if (!result || result.abandoned ||!Array.isArray(result.history) ||!ONW.net || G.debugOn || G.isSpectator) return [];   // 廃村の結果では保存・申告をしない（呼び出し側のガードと二重化）
const myId = ONW.net.myId();
const me = result.history.find((h) => h.id === myId);
if (!me ||!me.ini) return [];
if (!mine.loaded) await achv.syncUser();
const k = String(key || "");
if (k && mine.doneKeys.has(k)) return [];
// 累計カウンタ（この端末で数える。戦績テーブルには生死の列が無いため）
mine.counters.play++;
if (me.win) mine.counters.win++; else mine.counters.lose++;
if (me.dead || me.day) mine.counters.death++; else mine.counters.survive++;
if (k) mine.doneKeys.add(k);
const A = ONW.account;
if (A && A.user) countersSave(A.user.id); else guestSave();
// 今回の一致分 + 累計到達分
const cand = new Set((result.achvMatch || {})[myId] || []);
for (const [ck, rules] of COUNT_RULES) for (const [aid, n] of rules) if (mine.counters[ck] >= n) cand.add(aid);
let fresh = [...cand].filter((id) => DEFS.has(id) &&!mine.unlocked.has(id));
// 収集系: 今回の解除で到達する分も同じ試合で解除する
const totalAfter = mine.unlocked.size + fresh.length;
for (const [aid, n] of COLLECT_RULES) if (totalAfter >= n &&!mine.unlocked.has(aid) &&!fresh.includes(aid)) fresh.push(aid);
if (totalAfter >= DATA.length - 1 &&!mine.unlocked.has("achievement_all_497")) fresh.push("achievement_all_497");
fresh = [...new Set(fresh)].filter((id) => DEFS.has(id));
if (fresh.length) await achv.saveNew(fresh);
if (fresh.length && ONW.net.reportAchv) ONW.net.reportAchv(fresh);
return fresh;
} catch (e) { return []; /* 実績の失敗でゲームを止めない */}
};

// ---------------------------------------------------------
// 表示（リザルト画面・モーダル・プロフィール・ロビー・吹き出し）
// ---------------------------------------------------------
/** リザルト画面の下に出す実績セクション（ui.resultSheetHtml から呼ばれる） */
achv.resultSectionHtml = function (game) {
if (game && (game.debugOn || game.abandoned || (game.result && game.result.abandoned))) return "";   // デバッグモード中・廃村では解除行もモーダルボタンも出さない
const reps = (game && game.achvReports) || {};
const rows = Object.values(reps).filter((r) => r && r.ids && r.ids.length);
if (!rows.length) return "";
const lines = rows.map((r) => `<div class=\"rs-line\">🏆 ${esc(r.name)}が実績を${r.ids.length}個解除しました。</div>`).join("");
return `<hr class=\"rs-sep\"><div class=\"rs-head\">実績</div>${lines}
<div class=\"btn-row\"><button class=\"btn\" onclick=\"ONW.achievements.openModal()\">🏆 解除した実績を見る</button></div>`;
};

/** 今回誰がどの実績を解除したかの一覧モーダル */
achv.openModal = function () {
const reps = (ONW.game && ONW.game.achvReports) || {};
const rows = Object.values(reps).filter((r) => r && r.ids && r.ids.length);
let w = document.getElementById("achv-overlay");
if (!w) {
w = document.createElement("div");
w.id = "achv-overlay";
w.onclick = (e) => { if (e.target === w) achv.closeModal();};
document.body.appendChild(w);
}
const body = rows.length? rows.map((r) => `
<div class=\"achv-player\"><div class=\"achv-player__name\">🏆 ${esc(r.name)}</div>
${r.ids.map((id) => { const d = DEFS.get(id); return d? `<div class=\"achv-row\"><span class=\"achv-row__name\">${esc(d.n)}</span><span class=\"achv-row__desc\">${esc(d.d)}</span></div>`: "";}).join("")}</div>`).join("")
: `<p class=\"rs-dim\">今回新しく解除した人はいませんでした。</p>`;
w.innerHTML = `<div class=\"pf-card\" role=\"dialog\" aria-modal=\"true\"><button class=\"pf-x\" aria-label=\"閉じる\" onclick=\"ONW.achievements.closeModal()\">×</button><h2>解除した実績</h2>${body}</div>`;
};
achv.closeModal = function () { const w = document.getElementById("achv-overlay"); if (w) w.remove();};

/** プロフィールの実績欄（profile.js から呼ばれる）。data: achv.loadFor の戻り値 */
achv.profileHtml = function (data, isMine) {
if (!data || data.error) return `<h2>実績</h2><p class=\"night-step__hint\">実績を読み込めませんでした。（管理者向け: setup.sql の「10.」を実行してください）</p>`;
const unlocked = data.unlocked || new Set();
const cats = (typeof window!== "undefined" && window.ONW_ACHIEVEMENT_CATS) || {};
const byCat = {};
DATA.forEach((e) => { (byCat[e.c] = byCat[e.c] || []).push(e);});
const order = ["basic", "village", "wolf", "third", "other"];
const sec = order.filter((c) => byCat[c]).map((c) => {
const items = byCat[c].map((e) => {
const has = unlocked.has(e.i), eq = data.equipped === e.i;
const btn = isMine && has? `<button class=\"btn tf-chip\" onclick=\"ONW.achievements.equipFromProfile(${eq? "null": `'${e.i}'`})\">${eq? "装備中（外す）": "装備する"}</button>`: "";
return `<div class=\"achv-row${has? "": " achv-row--locked"}${eq? " achv-row--eq": ""}\"><span class=\"achv-row__name\">${has || isMine? esc(e.n): "？？？"}</span><span class=\"achv-row__desc\">${esc(e.d)}</span>${eq? `<span class=\"st st-ready\">装備中</span>`: ""}${btn}</div>`;
}).join("");
return `<div class=\"achv-cat\"><div class=\"achv-cat__name\">${esc(cats[c] || c)}（${byCat[c].filter((e) => unlocked.has(e.i)).length}/${byCat[c].length}）</div>${items}</div>`;
}).join("");
return `<h2>実績（${unlocked.size}/${DATA.length}）</h2><div class=\"achv-list\">${sec}</div>`;
};
achv.equipFromProfile = async function (id) {
const r = await achv.equip(id);
if (!r.ok) { alert(r.msg); return;}
const A = ONW.account;
if (A && A.user && ONW.profile) ONW.profile.open(A.user.id, A.user.display_name);
};

/** 装備中実績のラベル（。マイクラ版の equippedAchievementLabel と同じ形） */
achv.labelOf = (id) => (id && DEFS.has(id)? ``: "");
/** ロビーのCPU行用: 名前から決定的に1個選ぶ（表示専用。試合中のCPUは開始時にランダムで持ち直す） */
achv.cpuDisplayAchv = function (name) {
if (!DATA.length) return null;
let h = 0; const s = String(name || "");
for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
return DATA[h % DATA.length].i;
};
achv.randomId = () => (DATA.length? DATA[Math.floor(Math.random() * DATA.length)].i: null);

// アカウントのログイン/ログアウトに追従して読み直す
if (ONW.account && ONW.account.onChange) ONW.account.onChange(() => { achv.syncUser();});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => achv.syncUser());
else achv.syncUser();

ONW.achievements = achv;
})(window.ONW);
