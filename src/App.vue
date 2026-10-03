<script setup lang="ts">
// Корневой компонент: оболочка платформы. Порядок слоёв в DOM совпадает с
// их z-индексами (см. ui/shell/layers.css): поле, игровой UI, диалоги.
import LayerBoard from "@/ui/shell/LayerBoard.vue";
import LayerGameUi from "@/ui/shell/LayerGameUi.vue";
import LayerDialogs from "@/ui/shell/LayerDialogs.vue";
import TestGamePanel from "@/ui/shell/TestGamePanel.vue";
import "@/ui/shell/layers.css";
</script>

<template>
  <main class="app-root">
    <LayerBoard />
    <LayerGameUi>
      <TestGamePanel />
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
