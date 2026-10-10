import type { FormHandle } from "@/core/form";
import type {
  DialogAnswer,
  DialogRequest,
  GameEnvironment,
  GameEntry,
  LaunchOptions,
  Lobby,
  SessionAccess,
} from "@/core/game";
import type { Game } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { PlayerInit } from "@/core/player";
import type { UiZones } from "@/core/ui-zones";
import type { DialogManager } from "@/ui/dialog/manager";
import { toSessionAccess } from "@/ui/session-access";
import { attachSessionSave } from "@/ui/session-save";
import type { SessionHost } from "@/ui/session-host";
import type { Component } from "vue";
// Окружение игры: единственное место, где сходятся меню, лобби и сессия.

export interface EnvironmentDeps {
  readonly entry: GameEntry;
  readonly game: Game;
  readonly setup: FormHandle;
  /** Зоны интерфейса игры: создаёт composition root, игра получает хендл. */
  readonly ui: UiZones;
  readonly lobby: Lobby;
  readonly sessionHost: SessionHost;
  readonly platform: Platform;
  readonly dialog: DialogManager;
  /** Открыть главный экран (после выхода из партии). */
  readonly onExitToMenu: () => void;
  /**
   * Компонент окна. Передаётся снаружи, а не импортируется здесь: окружение —
   * обычный модуль TypeScript, и `.vue` в его импортах тянет vue-разбор в
   * тесты ядра.
   */
  readonly resultScreen: Component;
}

/** «Ещё раз»: та же партия с тем же составом. */
function restartParty(deps: EnvironmentDeps): void {
  deps.dialog.close();
  deps.sessionHost.session.value?.restart();
}

/**
 * «В меню»: партия закрывается, дальше платформа открывает главный экран.
 * Сам экран здесь не импортируется: `SetupScreen` импортирует это окружение,
 * и статический импорт экрана образовал бы цикл модулей. Переход в меню —
 * навигация платформы, её передаёт вызывающий.
 */
function exitToMenu(deps: EnvironmentDeps): void {
  deps.dialog.close();
  deps.sessionHost.clear();
  deps.onExitToMenu();
}

export function createGameEnvironment(deps: EnvironmentDeps): GameEnvironment {
  return {
    game: {
      id: deps.game.id,
      label: deps.game.label,
      setup: deps.setup,
      ui: deps.ui,
      // Инструмент «окно платформы»: игра задаёт содержимое и кнопки, получает
      // промис с ответом и сама решает, что делать. Окно закрыли иначе, чем
      // кнопкой, — промис отклоняется.
      dialogs: {
        show(request: DialogRequest): Promise<DialogAnswer> {
          return new Promise((resolve, reject) => {
            deps.dialog.show({
              component: deps.resultScreen,
              title: request.title,
              props: {
                message: request.message,
                actions: request.actions,
                onResolve: (value: string) => resolve({ value }),
              },
              onClose: () => reject(new Error("Окно закрыто без ответа")),
            });
          });
        },
        rematch: () => restartParty(deps),
        exitToMenu: () => exitToMenu(deps),
      },
    },
    lobby: deps.lobby,

    async launch(players: readonly PlayerInit[], options?: LaunchOptions): Promise<SessionAccess> {
      // Прошлую сессию уничтожаем до создания новой (план T8, риск 5): иначе
      // старая жила бы параллельно с созданием и могла оставить за собой таймеры.
      deps.sessionHost.clear();

      const session = deps.platform.createSessionFor(deps.game, players, options);

      deps.sessionHost.set(session, deps.game);

      // Подписываемся до старта: первый `running`-снимок от `start()` уже
      // сохранится. Отписку хранить не нужно — `sessionHost.clear()` зовёт
      // `session.destroy()`, а тот снимает подписчиков.
      attachSessionSave({ session, game: deps.game, platform: deps.platform });
      session.start();

      // Запомнить последнюю игру: по ней строится быстрый запуск на главном.
      const settings = await deps.platform.loadGlobalSettings();
      await deps.platform.saveGlobalSettings({ ...settings, lastGameId: deps.entry.id });

      // Меню больше не нужно — игра началась.
      deps.dialog.close();

      return toSessionAccess(session);
    },
  };
}
