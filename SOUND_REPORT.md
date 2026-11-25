# サウンド組み込み報告書

依頼: 生成済みサウンドパック（BGM 13種 / SE 17種）をゲーム本体へ組み込む（「本体と込みのやつほしい」）。
作業場所: `~/workspace/onww_vanity/`（ヴァニティ移植＋マイクラ版合わせ修正済みの作業コピー）。
元の zip・`~/workspace/user/files/`・`~/workspace/onww_soundpack/` は変更していない。zip の作り直しは親側で実施。

## 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `audio/bgm/*.mp3`（13件）・`audio/se/*.mp3`（17件） | サウンドパックからコピー（新規） |
| `js/sound.js` | 新規。サウンドマネージャ `ONW.sound` |
| `index.html` | sound.js の script タグ追加（state.js の直後・他より先）。右上（#top-right）にミュート切替ボタン 🔊/🔇 を追加 |
| `js/ui.js` | render 末尾に `ONW.sound.syncBgm(game)` フック。ルーム設定モーダル「システム設定」にサウンド行（ミュート / BGM音量 / SE音量＋試聴）を追加 |
| `js/net.js` | smoke → SE、vote_start の dictator/libra → SE、detwait/detask → 名探偵 BGM の hold/release |
| `js/stage.js` | paint のめくれ検出、盤面差分の発砲・死亡検出、変化公開の紙の BGM hold/release、新聞・暴露・パンの SE、結果発表（吹っ飛び・爆発・連鎖字幕・王国滅亡・バランサー/名探偵区間の BGM hold）、トーテムの SE、toSheet での release |
| `js/roles/neutral/fox.js` | playCurse → 呪殺 SE、playChain → 後追い・心中 SE |
| `js/roles/neutral/bounty_hunter.js` | 判定で的中した瞬間 → 賞金稼ぎ成功 SE |
| `js/roles/village/chicken.js` | 逆転の「！」の瞬間 → チキン逆転 SE |
| `js/roles/neutral/executioner.js` | ギロチンでカードが割れる瞬間 → 処刑人成功 SE |
| `docs/sound.md` | 新規。対応表と実装方針 |

## 実装の要点

- `ONW.sound.bgm(name)`: 2つの Audio 要素で約1秒クロスフェード、ループ、同じ曲なら継続。
- `ONW.sound.se(name)`: 音ごとのプール（最大4）で同時再生可。同じ音の45ms以内の重なりは間引き。
- `ONW.sound.seKey(name, key, 60000)`: 同じ試合・同じ対象には1回だけ鳴らす（二重配線防止）。発砲・呪殺・連鎖死で使用し、キーは経路間で共通化。
- 音量・ミュートは localStorage `onw.sound.v1` に保存（端末ごと。ルーム設定とは別系統）。
- 自動再生制限: 初回のタップ/クリック/キー操作でロック解除し、保留中の BGM を再生開始。
- 全処理が防御的（try/catch、再生失敗は無視）。音が出ない環境でもゲーム進行に影響しない。
- BGM は `ui.render` 末尾の `syncBgm(game)` でフェーズから一元決定。演出だけ曲が変わる場面（変化公開・名探偵推理・結果発表内のバランサー/名探偵区間）は `hold()` / `release()` で固定・復帰（hold は120秒で自動失効、結果シート遷移でも解除）。

## BGM 配線一覧（13種すべてに切替経路あり）

title（タイトル/設定） / lobby（ロビー） / night（夜・配役確認） / morning（朝） / transform（変化公開中のみ hold） / day_alive（昼・生存） / day_dead（昼・死亡、観戦の昼も） / vote（投票） / duke（投票中・公爵会議 g.dukeIds） / detective（推理中 detask/detwait、結果発表の答え合わせ区間） / balancer（結果発表の天秤区間） / result_reveal（結果発表演出） / result_screen（リザルト画面・ロビーの結果確認）。詳細は docs/sound.md の対応表。

## SE 配線一覧（17種すべてに呼び出し箇所あり）

card_flip（stage.paint の裏→表変化検出） / dictator・libra（vote_start 受信時、全員） / card_fly（結果発表の敗者 blow） / curse_kill（fox.playCurse＋盤面検出、キーで二重防止） / follow_death（盤面検出・fox.playChain・結果の flipChain/kingdom） / chain（盤面検出・結果の flipChain） / gunshot（盤面の shot フラグ初出時、全員） / smoke（smoke メッセージ） / newspaper（drawNews） / expose（drawExpose） / bakery（runBread） / bounty_success（的中確定時） / chicken_reverse（「！」表示時） / executioner_success（カード分割時） / bomb（結果発表の boom 3経路） / steve_revive（stage.totem 共通入口）。

## 近似実装・未対応

- 配役確認に専用曲が無いため bgm_night で近似。
- バランサー BGM は結果発表内のフック区間（R.t の進み）で判定する近似。投票中の天秤発動は SE のみ。
- 昼の死亡音は盤面（coboard）差分検出。連鎖は段（step）ごとに鳴る。再入室・途中参加の初回同期では鳴らさない（演出なしの表示に合わせた）。
- 観戦者は待機時間演出の一部が本体仕様で表示されないため、その SE（呪殺など）も鳴らない。
- レガシー同一端末オフライン（main.js フロー）は BGM のみ。CPU 戦（net 経由）はオンラインと同じく全 SE が鳴る。
- **ブラウザ実機での発音確認は未実施**（モック環境でのロジックスモークテストは実施・全項目OK）。

