// Код приглашения для ручного обмена: SDP + метаданные, сжатые и упакованные в
// base64url. Чистый модуль: ни DOM-объектов приложения, ни Vue; тестируется в node.
//
// Данные сжимаются нативным deflate (`CompressionStream`), чтобы QR был меньше.
// Формат кода: префикс «z» (сжато) или «u» (без сжатия) + base64url.

/** Ошибка разбора кода приглашения. */
export class BadCodeError extends Error {
  constructor(message = "Плохой код приглашения") {
    super(message);
    this.name = "BadCodeError";
  }
}

/** Роль стороны в рукопожатии. */
export type InviteRole = "host" | "guest";

/** Структурное SDP: ядро не зависит от DOM-типа `RTCSessionDescriptionInit`. */
export interface InviteSdp {
  readonly type: "offer" | "answer";
  readonly sdp: string;
}

/** Приглашение: SDP и метаданные игры. */
export interface Invite {
  readonly v: number;
  readonly game: string;
  readonly role: InviteRole;
  readonly name: string;
  readonly sdp: InviteSdp;
  // Опциональная идентичность/восстановление (версия протокола не поднимается).
  // Отсутствие поля = «не проверяем» (совместимость со старыми клиентами).
  readonly restore?: boolean;
  readonly playerId?: string;
  readonly sessionId?: string;
}

/** Условия разбора: известные игры, версия протокола и ожидаемая роль. */
export interface DecodeInviteOptions {
  readonly games: readonly string[];
  readonly version: number;
  readonly expectedRole: InviteRole;
}

/** Байты → base64url без паддинга. */
export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** base64url (с паддингом или без) → байты. */
export function base64UrlToBytes(code: string): Uint8Array {
  let base64 = code.trim().replace(/\s+/g, "").replaceAll("-", "+").replaceAll("_", "/");
  while (base64.length % 4) base64 += "=";
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.codePointAt(0)!);
}

/** Строка → base64url без паддинга (UTF-8). */
export function encodeBase64Url(text: string): string {
  return bytesToBase64Url(new TextEncoder().encode(text));
}

/** base64url (с паддингом или без) → UTF-8 строка. */
export function decodeBase64Url(code: string): string {
  return new TextDecoder().decode(base64UrlToBytes(code));
}

const canCompress = typeof CompressionStream !== "undefined";

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Собрать код приглашения (со сжатием, если браузер/среда умеет). */
export async function encodeInvite(invite: Invite): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(invite));
  if (canCompress) return `z${bytesToBase64Url(await deflate(bytes))}`;
  return `u${bytesToBase64Url(bytes)}`;
}

/** Разобрать и проверить код приглашения; мусор → `BadCodeError`. */
export async function decodeInvite(code: string, options: DecodeInviteOptions): Promise<Invite> {
  const trimmed = code.trim();
  const prefix = trimmed[0];
  if (prefix !== "z" && prefix !== "u") throw new BadCodeError();

  let jsonBytes: Uint8Array;
  try {
    const bytes = base64UrlToBytes(trimmed.slice(1));
    jsonBytes = prefix === "z" ? await inflate(bytes) : bytes;
  } catch {
    throw new BadCodeError();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(jsonBytes));
  } catch {
    throw new BadCodeError();
  }
  if (typeof raw !== "object" || raw === null) throw new BadCodeError();

  const value = raw as Record<string, unknown>;
  if (value.v !== options.version) throw new BadCodeError();
  if (typeof value.game !== "string" || !options.games.includes(value.game)) {
    throw new BadCodeError();
  }
  if (value.role !== options.expectedRole) throw new BadCodeError();
  if (typeof value.name !== "string" || value.name.trim() === "") throw new BadCodeError();

  // Опциональные поля версии 1: неверный тип — мусор (BadCodeError); пустое
  // значение или отсутствие поля — ключ не добавляем (мягкая проверка).
  const restore = value.restore;
  if (restore !== undefined && typeof restore !== "boolean") throw new BadCodeError();
  const playerId = readOptionalText(value.playerId);
  const sessionId = readOptionalText(value.sessionId);

  const sdp = value.sdp;
  if (typeof sdp !== "object" || sdp === null) throw new BadCodeError();
  const description = sdp as Record<string, unknown>;
  if (description.type !== "offer" && description.type !== "answer") throw new BadCodeError();
  if (typeof description.sdp !== "string" || !description.sdp.startsWith("v=0")) {
    throw new BadCodeError();
  }

  return {
    v: options.version,
    game: value.game,
    role: options.expectedRole,
    name: value.name.slice(0, 40),
    sdp: { type: description.type, sdp: description.sdp },
    ...(restore !== undefined ? { restore } : {}),
    ...(playerId !== undefined ? { playerId } : {}),
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
}

/** Опциональная непустая строка: отсутствие/пусто → `undefined`, не-строка → `BadCodeError`. */
function readOptionalText(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new BadCodeError();
  return value.trim() === "" ? undefined : value;
}
