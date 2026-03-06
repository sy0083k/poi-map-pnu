type MobileViewState = "home" | "search" | "results";

const MOBILE_MEDIA_QUERY = "(max-width: 768px)";
const DESKTOP_MEDIA_QUERY = "(min-width: 769px)";
const MOBILE_HISTORY_KEY = "mobileMapViewState";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebarCollapsed";

type SetupLayoutControlsOptions = {
  sidebarHandle: Element | null;
  mobileSearchFab: Element | null;
  mobileSearchCloseBtn: Element | null;
  mobileSearchBtn: Element | null;
  mobileResetBtn: Element | null;
  syncDesktopToMobileInputs: () => void;
  syncMobileToDesktopInputs: () => void;
  onSearch: () => void;
  onReset: () => void;
  onDesktopResize: () => void;
};

function isMobileViewport(): boolean {
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

function readMobileViewState(value: unknown): MobileViewState | null {
  if (value === "home" || value === "search" || value === "results") {
    return value;
  }
  return null;
}

export function setupLayoutControls(options: SetupLayoutControlsOptions): {
  applySidebarCollapsed: (collapsed: boolean, persist?: boolean) => void;
  maybeInitMobileHistory: () => void;
  setMobileState: (nextState: MobileViewState, pushHistory?: boolean) => void;
} {
  let mobileState: MobileViewState = "home";

  const applyMobileClass = (): void => {
    document.body.classList.remove("mobile-home", "mobile-search", "mobile-results");
    if (!isMobileViewport()) {
      return;
    }
    document.body.classList.add(`mobile-${mobileState}`);
  };

  const setMobileState = (nextState: MobileViewState, pushHistory = true): void => {
    mobileState = nextState;
    applyMobileClass();
    if (!isMobileViewport() || !pushHistory) {
      return;
    }
    const current = history.state && typeof history.state === "object" ? history.state : {};
    history.pushState({ ...current, [MOBILE_HISTORY_KEY]: nextState }, "");
  };

  const maybeInitMobileHistory = (): void => {
    if (!isMobileViewport()) {
      return;
    }
    const current = history.state && typeof history.state === "object" ? history.state : {};
    history.replaceState({ ...current, [MOBILE_HISTORY_KEY]: mobileState }, "");
    applyMobileClass();
  };

  const applySidebarCollapsed = (collapsed: boolean, persist = true): void => {
    if (!window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      document.body.classList.remove("sidebar-collapsed");
      return;
    }
    document.body.classList.toggle("sidebar-collapsed", collapsed);
    if (options.sidebarHandle instanceof HTMLButtonElement) {
      options.sidebarHandle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      options.sidebarHandle.setAttribute("aria-label", collapsed ? "사이드 메뉴 펼치기" : "사이드 메뉴 접기");
    }
    if (persist) {
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "true" : "false");
      } catch {
        // Ignore storage failures.
      }
    }
    window.setTimeout(() => {
      options.onDesktopResize();
    }, 240);
  };

  const toggleSidebar = (): void => {
    const collapsed = !document.body.classList.contains("sidebar-collapsed");
    applySidebarCollapsed(collapsed);
  };

  options.sidebarHandle?.addEventListener("click", toggleSidebar);
  options.sidebarHandle?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleSidebar();
    }
  });

  options.mobileSearchFab?.addEventListener("click", () => {
    if (!isMobileViewport()) {
      return;
    }
    options.syncDesktopToMobileInputs();
    setMobileState("search", true);
  });

  options.mobileSearchCloseBtn?.addEventListener("click", () => {
    if (!isMobileViewport()) {
      return;
    }
    history.back();
  });

  options.mobileSearchBtn?.addEventListener("click", () => {
    if (!isMobileViewport()) {
      return;
    }
    options.syncMobileToDesktopInputs();
    options.onSearch();
    setMobileState("results", true);
  });

  options.mobileResetBtn?.addEventListener("click", () => {
    options.syncMobileToDesktopInputs();
    options.onReset();
    options.syncDesktopToMobileInputs();
  });

  window.addEventListener("popstate", (event) => {
    if (!isMobileViewport()) {
      return;
    }
    const statePayload =
      event.state && typeof event.state === "object" ? (event.state as Record<string, unknown>) : {};
    const nextMobileState = readMobileViewState(statePayload[MOBILE_HISTORY_KEY]);
    if (nextMobileState) {
      setMobileState(nextMobileState, false);
    }
  });

  window.matchMedia(MOBILE_MEDIA_QUERY).addEventListener("change", () => {
    applyMobileClass();
  });

  window.matchMedia(DESKTOP_MEDIA_QUERY).addEventListener("change", () => {
    if (window.matchMedia(DESKTOP_MEDIA_QUERY).matches) {
      let shouldCollapse = false;
      try {
        shouldCollapse = localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
      } catch {
        shouldCollapse = false;
      }
      applySidebarCollapsed(shouldCollapse, false);
    } else {
      applySidebarCollapsed(false, false);
    }
    options.onDesktopResize();
  });

  return {
    applySidebarCollapsed,
    maybeInitMobileHistory,
    setMobileState
  };
}

export function readInitialSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function normalizePathname(pathname: string): string {
  if (pathname === "/") {
    return pathname;
  }
  return pathname.replace(/\/+$/, "");
}
