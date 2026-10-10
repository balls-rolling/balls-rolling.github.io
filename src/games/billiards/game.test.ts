import { describe, expect, it, vi } from "vitest";
import type { FormHandle, SignalListener } from "@/core/form";
import {
  Game,
  type GameEnvironment,
  type GameState,
  type Move,
  type MoveResult,
} from "@/core/game";
import type { PlayerInit } from "@/core/player";
import { BilliardsGame } from "./game";
import { Session } from "@/core/session/session";
import { HEAD_SPOT } from "./constants";
import { applyShot } from "./physics";
import type { BilliardsState } from "./state";

/** Минимальная игра без переопределения — чтобы проверить дефолт контракта. */
class MinimalGame extends Game {
  readonly id = "minimal";
  readonly label = "Минимальная";
  createInitialState(): GameState {
    return {};
  }
  applyMove(state: GameState, _playerId: string, _move: Move): MoveResult {
    return { accepted: false, state, finished: false };
  }
  chooseMove(): null {
    return null;
  }
  nextPlayer(): null {
    return null;
  }
  isFinished(): boolean {
    return false;
  }
}

interface FakeSetup {
  readonly handle: FormHandle;
  press(): void;
  pressCount(): number;
}

function fakeSetup(): FakeSetup {
  const handlers = new Map<string, SignalListener>();
  let count = 0;
  const handle = {
    getSnapshot: () => ({ values: {} }),
    getValue: () => undefined,
    setValue: () => undefined,
    patch: () => undefined,
    on: (selector: string, signal: string, listener: SignalListener) => {
      const key = `${selector}:${signal}`;
      handlers.set(key, listener);
      return () => handlers.delete(key);
    },
    emit: (id: string, signal: string, payload?: unknown) => {
      handlers.get(`${id}:${signal}`)?.(payload);
    },
    destroy: () => undefined,
  } as unknown as FormHandle;
  return {
    handle,
    press: () => {
      count += 1;
      handle.emit("run", "press");
    },
    pressCount: () => count,
  };
}

function fakeEnvironment(
  launch: GameEnvironment["launch"],
  players: readonly PlayerInit[],
  setup: FormHandle,
): GameEnvironment {
  return {
    game: { id: "billiards", label: "Бильярд", setup },
    lobby: {
      defaultPlayers: vi.fn().mockResolvedValue(players),
      showHost: vi.fn(),
      showClient: vi.fn(),
    },
    launch,
  } as unknown as GameEnvironment;
}

function makeLaunch() {
  return vi.fn().mockResolvedValue({
    snapshot: () => ({}),
    subscribe: () => () => undefined,
    renamePlayer: () => false,
    makeMove: () => false,
  });
}

