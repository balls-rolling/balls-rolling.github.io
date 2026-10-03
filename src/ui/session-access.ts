import type { SessionAccess } from "@/core/game";
import type { Session } from "@/core/session";

// Мост к сессии для игры. Игра не получает сам `Session` — только то, что ей
// действительно нужно. Так внутренности сессии остаются свободными для изменений.
export function toSessionAccess(session: Session): SessionAccess {
  return {
    snapshot: () => session.snapshot(),
    subscribe: (listener) => session.subscribe(listener),
    renamePlayer: (playerId, name) => session.renamePlayer(playerId, name),
    makeMove: (playerId, move) => session.makeMove(playerId, move),
  };
}
