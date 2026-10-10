import { describe, expect, it } from "vitest";
import {
  BALL_COLORS,
  BALL_DIAMETER,
  BALL_RADIUS,
  CORNER_MOUTH,
  E_BALL,
  E_FACING,
  E_RAIL,
  MAX_SHOT_SECONDS,
  MAX_SHOT_SPEED,
  PHYS_DT,
  POS_SLOP,
  ROLL_DECEL,
  SIDE_MOUTH,
  SLEEP_SPEED,
  SUBSTEP_CAP,
  SUBSTEP_TRAVEL_FRACTION,
  TABLE_LENGTH,
  TABLE_WIDTH,
  TANG_KEEP_FACING,
  TANG_KEEP_RAIL,
} from "./constants";

describe("константы бильярда", () => {
  it("стол ровно 2:1", () => {
    expect(TABLE_LENGTH).toBe(2 * TABLE_WIDTH);
  });

  it("ширина/диаметр ≈ 22.2", () => {
    expect(TABLE_WIDTH / BALL_DIAMETER).toBeCloseTo(22.22, 1);
  });

  it("боковой рот шире углового", () => {
    expect(SIDE_MOUTH).toBeGreaterThan(CORNER_MOUTH);
  });

  it("радиус — половина диаметра", () => {
    expect(BALL_RADIUS).toBe(BALL_DIAMETER / 2);
  });

  it("16 валидных hex-цветов", () => {
    expect(BALL_COLORS).toHaveLength(16);
    for (const color of BALL_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("инварианты физики", () => {
    expect(PHYS_DT).toBeGreaterThan(0);
    expect(ROLL_DECEL).toBeGreaterThan(0);
    expect(SLEEP_SPEED).toBeGreaterThan(0);
    expect(SUBSTEP_CAP).toBeGreaterThan(0);
    expect(SUBSTEP_TRAVEL_FRACTION).toBeGreaterThan(0);
    expect(POS_SLOP).toBeGreaterThan(0);
    expect(MAX_SHOT_SPEED).toBeGreaterThan(0);
    expect(MAX_SHOT_SECONDS).toBeGreaterThan(0);
    for (const restitution of [E_BALL, E_RAIL, E_FACING]) {
      expect(restitution).toBeGreaterThanOrEqual(0);
      expect(restitution).toBeLessThan(1);
    }
    for (const keep of [TANG_KEEP_RAIL, TANG_KEEP_FACING]) {
      expect(keep).toBeGreaterThanOrEqual(0);
      expect(keep).toBeLessThanOrEqual(1);
    }
  });
});
