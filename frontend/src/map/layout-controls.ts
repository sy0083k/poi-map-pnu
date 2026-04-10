type MobileViewState = "home" | "search" | "results";

const MOBILE_MEDIA_QUERY = "(max-width: 768px)";
const DESKTOP_MEDIA_QUERY = "(min-width: 769px)";
const MOBILE_HISTORY_KEY = "mobileMapViewState";
const DOCK_OPEN_STORAGE_KEY = "dockOpen";

type SetupLayoutControlsOptions = {
  dockTansakBtn: HTMLButtonElement | null;
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
  applyDock: (open: boolean, persist?: boolean) => void;
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

  const applyDock = (open: boolean, persist = true): void => {
    document.body.classList.toggle("dock-open", open);
    if (options.dockTansakBtn) {
      options.dockTansakBtn.setAttribute("aria-pressed", String(open));
      options.dockTansakBtn.setAttribute(
        "aria-label",
        open ? "탐색 패널 닫기" : "탐색 패널 열기"
      );
    }
    if (persist) {
      try {
        localStorage.setItem(DOCK_OPEN_STORAGE_KEY, String(open));
      } catch {
        // Ignore storage failures.
      }
    }
    if (!open) {
      window.setTimeout(() => {
        options.onDesktopResize();
      }, 240);
    }
  };

  const toggleDock = (): void => applyDock(!document.body.classList.contains("dock-open"));

  options.dockTansakBtn?.addEventListener("click", toggleDock);
  options.dockTansakBtn?.addEventListener("keydown", (event) => {
    if (!(event instanceof KeyboardEvent)) {
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleDock();
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
      let storedOpen = false;
      try {
        storedOpen = localStorage.getItem(DOCK_OPEN_STORAGE_KEY) === "true";
      } catch {
        storedOpen = false;
      }
      applyDock(storedOpen, false);
    } else {
      document.body.classList.remove("dock-open");
    }
    options.onDesktopResize();
  });

  return {
    applyDock,
    maybeInitMobileHistory,
    setMobileState
  };
}

export function readInitialDockOpen(): boolean {
  try {
    return localStorage.getItem(DOCK_OPEN_STORAGE_KEY) === "true";
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
