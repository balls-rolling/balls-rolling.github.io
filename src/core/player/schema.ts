import type { Control } from "../form";

// Описание свойства игрока: как оно называется, как выглядит в форме и какое
// значение допустимо. Схему объявляет тот, кто владеет свойством: глобальные —
// платформа, игровые — сама игра. Хранилище и ядро о конкретных свойствах
// ничего не знают.

export interface PropertySpec {
  readonly key: string;
  readonly label: string;
  /** Контролл для формы настроек (D12): тип, подпись, иконка, сигналы. */
  readonly control: Control;
  /** Допустимо ли значение. Если не задано — принимается любое. */
  readonly isValid?: (value: unknown) => boolean;
  /** Нормализация допустимого значения: обрезка строки, приведение типа. */
  readonly normalize?: (value: unknown) => unknown;
}

export interface PropertySchema {
  readonly specs: readonly PropertySpec[];
}

export function definePropertySchema(specs: readonly PropertySpec[]): PropertySchema {
  return { specs };
}
