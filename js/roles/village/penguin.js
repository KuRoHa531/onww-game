/**
 * ペンギン（マイクラ版 PENGUIN を参考）: 村人陣営。夜の能力・昼の能力はなし。投票の集計のときに「自動で」発動する。
 *   ペンギンに投票した人の票は、ペンギンが投票した先へ「滑って移動」する（入れ替えではなく移動）。
 *
 * 【仕様（確定。マイクラ版 scripts/vote.js のペンギン処理どおり）】
 *   ・ペンギンが投票していなければ何も起きない。
 *   ・ペンギンに投票した人が、ペンギンの投票先と同じ本人だった場合は、その人の票は自分自身に残る。
 *   ・ペンギンに投票した「ペンギンの人」の票も滑る（ペンギンが入れた票も同じ）。ただし1匹のペンギンが滑らせるのは1回まで。
 *   ・封印されているペンギンは発動しない。模倣の人狼がペンギンを模倣しているとき・酔っ払い中の扱いは、マイクラ版と交換者の前例に合わせる（docs/penguin.md に決めた内容を書く）。
 *   ・処理の順番: ペンギン（投票先の書き換え）→ 交換者（票数の入れ替え）→ 番犬（飼い主への票を無効）。
 *   ・猪の狂人（未実装）の投票先は、ペンギンでも交換者でも変わらない（未実装のメモ）。
 *
 * 実装の場所（予定）:
 *   ・登録: このファイル（info / groups）と index.html の <script>（1of4）
 *   ・票の移動の計算: js/vote.js（2of4）/ 結果オブジェクト res.slides: js/net.js finalizeResult（2of4）
 *   ・結果発表の演出: このファイルの stageResult（3of4。交換者の演出より前=order 5 に動く。stage.js 本体は「最初に出す票数」の1行だけ）
 *
 * 勝利優先度: docs/victory-priority.md に新しい行は要らない（村人陣営の通常勝敗）。
 * 重複役職: 特別扱いなし（能力は「最終盤面でペンギンを持っている人」が持つ）。docs/overlay-role-priority.md に変更なし。
 * 並び: js/roleorder.js の ONW.ROLE_ORDER に penguin はすでに入っている（exchanger の次）。wiki の order も 26 で一致。末尾追加は不要。
 * 実装の進み具合は docs/penguin.md を参照（1of4=登録 / 2of4=票の移動の処理 / 3of4=演出 / 4of4=周辺・総合）。
 */
