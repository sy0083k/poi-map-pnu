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

const POOL_SIZE = 30;

export function createListPanel(elements: ListPanelElements) {
  let startY = 0;
  let startHeight = 0;

  let allItems: LandListItem[] = [];
  let onItemClickCb: (index: number) => void = () => {};
  let selectedIndex = -1;
  let measuredItemHeight = 57;
  let poolNodes: HTMLDivElement[] = [];
  let isPoolInitialized = false;
  let resizeObserver: ResizeObserver | null = null;
  let spacer: HTMLDivElement | null = null;
  let scrollListenerAttached = false;

  const measureItemHeight = (): number => {
    if (!elements.listContainer) return 57;
    const probe = document.createElement("div");
    probe.className = "list-item";
    probe.style.visibility = "hidden";
    probe.style.position = "absolute";
    probe.innerHTML = "<strong>측정</strong><br><small>지목 | 100㎡</small>";
    elements.listContainer.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    elements.listContainer.removeChild(probe);
    return h > 0 ? h : 57;
  };

  const paintVisiblePool = (): void => {
    if (!elements.listContainer) return;
    const container = elements.listContainer;
    const scrollTop = container.scrollTop;
    const firstVisible = Math.max(0, Math.floor(scrollTop / measuredItemHeight) - 2);
    for (let poolIdx = 0; poolIdx < POOL_SIZE; poolIdx++) {
      const dataIdx = firstVisible + poolIdx;
      const row = poolNodes[poolIdx];
      if (!row) continue;
      if (dataIdx >= allItems.length) {
        row.style.display = "none";
        continue;
      }
      row.style.display = "";
      row.style.top = `${dataIdx * measuredItemHeight}px`;
      row.dataset.index = String(dataIdx);
      row.classList.toggle("selected", dataIdx === selectedIndex);
      if (row.dataset.renderedIndex !== String(dataIdx)) {
        row.dataset.renderedIndex = String(dataIdx);
        (row.querySelector("strong") as HTMLElement).textContent = allItems[dataIdx].address || "";
        (row.querySelector("small") as HTMLElement).textContent =
          `${allItems[dataIdx].land_type || ""} | ${allItems[dataIdx].area || ""}㎡`;
      }
    }
  };

  const initPool = (): void => {
    if (!elements.listContainer) return;

    spacer = document.createElement("div");
    spacer.style.height = "0";
    spacer.style.pointerEvents = "none";
    elements.listContainer.appendChild(spacer);

    for (let i = 0; i < POOL_SIZE; i++) {
      const row = document.createElement("div");
      row.className = "list-item";
      row.style.position = "absolute";
      row.style.left = "0";
      row.style.right = "0";
      row.style.display = "none";

      const title = document.createElement("strong");
      const br = document.createElement("br");
      const desc = document.createElement("small");
      row.appendChild(title);
      row.appendChild(br);
      row.appendChild(desc);

      row.addEventListener("click", () => {
        const idx = Number(row.dataset.index);
        if (!isNaN(idx)) {
          onItemClickCb(idx);
        }
      });

      elements.listContainer.appendChild(row);
      poolNodes.push(row);
    }

    isPoolInitialized = true;

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        const newHeight = measureItemHeight();
        if (newHeight !== measuredItemHeight) {
          measuredItemHeight = newHeight;
          if (spacer && allItems.length > 0) {
            spacer.style.height = `${allItems.length * measuredItemHeight}px`;
          }
          paintVisiblePool();
        }
      });
      resizeObserver.observe(elements.listContainer);
    }
  };

  const setupVirtualContainer = (): void => {
    if (!elements.listContainer || !spacer) return;
    spacer.style.height = `${allItems.length * measuredItemHeight}px`;
    if (!scrollListenerAttached) {
      elements.listContainer.addEventListener("scroll", paintVisiblePool, { passive: true });
      scrollListenerAttached = true;
    }
  };

  const setStatus = (message: string, color = "#999"): void => {
    if (!elements.listContainer) return;
    let statusEl = elements.listContainer.querySelector<HTMLElement>(".list-status");
    if (!statusEl) {
      statusEl = document.createElement("p");
      statusEl.className = "list-status";
      statusEl.style.padding = "20px";
      elements.listContainer.insertBefore(statusEl, elements.listContainer.firstChild);
    }
    statusEl.style.color = color;
    statusEl.textContent = message;
  };

  const render = (items: LandListItem[], onItemClick: (index: number) => void): void => {
    if (!elements.listContainer) return;

    allItems = items;
    onItemClickCb = onItemClick;
    selectedIndex = -1;

    const statusEl = elements.listContainer.querySelector(".list-status");
    if (statusEl) statusEl.remove();

    if (!items.length) {
      poolNodes.forEach((n) => (n.style.display = "none"));
      if (spacer) spacer.style.height = "0";
      setStatus("결과 없음", "red");
      return;
    }

    measuredItemHeight = measureItemHeight();

    if (!isPoolInitialized) {
      initPool();
    }

    setupVirtualContainer();
    elements.listContainer.scrollTop = 0;
    poolNodes.forEach((node) => { delete node.dataset.renderedIndex; });
    paintVisiblePool();
  };

  const clear = (): void => {
    allItems = [];
    selectedIndex = -1;
    poolNodes.forEach((n) => (n.style.display = "none"));
    if (spacer) spacer.style.height = "0";
    if (elements.listContainer) {
      const statusEl = elements.listContainer.querySelector(".list-status");
      if (statusEl) statusEl.remove();
    }
  };

  const setSelected = (index: number): void => {
    selectedIndex = index;
    paintVisiblePool();
  };

  const updateNavigation = (currentIndex: number, total: number): void => {
    if (elements.navInfo) {
      elements.navInfo.innerText = total > 0 ? `${currentIndex + 1} / ${total}` : "0 / 0";
    }

    if (elements.prevBtn) {
      elements.prevBtn.disabled = currentIndex <= 0;
    }
    if (elements.nextBtn) {
      elements.nextBtn.disabled = currentIndex >= total - 1 || total === 0;
    }

    setSelected(currentIndex);
  };

  const scrollTo = (index: number, options?: { alignToTop?: boolean }): void => {
    if (!elements.listContainer) return;
    const container = elements.listContainer;
    const targetTop = index * measuredItemHeight;
    if (options?.alignToTop) {
      container.scrollTo({ top: targetTop, behavior: "smooth" });
      return;
    }
    const isVisible =
      targetTop >= container.scrollTop &&
      targetTop + measuredItemHeight <= container.scrollTop + container.clientHeight;
    if (!isVisible) {
      container.scrollTo({ top: targetTop, behavior: "smooth" });
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
    updateNavigation
  };
}

export type ListPanel = ReturnType<typeof createListPanel>;
