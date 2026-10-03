import { describe, expect, it } from "vitest";

// Проверка самого тестового окружения: ядро рассчитано на работу без DOM,
// значит `document` в тестах быть не должно.
describe("тестовое окружение", () => {
  it("не содержит DOM", () => {
    expect(typeof document).toBe("undefined");
  });

  it("выполняет обычные проверки", () => {
    expect(1 + 1).toBe(2);
  });
});
