import { describe, expect, it } from "vitest";
import { BALL_RADIUS, TABLE_WIDTH } from "./constants";
import { buildTableGeometry } from "./geometry";
import { applyShot, isAtRest, isValidShot, simulateToRest, step, strike } from "./physics";
import type { BallState, BilliardsState } from "./state";

interface BallInput {
  id: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  active?: boolean;
}

function makeState(balls: readonly BallInput[]): BilliardsState {
  const built: BallState[] = balls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: b.vx ?? 0,
    vy: b.vy ?? 0,
    spin: { x: 0, y: 0, z: 0 },
    active: b.active ?? true,
  }));
  return { version: 1, seed: 1, order: ["p1"], turn: 0, balls: built, finished: false };
}

describe("физика: движение и покой", () => {
  it("шар замедляется ровно до нуля", () => {
    const rest = simulateToRest(makeState([{ id: 0, x: 600, y: 635, vx: 300, vy: 0 }]));
    expect(isAtRest(rest)).toBe(true);
    expect(rest.balls[0]?.vx).toBe(0);
    expect(Number.isFinite(rest.balls[0]?.x)).toBe(true);
  });

  it("покоящийся шар остаётся на месте", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    expect(step(state)).toEqual(state);
  });

  it("детерминизм: один и тот же удар дважды даёт одно состояние", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const shot = { angle: 0.4, power: 0.5 };
    expect(applyShot(state, shot)).toEqual(applyShot(state, shot));
  });

  it("повторный прогон идентичен", () => {
    const state = makeState([{ id: 0, x: 600, y: 635, vx: 400 }]);
    let a = state;
    for (let i = 0; i < 50; i += 1) a = step(a);
    let b = state;
    for (let i = 0; i < 50; i += 1) b = step(b);
    expect(a).toEqual(b);
  });
});

describe("физика: соударения", () => {
  it("шар отражается от носа с потерей нормальной скорости", () => {
    const state = makeState([{ id: 0, x: 600, y: BALL_RADIUS - 0.5, vy: -200 }]);
    const next = step(state);
    expect(next.balls[0]?.vy).toBeGreaterThan(0);
    expect(Math.abs(next.balls[0]?.vy ?? 0)).toBeLessThan(200);
    expect(next.balls[0]?.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("центральный удар шар-шар передаёт скорость", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 500 },
      { id: 1, x: 600 + 2 * BALL_RADIUS + 2, y: 635 },
    ]);
    const next = step(state);
    expect(next.balls[1]?.vx).toBeGreaterThan(0);
    expect(next.balls[0]?.vx).toBeLessThan(500);
  });

  it("быстрый шар не проваливается сквозь нос", () => {
    const state = makeState([{ id: 0, x: 600, y: BALL_RADIUS + 2, vy: -6000 }]);
    const next = step(state);
    expect(next.balls[0]?.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });
});

describe("физика: лузы", () => {
  it("шар за линией рта в зеве — забит", () => {
    const state = makeState([{ id: 0, x: 20, y: 20 }]);
    expect(step(state).balls[0]?.active).toBe(false);
  });

  it("шар в поле у линии рта — не забит", () => {
    const state = makeState([{ id: 0, x: 105, y: 105 }]);
    expect(step(state).balls[0]?.active).toBe(true);
  });

  it("шар вдоль длинного борта мимо боковой лузы не падает", () => {
    const state = makeState([{ id: 0, x: 1270, y: BALL_RADIUS, vx: 300 }]);
    let current = state;
    for (let i = 0; i < 30; i += 1) current = step(current);
    expect(current.balls[0]?.active).toBe(true);
  });

  it("все 6 луз глотают лобовой шар", () => {
    // Регрессия V1 (фаза 02-a): задние кромки отбивали шар раньше линии.
    for (const pocket of buildTableGeometry().pockets) {
      const L = 60;
      const state = makeState([
        {
          id: 0,
          x: pocket.center.x - pocket.outward.x * L,
          y: pocket.center.y - pocket.outward.y * L,
          vx: pocket.outward.x * 400,
          vy: pocket.outward.y * 400,
        },
      ]);
      expect(simulateToRest(state).balls[0]?.active).toBe(false);
    }
  });
});

