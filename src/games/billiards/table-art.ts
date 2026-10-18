// Отрисовка стола слоями по модели луз (geometry.ts): рейка, борт, сукно, тень,
// отверстия с хромом, набойки. Рисуется в мм-координатах стола и один раз на
// размер кадра (см. render.ts). Модель подобрана в лаборатории `lab/canvas-lab.ts`.
import {
  CUSHION_WIDTH,
  FELT_COLOR,
  MARKING_COLOR,
  RAIL_WIDTH,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import { feltOutline, type OutlinePoint, type PocketSpec, type TableGeometry } from "./geometry";
import { featherEnds, feltNoiseCanvas, makeCanvas, WOOD_PX_PER_MM, woodTexture } from "./textures";

const C = CUSHION_WIDTH;
const R = RAIL_WIDTH;
const L = TABLE_LENGTH;
const W = TABLE_WIDTH;
const OUTER_W = L + 2 * R;
const OUTER_H = W + 2 * R;
/** Радиус внешнего угла рейки: концентричен углу пера. */
const OUTER_CORNER_RADIUS = R - C;
/** Ширина хромового кольца вокруг отверстия, мм. */
const CHROME_WIDTH = 9;
/** Размытие и плотность тени борта на сукне. */
const SHADOW_BLUR_MM = 22;
const SHADOW_ALPHA = 0.45;
const SHADOW_SCALE = 0.5;
/** Расстояние от носа до центра дерева рейки (там стоят набойки), мм. */
const PIN_OFFSET = (R - C) / 2 + C;

/** Пара «прямоугольник пера» нужна для вырезов (правило evenodd). */
function penRect(path: Path2D): void {
  path.rect(-C, -C, L + 2 * C, W + 2 * C);
}

function outlinePath(outline: readonly OutlinePoint[]): Path2D {
  const path = new Path2D();
  const first = outline[0];
  if (!first) return path;
  path.moveTo(first.x, first.y);
  for (const p of outline.slice(1)) path.lineTo(p.x, p.y);
  path.closePath();
  return path;
}

/** Борт: перо минус поле минус клин за проёмом угловых луз (там уже отверстие). */
function cushionPath(outline: readonly OutlinePoint[], pockets: readonly PocketSpec[]): Path2D {
  const path = new Path2D();
  penRect(path);
  path.addPath(outlinePath(outline));
  for (const p of pockets) {
    if (p.kind !== "corner") continue;
    const corner = { x: p.center.x < L / 2 ? -C : L + C, y: p.center.y < W / 2 ? -C : W + C };
    path.moveTo(p.mouthA.x, p.mouthA.y);
    path.lineTo(p.mouthB.x, p.mouthB.y);
    path.lineTo(corner.x, corner.y);
    path.closePath();
  }
  return path;
}

/** Всё снаружи пера: клип для хрома (evenodd). */
function outsidePenPath(): Path2D {
  const path = new Path2D();
  path.rect(-R * 3, -R * 3, L + 6 * R, W + 6 * R);
  penRect(path);
  return path;
}

function paintWood(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  const clip = new Path2D();
  clip.roundRect(-R, -R, OUTER_W, OUTER_H, OUTER_CORNER_RADIUS);
  ctx.clip(clip);
  // Основа — горизонтальные волокна на всю раму; на боковых сторонах поверх
  // вертикальные, гаснущие к углам: шва в углу нет.
  ctx.drawImage(woodTexture(OUTER_W, OUTER_H, true), -R, -R, OUTER_W, OUTER_H);
  const side = featherEnds(woodTexture(R - C, OUTER_H, false), R * 1.2 * WOOD_PX_PER_MM);
  ctx.drawImage(side, -R, -R, R - C, OUTER_H);
  ctx.drawImage(side, L + C, -R, R - C, OUTER_H);
  ctx.restore();
}

function paintCushion(ctx: CanvasRenderingContext2D, cushion: Path2D): void {
  ctx.save();
  ctx.clip(cushion, "evenodd");
  const g = ctx.createLinearGradient(0, -C, 0, W + C);
  g.addColorStop(0, "#0d4a2e");
  g.addColorStop(0.5, "#1d6e47");
  g.addColorStop(1, "#0d4a2e");
  ctx.fillStyle = g;
  ctx.fillRect(-C, -C, L + 2 * C, W + 2 * C);
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(feltNoiseCanvas(), -C, -C, L + 2 * C, W + 2 * C);
  ctx.restore();
}

let shadowSprite: HTMLCanvasElement | null = null;
/** Геометрия, для которой построен `shadowSprite`: форма тени зависит от луз/щёк,
 *  поэтому при смене режима (другого объекта геометрии) спрайт перестраивается. */
let shadowGeometry: TableGeometry | null = null;

/** Тень стенок на прозрачном фоне: штрих рисуется далеко за холстом, остаётся только размытая тень. */
function wallShadow(outline: readonly OutlinePoint[], geometry: TableGeometry): HTMLCanvasElement {
  if (shadowSprite && shadowGeometry === geometry) return shadowSprite;
  const sprite = makeCanvas((L + 2 * C) * SHADOW_SCALE, (W + 2 * C) * SHADOW_SCALE);
  const s = sprite.getContext("2d");
  if (!s) return sprite;
  const far = 10000;
  s.setTransform(SHADOW_SCALE, 0, 0, SHADOW_SCALE, C * SHADOW_SCALE - far, C * SHADOW_SCALE);
  s.shadowOffsetX = far; // в пикселях холста: ровно возвращает тень на место штриха
  s.shadowColor = `rgba(0,0,0,${SHADOW_ALPHA})`;
  s.shadowBlur = SHADOW_BLUR_MM * SHADOW_SCALE;
  s.lineWidth = SHADOW_BLUR_MM * 2;
  s.lineJoin = "round";
  s.strokeStyle = "#000";
  const walls = new Path2D();
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i]!;
    if (a.open) continue; // проёмы тени не дают
    const b = outline[(i + 1) % outline.length]!;
    walls.moveTo(a.x, a.y);
    walls.lineTo(b.x, b.y);
  }
  s.stroke(walls);
  shadowSprite = sprite;
  shadowGeometry = geometry;
  return sprite;
}

