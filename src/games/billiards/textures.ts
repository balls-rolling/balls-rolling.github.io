// Текстуры стола: шумы (сукно, дерево) и фон. Всё строится один раз и
// кэшируется: перерисовка статичного слоя только вставляет готовые холсты
// (см. table-art.ts, cache.ts, render.ts). Шары — в ball-art.ts.
import { BACKDROP_COLOR, RAIL_COLOR } from "./constants";

/** Офф-экранный canvas нужного размера в пикселях. */
export function makeCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

// --- Шум: value-noise и фрактальная сумма октав (fBm), детерминированные ---

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise(x * freq, y * freq);
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum;
}

/** Холст серого шума вокруг 128 (для наложения через `overlay`). */
function noiseCanvas(
  width: number,
  height: number,
  scaleX: number,
  scaleY: number,
  octaves: number,
  contrast: number,
): HTMLCanvasElement {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const img = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const n = fbm(x / scaleX, y / scaleY, octaves);
      const v = Math.max(0, Math.min(255, 128 + (n - 0.5) * 255 * contrast));
      const i = (y * canvas.width + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

let feltNoise: HTMLCanvasElement | null = null;

/** Мягкое зерно сукна для поля и борта (строится один раз). */
export function feltNoiseCanvas(): HTMLCanvasElement {
  feltNoise ??= noiseCanvas(512, 256, 14, 14, 3, 0.06);
  return feltNoise;
}

/** Разрешение текстуры дерева, пикселей на мм. */
export const WOOD_PX_PER_MM = 0.3;
const WOOD_ALONG_MM = 160;
const WOOD_ACROSS_MM = 10;
const WOOD_CONTRAST = 0.3;
const woodCache = new Map<string, HTMLCanvasElement>();

/** Полоса дерева: волокна вытянуты вдоль оси (`horizontal` — вдоль X). Кэшируется. */
export function woodTexture(widthMm: number, heightMm: number, horizontal: boolean): HTMLCanvasElement {
  const key = `${widthMm}x${heightMm}x${horizontal}`;
  const hit = woodCache.get(key);
  if (hit) return hit;
  const w = Math.max(1, Math.round(widthMm * WOOD_PX_PER_MM));
  const h = Math.max(1, Math.round(heightMm * WOOD_PX_PER_MM));
  const grain = noiseCanvas(
    w,
    h,
    (horizontal ? WOOD_ALONG_MM : WOOD_ACROSS_MM) * WOOD_PX_PER_MM,
    (horizontal ? WOOD_ACROSS_MM : WOOD_ALONG_MM) * WOOD_PX_PER_MM,
    3,
    WOOD_CONTRAST,
  );
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = RAIL_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "overlay";
    ctx.drawImage(grain, 0, 0);
  }
  woodCache.set(key, canvas);
  return canvas;
}

/** Копия холста, у которого верх и низ плавно гаснут по альфе (бесшовный стык текстур). */
export function featherEnds(src: HTMLCanvasElement, fadePx: number): HTMLCanvasElement {
  const canvas = makeCanvas(src.width, src.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = "destination-in";
  const f = Math.min(0.5, fadePx / canvas.height);
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(f, "rgba(0,0,0,1)");
  g.addColorStop(1 - f, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Тайл зерна: детерминированный шум (LCG), чтобы кадр не отличался от кадра. */
function grainTile(seed: number, alpha: number): HTMLCanvasElement {
  const size = 128;
  const tile = makeCanvas(size, size);
  const tctx = tile.getContext("2d");
  if (!tctx) return tile;
  const img = tctx.createImageData(size, size);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const v = s >>> 24;
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = Math.round(alpha * 255);
  }
  tctx.putImageData(img, 0, 0);
  return tile;
}

/** Фон вокруг стола: тёмный цвет с ненавязчивым шумом. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fillRect(0, 0, width, height);
  const pattern = ctx.createPattern(grainTile(7, 0.05), "repeat");
  if (!pattern) return;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, width, height);
}
