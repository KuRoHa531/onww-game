"use strict";
/* ホタル（第三陣営・発案: 狐餅・元ネタ: 崩壊スターレイル。マイクラ版 state.js / night.js / game.js / extraRoles.js / vote.js / main.js / cpu.js 準拠）
 * 変身後の形態「サム」（人狼陣営）も同じ発案・元ネタで、このファイルで定義する（内部専用。娘ちゃん・なのかの形態と同じ扱い）。
 *
 * ・夜に「サムへ変身するか」を選ぶ。選択はコスプレイヤー／なのかと同じ2枚のカード（ホタル／サム）で、
 *   サムのカードを押せば変身、ホタルのカードを押す・何も押さない場合は変身しない（作者メモ・マイクラ版 openHotaruAction）。
 * ・変身すると最終役職がサムになり、人狼陣営として勝利する（サムは本物の人狼扱い: 人狼判定・狂人の昇格阻止・
 *   乞食の取れない対象に含まれる。マイクラ版 isRealWolfRole に SAM が入る）。
 * ・変身しなかったホタルは「村人の気配」として扱われ、村人陣営が勝てば素の勝者になる
 *   （マイクラ版 isVillageWinnerRole(HOTARU) = true / resultHasActualVillageWinner でも村人陣営の勝者に数える）。
 *   感覚の占い師の気配も「村人の気配」（sense_seer.js の classify に接続）。カードの面も村人陣営色（緑）で出す
 *   （マイクラ版 teamColorOf(HOTARU) = §a。作者メモの「銀色の影から変化したときは緑のホタル」は、この緑扱い全般として実装。
 *   銀色の影経由でも通常のホタルと同じ扱いになる）。
 * ・ホタルのままの場合、待機時間に開拓者を知る: 実効役職が開拓者の人（酔っ払い中・ハッキングされている開拓者は除く）の
 *   カードが、本人の画面でだけめくれる（作者メモ。マイクラ版の昼通知「開拓者はXです。」の文も情報確認に残す。
 *   運命（模倣先）は分からない＝カードは開拓者の素の面で出す）。開拓者がいなければ「開拓者はいません。」と届く。
 * ・盤面にサムがいると、本物の銀狼（実効役職が銀狼・酔っ払い中／封印／ハッキングを除く）に待機時間に
 *   「この中にサムがいるようです。」と通知される（マイクラ版 announceHotaruAndSamNotificationsAtDayStart）。
 *   作者決定（2026-11-26）: 文の通知に加えて、サム（に変身した人全員）のカードが銀狼本人の画面でだけ
 *   サムの面でめくれる（数秒後に裏に戻る。settleMsg の hotaruSam → サム役職の stageSettle "settleHotaruSam"。
 *   酔い覚めで遅れて届く経路でも hotarunews の sam で同じくめくれる）。MC準拠（文だけ）より作者決定が優先。
 * ・封印されている場合は変身できず、開拓者も知ることができない（マイクラ版 ROLE_INFO どおり。Web版は共通の
 *   failIfSealed が夜・朝の連鎖とも先に失敗させる）。鍵師に自分の役職をロックされている場合も変身に失敗する
 *   （マイクラ版 isRoleLocked → hotaruChoice = "hotaru" ＋失敗文。YAMINABE_KEYMASTER_TARGET_ROLES に HOTARU が入る）。
 *
 * 変化候補: ホタルは銀色の影のみ（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に HOTARU が入る）。
 *   光の使徒・闇の化身・コスプレには入らない。模倣は Web の共通流儀で第三陣営は対象外。ペルソナ・模倣者（コピリスト）の
 *   対象外リストにも入っているが、どちらも Web版未実装なので配線なし。
 *   シャッフラー: ホタルは山札に入る（マイクラ版 shufflerEligibleRoles の除外に HOTARU は無い）。サムは入らない
 *   （同リストの除外に SAM。shuffler.js の BLOCKED に追加）。
 * ハッキング: 本物のホタルは対象外（マイクラ版のハッキング候補から、初期役職・最終役職のどちらかが
 *   ヴァニティ／ホタルの人は除外される。Web版は silver_wolf.js の NO_HACK に登録済み）。
 *   逆にホタルと思い込むことはある: 偽の2枚（ホタル／サム）から選べて、偽の結果文
 *   「サムに変身しました。」／「変身しませんでした。」＋本物と同じ朝の演出が出る（silver_wolf.js の fakeResult / baseView）。
 *   本物のホタルがハッキングされることは無いので、裏で自動行動（autoReal）は発生しない。
 * 乞食: ホタルは取れる。サムは本物の人狼扱い（WOLF_KIND）なので取れない（マイクラ版の明示リストには両方とも
 *   入っていないが、SAM は isRealWolfRole で取れない。Web版 beggar.js の excludedTarget が WOLF_KIND で弾く）。
 * 状態:
 *   g.hotaruChoice[人]   = その人が夜（・朝の連鎖）でした変身の選択 "sam" | "hotaru" | "hotaru_failed"
 *     （人キー。マイクラ版でも hotaruChoice は役職の移動で移転しない＝変身の成否は最終役職そのものが持つため、
 *      ROLE_BOUND_KEYS には入れない。乞食の取り込みでも移らない）
 *   g.hotaruTbTold[人]   = 開拓者の通知を届けたホタル
 *   g.hotaruSamTold[人]  = サムの存在を通知した銀狼
 * CPU: 夜は五分五分で変身する（マイクラ版 cpu.js。デバッグ指定 f.hotaruChoice があればそれに従う）。
 *   発言（マイクラ版 cpu.js）: ホタルのままのCPUは必ずホタルCOし、開拓者を正直に結果開示する
 *   （結果開示なので AI議論OFF でも出る）。サムになったCPUは五分五分でホタルCO（開拓者は嘘の開示）、
 *   外れたら通常の騙り（村人騙り）。
 * 実績（Wiki）: first_hotaru「ロスト・エントロピー症候群」/ win_hotaru「ホタルよ、生きるために死ぬのだと」/
 *   first_sam「焦土作戦実行」/ win_sam「あなたたちの旅を終わらせたのは、星核ハンターだと」
 *   （Web版に実績の保存は無いので ID の返却のみ）。
 * 闇鍋シナジー: ホタルが出る闇鍋には開拓者と銀狼も最低1枚ずつ出す（マイクラ版 YAMINABE_TRANSFORM_SYNERGY_RULES。
 *   roles.js の SYNERGY_RULES に追加）。
 */
