<script setup lang="ts">
// Полочка забитых шаров игрока (виджет панели). Разбивка — по назначенным
// группам партии (`getPocketedByPlayer`); при открытом столе групп ещё нет, и
// забитые показываются у игрока, чей ход. Шар рисуется фронтальным спрайтом
// (номер в камеру) — тем же рендером, что и стол.
import { computed, inject, onScopeDispose, shallowRef } from "vue";
import { frontBallSprite } from "@/games/billiards/ball-art";
import type { BilliardsGame } from "@/games/billiards/game";
import { sessionHostKey } from "@/ui/session-host";
import { useSessionSnapshot } from "@/ui/use-session-snapshot";
import { usePlayerSide } from "@/ui/shell/player-side";
import { playerSides } from "@/ui/shell/players";

/** Диаметр шарика на полочке, пикселей. */
const SHELF_BALL_PX = 18;
// Тик на время полёта удара: подписаться не на что (реплей не меняет ревизию
// сессии до конца), поэтому полочка опрашивает игру сама.
const tick = shallowRef(0);
let timer: number | null = null;
const WATCH_MS = 120;
timer = window.setInterval(() => {
  const instance = host.game.value as unknown as BilliardsGame | null;
  if (instance && typeof instance.isAnimating === "function" && instance.isAnimating()) {
    tick.value += 1;
  }
}, WATCH_MS);
onScopeDispose(() => {
  if (timer !== null) window.clearInterval(timer);
});

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const host = injectedHost;
const snapshot = useSessionSnapshot();
const side = usePlayerSide();

function game(): BilliardsGame | null {
  const instance = host.game.value as unknown as BilliardsGame | null;
  // Структурная проверка, а не instanceof: после HMR модуль может раздвоиться.
  if (instance && typeof instance.getPocketedIds === "function") return instance;
  return null;
}

const pocketed = computed(() => {
  // Зависимость от ревизии: пересчёт при каждом изменении сессии.
  const snap = snapshot.value;
  if (!snap) return [];
  const sides = playerSides(snap.players, snap.currentPlayerId);
  const mine = side === "left" ? sides.left : sides.right;
  if (!mine) return [];
  // Пока полёт (реплей) не дошёл до конца, шар на полке должен появиться сразу,
  // а не после покоя: слоим тик на ревизию сессии.
  void tick.value;
  return game()?.getPocketedByPlayer(mine.id) ?? [];
});

const images = computed(() =>
  pocketed.value.map((id) => ({ id, url: frontBallSprite(id, SHELF_BALL_PX).toDataURL() })),
);
</script>

<template>
  <div class="balls" :class="`balls--${side}`" aria-label="Забитые шары">
    <img
      v-for="ball in images"
      :key="ball.id"
      class="balls__item"
      :src="ball.url"
      :alt="`Шар ${ball.id}`"
    />
  </div>
</template>

<style scoped>
.balls {
  display: flex;
  gap: 3px;
  min-height: 18px;
}
.balls__item {
  width: 18px;
  height: 18px;
  border-radius: 50%;
}
</style>
