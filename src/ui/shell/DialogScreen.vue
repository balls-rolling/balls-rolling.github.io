<script setup lang="ts">
// Окно платформы: содержимое и кнопки задаёт игра. Компонент ничего не знает ни о
// партии, ни об игре — нажатие отдаёт значение кнопки обратно.
import type { DialogAction } from "@/core/game";

defineProps<{
  message: string;
  actions: readonly DialogAction[];
  onResolve: (value: string) => void;
}>();
</script>

<template>
  <div class="group">
    <p>{{ message }}</p>
    <div class="group group--horizontal">
      <button
        v-for="action in actions"
        :key="action.value"
        class="btn"
        :class="action.variant === 'secondary' ? 'btn--secondary' : 'btn--primary'"
        type="button"
        :title="action.label"
        @click="onResolve(action.value)"
      >
        <span class="btn__label">{{ action.label }}</span>
      </button>
    </div>
  </div>
</template>
