import { beforeEach, describe, expect, it } from "vitest";
import { applyMat, IDENTITY, poseOf, resetRollPoses, spinStep, TELEPORT_MM, type Mat3 } from "./roll";

function det(m: Mat3): number {
  return (
    m[0] * (m[4] * m[8] - m[5] * m[7]) -
    m[1] * (m[3] * m[8] - m[5] * m[6]) +
    m[2] * (m[3] * m[7] - m[4] * m[6])
  );
}

beforeEach(() => {
  resetRollPoses();
});

describe("поза шара", () => {
  it("новая поза — номер к камере", () => {
    expect(poseOf(1, 10, 20).rot).toEqual(IDENTITY);
  });

  it("движение без спина ориентацию не меняет", () => {
    poseOf(1, 0, 0);
    spinStep(1, { x: 0, y: 0, z: 0 }, 1);
    expect(poseOf(1, 500, 300).rot).toEqual(IDENTITY);
  });

  it("спин поворачивает позу: оборот вокруг z за 1 с при wz = 2π", () => {
    poseOf(1, 0, 0);
    spinStep(1, { x: 0, y: 0, z: 2 * Math.PI }, 0.25);
    const [x, y, z] = applyMat(poseOf(1, 0, 0).rot, 1, 0, 0);
    expect(x).toBeCloseTo(0, 9);
    expect(y).toBeCloseTo(1, 9);
    expect(z).toBeCloseTo(0, 9);
  });

  it("скачок позиции сбрасывает ориентацию", () => {
    poseOf(1, 0, 0);
    spinStep(1, { x: 0, y: 0, z: 10 }, 1);
    expect(poseOf(1, 0, 0).rot).not.toEqual(IDENTITY);
    expect(poseOf(1, TELEPORT_MM + 1, 0).rot).toEqual(IDENTITY);
  });

  it("тысячи мелких поворотов держат матрицу поворотом", () => {
    poseOf(1, 0, 0);
    for (let i = 0; i < 5000; i += 1) {
      spinStep(1, { x: 3 + Math.sin(i), y: -2, z: 1 }, 1 / 240);
    }
    const rot = poseOf(1, 0, 0).rot;
    expect(det(rot)).toBeCloseTo(1, 9);
    const [x, y, z] = applyMat(rot, 0, 0, 1);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9);
  });
});
