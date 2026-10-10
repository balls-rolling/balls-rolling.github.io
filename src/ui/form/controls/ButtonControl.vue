<script setup lang="ts">
// Кнопка-действие: не меняет значение, а сообщает о нажатии. Какое действие
// за этим стоит, решает тот, кто слушает сигналы контролла.
import { computed } from "vue";
import type { Control } from "@/core/form";
import { iconFor } from "@/ui/icons";

const props = defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  disabled?: boolean;
}>();

// Кнопка умеет объявлять несколько сигналов, но нажатие — всегда одно.
const SIGNAL = "press";

// Иконка — по строковому токену; неизвестный токен даёт `null`, кнопка остаётся.
const icon = computed(() => (props.control.icon ? iconFor(props.control.icon) : null));

// Вариант оформления — из метаданных; по умолчанию вторичная кнопка.
const variantClass = computed(() => `btn--${props.control.variant ?? "secondary"}`);

function onClick(): void {
  props.emit(props.control.id, SIGNAL);
}
</script>

<template>
  <button
    class="btn"
    :class="variantClass"
    type="button"
    :disabled="disabled"
    :title="control.label"
    @click="onClick"
  >
    <component :is="icon" v-if="icon" class="icon" aria-hidden="true" />
    <span class="btn__label">{{ control.label }}</span>
  </button>
</template>