## 検証結果

- `node --check`: 変更した全8つの .js すべて OK（途中で net.js の行内コメントによる構文エラーを検出・修正済み）。
- sound.js ロジックのモックテスト（Audio/localStorage を差し替え）: ロック中の保留→解除で再生、同一曲の継続、フェーズ判定（day_dead/duke/result_screen 等）、hold 中の固定と release での復帰、SE の間引き、seKey の二重防止、めくれ検出、ミュート、音量保存の全16項目 OK。
- 既存検証スクリプト再実行:
  - vanityCheck: 全部 OK
  - hackBorrowCheck / hackFuzzCheck / hackPublicCheck / silverWolf3Check: 全部 OK
  - synergyAutoCheck / synergyRequiredCheck / observeSynergyCheck: OK
  - demonDukeLoadCheck / knightLoadCheck / trailblazerLoadCheck / winLadderCheck / bomberBadgeCheck / stageTitleCheck / smokeJudgeCheck: OK
  - 失敗はすべて組み込み前（ヴァニティ移植済み納品 zip）でも同一に出る既存分のみ: smokeLoadCheck（ONW78）1件、steveCheck 1件、steveSynergyCheck 1件、martyrLoadCheck 2件、madPriestCheck 2件、smokeNameCheck 3件。**新規の失敗はなし**（madPriestCheck / smokeNameCheck は納品 zip 上で再実行して同一失敗を確認済み）。
- grep 自己点検: BGM 13種すべてに切替経路、SE 17種すべてに呼び出し箇所があることを確認（card_flip は sound.js の noteFlip 経由で stage.paint から駆動）。

---

## 追記（2026-11-25）: タップ音・左上パネル・スライダー音量

作者要望3点（タップ音が欲しい／音マークを右上から左上へ／スライドで BGM・SE 別に音量調節）を実装した。

### 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `audio/se/se_tap.mp3` | 新規SE「タップ音」（0.09秒、MP3 / 44100Hz / モノラル） |
| `js/sound.js` | タップ音の委譲リスナー、音量パネル（開閉・同期・外タップで閉じる）、setter の内部関数化とパネル連動 |
| `index.html` | 🔊 ボタンを右上（.wiki-row）から左上（全画面ボタンの隣）へ移動し、タップ動作をミュート切替→パネル開閉に変更。`#snd-panel`（BGM/SE スライダー＋ミュートボタン）を追加 |
| `css/style.css` | `.snd-btn` / `.snd-panel` の配置・見た目を追加。設定・デバッグ表示中に左上のボタンとパネルを隠すルールを `.top-right` の既存ルールに合わせて追加 |
| `js/ui.js` | システム設定のサウンド説明文を「左上の🔊ボタンから開く音量パネルでも変えられる（連動）」に更新（設定行自体は存続） |
| `_wip/soundUiCheck.js` | 新規モックテスト（全28項目） |
| `docs/sound.md` | 仕組みにタップ音とパネルを追記、SE 対応表に se_tap の行を追加 |
| `~/workspace/onww_soundpack/se/se_tap.mp3`・`generate_sounds.py` | パック側にも同じ音源を配置し、`se_tap()` と SE_LIST / SE_PEAK（ピーク0.45）を追記（パック再生成でも消えない） |

### 実装方針

- **タップ音**: 高域ノイズの短いバースト＋1800→1250Hz のサインブリップを手続き合成（0.09秒）。頻繁に鳴るため書き出しピークは他の SE（0.85）より低い 0.45 に抑えた。配線は sound.js 内の document 委譲リスナー（click・capture）で、`button` / `.tb-seat[data-k]`（カード）/ `[role="button"]` / `#chat-log` を対象に `ONW.sound.se("tap")` を呼ぶ。除外: スライダー（`input[type=range]`）の操作、無効なボタン、ミュート時・SE音量0（se 側で抑止）。間引きは専用70ms＋se 自体の45ms。自動再生ロック解除のきっかけになったタップは、ハンドラ内で `unlock()` を先に呼ぶためそのタップから鳴る。
- **左上移動**: `#snd-btn` を左上に固定配置（全画面ボタン #fs-btn の右隣、left: 40px）。右上の元ボタンは削除し二重配置なし。アイコン表示（ミュート時 🔇 / 通常時 🔊）は従来どおり sound.js の refreshBtn が維持し、タップ動作だけパネル開閉に変更した。
- **音量パネル**: `#snd-panel`（左上・幅248px・ダークUI）。BGM スライダーは input のたびに `setBgmVol` で再生中の曲へ即時反映、SE スライダーは input で反映し change（離したとき）にタップ音を1回プレビュー。パネル内のミュートボタンで切替。画面外 pointerdown で閉じる（タップ先の操作は妨げない）。状態は従来どおり localStorage `onw.sound.v1` の `cfg` が唯一の正で、ルーム設定モーダルのスライダー・ミュートとも同じ setter を使うため双方向に連動する（設定行は存続させ、二重管理にはなっていない）。
- 音が鳴らない環境でもゲームが止まらない防御的実装は従来どおり（全処理 try/catch）。

### 検証結果

