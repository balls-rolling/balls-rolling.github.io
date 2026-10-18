import { describe, expect, it } from "vitest";
import { BALL_RADIUS, HEAD_SPOT, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { buildTableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import { applyShotWithLog, isValidShot, type Shot } from "./physics";
import { candidateShots, chooseShot, mulberry32, planShot } from "./ai";
import type { BallGroup, BallState, BilliardsState } from "./state";

/** Геометрия режима 8-ball: та же, что строит игра. */
const G = buildTableGeometry(BASE_8BALL);

interface BallInput {
  id: number;
  x: number;
  y: number;
  active?: boolean;
}

function makeState(
  balls: readonly BallInput[],
  patch: Partial<BilliardsState> = {},
): BilliardsState {
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
    order: ["p1", "p2"],
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
    prep: { canPlaceCue: false, canChooseCueBall: false },
    ...patch,
  };
}

/** Биток и один шар на линии к угловой лузе (1) — прямой удар в лузу. */
function potScene(targetId: number, group: BallGroup | null = "solid"): BilliardsState {
  const cueAt = { x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 };
  const pocket = { x: TABLE_LENGTH, y: 0 };
  const dx = pocket.x - cueAt.x;
  const dy = pocket.y - cueAt.y;
  const len = Math.hypot(dx, dy);
  const targetAt = { x: cueAt.x + (dx / len) * 700, y: cueAt.y + (dy / len) * 700 };
  const balls: BallInput[] = [
    { id: 0, ...cueAt },
    { id: targetId, ...targetAt },
  ];
  for (let id = 1; id <= 15; id += 1) {
    if (id !== targetId) balls.push({ id, x: 0, y: 0, active: false });
  }
  return makeState(balls, {
    shotSeq: 1,
    phase: group === null ? "open" : "assigned",
    groups: group === null ? null : { p1: group, p2: group === "solid" ? "stripe" : "solid" },
  });
}

/** Стандартное отклонение выборки. */
function stddev(values: readonly number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/** Разброс угла относительно лучшего кандидата при заданном навыке. */
function angleSpread(state: BilliardsState, skill: number, count = 200): number {
  const base = candidateShots(state, G)[0]!.angle;
  const samples: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    const shot = chooseShot(state, G, { skill, rng: mulberry32(i * 7919 + 13) });
    samples.push(shot!.angle - base);
  }
  return stddev(samples);
}

describe("ИИ: перебор кандидатов и выбор легального удара", () => {
  it("на прямом столе выбирает удар, забивающий свой шар", () => {
    const state = potScene(1);
    const shot = chooseShot(state, G, { skill: 1 });
    expect(shot).not.toBeNull();
    expect(isValidShot(shot!)).toBe(true);
    const { log } = applyShotWithLog(state, shot!, G);
    expect(log.pocketedIds).toContain(1);
    expect(log.cueScratched).toBe(false);
  });

  it("не целит в чужой шар, пока есть свои", () => {
    const cue = { x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 };
    const balls: BallInput[] = [
      { id: 0, ...cue },
      { id: 1, x: 1200, y: 500 },
      { id: 9, x: 1500, y: 700 },
    ];
    for (let id = 2; id <= 15; id += 1) {
      if (id !== 9) balls.push({ id, x: 0, y: 0, active: false });
    }
    const state = makeState(balls, {
      shotSeq: 1,
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
    });
    const candidates = candidateShots(state, G);
    expect(candidates.length).toBeGreaterThan(0);
    // Все цели — сплошные (своя группа); полосатой 9 среди целей нет.
    for (const candidate of candidates) {
      expect(candidate.targetId).toBeGreaterThanOrEqual(1);
      expect(candidate.targetId).toBeLessThanOrEqual(7);
    }
  });

  it("не бьёт 8, пока есть свои шары группы", () => {
    const balls: BallInput[] = [
      { id: 0, x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 },
      { id: 1, x: 1200, y: 500 },
      { id: 8, x: 1500, y: 700 },
    ];
    for (let id = 2; id <= 15; id += 1) {
      if (id !== 8) balls.push({ id, x: 0, y: 0, active: false });
    }
    const state = makeState(balls, {
      shotSeq: 1,
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
    });
    const candidates = candidateShots(state, G);
    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) expect(candidate.targetId).not.toBe(8);
  });

  it("порядок кандидатов детерминирован, выбор при одном seed повторяется", () => {
    const state = potScene(1);
    const first = candidateShots(state, G);
    const second = candidateShots(state, G);
    expect(second).toEqual(first);
    const a = chooseShot(state, G, { skill: 0.5 });
    const b = chooseShot(state, G, { skill: 0.5 });
    expect(b).toEqual(a);
  });

  it("нет легального удара — null, без зависания", () => {
    const state = makeState([
      { id: 0, x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 },
      ...Array.from({ length: 15 }, (_, i) => ({ id: i + 1, x: 0, y: 0, active: false })),
    ]);
    expect(candidateShots(state, G)).toHaveLength(0);
    expect(chooseShot(state, G, { skill: 0.5 })).toBeNull();
  });

  it("забить нечем, но цель есть — бьёт по ней (плохой, но легальный удар)", () => {
    // Цель вплотную к борту в углу: забить некуда, но попасть можно.
    const balls: BallInput[] = [
      { id: 0, x: 400, y: 635 },
      { id: 1, x: 120, y: 120 },
    ];
    for (let id = 2; id <= 15; id += 1) balls.push({ id, x: 0, y: 0, active: false });
    const state = makeState(balls, {
      shotSeq: 1,
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
    });
    const plan = planShot(state, G, { skill: 1 });
    expect(plan).not.toBeNull();
    expect(plan!.chosen).not.toBeNull();
    // Удар всё равно направлен на свой шар: первый контакт — он.
    const { log } = applyShotWithLog(state, plan!.chosen, G);
    expect(log.firstContactId).toBe(1);
  });

  it("план для показа: кандидаты без шума, выбранный — последний", () => {
    const state = potScene(1);
    const plan = planShot(state, G, { skill: 0.5 });
    expect(plan).not.toBeNull();
    expect(plan!.candidates.length).toBeGreaterThan(0);
    expect(plan!.candidates.length).toBeLessThanOrEqual(4);
    // Выбранный удар близок к последнему показанному (лучшему) кандидату.
    const last = plan!.candidates[plan!.candidates.length - 1]!;
    expect(Math.abs(plan!.chosen.angle - last.angle)).toBeLessThan(0.02);
  });
});

