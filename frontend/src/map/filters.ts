import type { LandListItem } from "./types";

type FilterElements = {
  regionSearchInput: HTMLInputElement | null;
  minAreaInput: HTMLInputElement | null;
  maxAreaInput: HTMLInputElement | null;
  propertyManagerInput: HTMLInputElement | null;
};

export type FilterValues = {
  rawSearchTerm: string;
  searchTerm: string;
  rawMinAreaInput: string;
  rawMaxAreaInput: string;
  rawPropertyManagerInput: string;
  minArea: number;
  maxArea: number;
  propertyManagerTerm: string;
};

export function createFilters(elements: FilterElements) {
  const getValues = (): FilterValues => {
    const rawSearchTerm = elements.regionSearchInput?.value ?? "";
    const searchTerm = rawSearchTerm.trim();
    const rawMinAreaInput = elements.minAreaInput?.value ?? "";
    const rawMaxAreaInput = elements.maxAreaInput?.value ?? "";
    const rawPropertyManagerInput = elements.propertyManagerInput?.value ?? "";
    const propertyManagerTerm = rawPropertyManagerInput.trim();

    return {
      rawSearchTerm,
      searchTerm,
      rawMinAreaInput,
      rawMaxAreaInput,
      rawPropertyManagerInput,
      minArea: Number.parseFloat(rawMinAreaInput || "") || 0,
      maxArea: Number.parseFloat(rawMaxAreaInput || "") || Number.POSITIVE_INFINITY,
      propertyManagerTerm
    };
  };

  const filterItems = (items: LandListItem[], values: FilterValues): LandListItem[] => {
    return items.filter((item) => {
      const address = item.address || "";
      const area = item.area || 0;
      const propertyManager = item.property_manager || "";

      const matchRegion = values.searchTerm === "" || address.includes(values.searchTerm);
      const matchArea = area >= values.minArea && area <= values.maxArea;
      const matchPropertyManager =
        values.propertyManagerTerm === "" || propertyManager.includes(values.propertyManagerTerm);
      return matchRegion && matchArea && matchPropertyManager;
    });
  };

  const reset = (): void => {
    if (elements.regionSearchInput) {
      elements.regionSearchInput.value = "";
    }
    if (elements.minAreaInput) {
      elements.minAreaInput.value = "";
    }
    if (elements.maxAreaInput) {
      elements.maxAreaInput.value = "";
    }
    if (elements.propertyManagerInput) {
      elements.propertyManagerInput.value = "";
    }
  };

  const attachEnter = (onEnter: () => void): void => {
    const attach = (input: HTMLInputElement | null): void => {
      if (!input) {
        return;
      }
      input.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onEnter();
        }
      });
    };

    attach(elements.regionSearchInput);
    attach(elements.minAreaInput);
    attach(elements.maxAreaInput);
    attach(elements.propertyManagerInput);
  };

  return {
    attachEnter,
    filterItems,
    getValues,
    reset
  };
}

export type Filters = ReturnType<typeof createFilters>;
