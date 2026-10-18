// Фиксированная раскладка пирамиды (решение пользователя 2026-10-11: никакой
// случайности — ни Math.random, ни seed). Набор и порядок номеров по слотам
// берутся из конфига режима (`config.balls`, `config.rack.order`); пятна — общие
// инварианты стола. 8-й — в центре третьего ряда, задние углы — сплошной и
// полосатый, вершина — единица (задаётся `order` в конфиге 8-ball).
import { FOOT_SPOT, HEAD_SPOT } from "./constants";
import type { ModeConfig } from "./modes/types";

/** Позиция шара при раскладке. */
export interface BallPlacement {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

interface Slot {
  readonly r: number;
  readonly c: number;
  readonly x: number;
  readonly y: number;
}

/** Слоты треугольной пирамиды вершиной на подставке; шары касаются друг друга. */
function buildSlots(diameter: number): readonly Slot[] {
  const rowDx = (diameter / 2) * Math.sqrt(3); // расстояние между рядами
  const slots: Slot[] = [];
  for (let r = 0; r <= 4; r += 1) {
    for (let c = 0; c <= r; c += 1) {
      slots.push({
        r,
        c,
        x: FOOT_SPOT.x + r * rowDx,
        y: FOOT_SPOT.y + (c - r / 2) * diameter,
      });
    }
  }
  return slots;
}

/**
 * Разложить шары по конфигу режима: биток на головном пятне, пирамида вершиной
 * на подставке. Номера по слотам задаёт `config.rack.order`; расстояние между
 * рядами — от диаметра шара конфига. Раскладка детерминирована.
 */
export function rackPlacements(config: ModeConfig): readonly BallPlacement[] {
  const slots = buildSlots(config.balls.diameter);
  const order = config.rack.order;
  const placements: BallPlacement[] = [{ id: 0, x: HEAD_SPOT.x, y: HEAD_SPOT.y }];
  for (let idx = 0; idx < slots.length; idx += 1) {
    const slot = slots[idx]!;
    placements.push({ id: order[idx]!, x: slot.x, y: slot.y });
  }
  return placements;
}
