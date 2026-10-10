<script setup lang="ts">
// Главный экран. Главный сценарий — вернуться в игру, поэтому он должен стоить
// одного нажатия: если есть последняя запущенная игра (или игра всего одна),
// она выносится отдельной кнопкой.
import { inject, onMounted, ref } from "vue";
import { Gamepad2, Play, Settings } from "@lucide/vue";
import type { GameEntry } from "@/core/game";
import { dialogKey } from "@/ui/dialog/key";
import { platformKey } from "@/ui/platform";
import GamesScreen from "./GamesScreen.vue";
import SettingsScreen from "./SettingsScreen.vue";
import { openGame } from "./navigation";

const injectedPlatform = inject(platformKey);
if (!injectedPlatform) throw new Error("Платформа не предоставлена");
const platform = injectedPlatform;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

const quickGame = ref<GameEntry | null>(null);
// Есть ли у быстрой игры сохранённая незавершённая партия. Тогда главная кнопка
// продолжает, а рядом появляется запуск новой.
const hasSave = ref(false);

onMounted(async () => {
  const settings = await platform.loadGlobalSettings();
  const games = platform.listGames();
  const last = games.find((game) => game.id === settings.lastGameId);
  quickGame.value = last ?? (games.length === 1 ? games[0] : null);
  hasSave.value = quickGame.value ? await platform.hasSavedSession(quickGame.value.id) : false;
});

function openQuick(): void {
  if (!quickGame.value) return;
  openGame(quickGame.value, hasSave.value ? { resume: true } : undefined);
}

function openNew(): void {
  if (quickGame.value) openGame(quickGame.value);
}

function openGames(): void {
  dialog.show({ component: GamesScreen, title: "Игры" });
}

function openSettings(): void {
  dialog.show({ component: SettingsScreen, title: "Настройки" });
}
</script>

<template>
  <div class="group">
    <button
      v-if="quickGame"
      class="btn btn--primary btn--lg"
      type="button"
      :title="hasSave ? `Продолжить «${quickGame.label}»` : `Играть в «${quickGame.label}»`"
      @click="openQuick"
    >
      <Play class="icon" aria-hidden="true" />
      <span class="btn__label">{{
        hasSave ? `Продолжить «${quickGame.label}»` : `Играть в «${quickGame.label}»`
      }}</span>
    </button>
    <button
      v-if="quickGame && hasSave"
      class="btn btn--secondary"
      type="button"
      :title="`Новая партия «${quickGame.label}»`"
      @click="openNew"
    >
      <span class="btn__label">Новая партия «{{ quickGame.label }}»</span>
    </button>
    <button class="btn btn--secondary" type="button" title="Игры" @click="openGames">
      <Gamepad2 class="icon" aria-hidden="true" />
      <span class="btn__label">Игры</span>
    </button>
    <button class="btn btn--secondary" type="button" title="Настройки" @click="openSettings">
      <Settings class="icon" aria-hidden="true" />
      <span class="btn__label">Настройки</span>
    </button>
  </div>
</template>
