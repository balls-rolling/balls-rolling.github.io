import type { GameEntry } from "@/core/game";
import { TicTacToeGame } from "./game";

// Точка входа игры для реестра: `default` требует `import.meta.glob`.
// Загрузка отложенная — платформа создаёт игру только когда её выбрали.
const entry: GameEntry = {
  id: "tic-tac-toe",
  label: "Крестики-нолики",
  entry: () => Promise.resolve(new TicTacToeGame()),
};

export default entry;
