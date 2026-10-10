<script setup lang="ts">
// Диалог обрыва сетевой партии (12-b). Хосту предлагается «Восстановить»,
// гостю — подождать ссылку хоста и «Покинуть игру».
defineProps<{
  role: "host" | "guest";
  onRecover?: () => void;
  onLeave: () => void;
}>();
</script>

<template>
  <div class="group">
    <p v-if="role === 'host'">
      Соперник отключился. Можно попробовать восстановить партию — гость подключится по новой
      ссылке.
    </p>
    <p v-else>
      Соединение с хостом потеряно. Попросите хоста восстановить партию и откройте новую ссылку.
    </p>
    <div class="group group--horizontal">
      <button
        v-if="onRecover"
        class="btn btn--primary"
        type="button"
        title="Восстановить"
        @click="onRecover"
      >
        <span class="btn__label">Восстановить</span>
      </button>
      <button class="btn btn--danger" type="button" title="Покинуть игру" @click="onLeave">
        <span class="btn__label">Покинуть игру</span>
      </button>
    </div>
  </div>
</template>
