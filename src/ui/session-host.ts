import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Game } from "@/core/game";
import type { Session } from "@/core/session";

// Слот активной игры: сессия и её игра. Сессия — контроллер партии, игра нужна
// игровому меню и диалогу выхода (методы игры). Сессия одна на платформу.

export interface SessionHost {
  readonly session: ShallowRef<Session | null>;
  readonly game: ShallowRef<Game | null>;
  /** Положить сессию и её игру в слот. Прошлая сессия освобождается. */
  set(session: Session | null, game?: Game | null): void;
  /** Освободить слот. */
  clear(): void;
}

export const sessionHostKey: InjectionKey<SessionHost> = Symbol("session-host");

export function createSessionHost(): SessionHost {
  const session = shallowRef<Session | null>(null);
  const game = shallowRef<Game | null>(null);

  return {
    session,
    game,
    set(next: Session | null, nextGame: Game | null = null): void {
      if (session.value === next && game.value === nextGame) return;
      // Прошлую сессию обязательно освобождаем: иначе её таймеры и подписчики
      // останутся жить.
      session.value?.destroy();
      session.value = next;
      game.value = nextGame;
    },
    clear(): void {
      session.value?.destroy();
      session.value = null;
      game.value = null;
    },
  };
}
