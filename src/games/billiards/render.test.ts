import { describe, expect, it } from "vitest";
import { getBallLayer, getStaticLayer, resetBallCache, resetTableCache } from "./cache";
import { RAIL_WIDTH, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { ballLayerKey, computeFit, staticLayerKey, ZERO_INSETS } from "./render";

const OUTER_W = TABLE_LENGTH + 2 * RAIL_WIDTH;
const OUTER_H = TABLE_WIDTH + 2 * RAIL_WIDTH;
const MODE = "8ball";

describe("staticLayerKey", () => {
  it("совпадает при одинаковых режиме, размере, DPR и fit (слой не перестраивается)", () => {
    const size = { width: 900, height: 600 };
    const a = staticLayerKey(size, 2, computeFit(size, 4), MODE);
    const b = staticLayerKey(size, 2, computeFit(size, 4), MODE);
    expect(a).toBe(b);
  });

  it("меняется при смене режима, размера, DPR или insets (слой перестраивается один раз)", () => {
    const size = { width: 900, height: 600 };
    const base = staticLayerKey(size, 2, computeFit(size, 4), MODE);
    expect(staticLayerKey(size, 2, computeFit(size, 4), "russian")).not.toBe(base);
    expect(
      staticLayerKey({ width: 901, height: 600 }, 2, computeFit({ width: 901, height: 600 }, 4), MODE),
    ).not.toBe(base);
    expect(staticLayerKey(size, 1, computeFit(size, 4), MODE)).not.toBe(base);
    expect(
      staticLayerKey(size, 2, computeFit(size, 4, { top: 0, right: 0, bottom: 80, left: 0 }), MODE),
    ).not.toBe(base);
  });
});

describe("ballLayerKey и кэш слоя шаров", () => {
  const size = { width: 900, height: 600 };
  const fit = computeFit(size, 4);
  const pose = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;
  const balls = [{ id: 0, x: 100, y: 200, rot: pose }];

  it("включает режим, размер/DPR/fit, координаты и ориентацию шаров", () => {
    const base = ballLayerKey(size, 2, fit, MODE, balls);
    expect(ballLayerKey(size, 2, fit, MODE, balls)).toBe(base);
    expect(ballLayerKey(size, 2, fit, "russian", balls)).not.toBe(base);
    expect(ballLayerKey({ width: 901, height: 600 }, 2, fit, MODE, balls)).not.toBe(base);
    expect(ballLayerKey(size, 1, fit, MODE, balls)).not.toBe(base);
    expect(ballLayerKey(size, 2, { ...fit, scale: fit.scale + 0.01 }, MODE, balls)).not.toBe(base);
    expect(ballLayerKey(size, 2, fit, MODE, [{ ...balls[0]!, x: 101 }])).not.toBe(base);
    expect(
      ballLayerKey(size, 2, fit, MODE, [{ ...balls[0]!, rot: [0, 1, 0, 1, 0, 0, 0, 0, 1] }]),
    ).not.toBe(base);
  });

  it("строит слой один раз на ключ и перестраивает при смене ключа", () => {
    let builds = 0;
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const a = getBallLayer("aim-cache-test-a", () => {
      builds += 1;
      return first;
    });
    const repeated = getBallLayer("aim-cache-test-a", () => {
      builds += 1;
      return second;
    });
    const changed = getBallLayer("aim-cache-test-b", () => {
      builds += 1;
      return second;
    });
    expect(a).toBe(first);
    expect(repeated).toBe(first);
    expect(changed).toBe(second);
    expect(builds).toBe(2);
  });
});

describe("сброс кэша слоёв", () => {
  it("resetTableCache заставляет перестроить статичный слой", () => {
    let builds = 0;
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const a = getStaticLayer("reset-static-test", () => {
      builds += 1;
      return first;
    });
    resetTableCache();
    const b = getStaticLayer("reset-static-test", () => {
      builds += 1;
      return second;
    });
    expect(a).toBe(first);
    expect(b).toBe(second);
    expect(builds).toBe(2);
  });

  it("resetBallCache заставляет перестроить слой шаров", () => {
    let builds = 0;
    const first = {} as HTMLCanvasElement;
    const second = {} as HTMLCanvasElement;
    const a = getBallLayer("reset-ball-test", () => {
      builds += 1;
      return first;
    });
    resetBallCache();
    const b = getBallLayer("reset-ball-test", () => {
      builds += 1;
      return second;
    });
    expect(a).toBe(first);
    expect(b).toBe(second);
    expect(builds).toBe(2);
  });
});

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