(function (ONW) {
  /** 結果発表用: 滑らせた順のペンギン [{ byId, by, toId, to, w: 滑った票数, n: 滑った人数, voters: 滑った人の名前 }]（票の計算は js/vote.js の vote.penguinSlides） */
  function view(g, nm) {
    return ONW.vote.penguinSlides(g).map((s) => ({ byId: s.penguinId, by: nm(s.penguinId), toId: s.toId, to: nm(s.toId), w: s.w, n: s.moves.length, voters: s.moves.map((m) => nm(m.voterId)) }));
  }
  /** （現在は未使用。ペンギンは昼能力ではないので、結果発表では昼行動結果ではなく役職情報に出す＝js/ui.js の役職情報の欄が res.slides から作る）文（滑らせた順に1行ずつ）。rn = 役職名を返す関数（ルームの役職名表示に合わせる） */
  function lines(g, nm, rn) {
    return view(g, nm).map((v) => `${rn("penguin")} ${v.by} に投票した ${v.voters.join("・")} の${v.w}票は、${v.to} へ滑りました。`);
  }
  ONW.penguin = { view, lines, svg: penguinSvg, run: (R, sl, steps, cap) => runSlides(R, sl, steps, cap), ms: (sl) => slidesMs(sl) };   // run / ms = 妖狐投票の演出（js/roles/neutral/foxvote.js の playCounts）が使う

  // ================================================================
  //  ペンギンの絵（画像ファイル無し・コードで描く SVG。横向き・腹ばい。右向きで描いてある）
  //  ★ あとで画像に差し替えるときは、この penguinSvg() だけ直す（例: return `<img src="img/penguin.png" alt="">`）
  // ================================================================
  function penguinSvg() {
    return `<svg viewBox="0 0 72 38" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M8 19 L1 14 L3 22 Z" fill="#161d2b"/>
      <ellipse cx="32" cy="20" rx="25" ry="12.5" fill="#1c2535"/>
      <ellipse cx="34" cy="25" rx="19" ry="7" fill="#f4f7fb"/>
      <ellipse cx="28" cy="25" rx="9" ry="4.2" fill="#161d2b" transform="rotate(14 28 25)"/>
      <circle cx="54" cy="15" r="9" fill="#1c2535"/>
      <ellipse cx="57" cy="18.5" rx="5.5" ry="4" fill="#f4f7fb"/>
      <path d="M60 15 L70 18.5 L60 22 Z" fill="#f2a33a"/>
      <circle cx="55.5" cy="12.5" r="2.6" fill="#fff"/><circle cx="56.3" cy="12.7" r="1.2" fill="#0b0f18"/>
      <ellipse cx="14" cy="30" rx="5" ry="2.2" fill="#f2a33a"/><ellipse cx="22" cy="31.5" rx="5" ry="2.2" fill="#f2a33a"/>
    </svg>`;
  }
  const PEEK_MS = 800, SLIDE_MS = 1500, TAIL_MS = 600, GAP = 34, N = 24;   // 出てくる時間 / 滑る時間 / 着地の余韻 / ペンギンがバッジの後ろに付く距離(px) / 軌道の分割数
  const reduced = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const val = (st, id) => ((st || []).find((c) => c.id === id) || { c: 0 }).c;
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function removeFx() { document.querySelectorAll(".pg-fx").forEach((e) => e.remove()); }
  /** 席 k のカードの、票数バッジがある場所（カードの右上）。なければ null */
  function anchorOf(R, k) {
    const t = R.$t(), c = t && t.querySelector(`.tb-seat[data-k="${k}"] .tb-card`);
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: r.right - 6, y: r.top };
  }
  /**
   * ペンギンがカードから出てきて、腹ばいで滑って、票数バッジを押して投票先のカードまで運ぶ（w = 滑らせる票数）。
   * 動かせたら true（カードが画面にない / 動きを減らす設定 / 着地先が同じカードのときは何もせず false。票数のバッジの更新は呼び出し側）
   */
  function glide(R, kp, kt, w) {
    const A = anchorOf(R, kp), B = anchorOf(R, kt);
    if (!A || !B || reduced()) return false;
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
    if (d < 8) return false;
    removeFx();   // 二重に動かない
    const ux = dx / d, uy = dy / d, total = PEEK_MS + SLIDE_MS + TAIL_MS, o1 = PEEK_MS / total, o2 = (PEEK_MS + SLIDE_MS) / total;
    const left = dx < 0, rot = Math.max(-0.9, Math.min(0.9, left ? Math.atan2(-dy, -dx) : Math.atan2(dy, dx))), sx = left ? -1 : 1;
    const at = (f) => ({ x: A.x + dx * f, y: A.y + dy * f });
    const body = (f, extra) => { const p = at(f); return `translate(${(p.x - ux * GAP).toFixed(1)}px,${(p.y - uy * GAP).toFixed(1)}px) translate(-50%,-50%)${extra || ""} rotate(${rot.toFixed(3)}rad) scaleX(${sx})`; };
    const bdg = (f) => { const p = at(f); return `translate(${p.x.toFixed(1)}px,${p.y.toFixed(1)}px) translate(-50%,-50%)`; };
    const root = document.createElement("div");
    root.className = "pg-fx";
    let puff = "";
    for (let i = 1; i < N; i += 2) { const p = at(ease(i / N)), j = (Math.random() - 0.5) * 12; puff += `<i class="pg-puff" style="left:${(p.x - ux * (GAP + 14) + j).toFixed(1)}px;top:${(p.y - uy * (GAP + 14) + j + 10).toFixed(1)}px;animation-delay:${Math.round(PEEK_MS + (i / N) * SLIDE_MS)}ms"></i>`; }
    const ring = (p, dl) => `<i class="pg-ring" style="left:${p.x.toFixed(1)}px;top:${p.y.toFixed(1)}px;animation-delay:${dl}ms"></i>`;
    root.innerHTML = `${puff}${ring(B, PEEK_MS + SLIDE_MS)}<div class="pg-peng">${penguinSvg()}</div><div class="pg-fly">${w}票</div>`;
    document.body.appendChild(root);
    const pe = root.querySelector(".pg-peng"), fl = root.querySelector(".pg-fly");
    if (pe && pe.animate) {
      const fr = [{ offset: 0, opacity: 0, transform: body(0, " translateY(16px) scale(.2)") }, { offset: o1 * 0.55, opacity: 1, transform: body(0, " translateY(-22px) scale(1.15)") }, { offset: o1, opacity: 1, transform: body(0, "") }];
      for (let i = 1; i <= N; i++) { const f = ease(i / N); fr.push({ offset: o1 + (o2 - o1) * (i / N), opacity: 1, transform: body(f, ` translateY(${(Math.sin(i * 1.3) * 2).toFixed(1)}px)`) }); }
      fr.push({ offset: 1, opacity: 0, transform: body(1, " scale(.9)") });
      pe.animate(fr, { duration: total, easing: "linear", fill: "forwards" });
    }
    if (fl && fl.animate) {
      const fr = [{ offset: 0, opacity: 0, transform: bdg(0) }, { offset: Math.max(0, o1 - 0.001), opacity: 0, transform: bdg(0) }, { offset: o1, opacity: 1, transform: bdg(0) + " scale(1)" }];
      for (let i = 1; i <= N; i++) { const f = ease(i / N); fr.push({ offset: o1 + (o2 - o1) * (i / N), opacity: 1, transform: bdg(f) + ` scale(${(1 + 0.3 * Math.sin(Math.PI * (i / N))).toFixed(3)})` }); }
      fr.push({ offset: Math.min(1, o2 + 0.001), opacity: 0, transform: bdg(1) }, { offset: 1, opacity: 0, transform: bdg(1) });
      fl.animate(fr, { duration: total, easing: "linear", fill: "forwards" });
    }
    setTimeout(() => root.remove(), total + 200);   // 画面から消す（clear でも消える。二重に残らない）
    return true;
  }

  /**
   * 票数のバッジが出たあとの、ペンギンの滑りの時間割（結果発表の counts フックと、妖狐投票の foxPlay が共有）。
   * R = stage.kit を元にした道具箱（R.t = 演出の現在時刻。ここで進める）/ sl = res.slides / steps = res.slideSteps / cap = 字幕を出すか（妖狐投票は字幕なし）
   */
  function runSlides(R, sl, steps, cap) {
    if (!sl.length || steps.length < sl.length + 1) return;
    const { P, later, setCap, esc, paint, gx, badge } = R;
    const has = (st, id) => (st || []).some((c) => c.id === id);
    const setBadge = (k, id, pre, post) => {   // 番犬の飼い主など、途中経過に出ない人の札には触らない
      if (!has(pre, id) && !has(post, id)) return;
      const c = val(post, id);
      if (c > 0) badge[k] = `${c}票`; else delete badge[k];
    };
    const fast = reduced(), peek = fast ? 0 : PEEK_MS, slide = fast ? 0 : SLIDE_MS;
    const nm = (ONW.roles.getInfo && (ONW.roles.getInfo("penguin") || {}).name) || "ペンギン";
    sl.forEach((s, i) => {
      const t0 = R.t, kp = P(s.byId), kt = P(s.toId), pre = steps[i], post = steps[i + 1] || pre, T1 = t0 + 450;
      later(() => {
        if (cap) setCap(`<div class="res-cap__t t-village">${esc(nm)}${sl.length > 1 ? ` (${i + 1}/${sl.length})` : ""}</div><div>${esc(s.by)} → ${esc(s.to)}（${s.w}票）</div>`);
        gx[kp] = "pgsel"; paint(R.G());
      }, t0);
      later(() => { glide(R, kp, kt, s.w); }, T1);
      later(() => { setBadge(kp, s.byId, pre, post); paint(R.G()); }, T1 + peek);   // 滑り出し: ペンギンのカードの票数が、運んだぶん減る
      later(() => { setBadge(kt, s.toId, pre, post); paint(R.G()); }, T1 + peek + slide);   // 着地: 着地先のカードの票数が増える
      later(() => { delete gx[kp]; paint(R.G()); }, T1 + peek + slide + 700);
      R.t = T1 + peek + slide + (fast ? 700 : 1100);
    });
  }
  /** 妖狐投票の演出用: 滑りにかかる時間(ms。動きを減らさない場合) */
  const slidesMs = (sl) => (sl || []).length * (450 + PEEK_MS + SLIDE_MS + 1100);

  ONW.defineRole("penguin", {
    info: { deck: 78, name: "ペンギン", team: ONW.TEAM.VILLAGE, wakeOrder: null, sort: 17.92,
      desc: "村人陣営。夜の能力・昼の能力はありません。投票の集計のときに自動で発動し、ペンギンに投票した人の票は、ペンギンが投票した先へ滑って移動します。結果発表で、票数が出たあとにペンギンがカードから出てきて、腹ばいで滑って票数のバッジを運ぶ様子が見えます。ペンギンに投票したペンギンの票は滑りません。ペンギンの投票先が、ペンギンに投票した本人だったときは、その人の票は自分に残ります。封印されているペンギンは発動しません。" },
    groups: { "transform:light_apostle": 27.5 },   // 光の使徒の変化先（村人系）。並びは ROLE_ORDER で決まる（番号は所属を表すだけ）

    // 結果発表の演出（stage.js の startResult / skipResult が引く。使うデータは res.slides / res.slideSteps（net.js が作る））
    //   counts : 「N票」が全員ぶん出たあと（カードをめくる前）に呼ばれる。交換者（order 10）より前（order 5）。ペンギンごとに処理順に1回ずつ:
    //            字幕「ペンギン」→ ペンギンのカードが持ち上がる → カードからペンギンが出てくる → 腹ばいで滑って、票数バッジを押して投票先のカードまで運ぶ → 着地して票数が更新される
    //            （1匹のペンギンが滑らせる票は、すべて同じ着地先。バッジは1匹につき1つ）。動きを減らす設定のときは、動かさずに票数を移すだけ。
    //   skip   : スキップ時の最終形（票数は滑ったあと） / clear: 演出の部品を片付ける
    stageResult: {
      counts: { order: 5, run(R) { runSlides(R, R.res.slides || [], R.res.slideSteps || [], true); } },
      skip(R) {   // スキップ: 滑ったあとの票数を最終形として出す（途中で止まって滑る前の票数が残らないように、票数のバッジだけ作り直す。交換者がいれば、そのあとの交換者の skip が入れ替え後に直す）
        const sl = R.res.slides || [], steps = R.res.slideSteps || [];
        if (!sl.length || steps.length < 2) return;
        const fin = steps[steps.length - 1] || [], ids = new Set();
        steps.forEach((st) => st.forEach((c) => ids.add(c.id)));
        ids.forEach((id) => {
          const k = `p:${id}`, cur = R.badge[k];
          if (cur !== undefined && !/^\d+票$/.test(cur)) return;   // 「追放」などの札はそのまま
          const c = val(fin, id);
          if (c > 0) R.badge[k] = `${c}票`; else delete R.badge[k];
        });
      },
      clear(R) { removeFx(); if (R && R.gx) Object.keys(R.gx).forEach((k) => { if (R.gx[k] === "pgsel") delete R.gx[k]; }); },
    },
  });
})(window.ONW);
