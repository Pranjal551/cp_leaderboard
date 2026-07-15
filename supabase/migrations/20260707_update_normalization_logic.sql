-- Update recalculate_normalized_scores function to handle 0 raw scores.
-- If raw score is 0, the normalized score is set to 0.

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
    
    -- Update normalized scores for each student (0 raw score -> 0 normalized score)
    update public.user_scores u
    set
        codeforces_points = case
            when u.cf_raw = 0 then 0
            else round(
                (select count(*) from public.user_scores u2 where u2.cf_raw <= u.cf_raw) * 100.0 / v_total_students
            )
        end,
        leetcode_points = case
            when u.lc_raw = 0 then 0
            else round(
                (select count(*) from public.user_scores u2 where u2.lc_raw <= u.lc_raw) * 100.0 / v_total_students
            )
        end;
        
    -- Update total_points based on the weighted sum (Final = (w_cf * CF_norm + w_lc * LC_norm) * 10)
    update public.user_scores
    set total_points = round((v_w_cf * codeforces_points + v_w_lc * leetcode_points) * 10.0);
end;
$$;

-- Trigger recalculation to update current scores in database
select public.recalculate_normalized_scores();
