// Рендер бильярда: fit-contain из размера кадра, рисование в мм.
// Камеру платформы не используем (см. CONTEXT E2 и PLAN «Решения»).
import type { GameRenderFrame } from "@/core/game";
import { traceAim } from "./aim";
import { aimLog, aimNow, aimSince } from "@/debug/perf-log";
import { ballCanvasSize, ballShadow, renderBall } from "./ball-art";
import { getBallLayer, getStaticLayer } from "./cache";
import { BALL_RADIUS, RAIL_WIDTH, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { type Point, type TableGeometry } from "./geometry";
import type { BilliardsState } from "./state";
import type { CuePreview } from "./physics";
import { dropRollPoses, poseOf, type RollPose } from "./roll";
import { paintTable } from "./table-art";
import { makeCanvas, paintBackdrop } from "./textures";

/** Минимальный отступ стола от края кадра: реальный «воздух» даёт рейка,
 *  а место под панели игра резервирует инсетами. Хром луз выступает за рейку,
 *  поэтому запас больше, чем нужно голому столу. */
export const FIT_PADDING = 10;

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

/**
 * Цвета линии прицела (02-e): свой ход — белый, чужой (ИИ/сеть) — бледно-оранжевый.
 * Цвет — параметр вида: все ветки рендера получают один и тот же набор (урок п.7).
 */
const AIM_OWN = { path: "#f4f4f0", contact: "rgba(244,244,240,0.75)" } as const;
const AIM_PALE = { path: "rgba(255,178,102,0.9)", contact: "rgba(255,178,102,0.75)" } as const;

/** Точки вдоль ломаной с равным шагом (без привязки к шагам просчёта). */
function dotAlong(
  ctx: CanvasRenderingContext2D,
  path: readonly Point[],
  step: number,
  color: string,
  opacity = 1,
  fade = true,
): void {
  if (path.length < 2) return;
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.y - path[i - 1]!.y);
  }
  if (total <= 0) return;
  let target = 0;
  let seg = 1;
  let segStart = 0;
  let segLen = Math.hypot(path[1]!.x - path[0]!.x, path[1]!.y - path[0]!.y);
  while (target <= total + 1e-6) {
    while (seg < path.length - 1 && segStart + segLen < target) {
      segStart += segLen;
      seg += 1;
      segLen = Math.hypot(path[seg]!.x - path[seg - 1]!.x, path[seg]!.y - path[seg - 1]!.y);
    }
    const a = path[seg - 1]!;
    const b = path[seg]!;
    const t = segLen > 0 ? (target - segStart) / segLen : 0;
    const alpha = opacity * (fade ? Math.max(0.08, 0.95 * (1 - target / total)) : 0.9);
    ctx.globalAlpha = alpha;
    fillCircle(ctx, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, 3.2, color);
    target += step;
  }
  ctx.globalAlpha = 1;
}

/** Предсказанный пунктир, обрезанный по игровому полю. */
function drawPreviewPath(
  ctx: CanvasRenderingContext2D,
  path: readonly Point[],
  color: string,
  opacity: number,
  complete = true,
): void {
  if (path.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, TABLE_LENGTH, TABLE_WIDTH);
  ctx.clip();
  dotAlong(ctx, path, BALL_RADIUS * 0.75, color, opacity, complete);
  ctx.restore();
}

/** Призрак столкновения и направления после контакта из одного снимка физики. */
function drawPreviewContact(
  ctx: CanvasRenderingContext2D,
  contact: NonNullable<CuePreview["contact"]>,
  circleColor: string,
  opacity: number,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.beginPath();
  ctx.arc(contact.cuePoint.x, contact.cuePoint.y, BALL_RADIUS, 0, Math.PI * 2);
  ctx.strokeStyle = circleColor;
  ctx.lineWidth = 2;
  ctx.stroke();

  const vecBase = BALL_RADIUS * 5;
  ctx.lineWidth = 3;
  const vectors = [
    { point: contact.targetPoint, velocity: contact.targetVelocity, color: "rgba(120,220,255,0.9)" },
    { point: contact.cuePoint, velocity: contact.cueVelocity, color: "rgba(255,215,110,0.85)" },
  ];
  const speeds = vectors.map((v) => Math.hypot(v.velocity.x, v.velocity.y));
  const maxSpeed = Math.max(...speeds, 1);
  for (const [index, vector] of vectors.entries()) {
    const length = speeds[index] ?? 0;
    if (length < 1e-6) continue;
    const vecLen = vecBase * (0.35 + 0.65 * (length / maxSpeed));
    ctx.strokeStyle = vector.color;
    ctx.beginPath();
    ctx.moveTo(vector.point.x, vector.point.y);
    ctx.lineTo(
      vector.point.x + (vector.velocity.x / length) * vecLen,
      vector.point.y + (vector.velocity.y / length) * vecLen,
    );
    ctx.stroke();
  }
  ctx.restore();
}

