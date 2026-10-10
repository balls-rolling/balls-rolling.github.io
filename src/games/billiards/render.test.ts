import { describe, expect, it } from "vitest";
import { RAIL_WIDTH, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { computeFit, ZERO_INSETS } from "./render";

const OUTER_W = TABLE_LENGTH + 2 * RAIL_WIDTH;
const OUTER_H = TABLE_WIDTH + 2 * RAIL_WIDTH;

describe("computeFit", () => {
  it("вписывает стол с отступом, сохраняя пропорции", () => {
    const size = { width: 1200, height: 700 };
    const fit = computeFit(size, 16);
    expect(OUTER_W * fit.scale).toBeLessThanOrEqual(size.width - 32 + 1e-6);
    expect(OUTER_H * fit.scale).toBeLessThanOrEqual(size.height - 32 + 1e-6);
    const widthBound = Math.abs(OUTER_W * fit.scale - (size.width - 32)) < 1e-6;
    const heightBound = Math.abs(OUTER_H * fit.scale - (size.height - 32)) < 1e-6;
    expect(widthBound || heightBound).toBe(true);
  });

  it("центрирует стол по горизонтали", () => {
    const size = { width: 1200, height: 700 };
    const fit = computeFit(size, 16);
    const left = fit.offsetX - RAIL_WIDTH * fit.scale;
    const right = fit.offsetX + (TABLE_LENGTH + RAIL_WIDTH) * fit.scale;
    expect(left + right).toBeCloseTo(size.width, 6);
  });

  it("на крошечном кадре масштаб положителен", () => {
    const fit = computeFit({ width: 10, height: 10 }, 100);
    expect(fit.scale).toBeGreaterThan(0);
  });

  it("insets поднимают стол над панелями", () => {
    const size = { width: 900, height: 800 };
    const inset = 120;
    const fit = computeFit(size, 16, { top: 0, right: 0, bottom: inset, left: 0 });
    const tableBottom = fit.offsetY + (TABLE_WIDTH + RAIL_WIDTH) * fit.scale;
    expect(tableBottom).toBeLessThanOrEqual(size.height - inset + 1e-6);
    // и без запаса стол ниже, чем с ним (вписывание ужимается)
    const noInset = computeFit(size, 16, ZERO_INSETS);
    expect(fit.scale).toBeLessThanOrEqual(noInset.scale + 1e-9);
  });

  it("боковые insets ужимают стол по ширине и центрируют между панелями", () => {
    const size = { width: 900, height: 800 };
    const fit = computeFit(size, 16, { top: 0, right: 140, bottom: 0, left: 140 });
    const tableLeft = fit.offsetX - RAIL_WIDTH * fit.scale;
    const tableRight = fit.offsetX + (TABLE_LENGTH + RAIL_WIDTH) * fit.scale;
    expect(tableLeft).toBeGreaterThanOrEqual(140 - 1e-6);
    expect(tableRight).toBeLessThanOrEqual(size.width - 140 + 1e-6);
  });
});
