import { describe, expect, it } from "vitest";
import { clampPower, keyPower, powerFromY, wheelPower } from "./power";

describe("clampPower", () => {
  it("зажимает за пределами и округляет", () => {
    expect(clampPower(-5)).toBe(0);
    expect(clampPower(120)).toBe(100);
    expect(clampPower(49.6)).toBe(50);
  });
});

describe("powerFromY", () => {
  it("снизу метра — 0, сверху — 100", () => {
    expect(powerFromY(300, 100, 200)).toBe(0);
    expect(powerFromY(100, 100, 200)).toBe(100);
  });

  it("указатель за пределами метра зажимается в 0..100", () => {
    expect(powerFromY(900, 100, 200)).toBe(0);
    expect(powerFromY(-500, 100, 200)).toBe(100);
  });

  it("метр нулевой высоты не даёт силы", () => {
    expect(powerFromY(150, 100, 0)).toBe(0);
  });
});

describe("keyPower", () => {
  it("шаг 1, с Shift — 10", () => {
    expect(keyPower(50, "ArrowUp", false)).toBe(51);
    expect(keyPower(50, "ArrowDown", false)).toBe(49);
    expect(keyPower(50, "ArrowRight", true)).toBe(60);
    expect(keyPower(50, "ArrowLeft", true)).toBe(40);
  });

  it("на краях не выходит за 0..100", () => {
    expect(keyPower(100, "ArrowUp", false)).toBe(100);
    expect(keyPower(0, "ArrowDown", true)).toBe(0);
  });

  it("Home и End — края", () => {
    expect(keyPower(42, "Home", false)).toBe(0);
    expect(keyPower(42, "End", false)).toBe(100);
  });

  it("чужая клавиша не меняет силу", () => {
    expect(keyPower(42, "a", false)).toBeNull();
  });
});

describe("wheelPower", () => {
  it("прокрутка вверх — +1, вниз — −1, в пределах диапазона", () => {
    expect(wheelPower(10, -100)).toBe(11);
    expect(wheelPower(10, 100)).toBe(9);
    expect(wheelPower(100, -100)).toBe(100);
    expect(wheelPower(0, 100)).toBe(0);
  });
});
