import { describe, expect, it } from "vitest";
import { BilliardsGame } from "./game";
import entry from "./index";

describe("точка входа бильярда", () => {
  it("валидная GameEntry", async () => {
    expect(typeof entry.id).toBe("string");
    expect(typeof entry.label).toBe("string");
    const game = await entry.entry();
    expect(game).toBeInstanceOf(BilliardsGame);
  });
});
