-- ============================================================
-- COLLEGE CP LEADERBOARD
-- Full Database Schema (v1)
-- ============================================================

-- Required Extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES
-- ============================================================

create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text,
    department text,
    semester integer,
    last_semester_transition_prompt_on date,
    created_at timestamp default now()
);

alter table public.profiles enable row level security;

create policy if not exists "Public read profiles"
on public.profiles
for select
using (true);

create policy if not exists "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id);

create policy if not exists "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);


-- ============================================================
-- PLATFORM ACCOUNTS
-- ============================================================

create table if not exists public.platform_accounts (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    platform text not null,
    handle text not null,
    created_at timestamp default now(),
    unique (user_id, platform)
);

create index if not exists platform_accounts_user_id_idx
    on public.platform_accounts(user_id);

alter table public.platform_accounts enable row level security;

create policy if not exists "Users can read own platform accounts"
on public.platform_accounts
for select
using (auth.uid() = user_id);

create policy if not exists "Users can insert own platform accounts"
on public.platform_accounts
for insert
with check (auth.uid() = user_id);

create policy if not exists "Users can update own platform accounts"
on public.platform_accounts
for update
using (auth.uid() = user_id);


-- ============================================================
-- PROBLEMS
-- ============================================================

create table if not exists public.problems (
    id uuid primary key default gen_random_uuid(),
    platform text not null,
    external_problem_id text not null,
    name text,
    rating integer,
    created_at timestamp default now(),
    unique (platform, external_problem_id)
);

create index if not exists problems_platform_idx
    on public.problems(platform);

alter table public.problems enable row level security;

create policy if not exists "Public read problems"
on public.problems
for select
using (true);


-- ============================================================
-- SUBMISSIONS
-- ============================================================

create table if not exists public.submissions (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    platform text not null,
    problem_id uuid references public.problems(id) on delete cascade,
    solved_at timestamp not null,
    created_at timestamp default now(),
    unique (user_id, problem_id)
);

create index if not exists submissions_user_idx
    on public.submissions(user_id);

create index if not exists submissions_solved_at_idx
    on public.submissions(solved_at);

alter table public.submissions enable row level security;

create policy if not exists "Users can read own submissions"
on public.submissions
for select
using (auth.uid() = user_id);


-- ============================================================
-- USER SCORES (LIFETIME)
-- ============================================================

create table if not exists public.user_scores (
    user_id uuid primary key references auth.users(id) on delete cascade,
    codeforces_points integer default 0,
    leetcode_points integer default 0,
    total_points integer default 0,
    last_updated timestamp default now()
);

alter table public.user_scores enable row level security;

create policy if not exists "Public read user scores"
on public.user_scores
for select
using (true);


-- ============================================================
-- WEEKLY SCORES
-- ============================================================

create table if not exists public.weekly_scores (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    week_start date not null,
    week_end date not null,
    total_points integer not null,
    created_at timestamp default now()
);

create index if not exists weekly_scores_user_idx
    on public.weekly_scores(user_id);

create index if not exists weekly_scores_range_idx
    on public.weekly_scores(week_start, week_end);

alter table public.weekly_scores enable row level security;

create policy if not exists "Public read weekly scores"
on public.weekly_scores
for select
using (true);


-- ============================================================
-- MONTHLY SCORES
-- ============================================================

create table if not exists public.monthly_scores (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade,
    month integer not null,
    year integer not null,
    total_points integer not null,
    created_at timestamp default now()
);

create index if not exists monthly_scores_user_idx
    on public.monthly_scores(user_id);

create index if not exists monthly_scores_month_year_idx
    on public.monthly_scores(month, year);

alter table public.monthly_scores enable row level security;

create policy if not exists "Public read monthly scores"
on public.monthly_scores
for select
using (true);


-- ============================================================
-- END OF SCHEMA
-- ============================================================