// Supabase client - uses UMD global exposed by the CDN script in the HTML
const SUPABASE_URL = "https://pzrfvuckvmhuzyanqhra.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4aXfr9YIQvHLnGMroTFBBQ_VLyHefA7";
const PROD_APP_ORIGIN = "https://cp-leaderboard-pi.vercel.app";

function resolveAppOrigin() {
  const { hostname, origin } = window.location;
  const isLocalhost =
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0";

  return isLocalhost ? PROD_APP_ORIGIN : origin;
}

window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.CP_APP_ORIGIN = resolveAppOrigin();
window.CP_RESET_PASSWORD_URL = `${window.CP_APP_ORIGIN}/reset-password.html`;
