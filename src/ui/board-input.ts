import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Point } from "@/core/viewport";

// Мост между Viewport (слой поля) и UI игры (слой 2): платформа не знает форму
// хода, поэтому выбор клетки и стиль курсора задаёт UI игры.

export type BoardPickHandler = (cell: Point) => void;

export interface BoardInput {
  /** Обработчик выбора клетки; `null`, пока игра его не поставила. */
  readonly handler: ShallowRef<BoardPickHandler | null>;
  /** Курсор поля, которым управляет игра (по умолчанию обычный). */
  readonly cursor: ShallowRef<string>;
}

export const boardInputKey: InjectionKey<BoardInput> = Symbol("board-input");

export function createBoardInput(): BoardInput {
  return { handler: shallowRef<BoardPickHandler | null>(null), cursor: shallowRef("default") };
}
