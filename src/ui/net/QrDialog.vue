<script setup lang="ts">
// Диалог с крупным QR: открывается поверх лобби по кнопке, QR генерируется в этот
// момент. Широкий диалог (ограничен только краями окна), QR по центру максимального
// размера, закрытие — обычная кнопка внизу (не растянутая).
import { inject } from "vue";
import { dialogKey } from "@/ui/dialog/key";
import QrInvite from "./QrInvite.vue";

defineProps<{ value: string; label?: string }>();

const injected = inject(dialogKey);
if (!injected) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injected;
</script>

<template>
  <div class="qr-dialog">
    <p v-if="label" class="text-muted qr-dialog__label">{{ label }}</p>
    <div class="qr-dialog__code">
      <QrInvite :value="value" :size="480" />
    </div>
    <div class="qr-dialog__actions">
      <button class="btn btn--primary" type="button" @click="dialog.back()">
        <span class="btn__label">Закрыть</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.qr-dialog {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

.qr-dialog__label {
  margin: 0;
}

/* QR растягивается по ширине и ограничен высотой, чтобы влезал в окно. */
.qr-dialog__code {
  width: min(100%, 68vmin);
}

.qr-dialog__actions {
  display: flex;
  justify-content: center;
}
</style>
