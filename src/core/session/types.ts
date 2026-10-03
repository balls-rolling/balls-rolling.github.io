import type { PlayerSnapshot } from "../player";

// Состояние и снимок сессии. Снимок — единственный способ для UI узнать, что
// происходит: сессия не вызывает UI сама (D4).

export type SessionState = "idle" | "running" | "finished";

export interface SessionSnapshot {
  readonly state: SessionState;
  /** Демонстрационная сессия: флаг ставит сама сессия (D9). */
  readonly isDemo: boolean;
  readonly players: readonly PlayerSnapshot[];
  readonly currentPlayerId: string | null;
  readonly winnerId: string | null;
  /** Растёт на каждом изменении: дешёвая проверка «изменилось ли». */
  readonly revision: number;
}

export interface SessionOptions {
  readonly demo?: boolean;
}
