import { describe, expect, it } from "vitest";
import { MemoryBackend } from "../storage/backends";
import { createStore } from "../storage/index";
import type { KeyValueStore } from "../storage";
import type { SessionSave } from "../session";
import { GameSaves } from "./save-store";
import { SAVE_VERSION, type GameSaveNode } from "./types";

// Тесты модуля сохранений идут без DOM: MemoryBackend + createStore дают ровно
// тот же контракт KeyValueStore, что и IndexedDB (T1).

const session: SessionSave = {
  players: [
    {
      id: "p1",
      name: "Игрок",
      agent: "human",
      transport: "local",
      properties: { score: 3 },
    },
  ],
  currentPlayerId: "p1",
  winnerId: null,
  state: "running",
  gameState: { board: ["x", "o", "x"] },
};

/** Свежая связка хранилища и модуля сохранений над общим бэкендом. */
function makeSaves(backend = new MemoryBackend()): {
  store: KeyValueStore;
  saves: GameSaves;
  backend: MemoryBackend;
} {
  const store = createStore(backend);
  return { store, saves: new GameSaves(store), backend };
}

describe("GameSaves", () => {
  it("сохраняет и читает узел целиком", async () => {
    const { saves } = makeSaves();
    const node: GameSaveNode = { settings: { level: 3 }, session: { v: 1, data: session } };

    await saves.save("tic-tac", node);

    await expect(saves.load("tic-tac")).resolves.toEqual(node);
  });

  it("держит настройки и сессию раздельно по ключам", async () => {
    const { saves } = makeSaves();

    await saves.save("a", { settings: { level: 1 }, session: { v: 1, data: session } });
    await saves.save("b", { settings: { level: 2 }, session: null });

    await expect(saves.load("a")).resolves.toMatchObject({ settings: { level: 1 } });
    await expect(saves.load("b")).resolves.toEqual({ settings: { level: 2 }, session: null });
  });

  it("removeSession сохраняет настройки, убирая только снимок", async () => {
    const { saves } = makeSaves();
    await saves.save("a", { settings: { level: 5 }, session: { v: 1, data: session } });

    await saves.removeSession("a");

    await expect(saves.load("a")).resolves.toEqual({ settings: { level: 5 }, session: null });
  });

  it("removeSession на отсутствующем узле ничего не создаёт", async () => {
    const { saves } = makeSaves();

    await saves.removeSession("нет");

    await expect(saves.load("нет")).resolves.toBeNull();
    await expect(saves.listIds()).resolves.toEqual([]);
  });

  it("на отсутствующем ключе возвращает null", async () => {
    const { saves } = makeSaves();

    await expect(saves.load("нет")).resolves.toBeNull();
  });

  it("на испорченном значении узла возвращает null", async () => {
    const { store, saves } = makeSaves();
    // Значение мимо модуля: не узел, а произвольная строка.
    await store.write("game/bad", "совсем не узел");

    await expect(saves.load("bad")).resolves.toBeNull();
  });

  it("обнуляет испорченный снимок, сохраняя настройки", async () => {
    const { store, saves } = makeSaves();
    await store.write("game/bad", { settings: { level: 7 }, session: "мусор" });

    await expect(saves.load("bad")).resolves.toEqual({ settings: { level: 7 }, session: null });
  });

  it("снимок новее текущей версии отбрасывается, настройки целы", async () => {
    const { store, saves } = makeSaves();
    await store.write("game/future", {
      settings: { level: 9 },
      session: { v: SAVE_VERSION + 1, data: session },
    });

    await expect(saves.load("future")).resolves.toEqual({ settings: { level: 9 }, session: null });
  });

  it("снимок без версии отбрасывается", async () => {
    const { store, saves } = makeSaves();
    await store.write("game/noversion", { settings: null, session: { data: session } });

    await expect(saves.load("noversion")).resolves.toEqual({ settings: null, session: null });
  });

  it("снимок без data отбрасывается: узел `{v}` — мусор, а не пустая сессия", async () => {
    const { store, saves } = makeSaves();
    await store.write("game/nodata", { settings: { level: 4 }, session: { v: SAVE_VERSION } });

    await expect(saves.load("nodata")).resolves.toEqual({ settings: { level: 4 }, session: null });
  });

  it("запись всегда идёт в текущей версии", async () => {
    const { store, saves } = makeSaves();
    // Модуль обязан нормализовать версию, даже если вызывающий прислал чужую.
    await saves.save("a", { settings: null, session: { v: 99, data: session } });

    const raw = await store.read("game/a", {
      defaults: null,
      parse: (value) => value as { session: { v: number } } | null,
    });
    expect(raw?.session.v).toBe(SAVE_VERSION);
  });

  it("listIds возвращает только ключи game/*, без префикса", async () => {
    const { store, saves } = makeSaves();
    await store.write("global", { theme: "dark" });
    await saves.save("tic-tac", { settings: null, session: null });
    await saves.save("checkers", { settings: { level: 1 }, session: null });

    await expect(saves.listIds()).resolves.toEqual(["tic-tac", "checkers"]);
  });

  it("remove удаляет узел полностью", async () => {
    const { saves } = makeSaves();
    await saves.save("a", { settings: { level: 1 }, session: { v: 1, data: session } });

    await saves.remove("a");

    await expect(saves.load("a")).resolves.toBeNull();
    await expect(saves.listIds()).resolves.toEqual([]);
  });

  it("clear удаляет все сохранения, не трогая чужие ключи", async () => {
    const { store, saves } = makeSaves();
    await store.write("global", { theme: "dark" });
    await saves.save("a", { settings: null, session: { v: 1, data: session } });
    await saves.save("b", { settings: { level: 1 }, session: null });

    await saves.clear();

    await expect(saves.listIds()).resolves.toEqual([]);
    await expect(store.keys()).resolves.toEqual(["global"]);
  });
});
