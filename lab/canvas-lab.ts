// Лаборатория: модель луз по схеме пользователя + визуал. Не часть игры.
// Система: угол (0,0) — наружный угол носа, ось X вправо, Y вниз, мм.
// Нос: y=0 (верх), y=WID (низ), x=0 (лево), x=LEN (право). Перо: на расстоянии C.
// Проём (триггер) лежит на линии пера. Щёки — фаски 45° от носа наружу к концам проёма.
// Центр лузы — глубже проёма в борт (cornerDepthMm / sideDepthMm).

interface Knobs {
  railMm: number;
  cushionMm: number;
  cornerMouthMm: number;
  sideMouthMm: number;
  cornerDepthMm: number;
  sideDepthMm: number;
  chromeMm: number;
  feltNoise: number;
  woodNoise: number;
  cornerRoundMm: number;
  shadowMm: number;
  shadowAlpha: number;
  ballShadow: number;
  vignette: number;
}

const knobs: Knobs = {
  railMm: 130,
  cushionMm: 51,
  cornerMouthMm: 127,
  sideMouthMm: 139.7,
  cornerDepthMm: 17,
  sideDepthMm: 12,
  chromeMm: 9,
  feltNoise: 0.06,
  woodNoise: 0.3,
  cornerRoundMm: 79,
  shadowMm: 22,
  shadowAlpha: 0.45,
  ballShadow: 0.6,
  vignette: 0.35,
};
let showPhysics = true;
/** Вид лабы: зум и сдвиг в пикселях холста. Колесо — зум у курсора, перетаскивание — сдвиг. */
const view = { z: 1, px: 0, py: 0 };

const LEN = 2540;
const WID = 1270;

const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

interface Pt {
  readonly x: number;
  readonly y: number;
}
interface RingPt extends Pt {
  /** Ребро от этой точки к следующей — проём (триггер), а не стенка. */
  readonly open: boolean;
}
interface PocketModel {
  readonly mouthA: Pt;
  readonly mouthB: Pt;
  readonly center: Pt;
  readonly outward: Pt;
  readonly mouthLen: number;
  readonly radius: number;
  readonly corner: boolean;
}

function norm(p: Pt): Pt {
  const l = Math.hypot(p.x, p.y) || 1;
  return { x: p.x / l, y: p.y / l };
}

/** Модель: кольцо игровой поверхности (против часовой по экрану) и 6 луз. */
function model() {
  const C = knobs.cushionMm;
  const a = knobs.cornerMouthMm / Math.SQRT2 - C; // проём угла: T1=(a,-C), T2=(-C,a)
  const h = knobs.sideMouthMm / 2;
  const mx = LEN / 2;
  const ring: RingPt[] = [
    { x: 0, y: a + C, open: false },
    { x: -C, y: a, open: true }, // проём TL
    { x: a, y: -C, open: false },
    { x: a + C, y: 0, open: false },
    { x: mx - h - C, y: 0, open: false },
    { x: mx - h, y: -C, open: true }, // проём верх
    { x: mx + h, y: -C, open: false },
    { x: mx + h + C, y: 0, open: false },
    { x: LEN - a - C, y: 0, open: false },
    { x: LEN - a, y: -C, open: true }, // проём TR
    { x: LEN + C, y: a, open: false },
    { x: LEN, y: a + C, open: false },
    { x: LEN, y: WID - a - C, open: false },
    { x: LEN + C, y: WID - a, open: true }, // проём BR
    { x: LEN - a, y: WID + C, open: false },
    { x: LEN - a - C, y: WID, open: false },
    { x: mx + h + C, y: WID, open: false },
    { x: mx + h, y: WID + C, open: true }, // проём низ
    { x: mx - h, y: WID + C, open: false },
    { x: mx - h - C, y: WID, open: false },
    { x: a + C, y: WID, open: false },
    { x: a, y: WID + C, open: true }, // проём BL
    { x: -C, y: WID - a, open: false },
    { x: 0, y: WID - a - C, open: false },
  ];
  const cx = LEN / 2;
  const cy = WID / 2;
  const pockets: PocketModel[] = [];
  const add = (A: Pt, B: Pt, depth: number, corner: boolean) => {
    const mid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
    // Ось лузы — нормаль к проёму (наружу от поля), а не направление от центра стола.
    let out = norm({ x: -(B.y - A.y), y: B.x - A.x });
    if (out.x * (mid.x - cx) + out.y * (mid.y - cy) < 0) out = { x: -out.x, y: -out.y };
    const mouthLen = Math.hypot(B.x - A.x, B.y - A.y);
    pockets.push({
      mouthA: A,
      mouthB: B,
      center: { x: mid.x + out.x * depth, y: mid.y + out.y * depth },
      outward: out,
      mouthLen,
      // Окружность отверстия проходит ровно через концы проёма (губы).
      radius: Math.hypot(mouthLen / 2, depth),
      corner,
    });
  };
  for (let i = 0; i < ring.length; i += 1) {
    if (!ring[i]!.open) continue;
    const A = ring[i]!;
    const B = ring[(i + 1) % ring.length]!;
    const isSide = Math.abs(A.x - mx) <= h + 1;
    add(A, B, isSide ? knobs.sideDepthMm : knobs.cornerDepthMm, !isSide);
  }
  return { ring, pockets, a, C };
}

