import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { data: accounts, error: accountsError } = await supabase
      .from("platform_accounts")
      .select("user_id, handle")
      .eq("platform", "leetcode");

    if (accountsError) throw accountsError;

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ message: "No users to sync" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    let syncedUsers = 0;
    let skippedUsers = 0;

    for (const account of accounts) {
      const result = await syncLeetcodeUser(supabase, account.user_id, account.handle);

      if (result.synced) syncedUsers += 1;
      else skippedUsers += 1;
    }

    return new Response(
      JSON.stringify({
        syncedUsers,
        skippedUsers,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function syncLeetcodeUser(supabase: any, user_id: string, handle: string) {
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
      "Referer": "https://leetcode.com",
    },
    body: JSON.stringify({
      query: submissionsQuery,
      variables: { username: handle },
    }),
  });

  const text = await response.text();

  if (text.startsWith("<!DOCTYPE")) {
    return { synced: false };
  }

  const result = JSON.parse(text);
  const submissions = result.data?.recentAcSubmissionList || [];

  for (const sub of submissions) {
    const difficulty = await fetchDifficulty(sub.titleSlug);

    if (!difficulty) continue;

    const { data: existingProblem } = await supabase
      .from("problems")
      .select("id")
      .eq("platform", "leetcode")
      .eq("external_problem_id", sub.titleSlug)
      .maybeSingle();

    let problemId = existingProblem?.id;

    if (!problemId) {
      const { data: newProblem, error: insertProblemError } = await supabase
        .from("problems")
        .insert({
          platform: "leetcode",
          external_problem_id: sub.titleSlug,
          name: sub.title,
          difficulty,
        })
        .select()
        .single();

      if (insertProblemError) throw insertProblemError;
      problemId = newProblem.id;
    }

    const { error: upsertSubmissionError } = await supabase
      .from("submissions")
      .upsert(
        {
          user_id,
          platform: "leetcode",
          problem_id: problemId,
          solved_at: new Date(Number(sub.timestamp) * 1000).toISOString(),
        },
        { onConflict: "user_id,problem_id" }
      );

    if (upsertSubmissionError) throw upsertSubmissionError;
  }

  const { data: userSubmissions, error: submissionsError } = await supabase
    .from("submissions")
    .select("problem_id, problems(difficulty)")
    .eq("user_id", user_id)
    .eq("platform", "leetcode");

  if (submissionsError) throw submissionsError;

  let leetcodePoints = 0;

  userSubmissions?.forEach((sub: any) => {
    const difficulty = sub.problems?.difficulty;

    if (difficulty === "Easy") leetcodePoints += 100;
    else if (difficulty === "Medium") leetcodePoints += 200;
    else if (difficulty === "Hard") leetcodePoints += 400;
  });

  const { data: existingScore, error: scoreError } = await supabase
    .from("user_scores")
    .select("codeforces_points")
    .eq("user_id", user_id)
    .maybeSingle();

  if (scoreError) throw scoreError;

  const codeforcesPoints = existingScore?.codeforces_points || 0;

  const { error: upsertScoreError } = await supabase
    .from("user_scores")
    .upsert(
      {
        user_id,
        codeforces_points: codeforcesPoints,
        leetcode_points: leetcodePoints,
        total_points: codeforcesPoints + leetcodePoints,
        last_updated: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (upsertScoreError) throw upsertScoreError;

  return { synced: true };
}

async function fetchDifficulty(titleSlug: string) {
  const problemQuery = `
    query getQuestion($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        difficulty
      }
    }
  `;

  const response = await fetch("https://leetcode.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
      "Referer": "https://leetcode.com",
    },
    body: JSON.stringify({
      query: problemQuery,
      variables: { titleSlug },
    }),
  });

  const text = await response.text();

  if (text.startsWith("<!DOCTYPE")) {
    return null;
  }

  const result = JSON.parse(text);
  return result.data?.question?.difficulty ?? null;
}
