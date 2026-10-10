// Рендер бильярда: fit-contain из размера кадра, рисование в мм.
// Камеру платформы не используем (см. CONTEXT E2 и PLAN «Решения»).
import type { GameRenderFrame } from "@/core/game";
import { traceAim } from "./aim";
import { BALLS } from "./balls";
import {
  BACKDROP_COLOR,
  BALL_RADIUS,
  FELT_COLOR,
  MARKING_COLOR,
  POCKET_COLOR,
  RAIL_COLOR,
  RAIL_WIDTH,
  TABLE_LENGTH,
  TABLE_WIDTH,
} from "./constants";
import { buildTableGeometry, type Point } from "./geometry";
import type { BilliardsState } from "./state";

/** Минимальный отступ стола от края кадра: реальный «воздух» даёт рейка,
 *  а место под панели игра резервирует инсетами. */
export const FIT_PADDING = 4;

/** Трансформация «мм → пиксели окна» для схемы. */
export interface FitTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

const OUTER_W = TABLE_LENGTH + 2 * RAIL_WIDTH;
const OUTER_H = TABLE_WIDTH + 2 * RAIL_WIDTH;

/** Место по сторонам кадра, которое игра резервирует сама (панели зон). */
export interface FitInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export const ZERO_INSETS: FitInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/** Вписать стол (с рейкой) в кадр с базовым отступом, сохранив пропорции и
 *  не заходя в зарезервированное место (`insets`). */
export function computeFit(
  size: { readonly width: number; readonly height: number },
  padding: number,
  insets: FitInsets = ZERO_INSETS,
): FitTransform {
  const usableW = Math.max(1, size.width - 2 * padding - insets.left - insets.right);
  const usableH = Math.max(1, size.height - 2 * padding - insets.top - insets.bottom);
  const scale = Math.min(usableW / OUTER_W, usableH / OUTER_H);
  const innerW = size.width - insets.left - insets.right;
  const innerH = size.height - insets.top - insets.bottom;
  const offsetX = insets.left + (innerW - OUTER_W * scale) / 2 + RAIL_WIDTH * scale;
  const offsetY = insets.top + (innerH - OUTER_H * scale) / 2 + RAIL_WIDTH * scale;
  return { scale, offsetX, offsetY };
}

