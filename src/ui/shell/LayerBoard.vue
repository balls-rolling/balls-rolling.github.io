<script setup lang="ts">
// Слой 1: игровое поле. Канвас Viewport — фаза 05, здесь только граница слоя,
// чтобы границы трёх слоёв зафиксировались в коде до начала фазы 02.
</script>

<template>
  <section class="layer layer-board">
    <span class="layer-tag">1 · игровое поле</span>
    <slot />
  </section>
</template>
