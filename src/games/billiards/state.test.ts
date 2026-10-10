import { describe, expect, it } from "vitest";
import { DEFAULT_SEED } from "./constants";
import {
  createInitialState,
  deserializeBilliardsState,
  serializeBilliardsState,
} from "./state";

describe("состояние бильярда", () => {
  it("16 шаров, ids 0–15, состав игроков сохранён", () => {
    const state = createInitialState(["p1", "p2"]);
    expect(state.balls).toHaveLength(16);
    expect(state.balls.map((b) => b.id)).toEqual([...Array(16).keys()]);
    expect(state.order).toEqual(["p1", "p2"]);
    expect(state.finished).toBe(false);
  });

  it("детерминизм по seed", () => {
    expect(createInitialState(["p1"], 11).balls).toEqual(createInitialState(["p1"], 11).balls);
  });

  it("round-trip через JSON без потерь", () => {
    const state = createInitialState(["p1", "p2"], DEFAULT_SEED);
    const json = JSON.parse(JSON.stringify(serializeBilliardsState(state)));
    expect(deserializeBilliardsState(json)).toEqual(state);
  });

  it("валидатор отбрасывает мусор", () => {
    expect(deserializeBilliardsState(null)).toBeNull();
    expect(deserializeBilliardsState({})).toBeNull();
    expect(deserializeBilliardsState({ version: 2 })).toBeNull();
    const broken = JSON.parse(
      JSON.stringify(serializeBilliardsState(createInitialState(["p1"]))),
    );
    broken.balls = broken.balls.slice(0, 15);
    expect(deserializeBilliardsState(broken)).toBeNull();
  });

  it("валидатор отвергает не-числа, переставленные id и битый спин", () => {
    const base = JSON.parse(JSON.stringify(serializeBilliardsState(createInitialState(["p1"]))));

    const nonFinite = structuredClone(base);
    nonFinite.balls[2].x = Infinity;
    expect(deserializeBilliardsState(nonFinite)).toBeNull();

    const swapped = structuredClone(base);
    [swapped.balls[1], swapped.balls[2]] = [swapped.balls[2], swapped.balls[1]];
    expect(deserializeBilliardsState(swapped)).toBeNull();

    const brokenSpin = structuredClone(base);
    brokenSpin.balls[3].spin.x = "nope";
    expect(deserializeBilliardsState(brokenSpin)).toBeNull();
  });
});
