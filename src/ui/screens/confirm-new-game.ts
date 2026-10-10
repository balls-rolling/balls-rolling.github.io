import type { GameEntry } from "@/core/game";
import type { Platform } from "@/core/platform";
import type { DialogManager } from "@/ui/dialog/manager";
import ConfirmDialog from "./ConfirmDialog.vue";

// Предупреждение D6: перед запуском новой партии, если у игры есть сохранённая
// незавершённая, спрашиваем подтверждение — отмена сохраняет старую партию.
// Модуль импортирует `.vue`, поэтому в node-тестах (без плагина Vue) не
// прогоняется; разделяемая логика живёт в `resumeGame`.

export interface ConfirmNewGameDeps {
  readonly platform: Platform;
  readonly dialog: DialogManager;
}

/**
 * Спросить подтверждение новой партии. Возвращает `true`, если сохранения нет
 * (спрашивать не о чем) либо пользователь подтвердил; `false` — при отмене или
 * снятии диалога.
 */
export async function confirmNewGame(entry: GameEntry, deps: ConfirmNewGameDeps): Promise<boolean> {
  if (!(await deps.platform.hasSavedSession(entry.id))) return true;

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    deps.dialog.show({
      component: ConfirmDialog,
      title: "Новая партия",
      props: {
        message: `Незавершённая партия в «${entry.label}» может быть потеряна. Начать новую?`,
        confirmLabel: "Начать новую",
        cancelLabel: "Отмена",
        onResolve: (value: string) => {
          finish(value === "confirm");
          // Снимаем только экран подтверждения: `close()` закрыл бы и меню под ним.
          deps.dialog.back();
        },
      },
      // Диалог сняли (назад или закрытие) — считаем это отменой.
      handle: { destroy: () => finish(false) },
    });
  });
}
