import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    vue(),
    // PWA: манифест и service worker (Workbox). Сайт живёт в корне домена
    // balls-rolling.github.io, поэтому scope и start_url — "/". Плагин сам
    // вставляет <link rel="manifest"> и регистрирует service worker в index.html.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Платформа игр",
        short_name: "Игры",
        description: "Веб-платформа для запуска мини-игр: крестики-нолики и бильярд (8-ball).",
        lang: "ru",
        dir: "ltr",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        background_color: "#14161a",
        theme_color: "#14161a",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Офлайн-оболочка: precache сборки, а навигацию без сети отдаём
        // из кэша index.html (SPA без серверного роутинга). Иконки и сам
        // манифест плагин добавляет в precache сам — здесь только код и стили.
        globPatterns: ["**/*.{js,css,html,svg,ico}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
