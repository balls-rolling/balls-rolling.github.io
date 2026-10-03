<script setup lang="ts">
// Главный экран. Главный сценарий — вернуться в игру, поэтому он должен стоить
// одного нажатия: если есть последняя запущенная игра (или игра всего одна),
// она выносится отдельной кнопкой.
import { inject, onMounted, ref } from "vue";
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

onMounted(async () => {
  const settings = await platform.loadGlobalSettings();
  const games = platform.listGames();
  const last = games.find((game) => game.id === settings.lastGameId);
  quickGame.value = last ?? (games.length === 1 ? games[0] : null);
});

function openGames(): void {
  dialog.show({ component: GamesScreen, title: "Игры" });
}

function openSettings(): void {
  dialog.show({ component: SettingsScreen, title: "Настройки" });
}
</script>

<template>
  <div class="main-screen">
    <button
      v-if="quickGame"
      class="main-screen__primary"
      type="button"
      @click="openGame(quickGame)"
    >
      Играть в «{{ quickGame.label }}»
    </button>
    <button type="button" @click="openGames">Игры</button>
    <button type="button" @click="openSettings">Настройки</button>
  </div>
</template>

<style scoped>
.main-screen {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.main-screen__primary {
  font-weight: 700;
}
</style>
