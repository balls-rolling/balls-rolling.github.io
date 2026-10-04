<script setup lang="ts">
// Настройки: форма строится из метаданных платформы, а не из разметки.
// Значения живут в управляющем объекте формы, шаблон читает их через адаптер.
//
// Настройки применяются сразу (тема), запись — с debounce; кнопки «Сохранить»
// нет. Имя игрока — критическая настройка: во время активной партии с нашим
// игроком оно заблокировано.
import { computed, inject, onMounted, onUnmounted } from "vue";
import { GLOBAL_NAME_CONTROL, GLOBAL_THEME_CONTROL } from "@/core/platform";
import { createFormController, type FormHandle } from "@/core/form";
import { setThemeMode, type ThemeMode } from "@/core/theme";
import { FormView, useFieldValue } from "@/ui/form";
import { notificationsKey } from "@/ui/notifications";
import { platformKey } from "@/ui/platform";
import { sessionHostKey } from "@/ui/session-host";

const injected = inject(platformKey);
if (!injected) throw new Error("Платформа не предоставлена");
const platform = injected;

const injectedHost = inject(sessionHostKey);
if (!injectedHost) throw new Error("Слот сессии не предоставлен");
const sessionHost = injectedHost;

const injectedNotifications = inject(notificationsKey);
if (!injectedNotifications) throw new Error("Центр уведомлений не предоставлен");
const notifications = injectedNotifications;

const handle: FormHandle = createFormController(platform.globalForm());
const { valueOf, setValue } = useFieldValue(handle);

// «Наш игрок» — локальный человек. Пока он в активной сессии, имя неизменно.
const nameLocked = computed(() => {
  const session = sessionHost.session.value;
  if (!session) return false;
  return session
    .snapshot()
    .players.some((player) => player.agent === "human" && player.transport === "local");
});

const disabled = computed<ReadonlySet<string>>(() =>
  nameLocked.value ? new Set([GLOBAL_NAME_CONTROL]) : new Set<string>(),
);

// `lastGameId` и исходное имя не показываются, но должны пережить сохранение.
let lastGameId = "";
let loadedName = "";
let timer: number | null = null;

async function persist(): Promise<void> {
  const name = nameLocked.value
    ? loadedName
    : String(handle.getValue(GLOBAL_NAME_CONTROL) ?? "").trim();
  const themeMode = (handle.getValue(GLOBAL_THEME_CONTROL) as ThemeMode) ?? "system";
  await platform.saveGlobalSettings({ name, lastGameId, themeMode });
  notifications.notify("success", "Настройки сохранены");
}

function scheduleSave(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void persist();
  }, 300);
}

function flush(): void {
  if (timer === null) return;
  window.clearTimeout(timer);
  timer = null;
  void persist();
}

onMounted(async () => {
  const settings = await platform.loadGlobalSettings();
  lastGameId = settings.lastGameId;
  loadedName = settings.name;
  // Пишем через адаптер, а не напрямую в handle: только адаптер поднимает
  // версию реактивности, без этого форма показала бы значение по умолчанию.
  setValue(GLOBAL_NAME_CONTROL, settings.name);
  setValue(GLOBAL_THEME_CONTROL, settings.themeMode);
});

onUnmounted(flush);

// Тема применяется сразу при смене; любое изменение планирует запись.
function onEmit(id: string, signal: string, payload?: unknown): void {
  handle.emit(id, signal, payload);
  if (id === GLOBAL_THEME_CONTROL && signal === "change") {
    setThemeMode(payload as ThemeMode);
  }
  if (signal === "change") scheduleSave();
}
</script>

<template>
  <div class="group">
    <p v-if="nameLocked" class="text-muted">Имя игрока нельзя менять во время активной партии.</p>
    <FormView
      :nodes="platform.globalForm().nodes"
      :value-of="valueOf"
      :set-value="setValue"
      :emit="onEmit"
      :disabled="disabled"
    />
  </div>
</template>