describe("BilliardsGame", () => {
  it("id и label", () => {
    const game = new BilliardsGame();
    expect(game.id).toBe("billiards");
    expect(game.label).toBe("Бильярд");
  });

  it("есть форма преднастройки с кнопкой запуска", () => {
    const game = new BilliardsGame();
    const ids: string[] = [];
    for (const node of game.getSetupForm().nodes) {
      if (node.type === "control") ids.push(node.control.id);
      if (node.type === "group") {
        for (const child of node.children) {
          if (child.type === "control") ids.push(child.control.id);
        }
      }
    }
    expect(ids).toContain("run");
  });

  it("начальное состояние — 16 шаров", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    expect(state.balls).toHaveLength(16);
  });

  it("раунд-трип через методы игры", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]);
    expect(game.deserializeState(game.serializeState(state))).toEqual(state);
  });

  it("отклонённый ход не меняет состояние", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]);
    const result = game.applyMove(state, "p1", {});
    expect(result.accepted).toBe(false);
    expect(result.state).toBe(state);
  });

  it("кнопка преднастройки запускает игру", async () => {
    const game = new BilliardsGame();
    const players: PlayerInit[] = [{ id: "p1", name: "A", agent: "human", transport: "local" }];
    const launch = makeLaunch();
    const setup = fakeSetup();
    game.attachEnvironment(fakeEnvironment(launch, players, setup.handle));

    setup.press();
    await vi.waitFor(() => {
      expect(launch).toHaveBeenCalledWith(players);
    });
    game.detachEnvironment();
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("detachEnvironment снимает подписку", () => {
    const game = new BilliardsGame();
    const launch = makeLaunch();
    const setup = fakeSetup();
    game.attachEnvironment(fakeEnvironment(launch, [], setup.handle));
    game.detachEnvironment();
    setup.press();
    expect(launch).not.toHaveBeenCalled();
  });

  it("ход-удар принимается, turn не меняется", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0.3 });
    expect(result.accepted).toBe(true);
    const next = result.state as BilliardsState;
    expect(next.turn).toBe(state.turn);
    expect(next.balls[0]?.x).not.toBe(state.balls[0]?.x);
    expect(next.balls[0]?.vx).toBe(0);
  });

  it("мусорный ход отклонён, состояние не меняется", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]);
    const empty = game.applyMove(state, "p1", {});
    expect(empty.accepted).toBe(false);
    expect(empty.state).toBe(state);
    expect(game.applyMove(state, "p1", { angle: 0, power: 2 }).accepted).toBe(false);
  });

  it("раунд-трип после удара", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]);
    const result = game.applyMove(state, "p1", { angle: 0.3, power: 0.4 });
    expect(game.deserializeState(game.serializeState(result.state))).toEqual(result.state);
  });

  it("нулевая сила: ход принят, но шар не двигается", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0 });
    expect(result.accepted).toBe(true);
    const next = result.state as BilliardsState;
    expect(next.balls[0]).toEqual(state.balls[0]);
  });

  it("объявляет фиксированную камеру; панель участников системная со статистикой", () => {
    expect(new BilliardsGame().getViewOptions()).toEqual({
      zoom: false,
      pan: false,
      grid: false,
      playersStats: true,
    });
    expect(new BilliardsGame().getViewOptions().playersPanel).not.toBe(false);
  });

  it("дефолт getViewOptions — всё включено, статистика панели скрыта", () => {
    expect(new MinimalGame().getViewOptions()).toEqual({
      zoom: true,
      pan: true,
      grid: true,
      playersPanel: true,
      playersStats: false,
    });
  });

  it("дефолт getUiLayout — зон нет", () => {
    expect(new MinimalGame().getUiLayout()).toEqual({ zones: {} });
    expect(new BilliardsGame().getUiLayout()).toEqual({ zones: {} });
  });

  it("анимация удара: старт → покой, итог равен applyShot", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    const shot = { angle: 0.2, power: 0.3 };
    expect(game.startShot(shot, state)).toBe(true);
    expect(game.isAnimating()).toBe(true);
    let guard = 0;
    while (game.isAnimating() && guard < 200000) {
      game.advance(1 / 60);
      guard += 1;
    }
    expect(game.isAnimating()).toBe(false);
    expect(game.getAnimationResult()).toEqual(applyShot(state, shot));
  });

  it("advance без активного реплея возвращает false", () => {
    expect(new BilliardsGame().advance(1 / 60)).toBe(false);
  });

  it("прицел хранится и снимается", () => {
    const game = new BilliardsGame();
    expect(game.getAim()).toBeNull();
    game.setAim(1.2);
    expect(game.getAim()).toBe(1.2);
    game.setAim(null);
    expect(game.getAim()).toBeNull();
  });

  it("resetRuntime сбрасывает анимацию, прицел и итог", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    game.setAim(1);
    game.startShot({ angle: 0, power: 0.3 }, state);
    expect(game.isAnimating()).toBe(true);
    game.resetRuntime();
    expect(game.isAnimating()).toBe(false);
    expect(game.getAim()).toBeNull();
    expect(game.getAnimationResult()).toBeNull();
  });

  it("startShot гасит прицел на время удара", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    game.setAim(0.7);
    expect(game.startShot({ angle: 0.7, power: 0.3 }, state)).toBe(true);
    expect(game.getAim()).toBeNull();
  });

  it("detachEnvironment не трогает запущенный реплей", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    game.attachEnvironment(
      fakeEnvironment(
        makeLaunch(),
        [{ id: "p1", name: "A", agent: "human", transport: "local" }],
        fakeSetup().handle,
      ),
    );
    game.startShot({ angle: 0, power: 0.3 }, state);
    game.detachEnvironment();
    expect(game.isAnimating()).toBe(true);
  });

  it("удар путём кнопки «Удар» принимается сессией, revision растёт", () => {
    const game = new BilliardsGame();
    const session = new Session({
      game,
      players: [
        { id: "p1", name: "Первый", agent: "human", transport: "local" },
        { id: "p2", name: "Второй", agent: "human", transport: "local" },
      ],
      computerDelayMs: 50,
    });
    session.start();
    const before = session.snapshot().revision;
    const playerId = session.snapshot().currentPlayerId;
    expect(playerId).not.toBeNull();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    expect(game.startShot({ angle: 0, power: 0.5 }, state)).toBe(true);
    expect(session.makeMove(playerId!, { angle: 0, power: 0.5 })).toBe(true);
    expect(session.snapshot().revision).toBe(before + 1);
  });

  it("постановка битка в «кухне» до стартовой линии", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0, cueX: 400, cueY: 1000 });
    expect(result.accepted).toBe(true);
    const cue = (result.state as BilliardsState).balls.find((b) => b.id === 0);
    expect(cue?.x).toBeCloseTo(400, 6);
    expect(cue?.y).toBeCloseTo(1000, 6);
  });

  it("биток не задвигается за стартовую линию", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0, cueX: 2000, cueY: 635 });
    const cue = (result.state as BilliardsState).balls.find((b) => b.id === 0);
    expect(cue?.x).toBeCloseTo(HEAD_SPOT.x, 6);
  });

  it("можно ставить биток только до первого удара", () => {
    const game = new BilliardsGame();
    expect(game.canPlaceCue()).toBe(true);
    const state = game.createInitialState(["p1"]) as BilliardsState;
    game.applyMove(state, "p1", { angle: 0, power: 0.2 });
    expect(game.canPlaceCue()).toBe(false);
  });

  it("удар без cueY не трогает позицию битка", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    const cueBefore = state.balls.find((b) => b.id === 0);
    const result = game.applyMove(state, "p1", { angle: 0, power: 0 });
    const cueAfter = (result.state as BilliardsState).balls.find((b) => b.id === 0);
    expect(cueAfter?.x).toBeCloseTo(cueBefore!.x, 6);
    expect(cueAfter?.y).toBeCloseTo(cueBefore!.y, 6);
  });
});
