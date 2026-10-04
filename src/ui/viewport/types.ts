import type { Camera, CellBounds, Point, Size } from "@/core/viewport";

// Контракт рендера игрового содержимого. Viewport владеет канвасом, камерой,
// dpr и вводом; игра получает готовую рамку и рисует своё — платформа не знает
// ни одной фигуры (принцип 8, решение D3 фазы 05).

/** Рамка рендера: контекст уже настроен под dpr, камера и видимые границы даны. */
export interface ViewportFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  readonly bounds: CellBounds;
  readonly size: Size;
  readonly dpr: number;
  /** Мировые координаты → пиксели окна (CSS-px). */
  readonly toScreen: (point: Point) => Point;
  /** Пиксели окна → мировые координаты. */
  readonly toWorld: (point: Point) => Point;
}

/** Колбэк отрисовки игры: вызывается после фона и сетки. */
export type ViewportRenderer = (frame: ViewportFrame) => void;
