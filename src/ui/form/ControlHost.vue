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

// Флекс из метаданных: не задан — как решит группа (в горизонтальной `1 1 0`),
// `false` — по содержимому, объект — свои параметры. Инлайновый стиль перебивает
// CSS группы.
const flexStyle = computed<Record<string, string> | undefined>(() => {
  const flex = props.control.flex;
  if (flex === undefined || flex === true) return undefined;
  if (flex === false) return { flex: "0 0 auto" };
  const grow = flex.grow ?? 1;
  const shrink = flex.shrink ?? 1;
  const basis = flex.basis ?? "0";
  return { flex: `${grow} ${shrink} ${basis}` };
});
</script>

<template>
  <component
    :is="renderer"
    :control="control"
    :value="value"
    :set-value="setValue"
    :emit="emit"
    :disabled="disabled"
    :style="flexStyle"
  />
</template>
