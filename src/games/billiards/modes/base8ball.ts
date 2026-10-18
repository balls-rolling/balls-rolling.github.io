// Конфигурация режима 8-ball. Числа берутся из общих констант стола/шаров —
// инварианты не дублируются, а режим задаёт только то, что отличается.
import { BALL_COLORS, BALL_DIAMETER, BALL_MASS, CORNER_MOUTH, SIDE_MOUTH } from "../constants";
import type { ModeConfig } from "./types";

/** Угол щёк канона (схема пользователя, фаза 01): 45°. */
export const CANON_CHEEK_ANGLE_DEG = 45;

/** 8-ball: один раунд до победы, попытки не ограничены. */
export const BASE_8BALL: ModeConfig = {
  id: "8ball",
  label: "8-ball",
  table: {
    cornerMouth: CORNER_MOUTH,
    sideMouth: SIDE_MOUTH,
    cheekAngleDeg: CANON_CHEEK_ANGLE_DEG,
  },
  balls: {
    diameter: BALL_DIAMETER,
    mass: BALL_MASS,
    colors: BALL_COLORS,
  },
  rack: {
    layout: "triangle",
    // Вершина — единица, 8-й — в центре третьего ряда (индекс 4), задние углы —
    // сплошной (7) и полосатый (15). Раскладка фиксирована (без случайности).
    order: [1, 2, 3, 4, 8, 5, 6, 9, 10, 11, 7, 12, 13, 14, 15],
  },
  rounds: { count: 1, kind: "toWin" },
  attempts: null,
};
