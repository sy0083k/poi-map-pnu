import type { LandListItem } from "./types";
import type { ThemeType } from "./types";

type MapState = {
  originalItems: LandListItem[] | null;
  currentItems: LandListItem[];
  currentIndex: number;
  currentTheme: ThemeType;
};

export function createMapState() {
  const state: MapState = {
    originalItems: null,
    currentItems: [],
    currentIndex: -1,
    currentTheme: "national_public"
  };

  return {
    setOriginalItems(items: LandListItem[]): void {
      state.originalItems = items;
    },
    getOriginalItems(): LandListItem[] | null {
      return state.originalItems;
    },
    setCurrentItems(items: LandListItem[]): void {
      state.currentItems = items;
      state.currentIndex = -1;
    },
    getCurrentItems(): LandListItem[] {
      return state.currentItems;
    },
    setCurrentIndex(index: number): void {
      state.currentIndex = index;
    },
    getCurrentIndex(): number {
      return state.currentIndex;
    },
    setCurrentTheme(theme: ThemeType): void {
      state.currentTheme = theme;
    },
    getCurrentTheme(): ThemeType {
      return state.currentTheme;
    }
  };
}

export type MapStateStore = ReturnType<typeof createMapState>;