- `node --check`: js/sound.js・js/ui.js OK。
- モックテスト `_wip/soundUiCheck.js`（DOM/Audio/localStorage スタブ）: 全28項目 OK。内訳: 初期値、setter の反映と保存、パネル⇔API の双方向連動、開閉と外タップでの閉じ方、スライダー input の即時反映、SE プレビュー、タップ音の発音・70ms間引き・除外（スライダー/無効ボタン/対象外）、ミュート連動とアイコン切替、ロック解除前の BGM 保留→初回タップでの再生開始とそのタップ自体のタップ音。
- `se_tap.mp3`: ffprobe で MP3 / 44100Hz / モノラル / 0.09秒 を確認（パック側・本体側とも）。
- index.html: `#snd-btn` は左上の1つだけ（右上に残っていないこと、onclick が togglePanel であること）を確認。
- 既存検証の回帰: vanityCheck / hackBorrowCheck / hackFuzzCheck / hackPublicCheck / silverWolf3Check / synergyAutoCheck / synergyRequiredCheck / observeSynergyCheck を再実行し、すべて従来どおり OK（新規の失敗なし）。
- **ブラウザ実機での発音・レイアウト確認は未実施**（モック環境でのロジック確認まで）。

---

## 追記（2026-11-25）: めくりSEの追加配線／天秤SEのタイミング修正／BGM全面リニューアル

作者フィードバック3点（配布時・能力時にカードがめくれる時もめくりSEが欲しい／天秤SEが発動よりズレている／BGMが全体的に怖くて不気味なのは嫌）に対応した。

### 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `js/ui.js` | `ui.dealFlipSe` を追加し、配布画面（renderOnlineRole / renderSpecDeal）でめくり時刻に card_flip を予約 |
| `js/roles/neutral/shuffler.js` | ゴーストカードがめくれる瞬間に card_flip を直接鳴らす |
| `js/net.js` | libra SE を vote_start から libraflash 受信時へ移動（dictator は vote_start のまま） |
| `audio/bgm/*.mp3`（13件） | 明るい雰囲気に全面リニューアルした新音源に差し替え（パック側で再生成したものと同一） |
| `~/workspace/onww_soundpack/generate_sounds.py` | 明るい音色の楽器（marimba / musicbox / piano_note / strum / warm_pad）を追加し、BGM13曲の生成関数を全面書き換え。main に引数フィルタ（`bgm` / `se` のみ再生成）を追加 |
| `~/workspace/onww_soundpack/bgm/*.mp3`（13件） | 再生成して差し替え（SE はハッシュ不変＝無変更を確認） |
| `~/workspace/onww_soundpack/README.md` | BGM対応表の狙いを新曲に合わせて更新、SE表にタップ音を追加（18種）、検証数値を更新 |
| `_wip/flipSeCheck.js` | 新規の静的チェック（全14項目） |
| `docs/sound.md` | card_flip / libra のフック説明を更新、BGMリニューアルの注記を追加 |

### 1. めくりSE（配布・能力時）— 原因と対処

コード調査で特定した「鳴らなかった経路」は次の2つ（どちらも stage.paint の裏→表検出 `sound.noteFlip` を通らない）:

- **役職配布フェーズ**: 配布画面（ui.renderOnlineRole ／ 観戦用 renderSpecDeal）は CSS アニメーション（`.dl-flipper` の animation-delay 制御）だけで描かれ、stage のテーブルを一切通らない。そのため noteFlip が発火せず無音だった。
  → 対処: `ui.dealFlipSe(game, times)` を新設。描画側が計算しているめくり時刻（本人: flip1＝裏→役職、flip2＝変化前→変化後、flipL＝→恋人／観戦: 全員分を時刻ごとに集約）に対して、dealStart からの残り時間を setTimeout で予約して `ONW.sound.se("card_flip")` を鳴らす。二重防止は「同じ dealStart では1回だけ予約」するガード（再描画で何度呼ばれても重ならない）。途中参加・再入室で途中から見た場合は、すでに過ぎためくり時刻（-0.15秒より前）は鳴らさない＝stage 側の「初回同期では鳴らさない」方針と一致。予約後に別の試合へ移ったら鳴らさない（dealStart の一致を確認）。
- **シャッフラーの朝演出**: 山札から引いたカード（ゴーストカード）は body 直下に作る一時要素で、`classList.add("up")` で直接めくるため paint の検出が効かず無音だった。
  → 対処: ゴーストがめくれる瞬間（LIFT 経過時）に card_flip を直接鳴らす行を追加。なお演出の後半で本物の席が表になる部分は従来どおり paint 経由で鳴る（視覚的にも2回めくれる演出なので、音も2回で一致）。

その他の能力時のめくりは、調査の結果すでに paint 経由で配線されていた（鳴る設計）: 夜の始まりの開示（stageNight フック: 神・大狼・共有者・恋人など）、朝の演出（playMorning の peek / swap / シャッフラー以外の stageMorning、後覚者 show）、昼能力の公開演出（stageFlash: ヴァニティの気づき・スター・女王・フリーター等）、酔い覚め（soberFlash / soberPeek）、妖狐の呪殺・連鎖（fox.flipUp）、コスプレイヤーの3枚（席として paint される）、観戦者の全開示（specSync）、結果発表。いずれも noteFlip の集約（180ms）で同時多発は1回にまとまる。再入室・途中参加の初回同期で鳴らさない仕様も従来どおり。

