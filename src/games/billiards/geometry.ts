// Геометрия стола и луз в миллиметрах. Начало координат — угол игрового поля
// (нос-к-носу), `x` вдоль длины, `y` вдоль ширины. Чистые данные и функции.
//
// Модель луз (по схеме пользователя, спринт 04, фаза 01):
//  - проём (триггер попадания) лежит на линии пера, то есть на `CUSHION_WIDTH`
//    снаружи от носа;
//  - щёки — прямые фаски под 45° от конца носа («горло») к концу проёма;
//  - центр отверстия лежит глубже проёма, радиус — окружность через концы проёма.
import {
  CENTER_SPOT,
  CORNER_DEPTH,
  CUSHION_WIDTH,
  FOOT_SPOT,
  HEAD_SPOT,
  RAIL_WIDTH,
  SIDE_DEPTH,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import type { ModeConfig } from "./modes/types";

/** Точка в миллиметрах. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Тип отрезка стола: подушка-нос или щека (облицовка) лузы. */
export type SegmentKind = "nose" | "facing";

/** Отрезок стола. `pocketId` — для щёк. */
export interface Segment {
  readonly a: Point;
  readonly b: Point;
  readonly kind: SegmentKind;
  readonly pocketId?: number;
  /** Единичная нормаль, направленная туда, где бывает шар (соударение отражает по ней). */
  readonly normal: Point;
}

/** Луза: проём на линии пера, щёки от горла к проёму, отверстие глубже проёма. */
export interface PocketSpec {
  readonly id: number;
  readonly kind: "corner" | "side";
  /** Ширина проёма (tip-to-tip), мм. */
  readonly mouth: number;
  /**
   * Боковой допуск захвата шара: насколько центр может свеситься за линию проёма.
   * Логика захвата — `resolvePockets` в `physics.ts`.
   */
  readonly capturePad: number;
  /** Середина проёма (для проверки захвата), мм. */
  readonly center: Point;
  /** Единичная внешняя нормаль проёма (от поля наружу, ось лузы). */
  readonly outward: Point;
  /** Концы проёма (на линии пера). */
  readonly mouthA: Point;
  readonly mouthB: Point;
  /** Горло: концы носа, от которых идут щёки (на линии носа). */
  readonly throatA: Point;
  readonly throatB: Point;
  /** Центр отверстия (глубже проёма) — только для отрисовки, мм. */
  readonly holeCenter: Point;
  /** Радиус отверстия: окружность проходит через концы проёма, мм. */
  readonly holeRadius: number;
}

/** Внешние границы стола (с рейкой), мм. */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Полная геометрия стола. */
export interface TableGeometry {
  readonly length: number;
  readonly width: number;
  readonly outer: Bounds;
  readonly pockets: readonly PocketSpec[];
  readonly segments: readonly Segment[];
  readonly spots: readonly Point[];
  readonly railSights: readonly Point[];
}

const CENTER: Point = { x: TABLE_LENGTH / 2, y: TABLE_WIDTH / 2 };
/** Вынос конца проёма угловой лузы вдоль борта от угла сукна, мм: проём — диагональ длиной `cornerMouth`. */
function cornerMouthOffset(cornerMouth: number): number {
  return cornerMouth / Math.SQRT2 - CUSHION_WIDTH;
}
/** Смещение горла от конца проёма вдоль борта при угле щёк `angleDeg` (для 45° = `CUSHION_WIDTH`). */
function throatOffset(angleDeg: number): number {
  return CUSHION_WIDTH / Math.tan((angleDeg * Math.PI) / 180);
}

function normalize(vector: Point): Point {
  const len = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / len, y: vector.y / len };
}

/** Ось лузы: нормаль к проёму, направленная от поля наружу (от центра стола). */
function mouthAxis(mouthA: Point, mouthB: Point, mid: Point): Point {
  const axis = normalize({ x: -(mouthB.y - mouthA.y), y: mouthB.x - mouthA.x });
  const away = { x: mid.x - CENTER.x, y: mid.y - CENTER.y };
  return axis.x * away.x + axis.y * away.y < 0 ? { x: -axis.x, y: -axis.y } : axis;
}

