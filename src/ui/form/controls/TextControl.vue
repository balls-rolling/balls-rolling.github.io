<script setup lang="ts">
// Рендереры контроллов. Все получают один и тот же набор свойств, поэтому
// реестр может подставлять любой из них по `kind` без дополнительных условий.
// Внешний вид намеренно минимален: дизайн — отдельная фаза.
import type { Control } from "@/core/form";

defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
}>();
</script>

<template>
  <label class="form-control">
    <span v-if="control.label" class="form-control__label">{{ control.label }}</span>
    <input
      type="text"
      :value="value == null ? '' : String(value)"
      @input="setValue(control.id, ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>
