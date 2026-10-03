import type { FormSchema } from "../form";
import type { PropertySchema } from "../player";
import type { GameState, Move, MoveResult } from "./move";

// Базовый класс игры. Правила и очередь хода принадлежат игре (D3): в бильярде
// после удачного удара игрок ходит снова, и это знает только игра.
//
// Класс не знает ни о Vue, ни об UI, ни о других играх.

export abstract class Game {
  /** Идентификатор, стабильный между запусками. */
  abstract readonly id: string;
  /** Название для интерфейса. */
  abstract readonly label: string;

  /** Начальное состояние партии для перечисленных игроков. */
  abstract createInitialState(playerIds: readonly string[]): GameState;

  /**
   * Применить ход. Решение о допустимости полностью на игре.
   * Состояние неизменяемо: игра возвращает новое в `MoveResult.state`.
   */
  abstract applyMove(state: GameState, playerId: string, move: Move): MoveResult;

  /**
   * Выбор хода компьютером. `null` — хода нет.
   * Отдельный метод, а не флаг: задержка и момент вызова — дело `Session`,
   * а сам выбор — дело игры.
   */
  abstract chooseMove(state: GameState, playerId: string): Move | null;

  /** Чей ход следующий. Игра решает это сама. */
  abstract nextPlayer(state: GameState, playerId: string): string | null;

  abstract isFinished(state: GameState): boolean;

  /** Схема игровых свойств игрока. По умолчанию игровых свойств нет. */
  getPropertySchema(): PropertySchema {
    return { specs: [] };
  }

  /**
   * Преднастройка игры перед стартом — декларативная схема, а не Vue-компонент:
   * иначе игра впускала бы Vue в ядро. Рендер схемы — дело UI-слоя.
   */
  getSetupForm(): FormSchema {
    return { controls: [] };
  }
}
