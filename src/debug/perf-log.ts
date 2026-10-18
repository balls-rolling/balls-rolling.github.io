// Временный отладочный журнал производительности (прицел бильярда).
// Включено кодом на время отладки: `enabled = false` — полностью выключает.
// По окончании в консоли браузера вызвать `__aimDump()` — скачается aim-log.jsonl.

const CAP = 400000;
const buffer: Record<string, unknown>[] = [];

const enabled = false;

const round = (v: number): number => Math.round(v * 100) / 100;

/** Записать событие (ничего не делает, если журнал выключен). */
export function aimLog(kind: string, data: Record<string, unknown> = {}): void {
  if (!enabled) return;
  if (buffer.length >= CAP) buffer.shift();
  buffer.push({ t: round(performance.now()), k: kind, ...data });
}

/** Текущее время для замеров; 0, если журнал выключен. */
export function aimNow(): number {
  return enabled ? performance.now() : 0;
}

/** Миллисекунды с момента `since`, округлённые. */
export function aimSince(since: number): number {
  return enabled ? round(performance.now() - since) : 0;
}

function dump(): number {
  const text = buffer.map((entry) => JSON.stringify(entry)).join("\n");
  const blob = new Blob([text], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "aim-log.jsonl";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return buffer.length;
}

if (enabled) {
  const w = window as unknown as Record<string, unknown>;
  w.__aimLog = buffer;
  w.__aimDump = dump;
  // Очистить журнал перед записью: `__aimReset()`, затем крутить, затем `__aimDump()`.
  w.__aimReset = (): void => {
    buffer.length = 0;
    aimLog("reset", { note: "начало записи" });
  };
  console.info("[aimdebug] журнал включён; по окончании вызови __aimDump()");

  // Зонд кадров: разрыв между requestAnimationFrame и итог раз в секунду.
  let last = performance.now();
  let frames = 0;
  let maxGap = 0;
  let sumGap = 0;
  let windowStart = last;
  const probe = (now: number): void => {
    const gap = now - last;
    last = now;
    frames += 1;
    sumGap += gap;
    if (gap > maxGap) maxGap = gap;
    if (gap > 24) aimLog("gap", { g: round(gap) });
    if (now - windowStart >= 1000) {
      aimLog("fps", { frames, avg: round(sumGap / frames), max: round(maxGap) });
      frames = 0;
      sumGap = 0;
      maxGap = 0;
      windowStart = now;
    }
    requestAnimationFrame(probe);
  };
  requestAnimationFrame(probe);

  // Длинные задачи основного потока и задержка обработки ввода.
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) aimLog("longtask", { d: round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* longtask недоступен */
  }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as PerformanceEventTiming[]) {
        if (e.name !== "pointermove") continue;
        aimLog("evt", {
          delay: round(e.processingStart - e.startTime),
          proc: round(e.processingEnd - e.processingStart),
          dur: round(e.duration),
        });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);
  } catch {
    /* event timing недоступен */
  }
}
