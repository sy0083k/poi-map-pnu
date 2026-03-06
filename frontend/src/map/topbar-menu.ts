import type { BaseType, ThemeType } from "./types";

type SetupTopbarMenusOptions = {
  menuBasemapTrigger: Element | null;
  menuThemeTrigger: Element | null;
  onThemeSelected: (theme: ThemeType) => void;
  onBasemapSelected: (baseType: BaseType) => void;
  showToast: (message: string) => void;
};

export function setupTopbarMenus(options: SetupTopbarMenusOptions): {
  closeAllMenus: () => void;
  syncThemeMenuActiveState: (theme: ThemeType) => void;
} {
  const menuTriggers = [
    options.menuBasemapTrigger instanceof HTMLButtonElement ? options.menuBasemapTrigger : null,
    options.menuThemeTrigger instanceof HTMLButtonElement ? options.menuThemeTrigger : null
  ];

  const themeMenuItems = Array.from(document.querySelectorAll<HTMLButtonElement>(".menu-item[data-theme]"));
  const linkThemeMenuItems = Array.from(
    document.querySelectorAll<HTMLButtonElement>(".menu-item[data-menu-link][data-link-theme]")
  );

  const closeAllMenus = (): void => {
    menuTriggers.forEach((trigger) => {
      if (!trigger) {
        return;
      }
      trigger.setAttribute("aria-expanded", "false");
      trigger.parentElement?.classList.remove("is-open");
    });
  };

  const syncThemeMenuActiveState = (theme: ThemeType): void => {
    themeMenuItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.theme === theme);
    });
    linkThemeMenuItems.forEach((item) => {
      item.classList.toggle("is-active", item.dataset.linkTheme === theme);
    });
  };

  menuTriggers.forEach((trigger) => {
    if (!trigger) {
      return;
    }
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = trigger.getAttribute("aria-expanded") === "true";
      closeAllMenus();
      if (!isOpen) {
        trigger.setAttribute("aria-expanded", "true");
        trigger.parentElement?.classList.add("is-open");
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".menu-item[data-menu-link]").forEach((item) => {
    item.addEventListener("click", () => {
      const target = item.dataset.menuLink || "";
      if (!target.startsWith("/")) {
        return;
      }
      closeAllMenus();
      window.location.assign(target);
    });
  });

  themeMenuItems.forEach((item) => {
    item.addEventListener("click", () => {
      const rawTheme = item.dataset.theme || "";
      if (rawTheme !== "national_public" && rawTheme !== "city_owned") {
        return;
      }
      options.onThemeSelected(rawTheme);
      closeAllMenus();
    });
  });

  document.querySelectorAll<HTMLElement>(".menu-item[data-basemap]").forEach((item) => {
    item.addEventListener("click", () => {
      const rawBasemap = item.dataset.basemap || "";
      if (rawBasemap !== "Base" && rawBasemap !== "White" && rawBasemap !== "Satellite" && rawBasemap !== "Hybrid") {
        return;
      }
      options.onBasemapSelected(rawBasemap);
      closeAllMenus();
    });
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Node)) {
      return;
    }
    if (!target.parentElement?.closest(".menu-group")) {
      closeAllMenus();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeAllMenus();
    }
  });

  return {
    closeAllMenus,
    syncThemeMenuActiveState
  };
}
