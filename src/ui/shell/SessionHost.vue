<script setup lang="ts">
// Слот сессии: показывает, что игра идёт, и даёт игровое меню.
// Управление ходами — дело игрового UI (фаза 08), не платформы: платформа не
// знает, из чего состоит ход.
import { computed, inject, onScopeDispose, ref, watch } from "vue";
import type { SessionSnapshot } from "@/core/session";
import { GameMenu } from "@/ui/game-menu";
import { sessionHostKey } from "@/ui/session-host";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const snapshot = ref<SessionSnapshot | null>(null);
let unsubscribe: (() => void) | null = null;

// Реагируем и на подмену сессии в слоте, и на изменения внутри неё.
watch(
  () => sessionHost.session.value,
  (session) => {
    unsubscribe?.();
    unsubscribe = null;
    snapshot.value = session?.snapshot() ?? null;
    if (session) {
      unsubscribe = session.subscribe((next) => {
        snapshot.value = next;
      });
    }
  },
  { immediate: true },
);

onScopeDispose(() => unsubscribe?.());

const currentName = computed(() => {
  const snap = snapshot.value;
  if (!snap || !snap.currentPlayerId) return null;
  return snap.players.find((player) => player.id === snap.currentPlayerId)?.name ?? null;
});
</script>

<template>
  <section v-if="snapshot" class="session-host">
    <span class="session-host__state">
      {{ snapshot.state }}
      <template v-if="currentName"> · ходит {{ currentName }}</template>
    </span>
    <span class="session-host__revision">revision {{ snapshot.revision }}</span>
    <GameMenu />
  </section>
</template>

<style scoped>
.session-host {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  max-width: 100%;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  box-shadow: var(--elev-2);
}

.session-host__state {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-host__revision {
  color: var(--on-surface-variant);
  font-size: var(--fs-sm);
}
</style>
