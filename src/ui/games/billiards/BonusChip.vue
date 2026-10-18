<script setup lang="ts">
// Чип бонусов игрока (виджет панели). Пока — место: данные бонусов появятся
// с правилами аркады (режим 06), у 8-ball бонусов нет.
import { usePlayerSide } from "@/ui/shell/player-side";

const side = usePlayerSide();
</script>

<template>
  <span class="bonus" :class="`bonus--${side}`">бонусы</span>
</template>

<style scoped>
.bonus {
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--on-surface-variant);
}
</style>
