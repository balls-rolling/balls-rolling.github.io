import { describe, expect, it } from "vitest";
import { BALL_RADIUS, PHYS_DT, SPIN_REST_SPEED, TABLE_LENGTH, TABLE_WIDTH } from "./constants";
import { buildTableGeometry, type TableGeometry } from "./geometry";
import { BASE_8BALL } from "./modes/base8ball";
import {
  applyShot,
  isAtRest,
  isValidShot,
  previewAdvance,
  previewCuePath,
  previewStart,
  PREVIEW_MAX_PATH_MM,
  PREVIEW_MAX_SECONDS,
  simulateToRest,
  step,
  strike,
  type PreviewOptions,
  type Shot,
} from "./physics";
import type { BallState, BilliardsState } from "./state";

/** Геометрия режима 8-ball: та же, что строит игра. */
const G: TableGeometry = buildTableGeometry(BASE_8BALL);

// Обёртки под новую сигнатуру ядра: подставляют фиксированную геометрию стенда.
const stepG = (state: BilliardsState, onBallContact?: (contact: unknown) => void): BilliardsState =>
  step(state, G, onBallContact);
const simulateToRestG = (state: BilliardsState, maxSeconds?: number): BilliardsState =>
  simulateToRest(state, G, maxSeconds);
const applyShotG = (state: BilliardsState, shot: Shot): BilliardsState => applyShot(state, shot, G);
const previewStartG = (state: BilliardsState, shot: Shot) => previewStart(state, shot, G);
const previewCuePathG = (state: BilliardsState, shot: Shot, options?: PreviewOptions) =>
  previewCuePath(state, shot, G, options);

interface BallInput {
  id: number;
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  spin?: { x: number; y: number; z: number };
  active?: boolean;
}

function makeState(balls: readonly BallInput[]): BilliardsState {
  const built: BallState[] = balls.map((b) => ({
    id: b.id,
    x: b.x,
    y: b.y,
    vx: b.vx ?? 0,
    vy: b.vy ?? 0,
    spin: b.spin ?? { x: 0, y: 0, z: 0 },
    active: b.active ?? true,
  }));
  return {
    version: 2,
    mode: "8ball",
    seed: 1,
    order: ["p1"],
    turn: 0,
    balls: built,
    finished: false,
    groups: null,
    rules: "simple",
    phase: "open",
    winner: null,
    finishReason: null,
    ballInHand: false,
    shotSeq: 0,
    turnReason: "initial",
    prep: { canPlaceCue: true, canChooseCueBall: false },
  };
}

describe("физика: движение и покой", () => {
  it("шар замедляется ровно до нуля", () => {
    const rest = simulateToRestG(makeState([{ id: 0, x: 600, y: 635, vx: 300, vy: 0 }]));
    expect(isAtRest(rest)).toBe(true);
    expect(rest.balls[0]?.vx).toBe(0);
    expect(Number.isFinite(rest.balls[0]?.x)).toBe(true);
  });

  it("покоящийся шар остаётся на месте", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    expect(stepG(state)).toEqual(state);
  });

  it("детерминизм: один и тот же удар дважды даёт одно состояние", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const shot = { angle: 0.4, power: 0.5 };
    expect(applyShotG(state, shot)).toEqual(applyShotG(state, shot));
  });

  it("повторный прогон идентичен", () => {
    const state = makeState([{ id: 0, x: 600, y: 635, vx: 400 }]);
    let a = state;
    for (let i = 0; i < 50; i += 1) a = stepG(a);
    let b = state;
    for (let i = 0; i < 50; i += 1) b = stepG(b);
    expect(a).toEqual(b);
  });

  it("callback столкновения не меняет результат шага", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 400 },
      { id: 1, x: 700, y: 635 },
    ]);
    let plain = state;
    for (let i = 0; i < 120; i += 1) plain = stepG(plain);
    let withCb = state;
    let contacts = 0;
    for (let i = 0; i < 120; i += 1) {
      withCb = step(withCb, G, () => {
        contacts += 1;
      });
    }
    expect(withCb).toEqual(plain);
    expect(contacts).toBeGreaterThan(0);
  });
});

