<script setup lang="ts">
// Слой 1: игровое поле. Канвас Viewport появится в фазе 06; здесь только
// граница слоя — поверхность ввода игры.
</script>

<template>
  <section class="layer layer-board">
    <slot />
  </section>
</template>
