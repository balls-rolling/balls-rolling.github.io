import { describe, expect, it } from "vitest";
import { createPrepStream, parsePrepFrame, type PrepClock, type PrepFrame } from "./prep-stream";

// Коалессер потока подготовки (02-e): первое значение — сразу, частые изменения —
// одним кадром за интервал, уходит последнее. Часы инжектируются.

class FakeClock implements PrepClock {
  time = 0;
  #next = 1;
  readonly #timers = new Map<number, { at: number; fn: () => void }>();

  now(): number {
    return this.time;
  }
  setTimeout(fn: () => void, delay: number): unknown {
    const id = this.#next++;
    this.#timers.set(id, { at: this.time + delay, fn });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.#timers.delete(handle as number);
  }
  /** Продвинуть время и выполнить все наступившие таймеры. */
  advance(ms: number): void {
    this.time += ms;
    let fired = true;
    while (fired) {
      fired = false;
      for (const [id, timer] of [...this.#timers]) {
        if (timer.at <= this.time) {
          this.#timers.delete(id);
          timer.fn();
          fired = true;
        }
      }
    }
  }
}

function frame(power: number): PrepFrame {
  return { angle: 1, power, cue: null };
}

describe("поток подготовки", () => {
  it("первое значение уходит сразу", () => {
    const clock = new FakeClock();
    const sent: PrepFrame[] = [];
    const stream = createPrepStream((f) => sent.push(f), clock);
    stream.push(frame(0.1));
    expect(sent).toEqual([frame(0.1)]);
  });

  it("серия изменений за <33 мс даёт одно отправление с последним значением", () => {
    const clock = new FakeClock();
    const sent: PrepFrame[] = [];
    const stream = createPrepStream((f) => sent.push(f), clock);
    stream.push(frame(0.1)); // сразу
    clock.advance(1);
    stream.push(frame(0.2));
    stream.push(frame(0.3));
    clock.advance(1);
    stream.push(frame(0.4)); // серия из трёх за <33 мс
    expect(sent).toEqual([frame(0.1)]);
    clock.advance(33);
    // Одно отправление хвоста — последнее значение серии.
    expect(sent).toEqual([frame(0.1), frame(0.4)]);
  });

  it("после паузы следующее значение уходит сразу", () => {
    const clock = new FakeClock();
    const sent: PrepFrame[] = [];
    const stream = createPrepStream((f) => sent.push(f), clock);
    stream.push(frame(0.1));
    clock.advance(100);
    stream.push(frame(0.5));
    expect(sent).toEqual([frame(0.1), frame(0.5)]);
  });

  it("гейт: выключенный поток молчит и не копит хвост", () => {
    const clock = new FakeClock();
    const sent: PrepFrame[] = [];
    const stream = createPrepStream((f) => sent.push(f), clock);
    stream.setEnabled(false);
    stream.push(frame(0.9));
    clock.advance(100);
    expect(sent).toEqual([]);
    // После включения поток снова отправляет.
    stream.setEnabled(true);
    stream.push(frame(0.2));
    expect(sent).toEqual([frame(0.2)]);
  });

  it("reset отменяет хвост", () => {
    const clock = new FakeClock();
    const sent: PrepFrame[] = [];
    const stream = createPrepStream((f) => sent.push(f), clock);
    stream.push(frame(0.1));
    clock.advance(1);
    stream.push(frame(0.2)); // хвост запланирован
    stream.reset();
    clock.advance(100);
    expect(sent).toEqual([frame(0.1)]);
  });
});

describe("разбор кадра подготовки", () => {
  it("принимает корректный кадр", () => {
    expect(parsePrepFrame({ angle: 1.5, power: 0.5, cue: { x: 3, y: 4 } })).toEqual({
      angle: 1.5,
      power: 0.5,
      cue: { x: 3, y: 4 },
    });
  });

  it("мусор отбрасывает молча", () => {
    expect(parsePrepFrame(null)).toBeNull();
    expect(parsePrepFrame(5)).toBeNull();
    expect(parsePrepFrame([1])).toBeNull();
    expect(parsePrepFrame({ power: "0.5" })).toBeNull();
    expect(parsePrepFrame({ angle: "1", power: 0.5 })).toBeNull();
    expect(parsePrepFrame({ power: Number.NaN })).toBeNull();
    // Биток битый — кадр без него (вид не роняем).
    expect(parsePrepFrame({ angle: 0, power: 0.5, cue: 5 })).toEqual({
      angle: 0,
      power: 0.5,
      cue: null,
    });
  });
});
