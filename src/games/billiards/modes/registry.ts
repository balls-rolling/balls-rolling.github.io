// Реестр режимов бильярда. Ядро не ветвится по режиму — оно берёт конфигурацию
// по id. Пока режим один (8-ball); аркада добавится в фазе 06.
import { BASE_8BALL } from "./base8ball";
import type { ModeConfig } from "./types";

const MODES: readonly ModeConfig[] = [BASE_8BALL];

/** Режим по умолчанию. */
export const DEFAULT_MODE_ID = BASE_8BALL.id;

/** Конфигурация режима по id; `null` — режим неизвестен. */
export function getMode(id: string): ModeConfig | null {
  return MODES.find((mode) => mode.id === id) ?? null;
}

/** Все доступные режимы. */
export function listModes(): readonly ModeConfig[] {
  return MODES;
}
