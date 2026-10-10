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

/**
 * Снимок игрока для сохранения: те же поля, что и `PlayerSnapshot`. Игровые
 * свойства — plain-словарь, пригодный для JSON.
 */
export type PlayerSave = PlayerSnapshot;

/** Полный снимок партии: снимок, а не реплей. Платформа его не разбирает. */
export interface SessionSave {
  readonly players: readonly PlayerSave[];
  readonly currentPlayerId: string | null;
  readonly winnerId: string | null;
  readonly state: SessionState;
  /** Состояние игры, сериализованное самой игрой (`Game.serializeState`). */
  readonly gameState: unknown;
}

/** Вход восстановления сессии в конструктор `Session`. */
export interface SessionRestore {
  readonly save: SessionSave;
}
