/**
 * config.js — アカウント機能の設定（ここだけ書き換えます）
 * ------------------------------------------------------------
 * Supabase ダッシュボード > Project Settings > API に書いてある
 *   ・Project URL
 *   ・anon public キー（"anon" "public" と書いてある方）
 * をコピーして、下の2つの "" の中に貼り付けてください。
 *
 * ★ service_role キーは絶対にここへ貼らないでください（公開されて全データを抜かれます）。
 * ★ anon キーは公開前提のキーなので、GitHub に置いても問題ありません（守っているのはRLSです）。
 *
 * 2つとも空のままなら、アカウント機能は表示されず、今まで通り名前だけで遊べます。
 */
window.ONW = window.ONW || {};
ONW.config = {
  SUPABASE_URL: "",        // 例: "https://xxxxxxxxxxxx.supabase.co"
  SUPABASE_ANON_KEY: "",   // 例: "eyJhbGciOi..." （anon public）

  // ログインIDを裏で「<ID>@<このドメイン>」というメール形式に変換して Supabase Auth に渡します。
  // 実在しないドメインなのでメールは一切送られません。
  // ・変更するとすでに作ったアカウントでログインできなくなるので、最初に決めたら変えないこと。
  // ・"Email address is invalid" と出て登録できないときは docs/supabase-setup.md の「困ったとき」を見てください。
  EMAIL_DOMAIN: "onw.invalid",
};