describe("физика: соударения", () => {
  it("лимиты предпросмотра: 1 секунда и 2.5 длины стола", () => {
    expect(PREVIEW_MAX_SECONDS).toBe(1);
    expect(PREVIEW_MAX_PATH_MM).toBe(2.5 * TABLE_LENGTH);
  });

  it("шар отражается от носа с потерей нормальной скорости", () => {
    const state = makeState([{ id: 0, x: 600, y: BALL_RADIUS - 0.5, vy: -200 }]);
    const next = stepG(state);
    expect(next.balls[0]?.vy).toBeGreaterThan(0);
    expect(Math.abs(next.balls[0]?.vy ?? 0)).toBeLessThan(200);
    expect(next.balls[0]?.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("центральный удар шар-шар передаёт скорость", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 500 },
      { id: 1, x: 600 + 2 * BALL_RADIUS + 2, y: 635 },
    ]);
    const next = stepG(state);
    expect(next.balls[1]?.vx).toBeGreaterThan(0);
    expect(next.balls[0]?.vx).toBeLessThan(500);
  });

  it("быстрый шар не проваливается сквозь нос", () => {
    const state = makeState([{ id: 0, x: 600, y: BALL_RADIUS + 2, vy: -6000 }]);
    const next = stepG(state);
    expect(next.balls[0]?.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("соударение шар-шар гасит касательное движение (нет «льда»)", () => {
    // Резка: биток идёт вдоль x, чужой шар смещён по y — после контакта
    // относительная касательная скорость меньше, чем до него.
    const before = makeState([
      { id: 0, x: 600, y: 635, vx: 500 },
      { id: 1, x: 600 + 2 * BALL_RADIUS - 4, y: 635 + BALL_RADIUS },
    ]);
    const relBefore = Math.abs(before.balls[1]!.vx - before.balls[0]!.vx);
    const after = simulateToRestG(before);
    const [a, b] = [after.balls[0]!, after.balls[1]!];
    expect(Math.abs(b.vx - a.vx)).toBeLessThan(relBefore);
    // Но чужой шар уходит вперёд, а не стоит: импульс по нормали цел.
    expect(b.x).toBeGreaterThan(600 + 2 * BALL_RADIUS - 4);
  });

  it("борт цепляет: касательная скорость падает сильнее, чем на 10%", () => {
    let current = makeState([{ id: 0, x: 600, y: BALL_RADIUS + 1, vx: 600, vy: -300 }]);
    for (let i = 0; i < 5; i += 1) current = stepG(current);
    expect(Math.abs(current.balls[0]?.vx ?? 600)).toBeLessThan(600 * 0.85);
  });

  it("скольжение переходит в качение: спин догоняет скорость", () => {
    // Биток после удара стартует без вращения; трение сукна докручивает его.
    let current = makeState([{ id: 0, x: 600, y: 635, vx: 2000 }]);
    for (let i = 0; i < 120; i += 1) current = stepG(current);
    const b = current.balls[0]!;
    expect(b.vx).toBeGreaterThan(0);
    // Поверхность почти не скользит: wy ≈ vx/R.
    expect(Math.abs(b.spin.y - b.vx / BALL_RADIUS)).toBeLessThan(
      Math.abs(b.vx / BALL_RADIUS) * 0.1 + 1,
    );
  });

  it("боковое вращение затухает", () => {
    let current = makeState([{ id: 0, x: 600, y: 635, spin: { x: 0, y: 0, z: 10 } }]);
    for (let i = 0; i < 600; i += 1) current = stepG(current);
    expect(Math.abs(current.balls[0]!.spin.z)).toBeLessThan(1);
  });

  it("чистый винт на месте — не покой: виден, пока не погаснет", () => {
    const spinning = makeState([{ id: 0, x: 600, y: 635, spin: { x: 0, y: 0, z: 10 } }]);
    expect(isAtRest(spinning)).toBe(false);
    const rest = simulateToRestG(spinning);
    expect(isAtRest(rest)).toBe(true);
    // Покой — винт ниже порога видимости, а не обязательно ноль.
    expect(Math.abs(rest.balls[0]?.spin.z ?? 1)).toBeLessThan(SPIN_REST_SPEED);
  });

  it("стан в лоб с короткой дистанции — стоп-шот: биток встаёт", () => {
    // Скользящий биток без наката в полный шар: после контакта почти вся
    // скорость уходит в чужой шар, наката нет — биток остаётся у точки контакта.
    const contactX = 600 + 2 * BALL_RADIUS - 2;
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 1500 },
      { id: 1, x: contactX, y: 635 },
    ]);
    const rest = simulateToRestG(state);
    expect(rest.balls[0]?.active).toBe(true);
    expect(Math.abs((rest.balls[0]?.x ?? 0) - contactX)).toBeLessThan(2 * BALL_RADIUS);
    expect(rest.balls[1]?.x ?? 0).toBeGreaterThan(contactX + 500);
  });

  it("накат: катящийся биток после прямого удара идёт вперёд", () => {
    // Биток уже катится (спин соответствует скорости): после контакта верхний
    // винт тянет его вперёд за точку контакта.
    const contactX = 600 + 2 * BALL_RADIUS - 2;
    const rollingSpin = 800 / BALL_RADIUS;
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 800, spin: { x: 0, y: rollingSpin, z: 0 } },
      { id: 1, x: contactX, y: 635 },
    ]);
    const rest = simulateToRestG(state);
    expect(rest.balls[0]?.active).toBe(true);
    expect(rest.balls[0]?.x ?? 0).toBeGreaterThan(contactX);
  });

  it("борт с боковым вращением: винт меняет касательную скорость", () => {
    const run = (wz: number): number => {
      let current = makeState([
        { id: 0, x: 600, y: BALL_RADIUS + 1, vx: 600, vy: -300, spin: { x: 0, y: 0, z: wz } },
      ]);
      for (let i = 0; i < 10; i += 1) current = stepG(current);
      return current.balls[0]?.vx ?? 0;
    };
    // Верхний борт, винт wz>0 тянет поверхность назад: касательная меньше, чем без винта.
    expect(run(30)).toBeLessThan(run(0));
  });

  it("скольжение гасится на порядок быстрее качения", () => {
    // 3000 мм/с — глубокое скольжение (μs), 20 мм/с со спином 0 — почти качение.
    const fast = makeState([{ id: 0, x: 600, y: 635, vx: 3000 }]);
    const slow = makeState([{ id: 0, x: 600, y: 635, vx: 20 }]);
    const fastDrop = 3000 - Math.hypot(stepG(fast).balls[0]!.vx, stepG(fast).balls[0]!.vy);
    const slowDrop = 20 - Math.hypot(stepG(slow).balls[0]!.vx, stepG(slow).balls[0]!.vy);
    expect(fastDrop).toBeGreaterThan(slowDrop * 10);
  });

  it("предпросмотр короткий: путь в поле, покой только при коротком ходе", () => {
    const tableLength = 2 * TABLE_WIDTH;
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    // Медленный удар: успевает остановиться в пределах лимита — точка покоя есть.
    const preview = previewCuePathG(state, { angle: 0, power: 0.05 }, { maxSeconds: 4 });
    expect(preview.rest).not.toBeNull();
    expect(preview.hitBallId).toBeNull();
    for (const p of preview.path) {
      expect(p.x).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
      expect(p.x).toBeLessThanOrEqual(tableLength - BALL_RADIUS + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
      expect(p.y).toBeLessThanOrEqual(TABLE_WIDTH - BALL_RADIUS + 0.001);
    }
  });

  it("предпросмотр обрывается на первом шаре: короткий и с его id", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 3, x: 900, y: 635 },
    ]);
    const preview = previewCuePathG(state, { angle: 0, power: 0.6 });
    expect(preview.hitBallId).toBe(3);
    expect(preview.contact?.ballId).toBe(3);
    // Конец пути — у чужого шара (в пределах суммы радиусов), а не у покоя.
    const last = preview.path[preview.path.length - 1]!;
    expect(Math.hypot(last.x - 900, last.y - 635)).toBeLessThanOrEqual(2 * BALL_RADIUS + 1);
    expect(preview.rest).toBeNull();
  });

  it("предпросмотр фиксирует первое столкновение внутри физического шага", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 3, x: 900, y: 635 },
    ]);
    let session = previewStartG(state, { angle: 0, power: 0.6 });
    while (!session.done) session = previewAdvance(session, { budgetSteps: 240 });

    expect(session.contact?.ballId).toBe(3);
    // Контакт фиксируется внутри resolvePairs, а не ищется только по уже
    // разрешённым позициям после полного шага.
    expect(session.path.at(-1)).toEqual(session.contact?.cuePoint);
    expect(session.contact?.targetVelocity.x).toBeGreaterThan(0);
  });

  it("предпросмотр прекращается при покое, времени и точной длине пути", () => {
    const slow = previewCuePathG(
      makeState([{ id: 0, x: 600, y: 635 }]),
      { angle: 0, power: 0.05 },
      { maxSeconds: 4 },
    );
    expect(slow.rest).not.toBeNull();

    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    let timed = previewStartG(state, { angle: 0, power: 0.6 });
    while (!timed.done) {
      timed = previewAdvance(timed, { maxSeconds: 0.02, maxPathMm: Infinity, budgetSteps: 240 });
    }
    expect(timed.steps).toBe(Math.ceil(0.02 / PHYS_DT));
    expect(timed.contact).toBeNull();

    let defaultTime = previewStartG(state, { angle: 0, power: 1 });
    while (!defaultTime.done) {
      defaultTime = previewAdvance(defaultTime, { maxPathMm: Infinity, budgetSteps: 240 });
    }
    expect(defaultTime.steps).toBe(Math.ceil(PREVIEW_MAX_SECONDS / PHYS_DT));

    let distance = previewStartG(state, { angle: 0, power: 1 });
    while (!distance.done) {
      distance = previewAdvance(distance, { maxSeconds: 10, maxPathMm: 120, budgetSteps: 240 });
    }
    expect(distance.travelled).toBe(120);
    expect(distance.path.at(-1)?.x).toBeCloseTo(720, 3);
  });

  it("предпросмотр идёт в направлении удара", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const shot = { angle: 0.6, power: 0.6 };
    const preview = previewCuePathG(state, shot);
    // Направление на первом участке совпадает с углом удара.
    const a = preview.path[0]!;
    const b = preview.path[1]!;
    expect(Math.atan2(b.y - a.y, b.x - a.x)).toBeCloseTo(shot.angle, 2);
    // И совпадает с реальной начальной скоростью битка.
    const start = strike(state, shot);
    const cue = start.balls.find((x) => x.id === 0)!;
    expect(Math.atan2(cue.vy, cue.vx)).toBeCloseTo(shot.angle, 6);
    expect(b.x).toBeGreaterThan(a.x);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("предпросмотр уточняется порциями: бюджет не завершает длинный путь сразу", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const shot = { angle: 0, power: 1 };
    let session = previewStartG(state, shot);
    expect(session.done).toBe(false);
    // Одна маленькая порция — путь ещё не полный, но уже не пустой.
    session = previewAdvance(session, { budgetSteps: 8 });
    expect(session.path.length).toBeGreaterThan(1);
    // Досчитываем до конца — путь удлиняется, а не начинается заново.
    const shorter = session.path.length;
    while (!session.done) session = previewAdvance(session, { budgetSteps: 200 });
    expect(session.path.length).toBeGreaterThanOrEqual(shorter);
    expect(session.done).toBe(true);
  });
});

