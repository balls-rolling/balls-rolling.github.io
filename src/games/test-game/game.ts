import { Game, type GameState, type Move, type MoveResult } from "@/core/game";
import { definePropertySchema } from "@/core/player";
import type { FormSchema } from "@/core/form";

// Тестовая игра: не для прода, а чтобы проверять платформу по-настоящему — через
// реестр, сессию и игровые свойства, как любая другая игра.
//
// Правила намеренно тривиальны: ходы по очереди, побеждает первый, кто сделал
// три хода. Смысл не в правилах, а в том, что через неё дёргаются все механизмы
// ядра.

/** Сколько ходов нужно для победы. */
const TARGET_MOVES = 3;

interface TestState extends GameState {
  readonly order: readonly string[];
  readonly moves: Readonly<Record<string, number>>;
  readonly total: number;
}

/** Схема игровых свойств: проверка механизма игровых настроек. */
const propertySchema = definePropertySchema([
  {
    key: "testLevel",
    label: "Тестовый уровень",
    control: {
      id: "testLevel",
      kind: "number",
      label: "Тестовый уровень",
      value: 0,
      signals: ["change"],
    },
    isValid: (value) => typeof value === "number" && value >= 0 && value <= 3,
    normalize: (value) => Math.trunc(value as number),
  },
]);

/** Преднастройка игры: декларативная схема, рендер — дело UI-слоя. */
const setupForm: FormSchema = {
  id: "test-game-setup",
  controls: [
    {
      id: "fast",
      kind: "toggle",
      label: "Быстрый режим",
      icon: "bolt",
      value: false,
      signals: ["change"],
    },
  ],
};

export class TestGame extends Game {
  readonly id = "test-game";
  readonly label = "Тестовая игра";

  createInitialState(playerIds: readonly string[]): GameState {
    const moves: Record<string, number> = {};
    for (const id of playerIds) moves[id] = 0;
    return { order: [...playerIds], moves, total: 0 } satisfies TestState;
  }

  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    const current = state as TestState;
    if (typeof move.step !== "number") {
      return { accepted: false, state, finished: false };
    }

    const moves = { ...current.moves, [playerId]: (current.moves[playerId] ?? 0) + 1 };
    const next: TestState = { ...current, moves, total: current.total + 1 };

    const finished = moves[playerId]! >= TARGET_MOVES;
    return {
      accepted: true,
      state: next,
      finished,
      winnerId: finished ? playerId : null,
    };
  }

  chooseMove(): Move {
    return { step: 1 };
  }

  nextPlayer(state: GameState, playerId: string): string {
    const { order } = state as TestState;
    return order[(order.indexOf(playerId) + 1) % order.length]!;
  }

  isFinished(state: GameState): boolean {
    return (
      (state as TestState).total > 0 &&
      Object.values((state as TestState).moves).some((n) => n >= TARGET_MOVES)
    );
  }

  override getPropertySchema() {
    return propertySchema;
  }

  override getSetupForm(): FormSchema {
    return setupForm;
  }
}
