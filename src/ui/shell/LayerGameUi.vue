<script setup lang="ts">
// Слой 2: игровой UI игры плюс общие функции платформы (меню, во весь экран).
// Колокольчик и тосты — только когда диалог закрыт: при открытом диалоге их
// показывает диалоговый слой, иначе на экране было бы две кнопки одновременно.
import { computed, inject } from "vue";
import { dialogKey } from "@/ui/dialog/key";
import { NotificationBell, NotificationToasts } from "@/ui/notifications";

const injected = inject(dialogKey);
if (!injected) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injected;

const dialogOpen = computed(() => dialog.screens.value.length > 0);
</script>

<template>
  <section class="layer layer-game-ui">
    <slot />
    <template v-if="!dialogOpen">
      <NotificationBell />
      <NotificationToasts />
    </template>
  </section>
</template>
