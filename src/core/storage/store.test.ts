import { describe, expect, it, vi } from "vitest";
import { FallbackBackend, MemoryBackend, type StorageBackend } from "./backends";
import { createIdbStore, createStore } from "./index";
import type { Schema } from "./types";

// В окружении node localStorage отсутствует, поэтому хранилище само берёт
// бэкенд в память — и это ровно тот путь, который здесь проверяется.

interface Settings {
  name: string;
  sound: boolean;
}

const defaults: Settings = { name: "Игрок", sound: false };

const schema: Schema<Settings> = {
  defaults,
  parse(raw) {
    if (raw === null || typeof raw !== "object") return defaults;
    const value = raw as Partial<Settings>;
    return {
      name: typeof value.name === "string" && value.name ? value.name.slice(0, 20) : defaults.name,
      sound: typeof value.sound === "boolean" ? value.sound : defaults.sound,
    };
  },
};

describe("createStore", () => {
  it("на отсутствующем ключе возвращает defaults, а не undefined", async () => {
    const store = createStore();

    await expect(store.read("global", schema)).resolves.toEqual(defaults);
  });

  it("сохраняет и возвращает значение", async () => {
    const store = createStore();
    const saved: Settings = { name: "Гость", sound: true };

    await store.write("global", saved);

    await expect(store.read("global", schema)).resolves.toEqual(saved);
  });

  it("различает ключи", async () => {
    const store = createStore();

    await store.write("global", { name: "Игрок", sound: false });
    await store.write("game/demo", { name: "Демо", sound: true });

    await expect(store.read("global", schema)).resolves.toMatchObject({ name: "Игрок" });
    await expect(store.read("game/demo", schema)).resolves.toMatchObject({ name: "Демо" });
  });

  it("remove убирает значение", async () => {
    const store = createStore();
    await store.write("global", { name: "Гость", sound: true });

    await store.remove("global");

    await expect(store.read("global", schema)).resolves.toEqual(defaults);
  });

  it("вызывает parse на чтении", async () => {
    const store = createStore();
    const parse = vi.fn(schema.parse);

    await store.write("global", { name: "Гость", sound: true });
    const result = await store.read("global", { defaults, parse });

    expect(parse).toHaveBeenCalledTimes(1);
    expect(result.name).toBe("Гость");
  });

  it("испорченный parse не роняет чтение", async () => {
    const store = createStore();
    await store.write("global", { name: "Гость", sound: true });

    const broken: Schema<Settings> = {
      defaults,
      parse() {
        throw new Error("схема сломалась");
      },
    };

    await expect(store.read("global", broken)).resolves.toEqual(defaults);
  });

  it("данные другого вида не роняют parse", async () => {
    const store = createStore();
    await store.write("global", { name: 42, sound: "да" });

    // parse обязан вернуть пригодное значение, а не выбросить.
    await expect(store.read("global", schema)).resolves.toEqual(defaults);
  });

  it("keys возвращает логические ключи без префикса", async () => {
    const store = createStore();
    await store.write("global", { name: "Игрок", sound: false });
    await store.write("game/demo", { name: "Демо", sound: true });

    expect((await store.keys()).sort()).toEqual(["game/demo", "global"]);
  });

  it("keys игнорирует чужие ключи без префикса", async () => {
    // Ключ мимо хранилища — как будто его записал другой код того же origin.
    const backend = new MemoryBackend();
    await backend.set("foreign", "чужие данные");
    const store = createStore(backend);
    await store.write("global", { name: "Игрок", sound: false });

    await expect(store.keys()).resolves.toEqual(["global"]);
  });

  it("keys не показывает удалённый ключ", async () => {
    const store = createStore();
    await store.write("global", { name: "Игрок", sound: false });
    await store.write("game/demo", { name: "Демо", sound: true });

    await store.remove("global");

    await expect(store.keys()).resolves.toEqual(["game/demo"]);
  });

  it("clear удаляет только свои ключи, чужие не трогает", async () => {
    const backend = new MemoryBackend();
    await backend.set("foreign", "чужие");
    const store = createStore(backend);
    await store.write("global", { name: "Игрок", sound: false });
    await store.write("game/demo", { name: "Демо", sound: true });

    await store.clear();

    await expect(store.keys()).resolves.toEqual([]);
    await expect(backend.get("foreign")).resolves.toBe("чужие");
  });

  it("clear на пустом хранилище не падает", async () => {
    const store = createStore();
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe("FallbackBackend и createIdbStore", () => {
  function failingBackend(): StorageBackend {
    return {
      get: () => Promise.reject(new Error("idb down")),
      set: () => Promise.reject(new Error("idb down")),
      remove: () => Promise.reject(new Error("idb down")),
      keys: () => Promise.reject(new Error("idb down")),
    };
  }

  it("при сбое основного бэкенда операции идут в запасной", async () => {
    const memory = new MemoryBackend();
    const backend = new FallbackBackend(failingBackend(), memory);

    await backend.set("k", "v");
    await expect(backend.get("k")).resolves.toBe("v");
    await expect(backend.keys()).resolves.toEqual(["k"]);

    await backend.remove("k");
    await expect(backend.get("k")).resolves.toBeNull();
  });

  it("createIdbStore сохраняет даже без IndexedDB (фолбэк работает)", async () => {
    const store = createIdbStore();
    await store.write("game/x", { a: 1 });

    await expect(store.keys()).resolves.toContain("game/x");
    await expect(store.read("game/x", { defaults: null, parse: (v) => v })).resolves.toEqual({
      a: 1,
    });
  });
});
