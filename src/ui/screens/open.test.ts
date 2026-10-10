import { describe, expect, it, vi } from "vitest";
import { hasOpenHandler, parseOpenQuery, registerOpenHandler, runOpen } from "./open";

describe("реестр open-обработчиков", () => {
  it("разбирает query", () => {
    expect(parseOpenQuery("?open=net_game&offer=x")).toEqual({
      name: "net_game",
      params: expect.any(URLSearchParams),
    });
    const request = parseOpenQuery("?open=net_game&offer=x")!;
    expect(request.params.get("offer")).toBe("x");
    expect(parseOpenQuery("?foo=1")).toBeNull();
    expect(parseOpenQuery("")).toBeNull();
  });

  it("регистрирует и выполняет обработчик с параметрами", async () => {
    const handler = vi.fn();
    registerOpenHandler("test-open", handler);
    expect(hasOpenHandler("test-open")).toBe(true);

    const ok = await runOpen(parseOpenQuery("?open=test-open&offer=abc")!);
    expect(ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((handler.mock.calls[0]![0] as URLSearchParams).get("offer")).toBe("abc");
  });

  it("без обработчика — false, ошибки не глотает", async () => {
    expect(await runOpen(parseOpenQuery("?open=missing")!)).toBe(false);

    registerOpenHandler("throwing", () => {
      throw new Error("boom");
    });
    await expect(runOpen(parseOpenQuery("?open=throwing")!)).rejects.toThrow("boom");
  });
});
