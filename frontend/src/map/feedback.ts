type FeedbackOptions = {
  mapStatus: HTMLElement | null;
  mapStatusText: HTMLElement | null;
  mapStatusCloseButton: HTMLButtonElement | null;
  uiToast: HTMLElement | null;
};

export function createFeedback(options: FeedbackOptions): {
  setMapStatus: (message: string, color?: string) => void;
  showToast: (message: string) => void;
} {
  let toastTimer: number | null = null;

  const setMapStatus = (message: string, color = "#6b7280"): void => {
    if (!(options.mapStatus instanceof HTMLElement)) {
      return;
    }
    options.mapStatus.classList.remove("is-hidden");
    if (options.mapStatusText instanceof HTMLElement) {
      options.mapStatusText.textContent = message;
      options.mapStatusText.style.color = color;
      return;
    }
    options.mapStatus.textContent = message;
    options.mapStatus.style.color = color;
  };

  if (options.mapStatus instanceof HTMLElement && options.mapStatusCloseButton instanceof HTMLButtonElement) {
    options.mapStatusCloseButton.addEventListener("click", () => {
      options.mapStatus?.classList.add("is-hidden");
    });
  }

  const showToast = (message: string): void => {
    if (!(options.uiToast instanceof HTMLElement)) {
      return;
    }
    if (toastTimer !== null) {
      window.clearTimeout(toastTimer);
    }
    options.uiToast.textContent = message;
    options.uiToast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => {
      options.uiToast?.classList.remove("is-visible");
      toastTimer = null;
    }, 1800);
  };

  return {
    setMapStatus,
    showToast
  };
}
