import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "user_id required" }),
        { status: 400 }
      );
    }

    // 🔹 Get LeetCode handle
    const { data: account } = await supabase
      .from("platform_accounts")
      .select("handle")
      .eq("user_id", user_id)
      .eq("platform", "leetcode")
      .single();

    if (!account) {
      return new Response(
        JSON.stringify({ error: "LeetCode account not linked" }),
        { status: 400 }
      );
    }

    // 🔹 Fetch recent accepted submissions
    const submissionsQuery = `
      query recentAcSubmissions($username: String!) {
        recentAcSubmissionList(username: $username) {
          title
          titleSlug
          timestamp
        }
      }
    `;

    const response = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://leetcode.com"
      },
      body: JSON.stringify({
        query: submissionsQuery,
        variables: { username: account.handle }
      })
    });

    const text = await response.text();

    // 🔹 Defensive check (avoid HTML crash)
    if (text.startsWith("<!DOCTYPE")) {
      return new Response(
        JSON.stringify({ error: "LeetCode blocked request (HTML returned)" }),
        { status: 500 }
      );
    }

    const result = JSON.parse(text);
    const submissions = result.data?.recentAcSubmissionList || [];

    let processed = 0;

    for (const sub of submissions) {
      const slug = sub.titleSlug;

      // 🔹 Fetch difficulty for each problem
      const problemQuery = `
        query getQuestion($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            difficulty
          }
        }
      `;

      const problemRes = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://leetcode.com"
        },
        body: JSON.stringify({
          query: problemQuery,
          variables: { titleSlug: slug }
        })
      });

      const problemText = await problemRes.text();

      if (problemText.startsWith("<!DOCTYPE")) {
        continue; // skip if blocked
      }

      const problemData = JSON.parse(problemText);
      const difficulty = problemData.data?.question?.difficulty;

      if (!difficulty) continue;

      // 🔹 Insert problem if not exists
      const { data: existingProblem } = await supabase
        .from("problems")
        .select("id")
        .eq("platform", "leetcode")
        .eq("external_problem_id", slug)
        .maybeSingle();

      let problemId;

      if (!existingProblem) {
        const { data: newProblem } = await supabase
          .from("problems")
          .insert({
            platform: "leetcode",
            external_problem_id: slug,
            name: sub.title,
            difficulty: difficulty
          })
          .select()
          .single();

        problemId = newProblem.id;
      } else {
        problemId = existingProblem.id;
      }

      // 🔹 Insert submission (unique per user + problem)
      await supabase.from("submissions").upsert(
        {
          user_id,
          platform: "leetcode",
          problem_id: problemId,
          solved_at: new Date(Number(sub.timestamp) * 1000).toISOString()
        },
        { onConflict: "user_id,problem_id" }
      );

      processed++;
    }

    return new Response(
      JSON.stringify({
        synced: true,
        problemsProcessed: processed
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