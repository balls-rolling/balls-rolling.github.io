<script setup lang="ts">
// Портрет на телефоне: вместо игры — просьба повернуть устройство. Слой полный,
// перехватывает ввод и стоит поверх диалогов (z-индекс — см. `shell/layers.css`).
// Показ — чистым CSS: грубый указатель (телефон/планшет) и книжная ориентация.
// Узкое окно на десктопе под условие не попадает: там `pointer: fine`.
import { iconFor } from "@/ui/icons";
</script>

<template>
  <div class="portrait-hint">
    <component :is="iconFor('phone')" class="portrait-hint__icon icon" aria-hidden="true" />
    <p class="portrait-hint__text">Поверните устройство</p>
  </div>
</template>

<style scoped>
.portrait-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  background: var(--bg);
  color: var(--fg);
  text-align: center;
}
.portrait-hint__icon {
  width: 48px;
  height: 48px;
  opacity: 0.8;
}
.portrait-hint__text {
  margin: 0;
  font-size: var(--fs-md);
}
/* Слой скрыт везде, кроме телефона/планшета в книжной ориентации. */
@media not (pointer: coarse) {
  .portrait-hint {
    display: none;
  }
}
@media (pointer: coarse) and (orientation: landscape) {
  .portrait-hint {
    display: none;
  }
}
</style>
