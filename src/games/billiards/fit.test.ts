import { describe, expect, it } from "vitest";
import { RAIL_WIDTH, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { BilliardsGame } from "./game";
import { computeFit, FIT_PADDING, ZERO_INSETS } from "./render";

// Внешний габарит стола с рейкой — то, что computeFit вписывает в кадр.
const OUTER_W = TABLE_LENGTH + 2 * RAIL_WIDTH;
const OUTER_H = TABLE_WIDTH + 2 * RAIL_WIDTH;

describe("computeFit — геометрия поля", () => {
  it("сохраняет пропорцию стола с рейкой (scale одинаков по осям)", () => {
    const fit = computeFit({ width: 1191, height: 760 }, FIT_PADDING, ZERO_INSETS);
    const drawnW = OUTER_W * fit.scale;
    const drawnH = OUTER_H * fit.scale;
    expect(drawnW / drawnH).toBeCloseTo(OUTER_W / OUTER_H, 6);
  });

  it("симметричные инсеты центрируют поле по горизонтали", () => {
    const size = { width: 1191, height: 760 };
    const insets = { top: 0, right: 100, bottom: 0, left: 100 };
    const fit = computeFit(size, FIT_PADDING, insets);
    const leftMargin = fit.offsetX - RAIL_WIDTH * fit.scale;
    const rightMargin = size.width - (leftMargin + OUTER_W * fit.scale);
    expect(leftMargin).toBeCloseTo(rightMargin, 6);
  });

  it("инсеты больше кадра не дают отрицательного масштаба", () => {
    const fit = computeFit(
      { width: 200, height: 200 },
      FIT_PADDING,
      { top: 150, right: 150, bottom: 150, left: 150 },
    );
    expect(fit.scale).toBeGreaterThan(0);
  });
});

// Единый источник fit (M3): игра отдаёт то же, что дала бы математика с её инсетами.
// (T4 — геометрия computeFit — здесь же: тесты рядом с источником fit.)
describe("BilliardsGame.getFit", () => {
  const size = { width: 1191, height: 760 };

  it("без инсетов совпадает с computeFit с базовым отступом", () => {
    const game = new BilliardsGame();
    expect(game.getFit(size)).toEqual(computeFit(size, FIT_PADDING, game.getInsets()));
  });

  it("учитывает инсеты панелей, которые игра получила от UI", () => {
    const game = new BilliardsGame();
    game.setPanelInsets({ left: 80, right: 90, top: 120, bottom: 60 });
    const fit = game.getFit(size);
    expect(fit).toEqual(computeFit(size, FIT_PADDING, game.getInsets()));
    // Стол не заходит в зарезервированные полосы: левый край стола правее инсета.
    expect(fit.offsetX).toBeGreaterThanOrEqual(80);
  });
});
