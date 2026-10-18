<script setup lang="ts">
// Слой 2: игровой UI активной игры плюс общие функции платформы (меню, во весь
// экран). Компонент игры берётся из реестра UI по id; если UI нет — слой пуст.
// Колокольчик и тосты — только когда диалог закрыт: при открытом диалоге их
// показывает диалоговый слой, иначе на экране было бы две кнопки одновременно.
//
// Слой же измеряет занятое панелями место (зоны игры + бар платформы) и отдаёт
// инсеты игре: та сама решает, резервировать ли под них поле.
import { computed, inject, nextTick, onMounted, onScopeDispose, ref, watch } from "vue";
import type { ZoneInsets } from "@/core/ui-zones";
import { dialogKey } from "@/ui/dialog/key";
import { gameUiFor } from "@/ui/games";
import { NotificationBell, NotificationToasts } from "@/ui/notifications";
import { sessionHostKey } from "@/ui/session-host";
import { boardInputKey } from "@/ui/board-input";
import { zonesKey } from "@/ui/ui-zones";
import Zones from "@/ui/ui-zones/Zones.vue";
import PlayersPanel from "./PlayersPanel.vue";
import NetRecovery from "./NetRecovery.vue";

const injected = inject(dialogKey);
if (!injected) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injected;

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedZones = inject(zonesKey);
if (!injectedZones) throw new Error("Слот зон не предоставлен");
const zonesSlot = injectedZones;
const boardInput = inject(boardInputKey, null);

const dialogOpen = computed(() => dialog.screens.value.length > 0);
const gameUi = computed(() => gameUiFor(sessionHost.game.value?.id ?? ""));
const zones = computed(() => zonesSlot.zones.value);

// Партия закончилась/вышли — зоны игры больше не нужны: освобождаем хендл,
// чтобы его состояние и подписки не пережили партию. Смена сессии —
// и повод перемерить место: панель игроков появляется не сразу.
watch(
  () => sessionHost.session.value,
  async (session) => {
    if (!session) zonesSlot.clear();
    await nextTick();
    measure();
  },
);

const rootEl = ref<HTMLElement | null>(null);
let observer: ResizeObserver | null = null;
const observed = new WeakSet<Element>();

/** Наблюдать элемент, если ещё не наблюдается (панели появляются позже). */
function observe(element: Element | null): void {
  if (!element || !observer || observed.has(element)) return;
  observed.add(element);
  observer.observe(element);
}

/** Занятое место: зоны игры и общий бар платформы (меню/игроки). */
function measure(): void {
  const ui = zones.value;
  const root = rootEl.value;
  if (!ui || !root) return;
  const rootRect = root.getBoundingClientRect();
  const rectOf = (selector: string): DOMRect | null =>
    root.querySelector<HTMLElement>(selector)?.getBoundingClientRect() ?? null;

  const top = rectOf(".zones__item--top");
  const bottom = rectOf(".zones__item--bottom");
  const left = rectOf(".zones__item--left");
  const right = rectOf(".zones__item--right");
  const menu = rectOf(".session-host");
  const players = rectOf(".players");
  // Колокольчик — fixed в правом верхнем углу: боковая рейка игры иначе
  // заползает под него (как и под меню). Верхняя панель — во всю ширину,
  // боковые живут между верхней и нижней.
  const bell = rectOf(".layer-game-ui > .bell");

  const bottomOf = (rect: DOMRect | null): number =>
    rect ? Math.max(0, Math.round(rect.bottom - rootRect.top)) : 0;

  const insets: ZoneInsets = {
    top: Math.max(bottomOf(menu), bottomOf(players), bottomOf(top), bottomOf(bell)),
    bottom: bottom ? Math.max(0, Math.round(rootRect.bottom - bottom.top)) : 0,
    left: left ? Math.max(0, Math.round(left.right - rootRect.left)) : 0,
    right: right ? Math.max(0, Math.round(rootRect.right - right.left)) : 0,
  };
  // Игре — в поле зон (читает каждый кадр), UI слота — в реактивный ref:
  // измерение приходит после монтирования игры, подписчики должны узнать.
  zonesSlot.setInsets(insets);
  // Зоны начинаются под системной панелью (зазор — `--space-3`), а не поверх неё.
  // Пусто — панели нет, и сетка зон берёт свой обычный отступ.
  const playersBottom = Math.max(bottomOf(menu), bottomOf(players));
  root.style.setProperty("--zones-top", playersBottom > 0 ? `${playersBottom + 12}px` : "");
  // Следим за появившимися панелями: их размер меняет инсеты.
  for (const selector of [
    ".session-host",
    ".players",
    ".zones__item--top",
    ".zones__item--bottom",
    ".zones__item--left",
    ".zones__item--right",
  ]) {
    observe(root.querySelector(selector));
  }
  // Место изменилось — поле перерисовывается под новые инсеты.
  boardInput?.requestDraw.value?.();
}

onMounted(() => {
  if (rootEl.value && typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => measure());
    observer.observe(rootEl.value);
  }
  measure();
});

onScopeDispose(() => observer?.disconnect());
</script>

<template>
  <section ref="rootEl" class="layer layer-game-ui">
    <PlayersPanel />
    <Zones v-if="zones" :zones="zones" />
    <component :is="gameUi" v-if="gameUi" />
    <slot />
    <NetRecovery />
    <template v-if="!dialogOpen">
      <NotificationBell />
      <NotificationToasts />
    </template>
  </section>
</template>
