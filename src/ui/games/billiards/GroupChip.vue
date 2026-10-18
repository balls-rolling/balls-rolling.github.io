<script setup lang="ts">
// Подпись группы игрока в панели: «Сплошные 1–7» / «Полосатые 9–15».
// Группа берётся из состояния партии (`state.groups`, назначенные после первого
// легального забитого), а не из порядка раскладки; пока стол открыт, подписи нет.
import { computed, inject, onScopeDispose, shallowRef } from "vue";
import type { BilliardsGame } from "@/games/billiards/game";
import { sessionHostKey } from "@/ui/session-host";
import { useSessionSnapshot } from "@/ui/use-session-snapshot";
import { usePlayerSide } from "@/ui/shell/player-side";
import { playerSides } from "@/ui/shell/players";

// Реплей не меняет ревизию сессии до конца, поэтому подпись опрашивает игру.
const tick = shallowRef(0);
let timer: number | null = null;

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const host = injectedHost;

function game(): BilliardsGame | null {
  const instance = host.game.value as unknown as BilliardsGame | null;
  // Структурная проверка, а не instanceof: после HMR модуль может раздвоиться.
  if (instance && typeof instance.getPocketedByPlayer === "function") return instance;
  return null;
}

const snapshot = useSessionSnapshot();
const side = usePlayerSide();

/** Текст группы этого игрока; `null` — группы ещё нет (стол открыт). */
const text = computed(() => {
  const snap = snapshot.value;
  if (!snap) return null;
  const sides = playerSides(snap.players, snap.currentPlayerId);
  const mine = side === "left" ? sides.left : sides.right;
  if (!mine) return null;
  void tick.value;
  return game()?.playerGroupLabel(mine.id) ?? null;
});

// Подпись пересчитывается на каждом тике: группы назначаются в момент, когда
// анимация уже закончилась, поэтому одного факта анимации мало.
timer = window.setInterval(() => {
  tick.value += 1;
}, 150);
onScopeDispose(() => {
  if (timer !== null) window.clearInterval(timer);
});
</script>

<template>
  <span v-if="text" class="group-chip" :class="`group-chip--${side}`">{{ text }}</span>
</template>

<style scoped>
.group-chip {
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--on-surface-variant);
  white-space: nowrap;
}
</style>