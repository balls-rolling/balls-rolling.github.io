<script setup lang="ts">
// Полоса забитых шаров игрока (виджет панели). Данных пока нет — правила
// режимов придут в 05+, поэтому показаны пустые ячейки нужного размера.
import { usePlayerSide } from "@/ui/shell/player-side";

const side = usePlayerSide();
const slots = Array.from({ length: 15 }, (_, i) => i);
</script>

<template>
  <div class="balls" :class="`balls--${side}`" aria-label="Забитые шары">
    <span v-for="slot in slots" :key="slot" class="balls__item" />
  </div>
</template>

<style scoped>
.balls {
  display: flex;
  gap: 3px;
}
.balls__item {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: color-mix(in oklch, var(--surface-2) 55%, transparent);
}
</style>
