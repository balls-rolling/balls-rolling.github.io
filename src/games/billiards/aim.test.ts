import { describe, expect, it } from "vitest";
import { TABLE_LENGTH } from "./constants";
import { buildTableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import {
  traceAim,
  AIM_MAX_PATH,
  pickTarget,
  aimAngleToTarget,
  wrap360,
  ANGLE_SCALE_PX_PER_DEG,
  angleAfterScaleDrag,
} from "./aim";
import type { BallState, BilliardsState } from "./state";

/** Геометрия режима 8-ball: та же, что строит игра. */
const G = buildTableGeometry(BASE_8BALL);

interface BallInput {
  id: number;
  x: number;
  y: number;
  active?: boolean;
}

function makeState(balls: readonly BallInput[]): BilliardsState {
  const built: BallState[] = balls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: 0,
    vy: 0,
    spin: { x: 0, y: 0, z: 0 },
    active: b.active ?? true,
  }));
  return {
    version: 2,
    mode: "8ball",
    seed: 1,
    order: ["p1"],
    turn: 0,
    balls: built,
    finished: false,
    groups: null,
    rules: "simple",
    phase: "open",
    winner: null,
    finishReason: null,
    ballInHand: false,
    shotSeq: 0,
    turnReason: "initial",
    prep: { canPlaceCue: true, canChooseCueBall: false },
  };
}

describe("трассировка прицела", () => {
  it("пустой стол: траектория отскакивает и длиннее 1.5 длины стола", () => {
    const trace = traceAim(makeState([{ id: 0, x: 600, y: 635 }]), 0.2, G);
    expect(trace.hitBall).toBeNull();
    expect(trace.path.length).toBeGreaterThan(2);
    let total = 0;
    for (let i = 0; i + 1 < trace.path.length; i += 1) {
      total += Math.hypot(
        trace.path[i + 1]!.x - trace.path[i]!.x,
        trace.path[i + 1]!.y - trace.path[i]!.y,
      );
    }
    expect(total).toBeLessThanOrEqual(AIM_MAX_PATH + 1e-6);
  });

  it("шар на линии: стоп на госте, вектор цели и отката", () => {
    const trace = traceAim(
      makeState([
        { id: 0, x: 600, y: 635 },
        { id: 1, x: 1500, y: 635 },
      ]),
      0,
      G,
    );
    expect(trace.hitBall).not.toBeNull();
    expect(trace.hitBall?.ballId).toBe(1);
    expect(trace.hitBall?.ghost.x).toBeCloseTo(1500 - 2 * 28.575, 0);
    expect(trace.hitBall?.targetDir.x).toBeCloseTo(1, 2);
    expect(trace.hitBall?.cueDir).toBeNull();
    expect(trace.path).toHaveLength(2);
  });

  it("ghost сохраняет непрерывное положение у касательной и не даёт звёздчатый луч", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 1500, y: 635 },
    ]);
    const around = [-0.025, -0.015, -0.005, 0.005, 0.015, 0.025].map((offset) =>
      traceAim(state, offset, G),
    );
    const hits = around.map((trace) => trace.hitBall);
    expect(hits.every((hit) => hit !== null)).toBe(true);
    for (let i = 0; i + 1 < hits.length; i += 1) {
      const a = hits[i]!;
      const b = hits[i + 1]!;
      if (a === null || b === null) throw new Error("ожидался контакт с целевым шаром");
      expect(Math.hypot(a.ghost.x - b.ghost.x, a.ghost.y - b.ghost.y)).toBeLessThan(20);
      // Почти лобовые удары дают малую скорость cue; длина outgoing-пути тоже
      // стремится к нулю, вместо полного луча со скачком направления.
      if (a.cueStrength < 0.02) expect(around[i]!.path.length).toBeLessThanOrEqual(3);
    }
  });

  it("после контакта аналитическая линия продолжается за ghost-точку", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 1500, y: 680 },
    ]);
    const trace = traceAim(state, 0.05, G);
    expect(trace.hitBall?.ballId).toBe(1);
    expect(trace.hitBall?.cueDir).not.toBeNull();
    // Входящая линия, точка контакта и продолжение cue — путь не обрывается
    // на поверхности прицельного шара.
    expect(trace.path.length).toBeGreaterThan(2);
    const ghostIndex = trace.path.findIndex(
      (point) => Math.hypot(point.x - trace.hitBall!.ghost.x, point.y - trace.hitBall!.ghost.y) < 1e-5,
    );
    expect(ghostIndex).toBeGreaterThanOrEqual(0);
    expect(trace.path.length - ghostIndex).toBeGreaterThan(1);
  });

  it("детерминизм: два вызова дают одно", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 1500, y: 700 },
    ]);
    expect(traceAim(state, 0.1, G)).toEqual(traceAim(state, 0.1, G));
    expect(AIM_MAX_PATH).toBeCloseTo(1.5 * TABLE_LENGTH, 6);
  });

  it("обычный ход: цель — наименьший номер из шаров группы игрока", () => {
    const base = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 2, x: 1500, y: 900 },
      { id: 5, x: 1500, y: 660 },
      { id: 9, x: 1400, y: 700 },
    ]);
    const solid = { ...base, phase: "assigned" as const, groups: { p1: "solid" as const } };
    expect(pickTarget(solid)?.id).toBe(2);
    expect(aimAngleToTarget(solid)).toBeCloseTo(Math.atan2(900 - 635, 1500 - 600), 6);
    const stripe = { ...base, phase: "assigned" as const, groups: { p1: "stripe" as const } };
    expect(pickTarget(stripe)?.id).toBe(9);
  });

  it("разбитие: прицел в вершину пирамиды (шар 1)", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 1500, y: 635 },
      { id: 2, x: 1500, y: 900 },
    ]);
    expect(pickTarget(state)?.id).toBe(1);
    expect(aimAngleToTarget(state)).toBeCloseTo(0, 6);
  });

  it("группа зачищена — цель восьмёрка", () => {
    const state = {
      ...makeState([
        { id: 0, x: 600, y: 635 },
        { id: 8, x: 1500, y: 635 },
        { id: 12, x: 1500, y: 900 },
      ]),
      phase: "assigned" as const,
      groups: { p1: "solid" as const },
    };
    expect(pickTarget(state)?.id).toBe(8);
  });

  it("без активных шаров цели нет", () => {
    expect(aimAngleToTarget(makeState([{ id: 0, x: 600, y: 635 }]))).toBeNull();
  });

  it("шкала угла: пересчёт шага и wrap 0/360 бесшовно", () => {
    expect(wrap360(370)).toBeCloseTo(10, 9);
    expect(wrap360(-10)).toBeCloseTo(350, 9);
    expect(wrap360(720)).toBe(0);
    expect(wrap360(-360)).toBe(0);
    expect(wrap360(-235)).toBeCloseTo(125, 9);
    expect(wrap360(360 + 0.5)).toBeCloseTo(0.5, 9);
    expect(ANGLE_SCALE_PX_PER_DEG).toBeGreaterThan(0);
    // тонкий шаг: сдвиг ленты на ANGLE_SCALE_PX_PER_DEG даёт ровно 1°
    expect(angleAfterScaleDrag(0, ANGLE_SCALE_PX_PER_DEG)).toBeCloseTo(Math.PI / 180, 9);
    expect(angleAfterScaleDrag(1, 0)).toBeCloseTo(1, 9);
  });
});
