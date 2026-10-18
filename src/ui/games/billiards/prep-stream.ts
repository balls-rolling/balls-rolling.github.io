// Поток подготовки (02-e): коалессер «последнее значение» с инжектируемыми
// часами. Модуль без Vue и DOM — прогоняется в node-тестах.
//
// Первое значение уходит сразу (контролл отзывается без debounce-паузы, урок
// `ui-behavior` п.9), частые изменения коалесцируются до одного кадра за
// интервал (~33 мс, ~30/с) — уходит последнее значение.

/** Кадр подготовки: угол, сила и позиция битка соперника. */
export interface PrepFrame {
  readonly angle: number | null;
  readonly power: number;
  readonly cue: { readonly x: number; readonly y: number } | null;
}

/** Часы и планировщик: инжектируются для детерминированных тестов. */
export interface PrepClock {
  now(): number;
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(handle: unknown): void;
}

/** Системные часы — умолчание для боевого кода. */
export const systemClock: PrepClock = {
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface PrepStream {
  /** Кадр подготовки: первое значение — сразу, частые — коалесцируются. */
  push(frame: PrepFrame): void;
  /** Гейт: `false` — поток молчит (реплей/плашка/чужой ход/финал/нет сети). */
  setEnabled(on: boolean): void;
  /** Сброс (detach): отменить хвост и состояние. */
  reset(): void;
}

/**
 * Разобрать непрозрачный `p` сообщения `prep`; мусор — `null`. Кадр — часть
 * вида, поэтому битые поля просто отбрасываем, не роняя поток.
 */
export function parsePrepFrame(p: unknown): PrepFrame | null {
  if (typeof p !== "object" || p === null || Array.isArray(p)) return null;
  const data = p as Record<string, unknown>;
  const angle = data.angle;
  const power = data.power;
  if (angle !== null && (typeof angle !== "number" || !Number.isFinite(angle))) return null;
  if (typeof power !== "number" || !Number.isFinite(power)) return null;
  let cue: { x: number; y: number } | null = null;
  const raw = data.cue;
  if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) {
    const c = raw as Record<string, unknown>;
    if (typeof c.x === "number" && typeof c.y === "number") cue = { x: c.x, y: c.y };
  }
  return { angle, power, cue };
}

export function createPrepStream(
  send: (frame: PrepFrame) => void,
  clock: PrepClock = systemClock,
  intervalMs = 33,
): PrepStream {
  let enabled = true;
  let lastSentAt = -Infinity;
  let pending: PrepFrame | null = null;
  let timer: unknown = null;

  function clearTimer(): void {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  }

  function flush(): void {
    timer = null;
    const frame = pending;
    pending = null;
    if (!enabled || !frame) return;
    lastSentAt = clock.now();
    send(frame);
  }

  function push(frame: PrepFrame): void {
    if (!enabled) return;
    const now = clock.now();
    if (now - lastSentAt >= intervalMs) {
      // Пауза прошла — отправляем сразу, хвост не ждём.
      clearTimer();
      pending = null;
      lastSentAt = now;
      send(frame);
      return;
    }
    // Внутри интервала: храним последнее значение, хвост — по таймеру.
    pending = frame;
    if (timer === null) {
      timer = clock.setTimeout(flush, intervalMs - (now - lastSentAt));
    }
  }

  function setEnabled(on: boolean): void {
    enabled = on;
    if (!on) {
      clearTimer();
      pending = null;
    }
  }

  function reset(): void {
    clearTimer();
    pending = null;
    enabled = true;
    lastSentAt = -Infinity;
  }

  return { push, setEnabled, reset };
}
