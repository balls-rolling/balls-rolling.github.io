// Протокол сообщений поверх канала: чистая диспетчеризация, без сети и DOM.
// Версия протокола используется и в сообщениях, и в метаданных приглашения.

/** Версия протокола. Несовпадение — несовместимые клиенты. */
export const PROTOCOL_VERSION = 1;

/** Сообщения уровня партии. Лобби/реванш живут отдельно, в `lobby-protocol`. */
export type NetMessage =
  | { readonly t: "hello"; readonly name: string; readonly playerId?: string }
  | { readonly t: "move"; readonly x: number; readonly y: number }
  | { readonly t: "surrender" }
  | { readonly t: "sync"; readonly save: unknown }
  | { readonly t: "bye" };

/** Действия, которые протокол вызывает у принимающей стороны. */
export interface NetApi {
  setPeerName(name: string, playerId?: string): void;
  remoteMove(x: number, y: number): void;
  remoteSurrender(): void;
  /** Хост прислал снимок партии при переподключении (12-b, D14). */
  applyRemoteState(save: unknown): void;
  peerLeft(): void;
}

/** Разобрать и применить сообщение. Возвращает `false` на мусор (молча). */
export function applyNetMessage(message: unknown, api: NetApi): boolean {
  if (typeof message !== "object" || message === null) return false;
  const msg = message as Record<string, unknown>;
  if (typeof msg.t !== "string") return false;

  switch (msg.t) {
    case "hello": {
      if (typeof msg.name !== "string") return false;
      if (msg.playerId !== undefined && typeof msg.playerId !== "string") return false;
      const playerId = typeof msg.playerId === "string" ? msg.playerId.slice(0, 40) : undefined;
      api.setPeerName(msg.name.slice(0, 40), playerId);
      return true;
    }
    case "move":
      if (typeof msg.x !== "number" || typeof msg.y !== "number") return false;
      if (!Number.isInteger(msg.x) || !Number.isInteger(msg.y)) return false;
      api.remoteMove(msg.x, msg.y);
      return true;
    case "surrender":
      api.remoteSurrender();
      return true;
    case "sync":
      api.applyRemoteState(msg.save);
      return true;
    case "bye":
      api.peerLeft();
      return true;
    default:
      return false;
  }
}
