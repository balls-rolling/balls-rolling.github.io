import { describe, expect, it, vi } from "vitest";
import type { Control, FormHandle, FormNode, FormSchema, SignalListener } from "@/core/form";
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
import { BALL_RADIUS, HEAD_SPOT, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { BASE_8BALL } from "./modes/base8ball";
import { buildTableGeometry } from "./geometry";
import { applyShot } from "./physics";
import { createInitialState, type BilliardsState } from "./state";

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

  it("ход-удар принимается, состояние разбирается правилами", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0.3 });
    expect(result.accepted).toBe(true);
    const next = result.state as BilliardsState;
    // Очередь теперь решают правила (забил свой — остался, иначе смена), а не
    // сам факт хода; после удара состояние покоя и счётчик выросли.
    expect(next.turn).toBeGreaterThanOrEqual(0);
    expect(next.shotSeq).toBe(1);
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
    expect(game.getAnimationResult()).toEqual(applyShot(state, shot, buildTableGeometry(BASE_8BALL)));
  });

  it("advance без активного реплея возвращает false", () => {
    expect(new BilliardsGame().advance(1 / 60)).toBe(false);
  });

  it("прицел хранится на текущем участнике и снимается", () => {
    const game = new BilliardsGame();
    game.createInitialState(["p1"]);
    game.setRoster([{ id: "p1", name: "Первый", agent: "human", transport: "local" }]);
    expect(game.getAim()).toBeNull();
    game.setAim(1.2);
    expect(game.getAim()).toBe(1.2);
    game.setAim(null);
    expect(game.getAim()).toBeNull();
  });

  it("resetRuntime сбрасывает анимацию и итог, но не прицел участника", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    game.setRoster([{ id: "p1", name: "Первый", agent: "human", transport: "local" }]);
    game.setAim(1);
    game.startShot({ angle: 0, power: 0.3 }, state);
    expect(game.isAnimating()).toBe(true);
    game.resetRuntime();
    expect(game.isAnimating()).toBe(false);
    // Прицел — память участника: рантайм его не трогает (решение 2026-10-18).
    expect(game.getParticipantAim("p1")).toBe(1);
    expect(game.getAnimationResult()).toBeNull();
  });

  it("startShot сохраняет прицел участника (скрыт только в рендере реплея)", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1"]) as BilliardsState;
    game.setRoster([{ id: "p1", name: "Первый", agent: "human", transport: "local" }]);
    game.setAim(0.7);
    expect(game.startShot({ angle: 0.7, power: 0.3 }, state)).toBe(true);
    expect(game.getAim()).toBe(0.7);
  });

  it("прицел и сила участников хранятся раздельно и не мешают друг другу", () => {
    const game = new BilliardsGame();
    game.createInitialState(["p1", "p2"]);
    game.setRoster([
      { id: "p1", name: "Первый", agent: "human", transport: "local" },
      { id: "p2", name: "Второй", agent: "human", transport: "local" },
    ]);
    // Ход p1: его прицел и сила.
    game.setAim(1.1);
    game.setPreviewPower(0.8);
    expect(game.getAim()).toBeCloseTo(1.1);
    // p2 целится отдельно — память p1 не затронута.
    game.setParticipantAim("p2", 2.2);
    game.setParticipantPower("p2", 0.3);
    expect(game.getParticipantAim("p1")).toBeCloseTo(1.1);
    expect(game.getParticipantPower("p1")).toBeCloseTo(0.8);
    expect(game.getParticipantAim("p2")).toBeCloseTo(2.2);
    expect(game.getParticipantPower("p2")).toBeCloseTo(0.3);
  });

  it("позиция битка соперника принимается без локального гейта", () => {
    const game = new BilliardsGame();
    const base = game.createInitialState(["p1", "p2"]) as BilliardsState;
    game.setRoster([
      { id: "p1", name: "Первый", agent: "human", transport: "local" },
      { id: "p2", name: "Второй", agent: "human", transport: "remote" },
    ]);
    // Ход соперника, постановка ему не разрешена: локальный гейт закрыт.
    const rival = { ...base, turn: 1, prep: { canPlaceCue: false, canChooseCueBall: false } };
    game.deserializeState(game.serializeState(rival));
    expect(game.canPlaceCue()).toBe(false);
    game.setCuePlacement(300, 300);
    expect(game.getCuePlacement()).toBeNull();
    // Данные соперника принимаются и видны как его биток.
    game.setParticipantCue("p2", 500, 400);
    expect(game.getCuePlacement()).toEqual({ x: 500, y: 400 });
  });

  it("угол не переносится между ходами: в начале хода он по правилам", () => {
    const game = new BilliardsGame();
    const base = game.createInitialState(["p1", "p2"]) as BilliardsState;
    game.setRoster([
      { id: "p1", name: "Первый", agent: "human", transport: "local" },
      { id: "p2", name: "Второй", agent: "human", transport: "local" },
    ]);
    game.setAim(1.2);
    game.applyMove(base, "p1", { angle: 1.2, power: 0.3 });
    expect(game.getTurnPhase()).toBe("passing");
    game.acknowledgeTurn();
    expect(game.getTurnPhase()).toBe("preparing");
    expect(game.currentParticipant()?.aim ?? null).toBeNull();
    expect(game.defaultAim()).not.toBeNull();
  });

  it("commitShot валиден только для текущего участника на подготовке", () => {
    const game = new BilliardsGame();
    game.createInitialState(["p1", "p2"]);
    game.setRoster([
      { id: "p1", name: "Первый", agent: "human", transport: "local" },
      { id: "p2", name: "Второй", agent: "human", transport: "local" },
    ]);
    game.setAim(0.3);
    game.setPreviewPower(0.5);
    // Не текущий участник — удара нет.
    expect(game.commitShot("p2")).toBeNull();
    const shot = game.commitShot("p1");
    expect(shot).not.toBeNull();
    expect(shot!.angle).toBeCloseTo(0.3);
    expect(shot!.power).toBeCloseTo(0.5);
    expect(game.isAnimating()).toBe(true);
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

describe("BilliardsGame: преднастройка 8-ball (02-b)", () => {
  /** Плоский список контролов схемы вместе с группами. */
  function controlsOf(_game: BilliardsGame, schema: FormSchema) {
    const controls: {
      id: string;
      kind: string;
      options?: readonly { value: string }[];
      navigate?: unknown;
    }[] = [];
    const groups: string[] = [];
    for (const node of schema.nodes) {
      if (node.type === "control") {
        controls.push({
          id: node.control.id,
          kind: node.control.kind,
          options: node.control.options,
          navigate: node.control.navigate,
        });
      }
      if (node.type !== "group") continue;
      groups.push(node.id);
      for (const child of node.children) {
        if (child.type !== "control") continue;
        controls.push({
          id: child.control.id,
          kind: child.control.kind,
          options: child.control.options,
          navigate: child.control.navigate,
        });
      }
    }
    return { controls, groups };
  }

  it("форма: два экрана — выбор режима, затем правила и способы старта", () => {
    const game = new BilliardsGame();
    // Экран 1: выбор режима; кнопка открывает меню режима, а не запускает игру.
    const root = controlsOf(game, game.getSetupForm());
    expect(root.groups).toEqual(["billiards-modes"]);
    const modeButton = root.controls.find((c) => c.id === "mode-8ball");
    expect(modeButton?.kind).toBe("button");
    expect(modeButton?.navigate).toEqual({ type: "push", screen: "8ball" });

    // Экран 2: правила режима и три способа старта.
    const mode = controlsOf(game, game.getSetupForm("8ball"));
    const byId = new Map(mode.controls.map((c) => [c.id, c]));
    expect(byId.get("rules")?.kind).toBe("select");
    expect(byId.get("rules")?.options?.map((o) => o.value)).toEqual(["simple", "tournament"]);
    for (const id of ["start-hotseat", "start-vs-computer", "start-host", "start-join"]) {
      expect(byId.get(id)?.kind).toBe("button");
      expect(byId.get(id)?.navigate).toBeUndefined();
    }
    // Неизвестный экран — корневая схема.
    expect(game.getSetupForm("arcada").id).toBe("billiards-setup");
  });

  it("правила из настроек попадают в состояние партии и переживают рестарт", () => {
    const game = new BilliardsGame();
    game.applySettings({ rules: "tournament" });
    expect((game.createInitialState(["p1", "p2"]) as BilliardsState).rules).toBe("tournament");
    expect(game.serializeSettings()).toMatchObject({ rules: "tournament" });
    // Мусор игнорируем — партия должна стартовать в любом случае.
    game.applySettings({ rules: "arcade" });
    expect((game.createInitialState(["p1"]) as BilliardsState).rules).toBe("tournament");
    game.applySettings(null);
    expect((game.createInitialState(["p1"]) as BilliardsState).rules).toBe("tournament");
  });

  it("панель игрока: только шкала забитых, чипа бонусов у 8-ball нет", () => {
    const panel = new BilliardsGame().getPlayerPanel();
    const tokens: string[] = [];
    for (const node of [...(panel.nameRow ?? []), ...(panel.bottomRow ?? [])]) {
      if (node.type === "control") tokens.push(String(node.control.value));
    }
    expect(tokens).toContain("billiards.balls");
    expect(tokens).not.toContain("billiards.bonus");
  });

  it("кнопка «двое за экраном» запускает игру составом двух людей", async () => {
    const game = new BilliardsGame();
    const players: PlayerInit[] = [
      { id: "p1", name: "A", agent: "human", transport: "local" },
      { id: "p2", name: "B", agent: "human", transport: "local" },
    ];
    const launch = makeLaunch();
    const setup = fakeSetup();
    const environment = fakeEnvironment(launch, players, setup.handle);
    game.attachEnvironment(environment);
    setup.handle.emit("start-hotseat", "press");
    await vi.waitFor(() => {
      expect(launch).toHaveBeenCalledWith(players);
    });
    expect(environment.lobby.defaultPlayers).toHaveBeenCalledWith({ humans: 2, computers: 0 });
    game.detachEnvironment();
  });

  it("кнопка «с компьютером» просит состав человека и компьютера", async () => {
    const game = new BilliardsGame();
    const players: PlayerInit[] = [
      { id: "p1", name: "A", agent: "human", transport: "local" },
      { id: "p2", name: "Компьютер", agent: "computer", transport: "local" },
    ];
    const launch = makeLaunch();
    const setup = fakeSetup();
    const environment = fakeEnvironment(launch, players, setup.handle);
    game.attachEnvironment(environment);
    setup.handle.emit("start-vs-computer", "press");
    await vi.waitFor(() => {
      expect(environment.lobby.defaultPlayers).toHaveBeenCalledWith({ humans: 1, computers: 1 });
    });
    await vi.waitFor(() => {
      expect(launch).toHaveBeenCalledWith(players);
    });
  });

  it("сетевые кнопки идут в лобби; отмена запуска не запускает", async () => {
    const game = new BilliardsGame();
    const players: PlayerInit[] = [
      { id: "p1", name: "A", agent: "human", transport: "local" },
      { id: "p2", name: "B", agent: "human", transport: "remote" },
    ];
    const launch = makeLaunch();
    const setup = fakeSetup();
    const environment = fakeEnvironment(launch, players, setup.handle);
    (environment.lobby.showHost as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (environment.lobby.showClient as ReturnType<typeof vi.fn>).mockResolvedValue(players);
    game.attachEnvironment(environment);

    setup.handle.emit("start-host", "press");
    await vi.waitFor(() => {
      expect(environment.lobby.showHost).toHaveBeenCalled();
    });
    expect(launch).not.toHaveBeenCalled();

    setup.handle.emit("start-join", "press");
    await vi.waitFor(() => {
      expect(launch).toHaveBeenCalledWith(players);
    });
  });

  it("detachEnvironment снимает все подписки преднастройки", () => {
    const game = new BilliardsGame();
    const launch = makeLaunch();
    const setup = fakeSetup();
    game.attachEnvironment(fakeEnvironment(launch, [], setup.handle));
    game.detachEnvironment();
    setup.handle.emit("start-hotseat", "press");
    setup.handle.emit("start-vs-computer", "press");
    setup.handle.emit("start-host", "press");
    expect(launch).not.toHaveBeenCalled();
  });
});

describe("BilliardsGame: 8-ball через публичный Game", () => {
  /**
   * Сцена одного удара: биток и (по желанию) один целевой шар на линии к лузе,
   * остальные шары сняты со стола. Так сценарий удара не зависит от пирамиды и
   * разбиения, а исход читается однозначно.
   */
  function scene(
    targetId: number | null,
    patch: Partial<BilliardsState> = {},
  ): { state: BilliardsState; angle: number } {
    const base = createInitialState(BASE_8BALL, ["p1", "p2"], 1);
    const pocket = { x: TABLE_LENGTH, y: 0 };
    const cueAt = { x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 };
    const dx = pocket.x - cueAt.x;
    const dy = pocket.y - cueAt.y;
    const len = Math.hypot(dx, dy);
    const targetAt = { x: cueAt.x + (dx / len) * 700, y: cueAt.y + (dy / len) * 700 };
    const rest = { vx: 0, vy: 0, spin: { x: 0, y: 0, z: 0 } };
    const balls = base.balls.map((b) => {
      if (b.id === 0) return { ...b, ...cueAt, ...rest, active: true };
      if (b.id === targetId) return { ...b, ...targetAt, ...rest, active: true };
      return { ...b, ...rest, active: false };
    });
    return {
      state: { ...base, ...patch, balls, shotSeq: 1 },
      angle: Math.atan2(dy, dx),
    };
  }

  it("разбитие без касаний: фола нет, ход переходит дальше", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0 });
    expect(result.accepted).toBe(true);
    const next = result.state as BilliardsState;
    expect(next.turn).toBe(1);
    expect(next.turnReason).toBe("noPocket");
    expect(result.finished).toBe(false);
  });

  it("забил свой при открытом столе: ходит снова, группы назначаются", () => {
    const game = new BilliardsGame();
    const { state, angle } = scene(1, { phase: "open", groups: null });
    const result = game.applyMove(state, "p1", { angle, power: 0.6 });
    const next = result.state as BilliardsState;
    expect(next.balls.find((b) => b.id === 1)?.active).toBe(false);
    expect(next.turn).toBe(0);
    expect(next.turnReason).toBe("pottedOwn");
    expect(next.groups).toEqual({ p1: "solid", p2: "stripe" });
    expect(game.nextPlayer(next, "p1")).toBe("p1");
    expect(result.finished).toBe(false);
  });

  it("скраш: ход переходит, а биток появляется только на подготовке", () => {
    const game = new BilliardsGame();
    // Цели нет: удар в лоб в угловую лузу — чистый скраш.
    const { state, angle } = scene(null, { phase: "open", groups: null });
    const result = game.applyMove(state, "p1", { angle, power: 0.8 });
    expect(result.accepted).toBe(true);
    const next = result.state as BilliardsState;
    expect(next.balls.find((b) => b.id === 0)?.active).toBe(false);
    expect(next.ballInHand).toBe(true);
    expect(next.prep.canPlaceCue).toBe(true);
    expect(next.prep.canChooseCueBall).toBe(false);
    expect(next.turn).toBe(1);
    expect(next.turnReason).toBe("foul");
    // Передача хода видна до подготовки; биток появляется только после неё.
    expect(game.getTurnPhase()).toBe("passing");
    expect(game.getTurnHandoff()).toMatchObject({ playerId: "p2", reason: "foul" });
    game.acknowledgeTurn();
    expect(game.getTurnPhase()).toBe("preparing");
    expect(game.getTurnHandoff()).toBeNull();
  });

  it("финиш: легальная 8 после зачистки — победа и winnerId для платформы", () => {
    const game = new BilliardsGame();
    const { state, angle } = scene(8, {
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
    });
    const result = game.applyMove(state, "p1", { angle, power: 0.6 });
    const next = result.state as BilliardsState;
    expect(next.finished).toBe(true);
    expect(next.phase).toBe("finished");
    expect(next.winner).toBe("p1");
    expect(next.finishReason).toBe("eightBall");
    expect(result.finished).toBe(true);
    expect(result.winnerId).toBe("p1");
    expect(game.isFinished(next)).toBe(true);
    expect(game.nextPlayer(next, "p1")).toBeNull();
    // Партия окончена: передачи хода нет, плашка не нужна.
    expect(game.getTurnHandoff()).toBeNull();
  });

  it("очередь на N игроков: разбитие мимо — ход у второго из трёх", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2", "p3"]) as BilliardsState;
    const result = game.applyMove(state, "p1", { angle: 0, power: 0 });
    const next = result.state as BilliardsState;
    expect(next.turn).toBe(1);
    expect(game.nextPlayer(next, "p1")).toBe("p2");
    expect(game.nextPlayer(next, "p2")).toBe("p2");
  });

  it("после фола биток переставляется по всему столу, даже если он остался на нём", () => {
    const game = new BilliardsGame();
    const base = createInitialState(BASE_8BALL, ["p1", "p2"], 1);
    // Биток на столе, но право подготовки дано (фол → игра с руки).
    const state: BilliardsState = {
      ...base,
      shotSeq: 3,
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
      turn: 1,
      ballInHand: true,
      prep: { canPlaceCue: true, canChooseCueBall: false },
      turnReason: "foul",
    };
    game.applyMove(state, "p1", { angle: 0, power: 0 });
    // Правка состояния после хода: нас интересует граница постановки.
    const after = {
      ...state,
      turn: 1,
      shotSeq: 4,
      prep: { canPlaceCue: true, canChooseCueBall: false },
    };
    // Пока идёт передача хода, биток не трогаем; подготовка — после неё.
    expect(game.canPlaceCue()).toBe(false);
    game.acknowledgeTurn();
    expect(game.getTurnPhase()).toBe("preparing");
    expect(game.canPlaceCue()).toBe(true);
    const placed = game.applyMove(after, "p1", { angle: 0, power: 0, cueX: 2200, cueY: 400 });
    const cue = (placed.state as BilliardsState).balls.find((b) => b.id === 0)!;
    expect(cue.x).toBeGreaterThan(HEAD_SPOT.x + BALL_RADIUS);
    expect(cue.y).toBeCloseTo(400, 6);
  });

  it("chooseShot выбирает удар ИИ, а chooseMove молчит — удар ведёт UI", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    // ИИ выбирает лучший легальный удар на разбитии (цель — вершина пирамиды).
    const shot = game.chooseShot(state);
    expect(shot).not.toBeNull();
    expect(Number.isFinite(shot!.angle)).toBe(true);
    expect(shot!.power).toBeGreaterThan(0);
    expect(shot!.power).toBeLessThanOrEqual(1);
    // `chooseMove` — null: Session не должна применять удар ИИ без реплея.
    expect(game.chooseMove(state, "p1")).toBeNull();
  });

  it("забитые по игрокам: сплошные одному, полосатые другому, биток и 8 — никому", () => {
    const game = new BilliardsGame();
    const base = createInitialState(BASE_8BALL, ["p1", "p2"], 1) as BilliardsState;
    const state: BilliardsState = {
      ...base,
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
      balls: base.balls.map((b) =>
        b.id === 3 || b.id === 11 || b.id === 8 || b.id === 0
          ? { ...b, active: false }
          : b,
      ),
    };
    game.applyMove(state, "p1", { angle: 0, power: 0 });
    expect(game.getPocketedByPlayer("p1", state)).toEqual([3]);
    expect(game.getPocketedByPlayer("p2", state)).toEqual([11]);
  });

  it("постановка битка: свежая партия — кухня, рука — весь стол без пересечений", () => {
    const game = new BilliardsGame();
    const base = game.createInitialState(["p1"]) as BilliardsState;
    // Свежая партия: за стартовой линией нельзя.
    const fresh = game.applyMove(base, "p1", { angle: 0, power: 0, cueX: 2000, cueY: 635 });
    const freshCue = (fresh.state as BilliardsState).balls.find((b) => b.id === 0)!;
    expect(freshCue.x).toBeCloseTo(HEAD_SPOT.x, 6);
    // Рука (битка нет): весь стол доступен, пересечений не будет.
    const scratched: BilliardsState = {
      ...base,
      balls: base.balls.map((b) => (b.id === 0 ? { ...b, active: false } : b)),
      turn: 0,
      phase: "assigned",
      groups: { p1: "solid" },
      order: ["p1"],
      ballInHand: true,
      prep: { canPlaceCue: true, canChooseCueBall: false },
    };
    const hand = game.applyMove(scratched, "p1", { angle: 0, power: 0, cueX: 2000, cueY: 635 });
    const handState = hand.state as BilliardsState;
    const cue = handState.balls.find((b) => b.id === 0)!;
    expect(cue.active).toBe(true);
    expect(cue.x).toBeGreaterThan(HEAD_SPOT.x + BALL_RADIUS);
    for (const other of handState.balls) {
      if (other.id === 0 || !other.active) continue;
      expect(Math.hypot(cue.x - other.x, cue.y - other.y)).toBeGreaterThanOrEqual(
        2 * BALL_RADIUS - 0.001,
      );
    }
  });

  it("постановка битка в плотной кучке: без пересечений и за пределами постановки", () => {
    const game = new BilliardsGame();
    const base = game.createInitialState(["p1"]) as BilliardsState;
    // Шесть шаров кольцом вокруг точки постановки: расталкивание не находит места.
    const ring = Array.from({ length: 6 }, (_, i) => {
      const a = (i * Math.PI) / 3;
      return { ...base.balls[1]!, id: i + 1, x: 1000 + Math.cos(a) * 2 * BALL_RADIUS, y: 635 + Math.sin(a) * 2 * BALL_RADIUS, active: true };
    });
    const crowded: BilliardsState = {
      ...base,
      balls: [{ ...base.balls[0]!, active: false }, ...ring, ...base.balls.slice(7).map((b) => ({ ...b, active: false }))],
      turn: 0,
      phase: "assigned",
      groups: { p1: "solid" },
      order: ["p1"],
      ballInHand: true,
      prep: { canPlaceCue: true, canChooseCueBall: false },
    };
    const moved = game.applyMove(crowded, "p1", { angle: 0, power: 0, cueX: 1000, cueY: 635 });
    const cue = (moved.state as BilliardsState).balls.find((b) => b.id === 0)!;
    expect(cue.active).toBe(true);
    for (const other of ring) {
      expect(Math.hypot(cue.x - other.x, cue.y - other.y)).toBeGreaterThanOrEqual(2 * BALL_RADIUS - 0.001);
    }
  });
});