### 2. 天秤SEのタイミング — 原因と対処

- 発動の流れ: ホスト `hostLibra` が全員へ `libraflash` を送信 → 各画面で大きな⚖️（ui.libraFlash）が表示 → `LIBRA_FLASH_MS`（2300ms）後に `toVote()` → `vote_start` が届いて投票開始。従来 SE は vote_start 受信時に鳴らしていたため、**発動表示から約2.3秒遅れて**聞こえていたのがズレの原因。
- 対処: libra SE を `libraflash` の受信ハンドラ（⚖️表示と同一処理内）へ移し、vote_start 側からは外した。送信は sendAll＋sendSpec でホスト自身の席にもループバックされるため、ホスト・参加者・観戦者・CPU戦（net経由）すべて同じタイミングで鳴る。再入室時に作り直される vote_start では鳴らない（発動表示が無いので正しい）。
- **独裁は据え置き**: 独裁には libraflash のような先行演出メッセージが無く、`hostDictate` の vote_start 受信＝宣言が画面に出る瞬間なので、従来位置のままでタイミングが合っている。報告書に明記するため、コード側のコメントもその旨に更新した。

### 3. BGM全面リニューアル

- 方針: 全13曲を長調中心に作り直し。音色はマリンバ／オルゴール／ピチカート／ウクレレ風ストラム／軽いピアノ／明るめパッドが中心。不協和音・短調ドローン・低音のうなり・半音の刺し音・重いオルガンを全曲から排除した。場面の役割差は維持（夜=静かで眠たくなる優しい子守歌風、投票=軽快なドキドキ、公爵会議=少しコミカルな行進曲風の威厳、バランサー=3拍子ワルツ、名探偵=ピチカートの軽妙さ、結果発表=ファンファーレ的な上昇アルペジオ）。
- 生成: `generate_sounds.py` に新楽器（marimba / musicbox / piano_note / strum / warm_pad）を追加し、BGM関数を全面書き換え。`python3 generate_sounds.py bgm` で BGM のみ再生成し、パック側 `bgm/` と本体 `audio/bgm/` の両方を差し替えた（md5 一致を確認）。ファイル名・形式（MP3 / 44100Hz / モノラル / 128kbps）・長さ（36秒、balancer のみ 34.2秒）は従来どおり。
- SE には一切触っていない: 再生成前に記録した SE 18ファイルの md5 が再生成後も全て一致することを確認した。

### 検証結果

- `node --check`: js/ui.js・js/net.js・js/roles/neutral/shuffler.js・js/sound.js すべて OK。
- 新規静的チェック `_wip/flipSeCheck.js`: 全14項目 OK（dealFlipSe のガード・過去時刻の抑止・本人/観戦の配線、ゴーストカードの直接配線、noteFlip の維持、libraflash での発音・vote_start での不発・独裁の据え置き）。
- モックテスト `_wip/soundUiCheck.js`: 従来どおり全部 OK。
- BGM: 13曲すべて ffprobe で MP3 / 44100Hz / モノラル / 34.2〜36.0秒 を確認。ffmpeg volumedetect で全曲 mean_volume ≈ -17.8dB・max_volume -1.5〜-5.9dB（ピーク 0.51〜0.84）＝無音なし・クリッピングなし。
- 既存検証の回帰: vanityCheck / hackBorrowCheck / hackFuzzCheck / hackPublicCheck / silverWolf3Check / synergyAutoCheck / synergyRequiredCheck / observeSynergyCheck / shufflerSwapCheck を再実行し、すべて従来どおり OK（新規の失敗なし）。
- **聴感確認（実際に聴いての確認）とブラウザ実機での発音確認は未実施**（波形・音量の機械確認とコード上の配線確認まで）。

## 追記（2026-11-25）: BGMを「魔王魂」のフリーBGMへ全面差し替え

作者の希望により、BGM 13曲すべてをフリー音楽素材「魔王魂」（作曲: 森田交一）の楽曲に差し替えた。SE は従来の手続き生成のまま無変更。選曲は前回フィードバック（怖い・不気味なのはNG、明るく親しみやすく）を最優先し、公式サイトのタグ・説明文から選定した。

### 取得方法

- タイトル曲は作者がアップロードしたファイル（`maou_bgm_piano41...mp3`）を使用。ffprobe で確認: MP3 / 44100Hz ステレオ / 160kbps / 85.1秒。公式カタログの「ピアノ41 -Last daily sound 2-」（尺 1:25）と一致する正規の魔王魂音源だった。
- 残り12曲は現行公式サイト **maou.audio** からダウンロードした。旧公式サイト（maoudamashii.jokersounds.com）はこの実行環境から接続が切断され取得できなかったが、maou.audio が現在の公式サイトであり、同じカタログ・同じファイル名体系（maou_bgm_*）で提供されている。
- 取得上の注意: `/dl/<曲ID>/maou_bgm_*.mp3` は Referer 等のブラウザ相当ヘッダーが無いと曲ページへリダイレクトされる。ブラウザ相当ヘッダーを付けると実ファイル（`/sound/bgm/...` へ302）を取得できた。全12曲ともカタログ表示の尺と一致し、md5 は全て相異なることを確認。

### 採用曲一覧