function paintFelt(
  ctx: CanvasRenderingContext2D,
  outline: readonly OutlinePoint[],
  geometry: TableGeometry,
): void {
  ctx.save();
  ctx.clip(outlinePath(outline));
  ctx.fillStyle = FELT_COLOR;
  ctx.fillRect(-C, -C, L + 2 * C, W + 2 * C);
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(feltNoiseCanvas(), 0, 0, L, W);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = MARKING_COLOR;
  for (const spot of geometry.spots) {
    ctx.beginPath();
    ctx.arc(spot.x, spot.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.drawImage(wallShadow(outline, geometry), -C, -C, L + 2 * C, W + 2 * C);
  ctx.restore();
}

/** Отверстие: целый круг поверх сукна и дерева, как на референсах. */
function paintHole(ctx: CanvasRenderingContext2D, pocket: PocketSpec): void {
  const { holeCenter: c, holeRadius: r } = pocket;
  const depth = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, r);
  depth.addColorStop(0, "#000");
  depth.addColorStop(0.75, "#060606");
  depth.addColorStop(1, "#1c1c1c");
  ctx.beginPath();
  ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
  ctx.fillStyle = depth;
  ctx.fill();
}

/** Хром: кольцо снаружи пера (клип), торцы ровно упираются в линию пера. */
function paintChrome(ctx: CanvasRenderingContext2D, pocket: PocketSpec): void {
  const { holeCenter: c, holeRadius: r } = pocket;
  ctx.save();
  ctx.clip(outsidePenPath(), "evenodd");
  ctx.beginPath();
  ctx.arc(c.x, c.y, r + CHROME_WIDTH, 0, Math.PI * 2);
  ctx.arc(c.x, c.y, r, Math.PI * 2, 0, true);
  const g = ctx.createLinearGradient(c.x - r, c.y - r, c.x + r, c.y + r);
  g.addColorStop(0, "#f2f4f6");
  g.addColorStop(0.45, "#9aa3ab");
  g.addColorStop(0.55, "#dfe4e8");
  g.addColorStop(1, "#5d656c");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Набойки (ромбы) по центру деревянной части рейки. */
function paintPins(ctx: CanvasRenderingContext2D, geometry: TableGeometry): void {
  ctx.fillStyle = "#c9a45c";
  for (const sight of geometry.railSights) {
    const x = sight.x === 0 ? -PIN_OFFSET : sight.x === L ? L + PIN_OFFSET : sight.x;
    const y = sight.y === 0 ? -PIN_OFFSET : sight.y === W ? W + PIN_OFFSET : sight.y;
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 12);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.fill();
  }
}

/** Нарисовать весь статичный стол в мм-координатах (контекст уже в системе стола). */
export function paintTable(ctx: CanvasRenderingContext2D, geometry: TableGeometry): void {
  const outline = feltOutline(geometry);
  paintWood(ctx);
  paintCushion(ctx, cushionPath(outline, geometry.pockets));
  paintFelt(ctx, outline, geometry);
  for (const pocket of geometry.pockets) paintHole(ctx, pocket);
  for (const pocket of geometry.pockets) paintChrome(ctx, pocket);
  paintPins(ctx, geometry);
}
