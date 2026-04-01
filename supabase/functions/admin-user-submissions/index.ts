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

  if (req.method !== "POST") {
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
      .select("id")
      .eq("session_token", sessionToken)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) return jsonResponse({ error: "Invalid or expired admin session" }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = String(body.user_id ?? "").trim();

    if (!userId) {
      return jsonResponse({ error: "user_id is required" }, 400);
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, semester")
      .eq("id", userId)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) return jsonResponse({ error: "Student not found" }, 404);

    const [{ data: accounts, error: accountsError }, { data: submissions, error: submissionsError }] = await Promise.all([
      supabase
        .from("platform_accounts")
        .select("platform, handle")
        .eq("user_id", userId),
      supabase
        .from("submissions")
        .select("platform, solved_at, problems(name, external_problem_id, rating, difficulty)")
        .eq("user_id", userId)
        .order("solved_at", { ascending: false })
        .limit(300),
    ]);

    if (accountsError) throw accountsError;
    if (submissionsError) throw submissionsError;

    const codeforcesHandle = accounts?.find((a: any) => a.platform === "codeforces")?.handle ?? null;
    const leetcodeHandle = accounts?.find((a: any) => a.platform === "leetcode")?.handle ?? null;

    const mapped = (submissions ?? []).map((submission: any) => ({
      solved_at: submission.solved_at,
      problem_name: submission.problems?.name ?? null,
      external_problem_id: submission.problems?.external_problem_id ?? null,
      rating: submission.problems?.rating ?? null,
      difficulty: submission.problems?.difficulty ?? null,
    }));

    const codeforcesSubmissions = mapped.filter((entry: any, index: number) => {
      return (submissions?.[index]?.platform ?? "") === "codeforces";
    });

    const leetcodeSubmissions = mapped.filter((entry: any, index: number) => {
      return (submissions?.[index]?.platform ?? "") === "leetcode";
    });

    return jsonResponse({
      user_id: profile.id,
      full_name: profile.full_name ?? null,
      semester: profile.semester ?? null,
      codeforces_handle: codeforcesHandle,
      leetcode_handle: leetcodeHandle,
      codeforces_submissions: codeforcesSubmissions,
      leetcode_submissions: leetcodeSubmissions,
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
