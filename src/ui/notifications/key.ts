import type { InjectionKey } from "vue";
import type { NotificationCenter } from "./center";

// Ключ внедрения центра уведомлений: экземпляр создаёт composition root,
// модульного синглтона нет.
export const notificationsKey: InjectionKey<NotificationCenter> = Symbol("notifications");
