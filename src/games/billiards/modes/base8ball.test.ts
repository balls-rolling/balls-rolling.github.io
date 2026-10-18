import { describe, expect, it } from "vitest";
import { BALL_COLORS, BALL_DIAMETER, BALL_MASS, CORNER_MOUTH, SIDE_MOUTH } from "../constants";
import { BASE_8BALL, CANON_CHEEK_ANGLE_DEG } from "./base8ball";
import { getMode, listModes } from "./registry";

describe("режим 8-ball", () => {
  it("числа совпадают с требованиями", () => {
    expect(BASE_8BALL.table.cornerMouth).toBe(CORNER_MOUTH);
    expect(BASE_8BALL.table.sideMouth).toBe(SIDE_MOUTH);
    expect(BASE_8BALL.table.cheekAngleDeg).toBe(CANON_CHEEK_ANGLE_DEG);
    expect(BASE_8BALL.balls.diameter).toBe(BALL_DIAMETER);
    expect(BASE_8BALL.balls.mass).toBe(BALL_MASS);
    expect(BASE_8BALL.balls.colors).toHaveLength(16);
    expect(BASE_8BALL.rounds).toEqual({ count: 1, kind: "toWin" });
    expect(BASE_8BALL.attempts).toBeNull();
  });

  it("реестр находит 8-ball и не знает русский бильярд", () => {
    expect(getMode("8ball")).toBe(BASE_8BALL);
    expect(getMode("russian")).toBeNull();
    expect(getMode("unknown")).toBeNull();
    expect(listModes()).toContain(BASE_8BALL);
  });

  it("цвета шаров берутся из общей палитры без копии значений", () => {
    expect(BASE_8BALL.balls.colors).toBe(BALL_COLORS);
  });
});
