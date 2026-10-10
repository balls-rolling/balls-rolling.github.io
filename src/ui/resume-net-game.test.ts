import { describe, expect, it, vi } from "vitest";
import { Game, type GameEntry, type GameState, type Move, type MoveResult } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { Session } from "@/core/session";
import type { Transport } from "@/core/net";
import type { DialogManager } from "@/ui/dialog/manager";
import type { NetLink } from "@/ui/net/link";
import type { SessionHost } from "@/ui/session-host";
import type { RestoreLobby, RestoreLobbyResult } from "@/ui/lobby/restore";
import { resumeNetworkGuest, resumeNetworkHost, type ResumeNetworkDeps } from "./resume-net-game";

// Фейки без Vue: координатор работает со структурными зависимостями.

type Player = {
  readonly id: string;
  readonly name: string;
  readonly transport: "local" | "remote";
};

/** Минимальная настоящая игра — нужна для создания сессии гостем. */
class StubGame extends Game {
  readonly id = "tic-tac";
  readonly label = "Крестики";

  createInitialState(playerIds: readonly string[]): GameState {
    return { order: [...playerIds] };
  }
  applyMove(state: GameState, _playerId: string, move: Move): MoveResult {
    if (typeof move.x !== "number" || typeof move.y !== "number") {
      return { accepted: false, state, finished: false };
    }
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
  serializeSettings(): unknown {
    return { level: 3 };
  }
}

function makeGame(): StubGame {
  return new StubGame();
}

function makeSession(players: readonly Player[]) {
  const raw = {
    isDemo: false,
    snapshot: vi.fn(() => ({ state: "running", isDemo: false, players })),
    subscribe: vi.fn(() => () => {}),
    save: vi.fn(() => ({})),
    destroy: vi.fn(),
    resume: vi.fn(),
  };
  return { session: raw as unknown as Session, raw };
}

function makeTransport(): Transport & { close: ReturnType<typeof vi.fn> } {
  return { close: vi.fn() } as unknown as Transport & { close: ReturnType<typeof vi.fn> };
}

function makeDeps(overrides: { resumeSession?: Session | null }): {
  deps: ResumeNetworkDeps;
  raw: {
    platform: Record<string, ReturnType<typeof vi.fn>>;
    sessionHost: Record<string, ReturnType<typeof vi.fn>>;
    dialog: Record<string, ReturnType<typeof vi.fn>>;
    netLink: Record<string, ReturnType<typeof vi.fn>>;
    restoreLobby: Record<string, ReturnType<typeof vi.fn>>;
  };
} {
  const game = makeGame();
  const platform = {
    createGame: vi.fn(async () => game),
    resumeSession: vi.fn(async () => overrides.resumeSession ?? null),
    loadGlobalSettings: vi.fn(async () => ({
      name: "Игрок",
      playerId: "gid",
      lastGameId: "",
      themeMode: "system",
    })),
    saveGlobalSettings: vi.fn(async () => {}),
  };
  const sessionHost = { set: vi.fn(), clear: vi.fn() };
  const dialog = { close: vi.fn() };
  const netLink = { configure: vi.fn(), attach: vi.fn() };
  const restoreLobby = { showHostRestore: vi.fn(), showClientRestore: vi.fn() };

  const deps: ResumeNetworkDeps = {
    platform: platform as unknown as Platform,
    sessionHost: sessionHost as unknown as SessionHost,
    dialog: dialog as unknown as DialogManager,
    netLink: netLink as unknown as NetLink,
    restoreLobby: restoreLobby as unknown as RestoreLobby,
  };
  return { deps, raw: { platform, sessionHost, dialog, netLink, restoreLobby } };
}

const ENTRY: GameEntry = { id: "tic-tac", label: "Крестики", entry: async () => new StubGame() };

const HOST_PLAYERS: readonly Player[] = [
  { id: "p1", name: "Хост", transport: "local" },
  { id: "p2", name: "Гость", transport: "remote" },
];

function result(overrides: Partial<RestoreLobbyResult> = {}): RestoreLobbyResult {
  return {
    transport: makeTransport(),
    ownPlayerId: "p1",
    remotePlayerId: "p2",
    ownName: "Хост",
    ...overrides,
  };
}

describe("resumeNetworkHost", () => {
  it("успех: конфигурирует сеть с раздачей состояния, кладёт сессию, продолжает", async () => {
    const { session, raw: sessionRaw } = makeSession(HOST_PLAYERS);
    const { deps, raw } = makeDeps({ resumeSession: session });
    raw.restoreLobby.showHostRestore!.mockResolvedValue(result());

    await expect(resumeNetworkHost(ENTRY, deps)).resolves.toBe(true);

    expect(raw.restoreLobby.showHostRestore).toHaveBeenCalledWith({
      gameId: "tic-tac",
      ownPlayerId: "p1",
      players: [
        { id: "p1", name: "Хост" },
        { id: "p2", name: "Гость" },
      ],
    });
    expect(raw.netLink.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        remotePlayerId: "p2",
        ownName: "Хост",
        ownPlayerId: "p1",
        outgoingState: expect.any(Function),
      }),
    );
    expect(raw.sessionHost.set).toHaveBeenCalledWith(session, expect.anything());
    expect(raw.netLink.attach).toHaveBeenCalledWith(session);
    expect(sessionRaw.resume).toHaveBeenCalled();
    expect(raw.dialog.close).toHaveBeenCalled();
    expect(sessionRaw.destroy).not.toHaveBeenCalled();
  });

