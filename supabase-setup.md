# Supabase 設定手順書（アカウント機能）

所要時間: 15〜20分。**コードを書き換えるのは `js/config.js` の2か所だけ**です。
画面の名称は Supabase の更新で少し変わることがあります。見つからないときは近い名前の項目を探してください。

---

## 手順1. プロジェクトを作る

1. https://supabase.com にアクセスして **Start your project** → GitHub などでサインイン。
2. **New project** をクリック。
   - **Name**: 好きな名前（例: `onw`）
   - **Database Password**: **Generate a password** で作って、パスワード管理アプリなどに控える（このアプリのコードでは使いません）
   - **Region**: 日本のプレイヤーが多いなら **Northeast Asia (Tokyo)**
   - **Plan**: Free
3. **Create new project** → 1〜2分待つ。

## 手順2. 新規登録を許可する

左メニュー **Authentication** → **Sign In / Providers**（旧: Providers）。

- 上の方にある **User Signups**（Allow new users to sign up）が **ON** になっていること。
- **Anonymous Sign-Ins** は **OFF** のままでOK。

## 手順3. 「Confirm email」を OFF にする（重要）

同じ **Sign In / Providers** 画面で **Email** を開く。

1. **Confirm email** を **OFF** にする。
   - ONのままだと、アカウント作成後に確認メールの承認待ちになり、ログインできません（このアプリは疑似メールなので、確認メールは届きません）。
2. （推奨）**Minimum password length** を **8** にする。画面に項目が無い場合は、アプリ側でも8文字未満を弾いているのでそのままで大丈夫です。
3. **Save** を押す。

## 手順4. SQL を実行する

1. 左メニュー **SQL Editor** → **New query**。
2. 配布物の `supabase/setup.sql` を**すべてコピーして貼り付け**。
3. 右下の **Run**（または Ctrl+Enter）。
4. 下に `Success. No rows returned` と出ればOK。エラーが出たら、赤字の内容をそのままコピーして相談してください。
   - 何度 Run しても壊れない作りです（やり直しOK）。
   - このSQLが作るもの: テーブル `profiles / friendships / invites / reports`、RLS、ユーザー作成時に `profiles` を自動作成するトリガー、Storage の `avatars` バケット（公開読み取り・100KB・PNGのみ）と本人専用の書き込みポリシー、Realtime 対象テーブルの登録。

## 手順5. 確認（SQLが効いているかを目で見る）

- **Storage** → バケット **avatars** があり、「Public」と表示されている。
  - もし無ければ: **New bucket** → 名前 `avatars` → **Public bucket** をON → **Restrict file size** 100 KB、**Allowed MIME types** `image/png` → Create。（ポリシーはSQL側で作成済み）
- **Database** → **Publications** → `supabase_realtime` の Tables に **friendships** と **invites** が入っている。
  - 無ければ、そのテーブルのスイッチをONにする。
- **Authentication** → **Policies**（または Database → Tables）で、`profiles / friendships / invites / reports` に **RLS enabled** と出ている。
- オンライン状態（Presence）は設定不要です。

## 手順6. URL と anon キーをコピー

左下の歯車 **Project Settings** → **API**（新しい画面では **API Keys**）。

- **Project URL**（`https://xxxxxxxx.supabase.co`）
- **anon public** キー（新しい画面では **Publishable key** と呼ばれることもあります。どちらも、ブラウザに置いてよい公開用のキーです）

> ⚠ **`service_role`（secret）キーは絶対にコピーしないでください。** コード・README・GitHub・チャットのどこにも貼らないこと。漏れると全データを抜かれます。

## 手順7. js/config.js に貼る

```js
ONW.config = {
  SUPABASE_URL: "https://xxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOi....（anon public）",
  EMAIL_DOMAIN: "onw.invalid",   // 変えない
};
```

GitHub に push → GitHub Pages が更新されたら完了です。
2つとも `""` のままなら、アカウント機能は出ず今まで通り名前だけで遊べます。

## 手順8. 動作確認チェックリスト

1. トップ右上に「ログイン」が出る → 「アカウント作成」でIDとパスワードを入れて作成できる
2. アカウント画面で表示名を変え、アイコン画像を選ぶと反映される（再読み込みしても残る）
3. 別の端末/別のブラウザでもう1つアカウントを作り、片方からIDでフレンド申請 → もう片方で承認
4. 片方でルームを作り、ロビーの「フレンドを招待」→ もう片方に「〇〇さんから招待が届きました」が出て、[参加] で部屋に入れる
5. ロビー・配役演出・COボードにアイコンが出る（無い人は頭文字の丸のまま）
6. ログアウトしてもゲストで遊べる

---

## 困ったとき

