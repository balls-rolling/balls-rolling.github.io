import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Тесты ядра идут в окружении node: DOM им не нужен, и это проверяется
// smoke-тестом. Сборка приложения настроена отдельно, в vite.config.ts.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
