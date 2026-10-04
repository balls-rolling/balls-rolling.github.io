<script setup lang="ts">
// Итог партии: результат и две кнопки — реванш или выход в меню. Диалог
// системный по механике, но инициирует его игра при завершении партии.
defineProps<{
  message: string;
  onResolve: (value: string) => void;
}>();
</script>

<template>
  <div class="group">
    <p>{{ message }}</p>
    <div class="group group--horizontal">
      <button class="btn btn--primary" type="button" title="Реванш" @click="onResolve('rematch')">
        <span class="btn__label">Реванш</span>
      </button>
      <button class="btn btn--secondary" type="button" title="Выйти" @click="onResolve('exit')">
        <span class="btn__label">Выйти</span>
      </button>
    </div>
  </div>
</template>
