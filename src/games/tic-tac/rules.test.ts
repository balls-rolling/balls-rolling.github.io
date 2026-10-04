import { describe, expect, it } from "vitest";
import { canPlace, findWin, key } from "./rules";

function setOf(list: readonly (readonly [number, number])[]): Set<string> {
  return new Set(list.map(([x, y]) => key(x, y)));
}

describe("правила крестиков-ноликов", () => {
  it("ключ клетки", () => {
    expect(key(3, -2)).toBe("3,-2");
  });

  it("свободна на пустом поле, занята своим и вторым набором, отказ на нецелых", () => {
    expect(canPlace([new Set()], 0, 0)).toBe(true);
    expect(canPlace([setOf([[1, 1]])], 1, 1)).toBe(false);
    expect(canPlace([setOf([[0, 0]]), setOf([[1, 1]])], 1, 1)).toBe(false);
    expect(canPlace([new Set()], 0.5, 0)).toBe(false);
  });

  it("принимает одиночный Set и объект с наборами", () => {
    expect(canPlace(setOf([[0, 0]]), 1, 1)).toBe(true);
    expect(canPlace(setOf([[0, 0]]), 0, 0)).toBe(false);
    expect(canPlace({ first: setOf([[2, 2]]) }, 2, 2)).toBe(false);
    expect(canPlace({ first: setOf([[2, 2]]) }, 3, 3)).toBe(true);
  });

  it("победа: горизонталь 5, от среднего хода, 6 в ряд", () => {
    const h = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(findWin(h, 4, 0)?.length).toBe(5);
    expect(findWin(h, 2, 0)?.length).toBe(5);

    const h6 = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
      [5, 0],
    ]);
    expect(findWin(h6, 5, 0)?.length).toBe(6);
  });

  it("ровно 4 — не победа", () => {
    const h4 = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
    ]);
    expect(findWin(h4, 3, 0)).toBeNull();
  });

  it("вертикаль с отрицательными и обе диагонали", () => {
    const v = setOf([
      [2, -2],
      [2, -1],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    expect(findWin(v, 2, 2)?.length).toBe(5);

    const d1 = setOf([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ]);
    expect(findWin(d1, 0, 0)?.length).toBe(5);

    const d2 = setOf([
      [0, 4],
      [1, 3],
      [2, 2],
      [3, 1],
      [4, 0],
    ]);
    expect(findWin(d2, 2, 2)?.length).toBe(5);
  });

  it("разрыв — не победа; ход не в наборе — null", () => {
    const gap = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [5, 0],
    ]);
    expect(findWin(gap, 5, 0)).toBeNull();
    expect(findWin(new Set(), 0, 0)).toBeNull();
  });

  it("возвращает линию в порядке координат", () => {
    const h = setOf([
      [0, 0],
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    expect(findWin(h, 2, 0)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ]);
  });
});
