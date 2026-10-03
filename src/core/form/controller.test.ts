import { describe, expect, it, vi } from "vitest";
import { createFormController } from "./controller";
import type { FormSchema } from "./types";

const schema: FormSchema = {
  id: "demo",
  controls: [
    { id: "name", kind: "text", label: "Имя", value: "Игрок" },
    { id: "sound", kind: "toggle", label: "Звук", value: false, signals: ["change"] },
  ],
};

describe("createFormController", () => {
  it("берёт начальные значения из схемы", () => {
    const form = createFormController(schema);
    expect(form.getValue("name")).toBe("Игрок");
    expect(form.getSnapshot().values).toEqual({ name: "Игрок", sound: false });
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

    // Мутация копии не влияет на контроллер.
    (snapshot.values as Record<string, unknown>).name = "взлом";

    expect(form.getValue("name")).toBe("Игрок");
  });

  it("доставляет сигнал конкретного контролла", () => {
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
      controls: [{ id: "future", kind: "some-future-control", label: "Будущий" }],
    };

    expect(() => createFormController(unknown)).not.toThrow();
    expect(createFormController(unknown).getValue("future")).toBeUndefined();
  });
});
