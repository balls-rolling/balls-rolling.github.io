import { describe, expect, it } from "vitest";
import { candidates, chooseMove, scoreCell } from "./brain";
import { key } from "./rules";

function setOf(list: readonly (readonly [number, number])[]): Set<string> {
  return new Set(list.map(([x, y]) => key(x, y)));
}

describe("мозг ИИ", () => {
  it("берёт немедленную победу", () => {
    const own = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    const m = chooseMove(own, new Set(), 4);
    expect((m.x === 4 && m.y === 0) || (m.x === -1 && m.y === 0)).toBe(true);
  });

  it("блокирует открытую 4 соперника", () => {
    const opp = setOf([
      [0, 5],
      [1, 5],
      [2, 5],
      [3, 5],
    ]);
    const m = chooseMove(new Set([key(9, 9)]), opp, 4);
    expect((m.x === 4 && m.y === 5) || (m.x === -1 && m.y === 5)).toBe(true);
  });

  it("missWin пропускает победу", () => {
    const own = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    let took = 0;
    for (let i = 0; i < 20; i += 1) {
      const m = chooseMove(own, new Set(), 2, { missWin: true });
      if ((m.x === 4 && m.y === 0) || (m.x === -1 && m.y === 0)) took += 1;
    }
    expect(took).toBe(0);
  });

  it("кандидаты рядом, занятые исключены; скоринг положительный", () => {
    const c = candidates(setOf([[0, 0]]), setOf([[1, 0]]));
    expect(c.length).toBeGreaterThan(0);
    expect(c.every((p) => !(p.x === 0 && p.y === 0) && !(p.x === 1 && p.y === 0))).toBe(true);
    expect(
      scoreCell(
        { x: 2, y: 0 },
        setOf([
          [0, 0],
          [1, 0],
        ]),
        new Set(),
      ),
    ).toBeGreaterThan(0);
  });

  it("уровень 0 возвращает свободную клетку-кандидата", () => {
    const own = setOf([[0, 0]]);
    const opp = setOf([[1, 0]]);
    const m = chooseMove(own, opp, 0);
    const allowed = candidates(own, opp);
    expect(allowed.some((c) => c.x === m.x && c.y === m.y)).toBe(true);
  });
});
