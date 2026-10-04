<script setup lang="ts">
// Слой 1: игровое поле. Переиспользуемый canvas-Viewport (камера, панорама,
// зум, dpr, отсечение, HUD) и слот для содержимого поверх него.
import { Viewport } from "@/ui/viewport";
</script>

<template>
  <section class="layer layer-board">
    <Viewport />
    <slot />
  </section>
</template>
