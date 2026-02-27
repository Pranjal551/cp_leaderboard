import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {

    const { data, error } = await supabase
      .from("user_scores")
      .select(`
        total_points,
        profiles (
          full_name,
          semester
        )
      `)
      .order("total_points", { ascending: false });

    if (error) throw error;

    const leaderboard = data.map((user: any, index: number) => ({
      rank: index + 1,
      full_name: user.profiles?.full_name,
      semester: user.profiles?.semester,
      total_points: user.total_points
    }));

    return new Response(
      JSON.stringify(leaderboard),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    );
  }
});