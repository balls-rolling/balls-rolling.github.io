<script setup lang="ts">
// Временная панель: показывает, что реестр игр работает. Показывает служебное
// состояние платформы, поэтому живёт в ui/shell, а не среди универсальных
// компонентов. Исчезнет вместе с проверкой либо переедет в отладочный HUD
// фазы 05.
import { listGames } from "@/core/game";

const games = listGames();
</script>

<template>
  <p class="registry-panel">
    Реестр игр: <strong>{{ games.length }}</strong>
    <span v-if="games.length" class="registry-panel__list">
      — {{ games.map((g) => `${g.label} (${g.id})`).join(", ") }}
    </span>
  </p>
</template>

<style scoped>
.registry-panel {
  margin: 0;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--line);
  background: var(--card);
}

.registry-panel__list {
  opacity: 0.7;
}
</style>
