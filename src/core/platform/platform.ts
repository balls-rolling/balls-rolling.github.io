import { listGames as listGameEntries } from "../game";
import type { Game, GameEntry } from "../game";
import type { FormSchema } from "../form";
import type { PlayerInit } from "../player";
import { GameSaves, SAVE_VERSION } from "../saves";
import { Session } from "../session";
import type { SessionOptions, SessionSave } from "../session";
import { createIdbStore, createStore, type KeyValueStore, type Schema } from "../storage";
import type { ThemeMode } from "../theme";

// Корень платформы: реестр игр, цепочка `Platform → Game → Session` (D2) и
// глобальные настройки. Конкретных игр не знает — работает только с записями.
//
// Экземпляр, а не модульный синглтон: скрытое глобальное состояние мешало бы
// тестам, а composition root и так создаёт платформу один раз.

/** Глобальные настройки платформы (D6). */
export interface GlobalSettings {
  readonly name: string;
  /**
   * Постоянный id игрока (UUID). Генерируется при первом запуске и хранится до
   * очистки данных; едет по сети и по нему восстанавливается место в партии.
   */
  readonly playerId: string;
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
  defaults: { name: DEFAULT_NAME, playerId: "", lastGameId: "", themeMode: DEFAULT_THEME_MODE },
  parse(raw) {
    if (raw === null || typeof raw !== "object") {
      return { name: DEFAULT_NAME, playerId: "", lastGameId: "", themeMode: DEFAULT_THEME_MODE };
    }
    const value = raw as Partial<GlobalSettings>;
    return {
      name:
        typeof value.name === "string" && value.name ? value.name.slice(0, NAME_MAX) : DEFAULT_NAME,
      playerId: typeof value.playerId === "string" ? value.playerId : "",
      lastGameId: typeof value.lastGameId === "string" ? value.lastGameId : "",
      themeMode: isThemeMode(value.themeMode) ? value.themeMode : DEFAULT_THEME_MODE,
    };
  },
};

/** Новый постоянный id игрока (UUID; фолбэк — случайная строка). */
function newPlayerId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") return cryptoObj.randomUUID();
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Ключ контролла имени в форме глобальных настроек. */
export const GLOBAL_NAME_CONTROL = "name";

/** Ключ контролла темы в форме глобальных настроек. */
export const GLOBAL_THEME_CONTROL = "theme";

/** Кнопка полного сброса данных (включая постоянный id игрока). */
export const GLOBAL_WIPE_CONTROL = "wipe-all-data";

/** Кнопка очистки сохранённых игр (список). */
export const GLOBAL_CLEAR_SAVES_CONTROL = "clear-saved-games";

export interface CreateSessionOptions extends SessionOptions {
  /** Задержка хода компьютера. Существует ради тестов и отладки. */
  readonly computerDelayMs?: number;
}

export class Platform {
  readonly #store: KeyValueStore;
  readonly #saves: GameSaves;

  constructor(store?: KeyValueStore, saves?: GameSaves) {
    this.#store = store ?? createStore();
    // Сохранения партий — в IndexedDB (крупные/структурированные данные), с
    // надёжным фолбэком на localStorage/память и таймаутом открытия: если IDB
    // недоступен или не открывается, «Продолжить» всё равно работает.
    this.#saves = saves ?? new GameSaves(createIdbStore());
  }

  /** Доступные игры. Платформа получает список, но не знает конкретных имён. */
  listGames(): readonly GameEntry[] {
    return listGameEntries();
  }

