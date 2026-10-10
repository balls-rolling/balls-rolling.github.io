<script setup lang="ts">
// Одна зона интерфейса игры: направление раскладки задаёт игра через схему.
// Содержимое — узлы формы, поэтому рендер переиспользует FormView и реестр
// контроллов: второй системы отрисовки не заводим.
import type { UiZone } from "@/core/ui-zones";
import { FormView } from "@/ui/form";

const props = defineProps<{
  zone: UiZone;
  valueOf: (id: string) => unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
}>();
</script>

<template>
  <div class="zone" :class="`zone--${props.zone.name} zone--${props.zone.orientation}`">
    <FormView
      :nodes="props.zone.nodes"
      :value-of="props.valueOf"
      :set-value="props.setValue"
      :emit="props.emit"
    />
  </div>
</template>

<style scoped>
.zone {
  display: flex;
  gap: var(--space-3);
  pointer-events: auto;
}
.zone--horizontal {
  flex-direction: row;
  align-items: center;
  flex-wrap: wrap;
}
.zone--vertical {
  flex-direction: column;
  align-items: flex-start;
}
.zone--top,
.zone--bottom {
  align-items: center;
}
</style>
