import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const now = new Date();

    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    const monthStart = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));

    const { data: submissions, error } = await supabase
      .from("submissions")
      .select("user_id, problems(platform, rating, difficulty)")
      .gte("solved_at", monthStart.toISOString())
      .lte("solved_at", monthEnd.toISOString());

    if (error) throw error;

    const userPointsMap: Record<string, number> = {};

    submissions?.forEach((sub: any) => {
      const userId = sub.user_id;
      const problem = sub.problems;

      if (!problem) return;

      let points = 0;

      if (problem.platform === "codeforces") {
        const rating = problem.rating;
        if (!rating) return;

        if (rating < 900) points = 100;
        else if (rating <= 1000) points = 200;
        else points = 400;
      }

      if (problem.platform === "leetcode") {
        const difficulty = problem.difficulty;

        if (difficulty === "Easy") points = 100;
        else if (difficulty === "Medium") points = 200;
        else if (difficulty === "Hard") points = 400;
      }

      if (!userPointsMap[userId]) {
        userPointsMap[userId] = 0;
      }

      userPointsMap[userId] += points;
    });

    for (const userId in userPointsMap) {
      await supabase.from("monthly_scores").upsert(
        {
          user_id: userId,
          month,
          year,
          points: userPointsMap[userId],
        },
        {
          onConflict: "user_id,month,year",
        }
      );
    }

    return new Response(
      JSON.stringify({
        month,
        year,
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
