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

window.syncUserLeaderboardData = async function syncUserLeaderboardData(options = {}) {
  if (window.__cpSyncPromise) {
    return window.__cpSyncPromise;
  }

  window.__cpSyncPromise = (async () => {
    const requestedUserId = options.userId ?? null;

    let userId = requestedUserId;
    if (!userId) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return {
          synced: false,
          skipped: "no-user",
          errors: [],
          accounts: [],
        };
      }

      userId = user.id;
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("platform_accounts")
      .select("platform, handle")
      .eq("user_id", userId);

    if (accountsError) {
      return {
        synced: false,
        skipped: "accounts-error",
        errors: [accountsError.message],
        accounts: [],
      };
    }

    const linkedAccounts = accounts || [];
    const hasCodeforces = linkedAccounts.some((account) => account.platform === "codeforces");
    const hasLeetcode = linkedAccounts.some((account) => account.platform === "leetcode");
    const errors = [];

    const syncCalls = [];
    if (hasCodeforces) {
      syncCalls.push(
        supabase.functions.invoke("sync-codeforces", {
          body: { user_id: userId },
        }).then((result) => ({ name: "sync-codeforces", ...result }))
      );
    }

    if (hasLeetcode) {
      syncCalls.push(
        supabase.functions.invoke("sync-leetcode", {
          body: { user_id: userId },
        }).then((result) => ({ name: "sync-leetcode", ...result }))
      );
    }

    const syncResults = await Promise.all(syncCalls);
    syncResults.forEach((result) => {
      if (result.error) {
        errors.push(`${result.name}: ${result.error.message}`);
      }
    });

    const weeklyResult = await supabase.functions.invoke("sync-weekly-leaderboard");
    if (weeklyResult.error) {
      errors.push(`sync-weekly-leaderboard: ${weeklyResult.error.message}`);
    }

    return {
      synced: errors.length === 0,
      skipped: false,
      errors,
      accounts: linkedAccounts,
      hasCodeforces,
      hasLeetcode,
    };
  })();

  try {
    return await window.__cpSyncPromise;
  } finally {
    window.__cpSyncPromise = null;
  }
};
