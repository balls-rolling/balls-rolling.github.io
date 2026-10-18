import {
  isAtRest,
  previewAdvance,
  previewStart,
  type CuePreview,
  type PreviewSession,
} from "./physics";
import type { BilliardsState } from "./state";
import type { TableGeometry } from "./geometry";
import { aimLog } from "@/debug/perf-log";

export interface PreviewFrame {
  readonly current: CuePreview | null;
  readonly previous: CuePreview | null;
}

interface PreviewKey {
  readonly state: BilliardsState;
  readonly angle: number;
  readonly power: number;
  readonly revision: number;
}

interface CompletedPreview extends PreviewKey {
  readonly result: CuePreview;
}

interface RunningPreview extends PreviewKey {
  session: PreviewSession;
}

/** Управляет поколениями предпросмотра и постепенно досчитывает только актуальный запрос. */
export class AimPreviewController {
  #revision = 0;
  #completed: CompletedPreview | null = null;
  #running: RunningPreview | null = null;
  /** Есть запрос на расчёт, ещё не доведённый до актуального полного прогноза. */
  #pending = false;

  /** Любая будущая настройка удара (в том числе спин/угол) инвалидирует текущее поколение. */
  invalidate(): void {
    aimLog("inval", { rev: this.#revision + 1 });
    this.#revision += 1;
    this.#running = null;
    this.#pending = true;
  }

  /** Отменить только ожидающую/текущую работу, сохранив последний полный прогноз. */
  cancelPending(): void {
    this.#running = null;
    this.#pending = false;
  }

  /** Сбросить весь runtime preview при ударе, рестарте или смене состояния партии. */
  reset(): void {
    this.#revision += 1;
    this.#running = null;
    this.#completed = null;
    this.#pending = false;
  }

  hasPending(): boolean {
    return this.#pending || (this.#running !== null && !this.#running.session.done);
  }

  /**
   * Один вызов на кадр. Берёт только последние значения параметров: если они
   * изменились с прошлого кадра, перезапускает дешёвый просчёт (частые события
   * ввода объединяются по кадру). Пока параметры стабильны, бюджет растёт —
   * траектория уточняется вплоть до точной.
   */
  frame(state: BilliardsState, angle: number, power: number, geometry: TableGeometry): PreviewFrame {
    const t0 = performance.now();
    const out = this.#frameImpl(state, angle, power, geometry);
    aimLog("pv", {
      a: Math.round(angle * 1000) / 1000,
      p: Math.round(power * 1000) / 1000,
      rev: this.#revision,
      ms: Math.round((performance.now() - t0) * 100) / 100,
      cur: out.current
        ? { pts: out.current.path.length, complete: out.current.complete, hit: out.current.hitBallId }
        : null,
      prev: out.previous !== null,
    });
    return out;
  }

  #frameImpl(state: BilliardsState, angle: number, power: number, geometry: TableGeometry): PreviewFrame {
    if (!state.balls.some((ball) => ball.id === 0 && ball.active)) {
      this.reset();
      return { current: null, previous: null };
    }

    let completed = this.#completed;
    if (completed && completed.state !== state) {
      this.#completed = null;
      this.#running = null;
      completed = null;
    }
    if (
      completed &&
      completed.angle === angle &&
      completed.power === power &&
      completed.revision === this.#revision
    ) {
      this.#pending = false;
      return { current: completed.result, previous: null };
    }

    let running = this.#running;
    if (
      running &&
      (running.state !== state ||
        running.angle !== angle ||
        running.power !== power ||
        running.revision !== this.#revision)
    ) {
      this.#running = null;
      running = null;
    }

    if (!running) {
      running = {
        state,
        angle,
        power,
        revision: this.#revision,
        session: previewStart(state, { angle, power }, geometry),
      };
      this.#running = running;
    }

    // dt остаётся точным; растёт только число шагов за кадр. Первый кадр нового
    // поколения сразу даёт заметный отрезок, дальше бюджет плавно увеличивается.
    // На вводе важнее отзывчивый кадр, чем длинный первый preview. Последний
    // полный результат остаётся видимым, пока новое поколение уточняется малыми
    // порциями; при стабильном прицеле бюджет постепенно дорастает.
    // Первый кадр нового поколения досчитывает типичную траекторию целиком:
    // замер журнала — полный путь 105–240 шагов, один вызов ~1–3 мс. Частичная
    // линия при быстром вращении прицела и давала «не рисуется до остановки».
    const budget =
      running.session.steps === 0
        ? 512
        : Math.min(240, 128 + Math.floor(running.session.steps / 4));
    running.session = previewAdvance(running.session, { budgetSteps: budget });
    const result = this.#result(running.session);
    if (running.session.done) {
      this.#completed = { ...running, result };
      this.#running = null;
      this.#pending = false;
      return { current: result, previous: null };
    }
    return { current: result, previous: completed?.result ?? null };
  }

  #result(session: PreviewSession): CuePreview {
    const cue = session.state.balls.find((ball) => ball.id === 0);
    const rest =
      session.done && session.hitBallId === null && cue?.active && isAtRest(session.state)
        ? { x: cue.x, y: cue.y }
        : null;
    return {
      path: session.path,
      complete: session.done,
      hitBallId: session.hitBallId,
      contact: session.contact,
      rest,
    };
  }
}
