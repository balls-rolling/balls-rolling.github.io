// Бэкенд хранилища на IndexedDB. Наружу напрямую не экспортируется: вызывающий
// код работает с KeyValueStore (см. createIdbStore). Значения — строки, ключи
// out-of-line (второй аргумент put), поэтому стор не привязан к схеме.

import type { StorageBackend } from "./backends";

const DB_NAME = "mini-games-db";
const STORE_NAME = "kv";
const DB_VERSION = 1;

/** Промис над IDBRequest: события success/error. */
function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("ошибка запроса IndexedDB"));
  });
}

/** Промис завершения транзакции: без него ошибки записи теряются. */
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("ошибка транзакции IndexedDB"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("транзакция IndexedDB прервана"));
  });
}

class IndexedDbBackend implements StorageBackend {
  // Соединение открывается лениво и кэшируется промисом: повторные открытия
  // не нужны, а все методы ждут один и тот же результат.
  readonly #open: Promise<IDBDatabase>;

  constructor(factory: IDBFactory) {
    this.#open = new Promise<IDBDatabase>((resolve, reject) => {
      // Страховка от «зависшего» открытия (встречается в некоторых сборках
      // Safari): по таймауту отказываем, и хранилище уходит в запасной бэкенд.
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("IndexedDB не открылась вовремя"));
      }, 4000);
      const fail = (error: unknown): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      };

      let request: IDBOpenDBRequest;
      try {
        request = factory.open(DB_NAME, DB_VERSION);
      } catch (error) {
        fail(error);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const db = request.result;
        // Закрытие при чужой смене версии: иначе соединение мешает обновлению.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      request.onerror = () => fail(request.error ?? new Error("не удалось открыть IndexedDB"));
      request.onblocked = () => fail(new Error("открытие IndexedDB заблокировано"));
    });
  }

  async get(key: string): Promise<string | null> {
    const db = await this.#open;
    const transaction = db.transaction(STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    return typeof result === "string" ? result : null;
  }

  async set(key: string, value: string): Promise<void> {
    const db = await this.#open;
    const transaction = db.transaction(STORE_NAME, "readwrite");
    // Никаких `await` между созданием транзакции и операцией: транзакция
    // закрылась бы сама. Завершение ждём уже после постановки запроса.
    transaction.objectStore(STORE_NAME).put(value, key);
    await transactionDone(transaction);
  }

  async remove(key: string): Promise<void> {
    const db = await this.#open;
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  }

  async keys(): Promise<string[]> {
    const db = await this.#open;
    const transaction = db.transaction(STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(STORE_NAME).getAllKeys());
    return result.filter((key): key is string => typeof key === "string");
  }
}

/**
 * IndexedDB, если он доступен. Если API нет — null: вызывающий возьмёт память.
 * Ошибки открытия (onerror/onblocked) отклоняют ленивый промис и всплывают на
 * вызывающем, но не вешают приложение: методы всегда возвращают промис.
 */
export function createIndexedDbBackend(): StorageBackend | null {
  const factory = globalThis.indexedDB;
  if (!factory) return null;
  return new IndexedDbBackend(factory);
}
