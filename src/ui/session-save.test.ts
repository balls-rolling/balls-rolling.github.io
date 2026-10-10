import { describe, expect, it, vi } from "vitest";
import type { SessionSave } from "@/core/session";
import {
  attachSessionSave,
  isPersistable,
  type SaveableGame,
  type SaveablePlatform,
  type SaveableSession,
  type SaveableSnapshot,
} from "./session-save";

// Заглушки без Vue: координатор работает только со структурными интерфейсами,
// поэтому сессия, игра и платформа подменяются простыми объектами.

const SAVE = { marker: "save" } as unknown as SessionSave;

const RUNNING: SaveableSnapshot = { state: "running", isDemo: false, players: [] };

function makeSession() {
  let listener: ((snapshot: SaveableSnapshot) => void) | null = null;
  let snapshot: SaveableSnapshot = { state: "idle", isDemo: false, players: [] };
  const raw = {
    isDemo: false,
    subscribe: vi.fn((next: (snapshot: SaveableSnapshot) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    }),
    snapshot: vi.fn(() => snapshot),
    save: vi.fn(() => SAVE),
  };
  return {
    session: raw as unknown as SaveableSession,
    raw,
    emit(next: SaveableSnapshot) {
      snapshot = next;
      raw.isDemo = next.isDemo;
      listener?.(next);
    },
  };
}

function makeGame() {
  return {
    id: "tic-tac",
    serializeSettings: vi.fn(() => ({ level: 3 })),
  } as unknown as SaveableGame & { serializeSettings: ReturnType<typeof vi.fn> };
}

function makePlatform() {
  const platform = {
    saveGameSnapshot: vi.fn(),
    removeSessionSave: vi.fn(),
  };
  return platform as unknown as SaveablePlatform & {
    saveGameSnapshot: ReturnType<typeof vi.fn>;
    removeSessionSave: ReturnType<typeof vi.fn>;
  };
}

describe("attachSessionSave", () => {
  it("сохраняет на каждый running-снимок с настройками и снимком сессии", () => {
    const { session, emit } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    attachSessionSave({ session, game, platform });

    emit(RUNNING);
    emit(RUNNING);

    expect(platform.saveGameSnapshot).toHaveBeenCalledTimes(2);
    expect(platform.saveGameSnapshot).toHaveBeenCalledWith("tic-tac", { level: 3 }, SAVE);
    expect(game.serializeSettings).toHaveBeenCalledTimes(2);
  });

  it("на finished удаляет снимок сессии", () => {
    const { session, emit } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    attachSessionSave({ session, game, platform });

    emit({ state: "finished", isDemo: false, players: [] });

    expect(platform.removeSessionSave).toHaveBeenCalledTimes(1);
    expect(platform.removeSessionSave).toHaveBeenCalledWith("tic-tac");
    expect(platform.saveGameSnapshot).not.toHaveBeenCalled();
  });

  it("демо-сессию не сохраняет и не удаляет", () => {
    const { session, emit } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    attachSessionSave({ session, game, platform });

    emit({ state: "running", isDemo: true, players: [] });
    emit({ state: "finished", isDemo: true, players: [] });

    expect(platform.saveGameSnapshot).not.toHaveBeenCalled();
    expect(platform.removeSessionSave).not.toHaveBeenCalled();
    expect(game.serializeSettings).not.toHaveBeenCalled();
  });

  it("сетевую сессию ХОСТА сохраняет и удаляет снимок при завершении", () => {
    const { session, emit } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    attachSessionSave({ session, game, platform });

    const players = [
      { id: "p1", transport: "local" },
      { id: "p2", transport: "remote" },
    ];
    emit({ state: "running", isDemo: false, players });
    emit({ state: "finished", isDemo: false, players });

    expect(platform.saveGameSnapshot).toHaveBeenCalledTimes(1);
    expect(platform.saveGameSnapshot).toHaveBeenCalledWith("tic-tac", { level: 3 }, SAVE);
    expect(platform.removeSessionSave).toHaveBeenCalledTimes(1);
    expect(platform.removeSessionSave).toHaveBeenCalledWith("tic-tac");
  });

  it("сетевую сессию ГОСТЯ не сохраняет (помнит только хост)", () => {
    const { session, emit } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    attachSessionSave({ session, game, platform });

    const players = [
      { id: "p1", transport: "remote" },
      { id: "p2", transport: "local" },
    ];
    emit({ state: "running", isDemo: false, players });
    emit({ state: "finished", isDemo: false, players });

    expect(platform.saveGameSnapshot).not.toHaveBeenCalled();
    expect(platform.removeSessionSave).not.toHaveBeenCalled();
  });

  it("idle не сохраняет", () => {
    const { session, emit } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    attachSessionSave({ session, game, platform });

    emit({ state: "idle", isDemo: false, players: [] });

    expect(platform.saveGameSnapshot).not.toHaveBeenCalled();
    expect(platform.removeSessionSave).not.toHaveBeenCalled();
  });

  it("отписка прекращает запись", () => {
    const { session, emit, raw } = makeSession();
    const game = makeGame();
    const platform = makePlatform();

    const detach = attachSessionSave({ session, game, platform });

    emit(RUNNING);
    detach();
    emit(RUNNING);

    expect(platform.saveGameSnapshot).toHaveBeenCalledTimes(1);
    expect(raw.subscribe).toHaveBeenCalledTimes(1);
  });
});

describe("isPersistable", () => {
  function stub(
    isDemo: boolean,
    players: readonly { id: string; transport: string }[],
  ): SaveableSession {
    return {
      isDemo,
      subscribe: () => () => {},
      snapshot: () => ({ state: "running", isDemo, players }),
      save: () => SAVE,
    };
  }

  it("демо — не сохраняется", () => {
    expect(isPersistable(stub(true, []))).toBe(false);
  });

  it("сетевая партия хоста — сохраняется", () => {
    expect(
      isPersistable(
        stub(false, [
          { id: "p1", transport: "local" },
          { id: "p2", transport: "remote" },
        ]),
      ),
    ).toBe(true);
  });

  it("сетевая партия гостя — не сохраняется", () => {
    expect(
      isPersistable(
        stub(false, [
          { id: "p1", transport: "remote" },
          { id: "p2", transport: "local" },
        ]),
      ),
    ).toBe(false);
  });

  it("локальная партия — сохраняется", () => {
    expect(
      isPersistable(
        stub(false, [
          { id: "p1", transport: "local" },
          { id: "p2", transport: "local" },
        ]),
      ),
    ).toBe(true);
  });
});
