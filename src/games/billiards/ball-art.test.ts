import { describe, expect, it } from "vitest";
import { paintOf, shadeSphere, type DiscSampler } from "./ball-art";
import { applyMat, IDENTITY, rotation, type Mat3 } from "./roll";

/** Диск-заглушка: непрозрачный чёрный круг (номер) в центре диска. */
const BLACK_DISC: DiscSampler = () => [0, 0, 0, 255];
const NO_DISC: DiscSampler = () => [0, 0, 0, 0];

function brightness(c: readonly [number, number, number]): number {
  return (c[0] + c[1] + c[2]) / 3;
}

/** Ориентация после качения на `distanceMm` вдоль x (поворот вокруг оси −y). */
function rolledAlongX(distanceMm: number): Mat3 {
  return rotation(0, -1, 0, distanceMm / 28.575);
}

describe("шейдер сферы", () => {
  it("цвет шара виден в центре, а блик светлее, чем край", () => {
    const paint = paintOf(2); // синий сплошной
    const front = shadeSphere({ ...paint, id: 0 }, IDENTITY, 0, 0, NO_DISC);
    expect(front[2]).toBeGreaterThan(front[0]); // синий
    const lit = shadeSphere({ ...paint, id: 0 }, IDENTITY, -0.35, -0.4, NO_DISC);
    const rim = shadeSphere({ ...paint, id: 0 }, IDENTITY, 0.95, 0.2, NO_DISC);
    expect(brightness(lit)).toBeGreaterThan(brightness(rim));
  });

  it("номерной диск виден в центре, пока шар лицом к камере", () => {
    const solid = paintOf(3);
    const centre = shadeSphere(solid, IDENTITY, 0, 0, BLACK_DISC);
    expect(brightness(centre)).toBeLessThan(30);
  });

  it("при качении номер уходит с центра и цвет возвращается", () => {
    const solid = paintOf(3);
    // Четверть оборота: диск на краю, в центре уже бок шара без диска (disc вне радиуса).
    const rot = rolledAlongX((Math.PI / 2) * 28.575);
    const centre = shadeSphere(solid, rot, 0, 0, (u, v) =>
      u * u + v * v < 1 ? [0, 0, 0, 255] : [0, 0, 0, 0],
    );
    expect(brightness(centre)).toBeGreaterThan(40);
  });

  it("полоса поворачивается вместе с шаром: при качении вдоль x центр меняется с цветной на белую", () => {
    const stripe = { ...paintOf(10), id: 0 }; // синяя полоса
    const atRest = shadeSphere(stripe, IDENTITY, 0, 0, NO_DISC);
    expect(atRest[2]).toBeGreaterThan(atRest[0] + 30); // видна синяя полоса
    // Поворот на 90° вокруг оси x: качение вдоль y; точка, бывшая в центре, уходит на полюс по y.
    const rolledY = rotation(1, 0, 0, Math.PI / 2);
    const [tx, ty, tz] = applyMat(
      [rolledY[0], rolledY[3], rolledY[6], rolledY[1], rolledY[4], rolledY[7], rolledY[2], rolledY[5], rolledY[8]],
      0,
      0,
      1,
    );
    expect(Math.hypot(tx, ty, tz)).toBeCloseTo(1, 6);
    expect(Math.abs(ty)).toBeGreaterThan(0.99); // точка, что была в центре, теперь на полюсе по y
    const afterRoll = shadeSphere(stripe, rolledY, 0, 0, NO_DISC);
    expect(brightness(afterRoll)).toBeGreaterThan(brightness(atRest)); // в центре теперь белый полюс
  });
});
