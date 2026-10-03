import { shallowRef, type InjectionKey, type ShallowRef } from "vue";
import type { Session } from "@/core/session";

// Слот активной сессии: платформа кладёт сюда запущенную игру, а игровой слой
// с ней взаимодействует. Сессия одна на платформу.

export interface SessionHost {
  readonly session: ShallowRef<Session | null>;
  /** Положить сессию в слот. Прошлая сессия освобождается. */
  set(session: Session | null): void;
  /** Освободить слот. */
  clear(): void;
}

export const sessionHostKey: InjectionKey<SessionHost> = Symbol("session-host");

export function createSessionHost(): SessionHost {
  const session = shallowRef<Session | null>(null);

  return {
    session,
    set(next: Session | null): void {
      if (session.value === next) return;
      // Прошлую сессию обязательно освобождаем: иначе её таймеры и подписчики
      // останутся жить.
      session.value?.destroy();
      session.value = next;
    },
    clear(): void {
      session.value?.destroy();
      session.value = null;
    },
  };
}