describe("физика: удар", () => {
  it("невалидный удар отклоняется и не меняет состояние", () => {
    expect(isValidShot({ angle: 0, power: 2 })).toBe(false);
    expect(isValidShot({ angle: Number.NaN, power: 0.5 })).toBe(false);
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    expect(strike(state, { angle: 0, power: 2 })).toEqual(state);
  });

  it("удар задаёт скорость битка и приводит к покою", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const next = applyShot(state, { angle: 0, power: 0.2 });
    expect(next.balls[0]?.x).not.toBe(600);
    expect(isAtRest(next)).toBe(true);
  });

  it("разные удары дают разные траектории", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const right = applyShot(state, { angle: 0, power: 0.2 }).balls[0]?.x ?? 0;
    const left = applyShot(state, { angle: Math.PI, power: 0.2 }).balls[0]?.x ?? 0;
    expect(right).not.toBe(left);
  });
});

describe("физика: полнота гарантий", () => {
  it("касательный удар о нос теряет тангенциальную скорость", () => {
    const state = makeState([{ id: 0, x: 600, y: BALL_RADIUS - 0.5, vx: 200, vy: -200 }]);
    const next = step(state);
    expect(next.balls[0]?.vy).toBeGreaterThan(0);
    expect(Math.abs(next.balls[0]?.vx ?? 0)).toBeLessThan(200);
    expect(next.balls[0]?.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("шар не выходит за внешние границы", () => {
    const state = makeState([{ id: 0, x: 600, y: 400, vy: 6000 }]);
    const next = simulateToRest(state);
    const ball = next.balls[0]!;
    expect(ball.y).toBeLessThanOrEqual(TABLE_WIDTH - BALL_RADIUS + 0.001);
    expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("шар-шар: импульс и энергия не растут", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 400 },
      { id: 1, x: 800, y: 635, vx: -300 },
    ]);
    const before = totalMomentum(state);
    const energyBefore = totalEnergy(state);
    const next = simulateToRest(state);
    expect(totalMomentum(next)).toBeLessThanOrEqual(before + 1e-6);
    expect(totalEnergy(next)).toBeLessThanOrEqual(energyBefore + 1e-6);
  });

  it("после соударения шары не перекрываются", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 500 },
      { id: 1, x: 700, y: 635 },
    ]);
    const next = simulateToRest(state);
    const a = next.balls[0]!;
    const b = next.balls[1]!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * BALL_RADIUS - 0.5);
  });

  it("перекрытые покоящиеся шары разъезжаются", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 600 + BALL_RADIUS, y: 635 },
    ]);
    const next = step(state);
    const a = next.balls[0]!;
    const b = next.balls[1]!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(BALL_RADIUS);
  });

  it("порядок пар стабилен: повтор шага идентичен", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 300 },
      { id: 1, x: 660, y: 635 },
      { id: 2, x: 630, y: 663 },
    ]);
    expect(step(state)).toEqual(step(state));
  });

  it("луза: прижатый к борту шар в угловую — забит", () => {
    const state = makeState([{ id: 0, x: 30, y: 30 }]);
    expect(step(state).balls[0]?.active).toBe(false);
  });

  it("луза: пересечение линии в стороне от зева — не забит", () => {
    const state = makeState([{ id: 0, x: 70, y: 20 }]);
    expect(step(state).balls[0]?.active).toBe(true);
  });

  it("луза: шар в поле у линии рта (не наружу) — не забит", () => {
    const state = makeState([{ id: 0, x: 50, y: 40 }]);
    expect(step(state).balls[0]?.active).toBe(true);
  });
});

function totalMomentum(state: BilliardsState): number {
  return state.balls.reduce((sum, b) => sum + (b.active ? Math.hypot(b.vx, b.vy) : 0), 0);
}

function totalEnergy(state: BilliardsState): number {
  return state.balls.reduce(
    (sum, b) => sum + (b.active ? (b.vx * b.vx + b.vy * b.vy) / 2 : 0),
    0,
  );
}
