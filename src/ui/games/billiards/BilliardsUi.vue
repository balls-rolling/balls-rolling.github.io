<script setup lang="ts">
// UI партии бильярда: подписка на канвас (прицел), сила (слайдер/колесо), кнопка
// удара, панель игроков и инфо-бар хода. Сила и удар — только контроллы UI, канвас
// сам не стреляет (R4). Конец удара для UI — конец реплея (Q7).
import { inject, onMounted, onScopeDispose, ref, watch } from "vue";
import type { BilliardsGame } from "@/games/billiards/game";
import { BALL_RADIUS } from "@/games/billiards/constants";
import { keyPower, powerFromY, wheelPower } from "@/games/billiards/power";
import { ANGLE_SCALE_PX_PER_DEG, angleAfterScaleDrag, wrap360 } from "@/games/billiards/aim";
import { boardInputKey } from "@/ui/board-input";
import { sessionHostKey } from "@/ui/session-host";

const injectedBoard = inject(boardInputKey);
if (!injectedBoard) throw new Error("Ввод поля не предоставлен");
const board = injectedBoard;
const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const host = injectedHost;

const powerPercent = ref(50);
/** Вертикальная полоса поля (из инсетов игры): рейки растягиваются в неё. */
const band = ref({ top: 0, bottom: 0 });
/** Показывать числовое значение силы рядом с метром. Здесь скрыто. */
const SHOW_POWER_VALUE = false;
const animating = ref(false);
const rootEl = ref<HTMLElement | null>(null);
const leftRail = ref<HTMLElement | null>(null);
const rightRail = ref<HTMLElement | null>(null);
const angleDisplay = ref(0);

let detach: (() => void) | null = null;
let unsubscribe: (() => void) | null = null;
let rafId: number | null = null;
let lastTime = 0;
let dragging = false;
let grabbing = false;
let grabOffset = { x: 0, y: 0 };
let blinkId: number | null = null;
let hoverCue = false;
let scaleDragging = false;
let scaleLastY = 0;
let panelObserver: ResizeObserver | null = null;

function game(): BilliardsGame | null {
  const instance = host.game.value as unknown as BilliardsGame | null;
  // Структурная проверка, а не instanceof: после HMR модуль может раздвоиться,
  // и instanceof даёт ложный минус — тогда UI теряет игру.
  if (
    instance &&
    typeof instance.startShot === "function" &&
    typeof instance.advance === "function" &&
    typeof instance.setAim === "function" &&
    typeof instance.getCuePosition === "function"
  ) {
    return instance;
  }
  return null;
}

function angleFromEvent(event: PointerEvent): number | null {
  const canvas = board.canvas.value;
  const instance = game();
  if (!canvas || !instance) return null;
  const cue = instance.getCuePosition();
  if (!cue) return null;
  const rect = canvas.getBoundingClientRect();
  const fit = instance.getFit({ width: rect.width, height: rect.height });
  const cueX = fit.offsetX + cue.x * fit.scale;
  const cueY = fit.offsetY + cue.y * fit.scale;
  return Math.atan2(event.clientY - rect.top - cueY, event.clientX - rect.left - cueX);
}

function tick(now: number): void {
  rafId = null;
  const instance = game();
  if (!instance || !instance.isAnimating()) {
    animating.value = false;
    return;
  }
  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  lastTime = now;
  const still = instance.advance(dt);
  animating.value = still;
  board.requestDraw.value?.();
  if (still) rafId = requestAnimationFrame(tick);
}

function ensureLoop(): void {
  const instance = game();
  if (!instance || !instance.isAnimating() || rafId !== null) return;
  animating.value = true;
  lastTime = 0;
  rafId = requestAnimationFrame(tick);
}

function worldFromEvent(event: PointerEvent): { x: number; y: number } | null {
  const canvas = board.canvas.value;
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const instance = game();
  if (!instance) return null;
  const fit = instance.getFit({ width: rect.width, height: rect.height });
  return {
    x: (event.clientX - rect.left - fit.offsetX) / fit.scale,
    y: (event.clientY - rect.top - fit.offsetY) / fit.scale,
  };
}