/** Старый полный прогноз остаётся приглушённым, пока новый уточняется. */
function drawAim(ctx: CanvasRenderingContext2D, state: BilliardsState, view: AimView): void {
  const angle = view.aim;
  if (angle === null) return;
  const colors = view.aimPale ? AIM_PALE : AIM_OWN;
  const previous = view.previousPreview ?? null;
  const current = view.preview ?? null;
  if (previous) {
    drawPreviewPath(ctx, previous.path, colors.path, 0.3);
    if (previous.contact) drawPreviewContact(ctx, previous.contact, colors.contact, 0.45);
  }
  if (current) {
    drawPreviewPath(ctx, current.path, colors.path, 1, current.complete);
    if (current.contact) drawPreviewContact(ctx, current.contact, colors.contact, 1);
  } else if (!previous) {
    // Запасной путь без физики (первый кадр): прямой луч без продолжений.
    drawPreviewPath(ctx, traceAim(state, angle, view.geometry).path, colors.path, 1);
  }
}

/** Шар: мягкая тень на сукне и сфера в текущей ориентации (полосы и номер на поверхности). */
function drawBall(
  ctx: CanvasRenderingContext2D,
  ball: BilliardsState["balls"][number],
  pose: RollPose,
  pxPerMm: number,
): void {
  const diameterPx = Math.max(6, Math.round(2 * BALL_RADIUS * pxPerMm));
  const shadow = ballShadow(diameterPx);
  const shadowMm = shadow.width / pxPerMm;
  ctx.drawImage(shadow, ball.x - shadowMm / 2, ball.y - shadowMm / 2, shadowMm, shadowMm);
  const sphere = renderBall(ball.id, diameterPx, pose.rot);
  const sphereMm = ballCanvasSize(diameterPx) / pxPerMm;
  ctx.drawImage(sphere, ball.x - sphereMm / 2, ball.y - sphereMm / 2, sphereMm, sphereMm);
}

/** Параметры вида прицела: геометрия стола, режим, угол, предпросмотр пути,
 *  стрелки и их анимация. Геометрию и ключ режима задаёт игра (задача 8);
 *  рендер не владеет геометрией и не собирает её сам. */
export interface AimView {
  /** Геометрия стола активного режима (та же, что у физики и ввода). */
  readonly geometry: TableGeometry;
  /** Сигнатура режима для ключей кэша: смена режима перестраивает слои. */
  readonly modeKey: string;
  readonly aim: number | null;
  /** Прицел чужого участника (ИИ/сеть) — бледно-оранжевый (02-e). */
  readonly aimPale?: boolean;
  /** Короткий предпросмотр пути битка честной физикой (считает игра). */
  readonly preview?: CuePreview;
  /** Последний завершённый путь во время уточнения нового. */
  readonly previousPreview?: CuePreview;
  readonly arrows?: boolean;
  readonly hover?: boolean;
  readonly blink?: number;
  readonly insets?: FitInsets;
  /** Прицел рисуется отдельным холстом (overlay): основной кадр его не трогает. */
  readonly overlayAim?: boolean;
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

/** Ключ статичного слоя: меняется при смене режима, размера, DPR или fit. */
export function staticLayerKey(
  size: { readonly width: number; readonly height: number },
  dpr: number,
  fit: FitTransform,
  modeKey: string,
): string {
  return `${modeKey}|${size.width}x${size.height}@${dpr}|${fit.scale}|${fit.offsetX}|${fit.offsetY}`;
}

/** Ключ шара включает режим, состояние/позу, чтобы кэш не пережил смену
 *  геометрии, движение или вращение. */
export function ballLayerKey(
  size: { readonly width: number; readonly height: number },
  dpr: number,
  fit: FitTransform,
  modeKey: string,
  balls: readonly {
    readonly id: number;
    readonly x: number;
    readonly y: number;
    readonly rot: RollPose["rot"];
  }[],
): string {
  const ballKey = balls
    .map((ball) => `${ball.id}:${ball.x},${ball.y}:${ball.rot.join(",")}`)
    .join(";");
  return `${modeKey}|${size.width}x${size.height}@${dpr}|${fit.scale}|${fit.offsetX}|${fit.offsetY}|${ballKey}`;
}

/** Статичный слой: фон и весь стол (рейка, борт, сукно, лузы, набойки) — одним холстом. */
function buildStaticLayer(
  size: { readonly width: number; readonly height: number },
  dpr: number,
  fit: FitTransform,
  geometry: TableGeometry,
): HTMLCanvasElement {
  const canvas = makeCanvas(size.width * dpr, size.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  paintBackdrop(ctx, size.width, size.height);
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);
  paintTable(ctx, geometry);
  return canvas;
}

function buildBallLayer(
  size: { readonly width: number; readonly height: number },
  dpr: number,
  fit: FitTransform,
  balls: readonly { readonly ball: BilliardsState["balls"][number]; readonly pose: RollPose }[],
): HTMLCanvasElement {
  const canvas = makeCanvas(size.width * dpr, size.height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(dpr, dpr);
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);
  const pxPerMm = fit.scale * dpr;
  for (const { ball, pose } of balls) drawBall(ctx, ball, pose, pxPerMm);
  return canvas;
}

/** Нарисовать схему: статичный слой один раз, затем шары и прицел. */
export function drawBilliards(
  state: BilliardsState,
  frame: GameRenderFrame,
  view: AimView,
): void {
  const d0 = aimNow();
  const { ctx } = frame;
  const { geometry, modeKey } = view;
  const aim = view.aim;
  const fit = computeFit(frame.size, FIT_PADDING, view.insets ?? ZERO_INSETS);

  let staticBuilt = false;
  const layer = getStaticLayer(staticLayerKey(frame.size, frame.dpr, fit, modeKey), () => {
    staticBuilt = true;
    // Причина пересборки стола: какой параметр поля изменился (размер, DPR, fit).
    aimLog("stbuild", {
      w: frame.size.width,
      h: frame.size.height,
      dpr: frame.dpr,
      scale: Math.round(fit.scale * 1000) / 1000,
      ox: Math.round(fit.offsetX),
      oy: Math.round(fit.offsetY),
    });
    return buildStaticLayer(frame.size, frame.dpr, fit, geometry);
  });
  const d1 = aimNow();
  ctx.save();
  ctx.drawImage(layer, 0, 0, frame.size.width, frame.size.height);
  ctx.restore();
  const d2 = aimNow();

  const renderedBalls: { ball: BilliardsState["balls"][number]; pose: RollPose }[] = [];
  const activeIds = new Set<number>();
  for (const ball of state.balls) {
    if (!ball.active) continue;
    activeIds.add(ball.id);
    renderedBalls.push({ ball, pose: poseOf(ball.id, ball.x, ball.y) });
  }
  dropRollPoses(activeIds);

  let ballsBuilt = false;
  const d3 = aimNow();
  if (aim !== null || view.overlayAim) {
    const poses = renderedBalls.map(({ ball, pose }) => ({
      id: ball.id,
      x: ball.x,
      y: ball.y,
      rot: pose.rot,
    }));
    const ballsLayer = getBallLayer(ballLayerKey(frame.size, frame.dpr, fit, modeKey, poses), () => {
      ballsBuilt = true;
      return buildBallLayer(frame.size, frame.dpr, fit, renderedBalls);
    });
    ctx.drawImage(ballsLayer, 0, 0, frame.size.width, frame.size.height);
  }
  const d4 = aimNow();

  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);
  if (aim === null && !view.overlayAim) {
    const pxPerMm = fit.scale * frame.dpr;
    for (const { ball, pose } of renderedBalls) drawBall(ctx, ball, pose, pxPerMm);
  }