| 場面 | ファイル | 原曲（魔王魂） | 長さ | 選曲理由（公式タグ・説明より） |
|---|---|---|---|---|
| タイトル | bgm_title.mp3 | ピアノ41「Last daily sound 2」 | 75.5s | 作者選曲（アップロード品） |
| ロビー | bgm_lobby.mp3 | ピアノ10「ナニゲナイニチジョウ」 | 47.0s | のんびり・元気・明るい |
| 夜 | bgm_night.mp3 | ピアノ01「湖に浮かぶ月」 | 84.5s | リラックス・安心・眠り。静かで優しいピアノ |
| 朝 | bgm_morning.mp3 | ヒーリング15「水平線の使者」 | 129.3s | 爽やか・穏やか（ギターとピアノ） |
| 変化公開中 | bgm_transform.mp3 | ピアノ32「脈動」 | 76.7s | クライマックス・勇気 |
| 昼（生存） | bgm_day_alive.mp3 | ピアノ06「パピー」 | 116.3s | のんびり・元気・明るい |
| 昼（死亡・観戦） | bgm_day_dead.mp3 | ヒーリング08「人魚の恋心」 | 107.7s | ハープ主体の静かな曲 |
| 投票 | bgm_vote.mp3 | ピアノ36「宿命のシナリオ」 | 128.6s | 作戦会議。やや厳かなピアノ |
| 公爵会議 | bgm_duke.mp3 | オーケストラ07「レディーのお茶会」 | 43.3s | バロック風・貴族・高貴（重すぎない威厳） |
| バランサー | bgm_balancer.mp3 | アコースティック44「Merry-go-round」 | 86.5s | かわいい三拍子ワルツ |
| 名探偵推理 | bgm_detective.mp3 | ピアノ27「カクテル光線」 | 65.0s | ブルージーなジャズピアノ（静かなバー風） |
| 結果発表 | bgm_result_reveal.mp3 | オーケストラ14「終わりと始まり」 | 61.8s | オープニング向けオーケストラ（壮大・感動） |
| リザルト | bgm_result_screen.mp3 | ヒーリング13「帰路へ」 | 129.0s | ハッピーエンド・回想（夕日のような締めくくり） |

- 取得できなかった場面: **なし**（全13場面を差し替え完了）。
- 代替候補メモ: 名探偵は「ピアノ17『誰も知らない雪の城』」（タグに探偵・推理そのもの）も有力。シリアス寄りのピアノなので、軽妙さ優先でピアノ27を採用した。差し替え希望があれば1ファイルで済む。

### 変換仕様

- 全曲: MP3 / 44100Hz / モノラル / 128kbps に変換。
- ループ用に末尾の無音（-50dB以下の区間）を詰め、末尾に約0.5秒の余韻を残した。タイトルは曲頭の無音（約0.9秒）も詰め、0.7秒〜76.2秒を採用。
- 音量は旧BGMの基準（平均 -17.8dB）に合わせ、変換後実測で平均 -18.2〜-18.4dB に統一。タイトルのみピーク制限（原曲の最大音が大きい）ため -20.6dB。ピークは全曲 -0.8〜-6.5dB でクリッピングなし。
- 配置先: 本体 `audio/bgm/` と単体パック `~/workspace/onww_soundpack/bgm/` の両方（同一ファイル、md5 一致を確認）。
- ⚠️ パック側の `generate_sounds.py bgm` を実行すると旧・合成版BGMで上書きされる。README に警告を明記した。

### ライセンス確認結果（2026-11-25、https://maou.audio/rule/ で確認）

- 魔王魂の現行規約は「著作権フリー」ではなく利用条件付きフリー素材だが、条件は非常に緩い: 商用・非商用とも無料、許可・報告不要、改変・加工OK。
- クレジット表記「音楽：魔王魂」は**必須ではない**（公式FAQで明言）。ただし公式が「書いてくれると嬉しい」と推奨している。
- 禁止事項は3点のみ: ①自作と偽ること（JASRAC等への登録含む） ②曲そのものを素材として再配布・販売すること ③AIによるアレンジ・学習に使うこと。本対応の形式変換・トリミング・音量調整は②③には当たらない（作品への組み込みと手作業の加工）。
- ⚠️ 注意点: 単体サウンドパックは「BGMのMP3を集めただけ」の形に近いため、**パック単体をそのまま公開・配布すると ② に抵触する可能性**がある。ゲームに組み込んだ形での公開は問題ない。パックは作者の手元用として扱うのが安全。
- **提案（未実施）**: 義務ではないが、ゲーム内のクレジット（タイトル画面のフッターや設定・ヘルプ内）に「音楽: 魔王魂 https://maou.audio/ 」の一行を入れることを推奨する。公式が推奨する表記であり、感謝の明示にもなる。今回は実装していない（次回対応候補）。

### 検証結果

- 差し替え13曲すべて ffprobe で MP3 / 44100Hz / モノラル / 128kbps を確認。無音ファイルなし（volumedetect で全曲の平均・最大音量を確認）。
- `node --check js/sound.js` OK。再生まわりのコード変更はなし（ファイル名は従来どおりのため差し替えのみで動作）。
- 既存検証: vanityCheck / soundUiCheck / flipSeCheck / cpuQuietCheck を再実行し、すべて従来どおり「全部 OK」（新規失敗なし）。
- ブラウザ実機での発音確認は未実施。

## 追記（2026-11-25）: 昼（生存）BGMを変化公開と同一曲に＋変化公開の行ごとSE追加

