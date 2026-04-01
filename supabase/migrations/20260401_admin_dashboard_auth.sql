-- ============================================================
-- ADMIN AUTH + DASHBOARD DATA ACCESS
-- ============================================================

create extension if not exists "pgcrypto";

create table if not exists public.admin_users (
    id uuid primary key default gen_random_uuid(),
    admin_id text not null unique,
    password_hash text not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.admin_sessions (
    id uuid primary key default gen_random_uuid(),
    admin_user_id uuid not null references public.admin_users(id) on delete cascade,
    session_token text not null unique,
    expires_at timestamptz not null,
    revoked_at timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists admin_sessions_admin_user_idx
    on public.admin_sessions(admin_user_id);

create index if not exists admin_sessions_expiry_idx
    on public.admin_sessions(expires_at);

alter table public.admin_users enable row level security;
alter table public.admin_sessions enable row level security;

-- No RLS policies on admin tables: anon/authenticated are denied by default.

create or replace function public.set_admin_users_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_admin_users_updated_at on public.admin_users;

create trigger trg_admin_users_updated_at
before update on public.admin_users
for each row
execute function public.set_admin_users_updated_at();

create or replace function public.verify_admin_credentials(
    p_admin_id text,
    p_password text
)
returns uuid
language sql
security definer
set search_path = public
as $$
    select au.id
    from public.admin_users au
    where au.admin_id = p_admin_id
      and au.is_active = true
            and au.password_hash = extensions.crypt(p_password, au.password_hash)
    limit 1;
$$;

revoke all on function public.verify_admin_credentials(text, text) from public;
revoke all on function public.verify_admin_credentials(text, text) from anon;
revoke all on function public.verify_admin_credentials(text, text) from authenticated;
grant execute on function public.verify_admin_credentials(text, text) to service_role;

-- Bootstrap admin credentials.
-- IMPORTANT: Change this password immediately after first login.
insert into public.admin_users (admin_id, password_hash)
values ('admin', extensions.crypt('admin12345', extensions.gen_salt('bf')))
on conflict (admin_id) do nothing;
