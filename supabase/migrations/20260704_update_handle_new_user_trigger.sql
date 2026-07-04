-- Update trigger function to set last_semester_transition_prompt_on to current_date on profile creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, semester, sap_id, last_semester_transition_prompt_on)
    values (
        new.id,
        nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(new.raw_user_meta_data->>'semester'), '')::integer,
        nullif(trim(new.raw_user_meta_data->>'sap_id'), ''),
        current_date
    )
    on conflict (id) do nothing;

    return new;
end;
$$;
