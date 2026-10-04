// Публичный API камеры Viewport. Чистая логика, без DOM: компонент
// (`src/ui/viewport/`) использует её, игры получают через рамку рендера.
export {
  BASE_CELL,
  MIN_SCALE,
  MAX_SCALE,
  DEFAULT_CAMERA,
  ZOOM_STEP,
  WHEEL_STEP,
  PICK_THRESHOLD,
  clampScale,
  panByPixels,
  screenToWorld,
  worldToScreen,
  zoomTo,
  zoomBy,
  visibleBounds,
} from "./camera";
export type { Camera, CellBounds, Point, Size } from "./types";
