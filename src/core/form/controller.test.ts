import { describe, expect, it, vi } from "vitest";
import { createFormController } from "./controller";
import type { FormSchema } from "./types";

// Схема с вложенными группами: значения должны создаваться только для
// контроллов-листьев, а текстовые узлы значения не несут.
const schema: FormSchema = {
  id: "demo",
  nodes: [
    {
      type: "group",
      id: "g-main",
      label: "Основное",
      frame: true,
      children: [
        { type: "control", control: { id: "name", kind: "text", label: "Имя", value: "Игрок" } },
        {
          type: "group",
          id: "g-advanced",
          label: "Дополнительно",
          collapsible: true,
          open: false,
          children: [
            {
              type: "control",
              control: {
                id: "sound",
                kind: "toggle",
                label: "Звук",
                value: false,
                signals: ["change"],
              },
            },
            { type: "text", id: "hint", text: "Подсказка", multiline: true },
          ],
        },
      ],
    },
  ],
};

describe("createFormController", () => {
  it("разворачивает дерево и берёт значения вложенных контроллов", () => {
    const form = createFormController(schema);

    expect(form.getValue("name")).toBe("Игрок");
    // Значение из вложенной группы тоже должно быть на месте.
    expect(form.getValue("sound")).toBe(false);
    expect(form.getSnapshot().values).toEqual({ name: "Игрок", sound: false });
  });

  it("текстовый узел значения не создаёт", () => {
    const form = createFormController(schema);

    expect(form.getValue("hint")).toBeUndefined();
    expect(Object.keys(form.getSnapshot().values)).toEqual(["name", "sound"]);
  });

  it("setValue и patch меняют только значения", () => {
    const form = createFormController(schema);
    form.setValue("name", "Гость");
    form.patch({ sound: true });

    expect(form.getSnapshot().values).toEqual({ name: "Гость", sound: true });
  });

  it("снимок не даёт менять состояние напрямую", () => {
    const form = createFormController(schema);
    const snapshot = form.getSnapshot();

    (snapshot.values as Record<string, unknown>).name = "взлом";

    expect(form.getValue("name")).toBe("Игрок");
  });

  it("доставляет сигнал вложенного контролла", () => {
    const form = createFormController(schema);
    const listener = vi.fn();
    form.on("sound", "change", listener);

    form.emit("sound", "change", true);

    expect(listener).toHaveBeenCalledWith(true);
  });

  it("селектор * слушает все контроллы", () => {
    const form = createFormController(schema);
    const listener = vi.fn();
    form.on("*", "change", listener);

    form.emit("sound", "change", true);
    form.emit("name", "change", "Новое");

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("подписка не срабатывает на чужой сигнал", () => {
    const form = createFormController(schema);
    const listener = vi.fn();
    form.on("sound", "change", listener);

    form.emit("sound", "focus");
    form.emit("name", "change", "x");

    expect(listener).not.toHaveBeenCalled();
  });

  it("отписка прекращает доставку и идемпотентна", () => {
    const form = createFormController(schema);
    const listener = vi.fn();
    const off = form.on("sound", "change", listener);

    off();
    off();
    form.emit("sound", "change", true);

    expect(listener).not.toHaveBeenCalled();
  });

  it("destroy прекращает доставку и изменения", () => {
    const form = createFormController(schema);
    const listener = vi.fn();
    form.on("sound", "change", listener);

    form.destroy();
    form.emit("sound", "change", true);
    form.setValue("name", "после destroy");

    expect(listener).not.toHaveBeenCalled();
    expect(form.getValue("name")).toBe("Игрок");
  });

  it("неизвестный kind не считается ошибкой", () => {
    const unknown: FormSchema = {
      nodes: [
        {
          type: "control",
          control: { id: "future", kind: "some-future-control", label: "Будущий" },
        },
      ],
    };

    expect(() => createFormController(unknown)).not.toThrow();
    expect(createFormController(unknown).getValue("future")).toBeUndefined();
  });

  it("пустая схема не падает", () => {
    const form = createFormController({ nodes: [] });
    expect(form.getSnapshot().values).toEqual({});
  });
});
