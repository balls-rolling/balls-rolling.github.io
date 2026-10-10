<script setup lang="ts">
// QR-код значения (ссылка приглашения или ответный код). Генерация — библиотекой
// `qrcode.vue` (SVG, уровень L: ~800–850 байт читается, нативного генератора нет).
import { QrcodeSvg } from "qrcode.vue";

withDefaults(defineProps<{ value: string; size?: number }>(), { size: 220 });
</script>

<template>
  <div v-if="value" class="qr-invite">
    <QrcodeSvg :value="value" :size="size" level="L" :margin="2" />
  </div>
</template>

<style scoped>
.qr-invite {
  display: flex;
  justify-content: center;
  padding: var(--space-2);
  background: #ffffff;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  width: 100%;
}

/* QR растягивается на доступную ширину, сохраняя пропорции. */
.qr-invite :deep(svg) {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
}
</style>
