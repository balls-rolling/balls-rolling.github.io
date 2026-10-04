<script setup lang="ts">
// Игровое меню: кнопка «Меню» во время партии открывает выпадашку, а не главное
// меню. Пункты объявляет игра (`Game.getGameMenu`), системные — «Настройки» и
// «Сдаться и выйти»/«Выйти». Выход — строго системный диалог, игру лишь
// уведомляют о решении.
import { computed, inject, ref } from "vue";
import { Menu } from "@lucide/vue";
import type { ExitCustomization } from "@/core/game";
import { dialogKey } from "@/ui/dialog/key";
import { iconFor } from "@/ui/icons";
import { MainScreen, SettingsScreen } from "@/ui/screens";
import { sessionHostKey } from "@/ui/session-host";
import ExitDialog from "./ExitDialog.vue";

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

const open = ref(false);

const gameItems = computed(() => sessionHost.game.value?.getGameMenu() ?? []);
const multiplayer = computed(() => (sessionHost.session.value?.snapshot().players.length ?? 0) > 1);

function toggle(): void {
  open.value = !open.value;
}

function activate(id: string): void {
  sessionHost.game.value?.onGameMenuAction(id);
  open.value = false;
}

function openSettings(): void {
  open.value = false;
  dialog.show({ component: SettingsScreen, title: "Настройки", closable: true });
}

function openExitDialog(custom: ExitCustomization & { message: string }): Promise<string> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    dialog.show({
      component: ExitDialog,
      title: "Выход",
      props: {
        message: custom.message,
        titleNote: custom.titleNote,
        extraAction: custom.extraAction,
        onResolve: (value: string) => {
          finish(value);
          dialog.close();
        },
      },
      // Экран сняли (назад или закрытие) — выхода не было.
      handle: { destroy: () => finish("stay") },
    });
  });
}

function requestExit(kind: "surrender" | "exit"): void {
  open.value = false;
  const session = sessionHost.session.value;
  const game = sessionHost.game.value;
  if (!session || !game) return;

  const playerCount = session.snapshot().players.length;
  const custom = game.onExitRequested({ multiplayer: playerCount > 1, playerCount }) ?? {};
  const message =
    custom.message ?? (kind === "surrender" ? "Сдаться и выйти из партии?" : "Выйти из партии?");

  void openExitDialog({ ...custom, message }).then((value) => {
    if (value === "stay") return;
    game.onExitResolved(value);
    sessionHost.clear();
    dialog.show({ component: MainScreen, title: "Меню" });
  });
}
</script>

<template>
  <div class="game-menu">
    <button
      class="btn btn--ghost btn--sm"
      type="button"
      title="Меню"
      :aria-expanded="open"
      @click="toggle"
    >
      <Menu class="icon" aria-hidden="true" />
      <span class="btn__label">Меню</span>
    </button>

    <div v-if="open" class="game-menu__panel surface-card">
      <button
        v-for="item in gameItems"
        :key="item.id"
        class="btn btn--ghost btn--sm game-menu__item"
        type="button"
        :title="item.label"
        @click="activate(item.id)"
      >
        <component
          :is="iconFor(item.icon ?? '')"
          v-if="item.icon"
          class="icon"
          aria-hidden="true"
        />
        <span class="btn__label">{{ item.label }}</span>
      </button>

      <button
        class="btn btn--ghost btn--sm game-menu__item"
        type="button"
        title="Настройки"
        @click="openSettings"
      >
        <span class="btn__label">Настройки</span>
      </button>

      <button
        class="btn btn--ghost btn--sm game-menu__item"
        type="button"
        :title="multiplayer ? 'Сдаться и выйти' : 'Выйти'"
        @click="requestExit(multiplayer ? 'surrender' : 'exit')"
      >
        <span class="btn__label">{{ multiplayer ? "Сдаться и выйти" : "Выйти" }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.game-menu {
  position: relative;
}

.game-menu__panel {
  position: absolute;
  top: calc(100% + var(--space-2));
  left: 0;
  z-index: 11;
  width: min(260px, calc(100vw - 2 * var(--space-4)));
  padding: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.game-menu__item {
  justify-content: flex-start;
}
</style>
