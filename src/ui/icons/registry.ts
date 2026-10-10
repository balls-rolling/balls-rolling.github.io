import { markRaw, type Component } from "vue";
import {
  ArrowLeft,
  Check,
  Gamepad2,
  List,
  Menu,
  Play,
  Plus,
  QrCode,
  Settings,
  Smartphone,
  Users,
  X,
  ZoomIn,
  ZoomOut,
} from "@lucide/vue";

// Реестр иконок: строковый токен (нейтральный для ядра) → Vue-компонент.
// Образец — реестр рендереров формы (`src/ui/form/registry.ts`): `markRaw`,
// заморозка, неизвестный токен не ошибка.
//
// Импорты явные: динамический доступ к полному модулю ломал бы tree-shaking.
const icons: Readonly<Record<string, Component>> = Object.freeze({
  back: markRaw(ArrowLeft),
  play: markRaw(Play),
  settings: markRaw(Settings),
  games: markRaw(Gamepad2),
  list: markRaw(List),
  menu: markRaw(Menu),
  users: markRaw(Users),
  plus: markRaw(Plus),
  remove: markRaw(X),
  check: markRaw(Check),
  "zoom-in": markRaw(ZoomIn),
  "zoom-out": markRaw(ZoomOut),
  phone: markRaw(Smartphone),
  qr: markRaw(QrCode),
});

/** Компонент иконки по токену или `null`, если токен неизвестен. */
export function iconFor(token: string): Component | null {
  return icons[token] ?? null;
}
