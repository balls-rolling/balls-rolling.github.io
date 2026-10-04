import { describe, expect, it, vi } from "vitest";
import type { Component } from "vue";
import { DialogManager } from "./manager";

// Реальная Vue-компонента здесь не нужна: менеджер оперирует только описанием.
const noop = {} as unknown as Component;

describe("DialogManager", () => {
  it("корневой экран без closable назад не уходит", () => {
    const manager = new DialogManager();
    const destroy = vi.fn();
    manager.show({ component: noop, handle: { destroy } });

    expect(manager.canGoBack.value).toBe(false);
    manager.back();

    expect(manager.screens.value).toHaveLength(1);
    expect(destroy).not.toHaveBeenCalled();
  });

  it("closable-корень закрывает диалог по «назад»", () => {
    const manager = new DialogManager();
    const destroy = vi.fn();
    manager.show({ component: noop, closable: true, handle: { destroy } });

    expect(manager.canGoBack.value).toBe(true);
    manager.back();

    expect(manager.screens.value).toHaveLength(0);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("второй экран даёт возврат и снимает только его", () => {
    const manager = new DialogManager();
    manager.show({ component: noop, closable: true });
    manager.show({ component: noop });

    expect(manager.canGoBack.value).toBe(true);
    manager.back();

    expect(manager.screens.value).toHaveLength(1);
  });
});
