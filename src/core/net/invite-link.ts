// Ссылка-приглашение: `?open=net_game&game_id=…&offer=…`. Чистый модуль — не
// читает `location`, база передаётся явно; парсинг через `URLSearchParams`.

/** Параметры приглашения, извлечённые из ссылки. */
export interface InviteLinkParams {
  readonly gameId: string;
  readonly offer: string;
}

/** Имя `open`-обработчика для сетевой игры. */
export const NET_GAME_OPEN = "net_game";

/** Собрать ссылку-приглашение на основе базового адреса. */
export function buildInviteLink(params: InviteLinkParams, base: string): string {
  const url = new URL(base);
  url.searchParams.set("open", NET_GAME_OPEN);
  url.searchParams.set("game_id", params.gameId);
  url.searchParams.set("offer", params.offer);
  return url.toString();
}

/** Извлечь параметры приглашения из ссылки; `null` — если это не приглашение. */
export function parseInviteLink(href: string): InviteLinkParams | null {
  let url: URL;
  try {
    url = new URL(href, "http://localhost");
  } catch {
    return null;
  }
  if (url.searchParams.get("open") !== NET_GAME_OPEN) return null;
  const gameId = url.searchParams.get("game_id");
  const offer = url.searchParams.get("offer");
  if (!gameId || !offer) return null;
  return { gameId, offer };
}

/**
 * Привести ввод пользователя к коду приглашения: если это ссылка-приглашение —
 * взять из неё `offer`, иначе вернуть текст как есть (сам код). Позволяет вставлять
 * в одно поле и ссылку, и код, не заставляя выбирать.
 */
export function inviteOfferFromInput(input: string): string {
  return parseInviteLink(input)?.offer ?? input;
}
