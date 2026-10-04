import { computed, ref, type ComputedRef, type Ref } from "vue";

// Центр уведомлений: эфемерная история в памяти. Ничего не персистится.
// Тосты (всплывающие) и история (стек под колокольчиком) разведены: скрытие
// тоста не убирает запись из истории; открытие стека прячет тосты, потому что
// те же уведомления видны в стеке.

export type NotificationKind = "info" | "success" | "error";

export interface AppNotification {
  readonly id: number;
  readonly kind: NotificationKind;
  readonly text: string;
  readonly at: number;
  readonly read: boolean;
}

export interface NotificationCenter {
  /** История (для стека под колокольчиком). */
  readonly items: Ref<readonly AppNotification[]>;
  /** Активные всплывающие сообщения. */
  readonly toasts: Ref<readonly AppNotification[]>;
  /** Непрочитанных. */
  readonly unread: ComputedRef<number>;
  notify(kind: NotificationKind, text: string): void;
  /** Пометить прочитанным. */
  markRead(id: number): void;
  /** Убрать из истории и тостов. */
  dismiss(id: number): void;
  /** Скрыть один всплывающий тост (историю не трогает). */
  dismissToast(id: number): void;
  /** Скрыть все всплывающие тосты (историю не трогает). */
  dismissAllToasts(): void;
  clear(): void;
}

export function createNotificationCenter(): NotificationCenter {
  const items = ref<readonly AppNotification[]>([]);
  const toasts = ref<readonly AppNotification[]>([]);
  let nextId = 1;

  const unread = computed(() => items.value.filter((notification) => !notification.read).length);

  function notify(kind: NotificationKind, text: string): void {
    const notification: AppNotification = { id: nextId++, kind, text, at: Date.now(), read: false };
    items.value = [...items.value, notification];
    toasts.value = [...toasts.value, notification];
  }

  function markRead(id: number): void {
    items.value = items.value.map((notification) =>
      notification.id === id ? { ...notification, read: true } : notification,
    );
  }

  function dismiss(id: number): void {
    items.value = items.value.filter((notification) => notification.id !== id);
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function dismissAllToasts(): void {
    toasts.value = [];
  }

  function clear(): void {
    items.value = [];
    toasts.value = [];
  }

  return {
    items,
    toasts,
    unread,
    notify,
    markRead,
    dismiss,
    dismissToast,
    dismissAllToasts,
    clear,
  };
}
