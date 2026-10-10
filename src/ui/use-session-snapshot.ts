import { inject, onScopeDispose, ref, watch, type Ref } from "vue";
import type { SessionSnapshot } from "@/core/session";
import { sessionHostKey } from "./session-host";

// Реактивный снимок активной сессии: один приём на всех, кто показывает партию
// (панель игроков, инфо-бары, игровой UI), вместо отдельных подписок в каждом.
export function useSessionSnapshot(): Ref<SessionSnapshot | null> {
  const host = inject(sessionHostKey);
  if (!host) throw new Error("Слот сессии не предоставлен");

  const snapshot = ref<SessionSnapshot | null>(null);
  let unsubscribe: (() => void) | null = null;

  watch(
    () => host.session.value,
    (session) => {
      unsubscribe?.();
      unsubscribe = null;
      snapshot.value = session?.snapshot() ?? null;
      if (session) unsubscribe = session.subscribe((next) => (snapshot.value = next));
    },
    { immediate: true },
  );

  onScopeDispose(() => unsubscribe?.());
  return snapshot;
}
