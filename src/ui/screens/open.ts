// Реестр именованных `open`-обработчиков. Платформа на старте смотрит на query
// `?open=<name>&…` и выполняет обработчик с остальными параметрами. Механизм
// платформенный и расширяемый: новые сценарии добавляются регистрацией.
//
// Здесь только разбор и запуск — что именно делать, решает зарегистрированный
// обработчик (например, `net_game`).

/** Разобранный запрос на открытие. */
export interface OpenRequest {
  readonly name: string;
  readonly params: URLSearchParams;
}

export type OpenHandler = (params: URLSearchParams) => void | Promise<void>;

const handlers = new Map<string, OpenHandler>();

/** Зарегистрировать обработчик по имени. */
export function registerOpenHandler(name: string, handler: OpenHandler): void {
  handlers.set(name, handler);
}

export function hasOpenHandler(name: string): boolean {
  return handlers.has(name);
}

/** Разобрать query: `?open=<name>&…`; `null`, если `open` нет. */
export function parseOpenQuery(search: string): OpenRequest | null {
  const params = new URLSearchParams(search);
  const name = params.get("open");
  if (!name) return null;
  return { name, params };
}

/** Выполнить обработчик. `false` — обработчика нет (query просто очищается). */
export async function runOpen(request: OpenRequest): Promise<boolean> {
  const handler = handlers.get(request.name);
  if (!handler) return false;
  await handler(request.params);
  return true;
}
