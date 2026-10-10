// Точка монтирования приложения — composition root. Платформа, менеджер
// диалогов и слот сессии создаются здесь и предоставляются компонентам:
// скрытых модульных синглтонов нет.
//
// Палитра устанавливается ДО mount(), иначе первый кадр успевает отрисоваться
// со светлой темой на тёмной системной.
import { createApp } from "vue";
import App from "@/App.vue";
import { createFormController } from "@/core/form";
import { decodeInvite, PROTOCOL_VERSION } from "@/core/net";
import { createPlatform } from "@/core/platform";
import { watchPalette } from "@/core/theme";
import { createBoardInput, boardInputKey } from "@/ui/board-input";
import { dialogKey } from "@/ui/dialog/key";
import { DialogManager } from "@/ui/dialog/manager";
import { createLobby } from "@/ui/lobby";
import { createNotificationCenter, notificationsKey } from "@/ui/notifications";
import { createNetLink, netLinkKey } from "@/ui/net";
import { platformKey } from "@/ui/platform";
import { resumeGame } from "@/ui/resume-game";
import { resumeNetworkGuest } from "@/ui/resume-net-game";
import { registerGameOpener, openGame, MainScreen } from "@/ui/screens";
import { confirmNewGame } from "@/ui/screens/confirm-new-game";
import { parseOpenQuery, registerOpenHandler, runOpen } from "@/ui/screens/open";
import SetupScreen from "@/ui/screens/SetupScreen.vue";
import { createSessionHost, sessionHostKey } from "@/ui/session-host";
import { createZonesSlot, zonesKey } from "@/ui/ui-zones";
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
const zonesSlot = createZonesSlot();
const netLink = createNetLink();

// Режим темы берём из настроек: data-theme уже поставлен inline-скриптом до
// первого кадра, здесь включаем слежение за системой и системный акцент.
void platform.loadGlobalSettings().then((settings) => watchPalette(settings.themeMode));

// Игра и её форма создаются заранее: экран преднастройки рендерит готовую форму,
// а composition root владеет её жизненным циклом и передаёт `destroy` менеджеру.
registerGameOpener(async (entry, options) => {
  // «Продолжить»: сначала восстановление. Если сохранения нет или оно
  // непригодно — падаем в обычный запуск через преднастройку.
  if (options?.resume) {
    // Лобби восстановления нужно и хосту (свежая ссылка), и гостю (сверка);
    // создаём его здесь и передаём в маршрутизатор.
    const lobby = createLobby({
      platform,
      dialog: dialogManager,
      netLink,
      notifications,
      gameId: entry.id,
    });
    const resumed = await resumeGame(entry, {
      platform,
      sessionHost,
      dialog: dialogManager,
      netLink,
      restoreLobby: lobby,
    });
    if (resumed) return;
  } else if (!options?.net) {
    // Новая партия поверх незавершённой: спрашиваем подтверждение (D6).
    // Присоединение по приглашению (`net`) — не новая игра, не предупреждаем.
    const proceed = await confirmNewGame(entry, { platform, dialog: dialogManager });
    if (!proceed) return;
  }

  const game = await platform.createGame(entry);
  const setup = createFormController(game.getSetupForm());
  dialogManager.show({
    component: SetupScreen,
    title: entry.label,
    props: { entry, game, setup, open: options },
    // Экран сняли — освобождаем форму и отписки игры от её сигналов.
    handle: {
      destroy: () => {
        game.detachEnvironment();
        setup.destroy();
      },
    },
  });
});

// Именованный `open`-обработчик: ссылка `?open=net_game&game_id=…&offer=…`.
registerOpenHandler("net_game", async (params) => {
  const gameId = params.get("game_id");
  const offer = params.get("offer");
  if (!gameId || !offer) throw new Error("bad invite");
  const entry = platform.listGames().find((item) => item.id === gameId);
  if (!entry) throw new Error("game not found");

  // Свежая ссылка восстановления несёт `restore: true` — гость подключается
  // заново и получает состояние от хоста (своего снимка у гостя нет).
  try {
    const invite = await decodeInvite(offer, {
      games: [gameId],
      version: PROTOCOL_VERSION,
      expectedRole: "host",
    });
    if (invite.restore) {
      const lobby = createLobby({
        platform,
        dialog: dialogManager,
        netLink,
        notifications,
        gameId: entry.id,
      });
      const ok = await resumeNetworkGuest(entry, offer, {
        platform,
        sessionHost,
        dialog: dialogManager,
        netLink,
        restoreLobby: lobby,
      });
      if (!ok) notifications.notify("error", "Не удалось восстановить партию");
      return;
    }
  } catch {
    // Ошибка декода — прежний путь обычного приглашения (как в фазе 11).
  }

  openGame(entry, { net: { offer } });
});

const app = createApp(App);
app.provide(platformKey, platform);
app.provide(dialogKey, dialogManager);
app.provide(sessionHostKey, sessionHost);
app.provide(notificationsKey, notifications);
app.provide(boardInputKey, boardInput);
app.provide(netLinkKey, netLink);
app.provide(zonesKey, zonesSlot);
app.mount("#app");

// Фоновое демо: живая партия за меню. Перезапускается после окончания.
void startDemo();
async function startDemo(): Promise<void> {
  const session = await platform.createDemoSession();
  if (!session) return;
  // Слот мог быть занят запущенной игрой, пока демо грузилось.
  if (sessionHost.session.value) {
    session.destroy();
    return;
  }
  sessionHost.set(session);
  session.start();
  session.subscribe((snapshot) => {
    if (snapshot.state !== "finished") return;
    window.setTimeout(() => {
      // Демо могли сменить на настоящую игру — тогда не перезапускаем.
      if (sessionHost.session.value === session) session.restart();
    }, 1500);
  });
}

// Меню открыто сразу: на этом этапе играть можно только через него.
dialogManager.show({ component: MainScreen, title: "Меню" });

// Deep-link: разбираем query `?open=…`, выполняем обработчик, затем чистим URL.
// Неизвестный обработчик — просто очистка; ошибка — уведомление и обычная загрузка.
async function consumeOpen(): Promise<void> {
  const search = window.location.search;
  if (!search) return;

  const request = parseOpenQuery(search);
  let failed = false;
  if (request) {
    try {
      await runOpen(request);
    } catch {
      failed = true;
    }
  }

  const clean = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, "", clean);
  if (failed) notifications.notify("error", "Не удалось открыть приглашение");
}

void consumeOpen();
