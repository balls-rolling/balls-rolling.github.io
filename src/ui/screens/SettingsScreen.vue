<script setup lang="ts">
// Настройки: форма строится из метаданных платформы, а не из разметки.
// Значения живут в управляющем объекте формы, шаблон читает их через адаптер.
//
// Настройки применяются сразу (тема), запись — с debounce; кнопки «Сохранить»
// нет. Имя игрока — критическая настройка: во время активной партии с нашим
// игроком оно заблокировано.
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
import {
  GLOBAL_CLEAR_SAVES_CONTROL,
  GLOBAL_NAME_CONTROL,
  GLOBAL_THEME_CONTROL,
  GLOBAL_WIPE_CONTROL,
} from "@/core/platform";
import { createFormController, type FormHandle } from "@/core/form";
import { setThemeMode, type ThemeMode } from "@/core/theme";
import { dialogKey } from "@/ui/dialog/key";
import { FormView, useFieldValue } from "@/ui/form";
import { notificationsKey } from "@/ui/notifications";
import { platformKey } from "@/ui/platform";
import { confirmWipeAllData } from "@/ui/saves/confirm-wipe";
import { showClearSavedGames } from "@/ui/saves/clear-saved-games";
import { sessionHostKey } from "@/ui/session-host";

const injected = inject(platformKey);
if (!injected) throw new Error("Платформа не предоставлена");
const platform = injected;

const injectedDialog = inject(dialogKey);
if (!injectedDialog) throw new Error("Менеджер диалогов не предоставлен");
const dialog = injectedDialog;

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

const disabled = computed<ReadonlySet<string>>(() => {
  const set = new Set<string>();
  if (nameLocked.value) set.add(GLOBAL_NAME_CONTROL);
  if (!dataPresent.value) set.add(GLOBAL_WIPE_CONTROL);
  if (!savesPresent.value) set.add(GLOBAL_CLEAR_SAVES_CONTROL);
  return set;
});

// Наличие сохранённых данных/игр — для доступности кнопок очистки (12-c).
const dataPresent = ref(false);
const savesPresent = ref(false);

async function refreshPresence(): Promise<void> {
  dataPresent.value = await platform.hasAnyData();
  savesPresent.value = (await platform.listSavedGames()).length > 0;
}

// Значения грузятся из хранилища асинхронно: пока их нет, показываем загрузку,
// а не значение по умолчанию (оно могло бы «мигнуть» чужим).
const loading = ref(true);

// `lastGameId` и исходное имя не показываются, но должны пережить сохранение.
let lastGameId = "";
let loadedName = "";
// Постоянный id игрока не редактируется, но обязан пережить сохранение настроек.
let loadedPlayerId = "";
let timer: number | null = null;

async function persist(): Promise<void> {
  const name = nameLocked.value
    ? loadedName
    : String(handle.getValue(GLOBAL_NAME_CONTROL) ?? "").trim();
  const themeMode = (handle.getValue(GLOBAL_THEME_CONTROL) as ThemeMode) ?? "system";
  await platform.saveGlobalSettings({ name, playerId: loadedPlayerId, lastGameId, themeMode });
  notifications.notify("success", "Настройки сохранены");
}

// Запущенная запись: перед полной очисткой её нужно дождаться, иначе она может
// вернуть `global` (и `playerId`) уже после сброса.
let pendingPersist: Promise<void> | null = null;

function runPersist(): void {
  const current = persist();
  pendingPersist = current;
  void current.finally(() => {
    if (pendingPersist === current) pendingPersist = null;
  });
}

function scheduleSave(): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    runPersist();
  }, 300);
}

function flush(): void {
  if (timer === null) return;
  window.clearTimeout(timer);
  timer = null;
  runPersist();
}

/** Отменить отложенную запись и дождаться уже запущенной (перед сбросом). */
async function flushBeforeWipe(): Promise<void> {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  await pendingPersist;
}

onMounted(async () => {
  try {
    const settings = await platform.loadGlobalSettings();
    lastGameId = settings.lastGameId;
    loadedName = settings.name;
    loadedPlayerId = settings.playerId;
    // Пишем через адаптер, а не напрямую в handle: только адаптер поднимает
    // версию реактивности, без этого форма показала бы значение по умолчанию.
    setValue(GLOBAL_NAME_CONTROL, settings.name);
    setValue(GLOBAL_THEME_CONTROL, settings.themeMode);
    await refreshPresence();
  } finally {
    loading.value = false;
  }
});

onUnmounted(flush);

// Тема применяется сразу при смене; любое изменение планирует запись.
function onEmit(id: string, signal: string, payload?: unknown): void {
  handle.emit(id, signal, payload);
  if (id === GLOBAL_THEME_CONTROL && signal === "change") {
    setThemeMode(payload as ThemeMode);
  }
  if (signal === "change") scheduleSave();

  // Кнопки управления данными (12-c).
  if (signal === "press" && id === GLOBAL_CLEAR_SAVES_CONTROL) {
    void showClearSavedGames({
      platform,
      dialog,
      notifications,
      onDone: () => void refreshPresence(),
    });
    return;
  }
  if (signal === "press" && id === GLOBAL_WIPE_CONTROL) {
    // Отмена отложенной записи и ожидание текущей — внутри `beforeClear`, уже
    // после подтверждения (иначе отмена сброса потеряла бы свежие правки).
    void confirmWipeAllData({
      platform,
      dialog,
      notifications,
      beforeClear: flushBeforeWipe,
    });
  }
}
</script>

<template>
  <div class="group">
    <div v-if="loading" class="loading">
      <span class="spinner" aria-hidden="true" />
      <span>Загрузка настроек…</span>
    </div>
    <template v-else>
      <p v-if="nameLocked" class="text-muted">Имя игрока нельзя менять во время активной партии.</p>
      <FormView
        :nodes="platform.globalForm().nodes"
        :value-of="valueOf"
        :set-value="setValue"
        :emit="onEmit"
        :disabled="disabled"
      />
    </template>
  </div>
</template>
