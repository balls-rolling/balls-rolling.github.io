<script setup lang="ts">
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
      type="number"
      :value="value == null ? '' : String(value)"
      @input="setValue(control.id, Number(($event.target as HTMLInputElement).value))"
    />
  </label>
</template>
