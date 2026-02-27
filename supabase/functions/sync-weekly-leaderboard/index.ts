import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const now = new Date();

    // 🔹 Calculate current week (Sunday → Saturday)
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - dayOfWeek);
    weekStart.setUTCHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
    weekEnd.setUTCHours(23, 59, 59, 999);

    // 🔹 Get submissions within this week (ALL platforms)
    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("user_id, problems(rating)")
      .gte("solved_at", weekStart.toISOString())
      .lte("solved_at", weekEnd.toISOString());

    if (error) throw error;

    // 🔹 Aggregate per user
    const userPointsMap: Record<string, number> = {};

    submissions?.forEach((sub: any) => {
      const userId = sub.user_id;
      const rating = sub.problems?.rating;

      if (!rating) return;

      let points = 0;

      if (rating < 900) points = 100;
      else if (rating <= 1000) points = 200;
      else points = 400;

      if (!userPointsMap[userId]) {
        userPointsMap[userId] = 0;
      }

      userPointsMap[userId] += points;
    });

    // 🔹 Upsert weekly scores
    for (const userId in userPointsMap) {
      await supabase.from("weekly_scores").upsert(
        {
          user_id: userId,
          week_start: weekStart.toISOString(),
          week_end: weekEnd.toISOString(),
          total_points: userPointsMap[userId],
          created_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,week_start"
        }
      );
    }

    return new Response(
      JSON.stringify({
        week_start: weekStart,
        week_end: weekEnd,
        usersSynced: Object.keys(userPointsMap).length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});