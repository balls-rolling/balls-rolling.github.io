import { describe, expect, it, vi } from "vitest";
import type { Session } from "@/core/session";
import { toSessionAccess } from "./session-access";

// Проверяем, что мост отдаёт игре ровно четыре возможности и делегирует их
// сессии. Больше — значит игра получила лишний доступ.
function fakeSession() {
  return {
    snapshot: vi.fn(() => ({ state: "running" })),
    subscribe: vi.fn(() => () => {}),
    renamePlayer: vi.fn(() => true),
    makeMove: vi.fn(() => true),
  } as unknown as Session;
}

describe("toSessionAccess", () => {
  it("отдаёт ровно snapshot, subscribe, renamePlayer и makeMove", () => {
    const access = toSessionAccess(fakeSession());

    expect(Object.keys(access).sort()).toEqual([
      "makeMove",
      "renamePlayer",
      "snapshot",
      "subscribe",
    ]);
  });

  it("делегирует вызовы сессии", () => {
    const session = fakeSession();
    const access = toSessionAccess(session);

    access.snapshot();
    access.renamePlayer("p1", "Вадим");
    access.makeMove("p1", { step: 1 });
    const listener = () => {};
    access.subscribe(listener);

    expect(session.snapshot).toHaveBeenCalledTimes(1);
    expect(session.renamePlayer).toHaveBeenCalledWith("p1", "Вадим");
    expect(session.makeMove).toHaveBeenCalledWith("p1", { step: 1 });
    expect(session.subscribe).toHaveBeenCalledWith(listener);
  });

  it("не отдаёт сам объект сессии", () => {
    const session = fakeSession();
    const access = toSessionAccess(session);

    expect((access as unknown as { session?: unknown }).session).toBeUndefined();
  });
});
