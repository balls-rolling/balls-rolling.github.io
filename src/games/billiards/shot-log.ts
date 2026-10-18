// Журнал удара: побочный продукт фиксированного шага симуляции.
// Правила 8-ball читают только этот лог поверх состояния до удара:
// сам лог детерминирован (порядок событий = порядок обхода физики),
// Math.random/время сюда не проникают.
export interface ShotLog {
  /** id шара первого контакта битка; `null` — контакта не было. */
  readonly firstContactId: number | null;
  /** Любой шар коснулся борта после первого контакта битка. */
  readonly railAfterContact: boolean;
  /** Забитые шары в порядке забития (включая биток при скраче). */
  readonly pocketedIds: readonly number[];
  /** Биток забит (скрач). */
  readonly cueScratched: boolean;
  /** Шары, вылетевшие со стола (активные вне поля в конце удара). */
  readonly offTableIds: readonly number[];
}

/** События одного фиксированного шага для сборщика журнала. */
export interface StepEvents {
  /** Импульсное соударение пары шаров (id в порядке обхода пар). */
  readonly onBallContact?: (aId: number, bId: number) => void;
  /** Отражение шара от сегмента борта. */
  readonly onRailContact?: (ballId: number) => void;
  /** Шар пересёк линию проёма и забит. */
  readonly onPocketed?: (ballId: number) => void;
}

/**
 * Аккумулятор журнала за один удар. Методы вызываются из физики в порядке
 * обхода (пары/сегменты/лузы, затем субшаги), поэтому внутренний счётчик
 * последовательности однозначно упорядочивает события: флаг борта считается
 * относительно момента первого контакта, а не порядка вызовов в субшаге
 * (сегменты обрабатываются раньше пар внутри одного субшага).
 */
export class ShotLogCollector {
  #seq = 0;
  #firstContactId: number | null = null;
  #firstSeq = -1;
  #railSeqs: number[] = [];
  #pocketedIds: number[] = [];
  #offTableIds: number[] = [];

  /** Пара шаров обменялась импульсом (нормальная скорость сближения < 0). */
  noteBallContact(aId: number, bId: number): void {
    this.#seq += 1;
    if (this.#firstContactId !== null) return;
    if (aId !== 0 && bId !== 0) return;
    this.#firstContactId = aId === 0 ? bId : aId;
    this.#firstSeq = this.#seq;
  }

  /** Шар отразился от борта. */
  noteRailContact(_ballId: number): void {
    this.#seq += 1;
    this.#railSeqs.push(this.#seq);
  }

  /** Шар забит; порядок вызовов = порядок забития. */
  notePocketed(ballId: number): void {
    this.#seq += 1;
    if (!this.#pocketedIds.includes(ballId)) this.#pocketedIds.push(ballId);
  }

  /** Шар остался активным вне поля к концу удара (порядок — по id). */
  noteOffTable(ballId: number): void {
    if (!this.#offTableIds.includes(ballId)) {
      this.#offTableIds.push(ballId);
      this.#offTableIds.sort((a, b) => a - b);
    }
  }

  /** Итоговый журнал удара. */
  toLog(): ShotLog {
    return {
      firstContactId: this.#firstContactId,
      railAfterContact:
        this.#firstSeq >= 0 && this.#railSeqs.some((seq) => seq > this.#firstSeq),
      pocketedIds: [...this.#pocketedIds],
      cueScratched: this.#pocketedIds.includes(0),
      offTableIds: [...this.#offTableIds],
    };
  }
}
