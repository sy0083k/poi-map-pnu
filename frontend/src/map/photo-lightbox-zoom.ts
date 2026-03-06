type PhotoLightboxZoomControllerOptions = {
  viewport: HTMLElement;
  image: HTMLImageElement;
};

const SCALE_MIN = 1;
const SCALE_MAX = 6;
const SCALE_STEP = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createPhotoLightboxZoomController(options: PhotoLightboxZoomControllerOptions) {
  const { viewport, image } = options;
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let dragging = false;
  let lastPointerX = 0;
  let lastPointerY = 0;
  let enabled = true;

  const getBaseImageSize = (): { width: number; height: number } => {
    const rect = image.getBoundingClientRect();
    const currentScale = scale <= 0 ? 1 : scale;
    return {
      width: rect.width / currentScale,
      height: rect.height / currentScale
    };
  };

  const clampTranslation = (): void => {
    const viewportRect = viewport.getBoundingClientRect();
    const baseSize = getBaseImageSize();
    const scaledWidth = baseSize.width * scale;
    const scaledHeight = baseSize.height * scale;
    const maxX = Math.max(0, (scaledWidth - viewportRect.width) / 2);
    const maxY = Math.max(0, (scaledHeight - viewportRect.height) / 2);
    translateX = clamp(translateX, -maxX, maxX);
    translateY = clamp(translateY, -maxY, maxY);
  };

  const render = (): void => {
    clampTranslation();
    image.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
    image.classList.toggle("is-zoomable", scale > SCALE_MIN);
    image.classList.toggle("is-dragging", dragging);
  };

  const reset = (): void => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    dragging = false;
    render();
  };

  const setEnabled = (nextEnabled: boolean): void => {
    enabled = nextEnabled;
    if (!enabled) {
      reset();
    }
  };

  const onWheel = (event: WheelEvent): void => {
    if (!enabled) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    const nextScale = clamp(scale + delta, SCALE_MIN, SCALE_MAX);
    if (nextScale === scale) {
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const localX = event.clientX - viewportRect.left;
    const localY = event.clientY - viewportRect.top;
    const centerX = viewportRect.width / 2;
    const centerY = viewportRect.height / 2;
    const imageX = (localX - centerX - translateX) / scale;
    const imageY = (localY - centerY - translateY) / scale;

    scale = nextScale;
    translateX = localX - centerX - imageX * scale;
    translateY = localY - centerY - imageY * scale;
    render();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!enabled || scale <= SCALE_MIN || event.button !== 0) {
      return;
    }
    dragging = true;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    image.setPointerCapture(event.pointerId);
    render();
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!enabled || !dragging) {
      return;
    }
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    translateX += dx;
    translateY += dy;
    render();
  };

  const onPointerUpOrCancel = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    if (image.hasPointerCapture(event.pointerId)) {
      image.releasePointerCapture(event.pointerId);
    }
    render();
  };

  const onImageLoad = (): void => {
    reset();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!enabled) {
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      scale = clamp(scale + SCALE_STEP, SCALE_MIN, SCALE_MAX);
      render();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      scale = clamp(scale - SCALE_STEP, SCALE_MIN, SCALE_MAX);
      render();
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      reset();
    }
  };

  viewport.addEventListener("wheel", onWheel, { passive: false });
  image.addEventListener("pointerdown", onPointerDown);
  image.addEventListener("pointermove", onPointerMove);
  image.addEventListener("pointerup", onPointerUpOrCancel);
  image.addEventListener("pointercancel", onPointerUpOrCancel);
  image.addEventListener("load", onImageLoad);
  document.addEventListener("keydown", onKeyDown);
  render();

  return {
    reset,
    setEnabled,
    destroy: (): void => {
      viewport.removeEventListener("wheel", onWheel);
      image.removeEventListener("pointerdown", onPointerDown);
      image.removeEventListener("pointermove", onPointerMove);
      image.removeEventListener("pointerup", onPointerUpOrCancel);
      image.removeEventListener("pointercancel", onPointerUpOrCancel);
      image.removeEventListener("load", onImageLoad);
      document.removeEventListener("keydown", onKeyDown);
      reset();
    }
  };
}