/** Текущий угол прицела в градусах [0,360). */
function syncAngle(): void {
  const instance = game();
  const rad = instance?.getAim() ?? instance?.defaultAim() ?? 0;
  angleDisplay.value = wrap360((rad * 180) / Math.PI);
}

function onScaleDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  scaleDragging = true;
  scaleLastY = event.clientY;
  try {
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  } catch {
    /* синтетический указатель без активного пойнтера — тянем без захвата */
  }
}

function onScaleMove(event: PointerEvent): void {
  if (!scaleDragging) return;
  const instance = game();
  if (!instance || instance.isAnimating()) return;
  const dy = event.clientY - scaleLastY;
  scaleLastY = event.clientY;
  const current = instance.getAim() ?? instance.defaultAim() ?? 0;
  // Тянем ленту вниз: смещение в пикселях → поворот на долю градуса.
  instance.setAim(angleAfterScaleDrag(current, dy));
  syncAngle();
  board.requestDraw.value?.();
}

function onScaleUp(event: PointerEvent): void {
  if (!scaleDragging) return;
  scaleDragging = false;
  try {
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
  } catch {
    /* уже отпущен */
  }
}

/** Запас по бокам под вертикальные панели игры: берём расстояние от края
 *  кадра до внутренней кромки рейки (рейка стоит с отступом от края). */
function measurePanel(): void {
  const instance = game();
  const canvasRect = board.canvas.value?.getBoundingClientRect();
  if (!instance || !canvasRect) return;
  const leftRect = leftRail.value?.getBoundingClientRect();
  const rightRect = rightRail.value?.getBoundingClientRect();
  instance.setPanelInsets({
    left: leftRect ? Math.max(0, Math.round(leftRect.right - canvasRect.left)) : 0,
    right: rightRect ? Math.max(0, Math.round(canvasRect.right - rightRect.left)) : 0,
  });
  const insets = instance.getInsets();
  band.value = { top: insets.top, bottom: insets.bottom };
  board.requestDraw.value?.();
}

function placeCueAt(event: PointerEvent): void {
  const instance = game();
  if (!instance || instance.isAnimating()) return;
  const world = worldFromEvent(event);
  if (!world) return;
  instance.setCuePlacement(world.x + grabOffset.x, world.y + grabOffset.y);
  board.requestDraw.value?.();
}

/** Курсор наведён на биток (для яркости стрелок и захвата). */
function cueUnderPointer(event: PointerEvent): boolean {
  const instance = game();
  if (!instance) return false;
  const cue = instance.getCuePosition();
  const world = worldFromEvent(event);
  if (!cue || !world) return false;
  return Math.hypot(world.x - cue.x, world.y - cue.y) <= BALL_RADIUS * 1.6;
}

/** Мигание стрелок перемещения, пока оно доступно. */
function blinkTick(now: number): void {
  blinkId = null;
  const instance = game();
  if (!instance || !instance.canMove() || instance.isMoving()) return;
  instance.setBlink((Math.sin(now / 320) + 1) / 2);
  board.requestDraw.value?.();
  blinkId = requestAnimationFrame(blinkTick);
}

function ensureBlink(): void {
  const instance = game();
  if (!instance || !instance.canMove() || instance.isMoving() || blinkId !== null) return;
  blinkId = requestAnimationFrame(blinkTick);
}

function shoot(): void {
  const instance = game();
  const session = host.session.value;
  if (!instance || !session || instance.isAnimating()) return;
  const aim = instance.getAim() ?? instance.defaultAim() ?? 0;
  const placement = instance.getCuePlacement();
  const shot = {
    angle: aim,
    power: powerPercent.value / 100,
    ...(placement ? { cueX: placement.x, cueY: placement.y } : {}),
  };
  if (!instance.startShot(shot)) return;
  const playerId = session.snapshot().currentPlayerId;
  const accepted = playerId ? session.makeMove(playerId, shot) : false;
  if (!accepted) instance.resetRuntime();
  syncAngle();
  board.requestDraw.value?.();
  if (accepted) ensureLoop();
}

