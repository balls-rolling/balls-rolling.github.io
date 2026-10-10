import type { KeyValueStore, Schema } from "../storage";
import type { SessionSave } from "../session";
import { SAVE_VERSION, type GameSaveNode, type StoredSession } from "./types";

// Сохранения партий поверх KeyValueStore. Класс не знает о сети и UI: только
// чтение/запись узлов и версионирование снимка. Ключ узла — `game/<id>`; префикс
// пространства имён добавит само хранилище.

/** Префикс ключей сохранений (логический, без префикса хранилища). */
const NODE_PREFIX = "game/";

/** Ключ узла по идентификатору игры. */
function nodeKey(id: string): string {
  return NODE_PREFIX + id;
}

/** Объект-словарь, но не массив и не null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Шаг миграции: превращает данные версии N в данные версии N+1. Индекс массива —
 * исходная версия. Сейчас цепочка пуста: версия одна, мигрировать нечего.
 */
type SessionMigration = (data: unknown) => unknown;

const MIGRATIONS: readonly SessionMigration[] = [];

/**
 * Приводит данные к текущей версии. `null` — миграции нет, снимок отбросить.
 * Ветвление версий не поддерживается: старше текущей мигрируются по цепочке,
 * новее — отбрасываются.
 */
function migrate(data: unknown, from: number): SessionSave | null {
  if (from > SAVE_VERSION) return null;

  let current = data;
  for (let version = from; version < SAVE_VERSION; version += 1) {
    const migration = MIGRATIONS[version];
    if (!migration) return null;
    current = migration(current);
  }

  // Снимок обязан быть объектом: узел вида `{ v: 1 }` без `data` — мусор,
  // а не валидная (пустая) сессия.
  return isRecord(current) ? (current as unknown as SessionSave) : null;
}

/** Разбор снимка. Мусор — `null` (сессия не восстанавливается, настройки целы). */
function parseSession(raw: unknown): StoredSession | null {
  if (!isRecord(raw)) return null;
  const version = raw.v;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 0) return null;

  const data = migrate(raw.data, version);
  if (data === null) return null;

  return { v: SAVE_VERSION, data };
}

/**
 * Sentinal отсутствия узла. `read` возвращает `defaults` и при отсутствии
 * ключа, и при порче данных; сравнение по ссылке позволяет `load` отличить это
 * от настоящего узла, который `parse` всегда собирает заново.
 */
const MISSING: GameSaveNode = { settings: null, session: null };

/** Настройки: объект или null. Прочее невалидно и обнуляется. */
function parseSettings(raw: unknown): unknown | null {
  return isRecord(raw) ? raw : null;
}

function parseNode(raw: unknown): GameSaveNode {
  if (!isRecord(raw)) return MISSING;
  return {
    settings: parseSettings(raw.settings),
    session: parseSession(raw.session),
  };
}

const nodeSchema: Schema<GameSaveNode> = {
  defaults: MISSING,
  parse: parseNode,
};

/**
 * Сохранения партий. Один ключ `game/<id>` на игру: `settings` и `session`.
 */
export class GameSaves {
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  /** Запись узла. Снимок всегда сохраняется в текущей версии формата. */
  async save(id: string, node: GameSaveNode): Promise<void> {
    const normalized: GameSaveNode = {
      settings: node.settings === undefined ? null : node.settings,
      session: node.session ? { v: SAVE_VERSION, data: node.session.data } : null,
    };
    await this.#store.write(nodeKey(id), normalized);
  }

  /**
   * Чтение узла. `null` — ключа нет или данные испорчены; настройки и снимок
   * уже нормализованы (мусорная сессия отброшена, версия приведена к текущей).
   */
  async load(id: string): Promise<GameSaveNode | null> {
    const node = await this.#store.read(nodeKey(id), nodeSchema);
    return node === MISSING ? null : node;
  }

  /**
   * Убирает снимок сессии, сохраняя настройки. Отсутствующий узел не трогаем —
   * создавать пустой смысла нет.
   */
  async removeSession(id: string): Promise<void> {
    const node = await this.load(id);
    if (node === null) return;
    await this.save(id, { settings: node.settings, session: null });
  }

  /** Полное удаление узла: и настройки, и снимок. */
  async remove(id: string): Promise<void> {
    await this.#store.remove(nodeKey(id));
  }

  /** Идентификаторы игр с сохранением (ключи `game/<id>` без префикса). */
  async listIds(): Promise<string[]> {
    const keys = await this.#store.keys();
    return keys
      .filter((key) => key.startsWith(NODE_PREFIX))
      .map((key) => key.slice(NODE_PREFIX.length));
  }

  /** Удалить все сохранения партий (узлы `game/*`), не трогая остальное. */
  async clear(): Promise<void> {
    for (const id of await this.listIds()) {
      await this.remove(id);
    }
  }
}
