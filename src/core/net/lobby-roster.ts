import type { LobbyPlayer } from "./lobby-protocol";

// Состав лобби ведёт хост — единственный источник истины (D1). Гость получает
// копию через сообщения `players`/`start`. Порядок фиксирован: хост первым, далее
// по подключению, чтобы очередь хода совпадала у всех сторон.
//
// Идентичность: у главного игрока устройства — постоянный id (UUID), у сетевых
// игроков — их постоянные id (присылают в `join`), у прочих локальных — временные.
// Лобби восстановления (12-b) задаёт предопределённый состав (`preset`): состав и
// порядок фиксированы снимком, а `admit` отмечает, кто из ожидаемых подключился.

const MAX_NAME = 40;

export class LobbyRoster {
  readonly #players: LobbyPlayer[] = [];
  #next = 2;
  readonly #preset: readonly LobbyPlayer[] | null = null;
  readonly #hostId: string;
  /** Допущенные участники preset-режима (хост считается присутствующим). */
  readonly #admitted = new Set<string>();

  constructor(hostName: string, preset?: readonly LobbyPlayer[], hostId?: string) {
    if (preset) {
      this.#preset = preset;
      for (const player of preset) this.#players.push({ ...player });
      this.#hostId = preset[0]?.id ?? "p1";
      // Хост уже в партии: для `isComplete` он «допущен» с самого начала.
      this.#admitted.add(this.#hostId);
    } else {
      this.#hostId = hostId ?? "p1";
      this.#players.push({ id: this.#hostId, name: hostName.slice(0, MAX_NAME) });
    }
  }

  /** Задан ли предопределённый состав (лобби восстановления). */
  get isPreset(): boolean {
    return this.#preset !== null;
  }

  /** Копия предопределённого состава или `null` в обычном режиме. */
  get preset(): readonly LobbyPlayer[] | null {
    return this.#preset ? this.#preset.map((player) => ({ ...player })) : null;
  }

  /**
   * Добавить игрока, вернуть выданный id. Сетевой игрок присылает свой постоянный
   * id (`playerId`), тогда используем его; иначе выдаём временный `p2`, `p3`, …
   * В preset-режиме новых игроков не создаёт.
   */
  add(name: string, playerId?: string): string | null {
    if (this.#preset) return null;
    const id = playerId && !this.has(playerId) ? playerId : `p${this.#next}`;
    if (id === `p${this.#next}`) this.#next += 1;
    this.#players.push({ id, name: name.slice(0, MAX_NAME) });
    return id;
  }

  /**
   * Допустить ожидаемого участника по постоянному id игрока (только preset-режим).
   * Возвращает id занятого слота или `null`, если такого игрока нет среди
   * восстанавливаемых / он уже допущен / это хост.
   */
  admit(id: string): boolean {
    if (!this.#preset) return false;
    if (id === this.#preset[0]?.id) return false;
    if (!this.#preset.some((player) => player.id === id)) return false;
    if (this.#admitted.has(id)) return false;
    this.#admitted.add(id);
    return true;
  }

  /** Снять признак участия, не удаляя игрока из состава. Хоста не трогать. */
  disconnect(id: string): boolean {
    if (id === this.#hostId) return false;
    return this.#admitted.delete(id);
  }

  /** Все элементы preset допущены (в обычном режиме — всегда `false`). */
  isComplete(): boolean {
    if (!this.#preset) return false;
    return this.#preset.every((player) => this.#admitted.has(player.id));
  }

  /**
   * Убрать игрока. Хоста убрать нельзя.
   * В preset-режиме состав не меняется: снимается только признак участия.
   */
  remove(id: string): boolean {
    if (id === this.#hostId) return false;
    if (this.#preset) return this.#admitted.delete(id);
    const index = this.#players.findIndex((player) => player.id === id);
    if (index < 0) return false;
    this.#players.splice(index, 1);
    return true;
  }

  has(id: string): boolean {
    return this.#players.some((player) => player.id === id);
  }

  /** Копия состава: хост первым, далее по порядку подключения. */
  list(): readonly LobbyPlayer[] {
    return this.#players.map((player) => ({ ...player }));
  }
}
