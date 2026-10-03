import { markRaw } from "vue";
import type { Lobby, LobbyOptions, LocalPlayersOptions } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { PlayerInit } from "@/core/player";
import type { DialogManager } from "@/ui/dialog/manager";
import LobbyView from "./LobbyView.vue";
import { defaultPlayers } from "./players";

// Локальная реализация лобби: состав собирается на месте, без сети.
// Интерфейс тот же, что будет у сетевого лобби (фаза 10) — меняются только
// тела методов, а не сигнатуры.

export interface LocalLobbyDeps {
  readonly platform: Platform;
  readonly dialog: DialogManager;
}

/** Не реализовано в этой фазе: клиентское лобби требует сети. */
const CLIENT_NOT_READY = "Клиентское лобби появится вместе с сетью (фаза 10)";

export function createLocalLobby(deps: LocalLobbyDeps): Lobby {
  return {
    async defaultPlayers(options?: LocalPlayersOptions): Promise<readonly PlayerInit[]> {
      const settings = await deps.platform.loadGlobalSettings();
      return defaultPlayers({ ...options, name: settings.name });
    },

    async showHost(options?: LobbyOptions): Promise<readonly PlayerInit[] | null> {
      const settings = await deps.platform.loadGlobalSettings();
      return openLobby(deps, settings.name, options);
    },

    showClient(): Promise<readonly PlayerInit[] | null> {
      // Отвергаем осознанно: молча вернуть пустой состав было бы хуже — игра
      // решила бы, что подключилась.
      return Promise.reject(new Error(CLIENT_NOT_READY));
    },
  };
}

/**
 * Открыть экран лобби и дождаться состава. Возврат `null` означает отмену —
 * например, пользователь ушёл назад. Промис завершается ровно один раз.
 */
async function openLobby(
  deps: LocalLobbyDeps,
  name: string,
  options?: LobbyOptions,
): Promise<readonly PlayerInit[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: readonly PlayerInit[] | null): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    deps.dialog.show({
      component: markRaw(LobbyView),
      title: "Лобби",
      props: {
        name,
        options,
        onConfirm: (players: readonly PlayerInit[]) => {
          finish(players);
          deps.dialog.close();
        },
      },
      // Экран сняли (назад или закрытие) — состава не будет.
      handle: { destroy: () => finish(null) },
    });
  });
}
