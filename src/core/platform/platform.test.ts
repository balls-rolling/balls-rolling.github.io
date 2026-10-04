import { describe, expect, it } from "vitest";
import { Game, type GameEntry, type GameState, type Move, type MoveResult } from "../game";
import { createStore } from "../storage";
import {
  createPlatform,
  GLOBAL_NAME_CONTROL,
  GLOBAL_THEME_CONTROL,
  type GlobalSettings,
} from "./platform";

// Минимальная игра: платформа не должна знать конкретных игр, поэтому в тесте
// ей передаётся синтетическая запись. Проверка не зависит от содержимого
// реестра — иначе тест ломался бы при появлении настоящих игр.
class StubGame extends Game {
  readonly id = "stub";
  readonly label = "Заглушка";

  createInitialState(playerIds: readonly string[]): GameState {
    return { order: [...playerIds] };
  }

  applyMove(state: GameState, _playerId: string, _move: Move): MoveResult {
    return { accepted: true, state, finished: false };
  }

  chooseMove(): Move | null {
    return null;
  }

  nextPlayer(state: GameState, playerId: string): string {
    const order = (state as { order: readonly string[] }).order;
    return order[(order.indexOf(playerId) + 1) % order.length]!;
  }

  isFinished(): boolean {
    return false;
  }
}

const stubEntry: GameEntry = {
  id: "stub",
  label: "Заглушка",
  entry: () => Promise.resolve(new StubGame()),
};

const players = [
  { id: "p1", name: "Первый", agent: "human", transport: "local" } as const,
  { id: "p2", name: "Комп", agent: "computer", transport: "local" } as const,
];

describe("Platform", () => {
  it("возвращает список игр из реестра", () => {
    const platform = createPlatform();
    expect(Array.isArray(platform.listGames())).toBe(true);
  });

  it("создаёт игру по записи реестра", async () => {
    const platform = createPlatform();

    const game = await platform.createGame(stubEntry);

    expect(game).toBeInstanceOf(StubGame);
    expect(game.id).toBe("stub");
  });

  it("поднимает сессию по цепочке Platform → Game → Session", async () => {
    const platform = createPlatform();

    const session = await platform.createSession(stubEntry, players);

    expect(session.snapshot().state).toBe("idle");
    expect(session.snapshot().players.map((p) => p.id)).toEqual(["p1", "p2"]);
  });

  it("сохраняет глобальные настройки", async () => {
    const platform = createPlatform(createStore());
    const settings: GlobalSettings = { name: "Гость", lastGameId: "test-game", themeMode: "dark" };

    await platform.saveGlobalSettings(settings);

    await expect(platform.loadGlobalSettings()).resolves.toEqual(settings);
  });

  it("возвращает значения по умолчанию, если настроек нет", async () => {
    const platform = createPlatform(createStore());

    // Хранилище в памяти создаётся заново, поэтому данных нет.
    await expect(platform.loadGlobalSettings()).resolves.toEqual({
      name: "Игрок",
      lastGameId: "",
      themeMode: "system",
    });
  });

  it("порча lastGameId не ломает чтение", async () => {
    const store = createStore();
    const platform = createPlatform(store);
    // Пишем данные в обход схемы: как будто в хранилище лежит старый формат.
    await store.write("global", { name: "Гость", lastGameId: 42 });

    const settings = await platform.loadGlobalSettings();

    expect(settings.name).toBe("Гость");
    expect(settings.lastGameId).toBe("");
    expect(settings.themeMode).toBe("system");
  });

  it("настройки живут в переданном хранилище, а не в платформе", async () => {
    const store = createStore();
    const first = createPlatform(store);
    await first.saveGlobalSettings({ name: "Гость", lastGameId: "", themeMode: "system" });

    const second = createPlatform(store);

    await expect(second.loadGlobalSettings()).resolves.toEqual({
      name: "Гость",
      lastGameId: "",
      themeMode: "system",
    });
  });

  it("объявляет форму глобальных настроек метаданными", () => {
    const platform = createPlatform();

    const form = platform.globalForm();
    const json = JSON.stringify(form);

    expect(json).toContain(GLOBAL_NAME_CONTROL);
    expect(json).toContain(GLOBAL_THEME_CONTROL);
  });

  it("валидирует режим темы, откатывая мусор к системному", async () => {
    const store = createStore();
    const platform = createPlatform(store);

    await store.write("global", { name: "Гость", themeMode: "neon" });
    await expect(platform.loadGlobalSettings()).resolves.toMatchObject({ themeMode: "system" });

    await platform.saveGlobalSettings({ name: "Гость", lastGameId: "", themeMode: "light" });
    await expect(platform.loadGlobalSettings()).resolves.toMatchObject({ themeMode: "light" });
  });
});
