/**
 * cpu-talk.js — CPUの会話（人間・他CPUのチャットやCO・結果開示への返事）
 *
 * マイクラ版(minecraftver.mcpack の scripts/cpu.js)の「CPU議論発言(cpuDiscussionTalk)」の移植。
 *   ・人間のチャットへの返事 …… cpuReactToPlayerChat / _cpuPickResponderForChat / _cpuGuessChatTopic / _cpuRecordManualChat / _cpuLineForManualChat
 *   ・COへの反応・定期の議論発言・票の流れ …… 1of4-b で追加
 * 何をCOするか・誰に投票するか・どこで嘘をつくか、の「決める中身」は js/cpu.js のまま。ここは「話す」層で、決定を覆さない。
 * AIは使わない(決まった文)。CPU AI議論(β版)をONにしたときだけ、あとのステップで言い方をAIが自然にする。
 *
 * うちのルールとの関係(docs/cpu-talk.md):
 *   ・敵味方の判定は「自認」(cpu.js の selfRole)で行う。実際の役職(g.currentRoles / g.initialRoles)は見ない(怪盗などで入れ替わっても本人は知らない)。
 *   ・話に出す役職名は、自分がCOした役職(g.coBoard)と、みんなが知っている範囲のものだけ。
 *   ・口封じされたCPU・死亡したCPU・酔いが覚める前のCPUは話さない。人間がCO→結果開示の途中(g.holdUntil)は net.js の pump が待つ。
 *   ・デバッグの「CPU議論発言OFF」(g.dbg.cpuTalkOff)のときは net.js の enqueue が止める。
 */
