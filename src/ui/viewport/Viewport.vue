<script setup lang="ts">
// Viewport — переиспользуемое canvas-поле платформы: камера-окно, панорама, зум,
// dpr, отсечение видимых клеток и отладочный HUD. Рисование фигур делегируется
// игре колбэком `render`; сам Viewport знает только про фон и сетку.
//
// Математика камеры — чистая, в `@/core/viewport`; здесь только DOM, события и
// перерисовка. Перерисовка батчится в requestAnimationFrame.
import { onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import {
  DEFAULT_CAMERA,
  PICK_THRESHOLD,
  WHEEL_STEP,
  ZOOM_STEP,
  panByPixels,
  screenToWorld,
  visibleBounds,
  worldToScreen,
  zoomBy,
  type Camera,
  type CellBounds,
  type Point,
  type Size,
} from "@/core/viewport";
import { iconFor } from "@/ui/icons";
import type { ViewportFrame, ViewportRenderer } from "./types";

const props = withDefaults(
  defineProps<{
    render?: ViewportRenderer;
    showGrid?: boolean;
    blocked?: boolean;
    initialCamera?: Camera;
    /** Показывать служебные элементы (зум, HUD). В демо их нет. */
    controls?: boolean;
    /** Стиль курсора поля; игра может переопределить. */
    cursor?: string;
  }>(),
  { showGrid: true, blocked: false, controls: true, cursor: "default" },
);

const emit = defineEmits<{ pick: [point: Point] }>();

const root = useTemplateRef<HTMLDivElement>("root");
const canvas = useTemplateRef<HTMLCanvasElement>("canvas");

const camera = ref<Camera>({ ...(props.initialCamera ?? DEFAULT_CAMERA) });
const size = ref<Size>({ width: 0, height: 0 });
const dpr = ref(1);
const hudVisible = ref(false);
const dragging = ref(false);

// Цвета читаются из токенов при монтировании и на смену темы, а не каждый кадр:
// getComputedStyle в цикле кадра — принудительный reflow (см. бэклог).
const colors = ref({ bg: "#fff", grid: "#9aa0ab", x: "#16181d", o: "#3da96a" });

let frameId: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let themeObserver: MutationObserver | null = null;
let dprMedia: MediaQueryList | null = null;

let drag: { sx: number; sy: number; camera: Camera; moved: number } | null = null;

function scheduleDraw(): void {
  if (frameId !== null) return;
  frameId = requestAnimationFrame(() => {
    frameId = null;
    draw();
  });
}

function readColors(): void {
  const styles = getComputedStyle(document.documentElement);
  const value = (name: string, fallback: string): string =>
    styles.getPropertyValue(name).trim() || fallback;
  colors.value = {
    bg: value("--board-bg", "#fff"),
    grid: value("--board-grid", "#9aa0ab"),
    x: value("--board-x", "#16181d"),
    o: value("--board-o", "#3da96a"),
  };
}

function drawGrid(ctx: CanvasRenderingContext2D, bounds: CellBounds): void {
  ctx.strokeStyle = colors.value.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const top = worldToScreen(camera.value, { x: 0, y: bounds.y0 }, size.value).y;
  const bottom = worldToScreen(camera.value, { x: 0, y: bounds.y1 }, size.value).y;
  const left = worldToScreen(camera.value, { x: bounds.x0, y: 0 }, size.value).x;
  const right = worldToScreen(camera.value, { x: bounds.x1, y: 0 }, size.value).x;
  for (let x = bounds.x0; x <= bounds.x1; x += 1) {
    const px = worldToScreen(camera.value, { x, y: 0 }, size.value).x;
    ctx.moveTo(px, top);
    ctx.lineTo(px, bottom);
  }
  for (let y = bounds.y0; y <= bounds.y1; y += 1) {
    const py = worldToScreen(camera.value, { x: 0, y }, size.value).y;
    ctx.moveTo(left, py);
    ctx.lineTo(right, py);
  }
  ctx.stroke();
}

function draw(): void {
  const cv = canvas.value;
  const host = root.value;
  if (!cv || !host) return;

  const width = host.clientWidth || 1;
  const height = host.clientHeight || 1;
  size.value = { width, height };
  const ratio = window.devicePixelRatio || 1;
  dpr.value = ratio;

  cv.width = Math.round(width * ratio);
  cv.height = Math.round(height * ratio);
  const ctx = cv.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = colors.value.bg;
  ctx.fillRect(0, 0, width, height);

  const bounds = visibleBounds(camera.value, size.value, 1);
  if (props.showGrid) drawGrid(ctx, bounds);

  if (props.render) {
    const frame: ViewportFrame = {
      ctx,
      camera: camera.value,
      bounds,
      size: size.value,
      dpr: ratio,
      colors: colors.value,
      toScreen: (point) => worldToScreen(camera.value, point, size.value),
      toWorld: (point) => screenToWorld(camera.value, point, size.value),
    };
    props.render(frame);
  }
}

function toCanvasPoint(event: PointerEvent | WheelEvent): Point {
  const rect = canvas.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0 || !canvas.value) return;
  canvas.value.setPointerCapture(event.pointerId);
  dragging.value = true;
  drag = { sx: event.clientX, sy: event.clientY, camera: camera.value, moved: 0 };
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;
  const dx = event.clientX - drag.sx;
  const dy = event.clientY - drag.sy;
  drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
  camera.value = panByPixels(drag.camera, dx, dy);
  scheduleDraw();
}