describe("физика: лузы", () => {
  it("шар за линией проёма в зеве — забит", () => {
    const state = makeState([{ id: 0, x: -20, y: -20 }]);
    expect(stepG(state).balls[0]?.active).toBe(false);
  });

  it("шар между горлом и проёмом затягивается и не застревает в зеве", () => {
    let current = makeState([{ id: 0, x: -5, y: 16 }]);
    for (let i = 0; i < 240 && current.balls[0]?.active; i += 1) current = stepG(current);
    expect(current.balls[0]?.active).toBe(false);
  });

  it("шар в поле у линии рта — не забит", () => {
    const state = makeState([{ id: 0, x: 105, y: 105 }]);
    expect(stepG(state).balls[0]?.active).toBe(true);
  });

  it("шар вдоль длинного борта мимо боковой лузы не падает", () => {
    const state = makeState([{ id: 0, x: 1270, y: BALL_RADIUS, vx: 300 }]);
    let current = state;
    for (let i = 0; i < 30; i += 1) current = stepG(current);
    expect(current.balls[0]?.active).toBe(true);
  });

  it("шар у щеки (фаски) отражается в поле, а не проваливается", () => {
    // Контакт по нормали фаски: шар подкатывается к щеке, отскакивает обратно
    // в поле и теряет скорость. Проверяются все 12 щёк (по две на лузу).
    for (const pocket of G.pockets) {
      const facings = G.segments.filter(
        (segment) => segment.kind === "facing" && segment.pocketId === pocket.id,
      );
      expect(facings).toHaveLength(2);
      for (const facing of facings) {
        const midX = (facing.a.x + facing.b.x) / 2;
        const midY = (facing.a.y + facing.b.y) / 2;
        const n = facing.normal;
        const speed = 100;
        const next = stepG(
          makeState([
            {
              id: 0,
              x: midX + n.x * (BALL_RADIUS - 1),
              y: midY + n.y * (BALL_RADIUS - 1),
              vx: -n.x * speed,
              vy: -n.y * speed,
            },
          ]),
        );
        const ball = next.balls[0]!;
        expect(ball.active).toBe(true);
        // Нормальная составляющая сменила знак — отражение от щеки.
        expect(ball.vx * n.x + ball.vy * n.y).toBeGreaterThan(0);
        expect(Math.hypot(ball.vx, ball.vy)).toBeLessThan(speed);
      }
    }
  });

  it("все 6 луз глотают лобовой шар", () => {
    // Регрессия V1 (фаза 02-a): задние кромки отбивали шар раньше линии.
    for (const pocket of G.pockets) {
      const L = 60;
      const state = makeState([
        {
          id: 0,
          x: pocket.center.x - pocket.outward.x * L,
          y: pocket.center.y - pocket.outward.y * L,
          vx: pocket.outward.x * 400,
          vy: pocket.outward.y * 400,
        },
      ]);
      expect(simulateToRestG(state).balls[0]?.active).toBe(false);
    }
  });
});

