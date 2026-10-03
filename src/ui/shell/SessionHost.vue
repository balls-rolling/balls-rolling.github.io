<script setup lang="ts">
// Слот сессии: показывает, что игра идёт, и даёт вернуться в меню.
// Управление ходами — дело игрового UI (фаза 08), не платформы: платформа не
// знает, из чего состоит ход.
import { computed, inject, onScopeDispose, ref, watch } from "vue";
import type { SessionSnapshot } from "@/core/session";
import { dialogKey } from "@/ui/dialog/key";
import { MainScreen } from "@/ui/screens";
import { sessionHostKey } from "@/ui/session-host";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

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

function openMenu(): void {
  dialog.show({ component: MainScreen, title: "Меню" });
}
</script>

<template>
  <section v-if="snapshot" class="session-host">
    <span class="session-host__state">
      {{ snapshot.state }}
      <template v-if="currentName"> · ходит {{ currentName }}</template>
    </span>
    <span class="session-host__revision">revision {{ snapshot.revision }}</span>
    <button type="button" @click="openMenu">Меню</button>
  </section>
</template>

<style scoped>
.session-host {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--card);
}

.session-host__state {
  font-weight: 600;
}

.session-host__revision {
  opacity: 0.7;
  font-size: 0.85em;
}
</style>
