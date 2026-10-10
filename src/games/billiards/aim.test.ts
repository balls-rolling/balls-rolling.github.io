import { describe, expect, it } from "vitest";
import { TABLE_LENGTH } from "./constants";
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
  return { version: 1, seed: 1, order: ["p1"], turn: 0, balls: built, finished: false };
}

describe("трассировка прицела", () => {
  it("пустой стол: траектория отскакивает и длиннее 1.5 длины стола", () => {
    const trace = traceAim(makeState([{ id: 0, x: 600, y: 635 }]), 0.2);
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
    );
    expect(trace.hitBall).not.toBeNull();
    expect(trace.hitBall?.ballId).toBe(1);
    expect(trace.hitBall?.ghost.x).toBeCloseTo(1500 - 2 * 28.575, 0);
    expect(trace.hitBall?.targetDir.x).toBeCloseTo(1, 2);
    expect(trace.hitBall?.cueDir).toBeNull();
  });

  it("детерминизм: два вызова дают одно", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 1500, y: 700 },
    ]);
    expect(traceAim(state, 0.1)).toEqual(traceAim(state, 0.1));
    expect(AIM_MAX_PATH).toBeCloseTo(1.5 * TABLE_LENGTH, 6);
  });

  it("целевой шар — минимальный номер; прицел на его центр", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 5, x: 1500, y: 300 },
      { id: 2, x: 1500, y: 900 },
    ]);
    expect(pickTarget(state)?.id).toBe(2);
    const angle = aimAngleToTarget(state);
    expect(angle).toBeCloseTo(Math.atan2(900 - 635, 1500 - 600), 6);
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
