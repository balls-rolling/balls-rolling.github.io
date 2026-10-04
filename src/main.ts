// Точка монтирования приложения — composition root. Платформа, менеджер
// диалогов и слот сессии создаются здесь и предоставляются компонентам:
// скрытых модульных синглтонов нет.
//
// Палитра устанавливается ДО mount(), иначе первый кадр успевает отрисоваться
// со светлой темой на тёмной системной.
import { createApp } from "vue";
import App from "@/App.vue";
import { createFormController } from "@/core/form";
import { createPlatform } from "@/core/platform";
import { watchPalette } from "@/core/theme";
import { createBoardInput, boardInputKey } from "@/ui/board-input";
import { dialogKey } from "@/ui/dialog/key";
import { DialogManager } from "@/ui/dialog/manager";
import { createNotificationCenter, notificationsKey } from "@/ui/notifications";
import { platformKey } from "@/ui/platform";
import { registerGameOpener, MainScreen } from "@/ui/screens";
import SetupScreen from "@/ui/screens/SetupScreen.vue";
import { createSessionHost, sessionHostKey } from "@/ui/session-host";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/ui/styles/primitives.css";

// Контекстное меню отключено везде, кроме полей ввода: там нужен paste
// (в фазе 10 в поля вставляются коды приглашений). Порт js/app.js:15-18.
document.addEventListener("contextmenu", (event) => {
  if (
    event.target instanceof Element &&
    event.target.closest("input, textarea, [contenteditable]")
  ) {
    return;
  }
  event.preventDefault();
});

const platform = createPlatform();
const dialogManager = new DialogManager();
const sessionHost = createSessionHost();
const notifications = createNotificationCenter();
const boardInput = createBoardInput();

// Режим темы берём из настроек: data-theme уже поставлен inline-скриптом до
// первого кадра, здесь включаем слежение за системой и системный акцент.
void platform.loadGlobalSettings().then((settings) => watchPalette(settings.themeMode));

// Игра и её форма создаются заранее: экран преднастройки рендерит готовую форму,
// а composition root владеет её жизненным циклом и передаёт `destroy` менеджеру.
registerGameOpener(async (entry) => {
  const game = await platform.createGame(entry);
  const setup = createFormController(game.getSetupForm());
  dialogManager.show({
    component: SetupScreen,
    title: entry.label,
    props: { entry, game, setup },
    // Экран сняли — освобождаем форму и отписки игры от её сигналов.
    handle: {
      destroy: () => {
        game.detachEnvironment();
        setup.destroy();
      },
    },
  });
});

const app = createApp(App);
app.provide(platformKey, platform);
app.provide(dialogKey, dialogManager);
app.provide(sessionHostKey, sessionHost);
app.provide(notificationsKey, notifications);
app.provide(boardInputKey, boardInput);
app.mount("#app");

// Меню открыто сразу: на этом этапе играть можно только через него.
dialogManager.show({ component: MainScreen, title: "Меню" });
