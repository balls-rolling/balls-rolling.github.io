import type { LobbyOptions } from "@/core/game";
import type { PlayerInit } from "@/core/player";

// Локальный состав игроков. Универсально: никакого «на двоих» — лимит это
// параметр, а роли (человек/компьютер) и способ связи — разные поля игрока.

/** Сколько людей по умолчанию. */
const DEFAULT_HUMANS = 1;

export interface DefaultPlayersInput extends LobbyOptions {
  /** Имя первого игрока — из глобальных настроек платформы. */
  readonly name: string;
  /** Постоянный id главного игрока (UUID); остальные локальные — временные. */
  readonly playerId?: string;
  readonly humans?: number;
  readonly computers?: number;
}

/**
 * Собрать локальный состав. Главный игрок получает имя из настроек и свой
 * постоянный id; остальные локальные игроки (второй человек, компьютеры) —
 * временные id вида `guest_N`. Порядок фиксирован: главный первым.
 */
export function defaultPlayers(input: DefaultPlayersInput): readonly PlayerInit[] {
  const humans = Math.max(1, input.humans ?? DEFAULT_HUMANS);
  const computers = Math.max(0, input.computers ?? 0);
  const limit = Math.max(1, input.maxPlayers ?? humans + computers);

  const total = Math.min(humans + computers, limit);
  const humanCount = Math.min(humans, total);
  const computerCount = total - humanCount;

  let guestIndex = 1;
  const players: PlayerInit[] = [
    {
      id: input.playerId ?? "p1",
      name: input.name,
      agent: "human",
      transport: "local",
    },
  ];
  for (let index = 1; index < humanCount; index++) {
    players.push({
      id: `guest_${guestIndex++}`,
      name: `Гость ${index}`,
      agent: "human",
      transport: "local",
    });
  }
  for (let index = 0; index < computerCount; index++) {
    players.push({
      id: `guest_${guestIndex++}`,
      name: `Компьютер ${index + 1}`,
      agent: "computer",
      transport: "local",
    });
  }

  return players;
}

/** Следующий свободный временный id локального игрока (`guest_N`). */
export function nextGuestId(players: readonly PlayerInit[]): string {
  let index = 1;
  while (players.some((player) => player.id === `guest_${index}`)) index++;
  return `guest_${index}`;
}

/** Следующий свободный id человека (в текущей схеме — временный `guest_N`). */
export function nextHumanId(players: readonly PlayerInit[]): string {
  return nextGuestId(players);
}

/** Следующий свободный id компьютера (в текущей схеме — временный `guest_N`). */
export function nextComputerId(players: readonly PlayerInit[]): string {
  return nextGuestId(players);
}