/** Построить лузу по концам проёма и горла. */
function buildPocket(
  id: number,
  kind: "corner" | "side",
  mouthA: Point,
  mouthB: Point,
  throatA: Point,
  throatB: Point,
  depth: number,
  ballRadius: number,
): PocketSpec {
  const mouth = Math.hypot(mouthB.x - mouthA.x, mouthB.y - mouthA.y);
  const mid: Point = { x: (mouthA.x + mouthB.x) / 2, y: (mouthA.y + mouthB.y) / 2 };
  const out = mouthAxis(mouthA, mouthB, mid);
  return {
    id,
    kind,
    mouth,
    capturePad: ballRadius,
    center: mid,
    outward: out,
    mouthA,
    mouthB,
    throatA,
    throatB,
    holeCenter: { x: mid.x + out.x * depth, y: mid.y + out.y * depth },
    holeRadius: Math.hypot(mouth / 2, depth),
  };
}

function buildPockets(config: ModeConfig): readonly PocketSpec[] {
  const C = CUSHION_WIDTH;
  const a = cornerMouthOffset(config.table.cornerMouth);
  const along = throatOffset(config.table.cheekAngleDeg);
  const radius = config.balls.diameter / 2;
  const L = TABLE_LENGTH;
  const W = TABLE_WIDTH;
  const halfSide = config.table.sideMouth / 2;
  const midX = L / 2;
  return [
    // Угловые: 0 — (0,0), 1 — (L,0), 2 — (L,W), 3 — (0,W). A — на вертикальном борту, B — на горизонтальном.
    buildPocket(
      0,
      "corner",
      { x: -C, y: a },
      { x: a, y: -C },
      { x: 0, y: a + along },
      { x: a + along, y: 0 },
      CORNER_DEPTH,
      radius,
    ),
    buildPocket(
      1,
      "corner",
      { x: L + C, y: a },
      { x: L - a, y: -C },
      { x: L, y: a + along },
      { x: L - a - along, y: 0 },
      CORNER_DEPTH,
      radius,
    ),
    buildPocket(
      2,
      "corner",
      { x: L + C, y: W - a },
      { x: L - a, y: W + C },
      { x: L, y: W - a - along },
      { x: L - a - along, y: W },
      CORNER_DEPTH,
      radius,
    ),
    buildPocket(
      3,
      "corner",
      { x: -C, y: W - a },
      { x: a, y: W + C },
      { x: 0, y: W - a - along },
      { x: a + along, y: W },
      CORNER_DEPTH,
      radius,
    ),
    // Боковые: 4 — сверху, 5 — снизу. Горло шире проёма на `along` с каждой стороны (воронка).
    buildPocket(
      4,
      "side",
      { x: midX - halfSide, y: -C },
      { x: midX + halfSide, y: -C },
      { x: midX - halfSide - along, y: 0 },
      { x: midX + halfSide + along, y: 0 },
      SIDE_DEPTH,
      radius,
    ),
    buildPocket(
      5,
      "side",
      { x: midX - halfSide, y: W + C },
      { x: midX + halfSide, y: W + C },
      { x: midX - halfSide - along, y: W },
      { x: midX + halfSide + along, y: W },
      SIDE_DEPTH,
      radius,
    ),
  ];
}

