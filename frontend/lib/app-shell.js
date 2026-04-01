window.logout = async function logout() {
  await supabase.auth.signOut();
  window.location.href = "./index.html";
};

function ensureAppShellStyles() {
  if (document.getElementById("appShellStyles")) return;

  const style = document.createElement("style");
  style.id = "appShellStyles";
  style.textContent = `
    .top-loader {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 14px;
      border: 1px solid rgba(0,242,234,0.24);
      background: rgba(8,12,12,0.94);
      color: #00f2ea;
      font-family: "Fira Code", monospace;
      font-size: 0.66rem;
      letter-spacing: 0.08em;
      opacity: 0;
      pointer-events: none;
      z-index: 9999;
      transition: opacity 0.2s ease, transform 0.2s ease;
      box-shadow: 0 0 18px rgba(0,242,234,0.12);
    }

    .top-loader.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .top-loader-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: #00f2ea;
      box-shadow: 0 0 12px rgba(0,242,234,0.6);
      animation: topLoaderPulse 0.9s ease-in-out infinite;
    }

    @keyframes topLoaderPulse {
      0%, 100% {
        transform: scale(0.8);
        opacity: 0.6;
      }
      50% {
        transform: scale(1.15);
        opacity: 1;
      }
    }
  `;

  document.head.appendChild(style);
}

function ensureTopLoader() {
  ensureAppShellStyles();

  let loader = document.getElementById("topLoader");

  if (!loader) {
    loader = document.createElement("div");
    loader.id = "topLoader";
    loader.className = "top-loader";
    loader.innerHTML = `
      <span class="top-loader-dot"></span>
      <span>it will take a second</span>
    `;
    document.body.appendChild(loader);
  }

  return loader;
}

function ensureNavTransitionOverlay() {
  ensureTopLoader();

  let overlay = document.getElementById("navTransitionOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "navTransitionOverlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "#000";
    overlay.style.zIndex = "9998";
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
    overlay.style.transition = "opacity 0.18s ease";
    document.body.appendChild(overlay);
  }

  return overlay;
}

function showTopLoader(persistForNextPage = false) {
  const loader = ensureTopLoader();
  const overlay = ensureNavTransitionOverlay();

  overlay.style.opacity = "1";
  overlay.style.pointerEvents = "auto";
  loader.classList.add("visible");

  if (persistForNextPage) {
    sessionStorage.setItem("nav_loader", "1");
  }
}

function hideTopLoader() {
  const loader = document.getElementById("topLoader");
  const overlay = document.getElementById("navTransitionOverlay");
  if (loader) loader.classList.remove("visible");
  if (overlay) {
    overlay.style.opacity = "0";
    overlay.style.pointerEvents = "none";
  }
}

window.bootstrapAppShell = async function bootstrapAppShell(activePage) {
  ensureTopLoader();

  if (sessionStorage.getItem("nav_loader") === "1") {
    document.documentElement.classList.add("nav-pending");
    showTopLoader(false);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = "./index.html";
    return null;
  }

  const shouldSyncNow = window.shouldAutoSync("app");
  const syncPromise = shouldSyncNow
    ? window.syncUserLeaderboardData({ userId: user.id })
    : Promise.resolve(null);

  const [{ data: profile }, { data: accounts }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).single(),
    supabase.from("platform_accounts").select("platform, handle").eq("user_id", user.id),
  ]);

  const name =
    profile?.full_name || user.user_metadata?.full_name || user.email.split("@")[0];

  const hasCodeforces = (accounts || []).some((account) => account.platform === "codeforces");
  const hasLeetcode = (accounts || []).some((account) => account.platform === "leetcode");

  const navItems = [
    { id: "profile", label: "PROFILE", href: "./dashboard.html", show: true },
    { id: "leaderboard", label: "LEADERBOARD", href: "./leaderboard.html", show: true },
    { id: "weekly", label: "WEEKLY", href: "./weekly.html", show: true },
    { id: "codeforces", label: "CODEFORCES DATA", href: "./codeforces.html", show: hasCodeforces },
    { id: "leetcode", label: "LEETCODE DATA", href: "./leetcode.html", show: hasLeetcode },
  ].filter((item) => item.show);

  const nav = document.getElementById("appNavbar");

  if (nav) {
    nav.innerHTML = `
      <div class="nav-logo">[ CP_LEADERBOARD ]</div>
      <div class="nav-menu">
        ${navItems
          .map(
            (item) => `
              <a class="nav-tab ${item.id === activePage ? "active" : ""}" href="${item.href}">
                <span class="nav-tab-text">${item.label}</span>
              </a>
            `
          )
          .join("")}
      </div>
      <div class="nav-user">
        <span id="displayName">${name}</span>
        <button class="nav-link" onclick="logout()">LOGOUT</button>
      </div>
    `;

    nav.querySelectorAll(".nav-tab").forEach((tab) => {
      tab.addEventListener("click", (event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }

        const href = tab.getAttribute("href");
        if (!href) return;

        event.preventDefault();
        showTopLoader(true);
        window.location.href = href;
      });
    });
  }

  if (sessionStorage.getItem("nav_loader") === "1") {
    sessionStorage.removeItem("nav_loader");
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("nav-pending");
      setTimeout(hideTopLoader, 180);
    });
  }

  return { user, profile, accounts: accounts || [], name, syncResult: null, syncPromise };
};
