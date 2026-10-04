<script setup lang="ts">
// Запасной рендерер для неизвестного `kind`: не падать и не молчать, а честно
// показать, что контролл не распознан. Добавление нового типа в реестр не должно
// требовать правки ядра, а забытый тип не должен ломать форму целиком.
import type { Control } from "@/core/form";

defineProps<{
  control: Control;
  value: unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  disabled?: boolean;
}>();
</script>

<template>
  <p class="text-muted">{{ control.label }} — неизвестный тип контролла «{{ control.kind }}»</p>
</template>
