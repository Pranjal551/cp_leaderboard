import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-admin-token, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const sessionToken = extractSessionToken(req);
    if (!sessionToken) {
      return jsonResponse({ error: "Missing admin token" }, 401);
    }

    const { data: session, error: sessionError } = await supabase
      .from("admin_sessions")
      .select("id, admin_user_id")
      .eq("session_token", sessionToken)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError) {
      throw sessionError;
    }

    if (!session) {
      return jsonResponse({ error: "Invalid or expired admin session" }, 401);
    }

    const { data: latestWeek, error: latestWeekError } = await supabase
      .from("weekly_scores")
      .select("week_start, week_end")
      .order("week_start", { ascending: false })
      .order("week_end", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestWeekError) {
      throw latestWeekError;
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, semester")
      .order("created_at", { ascending: true });

    if (profilesError) {
      throw profilesError;
    }

    const userIds = (profiles ?? []).map((profile: any) => profile.id);

    if (userIds.length === 0) {
      return jsonResponse({
        latest_week: latestWeek ?? null,
        total_students: 0,
        students: [],
      });
    }

    const [
      { data: accounts, error: accountsError },
      { data: scores, error: scoresError },
      weeklyScoresResult,
    ] = await Promise.all([
      supabase
        .from("platform_accounts")
        .select("user_id, platform, handle")
        .in("user_id", userIds),
      supabase
        .from("user_scores")
        .select("user_id, codeforces_points, leetcode_points, total_points")
        .in("user_id", userIds),
      latestWeek
        ? supabase
            .from("weekly_scores")
            .select("user_id, total_points")
            .eq("week_start", latestWeek.week_start)
            .eq("week_end", latestWeek.week_end)
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (accountsError) {
      throw accountsError;
    }

    if (scoresError) {
      throw scoresError;
    }

    if (weeklyScoresResult.error) {
      throw weeklyScoresResult.error;
    }

    const accountMap: Record<string, { codeforces_handle: string | null; leetcode_handle: string | null }> = {};
    const scoreMap: Record<string, { codeforces_points: number; leetcode_points: number; total_points: number }> = {};
    const weeklyMap: Record<string, number> = {};

    (accounts ?? []).forEach((account: any) => {
      if (!accountMap[account.user_id]) {
        accountMap[account.user_id] = {
          codeforces_handle: null,
          leetcode_handle: null,
        };
      }

      if (account.platform === "codeforces") {
        accountMap[account.user_id].codeforces_handle = account.handle;
      }

      if (account.platform === "leetcode") {
        accountMap[account.user_id].leetcode_handle = account.handle;
      }
    });

    (scores ?? []).forEach((score: any) => {
      const codeforcesPoints = score.codeforces_points ?? 0;
      const leetcodePoints = score.leetcode_points ?? 0;
      const totalPoints = score.total_points ?? codeforcesPoints + leetcodePoints;

      scoreMap[score.user_id] = {
        codeforces_points: codeforcesPoints,
        leetcode_points: leetcodePoints,
        total_points: totalPoints,
      };
    });

    (weeklyScoresResult.data ?? []).forEach((weeklyScore: any) => {
      weeklyMap[weeklyScore.user_id] = weeklyScore.total_points ?? 0;
    });

    const students = (profiles ?? [])
      .map((profile: any) => {
        const handles = accountMap[profile.id] ?? {
          codeforces_handle: null,
          leetcode_handle: null,
        };

        const score = scoreMap[profile.id] ?? {
          codeforces_points: 0,
          leetcode_points: 0,
          total_points: 0,
        };

        return {
          user_id: profile.id,
          full_name: profile.full_name ?? null,
          semester: profile.semester ?? null,
          codeforces_handle: handles.codeforces_handle,
          leetcode_handle: handles.leetcode_handle,
          codeforces_points: score.codeforces_points,
          leetcode_points: score.leetcode_points,
          total_points: score.total_points,
          weekly_points: weeklyMap[profile.id] ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.total_points !== a.total_points) {
          return b.total_points - a.total_points;
        }

        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      });

    return jsonResponse({
      latest_week: latestWeek ?? null,
      total_students: students.length,
      students,
    });
  } catch (error: any) {
    return jsonResponse({ error: error.message || "Unexpected error" }, 500);
  }
});

function extractSessionToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  if (authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  return req.headers.get("x-admin-token")?.trim() || null;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
