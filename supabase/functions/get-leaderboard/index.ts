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
    const { data: scores, error } = await supabase
      .from("user_scores")
      .select("user_id, codeforces_points, leetcode_points, total_points")
      .limit(10);

    if (error) throw error;

    const userIds = (scores ?? []).map((user: any) => user.user_id).filter(Boolean);

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, semester")
      .in("id", userIds);

    if (profilesError) throw profilesError;

    const { data: accounts, error: accountsError } = await supabase
      .from("platform_accounts")
      .select("user_id, platform, handle")
      .in("user_id", userIds);

    if (accountsError) throw accountsError;

    const priority: Record<string, number> = {
      codeforces: 0,
      leetcode: 1,
    };

    const handleMap: Record<string, { handle: string; priority: number }> = {};
    const profileMap: Record<string, { full_name: string | null; semester: number | null }> = {};

    (profiles ?? []).forEach((profile: any) => {
      profileMap[profile.id] = {
        full_name: profile.full_name ?? null,
        semester: profile.semester ?? null,
      };
    });

    (accounts ?? []).forEach((account: any) => {
      const nextPriority = priority[account.platform] ?? 99;
      const current = handleMap[account.user_id];

      if (!current || nextPriority < current.priority) {
        handleMap[account.user_id] = {
          handle: account.handle,
          priority: nextPriority,
        };
      }
    });

    const leaderboard = (scores ?? [])
      .map((user: any) => {
        const codeforcesPoints = user.codeforces_points ?? 0;
        const leetcodePoints = user.leetcode_points ?? 0;
        const computedTotal = codeforcesPoints + leetcodePoints;

        return {
          user_id: user.user_id,
          codeforces_points: codeforcesPoints,
          leetcode_points: leetcodePoints,
          total_points: computedTotal,
        };
      })
      .sort((a, b) => b.total_points - a.total_points)
      .map((user: any, index: number) => ({
      rank: index + 1,
      user_id: user.user_id,
      handle: handleMap[user.user_id]?.handle || profileMap[user.user_id]?.full_name || "-",
      full_name: profileMap[user.user_id]?.full_name ?? null,
      semester: profileMap[user.user_id]?.semester ?? null,
      codeforces_points: user.codeforces_points,
      leetcode_points: user.leetcode_points,
      total_points: user.total_points,
    }));

    return new Response(JSON.stringify(leaderboard), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  }
});
