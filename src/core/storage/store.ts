import {
  createLocalStorageBackend,
  FallbackBackend,
  MemoryBackend,
  type StorageBackend,
} from "./backends";
import { createIndexedDbBackend } from "./idb";
import type { KeyValueStore, Schema } from "./types";

// Хранилище поверх бэкенда. Имя не `Storage`: идентификатор `Storage` занят
// типом из lib.dom, и совпадение путало бы.

/** Префикс пространства имён: отделяет наши ключи от чужих в том же origin. */
const PREFIX = "mini-games:";

const ENVELOPE_VERSION = 1;

interface Envelope {
  readonly v: number;
  readonly data: unknown;
}

/** Конверт с версией — дешёвый задел под миграции. */
function encode(value: unknown): string {
  const envelope: Envelope = { v: ENVELOPE_VERSION, data: value };
  return JSON.stringify(envelope);
}

/** Разбор конверта. Испорченные данные — не исключение, а «не найдено». */
function decode(raw: string): { found: boolean; data: unknown } {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object" && "data" in parsed) {
      return { found: true, data: (parsed as Envelope).data };
    }
  } catch {
    /* испорченный JSON — считаем ключ отсутствующим */
  }
  return { found: false, data: undefined };
}

export class KeyValueStoreImpl implements KeyValueStore {
  readonly #backend: StorageBackend;

  constructor(backend?: StorageBackend) {
    this.#backend = backend ?? createLocalStorageBackend() ?? new MemoryBackend();
  }

  async read<T>(key: string, schema: Schema<T>): Promise<T> {
    const raw = await this.#backend.get(PREFIX + key);
    if (raw === null) return schema.defaults;

    const { found, data } = decode(raw);
    if (!found) return schema.defaults;

    try {
      return schema.parse(data);
    } catch {
      // Схема по контракту не бросает, но чтение не должно падать ни при чём.
      return schema.defaults;
    }
  }

  async write<T>(key: string, value: T): Promise<void> {
    try {
      await this.#backend.set(PREFIX + key, encode(value));
    } catch {
      // Запись best-effort: переполнение квоты не должно ронять приложение.
      // Приватный режим отсекается ещё на инициализации (проба записи), так что
      // сюда попадают только редкие случаи вроде исчерпанной квоты.
    }
  }

  async remove(key: string): Promise<void> {
    await this.#backend.remove(PREFIX + key);
  }

  async keys(): Promise<string[]> {
    const raw = await this.#backend.keys();
    return raw.filter((key) => key.startsWith(PREFIX)).map((key) => key.slice(PREFIX.length));
  }

  /** Удалить все ключи этого пространства имён (префикс снимается/навешивается). */
  async clear(): Promise<void> {
    const keys = await this.keys();
    for (const key of keys) {
      await this.remove(key);
    }
  }
}

export function createStore(backend?: StorageBackend): KeyValueStore {
  return new KeyValueStoreImpl(backend);
}

/**
 * Хранилище сохранений: IndexedDB, а при его недоступности/сбое — localStorage
 * (с фолбэком в память). Иначе на браузерах с заблокированным IndexedDB (приватный
 * режим, ограничения origin) сохранения терялись бы молча.
 */
export function createIdbStore(backend?: StorageBackend): KeyValueStore {
  if (backend) return new KeyValueStoreImpl(backend);
  const primary = createIndexedDbBackend();
  const secondary = createLocalStorageBackend() ?? new MemoryBackend();
  return new KeyValueStoreImpl(primary ? new FallbackBackend(primary, secondary) : secondary);
}
