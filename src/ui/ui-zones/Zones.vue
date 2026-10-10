<script setup lang="ts">
// Четыре зоны интерфейса игры (верх/низ/лево/право). Контейнер не перехватывает
// клики по полю: интерактивны только сами контроллы внутри зон.
// Состояние и сигналы — общий хендл зон (как форма).
// Занятое место измеряет слой (LayerGameUi): там же и общий бар платформы.
import type { UiZones } from "@/core/ui-zones";
import { useFieldValue } from "@/ui/form";
import ZoneHost from "./ZoneHost.vue";

const props = defineProps<{ zones: UiZones }>();

const { valueOf, setValue } = useFieldValue(props.zones.handle);

function emit(id: string, signal: string, payload?: unknown): void {
  props.zones.handle.emit(id, signal, payload);
}
</script>

<template>
  <div class="zones">
    <ZoneHost
      v-for="zone in props.zones.zones"
      :key="zone.name"
      class="zones__item"
      :class="`zones__item--${zone.name}`"
      :zone="zone"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="emit"
    />
  </div>
</template>

<style scoped>
.zones {
  position: absolute;
  inset: 0;
  display: grid;
  grid-template-areas:
    "top top top"
    "left . right"
    "bottom bottom bottom";
  grid-template-columns: minmax(0, auto) 1fr minmax(0, auto);
  grid-template-rows: minmax(0, auto) 1fr minmax(0, auto);
  gap: var(--space-3);
  /* Верхний отступ задаёт `LayerGameUi`: нижняя кромка системной панели + зазор. */
  padding: var(--zones-top, calc(var(--space-4) + env(safe-area-inset-top)))
    calc(var(--space-4) + env(safe-area-inset-right))
    calc(var(--space-4) + env(safe-area-inset-bottom))
    calc(var(--space-4) + env(safe-area-inset-left));
  pointer-events: none;
}
.zones__item--top {
  grid-area: top;
  justify-self: center;
}
.zones__item--bottom {
  grid-area: bottom;
  justify-self: center;
}
.zones__item--left {
  grid-area: left;
  align-self: center;
}
.zones__item--right {
  grid-area: right;
  align-self: center;
}
</style>