  /** Глобальные настройки; при первом чтении выдаём постоянный id игрока. */
  async loadGlobalSettings(): Promise<GlobalSettings> {
    const settings = await this.#store.read(GLOBAL_KEY, globalSchema);
    if (settings.playerId) return settings;
    const withId: GlobalSettings = { ...settings, playerId: newPlayerId() };
    await this.saveGlobalSettings(withId);
    return withId;
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
        {
          type: "group",
          id: "global-data",
          label: "Данные",
          frame: true,
          orientation: "horizontal",
          children: [
            {
              type: "control",
              control: {
                id: GLOBAL_CLEAR_SAVES_CONTROL,
                kind: "button",
                label: "Очистить сохранённые игры",
                signals: ["press"],
              },
            },
            {
              type: "control",
              control: {
                id: GLOBAL_WIPE_CONTROL,
                kind: "button",
                label: "Стереть все данные",
                variant: "danger",
                signals: ["press"],
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

  /**
   * Демо-сессия случайной игры. Перебирает записи, у первой игры с непустым
   * `getDemoPlayers()` создаёт сессию с параметром демо. `null` — если ни у одной
   * игры демо нет. Записи можно передать (тест); по умолчанию — реестр.
   */
  async createDemoSession(
    entries: readonly GameEntry[] = this.listGames(),
  ): Promise<Session | null> {
    const shuffled = [...entries];
    // Перемешивание Фишера–Йетса: демо — случайная игра.
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = shuffled[i]!;
      shuffled[i] = shuffled[j]!;
      shuffled[j] = tmp;
    }

    for (const entry of shuffled) {
      const game = await this.createGame(entry);
      const players = game.getDemoPlayers();
      if (players && players.length > 0) {
        return new Session({ game, players, options: { demo: true } });
      }
    }
    return null;
  }

  /**
   * Сохранить снимок партии вместе с настройками игры. Снимок пишется в
   * текущей версии формата; настройки непрозрачны для платформы.
   */
  async saveGameSnapshot(id: string, settings: unknown, save: SessionSave): Promise<void> {
    await this.#saves.save(id, { settings, session: { v: SAVE_VERSION, data: save } });
  }

  /** Убрать снимок сессии, сохранив настройки игры. */
  async removeSessionSave(id: string): Promise<void> {
    await this.#saves.removeSession(id);
  }

  /** Есть ли у игры сохранённая сессия (настройки без снимка не считаются). */
  async hasSavedSession(id: string): Promise<boolean> {
    const node = await this.#saves.load(id);
    return node !== null && node.session !== null;
  }

  /** Игры с сохранённой сессией, без пустых узлов (только настройки). */
  async listSavedGames(): Promise<string[]> {
    const ids = await this.#saves.listIds();
    const result: string[] = [];
    for (const id of ids) {
      if (await this.hasSavedSession(id)) result.push(id);
    }
    return result;
  }

  /** Полностью удалить узел сохранения игры: и настройки, и снимок. */
  async dropGameSave(id: string): Promise<void> {
    await this.#saves.remove(id);
  }

  /** Удалить сохранённые партии по списку id (выборочная очистка). */
  async clearSavedGames(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.#saves.remove(id);
    }
  }

  /**
   * Полная очистка данных: сохранения партий и глобальные настройки (включая
   * постоянный `playerId`). После неё `loadGlobalSettings()` выдаст новый `playerId`.
   */
  async clearAllData(): Promise<void> {
    await this.#saves.clear();
    await this.#store.clear();
  }

  /** Есть ли сохранённые данные: сохранённые партии или глобальные настройки. */
  async hasAnyData(): Promise<boolean> {
    if ((await this.#saves.listIds()).length > 0) return true;
    return (await this.#store.keys()).includes(GLOBAL_KEY);
  }

  /**
   * Восстановить партию из сохранения. `null` — сохранения нет, снимок не
   * `running`, либо состояние игры непригодно: в этих случаях сессия
   * отбрасывается. Таймер компьютера не запускается — это сделает `resume()`,
   * который зовёт UI-координатор.
   */
  async resumeSession(game: Game): Promise<Session | null> {
    const node = await this.#saves.load(game.id);
    if (node === null || node.session === null) return null;

    const save = node.session.data;
    // Защита от мусорного узла: `data` уже проверен в `parseSession`, но
    // восстановление не должно падать ни при какой форме сохранения.
    if (!save || typeof save !== "object" || save.state !== "running") {
      await this.#saves.removeSession(game.id);
      return null;
    }

    game.applySettings(node.settings);
    try {
      return new Session({ game, restore: { save } });
    } catch {
      // `deserializeState` вернул null или снимок неполон — сохранение мусорное.
      await this.#saves.removeSession(game.id);
      return null;
    }
  }
}

export function createPlatform(store?: KeyValueStore): Platform {
  return new Platform(store);
}
