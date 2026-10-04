<script setup lang="ts">
// Один элемент уведомления: используется и тостами, и стеком под колокольчиком.
// В интерактивном режиме (стек) по телу — «прочитано и убрать», по крестику —
// тоже пометить прочитанным и убрать.
import { X } from "@lucide/vue";
import type { AppNotification } from "./center";

defineProps<{ notification: AppNotification; interactive?: boolean }>();
defineEmits<{ activate: [id: number]; dismiss: [id: number] }>();
</script>

<template>
  <div class="notification" :class="`notification--${notification.kind}`">
    <button
      v-if="interactive"
      class="notification__body"
      type="button"
      :title="notification.text"
      @click="$emit('activate', notification.id)"
    >
      {{ notification.text }}
    </button>
    <span v-else class="notification__text" :title="notification.text">{{
      notification.text
    }}</span>

    <button
      v-if="interactive"
      class="notification__close"
      type="button"
      title="Закрыть уведомление"
      aria-label="Закрыть уведомление"
      @click.stop="$emit('dismiss', notification.id)"
    >
      <X class="icon" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.notification {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
  color: var(--on-surface);
  font-size: var(--fs-sm);
  box-shadow: var(--elev-2);
}

.notification--success {
  border-color: var(--ok);
}

.notification--error {
  border-color: var(--danger);
}

.notification__body,
.notification__text {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notification__body {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  cursor: default;
}

.notification__body:hover {
  color: var(--on-surface);
}

.notification__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: none;
  color: var(--on-surface-variant);
}

.notification__close:hover {
  background: var(--hover);
  color: var(--on-surface);
}
</style>
