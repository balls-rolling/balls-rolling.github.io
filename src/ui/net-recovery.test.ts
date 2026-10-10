import { describe, expect, it } from "vitest";
import type { Session } from "@/core/session";
import { isDisconnected, networkRole } from "./net-recovery";

// Определение роли и обрыва — чистые функции; сессия подменяется заглушкой.

function stub(players: readonly { id: string; transport: "local" | "remote" }[]): Session {
  return { snapshot: () => ({ players }) } as unknown as Session;
}

describe("networkRole", () => {
  it("хост, когда human-local — p1", () => {
    expect(
      networkRole(
        stub([
          { id: "p1", transport: "local" },
          { id: "p2", transport: "remote" },
        ]),
      ),
    ).toBe("host");
  });

  it("гость, когда human-local — p2", () => {
    expect(
      networkRole(
        stub([
          { id: "p1", transport: "remote" },
          { id: "p2", transport: "local" },
        ]),
      ),
    ).toBe("guest");
  });

  it("не сетевая партия — null", () => {
    expect(
      networkRole(
        stub([
          { id: "p1", transport: "local" },
          { id: "p2", transport: "local" },
        ]),
      ),
    ).toBeNull();
    expect(networkRole(stub([]))).toBeNull();
  });
});

describe("isDisconnected", () => {
  it("peerLeft, closed, failed — обрыв; open/connecting — нет", () => {
    expect(isDisconnected("open", false)).toBe(false);
    expect(isDisconnected("connecting", false)).toBe(false);
    expect(isDisconnected("open", true)).toBe(true);
    expect(isDisconnected("closed", false)).toBe(true);
    expect(isDisconnected("failed", false)).toBe(true);
  });
});
