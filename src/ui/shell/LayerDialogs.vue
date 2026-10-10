<script setup lang="ts">
// Слой диалогов: единственный `<dialog>` платформы и стек экранов.
//
// Диалог всегда в DOM (не под `v-if`): иначе гонка «ref ещё null → showModal» и
// пропадает анимация. Экраны переключаются через `v-show`: неактивные
// скрываются, но не размонтируются — их состояние сохраняется.
import { inject, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
import { ArrowLeft } from "@lucide/vue";
import { dialogKey } from "@/ui/dialog/key";
import { NotificationBell, NotificationToasts } from "@/ui/notifications";

const injected = inject(dialogKey);
if (!injected) throw new Error("Менеджер диалогов не предоставлен");
const manager = injected;

const dialogElement = ref<HTMLDialogElement | null>(null);
const screens = manager.screens;
const canGoBack = manager.canGoBack;
const title = manager.title;

onMounted(() => {
  if (dialogElement.value) manager.attach(dialogElement.value);
});
onScopeDispose(() => manager.detach());

// Управление фокусом (не оформление): `autofocus` в динамически создаваемом
// контенте ненадёжен, поэтому при смене экрана переводим фокус внутрь вручную.
// Вид индикатора фокуса задаёт CSS `:focus-visible` в base.css.
watch(
  () => screens.value.length,
  async () => {
    await nextTick();
    focusActiveScreen();
  },
);

function focusActiveScreen(): void {
  const host = dialogElement.value;
  if (!host) return;
  const active = host.querySelector<HTMLElement>(".app-dialog__screen:last-of-type");
  const target = active?.querySelector<HTMLElement>(
    "button, input, select, textarea, [tabindex]:not([tabindex='-1'])",
  );
  target?.focus();
}
</script>

<template>
  <section class="layer layer-dialogs">
    <dialog
      ref="dialogElement"
      class="app-dialog"
      :class="{ 'app-dialog--wide': manager.wide.value }"
      aria-modal="true"
      closedby="none"
    >
      <header class="app-dialog__header">
        <button
          v-if="canGoBack"
          class="app-dialog__back btn btn--icon btn--ghost"
          type="button"
          aria-label="Назад"
          @click="manager.back()"
        >
          <ArrowLeft class="icon" aria-hidden="true" />
        </button>
        <h2 class="app-dialog__title">{{ title }}</h2>
      </header>
      <div class="app-dialog__content">
        <div
          v-for="(screen, index) in screens"
          :key="index"
          class="app-dialog__screen"
          v-show="index === screens.length - 1"
        >
          <component :is="screen.component" v-bind="screen.props ?? {}" />
        </div>
      </div>
      <NotificationBell />
      <NotificationToasts />
    </dialog>
  </section>
</template>
