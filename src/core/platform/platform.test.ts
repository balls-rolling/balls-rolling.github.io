import { describe, expect, it, vi } from "vitest";
import { Game, type GameEntry, type GameState, type Move, type MoveResult } from "../game";
import { GameSaves } from "../saves";
import type { SessionSave } from "../session";
import { createStore } from "../storage";
import { MemoryBackend } from "../storage/backends";
import {
  createPlatform,
  GLOBAL_NAME_CONTROL,
  GLOBAL_THEME_CONTROL,
  Platform,
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

// Заглушка с демо: переопределяет состав демо-партии.
class DemoStubGame extends StubGame {
  override getDemoPlayers() {
    return [{ id: "ai", name: "ИИ", agent: "computer" as const, transport: "local" as const }];
  }
}

const demoEntry: GameEntry = {
  id: "demo-stub",
  label: "Демо-заглушка",
  entry: () => Promise.resolve(new DemoStubGame()),
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

  it("createSessionFor использует переданный экземпляр игры (настройки преднастройки)", () => {
    const platform = createPlatform(createStore());
    const game = new StubGame();
    const spy = vi.spyOn(game, "createInitialState");

    const session = platform.createSessionFor(game, players);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(session.snapshot().players.map((p) => p.id)).toEqual(["p1", "p2"]);
    session.destroy();
  });

  it("по умолчанию у игры нет демо", () => {
    expect(new StubGame().getDemoPlayers()).toBeNull();
  });

  it("createDemoSession берёт игру с демо, а без демо — null", async () => {
    const platform = createPlatform(createStore());

    const session = await platform.createDemoSession([stubEntry, demoEntry]);
    expect(session).not.toBeNull();
    expect(session!.isDemo).toBe(true);
    expect(session!.snapshot().players.map((p) => p.id)).toEqual(["ai"]);
    session!.destroy();

    expect(await platform.createDemoSession([stubEntry])).toBeNull();
  });

  it("сохраняет глобальные настройки", async () => {
    const platform = createPlatform(createStore());
    const settings: GlobalSettings = {
      name: "Гость",
      playerId: "pid-1",
      lastGameId: "tic-tac-toe",
      themeMode: "dark",
    };
    await platform.saveGlobalSettings(settings);

    await expect(platform.loadGlobalSettings()).resolves.toEqual(settings);
  });

  it("возвращает значения по умолчанию и выдаёт id игрока, если настроек нет", async () => {
    const platform = createPlatform(createStore());

    // Хранилище в памяти создаётся заново, поэтому данных нет.
    const settings = await platform.loadGlobalSettings();
    expect(settings).toMatchObject({ name: "Игрок", lastGameId: "", themeMode: "system" });
    // Постоянный id игрока генерируется и сохраняется при первом чтении.
    expect(typeof settings.playerId).toBe("string");
    expect(settings.playerId.length).toBeGreaterThan(0);
    expect((await platform.loadGlobalSettings()).playerId).toBe(settings.playerId);
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
    await first.saveGlobalSettings({
      name: "Гость",
      playerId: "pid-2",
      lastGameId: "",
      themeMode: "system",
    });

    const second = createPlatform(store);

    await expect(second.loadGlobalSettings()).resolves.toEqual({
      name: "Гость",
      playerId: "pid-2",
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

    await platform.saveGlobalSettings({
      name: "Гость",
      playerId: "pid-2",
      lastGameId: "",
      themeMode: "light",
    });
    await expect(platform.loadGlobalSettings()).resolves.toMatchObject({ themeMode: "light" });
  });
});

// Игра с непереносимым состоянием (`Set`) и своими настройками. Платформа сама
// состояние не разбирает: восстановление целиком на контракте сериализации.
interface SetState {
  readonly board: ReadonlySet<string>;
}

class SetGame extends Game {
  readonly id = "set-game";
  readonly label = "Множество";
  level = 1;

  createInitialState(): GameState {
    return { board: new Set<string>() } as unknown as GameState;
  }

  applyMove(state: GameState, _playerId: string, move: Move): MoveResult {
    const board = new Set((state as unknown as SetState).board);
    board.add(move.cell as string);
    // Партия завершается на втором камне: так видно, что доска взята из снимка,
    // а не создана пустой заново.
    return {
      accepted: true,
      state: { board } as unknown as GameState,
      finished: board.size >= 2,
    };
  }

  chooseMove(): Move | null {
    return null;
  }

  nextPlayer(_state: GameState, playerId: string): string {
    return playerId === "p1" ? "p2" : "p1";
  }

  isFinished(): boolean {
    return false;
  }

  serializeState(state: GameState): unknown {
    return { board: [...(state as unknown as SetState).board] };
  }

  deserializeState(data: unknown): GameState | null {
    if (typeof data !== "object" || data === null) return null;
    const raw = (data as { board?: unknown }).board;
    if (!Array.isArray(raw) || !raw.every((cell) => typeof cell === "string")) return null;
    return { board: new Set(raw as string[]) } as unknown as GameState;
  }

  serializeSettings(): unknown {
    return { level: this.level };
  }

  applySettings(data: unknown): void {
    if (typeof data !== "object" || data === null) return;
    const level = (data as { level?: unknown }).level;
    if (typeof level === "number") this.level = level;
  }
}

const setPlayers = [
  { id: "p1", name: "Первый", agent: "human", transport: "local" },
  { id: "p2", name: "Второй", agent: "human", transport: "local" },
] as const;

/** Платформа над общей памятью: глобальный стор и сохранения видят один бэкенд. */
function makeSetPlatform(backend = new MemoryBackend()): {
  platform: Platform;
  saves: GameSaves;
} {
  const store = createStore(backend);
  const saves = new GameSaves(createStore(backend));
  return { platform: new Platform(store, saves), saves };
}

/** Снимок running-партии с одним камнем «a» на доске и очередью p2. */
function runningSave(): SessionSave {
  return {
    players: setPlayers.map((player) => ({ ...player, properties: {} })),
    currentPlayerId: "p2",
    winnerId: null,
    state: "running",
    gameState: { board: ["a"] },
  };
}

describe("Platform: сохранения партий", () => {
  it("resumeSession без сохранения возвращает null", async () => {
    const { platform } = makeSetPlatform();

    await expect(platform.resumeSession(new SetGame())).resolves.toBeNull();
  });

  it("восстанавливает running-партию, применяя настройки и состояние", async () => {
    const { platform } = makeSetPlatform();
    await platform.saveGameSnapshot("set-game", { level: 5 }, runningSave());

    const game = new SetGame();
    const session = await platform.resumeSession(game);

    expect(session).not.toBeNull();
    expect(session!.snapshot().state).toBe("running");
    expect(game.level).toBe(5);
    // Доска из снимка: второй камень завершает партию, на пустой — не завершил бы.
    expect(session!.makeMove("p2", { cell: "b" })).toBe(true);
    expect(session!.snapshot().state).toBe("finished");
    session!.destroy();
  });

  it("снимок не running отбрасывается вместе с сессией, настройки целы", async () => {
    const { platform, saves } = makeSetPlatform();
    await platform.saveGameSnapshot(
      "set-game",
      { level: 5 },
      {
        ...runningSave(),
        state: "finished",
      },
    );

    await expect(platform.resumeSession(new SetGame())).resolves.toBeNull();
    await expect(saves.load("set-game")).resolves.toEqual({
      settings: { level: 5 },
      session: null,
    });
  });

  it("испорченный gameState отбрасывается вместе с сессией", async () => {
    const { platform, saves } = makeSetPlatform();
    await platform.saveGameSnapshot(
      "set-game",
      { level: 5 },
      {
        ...runningSave(),
        gameState: { board: "мусор" },
      },
    );

    await expect(platform.resumeSession(new SetGame())).resolves.toBeNull();
    await expect(saves.load("set-game")).resolves.toEqual({
      settings: { level: 5 },
      session: null,
    });
  });

  it("мусорный узел без data не роняет восстановление (регресс)", async () => {
    const backend = new MemoryBackend();
    const store = createStore(backend);
    const platform = new Platform(store, new GameSaves(createStore(backend)));
    // Узел мимо модуля: сессия без `data` — раньше проходила как валидная и
    // роняла `resumeSession` на чтении `save.state`.
    await store.write("game/set-game", { settings: { level: 1 }, session: { v: 1 } });

    await expect(platform.resumeSession(new SetGame())).resolves.toBeNull();
    await expect(platform.hasSavedSession("set-game")).resolves.toBe(false);
  });

  it("hasSavedSession и listSavedGames видят только непустую сессию", async () => {
    const { platform, saves } = makeSetPlatform();
    await platform.saveGameSnapshot("set-game", { level: 3 }, runningSave());

    await expect(platform.hasSavedSession("set-game")).resolves.toBe(true);
    await expect(platform.listSavedGames()).resolves.toEqual(["set-game"]);

    await platform.removeSessionSave("set-game");

    await expect(platform.hasSavedSession("set-game")).resolves.toBe(false);
    await expect(platform.listSavedGames()).resolves.toEqual([]);
    // Настройки после снятия снимка остаются.
    await expect(saves.load("set-game")).resolves.toEqual({
      settings: { level: 3 },
      session: null,
    });
  });

  it("dropGameSave удаляет узел целиком, вместе с настройками", async () => {
    const { platform, saves } = makeSetPlatform();
    await platform.saveGameSnapshot("set-game", { level: 3 }, runningSave());

    await platform.dropGameSave("set-game");

    await expect(platform.hasSavedSession("set-game")).resolves.toBe(false);
    await expect(platform.listSavedGames()).resolves.toEqual([]);
    await expect(saves.load("set-game")).resolves.toBeNull();
  });

  it("saveGameSnapshot пишет settings и снимок раздельно", async () => {
    const { platform, saves } = makeSetPlatform();

    await platform.saveGameSnapshot("set-game", { level: 7 }, runningSave());

    await expect(saves.load("set-game")).resolves.toEqual({
      settings: { level: 7 },
      session: { v: 1, data: runningSave() },
    });
  });
});

describe("Platform: управление данными (12-c)", () => {
  it("форма настроек содержит кнопки очистки", () => {
    const { platform } = makeSetPlatform();
    const ids = platform
      .globalForm()
      .nodes.flatMap((node) => (node.type === "group" ? node.children : []))
      .flatMap((node) => (node.type === "control" ? [node.control.id] : []));

    expect(ids).toContain("clear-saved-games");
    expect(ids).toContain("wipe-all-data");
  });

  it("clearSavedGames удаляет только выбранные", async () => {
    const { platform } = makeSetPlatform();
    await platform.saveGameSnapshot("a", null, runningSave());
    await platform.saveGameSnapshot("b", null, runningSave());

    await platform.clearSavedGames(["a"]);

    await expect(platform.listSavedGames()).resolves.toEqual(["b"]);
  });

  it("clearAllData убирает сохранения и глобальные настройки", async () => {
    const { platform } = makeSetPlatform();
    await platform.saveGameSnapshot("set-game", { level: 1 }, runningSave());
    await platform.saveGlobalSettings({
      name: "Гость",
      playerId: "pid-old",
      lastGameId: "set-game",
      themeMode: "dark",
    });

    await platform.clearAllData();

    await expect(platform.listSavedGames()).resolves.toEqual([]);
    const settings = await platform.loadGlobalSettings();
    // Настройки сброшены к значениям по умолчанию, id игрока — новый.
    expect(settings.name).toBe("Игрок");
    expect(settings.lastGameId).toBe("");
    expect(settings.playerId).not.toBe("pid-old");
    expect(settings.playerId.length).toBeGreaterThan(0);
  });

  it("hasAnyData видит настройки/сохранения и пустеет после сброса", async () => {
    const { platform } = makeSetPlatform();
    await platform.saveGlobalSettings({
      name: "Гость",
      playerId: "pid-1",
      lastGameId: "",
      themeMode: "system",
    });
    await expect(platform.hasAnyData()).resolves.toBe(true);

    await platform.clearAllData();
    await expect(platform.hasAnyData()).resolves.toBe(false);
  });
});
