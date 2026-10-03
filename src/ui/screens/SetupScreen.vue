<script setup lang="ts">
// Преднастройка игры: платформа строит форму из метаданных игры, собирает
// окружение и отдаёт его игре. Кнопки формы и их сигналы — дело игры: она сама
// решает, что делать (запустить игру, открыть лобби).
import { onMounted } from "vue";
import { inject } from "vue";
import { createFormController } from "@/core/form";
import type { Game, GameEntry } from "@/core/game";
import { dialogKey } from "@/ui/dialog/key";
import { createGameEnvironment } from "@/ui/environment";
import { FormView, useFieldValue } from "@/ui/form";
import { createLocalLobby } from "@/ui/lobby";
import { platformKey } from "@/ui/platform";
import { sessionHostKey } from "@/ui/session-host";

const props = defineProps<{ entry: GameEntry; game: Game }>();

const injectedPlatform = inject(platformKey);
if (!injectedPlatform) throw new Error("Платформа не предоставлена");
const platform = injectedPlatform;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

// Игра уже создана тем, кто открыл экран, поэтому форма строится синхронно.
const setup = createFormController(props.game.getSetupForm());
const { valueOf, setValue } = useFieldValue(setup);

onMounted(() => {
  const lobby = createLocalLobby({ platform, dialog });
  const environment = createGameEnvironment({
    entry: props.entry,
    game: props.game,
    setup,
    lobby,
    sessionHost,
    platform,
    dialog,
  });
  // Игра подписывается на сигналы своей формы и получает окружение.
  props.game.attachEnvironment(environment);
});
</script>

<template>
  <div class="setup-screen">
    <FormView
      :nodes="game.getSetupForm().nodes"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="setup.emit"
    />
  </div>
</template>

<style scoped>
.setup-screen {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
