/**
 * 交換者（村人陣営・昼能力）: 独裁者・フリーターに続く「昼能力」の役職。
 *   昼の議論中に「昼能力」ボタンから、生きている人（自分を含む）を2人選んで確定すると、その2人の「票数」を入れ替える。
 *   マイクラ版（minecraftver.mcpack の main.js / vote.js）の交換者(EXCHANGER)に合わせる。
 *
 * 【仕様（マイクラ版どおり）】
 *   ・使えるのは、最終盤面で交換者を持っていて（酔っ払いは酔いが覚めてから）、生きている人だけ。昼に1回だけ。昼のタイマーが動き出す前(変化公開・新聞の紙が出ている間)は使えない。
 *   ・選べるのは、生きている人2人（自分を含めてよい）。確定すると取り消せない。議論は続く（独裁者と違い、投票もある）。
 *   ・交換は投票を集計するときに働く: 「Aに入った票はBへ、Bに入った票はAへ」。得票数が入れ替わるので、追放されるのも入れ替わった後の最多得票者。
 *   ・交換者が複数いれば、使った順に1つずつ交換する（同じ人が何度も入れ替わることもある）。
 *   ・使ったことは、結果発表まで本人以外にはわからない。結果発表で、得票数が出たあとに票数が入れ替わる演出（stage.js / 2of3）と「昼行動結果」の文章（dayLogsAll）が出る。
 *   ・マイクラ版の「狂った交換者」(人狼陣営)は、WEB版にまだ役職がないので未実装（同じ ONW.exchanger.apply をそのまま使える）。
 *
 * 状態: g.exchanges = [{ by: 交換者のID, a: 1人目のID, b: 2人目のID }, ...]（使った順。試合ごとに net.startGame が [] に戻す）
 * 呼び出し: net.js の hostExchange(ホスト) → ONW.exchanger.canUse / targets / apply。票の入れ替えは vote.js の vote.tally が g.exchanges を見て行う。
 */
