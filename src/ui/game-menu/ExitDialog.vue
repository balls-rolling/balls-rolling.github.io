<script setup lang="ts">
// Системный диалог выхода. Игра его не заменяет — только настраивает текст,
// дополнительную строку и кнопку (см. `Game.onExitRequested`).
defineProps<{
  message: string;
  titleNote?: string;
  extraAction?: { readonly value: string; readonly label: string };
  onResolve: (value: string) => void;
}>();
</script>

<template>
  <div class="group">
    <p v-if="titleNote" class="text-muted">{{ titleNote }}</p>
    <p>{{ message }}</p>
    <div class="group group--horizontal">
      <button class="btn btn--secondary" type="button" title="Остаться" @click="onResolve('stay')">
        <span class="btn__label">Остаться</span>
      </button>
      <button class="btn btn--danger" type="button" title="Выйти" @click="onResolve('exit')">
        <span class="btn__label">Выйти</span>
      </button>
      <button
        v-if="extraAction"
        class="btn btn--secondary"
        type="button"
        :title="extraAction.label"
        @click="onResolve(extraAction.value)"
      >
        <span class="btn__label">{{ extraAction.label }}</span>
      </button>
    </div>
  </div>
</template>
