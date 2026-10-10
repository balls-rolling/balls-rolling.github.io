import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Point } from "@/core/viewport";

// Мост между Viewport (слой поля) и UI игры (слой 2): платформа не знает форму
// хода, поэтому выбор клетки и стиль курсора задаёт UI игры. Сюда же игра берёт
// доступ к канвасу поля и возможность попросить перерисовку — она подписывается
// на ввод сама (решение Q2 фазы 04 спринта 02).

export type BoardPickHandler = (cell: Point) => void;

export interface BoardInput {
  /** Обработчик выбора клетки; `null`, пока игра его не поставила. */
  readonly handler: ShallowRef<BoardPickHandler | null>;
  /** Курсор поля, которым управляет игра (по умолчанию обычный). */
  readonly cursor: ShallowRef<string>;
  /** Канвас поля; `null`, пока слой не смонтирован. Игра подписывается сама. */
  readonly canvas: ShallowRef<HTMLCanvasElement | null>;
  /** Попросить платформу перерисовать поле (игра ведёт цикл). */
  readonly requestDraw: ShallowRef<(() => void) | null>;
}

export const boardInputKey: InjectionKey<BoardInput> = Symbol("board-input");

export function createBoardInput(): BoardInput {
  return {
    handler: shallowRef<BoardPickHandler | null>(null),
    cursor: shallowRef("default"),
    canvas: shallowRef<HTMLCanvasElement | null>(null),
    requestDraw: shallowRef<(() => void) | null>(null),
  };
}
