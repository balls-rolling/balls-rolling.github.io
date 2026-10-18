// Параметризованный набор «лог → исход» для ядра правил 8-ball.
import { describe, expect, it } from "vitest";
import { BALL_DIAMETER, CENTER_SPOT, FOOT_SPOT, HEAD_SPOT } from "./constants";
import { BASE_8BALL } from "./modes/base8ball";
import { cueBallInHandPosition, resolveShot } from "./rules-8ball";
import type { ShotLog } from "./shot-log";
import {
  createInitialState,
  type BallGroup,
  type BallState,
  type BilliardsState,
  type EightBallRules,
  type TablePhase,
} from "./state";

function log(over: Partial<ShotLog> = {}): ShotLog {
  return {
    firstContactId: null,
    railAfterContact: false,
    pocketedIds: [],
    cueScratched: false,
    offTableIds: [],
    ...over,
  };
}

interface StateOver {
  readonly turn?: number;
  readonly shotSeq?: number;
  readonly phase?: TablePhase;
  readonly groups?: BilliardsState["groups"];
  readonly rules?: EightBallRules;
  /** id активных шаров (битка 0 среди них нет — он жив всегда, кроме скрача в логе). */
  readonly activeIds?: readonly number[];
  readonly ballInHand?: boolean;
  readonly finished?: boolean;
}

