-- Tonight — schema
-- Run this once in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- A "pair" is the two people, stable across sessions. It is what makes
-- history and learning work when they come back next week.
create table if not exists pairs (
  id           uuid primary key default gen_random_uuid(),
  pair_key     text unique not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  code       text unique not null,
  pair_key   text not null,
  -- collecting -> building -> building_locked -> swiping -> matched | finalists -> done
  status     text not null default 'collecting',
  round      int  not null default 1,
  brief      jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists sessions_pair_key_idx on sessions (pair_key, created_at desc);

create table if not exists participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references sessions(id) on delete cascade,
  role           text not null check (role in ('a','b')),
  device_id      text not null,
  preferences    jsonb,
  submitted_at   timestamptz,
  finished_round int not null default 0,
  created_at     timestamptz not null default now(),
  unique (session_id, role),
  unique (session_id, device_id)
);

create table if not exists pool_titles (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round      int  not null,
  position   int  not null,
  tmdb_id    int  not null,
  media_type text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  unique (session_id, round, tmdb_id, media_type)
);
create index if not exists pool_titles_session_round_idx on pool_titles (session_id, round, position);

create table if not exists swipes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  round      int  not null,
  role       text not null check (role in ('a','b')),
  tmdb_id    int  not null,
  media_type text not null,
  liked      boolean not null,
  created_at timestamptz not null default now(),
  unique (session_id, round, role, tmdb_id, media_type)
);
create index if not exists swipes_session_idx on swipes (session_id, round);

create table if not exists matches (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  tmdb_id    int  not null,
  media_type text not null,
  data       jsonb not null,
  source     text not null default 'swipe',   -- 'swipe' | 'final'
  rating     int,                             -- 1..5, added after watching
  rated_by   text,
  created_at timestamptz not null default now()
);

-- Round-2 tie-break: each partner taps one of the top 5.
create table if not exists final_picks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  role       text not null check (role in ('a','b')),
  tmdb_id    int  not null,
  media_type text not null,
  created_at timestamptz not null default now(),
  unique (session_id, role)
);

-- Every table is reached only through the server using the service-role key,
-- which bypasses RLS. Turning RLS on with no policies means an anon/public key
-- can read nothing, which is exactly what we want.
alter table pairs        enable row level security;
alter table sessions     enable row level security;
alter table participants enable row level security;
alter table pool_titles  enable row level security;
alter table swipes       enable row level security;
alter table matches      enable row level security;
alter table final_picks  enable row level security;
