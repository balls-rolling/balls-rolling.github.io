<script setup lang="ts">
// Рендерер контролла-виджета панели: `kind: "widget"`, значение — токен виджета.
// Неизвестный токен не падает — показывает запасную подпись.
import { computed } from "vue";
import type { Control } from "@/core/form";
import { widgetFor } from "./registry";

const props = defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  disabled?: boolean;
}>();

const component = computed(() => (typeof props.value === "string" ? widgetFor(props.value) : null));
</script>

<template>
  <component :is="component" v-if="component" />
  <span v-else class="widget-fallback" :title="String(value)">—</span>
</template>

<style scoped>
.widget-fallback {
  color: var(--on-surface-variant);
  font-size: var(--fs-sm);
}
</style>