/** Отрезок с нормалью-перпендикуляром в сторону опорной точки `toward`. */
function makeSegment(
  a: Point,
  b: Point,
  kind: SegmentKind,
  toward: Point,
  pocketId?: number,
): Segment {
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * (toward.x - mid.x) + ny * (toward.y - mid.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { a, b, kind, normal: { x: nx, y: ny }, pocketId };
}

function buildNoseSegments(config: ModeConfig): readonly Segment[] {
  const L = TABLE_LENGTH;
  const W = TABLE_WIDTH;
  const corner = cornerMouthOffset(config.table.cornerMouth) + CUSHION_WIDTH; // = cornerMouth / √2
  const side = config.table.sideMouth / 2 + CUSHION_WIDTH;
  const midX = L / 2;
  return [
    makeSegment({ x: corner, y: 0 }, { x: midX - side, y: 0 }, "nose", CENTER),
    makeSegment({ x: midX + side, y: 0 }, { x: L - corner, y: 0 }, "nose", CENTER),
    makeSegment({ x: L - corner, y: W }, { x: midX + side, y: W }, "nose", CENTER),
    makeSegment({ x: midX - side, y: W }, { x: corner, y: W }, "nose", CENTER),
    makeSegment({ x: 0, y: corner }, { x: 0, y: W - corner }, "nose", CENTER),
    makeSegment({ x: L, y: W - corner }, { x: L, y: corner }, "nose", CENTER),
  ];
}

/** Щёки: фаски от горла к концу проёма; нормаль смотрит в горло (на ось лузы). */
function buildPocketSegments(pockets: readonly PocketSpec[]): readonly Segment[] {
  const segments: Segment[] = [];
  for (const pocket of pockets) {
    segments.push(makeSegment(pocket.throatA, pocket.mouthA, "facing", pocket.center, pocket.id));
    segments.push(makeSegment(pocket.throatB, pocket.mouthB, "facing", pocket.center, pocket.id));
  }
  return segments;
}

/** Ромбы на рейке: 7 на длинных бортах (кроме места боковой лузы) и 3 на коротких. */
function buildRailSights(): readonly Point[] {
  const sights: Point[] = [];
  for (let k = 1; k <= 7; k += 1) {
    if (k === 4) continue;
    const x = (k / 8) * TABLE_LENGTH;
    sights.push({ x, y: 0 });
    sights.push({ x, y: TABLE_WIDTH });
  }
  for (let k = 1; k <= 3; k += 1) {
    const y = (k / 4) * TABLE_WIDTH;
    sights.push({ x: 0, y });
    sights.push({ x: TABLE_LENGTH, y });
  }
  return sights;
}

/** Построить геометрию стола по параметрам режима. Функция чистая, результат стабилен. */
export function buildTableGeometry(config: ModeConfig): TableGeometry {
  const pockets = buildPockets(config);
  const segments = [...buildNoseSegments(config), ...buildPocketSegments(pockets)];
  return {
    length: TABLE_LENGTH,
    width: TABLE_WIDTH,
    outer: {
      minX: -RAIL_WIDTH,
      minY: -RAIL_WIDTH,
      maxX: TABLE_LENGTH + RAIL_WIDTH,
      maxY: TABLE_WIDTH + RAIL_WIDTH,
    },
    pockets,
    segments,
    spots: [HEAD_SPOT, CENTER_SPOT, FOOT_SPOT],
    railSights: buildRailSights(),
  };
}

/** Вершина контура игровой поверхности. `open` — ребро к следующей вершине закрывает проём (не стенка). */
export interface OutlinePoint extends Point {
  readonly open: boolean;
}

/** Порядок обхода луз по часовой от верхнего левого угла; `true` — концы луз идут B→A. */
const OUTLINE_ORDER: ReadonlyArray<readonly [number, boolean]> = [
  [0, false],
  [4, false],
  [1, true],
  [2, false],
  [5, true],
  [3, true],
];

/** Контур игровой поверхности по часовой: носы, щёки и проёмы. Нужен отрисовке. */
export function feltOutline(geometry: TableGeometry): readonly OutlinePoint[] {
  const byId = new Map(geometry.pockets.map((pocket) => [pocket.id, pocket]));
  const outline: OutlinePoint[] = [];
  for (const [id, reversed] of OUTLINE_ORDER) {
    const pocket = byId.get(id);
    if (!pocket) continue;
    const [throatFirst, mouthFirst, mouthSecond, throatSecond] = reversed
      ? [pocket.throatB, pocket.mouthB, pocket.mouthA, pocket.throatA]
      : [pocket.throatA, pocket.mouthA, pocket.mouthB, pocket.throatB];
    outline.push(
      { ...throatFirst, open: false },
      { ...mouthFirst, open: true },
      { ...mouthSecond, open: false },
      { ...throatSecond, open: false },
    );
  }
  return outline;
}

/** Отрезки стола (носы и щёки луз). */
export function tableSegments(geometry: TableGeometry): readonly Segment[] {
  return geometry.segments;
}