作者の追加要望2点に対応した。

### 1. 昼（生存）のBGMを変化公開中と同じ曲に

- 作者指定「もともとの変化公開のBGMを昼生存でもかける形」に従い、`bgm_day_alive.mp3` の中身を `bgm_transform.mp3`（魔王魂 ピアノ32「脈動」）と同一に差し替えた。本体 `audio/bgm/` とパック `bgm/` の両方で、transform と day_alive の md5 一致（388a7e92…）を確認。これまで昼（生存）だったピアノ06「パピー」は未使用になった。
- **継続再生の確認と調整**: 従来の `js/sound.js` は曲名が違うと別トラック扱いでクロスフェードし直すため、変化公開の紙が出ている間の hold（transform）→ 終了後の release → 昼（day_alive）復帰で、同じ曲なのに頭から再生し直される問題があった。最小限の調整として `sound.js` にファイル解決マップ `BGM_FILE = { day_alive: "transform" }` を追加し、(a) day_alive は bgm_transform.mp3 を読み、(b) 曲名が違っても同じファイルに解決される間は「同じ曲」として継続するようにした。モックテスト `_wip/bgmSameTrackCheck.js`（全12項目 OK）で、transform 再生中に day_alive へ切り替えても src を張り替えず再生位置が保たれること、hold→release（昼）でも継続すること、別ファイルの曲（vote）へは通常どおりクロスフェードすることを確認した。

### 2. 変化公開で「文字が出るごと」に鳴るSE（新規 se_reveal_text）

- 新規SE `se_reveal_text.mp3` を手続き合成で作成（0.28秒 / MP3 / 44100Hz / モノラル / 128kbps）。柔らかいポップ（サインのグライド 660→1180Hz）＋オルゴールの2音チャイム（E6→A6）で「ポンッ/キラッ」系の明るいアクセント音。行ごと（0.75秒間隔）に連続して鳴るため、書き出しピークは 0.5 に抑えた。生成関数はパック側 `generate_sounds.py` の `se_reveal_text()`（SE_LIST・SE_PEAK に登録済み。再生成で消えない）。
- **配線箇所**: 変化公開の紙は `js/stage.js` の `stage.paper(lines)` が描き、各行は CSS アニメーション（`--d` = `start(i)` = 0.55 + i×0.75 秒）で1行ずつ書き出される一括描画方式だったため、描画側の出現時刻に合わせた予約方式（配布SEの dealFlipSe と同じ考え方）で配線した。`stage.paper` 内で各行 i について `paperTimers` に `setTimeout(() => ONW.sound.se("reveal_text"), start(i) * 1000)` を予約する。
  - スキップ（fly）・終了（finishPaper）で paperTimers がクリアされれば予約も一緒に消える（飛ばした後の行では鳴らない）。
  - 紙は `g.tfShown` のガードで最初の1回だけ表示され、再入室・途中参加の resync では net.js が tfShown=true にするため、復元表示では鳴らない。
  - 行が無い（変化なし）場合は予約しない。同時多発は SE 共通の45ms間引きに乗るが、行間隔は0.75秒なので通常は行ごとに1回鳴る。
- SE の登録はファイル名規約（`ONW.sound.se("reveal_text")` → `audio/se/se_reveal_text.mp3`）で、本体・パック両方にファイルを配置した（md5一致 7040fe82…）。

### 変更ファイル

- `audio/bgm/bgm_day_alive.mp3`（本体）・`~/workspace/onww_soundpack/bgm/bgm_day_alive.mp3`: transform と同一内容に差し替え
- `audio/se/se_reveal_text.mp3`（本体・新規）・`~/workspace/onww_soundpack/se/se_reveal_text.mp3`（新規）
- `js/sound.js`: `BGM_FILE` / `bgmFile()` を追加し、crossfadeTo の src 解決と bgm() の同一曲判定に使用
- `js/stage.js`: `stage.paper` に行ごとの reveal_text SE 予約を追加
- `~/workspace/onww_soundpack/generate_sounds.py`: `se_reveal_text()` と SE_LIST / SE_PEAK への登録
- `_wip/revealTextSeCheck.js`（新規・静的チェック全10項目 OK）・`_wip/bgmSameTrackCheck.js`（新規・モック全12項目 OK）
- `docs/sound.md`・パック `README.md`・本報告書: 対応表と注記を更新（SE は 19種に）

### 検証結果

- `node --check`: js/sound.js・js/stage.js とも OK。
- 新規チェック: revealTextSeCheck 全10項目 OK / bgmSameTrackCheck 全12項目 OK。
- 既存検証の回帰: vanityCheck / soundUiCheck / flipSeCheck / cpuQuietCheck を再実行し、すべて従来どおり「全部 OK」（新規失敗なし）。
- 新規SEは ffprobe で MP3 / 44100Hz / モノラル / 128kbps / 0.28秒 を確認（ピーク 0.5 で無音でないことも生成時に確認）。
- **ブラウザ実機での発音確認は未実施**（モック・静的チェックとコード上の配線確認まで）。

## 追記（2026-11-25）: カードが裏に戻る時もめくれる音を鳴らす

作者要望「カードが裏に戻る時もめくれる音ほしい」への対応。従来 card_flip は裏→表（めくれる時）だけだった。

