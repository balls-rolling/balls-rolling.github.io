import { describe, expect, it } from "vitest";
import { BALLS, colorOf, isSolid, isStripe } from "./balls";

describe("определения шаров", () => {
  it("16 шаров", () => {
    expect(BALLS).toHaveLength(16);
  });

  it("виды: 0 — cue, 1–7 solid, 8 — eight, 9–15 stripe", () => {
    expect(BALLS[0]?.kind).toBe("cue");
    for (let id = 1; id <= 7; id += 1) expect(BALLS[id]?.kind).toBe("solid");
    expect(BALLS[8]?.kind).toBe("eight");
    for (let id = 9; id <= 15; id += 1) expect(BALLS[id]?.kind).toBe("stripe");
  });

  it("цвета берутся из палитры", () => {
    expect(colorOf(8)).toBe(BALLS[8]?.color);
    expect(new Set(BALLS.map((b) => b.color)).size).toBeGreaterThanOrEqual(8);
  });

  it("хелперы сплошной/полосатый", () => {
    expect(isSolid(3)).toBe(true);
    expect(isSolid(9)).toBe(false);
    expect(isStripe(10)).toBe(true);
    expect(isStripe(2)).toBe(false);
  });
});