function fillCircle(
  ctx: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Траектория прицела точками: до первого шара (гост + векторы) либо с
 *  отскоками от бортов до предела пути. Кий не рисуется (D4, рюшечки 05+). */
function drawAim(ctx: CanvasRenderingContext2D, state: BilliardsState, angle: number): void {
  const trace = traceAim(state, angle);
  if (trace.path.length < 2) return;

  // Точки вдоль ломаной траектории.
  const step = BALL_RADIUS * 0.75;
  ctx.fillStyle = "#f4f4f0";
  for (let i = 0; i + 1 < trace.path.length; i += 1) {
    const a = trace.path[i]!;
    const b = trace.path[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / (segLen || 1);
    const uy = (b.y - a.y) / (segLen || 1);
    for (let d = 0; d < segLen; d += step) {
      fillCircle(ctx, { x: a.x + ux * d, y: a.y + uy * d }, 3.2, "#f4f4f0");
    }
  }

  const hit = trace.hitBall;
  if (!hit) return;

  // Гост-круг: куда встанет биток в момент контакта.
  ctx.beginPath();
  ctx.arc(hit.ghost.x, hit.ghost.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(244,244,240,0.75)";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Короткий вектор цели (куда уйдёт отлетевший шар).
  const vecLen = BALL_RADIUS * 6;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(120,220,255,0.9)";
  ctx.beginPath();
  ctx.moveTo(hit.ghost.x, hit.ghost.y);
  ctx.lineTo(hit.ghost.x + hit.targetDir.x * vecLen, hit.ghost.y + hit.targetDir.y * vecLen);
  ctx.stroke();

  // Короткий вектор отката битка (если удар не по центру).
  if (hit.cueDir) {
    ctx.strokeStyle = "rgba(255,215,110,0.9)";
    ctx.beginPath();
    ctx.moveTo(hit.ghost.x, hit.ghost.y);
    ctx.lineTo(hit.ghost.x + hit.cueDir.x * vecLen, hit.ghost.y + hit.cueDir.y * vecLen);
    ctx.stroke();
  }
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BilliardsState["balls"][number]): void {
  const def = BALLS[ball.id];
  const point: Point = { x: ball.x, y: ball.y };
  if (def && def.kind === "stripe") {
    // Полосатый: белый шар с цветной полосой по центру.
    fillCircle(ctx, point, BALL_RADIUS, "#f4f4f0");
    ctx.save();
    ctx.beginPath();
    ctx.arc(point.x, point.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = def.color;
    ctx.fillRect(
      point.x - BALL_RADIUS,
      point.y - BALL_RADIUS * 0.55,
      BALL_RADIUS * 2,
      BALL_RADIUS * 1.1,
    );
    ctx.restore();
  } else {
    fillCircle(ctx, point, BALL_RADIUS, def ? def.color : "#000000");
  }

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#0d0d0d";
  ctx.beginPath();
  ctx.arc(point.x, point.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  if (ball.id > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.round(BALL_RADIUS * 0.9)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(ball.id), point.x, point.y);
  }
}

/** Параметры вида прицела: угол, стрелки перемещения и их анимация. */
export interface AimView {
  readonly aim: number | null;
  readonly arrows?: boolean;
  readonly hover?: boolean;
  readonly blink?: number;
  readonly insets?: FitInsets;
}

/** Стрелки-индикаторы перемещения вокруг шара (вверх/вниз/влево/вправо). */
function drawMoveArrows(
  ctx: CanvasRenderingContext2D,
  center: Point,
  blink: number,
  hover: boolean,
): void {
  const dist = BALL_RADIUS + 10;
  const size = BALL_RADIUS * 0.52;
  const alpha = (hover ? 0.34 : 0.14) + 0.2 * blink;
  ctx.fillStyle = `rgba(244,244,240,${alpha.toFixed(3)})`;
  const dirs = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];
  for (const d of dirs) {
    const cx = center.x + d.x * dist;
    const cy = center.y + d.y * dist;
    const px = -d.y;
    const py = d.x;
    ctx.beginPath();
    ctx.moveTo(cx + d.x * size, cy + d.y * size);
    ctx.lineTo(cx - d.x * size * 0.4 + px * size, cy - d.y * size * 0.4 + py * size);
    ctx.lineTo(cx - d.x * size * 0.4 - px * size, cy - d.y * size * 0.4 - py * size);
    ctx.closePath();
    ctx.fill();
  }
}

/** Нарисовать схему: сукно, рейку, лузы, разметку и шары. */
export function drawBilliards(
  state: BilliardsState,
  frame: GameRenderFrame,
  view: AimView = { aim: null },
): void {
  const { ctx } = frame;
  const aim = view.aim;
  const fit = computeFit(frame.size, FIT_PADDING, view.insets ?? ZERO_INSETS);

  // Тёмная подложка на весь кадр — вокруг стола фон не в тон сукну.
  ctx.save();
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fillRect(0, 0, frame.size.width, frame.size.height);
  ctx.restore();

  const geometry = buildTableGeometry();

  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);

  // Рейка (внешний контур).
  ctx.fillStyle = RAIL_COLOR;
  ctx.fillRect(-RAIL_WIDTH, -RAIL_WIDTH, OUTER_W, OUTER_H);

  // Сукно игрового поля.
  ctx.fillStyle = FELT_COLOR;
  ctx.fillRect(0, 0, TABLE_LENGTH, TABLE_WIDTH);

  // Лузы-выемки.
  for (const pocket of geometry.pockets) {
    ctx.beginPath();
    ctx.moveTo(pocket.noseA.x, pocket.noseA.y);
    ctx.lineTo(pocket.backA.x, pocket.backA.y);
    ctx.lineTo(pocket.backB.x, pocket.backB.y);
    ctx.lineTo(pocket.noseB.x, pocket.noseB.y);
    ctx.closePath();
    ctx.fillStyle = POCKET_COLOR;
    ctx.fill();
  }

  // Подушки-носы и облицовки.
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#123f2c";
  for (const segment of geometry.segments) {
    if (segment.kind !== "nose") continue;
    ctx.beginPath();
    ctx.moveTo(segment.a.x, segment.a.y);
    ctx.lineTo(segment.b.x, segment.b.y);
    ctx.stroke();
  }

  // Разметка: пятна и ромбы на бортах.
  ctx.fillStyle = MARKING_COLOR;
  for (const spot of geometry.spots) fillCircle(ctx, spot, 5, MARKING_COLOR);
  for (const sight of geometry.railSights) fillCircle(ctx, sight, 3, MARKING_COLOR);

  // Шары.
  for (const ball of state.balls) {
    if (!ball.active) continue;
    drawBall(ctx, ball);
  }

  // Прицел поверх шаров (точки, гость, векторы) — чтобы не прятался под ними.
  if (aim !== null) drawAim(ctx, state, aim);

  // Стрелки «можно двигать» вокруг битка.
  if (view.arrows) {
    const cue = state.balls.find((b) => b.id === 0 && b.active);
    if (cue) drawMoveArrows(ctx, { x: cue.x, y: cue.y }, view.blink ?? 0, view.hover ?? false);
  }

  ctx.restore();
}
