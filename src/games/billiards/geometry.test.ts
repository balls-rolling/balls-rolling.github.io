import { describe, expect, it } from "vitest";
import {
  BALL_RADIUS,
  CENTER_SPOT,
  CORNER_DEPTH,
  CORNER_MOUTH,
  CUSHION_WIDTH,
  FOOT_SPOT,
  HEAD_SPOT,
  SIDE_DEPTH,
  SIDE_MOUTH,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import { buildTableGeometry, feltOutline, tableSegments } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";

const C = CUSHION_WIDTH;

describe("геометрия стола", () => {
  const geometry = buildTableGeometry(BASE_8BALL);

  it("6 луз: 4 угловые id 0–3, 2 боковые id 4–5", () => {
    expect(geometry.pockets).toHaveLength(6);
    expect(geometry.pockets.filter((p) => p.kind === "corner").map((p) => p.id)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(geometry.pockets.filter((p) => p.kind === "side").map((p) => p.id)).toEqual([4, 5]);
  });

  it("18 отрезков: 6 носов + 12 щёк, задних кромок нет", () => {
    const segments = tableSegments(geometry);
    expect(segments).toHaveLength(18);
    expect(segments.filter((s) => s.kind === "nose")).toHaveLength(6);
    expect(segments.filter((s) => s.kind === "facing")).toHaveLength(12);
  });

  it("ширина проёма равна константам", () => {
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

  it("концы проёма лежат на линии пера, горло — на линии носа", () => {
    const onPen = (p: { x: number; y: number }): boolean =>
      Math.abs(p.x + C) < 1e-6 ||
      Math.abs(p.x - (TABLE_LENGTH + C)) < 1e-6 ||
      Math.abs(p.y + C) < 1e-6 ||
      Math.abs(p.y - (TABLE_WIDTH + C)) < 1e-6;
    const onNose = (p: { x: number; y: number }): boolean =>
      Math.abs(p.x) < 1e-6 ||
      Math.abs(p.x - TABLE_LENGTH) < 1e-6 ||
      Math.abs(p.y) < 1e-6 ||
      Math.abs(p.y - TABLE_WIDTH) < 1e-6;
    for (const pocket of geometry.pockets) {
      expect(onPen(pocket.mouthA)).toBe(true);
      expect(onPen(pocket.mouthB)).toBe(true);
      expect(onNose(pocket.throatA)).toBe(true);
      expect(onNose(pocket.throatB)).toBe(true);
    }
  });

  it("щёки — фаски 45° от горла к концу проёма", () => {
    for (const pocket of geometry.pockets) {
      for (const [from, to] of [
        [pocket.throatA, pocket.mouthA],
        [pocket.throatB, pocket.mouthB],
      ] as const) {
        const fx = to.x - from.x;
        const fy = to.y - from.y;
        expect(Math.abs(Math.abs(fx) - Math.abs(fy))).toBeLessThan(1e-6);
        expect(Math.hypot(fx, fy)).toBeCloseTo(C * Math.SQRT2, 6);
      }
    }
  });

  it("отверстие: окружность проходит через концы проёма, центр глубже проёма", () => {
    for (const pocket of geometry.pockets) {
      const depth = pocket.kind === "corner" ? CORNER_DEPTH : SIDE_DEPTH;
      for (const end of [pocket.mouthA, pocket.mouthB]) {
        const r = Math.hypot(end.x - pocket.holeCenter.x, end.y - pocket.holeCenter.y);
        expect(r).toBeCloseTo(pocket.holeRadius, 6);
      }
      const shift = Math.hypot(
        pocket.holeCenter.x - pocket.center.x,
        pocket.holeCenter.y - pocket.center.y,
      );
      expect(shift).toBeCloseTo(depth, 6);
    }
  });

  it("контур поля: 24 вершины, 6 открытых рёбер — проёмы длиной в рот лузы", () => {
    const outline = feltOutline(geometry);
    expect(outline).toHaveLength(24);
    const open = outline.flatMap((p, i) => {
      if (!p.open) return [];
      const next = outline[(i + 1) % outline.length]!;
      return [Math.hypot(next.x - p.x, next.y - p.y)];
    });
    expect(open).toHaveLength(6);
    expect(open.filter((len) => Math.abs(len - CORNER_MOUTH) < 1e-6)).toHaveLength(4);
    expect(open.filter((len) => Math.abs(len - SIDE_MOUTH) < 1e-6)).toHaveLength(2);
  });

  it("пятна на 0.25/0.5/0.75 длины", () => {
    expect(geometry.spots[0]).toEqual(HEAD_SPOT);
    expect(geometry.spots[1]).toEqual(CENTER_SPOT);
    expect(geometry.spots[2]).toEqual(FOOT_SPOT);
  });

  it("все точки геометрии и отверстия в границах внешнего контура", () => {
    const points = [
      ...geometry.pockets.flatMap((p) => [p.mouthA, p.mouthB, p.throatA, p.throatB]),
      ...geometry.spots,
      ...geometry.railSights,
    ];
    for (const point of points) {
      expect(point.x).toBeGreaterThanOrEqual(geometry.outer.minX);
      expect(point.x).toBeLessThanOrEqual(geometry.outer.maxX);
      expect(point.y).toBeGreaterThanOrEqual(geometry.outer.minY);
      expect(point.y).toBeLessThanOrEqual(geometry.outer.maxY);
    }
    // Отверстие с хромом по замыслу слегка выступает за дерево рейки (до 20 мм).
    const protrusion = 20;
    for (const p of geometry.pockets) {
      expect(p.holeCenter.x - p.holeRadius).toBeGreaterThanOrEqual(
        geometry.outer.minX - protrusion,
      );
      expect(p.holeCenter.x + p.holeRadius).toBeLessThanOrEqual(geometry.outer.maxX + protrusion);
      expect(p.holeCenter.y - p.holeRadius).toBeGreaterThanOrEqual(
        geometry.outer.minY - protrusion,
      );
      expect(p.holeCenter.y + p.holeRadius).toBeLessThanOrEqual(geometry.outer.maxY + protrusion);
    }
  });

  it("нормаль отрезка единичная: носы смотрят в поле, щёки — в горло лузы", () => {
    const centers = new Map(geometry.pockets.map((p) => [p.id, p.center]));
    for (const segment of tableSegments(geometry)) {
      expect(Math.hypot(segment.normal.x, segment.normal.y)).toBeCloseTo(1, 6);
      const mid = { x: (segment.a.x + segment.b.x) / 2, y: (segment.a.y + segment.b.y) / 2 };
      const target =
        segment.kind === "facing"
          ? centers.get(segment.pocketId ?? -1)!
          : { x: TABLE_LENGTH / 2, y: TABLE_WIDTH / 2 };
      const toTarget = { x: target.x - mid.x, y: target.y - mid.y };
      expect(segment.normal.x * toTarget.x + segment.normal.y * toTarget.y).toBeGreaterThan(0);
    }
  });

  it("центр боковой лузы — на середине длинного борта", () => {
    for (const pocket of geometry.pockets) {
      if (pocket.kind !== "side") continue;
      expect(pocket.center.x).toBeCloseTo(TABLE_LENGTH / 2, 6);
      // Проём на линии пера: центр на CUSHION_WIDTH снаружи от носа.
      const outside = Math.min(Math.abs(pocket.center.y), Math.abs(pocket.center.y - TABLE_WIDTH));
      expect(outside).toBeCloseTo(CUSHION_WIDTH, 6);
    }
  });

  it("центр проёма и внешняя нормаль луз корректны", () => {
    for (const pocket of geometry.pockets) {
      expect(pocket.center.x).toBeCloseTo((pocket.mouthA.x + pocket.mouthB.x) / 2, 6);
      expect(pocket.center.y).toBeCloseTo((pocket.mouthA.y + pocket.mouthB.y) / 2, 6);
      expect(Math.hypot(pocket.outward.x, pocket.outward.y)).toBeCloseTo(1, 6);
      const toCenter = {
        x: TABLE_LENGTH / 2 - pocket.center.x,
        y: TABLE_WIDTH / 2 - pocket.center.y,
      };
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
