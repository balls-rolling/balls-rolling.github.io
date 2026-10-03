// Точка монтирования приложения — composition root. Платформа, менеджер
// диалогов и слот сессии создаются здесь и предоставляются компонентам:
// скрытых модульных синглтонов нет.
//
// Палитра устанавливается ДО mount(), иначе первый кадр успевает отрисоваться
// со светлой темой на тёмной системной.
import { createApp } from "vue";
import App from "@/App.vue";
import { createPlatform } from "@/core/platform";
import { watchPalette } from "@/core/theme";
import { dialogKey } from "@/ui/dialog/key";
import { DialogManager } from "@/ui/dialog/manager";
import { platformKey } from "@/ui/platform";
import { registerGameOpener, MainScreen } from "@/ui/screens";
import SetupScreen from "@/ui/screens/SetupScreen.vue";
import { createSessionHost, sessionHostKey } from "@/ui/session-host";
import "@/styles/tokens.css";
import "@/styles/base.css";

watchPalette();

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

// Игра создаётся заранее: экран преднастройки строит её форму синхронно.
registerGameOpener(async (entry) => {
  const game = await platform.createGame(entry);
  dialogManager.show({ component: SetupScreen, title: entry.label, props: { entry, game } });
});

const app = createApp(App);
app.provide(platformKey, platform);
app.provide(dialogKey, dialogManager);
app.provide(sessionHostKey, sessionHost);
app.mount("#app");

// Меню открыто сразу: на этом этапе играть можно только через него.
dialogManager.show({ component: MainScreen, title: "Меню" });
