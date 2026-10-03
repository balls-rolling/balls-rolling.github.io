import { markRaw, type Component } from "vue";
import ButtonControl from "./controls/ButtonControl.vue";
import FallbackControl from "./controls/FallbackControl.vue";
import NumberControl from "./controls/NumberControl.vue";
import SelectControl from "./controls/SelectControl.vue";
import TextControl from "./controls/TextControl.vue";
import ToggleControl from "./controls/ToggleControl.vue";

// Реестр рендереров по `kind`. `kind` — открытая строка, поэтому добавление
// контролла не требует правки ядра: достаточно зарегистрировать компонент.
//
// Компоненты обёрнуты `markRaw`: если реестр или выбранный компонент попадёт в
// реактивную структуру, Vue попытается сделать его реактивным и предупредит.
// Объект реестра заморожен, чтобы его нельзя было случайно изменить.
export const renderers: Readonly<Record<string, Component>> = Object.freeze({
  text: markRaw(TextControl),
  number: markRaw(NumberControl),
  toggle: markRaw(ToggleControl),
  select: markRaw(SelectControl),
  button: markRaw(ButtonControl),
});

/** Рендерер для типа контролла. Неизвестный тип не ошибка — запасной вариант. */
export function rendererFor(kind: string): Component {
  return renderers[kind] ?? markRaw(FallbackControl);
}
