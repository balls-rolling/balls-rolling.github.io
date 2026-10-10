// Публичный API лобби: состав по умолчанию и сетевое лобби.
import type { Lobby } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { DialogManager } from "@/ui/dialog/manager";
import type { NetLink } from "@/ui/net";
import type { NotificationCenter } from "@/ui/notifications";
import { createNetworkLobby, type NetworkLobbyDeps } from "./net";
import { defaultPlayers as buildPlayers } from "./players";
import { createRestoreLobby } from "./restore-net";
import type { RestoreLobby } from "./restore";

export { defaultPlayers, nextComputerId, nextHumanId } from "./players";
export type { NetworkLobbyDeps } from "./net";
export { HostLobbySession, GuestLobbySession } from "./session";
export type {
  RestoreGuestInput,
  RestoreHostInput,
  RestoreLobby,
  RestoreLobbyResult,
} from "./restore";

export interface LobbyDeps {
  readonly platform: Platform;
  readonly dialog: DialogManager;
  readonly netLink: NetLink;
  readonly notifications: NotificationCenter;
  readonly gameId: string;
}

/** Лобби платформы: локальный состав, сетевое лобби и восстановление партии. */
export function createLobby(deps: LobbyDeps): Lobby & RestoreLobby {
  const network = createNetworkLobby(deps satisfies NetworkLobbyDeps);
  const restore = createRestoreLobby(deps satisfies NetworkLobbyDeps);
  return {
    async defaultPlayers(options) {
      const settings = await deps.platform.loadGlobalSettings();
      return buildPlayers({ ...options, name: settings.name, playerId: settings.playerId });
    },
    showHost: network.showHost,
    showClient: network.showClient,
    showHostRestore: restore.showHostRestore,
    showClientRestore: restore.showClientRestore,
  };
}
