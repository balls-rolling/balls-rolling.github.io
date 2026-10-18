import { describe, expect, it } from "vitest";
import { isSolid, isStripe } from "./balls";
import { FOOT_SPOT, HEAD_SPOT, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { BASE_8BALL } from "./modes/base8ball";
import type { ModeConfig } from "./modes/types";
import { rackPlacements } from "./rack";

describe("раскладка шаров из конфига", () => {
  it("раскладка детерминирована: один конфиг даёт одно и то же (без случайности)", () => {
    const a = rackPlacements(BASE_8BALL)
      .map((p) => `${p.id}:${p.x}:${p.y}`)
      .join("|");
    const b = rackPlacements(BASE_8BALL)
      .map((p) => `${p.id}:${p.x}:${p.y}`)
      .join("|");
    expect(a).toBe(b);
  });

  it("16 шаров с id 0–15", () => {
    const ids = rackPlacements(BASE_8BALL)
      .map((p) => p.id)
      .sort((a, b) => a - b);
    expect(ids).toEqual([...Array(16).keys()]);
  });

  it("биток на головном пятне", () => {
    const cue = rackPlacements(BASE_8BALL).find((p) => p.id === 0);
    expect(cue?.x).toBeCloseTo(HEAD_SPOT.x, 6);
    expect(cue?.y).toBeCloseTo(HEAD_SPOT.y, 6);
  });

  it("вершина пирамиды — единица на подставке", () => {
    const placements = rackPlacements(BASE_8BALL);
    const apex = placements.find((p) => p.id === 1);
    expect(apex?.x).toBeCloseTo(FOOT_SPOT.x, 6);
    expect(apex?.y).toBeCloseTo(FOOT_SPOT.y, 6);
  });

  it("шары не пересекаются", () => {
    const placements = rackPlacements(BASE_8BALL);
    const diameter = BASE_8BALL.balls.diameter;
    for (let i = 0; i < placements.length; i += 1) {
      for (let j = i + 1; j < placements.length; j += 1) {
        const a = placements[i]!;
        const b = placements[j]!;
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        expect(distance).toBeGreaterThanOrEqual(diameter - 1e-6);
      }
    }
  });

  it("8-й — в центре третьего ряда", () => {
    const eight = rackPlacements(BASE_8BALL).find((p) => p.id === 8);
    const radius = BASE_8BALL.balls.diameter / 2;
    expect(eight?.x).toBeCloseTo(FOOT_SPOT.x + 2 * radius * Math.sqrt(3), 6);
    expect(eight?.y).toBeCloseTo(FOOT_SPOT.y, 6);
  });

  it("задние углы — сплошной и полосатый", () => {
    const placements = rackPlacements(BASE_8BALL);
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
    const radius = BASE_8BALL.balls.diameter / 2;
    for (const placement of rackPlacements(BASE_8BALL)) {
      expect(placement.x).toBeGreaterThanOrEqual(radius - 1e-6);
      expect(placement.x).toBeLessThanOrEqual(TABLE_LENGTH - radius + 1e-6);
      expect(placement.y).toBeGreaterThanOrEqual(radius - 1e-6);
      expect(placement.y).toBeLessThanOrEqual(TABLE_WIDTH - radius + 1e-6);
    }
  });

  it("порядок номеров по слотам задаёт конфиг", () => {
    const custom: ModeConfig = {
      ...BASE_8BALL,
      rack: { ...BASE_8BALL.rack, order: [15, 14, 13, 12, 8, 11, 10, 9, 7, 6, 5, 4, 3, 2, 1] },
    };
    const apex = rackPlacements(custom).find((p) => p.x === FOOT_SPOT.x && p.y === FOOT_SPOT.y);
    expect(apex?.id).toBe(15);
  });

  it("диаметр шара конфига задаёт расстояние между рядами", () => {
    const custom: ModeConfig = {
      ...BASE_8BALL,
      balls: { ...BASE_8BALL.balls, diameter: BASE_8BALL.balls.diameter * 2 },
    };
    const eight = rackPlacements(custom).find((p) => p.id === 8);
    const radius = custom.balls.diameter / 2;
    expect(eight?.x).toBeCloseTo(FOOT_SPOT.x + 2 * radius * Math.sqrt(3), 6);
  });
});
