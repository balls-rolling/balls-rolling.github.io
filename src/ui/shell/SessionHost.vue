<script setup lang="ts">
// Кнопка меню в углу игрового экрана. Панель участников и колокольчик — отдельные
// элементы слоя (по центру и в правом углу соответственно), поэтому здесь только
// меню: во время партии оно всегда доступно.
import { GameMenu } from "@/ui/game-menu";
</script>

<template>
  <div class="session-host">
    <GameMenu />
  </div>
</template>

<style scoped>
.session-host {
  position: absolute;
  top: var(--shell-pad-top);
  left: var(--shell-pad-left);
}
</style>
