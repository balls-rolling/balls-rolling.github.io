// Ориентация шара для отрисовки. Физика считает угловую скорость (`spin` в
// состоянии); здесь она только накапливается в матрицу «текстура → мир»
// (x вправо, y вниз, z к зрителю). В состояние поза не входит: после загрузки
// партии шары встают номером к камере.

/** Матрица 3×3 по строкам. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number];

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Поза шара: позиция и ориентация. */
export interface RollPose {
  readonly x: number;
  readonly y: number;
  readonly rot: Mat3;
}

/** Скачок позиции больше этого за один кадр — не качение (новая партия, постановка битка). */
export const TELEPORT_MM = 150;

/** Применить матрицу к вектору. */
export function applyMat(m: Mat3, x: number, y: number, z: number): [number, number, number] {
  return [
    m[0] * x + m[1] * y + m[2] * z,
    m[3] * x + m[4] * y + m[5] * z,
    m[6] * x + m[7] * y + m[8] * z,
  ];
}

/** Поворот на `theta` вокруг единичной оси (формула Родрига). */
export function rotation(ax: number, ay: number, az: number, theta: number): Mat3 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;
  return [
    c + ax * ax * t,
    ax * ay * t - az * s,
    ax * az * t + ay * s,
    ay * ax * t + az * s,
    c + ay * ay * t,
    ay * az * t - ax * s,
    az * ax * t - ay * s,
    az * ay * t + ax * s,
    c + az * az * t,
  ];
}

function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) {
      out.push(a[r * 3]! * b[c]! + a[r * 3 + 1]! * b[3 + c]! + a[r * 3 + 2]! * b[6 + c]!);
    }
  }
  return out as unknown as Mat3;
}

/** Вернуть матрице ортонормальность (дрейф от накопления множества мелких поворотов). */
function orthonormalize(m: Mat3): Mat3 {
  let r0x = m[0];
  let r0y = m[1];
  let r0z = m[2];
  const l0 = Math.hypot(r0x, r0y, r0z) || 1;
  r0x /= l0;
  r0y /= l0;
  r0z /= l0;
  let r1x = m[3];
  let r1y = m[4];
  let r1z = m[5];
  const d = r1x * r0x + r1y * r0y + r1z * r0z;
  r1x -= d * r0x;
  r1y -= d * r0y;
  r1z -= d * r0z;
  const l1 = Math.hypot(r1x, r1y, r1z) || 1;
  r1x /= l1;
  r1y /= l1;
  r1z /= l1;
  const r2x = r0y * r1z - r0z * r1y;
  const r2y = r0z * r1x - r0x * r1z;
  const r2z = r0x * r1y - r0y * r1x;
  return [r0x, r0y, r0z, r1x, r1y, r1z, r2x, r2y, r2z];
}

const poses = new Map<number, RollPose>();

/**
 * Поза шара для кадра: только позиция. Ориентацию двигает `spinStep` из спина
 * физики; здесь она не трогается. Скачок позиции сбрасывает ориентацию.
 */
export function poseOf(id: number, x: number, y: number): RollPose {
  const prev = poses.get(id);
  if (prev === undefined) {
    const pose: RollPose = { x, y, rot: IDENTITY };
    poses.set(id, pose);
    return pose;
  }
  if (Math.hypot(x - prev.x, y - prev.y) > TELEPORT_MM) {
    const pose: RollPose = { x, y, rot: IDENTITY };
    poses.set(id, pose);
    return pose;
  }
  const pose: RollPose = { x, y, rot: prev.rot };
  poses.set(id, pose);
  return pose;
}

/** Провернуть позу шара на угловую скорость `spin` (рад/с) за время `dt` (с). */
export function spinStep(id: number, spin: { x: number; y: number; z: number }, dt: number): void {
  const speed = Math.hypot(spin.x, spin.y, spin.z);
  const pose = poses.get(id);
  if (!pose || speed <= 0 || dt <= 0) return;
  const delta = rotation(spin.x / speed, spin.y / speed, spin.z / speed, speed * dt);
  poses.set(id, { ...pose, rot: orthonormalize(multiply(delta, pose.rot)) });
}

/** Забыть позы шаров, которых нет на столе (забиты или сброшены). */
export function dropRollPoses(activeIds: ReadonlySet<number>): void {
  for (const id of poses.keys()) {
    if (!activeIds.has(id)) poses.delete(id);
  }
}

/** Сбросить все позы (новая партия). */
export function resetRollPoses(): void {
  poses.clear();
}
