<script setup lang="ts">
// Хост контролла: выбирает рендерер по `kind` и передаёт ему единый набор
// свойств. Неизвестный `kind` не падает — реестр вернёт запасной вариант.
import { computed } from "vue";
import type { Control } from "@/core/form";
import { rendererFor } from "./registry";

const props = defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  disabled?: boolean;
}>();

const renderer = computed(() => rendererFor(props.control.kind));
</script>

<template>
  <component
    :is="renderer"
    :control="control"
    :value="value"
    :set-value="setValue"
    :emit="emit"
    :disabled="disabled"
  />
</template>
