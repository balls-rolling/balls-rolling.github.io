<script setup lang="ts">
// Панель одного игрока: системная часть (аватар, имя) плюс слоты игры в строке
// имени и нижняя строка (если игра что-то объявила). Сторона передаётся
// контроллам игры через контекст.
import { provide } from "vue";
import type { FormNode } from "@/core/form";
import { FormView } from "@/ui/form";
import { initialOf, type SidePlayer } from "./players";
import { playerSideKey, type PlayerSide } from "./player-side";

const props = defineProps<{
  player: SidePlayer;
  side: PlayerSide;
  stats: boolean;
  nameRow: readonly FormNode[];
  bottomRow: readonly FormNode[];
  valueOf: (id: string) => unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
}>();

provide(playerSideKey, props.side);

function initial(): string {
  return initialOf(props.player.name);
}
</script>

<template>
  <div
    class="panel"
    :class="[`panel--${side}`, { 'is-current': player.isCurrent }]"
    :aria-label="player.name"
  >
    <div class="panel__row">
      <span class="panel__avatar">{{ initial() }}</span>
      <span class="panel__id">
        <span class="panel__name">{{ player.name }}</span>
        <span v-if="stats" class="panel__score">0</span>
      </span>
      <FormView
        v-if="nameRow.length"
        :nodes="nameRow"
        :value-of="valueOf"
        :set-value="setValue"
        :emit="emit"
      />
    </div>
    <div v-if="bottomRow.length" class="panel__row">
      <FormView :nodes="bottomRow" :value-of="valueOf" :set-value="setValue" :emit="emit" />
    </div>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 6px 10px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: color-mix(in oklch, var(--surface-2) 82%, transparent);
  backdrop-filter: blur(4px);
}
.panel.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px color-mix(in oklch, var(--accent) 40%, transparent);
}
.panel__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.panel__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  flex: 0 0 auto;
}
.panel__id {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.panel__name {
  font-size: var(--fs-sm);
  font-weight: 600;
  min-width: 0;
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel__score {
  font-size: var(--fs-lg);
  font-weight: 800;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
/* Обе строки панели — flex-row. FormView внутри строки тоже строка, а не стек. */
.panel__row :deep(.form-view) {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: var(--space-2);
}
</style>
