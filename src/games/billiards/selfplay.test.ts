import { describe, expect, it, vi } from "vitest";
import { buildTableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import { applyShotWithLog, type Shot } from "./physics";
import { resolveShot } from "./rules-8ball";
import { serializeBilliardsState, createInitialState, type BilliardsState } from "./state";
import { chooseShot } from "./ai";

/** Геометрия режима 8-ball: та же, что строит игра. */
const G = buildTableGeometry(BASE_8BALL);

/** Предел ударов на self-play: защита от незавершающейся партии. */
const MAX_SHOTS = 600;

/** Поставить биток по удару ИИ (после фола он лежит в «руке»). */
function placeCue(state: BilliardsState, shot: Shot): BilliardsState {
  if (typeof shot.cueX !== "number" || typeof shot.cueY !== "number") return state;
  const x = shot.cueX;
  const y = shot.cueY;
  return {
    ...state,
    balls: state.balls.map((b) =>
      b.id === 0
        ? { ...b, x, y, vx: 0, vy: 0, spin: { x: 0, y: 0, z: 0 }, active: true }
        : b,
    ),
  };
}

/** Отыграть партию двух ИИ до победы или лимита ударов. */
function selfPlay(seed: number, skill: number): { shots: Shot[]; final: BilliardsState } {
  let state = createInitialState(BASE_8BALL, ["p1", "p2"], seed, { rules: "simple" });
  const shots: Shot[] = [];
  for (let i = 0; i < MAX_SHOTS && !state.finished; i += 1) {
    const shot = chooseShot(state, G, { skill });
    if (!shot) break;
    const placed = placeCue(state, shot);
    const { state: rest, log } = applyShotWithLog(placed, shot, G);
    state = resolveShot(rest, log);
    shots.push(shot);
  }
  return { shots, final: state };
}

describe("self-play партии 8-ball", () => {
  it("партия доигрывается до победителя за конечное число ударов", () => {
    const { shots, final } = selfPlay(1, 0.9);
    expect(final.finished).toBe(true);
    expect(final.winner === "p1" || final.winner === "p2").toBe(true);
    expect(final.finishReason).toBe("eightBall");
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.length).toBeLessThan(MAX_SHOTS);
  });

  it("один seed — идентичная последовательность ударов и конечное состояние", () => {
    const first = selfPlay(42, 0.7);
    const second = selfPlay(42, 0.7);
    expect(second.shots).toEqual(first.shots);
    expect(serializeBilliardsState(second.final)).toEqual(serializeBilliardsState(first.final));
  });

  it("разные seed дают разные партии", () => {
    const a = selfPlay(1, 0.7);
    const b = selfPlay(2, 0.7);
    expect(b.shots).not.toEqual(a.shots);
  });

  it("путь удара не вызывает Math.random", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random в пути удара запрещён");
    });
    try {
      const { final } = selfPlay(5, 0.8);
      expect(final.finished).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
