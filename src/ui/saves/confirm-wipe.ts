import type { Platform } from "@/core/platform";
import type { DialogManager } from "@/ui/dialog/manager";
import type { NotificationCenter } from "@/ui/notifications";
import ConfirmDialog from "@/ui/screens/ConfirmDialog.vue";

// Подтверждение полного сброса данных (12-c): предупреждение, затем очистка и
// перезапуск страницы. Импортирует `.vue`, поэтому в node-тестах не прогоняется.

export interface ConfirmWipeDeps {
  readonly platform: Platform;
  readonly dialog: DialogManager;
  /** Сообщить о проблеме, если очистка не удалась. */
  readonly notifications?: NotificationCenter;
  /**
   * Вызвать после подтверждения и **до** очистки: отменить отложенную запись и
   * дождаться уже запущенной, чтобы она не вернула данные после сброса.
   */
  readonly beforeClear?: () => void | Promise<void>;
  /** Перезапуск; по умолчанию — перезагрузка страницы. Инъекция ради тестов. */
  readonly reload?: () => void;
}

export function confirmWipeAllData(deps: ConfirmWipeDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    let running = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      resolve();
    };

    deps.dialog.show({
      component: ConfirmDialog,
      title: "Стереть все данные",
      props: {
        message:
          "Все данные будут удалены безвозвратно: сохранённые партии, имя, тема и постоянный id игрока. Продолжить?",
        confirmLabel: "Стереть",
        cancelLabel: "Отмена",
        onResolve: (value: string) => {
          if (value !== "confirm") {
            deps.dialog.back();
            finish();
            return;
          }
          if (running) return;
          running = true;
          void (async () => {
            try {
              await deps.beforeClear?.();
              await deps.platform.clearAllData();
              finish();
              (deps.reload ?? (() => window.location.reload()))();
            } catch {
              deps.notifications?.notify("error", "Не удалось стереть данные");
              deps.dialog.back();
              finish();
            }
          })();
        },
      },
      handle: { destroy: () => finish() },
    });
  });
}
