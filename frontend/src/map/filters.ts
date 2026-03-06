import type { LandListItem } from "./types";

type FilterElements = {
  regionSearchInput: HTMLInputElement | null;
  minAreaInput: HTMLInputElement | null;
  maxAreaInput: HTMLInputElement | null;
  propertyManagerInput: HTMLInputElement | null;
  propertyUsageInput: HTMLSelectElement | null;
  landTypeInput: HTMLInputElement | null;
};

export type FilterValues = {
  rawSearchTerm: string;
  searchTerm: string;
  rawMinAreaInput: string;
  rawMaxAreaInput: string;
  rawPropertyManagerInput: string;
  rawPropertyUsageInput: string;
  rawLandTypeInput: string;
  minArea: number;
  maxArea: number;
  propertyManagerTerm: string;
  propertyUsageTerm: string;
  landTypeTerm: string;
};

function sourceFieldValueByLabel(item: LandListItem, label: string): string {
  const match = item.sourceFields.find((field) => field.label.trim() === label);
  return (match?.value || "").trim();
}

export function createFilters(elements: FilterElements) {
  const getValues = (): FilterValues => {
    const rawSearchTerm = elements.regionSearchInput?.value ?? "";
    const searchTerm = rawSearchTerm.trim();
    const rawMinAreaInput = elements.minAreaInput?.value ?? "";
    const rawMaxAreaInput = elements.maxAreaInput?.value ?? "";
    const rawPropertyManagerInput = elements.propertyManagerInput?.value ?? "";
    const rawPropertyUsageInput = elements.propertyUsageInput?.value ?? "";
    const rawLandTypeInput = elements.landTypeInput?.value ?? "";
    const propertyManagerTerm = rawPropertyManagerInput.trim();
    const propertyUsageTerm = rawPropertyUsageInput.trim();
    const landTypeTerm = rawLandTypeInput.trim();

    return {
      rawSearchTerm,
      searchTerm,
      rawMinAreaInput,
      rawMaxAreaInput,
      rawPropertyManagerInput,
      rawPropertyUsageInput,
      rawLandTypeInput,
      minArea: Number.parseFloat(rawMinAreaInput || "") || 0,
      maxArea: Number.parseFloat(rawMaxAreaInput || "") || Number.POSITIVE_INFINITY,
      propertyManagerTerm,
      propertyUsageTerm,
      landTypeTerm
    };
  };

  const filterItems = (items: LandListItem[], values: FilterValues): LandListItem[] => {
    return items.filter((item) => {
      const address = item.address || "";
      const area = item.area || 0;
      const propertyManager = item.property_manager || "";
      const propertyUsage = sourceFieldValueByLabel(item, "재산용도");
      const landType = item.land_type || "";

      const matchRegion = values.searchTerm === "" || address.includes(values.searchTerm);
      const matchArea = area >= values.minArea && area <= values.maxArea;
      const matchPropertyManager =
        values.propertyManagerTerm === "" || propertyManager.includes(values.propertyManagerTerm);
      const matchPropertyUsage = values.propertyUsageTerm === "" || propertyUsage === values.propertyUsageTerm;
      const matchLandType = values.landTypeTerm === "" || landType.includes(values.landTypeTerm);
      return matchRegion && matchArea && matchPropertyManager && matchPropertyUsage && matchLandType;
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
    if (elements.propertyUsageInput) {
      elements.propertyUsageInput.value = "";
    }
    if (elements.landTypeInput) {
      elements.landTypeInput.value = "";
    }
  };

  const attachEnter = (onEnter: () => void): void => {
    const attach = (input: HTMLInputElement | HTMLSelectElement | null): void => {
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
    attach(elements.propertyUsageInput);
    attach(elements.landTypeInput);
  };

  return {
    attachEnter,
    filterItems,
    getValues,
    reset
  };
}

export type Filters = ReturnType<typeof createFilters>;
