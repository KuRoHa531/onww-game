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
// 陣営分け実績の統合（2026-11-27 作者決定）: 廃止した旧ID→統合先IDの読み替え。
// 判定フックが旧IDを返しても、保存済み（Supabase・端末）に旧IDが残っていても、統合先で所持扱いにする
const ACHV_REMAP = {
exposed_reveal_wolf: "exposed_reveal_village", exposed_reveal_third: "exposed_reveal_village",
seal_fail_wolf: "seal_fail_village", seal_fail_third: "seal_fail_village",
doppel_copy_wolf: "doppel_copy_village", doppel_copy_third: "doppel_copy_village",
gremlin_copy_wolf: "gremlin_copy_village", gremlin_copy_third: "gremlin_copy_village",
opportunist_with_wolf: "opportunist_with_village", opportunist_with_third: "opportunist_with_village",
bomber_with_wolf: "bomber_with_village", bomber_with_third: "bomber_with_village",
mind_wolf_find_wolf: "mind_wolf_find_village", mind_wolf_find_third: "mind_wolf_find_village",
seen_by_mind_wolf_wolf: "seen_by_mind_wolf_village", seen_by_mind_wolf_third: "seen_by_mind_wolf_village",
mad_seer_inspect_wolf: "mad_seer_inspect_village", mad_seer_inspect_third: "mad_seer_inspect_village",
relic_steal_wolf: "relic_steal_village", relic_steal_third: "relic_steal_village",
};
const remapId = (id) => ACHV_REMAP[id] || id;
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
mine.unlocked = new Set((j.unlocked || []).map(remapId).filter((id) => DEFS.has(id)));
const geq = j.equipped? remapId(j.equipped): null;
mine.equipped = geq && mine.unlocked.has(geq)? geq: null;
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
mine.unlocked = new Set((data || []).map((r) => remapId(r.achievement_id)).filter((id) => DEFS.has(id)));
mine.sbOk = true;
const eq = A.user.equipped_achievement? remapId(A.user.equipped_achievement): null;
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

/** welcome_onw: 初めてアカウントにログインしたら解除（2026-11-26 作者指示）。
* MC版の「ワールドに接続する」は Web版には無い言い回しなので、条件ごと「アカウントへのログイン」に読み替えた。
* 付与はログイン時の読み込み（syncUser）で行うので、実績実装前にログインしていた人も次回ログインで自動で獲得できる。
* ゲスト（アカウント無し）は対象外。新たに付いた時だけ獲得通知バナーを1回出す（所持済み・再ログインでは出ない）。 */
achv.grantWelcome = async function () {
const A = ONW.account;
if (!A ||!A.enabled ||!A.user ||!A.sb) return false;   // ゲストは対象外
if (!mine.loaded || mine.unlocked.has("welcome_onw")) return false;
const fresh = await achv.saveNew(["welcome_onw"]);
if (!fresh.includes("welcome_onw")) return false;
achv.showUnlockNotice(["welcome_onw"]);
return true;
};

/** 実績の獲得通知バナー（ログイン時の welcome_onw のような単発解除用。パン屋バナーと同型で、数秒で消える） */
achv.showUnlockNotice = function (ids) {
try {
if (typeof document === "undefined" ||!document.body ||!document.createElement) return;
document.querySelectorAll && document.querySelectorAll(".achv-banner").forEach((e) => { try { e.remove();} catch (err) {}});
(ids || []).forEach((id, ix) => {
const def = DEFS.get(id);
if (!def) return;
const b = document.createElement("div");
b.className = "achv-banner";
if (ix) b.style.top = `calc(18% + ${ix * 84}px)`;
b.innerHTML = `<span class="achv-banner__icon">🏆</span><span class="achv-banner__text">実績<span style="color:${catDefOf(def.c).col || "inherit"}">『${esc(def.n)}』</span>を解除しました</span>`;
document.body.appendChild(b);
setTimeout(() => { try { b.remove();} catch (err) {}}, 3900 + ix * 300);
});
if ((ids || []).length && ONW.sound) ONW.sound.se("achv");
} catch (e) { /* 通知の失敗でログイン処理を止めない */}
};

