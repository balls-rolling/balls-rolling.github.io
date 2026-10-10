import type { LobbyPlayer, Transport } from "@/core/net";

// Лобби восстановления сетевой партии (12-b): отдельный сценарий от фазы 11.
// Хост поднимает свежий транспорт с предопределённым составом из снимка и
// раздаёт новую ссылку; гость подключается по ней и ждёт `start`. Результат —
// готовый транспорт и идентификаторы для `NetLink`, а не `PlayerInit[]`: сессия
// уже существует и восстанавливается локально у каждой стороны.
//
// Только типы: ни Vue, ни DOM — контракт можно прогонять в node-тестах.

/** Вход хоста восстановления: снимок состава и своя роль в нём. */
export interface RestoreHostInput {
  readonly gameId: string;
  readonly ownPlayerId: string;
  readonly players: readonly LobbyPlayer[];
}

/** Вход гостя восстановления: свежая ссылка-приглашение хоста. */
export interface RestoreGuestInput {
  readonly gameId: string;
  readonly ownPlayerId: string;
  readonly offer: string;
}

/** Готовый транспорт и идентификаторы для восстановления сетевой партии. */
export interface RestoreLobbyResult {
  readonly transport: Transport;
  readonly ownPlayerId: string;
  readonly remotePlayerId: string;
  readonly ownName: string;
}

/** Отдельное лобби восстановления; `null` — отмена или ошибка. */
export interface RestoreLobby {
  showHostRestore(input: RestoreHostInput): Promise<RestoreLobbyResult | null>;
  showClientRestore(input: RestoreGuestInput): Promise<RestoreLobbyResult | null>;
}
