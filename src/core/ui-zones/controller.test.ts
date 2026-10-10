import { describe, expect, it } from "vitest";
import { createUiZones, DEFAULT_ZONE_ORIENTATION } from "./index";

describe("createUiZones", () => {
  it("пустая схема: зон нет, управление работает", () => {
    const ui = createUiZones({ zones: {} });
    expect(ui.zones).toEqual([]);
    expect(ui.zone("top")).toBeNull();
    expect(ui.handle.getSnapshot().values).toEqual({});
  });

  it("зона получает своё направление по умолчанию", () => {
    const ui = createUiZones({
      zones: {
        top: { nodes: [] },
        left: { nodes: [] },
      },
    });
    expect(ui.zone("top")?.orientation).toBe(DEFAULT_ZONE_ORIENTATION.top);
    expect(ui.zone("left")?.orientation).toBe(DEFAULT_ZONE_ORIENTATION.left);
    expect(ui.zones.map((z) => z.name)).toEqual(["top", "left"]); // порядок ZONE_ORDER
  });

  it("направление можно переопределить", () => {
    const ui = createUiZones({ zones: { top: { orientation: "vertical", nodes: [] } } });
    expect(ui.zone("top")?.orientation).toBe("vertical");
  });

  it("контроллы всех зон живут в одном управлении: значения и сигналы", () => {
    const ui = createUiZones({
      zones: {
        top: {
          nodes: [{ type: "control", control: { id: "a", kind: "text", label: "A", value: 1 } }],
        },
        bottom: {
          nodes: [
            {
              type: "control",
              control: { id: "b", kind: "toggle", label: "B", signals: ["press"] },
            },
          ],
        },
      },
    });
    expect(ui.handle.getValue("a")).toBe(1);
    const seen: unknown[] = [];
    ui.handle.on("b", "press", (payload) => seen.push(payload));
    ui.handle.emit("b", "press", { x: 1 });
    expect(seen).toEqual([{ x: 1 }]);
  });

  it("инсеты по умолчанию нулевые и перезаписываются измерением UI", () => {
    const ui = createUiZones({ zones: { left: { nodes: [] } } });
    expect(ui.insets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    ui.insets = { top: 1, right: 2, bottom: 3, left: 4 };
    expect(ui.insets).toEqual({ top: 1, right: 2, bottom: 3, left: 4 });
  });
});