| 症状 | 原因と対処 |
|---|---|
| 登録で「このIDは登録できませんでした（管理者向け: メール形式…）」 | `.invalid` 付きの疑似メールを Supabase が受け付けない場合があります（メール形式の検査が厳しい設定のとき）。`js/config.js` の `EMAIL_DOMAIN` を、**自分が管理しているドメイン**（実際にメールを受け取らなくてよい。例: 自分のサイトのドメイン）に変えてください。確認メールは送られません。**公開前に必ず1回テスト登録してください**。変更は最初の一度だけにすること（後から変えると既存アカウントでログインできなくなります）。 |
| 登録後に「Confirm email がONのまま」と出る | 手順3をやり直してください。すでに作ってしまったテストユーザーは Authentication → Users で削除。 |
| 「Database error saving new user」 | `setup.sql` が最後まで実行されていません。手順4をやり直す。 |
| アイコンが表示されない | Storage の `avatars` が Public か確認。アップロード直後はブラウザのキャッシュで古い画像が出ることがあります（URLに更新時刻を付けてあるので通常は即反映）。 |
| 招待・申請がリアルタイムで届かない | 手順5の Publications を確認。ページを開き直すと一覧は最新になります。 |
| 「短時間に操作しすぎました」 | Supabase Auth の制限（同一IPで 5分に30回 まで。公式ドキュメント記載）。しばらく待つ。 |

## 運用メモ

- **通報の確認**: Table Editor → `reports`（アプリからは誰も読めません。ダッシュボードだけで見られます）。`target` がアイコンの持ち主の uuid です。
- **不適切なアイコンの削除**: Storage → `avatars` → その uuid のフォルダを削除。さらに Table Editor → `profiles` で該当行の `avatar_updated_at` を空（NULL）にすると、全員の画面で頭文字の丸に戻ります。
- **ユーザーの削除**: Authentication → Users → 該当ユーザー → Delete。プロフィール・フレンド・招待は連動して消えます（アイコン画像は Storage から手動で削除）。
- **パスワード復旧**: 仕様上できません（メールを持たないため）。忘れたら新しいIDで作り直しです。

---

## 無料枠(Free プラン)の制限 — 2026-10-04 に公式ページで確認

| 項目 | 無料枠 | このアプリでの目安 |
|---|---|---|
| 月間アクティブユーザー(MAU) | **50,000** | 個人〜コミュニティ規模なら十分 |
| データベース容量 | **500 MB** / プロジェクト | プロフィール等は1ユーザー数百バイト。まず問題なし |
| ファイルストレージ | **1 GB** | アイコンは1人100KB以下 → 最大でも約1万人分 |
| 1ファイルの最大サイズ | 50 MB | アプリ側で100KB以下に制限 |
| 転送量(Egress) | **5 GB** / 月（キャッシュ分も別に5GB） | アイコン(最大100KB)の表示で消費。1人あたり数十KB/回 |
| Realtime 同時接続 | **200**（ピーク） | ログイン中の人1人=1接続。**同時に200人ログインまで** |
| Realtime メッセージ | **月200万** | オンライン状態の出入りと招待で消費 |
| Realtime(Presence) | 毎秒20メッセージなどの上限 | このアプリは接続時に1回だけ登録するので問題なし |
| 認証の連続操作 | 同一IPで5分に30回（サインアップ/ログイン） | 学校・会社の同一回線で一斉登録するとき注意 |
| 無料プロジェクト数 | **2** | |
| **自動停止** | **低アクティビティが7日続くと一時停止される場合がある** | 下記参照 |
| バックアップ | 無料枠ではダウンロード可能なDBバックアップなし | 重要データは Table Editor から CSV で書き出しておく |

**一時停止について**: 約1週間ほとんどアクセスがないと、プロジェクトが一時停止されることがあります（公式: "We may pause applications on the Free Plan that exhibit low activity in a 7-day period"）。停止中はログイン等が使えず、ゲストプレイは今まで通り動きます。ダッシュボードから **Restore** で復旧できます（復旧できる期間の上限は、今回確認した公式ページには書かれていませんでした。長期間放置しない方が安全です）。停止を確実に避けるには Pro プラン（有料）が必要です。無料のまま使うなら、週に1回は誰かがログインする、または定期アクセス(ping)を仕込むのが現実的です。

数値は変更されることがあります。最新は下の公式ページで確認してください。

出典:
- [Supabase Pricing](https://supabase.com/pricing)
- [Billing on Supabase（Free プランの内訳）](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Realtime Limits](https://supabase.com/docs/guides/realtime/limits)
- [Auth Rate Limits](https://supabase.com/docs/guides/auth/rate-limits)
- [Going into Production（一時停止・バックアップ）](https://supabase.com/docs/guides/deployment/going-into-prod)
