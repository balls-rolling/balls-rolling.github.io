import { computed, markRaw, shallowRef, type Component } from "vue";
import { DialogStack, type Disposable } from "./stack";

// Менеджер диалогов: один `<dialog>` на всю платформу, стек экранов и навигация.
//
// Переход к другому экрану — не перерисовка, а действие менеджера: предыдущий
// экран уходит в историю и скрывается, новый открывается. «Назад» возвращает.

/** Описание экрана, которое принимает менеджер. */
export interface ScreenSpec {
  readonly component: Component;
  readonly props?: Record<string, unknown>;
  readonly title?: string;
  /**
   * Корневой экран можно закрыть целиком. Нужен там, где диалог открывается
   * поверх игры (настройки из игрового меню): предыдущего экрана нет, но выход
   * обязателен — иначе модальность превращается в ловушку.
   */
  readonly closable?: boolean;
  /** Широкий диалог: на всё окно с общим отступом (например, крупный QR). */
  readonly wide?: boolean;
  /** Управляющий объект экрана: `destroy` вызовется при снятии экрана. */
  readonly handle?: { destroy?: () => void };
  readonly onClose?: () => void;
}

/** Внутренняя запись: добавляет к описанию освобождение ресурсов. */
interface StackEntry extends Disposable {
  readonly spec: ScreenSpec;
}

export class DialogManager {
  readonly #stack = new DialogStack<StackEntry>();
  readonly #element = shallowRef<HTMLDialogElement | null>(null);
  readonly #screens = shallowRef<readonly ScreenSpec[]>([]);
  // Ссылка на обработчик `cancel`: без неё его нельзя снять в `detach`.
  #cancelHandler: ((event: Event) => void) | null = null;
  // Вычисляем из реактивного списка экранов, а не из самого стека: стек — обычный
  // объект без реактивности, и `computed` над ним не пересчитывался бы.
  // Возврат есть со второго экрана; корневой экран даёт возврат, только если он
  // помечен `closable` — тогда «назад» закрывает диалог.
  readonly #canGoBack = computed(() => {
    const screens = this.#screens.value;
    if (screens.length > 1) return true;
    return screens[0]?.closable === true;
  });
  readonly #title = computed(
    () => this.#screens.value[this.#screens.value.length - 1]?.title ?? "",
  );
  readonly #wide = computed(
    () => this.#screens.value[this.#screens.value.length - 1]?.wide === true,
  );

  /** Экраны снизу вверх. Последний — активный. */
  get screens() {
    return this.#screens;
  }

  get canGoBack() {
    return this.#canGoBack;
  }

  get title() {
    return this.#title;
  }

  get wide() {
    return this.#wide;
  }

  /** Привязать настоящий элемент `<dialog>`. Вызывается слоем при монтировании. */
  attach(element: HTMLDialogElement): void {
    this.#element.value = element;
    // Второй барьер: даже если `closedby` не сработает, `cancel` не закроет диалог.
    this.#cancelHandler = (event) => event.preventDefault();
    element.addEventListener("cancel", this.#cancelHandler);
    // Экраны могли быть добавлены до монтирования слоя — тогда диалог ещё закрыт.
    if (this.#stack.depth > 0 && !element.open) {
      element.showModal();
    }
  }

  detach(): void {
    const element = this.#element.value;
    if (element && this.#cancelHandler) {
      element.removeEventListener("cancel", this.#cancelHandler);
    }
    this.#cancelHandler = null;
    this.#element.value = null;
  }

  /** Открыть экран поверх текущих. */
  show(spec: ScreenSpec): void {
    this.#stack.push({
      spec: { ...spec, component: markRaw(spec.component) },
      onDispose: () => {
        spec.handle?.destroy?.();
        spec.onClose?.();
      },
    });
    this.#sync();

    const element = this.#element.value;
    // Повторный `showModal()` на уже открытом диалоге бросает — проверяем.
    if (element && !element.open) {
      element.showModal();
    }
  }

  /**
   * Вернуться на предыдущий экран. С корневого экрана возврата нет, кроме
   * случая, когда корень помечен `closable`: тогда «назад» закрывает диалог.
   */
  back(): void {
    if (this.#stack.depth <= 1) {
      if (this.#screens.value[0]?.closable) this.close();
      return;
    }
    const removed = this.#stack.back();
    if (!removed) return;
    this.#sync();
  }

  /** Закрыть диалог целиком, освободив все экраны. */
  close(): void {
    this.#stack.close();
    this.#sync();
    this.#element.value?.close();
  }

  #sync(): void {
    this.#screens.value = this.#stack.items.map((entry) => entry.spec);
  }
}
