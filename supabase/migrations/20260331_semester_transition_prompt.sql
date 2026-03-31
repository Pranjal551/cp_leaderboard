-- Track whether a user has already answered semester transition prompt on a given date.
alter table public.profiles
add column if not exists last_semester_transition_prompt_on date;
