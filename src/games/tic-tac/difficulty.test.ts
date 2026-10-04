import { describe, expect, it } from "vitest";
import { INITIAL_RATING, applyResult, levelFor } from "./difficulty";

describe("математика сложности", () => {
  it("уровень по рейтингу 0..4", () => {
    expect(levelFor(0)).toBe(0);
    expect(levelFor(24)).toBe(0);
    expect(levelFor(25)).toBe(1);
    expect(levelFor(99)).toBe(3);
    expect(levelFor(100)).toBe(4);
  });

  it("победа растит рейтинг и счётчики", () => {
    const next = applyResult(INITIAL_RATING, { won: true, moves: 10 });
    expect(next).toEqual({ rating: 10, games: 1, wins: 1 });
  });

  it("быстрая победа весомее медленной", () => {
    const fast = applyResult(INITIAL_RATING, { won: true, moves: 4 });
    const slow = applyResult(INITIAL_RATING, { won: true, moves: 40 });
    expect(fast.rating).toBeGreaterThan(slow.rating);
    expect(slow.rating).toBe(3); // минимум прироста
  });

  it("поражение снижает на 8, не ниже нуля", () => {
    const rated = { rating: 20, games: 3, wins: 1 };
    expect(applyResult(rated, { won: false, moves: 30 })).toEqual({
      rating: 12,
      games: 4,
      wins: 1,
    });
    expect(applyResult({ ...rated, rating: 5 }, { won: false, moves: 30 }).rating).toBe(0);
  });

  it("кламп сверху сотней и накопление счётчиков", () => {
    let state = { rating: 95, games: 0, wins: 0 };
    state = applyResult(state, { won: true, moves: 9 });
    expect(state.rating).toBe(100);
    state = applyResult(state, { won: true, moves: 9 });
    expect(state.rating).toBe(100);
    expect(state.games).toBe(2);
    expect(state.wins).toBe(2);
  });

  it("не меняет переданное состояние", () => {
    const state = { rating: 50, games: 5, wins: 2 };
    applyResult(state, { won: false, moves: 10 });
    expect(state).toEqual({ rating: 50, games: 5, wins: 2 });
  });
});
