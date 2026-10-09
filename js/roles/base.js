/**
 * roles/base.js  ── 役職ファイルの「登録の仕組み」(役職ではありません)
 * ------------------------------------------------------------
 * 役職を追加するとき:
 *   1) js/roles/<village|wolf/wolf|wolf/mad|neutral>/<役職ID>.js を1つ作り(村人陣営=village / 人狼陣営の人狼系=wolf/wolf・狂人系=wolf/mad / 第三陣営=neutral)、ONW.defineRole("<役職ID>", { ... }) で登録する
 *   2) index.html の「役職ファイル」の並びに <script src="js/roles/<陣営>/<役職ID>.js"></script> を1行足す
 *   これだけで、夜の能力・夜の画面の説明・朝/昼の通知が net.js から呼ばれる(net.js は触らなくてよい)。
 *
 * 【役職の処理順】ユーザー指定の全順序(まだない役職も含む)は _wip/役職の処理順.txt。night.kind / night.order を決めるときは必ず参照すること。
 *
 * 定義できるもの(すべて省略可):
 *   like: "seer"                他の役職の定義を土台にする(足りない項目だけ自分で上書き)
 *   info: { name, team, wakeOrder, desc, sort, deck, count }   役職の名前・陣営・夜の行動順・説明文(ONW.ROLE_INFO に集約される)。
 *         deck = 配役設定(roleCounts)の並び順、count = 初期枚数(省略は0)。役職ID(ONW.ROLE.<ID大文字>)は defineRole で自動で作られる。
 *   seerSees: "<役職ID>"        占われたときに見える役職(白狼=村人 / 狼憑き=人狼)
 *         sort は ONW.ROLE_INFO の並び順(小さいほど先。省略した役職は最後に登録順)。like で土台にしても info は引き継がない(必ず自分で書く)
 *   groups: { wolf: n, mad: n, tomo: n, selfAsVillager: n, selfAsWolf: n, newsHidden: n, "transform:<変化役のID>": n }
 *         役職グループへの所属(ONW.WOLF_KIND / MAD_KIND / TOMO_ROLES / SELF_AS_VILLAGER / SELF_AS_WOLF / NEWS_HIDDEN / TRANSFORM_GROUPS[変化役])。
 *         n は並び順(小さいほど先)。例: 光の使徒の変化先になる役職は groups: { "transform:light_apostle": 3 }
 *   【必須・毎回入れること】新しい役職は、陣営に合う変化役の変化先に必ず入れる（抜けると、ロビーの変化候補・固定役の変化指定・設定のOFF・ガイドに出ない）:
 *       村人系 → "transform:light_apostle"（光の使徒）/ 人狼系 → "transform:dark_avatar"（闇の化身）/ 狂人系 → "transform:dark_avatar"（闇の化身）/ 第三陣営 → "transform:silver_shadow"（銀色の影）
 *       番号 n は同じ変化役の中での並び順。入れたか確認は node _wip/groupcheck.js .（登録もれがあると FAIL）
 *   hiddenWolf: true            人狼系だが夜に仲間から見えない(一匹狼)。ONW.VISIBLE_WOLF から外れる
 *   descFor(desc, g)            説明文をルーム設定などで差し替えたいとき(メイヤーの票数)。ONW.roleDesc から呼ばれる
 *   night: {                    夜に自分で能力を使う役職
 *     kind:  "seer"|"relic"|"doppel"|"shuffler"|"gremlin"|"robber"|"tm"   夜が明けるときに実行される段階(net.js の NIGHT_STAGES)
 *     order: 数字              同じ段階の中の順番(小さいほど先)
 *     chain: false             墓荒らしの交換後/ドッペルのコピー後に「朝のうちに使える」役職から外す(墓荒らし自身)
 *     complete(np, ng)         選択が完了しているか(np=選んだ人数, ng=選んだ墓地の枚数)
 *     normalize(c, players, graves) -> {players, graves}   受け取った選択の整形
 *     resolve(c, p)            夜の終わりの実行(p = 能力を使う人間のプレイヤー)
 *   }
 *   morning: { run(c) -> {lines, reveal, nextChain}|null, after(c, res), peek(c), dayNotify(c) }   朝/昼に使う能力
 *   nightMsg(c, p, r)          夜の始まりに本人へ出す内容(text/text2/lines/godPeek/bigGraves/cultWolves/masonMates/master)
 *   got(c, p, got, rev, opts)  墓荒らし/ドッペルでこの役職を手にしたときの夜の情報
 *   soberLines(c, id, fin) / soberPeek(c, id, fin) / soberExtra(c, id, fin)   酔いが覚めたときの情報
 *   soberJudge(c, ids)   酔いが覚める直前(ids = 覚める人): 覚めた瞬間の判定が必要な役職(破局師)用
 *   settlePre(c) / settlePost(c) / settleMsg(c, p, mode)   朝のあとの待機時間(mode: "settle" | "resync")
 *   dayShift(c, before) / dayCheck(c, before) / dayNews(c) / dayNotice(c)   昼のうちに役職が動いたとき
 *   dayStart(c) / dayAnnounce(c) / soberReveal(c, ids) / resyncDay(c, seat) / cpuLateVisits(c)
 *   dayCurse(c) 昼になった瞬間の呪殺(妖狐: 待機時間に決めた席を昼中死亡に) / daySober(c) 昼に酔いが覚めたとき(妖狐: 酔い覚めの呪殺) / dayCheck(c) 昼に役職が動いた・占ったとき(妖狐: 新しく占われた席に妖狐が来たら呪殺)
 *   stageNight / stageMorning / stagePick: stage.js の夜・朝の演出とカードの選び方(stage.kit を使う)
 *   stageResult: { execExclude(res), intro, flipUp, flipped, kingdom, assassin, bounty, restUp, rest, afterRest, reverse, skip, clear }   結果発表の演出(stage.js の startResult / skipResult)
 *   stageSettle: { field, shown, run, end } / stageFlash: { field, when, run }   朝の待機時間・昼の公開演出(スター・女王・フリーター・訪問者)
 *   stageSober: { list, listLate }   昼に酔いが覚めたときにめくれるカードの並び(stage.js の soberPeek)
 *   フックは関数、または { order: 数字, run: 関数 } で書ける(order が小さいほど先に呼ばれる。省略は100)
 *
 * c(コンテキスト)は net.js が渡す: { g, PH, hold, send, sendAll, sendSpec, sendSpecInfo, rn, nameOf, byId, isDead, ... }
 * ------------------------------------------------------------
 */