describe("ИИ: ошибка по навыку", () => {
  it("навык 1 не идеален: разброс угла больше нуля (σ_min > 0)", () => {
    expect(angleSpread(potScene(1), 1)).toBeGreaterThan(0);
  });

  it("меньший навык — больший разброс", () => {
    const state = potScene(1);
    const weak = angleSpread(state, 0.1);
    const strong = angleSpread(state, 1);
    expect(weak).toBeGreaterThan(strong);
  });

  it("один seed → одна последовательность ударов; разные seed расходятся", () => {
    const base = potScene(1);
    const shotOf = (seed: number): Shot => {
      const state = { ...base, seed };
      return chooseShot(state, G, { skill: 0.3 })!;
    };
    expect(shotOf(7)).toEqual(shotOf(7));
    // Разные seed с высокой вероятностью дают разные углы (шум не нулевой).
    expect(shotOf(7).angle).not.toBe(shotOf(8).angle);
  });
});

describe("ИИ: биток с руки после фола", () => {
  it("ставит биток сам: координаты в ударе, без пересечений и за бортом", () => {
    const cue = { x: HEAD_SPOT.x, y: TABLE_WIDTH / 2 };
    const balls: BallInput[] = [
      { id: 0, x: 0, y: 0, active: false },
      { id: 1, x: 1600, y: 500 },
    ];
    for (let id = 2; id <= 15; id += 1) balls.push({ id, x: 0, y: 0, active: false });
    const state = makeState(balls, {
      shotSeq: 4,
      phase: "assigned",
      groups: { p1: "solid", p2: "stripe" },
      ballInHand: true,
      prep: { canPlaceCue: true, canChooseCueBall: false },
    });
    // Биток в «руке»: оценка идёт от точки постановки, а не от старого места.
    const shot = chooseShot(state, G, { skill: 1 });
    expect(shot).not.toBeNull();
    expect(typeof shot!.cueX).toBe("number");
    expect(typeof shot!.cueY).toBe("number");
    expect(isValidShot(shot!)).toBe(true);
    const x = shot!.cueX!;
    const y = shot!.cueY!;
    expect(x).toBeGreaterThanOrEqual(BALL_RADIUS);
    expect(x).toBeLessThanOrEqual(TABLE_LENGTH - BALL_RADIUS);
    expect(y).toBeGreaterThanOrEqual(BALL_RADIUS);
    expect(y).toBeLessThanOrEqual(TABLE_WIDTH - BALL_RADIUS);
    for (const ball of state.balls) {
      if (ball.id === 0 || !ball.active) continue;
      expect(Math.hypot(ball.x - x, ball.y - y)).toBeGreaterThanOrEqual(2 * BALL_RADIUS - 1e-6);
    }
    expect(cue.x).toBe(HEAD_SPOT.x); // фикстура не тронута
  });
});
