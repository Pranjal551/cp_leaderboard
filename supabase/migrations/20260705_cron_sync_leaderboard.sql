-- Enable pg_cron and pg_net extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Create settings table for cron jobs
create table if not exists public.cron_settings (
    key text primary key,
    value text not null
);

-- Insert default configurations
insert into public.cron_settings (key, value)
values
    ('supabase_url', 'http://kong:8000'),
    ('service_role_key', '')
on conflict (key) do nothing;

-- Function to safely invoke HTTP POST
create or replace function public.cron_invoke_edge_function(p_function_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_supabase_url text;
    v_service_role_key text;
begin
    select value into v_supabase_url from public.cron_settings where key = 'supabase_url';
    select value into v_service_role_key from public.cron_settings where key = 'service_role_key';

    if v_supabase_url is null or v_supabase_url = '' then
        raise exception 'supabase_url is not configured in public.cron_settings';
    end if;

    perform net.http_post(
        url := v_supabase_url || '/functions/v1/' || p_function_name,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || coalesce(v_service_role_key, '')
        ),
        body := '{}'::jsonb
    );
end;
$$;

-- Safely unschedule existing jobs by name if they exist
do $$
declare
    r record;
begin
    for r in select jobid from cron.job where jobname in ('sync-all-codeforces-job', 'sync-all-leetcode-job', 'sync-weekly-leaderboard-job', 'sync-monthly-leaderboard-job') loop
        perform cron.unschedule(r.jobid);
    end loop;
end;
$$;

-- Schedule jobs (UTC timezone)
-- sync-all-codeforces: minute 0 of every 6th hour (00:00, 06:00, 12:00, 18:00)
select cron.schedule(
    'sync-all-codeforces-job',
    '0 */6 * * *',
    $$ select public.cron_invoke_edge_function('sync-all-codeforces'); $$
);

-- sync-all-leetcode: minute 10 of every 6th hour
select cron.schedule(
    'sync-all-leetcode-job',
    '10 */6 * * *',
    $$ select public.cron_invoke_edge_function('sync-all-leetcode'); $$
);

-- sync-weekly-leaderboard: minute 20 of every 6th hour
select cron.schedule(
    'sync-weekly-leaderboard-job',
    '20 */6 * * *',
    $$ select public.cron_invoke_edge_function('sync-weekly-leaderboard'); $$
);

-- sync-monthly-leaderboard: minute 30 of every 6th hour
select cron.schedule(
    'sync-monthly-leaderboard-job',
    '30 */6 * * *',
    $$ select public.cron_invoke_edge_function('sync-monthly-leaderboard'); $$
);