  it("нет сохранения — false и лобби не открывается", async () => {
    const { deps, raw } = makeDeps({ resumeSession: null });

    await expect(resumeNetworkHost(ENTRY, deps)).resolves.toBe(false);
    expect(raw.restoreLobby.showHostRestore).not.toHaveBeenCalled();
  });

  it("human-local не первый в составе — destroy и false", async () => {
    const players: readonly Player[] = [
      { id: "p1", name: "Хост", transport: "remote" },
      { id: "p2", name: "Гость", transport: "local" },
    ];
    const { session, raw: sessionRaw } = makeSession(players);
    const { deps, raw } = makeDeps({ resumeSession: session });

    await expect(resumeNetworkHost(ENTRY, deps)).resolves.toBe(false);
    expect(sessionRaw.destroy).toHaveBeenCalled();
    expect(raw.restoreLobby.showHostRestore).not.toHaveBeenCalled();
  });

  it("отмена лобби — destroy и false", async () => {
    const { session, raw: sessionRaw } = makeSession(HOST_PLAYERS);
    const { deps, raw } = makeDeps({ resumeSession: session });
    raw.restoreLobby.showHostRestore!.mockResolvedValue(null);

    await expect(resumeNetworkHost(ENTRY, deps)).resolves.toBe(false);
    expect(sessionRaw.destroy).toHaveBeenCalled();
    expect(raw.netLink.configure).not.toHaveBeenCalled();
  });
});

describe("resumeNetworkGuest", () => {
  it("создаёт сессию заново (без снимка) и подключает свежий транспорт", async () => {
    const { deps, raw } = makeDeps({});
    const restore = result({ ownPlayerId: "p2", remotePlayerId: "p1", ownName: "Гость" });
    raw.restoreLobby.showClientRestore!.mockResolvedValue(restore);

    await expect(resumeNetworkGuest(ENTRY, "offer", deps)).resolves.toBe(true);

    expect(raw.restoreLobby.showClientRestore).toHaveBeenCalledWith({
      gameId: "tic-tac",
      ownPlayerId: "gid",
      offer: "offer",
    });
    // Гость не читает снимок из хранилища.
    expect(raw.platform.resumeSession).not.toHaveBeenCalled();
    expect(raw.netLink.configure).toHaveBeenCalledWith({
      transport: restore.transport,
      remotePlayerId: "p1",
      ownName: "Гость",
      ownPlayerId: "p2",
    });

    const session = raw.sessionHost.set.mock.calls[0]?.[0] as Session;
    expect(session).toBeTruthy();
    expect(session.snapshot().state).toBe("running");
    expect(session.snapshot().players.map((p) => [p.id, p.transport])).toEqual([
      ["p1", "remote"],
      ["p2", "local"],
    ]);
    expect(raw.netLink.attach).toHaveBeenCalledWith(session);
    expect(raw.dialog.close).toHaveBeenCalled();
  });

  it("отмена лобби — false, без настройки сети", async () => {
    const { deps, raw } = makeDeps({});
    raw.restoreLobby.showClientRestore!.mockResolvedValue(null);

    await expect(resumeNetworkGuest(ENTRY, "offer", deps)).resolves.toBe(false);
    expect(raw.netLink.configure).not.toHaveBeenCalled();
    expect(raw.sessionHost.set).not.toHaveBeenCalled();
  });
});