describe("BilliardsGame: сложность ИИ и ход компьютера (02-c)", () => {
  /** Контрол схемы преднастройки по id (обход групп). */
  function controlById(schema: FormSchema, id: string): Control | null {
    const walk = (nodes: readonly FormNode[]): Control | null => {
      for (const node of nodes) {
        if (node.type === "control" && node.control.id === id) return node.control;
        if (node.type === "group") {
          const found = walk(node.children);
          if (found) return found;
        }
      }
      return null;
    };
    return walk(schema.nodes);
  }

  /** Сцена победы: биток и 8 на линии к лузе, группа победителя зачищена. */
  function winScene(winner: "p1" | "p2"): { state: BilliardsState; angle: number } {
    const base = createInitialState(BASE_8BALL, ["p1", "p2"], 1);
    const pocket = { x: TABLE_LENGTH, y: 0 };
    const cueAt = { x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 };
    const dx = pocket.x - cueAt.x;
    const dy = pocket.y - cueAt.y;
    const len = Math.hypot(dx, dy);
    const targetAt = { x: cueAt.x + (dx / len) * 700, y: cueAt.y + (dy / len) * 700 };
    const rest = { vx: 0, vy: 0, spin: { x: 0, y: 0, z: 0 } };
    const balls = base.balls.map((b) => {
      if (b.id === 0) return { ...b, ...cueAt, ...rest, active: true };
      if (b.id === 8) return { ...b, ...targetAt, ...rest, active: true };
      return { ...b, ...rest, active: false };
    });
    return {
      state: {
        ...base,
        balls,
        shotSeq: 1,
        phase: "assigned",
        groups: { p1: "solid", p2: "stripe" },
        turn: winner === "p1" ? 0 : 1,
      },
      angle: Math.atan2(dy, dx),
    };
  }

  /** Запустить партию «человек + компьютер», чтобы игра узнала агентов. */
  async function startWithComputer(game: BilliardsGame): Promise<void> {
    const players: PlayerInit[] = [
      { id: "p1", name: "Человек", agent: "human", transport: "local" },
      { id: "p2", name: "Компьютер", agent: "computer", transport: "local" },
    ];
    const launch = makeLaunch();
    const setup = fakeSetup();
    game.attachEnvironment(fakeEnvironment(launch, players, setup.handle));
    setup.handle.emit("start-vs-computer", "press");
    await vi.waitFor(() => {
      expect(launch).toHaveBeenCalledWith(players);
    });
  }

  it("в форме есть выбор сложности: авто и числа шкалы", () => {
    const game = new BilliardsGame();
    const control = controlById(game.getSetupForm("8ball"), "difficulty");
    expect(control?.kind).toBe("select");
    expect(control?.options?.map((o) => o.value)).toEqual(["auto", "0", "1", "2", "3", "4"]);
    expect(control?.value).toBe("auto");
  });

  it("настройки несут сложность и шкалу; мусор игнорируется", () => {
    const game = new BilliardsGame();
    game.applySettings({ difficulty: "auto" });
    expect(game.serializeSettings()).toMatchObject({ difficulty: "auto" });
    expect(game.getDifficulty().difficulty).toBe("auto");
    game.applySettings({ difficulty: 3 });
    expect(game.getDifficulty()).toEqual({ difficulty: 3, scale: 3 });
    game.applySettings({ difficulty: "мусор" });
    expect(game.getDifficulty().difficulty).toBe(3);
    game.applySettings(null);
    expect(game.getDifficulty().difficulty).toBe(3);
    // Число вне диапазона клампится, а не отвергается.
    game.applySettings({ difficulty: 99 });
    expect(game.getDifficulty().difficulty).toBe(4);
  });

  it("фиксированное число держится после партии с компьютером", async () => {
    const game = new BilliardsGame();
    game.applySettings({ difficulty: 1 });
    await startWithComputer(game);
    const scene = winScene("p1");
    game.applyMove(scene.state, "p1", { angle: scene.angle, power: 0.6 });
    expect(game.getDifficulty()).toEqual({ difficulty: 1, scale: 1 });
  });

  it("новая партия стартует с выбранной сложностью (шкала заморожена)", () => {
    const game = new BilliardsGame();
    game.applySettings({ difficulty: "auto", scale: 1.5 });
    // Серия ударов внутри партии шкалу не трогает.
    const scene = winScene("p1");
    const breakState = game.createInitialState(["p1", "p2"]) as BilliardsState;
    game.applyMove(breakState, "p1", { angle: 0, power: 0 });
    expect(game.getDifficulty().scale).toBe(1.5);
    // Завершение партии (без компьютера) шкалу тоже не двигает.
    game.applyMove(scene.state, "p1", { angle: scene.angle, power: 0.6 });
    expect(game.getDifficulty().scale).toBe(1.5);
  });

  it("«авто» двигает шкалу только после партии с компьютером и раз в две", async () => {
    const game = new BilliardsGame();
    game.applySettings({ difficulty: "auto", scale: 2 });
    await startWithComputer(game);
    const shot = winScene("p1");
    // Первая победа человека: шкала копит, но не двигается.
    game.applyMove(shot.state, "p1", { angle: shot.angle, power: 0.6 });
    expect(game.getDifficulty().scale).toBe(2);
    // Вторая победа подряд: шкала повышается (вверх — медленнее).
    game.applyMove(shot.state, "p1", { angle: shot.angle, power: 0.6 });
    expect(game.getDifficulty().scale).toBeGreaterThan(2);
  });

  it("план хода компьютера: кандидаты для прицела и выбранный удар", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    // Источник правды для плана — последнее состояние после удара.
    game.applyMove(state, "p1", { angle: 0, power: 0.3 });
    const plan = game.planComputerTurn();
    expect(plan).not.toBeNull();
    expect(plan!.candidates.length).toBeGreaterThan(0);
    expect(plan!.candidates.length).toBeLessThanOrEqual(4);
    expect(Number.isFinite(plan!.chosen.angle)).toBe(true);
  });

  it("ход компьютера проходит цикл фаз без залипания passing", () => {
    const game = new BilliardsGame();
    let state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    // Подготовка: план и удар доступны сразу, без кадра отрисовки.
    expect(game.getTurnPhase()).toBe("preparing");
    const plan = game.planComputerTurn();
    expect(plan).not.toBeNull();
    // Реплей тем же путём, что человек: startShot → advance до покоя.
    expect(game.startShot(plan!.chosen)).toBe(true);
    expect(game.getTurnPhase()).toBe("animating");
    let guard = 0;
    while (game.isAnimating() && guard < 200000) {
      game.advance(1 / 60);
      guard += 1;
    }
    expect(game.isAnimating()).toBe(false);
    expect(game.getAnimationResult()).not.toBeNull();
    // Применение удара (как `session.makeMove`) → передача хода → подготовка.
    const result = game.applyMove(state, "p1", { ...plan!.chosen });
    state = result.state as BilliardsState;
    expect(result.accepted).toBe(true);
    expect(game.getTurnPhase()).toBe("passing");
    game.acknowledgeTurn();
    expect(game.getTurnPhase()).toBe("preparing");
  });

  it("возобновлённая партия: план компьютера доступен без кадра отрисовки", () => {
    const game = new BilliardsGame();
    const state = game.createInitialState(["p1", "p2"]) as BilliardsState;
    game.applyMove(state, "p1", { angle: 0, power: 0.4 });
    const saved = game.serializeState(game.getAnimationResult() ?? state);
    const resumed = new BilliardsGame();
    resumed.applySettings({ rules: "simple" });
    expect(resumed.deserializeState(saved)).not.toBeNull();
    expect(resumed.getTurnPhase()).toBe("preparing");
    expect(resumed.planComputerTurn()).not.toBeNull();
  });
});
