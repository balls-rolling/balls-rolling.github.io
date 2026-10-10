import type { GameEntry } from "@/core/game";
import { BilliardsGame } from "./game";

// Точка входа игры для реестра: `default` требует `import.meta.glob`.
const entry: GameEntry = {
  id: "billiards",
  label: "Бильярд",
  entry: () => Promise.resolve(new BilliardsGame()),
};

export default entry;
