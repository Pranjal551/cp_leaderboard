window.logout = async function logout() {
  await supabase.auth.signOut();
  window.location.href = "./index.html";
};

function ensureAppShellStyles() {
  if (document.getElementById("appShellStyles")) return;

  const style = document.createElement("style");
  style.id = "appShellStyles";
  style.textContent = `
    .app-nav-brand {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      justify-self: start;
      min-height: 72px;
    }

    .app-nav-logo {
      display: block;
      object-fit: contain;
      filter: drop-shadow(0 0 8px rgba(0,242,234,0.18));
    }

    .app-nav-logo-c3 {
      width: 72px;
      height: 72px;
      flex-shrink: 0;
    }

    .app-nav-logo-nm {
      width: auto;
      height: 56px;
      max-width: 260px;
      flex-shrink: 0;
    }

    .app-nav-logo-divider {
      width: 1px;
      height: 56px;
      background: rgba(255,255,255,0.5);
      box-shadow: 0 0 8px rgba(255,255,255,0.2);
      flex-shrink: 0;
    }

    @media (max-width: 900px) {
      .app-nav-brand {
        gap: 8px;
        min-height: 56px;
      }

      .app-nav-logo-c3 {
        width: 56px;
        height: 56px;
      }

      .app-nav-logo-nm {
        width: auto;
        height: 42px;
        max-width: 190px;
      }

      .app-nav-logo-divider {
        height: 42px;
      }
    }

    .top-loader {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%) translateY(-8px);
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
      min-width: 248px;
      min-height: 42px;
      position: fixed;
      overflow: hidden;
    }

    .top-loader.visible {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }

    .top-loader-label {
      position: relative;
      z-index: 2;
    }

    .top-loader-cubes {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 1;
    }

    .top-loader-cube {
      position: absolute;
      width: 7px;
      height: 7px;
      background: #00f2ea;
      opacity: 0.38;
      box-shadow: 0 0 8px rgba(0,242,234,0.32);
      animation: topLoaderPulse 0.95s ease-in-out infinite;
      animation-delay: var(--delay, 0s);
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
      <span class="top-loader-cubes" aria-hidden="true">
        <span class="top-loader-cube" style="--delay: 0s;"></span>
        <span class="top-loader-cube" style="--delay: 0.12s;"></span>
        <span class="top-loader-cube" style="--delay: 0.24s;"></span>
      </span>
      <span class="top-loader-label">it will take a second</span>
    `;
    document.body.appendChild(loader);
  }

  return loader;
}

function randomizeTopLoaderCubes(loader) {
  const cubes = loader?.querySelectorAll(".top-loader-cube");
  if (!cubes?.length) return;

  cubes.forEach((cube, index) => {
    const x = 8 + Math.floor(Math.random() * 78);
    const y = 14 + Math.floor(Math.random() * 50);
    const size = 5 + ((index + Math.floor(Math.random() * 3)) % 4);
    cube.style.left = `${x}%`;
    cube.style.top = `${y}%`;
    cube.style.width = `${size}px`;
    cube.style.height = `${size}px`;
  });
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
  randomizeTopLoaderCubes(loader);

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
      <div class="app-nav-brand" aria-label="CP Leaderboard Brand">
        <img src="./asset/c3logo.png" alt="C3 Logo" class="app-nav-logo app-nav-logo-c3" />
        <span class="app-nav-logo-divider" aria-hidden="true"></span>
        <img src="./asset/nmlogo.png" alt="NM Logo" class="app-nav-logo app-nav-logo-nm" />
      </div>
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
