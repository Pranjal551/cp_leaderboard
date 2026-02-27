import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // Parse body safely
    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const user_id = body.user_id;

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400 }
      );
    }

    // 1️⃣ Get Codeforces handle from DB
    const { data: account, error: accountError } = await supabase
      .from("platform_accounts")
      .select("handle")
      .eq("user_id", user_id)
      .eq("platform", "codeforces")
      .single();

    if (accountError || !account) {
      return new Response(
        JSON.stringify({ error: "Codeforces account not linked" }),
        { status: 400 }
      );
    }

    const handle = account.handle;

    // 2️⃣ Fetch Codeforces submissions
    const response = await fetch(
      `https://codeforces.com/api/user.status?handle=${handle}`
    );

    const data = await response.json();

    if (data.status !== "OK") {
      return new Response(
        JSON.stringify({ error: "Invalid Codeforces handle" }),
        { status: 400 }
      );
    }

    const accepted = data.result.filter(
      (submission: any) => submission.verdict === "OK"
    );

    // 3️⃣ Deduplicate problems
    const uniqueProblems = new Map();

    accepted.forEach((submission: any) => {
      const problemId = `${submission.problem.contestId}-${submission.problem.index}`;
      if (!uniqueProblems.has(problemId)) {
        uniqueProblems.set(problemId, submission.problem);
      }
    });

    // 4️⃣ Insert problems + submissions
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

      // Insert submission (upsert prevents duplicates)
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

    // 5️⃣ Recalculate total points from DB
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

    // 6️⃣ UPDATE user_scores table (THIS WAS MISSING)
    await supabase
      .from("user_scores")
      .update({
        codeforces_points: totalPoints,
        total_points: totalPoints, // later combine platforms
        last_updated: new Date().toISOString(),
      })
      .eq("user_id", user_id);

    return new Response(
      JSON.stringify({
        user_id,
        synced: true,
        totalPoints,
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
