// Получение списка доступных игр. Ядро не знает ни одной конкретной игры —
// оно знает только, КАК их узнать. Имена папок произвольны, идентификаторы
// лежат внутри игр.
import type { GameEntry } from "./entry";

// Vite собирает этот glob в статическую карту импортов на этапе сборки,
// поэтому новая игра подхватывается без правок ядра.
const modules = import.meta.glob("../../games/*/index.ts", {
  eager: true,
  import: "default",
});

function isGameEntry(value: unknown): value is GameEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<GameEntry>;
  return typeof entry.id === "string" && typeof entry.label === "string";
}

/** Все доступные игры в виде записей реестра. */
export function listGames(): GameEntry[] {
  return Object.values(modules).filter(isGameEntry);
}
