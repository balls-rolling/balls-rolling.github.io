<script setup lang="ts">
// Корневой компонент: оболочка платформы. Порядок слоёв в DOM совпадает с
// их z-индексами (см. ui/shell/layers.css): поле, игровой UI, диалоги.
//
// В демо слой игрового UI не монтируется: на поле не должно быть ни баннера, ни
// кнопки меню. Слой диалогов остаётся всегда — в нём показывается главное меню
// поверх демо.
import { computed, inject } from "vue";
import LayerBoard from "@/ui/shell/LayerBoard.vue";
import LayerGameUi from "@/ui/shell/LayerGameUi.vue";
import LayerDialogs from "@/ui/shell/LayerDialogs.vue";
import SessionHost from "@/ui/shell/SessionHost.vue";
import { sessionHostKey } from "@/ui/session-host";
import "@/ui/shell/layers.css";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const isDemo = computed(() => sessionHost.session.value?.isDemo ?? false);
</script>

<template>
  <main class="app-root">
    <LayerBoard />
    <LayerGameUi v-if="!isDemo">
      <SessionHost />
    </LayerGameUi>
    <LayerDialogs />
  </main>
</template>

<style scoped>
.app-root {
  position: relative;
  width: 100%;
  height: 100%;
}
</style>
