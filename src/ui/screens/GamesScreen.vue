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
  <ul class="group list-reset">
    <li v-for="game in games" :key="game.id">
      <button class="btn btn--secondary" type="button" :title="game.label" @click="openGame(game)">
        <span class="btn__label">{{ game.label }}</span>
      </button>
    </li>
  </ul>
  <p v-if="games.length === 0" class="text-muted">Игр пока нет</p>
</template>