window.ONW = window.ONW || {};
(function (ONW) {
  const T = {};
  const PH = () => ONW.PHASE;
  const pick = (a) => ONW.utils.randomChoice(a);
  const rn = (r) => ONW.roles.getInfo(r).name;
  const kit = () => ONW.cpu.kit;

  // ---- 調整用の定数（docs/cpu-talk.md） ----
  const CHANCE_DIRECT = 0.95;      // 名指しされたCPUが返事する確率（マイクラ版 0.95）
  const CHANCE_GENERAL = 0.35;     // 話題が general（特に話題なし）のとき（マイクラ版 0.35）
  const CHANCE_TOPIC = 0.72;       // それ以外の話題（マイクラ版 0.72）
  const MIN_GAP_MS = 10000;        // 同じCPUが続けて話す最短間隔（名指しは例外）
  const THINK_MIN = 1200, THINK_RANGE = 1800;   // 返事を考える時間(ms)
  const REPLY_GAP = 2200;          // 返事のあと次の発言までの間(ms)
  const MAX_REPLIES = 2;           // 1つの発言に対する返事の最大人数
  const CHAIN_DEPTH_MAX = 2;       // CPU→CPUの返事の連鎖の深さ

  // ---- 記憶（昼のはじめ toDay で作り直す） ----
  function st(g) {
    if (!g.cpuTalk) g.cpuTalk = { serial: 0, chats: [], suspect: {}, spoken: {}, last: {}, lastAny: 0, used: {}, coReacted: {}, nextAt: null, voteReadDone: false };
    return g.cpuTalk;
  }
  const hasSpoken = (g, id, key) => !!((st(g).spoken[id] || {})[key]);
  const markSpoken = (g, id, key) => { const s = st(g); (s.spoken[id] = s.spoken[id] || {})[key] = true; };
  T.addSuspect = (g, id, amount) => { const s = st(g); s.suspect[id] = (s.suspect[id] || 0) + amount; };
  T.readSuspect = (g, id) => (st(g).suspect[id] || 0);

  // ---- 道具 ----
  const isDead = (g, id) => (g.deadIds || []).includes(id);
  const nameOf = (g, id) => (g.players.find((p) => p.id === id) || {}).name || "?";
  const byId = (g, id) => g.players.find((p) => p.id === id);
  /** いま話してよいCPUか（死亡・口封じ・酔いが覚める前は話さない。マイクラ版 cpuCanSpeakNow） */
  function canSpeak(g, p) {
    if (!p || !p.isCpu) return false;
    if (isDead(g, p.id)) return false;
    if (ONW.muzzle && ONW.muzzle.isMuzzled(g, p.id)) return false;
    if (ONW.hiddenDrunk && ONW.hiddenDrunk(g, p.id)) return false;   // 酔っ払いは覚めるまで「酔っ払いCO」だけ
    return true;
  }
  T.canSpeak = canSpeak;
  /** CPU本人の立場（自認）。実際の役職は見ない。wolfSide: 人狼陣営として振る舞う（反転されたCPUは逆） */
  function stance(g, p) {
    const k = kit(), me = k.selfRole(g, p), flip = k.revFlip(g, p, me);
    return { me, wolfSide: k.isWolfSide(me) !== flip, nonVillage: k.isNonVillage(me) };
  }
  T.stance = stance;
  const coLabel = (co) => (!co ? null : String(co).startsWith("team:") ? ({ village: "村人陣営", wolf: "人狼陣営", third: "第三陣営" }[String(co).slice(5)] || "陣営") : rn(co));
  /** そのCPUがすでにCOボタンで名乗った役職（まだなら null）。言った内容と食い違わないように、自分の立場の説明はこれを使う */
  const myCo = (g, p) => { const e = g.coBoard && g.coBoard[p.id]; return e && e.co ? e.co : null; };
  T.myCo = myCo;

  /** 発言に出てくるプレイヤー名（長い名前を先に。名前の一部が重なるときの取りこぼし防止） */
  function mentionedIds(g, text) {
    let rest = String(text || ""), out = [];
    [...g.players].sort((a, b) => String(b.name).length - String(a.name).length).forEach((p) => {
      if (p.name && rest.includes(p.name)) { out.push(p.id); rest = rest.split(p.name).join("\u0000"); }
    });
    return out;
  }
  T.mentionedIds = mentionedIds;

  /** 話題の判定（マイクラ版 _cpuGuessChatTopic に、うちのルールの言葉を足したもの） */
  function guessTopic(text) {
    const c = String(text || "");
    if (/両吊り|同数|同票|平和村|墓地/.test(c)) return "rule";
    if (/占い|黒|白|結果|見た|見て|人狼です/.test(c)) return "seer";
    if (/CO|co|ＣＯ|シーオー|役職|名乗/.test(c)) return "co";
    if (/怪しい|怪し|人外|吊り|吊る|処刑/.test(c)) return "suspect";
    if (/投票|入れる|入れよう|票/.test(c)) return "vote";
    if (/どう思う|どう見る|意見|考え/.test(c)) return "ask";
    if (/信じ|真|本物|偽|嘘|騙り/.test(c)) return "truth";
    return "general";
  }

  /** 「確認しました」などの固い言い方を、自然な言い方にする（マイクラ版 _cpuNaturalizeVisibleSpeech） */
  function naturalize(text) {
    return String(text || "")
      .replace(/確認しています/g, "気にしています").replace(/確認しました/g, "覚えました")
      .replace(/確認します/g, "気にしておきます").replace(/確認したい/g, "聞いておきたい")
      .replace(/合わせて見たいです/g, "比べて考えたいです").replace(/合わせて見ます/g, "比べて考えます")
      .replace(/合わせて考えたいです/g, "一緒に考えたいです")
      .replace(/整理します/g, "一回まとめます").replace(/整理したいです/g, "一回まとめたいです")
      .replace(/判断します/g, "決めます").replace(/判断したいです/g, "決めたいです");
  }
  T.naturalize = naturalize;

  // =========================================================
  // 人間のチャットへの返事（マイクラ版 cpuReactToPlayerChat）
  // =========================================================
  /** 返事するCPUを選ぶ: 名指しされたCPU > まだこの発言に返事していないCPU > ランダム（マイクラ版 _cpuPickResponderForChat）。exclude: すでに返事した人など */
  function pickResponder(g, senderId, ids, exclude) {
    const now = Date.now(), s = st(g);
    const cpus = g.players.filter((p) => canSpeak(g, p) && p.id !== senderId && !(exclude || []).includes(p.id));
    if (!cpus.length) return null;
    const named = cpus.find((p) => ids.includes(p.id));
    if (named) return named;
    const rested = cpus.filter((p) => now - (s.last[p.id] || 0) >= MIN_GAP_MS);   // 直前に話したCPUは続けて話さない
    const pool = rested.length ? rested : [];
    if (!pool.length) return null;
    const ready = pool.filter((p) => !hasSpoken(g, p.id, "manual_chat_" + s.serial));
    return pick(ready.length ? ready : pool);
  }

  /** 返事の文（マイクラ版 _cpuLineForManualChat。うちのルールの言葉・自認の立場に合わせた） */
  function lineFor(g, p, senderId, text, info) {
    const clean = String(text || "");
    const senderName = nameOf(g, senderId);
    const ment = (info.mentioned || []).filter((id) => id !== p.id);
    const targetId = ment.find((id) => id !== senderId) || ment[0] || null;
    const tn = targetId ? nameOf(g, targetId) : null;
    const topic = info.topic;
    const hostile = stance(g, p).wolfSide;   // 自認が人外の側（反転された村人側も含む）。実際の役職は見ない
    const co = myCo(g, p), L = coLabel(co);
    const direct = clean.includes(p.name);

    // 自分の役職・COを聞かれた: すでに言ったCOをそのまま答える（新しい嘘を増やさない）
    if (direct && /役職|CO|co|ＣＯ|シーオー|何者|何の/.test(clean) && !(tn && targetId !== p.id)) {
      const hasRes = !!(g.coBoard[p.id] && g.coBoard[p.id].results && g.coBoard[p.id].results.length);
      if (L) return pick([`${senderName}、私は${L}COです。${hasRes ? "結果はCO履歴のとおりです。" : "出せる結果が出たら言います。"}`, `私は${L}COを出しています。${hasRes ? "結果も出したとおりです。" : ""}`, `${L}として出ています。聞きたいことがあれば言ってください。`]);
      return pick([`${senderName}、私はまだCOしていません。`, `今のところ私はCOなしです。必要になったら出します。`, `私はCOしていません。他のCOを見ています。`]);
    }
    // 自分が疑われた・怪しいと言われた
    if (direct && /怪し|人外|嘘|偽|吊/.test(clean) && !(tn && targetId !== p.id)) {
      return hostile
        ? pick([`${senderName}、怪しいと言うなら理由を出してください。流れだけで入れるのは危ないです。`, `私に入れる理由があるなら聞きます。COと結果の矛盾を見てください。`, `疑うのは自由ですが、同数だと両吊りです。票を割らないでください。`])
        : pick([`${senderName}、私は人狼ではないです。理由があるなら聞きます。`, `疑われるのは困ります。出ているCOと結果を見直してほしいです。`, `私に入れるより、COの食い違いを先に見たほうがいいです。`]);
    }
    // 名指しで意見を聞かれた
    if (direct && /どう|意見|投票|信じ/.test(clean)) {
      if (tn && targetId !== p.id) return pick([
        `${senderName} に聞かれたので答えます。${tn} はまだ決め打てませんが、投票候補には入ります。`,
        `${tn} については、COより発言の伸び方を見たいです。今は少し保留です。`,
        `${tn} は気になります。ただ、ここで急いで吊り先を固定するのは怖いです。`]);
      return pick([`${senderName}、今はCOの整合性を優先して見ています。`, `${senderName}、自分はまだ投票先を固定していません。結果開示をもう少し見たいです。`, `${senderName}、怪しい位置はありますが、便乗票にはしたくないです。`]);
    }
    // うちのルール（両吊り・平和村なし・墓地）
    if (topic === "rule") {
      if (/両吊り|同数|同票/.test(clean)) return pick([`同数だと両吊りなので、票は割らずにまとめたいです。`, `同票は両吊りですよね。割れるくらいなら、一人に寄せたほうがいいです。`]);
      if (/平和村/.test(clean)) return pick([`平和村なしなので、人狼判定がいないときは、誰を吊っても吊らなくても村の勝ちですよね。`, `人狼判定がいない可能性も頭に入れて見ます。`]);
      return pick([`墓地にも役職が入っているので、結果に墓地の役職が出たときは落ち着いて見たいです。`, `墓地の役職も含めて、COの数を数えたいです。`]);
    }
    if (topic === "seer") {
      if (tn) return hostile
        ? pick([`${senderName} のその見方は分かります。${tn} は占い結果込みで処理候補ですね。`, `${tn} の色は気になりますね。そこを軸に票が動きそうです。`, `${tn} 黒寄りで見るなら、今日はそこを外しにくいです。`])
        : pick([`${senderName}、${tn} の結果は確認しました。ただ占いCOの真偽もセットで見たいです。`, `${tn} の色だけで決めるより、誰がその結果を出したかを見たいです。`, `${tn} 周りは重要ですね。対抗結果があるなら出してほしいです。`]);
      return pick([`${senderName} の占い周りの話は見ています。結果の食い違いがあるか確認したいです。`, `占い結果は大事ですが、COタイミングも見たいです。`, `その結果、誰視点のものか整理したいです。`]);
    }
    if (topic === "co") {
      if (tn) return pick([`${tn} のCOは確認しています。結果開示まで聞いて判断したいです。`, `${tn} がCOするなら、対抗がいるか見たいですね。`, `${tn} のCOは一旦メモします。すぐ白置きはしません。`]);
      return pick([`${senderName}、COの話ですね。まだ出ていない人の反応も見たいです。`, `CO数が増えるなら、役職の内訳を整理したいです。`, `COだけでなく、結果開示まで合わせて見ます。`]);
    }
    if (topic === "suspect" || topic === "vote") {
      if (tn) return hostile
        ? pick([`${senderName} の言う ${tn} 候補は悪くないと思います。そこに票が集まる理由はあります。`, `${tn} は自分も気になっています。今日は候補に入れます。`, `${tn} に寄せる流れなら、自分もかなり見ます。`])
        : pick([`${senderName}、${tn} を見るのは分かります。ただ理由が薄いなら少し怖いです。`, `${tn} は候補ですが、便乗だけで決めるのは避けたいです。`, `${tn} に票が集まるなら、根拠をもう少し出してほしいです。`]);
      return pick([`${senderName} の投票意見は確認しました。自分はまだ少し考えます。`, `吊り先の話なら、COと結果の矛盾を優先したいです。`, `票を寄せるなら、理由を合わせたいです。`]);
    }
    if (topic === "ask" || topic === "truth") {
      if (tn) return pick([`${tn} はまだ完全には信じていません。発言とCO結果を合わせて見ます。`, `${tn} は白黒どちらもありそうです。投票直前の動きまで見たいです。`, `${tn} については保留です。対抗や追加結果があれば変わります。`]);
      return pick([`${senderName}、自分はまだ決め打ちません。今は情報待ちです。`, `その話なら、CO履歴を見直したほうがよさそうです。`, `自分視点では、まだ一人に絞るには少し早いです。`]);
    }
    if (L) return pick([`${senderName} の発言は見ています。自分の${L}視点でも違和感がないか確認します。`, `${senderName}、そこは大事ですね。自分視点でも投票前に整理します。`, `今の発言は覚えておきます。自分のCO視点と合わせて見ます。`]);
    return pick([`${senderName} の発言は確認しました。そこも含めて考えます。`, `${senderName}、その視点は分かります。投票前にもう一度整理したいです。`, `今の話はメモします。COと結果の流れに合わせて見ます。`]);
  }

  /** CPUの1発言をキューに積む（考える時間のあと。昼でなくなった・死んだ・口封じされたら捨てる） */
  function say(g, p, text, opts) {
    opts = opts || {};
    const s = st(g);
    const delay = opts.immediate ? 0 : THINK_MIN + Math.random() * THINK_RANGE;
    s.last[p.id] = Date.now(); s.lastAny = Date.now();   // 予約した時点で「話した」ことにして、同じCPUが続けて割り込まないようにする
    setTimeout(() => {
      if (g.cpuTalk !== s) return;                                   // 昼がやり直された（別の昼・別のゲーム）
      if (g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return;
      if (!canSpeak(g, p)) return;
      if (!ONW.net || !ONW.net.cpuEnqueue) return;
      const depth = opts.depth || 1;   // 1 = 人間・COへの返事。ここから先の「CPU→CPU」の連鎖は CHAIN_DEPTH_MAX まで
      const line = naturalize(text);
      ONW.net.cpuEnqueue([{ p, text: line, ai: true, gap: opts.gap || REPLY_GAP, after: () => { try { T.onCpuSaid(g, p, line, depth); } catch (e) { if (typeof console !== "undefined" && console.error) console.error("[cpuTalk] 連鎖で例外（続行します）:", e); } } }]);
    }, delay);
  }
  T.say = say;

  /**
   * 人間のチャットを受けたとき（net.js の d.t==="chat" から。ホストの端末でだけ）。
   * 返事するCPUを選び、確率で返事する。名指しなら95%。疑いスコアも積む（1of4-b で投票の点にも少し効く）。
   */
  T.onChat = function (g, senderId, text) {
    if (!g || g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return false;
    const sender = byId(g, senderId);
    const clean = String(text || "").trim();
    if (!sender || sender.isCpu || clean.length < 2) return false;
    const s = st(g);
    s.serial += 1;
    const ids = mentionedIds(g, clean), topic = guessTopic(clean);
    s.chats.push({ senderId, text: clean.slice(0, 120), mentioned: ids, topic, at: Date.now() });
    if (s.chats.length > 20) s.chats.shift();
    if (topic === "suspect" || topic === "vote") ids.forEach((id) => { if (id !== senderId) T.addSuspect(g, id, 0.8); });
    if (topic === "truth") ids.forEach((id) => { if (id !== senderId) T.addSuspect(g, id, 0.25); });
    const info = { mentioned: ids, topic };
    const done = [];
    let replied = 0;
    for (let n = 0; n < MAX_REPLIES; n++) {
      const responder = pickResponder(g, senderId, ids, done);
      if (!responder) break;
      done.push(responder.id);
      const direct = clean.includes(responder.name);
      if (n > 0 && direct === false && Math.random() > 0.35) continue;   // 2人目は名指しでなければ控えめに
      const chance = direct ? CHANCE_DIRECT : topic === "general" ? CHANCE_GENERAL : CHANCE_TOPIC;
      if (Math.random() > chance) continue;
      const key = "manual_chat_" + s.serial;
      if (hasSpoken(g, responder.id, key)) continue;
      markSpoken(g, responder.id, key);
      say(g, responder, lineFor(g, responder, senderId, clean, info), { gap: REPLY_GAP });
      replied += 1;
      if (!direct) break;   // 名指しでない発言への返事は1人まで（2人目は名指しが複数のときだけ）
    }
    return replied > 0;
  };


  // =========================================================
  // 1of4-b: COへの反応・結果開示への反応・CPU同士の連鎖・定期の議論発言・票の流れ
  // =========================================================
  const SEER_CO = ["seer", "mad_seer"];
  const MOVER_CO = ["robber", "relic_robber", "troublemaker", "doppelganger", "cosplayer", "thief", "exchanger"];   // 盤面を動かす役職（結果を聞いてから判断する）
  /** いま出ているCO（COボタンで名乗った役職）。exceptId と死亡者は除く */
  function knownCos(g, exceptId) {
    return g.players.filter((q) => q.id !== exceptId && !isDead(g, q.id) && g.coBoard && g.coBoard[q.id] && g.coBoard[q.id].co)
      .map((q) => ({ id: q.id, role: g.coBoard[q.id].co, results: g.coBoard[q.id].results || [] }));
  }
  const seerCoCount = (g) => knownCos(g, null).filter((x) => SEER_CO.includes(x.role)).length;

  /** COへの反応の文（マイクラ版 _cpuMaybeNaturalCoReaction。同じ役職を名乗っているCPUは「対抗」の言い方） */
  function coReactLine(g, p, sid, co) {
    const name = nameOf(g, sid), L = coLabel(co), mine = myCo(g, p);
    if (mine && mine === co && p.id !== sid) return pick([`${name}さんも${L}COですね。対抗です。結果の中身で見てもらえればと思います。`, `${L}は私と${name}さんで割れましたね。結果が出そろったら比べてください。`]);
    if (SEER_CO.includes(co)) {
      return seerCoCount(g) >= 2
        ? pick([`${name} の占いCOは対抗込みで見たいです。結果の出し方も大事ですね。`, `占いCOが複数あるなら、${name} だけをすぐ真とは置けません。`, `${name} の占いCOは確認しました。対抗との結果差を見ます。`])
        : pick([`${name} の占いCOは一旦軸にできますが、まだ確定では見ません。`, `${name} が占いCOですね。結果が自然かどうか見たいです。`, `${name} の占いCOは把握しました。後から対抗が出るかも見ます。`]);
    }
    if (MOVER_CO.includes(co)) return pick([`${name} の${L}COは、結果まで聞いてから判断したいです。`, `${name} は動きのある役職COですね。結果開示を待ちます。`, `${name} のCOは盤面を動かすので、矛盾がないか見たいです。`]);
    if (co === "drunk") return pick([`${name} は酔っ払いCOですね。議論の半分が過ぎて役職が決まるまで、そこは待ちます。`, `酔っ払いは覚めるまで役職が分からないはずなので、${name} の結果は後で聞きます。`]);
    if (String(co).startsWith("team:")) return pick([`${name} は${L}COですね。役職まで言えない事情があるのか、少し気になります。`, `${L}COだけだと判断しにくいです。${name} の動きを見ます。`]);
    return pick([`${name} の${L}COは確認しました。対抗がいるか見ます。`, `${name} は${L}COですね。そこを含めて整理します。`, `${name} のCOは覚えておきます。投票直前にもう一度見たいです。`]);
  }

  /** COボタンで役職COが出たとき（人間は net.js の co 受信、CPUは pump から）。1つのCO（誰が・何の役職）につき、反応するCPUは最大1人・1回だけ */
  T.onCo = function (g, speakerId) {
    if (!g || g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return false;
    const e = g.coBoard && g.coBoard[speakerId];
    if (!e || !e.co) return false;
    const s = st(g), key = "co_react_" + speakerId + "_" + e.co;
    if (s.coReacted[key]) return false;
    s.coReacted[key] = true;
    const chance = SEER_CO.includes(e.co) ? 0.8 : MOVER_CO.includes(e.co) ? 0.6 : (e.co === "drunk" || String(e.co).startsWith("team:")) ? 0.25 : 0.4;
    if (Math.random() > chance) return false;
    const r = pickResponder(g, speakerId, [], []);
    if (!r || hasSpoken(g, r.id, key)) return false;
    markSpoken(g, r.id, key);
    say(g, r, coReactLine(g, r, speakerId, e.co), { gap: REPLY_GAP });
    return true;
  };

  /** 結果開示で自分の名前が出たとき（「〇〇を占って…」「〇〇と交換して…」）。名指しされたCPUが、自分の立場（自認）で反応する */
  T.onResult = function (g, speakerId, claim) {
    if (!g || !claim || g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return false;
    if (!["seer", "robber", "doppel"].includes(claim.kind)) return false;
    const tp = claim.target && byId(g, claim.target);
    if (!tp || !canSpeak(g, tp) || tp.id === speakerId) return false;
    const s = st(g), key = "res_react_" + speakerId + "_" + claim.kind + "_" + tp.id;
    if (s.coReacted[key]) return false;
    s.coReacted[key] = true;
    if (Math.random() > 0.85) return false;
    const S = nameOf(g, speakerId), wolfSide = stance(g, tp).wolfSide;
    let line;
    if (claim.kind === "seer") {
      const wolfy = !!claim.role && kit().WOLF_LIKE().includes(claim.role);
      if (wolfy) line = wolfSide
        ? pick([`${S}さんは私を人外と言いますが、根拠が結果だけなら他のCOと比べたいです。`, `その結果だけでは吊れません。占いCOの真偽を見ましょう。`])
        : pick([`${S}さん、私の視点では人狼ではありません。この結果は信じにくいです。`, `人狼と言われましたが、私は人狼ではありません。対抗の結果も聞かせてください。`, `${S}さんの結果は納得できません。誰が本物か見てほしいです。`]);
      else line = wolfSide
        ? pick([`${S}さんの結果は受け取りました。真偽は他のCOを見てからです。`, `人狼ではないという結果ですね。ただ、${S}さんが本物かどうかも見ます。`])
        : pick([`${S}さん、結果ありがとうございます。ほかの占いCOとの整合も見ます。`, `人狼ではないと見てもらえて助かります。ただ、${S}さんが本物かどうかも見ます。`]);
    } else line = pick([`${S}さんの結果に私の名前が出ていますね。私の視点では何も起きていないので、結果の整合を見たいです。`, `私の名前が結果に出ていますが、私は何も知らされていません。他のCOと合わせて見ます。`]);
    markSpoken(g, tp.id, key);
    say(g, tp, line, { gap: REPLY_GAP });
    return true;
  };

  /** CPUの発言に、別のCPUの名前が出てきたら、そのCPUが返事することがある（連鎖は CHAIN_DEPTH_MAX まで。マイクラ版にはない、CPU同士の会話） */
  T.onCpuSaid = function (g, speaker, text, depth) {
    if (!g || g.phase !== PH().ONLINE_DAY || g.allDeadSkip || depth >= CHAIN_DEPTH_MAX) return false;
    const now = Date.now(), s = st(g);
    const cands = mentionedIds(g, text).filter((id) => id !== speaker.id).map((id) => byId(g, id)).filter((q) => q && q.isCpu && canSpeak(g, q) && now - (s.last[q.id] || 0) >= 6000);
    if (!cands.length || Math.random() > 0.4) return false;
    const r = cands[0], key = "chain_" + speaker.id + "_" + r.id + "_" + depth + "_" + Math.floor(now / 1000);
    if (hasSpoken(g, r.id, key)) return false;
    markSpoken(g, r.id, key);
    const others = mentionedIds(g, text).filter((id) => id !== r.id);
    say(g, r, lineFor(g, r, speaker.id, text, { mentioned: others, topic: guessTopic(text) }), { gap: REPLY_GAP, depth: depth + 1 });
    return true;
  };

  // ---- 定期の議論発言（マイクラ版 cpuTalk の拡張: _cpuMaybeAskForResult / TalkToHuman / CounterFlow / AnswerAsPosition） ----
  /** そのCPUが、いま誰に投票しようと思っているか（予告済みならその相手。まだなら js/cpu.js の leanTarget）。CPUが決める中身はここでは変えない */
  function leanTarget(g, p) {
    const said = g.cpuVotePlan && g.cpuVotePlan[p.id];
    if (said && !isDead(g, said)) return said;
    return ONW.cpu.leanTarget ? ONW.cpu.leanTarget(g, p) : null;
  }
  function askForResult(g, p) {
    const es = knownCos(g, p.id).filter((e) => !hasSpoken(g, p.id, "ask_" + e.id));
    if (!es.length || Math.random() > 0.45) return false;
    const e = pick(es), n = nameOf(g, e.id), L = coLabel(e.role);
    markSpoken(g, p.id, "ask_" + e.id);
    say(g, p, e.results.length
      ? pick([`${n}さん視点で一番怪しい人を教えてください。`, `${L}COですね。結果と投票希望を合わせて見たいです。`, `${n}さんは投票先まで出せますか？ 結果だけだとまだ判断しづらいです。`])
      : pick([`${n}さん、その${L}COなら結果をもう少し聞きたいです。`, `${n}さんは結果を出せますか？ COだけだとまだ判断しづらいです。`, `${L}COですね。結果が出るのを待ちます。`]));
    return true;
  }
  function talkToHuman(g, p) {
    if (hasSpoken(g, p.id, "talk_human") || Math.random() > 0.36) return false;
    const hs = g.players.filter((q) => !q.isCpu && !isDead(g, q.id));
    if (!hs.length) return false;
    const h = pick(hs);
    markSpoken(g, p.id, "talk_human");
    say(g, p, pick([`${h.name}さん、今のところ誰を疑っていますか？`, `${h.name}さん視点で、信用できるCOはありますか？`, `${h.name}さんの投票先を先に聞きたいです。`, `${h.name}さん、結果を持っているなら今出すと助かります。`]));
    return true;
  }
  function counterFlow(g, p) {
    if (hasSpoken(g, p.id, "counter_flow") || Math.random() > 0.42) return false;
    const tid = leanTarget(g, p);
    if (!tid) return false;
    const tn = nameOf(g, tid), reports = (g.cpuClaims || []).filter((c) => c.kind === "seer" && c.target === tid);
    markSpoken(g, p.id, "counter_flow");
    say(g, p, reports.length
      ? pick([`${tn}さんは占い結果に触れられているので、そこを軸に見たいです。`, `${tn}さん周りの占い結果、投票前にもう一度整理しましょう。`, `${tn}さんへ入れるなら、占い結果との矛盾が理由になります。`])
      : pick([`${tn}さんに入れるなら、発言の薄さが理由です。`, `${tn}さんはCOか結果があれば今出してほしいです。`, `${tn}さんを疑っていますが、反論があれば聞きます。`, `同数だと両吊りなので、票をばらけさせるより、${tn}さんを中心に考えたいです。`]));
    return true;
  }
  function answerAsPosition(g, p) {
    const L = coLabel(myCo(g, p));
    if (hasSpoken(g, p.id, "position") || Math.random() > 0.5) return false;
    const tid = leanTarget(g, p);
    const tn = tid ? nameOf(g, tid) : null;
    markSpoken(g, p.id, "position");
    if (!L) say(g, p, pick([`自分はまだCOなしの立場です。他のCOと結果の流れを見て決めます。`, `今のところ自分はCOなしです。怪しい位置はCO後の反応で見たいです。`]));
    else say(g, p, tn
      ? pick([`自分は${L}目線で見ています。今は${tn}さんを少し疑っています。`, `${L}としては、今の情報なら${tn}さんを確認したいです。`, `私の立場だと、${tn}さんの発言が一番投票理由にしやすいです。`])
      : pick([`今のところ自分は${L}として発言しています。結果の矛盾を重視します。`, `自分の立場は${L}です。怪しい位置はCO後の反応で見たいです。`]));
    return true;
  }
  function talkOnce(g) {
    const now = Date.now(), s = st(g);
    const speakers = g.players.filter((q) => canSpeak(g, q) && now - (s.last[q.id] || 0) >= MIN_GAP_MS);
    if (!speakers.length) return false;
    const p = pick(speakers);
    return askForResult(g, p) || talkToHuman(g, p) || counterFlow(g, p) || answerAsPosition(g, p);
  }
  /** 票が寄りそうな人への反応（マイクラ版 _cpuMaybeNaturalVoteRead）。投票予告(g.cpuVotePlan)が出そろったあとに1回だけ。予告は全員に見える情報だけを使う */
  function voteRead(g) {
    const counts = {};
    Object.values(g.cpuVotePlan || {}).forEach((id) => { if (id && !isDead(g, id)) counts[id] = (counts[id] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 2) return false;
    const now = Date.now(), s = st(g);
    const sp = g.players.filter((q) => canSpeak(g, q) && q.id !== top[0] && now - (s.last[q.id] || 0) >= 4000);
    if (!sp.length) return false;
    const p = pick(sp), tn = nameOf(g, top[0]);
    say(g, p, stance(g, p).wolfSide
      ? pick([`${tn} に票が寄りそうですね。この流れは見ています。`, `${tn} が候補に上がるなら、そこに合わせる理由はあります。`])
      : pick([`${tn} に票が集まりそうですが、流されすぎないように見ます。同数だと両吊りです。`, `${tn} が候補ですね。理由が薄い票なら少し警戒します。`]));
    return true;
  }
  /** 昼のタイマーの毎秒から（net.js の dayTick）。数秒おきに、誰か1人が議論に加わる。投票予告の時間帯(残り20秒以下)は止める */
  T.tick = function (g, remain) {
    if (!g || g.phase !== PH().ONLINE_DAY || g.allDeadSkip) return;
    const s = st(g), elapsed = (g.timers && g.timers.day ? g.timers.day : 120) - remain;
    if (remain <= 18 && remain >= 6 && !s.voteReadDone) { s.voteReadDone = true; voteRead(g); return; }
    if (remain <= 20 || elapsed < 12) return;
    if ((g.cpuQueue && g.cpuQueue.length) || Date.now() < (g.holdUntil || 0)) return;   // 順番待ちの発言がある間・人間がCO→結果開示の途中は割り込まない
    if (Date.now() - s.lastAny < 7000) return;
    if (s.nextAt == null) s.nextAt = elapsed + 6 + Math.floor(Math.random() * 6);
    if (elapsed < s.nextAt) return;
    s.nextAt = elapsed + 9 + Math.floor(Math.random() * 7);
    talkOnce(g);
  };

  /** 会話で積まれた疑いスコアを、投票の点に少しだけ足す（上限つき。js/cpu.js の scoreVote から。仲間(-100)・村人側と分かっている人(-100)は覆らない） */
  T.suspectBonus = function (g, p, q) { return Math.min(1.5, T.readSuspect(g, q.id) * 0.6); };

  T._lineFor = lineFor; T._guessTopic = guessTopic;   // 確認用（_wip の check スクリプトが使う）
  ONW.cpuTalk = T;
})(window.ONW);