function onPointerUp(event: PointerEvent): void {
  if (event.button !== 0) return;
  const wasDrag = drag !== null && drag.moved > PICK_THRESHOLD;
  drag = null;
  dragging.value = false;
  canvas.value?.releasePointerCapture(event.pointerId);
  if (wasDrag || props.blocked) return;

  const world = screenToWorld(camera.value, toCanvasPoint(event), size.value);
  emit("pick", { x: Math.floor(world.x), y: Math.floor(world.y) });
}

function onPointerCancel(): void {
  drag = null;
  dragging.value = false;
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  const factor = event.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
  camera.value = zoomBy(camera.value, toCanvasPoint(event), size.value, factor);
  scheduleDraw();
}

function zoomAtCenter(factor: number): void {
  const anchor: Point = { x: size.value.width / 2, y: size.value.height / 2 };
  camera.value = zoomBy(camera.value, anchor, size.value, factor);
  scheduleDraw();
}

function resetCamera(): void {
  camera.value = { ...(props.initialCamera ?? DEFAULT_CAMERA) };
  scheduleDraw();
}

function toggleHud(): void {
  hudVisible.value = !hudVisible.value;
}

function onDprChange(): void {
  watchDpr();
  scheduleDraw();
}

function watchDpr(): void {
  dprMedia?.removeEventListener("change", onDprChange);
  dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
  dprMedia.addEventListener("change", onDprChange);
}

onMounted(() => {
  readColors();
  watchDpr();
  if (root.value) {
    resizeObserver = new ResizeObserver(scheduleDraw);
    resizeObserver.observe(root.value);
  }
  // Палитра только ставит data-theme; своего события «тема сменилась» нет.
  themeObserver = new MutationObserver(() => {
    readColors();
    scheduleDraw();
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  canvas.value?.addEventListener("wheel", onWheel, { passive: false });
  scheduleDraw();
});

onBeforeUnmount(() => {
  if (frameId !== null) cancelAnimationFrame(frameId);
  resizeObserver?.disconnect();
  themeObserver?.disconnect();
  dprMedia?.removeEventListener("change", onDprChange);
  canvas.value?.removeEventListener("wheel", onWheel);
});

defineExpose({
  camera,
  size,
  resetCamera,
  zoomIn: () => zoomAtCenter(ZOOM_STEP),
  zoomOut: () => zoomAtCenter(1 / ZOOM_STEP),
  toggleHud,
  draw,
});
</script>

<template>
  <div ref="root" class="viewport">
    <canvas
      ref="canvas"
      class="viewport__canvas"
      :style="{ cursor: dragging ? 'grabbing' : props.cursor }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
    />

    <template v-if="controls">
      <div class="viewport__zoom">
        <button
          class="viewport__button btn btn--icon btn--ghost"
          type="button"
          aria-label="Отдалить"
          title="Отдалить"
          @click="zoomAtCenter(1 / ZOOM_STEP)"
        >
          <component :is="iconFor('zoom-out')" class="icon" aria-hidden="true" />
        </button>
        <button
          class="viewport__button btn btn--icon btn--ghost"
          type="button"
          aria-label="Приблизить"
          title="Приблизить"
          @click="zoomAtCenter(ZOOM_STEP)"
        >
          <component :is="iconFor('zoom-in')" class="icon" aria-hidden="true" />
        </button>
      </div>

      <div v-if="hudVisible" class="viewport__hud" aria-hidden="true">
        <span>x {{ camera.x.toFixed(1) }} · y {{ camera.y.toFixed(1) }}</span>
        <span>scale {{ camera.scale.toFixed(1) }} · dpr {{ dpr }}</span>
        <span>{{ size.width }}×{{ size.height }}</span>
      </div>

      <button
        class="viewport__hud-toggle btn btn--icon btn--ghost"
        type="button"
        :aria-pressed="hudVisible"
        aria-label="Отладочный оверлей"
        title="Отладочный оверлей"
        @click="toggleHud"
      >
        <component :is="iconFor('hud')" class="icon" aria-hidden="true" />
      </button>
    </template>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.viewport__canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}

.viewport__zoom {
  position: absolute;
  right: var(--space-3);
  bottom: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.viewport__button {
  background: var(--surface-2);
  border: 1px solid var(--border);
  box-shadow: var(--elev-2);
}

.viewport__hud {
  position: absolute;
  left: var(--space-3);
  top: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: color-mix(in oklch, var(--surface-2) 80%, transparent);
  color: var(--on-surface-variant);
  font-size: var(--fs-xs);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.viewport__hud-toggle {
  position: absolute;
  left: var(--space-3);
  bottom: var(--space-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  box-shadow: var(--elev-2);
}
</style>
