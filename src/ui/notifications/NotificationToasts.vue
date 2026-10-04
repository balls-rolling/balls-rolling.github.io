<script setup lang="ts">
// Всплывающие уведомления: выезжают сбоку, исчезают растворением. Позиция —
// fixed справа, не привязана к колокольчику.
//
// Вход — через `@starting-style` (CSS-переход при появлении), выход — класс
// растворения и удаление по таймеру. `TransitionGroup` не используем: при
// удалении в момент появления он застревает (не успевает добавить leave-to).
import { inject, onUnmounted, ref, watch } from "vue";
import NotificationItem from "./NotificationItem.vue";
import { notificationsKey } from "./key";
import type { AppNotification } from "./center";

const injected = inject(notificationsKey);
if (!injected) throw new Error("Центр уведомлений не предоставлен");
const center = injected;
const toasts = center.toasts;

const TTL = 4000;
const LEAVE = 250;

interface ToastRow {
  readonly notification: AppNotification;
  readonly hiding: boolean;
}

const rows = ref<readonly ToastRow[]>([]);
const hideTimers = new Map<number, number>();
const removeTimers = new Map<number, number>();

function hide(id: number): void {
  const row = rows.value.find((r) => r.notification.id === id);
  if (!row || row.hiding) return;
  rows.value = rows.value.map((r) => (r.notification.id === id ? { ...r, hiding: true } : r));
  if (removeTimers.has(id)) return;
  removeTimers.set(
    id,
    window.setTimeout(() => {
      rows.value = rows.value.filter((r) => r.notification.id !== id);
      removeTimers.delete(id);
      hideTimers.delete(id);
    }, LEAVE),
  );
}

watch(
  toasts,
  (list) => {
    const present = new Set(list.map((toast) => toast.id));
    for (const notification of list) {
      if (rows.value.some((r) => r.notification.id === notification.id)) continue;
      rows.value = [...rows.value, { notification, hiding: false }];
      if (!hideTimers.has(notification.id)) {
        hideTimers.set(
          notification.id,
          window.setTimeout(() => center.dismissToast(notification.id), TTL),
        );
      }
    }
    // Исчезли из источника (таймер или открытие стека) — растворяем.
    for (const row of rows.value) {
      if (!present.has(row.notification.id) && !row.hiding) hide(row.notification.id);
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  for (const handle of hideTimers.values()) window.clearTimeout(handle);
  for (const handle of removeTimers.values()) window.clearTimeout(handle);
  hideTimers.clear();
  removeTimers.clear();
});
</script>

<template>
  <div class="toasts" aria-live="polite">
    <div
      v-for="row in rows"
      :key="row.notification.id"
      class="toast-slot"
      :class="{ 'toast-slot--hiding': row.hiding }"
    >
      <NotificationItem :notification="row.notification" />
    </div>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 10;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-2);
  padding-right: var(--space-4);
  max-width: min(360px, calc(100vw - 2 * var(--space-4)));
  overflow: hidden;
  pointer-events: none;
}

.toast-slot {
  transition:
    opacity var(--dur-base) var(--ease),
    transform var(--dur-base) var(--ease),
    filter var(--dur-base) var(--ease);
}

@starting-style {
  .toast-slot {
    opacity: 0;
    transform: translateX(120%);
    filter: blur(6px);
  }
}

.toast-slot--hiding {
  opacity: 0;
  filter: blur(6px);
}
</style>