function aimAt(event: PointerEvent): void {
  const instance = game();
  if (!instance) {
    animating.value = false;
    return;
  }
  animating.value = instance.isAnimating();
  if (instance.isAnimating()) return;
  const angle = angleFromEvent(event);
  if (angle === null) return;
  instance.setAim(angle);
  syncAngle();
  board.requestDraw.value?.();
}

function onPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const canvas = board.canvas.value;
  const instance = game();
  if (!canvas || !instance || instance.isAnimating()) return;
  dragging = true;
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    /* захват недоступен — не критично */
  }
  // Взяли биток — начинаем перемещение, прицел выключается.
  if (instance.canMove() && cueUnderPointer(event)) {
    const cue = instance.getCuePosition();
    const world = worldFromEvent(event);
    grabbing = true;
    grabOffset = cue && world ? { x: cue.x - world.x, y: cue.y - world.y } : { x: 0, y: 0 };
    instance.setCueHover(true);
    instance.startMove();
    placeCueAt(event);
    return;
  }
  aimAt(event);
}

function onPointerMove(event: PointerEvent): void {
  const instance = game();
  if (!instance) return;
  if (grabbing) {
    placeCueAt(event);
    return;
  }
  if (dragging) {
    aimAt(event);
    return;
  }
  // Без нажатия — подсветка битка, если перемещение доступно.
  const over = instance.canMove() && cueUnderPointer(event);
  if (over !== hoverCue) {
    hoverCue = over;
    instance.setCueHover(over);
    board.requestDraw.value?.();
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  try {
    board.canvas.value?.releasePointerCapture(event.pointerId);
  } catch {
    /* уже отпущен */
  }
  if (grabbing) {
    grabbing = false;
    const instance = game();
    instance?.endMove();
    // После перемещения прицел снова на цель.
    instance?.setAim(null);
    syncAngle();
    board.requestDraw.value?.();
  }
}

function onPointerCancel(): void {
  // Жест отменён браузером — перемещение/наведение прекращается, выстрела нет.
  dragging = false;
  if (grabbing) {
    grabbing = false;
    const instance = game();
    instance?.endMove();
    instance?.setAim(null);
  }
}

function onPointerLeave(): void {
  if (hoverCue) {
    hoverCue = false;
    game()?.setCueHover(false);
    board.requestDraw.value?.();
  }
}

function onWheel(event: WheelEvent): void {
  event.preventDefault();
  if (animating.value) return;
  powerPercent.value = wheelPower(powerPercent.value, event.deltaY);
}

// --- Ползунок силы: кастомный контролл (цвет заливки и числа от значения) ---

let powerDragging = false;

function setPowerFromPointer(clientY: number, el: HTMLElement): void {
  const rect = el.getBoundingClientRect();
  // Вертикальный метр: снизу 0, сверху 100 — правило в `power.ts`.
  powerPercent.value = powerFromY(clientY, rect.top, rect.height);
}

function onPowerDown(event: PointerEvent): void {
  if (event.button !== 0 || animating.value) return;
  powerDragging = true;
  const el = event.currentTarget as HTMLElement;
  try {
    el.setPointerCapture(event.pointerId);
  } catch {
    /* синтетический указатель — ведём без захвата */
  }
  setPowerFromPointer(event.clientY, el);
}

function onPowerMove(event: PointerEvent): void {
  if (!powerDragging) return;
  setPowerFromPointer(event.clientY, event.currentTarget as HTMLElement);
}

function onPowerUp(event: PointerEvent): void {
  if (!powerDragging) return;
  powerDragging = false;
  try {
    (event.currentTarget as Element).releasePointerCapture(event.pointerId);
  } catch {
    /* уже отпущен */
  }
}

function onPowerKey(event: KeyboardEvent): void {
  if (animating.value) return;
  const next = keyPower(powerPercent.value, event.key, event.shiftKey);
  if (next === null) return;
  powerPercent.value = next;
  event.preventDefault();
}

function attach(canvas: HTMLCanvasElement | null): void {
  detach?.();
  detach = null;
  if (!canvas) return;
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerCancel);
  canvas.addEventListener("pointerleave", onPointerLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  detach = () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerCancel);
    canvas.removeEventListener("pointerleave", onPointerLeave);
    canvas.removeEventListener("wheel", onWheel);
  };
}

