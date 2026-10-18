import { describe, expect, it } from "vitest";
import { ballsOf, colorOf, isSolid, isStripe } from "./balls";
import { BASE_8BALL } from "./modes/base8ball";
import type { ModeConfig } from "./modes/types";

/** Набор 8-ball — эталон прежнего поведения. */
const BALLS = ballsOf(BASE_8BALL);

describe("набор шаров из конфига", () => {
  it("8-ball: 16 шаров", () => {
    expect(BALLS).toHaveLength(16);
  });

  it("виды: 0 — cue, 1–7 solid, 8 — eight, 9–15 stripe", () => {
    expect(BALLS[0]?.kind).toBe("cue");
    for (let id = 1; id <= 7; id += 1) expect(BALLS[id]?.kind).toBe("solid");
    expect(BALLS[8]?.kind).toBe("eight");
    for (let id = 9; id <= 15; id += 1) expect(BALLS[id]?.kind).toBe("stripe");
  });

  it("цвета берутся из конфига режима", () => {
    expect(colorOf(8, BASE_8BALL)).toBe(BASE_8BALL.balls.colors[8]);
    expect(BALLS[7]?.color).toBe(BASE_8BALL.balls.colors[7]);
    expect(new Set(BALLS.map((b) => b.color)).size).toBeGreaterThanOrEqual(8);
  });

  it("радиус и масса берутся из конфига (диаметр / 2)", () => {
    expect(BALLS[0]?.radius).toBe(BASE_8BALL.balls.diameter / 2);
    expect(BALLS[0]?.mass).toBe(BASE_8BALL.balls.mass);
  });

  it("подмена цвета/диаметра/массы в конфиге отражается в наборе", () => {
    const custom: ModeConfig = {
      ...BASE_8BALL,
      balls: {
        diameter: 100,
        mass: 0.2,
        colors: BASE_8BALL.balls.colors.map(() => "#123456"),
      },
    };
    const customDef = ballsOf(custom);
    expect(customDef[3]?.radius).toBe(50);
    expect(customDef[3]?.mass).toBe(0.2);
    expect(customDef[3]?.color).toBe("#123456");
    expect(colorOf(15, custom)).toBe("#123456");
  });

  it("colorOf: безопасный фолбэк, если цвета нет в конфиге", () => {
    const short: ModeConfig = { ...BASE_8BALL, balls: { ...BASE_8BALL.balls, colors: [] } };
    expect(colorOf(3, short)).toBe("#000000");
  });

  it("хелперы сплошной/полосатый", () => {
    expect(isSolid(3)).toBe(true);
    expect(isSolid(9)).toBe(false);
    expect(isStripe(10)).toBe(true);
    expect(isStripe(2)).toBe(false);
  });
});
