-- =====================================================================
-- MOVIX — Stage 1: Core database schema + Row Level Security
-- =====================================================================
-- Run this once in your Supabase project (SQL Editor, or via the
-- Supabase CLI: supabase db push). It is safe to re-run: every
-- statement uses "if not exists" / "or replace" where possible.
--
-- This migration creates every table the full MOVIX spec needs
-- (profiles, catalogue, playback, lists, subscriptions, payments,
-- admin). Stage 1 only wires up auth + profiles end-to-end; later
-- stages will read/write the catalogue, playback, and billing
-- tables created here.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- PROFILES — one row per authenticated user, mirrors auth.users
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  phone text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per MOVIX user, created automatically when they verify OTP.';

-- Auto-create (or refresh) a profile row whenever a Supabase auth user
-- is created or their phone number changes. Runs as the function
-- owner (bypasses RLS), so the client never needs insert rights on
-- profiles directly.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, phone)
  values (new.id, new.phone)
  on conflict (id) do update
    set phone = excluded.phone,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of phone on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- ADMIN USERS — explicit allow-list, separate from profiles
-- ---------------------------------------------------------------------
create table if not exists public.admin_users (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

comment on table public.admin_users is
  'Who can use the admin dashboard. No client-side insert policy on purpose: '
  'add the first admin yourself from the SQL editor (see SETUP.md).';

-- Security-definer helper so RLS policies below can check admin status
-- without recursive RLS issues on admin_users itself.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.admin_users au where au.user_id = uid);
$$;

-- ---------------------------------------------------------------------
-- GENRES
-- ---------------------------------------------------------------------
create table if not exists public.genres (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- ---------------------------------------------------------------------
-- MOVIES
-- ---------------------------------------------------------------------
create table if not exists public.movies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  release_year int,
  language text,
  rating numeric(3,1),
  poster_url text,
  banner_url text,
  video_path text,              -- storage key / HLS manifest path, never a public URL
  duration_seconds int,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.movie_genres (
  movie_id uuid references public.movies (id) on delete cascade,
  genre_id uuid references public.genres (id) on delete cascade,
  primary key (movie_id, genre_id)
);

-- ---------------------------------------------------------------------
-- SERIES / SEASONS / EPISODES
-- ---------------------------------------------------------------------
create table if not exists public.series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  release_year int,
  language text,
  rating numeric(3,1),
  poster_url text,
  banner_url text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.series_genres (
  series_id uuid references public.series (id) on delete cascade,
  genre_id uuid references public.genres (id) on delete cascade,
  primary key (series_id, genre_id)
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series (id) on delete cascade,
  season_number int not null,
  title text,
  unique (series_id, season_number)
);

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.seasons (id) on delete cascade,
  episode_number int not null,
  title text,
  description text,
  thumbnail_url text,
  video_path text,
  duration_seconds int,
  unique (season_id, episode_number)
);

-- ---------------------------------------------------------------------
-- PLAYBACK PROGRESS — backs both "Continue Watching" and watch history
-- ---------------------------------------------------------------------
create table if not exists public.playback_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  movie_id uuid references public.movies (id) on delete cascade,
  episode_id uuid references public.episodes (id) on delete cascade,
  progress_seconds int not null default 0,
  duration_seconds int,
  last_watched_at timestamptz not null default now(),
  constraint playback_progress_one_target check (
    (movie_id is not null)::int + (episode_id is not null)::int = 1
  )
);

create unique index if not exists playback_progress_user_movie_uidx
  on public.playback_progress (user_id, movie_id) where movie_id is not null;
create unique index if not exists playback_progress_user_episode_uidx
  on public.playback_progress (user_id, episode_id) where episode_id is not null;

-- ---------------------------------------------------------------------
-- MY LIST
-- ---------------------------------------------------------------------
create table if not exists public.my_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  movie_id uuid references public.movies (id) on delete cascade,
  series_id uuid references public.series (id) on delete cascade,
  added_at timestamptz not null default now(),
  constraint my_list_one_target check (
    (movie_id is not null)::int + (series_id is not null)::int = 1
  )
);

create unique index if not exists my_list_user_movie_uidx
  on public.my_list (user_id, movie_id) where movie_id is not null;
create unique index if not exists my_list_user_series_uidx
  on public.my_list (user_id, series_id) where series_id is not null;

-- ---------------------------------------------------------------------
-- SUBSCRIPTION PLANS / USER SUBSCRIPTIONS / PAYMENTS
-- ---------------------------------------------------------------------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,              -- 'free' | 'monthly' | 'yearly'
  name text not null,
  price_inr numeric(10,2) not null default 0,
  billing_interval text not null check (billing_interval in ('none','monthly','yearly')),
  features jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id uuid not null references public.subscription_plans (id),
  status text not null check (status in ('active','cancelled','expired','pending')) default 'pending',
  razorpay_customer_id text,
  razorpay_subscription_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subscription_id uuid references public.user_subscriptions (id) on delete set null,
  razorpay_order_id text,
  razorpay_payment_id text unique,
  amount numeric(10,2) not null,
  currency text not null default 'INR',
  status text not null check (status in ('created','authorized','captured','failed','refunded')) default 'created',
  created_at timestamptz not null default now()
);

