import { collectControls } from "./types";
import type { FormHandle, FormSchema, FormSnapshot, SignalListener } from "./types";

// Контроллер формы: состояние и доставка сигналов. Рендером не занимается —
// это дело конструктора в UI-слое.
//
// Неизвестный `kind` контролла не считается ошибкой: контроллер о рендере не
// знает, а конструктор сам решит, как показать незнакомый контролл.

const ALL = "*";

/** Ключ подписки: селектор и сигнал вместе. */
function subscriptionKey(selector: string, signal: string): string {
  return `${selector}\u0000${signal}`;
}

export function createFormController(schema: FormSchema): FormHandle {
  const values: Record<string, unknown> = {};
  // Значения создаются только для листьев-контроллов: дерево разворачивается,
  // иначе начальные значения вложенных полей не попали бы в состояние.
  for (const control of collectControls(schema.nodes)) {
    values[control.id] = control.value;
  }

  const listeners = new Map<string, Set<SignalListener>>();
  let destroyed = false;

  const collect = (controlId: string, signal: string): SignalListener[] => {
    const exact = listeners.get(subscriptionKey(controlId, signal));
    const any = listeners.get(subscriptionKey(ALL, signal));
    return [...(exact ?? []), ...(any ?? [])];
  };

  return {
    getSnapshot(): FormSnapshot {
      return { values: { ...values } };
    },

    getValue(id: string): unknown {
      return values[id];
    },

    setValue(id: string, value: unknown): void {
      if (destroyed) return;
      values[id] = value;
    },

    patch(next: Readonly<Record<string, unknown>>): void {
      if (destroyed) return;
      for (const [id, value] of Object.entries(next)) {
        values[id] = value;
      }
    },

    on(selector: string, signal: string, listener: SignalListener): () => void {
      const key = subscriptionKey(selector, signal);
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(listener);
      // Отписка идемпотентна: повторный вызов ничего не ломает.
      return () => {
        const current = listeners.get(key);
        if (!current) return;
        current.delete(listener);
        if (current.size === 0) listeners.delete(key);
      };
    },

    emit(id: string, signal: string, payload?: unknown): void {
      if (destroyed) return;
      // Копия списка: слушатель может отписаться прямо во время доставки.
      for (const listener of collect(id, signal)) {
        listener(payload);
      }
    },

    destroy(): void {
      destroyed = true;
      listeners.clear();
    },
  };
}
