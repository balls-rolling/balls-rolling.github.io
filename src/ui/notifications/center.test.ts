import { describe, expect, it } from "vitest";
import { createNotificationCenter } from "./center";

describe("NotificationCenter", () => {
  it("добавляет уведомление в историю, тосты и счётчик", () => {
    const center = createNotificationCenter();
    center.notify("info", "Привет");

    expect(center.items.value.map((n) => n.text)).toEqual(["Привет"]);
    expect(center.toasts.value).toHaveLength(1);
    expect(center.unread.value).toBe(1);
  });

  it("скрытие тоста не убирает запись из истории", () => {
    const center = createNotificationCenter();
    center.notify("info", "Раз");
    const id = center.items.value[0]!.id;

    center.dismissToast(id);

    expect(center.toasts.value).toHaveLength(0);
    expect(center.items.value).toHaveLength(1);
    expect(center.unread.value).toBe(1);
  });

  it("открытие стека прячет тосты, но оставляет историю", () => {
    const center = createNotificationCenter();
    center.notify("info", "Раз");
    center.notify("success", "Два");

    center.dismissAllToasts();

    expect(center.toasts.value).toHaveLength(0);
    expect(center.items.value).toHaveLength(2);
  });

  it("прочтение и удаление уменьшают счётчик", () => {
    const center = createNotificationCenter();
    center.notify("info", "Раз");
    center.notify("error", "Два");
    const first = center.items.value[0]!.id;

    center.markRead(first);
    expect(center.unread.value).toBe(1);

    center.dismiss(first);
    expect(center.items.value).toHaveLength(1);
    expect(center.toasts.value).toHaveLength(1);
    expect(center.unread.value).toBe(1);
  });

  it("очистка убирает всё", () => {
    const center = createNotificationCenter();
    center.notify("success", "Сохранено");

    center.clear();

    expect(center.items.value).toHaveLength(0);
    expect(center.toasts.value).toHaveLength(0);
    expect(center.unread.value).toBe(0);
  });
});
