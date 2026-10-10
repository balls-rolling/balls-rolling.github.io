<script setup lang="ts">
// Простой подтверждающий диалог общего вида. Своей логики не несёт: текст и
// подписи задаёт вызывающий, выбор отдаётся через `onResolve`.
defineProps<{
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onResolve: (value: string) => void;
}>();
</script>

<template>
  <div class="group">
    <p>{{ message }}</p>
    <div class="group group--horizontal">
      <button
        class="btn btn--secondary"
        type="button"
        :title="cancelLabel ?? 'Отмена'"
        @click="onResolve('cancel')"
      >
        <span class="btn__label">{{ cancelLabel ?? "Отмена" }}</span>
      </button>
      <button
        class="btn btn--primary"
        type="button"
        :title="confirmLabel ?? 'Подтвердить'"
        @click="onResolve('confirm')"
      >
        <span class="btn__label">{{ confirmLabel ?? "Подтвердить" }}</span>
      </button>
    </div>
  </div>
</template>
