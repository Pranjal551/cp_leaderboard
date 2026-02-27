import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {

    // 1️⃣ Get all users with Codeforces linked
    const { data: accounts } = await supabase
      .from("platform_accounts")
      .select("user_id, handle")
      .eq("platform", "codeforces");

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No users to sync" }));
    }

    for (const account of accounts) {

      const user_id = account.user_id;
      const handle = account.handle;

      const response = await fetch(
        `https://codeforces.com/api/user.status?handle=${handle}`
      );

      const data = await response.json();

      if (data.status !== "OK") continue;

      const accepted = data.result.filter(
        (submission: any) => submission.verdict === "OK"
      );

      const uniqueProblems = new Map();

      accepted.forEach((submission: any) => {
        const problemId = `${submission.problem.contestId}-${submission.problem.index}`;
        if (!uniqueProblems.has(problemId)) {
          uniqueProblems.set(problemId, submission.problem);
        }
      });

      for (const [problemId, problem] of uniqueProblems) {

        const { data: existingProblem } = await supabase
          .from("problems")
          .select("id")
          .eq("platform", "codeforces")
          .eq("external_problem_id", problemId)
          .single();

        let problem_db_id;

        if (!existingProblem) {
          const { data: newProblem } = await supabase
            .from("problems")
            .insert({
              platform: "codeforces",
              external_problem_id: problemId,
              name: problem.name,
              rating: problem.rating,
            })
            .select()
            .single();

          problem_db_id = newProblem.id;
        } else {
          problem_db_id = existingProblem.id;
        }

        await supabase.from("submissions").upsert(
          {
            user_id,
            platform: "codeforces",
            problem_id: problem_db_id,
            solved_at: new Date().toISOString(),
          },
          { onConflict: "user_id,problem_id" }
        );
      }

      const { data: userSubmissions } = await supabase
        .from("submissions")
        .select("problem_id, problems(rating)")
        .eq("user_id", user_id)
        .eq("platform", "codeforces");

      let totalPoints = 0;

      userSubmissions?.forEach((sub: any) => {
        const rating = sub.problems?.rating;
        if (!rating) return;
        if (rating < 900) totalPoints += 100;
        else if (rating <= 1000) totalPoints += 200;
        else totalPoints += 400;
      });

      const { data: existingScore, error: scoreError } = await supabase
      .from("user_scores")
      .select("leetcode_points")
      .eq("user_id", user_id)
      .maybeSingle();

    if (scoreError) throw scoreError;

    const leetcodePoints = existingScore?.leetcode_points || 0;
    const finalTotal = totalPoints + leetcodePoints;

    await supabase
      .from("user_scores")
      .upsert(
        {
          user_id,
          codeforces_points: totalPoints,
          leetcode_points: leetcodePoints,
          total_points: finalTotal,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    }

    return new Response(JSON.stringify({
      syncedUsers: accounts.length
    }));

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
});
