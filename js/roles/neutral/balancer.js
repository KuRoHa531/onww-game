/**
 * バランサー（第三陣営）: 投票結果で「1票以上入った人が2人以上いて、その全員の票数が同じ」とき単独勝利する。
 *   マイクラ版: vote.js の isBalancerVotePattern / buildBalancerPriorityResult / balancerVoteEligible を、Web版の勝敗判定(vote.js determineWinnersCoreBase)に合わせたもの。
 *
 * 【勝利条件（マイクラ版と同じ）】
 *   ・最終盤面（現世。墓地ではなく、誰かの席）でバランサーを持っていて、投票している人（何票入れたか・誰に入れたかは問わない。未投票・昼中に死亡して投票できなかった人は勝てない）
 *   ・票が入った人（1票以上）が2人以上いて、その全員の票数が同じ（票数は vote.tally の最終的な票数。メイヤー・盗賊・ペンギン・交換者・番犬の反映後）
 *   ・バランサーが2人以上いるときは、条件を満たした全員が同時に勝つ（単独勝利。追加勝利系は通常どおり一緒に勝つ）
 *   ・恋人（重複役職）になっているバランサーは勝てない / 保安官に撃たれて勝利条件を失った人は勝てない（賞金稼ぎと同じ扱い）
 *   ・追放・死亡していても勝てる（投票さえしていれば）
 *
 * 【勝利優先度（正本: docs/victory-priority.md）】
 *   チキン ＞ 模倣チキン ＞ 神の祝福 ＞ 勝負師(単独陣営選択時) ＞ シャッフラー ＞ 静観者 ＞ 名探偵 ＞ 予想屋 ＞ 魔界公爵 ＞ 賞金稼ぎ ＞ バランサー ＞ てるてる坊主＝一目惚れしてるてる＝処刑人 ＞ …
 *   vote.js の determineWinnersCoreBase の分岐 1.8（賞金稼ぎ 1.7 のあと・てるてる系 2 の前）。チキンの逆転（chickenForce）の再判定では飛ばす。
 *
 * 【結果発表の演出（seesaw・シーソーの天秤）】2of4 以降。バランサーが勝負の場に出てきたときだけ、全員がめくれ終わったあと・最終結果の前に出す。
 *   出す条件（ONW.balancer.fx。net.js が res.balancer に入れて stage.js が呼ぶ）:
 *     ① 最終盤面でバランサーを持っていて、投票している（何票入れたかは問わない）人がいる
 *     ② バランサーより優先度の高い役職の勝利が成立していない（チキン・模倣チキンの逆転と、将来入る勝負師の乗っ取りは例外 =
 *        「一度バランサー勝利と出てから逆転する」ので、演出は出す）
 *   1票以上入った人のカードを、票数が多い順に左から天秤に並べる。票数が多いほどカードは重い。傾いてカードが落ちたら失敗 / 全部同じ重さで釣り合えば成功＝バランサー勝利。
 *
 * 記録: game.balancerFx = { success, ids, cards: [{ id, c }] } | null（determineWinners が、チキンの逆転の前に作る）
 *
 * 進み具合（docs/balancer.md も参照）: 1of4 = 登録・勝敗 / 2of4 = 結果データ・演出の骨組み / 3of4 = 天秤の演出（済。runBalance / css の .bl-*）/ 4of4 = CPU・実績・ガイド・総合
 */
