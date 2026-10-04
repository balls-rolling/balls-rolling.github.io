<script setup lang="ts">
// Рендереры контроллов. Все получают один и тот же набор свойств, поэтому
// реестр может подставлять любой из них по `kind` без дополнительных условий.
import type { Control } from "@/core/form";

const props = defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  disabled?: boolean;
}>();

function onInput(event: Event): void {
  const next = (event.target as HTMLInputElement).value;
  props.setValue(props.control.id, next);
  props.emit(props.control.id, "change", next);
}
</script>

<template>
  <label class="field">
    <span v-if="control.label" class="field__label">{{ control.label }}</span>
    <input
      type="text"
      :disabled="disabled"
      :value="value == null ? '' : String(value)"
      @input="onInput"
    />
  </label>
</template>
