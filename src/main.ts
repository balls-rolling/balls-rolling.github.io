// Точка монтирования приложения. Палитра устанавливается ДО mount(), иначе
// первый кадр успевает отрисоваться со светлой темой на тёмной системной.
import { createApp } from "vue";
import App from "@/App.vue";
import { watchPalette } from "@/core/theme";
import "@/styles/tokens.css";
import "@/styles/base.css";

watchPalette();

// Контекстное меню отключено везде, кроме полей ввода: там нужен paste
// (в фазе 09 в поля вставляются коды приглашений). Порт js/app.js:15-18.
document.addEventListener("contextmenu", (e) => {
  if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) {
    return;
  }
  e.preventDefault();
});

createApp(App).mount("#app");