### 調査結果（裏戻りが起きる場面の一覧）

stage 上の表→裏遷移は、すべて `up[k]` の削除＋ `stage.paint` 経由であることを確認した（役職ファイル19本の `delete SK.up` / stage.js 内の伏せ処理を全数確認）。主な場面:

- 昼の公開演出（stageFlash）の終了時: スター・女王・フリーター・訪問者・心眼の人狼・感覚の占い師・人狼王・姫君・狂信者・妖狐・封印の狂人 等と、**ヴァニティの気づき演出**（自分のカードがヴァニティとしてめくれて数秒後に裏に戻る）
- 酔い覚め演出（soberFlash / soberPeek）の終了時（自分のカード・相方・見えたカードが伏せられる）
- 朝に表だったカード（占い結果など morningUp）が昼になって伏せられる時
- 夜が終わって神・大狼などのカード（nightKeys）が伏せられる時
- 待機時間の公開（stageSettle）の札外し・コスプレイヤーの選ばなかった2枚が裏返って山札へ戻る時
- シャッフラーで対象の席に置かれたカードが裏面に戻る時、アサシン/賞金稼ぎの選択中に隠されたカードの戻り、観戦の表示切り替え

paint を通らない裏戻りは**無かった**: 配布画面（dl-flipper）は表→別の表への差し替え（dl-in/dl-out）のみで裏には戻らない。シャッフラーのゴーストカードはめくれたあと要素ごと除去される（裏戻りなし）。そのため個別フックの追加は不要で、検出の双方向化だけで全場面をカバーできる。

### 実装

- `js/sound.js`: `noteFlip` を双方向化（裏→表／表→裏どちらの変化でも card_flip。同時多発の集約 180ms は双方向で共有）。あわせて `resetFlips()`（記録全消し）と `forgetFlip(k)`（1席分だけ消す）を追加し ONW.sound に公開。
- `js/stage.js`: テーブルの破棄（sync の非表示分岐）と再構築（キー変化→ build）の直後に `ONW.sound.resetFlips()` を呼ぶ。コスプレイヤーの3枚は席要素だけが破棄・再作成されるため、`cosClear` と `cosEnsure`（作り直し時）で `forgetFlip("c:i")` を呼ぶ。

### 鳴らさないケース（従来の無音方針を維持）

- 初回同期・再入室・途中参加時の復元（初見の席は従来どおり音なしで基準だけ覚える）
- テーブル自体が破棄・作り直された直後の表示（resetFlips で記録を消すため、前の試合で表だったカードが新しい卓で裏で現れても「裏戻り」と誤検出しない）
- 席要素の消去そのもの（コス席の撤去など。forgetFlip で記録を消す）

### 変更ファイル

- `js/sound.js`: noteFlip 双方向化、resetFlips / forgetFlip の追加と公開、ヘッダコメント更新
- `js/stage.js`: sync の破棄・再構築時に resetFlips、cosClear / cosEnsure で forgetFlip、paint の noteFlip コメント更新
- `_wip/flipBackSeCheck.js`（新規）: 静的6項目＋モック動的11項目
- `docs/sound.md`: card_flip 行を双方向の説明に更新

### 検証結果

- `node --check`: js/sound.js・js/stage.js とも OK。
- 新規チェック flipBackSeCheck: 静的・モックとも全部 OK（初見は無音、裏戻りで発音、双方向の集約、resetFlips / forgetFlip 後の誤検出なしと本物の裏戻りの発音を確認）。
- 既存検証の回帰: vanityCheck / soundUiCheck / flipSeCheck / revealTextSeCheck / bgmSameTrackCheck / cpuQuietCheck を再実行し、すべて従来どおり「全部 OK」（新規失敗なし）。
- **ブラウザ実機での発音確認は未実施**（モック・静的チェックとコード上の配線確認まで）。

## 追記（2026-11-25）: カードを配る・置くSE（新規 se_deal）

作者の要望「カードを配ったり置く時のSEが欲しい（役職配布時／コスプレイヤーとなのかの配布時／シャッフラーやグレムリンなどでカードを置くときも含めて）」への対応。

### 音源

- 新規SE `se_deal.mp3` を手続き合成で作成（0.30秒 / MP3 / 44100Hz / モノラル / 128kbps）。構成: 紙のカードが卓を滑る「シュッ」という帯域ノイズ（2400→800Hz へスイープ）＋着地の柔らかい「パタッ」（低域ノイズのバースト＋150→85Hz へ沈む低いサイン）。めくり音（card_flip の上げるスウィッシュ）とは帯域・向き・着地音の有無で聞き分けられる別音にした。
- 配布演出では 0.28〜0.3秒間隔で連続して鳴るため、書き出しピークは 0.7 に抑えた（SE_PEAK に登録）。
- 生成はパック側 `generate_sounds.py` の `se_deal()`（SE_LIST・SE_PEAK に登録済み）。**BGM の再生成は行っていない**（魔王魂の曲を守るため、モジュールを import して se_deal だけを生成し、本体・パック両方の `se/se_deal.mp3` に配置。md5 一致 b8f96818…）。これで SE は **20種**。
- 本体側の登録は従来どおりファイル名規約のみ（`ONW.sound.se("deal")` → `audio/se/se_deal.mp3`。sound.js の SE プール・45ms 間引きがそのまま効く）。sound.js はヘッダコメントに deal の配線先を追記しただけ。

