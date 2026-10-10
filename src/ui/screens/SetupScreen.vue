<script setup lang="ts">
// Преднастройка игры: платформа строит форму из метаданных игры, собирает
// окружение и отдаёт его игре. Кнопки формы и их сигналы — дело игры: она сама
// решает, что делать (запустить игру, открыть лобби).
import { onMounted } from "vue";
import { inject } from "vue";
import type { FormHandle } from "@/core/form";
import type { Game, GameEntry } from "@/core/game";
import { dialogKey } from "@/ui/dialog/key";
import { createGameEnvironment } from "@/ui/environment";
import { FormView, useFieldValue } from "@/ui/form";
import { createLobby } from "@/ui/lobby";
import { netLinkKey } from "@/ui/net";
import { notificationsKey } from "@/ui/notifications";
import { platformKey } from "@/ui/platform";
import type { GameOpenOptions } from "@/ui/screens/navigation";
import MainScreen from "@/ui/screens/MainScreen.vue";
import DialogScreen from "@/ui/shell/DialogScreen.vue";
import { sessionHostKey } from "@/ui/session-host";
import { zonesKey } from "@/ui/ui-zones";
import { createUiZones } from "@/core/ui-zones";

const props = defineProps<{
  entry: GameEntry;
  game: Game;
  setup: FormHandle;
  /** Deep-link: сразу подключиться к сетевой партии. */
  open?: GameOpenOptions;
}>();

const injectedPlatform = inject(platformKey);
if (!injectedPlatform) throw new Error("Платформа не предоставлена");
const platform = injectedPlatform;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedZones = inject(zonesKey);
if (!injectedZones) throw new Error("Слот зон не предоставлен");
const zonesSlot = injectedZones;

const injectedNet = inject(netLinkKey);
if (!injectedNet) throw new Error("Сетевой мост не предоставлен");
const netLink = injectedNet;

const injectedNotifications = inject(notificationsKey);
if (!injectedNotifications) throw new Error("Центр уведомлений не предоставлен");
const notifications = injectedNotifications;

// Форму создаёт composition root и владеет её жизненным циклом: он передаёт
// `handle.destroy` в менеджер диалогов. Здесь только реактивный мост к шаблону.
const { valueOf, setValue } = useFieldValue(props.setup);

onMounted(() => {
  const lobby = createLobby({ platform, dialog, netLink, notifications, gameId: props.game.id });
  // Зоны интерфейса игры: создаёт composition root, хендл уходит и игре
  // (через окружение), и оболочке (через слот) — состояние одно.
  const ui = createUiZones(props.game.getUiLayout());
  zonesSlot.set(ui);
  const environment = createGameEnvironment({
    entry: props.entry,
    game: props.game,
    setup: props.setup,
    ui,
    lobby,
    sessionHost,
    platform,
    dialog,
    onExitToMenu: () => {
      dialog.show({ component: MainScreen, title: "Меню" });
    },
    resultScreen: DialogScreen,
  });
  // Игра подписывается на сигналы своей формы и получает окружение.
  props.game.attachEnvironment(environment);

  // Deep-link: приглашение пришло ссылкой — сразу подключаемся к сетевой партии.
  const offer = props.open?.net?.offer;
  if (offer) {
    void (async () => {
      const players = await lobby.showClient({ offer });
      if (players) await environment.launch(players);
    })();
  }
});
</script>

<template>
  <div class="group">
    <FormView
      :nodes="game.getSetupForm().nodes"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="setup.emit"
    />
  </div>
</template>
