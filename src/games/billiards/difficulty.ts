// Сложность ИИ бильярда: одна непрерывная шкала 0..MAX и режим «авто».
// Чистая математика без DOM; образец — `games/tic-tac/difficulty.ts`.
//
// «Авто» двигает шкалу **между партиями** (не чаще раза в две партии, вниз
// быстрее вверх) и держит dead-zone против осцилляции: чередование победы и
// поражения шкалу не трогает. Внутри партии значение заморожено — шкала читается
// один раз на старте партии (`game.ts`, `#frozenScale`).

/** Верх шкалы: 0 — самый слабый ИИ, `DIFFICULTY_MAX` — самый сильный (но не идеальный). */
export const DIFFICULTY_MAX = 4;

/** Выбор сложности: «авто» или фиксированное число шкалы. */
export type Difficulty = "auto" | number;

/** Состояние авто-шкалы между партиями. */
export interface DifficultyState {
  /** Текущая шкала 0..`DIFFICULTY_MAX` (непрерывная). */
  readonly scale: number;
  /** Завершённых партий — счётчик. */
  readonly games: number;
  /** Партий с последнего изменения шкалы (rate-limit). */
  readonly sinceChange: number;
  /** Выиграл ли человек прошлую партию; `null` — ещё не было партии. */
  readonly lastWon: boolean | null;
}

/** Стартовая шкала «авто»: середина диапазона. */
export const INITIAL_DIFFICULTY: DifficultyState = {
  scale: DIFFICULTY_MAX / 2,
  games: 0,
  sinceChange: 0,
  lastWon: null,
};

/** Привести шкалу в диапазон 0..`DIFFICULTY_MAX` (дробная — допустима). */
export function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(DIFFICULTY_MAX, Math.max(0, value));
}

/** Навык 0..1 из шкалы — вход ошибки удара (`ai.ts`). */
export function skillFor(scale: number): number {
  return clampScale(scale) / DIFFICULTY_MAX;
}

/** Шаг повышения (человек выиграл — ИИ сильнее) и понижения (проиграл — слабее). */
const UP_STEP = 0.25;
const DOWN_STEP = 0.5;

/** Не чаще одного изменения за две партии. */
const MIN_GAMES_BETWEEN = 2;

/**
 * Применить исход партии к авто-шкале. `won` — выиграл ли человек.
 *
 * Dead-zone: нужно два **одинаковых** исхода подряд — чередование победы и
 * поражения шкалу не двигает. Понижение (человек проиграл) весомее повышения.
 * Исходные данные не мутируются.
 */
export function applyAutoResult(
  state: DifficultyState,
  result: { readonly won: boolean },
): DifficultyState {
  const games = state.games + 1;
  const sinceChange = state.sinceChange + 1;
  const sameAsLast = state.lastWon === result.won;
  if (!sameAsLast || sinceChange < MIN_GAMES_BETWEEN) {
    return { ...state, games, sinceChange, lastWon: result.won };
  }
  const delta = result.won ? UP_STEP : -DOWN_STEP;
  return {
    scale: clampScale(state.scale + delta),
    games,
    sinceChange: 0,
    lastWon: result.won,
  };
}
