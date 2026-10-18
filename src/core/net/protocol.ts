// Протокол сообщений поверх канала: чистая диспетчеризация, без сети и DOM.
// Версия протокола используется и в сообщениях, и в метаданных приглашения.
import type { Move } from "../game";

/** Версия протокола. Несовпадение — несовместимые клиенты. */
export const PROTOCOL_VERSION = 2;

/**
 * Метаданные удара: `seq` — счётчик применённых ударов отправителя, `hash` —
 * отпечаток состояния после удара. Состав `m` протокол не разбирает — его
 * понимает только игра (обобщение `move {x,y}`, §8 требований).
 */
export interface MoveMeta {
  readonly seq?: number;
  readonly hash?: number;
}

/** Сообщения уровня партии. Лобби/реванш живут отдельно, в `lobby-protocol`. */
export type NetMessage =
  | { readonly t: "hello"; readonly name: string; readonly playerId?: string }
  | { readonly t: "move"; readonly m: Move; readonly seq?: number; readonly hash?: number }
  // 02-e, аддитивно: живой кадр подготовки соперника (непрозрачный `p`) и сигнал
  // старта удара (payload игры + `seq` будущего хода). Старый клиент их не знает
  // и молча игнорирует — `PROTOCOL_VERSION` не поднимаем.
  | { readonly t: "prep"; readonly p: unknown }
  | { readonly t: "shot"; readonly m: Move; readonly seq?: number }
  | { readonly t: "surrender" }
  | { readonly t: "sync"; readonly save: unknown; readonly settings?: unknown }
  | { readonly t: "resync" }
  | { readonly t: "bye" };

/** Действия, которые протокол вызывает у принимающей стороны. */
export interface NetApi {
  setPeerName(name: string, playerId?: string): void;
  /** Входящий ход: непрозрачный payload игры плюс необязательные метаданные. */
  remoteMove(move: Move, meta: MoveMeta): void;
  /** Живой кадр подготовки соперника (02-e): состав протокол не разбирает. */
  remotePrep(prep: unknown): void;
  /** Сигнал старта удара (02-e): payload игры и `seq` будущего хода. */
  remoteShot(move: Move, seq?: number): void;
  remoteSurrender(): void;
  /** Хост прислал снимок партии (12-b, D14); `settings` — настройки партии. */
  applyRemoteState(save: unknown, settings?: unknown): void;
  /** Партнёр просит снимок: расхождение хеша (02-d, ресинк). */
  requestResync(): void;
  peerLeft(): void;
}

/** Неотрицательное целое или `undefined`; `null` — поле битое. */
function parseMetaNumber(value: unknown): number | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
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
    case "move": {
      const m = msg.m;
      if (typeof m !== "object" || m === null || Array.isArray(m)) return false;
      const seq = parseMetaNumber(msg.seq);
      const hash = parseMetaNumber(msg.hash);
      if (seq === null || hash === null) return false;
      api.remoteMove(m as Move, {
        ...(seq !== undefined ? { seq } : {}),
        ...(hash !== undefined ? { hash } : {}),
      });
      return true;
    }
    case "surrender":
      api.remoteSurrender();
      return true;
    case "prep": {
      const p = msg.p;
      if (typeof p !== "object" || p === null || Array.isArray(p)) return false;
      api.remotePrep(p);
      return true;
    }
    case "shot": {
      const m = msg.m;
      if (typeof m !== "object" || m === null || Array.isArray(m)) return false;
      const seq = parseMetaNumber(msg.seq);
      if (seq === null) return false;
      api.remoteShot(m as Move, seq);
      return true;
    }
    case "sync":
      api.applyRemoteState(msg.save, msg.settings);
      return true;
    case "resync":
      api.requestResync();
      return true;
    case "bye":
      api.peerLeft();
      return true;
    default:
      return false;
  }
}
