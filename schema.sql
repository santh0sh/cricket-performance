-- cricket-performance schema for Supabase
-- Run this once in the Supabase SQL editor (SQL Editor > New query > paste > Run).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique
    check (username ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  role text not null default 'All-rounder',
  batting_style text not null default 'Right-hand bat',
  bowling_style text not null default 'Right-arm medium',
  external_url text,          -- optional link to an external profile (e.g. CricHeroes)
  avatar_url text,            -- optional profile photo URL ('./sandy.jpg' works when hosted flat)
  created_at timestamptz not null default now()
);

-- safe re-run for projects created before avatar_url existed
alter table public.profiles add column if not exists avatar_url text;

-- safe re-run for projects created before external_url existed
alter table public.profiles add column if not exists external_url text;

-- One row per innings. kind = 'batting' or 'bowling'; only that kind's columns are filled.
-- legal_balls is a real ball count (4.2 overs = 26), so cricket overs never corrupt the math.
create table if not exists public.innings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('batting', 'bowling')),
  played_on date not null,
  opponent text not null default '',
  -- batting columns
  runs integer, balls integer, fours integer, sixes integer, dots integer,
  dismissal text not null default '',          -- '' = not out
  -- bowling columns
  legal_balls integer, runs_given integer, wickets integer,
  wides integer, no_balls integer, catches integer, run_outs integer,
  -- where this innings came from: 'manual' (entered in the app), 'pdf', 'cricheroes'
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  -- dots (batting) and catches/run_outs (bowling) are nullable: CricHeroes
  -- does not publish them per match, and forcing 0 would fabricate data.
  check (
    (kind = 'batting' and runs is not null and balls is not null
       and fours is not null and sixes is not null)
    or
    (kind = 'bowling' and legal_balls is not null and runs_given is not null
       and wickets is not null and wides is not null and no_balls is not null)
  )
);

-- safe re-run for projects created before source existed
alter table public.innings add column if not exists source text not null default 'manual';

create index if not exists innings_user_kind_date_idx
  on public.innings (user_id, kind, played_on desc);

-- Row level security: the anon key ships in the browser, so safety lives here.
alter table public.profiles enable row level security;
alter table public.innings enable row level security;

-- Anyone can read (public shareable profiles).
create policy "profiles are publicly readable"
  on public.profiles for select using (true);
create policy "innings are publicly readable"
  on public.innings for select using (true);

-- Only the signed-in owner can write their own rows.
create policy "owner inserts own profile"
  on public.profiles for insert with check (auth.uid() = id);
create policy "owner updates own profile"
  on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "owner deletes own profile"
  on public.profiles for delete using (auth.uid() = id);

create policy "owner inserts own innings"
  on public.innings for insert with check (auth.uid() = user_id);
create policy "owner updates own innings"
  on public.innings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner deletes own innings"
  on public.innings for delete using (auth.uid() = user_id);
