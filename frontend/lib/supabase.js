// Supabase client - uses UMD global exposed by the CDN script in the HTML
const SUPABASE_URL = "https://pzrfvuckvmhuzyanqhra.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_4aXfr9YIQvHLnGMroTFBBQ_VLyHefA7";
const PROD_APP_ORIGIN = "https://cp-leaderboard-pi.vercel.app";
const APP_SYNC_SEEN_KEY = "cp_app_sync_seen";
const LANDING_SYNC_SEEN_KEY = "cp_landing_sync_seen";

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

function getNavigationType() {
  const navigationEntry = performance.getEntriesByType?.("navigation")?.[0];

  if (navigationEntry?.type) {
    return navigationEntry.type;
  }

  if (performance.navigation?.type === 1) {
    return "reload";
  }

  return "navigate";
}

async function ensureActiveSession() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return { ok: false, error: sessionError.message };
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = sessionData.session?.expires_at ?? 0;
  const hasToken = !!sessionData.session?.access_token;
  const shouldRefresh = !hasToken || expiresAt - now <= 30;

  if (!shouldRefresh) {
    return { ok: true, error: null };
  }

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData.session?.access_token) {
    return {
      ok: false,
      error: refreshError?.message || "No active session token for edge function calls.",
    };
  }

  return { ok: true, error: null };
}

async function invokeProtectedFunction(functionName, body) {
  const invokeOnce = async () => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token ?? null;

    if (sessionError || !accessToken) {
      return {
        data: null,
        error: {
          message: sessionError?.message || "No active session token for edge function calls.",
          status: 401,
        },
      };
    }

    let response;
    try {
      response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body ?? {}),
      });
    } catch (networkError) {
      return {
        data: null,
        error: {
          message: networkError?.message || "Network error while invoking edge function.",
          status: 0,
        },
      };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {}

    if (!response.ok) {
      return {
        data: null,
        error: {
          message:
            payload?.error ||
            payload?.message ||
            `Edge function ${functionName} failed with ${response.status}.`,
          status: response.status,
        },
      };
    }

    return {
      data: payload,
      error: null,
    };
  };

  let result = await invokeOnce();
  if (!result.error || result.error.status !== 401) {
    return result;
  }

  // One retry after forcing a session refresh avoids transient 401s.
  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshData.session?.access_token) {
    return result;
  }

  result = await invokeOnce();
  return result;
}

window.markAutoSyncSeen = function markAutoSyncSeen(mode = "app") {
  if (mode === "app") {
    sessionStorage.setItem(APP_SYNC_SEEN_KEY, "1");
    return;
  }

  if (mode === "landing") {
    sessionStorage.setItem(LANDING_SYNC_SEEN_KEY, "1");
  }
};

window.shouldAutoSync = function shouldAutoSync(mode = "app") {
  if (mode === "login") {
    return true;
  }

  if (getNavigationType() === "reload") {
    return true;
  }

  if (mode === "app") {
    return !sessionStorage.getItem(APP_SYNC_SEEN_KEY);
  }

  if (mode === "landing") {
    return !sessionStorage.getItem(LANDING_SYNC_SEEN_KEY);
  }

  return false;
};

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
    const { ok: hasActiveSession, error: sessionError } = await ensureActiveSession();
    if (!hasActiveSession) {
      return {
        synced: false,
        skipped: "auth-error",
        errors: [sessionError],
        accounts: linkedAccounts,
        hasCodeforces,
        hasLeetcode,
      };
    }

    const platformSyncCalls = [];

    if (hasCodeforces) {
      platformSyncCalls.push(
        invokeProtectedFunction("sync-codeforces", {
          user_id: userId,
        }).then((result) => ({ name: "sync-codeforces", result }))
      );
    }

    if (hasLeetcode) {
      platformSyncCalls.push(
        invokeProtectedFunction("sync-leetcode", {
          user_id: userId,
        }).then((result) => ({ name: "sync-leetcode", result }))
      );
    }

    const platformResults = await Promise.all(platformSyncCalls);
    platformResults.forEach(({ name, result }) => {
      if (result.error) {
        errors.push(`${name}: ${result.error.message}`);
      }
    });

    const weeklyResult = await invokeProtectedFunction("sync-weekly-leaderboard", {});
    if (weeklyResult.error) {
      errors.push(`sync-weekly-leaderboard: ${weeklyResult.error.message}`);
    }

    const synced = errors.length === 0;
    if (synced && options.markAppSyncSeen !== false) {
      window.markAutoSyncSeen("app");
    }

    return {
      synced,
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
