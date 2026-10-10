import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createIdbStore } from "./index";
import { createIndexedDbBackend } from "./idb";

// fake-indexeddb/auto ставит глобальный indexedDB. Свежая фабрика на каждый
// тест изолирует базы: иначе данные перетекали бы между тестами.
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe("createIndexedDbBackend", () => {
  it("roundtrip get/set/remove/keys", async () => {
    const backend = createIndexedDbBackend();
    expect(backend).not.toBeNull();
    if (!backend) return;

    await backend.set("a", "1");
    await backend.set("b", "2");
    await expect(backend.get("a")).resolves.toBe("1");
    await expect(backend.get("missing")).resolves.toBeNull();
    await expect(backend.keys()).resolves.toEqual(["a", "b"]);

    await backend.remove("a");
    await expect(backend.get("a")).resolves.toBeNull();
    await expect(backend.keys()).resolves.toEqual(["b"]);
  });

  it("без indexedDB возвращает null", () => {
    const original = globalThis.indexedDB;
    vi.stubGlobal("indexedDB", undefined);
    try {
      expect(createIndexedDbBackend()).toBeNull();
    } finally {
      globalThis.indexedDB = original;
      vi.unstubAllGlobals();
    }
  });
});

describe("createIdbStore", () => {
  it("пишет и читает через IndexedDB", async () => {
    const store = createIdbStore();
    await store.write("game/1", "значение");
    await expect(store.keys()).resolves.toEqual(["game/1"]);
  });
});
