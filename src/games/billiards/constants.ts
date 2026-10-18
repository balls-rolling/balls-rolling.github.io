// Константы бильярда. Единицы — миллиметры, единственный источник чисел.
// Ядро чистое: только числа и данные, никакого DOM/Vue (см. requirements.md §4).

/** Длина игрового поля нос-к-носу, мм. */
export const TABLE_LENGTH = 2540;
/** Ширина игрового поля нос-к-носу, мм (ровно половина длины — 2:1). */
export const TABLE_WIDTH = 1270;

/** Диаметр шара, мм (2¼″). */
export const BALL_DIAMETER = 57.15;
/** Радиус шара, мм. */
export const BALL_RADIUS = BALL_DIAMETER / 2;
/** Масса шара, кг. */
export const BALL_MASS = 0.163;

/** Рейка: от носа до внешнего края, мм. Шире канона (101.6): дерево до края луз, хром выступает. */
export const RAIL_WIDTH = 130;
/** Подушка: от пера до носа, мм. */
export const CUSHION_WIDTH = 50.8;
/** Высота рейки, мм (63.5 % диаметра шара). */
export const RAIL_HEIGHT = 36.3;

/** Рот угловой лузы, мм (BCA 5″). */
export const CORNER_MOUTH = 127.0;
/** Рот боковой лузы, мм (BCA 5½″). */
export const SIDE_MOUTH = 139.7;
/** Насколько центр отверстия угловой лузы глубже линии проёма, мм (только рисунок). */
export const CORNER_DEPTH = 17;
/** Насколько центр отверстия боковой лузы глубже линии проёма, мм (только рисунок). */
export const SIDE_DEPTH = 12;

/** Головное пятно (здесь ставится биток), мм. */
export const HEAD_SPOT = { x: 0.25 * TABLE_LENGTH, y: 0.5 * TABLE_WIDTH } as const;
/** Центральное пятно, мм. */
export const CENTER_SPOT = { x: 0.5 * TABLE_LENGTH, y: 0.5 * TABLE_WIDTH } as const;
/** Пятно подставки (вершина пирамиды), мм. */
export const FOOT_SPOT = { x: 0.75 * TABLE_LENGTH, y: 0.5 * TABLE_WIDTH } as const;

/** Seed раскладки по умолчанию. Источник seed (сессия/сеть) — позже. */
export const DEFAULT_SEED = 1;

/** Спецификация цвета шара: hex-строка. */
export type BallColorSpec = string;

/** Палитра 16 шаров: 0 — биток, 1–7 сплошные, 8 чёрный, 9–15 полосатые. */
export const BALL_COLORS: readonly BallColorSpec[] = [
  "#f4f4f0", // 0 — биток
  "#f2c200", // 1
  "#1f5fd6", // 2
  "#d32f2f", // 3
  "#7b3fa0", // 4
  "#e87722", // 5
  "#2e9e4f", // 6
  "#8a2b2b", // 7
  "#1a1a1a", // 8
  "#f2c200", // 9
  "#1f5fd6", // 10
  "#d32f2f", // 11
  "#7b3fa0", // 12
  "#e87722", // 13
  "#2e9e4f", // 14
  "#8a2b2b", // 15
];

/** Цвет сукна (схема). */
export const FELT_COLOR = "#1b5e3c";
/** Цвет рейки (схема). */
export const RAIL_COLOR = "#4a2f1b";
/** Цвет фона вокруг стола (схема): тёмный, не в тон сукну. */
export const BACKDROP_COLOR = "#0b0f10";
/** Цвет разметки (схема). */
export const MARKING_COLOR = "#e8e8e8";

// --- Физика (фаза 03) ---

/** Ускорение свободного падения, мм/с². */
export const GRAVITY = 9810;
/** Фиксированный шаг физики, с. */
export const PHYS_DT = 1 / 240;
/** Коэффициент трения качения (безразмерный); замедление = MU_ROLL·G. */
export const MU_ROLL = 0.01;
/** Замедление качения, мм/с². */
export const ROLL_DECEL = MU_ROLL * GRAVITY;
/** Коэффициент трения скольжения сукна (Dr. Dave: 0.15–0.4, типично 0.2). */
export const MU_SLIDE = 0.2;
/** Скорость точки контакта ниже этой — шар катится (сухое трение держит), мм/с. */
export const ROLL_SNAP_SPEED = 25;
/** Затухание бокового вращения (ось z, нормаль стола), рад/с² (Dr. Dave: 5–15). */
export const SPIN_DECAY = 8;
/** Угловая скорость ниже этой — шар визуально стоит (покой включает спин), рад/с. */
export const SPIN_REST_SPEED = 0.5;
/** Зацеп борта за боковое вращение: доля wz·R, уходящая в касательную скорость. */
export const CUSHION_SPIN_GRAB = 0.25;
/** Сколько бокового вращения остаётся после контакта с бортом. */
export const CUSHION_SPIN_KEEP = 0.5;
/** Реституция при соударении шаров. */
export const E_BALL = 0.94;
/** Трение в контакте шар–шар (даёт срезку/бросок; Dr. Dave: 0.03–0.08). */
export const MU_BALL = 0.05;
/** Реституция при отскоке от носа (подушки). */
export const E_RAIL = 0.78;
/** Реституция при отскоке от облицовки лузы. */
export const E_FACING = 0.78;
/** Доля сохранённой касательной скорости у носа (борт цепляет: 0.78 вместо 0.9). */
export const TANG_KEEP_RAIL = 0.78;
/** Доля сохранённой касательной скорости у облицовки. */
export const TANG_KEEP_FACING = 0.7;
/** Порог скорости покоя, мм/с (ниже — шар останавливается). */
export const SLEEP_SPEED = 2;
/** Затягивание шара к проёму за линией горла, мм/с² (шар над лузой не застревает в зеве). */
export const POCKET_PULL = 2000;
/** Максимум субшагов на один шаг физики. */
export const SUBSTEP_CAP = 16;
/** Максимальное смещение за субшаг, доля радиуса (против туннелирования). */
export const SUBSTEP_TRAVEL_FRACTION = 0.5;
/** Допуск позиционной коррекции, мм. */
export const POS_SLOP = 0.01;
/** Доля расталкивания при перекрытии шаров. */
export const PUSH_FRACTION = 0.8;
/** Максимальная скорость удара, мм/с. */
export const MAX_SHOT_SPEED = 4000;
/** Предел симуляции одного удара до покоя, с (защита от зависания). */
export const MAX_SHOT_SECONDS = 30;