function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return h - Math.floor(h);
}
function vnoise(x: number, y: number): number {
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
  let f = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * vnoise(x * f, y * f);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum;
}

function noiseCanvas(w: number, h: number, sx: number, sy: number, octaves: number, contrast: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  const img = cx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = fbm(x / sx, y / sy, octaves);
      const v = Math.max(0, Math.min(255, 128 + (n - 0.5) * 255 * contrast));
      const i = (y * w + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  return c;
}

const PX_PER_MM = 0.25;
const woodCache = new Map<string, HTMLCanvasElement>();
function woodStrip(wMm: number, hMm: number, horizontal: boolean): HTMLCanvasElement {
  const key = `${wMm}x${hMm}x${horizontal}x${knobs.woodNoise}`;
  const hit = woodCache.get(key);
  if (hit) return hit;
  const w = Math.max(1, Math.round(wMm * PX_PER_MM));
  const h = Math.max(1, Math.round(hMm * PX_PER_MM));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  const layer = cx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const along = horizontal ? x : y;
      const across = horizontal ? y : x;
      const n = fbm(along / 40, across / 2.5, 3);
      const v = 128 + (n - 0.5) * 255 * knobs.woodNoise;
      const i = (y * w + x) * 4;
      layer.data[i] = v;
      layer.data[i + 1] = v;
      layer.data[i + 2] = v;
      layer.data[i + 3] = 255;
    }
  }
  const noise = document.createElement("canvas");
  noise.width = w;
  noise.height = h;
  noise.getContext("2d")!.putImageData(layer, 0, 0);
  cx.fillStyle = "#4a2f1b";
  cx.fillRect(0, 0, w, h);
  cx.globalCompositeOperation = "overlay";
  cx.drawImage(noise, 0, 0);
  cx.globalCompositeOperation = "source-over";
  woodCache.set(key, c);
  return c;
}

