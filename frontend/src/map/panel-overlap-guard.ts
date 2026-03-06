type PanelOverlapGuardOptions = {
  body: HTMLElement;
  photoPanel: HTMLElement;
  openClassName?: string;
};

const RUNTIME_HEIGHT_VAR = "--photo-panel-runtime-height";
const RUNTIME_BOTTOM_OFFSET_VAR = "--photo-panel-runtime-bottom-offset";

function isPanelVisible(panel: HTMLElement): boolean {
  return !panel.classList.contains("is-hidden");
}

export function createPanelOverlapGuard(options: PanelOverlapGuardOptions) {
  const { body, photoPanel, openClassName = "photo-panel-open" } = options;
  let frameId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const clearRuntimeVars = (): void => {
    body.style.removeProperty(RUNTIME_HEIGHT_VAR);
    body.style.removeProperty(RUNTIME_BOTTOM_OFFSET_VAR);
  };

  const measure = (): void => {
    frameId = null;
    if (!body.classList.contains(openClassName) || !isPanelVisible(photoPanel)) {
      clearRuntimeVars();
      return;
    }
    const rect = photoPanel.getBoundingClientRect();
    const runtimeHeight = Math.max(0, Math.round(rect.height));
    const runtimeBottomOffset = Math.max(0, Math.round(window.innerHeight - rect.bottom));
    body.style.setProperty(RUNTIME_HEIGHT_VAR, `${runtimeHeight}px`);
    body.style.setProperty(RUNTIME_BOTTOM_OFFSET_VAR, `${runtimeBottomOffset}px`);
  };

  const scheduleMeasure = (): void => {
    if (frameId !== null) {
      return;
    }
    frameId = window.requestAnimationFrame(measure);
  };

  const open = (): void => {
    body.classList.add(openClassName);
    scheduleMeasure();
  };

  const close = (): void => {
    body.classList.remove(openClassName);
    clearRuntimeVars();
  };

  const onWindowResize = (): void => {
    scheduleMeasure();
  };

  window.addEventListener("resize", onWindowResize);
  window.addEventListener("orientationchange", onWindowResize);

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      scheduleMeasure();
    });
    resizeObserver.observe(photoPanel);
  }

  return {
    open,
    close,
    refresh: scheduleMeasure,
    destroy: (): void => {
      window.removeEventListener("resize", onWindowResize);
      window.removeEventListener("orientationchange", onWindowResize);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
      resizeObserver?.disconnect();
      resizeObserver = null;
      clearRuntimeVars();
    }
  };
}
