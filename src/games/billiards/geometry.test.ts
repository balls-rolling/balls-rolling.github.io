import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  CENTER_SPOT,
  CORNER_FACING_DEG,
  CORNER_MOUTH,
  FOOT_SPOT,
  HEAD_SPOT,
  SIDE_FACING_DEG,
  SIDE_MOUTH,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import { buildTableGeometry, tableSegments } from "./geometry";

function angleBetween(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dot = a.x * b.x + a.y * b.y;
  const len = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y) || 1;
  return (Math.acos(Math.max(-1, Math.min(1, dot / len))) * 180) / Math.PI;
}

describe("геометрия стола", () => {
  const geometry = buildTableGeometry();

  it("6 луз: 4 угловые id 0–3, 2 боковые id 4–5", () => {
    expect(geometry.pockets).toHaveLength(6);
    expect(geometry.pockets.filter((p) => p.kind === "corner").map((p) => p.id)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(geometry.pockets.filter((p) => p.kind === "side").map((p) => p.id)).toEqual([4, 5]);
  });

  it("18 отрезков: 6 носов + 12 облицовок, задних кромок нет", () => {
    // Задние кромки стояли внутри зоны захвата и отбивали шар раньше линии —
    // убраны из физики (фаза 02-a); в отрисовке полости (backA/backB) остались.
    const segments = tableSegments(geometry);
    expect(segments).toHaveLength(18);
    expect(segments.filter((s) => s.kind === "nose")).toHaveLength(6);
    expect(segments.filter((s) => s.kind === "facing")).toHaveLength(12);
  });

  it("ширина рта равна константам", () => {
    for (const pocket of geometry.pockets) {
      const expected = pocket.kind === "corner" ? CORNER_MOUTH : SIDE_MOUTH;
      expect(pocket.mouth).toBeCloseTo(expected, 6);
    }
  });

  it("capturePad равен радиусу шара", () => {
    for (const pocket of geometry.pockets) {
      expect(pocket.capturePad).toBe(BALL_RADIUS);
    }
  });

  it("угол между облицовками равен 142° / 104°", () => {
    for (const pocket of geometry.pockets) {
      const facingA = { x: pocket.backA.x - pocket.noseA.x, y: pocket.backA.y - pocket.noseA.y };
      const facingB = { x: pocket.backB.x - pocket.noseB.x, y: pocket.backB.y - pocket.noseB.y };
      const expected = pocket.kind === "corner" ? CORNER_FACING_DEG : SIDE_FACING_DEG;
      expect(angleBetween(facingA, facingB)).toBeCloseTo(expected, 4);
    }
  });

  it("пятна на 0.25/0.5/0.75 длины", () => {
    expect(geometry.spots[0]).toEqual(HEAD_SPOT);
    expect(geometry.spots[1]).toEqual(CENTER_SPOT);
    expect(geometry.spots[2]).toEqual(FOOT_SPOT);
  });

  it("все точки геометрии в границах внешнего контура", () => {
    const points = [
      ...geometry.pockets.flatMap((p) => [p.noseA, p.noseB, p.backA, p.backB]),
      ...geometry.spots,
      ...geometry.railSights,
    ];
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(geometry.outer.minX);
      expect(point.x).toBeLessThanOrEqual(geometry.outer.maxX);
      expect(point.y).toBeGreaterThanOrEqual(geometry.outer.minY);
      expect(point.y).toBeLessThanOrEqual(geometry.outer.maxY);
    }
  });

  it("нормаль отрезка единичная и смотрит внутрь поля", () => {
    for (const segment of tableSegments(geometry)) {
      expect(Math.hypot(segment.normal.x, segment.normal.y)).toBeCloseTo(1, 6);
      const mid = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
      const toCenter = { x: TABLE_LENGTH / 2 - mid.x, y: TABLE_WIDTH / 2 - mid.y };
      expect(segment.normal.x * toCenter.x + segment.normal.y * toCenter.y).toBeGreaterThan(0);
    }
  });

  it("центр рта и внешняя нормаль луз корректны", () => {
    for (const pocket of geometry.pockets) {
      expect(pocket.center.x).toBeCloseTo((pocket.noseA.x + pocket.noseB.x) / 2, 6);
      expect(pocket.center.y).toBeCloseTo((pocket.noseA.y + pocket.noseB.y) / 2, 6);
      expect(Math.hypot(pocket.outward.x, pocket.outward.y)).toBeCloseTo(1, 6);
      const toCenter = { x: TABLE_LENGTH / 2 - pocket.center.x, y: TABLE_WIDTH / 2 - pocket.center.y };
      expect(pocket.outward.x * toCenter.x + pocket.outward.y * toCenter.y).toBeLessThan(0);
    }
  });

  it("внешняя нормаль: боковые вдоль короткой оси, угловые — диагонально", () => {
    for (const pocket of geometry.pockets) {
      if (pocket.kind === "side") {
        expect(Math.abs(pocket.outward.x)).toBeCloseTo(0, 6);
        expect(Math.abs(pocket.outward.y)).toBeCloseTo(1, 6);
      } else {
        expect(Math.abs(pocket.outward.x)).toBeGreaterThan(0.1);
        expect(Math.abs(pocket.outward.y)).toBeGreaterThan(0.1);
      }
    }
  });
});
