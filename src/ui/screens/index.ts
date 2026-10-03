// Публичный API экранов меню.
export { default as GamesScreen } from "./GamesScreen.vue";
export { default as MainScreen } from "./MainScreen.vue";
export { default as SettingsScreen } from "./SettingsScreen.vue";
export { openGame, registerGameOpener } from "./navigation";
export type { GameOpener } from "./navigation";
