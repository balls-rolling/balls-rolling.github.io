// Мозг ИИ: чистые функции, эвристика вокруг камней. Порт `ai/brain.js`.
import { findWin, key, type Cell } from "./rules";

/** Вероятность ошибки по уровням: 0-й всегда дурачится, кроме победы. */
export const ERROR_BY_LEVEL = [1, 0.25, 0.15, 0.08, 0.05] as const;

/** Радиус поиска кандидатов вокруг камней. */
const RADIUS = 2;

/** Свободные клетки в радиусе `RADIUS` от камней. */
export function candidates(own: ReadonlySet<string>, opp: ReadonlySet<string>): Cell[] {
  const busy = new Set([...own, ...opp]);
  if (busy.size === 0) return [{ x: 0, y: 0 }];

  const out = new Map<string, Cell>();
  for (const k of busy) {
    const [x, y] = k.split(",").map(Number);
    for (let dx = -RADIUS; dx <= RADIUS; dx += 1) {
      for (let dy = -RADIUS; dy <= RADIUS; dy += 1) {
        if (!dx && !dy) continue;
        const kk = key(x! + dx, y! + dy);
        if (!busy.has(kk) && !out.has(kk)) out.set(kk, { x: x! + dx, y: y! + dy });
      }
    }
  }
  return [...out.values()];
}

const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Длина линии через клетку в направлении + число открытых концов. */
function through(
  own: ReadonlySet<string>,
  opp: ReadonlySet<string>,
  x: number,
  y: number,
  dx: number,
  dy: number,
): { n: number; open: number } {
  let n = 1;
  let open = 0;
  let i = 1;
  while (own.has(key(x + dx * i, y + dy * i))) {
    n += 1;
    i += 1;
  }
  if (!own.has(key(x + dx * i, y + dy * i)) && !opp.has(key(x + dx * i, y + dy * i))) open += 1;
  i = 1;
  while (own.has(key(x - dx * i, y - dy * i))) {
    n += 1;
    i += 1;
  }
  if (!own.has(key(x - dx * i, y - dy * i)) && !opp.has(key(x - dx * i, y - dy * i))) open += 1;
  return { n, open };
}

function dirScore(n: number, open: number): number {
  if (n >= 5) return 10_000_000;
  if (n === 4 && open === 2) return 1_000_000;
  if (n === 4 && open === 1) return 100_000;
  if (n === 3 && open === 2) return 10_000;
  if (n === 3 && open === 1) return 1_000;
  if (n === 2 && open === 2) return 200;
  return n * 10 + open;
}

/** Скоринг клетки: своя атака + почти равная защита. */
export function scoreCell(cell: Cell, own: ReadonlySet<string>, opp: ReadonlySet<string>): number {
  const { x, y } = cell;
  let att = 0;
  let def = 0;
  for (const [dx, dy] of DIRS) {
    const a = through(own, opp, x, y, dx, dy);
    att = Math.max(att, dirScore(a.n, a.open));
    const d = through(opp, own, x, y, dx, dy);
    def = Math.max(def, dirScore(d.n, d.open));
  }
  return att + def * 0.92;
}

/** Клетки, дающие немедленную победу. */
function winningCells(cands: readonly Cell[], own: ReadonlySet<string>): Cell[] {
  return cands.filter((c) => {
    const test = new Set(own);
    test.add(key(c.x, c.y));
    return findWin(test, c.x, c.y) !== null;
  });
}

/** Выбрать ход. `opts.missWin` — намеренно пропустить победу (демо ИИ vs ИИ). */
export function chooseMove(
  own: ReadonlySet<string>,
  opp: ReadonlySet<string>,
  level = 2,
  opts: { readonly missWin?: boolean } = {},
): Cell {
  const cands = candidates(own, opp);
  const wins = winningCells(cands, own);
  if (wins.length > 0 && !opts.missWin) return wins[0]!;

  const pool = opts.missWin
    ? cands.filter((c) => !wins.some((w) => w.x === c.x && w.y === c.y))
    : cands;
  if (level <= 0) {
    // Новичок: побеждает, но не защищается.
    const r = pool[Math.floor(Math.random() * pool.length)];
    return r ?? cands[0]!;
  }
  if (Math.random() < (ERROR_BY_LEVEL[level] ?? 0.1)) {
    return pool[Math.floor(Math.random() * pool.length)] ?? cands[0]!;
  }

  let best = pool[0]!;
  let bestScore = -Infinity;
  for (const c of pool) {
    const s = scoreCell(c, own, opp);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best ?? cands[0]!;
}
