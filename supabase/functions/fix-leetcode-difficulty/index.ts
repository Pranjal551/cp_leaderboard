import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sleep = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {

    // 🔎 Get only leetcode problems missing difficulty
    const { data: problems, error } = await supabase
      .from("problems")
      .select("id, external_problem_id")
      .eq("platform", "leetcode")
      .is("difficulty", null);

    if (error) throw error;

    if (!problems || problems.length === 0) {
      return new Response(
        JSON.stringify({ message: "No problems need fixing" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    let fixed = 0;
    let skipped = 0;

    for (const problem of problems) {

      // 🔥 rate limit protection
      await sleep(350);

      const query = `
        query getQuestion($titleSlug: String!) {
          question(titleSlug: $titleSlug) {
            difficulty
          }
        }
      `;

      const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0",
          "Referer": "https://leetcode.com"
        },
        body: JSON.stringify({
          query,
          variables: { titleSlug: problem.external_problem_id }
        })
      });

      const text = await res.text();

      // ❌ Cloudflare protection check
      if (text.startsWith("<!DOCTYPE")) {
        skipped++;
        continue;
      }

      const data = JSON.parse(text);
      const difficulty = data?.data?.question?.difficulty;

      if (!difficulty) {
        skipped++;
        continue;
      }

      await supabase
        .from("problems")
        .update({ difficulty })
        .eq("id", problem.id);

      fixed++;
    }

    return new Response(
      JSON.stringify({
        totalChecked: problems.length,
        fixed,
        skipped
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