// Контракт параметров режима бильярда. Только данные, без DOM и правил.
// Режим — это конфигурация (стол, шары, раскладка, раунды, попытки); ядро не
// ветвится по режиму. 8-ball заполнен; аркадные раунды — фаза 06.
//
// Точки расширения для русского бильярда (в будущем, без полей сейчас): у него
// другие правила удара и перехода хода, фолы и штрафы, размеры и вес шаров, рот
// луз и угол щёк. Контракт намеренно не заводит rule-полей «на будущее»: когда
// появится второй режим с иными правилами, здесь добавятся его секции.

import type { Shot } from "../physics";
import type { BilliardsState } from "../state";

/** Параметры стола режима. Инварианты стола (2:1, рейка, подушка) — общие. */
export interface ModeTable {
  /** Рот угловой лузы, мм. */
  readonly cornerMouth: number;
  /** Рот боковой лузы, мм. */
  readonly sideMouth: number;
  /** Угол щёк луз, градусы (текущая модель канона — 45°). */
  readonly cheekAngleDeg: number;
}

/** Набор шаров режима. */
export interface ModeBalls {
  /** Диаметр шара, мм. */
  readonly diameter: number;
  /** Масса шара, кг. */
  readonly mass: number;
  /** Цвета по id: 0 — биток, 1–7 сплошные, 8 чёрный, 9–15 полосатые. */
  readonly colors: readonly string[];
}

/** Раскладка шаров режима. */
export interface ModeRack {
  /** Вид начальной раскладки (сейчас один — треугольник). */
  readonly layout: "triangle";
  /**
   * Порядок номеров по слотам пирамиды (r0 → r4), без битка: слот i получает
   * `order[i]`. Задаёт расположение шаров в раскладке и не зависит от случайности.
   */
  readonly order: readonly number[];
}

/** Раунды режима. */
export interface ModeRounds {
  /** Сколько раундов в партии. */
  readonly count: number;
  /** Условие конца раунда: до победы одного игрока. */
  readonly kind: "toWin";
}

/** Полная конфигурация режима. */
export interface ModeConfig {
  readonly id: string;
  readonly label: string;
  readonly table: ModeTable;
  readonly balls: ModeBalls;
  readonly rack: ModeRack;
  readonly rounds: ModeRounds;
  /** Попытки удара (аркада); `null` — не ограничены (8-ball). */
  readonly attempts: number | null;
}

/**
 * Выбор удара агентом по видимому состоянию — отдельно от применения удара
 * (решение CONTEXT пп.9–10). `null` — агент бездействует (заглушка до 02-c).
 */
export type ChooseShot = (state: BilliardsState) => Shot | null;