  // Прицел поверх шаров (точки, гость, векторы) — чтобы не прятался под ними.
  if (aim !== null) drawAim(ctx, state, view);
  const d5 = aimNow();

  // Стрелки «можно двигать» вокруг битка.
  if (view.arrows) {
    const cue = state.balls.find((b) => b.id === 0 && b.active);
    if (cue) drawMoveArrows(ctx, { x: cue.x, y: cue.y }, view.blink ?? 0, view.hover ?? false);
  }

  ctx.restore();
  aimLog("render", {
    cv: [frame.size.width, frame.size.height, frame.dpr],
    stLayer: Math.round((d1 - d0) * 100) / 100,
    stBuilt: staticBuilt,
    stDraw: Math.round((d2 - d1) * 100) / 100,
    ballsPrep: Math.round((d3 - d2) * 100) / 100,
    ballsLayer: Math.round((d4 - d3) * 100) / 100,
    ballsBuilt,
    aim: Math.round((d5 - d4) * 100) / 100,
    total: aimSince(d0),
    pts: view.preview ? view.preview.path.length : 0,
  });
}

/**
 * Прицел на отдельном холсте (overlay): линия, предпросмотр и стрелки. Холст
 * очищается и перерисовывается каждый кадр — это дёшево, а стол и шары остаются в
 * основном кэше и не пересобираются при вращении.
 */
export function drawAimOverlay(
  ctx: CanvasRenderingContext2D,
  size: { readonly width: number; readonly height: number },
  dpr: number,
  state: BilliardsState,
  view: AimView & { readonly arrows?: boolean },
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  const fit = computeFit(size, FIT_PADDING, view.insets ?? ZERO_INSETS);
  ctx.save();
  ctx.translate(fit.offsetX, fit.offsetY);
  ctx.scale(fit.scale, fit.scale);
  if (view.aim !== null) drawAim(ctx, state, view);
  if (view.arrows) {
    const cue = state.balls.find((b) => b.id === 0 && b.active);
    if (cue) drawMoveArrows(ctx, { x: cue.x, y: cue.y }, view.blink ?? 0, view.hover ?? false);
  }
  ctx.restore();
}
