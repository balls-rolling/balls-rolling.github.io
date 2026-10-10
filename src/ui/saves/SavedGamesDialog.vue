<script setup lang="ts">
// Диалог выборочной очистки сохранённых игр (12-c). Только вид: список с
// отметками и две кнопки; решение отдаётся наружу через `onApply`/`onCancel`.
import { computed, ref } from "vue";
import type { SavedGameEntry } from "./saved-games";

const props = defineProps<{
  entries: readonly SavedGameEntry[];
  onApply: (ids: string[]) => void;
  onCancel: () => void;
}>();

// Отмеченные к удалению. Заменяем Set, чтобы Vue увидел изменение.
const checked = ref<Set<string>>(new Set());

const selected = computed(() => [...checked.value]);

function toggle(id: string): void {
  const next = new Set(checked.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  checked.value = next;
}

function apply(): void {
  if (selected.value.length === 0) return;
  props.onApply(selected.value);
}
</script>

<template>
  <div class="group">
    <p class="text-muted">Отметьте сохранённые игры, которые нужно удалить.</p>
    <ul class="saved-games list-reset">
      <li v-for="entry in entries" :key="entry.id">
        <label class="saved-games__item">
          <input type="checkbox" :checked="checked.has(entry.id)" @change="toggle(entry.id)" />
          <span>{{ entry.label }}</span>
        </label>
      </li>
    </ul>
    <div class="group group--horizontal">
      <button class="btn btn--secondary" type="button" title="Отмена" @click="onCancel">
        <span class="btn__label">Отмена</span>
      </button>
      <button
        class="btn btn--danger"
        type="button"
        title="Удалить выбранные"
        :disabled="selected.length === 0"
        @click="apply"
      >
        <span class="btn__label">Удалить выбранные</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.saved-games {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.saved-games__item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
</style>
