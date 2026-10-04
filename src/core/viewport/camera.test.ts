import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  MAX_SCALE,
  MIN_SCALE,
  clampScale,
  panByPixels,
  screenToWorld,
  visibleBounds,
  worldToScreen,
  zoomBy,
  zoomTo,
} from "./camera";
import type { Camera, Size } from "./types";

const size: Size = { width: 800, height: 600 };
const camera: Camera = { x: 10, y: 20, scale: 50 };

describe("камера Viewport", () => {
  it("значения по умолчанию валидны", () => {
    expect(DEFAULT_CAMERA.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(DEFAULT_CAMERA.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it("clampScale зажимает масштаб в диапазон", () => {
    expect(clampScale(1)).toBe(MIN_SCALE);
    expect(clampScale(10_000)).toBe(MAX_SCALE);
    expect(clampScale(50)).toBe(50);
  });

  it("panByPixels сдвигает центр противоположно пиксельной дельте", () => {
    const moved = panByPixels(camera, 100, -50);
    expect(moved).toEqual({ x: 10 - 100 / 50, y: 20 + 50 / 50, scale: 50 });
  });

  it("screenToWorld и worldToScreen взаимно обратны", () => {
    const point = { x: 612, y: 233 };
    const world = screenToWorld(camera, point, size);
    const back = worldToScreen(camera, world, size);
    expect(back.x).toBeCloseTo(point.x, 10);
    expect(back.y).toBeCloseTo(point.y, 10);
  });

  it("центр окна соответствует центру камеры", () => {
    const world = screenToWorld(camera, { x: size.width / 2, y: size.height / 2 }, size);
    expect(world).toEqual({ x: camera.x, y: camera.y });
  });

  it("zoomTo сохраняет мировую точку под якорем", () => {
    const anchor = { x: 500, y: 300 };
    const worldBefore = screenToWorld(camera, anchor, size);
    const zoomed = zoomTo(camera, anchor, size, 100);
    const worldAfter = screenToWorld(zoomed, anchor, size);

    expect(zoomed.scale).toBe(100);
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 10);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 10);
  });

  it("zoomTo зажимает масштаб у границ", () => {
    expect(zoomTo(camera, { x: 0, y: 0 }, size, 1).scale).toBe(MIN_SCALE);
    expect(zoomTo(camera, { x: 0, y: 0 }, size, 10_000).scale).toBe(MAX_SCALE);
  });

  it("zoomBy применяет множитель", () => {
    expect(zoomBy(camera, { x: 400, y: 300 }, size, 2).scale).toBe(100);
  });

  it("visibleBounds расширяется на запас и учитывает масштаб", () => {
    expect(visibleBounds(camera, size, 0)).toEqual({ x0: 2, x1: 18, y0: 14, y1: 26 });
    expect(visibleBounds(camera, size, 1)).toEqual({ x0: 1, x1: 19, y0: 13, y1: 27 });

    const zoomed = visibleBounds({ ...camera, scale: 25 }, size, 0);
    expect(zoomed.x1 - zoomed.x0).toBeGreaterThan(16);
  });
});
