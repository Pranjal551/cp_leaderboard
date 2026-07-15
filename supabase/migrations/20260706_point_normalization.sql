-- Database Migration: Point Normalization scoring system
-- Adds raw score tracking and percentile-rank normalization function.

-- 1. Add raw score columns if they don't exist
alter table public.user_scores
add column if not exists cf_raw integer default 0,
add column if not exists lc_raw integer default 0;

-- 2. Insert default weights in cron_settings
insert into public.cron_settings (key, value)
values
    ('w_cf', '0.5'),
    ('w_lc', '0.5')
on conflict (key) do nothing;

-- 3. Calculate and populate initial raw scores for existing submissions
update public.user_scores u
set cf_raw = coalesce(
    (select sum(p.rating)
     from public.submissions s
     join public.problems p on s.problem_id = p.id
     where s.user_id = u.user_id and s.platform = 'codeforces' and p.rating is not null
    ), 0
);

update public.user_scores u
set lc_raw = coalesce(
    (select sum(
        case
            when p.difficulty = 'Easy' then 800
            when p.difficulty = 'Medium' then 1200
            when p.difficulty = 'Hard' then 1600
            else 0
        end
     )
     from public.submissions s
     join public.problems p on s.problem_id = p.id
     where s.user_id = u.user_id and s.platform = 'leetcode'
    ), 0
);

-- 4. Create/Replace recalculation function
create or replace function public.recalculate_normalized_scores()
returns void
language plpgsql
security definer
as $$
declare
    v_total_students integer;
    v_w_cf numeric;
    v_w_lc numeric;
begin
    -- Fetch weights from cron_settings
    select coalesce(value::numeric, 0.5) into v_w_cf from public.cron_settings where key = 'w_cf';
    select coalesce(value::numeric, 0.5) into v_w_lc from public.cron_settings where key = 'w_lc';

    -- Get total number of students in the leaderboard
    select count(*) into v_total_students from public.user_scores;
    
    if v_total_students = 0 then
        return;
    end if;
    
    -- Update normalized scores for each student
    update public.user_scores u
    set
        codeforces_points = round(
            (select count(*) from public.user_scores u2 where u2.cf_raw <= u.cf_raw) * 100.0 / v_total_students
        ),
        leetcode_points = round(
            (select count(*) from public.user_scores u2 where u2.lc_raw <= u.lc_raw) * 100.0 / v_total_students
        );
        
    -- Update total_points based on the weighted sum (Final = (w_cf * CF_norm + w_lc * LC_norm) * 10)
    update public.user_scores
    set total_points = round((v_w_cf * codeforces_points + v_w_lc * leetcode_points) * 10.0);
end;
$$;

-- 5. Trigger initial recalculation
select public.recalculate_normalized_scores();
