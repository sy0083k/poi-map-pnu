import { normalizePathname } from "./layout-controls";

import type { ThemeType } from "./types";

export const THEME_HISTORY_KEY = "mapTheme";

const THEME_PATHS: Record<ThemeType, string> = {
  national_public: "/gukgongyu",
  city_owned: "/siyu"
};

export function asThemeType(raw: string): ThemeType | null {
  if (raw === "national_public" || raw === "city_owned") {
    return raw;
  }
  return null;
}

export function getThemeFromPathname(pathname: string): ThemeType | null {
  const normalized = normalizePathname(pathname);
  if (normalized === THEME_PATHS.national_public) {
    return "national_public";
  }
  if (normalized === THEME_PATHS.city_owned) {
    return "city_owned";
  }
  return null;
}

export function getThemePath(theme: ThemeType): string {
  return THEME_PATHS[theme];
}

export function getThemeLabel(theme: ThemeType): string {
  return theme === "national_public" ? "국·공유재산" : "시유재산";
}

export function pushThemeHistory(theme: ThemeType): void {
  const targetPath = getThemePath(theme);
  if (normalizePathname(window.location.pathname) === targetPath) {
    return;
  }
  const current = history.state && typeof history.state === "object" ? history.state : {};
  history.pushState({ ...current, [THEME_HISTORY_KEY]: theme }, "", targetPath);
}

export function replaceThemeHistory(theme: ThemeType): void {
  const current = history.state && typeof history.state === "object" ? history.state : {};
  history.replaceState({ ...current, [THEME_HISTORY_KEY]: theme }, "");
}