### 配線箇所（すべてクライアント側の演出の着地の瞬間）

| 場面 | ファイル | タイミング |
|---|---|---|
| 役職配布（参加者） | js/ui.js `ui.dealPlaceSe`（新規。dealFlipSe と同じ予約方式・同じ配布では1回だけ・過ぎた時刻は鳴らさない） | 各カードの着地 = 飛び始め（墓地 0.4+0.3i / 全員 pStart+0.28i）＋飛行時間（通常 0.55s、自分の大きなカードは 0.75s） |
| 役職配布（観戦） | js/ui.js renderSpecDeal → `ui.dealPlaceSe` | 同上（全カード 0.55s） |
| コスプレイヤー／なのかの3枚配布 | js/stage.js `cosEnsure`（faceUp でない出し直し時のみ） | 最初の1枚の着地（520ms）に1回だけ。3枚で1回の配布として集約 |
| シャッフラー | js/roles/neutral/shuffler.js stageMorning | ゴーストカードが対象の席に重なる瞬間（LIFT+FLIP+FLY） |
| グレムリン | js/roles/neutral/gremlin.js stageMorning | コピーがコピー先の席に着地する瞬間 |
| ドッペルゲンガー | js/roles/neutral/doppelganger.js stageMorning | コピーが自分の席に着地する瞬間 |
| 怪盗・墓荒らし | js/stage.js `swap`（両役職の stageMorning が共用） | 入れ替わった2枚が両方の席に着地する瞬間（1050ms の着地コールバック。2枚同時なので1回） |
| いたずらっ子 | js/roles/village/troublemaker.js stageMorning | 入れ替わった2枚が相手の席に着地する瞬間（1200ms。1回） |
| コスプレイヤー／なのか（朝の演出） | js/roles/village/cosplayer.js / js/roles/neutral/nanoka.js の stageMorning | 選んだカードが自分の席に着地する瞬間（1200+900ms） |

### 既存SEとの重なりへの配慮

- 配布画面: deal は着地（〜配布終了まで）、flip はその後（flip1 = 配布終了＋0.4s 以降）で時間帯が重ならない。
- コスプレ3枚: deal は最初の着地（520ms）に1回、flip は各枚のめくれ（560ms〜）で、わずかにずらしてある。
- 朝演出の着地では、席のカードが新しい役職でめくれる flip と deal が同じ瞬間に重なる場面がある（シャッフラー・コスプレ・なのか等）。「置く」と「めくれる」は実際のカード操作でも同時に起きるため、別音の重なりとして許容した（どちらも短く、deal はピーク 0.7 に抑制）。
- 同時に複数枚が置かれる場面（swap・いたずらっ子の2枚）は呼び出し自体を1回に集約。
- 結果発表（card_fly 等の既存SEがある場面）・観戦の盤面同期（specSync の弧）・票バッジの移動（交換者）など、カードの「配置」ではない／既存SEのある場面には重ねていない。
- アニメーションが無いフォールバック経路（要素が見つからない等）では鳴らさない（シャッフラーの従来方針と同じ）。

### 変更ファイル

- `audio/se/se_deal.mp3`（本体・新規）・`~/workspace/onww_soundpack/se/se_deal.mp3`（新規）
- `~/workspace/onww_soundpack/generate_sounds.py`: `se_deal()` と SE_LIST / SE_PEAK への登録
- `js/sound.js`: ヘッダコメントに deal の配線先を追記（仕組みの変更なし）
- `js/ui.js`: `ui.dealPlaceSe` 新規＋配布2画面から着地時刻を渡す
- `js/stage.js`: cosEnsure（3枚配布）と swap（怪盗・墓荒らし）の着地に配線
- `js/roles/neutral/shuffler.js`・`js/roles/neutral/gremlin.js`・`js/roles/neutral/doppelganger.js`・`js/roles/village/troublemaker.js`・`js/roles/village/cosplayer.js`・`js/roles/neutral/nanoka.js`: 各 stageMorning の着地に配線
- `docs/sound.md`・パック `README.md`: 対応表に se_deal を追記（SE は 20種に）

### 検証結果

- `node --check`: 変更した全 .js（sound.js / ui.js / stage.js / shuffler / gremlin / doppelganger / troublemaker / cosplayer / nanoka / soundUiCheck）OK。
- `_wip/soundUiCheck.js`: deal の動的チェック（se("deal") で se_deal.mp3 が再生される）＋静的配線チェック（音源ファイルの存在・全配線箇所）を追加し、全部 OK。
- 既存検証の回帰: nanokaCheck / cosplayerCheck / cosplayerCpuCheck / shufflerSwapCheck / coExposeGremlinCheck / flipSeCheck / flipBackSeCheck / revealTextSeCheck / bgmSameTrackCheck / cpuQuietCheck は全部 OK。先行移植スイート（vanity 5・beggar 6・magicalGirl 7・matthias 7・chesed 5・youri 5）の FAIL 件数は従来の末尾前提のずれと完全一致し、新規の機能的失敗なし。
- 音源: ffprobe で 44100Hz / モノラル / 128kbps / 0.30秒 を確認。パック側の既存 SE・BGM は再生成していないため無変更（生成は se_deal のみ）。
- **ブラウザ実機での発音確認は未実施**（静的チェックとコード上の配線確認まで）。
