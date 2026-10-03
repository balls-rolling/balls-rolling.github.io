<script setup lang="ts">
// Кнопка-действие: не меняет значение, а сообщает о нажатии. Какое действие
// за этим стоит, решает тот, кто слушает сигналы контролла.
import type { Control } from "@/core/form";

const props = defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
}>();

// Кнопка умеет объявлять несколько сигналов, но нажатие — всегда одно.
const SIGNAL = "press";

function onClick(): void {
  props.emit(props.control.id, SIGNAL);
}
</script>

<template>
  <button class="form-control__button" type="button" @click="onClick">
    <span v-if="control.icon" class="form-control__icon" aria-hidden="true">{{
      control.icon
    }}</span>
    {{ control.label }}
  </button>
</template>
