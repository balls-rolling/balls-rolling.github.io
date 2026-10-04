import { describe, expect, it } from "vitest";
import { resolveTheme } from "./palette";

describe("resolveTheme", () => {
  it("system следует за системной схемой", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("явный режим игнорирует системную схему", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});
