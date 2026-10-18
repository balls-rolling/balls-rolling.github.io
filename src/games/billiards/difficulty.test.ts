import { describe, expect, it } from "vitest";
import {
  DIFFICULTY_MAX,
  INITIAL_DIFFICULTY,
  applyAutoResult,
  clampScale,
  skillFor,
  type DifficultyState,
} from "./difficulty";

/** Прогнать серию исходов подряд. */
function series(start: DifficultyState, results: readonly boolean[]): DifficultyState {
  return results.reduce((state, won) => applyAutoResult(state, { won }), start);
}

describe("сложность ИИ: одна шкала и «авто»", () => {
  it("шкала клампится в 0..MAX, навык — доля от максимума", () => {
    expect(clampScale(-3)).toBe(0);
    expect(clampScale(99)).toBe(DIFFICULTY_MAX);
    expect(clampScale(Number.NaN)).toBe(0);
    expect(skillFor(0)).toBe(0);
    expect(skillFor(DIFFICULTY_MAX)).toBe(1);
    expect(skillFor(DIFFICULTY_MAX / 2)).toBeCloseTo(0.5, 6);
  });

  it("одна партия не двигает шкалу (не чаще раза в две)", () => {
    const afterOneWin = applyAutoResult(INITIAL_DIFFICULTY, { won: true });
    expect(afterOneWin.scale).toBe(INITIAL_DIFFICULTY.scale);
    expect(afterOneWin.games).toBe(1);
    const afterOneLoss = applyAutoResult(INITIAL_DIFFICULTY, { won: false });
    expect(afterOneLoss.scale).toBe(INITIAL_DIFFICULTY.scale);
  });

  it("две победы подряд повышают, две серии — не чаще раза в две партии", () => {
    const two = series(INITIAL_DIFFICULTY, [true, true]);
    expect(two.scale).toBeGreaterThan(INITIAL_DIFFICULTY.scale);
    expect(two.sinceChange).toBe(0);
    // Третья победа подряд — снова копится, шкалу не трогает.
    const three = applyAutoResult(two, { won: true });
    expect(three.scale).toBe(two.scale);
    expect(three.sinceChange).toBe(1);
    const four = applyAutoResult(three, { won: true });
    expect(four.scale).toBeGreaterThan(two.scale);
  });

  it("dead-zone: чередование победы и поражения шкалу не двигает", () => {
    const alternating = series(INITIAL_DIFFICULTY, [true, false, true, false, true, false]);
    expect(alternating.scale).toBe(INITIAL_DIFFICULTY.scale);
    expect(alternating.games).toBe(6);
  });

  it("понижение быстрее повышения", () => {
    const up = series(INITIAL_DIFFICULTY, [true, true]);
    const down = series(INITIAL_DIFFICULTY, [false, false]);
    expect(INITIAL_DIFFICULTY.scale - down.scale).toBeGreaterThan(up.scale - INITIAL_DIFFICULTY.scale);
  });

  it("шкала не выходит за границы и исходное состояние не мутируется", () => {
    const start: DifficultyState = { scale: DIFFICULTY_MAX, games: 0, sinceChange: 0, lastWon: null };
    const up = series(start, [true, true]);
    expect(up.scale).toBe(DIFFICULTY_MAX);
    const low: DifficultyState = { scale: 0, games: 0, sinceChange: 0, lastWon: null };
    const down = series(low, [false, false]);
    expect(down.scale).toBe(0);
    expect(start).toEqual({ scale: DIFFICULTY_MAX, games: 0, sinceChange: 0, lastWon: null });
  });
});
