<script setup lang="ts">
// Системная панель участников: мини-панель по центру (режим и время) и панели
// игроков слева и справа. Игрок, чей ход, обведён рамкой. Если игрок один,
// рисуется только левая панель. Игра может добавить в панель свои контроллы
// (`Game.getPlayerPanel`): слоты в строке с именем и нижнюю строку.
import { computed, inject, onScopeDispose, shallowRef, watch } from "vue";
import type { FormHandle } from "@/core/form";
import { createFormController } from "@/core/form";
import { DEFAULT_VIEW_OPTIONS } from "@/core/game";
import { sessionHostKey } from "@/ui/session-host";
import { useSessionSnapshot } from "@/ui/use-session-snapshot";
import PlayerPanelSide from "./PlayerPanelSide.vue";
import { playerSides } from "./players";

const host = inject(sessionHostKey);
if (!host) throw new Error("Слот сессии не предоставлен");

const snapshot = useSessionSnapshot();
const options = computed(() => host.game.value?.getViewOptions() ?? DEFAULT_VIEW_OPTIONS);
const showPlayers = computed(() => options.value.playersPanel !== false);
const stats = computed(() => options.value.playersStats === true);
const mode = computed(() => host.game.value?.label ?? "");
const sides = computed(() =>
  snapshot.value ? playerSides(snapshot.value.players, snapshot.value.currentPlayerId) : null,
);

// Контроллы игры в панели: одна форма на игру, значения/pанель не нужны —
// работают только события, а сторону виджеты берут из контекста.
const panelForm = shallowRef<FormHandle | null>(null);
const nameRow = computed(() => host.game.value?.getPlayerPanel().nameRow ?? []);
const bottomRow = computed(() => host.game.value?.getPlayerPanel().bottomRow ?? []);

watch(
  () => host.game.value,
  (game) => {
    panelForm.value?.destroy();
    panelForm.value = game
      ? createFormController({ nodes: [...nameRow.value, ...bottomRow.value] })
      : null;
  },
  { immediate: true },
);
onScopeDispose(() => panelForm.value?.destroy());

function valueOf(id: string): unknown {
  return panelForm.value?.getValue(id);
}
function setValue(id: string, value: unknown): void {
  panelForm.value?.setValue(id, value);
}
function emit(id: string, signal: string, payload?: unknown): void {
  panelForm.value?.emit(id, signal, payload);
}
</script>

<template>
  <div v-if="snapshot && showPlayers && sides" class="players" role="group" aria-label="Игроки">
    <PlayerPanelSide
      v-if="sides.left"
      class="players__left"
      :player="sides.left"
      side="left"
      :stats="stats"
      :name-row="nameRow"
      :bottom-row="bottomRow"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="emit"
    />

    <div class="players__center">
      <span class="players__mode">{{ mode }}</span>
      <span v-if="stats" class="players__timer">--:--</span>
    </div>

    <PlayerPanelSide
      v-if="sides.right"
      class="players__right"
      :player="sides.right"
      side="right"
      :stats="stats"
      :name-row="nameRow"
      :bottom-row="bottomRow"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="emit"
    />
  </div>
</template>

<style scoped>
.players {
  position: absolute;
  top: var(--shell-pad-top);
  left: var(--shell-pad-left);
  right: var(--shell-pad-right);
  /* Центр строго по середине: боковые колонки равны, поэтому отсутствие второго
     игрока не сдвигает центральную панель. Панели жмутся к центру. */
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  /* Боковые панели растягиваются по строке — одинаковая высота; центр — по
     центральной линии строки. */
  align-items: stretch;
  gap: var(--space-2);
}
.players__left {
  justify-self: end;
}
.players__right {
  justify-self: start;
}
.players__center {
  justify-self: center;
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: var(--r-md);
  border: 1px solid var(--border);
  background: color-mix(in oklch, var(--surface-2) 82%, transparent);
  backdrop-filter: blur(4px);
}
.players__mode {
  font-size: var(--fs-sm);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--on-surface-variant);
}
.players__timer {
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--border);
  font-variant-numeric: tabular-nums;
  color: var(--on-surface-variant);
}
</style>
