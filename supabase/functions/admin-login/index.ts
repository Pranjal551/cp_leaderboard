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
    const body = await req.json().catch(() => ({}));
    const adminId = String(body.admin_id ?? "").trim();
    const password = String(body.password ?? "");

    if (!adminId || !password) {
      return jsonResponse({ error: "admin_id and password are required" }, 400);
    }

    const { data: adminUserId, error: verifyError } = await supabase.rpc("verify_admin_credentials", {
      p_admin_id: adminId,
      p_password: password,
    });

    if (verifyError) {
      throw verifyError;
    }

    if (!adminUserId) {
      return jsonResponse({ error: "Invalid admin credentials" }, 401);
    }

    const nowIso = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const sessionToken = generateSessionToken();

    await supabase
      .from("admin_sessions")
      .update({ revoked_at: nowIso })
      .eq("admin_user_id", adminUserId)
      .is("revoked_at", null);

    const { error: insertError } = await supabase
      .from("admin_sessions")
      .insert({
        admin_user_id: adminUserId,
        session_token: sessionToken,
        expires_at: expiresAt,
      });

    if (insertError) {
      throw insertError;
    }

    return jsonResponse({
      token: sessionToken,
      expires_at: expiresAt,
      admin_id: adminId,
    });
  } catch (error: any) {
    return jsonResponse({ error: error.message || "Unexpected error" }, 500);
  }
});

function generateSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
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
