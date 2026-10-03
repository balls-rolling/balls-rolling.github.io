// Бэкенды хранилища. Наружу не экспортируются: вызывающий код работает только
// с KeyValueStore, поэтому смена бэкенда его не касается.

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Память: фолбэк, когда localStorage недоступен или непригоден для записи. */
export class MemoryBackend implements StorageBackend {
  readonly #data = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.#data.get(key) ?? null);
  }

  set(key: string, value: string): Promise<void> {
    this.#data.set(key, value);
    return Promise.resolve();
  }

  remove(key: string): Promise<void> {
    this.#data.delete(key);
    return Promise.resolve();
  }
}

const PROBE_KEY = "__storage_probe__";

/**
 * localStorage, если он действительно пригоден. Проверяется именно **запись**,
 * а не наличие API: в приватном режиме свойство существует, но setItem бросает.
 * Без этой проверки ошибка записи теряется молча, а фолбэк в память не
 * включается — именно так было в исходной реализации.
 *
 * Возвращает null, если localStorage непригоден: вызывающий возьмёт память.
 */
export function createLocalStorageBackend(): StorageBackend | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    storage.setItem(PROBE_KEY, "1");
    storage.removeItem(PROBE_KEY);
  } catch {
    return null;
  }

  return {
    get(key: string): Promise<string | null> {
      try {
        return Promise.resolve(globalThis.localStorage.getItem(key));
      } catch {
        return Promise.resolve(null);
      }
    },
    set(key: string, value: string): Promise<void> {
      // Ошибку не глушим здесь: решение о ней принимает хранилище.
      globalThis.localStorage.setItem(key, value);
      return Promise.resolve();
    },
    remove(key: string): Promise<void> {
      try {
        globalThis.localStorage.removeItem(key);
      } catch {
        /* удалять нечего — это не ошибка вызывающего */
      }
      return Promise.resolve();
    },
  };
}
