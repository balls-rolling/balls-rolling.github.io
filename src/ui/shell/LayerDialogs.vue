<script setup lang="ts">
// Слой 3: диалоги и окна, самый верхний. В фазе 03 сюда подключается
// DialogManager; App.vue при этом не меняется.
</script>

<template>
  <section class="layer layer-dialogs">
    <span class="layer-tag">3 · диалоги и окна</span>
    <slot />
  </section>
</template>
