// Метаданные формы: описание контроллов без знания о том, как они рисуются.
// Ядро отдаёт схему; конструктор (Vue, фаза 03) строит по ней форму и возвращает
// управляющий объект. Здесь нет ни Vue, ни DOM.

/**
 * Тип контролла. Строка открыта: новый контролл не должен требовать правки ядра.
 * `(string & {})` сохраняет автодополнение известных значений и разрешает любые.
 */
export type ControlKind = "text" | "number" | "toggle" | "select" | (string & {});

export interface ControlOption {
  readonly value: string;
  readonly label: string;
}

export interface Control {
  readonly id: string;
  readonly kind: ControlKind;
  readonly label: string;
  /** Нейтральный токен иконки, НЕ Vue-компонент: иначе Vue протёк бы в ядро. */
  readonly icon?: string;
  /** Начальное значение. Состояние формы хранится отдельно от схемы. */
  readonly value?: unknown;
  readonly options?: readonly ControlOption[];
  /**
   * Имена сигналов (событий), которые контролл умеет излучать. Это перечень
   * возможностей, а не reactive signals: сигнал здесь — обычное событие.
   */
  readonly signals?: readonly string[];
}

export interface FormSchema {
  readonly id?: string;
  readonly controls: readonly Control[];
}

export interface FormSnapshot {
  readonly values: Readonly<Record<string, unknown>>;
}

/** Слушатель сигнала: получает полезную нагрузку, которой сигнал сопровождался. */
export type SignalListener = (payload: unknown) => void;

/**
 * Управляющий объект формы: через него вызывающий следит за состоянием,
 * слушает сигналы и при необходимости влияет на данные.
 */
export interface FormHandle {
  getSnapshot(): FormSnapshot;
  getValue(id: string): unknown;
  /** Изменить значение без сигнала: платформа влияет на данные. */
  setValue(id: string, value: unknown): void;
  patch(values: Readonly<Record<string, unknown>>): void;
  /**
   * Подписка на сигнал. `selector` — id контролла или `"*"` для всех.
   * Возвращает отписку: без неё долгоживущий контроллер копит слушателей.
   */
  on(selector: string, signal: string, listener: SignalListener): () => void;
  /** Конструктор сообщает о действии пользователя; платформа слушает через `on`. */
  emit(id: string, signal: string, payload?: unknown): void;
  destroy(): void;
}
