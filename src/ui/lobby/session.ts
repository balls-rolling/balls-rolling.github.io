import type { Transport, TransportState } from "@/core/net";
import { LobbyRoster, applyLobbyMessage } from "@/core/net";
import type { LobbyPlayer } from "@/core/net";

// Оркестраторы лобби без UI и DOM: держат транспорт и лобби-протокол, отдают
// состояние наружу колбэками. Сессия живёт до `start`; далее транспорт переходит
// в игровой мост (`NetLink`). Тестируются на парных транспортах.

export interface HostLobbyCallbacks {
  readonly players: (players: readonly LobbyPlayer[]) => void;
  readonly rematchOffer: () => void;
  readonly rematchAccept: () => void;
  readonly rematchDecline: () => void;
}

export interface GuestLobbyCallbacks {
  readonly players: (players: readonly LobbyPlayer[]) => void;
  readonly start: (players: readonly LobbyPlayer[]) => void;
  readonly kicked: () => void;
  readonly rematchOffer: () => void;
  readonly rematchAccept: () => void;
  readonly rematchDecline: () => void;
}

/** Варианты хоста: предопределённый состав и постоянный id хоста (12-b). */
export interface HostLobbyOptions {
  readonly preset?: readonly LobbyPlayer[];
  /** Постоянный id игрока (UUID) — свой у хоста, если состав не предопределён. */
  readonly hostId?: string;
}

/** Хост: ведёт состав и рассылает его; выгон и старт — его команды. */
export class HostLobbySession {
  readonly roster: LobbyRoster;
  readonly #transport: Transport;
  readonly #callbacks: HostLobbyCallbacks;
  #offMessage: () => void;
  #offState: () => void;

  constructor(
    name: string,
    transport: Transport,
    callbacks: HostLobbyCallbacks,
    options?: HostLobbyOptions,
  ) {
    this.#transport = transport;
    this.#callbacks = callbacks;
    this.roster = new LobbyRoster(name, options?.preset, options?.hostId);

    this.#offMessage = transport.onMessage((message) => {
      applyLobbyMessage(message, {
        join: (guestName, id) => {
          // В режиме восстановления состав задан снимком: допускаем подключающегося
          // по его постоянному id; чужого — молча игнорируем.
          if (this.roster.isPreset) {
            if (id === undefined || !this.roster.admit(id)) return;
            this.#broadcast();
            return;
          }
          this.roster.add(guestName, id);
          this.#broadcast();
        },
        leave: (id) => {
          if (this.roster.remove(id)) this.#broadcast();
        },
        players: () => {},
        kick: () => {},
        start: () => {},
        rematchOffer: callbacks.rematchOffer,
        rematchAccept: callbacks.rematchAccept,
        rematchDecline: callbacks.rematchDecline,
      });
    });
    // Обрыв канала считаем выходом удалённого игрока (устойчивость — фаза 12).
    this.#offState = transport.onState((state: TransportState) => {
      if (state !== "closed" && state !== "failed") return;
      const hostId = this.roster.list()[0]?.id;
      if (this.roster.isPreset) {
        // Партия сохраняется: состав из снимка не трогаем, снимаем лишь участие.
        for (const player of this.roster.list()) {
          if (player.id !== hostId) this.roster.disconnect(player.id);
        }
      } else {
        for (const player of this.roster.list()) {
          if (player.id !== hostId) this.roster.remove(player.id);
        }
      }
      this.#broadcast();
    });
  }

  get players(): readonly LobbyPlayer[] {
    return this.roster.list();
  }

  /** Готов ли старт: в preset-режиме — все допущены, иначе — минимум два игрока. */
  get canStart(): boolean {
    return this.roster.isPreset ? this.roster.isComplete() : this.roster.list().length >= 2;
  }

  kick(id: string): void {
    if (!this.roster.remove(id)) return;
    this.#broadcast();
    this.#transport.send({ t: "kick", id });
  }

  start(): void {
    this.#broadcast();
    this.#transport.send({ t: "start", players: this.roster.list() });
  }

  dispose(): void {
    this.#offMessage();
    this.#offState();
  }

  #broadcast(): void {
    this.#transport.send({ t: "players", players: this.roster.list() });
    this.#callbacks.players(this.roster.list());
  }
}

/** Варианты гостя: свой id для сверки в лобби восстановления (12-b). */
export interface GuestLobbyOptions {
  readonly playerId?: string;
}

/** Гость: сообщает о себе, отображает состав, ждёт `start`. */
export class GuestLobbySession {
  readonly #name: string;
  readonly #playerId: string | undefined;
  readonly #transport: Transport;
  #offMessage: () => void;

  constructor(
    name: string,
    transport: Transport,
    callbacks: GuestLobbyCallbacks,
    options?: GuestLobbyOptions,
  ) {
    this.#name = name;
    this.#playerId = options?.playerId;
    this.#transport = transport;

    this.#offMessage = transport.onMessage((message) => {
      applyLobbyMessage(message, {
        players: callbacks.players,
        start: callbacks.start,
        kick: () => callbacks.kicked(),
        rematchOffer: callbacks.rematchOffer,
        rematchAccept: callbacks.rematchAccept,
        rematchDecline: callbacks.rematchDecline,
        join: () => {},
        leave: () => {},
      });
    });
  }

  join(): void {
    if (this.#playerId !== undefined) {
      this.#transport.send({ t: "join", name: this.#name, id: this.#playerId });
    } else {
      this.#transport.send({ t: "join", name: this.#name });
    }
  }

  leave(): void {
    this.#transport.close();
  }

  dispose(): void {
    this.#offMessage();
  }
}
