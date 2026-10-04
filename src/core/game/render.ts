import type { Camera, CellBounds, Point, Size } from "../viewport";

// Контракт отрисовки игры. Сессия владеет состоянием и передаёт его игре вместе
// с настроенным контекстом и камерой; игра рисует своё. Ядро не знает ни одной
// фигуры, DOM-тип здесь нужен только как средство рисования.
//
// Файл не импортирует UI и Vue: рендер инициирует `Session`, а не слой UI.

/** Цвета поля из токенов темы: фон, сетка, фигуры. */
export interface BoardColors {
  readonly bg: string;
  readonly grid: string;
  readonly x: string;
  readonly o: string;
}

/** Рамка рендера: контекст настроен под dpr, дана камера и видимые границы. */
export interface GameRenderFrame {
  readonly ctx: CanvasRenderingContext2D;
  readonly camera: Camera;
  readonly bounds: CellBounds;
  readonly size: Size;
  readonly dpr: number;
  /** Цвета поля, прочитанные из токенов (кэш Viewport, не каждый кадр). */
  readonly colors: BoardColors;
  /** Мировые координаты → пиксели окна (CSS-px). */
  readonly toScreen: (point: Point) => Point;
  /** Пиксели окна → мировые координаты. */
  readonly toWorld: (point: Point) => Point;
}
