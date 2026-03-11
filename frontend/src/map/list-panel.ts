import type { LandListItem } from "./types";

type ListPanelElements = {
  listContainer: HTMLElement | null;
  navInfo: HTMLElement | null;
  prevBtn: HTMLButtonElement | null;
  nextBtn: HTMLButtonElement | null;
  sidebar: HTMLElement | null;
  handle: Element | null;
};

const snapHeights = {
  collapsed: 0.15,
  mid: 0.4,
  expanded: 0.85
};

export function createListPanel(elements: ListPanelElements) {
  let startY = 0;
  let startHeight = 0;
  let loadMoreButton: HTMLButtonElement | null = null;

  const setStatus = (message: string, color = "#999"): void => {
    if (!elements.listContainer) {
      return;
    }

    const status = document.createElement("p");
    status.style.padding = "20px";
    status.style.color = color;
    status.textContent = message;
    elements.listContainer.replaceChildren(status);
  };

  const render = (items: LandListItem[], onItemClick: (index: number) => void): void => {
    if (!elements.listContainer) {
      return;
    }

    elements.listContainer.replaceChildren();

    if (!items.length) {
      setStatus("결과 없음", "red");
      return;
    }

    items.forEach((land, idx) => {
      const row = document.createElement("div");
      row.className = "list-item";
      row.id = `item-${idx}`;

      const title = document.createElement("strong");
      title.textContent = land.address || "";

      const lineBreak = document.createElement("br");

      const desc = document.createElement("small");
      desc.textContent = `${land.land_type || ""} | ${land.area || ""}㎡`;

      row.appendChild(title);
      row.appendChild(lineBreak);
      row.appendChild(desc);
      row.addEventListener("click", () => onItemClick(idx));
      elements.listContainer?.appendChild(row);
    });
  };

  const setLoadMore = (params: {
    visible: boolean;
    disabled?: boolean;
    label?: string;
    onClick?: () => void;
  }): void => {
    if (!elements.listContainer) {
      return;
    }
    if (!params.visible) {
      loadMoreButton?.remove();
      loadMoreButton = null;
      return;
    }
    if (!(loadMoreButton instanceof HTMLButtonElement)) {
      loadMoreButton = document.createElement("button");
      loadMoreButton.type = "button";
      loadMoreButton.className = "btn-secondary list-load-more";
    }
    loadMoreButton.textContent = params.label ?? "더 불러오기";
    loadMoreButton.disabled = Boolean(params.disabled);
    loadMoreButton.onclick = () => params.onClick?.();
    elements.listContainer.appendChild(loadMoreButton);
  };

  const clear = (): void => {
    if (!elements.listContainer) {
      return;
    }
    elements.listContainer.replaceChildren();
    loadMoreButton = null;
  };

  const setSelected = (index: number): void => {
    document.querySelectorAll(".list-item").forEach((item, idx) => {
      item.classList.toggle("selected", idx === index);
    });
  };

  const updateNavigation = (currentIndex: number, totalCount: number, loadedCount: number): void => {
    if (elements.navInfo) {
      elements.navInfo.innerText = totalCount > 0 && currentIndex >= 0 ? `${currentIndex + 1} / ${totalCount}` : `0 / ${totalCount}`;
    }

    if (elements.prevBtn) {
      elements.prevBtn.disabled = currentIndex <= 0;
    }
    if (elements.nextBtn) {
      elements.nextBtn.disabled = currentIndex >= loadedCount - 1 || loadedCount === 0;
    }

    setSelected(currentIndex);
  };

  const scrollTo = (index: number, options?: { alignToTop?: boolean }): void => {
    const selectedEl = document.getElementById(`item-${index}`);
    if (selectedEl) {
      selectedEl.scrollIntoView({
        behavior: "smooth",
        block: options?.alignToTop ? "start" : "nearest"
      });
    }
  };

  const bindNavigation = (onPrev: () => void, onNext: () => void): void => {
    elements.prevBtn?.addEventListener("click", onPrev);
    elements.nextBtn?.addEventListener("click", onNext);
  };

  const initBottomSheet = (): void => {
    if (!elements.handle || !elements.sidebar) {
      return;
    }

    const sidebarEl = elements.sidebar;

    elements.handle.addEventListener("touchstart", (event: Event) => {
      const touchEvent = event as TouchEvent;
      startY = touchEvent.touches[0].clientY;
      startHeight = sidebarEl.offsetHeight;
      sidebarEl.style.transition = "none";
    });

    elements.handle?.addEventListener("touchmove", (event: Event) => {
      const touchEvent = event as TouchEvent;
      const touchY = touchEvent.touches[0].clientY;
      const deltaY = startY - touchY;
      const newHeight = startHeight + deltaY;

      if (newHeight > window.innerHeight * 0.12 && newHeight < window.innerHeight * 0.9) {
        sidebarEl.style.height = `${newHeight}px`;
      }
    });

    elements.handle.addEventListener("touchend", () => {
      sidebarEl.style.transition = "height 0.3s ease-out";
      const currentRatio = sidebarEl.clientHeight / window.innerHeight;
      if (currentRatio >= 0.6) {
        sidebarEl.style.height = `${snapHeights.expanded * 100}vh`;
      } else if (currentRatio <= 0.25) {
        sidebarEl.style.height = `${snapHeights.collapsed * 100}vh`;
      } else {
        sidebarEl.style.height = `${snapHeights.mid * 100}vh`;
      }
    });
  };

  return {
    bindNavigation,
    clear,
    initBottomSheet,
    render,
    scrollTo,
    setStatus,
    setLoadMore,
    updateNavigation
  };
}

export type ListPanel = ReturnType<typeof createListPanel>;
