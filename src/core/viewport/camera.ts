import type { Camera, CellBounds, Point, Size } from "./types";

// Чистая математика камеры: панорама, зум к точке, world↔screen, отсечение.
// Без DOM и без Vue — тестируется в окружении `node`. Модель и формулы порт
// `tic-board.js:63,87-101,110-121`; отличия зафиксированы в PLAN/REPORT.

/** Базовый размер клетки в пикселях. */
export const BASE_CELL = 48;
/** Минимальный масштаб: полклетки. */
export const MIN_SCALE = BASE_CELL * 0.5;
/** Максимальный масштаб: две с половиной клетки. */
export const MAX_SCALE = BASE_CELL * 2.5;
/** Камера по умолчанию: ноль мировых координат в центре окна. */
export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, scale: BASE_CELL };
/** Шаг зума кнопками (к центру окна). */
export const ZOOM_STEP = 1.2;
/** Шаг зума колесом. */
export const WHEEL_STEP = 1.1;
/** Порог в пикселях, ниже которого pointerup считается кликом, а не панорамой. */
export const PICK_THRESHOLD = 5;

/** Зажать масштаб в допустимый диапазон. */
export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Сдвинуть камеру на пиксельную дельту панорамирования. */
export function panByPixels(camera: Camera, dx: number, dy: number): Camera {
  return {
    x: camera.x - dx / camera.scale,
    y: camera.y - dy / camera.scale,
    scale: camera.scale,
  };
}

/** Перевести пиксели окна в мировые координаты. */
export function screenToWorld(camera: Camera, point: Point, size: Size): Point {
  return {
    x: camera.x + (point.x - size.width / 2) / camera.scale,
    y: camera.y + (point.y - size.height / 2) / camera.scale,
  };
}

/** Перевести мировые координаты в пиксели окна. */
export function worldToScreen(camera: Camera, point: Point, size: Size): Point {
  return {
    x: size.width / 2 + (point.x - camera.x) * camera.scale,
    y: size.height / 2 + (point.y - camera.y) * camera.scale,
  };
}

/** Изменить масштаб, сохранив мировую точку под экранным якорем на месте. */
export function zoomTo(camera: Camera, anchor: Point, size: Size, nextScale: number): Camera {
  const scale = clampScale(nextScale);
  if (scale === camera.scale) return camera;

  const worldBefore = screenToWorld(camera, anchor, size);
  const centered: Camera = { x: 0, y: 0, scale };
  const offset = screenToWorld(centered, anchor, size);
  return { x: worldBefore.x - offset.x, y: worldBefore.y - offset.y, scale };
}

/** Изменить масштаб на множитель вокруг экранного якоря. */
export function zoomBy(camera: Camera, anchor: Point, size: Size, factor: number): Camera {
  return zoomTo(camera, anchor, size, camera.scale * factor);
}

/**
 * Целочисленные границы видимых клеток с запасом `margin` клеток. Запас нужен,
 * чтобы сетка и объекты у краёв не «щёлкали» при панораме.
 */
export function visibleBounds(camera: Camera, size: Size, margin = 1): CellBounds {
  const halfW = size.width / 2 / camera.scale;
  const halfH = size.height / 2 / camera.scale;
  return {
    x0: Math.floor(camera.x - halfW) - margin,
    x1: Math.ceil(camera.x + halfW) + margin,
    y0: Math.floor(camera.y - halfH) - margin,
    y1: Math.ceil(camera.y + halfH) + margin,
  };
}
