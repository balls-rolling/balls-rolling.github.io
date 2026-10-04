// Движок правил крестиков-ноликов: чистые функции без DOM.
// Координаты — целые числа бесконечного поля, ключи Set — строки "x,y".
// Длина победной линии — 5+ подряд от последнего хода. Порт `rules/engine.js`.

/** Длина победной линии. */
const WIN_LENGTH = 5;

/** Клетка бесконечного поля. */
export interface Cell {
  readonly x: number;
  readonly y: number;
}

/** Набор занятых клеток: один Set, список Set или объект с Set в значениях. */
export type SetSource =
  | ReadonlySet<string>
  | readonly ReadonlySet<string>[]
  | Readonly<Record<string, ReadonlySet<string>>>;

/** Четыре направления сканирования: горизонталь, вертикаль, две диагонали. */
const DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

/** Ключ клетки для хранения в Set. */
export function key(x: number, y: number): string {
  return `${x},${y}`;
}

/** Проверка целочисленности координат. */
function isCell(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y);
}

/** Привести аргумент к списку наборов. */
function asList(sets: SetSource): readonly ReadonlySet<string>[] {
  if (sets instanceof Set) return [sets];
  if (Array.isArray(sets)) return sets as readonly ReadonlySet<string>[];
  if (sets !== null && typeof sets === "object") {
    return Object.values(sets) as readonly ReadonlySet<string>[];
  }
  return [];
}

/** Клетка свободна, если координаты целые и ни один набор не содержит ключ. */
export function canPlace(sets: SetSource, x: number, y: number): boolean {
  if (!isCell(x, y)) return false;
  const k = key(x, y);
  return !asList(sets).some((set) => set.has(k));
}

/**
 * Поиск победы от последнего хода `(x, y)` в наборе текущего игрока.
 * Возврат: линия клеток длиной 5+ вдоль направления или `null`.
 */
export function findWin(set: ReadonlySet<string>, x: number, y: number): Cell[] | null {
  if (!isCell(x, y)) return null;
  if (!set.has(key(x, y))) return null;

  for (const [dx, dy] of DIRECTIONS) {
    const line: Cell[] = [{ x, y }];
    // Отрицательное плечо: собираем от ближнего к дальнему, разворачиваем.
    const before: Cell[] = [];
    for (let i = 1; set.has(key(x - dx * i, y - dy * i)); i += 1) {
      before.push({ x: x - dx * i, y: y - dy * i });
    }
    before.reverse();
    // Положительное плечо.
    const after: Cell[] = [];
    for (let i = 1; set.has(key(x + dx * i, y + dy * i)); i += 1) {
      after.push({ x: x + dx * i, y: y + dy * i });
    }
    line.unshift(...before);
    line.push(...after);
    if (line.length >= WIN_LENGTH) return line;
  }
  return null;
}
