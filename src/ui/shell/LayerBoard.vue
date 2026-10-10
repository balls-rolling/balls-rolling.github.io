<script setup lang="ts">
// Слой 1: игровое поле. Переиспользуемый canvas-Viewport рисует фон, сетку и
// делегирует отрисовку активной игры; выбор клетки уходит в UI игры через сервис
// `boardInput`, потому что форма хода платформе неизвестна.
import { computed, inject, onMounted, onScopeDispose, useTemplateRef, watch } from "vue";
import type { GameRenderFrame } from "@/core/game";
import { DEFAULT_VIEW_OPTIONS } from "@/core/game";
import type { Point } from "@/core/viewport";
import { boardInputKey } from "@/ui/board-input";
import { sessionHostKey } from "@/ui/session-host";
import { Viewport } from "@/ui/viewport";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedInput = inject(boardInputKey);
if (!injectedInput) throw new Error("Ввод поля не предоставлен");
const boardInput = injectedInput;

const viewport = useTemplateRef<InstanceType<typeof Viewport>>("viewport");

// В демо служебные элементы поля (зум) не показываем — только партия.
const isDemo = computed(() => sessionHost.session.value?.isDemo ?? false);
const cursor = computed(() => boardInput.cursor.value);
// Игра объявляет, что ей нужно от камеры: зум, панораму, сетку.
const viewOptions = computed(
  () => sessionHost.game.value?.getViewOptions() ?? DEFAULT_VIEW_OPTIONS,
);

function renderBoard(frame: GameRenderFrame): void {
  sessionHost.session.value?.draw(frame);
}

function onPick(cell: Point): void {
  boardInput.handler.value?.(cell);
}

// Даём игре доступ к канвасу и перерисовке поля: UI игры подписывается на ввод
// сам и ведёт игровой цикл (решение Q2/Q3 фазы 04).
onMounted(() => {
  boardInput.canvas.value = viewport.value?.canvas ?? null;
  boardInput.requestDraw.value = () => viewport.value?.draw();
});

// Состояние сессии не реактивно само по себе: подписываемся на её изменения и
// перерисовываем поле (ходы, победа), а также при смене сессии в слоте.
let unsubscribe: (() => void) | null = null;
watch(
  () => sessionHost.session.value,
  (session) => {
    unsubscribe?.();
    unsubscribe = null;
    if (session) unsubscribe = session.subscribe(() => viewport.value?.draw());
    viewport.value?.draw();
  },
  { immediate: true },
);
onScopeDispose(() => {
  unsubscribe?.();
  boardInput.canvas.value = null;
  boardInput.requestDraw.value = null;
});
</script>

<template>
  <section class="layer layer-board">
    <Viewport
      ref="viewport"
      :render="renderBoard"
      :controls="!isDemo"
      :show-grid="viewOptions.grid"
      :zoom="viewOptions.zoom"
      :pan="viewOptions.pan"
      :cursor="cursor"
      @pick="onPick"
    />
    <slot />
  </section>
</template>