(function (ONW) {
  const ID = "hotaru", SAM = "sam";
  const CARDS = [ID, SAM];   // 夜にめくれる2枚の提示順（0 = ホタル（変身しない） / 1 = サム（変身する）。マイクラ版のボタンの順）
  const nm = (g, id) => ((g.players || []).find((p) => p.id === id) || {}).name || "?";
  const rn = (r) => (ONW.roles.getInfo(r) || {}).name || "?";
  const esc2 = (s) => ONW.utils.esc(s);
  const eff = (g, id) => ONW.mimic.actRole(g, id, g.currentRoles[id]);
  const holders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === ID).map((p) => p.id);
  const samHolders = (g) => (g.players || []).filter((p) => (g.currentRoles || {})[p.id] === SAM).map((p) => p.id);
  const choiceOf = (g, id) => (g.hotaruChoice || {})[id] || null;
  const setChoice = (g, id, ch) => { (g.hotaruChoice = g.hotaruChoice || {})[id] = ch; };
  /** サムへの変身を適用する: カードの上にサムを置く（ONW.cosplayPlace が記録の掃除・履歴・従者などの追随を見る） */
  function applySam(g, id) { ONW.cosplayPlace(g, id, SAM); setChoice(g, id, "sam"); if (ONW.magician) ONW.magician.trySteal(g, id, SAM, "sam", "auto"); }   // 魔法使い: サムへの変身も「自分の役職を変えた」ので奪われる（奪われた人は村人になる。変身したという結果文・演出はそのまま。docs/magician.md）
  /** 勝敗の物差し: ホタルは村人陣営・サムは人狼陣営。それ以外は魔法少女の物差し（無ければ静的な陣営）へ委ねる
   *  （vote.js の各陣営勝者フィルタと、ヴァニティ／エルフリンデの「実際の村人陣営の勝者がいるか」が引く） */
  function teamOf(g, id) {
    const r = eff(g, id);
    if (r === SAM) return ONW.TEAM.WOLF;
    if (r === ID) return ONW.TEAM.VILLAGE;
    if (ONW.magicalGirl && ONW.magicalGirl.teamOf) return ONW.magicalGirl.teamOf(g, id);
    return ((ONW.ROLE_INFO || {})[(g.currentRoles || {})[id]] || {}).team;
  }
  /** 開拓者としてホタルに知らせる人（マイクラ版の通知の対象決め: 実効役職が開拓者で、酔っ払い中・ハッキングされている人を除く） */
  function trailblazers(g) {
    return (g.players || []).filter((p) => eff(g, p.id) === "trailblazer" && !ONW.hiddenDrunk(g, p.id) && !(g.hackRole || {})[p.id]).map((p) => p.id);
  }
  /** サムとして銀狼に知らせる人（マイクラ版の通知の対象決め: 実効役職がサムで、酔っ払い中・ハッキングされている人を除く） */
  function samTargets(g) {
    return (g.players || []).filter((p) => eff(g, p.id) === SAM && !ONW.hiddenDrunk(g, p.id) && !(g.hackRole || {})[p.id]).map((p) => p.id);
  }
  /** サムがいるかどうか */
  function samExists(g) { return samTargets(g).length > 0; }
  /** 開拓者の通知文（マイクラ版 game.js の昼通知どおり） */
  const tbText = (g) => { const tb = trailblazers(g); return tb.length ? `開拓者は${tb.map((x) => nm(g, x)).join("、")}です。` : "開拓者はいません。"; };

  const H = (ONW.hotaru = {
    ID, SAM, CARDS, holders, samHolders, choiceOf, teamOf, trailblazers, samTargets, samExists,
    /** 実績（最終盤面でホタル／サムを持っている人。サムの実績はホタルから変身した人だけ） */
    achievements(g, id, won) {
      const r = (g.currentRoles || {})[id];
      if (r === ID) { const out = ["first_hotaru"]; if (won) out.push("win_hotaru"); return out; }
      if (r === SAM && choiceOf(g, id) === "sam") { const out = ["first_sam"]; if (won) out.push("win_sam"); return out; }
      return [];
    },
  });

  // ---------------------------------------------------------
  // CPUの夜の変身選択（五分五分。デバッグ指定 f.hotaruChoice = "sam" | "hotaru" があればそれ。封印は共通処理が先に失敗させる）
  // ---------------------------------------------------------
  function cpuRun(n, p, label, cur, rid) {
    const g = n.g;
    if ((g.currentRoles || {})[p.id] !== ID) return;   // 変身済み（サム）・別役職のときは何もしない
    if (ONW.keymaster && ONW.keymaster.gate(g, p.id, [])) { setChoice(g, p.id, "hotaru"); n.hold(p.id, "自分の役職がロックされていたため、サムに変身できませんでした。"); return; }   // 鍵師のロック: 変身に失敗（マイクラ版 isRoleLocked）
    const f = n.forced(p) || {};
    const sam = f.hotaruChoice === "sam" ? true : f.hotaruChoice === "hotaru" ? false : Math.random() < 0.5;
    if (sam) {
      applySam(g, p.id);
      g.nightLogsAll.push(`${label} ${p.name} は サムに変身しました。`);
      n.hold(p.id, "あなたはサムに変身しました。");
      n.nn(rid);
    } else {
      setChoice(g, p.id, "hotaru");
      g.nightLogsAll.push(`${label} ${p.name} は 変身しませんでした。`);
      n.hold(p.id, "あなたはホタルのまま夜を明かしました。");
    }
  }
  /** 墓荒らし・ドッペル・酔い覚めでホタルを手にしたCPUの、続けて言う結果（結果開示なので AI議論OFF でも出る） */
  function cpuChainResult(k, g, p, i) {
    const ch = choiceOf(g, p.id);
    if (ch === "sam") return { text: "サムに変身しました。" };
    if (ch === "hotaru") return { text: "変身しませんでした。" };
    return null;
  }

  // ---------------------------------------------------------
  // ホタル本体
  // ---------------------------------------------------------
  ONW.defineRole(ID, {
    info: { observe: "player", sealTarget: true, deck: 135, name: "ホタル", team: ONW.TEAM.THIRD, wakeOrder: 54.8, sort: 54,
      desc: "第三陣営。夜に、テーブルにめくれた「ホタル」「サム」の2枚から1枚選んで、サムに変身するかどうかを決めます（選ばなければ変身しません）。サムに変身すると人狼陣営として勝利します。変身しなければホタルのまま村人の気配として扱われ、盤面に開拓者がいれば待機時間に誰が開拓者か分かります（カードがめくれますが、運命までは分かりません）。封印されている場合はサムに変身できず、開拓者を知ることもできません。" },
    groups: { "transform:silver_shadow": 30 },   // 銀色の影の変化先（マイクラ版 TRANSFORM_ROLE_GROUPS の SILVER_SHADOW に HOTARU が入る）。光の使徒・闇の化身には入らない
    uiNight: {
      action(X) {
        const { later } = X, g = ONW.game, n = (g.nightSel && Number.isInteger(g.nightSel.pick)) ? g.nightSel.pick : null;
        const now = n === null ? "まだ選んでいません（選ばなければ変身しません）" : n === 1 ? "サムに変身する" : "変身しない";
        return `<p class="night-step__hint">上のテーブルに、<strong>「ホタル」と「サム」の2枚</strong>がめくれています。変身したい場合は<strong>サムのカード</strong>を、変身しない場合は<strong>ホタルのカード</strong>を押してください。${later}<br>朝になると、選ばなかったカードは山札に戻り、サムを選んでいた場合は自分のカードがサムになって表になります。ホタルのままでいると、待機時間に開拓者のカードがめくれて分かります。</p><p class="night-step__hint">選択中: <strong>${esc2(now)}</strong></p>`;
      },
      chainReady: () => true,   // 選ばない（＝変身しない）も正しい答えなので、未選択でも進める
      chainHow: () => "<strong>サムに変身するかどうか</strong>（テーブルの「ホタル」「サム」の2枚のどちらかを押して。押さなければ変身しません）",
    },
    stagePick: { players: false, cosplay: true },   // カードを押して行動する: めくれた2枚だけ（なのか・コスプレイヤーと同じ仕組み）
    nightMsg: () => ({ cosplay: { cards: CARDS.slice() } }),   // 2枚は固定
    nightMsgAct: () => ({ cosplay: { cards: CARDS.slice() } }),
    /** 朝の連鎖（墓荒らし・ドッペル・酔い覚め）で本人に送る2枚 */
    chainDraw: () => CARDS.slice(),
    // 朝の演出（stage.js の playMorning が reveal.kind === "hotaru" のときに呼ぶ。変身した本人の画面だけ）:
    // めくれた2枚 → 選ばなかった方が裏返って山札へ戻る → サムを選んでいたら、そのカードが自分の席へ飛び、自分のカードがサム（赤文字）で表になる
    stageMorning: {
      kind: "hotaru", dur: () => 2900,
      play(r, SK) {
        const { later } = SK, C = SK.cosplay, el = SK.$t(), mine = `p:${ONW.net.myId()}`;
        C.keep(true); C.ensure(r.cards, true); SK.paint(SK.G());
        const pile = el.querySelector(".tb-pile.tb-card");
        const fly = (i, to, ms, shrink) => {
          const card = el.querySelector(`[data-k="c:${i}"].tb-card`);
          if (!card || !to || !card.animate) return;
          const a = card.getBoundingClientRect(), b = to.getBoundingClientRect(), dx = b.left - a.left, dy = b.top - a.top;
          card.style.zIndex = 60;
          card.animate([{ transform: "translate(0,0) scale(1)" }, { transform: `translate(${dx / 2}px,${dy / 2 - 26}px) scale(1.15)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(${shrink ? 0.85 : 1})`, opacity: shrink ? 0.2 : 1 }], { duration: ms, easing: "ease-in-out", fill: "forwards" });
        };
        const g0 = SK.G();
        r.cards.forEach((_, i) => {
          if (i === r.pick) return;
          later(() => { delete SK.up[`c:${i}`]; SK.paint(SK.G()); }, 400);   // 選ばなかったカードが裏返る
          later(() => fly(i, pile, 800, true), 1200);   // 山札へ戻る
        });
        if (r.pick === 1 && r.role) {
          const dst = el.querySelector(`[data-k="${mine}"].tb-card`);
          later(() => fly(r.pick, dst, 900, false), 1200);   // サムのカードが自分の席へ飛ぶ
          later(() => { if (ONW.sound) ONW.sound.se("deal"); SK.show(mine, r.role); }, 2100);   // 自分のカードがサムで表になる（着地の瞬間。SE: deal）
        }
        later(() => { C.keep(false); C.clear(); g0.cosAnim = "done"; SK.paint(SK.G()); }, 2500);
      },
    },
    night: {
      kind: "gremlin", order: 25,   // グレムリン(10)のあと・マティアス(20)のあと・なのか(30)の前
      complete: () => true,   // 何も選んでいない場合は「変身しない」を選んだ判定（作者メモ）
      normalize: (c, players, graves, sel) => ({ players: [], graves: [], pick: sel && Number.isInteger(sel.pick) && sel.pick >= 0 && sel.pick < CARDS.length ? sel.pick : null }),
      resolve(c, p) {
        const g = c.g, sel = c.selOf(p), label = `${c.rn(ID)} ${p.name}`;
        if ((g.currentRoles || {})[p.id] !== ID) { setChoice(g, p.id, "hotaru_failed"); return; }   // 夜の途中で役職が変わっていたら変身できない（マイクラ版 hotaru_failed）
        if (ONW.keymaster && ONW.keymaster.gate(g, p.id, [])) {   // 鍵師のロック: 自分の席がロック中なら変身に失敗（2枚とも山札に戻る）
          setChoice(g, p.id, "hotaru");
          c.hold(p.id, ONW.keymaster.fail(g, p.id, "self", "変身", [], label));
          c.rev[p.id] = { kind: "hotaru", cards: CARDS.slice(), pick: null, role: null };
          return;
        }
        if (sel.pick === 1) {
          applySam(g, p.id);
          g.nightLogsAll.push(`${label} は サムに変身しました。`);
          ONW.newsNote(g, ID);
          c.hold(p.id, "あなたはサムに変身しました。");
          c.rev[p.id] = { kind: "hotaru", cards: CARDS.slice(), pick: 1, role: SAM };
          return;
        }
        setChoice(g, p.id, "hotaru");
        g.nightLogsAll.push(`${label} は 変身しませんでした。`);
        c.hold(p.id, "あなたはホタルのまま夜を明かしました。");
        c.rev[p.id] = { kind: "hotaru", cards: CARDS.slice(), pick: Number.isInteger(sel.pick) ? sel.pick : null, role: null };
      },
    },
    /** 朝の連鎖・酔い覚め（墓荒らし/ドッペル経由・酔いが覚めた人）: めくれた2枚から選んで、その場で変身するかどうか決める */
    morning: {
      run(c) {
        const g = c.g, sel = c.sel || {};
        if ((g.currentRoles || {})[c.id] !== ID) { setChoice(g, c.id, "hotaru_failed"); return { lines: ["変身できませんでした。"], reveal: { kind: "hotaru", cards: CARDS.slice(), pick: null, role: null }, failed: true }; }
        if (ONW.keymaster && ONW.keymaster.gate(g, c.id, [])) { setChoice(g, c.id, "hotaru"); return { lines: [ONW.keymaster.fail(g, c.id, "self", "変身", [], c.label)], reveal: { kind: "hotaru", cards: CARDS.slice(), pick: null, role: null }, failed: true }; }   // 封印の失敗は net.js の mchain が先に返す
        if (sel.pick === 1) { applySam(g, c.id); return { lines: ["あなたはサムに変身しました。"], reveal: { kind: "hotaru", cards: CARDS.slice(), pick: 1, role: SAM } }; }
        setChoice(g, c.id, "hotaru");
        return { lines: ["あなたはホタルのまま夜を明かしました。"], reveal: { kind: "hotaru", cards: CARDS.slice(), pick: Number.isInteger(sel.pick) ? sel.pick : null, role: null } };
      },
    },
    cpuNight: { order: 92, stage: "gremlin", chain: true, run: cpuRun },   // グレムリン(80)・マティアス(90)のあと・なのか(95)の前
    cpuChainResult,
    /** 待機時間の知らせ: ホタルのままの人には開拓者を（カードのめくり＋文）、本物の銀狼にはサムの存在を（文＋サムのカードのめくり。作者決定 2026-11-26） */
    settleMsg(c, p) {
      const g = c.g, out = { logs: [] };
      const role = eff(g, p.id);
      if (role === ID) {
        if (ONW.hiddenDrunk(g, p.id)) return out;   // 酔っ払い中は出さない（酔い覚めの soberReveal で届く）
        if ((g.hackRole || {})[p.id]) return out;   // ハッキングされているホタルには出さない（本物のホタルは対象外なので通常は起きない）
        if (ONW.seal && ONW.seal.is(g, p.id)) return out;   // 封印されていると開拓者を知ることもできない
        out.hotaruTb = trailblazers(g);
        if (!(g.hotaruTbTold || {})[p.id]) {
          (g.hotaruTbTold = g.hotaruTbTold || {})[p.id] = true;
          out.logs.push(tbText(g));
        }
        return out;
      }
      if (role === "silver_wolf") {
        if (ONW.hiddenDrunk(g, p.id) || (g.hackRole || {})[p.id]) return out;
        if (ONW.seal && ONW.seal.is(g, p.id)) return out;
        const sams = samTargets(g);
        if (!sams.length) return out;
        out.hotaruSam = sams;   // 銀狼本人の画面でだけサムのカードがサムの面でめくれる（サム役職の stageSettle "settleHotaruSam"。作者決定 2026-11-26）。文と違い、再入室の再送でも開拓者のめくりと同じく届く（クライアント側は quiet / shown で再演を抑える）
        if (!(g.hotaruSamTold || {})[p.id]) {
          (g.hotaruSamTold = g.hotaruSamTold || {})[p.id] = true;
          out.logs.push("この中にサムがいるようです。");
        }
        return out;
      }
      return out;
    },
    /** 待機時間の演出: 開拓者のカードが、ホタル本人の画面でだけ開拓者の面でめくれる（運命までは分からない） */
    stageSettle: {
      field: "settleHotaruTb", shown: "settleHotaruTbShown",
      run: { order: 26, run(ids, SK) { SK.later(() => { ids.forEach((id) => SK.show(`p:${id}`, "trailblazer")); }, 300); } },
      end(SK) { const g = SK.G(); (g.settleHotaruTb || []).forEach((id) => { const k = `p:${id}`; if (SK.up[k] === "trailblazer") delete SK.up[k]; }); },
    },
    /** 酔いが覚めたホタル／銀狼へ: 保留していた通知を届ける（本人だけ。ホタルには開拓者のカードのめくり付き、銀狼にはサムのカードのめくり付き） */
    soberReveal: { order: 54, run(c, ids) {
      const g = c.g;
      ids.forEach((id) => {
        const role = eff(g, id);
        if (role === ID) {
          if ((g.hotaruTbTold || {})[id] || (g.hackRole || {})[id] || (ONW.seal && ONW.seal.is(g, id))) return;
          (g.hotaruTbTold = g.hotaruTbTold || {})[id] = true;
          c.send(id, { t: "hotarunews", text: tbText(g), tb: trailblazers(g) });
        } else if (role === "silver_wolf") {
          if ((g.hotaruSamTold || {})[id] || (g.hackRole || {})[id] || (ONW.seal && ONW.seal.is(g, id)) || !samExists(g)) return;
          (g.hotaruSamTold = g.hotaruSamTold || {})[id] = true;
          c.send(id, { t: "hotarunews", text: "この中にサムがいるようです。", sam: samTargets(g) });   // sam: 銀狼本人の画面でサムのカードがめくれる（net.js の hotarunews が stageFlash "hotaruFlash" に role "sam" で積む。作者決定 2026-11-26）
        }
      });
    } },
    /** 酔い覚めで届いた開拓者／サム通知の演出（stage.js の flashes が g.hotaruFlash を渡す。本人だけに届く "hotarunews" で積まれる）:
     *  開拓者のカードが開拓者の面で、サムのカードがサムの面でめくれ、数秒後に裏に戻る */
    stageFlash: {
      field: "hotaruFlash", when: "late",
      run(list, SK) {
        list.forEach((x, i) => SK.later(() => { const k = `p:${x.id}`; SK.up[k] = x.role; SK.glow[k] = true; SK.paint(SK.G()); }, 200 + i * 380));
        SK.later(() => { list.forEach((x) => { const k = `p:${x.id}`; if (!SK.held[k]) delete SK.up[k]; delete SK.glow[k]; }); SK.paint(SK.G()); }, 200 + list.length * 380 + 3200);
      },
    },
    // 結果開示(COボタン)の流れ: 開拓者だった相手を選ぶ →「開拓者はXでした。」（マイクラ版のホタルCOと同じ）
    coResult: {
      kind: "hotaru", targetLabel: "開拓者",
      pickPlayer: (id, K) => [`開拓者は${K.nameOf(id)}でした。`, { kind: "hotaru", target: id }, null, "disclose", `開拓者は${K.nameOf(id)}`],
    },
    /** CPUの発言（マイクラ版 cpu.js）: ホタルのままのCPUは必ずホタルCOし、開拓者を正直に開示する（結果開示なので AI議論OFF でも出る） */
    cpuClaim(k, g, p, r, i, c) {
      const tb = (g.players || []).filter((q) => (g.currentRoles || {})[q.id] === "trailblazer").map((q) => q.id);
      c.co = ID;
      c.result = {
        text: tb.length ? `変身せずに夜を明かしました。開拓者は${tb.map((x) => nm(g, x)).join("、")}でした` : "変身せずに夜を明かしました。開拓者はいませんでした",
        short: "変身せず",
        claim: tb.length ? { kind: "hotaru", target: tb[0] } : { kind: "hotaru" },
      };
    },
    achievements(g, id, won) { return H.achievements(g, id, won); },
  });

  // ---------------------------------------------------------
  // サム（形態）: ホタルが変身した姿。人狼陣営として勝利する（本物の人狼扱い）
  // ---------------------------------------------------------
  ONW.defineRole(SAM, {
    info: { deck: 136, name: "サム", team: ONW.TEAM.WOLF, wakeOrder: null, sort: 54.1,
      desc: "ホタルが変身した姿です（内部専用役職。直接配役はできません）。人狼陣営として勝利します。盤面に本物の銀狼がいる場合、銀狼にはサムの存在が通知されます。" },
    groups: { wolf: 8.97 },   // 本物の人狼扱い（人狼判定・乞食の取れない対象・魔法少女の闇堕ち判定などに数える）
    /** 待機時間の演出（作者決定 2026-11-26）: 銀狼本人の画面でだけ、サムのカードがサムの面でめくれて数秒後に裏に戻る。
     *  settleMsg（ホタル役職）の hotaruSam が届いた画面でだけ g.settleHotaruSam が積まれる（他の人の画面には届かない）。
     *  再入室復元は net.js が quiet のとき shown を立てて抑える（開拓者の待機時間 peek と同じ慣例） */
    stageSettle: {
      field: "settleHotaruSam", shown: "settleHotaruSamShown",
      run: { order: 27, run(ids, SK) {
        ids.forEach((id, i) => SK.later(() => { const k = `p:${id}`; SK.up[k] = SAM; SK.glow[k] = true; SK.paint(SK.G()); }, 300 + i * 380));
        SK.later(() => { ids.forEach((id) => { const k = `p:${id}`; if (!SK.held[k] && SK.up[k] === SAM) delete SK.up[k]; delete SK.glow[k]; }); SK.paint(SK.G()); }, 300 + ids.length * 380 + 3200);
      } },
      end(SK) { const g = SK.G(); if (g.phase !== ONW.PHASE.ONLINE_DAY) return; (g.settleHotaruSam || []).forEach((id) => { const k = `p:${id}`; if (SK.up[k] === SAM) delete SK.up[k]; delete SK.glow[k]; }); },   // 昼になったら伏せる（保険。通常は run のタイマーで裏に戻っている）
    },
    // 結果開示(COボタン)の流れ: 対象を選ばず「サムに変身していました。」の1択（マイクラ版のサムCOと同じ）
    coResult: { kind: "sam", fixedText: "サムに変身していました。", fixedShort: "サムに変身" },
    /** CPUの発言（マイクラ版 cpu.js）: 五分五分でホタルCO（開拓者は嘘の開示）。外れたら通常の騙り */
    cpuClaim(k, g, p, r, i, c) {
      if (Math.random() >= 0.5) return false;
      const inSetup = (g.roleCounts || {}).trailblazer > 0 || (g.players || []).some((q) => (g.initialRoles || {})[q.id] === "trailblazer") || (g.center0 || g.center || []).includes("trailblazer");
      const others = (g.players || []).filter((q) => q.id !== p.id);
      c.co = ID;
      c.result = {
        text: inSetup && others.length ? `変身せずに夜を明かしました。開拓者は${nm(g, others[Math.floor(Math.random() * others.length)].id)}でした` : "変身せずに夜を明かしました。開拓者はいませんでした",
        short: "変身せず",
        claim: { kind: "hotaru" },
      };
    },
    achievements(g, id, won) { return H.achievements(g, id, won); },
  });
})(window.ONW = window.ONW || {});
