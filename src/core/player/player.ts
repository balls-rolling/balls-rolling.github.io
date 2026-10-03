import type { PropertySchema, PropertySpec } from "./schema";

// Игрок. Способ участия и способ связи — разные поля (D7): в исходной
// реализации они были смешаны в одном `kind`, из-за чего «компьютер» попадал
// в поле, означавшее способ связи.

/** Кто играет: человек или компьютер. */
export type PlayerAgent = "human" | "computer";

/** Как связан с этой машиной: локально или по сети. */
export type PlayerTransport = "local" | "remote";

export interface PlayerInit {
  readonly id: string;
  readonly name: string;
  readonly agent: PlayerAgent;
  readonly transport: PlayerTransport;
}

export interface PlayerSnapshot {
  readonly id: string;
  readonly name: string;
  readonly agent: PlayerAgent;
  readonly transport: PlayerTransport;
  /** Специфичные для игры свойства, объявленные её схемой. */
  readonly properties: Readonly<Record<string, unknown>>;
}

export class Player {
  readonly id: string;
  readonly agent: PlayerAgent;
  readonly transport: PlayerTransport;

  // Имя — общее для любого игрока свойство, поэтому хранится напрямую, а не в
  // словаре игровых свойств. Платформа описывает, как его редактировать, своей
  // схемой; значение живёт здесь.
  #name: string;

  readonly #schema: PropertySchema;
  readonly #properties = new Map<string, unknown>();

  constructor(init: PlayerInit, schema: PropertySchema) {
    this.id = init.id;
    this.agent = init.agent;
    this.transport = init.transport;
    this.#name = init.name;
    this.#schema = schema;
  }

  get name(): string {
    return this.#name;
  }

  set name(value: string) {
    this.#name = value;
  }

  #spec(key: string): PropertySpec | undefined {
    return this.#schema.specs.find((spec) => spec.key === key);
  }

  getProperty(key: string): unknown {
    return this.#properties.get(key);
  }

  /**
   * Записать игровое свойство. Возвращает false, если свойства нет в схеме или
   * значение недопустимо: молча принимать мусор нельзя.
   */
  setProperty(key: string, value: unknown): boolean {
    const spec = this.#spec(key);
    if (!spec) return false;

    // Сначала нормализация, потом проверка: допустимый ввод бывает в вольной
    // форме («x» вместо «X»), и отклонять его, не приведя к канону, неправильно.
    let candidate = value;
    if (spec.normalize) {
      try {
        candidate = spec.normalize(value);
      } catch {
        return false;
      }
    }

    if (spec.isValid && !spec.isValid(candidate)) return false;

    this.#properties.set(key, candidate);
    return true;
  }

  snapshot(): PlayerSnapshot {
    return {
      id: this.id,
      name: this.#name,
      agent: this.agent,
      transport: this.transport,
      properties: Object.fromEntries(this.#properties),
    };
  }
}
