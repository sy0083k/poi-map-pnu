type PhotoLightboxZoomControllerOptions = {
  viewport: HTMLElement;
  image: HTMLImageElement;
};

const SCALE_MIN = 1;
const SCALE_MAX = 6;
const SCALE_STEP = 0.2;
const PAN_FACTOR = 2.4;
const PAN_CLAMP_OVERSCROLL_PX = 96;
const PAN_SCALE_GAIN = 0.4;
const PAN_SHIFT_MULTIPLIER = 1.8;
const CLAMP_EASE_MS = 120;
const AUTO_PAN_EDGE_PX = 48;
const AUTO_PAN_MAX_PX_PER_FRAME = 22;
const SCALE_EPSILON = 0.001;

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
  let clampEasing = false;
  let shiftPressed = false;
  let lastPointerClientX = 0;
  let lastPointerClientY = 0;
  let autoPanFrameId: number | null = null;
  let resizeObserver: ResizeObserver | null = null;

  const getBaseImageSize = (): { width: number; height: number } => {
    const viewportRect = viewport.getBoundingClientRect();
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    if (naturalWidth > 0 && naturalHeight > 0 && viewportRect.width > 0 && viewportRect.height > 0) {
      const fitScale = Math.min(viewportRect.width / naturalWidth, viewportRect.height / naturalHeight);
      return {
        width: naturalWidth * fitScale,
        height: naturalHeight * fitScale
      };
    }
    const rect = image.getBoundingClientRect();
    const currentScale = scale <= 0 ? 1 : scale;
    return {
      width: rect.width / currentScale,
      height: rect.height / currentScale
    };
  };

  const normalizeIfScaleIsDefault = (): void => {
    if (scale > SCALE_MIN + SCALE_EPSILON) {
      return;
    }
    scale = SCALE_MIN;
    translateX = 0;
    translateY = 0;
  };

  const clampTranslation = (mode: "soft" | "hard"): void => {
    normalizeIfScaleIsDefault();
    if (scale <= SCALE_MIN + SCALE_EPSILON) {
      return;
    }
    const viewportRect = viewport.getBoundingClientRect();
    const baseSize = getBaseImageSize();
    const scaledWidth = baseSize.width * scale;
    const scaledHeight = baseSize.height * scale;
    const overscroll = mode === "soft" ? PAN_CLAMP_OVERSCROLL_PX : 0;
    const maxX = Math.max(0, (scaledWidth - viewportRect.width) / 2) + overscroll;
    const maxY = Math.max(0, (scaledHeight - viewportRect.height) / 2) + overscroll;
    translateX = clamp(translateX, -maxX, maxX);
    translateY = clamp(translateY, -maxY, maxY);
  };

  const render = (mode: "soft" | "hard" = "hard"): void => {
    clampTranslation(mode);
    image.style.transform = `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`;
    image.classList.toggle("is-zoomable", scale > SCALE_MIN + SCALE_EPSILON);
    image.classList.toggle("is-dragging", dragging);
    viewport.classList.toggle("is-zoomable", scale > SCALE_MIN + SCALE_EPSILON);
    viewport.classList.toggle("is-dragging", dragging);
    viewport.classList.toggle("is-clamp-easing", clampEasing);
  };

  const reset = (): void => {
    scale = 1;
    translateX = 0;
    translateY = 0;
    dragging = false;
    clampEasing = false;
    shiftPressed = false;
    if (autoPanFrameId !== null) {
      window.cancelAnimationFrame(autoPanFrameId);
      autoPanFrameId = null;
    }
    render("hard");
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
    if (scale <= SCALE_MIN + SCALE_EPSILON) {
      normalizeIfScaleIsDefault();
      render("hard");
      return;
    }
    render(dragging ? "soft" : "hard");
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!enabled || scale <= SCALE_MIN + SCALE_EPSILON || event.button !== 0) {
      return;
    }
    dragging = true;
    clampEasing = false;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;
    viewport.setPointerCapture(event.pointerId);
    if (autoPanFrameId === null) {
      autoPanFrameId = window.requestAnimationFrame(stepAutoPan);
    }
    render("soft");
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!enabled || !dragging) {
      return;
    }
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;
    const dx = event.clientX - lastPointerX;
    const dy = event.clientY - lastPointerY;
    lastPointerX = event.clientX;
    lastPointerY = event.clientY;
    if (scale <= SCALE_MIN + SCALE_EPSILON) {
      normalizeIfScaleIsDefault();
      render("hard");
      return;
    }
    const scaleFactor = 1 + (scale - 1) * PAN_SCALE_GAIN;
    const shiftFactor = shiftPressed ? PAN_SHIFT_MULTIPLIER : 1;
    translateX += dx * PAN_FACTOR * scaleFactor * shiftFactor;
    translateY += dy * PAN_FACTOR * scaleFactor * shiftFactor;
    render("soft");
  };

  const computeEdgeVelocity = (position: number, min: number, max: number): number => {
    if (position < min + AUTO_PAN_EDGE_PX) {
      const ratio = (min + AUTO_PAN_EDGE_PX - position) / AUTO_PAN_EDGE_PX;
      return -AUTO_PAN_MAX_PX_PER_FRAME * clamp(ratio, 0, 1);
    }
    if (position > max - AUTO_PAN_EDGE_PX) {
      const ratio = (position - (max - AUTO_PAN_EDGE_PX)) / AUTO_PAN_EDGE_PX;
      return AUTO_PAN_MAX_PX_PER_FRAME * clamp(ratio, 0, 1);
    }
    return 0;
  };

  const stepAutoPan = (): void => {
    autoPanFrameId = null;
    if (!enabled || !dragging || scale <= SCALE_MIN + SCALE_EPSILON) {
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const speedFactor = shiftPressed ? PAN_SHIFT_MULTIPLIER : 1;
    const vx = computeEdgeVelocity(lastPointerClientX, rect.left, rect.right) * speedFactor;
    const vy = computeEdgeVelocity(lastPointerClientY, rect.top, rect.bottom) * speedFactor;
    if (vx !== 0 || vy !== 0) {
      translateX += vx;
      translateY += vy;
      render("soft");
    }
    autoPanFrameId = window.requestAnimationFrame(stepAutoPan);
  };

  const onPointerUpOrCancel = (event: PointerEvent): void => {
    if (!dragging) {
      return;
    }
    dragging = false;
    if (viewport.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    if (autoPanFrameId !== null) {
      window.cancelAnimationFrame(autoPanFrameId);
      autoPanFrameId = null;
    }
    clampEasing = true;
    render("hard");
    window.setTimeout(() => {
      clampEasing = false;
      render("hard");
    }, CLAMP_EASE_MS);
  };

  const onImageLoad = (): void => {
    reset();
  };

  const onViewportResize = (): void => {
    if (!enabled) {
      return;
    }
    if (dragging) {
      return;
    }
    render("hard");
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!enabled) {
      return;
    }
    if (event.key === "Shift") {
      shiftPressed = true;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      scale = clamp(scale + SCALE_STEP, SCALE_MIN, SCALE_MAX);
      render("hard");
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      scale = clamp(scale - SCALE_STEP, SCALE_MIN, SCALE_MAX);
      if (scale <= SCALE_MIN + SCALE_EPSILON) {
        normalizeIfScaleIsDefault();
      }
      render("hard");
      return;
    }
    if (event.key === "0") {
      event.preventDefault();
      reset();
    }
  };

  const onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === "Shift") {
      shiftPressed = false;
    }
  };

  viewport.addEventListener("wheel", onWheel, { passive: false });
  viewport.addEventListener("pointerdown", onPointerDown);
  viewport.addEventListener("pointermove", onPointerMove);
  viewport.addEventListener("pointerup", onPointerUpOrCancel);
  viewport.addEventListener("pointercancel", onPointerUpOrCancel);
  image.addEventListener("load", onImageLoad);
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("keyup", onKeyUp);
  window.addEventListener("resize", onViewportResize);
  if (typeof ResizeObserver !== "undefined") {
    resizeObserver = new ResizeObserver(() => {
      onViewportResize();
    });
    resizeObserver.observe(viewport);
  }
  render();

  return {
    reset,
    setEnabled,
    destroy: (): void => {
      if (autoPanFrameId !== null) {
        window.cancelAnimationFrame(autoPanFrameId);
        autoPanFrameId = null;
      }
      viewport.removeEventListener("wheel", onWheel);
      viewport.removeEventListener("pointerdown", onPointerDown);
      viewport.removeEventListener("pointermove", onPointerMove);
      viewport.removeEventListener("pointerup", onPointerUpOrCancel);
      viewport.removeEventListener("pointercancel", onPointerUpOrCancel);
      image.removeEventListener("load", onImageLoad);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("resize", onViewportResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      reset();
    }
  };
}
