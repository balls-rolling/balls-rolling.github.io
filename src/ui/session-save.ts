import type { SessionSave } from "@/core/session";

// Координатор автосохранения партии. Живёт в UI, потому что точке сохранения
// нужны сразу игра, сессия и стор, а активной сессией владеет `sessionHost`.
// Ядро при этом остаётся без Vue и UI.
//
// Параметры описаны структурными интерфейсами: координатор не тянет классы
// `Session`/`Game`/`Platform`, поэтому легко подменяется в тестах заглушками.

/** Игрок в снимке: координатору важны id и способ связи. */
export interface SaveablePlayer {
  readonly id: string;
  readonly transport: string;
}

/** Минимальный снимок сессии, которого хватает координатору. */
export interface SaveableSnapshot {
  readonly state: "idle" | "running" | "finished";
  readonly isDemo: boolean;
  readonly players: readonly SaveablePlayer[];
}

/** Сессия, пригодная для автосохранения. */
export interface SaveableSession {
  readonly isDemo: boolean;
  subscribe(listener: (snapshot: SaveableSnapshot) => void): () => void;
  snapshot(): SaveableSnapshot;
  save(): SessionSave;
}

/** Игра, чьи настройки сохраняются рядом со снимком партии. */
export interface SaveableGame {
  /** Идентификатор игры — ключ узла сохранения. */
  readonly id: string;
  serializeSettings(): unknown;
}

/** Платформа: запись снимка и удаление сессии (настройки остаются). */
export interface SaveablePlatform {
  saveGameSnapshot(id: string, settings: unknown, save: SessionSave): void | Promise<void>;
  removeSessionSave(id: string): void | Promise<void>;
}

export interface AttachSessionSaveDeps {
  readonly session: SaveableSession;
  readonly game: SaveableGame;
  readonly platform: SaveablePlatform;
}

/**
 * Сохранять партию можно, только если она не демонстрационная. Локальную партию
 * хранит её сторона; сетевую (есть удалённый игрок) — **только хост** (локальный
 * игрок `p1`): гостю хранить нечего, он подключается заново и получает состояние
 * от хоста (CONTEXT D11/D14). Единый предикат переиспользуется снаружи, чтобы
 * явные удаления снимка тоже не трогали демо и сетевого гостя.
 */
export function isPersistable(session: SaveableSession): boolean {
  if (session.isDemo) return false;
  const players = session.snapshot().players;
  const network = players.some((player) => player.transport === "remote");
  if (!network) return true;
  // Сетевую партию хранит хост — он первый в составе (см. лобби); гость (локальный
  // игрок не первый) не сохраняет.
  const local = players.find((player) => player.transport === "local");
  return local !== undefined && players[0]?.id === local.id;
}

/**
 * Подписаться на изменения сессии и писать снимок партии на каждой смене
 * состояния. `idle` не пишется, `running` — сохраняется, `finished` — снимок
 * сессии удаляется (настройки игры остаются). Возвращает функцию отписки.
 */
export function attachSessionSave({ session, game, platform }: AttachSessionSaveDeps): () => void {
  return session.subscribe((snapshot) => {
    if (!isPersistable(session)) return;

    if (snapshot.state === "finished") {
      void platform.removeSessionSave(game.id);
      return;
    }

    if (snapshot.state === "running") {
      void platform.saveGameSnapshot(game.id, game.serializeSettings(), session.save());
    }
  });
}
