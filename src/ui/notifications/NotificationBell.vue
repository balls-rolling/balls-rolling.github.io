<script setup lang="ts">
// Колокольчик: стек уведомлений текущего сеанса. Кнопка — fixed в правом верхнем
// углу и в диалоговом слое, и в игровом: это одна и та же точка экрана, поэтому
// переключение незаметно. Панель — нативный `popover` с anchor positioning: клик
// мимо и Esc закрывают её сами. Открытие стека прячет всплывающие тосты — те же
// уведомления уже видны в стеке.
import { inject, onUnmounted, ref, useId } from "vue";
import { Bell } from "@lucide/vue";
import NotificationItem from "./NotificationItem.vue";
import { notificationsKey } from "./key";

const injected = inject(notificationsKey);
if (!injected) throw new Error("Центр уведомлений не предоставлен");
const center = injected;
const items = center.items;
const unread = center.unread;

// Уникальные id и якорь на каждый экземпляр: два колокольчика (диалог и игра)
// живут в DOM одновременно, имена якорей совпадать не должны.
const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const panelId = `bell-panel-${uid}`;
const anchorName = `--bell-${uid}`;

const open = ref(false);

// Растворение элементов стека: сначала класс, затем удаление из центра по
// таймеру. Так исчезновение детерминировано и не зависит от transitionend.
const LEAVE = 250;
const hiding = ref<ReadonlySet<number>>(new Set());
const removeTimers = new Map<number, number>();

function onToggle(event: Event): void {
  const state = (event as Event & { newState?: string }).newState;
  open.value = state === "open";
  if (open.value) center.dismissAllToasts();
}

function consume(id: number): void {
  center.markRead(id);
  if (hiding.value.has(id)) return;
  hiding.value = new Set(hiding.value).add(id);
  if (removeTimers.has(id)) return;
  removeTimers.set(
    id,
    window.setTimeout(() => {
      center.dismiss(id);
      const next = new Set(hiding.value);
      next.delete(id);
      hiding.value = next;
      removeTimers.delete(id);
    }, LEAVE),
  );
}

function clearAll(): void {
  const next = new Set(hiding.value);
  for (const notification of items.value) next.add(notification.id);
  hiding.value = next;
  window.setTimeout(() => center.clear(), LEAVE);
}

onUnmounted(() => {
  for (const handle of removeTimers.values()) window.clearTimeout(handle);
  removeTimers.clear();
});
</script>

<template>
  <div class="bell">
    <button
      class="btn btn--icon bell__button"
      type="button"
      :popovertarget="panelId"
      :style="{ '--bell-anchor': anchorName }"
      :aria-label="unread ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'"
      :aria-expanded="open"
    >
      <span class="bell__content">
        <Bell class="icon" aria-hidden="true" />
      </span>
      <span v-if="unread" class="bell__badge" aria-hidden="true">{{ unread }}</span>
    </button>

    <div
      :id="panelId"
      popover="auto"
      class="bell__panel surface-card"
      :style="{ '--bell-anchor': anchorName }"
      @toggle="onToggle"
    >
      <p v-if="items.length === 0" class="text-muted">Уведомлений нет</p>
      <template v-else>
        <ul class="list-reset bell__list">
          <NotificationItem
            v-for="notification in [...items].reverse()"
            :key="notification.id"
            class="bell__row"
            :class="{ 'bell__row--hiding': hiding.has(notification.id) }"
            :notification="notification"
            interactive
            @activate="consume"
            @dismiss="consume"
          />
        </ul>
        <button class="btn btn--ghost btn--sm" type="button" @click="clearAll">Очистить</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Одна и та же точка экрана в обоих слоях — переключение не видно. */
.bell {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: 12;
}

.bell__button {
  position: relative;
  anchor-name: var(--bell-anchor);
  width: var(--control-lg);
  height: var(--control-lg);
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  box-shadow: var(--elev-2);
  /* Базовый `.btn` обрезает содержимое (`overflow: hidden`) — здесь это не
     годится: бейдж выходит за край. Обрезаем только внутренний блок. */
  overflow: visible;
}

/* Содержимое кнопки в подблоке: именно его можно обрезать, не задевая бейдж. */
.bell__content {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.bell__button:hover {
  background: color-mix(in oklch, var(--on-surface) 8%, var(--surface-2));
}

.bell__badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 999px;
  background: var(--danger);
  color: #ffffff;
  font-size: var(--fs-xs);
  line-height: 18px;
  text-align: center;
}

/* Панель — popover: позиционируем от якоря кнопки, выезжает сбоку и
   растворяется (прозрачность + blur). */
.bell__panel {
  position: fixed;
  position-anchor: var(--bell-anchor);
  top: calc(anchor(bottom) + var(--space-2));
  right: anchor(right);
  /* UA-стиль `[popover]` ставит `inset: 0`; без явных auto `left`/`bottom`
     перекрывают якорные `right`/`top` (переконстрейн). */
  left: auto;
  bottom: auto;
  width: min(320px, calc(100vw - 2 * var(--space-4)));
  /* Не выше экрана и не в упор к краю: оставляем поля сверху (кнопка) и снизу. */
  max-height: calc(100dvh - var(--space-4) - var(--control-lg) - var(--space-2) - var(--space-4));
  margin: 0;
  padding: var(--space-3);
  /* UA-стиль `[popover]` даёт `overflow: auto`: выезжающие строки создавали
     горизонтальный скроллбар и панель дёргалась по высоте. Панель не скроллится
     сама — скроллит список ниже. */
  overflow: hidden;
  flex-direction: column;
  gap: var(--space-2);
  opacity: 0;
  transform: translateX(24px);
  filter: blur(6px);
  transition:
    opacity var(--dur-base) var(--ease),
    transform var(--dur-base) var(--ease),
    filter var(--dur-base) var(--ease),
    display var(--dur-base) var(--ease) allow-discrete,
    overlay var(--dur-base) var(--ease) allow-discrete;
}

.bell__panel:popover-open {
  display: flex;
  opacity: 1;
  transform: translateX(0);
  filter: blur(0);
}

@starting-style {
  .bell__panel:popover-open {
    opacity: 0;
    transform: translateX(24px);
    filter: blur(6px);
  }
}

.bell__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  /* Список занимает остаток панели и скроллится; своей высоты не имеет. */
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

/* Появление/растворение элементов стека — только прозрачность и blur: панель
   уже выезжает целиком, и горизонтальный сдвиг строк внутри неё не нужен
   (он же давал оверфлоу по ширине). */
.bell__row {
  transition:
    opacity var(--dur-base) var(--ease),
    filter var(--dur-base) var(--ease);
}

@starting-style {
  .bell__row {
    opacity: 0;
    filter: blur(6px);
  }
}

.bell__row--hiding {
  opacity: 0;
  filter: blur(6px);
}
</style>
