import { describe, expect, it, vi } from "vitest";
import type { GameEntry } from "@/core/game";
import type { GlobalSettings } from "@/core/platform";
import { resumeGame, type ResumeGameDeps } from "./resume-game";

// Заглушки без Vue: `resumeGame` работает только с методами платформы, слота и
// менеджера диалогов, а автосохранение подписывается на структурную сессию.
//
// Сетевой путь (12-b) проверяем через фейковые `netLink`/`restoreLobby`: реальный
// `resumeNetworkHost` уже покрыт своим тестом, здесь важна маршрутизация.

const SETTINGS: GlobalSettings = {
  name: "Игрок",
  playerId: "pid-1",
  lastGameId: "",
  themeMode: "system",
};

const ENTRY = { id: "tic-tac", label: "Крестики-нолики" } as unknown as GameEntry;

const LOCAL_PLAYERS = [
  { id: "p1", name: "Первый", agent: "human", transport: "local" },
  { id: "p2", name: "Второй", agent: "human", transport: "local" },
];

const NETWORK_PLAYERS = [
  { id: "p1", name: "Первый", agent: "human", transport: "local" },
  { id: "p2", name: "Второй", agent: "human", transport: "remote" },
];

function makeGame(): unknown {
  return { id: "tic-tac", detachEnvironment: vi.fn() };
}

function makeSession(players: readonly unknown[] = []) {
  return {
    resume: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    snapshot: vi.fn(() => ({ state: "running", isDemo: false, players })),
    save: vi.fn(),
    isDemo: false,
    destroy: vi.fn(),
  };
}

interface DepsOptions {
  resumeSession?: () => Promise<unknown>;
  players?: readonly unknown[];
  withNetwork?: boolean;
  restoreHost?: unknown;
}

function makeDeps(options: DepsOptions = {}) {
  const game = makeGame();
  const session = makeSession(options.players ?? []);
  const platform = {
    createGame: vi.fn(async () => game),
    resumeSession: vi.fn(options.resumeSession ?? (async () => session)),
    loadGlobalSettings: vi.fn(async () => SETTINGS),
    saveGlobalSettings: vi.fn(async () => {}),
  };
  const sessionHost = { set: vi.fn() };
  const dialog = { close: vi.fn() };
  const transport = { close: vi.fn(), name: "transport" };
  const netLink = { configure: vi.fn(), attach: vi.fn(), detach: vi.fn() };
  const restoreLobby = {
    showHostRestore: vi.fn(
      async () =>
        options.restoreHost ??
        ({
          transport,
          ownPlayerId: "p1",
          remotePlayerId: "p2",
          ownName: "Первый",
        } as unknown),
    ),
    showClientRestore: vi.fn(async () => null),
  };

  const deps = {
    platform,
    sessionHost,
    dialog,
    ...(options.withNetwork ? { netLink, restoreLobby } : {}),
  } as unknown as ResumeGameDeps;

  return { deps, game, session, platform, sessionHost, dialog, netLink, restoreLobby };
}

describe("resumeGame", () => {
  it("восстанавливает партию и возвращает true", async () => {
    const { deps, game, session, platform, sessionHost, dialog } = makeDeps();

    const result = await resumeGame(ENTRY, deps);

    expect(result).toBe(true);
    expect(platform.createGame).toHaveBeenCalledWith(ENTRY);
    expect(platform.resumeSession).toHaveBeenCalledWith(game);
    expect(sessionHost.set).toHaveBeenCalledWith(session, game);
    expect(session.resume).toHaveBeenCalledTimes(1);
    expect(platform.saveGlobalSettings).toHaveBeenCalledWith({
      ...SETTINGS,
      lastGameId: ENTRY.id,
    });
    expect(dialog.close).toHaveBeenCalledTimes(1);
  });

  it("без сохранения возвращает false и ничего не трогает", async () => {
    const { deps, session, platform, sessionHost, dialog } = makeDeps({
      resumeSession: async () => null,
    });

    const result = await resumeGame(ENTRY, deps);

    expect(result).toBe(false);
    expect(sessionHost.set).not.toHaveBeenCalled();
    expect(session.resume).not.toHaveBeenCalled();
    expect(session.subscribe).not.toHaveBeenCalled();
    expect(platform.saveGlobalSettings).not.toHaveBeenCalled();
    expect(dialog.close).not.toHaveBeenCalled();
  });

  it("локальный снимок идёт прежним путём, сеть не трогает", async () => {
    const { deps, session, sessionHost, netLink, restoreLobby } = makeDeps({
      players: LOCAL_PLAYERS,
      withNetwork: true,
    });

    const result = await resumeGame(ENTRY, deps);

    expect(result).toBe(true);
    expect(session.destroy).not.toHaveBeenCalled();
    expect(restoreLobby.showHostRestore).not.toHaveBeenCalled();
    expect(netLink.configure).not.toHaveBeenCalled();
    expect(sessionHost.set).toHaveBeenCalledWith(session, expect.anything());
  });

  it("снимок с remote-игроком уходит в сетевое восстановление", async () => {
    const { deps, session, netLink, restoreLobby } = makeDeps({
      players: NETWORK_PLAYERS,
      withNetwork: true,
    });

    const result = await resumeGame(ENTRY, deps);

    // Первая сессия освобождается, дальше маршрут ведёт `resumeNetworkHost`.
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(restoreLobby.showHostRestore).toHaveBeenCalledTimes(1);
    expect(netLink.configure).toHaveBeenCalledTimes(1);
    expect(netLink.attach).toHaveBeenCalledTimes(1);
    expect(result).toBe(true);
  });

  it("сетевой снимок без netLink/restoreLobby — false и сессия уничтожена", async () => {
    const { deps, session, restoreLobby } = makeDeps({ players: NETWORK_PLAYERS });

    const result = await resumeGame(ENTRY, deps);

    expect(result).toBe(false);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    // Фейковый restoreLobby не подключён — обращений не было.
    expect(restoreLobby.showHostRestore).not.toHaveBeenCalled();
  });
});
