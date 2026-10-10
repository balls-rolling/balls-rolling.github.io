import { describe, expect, it } from "vitest";
import { isSolid, isStripe } from "./balls";
import {
  BALL_DIAMETER,
  BALL_RADIUS,
  FOOT_SPOT,
  HEAD_SPOT,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import { rackPlacements } from "./rack";

describe("раскладка шаров", () => {
  it("один seed — одна раскладка", () => {
    expect(rackPlacements(42)).toEqual(rackPlacements(42));
  });

  it("разные seed — разные раскладки", () => {
    const a = rackPlacements(1)
      .map((p) => `${p.id}:${p.x}:${p.y}`)
      .join("|");
    const b = rackPlacements(2)
      .map((p) => `${p.id}:${p.x}:${p.y}`)
      .join("|");
    expect(a).not.toBe(b);
  });

  it("16 шаров с id 0–15", () => {
    const ids = rackPlacements(7)
      .map((p) => p.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual([...Array(16).keys()]);
  });

  it("биток на головном пятне", () => {
    const cue = rackPlacements(3).find((p) => p.id === 0);
    expect(cue?.x).toBeCloseTo(HEAD_SPOT.x, 6);
    expect(cue?.y).toBeCloseTo(HEAD_SPOT.y, 6);
  });

  it("вершина пирамиды на подставке", () => {
    const placements = rackPlacements(9);
    const apex = placements
      .filter((p) => p.id !== 0)
      .reduce((best, p) => (p.x < best.x ? p : best));
    expect(apex.x).toBeCloseTo(FOOT_SPOT.x, 6);
    expect(apex.y).toBeCloseTo(FOOT_SPOT.y, 6);
  });

  it("шары не пересекаются", () => {
    const placements = rackPlacements(5);
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i]!;
        const b = placements[j]!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance).toBeGreaterThanOrEqual(BALL_DIAMETER - 1e-6);
      }
    }
  });

  it("8-й — в центре третьего ряда", () => {
    const eight = rackPlacements(13).find((p) => p.id === 8);
    expect(eight?.x).toBeCloseTo(FOOT_SPOT.x + 2 * BALL_RADIUS * Math.sqrt(3), 6);
    expect(eight?.y).toBeCloseTo(FOOT_SPOT.y, 6);
  });

  it("задние углы — сплошной и полосатый", () => {
    const placements = rackPlacements(17);
    const maxX = Math.max(...placements.map((p) => p.x));
    const backRow = placements.filter((p) => Math.abs(p.x - maxX) < 1e-6);
    expect(backRow).toHaveLength(5);
    const sorted = [...backRow].sort((a, b) => a.y - b.y);
    const corners = [sorted[0]!, sorted[sorted.length - 1]!];
    const kinds = corners.map((p) => (isSolid(p.id) ? "solid" : isStripe(p.id) ? "stripe" : "other"));
    expect(kinds).toContain("solid");
    expect(kinds).toContain("stripe");
  });

  it("все шары внутри поля", () => {
    for (const placement of rackPlacements(23)) {
      expect(placement.x).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6);
      expect(placement.x).toBeLessThanOrEqual(TABLE_LENGTH - BALL_RADIUS + 1e-6);
      expect(placement.y).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-6);
      expect(placement.y).toBeLessThanOrEqual(TABLE_WIDTH - BALL_RADIUS + 1e-6);
    }
  });
});
