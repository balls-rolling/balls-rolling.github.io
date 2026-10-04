import type { FormHandle } from "@/core/form";
import type { GameEnvironment, GameEntry, LaunchOptions, Lobby, SessionAccess } from "@/core/game";
import type { Game } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { PlayerInit } from "@/core/player";
import type { DialogManager } from "@/ui/dialog/manager";
import { toSessionAccess } from "@/ui/session-access";
import type { SessionHost } from "@/ui/session-host";

// Окружение игры: единственное место, где сходятся меню, лобби и сессия.

export interface EnvironmentDeps {
  readonly entry: GameEntry;
  readonly game: Game;
  readonly setup: FormHandle;
  readonly lobby: Lobby;
  readonly sessionHost: SessionHost;
  readonly platform: Platform;
  readonly dialog: DialogManager;
}

export function createGameEnvironment(deps: EnvironmentDeps): GameEnvironment {
  return {
    game: {
      id: deps.game.id,
      label: deps.game.label,
      setup: deps.setup,
    },
    lobby: deps.lobby,

    async launch(players: readonly PlayerInit[], options?: LaunchOptions): Promise<SessionAccess> {
      // Прошлую сессию уничтожаем до создания новой (план T8, риск 5): иначе
      // старая жила бы параллельно с созданием и могла оставить за собой таймеры.
      deps.sessionHost.clear();

      const session = deps.platform.createSessionFor(deps.game, players, options);

      deps.sessionHost.set(session, deps.game);
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
