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
  const next = (event.target as HTMLSelectElement).value;
  props.setValue(props.control.id, next);
  props.emit(props.control.id, "change", next);
}
</script>

<template>
  <label class="field">
    <span v-if="control.label" class="field__label">{{ control.label }}</span>
    <select :disabled="disabled" :value="value == null ? '' : String(value)" @change="onChange">
      <option v-for="option in control.options ?? []" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </label>
</template>
