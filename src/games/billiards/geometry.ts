// Геометрия стола и луз в миллиметрах. Начало координат — угол игрового поля
// (нос-к-носу), `x` вдоль длины, `y` вдоль ширины. Чистые данные и функции.
import {
  BALL_RADIUS,
  CENTER_SPOT,
  CORNER_FACING_DEG,
  CORNER_MOUTH,
  FOOT_SPOT,
  HEAD_SPOT,
  RAIL_WIDTH,
  SIDE_FACING_DEG,
  SIDE_MOUTH,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";

/** Точка в миллиметрах. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Тип отрезка стола: подушка-нос или облицовка лузы. */
export type SegmentKind = "nose" | "facing";

/** Отрезок стола. `pocketId` — для облицовок. */
export interface Segment {
  readonly a: Point;
  readonly b: Point;
  readonly kind: SegmentKind;
  readonly pocketId?: number;
  /** Единичная нормаль, направленная в игровое поле (соударение отражает по ней). */
  readonly normal: Point;
}

/** Луза: рот (два конца носа) и облицовки; `backA/backB` — только для отрисовки полости. */
export interface PocketSpec {
  readonly id: number;
  readonly kind: "corner" | "side";
  /** Ширина рта (tip-to-tip), мм. */
  readonly mouth: number;
  /** Угол между облицовками, градусы (142 — угловая, 104 — боковая). */
  readonly facingAngle: number;
  /**
   * Боковой допуск захвата шара: насколько центр может свеситься за линию рта.
   * Логика захвата — `resolvePockets` в `physics.ts`.
   */
  readonly capturePad: number;
  /** Середина рта (для проверки захвата), мм. */
  readonly center: Point;
  /** Единичная внешняя нормаль рта (от центра стола наружу). */
  readonly outward: Point;
  readonly noseA: Point;
  readonly noseB: Point;
  readonly backA: Point;
  readonly backB: Point;
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
/** Смещение конца носа угловой лузы вдоль своего борта, мм. */
const CORNER_OFF = CORNER_MOUTH / Math.SQRT2;
/** Доля заглубления облицовок к вершине V (задаёт глубину нарисованной полости). */
const FACING_SHELF_FRACTION = 0.9;

function unitFromCenter(point: Point): Point {
  const dx = point.x - CENTER.x;
  const dy = point.y - CENTER.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

/** Нормаль к линии рта, направленная наружу от центра стола (ось лузы). */
function mouthAxis(noseA: Point, noseB: Point, mid: Point): Point {
  const tx = noseB.x - noseA.x;
  const ty = noseB.y - noseA.y;
  const len = Math.hypot(tx, ty) || 1;
  let nx = -ty / len;
  let ny = tx / len;
  const away = unitFromCenter(mid);
  if (nx * away.x + ny * away.y < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: nx, y: ny };
}

function normalize(vector: Point): Point {
  const len = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / len, y: vector.y / len };
}

/**
 * Построить лузу. Облицовки выводятся из `facingAngle`: каждая составляет
 * половину угла с осью лузы, значит угол между облицовками равен `facingAngle`.
 */
function buildPocket(
  id: number,
  kind: "corner" | "side",
  noseA: Point,
  noseB: Point,
  facingAngle: number,
): PocketSpec {
  const mouth = Math.hypot(noseB.x - noseA.x, noseB.y - noseA.y);
  const mid: Point = { x: (noseA.x + noseB.x) / 2, y: (noseA.y + noseB.y) / 2 };
  const out = mouthAxis(noseA, noseB, mid);
  const half = mouth / 2;
  const tx = (noseB.x - noseA.x) / (mouth || 1);
  const ty = (noseB.y - noseA.y) / (mouth || 1);
  const halfRad = (facingAngle * Math.PI) / 180 / 2;
  const depth = half / Math.tan(halfRad); // до гипотетической вершины V

  // Направления облицовок: от концов носа к вершине V (симметрично оси).
  const dirA = normalize({ x: half * tx + depth * out.x, y: half * ty + depth * out.y });
  const dirB = normalize({ x: -half * tx + depth * out.x, y: -half * ty + depth * out.y });
  const shelf = depth * FACING_SHELF_FRACTION;

  const backA: Point = { x: noseA.x + dirA.x * shelf, y: noseA.y + dirA.y * shelf };
  const backB: Point = { x: noseB.x + dirB.x * shelf, y: noseB.y + dirB.y * shelf };

  return {
    id,
    kind,
    mouth,
    facingAngle,
    capturePad: BALL_RADIUS,
    center: mid,
    outward: out,
    noseA,
    noseB,
    backA,
    backB,
  };
}

function buildPockets(): readonly PocketSpec[] {
  const halfSide = SIDE_MOUTH / 2;
  const midX = TABLE_LENGTH / 2;
  return [
    // Угловые: 0 — (0,0), 1 — (L,0), 2 — (L,W), 3 — (0,W).
    buildPocket(0, "corner", { x: 0, y: CORNER_OFF }, { x: CORNER_OFF, y: 0 }, CORNER_FACING_DEG),
    buildPocket(
      1,
      "corner",
      { x: TABLE_LENGTH, y: CORNER_OFF },
      { x: TABLE_LENGTH - CORNER_OFF, y: 0 },
      CORNER_FACING_DEG,
    ),
    buildPocket(
      2,
      "corner",
      { x: TABLE_LENGTH, y: TABLE_WIDTH - CORNER_OFF },
      { x: TABLE_LENGTH - CORNER_OFF, y: TABLE_WIDTH },
      CORNER_FACING_DEG,
    ),
    buildPocket(
      3,
      "corner",
      { x: 0, y: TABLE_WIDTH - CORNER_OFF },
      { x: CORNER_OFF, y: TABLE_WIDTH },
      CORNER_FACING_DEG,
    ),
    // Боковые: 4 — сверху, 5 — снизу.
    buildPocket(4, "side", { x: midX - halfSide, y: 0 }, { x: midX + halfSide, y: 0 }, SIDE_FACING_DEG),
    buildPocket(
      5,
      "side",
      { x: midX - halfSide, y: TABLE_WIDTH },
      { x: midX + halfSide, y: TABLE_WIDTH },
      SIDE_FACING_DEG,
    ),
  ];
}

function buildNoseSegments(): readonly Segment[] {
  const halfSide = SIDE_MOUTH / 2;
  const midX = TABLE_LENGTH / 2;
  return [
    makeSegment({ x: CORNER_OFF, y: 0 }, { x: midX - halfSide, y: 0 }, "nose"),
    makeSegment({ x: midX + halfSide, y: 0 }, { x: TABLE_LENGTH - CORNER_OFF, y: 0 }, "nose"),
    makeSegment(
      { x: TABLE_LENGTH - CORNER_OFF, y: TABLE_WIDTH },
      { x: midX + halfSide, y: TABLE_WIDTH },
      "nose",
    ),
    makeSegment(
      { x: midX - halfSide, y: TABLE_WIDTH },
      { x: CORNER_OFF, y: TABLE_WIDTH },
      "nose",
    ),
    makeSegment({ x: 0, y: CORNER_OFF }, { x: 0, y: TABLE_WIDTH - CORNER_OFF }, "nose"),
    makeSegment(
      { x: TABLE_LENGTH, y: TABLE_WIDTH - CORNER_OFF },
      { x: TABLE_LENGTH, y: CORNER_OFF },
      "nose",
    ),
  ];
}

/** Отрезок с нормалью-перпендикуляром, направленной в сторону центра стола. */
function makeSegment(a: Point, b: Point, kind: SegmentKind, pocketId?: number): Segment {
  const mid: Point = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const toCenterX = CENTER.x - mid.x;
  const toCenterY = CENTER.y - mid.y;
  if (nx * toCenterX + ny * toCenterY < 0) {
    nx = -nx;
    ny = -ny;
  }
  return { a, b, kind, normal: { x: nx, y: ny }, pocketId };
}

function buildPocketSegments(pockets: readonly PocketSpec[]): readonly Segment[] {
  // Задних кромок в коллизиях нет: они стоят внутри круга захвата и отбивают
  // шар раньше линии. Полость рисуется по backA/backB как раньше. Канал
  // образуют носы и облицовки.
  const segments: Segment[] = [];
  for (const pocket of pockets) {
    segments.push(makeSegment(pocket.noseA, pocket.backA, "facing", pocket.id));
    segments.push(makeSegment(pocket.noseB, pocket.backB, "facing", pocket.id));
  }
  return segments;
}

function buildRailSights(): readonly Point[] {
  const sights: Point[] = [];
  for (let k = 1; k <= 7; k += 1) {
    if (k === 4) continue; // на месте боковой лузы нет ромба
    const x = (k / 8) * TABLE_LENGTH;
    sights.push({ x, y: 0 });
    sights.push({ x, y: TABLE_WIDTH });
  }
  return sights;
}

/** Построить геометрию стола. Функция чистая, результат стабилен. */
export function buildTableGeometry(): TableGeometry {
  const pockets = buildPockets();
  const segments = [...buildNoseSegments(), ...buildPocketSegments(pockets)];
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

/** Отрезки стола (носы и облицовки луз). */
export function tableSegments(geometry: TableGeometry = buildTableGeometry()): readonly Segment[] {
  return geometry.segments;
}
