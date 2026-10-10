import { describe, expect, it, vi } from "vitest";
import { LocalTransport } from "./local-transport";

describe("LocalTransport", () => {
  it("сразу открыт и не доставляет сообщения", () => {
    const transport = new LocalTransport();
    const listener = vi.fn();
    transport.onMessage(listener);

    expect(transport.state).toBe("open");
    expect(() => transport.send({ t: "move", x: 0, y: 0 })).not.toThrow();
    expect(listener).not.toHaveBeenCalled();
  });

  it("close переводит в closed и уведомляет слушателей", () => {
    const transport = new LocalTransport();
    const states: string[] = [];
    transport.onState((state) => states.push(state));

    transport.close();
    transport.close(); // повторно — не дублирует

    expect(transport.state).toBe("closed");
    expect(states).toEqual(["closed"]);
    expect(() => transport.send({ t: "bye" })).not.toThrow();
  });

  it("отписка снимает слушателя", () => {
    const transport = new LocalTransport();
    const listener = vi.fn();
    const off = transport.onState(listener);

    off();
    transport.close();

    expect(listener).not.toHaveBeenCalled();
  });
});