/** Копия холста, у которого верх и низ плавно гаснут по альфе на fadePx (для бесшовных стыков). */
function featherEnds(src: HTMLCanvasElement, fadePx: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const x = c.getContext("2d")!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = "destination-in";
  const g = x.createLinearGradient(0, 0, 0, c.height);
  const f = Math.min(0.5, fadePx / c.height);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(f, "rgba(0,0,0,1)");
  g.addColorStop(1 - f, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function drawWood(x: number, y: number, wMm: number, hMm: number, horizontal: boolean): void {
  ctx.drawImage(woodStrip(wMm, hMm, horizontal), x, y, wMm, hMm);
}

function feltPath(ring: readonly RingPt[]): Path2D {
  const p = new Path2D();
  p.moveTo(ring[0]!.x, ring[0]!.y);
  for (const q of ring.slice(1)) p.lineTo(q.x, q.y);
  p.closePath();
  return p;
}

/** Спрайт тени борта: прозрачный холст, только размытая тень внутри поля. Пересобирается по модели. */
const SHADOW_SCALE = 0.5;
function shadowSprite(ring: readonly RingPt[]): HTMLCanvasElement {
  const C = knobs.cushionMm;
  const c = document.createElement("canvas");
  c.width = Math.ceil((LEN + 2 * C) * SHADOW_SCALE);
  c.height = Math.ceil((WID + 2 * C) * SHADOW_SCALE);
  const s = c.getContext("2d")!;
  const OFF = 10000; // штрих рисуем далеко за холстом, на холст попадает только его тень
  s.setTransform(SHADOW_SCALE, 0, 0, SHADOW_SCALE, C * SHADOW_SCALE, C * SHADOW_SCALE);
  s.translate(-OFF / SHADOW_SCALE, 0);
  s.shadowOffsetX = OFF;
  s.shadowColor = `rgba(0,0,0,${knobs.shadowAlpha})`;
  s.shadowBlur = knobs.shadowMm * SHADOW_SCALE;
  s.lineWidth = knobs.shadowMm * 2;
  s.lineJoin = "round";
  s.strokeStyle = "#000";
  // Только стенки (носы и щёки); проёмы (open) тень не получают.
  const walls = new Path2D();
  for (let i = 0; i < ring.length; i += 1) {
    const A = ring[i]!;
    if (A.open) continue;
    const B = ring[(i + 1) % ring.length]!;
    walls.moveTo(A.x, A.y);
    walls.lineTo(B.x, B.y);
  }
  s.stroke(walls);
  return c;
}

/** Область борта (сукно выступа): прямоугольник пера минус поле минус зона за проёмом угловых луз.
 *  Используется как клип: заливка борта, а также «не рисовать сюда» для отверстия и хрома. */
function cushionPath(ring: readonly RingPt[], pockets: readonly PocketModel[]): Path2D {
  const C = knobs.cushionMm;
  const p = new Path2D();
  p.rect(-C, -C, LEN + 2 * C, WID + 2 * C);
  p.addPath(feltPath(ring));
  for (const k of pockets) {
    if (!k.corner) continue; // у боковых проём лежит на линии пера — за ним борта нет
    const mid = { x: (k.mouthA.x + k.mouthB.x) / 2, y: (k.mouthA.y + k.mouthB.y) / 2 };
    const corner = { x: mid.x < LEN / 2 ? -C : LEN + C, y: mid.y < WID / 2 ? -C : WID + C };
    p.moveTo(k.mouthA.x, k.mouthA.y);
    p.lineTo(k.mouthB.x, k.mouthB.y);
    p.lineTo(corner.x, corner.y);
    p.closePath();
  }
  return p;
}

/** Отверстие: полный круг через концы проёма; борт (губы) им не режется — клип снаружи борта. */
function drawHole(p: PocketModel): void {
  const r = p.radius;
  ctx.save();
  const depth = ctx.createRadialGradient(p.center.x, p.center.y, 0, p.center.x, p.center.y, r);
  depth.addColorStop(0, "#000");
  depth.addColorStop(0.75, "#060606");
  depth.addColorStop(1, "#1c1c1c");
  ctx.beginPath();
  ctx.arc(p.center.x, p.center.y, r, 0, Math.PI * 2);
  ctx.fillStyle = depth;
  ctx.fill();
  ctx.restore();
}

/** Хром: кольцо вокруг отверстия, только снаружи пера — торцы ровно обрезаны линией пера
 *  и упираются в губы; снаружи кольцо может выступать за дерево. */
function drawChrome(p: PocketModel): void {
  const C = knobs.cushionMm;
  const r = p.radius;
  const band = knobs.chromeMm;
  ctx.save();
  const outsidePen = new Path2D();
  outsidePen.rect(-10000, -10000, 20000 + LEN, 20000 + WID);
  outsidePen.rect(-C, -C, LEN + 2 * C, WID + 2 * C);
  ctx.clip(outsidePen, "evenodd");
  ctx.beginPath();
  ctx.arc(p.center.x, p.center.y, r + band, 0, Math.PI * 2);
  ctx.arc(p.center.x, p.center.y, r, Math.PI * 2, 0, true);
  const g = ctx.createLinearGradient(p.center.x - r, p.center.y - r, p.center.x + r, p.center.y + r);
  g.addColorStop(0, "#f2f4f6");
  g.addColorStop(0.45, "#9aa3ab");
  g.addColorStop(0.55, "#dfe4e8");
  g.addColorStop(1, "#5d656c");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/** Слой физики: синие — стенки (носы и фаски), красные — проёмы, жёлтые — перо, белые — центры луз. */
function drawPhysicsOverlay(ring: readonly RingPt[], pockets: readonly PocketModel[], pxPerMm: number): void {
  const C = knobs.cushionMm;
  const px = 1 / pxPerMm; // 1 экранный пиксель в мм — линии физики всегда 2 px
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 2 * px;
  for (let i = 0; i < ring.length; i += 1) {
    const A = ring[i]!;
    const B = ring[(i + 1) % ring.length]!;
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.strokeStyle = A.open ? "#ff3030" : "#2ea8ff";
    ctx.stroke();
  }
  ctx.strokeStyle = "#ffe14d";
  ctx.strokeRect(-C, -C, LEN + 2 * C, WID + 2 * C);
  ctx.fillStyle = "#ffffff";
  for (const p of pockets) {
    ctx.beginPath();
    ctx.arc(p.center.x, p.center.y, 3 * px, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTable(): void {
  const W = canvas.width;
  const H = canvas.height;
  const R = knobs.railMm;
  const C = knobs.cushionMm;
  const { ring, pockets, a } = model();
  const outerW = LEN + 2 * R;
  const outerH = WID + 2 * R;
  const scale = Math.min((W - 80) / outerW, (H - 80) / outerH);
  const ox = (W - outerW * scale) / 2 + R * scale;
  const oy = (H - outerH * scale) / 2 + R * scale;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#0b0f10";
  ctx.fillRect(0, 0, W, H);
  ctx.setTransform(view.z, 0, 0, view.z, view.px, view.py);

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  const felt = feltPath(ring);
  const pen = { x: -C, y: -C, w: LEN + 2 * C, h: WID + 2 * C };

  // 1. Рейка (дерево, волокна вдоль борта).
  // Рейка как рамка из четырёх трапеций «на ус»: без перехлёста в углах.
  // Длинные стороны — волокна вдоль, короткие — поперёк своей оси, как в шпоне.
  const baseWood = woodStrip(outerW, outerH, true);
  // Боковые стороны: вертикальные волокна, концы плавно гаснут к углам (без шва).
  const sideWood = featherEnds(woodStrip(R - C, outerH, false), (R * 1.2) * PX_PER_MM);
  const woodPattern = (src: HTMLCanvasElement): CanvasPattern => {
    const p = ctx.createPattern(src, "repeat")!;
    p.setTransform(new DOMMatrix([1 / PX_PER_MM, 0, 0, 1 / PX_PER_MM, 0, 0]));
    return p;
  };
  const frame = (pts: Array<[number, number]>, strip: HTMLCanvasElement) => {
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = woodPattern(strip);
    ctx.fill();
  };
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-R, -R, outerW, outerH, knobs.cornerRoundMm);
  ctx.clip();
  // Стороны — прямоугольники между углами; углы — отдельные квадраты (без шва на диагонали).
  const rect = (x: number, y: number, w: number, h: number, strip: HTMLCanvasElement) => {
    ctx.fillStyle = woodPattern(strip);
    ctx.fillRect(x, y, w, h);
  };
  rect(-R, -R, outerW, outerH, baseWood);
  rect(-R, -R, R - C, outerH, sideWood);
  rect(LEN + C, -R, R - C, outerH, sideWood);
  ctx.restore();

  // 2. Борт (выступ, обтянутый сукном): перо минус поле минус зона за проёмом.
  const cushion = cushionPath(ring, pockets);
  ctx.save();
  ctx.clip(cushion, "evenodd");
  const g = ctx.createLinearGradient(0, pen.y, 0, pen.y + pen.h);
  g.addColorStop(0, "#0d4a2e");
  g.addColorStop(0.5, "#1d6e47");
  g.addColorStop(1, "#0d4a2e");
  ctx.fillStyle = g;
  ctx.fillRect(pen.x, pen.y, pen.w, pen.h);
  // Перья — тоже сукно: то же зерно, что и на поле.
  const cushionNoise = noiseCanvas(512, 256, 14, 14, 3, knobs.feltNoise);
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(cushionNoise, pen.x, pen.y, pen.w, pen.h);
  ctx.globalCompositeOperation = "source-over";
  ctx.restore();

  // 3. Игровая поверхность по модели.
  ctx.save();
  ctx.clip(felt);
  ctx.fillStyle = "#1b5e3c";
  ctx.fillRect(-C, -C, LEN + 2 * C, WID + 2 * C);
  const feltNoise = noiseCanvas(512, 256, 14, 14, 3, knobs.feltNoise);
  ctx.globalCompositeOperation = "overlay";
  ctx.drawImage(feltNoise, 0, 0, LEN, WID);
  ctx.globalCompositeOperation = "source-over";
  // Тень от бортов: внутреннее свечение по контуру поля (follows фаски и проёмы).
  // Размытие через shadowBlur: мягкий переход вместо плоской полосы.
  ctx.drawImage(shadowSprite(ring), -C, -C, LEN + 2 * C, WID + 2 * C);
  ctx.restore();

  // 4. Отверстия: поверх сукна и дерева, но не поверх борта (губы целые).
  for (const p of pockets) drawHole(p);

  // 5. Хром: кольцо снаружи пера, торцы упираются в губы.
  for (const p of pockets) drawChrome(p);

  // 6. Набойки по центру дерева.
  const mid = (R - C) / 2 + C;
  ctx.fillStyle = "#c9a45c";
  const pin = (x: number, y: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y - 12);
    ctx.lineTo(x + 7, y);
    ctx.lineTo(x, y + 12);
    ctx.lineTo(x - 7, y);
    ctx.closePath();
    ctx.fill();
  };
  for (let k = 1; k <= 7; k += 1) {
    if (k === 4) continue;
    const x = (k / 8) * LEN;
    pin(x, -mid);
    pin(x, WID + mid);
  }
  for (let k = 1; k <= 3; k += 1) {
    const y = (k / 4) * WID;
    pin(-mid, y);
    pin(LEN + mid, y);
  }

  // 7. Шары для ориентира.
  const balls: Array<[number, number, string, number]> = [
    [LEN * 0.25, WID * 0.5, "#f4f4f0", 0],
    [LEN * 0.7, WID * 0.4, "#1f5fd6", 2],
    [LEN * 0.72, WID * 0.55, "#d32f2f", 3],
    [LEN * 0.5, WID * 0.5, "#1a1a1a", 8],
  ];
  const BR = 28.6;
  for (const [x, y, color, id] of balls) {
    const sh = ctx.createRadialGradient(x + 10, y + 12, BR * 0.5, x + 10, y + 12, BR * 1.25);
    sh.addColorStop(0, `rgba(0,0,0,${knobs.ballShadow})`);
    sh.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(x + 10, y + 12, BR * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x - BR, y - BR, 2 * BR, 2 * BR);
    const hl = ctx.createRadialGradient(x - BR * 0.35, y - BR * 0.4, 0, x - BR * 0.35, y - BR * 0.4, BR * 1.1);
    hl.addColorStop(0, "rgba(255,255,255,0.75)");
    hl.addColorStop(0.35, "rgba(255,255,255,0.12)");
    hl.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hl;
    ctx.fillRect(x - BR, y - BR, 2 * BR, 2 * BR);
    ctx.restore();
    if (id > 0) {
      ctx.beginPath();
      ctx.arc(x, y, BR * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = "#f8f8f4";
      ctx.fill();
      ctx.fillStyle = "#101010";
      ctx.font = `bold ${BR * 0.8}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(id), x, y);
    }
  }

  if (showPhysics) drawPhysicsOverlay(ring, pockets, scale * view.z);

  ctx.restore();

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, `rgba(0,0,0,${knobs.vignette})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  const c0 = pockets.find((p) => p.corner)!;
  info.textContent = `угловой проём ${c0.mouthLen.toFixed(1)} мм (эталон ${knobs.cornerMouthMm}), `
    + `вынос щеки a=${a.toFixed(1)} мм, центр угла глубже проёма на ${knobs.cornerDepthMm} мм`;
}

function draw(): void {
  woodCache.clear();
  drawTable();
  zoomOut.textContent = `зум ${view.z.toFixed(2)}×`;
}

const panel = document.getElementById("panel")!;
const info = document.createElement("div");
info.style.color = "#9cf";
info.style.maxWidth = "260px";
panel.append(info);

const zoomOut = document.createElement("div");
zoomOut.style.color = "#9cf";
const resetBtn = document.createElement("button");
resetBtn.textContent = "сброс вида";
resetBtn.addEventListener("click", () => {
  view.z = 1;
  view.px = 0;
  view.py = 0;
  draw();
});
const hint = document.createElement("div");
hint.textContent = "колесо — зум у курсора, перетаскивание — сдвиг";
panel.append(zoomOut, resetBtn, hint);

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const my = ((e.clientY - rect.top) * canvas.height) / rect.height;
    const f = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const z = Math.min(30, Math.max(0.5, view.z * f));
    const k = z / view.z;
    view.px = mx - (mx - view.px) * k;
    view.py = my - (my - view.py) * k;
    view.z = z;
    draw();
  },
  { passive: false },
);

let drag: { x: number; y: number } | null = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!drag) return;
  const rect = canvas.getBoundingClientRect();
  const k = canvas.width / rect.width;
  view.px += (e.clientX - drag.x) * k;
  view.py += (e.clientY - drag.y) * k;
  drag = { x: e.clientX, y: e.clientY };
  draw();
});
canvas.addEventListener("pointerup", () => {
  drag = null;
});

const physLabel = document.createElement("label");
const physBox = document.createElement("input");
physBox.type = "checkbox";
physBox.checked = showPhysics;
physBox.addEventListener("change", () => {
  showPhysics = physBox.checked;
  draw();
});
physLabel.append(physBox, " показать физику");
panel.append(physLabel);

for (const key of Object.keys(knobs) as Array<keyof Knobs>) {
  const label = document.createElement("label");
  const out = document.createElement("output");
  const input = document.createElement("input");
  input.type = "range";
  input.min = "0";
  input.max = "160";
  input.step = "1";
  input.value = String(knobs[key]);
  if (key.includes("Noise") || key === "ballShadow" || key === "vignette" || key === "shadowAlpha") {
    input.max = "1";
    input.step = "0.01";
  }
  out.textContent = `${key} = ${knobs[key]}`;
  input.addEventListener("input", () => {
    knobs[key] = Number(input.value);
    out.textContent = `${key} = ${input.value}`;
    draw();
  });
  label.append(out, input);
  panel.append(label);
}

// Параметры адреса для скриншотов: ?phys=0 — без физики; ?z=8&cx=0&cy=0 — зум в точку стола (мм).
{
  const q = new URLSearchParams(location.search);
  if (q.get("phys") === "0") {
    showPhysics = false;
    physBox.checked = false;
  }
  const z = Number(q.get("z"));
  if (z > 0) {
    const R = knobs.railMm;
    const outerW = LEN + 2 * R;
    const outerH = WID + 2 * R;
    const scale = Math.min((canvas.width - 80) / outerW, (canvas.height - 80) / outerH);
    const ox = (canvas.width - outerW * scale) / 2 + R * scale;
    const oy = (canvas.height - outerH * scale) / 2 + R * scale;
    const sx = ox + Number(q.get("cx") ?? 0) * scale;
    const sy = oy + Number(q.get("cy") ?? 0) * scale;
    view.z = z;
    view.px = canvas.width / 2 - sx * z;
    view.py = canvas.height / 2 - sy * z;
  }
}
draw();
