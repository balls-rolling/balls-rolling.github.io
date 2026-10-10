// Декларативные зоны интерфейса игры: верх/низ/лево/право. Ядро отдаёт схему,
// UI строит по ней — ни Vue, ни DOM здесь нет (приём тот же, что у формы).
import type { FormNode } from "../form";

/** Сторона экрана, в которую игра кладёт свои контроллы. */
export type ZoneName = "top" | "bottom" | "left" | "right";

/** Направление раскладки контроллов внутри зоны. */
export type ZoneOrientation = "horizontal" | "vertical";

export interface ZoneSchema {
  /** По умолчанию: верх/низ — горизонтально, лево/право — вертикально. */
  readonly orientation?: ZoneOrientation;
  readonly nodes: readonly FormNode[];
}

export interface UiLayoutSchema {
  readonly zones: Partial<Record<ZoneName, ZoneSchema>>;
}

/** Одна зона в готовом виде: имя, направление и узлы. */
export interface UiZone {
  readonly name: ZoneName;
  readonly orientation: ZoneOrientation;
  readonly nodes: readonly FormNode[];
}

export interface UiZones {
  /** Зоны в фиксированном порядке: top, right, bottom, left. */
  readonly zones: readonly UiZone[];
  zone(name: ZoneName): UiZone | null;
  /** Управление контроллами всех зон: состояние и сигналы (как у формы). */
  readonly handle: import("../form").FormHandle;
  /**
   * Занятое зонами место по сторонам кадра (пиксели). Заполняет UI после
   * измерения: игра сама решает, резервировать ли под это место в рендере.
   */
  insets: ZoneInsets;
}

/** Место, занятое зонами по сторонам кадра. */
export interface ZoneInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const ZERO_INSETS: ZoneInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Порядок обхода зон — стабильный, чтобы рендер не зависел от порядка ключей. */
export const ZONE_ORDER: readonly ZoneName[] = ["top", "right", "bottom", "left"];

/** Направление по умолчанию для каждой стороны. */
export const DEFAULT_ZONE_ORIENTATION: Readonly<Record<ZoneName, ZoneOrientation>> = {
  top: "horizontal",
  bottom: "horizontal",
  left: "vertical",
  right: "vertical",
};
