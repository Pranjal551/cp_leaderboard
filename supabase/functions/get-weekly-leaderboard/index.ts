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
    const { weekStartDate, weekEndDate } = getCurrentWeekRange();

    const { data: scores, error } = await supabase
      .from("weekly_scores")
      .select("user_id, total_points")
      .eq("week_start", weekStartDate)
      .eq("week_end", weekEndDate);

    if (error) throw error;

    const userIds = (scores ?? []).map((entry: any) => entry.user_id).filter(Boolean);

    if (userIds.length === 0) {
      return jsonResponse({
        week_start: weekStartDate,
        week_end: weekEndDate,
        leaderboard: [],
      });
    }

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
      .map((entry: any) => ({
        user_id: entry.user_id,
        handle: handleMap[entry.user_id]?.handle || profileMap[entry.user_id]?.full_name || "-",
        full_name: profileMap[entry.user_id]?.full_name ?? null,
        semester: profileMap[entry.user_id]?.semester ?? null,
        total_points: entry.total_points ?? 0,
      }))
      .sort((a, b) => b.total_points - a.total_points)
      .map((entry, index) => ({
        rank: index + 1,
        ...entry,
      }));

    return jsonResponse({
      week_start: weekStartDate,
      week_end: weekEndDate,
      leaderboard,
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
    weekStartDate: weekStart.toISOString().slice(0, 10),
    weekEndDate: weekEnd.toISOString().slice(0, 10),
  };
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
