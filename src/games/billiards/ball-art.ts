// Отрисовка шара как вращающейся сферы: полосы и номера лежат на поверхности и
// поворачиваются вместе с ориентацией (roll.ts), освещение неподвижно (свет
// сверху-слева). Попиксельный шейдер на CPU в маленький холст; холст шара
// перерисовывается, только если ориентация или размер изменились.
import { colorOf, kindOf } from "./balls";
import { BASE_8BALL } from "./modes/base8ball";
import type { ModeConfig } from "./modes/types";
import { IDENTITY, type Mat3 } from "./roll";
import { makeCanvas } from "./textures";

/** Угловой радиус номерного диска (в проекции на сферу, доля радиуса шара). */
const NUMBER_RADIUS = 0.42;
/** Половина ширины полосы у полосатых (доля радиуса). */
const STRIPE_HALF = 0.5;
/** Размер текстуры номерного диска, пикселей. */
const DISC_SIZE = 96;

type Rgb = readonly [number, number, number];
type Rgba = readonly [number, number, number, number];

/** Выборка номерного диска: `u`,`v` в [-1,1] от центра диска; цвет и альфа 0..255. */
export type DiscSampler = (u: number, v: number) => Rgba;

/** Описание окраски шара. */
export interface BallPaint {
  readonly base: Rgb;
  readonly stripe: boolean;
  /** Номер на диске; 0 — без диска (биток). */
  readonly id: number;
}

