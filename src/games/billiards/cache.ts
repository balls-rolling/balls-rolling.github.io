// Кэш статичного слоя бильярда (стол) и слоя шаров. Ключ — сигнатура режима,
// размер кадра, DPR и параметры fit; новый ключ = перерисовка один раз.
// Смена режима может дать другой ключ при том же размере — тогда слой
// перестраивается. Явный сброс (`resetTableCache`/`resetBallCache`) нужен,
// чтобы смена режима не отдала старый слой, даже если ключ совпал.
// Холсты отдельных шаров кэширует ball-art.ts.

let layer: { readonly key: string; readonly canvas: HTMLCanvasElement } | null = null;
let balls: { readonly key: string; readonly canvas: HTMLCanvasElement } | null = null;

/** Статичный слой: строится, только если ключ сменился. */
export function getStaticLayer(key: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
  if (layer === null || layer.key !== key) layer = { key, canvas: build() };
  return layer.canvas;
}

/** Слой неподвижных шаров для кадров прицеливания. */
export function getBallLayer(key: string, build: () => HTMLCanvasElement): HTMLCanvasElement {
  if (balls === null || balls.key !== key) balls = { key, canvas: build() };
  return balls.canvas;
}

/** Сбросить кэш статичного слоя стола (смена режима/геометрии). */
export function resetTableCache(): void {
  layer = null;
}

/** Сбросить кэш слоя шаров (смена режима). */
export function resetBallCache(): void {
  balls = null;
}