/** 試合結果の新規解除を、盤面の上にパン屋バナーと同じ形で1枚ずつ順番に出す（作者要望 2026-11-27。SE付き）。
 *  5個以上は最初の3枚＋「ほか〇個の実績を解除しました」にまとめる */
achv.showUnlockQueue = function (ids) {
try {
if (typeof document === "undefined" ||!document.body) return;
const list = (ids || []).filter((id) => DEFS.get(id));
if (!list.length) return;
const items = list.slice(0, list.length > 4 ? 3 : list.length);
const rest = list.length - items.length;
let ix = 0;
const next = () => {
document.querySelectorAll(".achv-banner--q").forEach((e) => { try { e.remove();} catch (err) {}});
if (ix > items.length) return;
if (ix === items.length && !rest) return;
const b = document.createElement("div");
b.className = "achv-banner achv-banner--fast achv-banner--q";
if (ix < items.length) {
const def = DEFS.get(items[ix]);
b.innerHTML = `<span class="achv-banner__icon">🏆</span><span class="achv-banner__text">実績<span style="color:${catDefOf(def.c).col || "inherit"}">『${esc(def.n)}』</span>を解除しました</span>`;
} else {
b.innerHTML = `<span class="achv-banner__icon">🏆</span><span class="achv-banner__text">ほか${rest}個の実績を解除しました</span>`;
}
document.body.appendChild(b);
if (ONW.sound) ONW.sound.se("achv");
ix++;
setTimeout(next, 1650);
};
next();
} catch (e) { /* 通知の失敗で結果処理を止めない */}
};

