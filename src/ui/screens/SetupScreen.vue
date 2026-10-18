<script setup lang="ts">
// Преднастройка игры: платформа строит форму из метаданных игры, собирает
// окружение и отдаёт его игре. Кнопки формы и их сигналы — дело игры: она сама
// решает, что делать (запустить игру, открыть лобби).
import { onMounted } from "vue";
import { computed, inject, onScopeDispose, ref, watch } from "vue";
import { collectControls, type Control, type FormHandle } from "@/core/form";
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

/**
 * История экранов преднастройки. Кнопка может не запускать игру, а открыть
 * другое меню (`Control.navigate: push`) или вернуться (`pop`). Схему экрана
 * спрашиваем у игры; состояние значений остаётся в общем хендле, поэтому
 * значения, заданные на одном экране, видны на следующем.
 */
const screens = ref<string[]>([]);
const currentScreen = computed(() => screens.value[screens.value.length - 1]);
const schema = computed(() => props.game.getSetupForm(currentScreen.value));
const unregisterBack = dialog.registerBackHandler(() => {
  if (screens.value.length === 0) return false;
  screens.value = screens.value.slice(0, -1);
  return true;
});
onScopeDispose(unregisterBack);

/** Значения по умолчанию новых контролов: хендл создан под корневую схему. */
watch(
  schema,
  (next) => {
    for (const control of collectControls(next.nodes)) {
      if (props.setup.getValue(control.id) === undefined) {
        props.setup.setValue(control.id, control.value);
      }
    }
  },
  { immediate: true },
);

function controlOf(id: string, list: ReturnType<typeof collectControls>): Control | undefined {
  return list.find((c) => c.id === id);
}

/** Сигнал контрола: сначала навигация экрана, затем обычная доставка игре. */
function emit(id: string, signal: string, payload?: unknown): void {
  const control = controlOf(id, collectControls(schema.value.nodes));
  const nav = control?.navigate;
  if (nav && signal === "press") {
    if (nav.type === "push") screens.value = [...screens.value, nav.screen];
    else screens.value = screens.value.slice(0, -1);
  }
  props.setup.emit(id, signal, payload);
}


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
      :nodes="schema.nodes"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="emit"
    />
  </div>
</template>
