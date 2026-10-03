import { describe, expect, it, vi } from "vitest";
import { DialogStack, type Disposable } from "./stack";

interface Screen extends Disposable {
  readonly title: string;
}

const screen = (title: string, onDispose?: () => void): Screen => ({ title, onDispose });

describe("DialogStack", () => {
  it("пустой стек", () => {
    const stack = new DialogStack<Screen>();

    expect(stack.depth).toBe(0);
    expect(stack.top).toBeUndefined();
    expect(stack.canGoBack).toBe(false);
    expect(stack.back()).toBeNull();
  });

  it("push кладёт экран, top показывает верхний", () => {
    const stack = new DialogStack<Screen>();
    stack.push(screen("главный"));

    expect(stack.depth).toBe(1);
    expect(stack.top?.title).toBe("главный");
  });

  it("с корневого экрана назад не уходим", () => {
    const stack = new DialogStack<Screen>();
    const dispose = vi.fn();
    stack.push(screen("главный", dispose));

    expect(stack.canGoBack).toBe(false);
    expect(stack.back()).toBeNull();
    expect(stack.depth).toBe(1);
    expect(dispose).not.toHaveBeenCalled();
  });

  it("back снимает верхний экран и освобождает его ровно один раз", () => {
    const stack = new DialogStack<Screen>();
    const dispose = vi.fn();
    stack.push(screen("главный"));
    stack.push(screen("список", dispose));

    expect(stack.canGoBack).toBe(true);
    const removed = stack.back();

    expect(removed?.title).toBe("список");
    expect(stack.top?.title).toBe("главный");
    expect(stack.depth).toBe(1);
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("close освобождает все экраны и очищает стек", () => {
    const stack = new DialogStack<Screen>();
    const first = vi.fn();
    const second = vi.fn();
    stack.push(screen("главный", first));
    stack.push(screen("список", second));

    stack.close();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(stack.depth).toBe(0);
    expect(stack.top).toBeUndefined();
  });

  it("close после back не освобождает снятое повторно", () => {
    const stack = new DialogStack<Screen>();
    const dispose = vi.fn();
    stack.push(screen("главный"));
    stack.push(screen("список", dispose));

    stack.back();
    stack.close();

    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("экраны видны по порядку", () => {
    const stack = new DialogStack<Screen>();
    stack.push(screen("главный"));
    stack.push(screen("список"));

    expect(stack.items.map((s) => s.title)).toEqual(["главный", "список"]);
  });

  it("работает без DOM", () => {
    // Стек — чистая логика: этот тест идёт в окружении node.
    expect(typeof document).toBe("undefined");
  });
});