onMounted(() => {
  animating.value = game()?.isAnimating() ?? false;
  game()?.setAim(null); // прицел по умолчанию — на целевой шар
  syncAngle();
  measurePanel();
  if (rootEl.value && typeof ResizeObserver !== "undefined") {
    panelObserver = new ResizeObserver(() => measurePanel());
    panelObserver.observe(rootEl.value);
  }
  ensureBlink();
  if (host.session.value) {
    unsubscribe = host.session.value.subscribe(() => {
      // Q7: пока идёт реплей, панель/ход не обновляем — синхронизируем по его концу.
      if (game()?.isAnimating()) return;
      syncAngle();
      board.requestDraw.value?.();
      ensureBlink();
    });
  }
});

// Канвас появляется из слоя поля; подписываемся, когда он доступен.
watch(board.canvas, (canvas) => attach(canvas), { immediate: true });

onScopeDispose(() => {
  detach?.();
  unsubscribe?.();
  if (rafId !== null) cancelAnimationFrame(rafId);
  if (blinkId !== null) cancelAnimationFrame(blinkId);
  panelObserver?.disconnect();
});
</script>

<template>
  <div
    ref="rootEl"
    class="billiards-ui"
    :style="{ paddingTop: `${band.top}px`, paddingBottom: `${band.bottom}px` }"
  >
    <div ref="leftRail" class="billiards-ui__rail billiards-ui__rail--left">
      <div
        class="billiards-ui__angle"
        role="slider"
        aria-label="Точный угол удара"
        :aria-valuenow="Math.round(angleDisplay)"
        aria-valuemin="0"
        aria-valuemax="359"
        @pointerdown="onScaleDown"
        @pointermove="onScaleMove"
        @pointerup="onScaleUp"
        @pointercancel="onScaleUp"
      >
        <div
          class="billiards-ui__angle-ticks"
          :style="{ backgroundPositionY: `${-angleDisplay * ANGLE_SCALE_PX_PER_DEG}px` }"
        />
        <div class="billiards-ui__angle-mark" />
      </div>
    </div>

    <div ref="rightRail" class="billiards-ui__rail billiards-ui__rail--right">
      <button
        class="billiards-ui__shoot"
        type="button"
        :disabled="animating"
        aria-label="Удар"
        @click="shoot"
      >
        SHOOT
      </button>
      <div
        class="billiards-ui__power-meter"
        :class="{ 'is-disabled': animating }"
        role="slider"
        tabindex="0"
        aria-label="Сила удара"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="powerPercent"
        :aria-disabled="animating"
        @pointerdown="onPowerDown"
        @pointermove="onPowerMove"
        @pointerup="onPowerUp"
        @pointercancel="onPowerUp"
        @keydown="onPowerKey"
      >
        <div class="billiards-ui__power-gray" :style="{ bottom: `${powerPercent}%` }" />
        <div class="billiards-ui__power-marker" :style="{ bottom: `${powerPercent}%` }" />
      </div>
      <span v-if="SHOW_POWER_VALUE" class="billiards-ui__power-value">{{ powerPercent }}</span>
      <button class="billiards-ui__feints" type="button" disabled aria-label="Финты">Финты</button>
    </div>
  </div>
</template>

<style scoped>
/* Панели игры — вертикальные рейки по бокам: слева тонкая подстройка угла,
   справа (сверху вниз) удар, сила и финты. */
/* Сетка: две рейки одинаковой ширины по краям и поле посередине. Рейки растягиваются
   по высоте полосы поля (padding сверху/снизу задаёт инсеты игры). Симметрия даёт
   равенство колонок, а не подгонка чисел. */
