-- Add weekly winner marker to profiles.
alter table public.profiles
add column if not exists coder_of_the_week text not null default 'no';

-- Keep value constrained to yes/no.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_coder_of_the_week_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_coder_of_the_week_check
    check (coder_of_the_week in ('yes', 'no'));
  end if;
end
$$;

-- Ensure existing null/invalid values are normalized.
update public.profiles
set coder_of_the_week = 'no'
where coder_of_the_week is null
   or coder_of_the_week not in ('yes', 'no');
