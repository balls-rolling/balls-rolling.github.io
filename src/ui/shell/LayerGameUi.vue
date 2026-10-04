<script setup lang="ts">
// Слой 2: игровой UI активной игры плюс общие функции платформы (меню, во весь
// экран). Компонент игры берётся из реестра UI по id; если UI нет — слой пуст.
// Колокольчик и тосты — только когда диалог закрыт: при открытом диалоге их
// показывает диалоговый слой, иначе на экране было бы две кнопки одновременно.
import { computed, inject } from "vue";
import { dialogKey } from "@/ui/dialog/key";
import { gameUiFor } from "@/ui/games";
import { NotificationBell, NotificationToasts } from "@/ui/notifications";
import { sessionHostKey } from "@/ui/session-host";

const injected = inject(dialogKey);
if (!injected) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injected;

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const dialogOpen = computed(() => dialog.screens.value.length > 0);
const gameUi = computed(() => gameUiFor(sessionHost.game.value?.id ?? ""));
</script>

<template>
  <section class="layer layer-game-ui">
    <component :is="gameUi" v-if="gameUi" />
    <slot />
    <template v-if="!dialogOpen">
      <NotificationBell />
      <NotificationToasts />
    </template>
  </section>
</template>
