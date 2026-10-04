-- ============================================================
-- ワンナイト人狼 アカウント機能 用 Supabase セットアップSQL
-- Supabase ダッシュボード > SQL Editor に「まるごと」貼って Run してください。
-- 何度実行しても壊れないように作ってあります（再実行OK）。
-- service_role キーはここにも画面にも一切不要です。
-- ============================================================

-- ------------------------------------------------------------
-- 0. 拡張（gen_random_uuid 用。通常は最初から有効）
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. テーブル
-- ------------------------------------------------------------

-- 1-1. profiles（1ユーザー1行。表示名・アイコンの更新日時を持つ）
create table if not exists public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  user_id           text unique not null,                    -- ログインID（小文字に統一・変更不可）
  display_name      text not null,                           -- 表示名（何度でも変更可）
  avatar_updated_at timestamptz,                             -- アイコンを最後に更新した時刻（NULL=アイコンなし）
  created_at        timestamptz not null default now(),
  constraint profiles_user_id_fmt  check (user_id ~ '^[a-z0-9_]{3,16}$'),
  constraint profiles_display_len  check (char_length(display_name) between 1 and 12)
);

-- 1-2. friendships（フレンド申請と成立）
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references public.profiles(id) on delete cascade,
  addressee  uuid not null references public.profiles(id) on delete cascade,
  status     text not null check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  unique (requester, addressee),
  constraint friendships_not_self check (requester <> addressee)
);
-- A→B と B→A の二重申請を防ぐ
create unique index if not exists friendships_pair_uniq
  on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

-- 1-3. invites（ルームへの招待。10分で無効）
create table if not exists public.invites (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references public.profiles(id) on delete cascade,
  to_user    uuid not null references public.profiles(id) on delete cascade,
  room_code  text not null check (room_code ~ '^[A-Z0-9]{4}$'),
  created_at timestamptz not null default now()
);
create index if not exists invites_to_user_idx on public.invites (to_user, created_at desc);
create index if not exists invites_from_user_idx on public.invites (from_user, created_at desc);

-- 1-4. reports（通報の記録だけ。アプリからは書き込みのみ、読めるのは管理者＝ダッシュボードだけ）
create table if not exists public.reports (
  id         uuid primary key default gen_random_uuid(),
  reporter   uuid not null references public.profiles(id) on delete cascade,
  target     uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'avatar' check (kind in ('avatar','name','other')),
  reason     text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now(),
  constraint reports_not_self check (reporter <> target)
);
create index if not exists reports_target_idx on public.reports (target, created_at desc);

-- ------------------------------------------------------------
-- 2. ユーザー作成時に profiles 行を自動作成するトリガー
--    ・ID/表示名は signUp の options.data（raw_user_meta_data）から受け取る
--    ・メールの @ の前（ローカル部）とIDが一致しないものは拒否（IDの横取り防止）
--    ・IDの重複は profiles.user_id の unique と auth のメール重複で防ぐ
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid text;
  dn  text;
begin
  uid := lower(coalesce(new.raw_user_meta_data->>'user_id', ''));
  if uid !~ '^[a-z0-9_]{3,16}$' then
    raise exception 'invalid user_id';
  end if;
  if split_part(lower(coalesce(new.email, '')), '@', 1) <> uid then
    raise exception 'user_id does not match email';
  end if;
  dn := btrim(coalesce(new.raw_user_meta_data->>'display_name', ''));
  if char_length(dn) < 1 or char_length(dn) > 12 then
    dn := left(uid, 12);
  end if;
  insert into public.profiles (id, user_id, display_name) values (new.id, uid, dn);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3. 招待の連投防止と掃除（cron不要）
--    ・INSERT のたびに 1時間より古い招待を削除
--    ・1分間に10件を超える招待は拒否
-- ------------------------------------------------------------
create or replace function public.invites_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.invites where created_at < now() - interval '1 hour';
  if (select count(*) from public.invites
        where from_user = new.from_user and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'too many invites';
  end if;
  return new;
end;
$$;
revoke all on function public.invites_before_insert() from public, anon, authenticated;

drop trigger if exists invites_before_insert on public.invites;
create trigger invites_before_insert
  before insert on public.invites
  for each row execute function public.invites_before_insert();

-- ------------------------------------------------------------
-- 4. 権限（GRANT）: まず全部外してから必要な分だけ付ける
--    ※ Supabase は初期状態で anon/authenticated に広い権限を付けるため、ここで絞る
-- ------------------------------------------------------------
revoke all on public.profiles    from anon, authenticated;
revoke all on public.friendships from anon, authenticated;
revoke all on public.invites     from anon, authenticated;
revoke all on public.reports     from anon, authenticated;

-- profiles: ログイン済みなら誰でも読める / 更新できる列は表示名とアイコン更新日時だけ
--           （user_id・id は変更不可）。INSERT は上のトリガーだけ。
grant select on public.profiles to authenticated;
grant update (display_name, avatar_updated_at) on public.profiles to authenticated;

-- friendships: 申請(INSERT) / 承認(statusだけUPDATE) / 読み取り / 削除
grant select, insert, delete on public.friendships to authenticated;
grant update (status) on public.friendships to authenticated;

-- invites: 作成 / 読み取り / 削除（UPDATEなし）
grant select, insert, delete on public.invites to authenticated;

-- reports: 書き込みだけ（読めない）
grant insert on public.reports to authenticated;

-- ------------------------------------------------------------
-- 5. Row Level Security (RLS)
-- ------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.friendships enable row level security;
alter table public.invites     enable row level security;
alter table public.reports     enable row level security;

-- ---- profiles ----
drop policy if exists "profiles_select_all"  on public.profiles;
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_self" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---- friendships ----
drop policy if exists "friendships_select_party"  on public.friendships;
drop policy if exists "friendships_insert_self"   on public.friendships;
drop policy if exists "friendships_accept"        on public.friendships;
drop policy if exists "friendships_delete_party"  on public.friendships;
-- 当事者だけ読める
create policy "friendships_select_party" on public.friendships
  for select to authenticated
  using (requester = auth.uid() or addressee = auth.uid());
-- 申請: 自分が requester で、status は pending のときだけ作れる
create policy "friendships_insert_self" on public.friendships
  for insert to authenticated
  with check (requester = auth.uid() and status = 'pending');
-- 承認: 宛先本人だけが pending → accepted にできる（変更できる列は status のみ）
create policy "friendships_accept" on public.friendships
  for update to authenticated
  using (addressee = auth.uid() and status = 'pending')
  with check (addressee = auth.uid() and status = 'accepted');
-- 拒否・取消・フレンド削除: 当事者なら削除できる
create policy "friendships_delete_party" on public.friendships
  for delete to authenticated
  using (requester = auth.uid() or addressee = auth.uid());

-- ---- invites ----
drop policy if exists "invites_select_party"  on public.invites;
drop policy if exists "invites_insert_friend" on public.invites;
drop policy if exists "invites_delete_party"  on public.invites;
-- 送り主と宛先だけ読める。10分より古いものは「無効」として見えなくする
create policy "invites_select_party" on public.invites
  for select to authenticated
  using ((from_user = auth.uid() or to_user = auth.uid())
         and created_at > now() - interval '10 minutes');
-- 作成: 自分が送り主で、宛先が「承認済みのフレンド」のときだけ
create policy "invites_insert_friend" on public.invites
  for insert to authenticated
  with check (
    from_user = auth.uid()
    and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester = auth.uid() and f.addressee = to_user)
          or (f.requester = to_user    and f.addressee = auth.uid()))
    )
  );
