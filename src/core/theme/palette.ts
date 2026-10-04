// Палитра: направление от prefers-color-scheme либо от явного выбора пользователя,
// акцент системный либо фолбэк. Порт js/theme/palette.js из исходной реализации.
// Производные оттенки вычисляются в CSS через color-mix(in oklch, ...) — здесь
// задаётся только база.

const FALLBACK_ACCENT = "#3da96a"; // приятный зелёный

/** Режим темы: системный или явный выбор пользователя. */
export type ThemeMode = "system" | "light" | "dark";

/**
 * Разрешить режим в конкретную тему. Чистая функция: тестируется без DOM.
 * `system` следует за системной схемой, явный режим её игнорирует.
 */
export function resolveTheme(mode: ThemeMode, systemDark: boolean): "light" | "dark" {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

function prefersDark(): boolean {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Читает системный акцент через скрытый пробник цвета `AccentColor`. */
function readSystemAccent(): string {
  try {
    const probe = document.createElement("div");
    probe.style.cssText = "position:absolute;visibility:hidden;color:AccentColor;";
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    // AccentColor в неподдерживаемой среде обычно canvastext или чёрный —
    // это мусор, а не акцент, отсекаем.
    if (c && !/^rgb\(0,\s*0,\s*0\)$/.test(c) && c !== "canvastext") return c;
  } catch {
    /* приватный режим или иные ограничения — фолбэк ниже */
  }
  return FALLBACK_ACCENT;
}

// Текущий режим — состояние модуля: один системный слушатель перечитывает его,
// поэтому смена системы не перебивает явный выбор пользователя.
let currentMode: ThemeMode = "system";

/** Применить палитру по режиму (по умолчанию — текущему). */
export function applyPalette(mode: ThemeMode = currentMode): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(mode, prefersDark());
  // Производные оттенки (приглушение, смешение) считает CSS через
  // color-mix(in oklch, ...) от --accent, отдельная переменная не нужна.
  root.style.setProperty("--accent", readSystemAccent());
}

/** Сменить режим темы в рантайме и сразу применить. */
export function setThemeMode(mode: ThemeMode): void {
  currentMode = mode;
  applyPalette(mode);
}

/** Применить палитру и следить за сменой системной схемы. */
export function watchPalette(mode: ThemeMode = "system"): void {
  setThemeMode(mode);
  // Один слушатель на всё время жизни приложения: он применяет текущий режим,
  // поэтому при явном выборе смена системной схемы вид не меняет.
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    applyPalette(currentMode),
  );
}
