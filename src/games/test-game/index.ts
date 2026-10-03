import type { GameEntry } from "@/core/game";
import { TestGame } from "./game";

// Точка входа игры. Именно `default` требует реестр:
// import.meta.glob("../../games/*/index.ts", { import: "default" }).
//
// Загрузка отложенная: платформа создаёт игру только когда её выбрали.
const entry: GameEntry = {
  id: "test-game",
  label: "Тестовая игра",
  entry: () => Promise.resolve(new TestGame()),
};

export default entry;
