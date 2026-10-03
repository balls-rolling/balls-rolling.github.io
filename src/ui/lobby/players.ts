import type { LobbyOptions } from "@/core/game";
import type { PlayerInit } from "@/core/player";

// Локальный состав игроков. Универсально: никакого «на двоих» — лимит это
// параметр, а роли (человек/компьютер) и способ связи — разные поля игрока.

/** Сколько людей по умолчанию. */
const DEFAULT_HUMANS = 1;

export interface DefaultPlayersInput extends LobbyOptions {
  /** Имя первого игрока — из глобальных настроек платформы. */
  readonly name: string;
  readonly humans?: number;
  readonly computers?: number;
}

/**
 * Собрать локальный состав. Первый человек получает имя из настроек, остальные —
 * «Гость N», компьютеры — «Компьютер N». Идентификаторы детерминированы: на них
 * будут ссылаться сессия и сетевой протокол.
 */
export function defaultPlayers(input: DefaultPlayersInput): readonly PlayerInit[] {
  const humans = Math.max(1, input.humans ?? DEFAULT_HUMANS);
  const computers = Math.max(0, input.computers ?? 0);
  const limit = Math.max(1, input.maxPlayers ?? humans + computers);

  const total = Math.min(humans + computers, limit);
  const humanCount = Math.min(humans, total);
  const computerCount = total - humanCount;

  const players: PlayerInit[] = [
    { id: "p1", name: input.name, agent: "human", transport: "local" },
  ];
  for (let index = 1; index < humanCount; index++) {
    players.push({
      id: `p${index + 1}`,
      name: `Гость ${index}`,
      agent: "human",
      transport: "local",
    });
  }
  for (let index = 0; index < computerCount; index++) {
    players.push({
      id: `c${index + 1}`,
      name: `Компьютер ${index + 1}`,
      agent: "computer",
      transport: "local",
    });
  }

  return players;
}

/** Следующий свободный идентификатор человека для добавления в лобби. */
export function nextHumanId(players: readonly PlayerInit[]): string {
  let index = 1;
  while (players.some((player) => player.id === `p${index}`)) index++;
  return `p${index}`;
}

/** Следующий свободный идентификатор компьютера. */
export function nextComputerId(players: readonly PlayerInit[]): string {
  let index = 1;
  while (players.some((player) => player.id === `c${index}`)) index++;
  return `c${index}`;
}