describe("физика: удар", () => {
  it("невалидный удар отклоняется и не меняет состояние", () => {
    expect(isValidShot({ angle: 0, power: 2 })).toBe(false);
    expect(isValidShot({ angle: Number.NaN, power: 0.5 })).toBe(false);
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    expect(strike(state, { angle: 0, power: 2 })).toEqual(state);
  });

  it("удар задаёт скорость битка и приводит к покою", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const next = applyShotG(state, { angle: 0, power: 0.2 });
    expect(next.balls[0]?.x).not.toBe(600);
    expect(isAtRest(next)).toBe(true);
  });

  it("разные удары дают разные траектории", () => {
    const state = makeState([{ id: 0, x: 600, y: 635 }]);
    const right = applyShotG(state, { angle: 0, power: 0.2 }).balls[0]?.x ?? 0;
    const left = applyShotG(state, { angle: Math.PI, power: 0.2 }).balls[0]?.x ?? 0;
    expect(right).not.toBe(left);
  });
});

describe("физика: полнота гарантий", () => {
  it("касательный удар о нос теряет тангенциальную скорость", () => {
    const state = makeState([{ id: 0, x: 600, y: BALL_RADIUS - 0.5, vx: 200, vy: -200 }]);
    const next = stepG(state);
    expect(next.balls[0]?.vy).toBeGreaterThan(0);
    expect(Math.abs(next.balls[0]?.vx ?? 0)).toBeLessThan(200);
    expect(next.balls[0]?.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("шар не выходит за внешние границы", () => {
    const state = makeState([{ id: 0, x: 600, y: 400, vy: 6000 }]);
    const next = simulateToRestG(state);
    const ball = next.balls[0]!;
    expect(ball.y).toBeLessThanOrEqual(TABLE_WIDTH - BALL_RADIUS + 0.001);
    expect(ball.y).toBeGreaterThanOrEqual(BALL_RADIUS - 0.001);
  });

  it("шар-шар: импульс и энергия не растут", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 400 },
      { id: 1, x: 800, y: 635, vx: -300 },
    ]);
    const before = totalMomentum(state);
    const energyBefore = totalEnergy(state);
    const next = simulateToRestG(state);
    expect(totalMomentum(next)).toBeLessThanOrEqual(before + 1e-6);
    expect(totalEnergy(next)).toBeLessThanOrEqual(energyBefore + 1e-6);
  });

  it("после соударения шары не перекрываются", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 500 },
      { id: 1, x: 700, y: 635 },
    ]);
    const next = simulateToRestG(state);
    const a = next.balls[0]!;
    const b = next.balls[1]!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2 * BALL_RADIUS - 0.5);
  });

  it("перекрытые покоящиеся шары разъезжаются", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635 },
      { id: 1, x: 600 + BALL_RADIUS, y: 635 },
    ]);
    const next = stepG(state);
    const a = next.balls[0]!;
    const b = next.balls[1]!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(BALL_RADIUS);
  });

  it("порядок пар стабилен: повтор шага идентичен", () => {
    const state = makeState([
      { id: 0, x: 600, y: 635, vx: 300 },
      { id: 1, x: 660, y: 635 },
      { id: 2, x: 630, y: 663 },
    ]);
    expect(stepG(state)).toEqual(stepG(state));
  });

  it("луза: шар, катящийся вдоль борта в угол, — забит", () => {
    const along = makeState([{ id: 0, x: 400, y: BALL_RADIUS, vx: -400 }]);
    expect(simulateToRestG(along).balls[0]?.active).toBe(false);
    const end = makeState([{ id: 0, x: BALL_RADIUS, y: 300, vy: -400 }]);
    expect(simulateToRestG(end).balls[0]?.active).toBe(false);
  });

  it("луза: пересечение линии в стороне от зева — не забит", () => {
    const state = makeState([{ id: 0, x: 70, y: 20 }]);
    expect(stepG(state).balls[0]?.active).toBe(true);
  });

  it("луза: шар в поле у линии рта (не наружу) — не забит", () => {
    const state = makeState([{ id: 0, x: 50, y: 40 }]);
    expect(stepG(state).balls[0]?.active).toBe(true);
  });
});

function totalMomentum(state: BilliardsState): number {
  return state.balls.reduce((sum, b) => sum + (b.active ? Math.hypot(b.vx, b.vy) : 0), 0);
}

function totalEnergy(state: BilliardsState): number {
  return state.balls.reduce((sum, b) => sum + (b.active ? (b.vx * b.vx + b.vy * b.vy) / 2 : 0), 0);
}
