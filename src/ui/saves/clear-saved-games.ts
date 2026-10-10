import type { Platform } from "@/core/platform";
import type { DialogManager } from "@/ui/dialog/manager";
import type { NotificationCenter } from "@/ui/notifications";
import SavedGamesDialog from "./SavedGamesDialog.vue";
import { loadSavedGames, removeSavedGames } from "./saved-games";

// Диалог выборочной очистки сохранённых игр (12-c). Импортирует `.vue`, поэтому
// в node-тестах не прогоняется; логика списка — в `saved-games.ts`.

export interface ClearSavedGamesDeps {
  readonly platform: Platform;
  readonly dialog: DialogManager;
  readonly notifications: NotificationCenter;
  /** Вызвать после успешного удаления (обновить доступность кнопок в настройках). */
  readonly onDone?: () => void;
}

export function showClearSavedGames(deps: ClearSavedGamesDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    void (async () => {
      const entries = await loadSavedGames(deps.platform);
      if (entries.length === 0) {
        deps.notifications.notify("info", "Сохранённых игр нет");
        resolve();
        return;
      }

      let applying = false;
      deps.dialog.show({
        component: SavedGamesDialog,
        title: "Очистить сохранённые игры",
        props: {
          entries,
          onApply: (ids: readonly string[]) => {
            if (applying) return; // защита от повторного нажатия
            applying = true;
            void removeSavedGames(deps.platform, ids)
              .then(() => {
                deps.notifications.notify("success", "Сохранённые игры удалены");
                deps.onDone?.();
              })
              .catch(() => {
                deps.notifications.notify("error", "Не удалось удалить сохранённые игры");
              })
              .finally(() => deps.dialog.back());
          },
          onCancel: () => deps.dialog.back(),
        },
        handle: { destroy: () => resolve() },
      });
    })();
  });
}
