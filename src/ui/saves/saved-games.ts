import type { Platform } from "@/core/platform";

// Управление сохранёнными играми (12-c). Чистый модуль над `Platform` без Vue:
// список сохранений с человекочитаемыми названиями и выборочное удаление.
// Компонент диалога только отображает и дёргает эти функции.

export interface SavedGameEntry {
  readonly id: string;
  readonly label: string;
}

/** Список сохранённых игр: id → название игры (фолбэк — сам id), по алфавиту. */
export async function loadSavedGames(platform: Platform): Promise<SavedGameEntry[]> {
  const ids = await platform.listSavedGames();
  const games = platform.listGames();
  return ids
    .map((id) => ({ id, label: games.find((game) => game.id === id)?.label ?? id }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Удалить выбранные сохранённые игры по списку id. */
export async function removeSavedGames(platform: Platform, ids: readonly string[]): Promise<void> {
  await platform.clearSavedGames(ids);
}
