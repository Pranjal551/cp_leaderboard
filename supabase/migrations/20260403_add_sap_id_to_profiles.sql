-- Add SAP ID to student profiles and persist it for new sign-ups.
alter table public.profiles
add column if not exists sap_id text;

-- Optional backfill from auth metadata if it already exists.
update public.profiles as p
set sap_id = nullif(trim(u.raw_user_meta_data->>'sap_id'), '')
from auth.users as u
where p.id = u.id
  and p.sap_id is null
  and nullif(trim(u.raw_user_meta_data->>'sap_id'), '') is not null;

-- Ensure future auth sign-ups also carry sap_id into profiles.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, semester, sap_id)
    values (
        new.id,
        nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(new.raw_user_meta_data->>'semester'), '')::integer,
        nullif(trim(new.raw_user_meta_data->>'sap_id'), '')
    )
    on conflict (id) do nothing;

    return new;
end;
$$;
