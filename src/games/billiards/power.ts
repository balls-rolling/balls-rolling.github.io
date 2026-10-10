// Сила удара: чистые правила метра (без DOM), чтобы их тестировать юнитом.
// Колесо, клавиатура и перетаскивание в UI берут значения отсюда — поведение
// не расходится между способами ввода.

/** Минимальная и максимальная сила, проценты. */
export const POWER_MIN = 0;
export const POWER_MAX = 100;
/** Шаг стрелок и колеса; с Shift — крупный шаг клавиатуры. */
export const POWER_STEP = 1;
export const POWER_STEP_LARGE = 10;

/** Зажать силу в диапазон и округлить до целого процента. */
export function clampPower(value: number): number {
  return Math.min(POWER_MAX, Math.max(POWER_MIN, Math.round(value)));
}

/**
 * Сила по положению указателя на вертикальном метре: снизу 0, сверху 100.
 * Высота 0 или меньше — метр не разметён, сила не меняется (возвращает 0).
 */
export function powerFromY(clientY: number, top: number, height: number): number {
  if (height <= 0) return POWER_MIN;
  const fraction = Math.min(1, Math.max(0, 1 - (clientY - top) / height));
  return clampPower(fraction * POWER_MAX);
}

/**
 * Сила после клавиши. `null` — клавиша не относится к метру, её надо не трогать.
 * Стрелки вверх/вправо — прибавляют, влево/вниз — убавляют; Home/End — края.
 */
export function keyPower(current: number, key: string, shift: boolean): number | null {
  const step = shift ? POWER_STEP_LARGE : POWER_STEP;
  switch (key) {
    case "ArrowRight":
    case "ArrowUp":
      return clampPower(current + step);
    case "ArrowLeft":
    case "ArrowDown":
      return clampPower(current - step);
    case "Home":
      return POWER_MIN;
    case "End":
      return POWER_MAX;
    default:
      return null;
  }
}

/** Сила после прокрутки колеса: вверх — прибавить шаг, вниз — убавить. */
export function wheelPower(current: number, deltaY: number): number {
  const step = deltaY < 0 ? POWER_STEP : -POWER_STEP;
  return clampPower(current + step);
}
