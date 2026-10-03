import { listGames as listGameEntries } from "../game";
import type { Game, GameEntry } from "../game";
import type { PlayerInit } from "../player";
import { Session } from "../session";
import type { SessionOptions } from "../session";
import { createStore, type KeyValueStore, type Schema } from "../storage";

// Корень платформы: реестр игр, цепочка `Platform → Game → Session` (D2) и
// глобальные настройки. Конкретных игр не знает — работает только с записями.
//
// Экземпляр, а не модульный синглтон: скрытое глобальное состояние мешало бы
// тестам, а composition root и так создаёт платформу один раз.

/** Глобальные настройки платформы — пока только имя игрока (D6). */
export interface GlobalSettings {
  readonly name: string;
}

const GLOBAL_KEY = "global";
const DEFAULT_NAME = "Игрок";
const NAME_MAX = 20;

const globalSchema: Schema<GlobalSettings> = {
  defaults: { name: DEFAULT_NAME },
  parse(raw) {
    if (raw === null || typeof raw !== "object") return { name: DEFAULT_NAME };
    const value = raw as Partial<GlobalSettings>;
    return {
      name:
        typeof value.name === "string" && value.name ? value.name.slice(0, NAME_MAX) : DEFAULT_NAME,
    };
  },
};

export interface CreateSessionOptions extends SessionOptions {
  /** Задержка хода компьютера. Существует ради тестов и отладки. */
  readonly computerDelayMs?: number;
}

export class Platform {
  readonly #store: KeyValueStore;

  constructor(store?: KeyValueStore) {
    this.#store = store ?? createStore();
  }

  /** Доступные игры. Платформа получает список, но не знает конкретных имён. */
  listGames(): readonly GameEntry[] {
    return listGameEntries();
  }

  loadGlobalSettings(): Promise<GlobalSettings> {
    return this.#store.read(GLOBAL_KEY, globalSchema);
  }

  saveGlobalSettings(settings: GlobalSettings): Promise<void> {
    return this.#store.write(GLOBAL_KEY, settings);
  }

  /** Создать экземпляр игры по записи реестра. Загрузка отложенная. */
  async createGame(entry: GameEntry): Promise<Game> {
    return entry.entry();
  }

  /** Поднять сессию: игра создаётся по записи, сессия — по игрокам. */
  async createSession(
    entry: GameEntry,
    players: readonly PlayerInit[],
    options?: CreateSessionOptions,
  ): Promise<Session> {
    const game = await this.createGame(entry);
    return new Session({ game, players, options });
  }
}

export function createPlatform(store?: KeyValueStore): Platform {
  return new Platform(store);
}
