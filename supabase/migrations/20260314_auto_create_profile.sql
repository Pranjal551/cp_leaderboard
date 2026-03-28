-- ============================================================
-- AUTO-CREATE PROFILE ON NEW USER REGISTRATION
-- Run this once in the Supabase SQL editor.
-- ============================================================

-- Function: called by the trigger below.
-- SECURITY DEFINER lets it bypass RLS and write to profiles
-- even before the user has an active session.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, semester)
    values (
        new.id,
        nullif(new.raw_user_meta_data->>'full_name', ''),
        nullif(new.raw_user_meta_data->>'semester', '')::integer
    )
    on conflict (id) do nothing;   -- never overwrite an existing row
    return new;
end;
$$;

-- Trigger: fires after every new row in auth.users
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
    after insert on auth.users
    for each row
    execute procedure public.handle_new_user();