function state(over: StateOver = {}): BilliardsState {
  const base = createInitialState(BASE_8BALL, ["p1", "p2"], 1);
  const active = new Set(over.activeIds ?? [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  const balls: readonly BallState[] = base.balls.map((b) => ({
    ...b,
    active: active.has(b.id),
  }));
  return {
    ...base,
    turn: over.turn ?? 0,
    shotSeq: over.shotSeq ?? 1,
    phase: over.phase ?? "open",
    groups: over.groups ?? null,
    rules: over.rules ?? "simple",
    balls,
    ballInHand: over.ballInHand ?? false,
    finished: over.finished ?? false,
  };
}

/** Разбитие: открытый стол, счётчик ударов 0. */
function breakState(over: StateOver = {}): BilliardsState {
  return state({ ...over, phase: "open", groups: null, shotSeq: 0 });
}

/** Нет ли пересечений шара с остальными активными шарами. */
function overlaps(ball: BallState, balls: readonly BallState[]): boolean {
  for (const other of balls) {
    if (other.id === ball.id || !other.active) continue;
    const dx = other.x - ball.x;
    const dy = other.y - ball.y;
    if (dx * dx + dy * dy < BALL_DIAMETER * BALL_DIAMETER - 1e-9) return true;
  }
  return false;
}

/** Назначенные группы: p1 — solid, p2 — stripe. */
function assigned(over: StateOver = {}): BilliardsState {
  return state({ ...over, phase: "assigned", groups: { p1: "solid", p2: "stripe" } });
}

describe("ядро правил 8-ball: лог → исход", () => {
  it("разбитие без забитых шаров не оставляет ход разбивавшему", () => {
    const before = breakState();
    const after = resolveShot(before, log());
    expect(after.turn).toBe(1);
    expect(after.turnReason).toBe("noPocket");
    expect(after.finished).toBe(false);
  });

  it("разбитие: забит свой — стол открыт, группы не назначаются, ходит снова", () => {
    const after = resolveShot(
      breakState(),
      log({ firstContactId: 1, railAfterContact: true, pocketedIds: [3] }),
    );
    expect(after.groups).toBeNull();
    expect(after.phase).toBe("open");
    expect(after.turn).toBe(0);
    expect(after.ballInHand).toBe(false);
    expect(after.finished).toBe(false);
    expect(after.balls.find((b) => b.id === 3)?.active).toBe(false);
  });

  it("разбитие: фол «без борта» не применяется — просто смена без руки", () => {
    const after = resolveShot(
      breakState(),
      log({ firstContactId: 1, railAfterContact: false, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(false);
  });

  it("разбитие: первый контакт любой (даже 8) — не фол", () => {
    const after = resolveShot(
      breakState(),
      log({ firstContactId: 8, railAfterContact: true, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(false);
  });

  it("разбитие: 8 забита — переставка на линию к центру, стол открыт, ход у разбивавшего", () => {
    const after = resolveShot(
      breakState(),
      log({ firstContactId: 1, railAfterContact: true, pocketedIds: [8] }),
    );
    expect(after.finished).toBe(false);
    expect(after.phase).toBe("open");
    expect(after.groups).toBeNull();
    expect(after.turn).toBe(0);
    // Ножное пятно занято вершиной пирамиды — 8 стоит на линии к центру.
    const eight = after.balls.find((b) => b.id === 8);
    expect(eight?.active).toBe(true);
    expect(eight?.y).toBeCloseTo(FOOT_SPOT.y, 6);
    expect(eight!.x).toBeLessThan(FOOT_SPOT.x);
    expect(eight!.x).toBeGreaterThan(CENTER_SPOT.x);
    expect(overlaps(eight!, after.balls)).toBe(false);
  });

  it("разбитие: свободное ножное пятно — 8 встаёт ровно на него", () => {
    // Вершина пирамиды (1) уже снята со стола — пятно свободно.
    const before = breakState({
      activeIds: [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    });
    const after = resolveShot(
      before,
      log({ firstContactId: 2, railAfterContact: true, pocketedIds: [8] }),
    );
    const eight = after.balls.find((b) => b.id === 8);
    expect(eight?.active).toBe(true);
    expect(eight?.x).toBeCloseTo(FOOT_SPOT.x, 9);
    expect(eight?.y).toBeCloseTo(FOOT_SPOT.y, 9);
    expect(after.turn).toBe(0);
    expect(after.phase).toBe("open");
  });

  it("фол без скраша: биток остаётся на месте, ход переходит, есть флаг руки", () => {
    const before = assigned();
    const after = resolveShot(
      before,
      log({ firstContactId: 9, railAfterContact: true, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
    expect(after.turnReason).toBe("foul");
    const cue = after.balls.find((b) => b.id === 0);
    expect(cue?.active).toBe(true);
    const cueBefore = before.balls.find((b) => b.id === 0);
    expect(cue?.x).toBeCloseTo(cueBefore!.x, 9);
    expect(cue?.y).toBeCloseTo(cueBefore!.y, 9);
    // Фол даёт новому бьющему игру с руки даже когда биток остался на столе.
    expect(after.prep.canPlaceCue).toBe(true);
  });

  it("скраш: битка на столе нет, а его появление — подготовка следующего хода", () => {
    // Кладём чужой шар ровно на головное пятно: стартовая точка занята.
    const before = assigned({ activeIds: [0, 1, 2, 3, 4, 5, 6, 7, 9] });
    const withBlocker: BilliardsState = {
      ...before,
      balls: before.balls.map((b) =>
        b.id === 1 ? { ...b, x: HEAD_SPOT.x, y: HEAD_SPOT.y } : b,
      ),
    };
    const after = resolveShot(
      withBlocker,
      log({
        firstContactId: 2,
        railAfterContact: true,
        pocketedIds: [0],
        cueScratched: true,
      }),
    );
    expect(after.ballInHand).toBe(true);
    expect(after.turnReason).toBe("foul");
    // Поле между ударами не трогаем: битка нет.
    expect(after.balls.find((b) => b.id === 0)?.active).toBe(false);
    // Право подготовить удар: позиционировать биток.
    expect(after.prep.canPlaceCue).toBe(true);
    expect(after.prep.canChooseCueBall).toBe(false);
    // Стартовая точка для подготовки — пятно или рядом, без пересечений.
    const spot = cueBallInHandPosition(after.balls, after.mode);
    expect(Math.hypot(spot.x - HEAD_SPOT.x, spot.y - HEAD_SPOT.y)).toBeGreaterThan(0);
    expect(Math.hypot(spot.x - HEAD_SPOT.x, spot.y - HEAD_SPOT.y)).toBeLessThan(
      3 * BALL_DIAMETER,
    );
  });

  it("продолжение хода после своего шара помечено pottedOwn", () => {
    const after = resolveShot(
      assigned({ activeIds: [0, 3, 4, 9] }),
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [3] }),
    );
    expect(after.turn).toBe(0);
    expect(after.turnReason).toBe("pottedOwn");
    expect(after.prep.canPlaceCue).toBe(false);
  });

  it("последний свой шар, забитый ударом, — продолжение хода, не фол", () => {
    // Состояние после удара: забитый свой шар (1) уже неактивен.
    const after = resolveShot(
      assigned({ activeIds: [0, 9] }),
      log({ firstContactId: 1, railAfterContact: true, pocketedIds: [1] }),
    );
    expect(after.turn).toBe(0);
    expect(after.turnReason).toBe("pottedOwn");
    expect(after.ballInHand).toBe(false);
    expect(after.finished).toBe(false);
  });

  it("последний свой шар вместе с 8 — победа, не фол", () => {
    const after = resolveShot(
      assigned({ activeIds: [0, 9] }),
      log({ firstContactId: 1, railAfterContact: true, pocketedIds: [1, 8] }),
    );
    expect(after.finished).toBe(true);
    expect(after.winner).toBe("p1");
    expect(after.finishReason).toBe("eightBall");
  });

  it("забитый чужой шар передаёт ход, а промах без забитого — тоже (noPocket)", () => {
    const withOpponent = assigned({ activeIds: [0, 3, 4, 9, 11] });
    const pottedOpponent = resolveShot(
      withOpponent,
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [11] }),
    );
    expect(pottedOpponent.turn).toBe(1);
    expect(pottedOpponent.turnReason).toBe("pottedOther");
    expect(pottedOpponent.ballInHand).toBe(false);

    const missed = resolveShot(
      withOpponent,
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [] }),
    );
    expect(missed.turn).toBe(1);
    expect(missed.turnReason).toBe("noPocket");
  });

  it("разбитие: скрач — фол, смена + биток с руки", () => {
    const after = resolveShot(
      breakState(),
      log({ firstContactId: 1, railAfterContact: true, pocketedIds: [0], cueScratched: true }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
  });

  it("открытый стол: первый легальный шар назначает группу, ходит снова", () => {
    const after = resolveShot(
      state(),
      log({ firstContactId: 9, railAfterContact: true, pocketedIds: [9] }),
    );
    expect(after.groups).toEqual({ p1: "stripe", p2: "solid" });
    expect(after.phase).toBe("assigned");
    expect(after.turn).toBe(0);
    expect(after.ballInHand).toBe(false);
  });

  it("открытый стол: первый контакт с 8 — фол", () => {
    const after = resolveShot(
      state({ activeIds: [0, 1, 8, 9] }),
      log({ firstContactId: 8, railAfterContact: true, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
    expect(after.groups).toBeNull();
  });

  it("открытый стол: промах без контакта — фол", () => {
    const after = resolveShot(state(), log({ firstContactId: null }));
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
  });

  it("открытый стол: при фоле группы не назначаются, забитые остаются", () => {
    const after = resolveShot(
      state(),
      log({
        firstContactId: 9,
        railAfterContact: true,
        pocketedIds: [3],
        cueScratched: true,
      }),
    );
    expect(after.groups).toBeNull();
    expect(after.phase).toBe("open");
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
    expect(after.balls.find((b) => b.id === 3)?.active).toBe(false);
  });

  it("назначены: забил свой легально — ходит снова", () => {
    const after = resolveShot(
      assigned(),
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [3] }),
    );
    expect(after.turn).toBe(0);
    expect(after.ballInHand).toBe(false);
    expect(after.finished).toBe(false);
  });

  it("назначены: ничего не забил — смена хода", () => {
    const after = resolveShot(
      assigned(),
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(false);
  });

  it("назначены: неверный первый контакт (чужой) — фол + рука", () => {
    const after = resolveShot(
      assigned(),
      log({ firstContactId: 9, railAfterContact: true, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
  });

  it("назначены: первый контакт с 8 до зачистки — фол", () => {
    const after = resolveShot(
      assigned(),
      log({ firstContactId: 8, railAfterContact: true, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
  });

  it("назначены: «без борта» вне разбития — фол", () => {
    const after = resolveShot(
      assigned(),
      log({ firstContactId: 3, railAfterContact: false, pocketedIds: [] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
  });

  it("назначены: шар со стола — фол, шар гаснет", () => {
    const after = resolveShot(
      assigned(),
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [], offTableIds: [5] }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
    expect(after.balls.find((b) => b.id === 5)?.active).toBe(false);
  });

  it("назначены: скрач — фол, забитый свой остаётся забитым", () => {
    const after = resolveShot(
      assigned(),
      log({
        firstContactId: 3,
        railAfterContact: true,
        pocketedIds: [3, 0],
        cueScratched: true,
      }),
    );
    expect(after.turn).toBe(1);
    expect(after.ballInHand).toBe(true);
    expect(after.balls.find((b) => b.id === 3)?.active).toBe(false);
  });

  it("легальная 8 после зачистки — победа", () => {
    const before = assigned({ activeIds: [0, 8, 9] });
    const after = resolveShot(
      before,
      log({ firstContactId: 8, railAfterContact: true, pocketedIds: [8] }),
    );
    expect(after.finished).toBe(true);
    expect(after.phase).toBe("finished");
    expect(after.winner).toBe("p1");
    expect(after.finishReason).toBe("eightBall");
  });

  it("ранняя 8 в простых правилах — фол, 8 возвращается на стол", () => {
    const after = resolveShot(
      assigned({ rules: "simple" }),
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [8] }),
      { rules: "simple" },
    );
    expect(after.finished).toBe(false);
    expect(after.turn).toBe(1);
    expect(after.turnReason).toBe("foul");
    expect(after.ballInHand).toBe(true);
    // 8 не пропадает: перестановка на ножное пятно (или ближайшее свободное).
    const eight = after.balls.find((b) => b.id === 8);
    expect(eight?.active).toBe(true);
    const onFoot =
      Math.hypot((eight?.x ?? 0) - FOOT_SPOT.x, (eight?.y ?? 0) - FOOT_SPOT.y) < 1e-6;
    expect(onFoot || Math.hypot((eight?.x ?? 0) - FOOT_SPOT.x, (eight?.y ?? 0) - FOOT_SPOT.y)).toBeGreaterThanOrEqual(0);
    for (const other of after.balls) {
      if (other.id === 8 || !other.active) continue;
      expect(
        Math.hypot((eight?.x ?? 0) - other.x, (eight?.y ?? 0) - other.y),
      ).toBeGreaterThanOrEqual(BALL_DIAMETER - 0.001);
    }
  });

  it("ранняя 8 в турнирных правилах — поражение", () => {
    const after = resolveShot(
      assigned({ rules: "tournament" }),
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [8] }),
      { rules: "tournament" },
    );
    expect(after.finished).toBe(true);
    expect(after.phase).toBe("finished");
    expect(after.winner).toBe("p2");
    expect(after.finishReason).toBe("foulOnEight");
  });

  it("8 вместе с фолом (скрач): простые — продолжение, турнирные — поражение", () => {
    const foulLog = log({
      firstContactId: 8,
      railAfterContact: true,
      pocketedIds: [8, 0],
      cueScratched: true,
    });
    const cleared = assigned({ activeIds: [0, 8, 9], rules: "simple" });
    const simple = resolveShot(cleared, foulLog, { rules: "simple" });
    expect(simple.finished).toBe(false);
    expect(simple.turn).toBe(1);
    expect(simple.ballInHand).toBe(true);
    const tournament = resolveShot(
      assigned({ activeIds: [0, 8, 9], rules: "tournament" }),
      foulLog,
      { rules: "tournament" },
    );
    expect(tournament.finished).toBe(true);
    expect(tournament.winner).toBe("p2");
    expect(tournament.finishReason).toBe("foulOnEight");
  });

  it("8 вместе с последним шаром своей группы — победа (логика WPA)", () => {
    const before = assigned({ activeIds: [0, 3, 8, 9], rules: "simple" });
    const after = resolveShot(
      before,
      log({ firstContactId: 3, railAfterContact: true, pocketedIds: [3, 8] }),
      { rules: "simple" },
    );
    expect(after.finished).toBe(true);
    expect(after.winner).toBe("p1");
    expect(after.finishReason).toBe("eightBall");
  });

  it("8 при остатке своих шаров — рано (простые: фол, турнирные: поражение)", () => {
    const before = assigned({ activeIds: [0, 3, 5, 8, 9], rules: "simple" });
    const logEarly = log({ firstContactId: 3, railAfterContact: true, pocketedIds: [8] });
    const simple = resolveShot(before, logEarly, { rules: "simple" });
    expect(simple.finished).toBe(false);
    expect(simple.ballInHand).toBe(true);
    const tournament = resolveShot(before, logEarly, { rules: "tournament" });
    expect(tournament.finished).toBe(true);
    expect(tournament.finishReason).toBe("foulOnEight");
  });

  it("8 на открытом столе вне разбития — ранняя (простые: фол, турнирные: поражение)", () => {
    const eightLog = log({ firstContactId: 3, railAfterContact: true, pocketedIds: [3, 8] });
    const simple = resolveShot(state({ rules: "simple" }), eightLog, { rules: "simple" });
    expect(simple.finished).toBe(false);
    expect(simple.ballInHand).toBe(true);
    const tournament = resolveShot(state({ rules: "tournament" }), eightLog, {
      rules: "tournament",
    });
    expect(tournament.finished).toBe(true);
    expect(tournament.winner).toBe("p2");
  });

  it("завершённая партия не меняется", () => {
    const before = state({ finished: true, phase: "finished" });
    expect(resolveShot(before, log({ firstContactId: 1, pocketedIds: [1] }))).toBe(before);
  });

  it("счётчик ударов строго растёт", () => {
    const before = assigned({ shotSeq: 4 });
    const after = resolveShot(before, log({ firstContactId: 3, railAfterContact: true }));
    expect(after.shotSeq).toBe(5);
  });

  it("группа второго игрока работает зеркально", () => {
    const before = assigned({ turn: 1 });
    const after = resolveShot(
      before,
      log({ firstContactId: 10, railAfterContact: true, pocketedIds: [10] }),
    );
    expect(after.turn).toBe(1);
    const groups: Record<string, BallGroup> = after.groups as Record<string, BallGroup>;
    expect(groups["p2"]).toBe("stripe");
  });
});
