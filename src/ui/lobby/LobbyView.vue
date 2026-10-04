<script setup lang="ts">
// Экран лобби: состав игроков до старта. Это витрина и состав — игровая логика
// начинается позже, в сессии.
import { ref } from "vue";
import type { LobbyOptions } from "@/core/game";
import type { PlayerInit } from "@/core/player";
import { defaultPlayers, nextComputerId, nextHumanId } from "./players";

const props = defineProps<{
  name: string;
  options?: LobbyOptions;
  onConfirm: (players: readonly PlayerInit[]) => void;
}>();

const players = ref<readonly PlayerInit[]>(
  defaultPlayers({
    name: props.name,
    humans: 1,
    computers: 0,
    maxPlayers: props.options?.maxPlayers,
  }),
);

const limit = props.options?.maxPlayers ?? Infinity;
const allowComputer = props.options?.allowComputer ?? true;

function addHuman(): void {
  if (players.value.length >= limit) return;
  const id = nextHumanId(players.value);
  players.value = [
    ...players.value,
    { id, name: `Гость ${players.value.length}`, agent: "human", transport: "local" },
  ];
}

function addComputer(): void {
  if (!allowComputer || players.value.length >= limit) return;
  const id = nextComputerId(players.value);
  players.value = [
    ...players.value,
    { id, name: `Компьютер ${players.value.length}`, agent: "computer", transport: "local" },
  ];
}

function remove(id: string): void {
  // Хотя бы один игрок должен остаться.
  if (players.value.length <= 1) return;
  players.value = players.value.filter((player) => player.id !== id);
}

function confirm(): void {
  props.onConfirm(players.value);
}
</script>

<template>
  <div class="group">
    <ul class="lobby__players list-reset">
      <li v-for="player in players" :key="player.id">
        <span>{{ player.name }}</span>
        <span class="lobby__role text-muted">{{
          player.agent === "computer" ? "компьютер" : "человек"
        }}</span>
        <button
          class="btn btn--ghost btn--sm"
          type="button"
          title="Убрать"
          :disabled="players.length <= 1"
          @click="remove(player.id)"
        >
          <span class="btn__label">Убрать</span>
        </button>
      </li>
    </ul>

    <div class="lobby__actions">
      <button
        class="btn btn--secondary btn--sm"
        type="button"
        title="Добавить человека"
        :disabled="players.length >= limit"
        @click="addHuman"
      >
        <span class="btn__label">Добавить человека</span>
      </button>
      <button
        class="btn btn--secondary btn--sm"
        type="button"
        title="Добавить компьютер"
        :disabled="!allowComputer || players.length >= limit"
        @click="addComputer"
      >
        <span class="btn__label">Добавить компьютер</span>
      </button>
    </div>

    <button class="btn btn--primary" type="button" title="Начать" @click="confirm">
      <span class="btn__label">Начать</span>
    </button>
  </div>
</template>

<style scoped>
.lobby__players {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.lobby__players li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.lobby__role {
  font-size: var(--fs-sm);
}

.lobby__players button {
  margin-left: auto;
}

.lobby__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
</style>
