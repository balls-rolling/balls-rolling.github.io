// Типы камеры Viewport. Только данные: ни DOM, ни Vue, ни UI. Модель портирована
// из исходной доски (`tic-board.js:29`): центр окна в мировых клетках + масштаб
// (размер клетки в пикселях).

/** Камера-окно: `(x, y)` — центр в мировых клетках, `scale` — размер клетки в px. */
export interface Camera {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

/** Точка в мировых координатах или пикселях (зависит от контекста функции). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Размер окна канваса в CSS-пикселях. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** Видимые клетки включительно (целочисленные границы). */
export interface CellBounds {
  readonly x0: number;
  readonly x1: number;
  readonly y0: number;
  readonly y1: number;
}