function parseHex(hex: string): Rgb {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Окраска шара по номеру и конфигу режима (по умолчанию — 8-ball). */
export function paintOf(id: number, config: ModeConfig = BASE_8BALL): BallPaint {
  return { base: parseHex(colorOf(id, config)), stripe: kindOf(id) === "stripe", id };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

const LIGHT = (() => {
  const l = Math.hypot(-0.42, -0.52, 0.74);
  return [-0.42 / l, -0.52 / l, 0.74 / l] as const;
})();
const HALF = (() => {
  const x = LIGHT[0];
  const y = LIGHT[1];
  const z = LIGHT[2] + 1;
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l] as const;
})();

const WHITE: Rgb = [244, 244, 238];
const DOT: Rgb = [64, 70, 82];
/** Шесть меток на биток (±x, ±y, ±z): вращение битка всегда видно хотя бы одной. */
const CUE_DOTS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
/** Угловой радиус метки ~9°: хорошо видна, но не спорит с бликом. */
const CUE_DOT_COS = Math.sqrt(1 - 0.16 * 0.16);

/**
 * Цвет точки сферы. `nx`,`ny` — координаты на диске шара в долях радиуса
 * (nx² + ny² ≤ 1), `rot` — ориентация «текстура → мир». Чистая функция.
 */
export function shadeSphere(
  paint: BallPaint,
  rot: Mat3,
  nx: number,
  ny: number,
  disc: DiscSampler,
): Rgb {
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  // Точка в системе текстуры: p = Rᵀ · n.
  const px = rot[0] * nx + rot[3] * ny + rot[6] * nz;
  const py = rot[1] * nx + rot[4] * ny + rot[7] * nz;
  const pz = rot[2] * nx + rot[5] * ny + rot[8] * nz;

  let color: Rgb = paint.base;
  if (paint.stripe) {
    // Белый шар с цветной полосой вокруг оси y текстуры; номерные диски — на полосе.
    const band = clamp01((STRIPE_HALF - Math.abs(py)) / 0.03);
    color = mix(WHITE, paint.base, band);
  }
  if (paint.id > 0) {
    // Два номерных диска на противоположных полюсах (±z текстуры).
    const sign = pz >= 0 ? 1 : -1;
    const u = (sign * px) / NUMBER_RADIUS;
    const v = py / NUMBER_RADIUS;
    if (u * u + v * v < 1.2) {
      const d = disc(u, v);
      color = mix(color, [d[0], d[1], d[2]], d[3] / 255);
    }
  } else {
    for (const a of CUE_DOTS) {
      if (px * a[0] + py * a[1] + pz * a[2] > CUE_DOT_COS) {
        color = mix(color, DOT, 0.85);
        break;
      }
    }
  }

  // Неподвижное освещение: рассеянный свет, затемнение к краю, блик.
  const diffuse = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
  let shade = 0.42 + 0.66 * diffuse;
  shade *= 0.7 + 0.3 * Math.sqrt(nz);
  const spec = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
  const gloss = Math.pow(spec, 44) * 0.55 + Math.pow(spec, 8) * 0.07;
  return [
    Math.min(255, color[0] * shade + gloss * 255),
    Math.min(255, color[1] * shade + gloss * 255),
    Math.min(255, color[2] * shade + gloss * 255),
  ];
}

const discCache = new Map<number, DiscSampler>();

/** Номерной диск: белый круг и цифра; строится один раз на номер. Выборка билинейная. */
function discFor(id: number): DiscSampler {
  const hit = discCache.get(id);
  if (hit) return hit;
  const canvas = makeCanvas(DISC_SIZE, DISC_SIZE);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const blank: DiscSampler = () => [0, 0, 0, 0];
    discCache.set(id, blank);
    return blank;
  }
  const c = DISC_SIZE / 2;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fillStyle = "#f7f7f2";
  ctx.fill();
  ctx.fillStyle = "#121212";
  ctx.font = `bold ${Math.round(DISC_SIZE * 0.52)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(id), c, c + DISC_SIZE * 0.03);
  const data = ctx.getImageData(0, 0, DISC_SIZE, DISC_SIZE).data;
  const at = (x: number, y: number, k: number): number => {
    const xi = Math.min(DISC_SIZE - 1, Math.max(0, x));
    const yi = Math.min(DISC_SIZE - 1, Math.max(0, y));
    return data[(yi * DISC_SIZE + xi) * 4 + k]!;
  };
  const sampler: DiscSampler = (u, v) => {
    const tx = ((u + 1) / 2) * DISC_SIZE - 0.5;
    const ty = ((v + 1) / 2) * DISC_SIZE - 0.5;
    const x0 = Math.floor(tx);
    const y0 = Math.floor(ty);
    const fx = tx - x0;
    const fy = ty - y0;
    const out: number[] = [0, 0, 0, 0];
    for (let k = 0; k < 4; k += 1) {
      const top = at(x0, y0, k) * (1 - fx) + at(x0 + 1, y0, k) * fx;
      const bottom = at(x0, y0 + 1, k) * (1 - fx) + at(x0 + 1, y0 + 1, k) * fx;
      out[k] = top * (1 - fy) + bottom * fy;
    }
    return [out[0]!, out[1]!, out[2]!, out[3]!];
  };
  discCache.set(id, sampler);
  return sampler;
}

interface BallCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly image: ImageData;
  rot: Mat3 | null;
}

const ballCanvases = new Map<string, BallCanvas>();
const BALL_CANVAS_LIMIT = 64;

function sameRot(a: Mat3, b: Mat3): boolean {
  for (let i = 0; i < 9; i += 1) {
    if (Math.abs(a[i]! - b[i]!) > 1e-5) return false;
  }
  return true;
}

/**
 * Холст шара диаметром `diameterPx` (+1 px запаса с каждой стороны) в заданной
 * ориентации. Перерисовывается, только если ориентация сменилась. Цвет берётся
 * из конфига режима (по умолчанию — 8-ball) и входит в ключ кэша.
 */
export function renderBall(
  id: number,
  diameterPx: number,
  rot: Mat3,
  config: ModeConfig = BASE_8BALL,
): HTMLCanvasElement {
  const color = colorOf(id, config);
  const key = `${id}|${diameterPx}|${color}`;
  let entry = ballCanvases.get(key);
  if (!entry) {
    if (ballCanvases.size >= BALL_CANVAS_LIMIT) ballCanvases.clear();
    const size = diameterPx + 2;
    const canvas = makeCanvas(size, size);
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    entry = { canvas, ctx, image: ctx.createImageData(size, size), rot: null };
    ballCanvases.set(key, entry);
  }
  if (entry.rot && sameRot(entry.rot, rot)) return entry.canvas;

  const paint = paintOf(id, config);
  const disc = id > 0 ? discFor(id) : () => [0, 0, 0, 0] as const;
  const size = diameterPx + 2;
  const radius = diameterPx / 2;
  const data = entry.image.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x + 0.5 - size / 2) / radius;
      const dy = (y + 0.5 - size / 2) / radius;
      const r = Math.hypot(dx, dy);
      const i = (y * size + x) * 4;
      const coverage = clamp01((1 - r) * radius + 0.5);
      if (coverage <= 0) {
        data[i + 3] = 0;
        continue;
      }
      const s = r > 1 ? 1 / r : 1;
      const c = shadeSphere(paint, rot, dx * s, dy * s, disc);
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = coverage * 255;
    }
  }
  entry.ctx.putImageData(entry.image, 0, 0);
  entry.rot = rot;
  return entry.canvas;
}

/** Сторона холста шара в пикселях для диаметра `diameterPx`. */
export function ballCanvasSize(diameterPx: number): number {
  return diameterPx + 2;
}

/** Шар лицом к зрителю (номер в камеру): для панелей и значков забитых шаров. */
export function frontBallSprite(
  id: number,
  diameterPx: number,
  config: ModeConfig = BASE_8BALL,
): HTMLCanvasElement {
  const source = renderBall(id, diameterPx, IDENTITY, config);
  const copy = makeCanvas(source.width, source.height);
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
}

const shadowCache = new Map<number, HTMLCanvasElement>();
/** Во сколько раз холст тени больше диаметра шара. */
export const SHADOW_PAD = 1.7;

/** Мягкая тень шара на сукне: широкая полутень и плотный контакт, смещены от света (вниз-вправо). */
export function ballShadow(diameterPx: number): HTMLCanvasElement {
  const hit = shadowCache.get(diameterPx);
  if (hit) return hit;
  if (shadowCache.size >= 16) shadowCache.clear();
  const side = Math.round(diameterPx * SHADOW_PAD);
  const canvas = makeCanvas(side, side);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const r = diameterPx / 2;
  const c = side / 2;
  const blob = (ox: number, oy: number, inner: number, outer: number, alpha: number): void => {
    const g = ctx.createRadialGradient(c + ox * r, c + oy * r, inner * r, c + ox * r, c + oy * r, outer * r);
    g.addColorStop(0, `rgba(0,0,0,${alpha})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, side, side);
  };
  blob(0.3, 0.4, 0.35, 1.55, 0.36); // полутень
  blob(0.1, 0.14, 0.55, 1.08, 0.62); // контакт с сукном
  shadowCache.set(diameterPx, canvas);
  return canvas;
}
