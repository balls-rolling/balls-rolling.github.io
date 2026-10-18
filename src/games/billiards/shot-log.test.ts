import { describe, expect, it } from "vitest";
import { BALL_RADIUS } from "./constants";
import { buildTableGeometry, type TableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import { applyShot, applyShotWithLog, simulateToRestWithLog } from "./physics";
import { createInitialState, type BallState, type BilliardsState } from "./state";

/** Геометрия режима 8-ball: та же, что строит игра. */
const G: TableGeometry = buildTableGeometry(BASE_8BALL);

interface BallInput {
  id: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  active?: boolean;
}

function makeState(balls: readonly BallInput[]): BilliardsState {
  return {
    ...createInitialState(BASE_8BALL, ["p1"], 1),
    balls: balls.map(
      (b): BallState => ({
        id: b.id,
        x: b.x,
        y: b.y,
        vx: b.vx ?? 0,
        vy: b.vy ?? 0,
        spin: { x: 0, y: 0, z: 0 },
        active: b.active ?? true,
      }),
    ),
  };
}

describe("журнал удара", () => {
  it("двойной прогон одного удара даёт побайтово равный лог", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 900, y: 600 },
      { id: 2, x: 950, y: 700 },
      { id: 3, x: 1200, y: 635 },
    ]);
    const shot = { angle: 0.4, power: 0.5 };
    const first = applyShotWithLog(state, shot, G);
    const second = applyShotWithLog(state, shot, G);
    expect(JSON.stringify(second.log)).toBe(JSON.stringify(first.log));
    expect(second.log).toEqual(first.log);
  });

  it("журнал не меняет физику: состояние совпадает с прогоном без журнала", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 900, y: 635 },
    ]);
    const shot = { angle: 0, power: 0.6 };
    expect(applyShotWithLog(state, shot, G).state).toEqual(applyShot(state, shot, G));
  });

  it("первый контакт различим: свой/чужой/8/нет", () => {
    const aim = { angle: 0, power: 0.6 };
    const own = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 3, x: 900, y: 635 },
    ]);
    expect(applyShotWithLog(own, aim, G).log.firstContactId).toBe(3);
    const eight = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 8, x: 900, y: 635 },
    ]);
    expect(applyShotWithLog(eight, aim, G).log.firstContactId).toBe(8);
    const none = makeState([{ id: 0, x: 600, y: 635 }]);
    expect(applyShotWithLog(none, aim, G).log.firstContactId).toBeNull();
  });

  it("борт после контакта: был и не было", () => {
    // Сильный удар в шар у открытого поля: объектный шар долетает до борта.
    const hard = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 900, y: 635 },
    ]);
    const hardLog = applyShotWithLog(hard, { angle: 0, power: 0.6 }, G).log;
    expect(hardLog.firstContactId).toBe(1);
    expect(hardLog.railAfterContact).toBe(true);
    // Тихий тычок в соседний шар: всё встаёт далеко от бортов.
    const soft = makeState([
      { id: 0, x: 600, y: 635, vx: 400 },
      { id: 1, x: 700, y: 635 },
    ]);
    const softLog = simulateToRestWithLog(soft, G).log;
    expect(softLog.firstContactId).toBe(1);
    expect(softLog.railAfterContact).toBe(false);
  });

  it("борт без контакта не считается бортом после контакта", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const log = applyShotWithLog(state, { angle: -Math.PI / 2, power: 0.6 }, G).log;
    expect(log.firstContactId).toBeNull();
    expect(log.railAfterContact).toBe(false);
  });

  it("скрач: биток в лузе — первый в порядке забития", () => {
    const pocket = G.pockets[0]!;
    const state = makeState([
      {
        id: 0,
        x: pocket.center.x - pocket.outward.x * 60,
        y: pocket.center.y - pocket.outward.y * 60,
        vx: pocket.outward.x * 400,
        vy: pocket.outward.y * 400,
      },
    ]);
    const log = simulateToRestWithLog(state, G).log;
    expect(log.pocketedIds).toContain(0);
    expect(log.cueScratched).toBe(true);
  });

  it("обычный удар без луз: пустые списки забитых, скрача и вылетов", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 900, y: 635 },
    ]);
    const log = applyShotWithLog(state, { angle: 0, power: 0.05 }, G).log;
    expect(log.pocketedIds).toEqual([]);
    expect(log.cueScratched).toBe(false);
    expect(log.offTableIds).toEqual([]);
  });

  it("забитый чужой шар виден в порядке забития", () => {
    // Биток бьёт шар 1 в створ угловой лузы: шар падает, биток остаётся.
    const pocket = G.pockets[0]!;
    const along = { x: pocket.outward.x, y: pocket.outward.y };
    const targetX = pocket.center.x - along.x * (BALL_RADIUS * 4);
    const targetY = pocket.center.y - along.y * (BALL_RADIUS * 4);
    const state = makeState([
      { id: 0, x: targetX - along.x * 200, y: targetY - along.y * 200 },
      { id: 1, x: targetX, y: targetY },
    ]);
    const angle = Math.atan2(along.y, along.x);
    const log = applyShotWithLog(state, { angle, power: 0.3 }, G).log;
    expect(log.firstContactId).toBe(1);
    expect(log.pocketedIds[0]).toBe(1);
  });
});