-- =====================================================================
-- ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles enable row level security;
alter table public.admin_users enable row level security;
alter table public.genres enable row level security;
alter table public.movies enable row level security;
alter table public.movie_genres enable row level security;
alter table public.series enable row level security;
alter table public.series_genres enable row level security;
alter table public.seasons enable row level security;
alter table public.episodes enable row level security;
alter table public.playback_progress enable row level security;
alter table public.my_list enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.payments enable row level security;

-- profiles: a user can read/update their own row; admins can read all
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- No insert policy: profiles are created only by the handle_new_auth_user
-- trigger (security definer), never directly by a client.

-- admin_users: only admins can see who the admins are; no client writes
drop policy if exists "admin_users_select_admin_only" on public.admin_users;
create policy "admin_users_select_admin_only" on public.admin_users
  for select using (public.is_admin(auth.uid()));

-- catalogue tables: public read, admin-only write
drop policy if exists "genres_read_all" on public.genres;
create policy "genres_read_all" on public.genres for select using (true);
drop policy if exists "genres_admin_write" on public.genres;
create policy "genres_admin_write" on public.genres for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "movies_read_all" on public.movies;
create policy "movies_read_all" on public.movies for select using (true);
drop policy if exists "movies_admin_write" on public.movies;
create policy "movies_admin_write" on public.movies for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "movie_genres_read_all" on public.movie_genres;
create policy "movie_genres_read_all" on public.movie_genres for select using (true);
drop policy if exists "movie_genres_admin_write" on public.movie_genres;
create policy "movie_genres_admin_write" on public.movie_genres for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "series_read_all" on public.series;
create policy "series_read_all" on public.series for select using (true);
drop policy if exists "series_admin_write" on public.series;
create policy "series_admin_write" on public.series for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "series_genres_read_all" on public.series_genres;
create policy "series_genres_read_all" on public.series_genres for select using (true);
drop policy if exists "series_genres_admin_write" on public.series_genres;
create policy "series_genres_admin_write" on public.series_genres for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "seasons_read_all" on public.seasons;
create policy "seasons_read_all" on public.seasons for select using (true);
drop policy if exists "seasons_admin_write" on public.seasons;
create policy "seasons_admin_write" on public.seasons for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

drop policy if exists "episodes_read_all" on public.episodes;
create policy "episodes_read_all" on public.episodes for select using (true);
drop policy if exists "episodes_admin_write" on public.episodes;
create policy "episodes_admin_write" on public.episodes for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- playback_progress / my_list: strictly own rows (admins get no special
-- read here on purpose — viewing habits are private)
drop policy if exists "playback_progress_owner_all" on public.playback_progress;
create policy "playback_progress_owner_all" on public.playback_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "my_list_owner_all" on public.my_list;
create policy "my_list_owner_all" on public.my_list for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- subscription_plans: everyone can read active plans; admin-only write
drop policy if exists "subscription_plans_read_all" on public.subscription_plans;
create policy "subscription_plans_read_all" on public.subscription_plans for select using (true);
drop policy if exists "subscription_plans_admin_write" on public.subscription_plans;
create policy "subscription_plans_admin_write" on public.subscription_plans for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- user_subscriptions: user reads own, admin reads/writes all.
-- Deliberately NO authenticated insert/update policy beyond admin —
-- subscriptions only become 'active' through the Razorpay webhook,
-- which uses the service_role key and therefore bypasses RLS entirely.
drop policy if exists "user_subscriptions_select_own_or_admin" on public.user_subscriptions;
create policy "user_subscriptions_select_own_or_admin" on public.user_subscriptions
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "user_subscriptions_admin_write" on public.user_subscriptions;
create policy "user_subscriptions_admin_write" on public.user_subscriptions for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- payments: same pattern — only the webhook (service_role) or an admin writes
drop policy if exists "payments_select_own_or_admin" on public.payments;
create policy "payments_select_own_or_admin" on public.payments
  for select using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists "payments_admin_write" on public.payments;
create policy "payments_admin_write" on public.payments for all
  using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

-- =====================================================================
-- SEED DATA — matches the catalogue/pricing already shown in the UI
-- =====================================================================
insert into public.genres (name) values
  ('Action'),('Adventure'),('Comedy'),('Drama'),('Thriller'),
  ('Horror'),('Romance'),('Sci-Fi'),('Crime'),('Animation')
on conflict (name) do nothing;

insert into public.subscription_plans (code, name, price_inr, billing_interval, features, sort_order)
values
  ('free', 'Free', 0, 'none', '["Limited catalogue","SD quality","Ads supported"]', 0),
  ('monthly', 'Monthly', 149, 'monthly', '["Full catalogue","HD quality","Cancel anytime"]', 1),
  ('yearly', 'Yearly', 999, 'yearly', '["Full catalogue","HD quality","2 months free vs monthly"]', 2)
on conflict (code) do nothing;
console.log("MOVIX Supabase Ready:", window.MOVIX_AUTH.ready);