(function (ONW) {
  const R = () => ONW.ROLE;
  const isDead = (g, id) => (g.deadIds || []).includes(id);

  /** この人が（もう）使ったか */
  const used = (g, id) => (g.exchanges || []).some((e) => e.by === id);
  /** 交換者の昼能力を使える人か（最終盤面の役職が交換者・酔いが覚めている・生きている・まだ使っていない・昼の議論中でタイマーが動いている・選べる人が2人以上いる） */
  function canUse(g, id) {
    if (!g || g.allDeadSkip || g.dictator) return false;
    if (g.phase !== ONW.PHASE.ONLINE_DAY || g.dayStartId) return false;   // 昼のタイマーが動き出す前（変化公開・新聞・麻婆豆腐・暴露の紙を出している間）は使えない
    if (!g.currentRoles || g.currentRoles[id] !== R().EXCHANGER) return false;
    if (ONW.hiddenDrunk(g, id) || isDead(g, id) || used(g, id)) return false;
    return targets(g, id).length >= 2;
  }
  /** 入れ替えの対象に選べる人（生きている人。自分も含む） */
  function targets(g, id) {
    return (g.players || []).map((p) => p.id).filter((x) => !isDead(g, x));
  }
  /**
   * 交換を記録する（通信・画面の処理は net.js 側）。a・b は別々の生きている人であること。
   * 戻り値: 記録した { by, a, b }。条件を満たさなければ null（何も起きない）
   */
  function apply(g, id, a, b) {
    if (!a || !b || a === b) return null;
    const ok = targets(g, id);
    if (!ok.includes(a) || !ok.includes(b)) return null;
    const ex = { by: id, a, b };
    (g.exchanges = g.exchanges || []).push(ex);
    return ex;
  }
  /** 結果発表用: 使った順の交換 [{byId, by, aId, a, bId, b, role}] */
  function view(g, nm) {
    return (g.exchanges || []).map((e) => ({ byId: e.by, by: nm(e.by), aId: e.a, a: nm(e.a), bId: e.b, b: nm(e.b), role: (g.currentRoles || {})[e.by] || "exchanger" }));
  }

  ONW.exchanger = { canUse, targets, apply, used, view };

  ONW.defineRole("exchanger", {
    info: { deck: 65, name: "交換者", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.9,
      desc: "村人陣営。夜の能力はありません。昼の議論中に「昼能力」ボタンから生きている人を2人（自分を含めてよい）選ぶと、その2人の票数を入れ替えます。入れ替わるのは投票の集計のときで、結果発表で票数が出たあとに入れ替わる様子が見えます。使えるのは酔いが覚めたあとの昼に1回だけで、最終的に交換者を持っている人が使えます。交換者が複数いれば、使った順に入れ替わります。" },
    groups: { "transform:light_apostle": 26 },   // 光の使徒の変化先（村人系）

    // 結果発表の演出（stage.js の startResult / skipResult が引く）
    //   counts : 「N票」が全員ぶん出たあと（カードをめくる前）に呼ばれる。交換者が使った順に1回ずつ:
    //            字幕「交換者 (1/2)」→ 2人のカードが持ち上がる → 2枚の票数バッジが浮き上がって光の尾を引き、楕円を一周ぶん描いて入れ替わり先のカードへ着地 → 輪が広がる
    //            （演出の目安: マイクラ版の入れ替え演出のAI生成動画。動画は何周もするが、ここは一周だけ）。使うデータは res.exchanges / res.countSteps（net.js が作る）。
    //   skip   : スキップ時の最終形（票数は入れ替え後） / clear: 演出の部品を片付ける
    stageResult: {
      counts: { order: 10, run(R) {
        const ex = R.res.exchanges || [], steps = R.res.countSteps || [];
        if (!ex.length || steps.length < ex.length + 1) return;
        const { P, later, setCap, esc, paint, gx, badge } = R;
        const val = (st, id) => ((st || []).find((c) => c.id === id) || { c: 0 }).c;
        const txt = (c) => (c > 0 ? `${c}票` : "");
        ex.forEach((e, i) => {
          const t0 = R.t, ka = P(e.aId), kb = P(e.bId), ca = val(steps[i], e.aId), cb = val(steps[i], e.bId);   // ca / cb = 入れ替える前の2人の票数
          const nm = (ONW.roles.getInfo(e.role) || {}).name || "交換者";
          later(() => {
            setCap(`<div class="res-cap__t t-village">${esc(nm)}${ex.length > 1 ? ` (${i + 1}/${ex.length})` : ""}</div><div>${esc(e.by)}: ${esc(e.a)} ⇔ ${esc(e.b)}</div>`);
            gx[ka] = "exsel"; gx[kb] = "exsel"; paint(R.G());
          }, t0);
          later(() => fly(R, ka, kb, ca, cb), t0 + LIFT_MS);
          later(() => {   // 着地: 入れ替わった票数が、それぞれのカードのバッジになる
            if (txt(cb)) badge[ka] = txt(cb); else delete badge[ka];
            if (txt(ca)) badge[kb] = txt(ca); else delete badge[kb];
            paint(R.G());
          }, t0 + LIFT_MS + FLY_MS);
          later(() => { delete gx[ka]; delete gx[kb]; paint(R.G()); }, t0 + LIFT_MS + FLY_MS + 800);
          R.t = t0 + LIFT_MS + FLY_MS + 1100;
        });
      } },
      skip(R) {   // スキップ: 入れ替え後の票数を最終形として出す（途中で止まって入れ替え前の票数が残らないように、票数のバッジだけ作り直す）
        const ex = R.res.exchanges || [], steps = R.res.countSteps || [];
        if (!ex.length || !steps.length) return;
        const fin = steps[steps.length - 1] || [], ids = new Set();
        steps.forEach((st) => st.forEach((c) => ids.add(c.id)));
        ids.forEach((id) => {
          const k = `p:${id}`, cur = R.badge[k];
          if (cur !== undefined && !/^\d+票$/.test(cur)) return;   // 「追放」などの札はそのまま
          const c = (fin.find((x) => x.id === id) || { c: 0 }).c;
          if (c > 0) R.badge[k] = `${c}票`; else delete R.badge[k];
        });
      },
      clear(R) { removeFx(); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "exsel") delete R.gx[k]; }); },
    },
  });

  // ================================================================
  //  入れ替え演出の部品（結果発表。stage.js には依存せず、画面の上に重ねる）
  // ================================================================
  const LIFT_MS = 600, FLY_MS = 1500, N = 40;   // 持ち上がる時間 / 一周ぶん飛ぶ時間 / 軌道の分割数
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);   // easeInOutCubic（CSS の cubic-bezier(.645,.045,.355,1) とほぼ同じ）
  function removeFx() { document.querySelectorAll(".ex-fx").forEach((e) => e.remove()); }
  /** 席 k のカードの、票数バッジがある場所（カードの右上）。なければ null */
  function anchorOf(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.right - 6, y: r.top };
  }
  /**
   * 2枚のバッジの軌道。A → B と B → A が、中心のまわりを半周ずつ（2枚あわせて一周ぶんの輪）描く。
   * 輪の幅は、カードが近いときも広がって見えるよう、途中で外側にふくらむ（始点・終点は必ずカードの位置）。th: 0 → π
   */
  function orbit(A, B) {
    const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2, dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy) || 1;
    const ux = dx / d, uy = dy / d, wx = -uy, wy = ux, half = d / 2;
    const rx = Math.max(half, 95), ry = Math.min(72, Math.max(40, rx * 0.42));
    const W = window.innerWidth || 400, H = window.innerHeight || 800;
    const cl = (v, m) => Math.max(10, Math.min(m - 10, v));
    const at = (k, th) => {   // k = -1: A から B へ（上回り） / +1: B から A へ（下回り）。2枚とも同じ向き（時計まわり）に回る
      const sn = Math.sin(th), cs = Math.cos(th), r = half + (rx - half) * sn;   // r: 途中でふくらむ半径（th=0 と π では half = カードの位置）
      const px = cx + ux * (k * r * cs) + wx * (k * ry * sn), py = cy + uy * (k * r * cs) + wy * (k * ry * sn);
      return { x: cl(px, W), y: cl(py, H) };
    };
    return { a: (th) => at(-1, th), b: (th) => at(1, th) };
  }
  /** 2人のカードの上のバッジが浮き上がり、光の尾を引いて入れ替わる（ca = A の票数 / cb = B の票数）。入れ替えた票数をカードに戻すのは呼び出し側 */
  function fly(R, ka, kb, ca, cb) {
    const A = anchorOf(R, ka), B = anchorOf(R, kb);
    const hide = () => { delete R.badge[ka]; delete R.badge[kb]; R.paint(R.G()); };
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!A || !B || reduce) { hide(); return; }   // カードが画面にない / 動きを減らす設定: 動かさずに入れ替えるだけ
    hide();
    removeFx();
    const o = orbit(A, B), th = (i) => Math.PI * (i / N);
    const pathD = (f) => { let d = ""; for (let i = 0; i <= N; i++) { const p = f(th(i)); d += (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1); } return d; };
    let sp = "";   // キラキラ: 軌道の途中に点を撒く（バッジが通る時刻に合わせて光る）
    [o.a, o.b].forEach((f) => { for (let i = 1; i < N; i += 2) { const p = f(Math.PI * ease(i / N)), jx = (Math.random() - 0.5) * 16, jy = (Math.random() - 0.5) * 16; sp += `<i class="ex-sp" style="left:${(p.x + jx).toFixed(1)}px;top:${(p.y + jy).toFixed(1)}px;animation-delay:${Math.round((i / N) * FLY_MS)}ms"></i>`; } });
    const ring = (p, dl) => `<i class="ex-ring" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;animation-delay:${dl}ms"></i><i class="ex-ring ex-ring2" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;animation-delay:${dl + 120}ms"></i>`;
    const badgeHtml = (c, cls) => `<div class="ex-fly ${cls}${c > 0 ? "" : " ex-fly--zero"}" style="transform:translate(${(cls === "ex-fly--a" ? A : B).x}px,${(cls === "ex-fly--a" ? A : B).y}px) translate(-50%,-50%)">${c}票</div>`;
    const root = document.createElement("div");
    root.className = "ex-fx";
    root.innerHTML = `<svg class="ex-svg" width="100%" height="100%">
        <path class="ex-arc ex-arc--glow" pathLength="1" d="${pathD(o.a)}"/><path class="ex-arc ex-arc--core" pathLength="1" d="${pathD(o.a)}"/>
        <path class="ex-arc ex-arc--glow" pathLength="1" d="${pathD(o.b)}"/><path class="ex-arc ex-arc--core" pathLength="1" d="${pathD(o.b)}"/>
      </svg>${sp}${ring(A, 0)}${ring(B, 0)}${ring(B, FLY_MS)}${ring(A, FLY_MS)}${badgeHtml(ca, "ex-fly--a")}${badgeHtml(cb, "ex-fly--b")}`;
    document.body.appendChild(root);
    // バッジ: 持ち上がって(拡大)、一周ぶんの輪を描いて、反対側のカードに降りる
    const frames = (f) => Array.from({ length: N + 1 }, (_, i) => { const t = ease(i / N), p = f(Math.PI * t); return { offset: i / N, transform: `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%) scale(${(1 + 0.4 * Math.sin(Math.PI * t)).toFixed(3)})` }; });
    const fa = root.querySelector && root.querySelector(".ex-fly--a"), fb = root.querySelector && root.querySelector(".ex-fly--b");
    if (fa && fa.animate) fa.animate(frames(o.a), { duration: FLY_MS, easing: "linear", fill: "forwards" });
    if (fb && fb.animate) fb.animate(frames(o.b), { duration: FLY_MS, easing: "linear", fill: "forwards" });
    // 光の尾: 軌道に沿って、先頭がバッジと同じ速さで進む（赤い光の中に白い芯）→ 着地のあとに消える
    (root.querySelectorAll ? [...root.querySelectorAll(".ex-arc")] : []).forEach((a) => {
      if (!a.animate) return;
      a.animate([{ strokeDashoffset: 0.3, opacity: 1 }, { strokeDashoffset: -0.7, opacity: 1, offset: 0.9 }, { strokeDashoffset: -0.7, opacity: 0 }], { duration: FLY_MS + 500, easing: "cubic-bezier(.645,.045,.355,1)", fill: "forwards" });
    });
    setTimeout(() => { if (fa) fa.remove(); if (fb) fb.remove(); }, FLY_MS);   // バッジは着地したら消える（カードの本物のバッジに引き継ぐ）
    setTimeout(() => root.remove(), FLY_MS + 1300);
  }
})(window.ONW);
