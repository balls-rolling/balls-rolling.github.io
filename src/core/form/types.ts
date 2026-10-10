// Метаданные формы: описание того, что показать, без знания о том, как это
// рисуется. Ядро отдаёт схему; конструктор (Vue, `src/ui/form/`) строит по ней
// форму и возвращает управляющий объект. Здесь нет ни Vue, ни DOM.

/**
 * Тип контролла. Строка открыта: новый контролл не должен требовать правки ядра.
 * `(string & {})` сохраняет автодополнение известных значений и разрешает любые.
 */
export type ControlKind = "text" | "number" | "toggle" | "select" | (string & {});

export interface ControlOption {
  readonly value: string;
  readonly label: string;
}

/** Настройка флекса контролла в горизонтальной группе. */
export interface ControlFlex {
  readonly grow?: number;
  readonly shrink?: number;
  readonly basis?: string;
}

/** Вариант оформления кнопки (семантический, не сырой цвет). */
export type ControlVariant = "primary" | "secondary" | "ghost" | "danger";

/**
 * Контролл: минимальная единица ввода или действия.
 * Иконка — нейтральный токен, НЕ Vue-компонент: иначе Vue протёк бы в ядро.
 */
export interface Control {
  readonly id: string;
  readonly kind: ControlKind;
  readonly label: string;
  readonly icon?: string;
  /** Начальное значение. Состояние формы хранится отдельно от схемы. */
  readonly value?: unknown;
  readonly options?: readonly ControlOption[];
  /**
   * Имена сигналов (событий), которые контролл умеет излучать. Это перечень
   * возможностей, а не reactive signals: сигнал здесь — обычное событие.
   */
  readonly signals?: readonly string[];
  /**
   * Флекс в горизонтальной группе. По умолчанию (не задан) — делит ширину с
   * соседями (`1 1 0`). `false` — по содержимому. Объект — свои grow/shrink/basis.
   */
  readonly flex?: boolean | ControlFlex;
  /** Вариант оформления (для кнопок): цвет/акцент из семантики темы. */
  readonly variant?: ControlVariant;
}

export type FormOrientation = "vertical" | "horizontal";

/** Контролл как узел формы. Значение адресуется по `control.id`. */
export interface FormControl {
  readonly type: "control";
  readonly control: Control;
}

/** Текст: пояснение или подсказка. Значения не несёт. */
export interface FormText {
  readonly type: "text";
  readonly id: string;
  readonly text: string;
  readonly multiline?: boolean;
}

/**
 * Группа — рекурсивный узел: содержит любые узлы, включая другие группы.
 * Заголовок группы — это её `label`, отдельного контролла-заголовка нет.
 */
export interface FormGroup {
  readonly type: "group";
  readonly id: string;
  readonly label?: string;
  readonly frame?: boolean;
  readonly orientation?: FormOrientation;
  /** Группа может сворачиваться. Нативно, через `<details>`. */
  readonly collapsible?: boolean;
  /** Состояние по умолчанию: развёрнута или свёрнута. */
  readonly open?: boolean;
  readonly children: readonly FormNode[];
}

export type FormNode = FormGroup | FormText | FormControl;

export interface FormSchema {
  readonly id?: string;
  readonly nodes: readonly FormNode[];
}

/** Ключ узла дерева: у контролла это id самого контролла, у прочих — свой id. */
export function nodeKey(node: FormNode): string {
  return node.type === "control" ? node.control.id : node.id;
}

/** Все контроллы дерева, в порядке обхода. Значения создаются только по ним. */
export function collectControls(nodes: readonly FormNode[]): Control[] {
  const result: Control[] = [];
  const walk = (list: readonly FormNode[]): void => {
    for (const node of list) {
      if (node.type === "control") result.push(node.control);
      else if (node.type === "group") walk(node.children);
    }
  };
  walk(nodes);
  return result;
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
