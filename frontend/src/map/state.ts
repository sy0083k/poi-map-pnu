import type { LandListItem } from "./types";

type MapState = {
  originalItems: LandListItem[] | null;
  currentItems: LandListItem[];
  currentIndex: number;
};

export function createMapState() {
  const state: MapState = {
    originalItems: null,
    currentItems: [],
    currentIndex: -1
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
    }
  };
}

export type MapStateStore = ReturnType<typeof createMapState>;
