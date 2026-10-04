// Адаптация сложности ИИ: чистая математика рейтинга 0..100.
// Порт `ai/difficulty.js:35-52`; хранилище и ключ `game/<id>` подключаются в
// фазе 07 — здесь только функции над состоянием.

/** Состояние рейтинга игрока-компьютера. */
export interface RatingState {
  readonly rating: number;
  readonly games: number;
  readonly wins: number;
}

/** Начальный рейтинг. */
export const INITIAL_RATING: RatingState = { rating: 0, games: 0, wins: 0 };

/** Уровень ИИ (0..4) по рейтингу. */
export function levelFor(rating: number): number {
  return Math.min(4, Math.max(0, Math.floor(rating / 25)));
}

/** Применить результат партии к рейтингу. Победа быстрее — прирост больше. */
export function applyResult(
  state: RatingState,
  result: { readonly won: boolean; readonly moves: number },
): RatingState {
  let rating = state.rating;
  let wins = state.wins;
  if (result.won) {
    wins += 1;
    rating += Math.min(15, Math.max(3, 15 - result.moves / 2));
  } else {
    rating -= 8;
  }
  return {
    rating: Math.min(100, Math.max(0, rating)),
    games: state.games + 1,
    wins,
  };
}
