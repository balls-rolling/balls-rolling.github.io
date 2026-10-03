// Палитра: направление от prefers-color-scheme, акцент системный либо фолбэк.
// Порт js/theme/palette.js из исходной реализации на TypeScript.
// Производные оттенки (--bg-*, --accent-hi/lo) вычисляются в CSS через
// color-mix(in oklch, ...) — здесь задаётся только база.

const FALLBACK_ACCENT = "#3da96a"; // приятный зелёный
const DANGER = "#d64545";
const OK = "#3da96a";

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

/** Применяет тему и базовые цвета к корню документа. */
export function applyPalette(): void {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  const accent = readSystemAccent();
  root.style.setProperty("--accent", accent);
  // Производные оттенки (приглушение, смешение) считает CSS через
  // color-mix(in oklch, ...) от --accent, отдельная переменная не нужна.
  root.style.setProperty("--danger", DANGER);
  root.style.setProperty("--ok", OK);
}

/** Применяет палитру и следит за сменой системной темы. */
export function watchPalette(): void {
  applyPalette();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyPalette);
}
