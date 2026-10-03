// Точка монтирования приложения — composition root. Платформа создаётся здесь
// и предоставляется компонентам: скрытого модульного синглтона нет.
//
// Палитра устанавливается ДО mount(), иначе первый кадр успевает отрисоваться
// со светлой темой на тёмной системной.
import { createApp } from "vue";
import App from "@/App.vue";
import { createPlatform } from "@/core/platform";
import { watchPalette } from "@/core/theme";
import { platformKey } from "@/ui/platform";
import "@/styles/tokens.css";
import "@/styles/base.css";

watchPalette();

// Контекстное меню отключено везде, кроме полей ввода: там нужен paste
// (в фазе 09 в поля вставляются коды приглашений). Порт js/app.js:15-18.
document.addEventListener("contextmenu", (event) => {
  if (
    event.target instanceof Element &&
    event.target.closest("input, textarea, [contenteditable]")
  ) {
    return;
  }
  event.preventDefault();
});

const app = createApp(App);
app.provide(platformKey, createPlatform());
app.mount("#app");
