// Бэкенды хранилища. Наружу не экспортируются: вызывающий код работает только
// с KeyValueStore, поэтому смена бэкенда его не касается.

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** Перечисление всех ключей бэкенда (без фильтра по пространству имён). */
  keys(): Promise<string[]>;
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

  keys(): Promise<string[]> {
    return Promise.resolve([...this.#data.keys()]);
  }
}

/**
 * Бэкенд с запасным путём: операция идёт в основной, а при его сбое (отклонённый
 * промис) — в запасной. Нужен, чтобы недоступный IndexedDB (приватный режим,
 * блокировка хранилища, ограничения origin) не терял сохранения молча: они уходят
 * в localStorage, а если и он недоступен — в память.
 */
export class FallbackBackend implements StorageBackend {
  readonly #primary: StorageBackend;
  readonly #secondary: StorageBackend;
  /** После первого сбоя основного бэкенда работаем только с запасным. */
  #useSecondary = false;

  constructor(primary: StorageBackend, secondary: StorageBackend) {
    this.#primary = primary;
    this.#secondary = secondary;
  }

  async get(key: string): Promise<string | null> {
    if (this.#useSecondary) return this.#secondary.get(key);
    try {
      return await this.#primary.get(key);
    } catch {
      this.#useSecondary = true;
      return this.#secondary.get(key);
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (this.#useSecondary) return this.#secondary.set(key, value);
    try {
      await this.#primary.set(key, value);
    } catch {
      this.#useSecondary = true;
      await this.#secondary.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    if (this.#useSecondary) return this.#secondary.remove(key);
    try {
      await this.#primary.remove(key);
    } catch {
      this.#useSecondary = true;
      await this.#secondary.remove(key);
    }
  }

  async keys(): Promise<string[]> {
    if (this.#useSecondary) return this.#secondary.keys();
    try {
      return await this.#primary.keys();
    } catch {
      this.#useSecondary = true;
      return this.#secondary.keys();
    }
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
    keys(): Promise<string[]> {
      try {
        const storage = globalThis.localStorage;
        const result: string[] = [];
        for (let i = 0; i < storage.length; i += 1) {
          const key = storage.key(i);
          if (key !== null) result.push(key);
        }
        return Promise.resolve(result);
      } catch {
        // Перечисление недоступно (приватный режим и т.п.) — не роняем вызывающего.
        return Promise.resolve([]);
      }
    },
  };
}