-- 無視・使用済みの削除
create policy "invites_delete_party" on public.invites
  for delete to authenticated
  using (from_user = auth.uid() or to_user = auth.uid());

-- ---- reports ----
drop policy if exists "reports_insert_self" on public.reports;
create policy "reports_insert_self" on public.reports
  for insert to authenticated
  with check (reporter = auth.uid());
-- SELECT のポリシーは作らない = アプリからは誰も読めない（ダッシュボードの Table Editor で確認）

-- ------------------------------------------------------------
-- 6. Storage: avatars バケット（公開読み取り・自分のフォルダだけ書ける）
--    ・1ファイル 100KB まで / PNG のみ（アプリ側で 256x256 の PNG にして送ります）
--    ・保存先は <自分のuid>/avatar.png
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 102400, array['image/png'])
on conflict (id) do update
  set public = true,
      file_size_limit = 102400,
      allowed_mime_types = array['image/png'];

drop policy if exists "avatars_select_public" on storage.objects;
drop policy if exists "avatars_insert_own"    on storage.objects;
drop policy if exists "avatars_update_own"    on storage.objects;
drop policy if exists "avatars_delete_own"    on storage.objects;

create policy "avatars_select_public" on storage.objects
  for select using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text
              and name = auth.uid()::text || '/avatar.png');

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars'
              and (storage.foldername(name))[1] = auth.uid()::text
              and name = auth.uid()::text || '/avatar.png');

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- 7. Realtime: フレンド申請・招待をリアルタイムで受け取れるようにする
--    （オンライン状態の Presence は設定不要）
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'invites') then
    alter publication supabase_realtime add table public.invites;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships') then
    alter publication supabase_realtime add table public.friendships;
  end if;
end $$;

-- ============================================================
-- 完了。続きは docs/supabase-setup.md の「手順5」へ。
-- ============================================================


-- ============================================================
-- 8. プロフィールのひとこと(bio) と 戦績(match_results)   ※後から追加した機能。再実行OK
-- ============================================================
alter table public.profiles add column if not exists bio text not null default '';
alter table public.profiles drop constraint if exists profiles_bio_len;
alter table public.profiles add constraint profiles_bio_len check (char_length(bio) <= 200);
grant update (display_name, avatar_updated_at, bio) on public.profiles to authenticated;

-- 1試合につき1人1行。自分の結果だけ自分で書く（P2P対戦なので「自己申告」の記録です）
create table if not exists public.match_results (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  played_at    timestamptz not null default now(),
  match_key    text not null check (char_length(match_key) <= 64),   -- 部屋コード+開始時刻（二重登録防止）
  initial_role text not null check (char_length(initial_role) <= 32), -- 最初に配られた役職
  final_role   text not null check (char_length(final_role) <= 32),   -- 最終的な役職
  team         text not null check (team in ('village','wolf','third')), -- 最終役職の陣営
  won          boolean not null,
  executed     boolean not null default false,                       -- 追放されたか
  players      smallint not null check (players between 1 and 30),
  unique (user_id, match_key)
);
create index if not exists match_results_user_idx on public.match_results (user_id, played_at desc);

revoke all on public.match_results from anon, authenticated;
grant select, insert, delete on public.match_results to authenticated;
alter table public.match_results enable row level security;

drop policy if exists "match_results_select_all" on public.match_results;
drop policy if exists "match_results_insert_self" on public.match_results;
drop policy if exists "match_results_delete_self" on public.match_results;
-- 戦績はプロフィールで他の人にも見える（ログイン済みのみ）
create policy "match_results_select_all" on public.match_results
  for select to authenticated using (true);
create policy "match_results_insert_self" on public.match_results
  for insert to authenticated with check (user_id = auth.uid());
-- 自分の戦績だけ削除（リセット）できる
create policy "match_results_delete_self" on public.match_results
  for delete to authenticated using (user_id = auth.uid());
