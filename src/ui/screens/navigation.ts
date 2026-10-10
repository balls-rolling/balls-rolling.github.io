import type { GameEntry } from "@/core/game";

// Хук запуска игры. Экраны меню не знают об окружении игры: они лишь просят
// «открыть игру». Кто именно это делает, регистрируется отдельно — так экраны не
// зависят от окружения, а окружение от экранов.

/** Дополнительные параметры открытия игры (deep-link). */
export interface GameOpenOptions {
  readonly net?: { readonly offer: string };
  /** Возобновить сохранённую партию вместо запуска новой. */
  readonly resume?: boolean;
}

export type GameOpener = (entry: GameEntry, options?: GameOpenOptions) => void;

let gameOpener: GameOpener | null = null;

/** Зарегистрировать обработчик открытия игры. Вызывается из composition root. */
export function registerGameOpener(opener: GameOpener): void {
  gameOpener = opener;
}

/** Открыть игру. Если обработчик ещё не зарегистрирован, ничего не происходит. */
export function openGame(entry: GameEntry, options?: GameOpenOptions): void {
  gameOpener?.(entry, options);
}
