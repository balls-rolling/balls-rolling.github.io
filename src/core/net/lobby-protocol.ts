// Протокол лобби поверх транспорта: чистая диспетчеризация, без сети и DOM.
// Отделён от игрового протокола (`protocol.ts`): пространства сообщений `t` не
// пересекаются, поэтому смешивать их не нужно.

/** Игрок в составе лобби. `id` — постоянный id игрока (UUID), в т.ч. у гостя. */
export interface LobbyPlayer {
  readonly id: string;
  readonly name: string;
}

/** Сообщения лобби. */
export type LobbyMessage =
  | { readonly t: "join"; readonly name: string; readonly id?: string }
  | { readonly t: "players"; readonly players: readonly LobbyPlayer[] }
  | { readonly t: "kick"; readonly id: string }
  | { readonly t: "start"; readonly players: readonly LobbyPlayer[] }
  | { readonly t: "leave"; readonly id: string }
  | { readonly t: "rematch-offer" }
  | { readonly t: "rematch-accept" }
  | { readonly t: "rematch-decline" };

/** Действия, которые протокол лобби вызывает у принимающей стороны. */
export interface LobbyApi {
  join(name: string, id?: string): void;
  players(players: readonly LobbyPlayer[]): void;
  kick(id: string): void;
  start(players: readonly LobbyPlayer[]): void;
  leave(id: string): void;
  rematchOffer(): void;
  rematchAccept(): void;
  rematchDecline(): void;
}

const MAX_NAME = 40;

/** Необязательная непустая строка: отсутствие/пусто → `undefined`, не-строка → мусор. */
function optionalText(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  return value.trim() === "" ? undefined : value;
}

function isPlayer(value: unknown): value is LobbyPlayer {
  if (typeof value !== "object" || value === null) return false;
  const player = value as Record<string, unknown>;
  return typeof player.id === "string" && typeof player.name === "string";
}

function readPlayers(value: unknown): readonly LobbyPlayer[] | null {
  if (!Array.isArray(value)) return null;
  const players: LobbyPlayer[] = [];
  for (const item of value) {
    if (!isPlayer(item)) return null;
    players.push({ id: item.id.slice(0, MAX_NAME), name: item.name.slice(0, MAX_NAME) });
  }
  return players;
}

/** Разобрать и применить сообщение лобби. `false` — мусор (молча). */
export function applyLobbyMessage(message: unknown, api: LobbyApi): boolean {
  if (typeof message !== "object" || message === null) return false;
  const msg = message as Record<string, unknown>;
  if (typeof msg.t !== "string") return false;

  switch (msg.t) {
    case "join": {
      if (typeof msg.name !== "string") return false;
      const id = optionalText(msg.id);
      if (id === null) return false;
      api.join(msg.name.slice(0, MAX_NAME), id?.slice(0, MAX_NAME));
      return true;
    }
    case "players": {
      const players = readPlayers(msg.players);
      if (!players) return false;
      api.players(players);
      return true;
    }
    case "start": {
      const players = readPlayers(msg.players);
      if (!players) return false;
      api.start(players);
      return true;
    }
    case "kick":
      if (typeof msg.id !== "string") return false;
      api.kick(msg.id.slice(0, MAX_NAME));
      return true;
    case "leave":
      if (typeof msg.id !== "string") return false;
      api.leave(msg.id.slice(0, MAX_NAME));
      return true;
    case "rematch-offer":
      api.rematchOffer();
      return true;
    case "rematch-accept":
      api.rematchAccept();
      return true;
    case "rematch-decline":
      api.rematchDecline();
      return true;
    default:
      return false;
  }
}
