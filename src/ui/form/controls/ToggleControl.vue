<script setup lang="ts">
import type { Control } from "@/core/form";

const props = defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  disabled?: boolean;
}>();

function onChange(event: Event): void {
  const checked = (event.target as HTMLInputElement).checked;
  props.setValue(props.control.id, checked);
  props.emit(props.control.id, "change", checked);
}
</script>

<template>
  <label class="field field--inline">
    <input type="checkbox" :disabled="disabled" :checked="Boolean(value)" @change="onChange" />
    <span v-if="control.label" class="field__label">{{ control.label }}</span>
  </label>
</template>
