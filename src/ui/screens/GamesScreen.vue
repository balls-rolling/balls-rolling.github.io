<script setup lang="ts">
// Список игр из реестра. Платформа имён игр не знает — она их получает.
import { inject } from "vue";
import type { GameEntry } from "@/core/game";
import { platformKey } from "@/ui/platform";
import { openGame } from "./navigation";

const injected = inject(platformKey);
if (!injected) throw new Error("Платформа не предоставлена");
const platform = injected;

const games: readonly GameEntry[] = platform.listGames();
</script>

<template>
  <ul class="games-screen">
    <li v-for="game in games" :key="game.id">
      <button type="button" @click="openGame(game)">{{ game.label }}</button>
    </li>
  </ul>
  <p v-if="games.length === 0" class="games-screen__empty">Игр пока нет</p>
</template>

<style scoped>
.games-screen {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.games-screen__empty {
  margin: 0;
  opacity: 0.7;
}
</style>