.billiards-ui {
  --rail-w: 64px;
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-columns: var(--rail-w) minmax(0, 1fr) var(--rail-w);
  grid-template-rows: minmax(0, 1fr);
  padding-left: var(--shell-pad-left);
  padding-right: var(--shell-pad-right);
  pointer-events: none;
}
.billiards-ui__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  min-height: 0;
  /* Контроллы не упираются в края полосы: внутренние отступы сверху и снизу. */
  padding-block: var(--space-5);
  pointer-events: auto;
}
.billiards-ui__rail--left {
  grid-column: 1;
}
.billiards-ui__rail--right {
  grid-column: 3;
}
/* Кнопка — не растягивается: занимает размер своего содержимого. */
.billiards-ui__shoot {
  flex: none;
  width: var(--rail-w);
  height: var(--rail-w);
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 2px solid var(--accent);
  background: color-mix(in oklch, var(--accent) 25%, var(--surface-2));
  color: var(--fg);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
}
.billiards-ui__shoot:disabled {
  opacity: 0.5;
}
.billiards-ui__feints {
  flex: none;
  width: var(--rail-w);
  height: var(--rail-w);
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--on-surface-variant);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  line-height: 1;
  white-space: nowrap;
  opacity: 0.5;
}
/* Метр — растягивается по всей свободной высоте рейки (flex: 1), ширина — как у шкалы угла.
   Единый градиент — фоном самого метра на всю высоту; верхнюю часть закрывает
   серая зона на якорях (top: 0, низ — по значению), как и ползунок. Маска «плашек» —
   одна на весь метр, поэтому серое и цветное режутся одинаково. Цвет не масштабируется. */
.billiards-ui__power-meter {
  position: relative;
  flex: 1 1 auto;
  width: 28px;
  min-height: 0;
  overflow: hidden;
  border-radius: 4px;
  background: linear-gradient(
    in oklch 0deg,
    oklch(0.72 0.18 150),
    oklch(0.75 0.19 80),
    oklch(0.62 0.22 28)
  );
  -webkit-mask-image: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 8px);
  mask-image: repeating-linear-gradient(0deg, #000 0 5px, transparent 5px 8px);
  cursor: pointer;
  touch-action: none;
  outline: none;
}
.billiards-ui__power-meter:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
.billiards-ui__power-meter.is-disabled {
  opacity: 0.6;
  cursor: default;
}
.billiards-ui__power-gray {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  /* Серый непрозрачный: оба конца смеси непрозрачны, поэтому яркий градиент
     не светит сквозь зону (в тёмной теме --surface-2 полупрозрачен). */
  background: color-mix(in oklch, var(--fg) 25%, var(--bg));
}
/* Ползунок: шире шкалы и с тёмной обводкой — виден на любом фоне. */
.billiards-ui__power-marker {
  position: absolute;
  left: 0;
  right: 0;
  height: 4px;
  transform: translateY(50%);
  border-radius: 2px;
  background: var(--fg);
  box-shadow: 0 0 0 1px oklch(0.15 0 0 / 0.8);
  pointer-events: none;
}
.billiards-ui__power-value {
  min-width: 3ch;
  text-align: center;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.billiards-ui__angle {
  position: relative;
  flex: 1 1 auto;
  width: 28px;
  min-height: 0;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in oklch, var(--surface-2) 55%, var(--border));
  border: 1px solid var(--border);
  cursor: grab;
  touch-action: none;
}
.billiards-ui__angle:active {
  cursor: grabbing;
}
.billiards-ui__angle-ticks {
  position: absolute;
  inset: 0;
  /* Тонкая шкала: 1 px = 0.01°, поэтому большой штрих — 1° (100px), малый — 0.1° (10px). */
  background-image:
    repeating-linear-gradient(0deg, var(--fg) 0 2px, transparent 2px 100px),
    repeating-linear-gradient(0deg, var(--border) 0 1px, transparent 1px 10px);
  opacity: 0.85;
}
.billiards-ui__angle-mark {
  position: absolute;
  left: -2px;
  right: -2px;
  top: 50%;
  height: 2px;
  transform: translateY(-50%);
  background: var(--accent);
}
</style>
