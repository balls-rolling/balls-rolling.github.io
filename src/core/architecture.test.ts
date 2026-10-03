import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Проверка архитектурных инвариантов. Они ломаются молча: одна строка импорта
// — и ядро перестаёт быть независимым. Поэтому это тест, а не разовая проверка
// глазами.

const SRC = fileURLToPath(new URL("../", import.meta.url));

function filesUnder(dir: string): string[] {
  const result: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      result.push(...filesUnder(path));
    } else if (name.endsWith(".ts") || name.endsWith(".vue")) {
      result.push(path);
    }
  }
  return result;
}

/** Все спецификаторы импортов в исходнике: статические и динамические. */
function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

interface Scanned {
  readonly path: string;
  readonly rel: string;
  readonly specifiers: readonly string[];
}

function scan(dir: string): Scanned[] {
  return filesUnder(dir).map((path) => ({
    path,
    rel: relative(SRC, path).replaceAll("\\", "/"),
    specifiers: importSpecifiers(readFileSync(path, "utf8")),
  }));
}

const coreFiles = scan(join(SRC, "core"));
const gameFiles = scan(join(SRC, "games"));

/** Внешний модуль `vue` или его подпуть. */
function isVue(specifier: string): boolean {
  return specifier === "vue" || specifier.startsWith("vue/");
}

/** Спецификатор, ведущий в модуль темы ядра. */
function pointsToTheme(specifier: string): boolean {
  return (
    specifier.includes("core/theme") || specifier.endsWith("/theme") || specifier === "../theme"
  );
}

/** Спецификатор, ведущий в UI-слой. */
function pointsToUi(specifier: string): boolean {
  return specifier.startsWith("@/ui") || specifier.includes("/ui/") || specifier.endsWith("/ui");
}

describe("архитектурные инварианты", () => {
  it("нашёл исходники ядра и игр", () => {
    // Если сканирование сломается, тест обязан упасть, а не пройти впустую.
    expect(coreFiles.length).toBeGreaterThan(5);
    expect(gameFiles.length).toBeGreaterThan(0);
  });

  it("ядро и игры не импортируют vue", () => {
    const offenders = [...coreFiles, ...gameFiles]
      .filter((file) => file.specifiers.some(isVue))
      .map((file) => file.rel);

    expect(offenders).toEqual([]);
  });

  it("сессия не зависит от темы: палитра трогает document, а тесты ядра идут без DOM", () => {
    const offenders = coreFiles
      .filter((file) => file.rel.startsWith("core/session/"))
      .filter((file) => file.specifiers.some(pointsToTheme))
      .map((file) => file.rel);

    expect(offenders).toEqual([]);
  });

  it("ядро не импортирует UI-слой", () => {
    const offenders = coreFiles
      .filter((file) => file.specifiers.some(pointsToUi))
      .map((file) => file.rel);

    expect(offenders).toEqual([]);
  });
});
