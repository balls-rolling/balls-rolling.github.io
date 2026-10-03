// Стек экранов диалога: чистая логика навигации, без DOM и без Vue.
// Отделение от привязки к `<dialog>` даёт возможность тестировать навигацию
// в окружении `node` — и именно поэтому здесь нет ни одного импорта Vue
// в рантайме.

/** Элемент стека, которому нужно освободить ресурсы при снятии. */
export interface Disposable {
  onDispose?: () => void;
}

/**
 * Стек экранов. «Назад» снимает верхний экран и освобождает его; с корневого
 * экрана возврат не делается — иначе диалог остался бы без содержимого.
 */
export class DialogStack<T extends Disposable> {
  readonly #items: T[] = [];

  push(item: T): void {
    this.#items.push(item);
  }

  /**
   * Вернуться на предыдущий экран. Возвращает снятый элемент или `null`, если
   * возвращаться некуда (пусто или остался только корневой экран).
   */
  back(): T | null {
    if (this.#items.length <= 1) return null;
    const item = this.#items.pop()!;
    item.onDispose?.();
    return item;
  }

  /** Закрыть стек целиком, освободив все экраны. */
  close(): void {
    for (const item of this.#items.splice(0, this.#items.length)) {
      item.onDispose?.();
    }
  }

  get top(): T | undefined {
    return this.#items[this.#items.length - 1];
  }

  get depth(): number {
    return this.#items.length;
  }

  /** Есть ли куда возвращаться. */
  get canGoBack(): boolean {
    return this.#items.length > 1;
  }

  get items(): readonly T[] {
    return this.#items;
  }
}
