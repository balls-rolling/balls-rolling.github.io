<script setup lang="ts">
// Конструктор формы. Рекурсивный: группа рендерит свои дочерние узлы собой же.
// SFC ссылается на себя по имени файла — это штатный приём Vue для рекурсии.
//
// Состояние сворачивания групп живёт здесь же, по уровням: раскрыл или свернул
// пользователь — это не данные формы, а её вид.
import { reactive } from "vue";
import { nodeKey, type FormGroup, type FormNode, type FormText } from "@/core/form";
import ControlHost from "./ControlHost.vue";

defineProps<{
  nodes: readonly FormNode[];
  valueOf: (id: string) => unknown;
  setValue: (id: string, value: unknown) => void;
  emit: (id: string, signal: string, payload?: unknown) => void;
  /** Идентификаторы контроллов, которые нужно заблокировать. */
  disabled?: ReadonlySet<string>;
}>();

const open = reactive<Record<string, boolean>>({});

function isOpen(node: FormGroup): boolean {
  return node.id in open ? open[node.id]! : (node.open ?? false);
}

function onToggle(node: FormGroup, event: Event): void {
  open[node.id] = (event.target as HTMLDetailsElement).open;
}

function classes(node: FormGroup): Record<string, boolean> {
  return {
    "form-group--framed": Boolean(node.frame),
    "form-group--horizontal": node.orientation === "horizontal",
  };
}

function textClasses(node: FormText): Record<string, boolean> {
  return { "form-text--multiline": Boolean(node.multiline) };
}
</script>

<template>
  <div class="form-view">
    <template v-for="node in nodes" :key="nodeKey(node)">
      <!-- Группа: заголовок — это её подпись, отдельного контролла нет -->
      <details
        v-if="node.type === 'group' && node.collapsible"
        class="form-group"
        :class="classes(node)"
        :open="isOpen(node)"
        @toggle="onToggle(node, $event)"
      >
        <summary v-if="node.label" class="form-group__label">{{ node.label }}</summary>
        <FormView
          :nodes="node.children"
          :value-of="valueOf"
          :set-value="setValue"
          :emit="emit"
          :disabled="disabled"
        />
      </details>

      <fieldset v-else-if="node.type === 'group'" class="form-group" :class="classes(node)">
        <legend v-if="node.label" class="form-group__label">{{ node.label }}</legend>
        <FormView
          :nodes="node.children"
          :value-of="valueOf"
          :set-value="setValue"
          :emit="emit"
          :disabled="disabled"
        />
      </fieldset>

      <!-- Текст: пояснение, значения не несёт -->
      <p v-else-if="node.type === 'text'" class="form-text" :class="textClasses(node)">
        {{ node.text }}
      </p>

      <!-- Контролл -->
      <ControlHost
        v-else
        :control="node.control"
        :value="valueOf(node.control.id)"
        :set-value="setValue"
        :emit="emit"
        :disabled="disabled?.has(node.control.id) ?? false"
      />
    </template>
  </div>
</template>

<style scoped>
.form-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  border: none;
}

.form-group--framed {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}

.form-group--horizontal {
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
}

/* Вложенный FormView внутри группы не создаёт своего бокса: flex-контейнером
   группы становится сам `fieldset`, и «горизонтально/вертикально» управляет
   именно он. Селекторы ниже всё ещё видят `.form-view` как родителя (DOM), но
   раскладку ведёт группа. */
.form-group > .form-view {
  display: contents;
}

/* В горизонтальной группе все контроллы делят ширину поровну базовым flex
   (кнопки, поля, вложенные группы). */
.form-group--horizontal > .form-view > * {
  flex: 1 1 0;
  min-width: 0;
}

.form-group__label {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-text {
  margin: 0;
  color: var(--on-surface-variant);
}

.form-text--multiline {
  white-space: pre-line;
}
</style>
