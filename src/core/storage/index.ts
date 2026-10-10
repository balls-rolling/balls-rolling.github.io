// Публичный API хранилища. Бэкенды наружу не выходят: вызывающий код работает
// только с KeyValueStore.
export { createIdbStore, createStore } from "./store";
export type { KeyValueStore, Schema } from "./types";
