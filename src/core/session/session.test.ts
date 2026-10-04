import { afterEach, describe, expect, it, vi } from "vitest";
import { Game, type GameRenderFrame, type GameState, type Move, type MoveResult } from "../game";
import { Session } from "./session";

// Тестовая игра: считает ходы и заканчивается на заданном числе.
// Полностью чистая: состояние приходит параметром, новое возвращается в
// результате — как и требует контракт.
interface CounterState extends GameState {
  readonly order: readonly string[];
  readonly counts: Readonly<Record<string, number>>;
  readonly turns: number;
}

class CounterGame extends Game {
  readonly id = "counter";
  readonly label = "Счётчик";

  constructor(private readonly finishAt: number) {
    super();
  }

  createInitialState(playerIds: readonly string[]): GameState {
    const counts: Record<string, number> = {};
    for (const id of playerIds) counts[id] = 0;
    return { order: [...playerIds], counts, turns: 0 } satisfies CounterState;
  }

  applyMove(state: GameState, playerId: string, move: Move): MoveResult {
    const current = state as CounterState;
    if (typeof move.step !== "number") {
      return { accepted: false, state, finished: false };
    }

    const counts = { ...current.counts, [playerId]: (current.counts[playerId] ?? 0) + 1 };
    const turns = current.turns + 1;
    const next: CounterState = { ...current, counts, turns };

    const finished = turns >= this.finishAt;
    return {
      accepted: true,
      state: next,
      finished,
      winnerId: finished ? playerId : null,
    };
  }

  chooseMove(): Move {
    return { step: 1 };
  }

  nextPlayer(state: GameState, playerId: string): string {
    const { order } = state as CounterState;
    const index = order.indexOf(playerId);
    return order[(index + 1) % order.length]!;
  }

  isFinished(state: GameState): boolean {
    return (state as CounterState).turns >= this.finishAt;
  }
  getPropertySchema() {
    return { specs: [] };
  }
}

function makeSession(finishAt = 2) {
  return new Session({
    game: new CounterGame(finishAt),
    players: [
      { id: "p1", name: "Первый", agent: "human", transport: "local" },
      { id: "p2", name: "Второй", agent: "human", transport: "local" },
    ],
    computerDelayMs: 100,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Session", () => {
  it("до старта находится в idle", () => {
    const session = makeSession();
    expect(session.snapshot().state).toBe("idle");
  });

  it("start переводит в running и назначает первого игрока", () => {
    const session = makeSession();
    session.start();

    const snapshot = session.snapshot();
    expect(snapshot.state).toBe("running");
    expect(snapshot.currentPlayerId).toBe("p1");
  });

  it("ход переводит очередь следующему игроку", () => {
    const session = makeSession();
    session.start();

    expect(session.makeMove("p1", { step: 1 })).toBe(true);
    expect(session.snapshot().currentPlayerId).toBe("p2");
  });

  it("отклоняет ход не в свою очередь", () => {
    const session = makeSession();
    session.start();

    expect(session.makeMove("p2", { step: 1 })).toBe(false);
    expect(session.snapshot().currentPlayerId).toBe("p1");
  });

  it("отклонённый ход не меняет состояние", () => {
    const session = makeSession();
    session.start();
    const before = session.snapshot().revision;

    session.makeMove("p1", { notAStep: true });

    expect(session.snapshot().revision).toBe(before);
  });

  it("завершает партию и запоминает победителя", () => {
    const session = makeSession(2);
    session.start();

    session.makeMove("p1", { step: 1 });
    session.makeMove("p2", { step: 1 });

    const snapshot = session.snapshot();
    expect(snapshot.state).toBe("finished");
    expect(snapshot.winnerId).toBe("p2");
    expect(snapshot.currentPlayerId).toBeNull();
  });

  it("после завершения ходы не принимаются", () => {
    const session = makeSession(1);
    session.start();
    session.makeMove("p1", { step: 1 });

    expect(session.makeMove("p2", { step: 1 })).toBe(false);
  });

  it("restart возвращает партию в игру", () => {
    const session = makeSession(1);
    session.start();
    session.makeMove("p1", { step: 1 });

    session.restart();

    const snapshot = session.snapshot();
    expect(snapshot.state).toBe("running");
    expect(snapshot.currentPlayerId).toBe("p1");
    expect(snapshot.winnerId).toBeNull();
  });

  it("снимок — новый объект на изменение, revision растёт", () => {
    const session = makeSession();
    session.start();

    const first = session.snapshot();
    session.makeMove("p1", { step: 1 });
    const second = session.snapshot();

    expect(second).not.toBe(first);
    expect(second.revision).toBeGreaterThan(first.revision);
  });

  it("подписчик получает свежий снимок, отписка прекращает уведомления", () => {
    const session = makeSession();
    const listener = vi.fn();
    const off = session.subscribe(listener);

    session.start();
    off();
    session.makeMove("p1", { step: 1 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].state).toBe("running");
  });

  it("ход компьютера откладывается и выполняется по таймеру", async () => {
    vi.useFakeTimers();
    const session = new Session({
      game: new CounterGame(5),
      players: [
        { id: "p1", name: "Человек", agent: "human", transport: "local" },
        { id: "p2", name: "Комп", agent: "computer", transport: "local" },
      ],
      computerDelayMs: 100,
    });

    session.start();
    session.makeMove("p1", { step: 1 });
    expect(session.snapshot().currentPlayerId).toBe("p2");

    await vi.advanceTimersByTimeAsync(100);

    expect(session.snapshot().currentPlayerId).toBe("p1");
  });

  it("destroy снимает запланированный ход компьютера", async () => {
    vi.useFakeTimers();
    const session = new Session({
      game: new CounterGame(5),
      players: [
        { id: "p1", name: "Человек", agent: "human", transport: "local" },
        { id: "p2", name: "Комп", agent: "computer", transport: "local" },
      ],
      computerDelayMs: 100,
    });

    session.start();
    session.makeMove("p1", { step: 1 });
    session.destroy();

    await vi.advanceTimersByTimeAsync(100);

    expect(session.snapshot().currentPlayerId).toBe("p2");
  });

  it("переименовывает игрока и уведомляет подписчиков", () => {
    const session = makeSession();
    session.start();
    const listener = vi.fn();
    session.subscribe(listener);

    expect(session.renamePlayer("p1", "Вадим")).toBe(true);
    expect(session.snapshot().players[0]!.name).toBe("Вадим");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("не переименовывает несуществующего игрока", () => {
    const session = makeSession();
    session.start();

    expect(session.renamePlayer("нет-такого", "Вадим")).toBe(false);
  });

  it("демо-сессия помечает себя флагом", () => {
    const session = new Session({
      game: new CounterGame(5),
      players: [{ id: "p1", name: "Демо", agent: "computer", transport: "local" }],
      options: { demo: true },
      computerDelayMs: 100,
    });

    expect(session.isDemo).toBe(true);
    expect(session.snapshot().isDemo).toBe(true);
  });

  it("draw делегирует отрисовку игре, а destroy прекращает", () => {
    const game = new CounterGame(3);
    const spy = vi.spyOn(game, "draw");
    const session = new Session({
      game,
      players: [
        { id: "p1", name: "Первый", agent: "human", transport: "local" },
        { id: "p2", name: "Второй", agent: "human", transport: "local" },
      ],
      computerDelayMs: 100,
    });
    session.start();

    const frame = { dpr: 1 } as unknown as GameRenderFrame;
    session.draw(frame);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[1]).toBe(frame);

    session.destroy();
    session.draw(frame);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
