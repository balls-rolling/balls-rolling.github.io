// Обобщённые типы хода. Ничего не знают ни об одной конкретной игре: состав
// состояния и хода определяет сама игра, ядро их не разбирает.

/** Состояние партии. Структуру задаёт игра. */
export interface GameState {
  readonly [key: string]: unknown;
}

/** Ход. Состав задаёт игра. */
export interface Move {
  readonly [key: string]: unknown;
}

export interface MoveResult {
  /** Принят ли ход. Отклонённый ход не меняет состояние. */
  readonly accepted: boolean;
  /**
   * Состояние партии после хода. При отклонённом ходе — прежнее состояние.
   * Состояние неизменяемо, поэтому игра возвращает новое, а не правит переданное.
   */
  readonly state: GameState;
  /** Закончена ли партия после этого хода. */
  readonly finished: boolean;
  /** Победитель, если партия закончена победой. Ничья — null. */
  readonly winnerId?: string | null;
}
