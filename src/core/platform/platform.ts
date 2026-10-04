import { listGames as listGameEntries } from "../game";
import type { Game, GameEntry } from "../game";
import type { FormSchema } from "../form";
import type { PlayerInit } from "../player";
import { Session } from "../session";
import type { SessionOptions } from "../session";
import { createStore, type KeyValueStore, type Schema } from "../storage";
import type { ThemeMode } from "../theme";

// Корень платформы: реестр игр, цепочка `Platform → Game → Session` (D2) и
// глобальные настройки. Конкретных игр не знает — работает только с записями.
//
// Экземпляр, а не модульный синглтон: скрытое глобальное состояние мешало бы
// тестам, а composition root и так создаёт платформу один раз.

/** Глобальные настройки платформы (D6). */
export interface GlobalSettings {
  readonly name: string;
  /** Игра, запущенная последней: по ней строится быстрый запуск на главном. */
  readonly lastGameId: string;
  /** Режим темы: системный либо явный выбор пользователя. */
  readonly themeMode: ThemeMode;
}

const GLOBAL_KEY = "global";
const DEFAULT_NAME = "Игрок";
const DEFAULT_THEME_MODE: ThemeMode = "system";
const NAME_MAX = 20;

const THEME_MODES: readonly ThemeMode[] = ["system", "light", "dark"];

function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

const globalSchema: Schema<GlobalSettings> = {
  defaults: { name: DEFAULT_NAME, lastGameId: "", themeMode: DEFAULT_THEME_MODE },
  parse(raw) {
    if (raw === null || typeof raw !== "object") {
      return { name: DEFAULT_NAME, lastGameId: "", themeMode: DEFAULT_THEME_MODE };
    }
    const value = raw as Partial<GlobalSettings>;
    return {
      name:
        typeof value.name === "string" && value.name ? value.name.slice(0, NAME_MAX) : DEFAULT_NAME,
      lastGameId: typeof value.lastGameId === "string" ? value.lastGameId : "",
      themeMode: isThemeMode(value.themeMode) ? value.themeMode : DEFAULT_THEME_MODE,
    };
  },
};

/** Ключ контролла имени в форме глобальных настроек. */
export const GLOBAL_NAME_CONTROL = "name";

/** Ключ контролла темы в форме глобальных настроек. */
export const GLOBAL_THEME_CONTROL = "theme";

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

  /**
   * Метаданные формы глобальных настроек. Форма строится из схемы, а не из
   * разметки: вид не зашит в код экрана.
   */
  globalForm(): FormSchema {
    return {
      id: "global-settings",
      nodes: [
        {
          type: "group",
          id: "global-critical",
          label: "Критические",
          frame: true,
          children: [
            {
              type: "control",
              control: {
                id: GLOBAL_NAME_CONTROL,
                kind: "text",
                label: "Имя",
                value: DEFAULT_NAME,
                signals: ["change"],
              },
            },
          ],
        },
        {
          type: "group",
          id: "global-general",
          label: "Настройки",
          frame: true,
          children: [
            {
              type: "control",
              control: {
                id: GLOBAL_THEME_CONTROL,
                kind: "select",
                label: "Тема",
                value: DEFAULT_THEME_MODE,
                options: [
                  { value: "system", label: "Системная" },
                  { value: "light", label: "Светлая" },
                  { value: "dark", label: "Тёмная" },
                ],
                signals: ["change"],
              },
            },
          ],
        },
      ],
    };
  }

  /** Создать экземпляр игры по записи реестра. Загрузка отложенная. */
  async createGame(entry: GameEntry): Promise<Game> {
    return entry.entry();
  }

  /** Поднять сессию на уже созданном экземпляре игры (настройки преднастройки). */
  createSessionFor(
    game: Game,
    players: readonly PlayerInit[],
    options?: CreateSessionOptions,
  ): Session {
    return new Session({ game, players, options });
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