(function (ONW) {
  const B = {};
  const R = () => ONW.ROLE;

  /** バランサーより優先度の高い勝利の「勝利タイトル」（これが成立していたら、バランサーの演出は出さない）。
   *  今のWeb版にある分: 神の祝福 / 名探偵 / 賞金稼ぎ / シャッフラーの乗っ取り。予想屋・魔界公爵・静観者・勝負師(単独陣営)などを入れるときは、ここに足す
   *  （チキン・模倣チキン・勝負師の乗っ取りは逆転・乗っ取りなので入れない: 一度バランサー勝利と出てから覆す） */
  B.HIGHER_TITLES = ["神の祝福を受けました", "名探偵勝利", "賞金稼ぎ勝利", "シャッフラー勝利"];

  /** 最終盤面でバランサーを持っていて、投票していて、勝てる状態の人のID（恋人・撃たれて勝利条件を失った人は除く）。投票しなかった人・昼中に死亡して投票が消えた人は入らない */
  B.eligible = function eligible(g) {
    const shot = ONW.sheriff && ONW.sheriff.lostIds ? ONW.sheriff.lostIds(g) : [];
    return (g.players || []).map((p) => p.id).filter((id) =>
      g.currentRoles && g.currentRoles[id] === R().BALANCER && !!(g.votes || {})[id] && !ONW.isLover(g, id) && !shot.includes(id));
  };

  /** 1票以上入った人（票数の多い順。同数は席順）: [{ id, c }]。票数は vote.tally の最終的な票数（番犬の飼い主への無効票は入らない） */
  B.cards = function cards(g) {
    const counts = ONW.vote.tally(g), order = (g.players || []).map((p) => p.id);
    return Object.keys(counts).filter((id) => counts[id] > 0 && order.includes(id))
      .map((id) => ({ id, c: counts[id] }))
      .sort((a, b) => b.c - a.c || order.indexOf(a.id) - order.indexOf(b.id));
  };

  /** 釣り合っているか: 票が入った人が2人以上いて、全員が同じ票数（マイクラ版 isBalancerVotePattern） */
  B.isEqual = (cards) => cards.length >= 2 && cards.every((x) => x.c === cards[0].c);

  /** 勝てるバランサーのID（条件を満たしたとき）。空なら勝利なし */
  B.winIds = function winIds(g) {
    const ids = B.eligible(g);
    return ids.length && B.isEqual(B.cards(g)) ? ids : [];
  };

  /** 勝利の説明文 */
  B.winText = function winText(g, ids, nm) {
    const cs = B.cards(g);
    return `票が入った全員（${cs.map((x) => `${nm([x.id])} ${x.c}票`).join("、")}）の票数が同じだったため、バランサー ${nm(ids)} の単独勝利です。`;
  };

  /**
   * 結果発表の天秤の演出データ。determineWinners が、最初の判定（チキンの逆転の前）の直後に呼ぶ。出さないときは null。
   *   success: 釣り合った（バランサー勝利）/ false: 傾いて落ちる
   *   ids: 演出の対象のバランサー（条件を満たした人）/ cards: 天秤に載せるカード（票数の多い順）
   */
  B.fx = function fx(g) {
    const ids = B.eligible(g);
    if (!ids.length) return null;                                   // ① 最終盤面にバランサーがいて投票している人がいない
    const teams = g.winTeams || [], success = teams.includes("バランサー");
    if (!success && B.HIGHER_TITLES.includes(g.winTitle)) return null;   // ② バランサーより優先度の高い勝利が成立している
    const cards = B.cards(g);
    if (!cards.length) return null;                                 // 載せるカードが1枚もない（全員が0票・無効票）
    if (!success && B.isEqual(cards)) return null;                  // 釣り合っているのに勝てない（シャッフラーの失敗条件など）: 成功とも失敗とも言えないので出さない
    return { success, ids: ids.slice(), cards: cards.map((x) => ({ id: x.id, c: x.c })) };
  };

  /**
   * 実績（マイクラ版 stats.js と同じ条件。wiki-data.js の「バランサー」に定義済みの3つ）。
   *   first_balancer = 初期役職がバランサー（初めてかどうかは保存側が数える）/ win_balancer = 最終役職がバランサーで勝利 /
   *   balancer_no_vote_loss = 最終役職がバランサーで、投票しないまま敗北
   *   Web版にはまだ実績を保存する仕組みが無いので、「この試合で id が満たした実績ID」を返すだけ（盗賊 ONW.thief.achievements と同じ。保存側ができたら呼ぶ）。won: その人が勝ったか
   */
  B.achievements = function achievements(g, id, won) {
    const out = [], ini = g.initialRoles && g.initialRoles[id], cur = g.currentRoles && g.currentRoles[id];
    if (ini === R().BALANCER) out.push("first_balancer");
    if (cur === R().BALANCER && won) out.push("win_balancer");
    if (cur === R().BALANCER && !won && !(g.votes || {})[id]) out.push("balancer_no_vote_loss");
    return out;
  };

  ONW.balancer = B;

  // ======================================================================
  //  結果発表の天秤の演出（3of4。stage.js には依存せず、画面の上に重ねる。盗賊の演出と同じ作り方）
  //   見た目: 中央に支点（上のつまみと、天井から吊るす線）がある横棒の天秤。棒の下から、カードが糸でぶら下がる。
  //   動き  : 1票以上入った人のカードを、票数の多い順に左から1枚ずつ載せる（票数が多いほどカードは大きく重い）。載せるたびに棒が傾く。
  //           成功 = 全員同じ重さなので、載せ終わると水平に釣り合う（ゆれて止まり、金色に光る）→ バランサー勝利
  //           失敗 = 重い左側に傾いたまま、糸が切れてカードが左から順に落ちる → 失敗
  //   データ: res.balancer = { success, ids, names, cards: [{ id, name, c, role }] }（net.js）。動きを減らす設定のときは、動かさずに結果の形だけ見せる
  // ======================================================================
  const BL = { PLACE0: 1100, GAP: 720, DROP: 520, HOLD_NG: 1100, CUT_GAP: 190, FALL: 1000, END_OK: 2300, END_NG: 2300, FADE: 450, STILL: 3200 };   // 時間割（ms）
  const reduceMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  function removeFx() { document.querySelectorAll(".bl-fx").forEach((e) => e.remove()); }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /** 天秤の寸法と、カードごとの位置・大きさ・傾き。cards = 票数の多い順（左から）。n=1 のときは左の端に載せる（反対側が空なので傾く） */
  function layout(cards) {
    const n = cards.length, W = Math.min((window.innerWidth || 400) - 20, 620);
    const slots = Math.max(n, 2), sp = Math.min(118, (W - 40) / slots), cw = clamp(sp - 8, 34, 70), maxC = Math.max(...cards.map((x) => x.c));
    const xs = cards.map((_, i) => (n === 1 ? -sp / 2 : (i - (n - 1) / 2) * sp));
    const half = Math.max(n - 1, 1) * sp / 2, total = cards.reduce((a, x) => a + x.c, 0);
    // 棒の傾き（度）: k 枚載せたとき。マイナス = 左が下がる。重い順に左から並べているので、釣り合わないときは必ず左に傾く
    const angle = (k) => { let t = 0; for (let i = 0; i < k; i++) t += cards[i].c * xs[i]; return clamp(t / (total * half) * 70, -18, 18); };
    // k 枚を切り落としたあと（k 番目以降だけが載っている）の傾き。切るたびに、棒は残った重さに合わせて動く
    const angleRest = (k) => { let t = 0; for (let i = k; i < n; i++) t += cards[i].c * xs[i]; return clamp(t / (total * half) * 70, -18, 18); };
    const sizeOf = (c) => Math.round(cw * (0.78 + 0.22 * (c / maxC)));   // 票数が多いほど大きい（全員同票なら全部同じ大きさ）
    return { n, W, sp, cw, xs, angle, angleRest, sizeOf, beamW: slots * sp + 28, ch: Math.round(cw * 1.45) };
  }
  function cardHtml(x, w, esc) {
    const info = (x.role && ONW.roles && ONW.roles.getInfo(x.role)) || {}, h = Math.round(w * 1.45);
    const icon = x.role && ONW.ui && ONW.ui.roleIcon ? ONW.ui.roleIcon(x.role, "role-icon--face") : "";
    return `<div class="bl-card bl-team-${info.team || "third"}" style="width:${w}px;height:${h}px;font-size:${Math.max(8, Math.round(w * 0.19))}px"><div class="bl-face">${icon}</div><b>${esc(x.name)}</b><i class="bl-n">${x.c}票</i></div>`;
  }
  /** 糸から外れたカードの落下。棒から切り離して画面の上に移し、自由落下させる（棒のゆれには付いていかない）。
   *  初速は0・重力で加速（y = ½gt²）・横には動かない・空気抵抗なし（回転は一定の速さ）。画面の下に出たら消す */
  function releaseCard(ld, omega) {
    const root = document.querySelector(".bl-fx"), card = ld.querySelector(".bl-card"); if (!root || !card) return;
    const r = card.getBoundingClientRect(), fly = document.createElement("div");
    card.classList.remove("bl-strain");
    fly.className = "bl-fly";
    fly.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px`;
    fly.appendChild(card);
    root.appendChild(fly);   // 糸（.bl-string）は棒に残る
    const G = 2600, H = window.innerHeight || 700;
    let y = 0, vy = 0, rot = 0, last = performance.now();
    const step = (now) => {
      if (!fly.isConnected) return;   // スキップ・演出終了で片付けられた
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      vy += G * dt; y += vy * dt; rot += omega * dt;
      fly.style.transform = `translateY(${y.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
      if (r.top + y > H + 40) { fly.remove(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  /** 演出の時間割。字幕は天秤の上（オーバーレイの中）に出す。R.t = 演出の現在時刻(ms)で、終わったら進める */
  function runBalance(R, b) {
    const { later, setCap, esc } = R, cards = b.cards, L = layout(cards), n = L.n, reduce = reduceMotion(), t0 = R.t;
    const finalA = b.success ? 0 : (L.angle(n) < 0 ? Math.min(L.angle(n), -8) : Math.max(L.angle(n), 8));   // 失敗は、傾きが小さすぎても見て分かる角度まで傾ける
    const cap = () => {};   // 天秤の演出中は文章を出さない（天秤とカードだけ見せる）
    const tilt = (a, ms) => {   // 棒を a 度にする。ぶら下がるカードは同じ時間・同じ動きで逆に回すので、ずっと真下を向く
      const root = document.querySelector(".bl-fx"); if (!root) return;
      root.style.setProperty("--bt", `${ms}ms`);
      const beam = root.querySelector(".bl-beam"); if (beam) beam.style.transform = `rotate(${a}deg)`;
      root.querySelectorAll(".bl-hang").forEach((h) => { h.style.transform = `rotate(${-a}deg)`; });
    };
    const capOn = (title, cls, sub) => `<div class="res-cap__t ${cls}">${title}</div>${sub ? `<div>${sub}</div>` : ""}`;
    const sub0 = "";
    const okCap = capOn("票数が全員同じ！", "t-third", `天秤は釣り合いました — バランサー ${(b.names || []).map(esc).join("、")}`), ngCap = capOn("天秤は傾きました…", "t-wolf", "カードが落ちて、釣り合いませんでした");
    later(() => setCap(""), t0);   // 裏の字幕は空にする（天秤の演出中は、裏に「○○勝利」などを出さない）
    // --- 舞台を作る ---
    later(() => {
      removeFx();
      const root = document.createElement("div");
      root.className = "bl-fx";
      root.style.cssText = `--bw:${L.W}px;--beamw:${L.beamW}px;--ch:${L.ch}px;--by:64px;--bt:.5s`;
      root.innerHTML = `<div class="bl-stage">
        <div class="bl-scale" style="height:${64 + 48 + L.ch + 40}px"><i class="bl-hook"></i><i class="bl-ring"></i>
          <div class="bl-beam">${cards.map((x, i) => `<div class="bl-hang" style="left:calc(50% + ${L.xs[i].toFixed(1)}px)"><div class="bl-load" style="${reduce ? "" : "opacity:0"}"><i class="bl-string"></i>${cardHtml(x, L.sizeOf(x.c), esc)}</div></div>`).join("")}</div>
          <i class="bl-knob"></i></div></div>`;
      document.body.appendChild(root);
      if (reduce) { root.style.setProperty("--bt", "0s"); tilt(finalA, 0); if (b.success) root.classList.add("bl-ok"); else root.querySelectorAll(".bl-load").forEach((e) => { e.style.opacity = ".35"; }); cap(b.success ? okCap : ngCap); }
    }, t0 + 100);
    if (reduce) {   // 動かさない: 結果の形だけ
      later(() => setCap(""), t0 + 150);
      R.t = t0 + BL.STILL;
      later(removeFx, R.t);
      return;
    }
    // --- 1枚ずつ載せる ---
    cards.forEach((x, i) => {
      const at = t0 + BL.PLACE0 + i * BL.GAP;
      later(() => {
        const h = document.querySelectorAll(".bl-fx .bl-hang")[i], ld = h && h.querySelector(".bl-load");
        if (!ld) return;
        ld.style.opacity = ""; ld.classList.add("bl-drop");
      }, at);
    });
    const tAll = t0 + BL.PLACE0 + (n - 1) * BL.GAP + BL.DROP;   // 全部載った時刻
    // 棒は、各カードが着地する時刻に傾く
    cards.forEach((x, i) => later(() => tilt(L.angle(i + 1), 520), t0 + BL.PLACE0 + i * BL.GAP + BL.DROP - 140));
    if (b.success) {
      // 水平に釣り合う → ゆれて止まる → 金色に光る
      const w = [4, -3, 2, -1, 0];
      w.forEach((a, j) => later(() => tilt(a, 380), tAll + 500 + j * 400));
      const tOk = tAll + 500 + w.length * 400;
      later(() => { const r = document.querySelector(".bl-fx"); if (r) r.classList.add("bl-ok"); cap(okCap); }, tOk);
      R.t = tOk + BL.END_OK;
    } else {
      // 傾いたまま少し耐える → 左（重い）のカードから落ちる。落ちるたびに棒は残りの重さに合わせて動く → 最後は水平に戻ってゆれて止まる
      const d = finalA < 0 ? -1 : 1, tCut = tAll + 300 + BL.HOLD_NG;
      later(() => tilt(finalA, 420), tAll + 120);   // 傾きが小さすぎても見て分かる角度まで
      later(() => { document.querySelectorAll(".bl-fx .bl-card").forEach((c) => c.classList.add("bl-strain")); }, tAll + 300);
      cards.forEach((x, i) => later(() => {
        const h = document.querySelectorAll(".bl-fx .bl-hang")[i], ld = h && h.querySelector(".bl-load"); if (!ld) return;
        releaseCard(ld, d * (45 + (i % 3) * 25));
        tilt(L.angleRest(i + 1), 420);
      }, tCut + i * BL.CUT_GAP));
      const tEnd = tCut + (n - 1) * BL.CUT_GAP, a0 = L.angleRest(n - 1);   // 最後に切る直前の傾き
      const w = [-a0 * 0.45, a0 * 0.25, -a0 * 0.12, 0];
      w.forEach((a, j) => later(() => tilt(a, 420), tEnd + 450 + j * 430));
      later(() => { cap(ngCap); }, tEnd + 350);
      R.t = tEnd + 350 + w.length * 430 + BL.END_NG - 900;
    }
    later(() => { const r = document.querySelector(".bl-fx"); if (r) r.classList.add("bl-out"); }, R.t);
    R.t += BL.FADE;
    later(removeFx, R.t);
  }

  ONW.defineRole("balancer", {
    // 結果発表の演出(stage.js の startResult が引く。全員がめくれ終わったあと・チキンの逆転の前): res.balancer がある試合だけ。
    //   シーソーの天秤（上の runBalance）。スキップ(skipResult)されたときは clear で天秤を片付けるだけ（結果は最終結果の画面に出る）
    stageResult: {
      balancer: { order: 10, run(R) {
        const b = R.res.balancer;
        if (!b || !(b.cards || []).length) return;
        runBalance(R, b);
      } },
      clear() { removeFx(); },
    },
    info: { deck: 81, name: "バランサー", team: ONW.TEAM.THIRD, wakeOrder: null, sort: 35.6,
      desc: "第三陣営。夜の能力はありません。投票結果で2人以上に票が入り、票が入った全員の票数が同じだった場合に単独勝利します（投票していることが条件です。追放・死亡していても勝てます）。追加勝利系が条件を満たしている場合は一緒に勝てます。バランサーが2人以上いるときは、条件を満たした全員が同時に勝ちます。" },
    groups: { "transform:silver_shadow": 20 },   // 銀色の影の変化先（第三陣営の役職は必ず入れる）
  });
})(window.ONW);
