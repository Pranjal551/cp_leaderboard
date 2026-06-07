import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { weekStart, weekEnd, weekStartDate, weekEndDate } = getCurrentWeekRange();

    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("user_id, platform, problems(rating, difficulty)")
      .gte("solved_at", weekStart.toISOString())
      .lte("solved_at", weekEnd.toISOString());

    if (error) throw error;

    const userPointsMap: Record<string, number> = {};

    submissions?.forEach((sub: any) => {
      const userId = sub.user_id;
      const points = getWeeklyPoints(sub.platform, sub.problems);
      if (!points) return;

      if (!userPointsMap[userId]) {
        userPointsMap[userId] = 0;
      }

      userPointsMap[userId] += points;
    });

    const { error: clearError } = await supabase
      .from("weekly_scores")
      .delete()
      .eq("week_start", weekStartDate)
      .eq("week_end", weekEndDate);

    if (clearError) throw clearError;

    const rows = Object.entries(userPointsMap)
      .map(([user_id, total_points]) => ({
      user_id,
      week_start: weekStartDate,
      week_end: weekEndDate,
      total_points,
      created_at: new Date().toISOString(),
      }))
      .sort((a, b) => {
        if (b.total_points !== a.total_points) {
          return b.total_points - a.total_points;
        }

        // Deterministic tie-breaker for weekly rank-1 winner.
        return a.user_id.localeCompare(b.user_id);
      });

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from("weekly_scores")
        .insert(rows);

      if (insertError) throw insertError;
    }

    // Reset all users to 'no' first.
    const { error: resetCoderError } = await supabase
      .from("profiles")
      .update({ coder_of_the_week: "no" })
      .not("id", "is", null);

    if (resetCoderError) throw resetCoderError;

    // Weekly rank-1 gets 'yes'. If there are no weekly rows, everyone stays 'no'.
    let weeklyWinnerUserId: string | null = null;
    if (rows.length > 0) {
      weeklyWinnerUserId = rows[0].user_id;

      const { error: setWinnerError } = await supabase
        .from("profiles")
        .update({ coder_of_the_week: "yes" })
        .eq("id", weeklyWinnerUserId);

      if (setWinnerError) throw setWinnerError;
    }

    return new Response(
      JSON.stringify({
        week_start: weekStartDate,
        week_end: weekEndDate,
        usersSynced: rows.length,
        weeklyWinnerUserId,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        }
      }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function getCurrentWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();

  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - dayOfWeek);
  weekStart.setUTCHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  return {
    weekStart,
    weekEnd,
    weekStartDate: weekStart.toISOString().slice(0, 10),
    weekEndDate: weekEnd.toISOString().slice(0, 10),
  };
}

function getWeeklyPoints(platform: string | null | undefined, problem: any) {
  if (!platform || !problem) return 0;

  if (platform === "codeforces") {
    const rating = problem.rating;
    if (!rating) return 0;
    if (rating < 900) return 100;
    if (rating <= 1000) return 200;
    return 400;
  }

  if (platform === "leetcode") {
    const difficulty = problem.difficulty;
    if (difficulty === "Easy") return 100;
    if (difficulty === "Medium") return 200;
    if (difficulty === "Hard") return 400;
  }

  return 0;
}