/** 新規解除分を保存する（ログイン中は Supabase、失敗時は端末にも控える）。ゲストは保存しない（作者指示 2026-11-26）。失敗しても投げない */
achv.saveNew = async function (ids) {
const A0 = ONW.account;
if (!A0 ||!A0.user) return [];   // ゲストは実績を保存しない
const fresh = [...new Set((ids || []).map(remapId))].filter((id) => DEFS.has(id) &&!mine.unlocked.has(id));
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
if (ONW.net && ONW.net.reportAchvEquip) ONW.net.reportAchvEquip(id || null);   // 作者指示（2026-11-26）: 装備はロビー等へ即時反映（再入室を待たない）
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
const unlocked = new Set((r1.data || []).map((r) => remapId(r.achievement_id)).filter((id) => DEFS.has(id)));
const eq = r2.data && r2.data.equipped_achievement? remapId(r2.data.equipped_achievement): null;
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
const add = (pid, aid) => { aid = aid && remapId(aid); if (aid && DEFS.has(aid)) (out[pid] = out[pid] || new Set()).add(aid);};
// 1) 各役職ファイルの判定フック
const hooks = hookList();
for (const p of g.players) {
for (const h of hooks) {
try { (h(g, p.id, won.has(p.id)) || []).forEach((aid) => add(p.id, aid));} catch (e) { /* 1役職の失敗で全体を止めない */}
}
}
// 2) 全役職共通: 初めてその役職になる（この試合で「なった」役職すべて = 変化前・初期・経由（roleTrail）・最終。
//    マイクラ版 roleHistoryIncludes と同じ範囲で、戦績の became とも一致させる） / その役職で勝利（最終役職のみ。マイクラ版 finalRole === role）
for (const p of g.players) {
const fin = (g.currentRoles || {})[p.id];
const became = new Set();
const tf = (g.transformFrom || {})[p.id]; if (tf) became.add(tf);
const ini = (g.initialRoles || {})[p.id]; if (ini) became.add(ini);
((g.roleTrail || {})[p.id] || []).forEach((r) => { if (r) became.add(r);});
if (fin) became.add(fin);
became.forEach((r) => (FIRST_BY_ROLE[r] || []).forEach((e) => add(p.id, e.i)));
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
let roleLost = false;
for (const p of players) {
const h = trailOf(p.id); let changes = 0;
for (let i = 1; i < h.length; i++) if (h[i]!== h[i - 1]) changes++;
if (changes >= 3) roleLost = true;
}
// 迷子の迷子の子猫ちゃん（lost_kittens）: 猫役職が2回以上「移動」した試合に参加する。
// 作者決定: 光の使徒・闇の化身・銀色の影による「変化」で猫役職になった遷移は移動に数えない。
// 変化は配布時に transformFrom（変化前）→ 初期役職として記録され、カード自体は動かない。
// 夜以降の遷移は cards.trail（roleTrail と並行するカードIDの履歴）で「カードが動いたか」を見て、
// 交換・墓荒らし等のカード移動は変化前の役職が変化役でも数え、カードが動いていない上書きで
// 変化役から猫役職になった遷移（変化の延長）だけを除外する。
const BASES = new Set(["light_apostle", "dark_avatar", "silver_shadow"]);
let kittenMoves = 0;
for (const p of players) {
const id = p.id, stages = [];
const tf = (g.transformFrom || {})[id];
if (tf) stages.push(tf);
const ini = (g.initialRoles || {})[id];
if (ini) stages.push(ini);
const trailStart = stages.length;   // roleTrail 由来の段階が始まる添字（これより前は配布時の変化）
((g.roleTrail || {})[id] || []).forEach((r) => stages.push(r));
const fin = (g.currentRoles || {})[id];
if (fin && stages[stages.length - 1]!== fin) stages.push(fin);
const cardTrail = (g.cards && g.cards.trail && g.cards.trail[id]) || [];
for (let i = 1; i < stages.length; i++) {
if (stages[i] === stages[i - 1] ||!CATS.has(stages[i])) continue;
if (i < trailStart) continue;   // 配布時の変化（変化役 → 猫役職）は移動に数えない
const j = i - trailStart;   // roleTrail の添字（cards.trail と並行）
const cardBefore = j === 0? "P:" + id: (cardTrail[j - 1] || "P:" + id);
const cardAfter = cardTrail[j] || cardBefore;
if (cardAfter === cardBefore && BASES.has(stages[i - 1])) continue;   // カードが動いていない変化役からの上書きは数えない
kittenMoves++;
}
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
const AC = ONW.account;
if (!AC ||!AC.user) return [];   // 作者指示（2026-11-26）: ゲストは実績の対象外（保存も通知もしない。累計カウンタも進めない）
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
if (fresh.length && A && A.user && ONW.net.reportAchv) ONW.net.reportAchv(fresh);   // 作者指示（2026-11-26）: ゲストは実績通知なし（申告しないのでリザルトの解除行・モーダルにも出ない。ゲストは保存自体もしない＝onResult の入口で対象外）
if (fresh.length) achv.showUnlockQueue(fresh);   // 盤面の上のバナー通知（作者要望 2026-11-27。結果が届いた瞬間＝結果発表の盤面が出ている間に出す）
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
${r.ids.map((id) => { const d = DEFS.get(id); return d? `<div class=\"achv-row\"><span class=\"achv-row__name\" style=\"color:${catDefOf(d.c).col || "inherit"}\">${esc(d.n)}</span><span class=\"achv-row__desc\">${esc(d.d)}</span></div>`: "";}).join("")}</div>`).join("")
: `<p class=\"rs-dim\">今回新しく解除した人はいませんでした。</p>`;
w.innerHTML = `<div class=\"pf-card\" role=\"dialog\" aria-modal=\"true\"><button class=\"pf-x\" aria-label=\"閉じる\" onclick=\"ONW.achievements.closeModal()\">×</button><h2>解除した実績</h2>${body}</div>`;
};
achv.closeModal = function () { const w = document.getElementById("achv-overlay"); if (w) w.remove();};

/** プロフィールの実績欄（profile.js から呼ばれる）。data: achv.loadFor(見ている相手のID) の戻り値。
* マイクラ版の実績UIと同じドリルダウン式:
* 実績一覧（トップ: 全実績の解除数＋カテゴリ一覧）→ カテゴリ →（人狼陣営は「人狼系/狂人系」の振り分け）→
* サブカテゴリ（役職）→ 実績リスト → 実績詳細（自分の解除済みには「装備する」ボタン）。
* 解除状況・装備中はすべて「見ている相手」のデータで描く（閲覧者の状態では変わらない）。
* 未達成でも名前・説明を表示する（作者決定で「？？？」伏せは廃止）。装備ボタンは自分のプロフィールのときだけ（isMine）。 */
const CAT_DEFS = (typeof window!== "undefined" && window.ONW_ACHIEVEMENT_CATEGORY_DEFS) || [];
const catDefOf = (cid) => CAT_DEFS.find((c) => c.i === cid) || { i: cid, n: cid, col: "", o: 999, h: false};
// マイクラ版 isRealWolfRole の移植（人狼陣営カテゴリの「人狼系」判定に使う役職ID。闇の化身は MC の wolfAchievementSubCategoryKind どおり別枠で人狼系）
const REAL_WOLVES = new Set(["werewolf", "big_wolf", "lone_wolf", "white_wolf", "tofu_wolf", "negi_wolf", "forgetful_wolf", "assassin", "wolf_king", "mapo_wolf", "cat_pumpkin", "observer_wolf", "mind_wolf", "mimic_wolf", "eraser_wolf", "mirage_wolf", "silver_wolf", "command_wolf", "curse_wolf", "sam", "patch"]);
const wolfKindOf = (role) => (role === "dark_avatar" || REAL_WOLVES.has(role)? "real": "mad");
let pfState = null; // { data, isMine, level: top|kind|subs|list|detail, cat, kind, role, achvId}
const pfRoleName = (r) => { try { return ONW.roles.getInfo(r).name;} catch (e) { return r;}};
const pfRoleRank = (r) => { try { return ONW.roleRank(r);} catch (e) { return 9999;}};
const pfByCat = (cid) => DATA.filter((e) => e.c === cid);
const pfCount = (list, unlocked) => list.filter((e) => unlocked.has(e.i)).length;
/** 件数表示（マイクラ版の色どおり: 解除数は §b=水色、総数は §e=黄色） */
const pfCountHtml = (list, unlocked) => `<span style="color:#55FFFF">${pfCount(list, unlocked)}</span> / <span style="color:#FFFF55">${list.length}</span>`;
/** 表示するカテゴリ（MC achievementVisibleCategories: hiddenByDefault のカテゴリは、その実績を1つでも解除するまで出さない） */
const pfVisibleCats = (unlocked) => CAT_DEFS.filter((c) =>!c.h || pfByCat(c.i).some((e) => unlocked.has(e.i))).slice().sort((a, b) => a.o - b.o);
/** サブカテゴリのキー: 役職カテゴリは役職ID（r）、基本/その他はサブカテゴリ名（s。参加・勝敗・ネタ・酔っぱらい・恋人など。MCにも基本/その他にサブカテゴリがある） */
const pfSubKey = (e) => e.r || e.s || null;
/** サブカテゴリの表示名: 役職IDは役職名に、ラベルはそのまま（pfRoleName は引けないIDをそのまま返す） */
const pfSubName = (key) => pfRoleName(key);
/** カテゴリ内のサブカテゴリ。役職は ROLE_ORDER 順、ラベルはマスターの出現順。kind を渡すと人狼陣営の人狼系/狂人系で絞る */
const pfSubsOf = (cid, kind) => [...new Set(pfByCat(cid).map((e) => pfSubKey(e)).filter(Boolean))]
.filter((r) =>!kind || wolfKindOf(r) === kind).sort((a, b) => pfRoleRank(a) - pfRoleRank(b));
// 役職検索（デバッグの役職検索と同じ流儀: 名前＋読み仮名＋役職IDを正規化して data-rq に埋め、入力では再描画せずDOMだけ絞る）
const pfNormQ = (s) => String(s || "").replace(/[\s　]/g, "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).toLowerCase();
const pfSearchKey = (r) => { const kana = (ONW.detectiveGhost && ONW.detectiveGhost.kanaOf)? ONW.detectiveGhost.kanaOf(r): ""; return pfNormQ(`${pfRoleName(r)} ${kana || ""} ${r}`);};
const pfBackBtn = (label) => `<div class="achv-backrow"><button type="button" class="btn tf-chip" onclick="ONW.achievements.pfBack()">${label}</button></div>`;
const pfNavRow = (onclick, nameHtml, countText) => `<button type="button" class="achv-navrow" onclick="${onclick}"><span class="achv-navrow__name">${nameHtml}</span><span class="achv-navrow__count">${countText}</span></button>`;

function pfTopHtml() { // 実績一覧トップ（MC openAchievementsMenu / buildAchievementListBody）
const unlocked = pfState.data.unlocked || new Set();
const cats = pfVisibleCats(unlocked);
const visEntries = cats.flatMap((c) => pfByCat(c.i)); // 全体集計は表示中カテゴリだけ（MC achievementOverallStats と同じ）
const rows = cats.map((c) => {
const list = pfByCat(c.i);
return pfNavRow(`ONW.achievements.pfCat('${c.i}')`, `<span style="color:${c.col || "inherit"}">${esc(c.n)}</span>`, pfCountHtml(list, unlocked));
}).join("");
return `<div class="achv-top__title">【実績一覧】</div><div class="achv-top__overall">全実績 ${pfCountHtml(visEntries, unlocked)}</div><p class="rs-dim">カテゴリを選ぶと詳細を開けます。</p>${rows}`;
}
function pfKindHtml() { // 人狼陣営: 人狼系 / 狂人系の振り分け（MC openWolfAchievementKindMenu）
const unlocked = pfState.data.unlocked || new Set();
const cd = catDefOf(pfState.cat), list = pfByCat(pfState.cat);
const rows = [["real", "人狼系"], ["mad", "狂人系"]].map(([k, label]) => {
const sub = list.filter((e) => e.r && wolfKindOf(e.r) === k);
return pfNavRow(`ONW.achievements.pfKind('${k}')`, esc(label), pfCountHtml(sub, unlocked));
}).join("");
return `${pfBackBtn("実績一覧へ戻る")}<div class="achv-cathead" style="color:${cd.col || "inherit"}">${esc(cd.n)}</div><div class="achv-catcount">${pfCountHtml(list, unlocked)}</div><p class="rs-dim">人狼系か狂人系かを選んでください。</p>${rows}`;
}
function pfSubsHtml() { // サブカテゴリ（役職）の一覧（MC openAchievementSubCategoryListMenu。役職検索つき）
const unlocked = pfState.data.unlocked || new Set();
const cd = catDefOf(pfState.cat), list = pfByCat(pfState.cat), kind = pfState.kind;
const title = kind? `${cd.n}（${kind === "mad"? "狂人系": "人狼系"}）`: cd.n;
const roles = pfSubsOf(pfState.cat, kind);
const rows = roles.map((r) => {
const sub = list.filter((e) => pfSubKey(e) === r);
return `<button type="button" class="achv-navrow" data-rq="${esc(pfSearchKey(r))}" onclick="ONW.achievements.pfSub('${r}')"><span class="achv-navrow__name">${esc(pfSubName(r))}</span><span class="achv-navrow__count">${pfCountHtml(sub, unlocked)}</span></button>`;
}).join("");
const search = roles.length >= 10? `<div class="dbg-searchrow"><input class="dbg-search" type="search" placeholder="役職を検索（名前・読み）" oninput="ONW.achievements.pfSearch(this)"></div>`: "";
return `${pfBackBtn(kind? "人狼系/狂人系の選択へ戻る": "実績一覧へ戻る")}<div class="achv-cathead" style="color:${cd.col || "inherit"}">${esc(title)}</div><p class="rs-dim">サブカテゴリ（役職）を選んでください。</p>${search}<div class="achv-subs">${rows}<div class="achv-noresult" style="display:none">見つかりませんでした</div></div>`;
}
function pfListHtml() { // 実績リスト（MC openAchievementSubCategoryMenu / サブカテゴリの無いカテゴリは直接ここ）
const unlocked = pfState.data.unlocked || new Set(), data = pfState.data;
const cd = catDefOf(pfState.cat), role = pfState.role;
const list = role? pfByCat(pfState.cat).filter((e) => pfSubKey(e) === role): pfByCat(pfState.cat);
const rows = list.map((e) => {
const has = unlocked.has(e.i), eq = has && data.equipped === e.i;
// 名前の色はマイクラ版 achievementButtonText どおり: 達成済みは実績の色（MC定義に個別色は無いので §f=白）、未達成は §7=グレー
return `<button type="button" class="achv-navrow${has? "": " achv-item--locked"}" onclick="ONW.achievements.pfDetail('${e.i}')"><span class="achv-navrow__name" style="color:${has? "#FFFFFF": "#AAAAAA"}">『${esc(e.n)}』</span>${eq? `<span class="st st-ready">装備中</span>`: ""}<span class="achv-item__st ${has? "ok": "ng"}">${has? "達成済み": "未達成"}</span></button>`;
}).join("");
return `${pfBackBtn(role? "サブカテゴリの一覧へ戻る": "実績一覧へ戻る")}<div class="achv-cathead" style="color:${cd.col || "inherit"}">${esc(role? pfSubName(role): cd.n)}</div><div class="achv-catcount">${pfCountHtml(list, unlocked)}</div><p class="rs-dim">実績を選ぶと詳細を開きます。</p>${rows || `<p class="rs-dim">このカテゴリの実績はまだ追加されていません。</p>`}`;
}
function pfDetailHtml() { // 実績詳細（MC openAchievementDetailMenu / achievementDetailBody）
const unlocked = pfState.data.unlocked || new Set(), data = pfState.data;
const e = DEFS.get(pfState.achvId);
if (!e) return pfTopHtml();
const has = unlocked.has(e.i), eq = has && data.equipped === e.i, cd = catDefOf(e.c);
const prog = e.i === "achievement_all_497"? `<div class="achv-detail__prog">進捗：${[...unlocked].filter((id) => id!== e.i && DEFS.has(id)).length} / ${DATA.length - 1}</div>`: "";
const equip = pfState.isMine && has? `<div class="btn-row"><button type="button" class="btn" onclick="ONW.achievements.pfEquip(${eq? "null": `'${e.i}'`})">${eq? "装備を外す": "装備する"}</button></div>`: "";
return `${pfBackBtn("実績の一覧へ戻る")}<div class="achv-detail"><div class="achv-detail__name">『${esc(e.n)}』</div><div class="achv-item__st ${has? "ok": "ng"}">${has? "達成済み": "未達成"}</div>${prog}<div class="achv-detail__desc">説明：${esc(e.d)}</div><div class="achv-detail__cat" style="color:${cd.col || "inherit"}">${esc(cd.n)}</div>${(e.r || e.s)? `<div class="achv-detail__sub">サブカテゴリ：${esc(pfSubName(e.r || e.s))}</div>`: ""}${eq? `<div><span class="st st-ready">装備中</span></div>`: ""}${equip}</div>`;
}
function pfRender() {
if (!pfState) return "";
if (pfState.level === "kind") return pfKindHtml();
if (pfState.level === "subs") return pfSubsHtml();
if (pfState.level === "list") return pfListHtml();
if (pfState.level === "detail") return pfDetailHtml();
return pfTopHtml();
}
function pfPaint() { const el = document.getElementById("achv-drill"); if (el && pfState) el.innerHTML = pfRender();}
achv.profileHtml = function (data, isMine) {
if (!data || data.error) return `<h2>実績</h2><p class="night-step__hint">実績を読み込めませんでした。（管理者向け: setup.sql の「10.」を実行してください）</p>`;
pfState = { data, isMine:!!isMine, level: "top", cat: null, kind: null, role: null, achvId: null};
return `<h2>実績</h2><div id="achv-drill">${pfRender()}</div>`;
};
achv.pfCat = function (cid) {
if (!pfState) return;
pfState.cat = cid; pfState.kind = null; pfState.role = null;
pfState.level = cid === "wolf"? "kind": (pfSubsOf(cid).length? "subs": "list"); // サブカテゴリの無いカテゴリ（基本・その他）は直接リストへ
pfPaint();
};
achv.pfKind = function (kind) { if (!pfState) return; pfState.kind = kind; pfState.level = "subs"; pfPaint();};
achv.pfSub = function (role) { if (!pfState) return; pfState.role = role; pfState.level = "list"; pfPaint();};
achv.pfDetail = function (id) { if (!pfState ||!DEFS.has(id)) return; pfState.achvId = id; pfState.level = "detail"; pfPaint();};
achv.pfBack = function () {
if (!pfState) return;
const v = pfState;
if (v.level === "detail") v.level = "list";
else if (v.level === "list") v.level = v.role? "subs": "top";
else if (v.level === "subs") v.level = v.cat === "wolf"? "kind": "top";
else if (v.level === "kind") v.level = "top";
else v.level = "top";
pfPaint();
};
/** 役職検索: 再描画せず、その場で役職行の表示だけを切り替える（デバッグの役職検索と同じ流儀。入力のフォーカスが外れない） */
achv.pfSearch = function (input) {
const rootEl = input && input.closest? input.closest("#achv-drill"): null;
const grid = rootEl && rootEl.querySelector(".achv-subs");
if (!grid) return;
const q = pfNormQ(input.value);
let any = false;
[...grid.children].forEach((ch) => {
if (ch.tagName!== "BUTTON") return;
const hit =!q || (ch.getAttribute("data-rq") || "").indexOf(q) >= 0;
ch.style.display = hit? "": "none";
if (hit) any = true;
});
const nr = grid.querySelector(".achv-noresult");
if (nr) nr.style.display = q &&!any? "": "none";
};
/** 詳細画面の「装備する」: 保存できたらその場で詳細を描き直す（プロフィールを開き直さない） */
achv.pfEquip = async function (id) {
const r = await achv.equip(id);
if (!r.ok) { if (typeof alert === "function") alert(r.msg); return;}
if (pfState && pfState.data) pfState.data.equipped = id;
pfPaint();
};
achv.equipFromProfile = function (id) { return achv.pfEquip(id);}; // 互換用（旧UIのボタンからの呼び出し）

/** 装備中実績のラベル（【実績名】。マイクラ版の equippedAchievementLabel と同じ形） */
achv.labelOf = (id) => (id && DEFS.has(id)? "【" + (DEFS.get(id).n || "") + "】": "");
/** 実績の色（マイクラ版は装備ラベルをカテゴリ色で出す。equippedAchievementLabel の color = カテゴリ色） */
achv.colorOf = (id) => { const d = DEFS.get(id); return d? (catDefOf(d.c).col || ""): "";};
/** 吹き出しチャットの名前行（作者決定 2026-11-26: 装備実績名は自分の発言では名前の左、他者では名前の右。色はカテゴリ色）。
* nameHtml / tagHtml は呼び出し側でエスケープ済みのHTML。実績が無い・引けない場合はラベルを出さない */
achv.bubbleNameHtml = function (nameHtml, id, mine, tagHtml) {
const label = achv.labelOf(id);
const tag = label? `<span class="bub__achv" style="color:${achv.colorOf(id)}">${esc(label)}</span>`: "";
return `<div class="bub__name">${mine? tag: ""}${tagHtml || ""}${nameHtml}${mine? "": tag}</div>`;
};
/** ロビーの名前まわり（作者決定 2026-11-26: 装備実績名は名前の上。色はカテゴリ色）。
* ラベルは .pl-stack に対して絶対配置で名前の上に重ねる（レイアウトフローの外）ので、
* 実績の無い人にはラベル要素自体を出さず、名前の前に空白ができない。
* ラベルが後から届いても行の高さは変わらないため、ボタン位置もずれない */
achv.lobbyNameHtml = function (nameHtml, id) {
const label = achv.labelOf(id);
if (!label) return `<span class="pl-name">${nameHtml}</span>`;
return `<span class="pl-stack"><span class="pl-achv" style="color:${achv.colorOf(id)}">${esc(label)}</span><span class="pl-name">${nameHtml}</span></span>`;
};
/** ロビーのCPU行用: 呼ばれるたび（＝ロビーが表示されるたび）にランダムに1個選ぶ（表示専用。名前には依存しない）。
 * 試合中のCPUの装備実績は、試合開始時に net.js が g.cpuAchv へ別途ランダムで割り当てるので、そちらとは混ざらない */
achv.cpuDisplayAchv = function (name) {
return achv.randomId();
};
achv.randomId = () => (DATA.length? DATA[Math.floor(Math.random() * DATA.length)].i: null);

// アカウントのログイン/ログアウトに追従して読み直す
if (ONW.account && ONW.account.onChange) ONW.account.onChange(() => { achv.syncUser();});
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => achv.syncUser());
else achv.syncUser();

ONW.achievements = achv;
})(window.ONW);
