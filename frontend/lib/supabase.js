// Supabase client — uses UMD global exposed by the CDN script in the HTML
const SUPABASE_URL = "https://pzrfvuckvmhuzyanqhra.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4aXfr9YIQvHLnGMroTFBBQ_VLyHefA7";

window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);