window.ONW = window.ONW || {};

(function (ONW) {
  const raw = {}, ids = [];
  let cache = {};

  /** 役職を登録する(同じIDで登録し直すと上書き) */
  ONW.defineRole = function (id, def) {
    if (!raw[id]) ids.push(id);
    raw[id] = def || {};
    cache = {};
    rebuildTables();
    return raw[id];
  };

  function resolve(id) {
    if (!id || !raw[id]) return null;
    if (cache[id]) return cache[id];
    const d = raw[id];
    let out = d;
    if (d.like) { const b = resolve(d.like); out = Object.assign({}, b || {}, d); }
    return (cache[id] = out);
  }
  /** 役職の定義(like を解決したもの)。未登録なら null */
  ONW.roleDef = (id) => resolve(id);
  ONW.roleIds = () => ids.slice();

  const hookOf = (v) => (typeof v === "function" ? { order: 100, run: v } : v && typeof v.run === "function" ? { order: v.order == null ? 100 : v.order, run: v.run } : null);
  /** 指定した役職のフック(なければ null)。this は役職の定義 */
  ONW.roleHook = (id, name) => {
    const d = resolve(id), h = d && hookOf(d[name]);
    return h ? (...a) => h.run.apply(d, a) : null;
  };
  /** そのフックを持つ全役職を order → 登録順に並べて返す: [{ id, def, fn }] */
  ONW.roleHooks = (name) => ids.map((id, idx) => {
    const d = resolve(id), h = d && hookOf(d[name]);
    return h ? { id, def: d, order: h.order, idx, fn: (...a) => h.run.apply(d, a) } : null;
  }).filter(Boolean).sort((a, b) => a.order - b.order || a.idx - b.idx);

  /** 入れ子のフック: 役職定義の d[name][key] (関数、または { order, run })を持つ全役職を order → 登録順に並べて返す: [{ id, def, fn }]。
   *  例: ONW.roleHooksIn("stageResult", "flipped")。fn は d[name] を this にして呼ばれる */
  ONW.roleHooksIn = (name, key) => ids.map((id, idx) => {
    const d = resolve(id), o = d && d[name], h = o && hookOf(o[key]);
    return h ? { id, def: d, order: h.order, idx, fn: (...a) => h.run.apply(o, a) } : null;
  }).filter(Boolean).sort((a, b) => a.order - b.order || a.idx - b.idx);

  /** 夜に自分で能力を使う役職か */
  ONW.roleIsActive = (id) => { const d = resolve(id); return !!(d && d.night); };
  /** 墓荒らしが交換したあと、そのまま朝に使える役職か(墓荒らし自身は含まない) */
  ONW.roleCanChain = (id) => { const d = resolve(id); return !!(d && d.night && d.night.chain !== false); };
  /** 夜が明けるときの1段階分の実行リスト: [{ roles: [役職ID...], fn }]（同じ resolve 関数を共有する役職は1組にまとまる） */
  ONW.roleNightSteps = (kind) => {
    const steps = [];
    ids.forEach((id, idx) => {
      const d = resolve(id);
      if (!d || !d.night || d.night.kind !== kind || typeof d.night.resolve !== "function") return;
      let s = steps.find((x) => x.fn === d.night.resolve);
      if (!s) steps.push((s = { fn: d.night.resolve, order: d.night.order == null ? 100 : d.night.order, idx, roles: [] }));
      s.roles.push(id);
    });
    return steps.sort((a, b) => a.order - b.order || a.idx - b.idx);
  };

  /** 役職ファイルが共有する小道具(役職固有ではない) */
  ONW.roleKit = ONW.roleKit || {};
  /** 墓荒らし・ドッペルゲンガーで役職を手にしたときの情報(got フック)用の道具箱 */
  ONW.roleKit.gotTools = (c, p, rev, opts) => {
    const g = c.g, o = opts || {}, i = o.skipGrave, eff = () => g.initialRoles[p.id];
    const nameOf = (id) => (g.players.find((q) => q.id === id) || {}).name || "?";
    const wolfIds = (self) => g.players.filter((q) => q.id !== self && ONW.VISIBLE_WOLF.includes(g.initialRoles[q.id])).map((q) => q.id);
    const names = (xs) => xs.map(nameOf).join("、");
    const seeGraves = (own) => g.center0.map((cr, j) => [j, cr]).filter(([j]) => j !== own);   // 交換した墓地以外の、配役直後（初期役職）の墓地
    const r = rev[p.id];
    const both = (role) => { if (o.both) r.both = { role }; };
    const peekOf = (arr) => (o.skipKey ? arr.filter((x) => x.k !== o.skipKey) : arr);
    const setPeek = (arr, gap) => { const a = peekOf(arr); if (a.length) { r.peek = a; r.gap = gap; } };
    return { g, o, i, eff, nameOf, wolfIds, names, seeGraves, r, both, peekOf, setPeek, hold: c.hold, rn: c.rn };
  };

  /** 占い師・狂った占い師がプレイヤーを占ったときに見える役職(役職ファイルの seerSees で指定。なければ本当の役職) */
  ONW.seerSees = (role) => (raw[role] && raw[role].seerSees) || role;
  /** 配役の初期枚数 { 役職ID: 枚数 }。並びは info.deck の小さい順(省略は登録順で最後)、初期枚数は info.count(省略は0) */
  ONW.defaultRoleCounts = () => {
    const out = {};
    ids.map((id, idx) => ({ id, idx, d: (raw[id].info || {}).deck })).filter((x) => raw[x.id].info)
      .sort((a, b) => (a.d == null ? 1e6 : a.d) - (b.d == null ? 1e6 : b.d) || a.idx - b.idx)
      .forEach((x) => { out[x.id] = raw[x.id].info.count || 0; });
    return out;
  };

  /* ---- 役職の説明・定義(info)と役職グループの集約 ----
   * 役職ファイルの info / groups から、state.js が用意した空の入れ物(ONW.ROLE_INFO / WOLF_KIND ...)を「同じ入れ物のまま」作り直す。
   * (入れ物を差し替えないので、他のファイルが ONW.WOLF_KIND などを先に握っていても大丈夫)
   * 酔っ払い・恋人のような「役職ファイルを作らない共通の役職」は state.js の ONW.COMMON_ROLE_INFO に書く。 */
  const infoObjs = new Map();
  const fill = (arr, xs) => { arr.length = 0; xs.forEach((x) => arr.push(x)); return arr; };
  function rebuildTables() {
    ids.forEach((id) => { if (ONW.ROLE) ONW.ROLE[id.toUpperCase()] = id; });   // ONW.ROLE.<ID大文字> を自動で作る
    // state.js は役職ファイルより先に読まれて ONW.game を作るので、読み込み中は配役の初期値を役職ファイルに合わせて同じ入れ物のまま作り直す
    if (ONW.game && ONW.game.roleCounts) { const rc = ONW.game.roleCounts, d = ONW.defaultRoleCounts(); Object.keys(rc).forEach((k) => delete rc[k]); Object.assign(rc, d); }
    const T = ONW.ROLE_INFO;
    if (!T || !ONW.WOLF_KIND) return;                         // state.js より先に読まれたときは何もしない
    const list = [];
    ids.forEach((id, idx) => { const d = raw[id]; if (d && d.info) list.push({ id, idx, info: d.info, sort: d.info.sort == null ? 1e6 : d.info.sort }); });
    if (!list.length) return;
    const common = ONW.COMMON_ROLE_INFO || {};
    Object.keys(common).forEach((id, k) => { if (!raw[id]) list.push({ id, idx: 1e6 + k, info: common[id], sort: common[id].sort == null ? 5e5 : common[id].sort }); });
    list.sort((a, b) => a.sort - b.sort || a.idx - b.idx);
    Object.keys(T).forEach((k) => delete T[k]);
    list.forEach((x) => {
      let o = infoObjs.get(x.info);
      if (!o) infoObjs.set(x.info, (o = { name: x.info.name, team: x.info.team, wakeOrder: x.info.wakeOrder, desc: x.info.desc }));
      T[x.id] = o;
    });
    // 役職グループ: groups[名前] の数字の小さい順(同じ数字は ROLE_INFO の並び順)
    const members = (name) => list.filter((x) => raw[x.id] && raw[x.id].groups && raw[x.id].groups[name] != null)
      .sort((a, b) => raw[a.id].groups[name] - raw[b.id].groups[name] || list.indexOf(a) - list.indexOf(b)).map((x) => x.id);
    fill(ONW.WOLF_KIND, members("wolf"));
    fill(ONW.VISIBLE_WOLF, ONW.WOLF_KIND.filter((r) => !(raw[r] && raw[r].hiddenWolf)));
    fill(ONW.MAD_KIND, members("mad"));
    fill(ONW.TOMO_ROLES, members("tomo"));
    fill(ONW.SELF_AS_VILLAGER, members("selfAsVillager"));
    fill(ONW.SELF_AS_WOLF, members("selfAsWolf"));
    fill(ONW.NEWS_HIDDEN, members("newsHidden"));
    const TG = ONW.TRANSFORM_GROUPS;
    Object.keys(TG).forEach((k) => delete TG[k]);
    list.forEach((x) => { const m = members("transform:" + x.id); if (m.length) TG[x.id] = m; });
  }
})(window.ONW);
